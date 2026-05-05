/**
 * 동기화 어댑터 (Wave 11.5.3.1 — Study 11.13.1 패턴 답습).
 *
 * 책임 (1차 — 다운로드만):
 *  - Supabase → Dexie 단방향 다운로드 (pull).
 *  - entries 1 테이블 (Wave 11.5.3.1). expenses/comments/notifications 는 후행.
 *  - signOut 시 sync 플래그 리셋 (auth.registerOnSignOut 으로 main.js 에서 등록).
 *
 * Wave 11.5.3.2 추가:
 *  - 업로드 (pushEntry / queueUpload) — 800ms debounce, id 단위 큐
 *
 * 다음 Wave 보강:
 *  - 11.5.3.3: 충돌 해결 (updated_at 비교)
 *  - 11.5.4: Realtime 구독
 *  - 11.5.5: 오프라인 큐 + flush
 *  - 11.6: expenses 테이블 매핑 추가
 *  - 11.7: comments / notifications 매핑 추가
 *
 * 안전장치:
 *  - supabase 미설정 / db 없음 / user 없음 → no-op + 사유 반환.
 *  - pullAll 부분 실패 시 로컬 데이터 보존 (실패 결과만 보고).
 *  - pushEntry 실패 시 로컬 보존 + 콘솔 경고 (오프라인 큐는 11.5.5).
 */
import { supabase } from '../services/supabase.js';
import { listPendingEntries, setPendingSync } from './queries.js';

/**
 * UUID v4 형식 검증 (Wave 11.6.11). Supabase 컬럼 = uuid 타입 →
 * 비-UUID id (devSeed fixture: tx-XX, entry-fixture-navi-X 등) push 시 22P02 mismatch.
 * 검증 실패 시 push skip + pending_sync=0 마킹 (무한 retry 차단).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUuid(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

/**
 * Error / PostgrestError → 사람 읽을 수 있는 string (별 wave hotfix 2026-04-30).
 * console.error/warn 의 객체 직접 출력 시 환경에 따라 `[object Object]` 로 보이는 문제 회피.
 * Supabase PostgrestError 는 `{ message, code, hint, details }` — message 우선 + code/hint 부가.
 */
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
 * Dexie ↔ Supabase 단순 1:1 매핑 (Wave 11.5.3.1 — entries 만).
 * dexie 스토어 이름 = createTodayDB 의 키. supabase 테이블 = `today_` 접두사.
 *
 * filterColumn — Supabase 에서 사용자 필터 컬럼명 (지정 시 .eq(col, userId) 적용).
 *                null = RLS 가 알아서 본인 + partner.is_shared 처리 (entries / comments).
 *                expenses 는 partner 공유 없음 → owner_id 명시.
 */
export const TABLE_MAP = Object.freeze([
  // 2026-05-05 — entries filterColumn 제거. RLS 가 본인 + partner.is_shared 통과 (spec L278-282).
  // owner_id eq 강제 시 partner 글이 client-side 에서 차단되어 navi 합집합 (spec L127-129) 무력화.
  Object.freeze({ dexie: 'entries', supabase: 'today_entries', filterColumn: null }),
  Object.freeze({ dexie: 'expenses', supabase: 'today_expenses', filterColumn: 'owner_id' }),
  // Wave 11.7.2 — comments 는 본인 작성한 것 + (RLS 가) 본인 entries 에 달린 것 자동 노출.
  // 단순 user_id 필터 없음 — Supabase 가 RLS 로 처리. select * 으로 충분.
  Object.freeze({ dexie: 'comments', supabase: 'today_comments', filterColumn: null }),
  // notifications 는 recipient_id 필터.
  Object.freeze({ dexie: 'notifications', supabase: 'today_notifications', filterColumn: 'recipient_id' }),
]);

let _syncActive = false;

/** 0/1 정규화 — Supabase boolean → Dexie indexable integer. */
function normalizeRow(row) {
  return {
    ...row,
    is_shared: row.is_shared ? 1 : 0,
    pinned: row.pinned ? 1 : 0,
  };
}

/**
 * 한 테이블 다운로드. Supabase 에서 사용자 필터로 select → Dexie bulkPut (id upsert).
 * Dexie 스키마에 없는 필드는 자동 무시되므로 변환 없이 normalize 후 put.
 */
// Supabase REST default 가 1000-row truncation — pagination 으로 회피
// (lesson `~/apps/lessons/supabase-select-default-1000-limit.md`).
const PULL_PAGE_SIZE = 1000;

export async function pullTable(mapping, db, userId) {
  if (!supabase) return { table: mapping.dexie, status: 'skipped', reason: 'no_supabase' };
  if (!db) return { table: mapping.dexie, status: 'skipped', reason: 'no_db' };
  if (!userId) return { table: mapping.dexie, status: 'skipped', reason: 'no_user' };
  try {
    let from = 0;
    let collected = [];
    while (true) {
      let query = supabase.from(mapping.supabase).select('*');
      if (mapping.filterColumn) {
        query = query.eq(mapping.filterColumn, userId);
      }
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
    if (collected.length === 0) {
      return { table: mapping.dexie, status: 'empty', count: 0 };
    }
    const store = db[mapping.dexie];
    if (!store?.bulkPut) {
      return { table: mapping.dexie, status: 'error', reason: 'no_store' };
    }
    await store.bulkPut(collected.map(normalizeRow));
    return { table: mapping.dexie, status: 'ok', count: collected.length };
  } catch (e) {
    console.error(`[sync] pullTable ${mapping.supabase} 예외:`, formatError(e));
    return { table: mapping.dexie, status: 'error', error: e };
  }
}

/**
 * TABLE_MAP 전부 동시 다운로드.
 * 부분 실패 시 로컬 데이터 보존 (Promise.all + 실패 카운트).
 */
export async function pullAll(db, userId) {
  if (!supabase) return { ok: false, reason: 'no_supabase', results: [], failed: 0 };
  if (!db || !userId) return { ok: false, reason: 'preconditions', results: [], failed: 0 };
  const results = await Promise.all(TABLE_MAP.map((m) => pullTable(m, db, userId)));
  const failed = results.filter((r) => r.status === 'error').length;
  return { ok: failed === 0, results, failed };
}

/**
 * 동기화 시작. main.js 부트스트랩 + onAuthStateChange SIGNED_IN 양쪽에서 호출.
 * 1차 (Wave 11.5.3.1) 는 1회 다운로드만. 중복 호출 방지.
 */
export async function startSync(user) {
  if (!user?.id) return { ok: false, reason: 'no_user' };
  const db = globalThis.todayDB;
  if (!db) {
    console.warn('[sync] globalThis.todayDB 없음 — startSync 무시');
    return { ok: false, reason: 'no_db' };
  }
  if (_syncActive) {
    return { ok: true, reason: 'already_active' };
  }
  _syncActive = true;
  const result = await pullAll(db, user.id);
  if (!result.ok) {
    console.warn('[sync] pullAll 부분 실패:', JSON.stringify(result));
  }
  // Realtime 구독 (Wave 11.5.4) — 초기 다운로드 후 구독 시작
  startRealtime();
  // 오프라인 큐 flush (Wave 11.5.5 + 11.6.2 + 11.7.2)
  flushPendingFromDexie().catch((e) => console.warn('[sync] flushPendingFromDexie 실패:', formatError(e)));
  flushPendingExpensesFromDexie().catch((e) =>
    console.warn('[sync] flushPendingExpensesFromDexie 실패:', formatError(e)),
  );
  flushPendingCommentsFromDexie().catch((e) =>
    console.warn('[sync] flushPendingCommentsFromDexie 실패:', formatError(e)),
  );
  return result;
}

/**
 * 동기화 정리. auth.registerOnSignOut 으로 main.js 가 등록.
 * 플래그 리셋 + pending upload timer 클리어.
 */
export function stopSync() {
  _syncActive = false;
  for (const t of _uploadTimers.values()) clearTimeout(t);
  _uploadTimers.clear();
  for (const t of _expenseUploadTimers.values()) clearTimeout(t);
  _expenseUploadTimers.clear();
  for (const t of _commentUploadTimers.values()) clearTimeout(t);
  _commentUploadTimers.clear();
  for (const t of _notifUploadTimers.values()) clearTimeout(t);
  _notifUploadTimers.clear();
  // Realtime 도 함께 종료 (Wave 11.5.4)
  stopRealtime();
}

export function isSyncActive() {
  return _syncActive;
}

// ═══════════════════════════════════════════════════════════════════════════
// 업로드 (Wave 11.5.3.2) — Dexie 변경 → Supabase upsert
// ═══════════════════════════════════════════════════════════════════════════

const UPLOAD_DEBOUNCE_MS = 800;
/** id → debounce timer 매핑. id 별 마지막 변경만 push. */
const _uploadTimers = new Map();
/** id → 마지막 push 결과 (테스트·디버그용). */
const _lastUploadResult = new Map();

/** Dexie row → Supabase row. 0/1 → boolean 역정규화. */
function denormalizeRow(row) {
  const out = { ...row };
  if ('is_shared' in out) out.is_shared = Boolean(out.is_shared);
  if ('pinned' in out) out.pinned = Boolean(out.pinned);
  // pending_sync 는 Dexie 전용 메타. Supabase 에 보내지 않음.
  delete out.pending_sync;
  return out;
}

/**
 * 단일 entry id 즉시 push (Dexie → Supabase upsert).
 * RLS 가 owner_id != auth.uid() 인 row 의 write 를 막음 — 안전.
 *
 * Wave 11.5.5: 성공 시 pending_sync=0, 실패 시 pending_sync=1 마킹.
 */
export async function pushEntry(id) {
  if (!supabase) {
    // 미설정 환경 — Dexie 만 사용. pending 마킹 하지 않음 (영구 미설정 상태에서 무한 큐 방지)
    return { id, status: 'skipped', reason: 'no_supabase' };
  }
  const db = globalThis.todayDB;
  if (!db) return { id, status: 'skipped', reason: 'no_db' };
  const row = await db.entries.get(id);
  if (!row) return { id, status: 'skipped', reason: 'not_found' };
  // Wave 11.6.11 — 비-UUID id (devSeed fixture: entry-fixture-navi-X 등) push 시 Supabase 22P02. skip + pending_sync=0.
  if (!isValidUuid(id)) {
    try { await setPendingSync(id, 0); } catch (_) { /* 무시 */ }
    return { id, status: 'skipped', reason: 'non_uuid_local_only' };
  }
  try {
    const { error } = await supabase
      .from('today_entries')
      .upsert(denormalizeRow(row), { onConflict: 'id' });
    if (error) {
      console.error('[sync] pushEntry 실패:', formatError(error));
      // Wave 11.5.5 — 오프라인/RLS/네트워크 실패 시 pending 마킹
      try { await setPendingSync(id, 1); } catch (e) { /* DB 미초기화 등 무시 */ }
      const result = { id, status: 'error', error };
      _lastUploadResult.set(id, result);
      return result;
    }
    // 성공 — pending 해제
    try { await setPendingSync(id, 0); } catch (e) { /* 무시 */ }
    const result = { id, status: 'ok' };
    _lastUploadResult.set(id, result);
    return result;
  } catch (e) {
    console.error('[sync] pushEntry 예외:', formatError(e));
    try { await setPendingSync(id, 1); } catch (_) { /* 무시 */ }
    const result = { id, status: 'error', error: e };
    _lastUploadResult.set(id, result);
    return result;
  }
}

/**
 * id 별 800ms debounce 큐. 빠른 연속 변경은 마지막 1회만 push.
 * queries.js 의 createEntry/updateEntry 가 호출.
 */
export function queueUpload(id) {
  if (!id) return;
  const existing = _uploadTimers.get(id);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    _uploadTimers.delete(id);
    pushEntry(id);
  }, UPLOAD_DEBOUNCE_MS);
  _uploadTimers.set(id, t);
}

/** 모든 pending push 즉시 flush (signOut · 페이지 unload 대비). */
export async function flushPendingUploads() {
  const ids = [...new Set(_uploadTimers.keys())];
  for (const id of ids) {
    const t = _uploadTimers.get(id);
    if (t) clearTimeout(t);
    _uploadTimers.delete(id);
  }
  const results = await Promise.all(ids.map((id) => pushEntry(id)));
  return { count: ids.length, results };
}

/**
 * Dexie 의 pending_sync=1 entries 를 모두 재push (Wave 11.5.5).
 * online 이벤트 시 + startSync 시점에 1회 호출.
 */
export async function flushPendingFromDexie() {
  if (!supabase) return { count: 0, reason: 'no_supabase', results: [] };
  const db = globalThis.todayDB;
  if (!db) return { count: 0, reason: 'no_db', results: [] };
  let pending;
  try {
    pending = await listPendingEntries();
  } catch (e) {
    return { count: 0, reason: 'list_failed', error: e, results: [] };
  }
  if (!pending.length) return { count: 0, results: [] };
  const results = await Promise.all(pending.map((p) => pushEntry(p.id)));
  const recovered = results.filter((r) => r.status === 'ok').length;
  if (recovered > 0) {
    console.info(`[sync] flushPendingFromDexie — ${recovered}/${pending.length} 복구`);
  }
  return { count: pending.length, recovered, results };
}

/** 테스트용 — 내부 debounce timer 모두 클리어 (push 없이). */
export function _clearUploadTimers() {
  for (const t of _uploadTimers.values()) clearTimeout(t);
  _uploadTimers.clear();
}

/** 테스트용 — id 의 마지막 upload 결과 조회. */
export function _getLastUploadResult(id) {
  return _lastUploadResult.get(id);
}

// ───────────────────────────────────────────────────────────────────────────
// expenses 업로드 (Wave 11.6.2) — entries 와 동일 패턴
// ───────────────────────────────────────────────────────────────────────────

const _expenseUploadTimers = new Map();

/** 단일 expense id 즉시 push. */
export async function pushExpense(id) {
  if (!supabase) return { id, status: 'skipped', reason: 'no_supabase' };
  const db = globalThis.todayDB;
  if (!db) return { id, status: 'skipped', reason: 'no_db' };
  const row = await db.expenses.get(id);
  if (!row) return { id, status: 'skipped', reason: 'not_found' };
  // Wave 11.6.11 — 비-UUID id (devSeed fixture: tx-XX 등) push 시 22P02. skip + pending_sync=0.
  if (!isValidUuid(id)) {
    try { await db.expenses.put({ ...row, pending_sync: 0 }); } catch (_) { /* 무시 */ }
    return { id, status: 'skipped', reason: 'non_uuid_local_only' };
  }
  try {
    const payload = { ...row };
    delete payload.pending_sync;
    const { error } = await supabase
      .from('today_expenses')
      .upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error('[sync] pushExpense 실패:', formatError(error));
      try {
        await db.expenses.put({ ...row, pending_sync: 1 });
      } catch (_) { /* 무시 */ }
      return { id, status: 'error', error };
    }
    try {
      await db.expenses.put({ ...row, pending_sync: 0 });
    } catch (_) { /* 무시 */ }
    return { id, status: 'ok' };
  } catch (e) {
    console.error('[sync] pushExpense 예외:', formatError(e));
    try {
      await db.expenses.put({ ...row, pending_sync: 1 });
    } catch (_) { /* 무시 */ }
    return { id, status: 'error', error: e };
  }
}

/** id 별 800ms debounce 큐 (expenses 전용). */
export function queueUploadExpense(id) {
  if (!id) return;
  const existing = _expenseUploadTimers.get(id);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    _expenseUploadTimers.delete(id);
    pushExpense(id);
  }, UPLOAD_DEBOUNCE_MS);
  _expenseUploadTimers.set(id, t);
}

/** Dexie 의 pending_sync=1 expenses 재push. */
export async function flushPendingExpensesFromDexie() {
  if (!supabase) return { count: 0, reason: 'no_supabase', results: [] };
  const db = globalThis.todayDB;
  if (!db) return { count: 0, reason: 'no_db', results: [] };
  let pending;
  try {
    pending = await db.expenses.where('pending_sync').equals(1).toArray();
  } catch (e) {
    return { count: 0, reason: 'list_failed', error: e, results: [] };
  }
  if (!pending.length) return { count: 0, results: [] };
  const results = await Promise.all(pending.map((p) => pushExpense(p.id)));
  return { count: pending.length, results };
}

export function _clearExpenseUploadTimers() {
  for (const t of _expenseUploadTimers.values()) clearTimeout(t);
  _expenseUploadTimers.clear();
}

// ───────────────────────────────────────────────────────────────────────────
// comments 업로드 (Wave 11.7.2)
// ───────────────────────────────────────────────────────────────────────────

const _commentUploadTimers = new Map();

export async function pushComment(id) {
  if (!supabase) return { id, status: 'skipped', reason: 'no_supabase' };
  const db = globalThis.todayDB;
  if (!db) return { id, status: 'skipped', reason: 'no_db' };
  const row = await db.comments.get(id);
  if (!row) return { id, status: 'skipped', reason: 'not_found' };
  // Wave 11.6.11 — 비-UUID id 또는 entry_id (devSeed fixture entry 의 댓글) push 시 22P02. skip.
  if (!isValidUuid(id) || !isValidUuid(row.entry_id)) {
    try { await db.comments.put({ ...row, pending_sync: 0 }); } catch (_) { /* 무시 */ }
    return { id, status: 'skipped', reason: 'non_uuid_local_only' };
  }
  try {
    const payload = { ...row };
    delete payload.pending_sync;
    const { error } = await supabase
      .from('today_comments')
      .upsert(payload, { onConflict: 'id' });
    if (error) {
      try { await db.comments.put({ ...row, pending_sync: 1 }); } catch (_) {}
      return { id, status: 'error', error };
    }
    try { await db.comments.put({ ...row, pending_sync: 0 }); } catch (_) {}
    return { id, status: 'ok' };
  } catch (e) {
    try { await db.comments.put({ ...row, pending_sync: 1 }); } catch (_) {}
    return { id, status: 'error', error: e };
  }
}

export function queueUploadComment(id) {
  if (!id) return;
  const existing = _commentUploadTimers.get(id);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    _commentUploadTimers.delete(id);
    pushComment(id);
  }, UPLOAD_DEBOUNCE_MS);
  _commentUploadTimers.set(id, t);
}

export async function flushPendingCommentsFromDexie() {
  if (!supabase) return { count: 0, reason: 'no_supabase', results: [] };
  const db = globalThis.todayDB;
  if (!db) return { count: 0, reason: 'no_db', results: [] };
  let pending;
  try {
    pending = await db.comments.where('pending_sync').equals(1).toArray();
  } catch (e) {
    return { count: 0, reason: 'list_failed', error: e, results: [] };
  }
  if (!pending.length) return { count: 0, results: [] };
  const results = await Promise.all(pending.map((p) => pushComment(p.id)));
  return { count: pending.length, results };
}

// ───────────────────────────────────────────────────────────────────────────
// notifications read_at 갱신 (Wave 11.7.2)
// 알림은 서버 INSERT (트리거) — 클라이언트는 read_at 만 update.
// ───────────────────────────────────────────────────────────────────────────

const _notifUploadTimers = new Map();

export async function pushNotification(id) {
  if (!supabase) return { id, status: 'skipped', reason: 'no_supabase' };
  const db = globalThis.todayDB;
  if (!db) return { id, status: 'skipped', reason: 'no_db' };
  const row = await db.notifications.get(id);
  if (!row) return { id, status: 'skipped', reason: 'not_found' };
  // Wave 11.6.11 — 비-UUID id (devSeed dummy notification) push 시 22P02. skip.
  if (!isValidUuid(id)) {
    return { id, status: 'skipped', reason: 'non_uuid_local_only' };
  }
  try {
    const { error } = await supabase
      .from('today_notifications')
      .update({ read_at: row.read_at })
      .eq('id', id);
    if (error) return { id, status: 'error', error };
    return { id, status: 'ok' };
  } catch (e) {
    return { id, status: 'error', error: e };
  }
}

export function queueUploadNotification(id) {
  if (!id) return;
  const existing = _notifUploadTimers.get(id);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    _notifUploadTimers.delete(id);
    pushNotification(id);
  }, UPLOAD_DEBOUNCE_MS);
  _notifUploadTimers.set(id, t);
}

// ═══════════════════════════════════════════════════════════════════════════
// Realtime 구독 (Wave 11.5.4) — spec §8 line 341-344
// ═══════════════════════════════════════════════════════════════════════════

let _channel = null;
let _realtimeListeners = new Set();

/**
 * 'today_entries' 테이블 postgres_changes 구독.
 * RLS 가 자동 필터링 — own + partner.is_shared=true 만 수신.
 *
 * Supabase 대시보드에서 alter publication 1회 실행 필요 (0004_realtime_publication.sql).
 */
export function startRealtime() {
  if (!supabase) return { ok: false, reason: 'no_supabase' };
  if (_channel) return { ok: true, reason: 'already_subscribed' };

  _channel = supabase
    .channel('today_realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'today_entries' },
      (payload) => handleEntryChange(payload),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'today_expenses' },
      (payload) => handleExpenseChange(payload),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'today_comments' },
      (payload) => handleCommentChange(payload),
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'today_notifications' },
      (payload) => handleNotificationChange(payload),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.info('[sync] realtime SUBSCRIBED (entries + expenses + comments + notifications)');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[sync] realtime status:', formatError(status));
      }
    });
  return { ok: true };
}

function handleCommentChange(payload) {
  const db = globalThis.todayDB;
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

async function handleNotificationChange(payload) {
  const db = globalThis.todayDB;
  if (!db?.notifications) return;
  const newRow = payload.new;
  if (!newRow) return;
  // 회귀 2 fix — put 을 await. listener (handleRealtimeNotificationChange) 가 Dexie fresh fetch 시 race 방지.
  try {
    await db.notifications.put(newRow);
  } catch (e) {
    console.error('[sync] realtime notification put 실패:', formatError(e));
  }
  for (const fn of _realtimeListeners) {
    try { fn(payload); } catch (e) { console.error('[sync] listener 실패:', formatError(e)); }
  }
}

/** Realtime expense payload 처리 — Dexie 동기화. */
function handleExpenseChange(payload) {
  const db = globalThis.todayDB;
  if (!db?.expenses) return;
  const { eventType, new: newRow, old: oldRow } = payload;
  try {
    if (eventType === 'DELETE') {
      if (oldRow?.id) db.expenses.delete(oldRow.id);
    } else if (newRow) {
      db.expenses.put({ ...newRow, pending_sync: 0 });
    }
  } catch (e) {
    console.error('[sync] realtime expense put 실패:', formatError(e));
  }
  for (const fn of _realtimeListeners) {
    try { fn(payload); } catch (e) { console.error('[sync] listener 실패:', formatError(e)); }
  }
}

/**
 * Realtime payload 처리. Dexie 에 put/delete 반영.
 * 편집 중 문서 (isEditorDirty) 처리는 Wave 11.5.2b 의 entries.js 가 listener 등록.
 */
function handleEntryChange(payload) {
  const db = globalThis.todayDB;
  if (!db?.entries) return;
  const { eventType, new: newRow, old: oldRow } = payload;
  try {
    if (eventType === 'DELETE') {
      if (oldRow?.id) db.entries.delete(oldRow.id);
    } else if (newRow) {
      db.entries.put(normalizeRow(newRow));
    }
  } catch (e) {
    console.error('[sync] realtime put 실패:', formatError(e));
  }
  // 외부 리스너 알림 (entries.js 등)
  for (const fn of _realtimeListeners) {
    try { fn(payload); } catch (e) { console.error('[sync] listener 실패:', formatError(e)); }
  }
}

/** 외부 리스너 등록 (UI 갱신용). 반환: unregister 함수. */
export function onRealtimeChange(fn) {
  _realtimeListeners.add(fn);
  return () => _realtimeListeners.delete(fn);
}

/** Realtime 구독 해제. signOut · 페이지 unload 대비. */
export function stopRealtime() {
  if (!_channel) return;
  try {
    supabase?.removeChannel(_channel);
  } catch (e) {
    console.error('[sync] removeChannel 실패:', formatError(e));
  }
  _channel = null;
  _realtimeListeners.clear();
}

/** 테스트용 — 현재 channel 존재 여부. */
export function _isRealtimeActive() {
  return _channel !== null;
}

export const Sync = {
  TABLE_MAP,
  pullTable,
  pullAll,
  startSync,
  stopSync,
  isSyncActive,
  pushEntry,
  isValidUuid,
  queueUpload,
  flushPendingUploads,
  flushPendingFromDexie,
  UPLOAD_DEBOUNCE_MS,
  startRealtime,
  stopRealtime,
  onRealtimeChange,
  // Wave 11.6.2 — expenses
  pushExpense,
  queueUploadExpense,
  flushPendingExpensesFromDexie,
  // Wave 11.7.2 — comments / notifications
  pushComment,
  queueUploadComment,
  flushPendingCommentsFromDexie,
  pushNotification,
  queueUploadNotification,
  _clearUploadTimers,
  _clearExpenseUploadTimers,
  _getLastUploadResult,
  _isRealtimeActive,
  // 별 wave hotfix — error 직렬화
  formatError,
};

if (typeof window !== 'undefined') {
  window.todaySync = Sync;
}

export default Sync;
