/**
 * 동기화 어댑터 (Wave 11.8.1+11.8.2 · spec §4 동기화 전략).
 *
 * 책임:
 *  11.8.1 — Supabase → Dexie 단방향 다운로드 (pull) — 4 테이블.
 *  11.8.2 — Dexie → Supabase 업로드 (push) + 3초 디바운스 큐 + Dexie hooks.
 *
 * 4 테이블 처리: sessions / prs / weights / customExercises.
 *   settings 는 JSONB ↔ 평면 row 변환 별도 — 11.8.x 분리 (Study user_meta 패턴).
 *
 * 다음 Wave 보강:
 *  - 11.8.3: 충돌 해결 + 급감 차단 (Study 11.13.3 패턴).
 *  - 11.8.x: settings JSONB 매핑.
 *
 * 매핑 변환 (양방향):
 *  - sessions: camelCase ↔ snake_case (startTime↔start_time 등)
 *  - prs: id 합성 (exerciseId+'_'+type) + camelCase ↔ snake_case
 *  - weights: 단순 1:1
 *  - customExercises: camelCase ↔ snake_case
 *
 * 안전장치:
 *  - supabase 미설정 / db 없음 / user 없음 → no-op + 사유 반환.
 *  - pullAll 부분 실패 시 로컬 데이터 보존.
 *  - flushPendingUploads no-context (in-flight stopSync 등) 시 큐 보존.
 */
import { supabase } from '../services/supabase.js';

/**
 * Supabase row → Dexie row 변환기.
 * Dexie 스키마에 없는 필드(user_id, created_at 등)는 자동 무시되지만, PK·인덱스는 유지.
 */

function fromSupabaseSession(row) {
  return {
    id: row.id,
    date: row.date,
    status: row.status,
    startTime: row.start_time != null ? Number(row.start_time) : null,
    endTime: row.end_time != null ? Number(row.end_time) : null,
    blocks: row.blocks || [],
    tags: row.tags || [],
    totalVolume: Number(row.total_volume) || 0,
    totalCalories: Number(row.total_calories) || 0,
    durationMin: Number(row.duration_min) || 0,
  };
}

function fromSupabasePR(row) {
  // Dexie PK = [exerciseId+type] 복합. Supabase id 컬럼 (exercise_id+'_'+type) 은 무시.
  return {
    exerciseId: row.exercise_id,
    type: row.type,
    weight: Number(row.weight),
    reps: Number(row.reps),
    e1rm: Number(row.e1rm),
    date: row.date || null,
    sessionId: row.session_id || null,
  };
}

function fromSupabaseWeight(row) {
  return {
    date: row.date,
    weight: Number(row.weight),
    height: row.height != null ? Number(row.height) : null,
  };
}

function fromSupabaseCustomExercise(row) {
  return {
    id: row.id,
    name: row.name,
    part: row.part,
    equipment: row.equipment,
    defaultSets: Number(row.default_sets),
    defaultReps: Number(row.default_reps),
    defaultWeight: Number(row.default_weight),
    met: Number(row.met),
    createdAt: row.created_at ? new Date(row.created_at).getTime() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
  };
}

/**
 * Dexie row → Supabase row 변환기 (Wave 11.8.2). user_id 는 호출자 주입.
 * camelCase → snake_case + ms epoch → ISO timestamp + prs id 합성.
 */

function toSupabaseSession(row, userId) {
  return {
    id: row.id,
    user_id: userId,
    date: row.date,
    status: row.status,
    start_time: row.startTime ?? null,
    end_time: row.endTime ?? null,
    blocks: row.blocks || [],
    tags: row.tags || [],
    total_volume: Number(row.totalVolume) || 0,
    total_calories: Number(row.totalCalories) || 0,
    duration_min: Number(row.durationMin) || 0,
  };
}

function toSupabasePR(row, userId) {
  // Supabase PK = id text — exerciseId 와 type 합성 (`<exerciseId>_<type>`).
  // 복합 PK 의 의미를 단일 컬럼으로 표현 → onConflict='id' 로 upsert.
  return {
    id: `${row.exerciseId}_${row.type}`,
    user_id: userId,
    exercise_id: row.exerciseId,
    type: row.type,
    weight: Number(row.weight),
    reps: Number(row.reps),
    e1rm: Number(row.e1rm),
    date: row.date || null,
    session_id: row.sessionId || null,
  };
}

function toSupabaseWeight(row, userId) {
  return {
    user_id: userId,
    date: row.date,
    weight: Number(row.weight),
    height: row.height != null ? Number(row.height) : null,
  };
}

function toSupabaseCustomExercise(row, userId) {
  return {
    id: row.id,
    user_id: userId,
    name: row.name,
    part: row.part,
    equipment: row.equipment,
    default_sets: Number(row.defaultSets) || 3,
    default_reps: Number(row.defaultReps) || 10,
    default_weight: Number(row.defaultWeight) || 0,
    met: Number(row.met) || 4.0,
    // created_at/updated_at 은 Supabase 트리거가 자동 처리 (DEFAULT now() / trg_*_updated)
  };
}

/**
 * settings 변환 (Wave 11.8.x · spec §4 의 gym_user_settings JSONB 컬럼).
 *  - Supabase row: { user_id, settings: jsonb, updated_at } — 단일 row / user.
 *  - Dexie row: { key: 'userSettings', weeklyGoal, height, birthYear, goalWeight,
 *                 hiddenExercises, exerciseOrder, exercisePartOverride } — 평면.
 *  - 변환: 평면 ↔ jsonb 안의 객체. key 는 변환 시 제외/주입.
 */
function fromSupabaseSettings(row) {
  const inner = row?.settings || {};
  return {
    key: 'userSettings',
    weeklyGoal: inner.weeklyGoal ?? 4,
    height: inner.height ?? null,
    birthYear: inner.birthYear ?? null,
    birthDate: inner.birthDate ?? null,
    goalWeight: inner.goalWeight ?? 69,
    hiddenExercises: Array.isArray(inner.hiddenExercises) ? inner.hiddenExercises : [],
    exerciseOrder: inner.exerciseOrder && typeof inner.exerciseOrder === 'object' ? inner.exerciseOrder : {},
    exercisePartOverride: inner.exercisePartOverride && typeof inner.exercisePartOverride === 'object' ? inner.exercisePartOverride : {},
  };
}

function toSupabaseSettings(row, userId) {
  // key 는 Supabase 컬럼이 아니라 Dexie PK — 제외 후 settings JSONB 로 평면 객체 그대로.
  const { key: _drop, ...rest } = row || {};
  return {
    user_id: userId,
    settings: rest,
    // updated_at 은 트리거가 자동 갱신 (set_updated_at).
  };
}

/**
 * Dexie 의 PK 를 추출해 push 큐 키로 사용.
 *  - sessions / customExercises: 단일 id 그대로
 *  - prs: [exerciseId, type] 배열 (Dexie 복합 PK key 형식)
 *  - weights: date 단일
 * Dexie hook 의 (primKey, obj) 인자는 PK 그대로 받음 → Set 의 key 로 안전하게 사용 가능
 * (배열 [exerciseId, type] 도 Set key 로 distinct 비교 — JSON.stringify 후 dedupe 권장).
 */
function pkKeyForRow(dexieName, row) {
  if (dexieName === 'prs') {
    return JSON.stringify([row.exerciseId, row.type]);
  }
  if (dexieName === 'weights') return row.date;
  if (dexieName === 'settings') return row.key || 'userSettings';
  return row.id;
}

function pkFromKey(dexieName, key) {
  if (dexieName === 'prs') {
    try { return JSON.parse(key); } catch { return null; }
  }
  return key;
}

/**
 * Dexie ↔ Supabase 매핑 4 테이블. settings 는 별 wave (JSONB 변환 필요).
 *  - fromSupabase: pull 시 Supabase row → Dexie row
 *  - toSupabase: push 시 Dexie row + userId → Supabase row
 *  - onConflict: upsert 충돌 컬럼
 */
export const TABLE_MAP = Object.freeze([
  Object.freeze({
    dexie: 'sessions',
    supabase: 'gym_sessions',
    fromSupabase: fromSupabaseSession,
    toSupabase: toSupabaseSession,
    onConflict: 'id',
  }),
  Object.freeze({
    dexie: 'prs',
    supabase: 'gym_prs',
    fromSupabase: fromSupabasePR,
    toSupabase: toSupabasePR,
    onConflict: 'id',
  }),
  Object.freeze({
    dexie: 'weights',
    supabase: 'gym_weights',
    fromSupabase: fromSupabaseWeight,
    toSupabase: toSupabaseWeight,
    onConflict: 'user_id,date',
  }),
  Object.freeze({
    dexie: 'customExercises',
    supabase: 'gym_custom_exercises',
    fromSupabase: fromSupabaseCustomExercise,
    toSupabase: toSupabaseCustomExercise,
    onConflict: 'id',
  }),
  Object.freeze({
    dexie: 'settings',
    supabase: 'gym_user_settings',
    fromSupabase: fromSupabaseSettings,
    toSupabase: toSupabaseSettings,
    onConflict: 'user_id',
  }),
]);

/** dexieName 으로 mapping 조회. test/내부 유틸. */
export function findMapping(dexieName) {
  return TABLE_MAP.find((m) => m.dexie === dexieName) || null;
}

export const DEBOUNCE_MS = 3000;

/**
 * push/delete 일시 실패 자동 재시도 간격 — spec §4 line 224 "5초, 15초, 45초".
 * 4xx (RLS · constraint · syntax) 는 즉시 실패 — withRetry 가 코드 prefix 로 차단.
 */
export const RETRY_DELAYS_MS = Object.freeze([5000, 15000, 45000]);

async function withRetry(fn, label) {
  let lastErr = null;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    try {
      const r = await fn();
      if (!r?.error) return r ?? { error: null };
      lastErr = r.error;
      // 4xx (Postgres SQLSTATE 42·22·23 · PostgREST PGRST*) 는 retry 무의미 — 즉시 실패.
      if (r.error.code && /^(42|22|23|PGRST)/.test(String(r.error.code))) return r;
    } catch (e) {
      lastErr = e;
    }
    if (i < RETRY_DELAYS_MS.length) {
      await new Promise((res) => setTimeout(res, RETRY_DELAYS_MS[i]));
    }
  }
  console.error(`[sync] ${label} retry 소진`, lastErr);
  return { error: lastErr };
}

let _syncActive = false;
let _ctx = null;            // { db, userId } — startSync 시 셋업, stopSync 시 비움.
let _hooks = null;          // { creating, updating, deleting } 핸들러 reference (detach 용).
const _pendingUploads = new Map(); // dexieName → Set<pkKey>
const _pendingDeletes = new Map(); // dexieName → Set<pkKey> — Wave 11.8.3
let _debounceTimer = null;

/**
 * 급감 차단 (Wave 11.8.3 · spec §4 line 241~243).
 *  - pullAll 결과의 status='ok'/'empty' 인 테이블만 마킹 → pushTable 시 비교.
 *  - dexieName → server count.
 *  - server=0 + local>0 시 push 차단 (서버 데이터 삭제 방지 안전망).
 *  - 안전 우회: 마킹 없으면 (첫 startSync 전 또는 explicit clear) 차단 안 함.
 */
const _serverCounts = new Map();

/**
 * 충돌 해결 (Wave 11.8.3 · spec §4 line 240).
 *  - prs 한정: e1rm 큰 쪽 우선. 동률이면 server 우선 (push 결과 일관성).
 *  - 다른 3 테이블 (sessions / weights / customExercises) 은 last-write-wins (기본 bulkPut).
 *
 * 호출 시점: pullTable 의 prs 만 bulkGet 후 적용. 다른 테이블은 단순 bulkPut.
 */
export function resolveConflict(local, server) {
  if (!local) return server;
  if (!server) return local;
  const localE = Number(local.e1rm) || 0;
  const serverE = Number(server.e1rm) || 0;
  if (localE > serverE) return local;
  return server; // server >= local 이면 server 우선
}

/** 서버 count 마킹 access (테스트 + 외부 reset 용). */
export function getServerCount(dexieName) {
  return _serverCounts.has(dexieName) ? _serverCounts.get(dexieName) : null;
}
export function clearServerCounts() { _serverCounts.clear(); }

/**
 * 한 테이블 다운로드. Supabase 에서 user_id 필터로 select → 변환 → Dexie bulkPut.
 */
export async function pullTable(mapping, db, userId) {
  if (!supabase) return { table: mapping.dexie, status: 'skipped', reason: 'no_supabase' };
  if (!db) return { table: mapping.dexie, status: 'skipped', reason: 'no_db' };
  if (!userId) return { table: mapping.dexie, status: 'skipped', reason: 'no_user' };
  try {
    const { data, error } = await supabase
      .from(mapping.supabase)
      .select('*')
      .eq('user_id', userId);
    if (error) {
      console.error(`[sync] pullTable ${mapping.supabase} 실패`, error);
      return { table: mapping.dexie, status: 'error', error };
    }
    if (!data || data.length === 0) {
      return { table: mapping.dexie, status: 'empty', count: 0 };
    }
    const store = db[mapping.dexie];
    if (!store?.bulkPut) {
      return { table: mapping.dexie, status: 'error', reason: 'no_store' };
    }
    const transformed = data.map(mapping.fromSupabase);
    // Wave 11.8.3 — prs 만 충돌 해결 (e1rm 큰 쪽 우선). 다른 테이블은 단순 bulkPut.
    let rowsToPut = transformed;
    if (mapping.dexie === 'prs' && typeof store.bulkGet === 'function') {
      // prs PK = [exerciseId+type] 복합. server row 의 exerciseId/type 으로 키 생성 → bulkGet.
      const keys = transformed.map((r) => [r.exerciseId, r.type]);
      const localRows = await store.bulkGet(keys);
      rowsToPut = transformed.map((serverRow, i) => resolveConflict(localRows[i], serverRow));
    }
    await store.bulkPut(rowsToPut);
    return { table: mapping.dexie, status: 'ok', count: rowsToPut.length };
  } catch (e) {
    console.error(`[sync] pullTable ${mapping.supabase} 예외`, e);
    return { table: mapping.dexie, status: 'error', error: e };
  }
}

/**
 * 4 테이블 동시 다운로드. Promise.all 부분 실패 시 로컬 데이터 보존.
 */
export async function pullAll(db, userId) {
  if (!supabase) return { ok: false, reason: 'no_supabase', results: [], failed: 0 };
  if (!db || !userId) return { ok: false, reason: 'preconditions', results: [], failed: 0 };
  const results = await Promise.all(TABLE_MAP.map((m) => pullTable(m, db, userId)));
  const failed = results.filter((r) => r.status === 'error').length;
  // Wave 11.8.3 — server count 마킹 (push 시 급감 차단용). error 는 모름 → 마킹 X.
  for (const r of results) {
    if (r.status === 'ok') _serverCounts.set(r.table, r.count ?? 0);
    else if (r.status === 'empty') _serverCounts.set(r.table, 0);
  }
  return { ok: failed === 0, results, failed };
}

/* ───────────────────────────── push (Wave 11.8.2) ───────────────────────────── */

/**
 * 한 테이블 업로드. Dexie 에서 ids 로 bulkGet → toSupabase 변환 + user_id 주입 → upsert.
 *  - ids === null: 전체 push (시드 등 1회 보강).
 *  - ids === []: 변경 없음 → empty.
 *  - ids === [..]: 해당 PK row 만 push. prs 의 PK 는 [exerciseId, type] 배열.
 * Dexie 의 사이 삭제된 row 는 bulkGet 의 undefined → filter(Boolean).
 */
export async function pushTable(mapping, db, userId, ids = null) {
  if (!supabase) return { table: mapping.dexie, status: 'skipped', reason: 'no_supabase' };
  if (!db) return { table: mapping.dexie, status: 'skipped', reason: 'no_db' };
  if (!userId) return { table: mapping.dexie, status: 'skipped', reason: 'no_user' };
  try {
    const store = db[mapping.dexie];
    if (!store) return { table: mapping.dexie, status: 'error', reason: 'no_store' };
    let rows;
    if (Array.isArray(ids) && ids.length > 0) {
      const got = await store.bulkGet(ids);
      rows = got.filter(Boolean);
    } else if (ids === null) {
      rows = await store.toArray();
    } else {
      return { table: mapping.dexie, status: 'empty', count: 0 };
    }
    if (!rows || rows.length === 0) {
      // spec §4 line 225 "IndexedDB 빈 상태에서 업로드 차단 (서버 데이터 삭제 방지)" 자연 처리.
      // local empty 면 여기서 'empty' return → upsert 호출 안 함 → 서버 보존.
      return { table: mapping.dexie, status: 'empty', count: 0 };
    }
    // 주의: Wave 11.8.3 의 "server count=0 + local>0 → blocked" 분기는 spec 의도와 반대 발화로
    // 신규 user 첫 push 영구 차단 발생 (Wave 11.8.x 회복 wave 에서 제거). 50% 급감 차단은 별 wave.
    const supabaseRows = rows.map((r) => mapping.toSupabase(r, userId));
    const { error } = await withRetry(
      () => supabase.from(mapping.supabase).upsert(supabaseRows, { onConflict: mapping.onConflict }),
      `pushTable ${mapping.supabase}`,
    );
    if (error) {
      console.error(`[sync] pushTable ${mapping.supabase} 실패`, error);
      return { table: mapping.dexie, status: 'error', error };
    }
    return { table: mapping.dexie, status: 'ok', count: supabaseRows.length };
  } catch (e) {
    console.error(`[sync] pushTable ${mapping.supabase} 예외`, e);
    return { table: mapping.dexie, status: 'error', error: e };
  }
}

/**
 * 4 테이블 동시 업로드. byTable: Map<dexieName, Set<pkKey>>.
 *   - byTable=null: 전체 push (toArray)
 *   - byTable 있음: 변경된 PK 만 push
 * Promise.all 부분 실패 허용.
 */
export async function pushAll(db, userId, byTable = null) {
  if (!supabase) return { ok: false, reason: 'no_supabase', results: [], failed: 0 };
  if (!db || !userId) return { ok: false, reason: 'preconditions', results: [], failed: 0 };
  const results = await Promise.all(
    TABLE_MAP.map((m) => {
      if (byTable) {
        const keysSet = byTable.get(m.dexie);
        const ids = keysSet ? Array.from(keysSet).map((k) => pkFromKey(m.dexie, k)) : [];
        return pushTable(m, db, userId, ids);
      }
      return pushTable(m, db, userId, null);
    }),
  );
  const failed = results.filter((r) => r.status === 'error').length;
  return { ok: failed === 0, results, failed };
}

/* ───────────────────────────── debounce 큐 (Wave 11.8.2) ───────────────────────────── */

/**
 * dexieName + row PK → 큐 적재 + 3초 setTimeout 디바운스.
 * 동일 PK 중복 호출은 Set 으로 1회 처리.
 *
 * 큐는 stopSync 진행 중 발화돼도 보존 — 다음 startSync 후 flush 로 데이터 유실 0.
 */
export function queueUpload(dexieName, row) {
  if (!dexieName || !row) return { ok: false, reason: 'invalid' };
  const key = pkKeyForRow(dexieName, row);
  if (key == null) return { ok: false, reason: 'no_pk' };
  if (!_pendingUploads.has(dexieName)) {
    _pendingUploads.set(dexieName, new Set());
  }
  _pendingUploads.get(dexieName).add(key);
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    flushPendingUploads().catch((e) => console.error('[sync] flush', e));
  }, DEBOUNCE_MS);
  return { ok: true, dexieName, queued: _pendingUploads.get(dexieName).size };
}

/**
 * 큐를 비워 pushAll 호출. _ctx 가 비어있으면 (stopSync 진행 중) 큐 보존 → 다음 startSync 후 flush.
 * Wave 11.8.3 — pendingDeletes 도 함께 처리 (deleteAll).
 */
export async function flushPendingUploads() {
  const hasUploads = _pendingUploads.size > 0;
  const hasDeletes = _pendingDeletes.size > 0;
  if (!hasUploads && !hasDeletes) return { ok: true, status: 'empty' };
  if (!_ctx) {
    return { ok: false, status: 'no_session', reason: 'context cleared, queue preserved' };
  }
  const upSnapshot = new Map();
  for (const [name, set] of _pendingUploads) upSnapshot.set(name, new Set(set));
  _pendingUploads.clear();
  const delSnapshot = new Map();
  for (const [name, set] of _pendingDeletes) delSnapshot.set(name, new Set(set));
  _pendingDeletes.clear();

  const [pushResult, deleteResult] = await Promise.all([
    hasUploads ? pushAll(_ctx.db, _ctx.userId, upSnapshot) : Promise.resolve({ ok: true, results: [] }),
    hasDeletes ? deleteAll(_ctx.userId, delSnapshot) : Promise.resolve({ ok: true, results: [] }),
  ]);
  return {
    ok: pushResult.ok && deleteResult.ok,
    status: 'flushed',
    push: pushResult,
    delete: deleteResult,
  };
}

/* ───────────────────────────── delete (Wave 11.8.3) ───────────────────────────── */

/** dexieName + row → 삭제 큐 적재 + 디바운스 (queueUpload 와 같은 타이머 공유). */
export function queueDelete(dexieName, row) {
  if (!dexieName || !row) return { ok: false, reason: 'invalid' };
  const key = pkKeyForRow(dexieName, row);
  if (key == null) return { ok: false, reason: 'no_pk' };
  if (!_pendingDeletes.has(dexieName)) _pendingDeletes.set(dexieName, new Set());
  _pendingDeletes.get(dexieName).add(key);
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    flushPendingUploads().catch((e) => console.error('[sync] flush', e));
  }, DEBOUNCE_MS);
  return { ok: true, dexieName, queued: _pendingDeletes.get(dexieName).size };
}

/** 한 테이블 Supabase delete. ids/keys 배열로 .in() filter. */
export async function deleteTable(mapping, userId, keys) {
  if (!supabase) return { table: mapping.dexie, status: 'skipped', reason: 'no_supabase' };
  if (!userId) return { table: mapping.dexie, status: 'skipped', reason: 'no_user' };
  if (!keys || keys.length === 0) return { table: mapping.dexie, status: 'empty' };
  // settings 는 user_id 단일 row — 일반 동기화 흐름에서 delete 호출 안 됨.
  // 호출 시 안전장치로 skipped 반환 (실수로 user 의 모든 설정 날리는 사고 방지).
  if (mapping.dexie === 'settings') {
    return { table: mapping.dexie, status: 'skipped', reason: 'settings_delete_unsupported' };
  }
  try {
    const { error } = await withRetry(() => {
      let query = supabase.from(mapping.supabase).delete().eq('user_id', userId);
      if (mapping.dexie === 'prs') {
        // [exerciseId, type] 배열 → id 합성으로 .in('id', [...])
        const ids = keys.map(([exId, type]) => `${exId}_${type}`);
        query = query.in('id', ids);
      } else if (mapping.dexie === 'weights') {
        query = query.in('date', keys);
      } else {
        query = query.in('id', keys);
      }
      return query;
    }, `deleteTable ${mapping.supabase}`);
    if (error) {
      console.error(`[sync] deleteTable ${mapping.supabase} 실패`, error);
      return { table: mapping.dexie, status: 'error', error };
    }
    return { table: mapping.dexie, status: 'ok', count: keys.length };
  } catch (e) {
    console.error(`[sync] deleteTable ${mapping.supabase} 예외`, e);
    return { table: mapping.dexie, status: 'error', error: e };
  }
}

/** 4 테이블 동시 delete. byTable: Map<dexieName, Set<pkKey>>. */
export async function deleteAll(userId, byTable) {
  if (!supabase) return { ok: false, reason: 'no_supabase', results: [] };
  if (!userId || !byTable) return { ok: false, reason: 'preconditions', results: [] };
  const results = await Promise.all(
    TABLE_MAP.map((m) => {
      const keysSet = byTable.get(m.dexie);
      if (!keysSet || keysSet.size === 0) return Promise.resolve({ table: m.dexie, status: 'empty' });
      const keys = Array.from(keysSet).map((k) => pkFromKey(m.dexie, k));
      return deleteTable(m, userId, keys);
    }),
  );
  const failed = results.filter((r) => r.status === 'error').length;
  return { ok: failed === 0, results, failed };
}

/* ───────────────────────────── Dexie hooks (Wave 11.8.2) ───────────────────────────── */

/**
 * Dexie creating/updating/deleting hook 등록. PK 파악 후 queueUpload / queueDelete.
 * pull 의 bulkPut 도 hook 발화 — startSync 가 pull → attach 순서 보장 (race 차단).
 * Wave 11.8.3 — deleting hook 추가 (급감 차단 안전망 위에서).
 */
export function attachHooks(db) {
  if (!db) return null;
  const handlers = { creating: {}, updating: {}, deleting: {} };
  for (const m of TABLE_MAP) {
    const store = db[m.dexie];
    if (!store?.hook) continue;
    const c = function (primKey, obj) { queueUpload(m.dexie, obj); };
    const u = function (mods, primKey, obj) { queueUpload(m.dexie, { ...obj, ...mods }); };
    const d = function (primKey, obj) { queueDelete(m.dexie, obj || _rowFromKey(m.dexie, primKey)); };
    store.hook('creating', c);
    store.hook('updating', u);
    store.hook('deleting', d);
    handlers.creating[m.dexie] = c;
    handlers.updating[m.dexie] = u;
    handlers.deleting[m.dexie] = d;
  }
  _hooks = handlers;
  return handlers;
}

export function detachHooks(db, handlers = _hooks) {
  if (!db || !handlers) return;
  for (const m of TABLE_MAP) {
    const store = db[m.dexie];
    if (!store?.hook) continue;
    const c = handlers.creating?.[m.dexie];
    const u = handlers.updating?.[m.dexie];
    const d = handlers.deleting?.[m.dexie];
    try { if (c) store.hook('creating').unsubscribe(c); } catch {}
    try { if (u) store.hook('updating').unsubscribe(u); } catch {}
    try { if (d) store.hook('deleting').unsubscribe(d); } catch {}
  }
  if (handlers === _hooks) _hooks = null;
}

/** primKey (Dexie deleting hook 인자) 로 minimal row 재구성 — pkKeyForRow 가 PK 만 사용. */
function _rowFromKey(dexieName, primKey) {
  if (dexieName === 'prs') {
    const arr = Array.isArray(primKey) ? primKey : null;
    return arr ? { exerciseId: arr[0], type: arr[1] } : { exerciseId: primKey, type: 'e1rm' };
  }
  if (dexieName === 'weights') return { date: primKey };
  if (dexieName === 'settings') return { key: primKey || 'userSettings' };
  return { id: primKey };
}

/* ───────────────────────────── lifecycle (Wave 11.8.1+11.8.2) ───────────────────────────── */

/**
 * 동기화 시작.
 * 1) ctx 셋업
 * 2) pullAll (race 차단 — attachHooks 전 완료)
 * 3) attachHooks
 *
 * 이미 활성 (_syncActive) 이면 already_active 반환 (중복 호출 방지).
 */
export async function startSync(user) {
  if (!user?.id) return { ok: false, reason: 'no_user' };
  if (typeof window === 'undefined' || !window.gymDB) {
    console.warn('[sync] window.gymDB 없음 — startSync 무시');
    return { ok: false, reason: 'no_db' };
  }
  if (_syncActive) {
    return { ok: true, reason: 'already_active' };
  }
  _syncActive = true;
  _ctx = { db: window.gymDB, userId: user.id };
  // 1) pull 먼저 — pull 의 bulkPut 이 hook 발화 시 다운로드 row 가 다시 push 큐로 들어가는 race 차단.
  const result = await pullAll(_ctx.db, _ctx.userId);
  if (!result.ok) {
    console.warn('[sync] pullAll 부분 실패', result);
  }
  // 2) hook attach — 이후 사용자 쓰기는 큐 → 디바운스 → push.
  attachHooks(_ctx.db);
  return result;
}

/**
 * 동기화 정리. async — detach → pending flush → ctx 비움.
 *  - hooks 먼저 떼고 flush — flush 중 새 hook 발화로 큐 추가되는 것 방지.
 *  - flush 가 ctx 가 비어있으면 큐 보존 (stopSync → 즉시 startSync race 시 데이터 유실 0).
 */
export async function stopSync() {
  if (!_syncActive) return { ok: true, status: 'inactive' };
  _syncActive = false;
  if (_ctx?.db && _hooks) {
    detachHooks(_ctx.db, _hooks);
  }
  // 마지막 pending 큐 flush (ctx 아직 살아있는 상태에서). delete-only 큐도 포함.
  if (_pendingUploads.size > 0 || _pendingDeletes.size > 0) {
    try { await flushPendingUploads(); } catch (e) { console.error('[sync] stop flush', e); }
  }
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
  _ctx = null;
  return { ok: true, status: 'stopped' };
}

/** 현재 sync 활성 여부 (UI 표시용 — 다음 Wave). */
export function isSyncActive() {
  return _syncActive;
}

export const Sync = {
  TABLE_MAP,
  DEBOUNCE_MS,
  findMapping,
  resolveConflict,
  getServerCount,
  clearServerCounts,
  pullTable,
  pullAll,
  pushTable,
  pushAll,
  queueUpload,
  queueDelete,
  flushPendingUploads,
  deleteTable,
  deleteAll,
  attachHooks,
  detachHooks,
  startSync,
  stopSync,
  isSyncActive,
};

if (typeof window !== 'undefined') {
  window.gymSync = Sync;
}

export default Sync;
