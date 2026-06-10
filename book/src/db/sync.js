/**
 * book 동기화 어댑터 (today sync.js 패턴 답습 — quotes + comments).
 *
 * 책임:
 *  - Supabase ↔ Dexie 양방향 (pull 다운로드 + push 업로드 800ms debounce 큐).
 *  - Realtime postgres_changes 구독 (book_quotes / book_comments) → Dexie 반영 + listener 전파.
 *  - 오프라인 큐 (pending_sync=1) flush.
 *
 * 안전장치:
 *  - supabase 미설정 / db 없음 / user 없음 → no-op + 사유 반환.
 *  - 비-UUID id (devSeed 시드: quote-seed-* 등) push skip + pending_sync=0 (무한 retry 차단).
 *  - 부분 실패 시 로컬 데이터 보존.
 */
import { supabase } from '../services/supabase.js';
import {
  listPendingQuotes, setQuotePendingSync,
  listPendingComments, setCommentPendingSync,
} from './queries.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUuid(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

/** Error / PostgrestError → 사람 읽을 수 있는 string ([object Object] 회피). */
export function formatError(e) {
  if (e == null) return '(no error)';
  if (typeof e === 'string') return e;
  if (typeof e.message === 'string') {
    const parts = [e.message];
    if (e.code) parts.push(`code=${e.code}`);
    if (e.hint) parts.push(`hint=${e.hint}`);
    return parts.join(' · ');
  }
  try { return JSON.stringify(e); } catch (_) { return String(e); }
}

/**
 * Dexie 스토어 ↔ Supabase 테이블 매핑.
 * filterColumn null = RLS 가 본인 + 파트너 자동 처리 (book 은 전부 공유).
 */
export const TABLE_MAP = Object.freeze([
  Object.freeze({ dexie: 'quotes', supabase: 'book_quotes', filterColumn: null }),
  Object.freeze({ dexie: 'comments', supabase: 'book_comments', filterColumn: null }),
]);

let _syncActive = false;
const UPLOAD_DEBOUNCE_MS = 800;
const PULL_PAGE_SIZE = 1000;

/** Supabase boolean → Dexie indexable integer (pinned). */
function normalizeRow(row) {
  const out = { ...row };
  if ('pinned' in out) out.pinned = out.pinned ? 1 : 0;
  return out;
}

/** Dexie row → Supabase row. 0/1 → boolean, pending_sync 제거. */
function denormalizeRow(row) {
  const out = { ...row };
  if ('pinned' in out) out.pinned = Boolean(out.pinned);
  delete out.pending_sync;
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// pull (다운로드)
// ═══════════════════════════════════════════════════════════════════════════

export async function pullTable(mapping, db, userId) {
  if (!supabase) return { table: mapping.dexie, status: 'skipped', reason: 'no_supabase' };
  if (!db) return { table: mapping.dexie, status: 'skipped', reason: 'no_db' };
  if (!userId) return { table: mapping.dexie, status: 'skipped', reason: 'no_user' };
  try {
    let from = 0;
    let collected = [];
    while (true) {
      let query = supabase.from(mapping.supabase).select('*');
      if (mapping.filterColumn) query = query.eq(mapping.filterColumn, userId);
      query = query.range(from, from + PULL_PAGE_SIZE - 1);
      const { data, error } = await query;
      if (error) {
        console.error(`[sync] pullTable ${mapping.supabase} 실패:`, formatError(error));
        return { table: mapping.dexie, status: 'error', error };
      }
      const page = data || [];
      collected = collected.concat(page);
      if (page.length < PULL_PAGE_SIZE) break;
      from += PULL_PAGE_SIZE;
    }
    if (collected.length === 0) return { table: mapping.dexie, status: 'empty', count: 0 };
    const store = db[mapping.dexie];
    if (!store?.bulkPut) return { table: mapping.dexie, status: 'error', reason: 'no_store' };
    await store.bulkPut(collected.map(normalizeRow));
    return { table: mapping.dexie, status: 'ok', count: collected.length };
  } catch (e) {
    console.error(`[sync] pullTable ${mapping.supabase} 예외:`, formatError(e));
    return { table: mapping.dexie, status: 'error', error: e };
  }
}

export async function pullAll(db, userId) {
  if (!supabase) return { ok: false, reason: 'no_supabase', results: [], failed: 0 };
  if (!db || !userId) return { ok: false, reason: 'preconditions', results: [], failed: 0 };
  const results = await Promise.all(TABLE_MAP.map((m) => pullTable(m, db, userId)));
  const failed = results.filter((r) => r.status === 'error').length;
  return { ok: failed === 0, results, failed };
}

// ═══════════════════════════════════════════════════════════════════════════
// startSync / stopSync
// ═══════════════════════════════════════════════════════════════════════════

export async function startSync(user) {
  if (!user?.id) return { ok: false, reason: 'no_user' };
  const db = globalThis.bookDB;
  if (!db) {
    console.warn('[sync] globalThis.bookDB 없음 — startSync 무시');
    return { ok: false, reason: 'no_db' };
  }
  if (_syncActive) return { ok: true, reason: 'already_active' };
  _syncActive = true;
  const result = await pullAll(db, user.id);
  if (!result.ok) console.warn('[sync] pullAll 부분 실패:', JSON.stringify(result));
  startRealtime();
  flushPendingQuotesFromDexie().catch((e) => console.warn('[sync] flush quotes 실패:', formatError(e)));
  flushPendingCommentsFromDexie().catch((e) => console.warn('[sync] flush comments 실패:', formatError(e)));
  return result;
}

export function stopSync() {
  _syncActive = false;
  for (const t of _quoteTimers.values()) clearTimeout(t);
  _quoteTimers.clear();
  for (const t of _commentTimers.values()) clearTimeout(t);
  _commentTimers.clear();
  stopRealtime();
}

export function isSyncActive() {
  return _syncActive;
}

// ═══════════════════════════════════════════════════════════════════════════
// push — quotes
// ═══════════════════════════════════════════════════════════════════════════

const _quoteTimers = new Map();
const _lastUploadResult = new Map();

export async function pushQuote(id) {
  if (!supabase) return { id, status: 'skipped', reason: 'no_supabase' };
  const db = globalThis.bookDB;
  if (!db) return { id, status: 'skipped', reason: 'no_db' };
  const row = await db.quotes.get(id);
  if (!row) return { id, status: 'skipped', reason: 'not_found' };
  // 비UUID owner(dev 가짜 유저 등)는 서버가 22P02 로 영구 거부 — 보내지 않고 outbox 제거.
  if (!isValidUuid(id) || !isValidUuid(row.owner_id)) {
    try { await setQuotePendingSync(id, 0); } catch (_) { /* 무시 */ }
    return { id, status: 'skipped', reason: 'non_uuid_local_only' };
  }
  try {
    const { error } = await supabase
      .from('book_quotes')
      .upsert(denormalizeRow(row), { onConflict: 'id' });
    if (error) {
      console.error('[sync] pushQuote 실패:', formatError(error));
      try { await setQuotePendingSync(id, 1); } catch (_) { /* 무시 */ }
      const result = { id, status: 'error', error };
      _lastUploadResult.set(id, result);
      return result;
    }
    try { await setQuotePendingSync(id, 0); } catch (_) { /* 무시 */ }
    const result = { id, status: 'ok' };
    _lastUploadResult.set(id, result);
    return result;
  } catch (e) {
    console.error('[sync] pushQuote 예외:', formatError(e));
    try { await setQuotePendingSync(id, 1); } catch (_) { /* 무시 */ }
    const result = { id, status: 'error', error: e };
    _lastUploadResult.set(id, result);
    return result;
  }
}

export function queueUploadQuote(id) {
  if (!id) return;
  const existing = _quoteTimers.get(id);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    _quoteTimers.delete(id);
    pushQuote(id);
  }, UPLOAD_DEBOUNCE_MS);
  _quoteTimers.set(id, t);
}

export async function flushPendingQuotesFromDexie() {
  if (!supabase) return { count: 0, reason: 'no_supabase', results: [] };
  const db = globalThis.bookDB;
  if (!db) return { count: 0, reason: 'no_db', results: [] };
  let pending;
  try { pending = await listPendingQuotes(); }
  catch (e) { return { count: 0, reason: 'list_failed', error: e, results: [] }; }
  if (!pending.length) return { count: 0, results: [] };
  const results = await Promise.all(pending.map((p) => pushQuote(p.id)));
  const recovered = results.filter((r) => r.status === 'ok').length;
  if (recovered > 0) console.info(`[sync] flush quotes — ${recovered}/${pending.length} 복구`);
  return { count: pending.length, recovered, results };
}

export async function flushPendingUploads() {
  const ids = [...new Set(_quoteTimers.keys())];
  for (const id of ids) {
    const t = _quoteTimers.get(id);
    if (t) clearTimeout(t);
    _quoteTimers.delete(id);
  }
  const results = await Promise.all(ids.map((id) => pushQuote(id)));
  return { count: ids.length, results };
}

// ═══════════════════════════════════════════════════════════════════════════
// push — comments
// ═══════════════════════════════════════════════════════════════════════════

const _commentTimers = new Map();

export async function pushComment(id) {
  if (!supabase) return { id, status: 'skipped', reason: 'no_supabase' };
  const db = globalThis.bookDB;
  if (!db) return { id, status: 'skipped', reason: 'no_db' };
  const row = await db.comments.get(id);
  if (!row) return { id, status: 'skipped', reason: 'not_found' };
  // 비UUID author(dev 가짜 유저 등) 포함 — 서버 영구 거부 행은 보내지 않고 outbox 제거.
  if (!isValidUuid(id) || !isValidUuid(row.quote_id) || !isValidUuid(row.author_id)) {
    try { await setCommentPendingSync(id, 0); } catch (_) { /* 무시 */ }
    return { id, status: 'skipped', reason: 'non_uuid_local_only' };
  }
  try {
    const payload = denormalizeRow(row);
    const { error } = await supabase
      .from('book_comments')
      .upsert(payload, { onConflict: 'id' });
    if (error) {
      // RLS 거부 (42501) — quote 삭제 등. 영구 거부 → outbox 제거 (무한 루프 차단). Dexie 보존.
      if (error?.code === '42501') {
        try { await setCommentPendingSync(id, 0); } catch (_) {}
        console.warn('[sync] 댓글 RLS 거부 — outbox 제거:', { id, quote_id: row.quote_id });
        return { id, status: 'error', error, reason: 'rls_denied' };
      }
      try { await setCommentPendingSync(id, 1); } catch (_) {}
      return { id, status: 'error', error };
    }
    try { await setCommentPendingSync(id, 0); } catch (_) {}
    return { id, status: 'ok' };
  } catch (e) {
    try { await setCommentPendingSync(id, 1); } catch (_) {}
    return { id, status: 'error', error: e };
  }
}

export function queueUploadComment(id) {
  if (!id) return;
  const existing = _commentTimers.get(id);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    _commentTimers.delete(id);
    pushComment(id);
  }, UPLOAD_DEBOUNCE_MS);
  _commentTimers.set(id, t);
}

export async function flushPendingCommentsFromDexie() {
  if (!supabase) return { count: 0, reason: 'no_supabase', results: [] };
  const db = globalThis.bookDB;
  if (!db) return { count: 0, reason: 'no_db', results: [] };
  let pending;
  try { pending = await listPendingComments(); }
  catch (e) { return { count: 0, reason: 'list_failed', error: e, results: [] }; }
  if (!pending.length) return { count: 0, results: [] };
  const results = await Promise.all(pending.map((p) => pushComment(p.id)));
  return { count: pending.length, results };
}

// ═══════════════════════════════════════════════════════════════════════════
// Realtime (book_quotes / book_comments)
// ═══════════════════════════════════════════════════════════════════════════

let _channel = null;
const _realtimeListeners = new Set();

export function startRealtime() {
  if (!supabase) return { ok: false, reason: 'no_supabase' };
  if (_channel) return { ok: true, reason: 'already_subscribed' };
  _channel = supabase
    .channel('book_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'book_quotes' },
      (payload) => handleQuoteChange(payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'book_comments' },
      (payload) => handleCommentChange(payload))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') console.info('[sync] realtime SUBSCRIBED (quotes + comments)');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('[sync] realtime status:', formatError(status));
    });
  return { ok: true };
}

function handleQuoteChange(payload) {
  const db = globalThis.bookDB;
  if (!db?.quotes) return;
  const { eventType, new: newRow, old: oldRow } = payload;
  try {
    if (eventType === 'DELETE') {
      if (oldRow?.id) db.quotes.delete(oldRow.id);
    } else if (newRow) {
      db.quotes.put({ ...normalizeRow(newRow), pending_sync: 0 });
    }
  } catch (e) {
    console.error('[sync] realtime quote put 실패:', formatError(e));
  }
  for (const fn of _realtimeListeners) {
    try { fn(payload); } catch (e) { console.error('[sync] listener 실패:', formatError(e)); }
  }
}

function handleCommentChange(payload) {
  const db = globalThis.bookDB;
  if (!db?.comments) return;
  const { eventType, new: newRow, old: oldRow } = payload;
  try {
    if (eventType === 'DELETE') {
      if (oldRow?.id) db.comments.delete(oldRow.id);
    } else if (newRow) {
      db.comments.put({ ...newRow, pending_sync: 0 });
    }
  } catch (e) {
    console.error('[sync] realtime comment put 실패:', formatError(e));
  }
  for (const fn of _realtimeListeners) {
    try { fn(payload); } catch (e) { console.error('[sync] listener 실패:', formatError(e)); }
  }
}

export function onRealtimeChange(fn) {
  _realtimeListeners.add(fn);
  return () => _realtimeListeners.delete(fn);
}

export function stopRealtime() {
  if (!_channel) return;
  try { supabase?.removeChannel(_channel); }
  catch (e) { console.error('[sync] removeChannel 실패:', formatError(e)); }
  _channel = null;
  _realtimeListeners.clear();
}

// 테스트용
export function _clearUploadTimers() {
  for (const t of _quoteTimers.values()) clearTimeout(t);
  _quoteTimers.clear();
  for (const t of _commentTimers.values()) clearTimeout(t);
  _commentTimers.clear();
}
export function _getLastUploadResult(id) { return _lastUploadResult.get(id); }
export function _isRealtimeActive() { return _channel !== null; }

export const Sync = {
  TABLE_MAP,
  pullTable,
  pullAll,
  startSync,
  stopSync,
  isSyncActive,
  isValidUuid,
  formatError,
  UPLOAD_DEBOUNCE_MS,
  pushQuote,
  queueUploadQuote,
  flushPendingQuotesFromDexie,
  flushPendingUploads,
  pushComment,
  queueUploadComment,
  flushPendingCommentsFromDexie,
  startRealtime,
  stopRealtime,
  onRealtimeChange,
  _clearUploadTimers,
  _getLastUploadResult,
  _isRealtimeActive,
};

if (typeof window !== 'undefined') {
  window.bookSync = Sync;
}

export default Sync;
