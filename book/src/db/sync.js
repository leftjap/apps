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
  listPendingHighlights, setHighlightPendingSync,
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
 * filterColumn null = RLS 가 본인 행 자동 처리.
 */
export const TABLE_MAP = Object.freeze([
  Object.freeze({ dexie: 'quotes', supabase: 'book_quotes', filterColumn: null }),
  Object.freeze({ dexie: 'comments', supabase: 'book_comments', filterColumn: null }),
  // 형광펜: 본인 행만 pull (로컬 모델이 quote 당 1행).
  Object.freeze({ dexie: 'quote_highlights', supabase: 'book_quote_highlights', filterColumn: 'owner_id' }),
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
        // 마이그레이션 미적용(테이블 부재) — 시작마다 에러 노이즈 대신 조용히 skip.
        if (error?.code === '42P01') {
          console.warn(`[sync] ${mapping.supabase} 테이블 미적용 — 마이그 적용 후 자동 동기화`);
          return { table: mapping.dexie, status: 'skipped', reason: 'table_missing' };
        }
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
    // 로컬 미동기 변경(pending_sync=1)은 pull 로 덮어쓰지 않는다 — push 전 삭제(빈 톰스톤)·수정 보존.
    // (안 하면 삭제 톰스톤이 서버 옛값에 덮여 flush 대상에서 사라짐 → 형광펜이 새로고침 후 부활.)
    const pk = store.schema.primKey.keyPath;
    let pendingKeys = new Set();
    try {
      const pendingRows = await store.where('pending_sync').equals(1).toArray();
      pendingKeys = new Set(pendingRows.map((r) => r[pk]));
    } catch (_) { /* pending_sync 인덱스 없으면 기존 동작 유지 */ }
    const incoming = collected.map(normalizeRow).filter((r) => !pendingKeys.has(r[pk]));
    if (incoming.length) await store.bulkPut(incoming);
    return { table: mapping.dexie, status: 'ok', count: incoming.length, skippedPending: collected.length - incoming.length };
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
  flushPendingHighlightsFromDexie().catch((e) => console.warn('[sync] flush highlights 실패:', formatError(e)));
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
  const hlIds = [...new Set(_highlightTimers.keys())];
  for (const id of hlIds) {
    const t = _highlightTimers.get(id);
    if (t) clearTimeout(t);
    _highlightTimers.delete(id);
  }
  const results = await Promise.all([
    ...ids.map((id) => pushQuote(id)),
    ...hlIds.map((id) => pushHighlight(id)),
  ]);
  return { count: ids.length + hlIds.length, results };
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
// push — highlights (드래그 형광펜, 본인 행만 — book_quote_highlights)
// ═══════════════════════════════════════════════════════════════════════════

const _highlightTimers = new Map();

export async function pushHighlight(quoteId) {
  if (!supabase) return { id: quoteId, status: 'skipped', reason: 'no_supabase' };
  const db = globalThis.bookDB;
  if (!db) return { id: quoteId, status: 'skipped', reason: 'no_db' };
  const row = await db.quote_highlights.get(quoteId);
  if (!row) return { id: quoteId, status: 'skipped', reason: 'not_found' };
  // 구버전(v3) 행은 owner 미기록 — 어구 소유자로 폴백 (파트너 어구 위 하이라이트는 RLS 가 최종 차단).
  const owner = row.owner_id || (await db.quotes.get(quoteId))?.owner_id;
  const empty = !row.marks || row.marks.length === 0;
  if (!isValidUuid(quoteId) || !isValidUuid(owner)) {
    // dev 가짜 유저·verify 시드 — 로컬 전용. 톰스톤이면 구동작(행 삭제) 복원.
    try { if (empty) await db.quote_highlights.delete(quoteId); else await setHighlightPendingSync(quoteId, 0); } catch (_) { /* 무시 */ }
    return { id: quoteId, status: 'skipped', reason: 'non_uuid_local_only' };
  }
  const onError = async (error) => {
    if (error?.code === '42P01') {
      // 테이블 미적용 — pending 유지, 마이그 적용 후 flush 가 복구.
      console.warn('[sync] book_quote_highlights 테이블 미적용 — 마이그 적용 후 자동 동기화');
      return { id: quoteId, status: 'error', error, reason: 'table_missing' };
    }
    if (error?.code === '42501') {
      // RLS 영구 거부 — outbox 제거 (무한 루프 차단, comments 패턴). Dexie 보존.
      try { await setHighlightPendingSync(quoteId, 0); } catch (_) { /* 무시 */ }
      console.warn('[sync] 하이라이트 RLS 거부 — outbox 제거:', { quote_id: quoteId });
      return { id: quoteId, status: 'error', error, reason: 'rls_denied' };
    }
    console.error('[sync] pushHighlight 실패:', formatError(error));
    try { await setHighlightPendingSync(quoteId, 1); } catch (_) { /* 무시 */ }
    return { id: quoteId, status: 'error', error };
  };
  try {
    if (empty) {
      const { error } = await supabase.from('book_quote_highlights').delete().match({ quote_id: quoteId, owner_id: owner });
      if (error) return await onError(error);
      await db.quote_highlights.delete(quoteId); // 톰스톤 제거
      return { id: quoteId, status: 'ok', op: 'delete' };
    }
    const { error } = await supabase.from('book_quote_highlights').upsert(
      { quote_id: quoteId, owner_id: owner, marks: row.marks, updated_at: row.updated_at || new Date().toISOString() },
      { onConflict: 'quote_id,owner_id' },
    );
    if (error) return await onError(error);
    try { await setHighlightPendingSync(quoteId, 0); } catch (_) { /* 무시 */ }
    return { id: quoteId, status: 'ok' };
  } catch (e) {
    console.error('[sync] pushHighlight 예외:', formatError(e));
    try { await setHighlightPendingSync(quoteId, 1); } catch (_) { /* 무시 */ }
    return { id: quoteId, status: 'error', error: e };
  }
}

export function queueUploadHighlight(quoteId) {
  if (!quoteId) return;
  const existing = _highlightTimers.get(quoteId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    _highlightTimers.delete(quoteId);
    pushHighlight(quoteId);
  }, UPLOAD_DEBOUNCE_MS);
  _highlightTimers.set(quoteId, t);
}

export async function flushPendingHighlightsFromDexie() {
  if (!supabase) return { count: 0, reason: 'no_supabase', results: [] };
  const db = globalThis.bookDB;
  if (!db) return { count: 0, reason: 'no_db', results: [] };
  let pending;
  try { pending = await listPendingHighlights(); }
  catch (e) { return { count: 0, reason: 'list_failed', error: e, results: [] }; }
  if (!pending.length) return { count: 0, results: [] };
  const results = await Promise.all(pending.map((p) => pushHighlight(p.quote_id)));
  const recovered = results.filter((r) => r.status === 'ok').length;
  if (recovered > 0) console.info(`[sync] flush highlights — ${recovered}/${pending.length} 복구`);
  return { count: pending.length, recovered, results };
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
  pushHighlight,
  queueUploadHighlight,
  flushPendingHighlightsFromDexie,
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
