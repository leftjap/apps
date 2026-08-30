/**
 * 동기화 어댑터 (Wave 11.13.1 다운로드 · 11.13.2 업로드 · spec §4 동기화 전략).
 *
 * 책임:
 *  - Supabase ↔ Dexie 양방향 동기화 (pull + push).
 *  - 단순 1:1 매핑 4 테이블: review_queue / today_lessons / session_logs / pronunciation_log.
 *  - 업로드: Dexie creating/updating hook → 3초 debounce 큐 → Supabase upsert.
 *  - flushPendingUploads: 세션 완료 시 즉시 flush (spec §4 line 187).
 *  - signOut 시 hook 해제 + 잔여 큐 flush.
 *
 * 다음 Wave 보강:
 *  - 11.13.3: 충돌 해결 (No 우선·nextReview 먼 것 우선) + 급감 차단
 *  - 11.13.x: daily_stats / user_meta 매핑 정정
 *    - daily_stats: Dexie PK=date / Supabase PK=id ('date_lang_userId') — Dexie 스키마 검토 필요
 *    - user_meta: Dexie 의 key-value (meta) ↔ Supabase 의 4 컬럼 (lang_en/lang_ja/weak_phonemes_en/weak_phonemes_ja) — 변환 매퍼 필요
 *
 * 안전장치:
 *  - supabase 미설정 / db 없음 / user 없음 → no-op + 사유 반환.
 *  - pullAll/pushAll 부분 실패 시 로컬 데이터 보존 (실패 결과만 보고).
 *  - user_id 자동 주입 (Dexie 스키마엔 없지만 Supabase RLS 매칭용).
 */
import { supabase } from '../services/supabase.js';
import { recordSyncResult, readSyncHealth } from '../services/syncHealth.js';

// ============================================================
// Wave 11.20 — 단순 4 테이블 camelCase ↔ snake_case 변환 함수
// 0001_study_init.sql 의 컬럼명 = sink, mocks/session.html 의 row 형식 = source.
// dailyStats / userMeta 의 Wave 11.13.x 패턴 답습. user_id 자동 주입.
// created_at / updated_at 은 SQL default + trigger 자동 갱신 → push 시 무시.
// ============================================================

/**
 * reviewQueue (mocks/session.html L1397-1404 + L1382-1389) ↔ study_review_queue (0001 L30-45).
 */
export function reviewQueueDexieToSupabase(row, userId) {
  if (!row || !userId) return null;
  return {
    id: row.id,
    user_id: userId,
    lang: row.lang,
    sentence: row.sentence,
    meaning: row.meaning,
    reading: row.reading ?? null,
    explanation: row.explanation ?? null,
    interval: row.interval ?? 1,
    next_review: row.nextReview,
    consecutive_pass: row.consecutivePass ?? 0,
    last_result: row.lastResult ?? null,
    category: row.category ?? null,
    speaker: row.speaker ?? null,
  };
}
export function reviewQueueSupabaseToDexie(row) {
  if (!row) return null;
  const speaker = row.speaker ?? row.explanation?.speaker ?? null;
  return {
    id: row.id,
    lang: row.lang,
    sentence: row.sentence,
    meaning: row.meaning,
    reading: row.reading ?? null,
    explanation: row.explanation ?? null,
    interval: row.interval ?? 1,
    nextReview: row.next_review,
    consecutivePass: row.consecutive_pass ?? 0,
    lastResult: row.last_result ?? null,
    category: row.category ?? null,
    speaker,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * todayLessons (mocks/session.html L1406 update) ↔ study_today_lessons (0001 L68-82).
 * SQL 에 `completed_at` 컬럼 부재 → Dexie 의 `completedAt` 은 push 시 무시.
 */
export function todayLessonsDexieToSupabase(row, userId) {
  if (!row || !userId) return null;
  return {
    id: row.id,
    user_id: userId,
    lang: row.lang,
    date: row.date,
    sentence: row.sentence,
    meaning: row.meaning,
    reading: row.reading ?? null,
    explanation: row.explanation ?? {},
    // snake_case 우선 + 레거시 camelCase 폴백 (2026-06-10 픽스 전 pull 이 만든 기기 잔존 행 보호)
    phonetic_kr: row.phonetic_kr ?? row.phoneticKr ?? null,
    audio_url: row.audioUrl ?? null,
    completed: row.completed ?? false,
    order_index: row.order_index ?? row.orderIndex ?? null,
    speaker: row.speaker ?? null,
  };
}
export function todayLessonsSupabaseToDexie(row) {
  if (!row) return null;
  // speaker: root 컬럼 우선, fallback explanation.speaker (en 가이드 §6.2 — speaker 는 explanation jsonb 안에 박혀 옴)
  const speaker = row.speaker ?? row.explanation?.speaker ?? null;
  return {
    id: row.id,
    lang: row.lang,
    date: row.date,
    sentence: row.sentence,
    meaning: row.meaning,
    reading: row.reading ?? null,
    explanation: row.explanation ?? {},
    // UI 리더 (pickCardFields·loadNewCards 정렬) 와 동일 키 — camelCase 산출 시 발음 공란·정렬 깨짐
    // (2026-06-10 실기기 확인: pull 행이 phoneticKr/orderIndex 로 저장돼 발음·순서 유실)
    phonetic_kr: row.phonetic_kr ?? null,
    audioUrl: row.audio_url ?? null,
    completed: row.completed ?? false,
    order_index: row.order_index ?? null,
    speaker,
    createdAt: row.created_at ?? null,
  };
}

/**
 * sessionLogs (mocks/session.html L1355-1363) ↔ study_session_logs (0001 L98-112).
 * sentence_ids text[] — JS 배열 그대로 (supabase-js 자동 직렬화).
 */
export function sessionLogsDexieToSupabase(row, userId) {
  if (!row || !userId) return null;
  return {
    id: row.id,
    user_id: userId,
    lang: row.lang,
    date: row.date,
    category: row.category ?? null,
    duration_sec: row.durationSec ?? null,
    new_count: row.newCount ?? 0,
    review_results: row.reviewResults ?? null,
    utterance_count: row.utteranceCount ?? 0,
    pass_count: row.passCount ?? 0,
    sentence_ids: Array.isArray(row.sentenceIds) ? row.sentenceIds : null,
    new_sentence_ids: Array.isArray(row.newSentenceIds) ? row.newSentenceIds : null,
    session_type: row.sessionType ?? null,
  };
}
export function sessionLogsSupabaseToDexie(row) {
  if (!row) return null;
  return {
    id: row.id,
    lang: row.lang,
    date: row.date,
    category: row.category ?? null,
    durationSec: row.duration_sec ?? null,
    newCount: row.new_count ?? 0,
    reviewResults: row.review_results ?? null,
    utteranceCount: row.utterance_count ?? 0,
    passCount: row.pass_count ?? 0,
    sentenceIds: Array.isArray(row.sentence_ids) ? row.sentence_ids : null,
    newSentenceIds: Array.isArray(row.new_sentence_ids) ? row.new_sentence_ids : null,
    sessionType: row.session_type ?? null,
    createdAt: row.created_at ?? null,
  };
}

/**
 * pronunciationLog (mocks/session.html L1136-1145) ↔ study_pronunciation_log (0001 L153-164).
 */
export function pronunciationLogDexieToSupabase(row, userId) {
  if (!row || !userId) return null;
  return {
    id: row.id,
    user_id: userId,
    lang: row.lang,
    sentence_id: row.sentenceId ?? null,
    date: row.date,
    overall_score: row.overallScore ?? null,
    // 2026-08-23 — Azure 세부 점수. 종전엔 매핑에 없어 업로드에서 버려졌고(기기 로컬 전용),
    // 유창성 추이를 산출할 데이터가 클라우드에 0건이었다 (0007 마이그레이션으로 컬럼 추가).
    pron_score: row.pronScore ?? null,
    fluency_score: row.fluencyScore ?? null,
    completeness_score: row.completenessScore ?? null,
    prosody_score: row.prosodyScore ?? null,
    capture_rms: row.captureRms ?? null,
    phoneme_scores: row.phonemeScores ?? null,
    weak_phonemes: row.weakPhonemes ?? null,
    recognized_text: row.recognizedText ?? null,
  };
}
export function pronunciationLogSupabaseToDexie(row) {
  if (!row) return null;
  return {
    id: row.id,
    lang: row.lang,
    sentenceId: row.sentence_id ?? null,
    date: row.date,
    overallScore: row.overall_score ?? null,
    pronScore: row.pron_score ?? null,
    fluencyScore: row.fluency_score ?? null,
    completenessScore: row.completeness_score ?? null,
    prosodyScore: row.prosody_score ?? null,
    captureRms: row.capture_rms ?? null,
    phonemeScores: row.phoneme_scores ?? null,
    weakPhonemes: row.weak_phonemes ?? null,
    recognizedText: row.recognized_text ?? null,
    createdAt: row.created_at ?? null,
  };
}

/**
 * mathProblems ↔ study_math_problems (0005_study_math.sql).
 */
export function mathProblemsDexieToSupabase(row, userId) {
  if (!row || !userId) return null;
  return {
    id: row.id, user_id: userId, date: row.date ?? null,
    module: row.module ?? null, tag: row.tag ?? null, lesson: row.lesson ?? null,
    prompt: row.prompt, figure: row.figure ?? null, answer: row.answer,
    accept: row.accept ?? null, solution: row.solution ?? {},
    concept_id: row.conceptId ?? null, kind: row.kind ?? 'apply',
    order_index: row.orderIndex ?? null, completed: row.completed ?? false,
  };
}
export function mathProblemsSupabaseToDexie(row) {
  if (!row) return null;
  return {
    id: row.id, date: row.date ?? null, module: row.module ?? null,
    tag: row.tag ?? null, lesson: row.lesson ?? null, prompt: row.prompt,
    figure: row.figure ?? null, answer: row.answer, accept: row.accept ?? null,
    solution: row.solution ?? {}, conceptId: row.concept_id ?? null, kind: row.kind ?? 'apply',
    orderIndex: row.order_index ?? null,
    completed: row.completed ?? false, createdAt: row.created_at ?? null,
  };
}

/**
 * mathQueue ↔ study_math_queue (SRS).
 */
export function mathQueueDexieToSupabase(row, userId) {
  if (!row || !userId) return null;
  return {
    id: row.id, user_id: userId, module: row.module ?? null, tag: row.tag ?? null,
    prompt: row.prompt, figure: row.figure ?? null, answer: row.answer,
    accept: row.accept ?? null, solution: row.solution ?? null,
    interval: row.interval ?? 1, next_review: row.nextReview, last_result: row.lastResult ?? null,
  };
}
export function mathQueueSupabaseToDexie(row) {
  if (!row) return null;
  return {
    id: row.id, module: row.module ?? null, tag: row.tag ?? null, prompt: row.prompt,
    figure: row.figure ?? null, answer: row.answer, accept: row.accept ?? null,
    solution: row.solution ?? null, interval: row.interval ?? 1,
    nextReview: row.next_review, lastResult: row.last_result ?? null,
    createdAt: row.created_at ?? null, updatedAt: row.updated_at ?? null,
  };
}

/**
 * Dexie ↔ Supabase 단순 1:1 매핑 테이블.
 * dexie 스토어 이름 = createStudyDB 의 키. supabase 테이블 = `study_` 접두사.
 * Wave 11.20 — toSupabase / toDexie 변환 함수 reference 추가.
 */
export const TABLE_MAP = Object.freeze([
  Object.freeze({
    dexie: 'reviewQueue',
    supabase: 'study_review_queue',
    toSupabase: reviewQueueDexieToSupabase,
    toDexie: reviewQueueSupabaseToDexie,
  }),
  Object.freeze({
    dexie: 'todayLessons',
    supabase: 'study_today_lessons',
    toSupabase: todayLessonsDexieToSupabase,
    toDexie: todayLessonsSupabaseToDexie,
    serverOwned: true, // 서버 시드, 기기는 완료만 → 서버 삭제 전파 대상 (staleIdsToDelete)
  }),
  Object.freeze({
    dexie: 'sessionLogs',
    supabase: 'study_session_logs',
    toSupabase: sessionLogsDexieToSupabase,
    toDexie: sessionLogsSupabaseToDexie,
  }),
  Object.freeze({
    dexie: 'pronunciationLog',
    supabase: 'study_pronunciation_log',
    toSupabase: pronunciationLogDexieToSupabase,
    toDexie: pronunciationLogSupabaseToDexie,
  }),
  Object.freeze({
    dexie: 'mathProblems',
    supabase: 'study_math_problems',
    toSupabase: mathProblemsDexieToSupabase,
    toDexie: mathProblemsSupabaseToDexie,
    serverOwned: true, // 서버 시드 → 서버 삭제 전파 대상
  }),
  Object.freeze({
    dexie: 'mathQueue',
    supabase: 'study_math_queue',
    toSupabase: mathQueueDexieToSupabase,
    toDexie: mathQueueSupabaseToDexie,
  }),
]);

/**
 * 급감 가드(pushTable:577 — 서버 0행 + 로컬 있음 → 영구 blocked) 를 우회해야 하는
 * '기기가 쓰는' 테이블. startSync 끝에서 누락 행만 직접 upsert 한다.
 *
 * serverOwned(todayLessons / mathProblems) 는 서버 시드라 기기가 되밀면 안 되므로 제외.
 * 2026-08-25 — mathQueue 누락으로 수학 SRS 가 Dexie 에만 갇혀 있었다. 앱이 쓰는 테이블을
 * 추가할 때 여기 빠뜨리면 같은 일이 반복되므로, sync.test.js 가 TABLE_MAP 과 대조해 고정한다.
 */
export const DEVICE_WRITTEN_TABLES = Object.freeze(
  TABLE_MAP.filter((m) => !m.serverOwned).map((m) => m.dexie),
);

let _syncActive = false;

/** 업로드 디바운스 (spec §4 line 188 — 3초 배치 저장). */
export const DEBOUNCE_MS = 3000;

/** Dexie hook → queueUpload 가 채우는 변경 id 큐. dexieName → Set<id>. */
const _pendingUploads = new Map();
let _flushTimer = null;

// ============================================================
// 아웃박스 내구성 (2026-07-15 데이터 유실 감사)
//
// spec §4 (line 223-224) 는 "디바운스 저장 (3초 배치)" 를 "세션 완료 시 즉시 동기화" 와 한 쌍으로
// 설계했는데 후자가 미구현이었다 (flushPendingUploads 호출자가 debounce 타이머와 stopSync 뿐).
// 게다가 _pendingUploads 가 in-memory 라 debounce 창(마지막 쓰기 후 3초 무활동)에서 탭이 죽으면
// tail 이 증발했고, flush 는 await 이전에 큐를 clear 해서 push 실패 시 id 가 영구 소실됐다.
//
// → pending id 집합을 localStorage 에 '동기적으로' 기록한다. IndexedDB 는 비동기라 탭 종료 직전
//   커밋이 보장되지 않아 이 목적(죽는 순간의 목록 보존)에 부적합. 행 데이터 자체는 Dexie 에 이미
//   있으므로 아웃박스는 'id 목록' 만 들고 있으면 된다 (유령 id 는 push 시 bulkGet undefined 로 탈락).
// ============================================================

/** 아웃박스 localStorage 키 prefix. 사용자별 분리. */
const OUTBOX_PREFIX = 'study.syncOutbox.';
let _outboxKey = null;

/** serverOwned 테이블 (서버 시드 → 삭제 전파 대상). pull 이후에만 push 해야 유령 행 부활이 없다. */
const SERVER_OWNED = new Set(TABLE_MAP.filter((m) => m.serverOwned).map((m) => m.dexie));

/** localStorage 접근 (private mode/차단 환경·node 테스트에서 throw → null). */
function outboxStore() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 디스크 아웃박스 읽기. `{ [dexieName]: id[] }`. */
function readOutbox() {
  const ls = outboxStore();
  if (!ls || !_outboxKey) return {};
  try {
    const parsed = JSON.parse(ls.getItem(_outboxKey) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 디스크 아웃박스 갱신.
 *  - drained: 이번 flush 가 서버에 올린(또는 로컬에서 사라진) id — 디스크에서 제거.
 *  - 나머지는 현재 in-memory 큐를 union (다른 탭이 적어둔 항목을 덮어쓰지 않도록 read-merge-write).
 */
function persistOutbox(drained = null) {
  const ls = outboxStore();
  if (!ls || !_outboxKey) return;
  const disk = readOutbox();
  if (drained) {
    for (const [table, ids] of drained) {
      const keep = (disk[table] || []).filter((id) => !ids.has(id));
      if (keep.length) disk[table] = keep;
      else delete disk[table];
    }
  }
  for (const [table, set] of _pendingUploads) {
    if (!set.size) continue;
    disk[table] = Array.from(new Set([...(disk[table] || []), ...set]));
  }
  try {
    if (Object.keys(disk).length === 0) ls.removeItem(_outboxKey);
    else ls.setItem(_outboxKey, JSON.stringify(disk));
  } catch (e) {
    console.warn('[sync] 아웃박스 영속 실패', e?.message || e);
  }
}

/** 디스크 아웃박스 → in-memory 큐 병합. 새 탭 부팅 시 이전 세션의 미푸시 tail 회복. */
function restoreOutbox() {
  for (const [table, ids] of Object.entries(readOutbox())) {
    if (!Array.isArray(ids) || ids.length === 0) continue;
    if (!_pendingUploads.has(table)) _pendingUploads.set(table, new Set());
    const set = _pendingUploads.get(table);
    for (const id of ids) set.add(id);
  }
}

/** startSync 가 잡고 stopSync 가 비우는 push 컨텍스트. */
let _currentDB = null;
let _currentUserId = null;
/** attachHooks 가 등록한 listener 핸들. detachHooks 에서 unsubscribe 용. */
let _hookHandlers = null;

/**
 * 급감 차단 (Wave 11.13.3 · spec §4 line 189).
 * pullAll 결과의 status='ok'/'empty' 인 테이블만 마킹 → pushTable 시 비교.
 * dexieName → server count (0 일 때 push 차단).
 */
const _serverCounts = new Map();

/**
 * 충돌 해결 (Wave 11.13.3 · spec §4 line 186 · reviewQueue 한정).
 *
 * 우선 순위:
 *  1) "No"(실패) 우선 — `lastResult === 'X'` (mocks/session.html L1388 직접 인용 기준).
 *     - 'O' (got) / '△' (hmm) / 'X' (no) / null (신규 카드, L1402)
 *  2) 가장 먼 nextReview 우선 — 'YYYY-MM-DD' ISO 문자열 lexical compare 정합.
 *  3) 동률 — server 우선 (push 결과 일관성).
 *
 * 다른 3 테이블 (session_logs / today_lessons / pronunciation_log) 은 append-only
 * 또는 1회 update (completedAt 등) — 단순 last-write-wins OK (호출 안 함).
 */
/* 로컬 전용 필드 이월 (2026-07-28) — lastResultAt(문장 모아보기 '오늘 평가' 가라앉힘)은 서버
 * 컬럼이 없어 resolveConflict 가 서버 행을 택하면 소실된다(행 통째 택일 — 필드 병합 아님).
 * push 후엔 lastResult·nextReview 가 동률이라 대부분 서버가 이김 → pull 에서 이월해 같은 날
 * 재방문 가라앉힘을 보존한다. 선택된 행이 이미 갖고 있으면(로컬 승) 그대로. */
export function preserveLocalOnlyFields(local, chosen) {
  if (local?.lastResultAt && !chosen?.lastResultAt) return { ...chosen, lastResultAt: local.lastResultAt };
  return chosen;
}

export function resolveConflict(local, server) {
  if (!local) return server;
  if (!server) return local;
  const localFail = local.lastResult === 'X';
  const serverFail = server.lastResult === 'X';
  if (localFail && !serverFail) return local;
  if (serverFail && !localFail) return server;
  const localNext = local.nextReview || '';
  const serverNext = server.nextReview || '';
  if (localNext > serverNext) return local;
  if (serverNext > localNext) return server;
  return server;
}

/**
 * 한 테이블 다운로드. Supabase 에서 `user_id` 필터로 select → Dexie `bulkPut` (id 기반 upsert).
 * Dexie 스키마에 없는 필드 (user_id 등) 는 자동 무시되므로 변환 없이 그대로 put.
 *
 * Wave 11.13.3 — reviewQueue 만 bulkGet → resolveConflict 후 bulkPut.
 */
/**
 * 서버 삭제 전파 (2026-06-29): 서버-소유 테이블의 서버 id 집합에 없는 로컬 id 반환.
 * 배경: pullTable 이 bulkPut 만 해서 서버에서 삭제된 카드가 Dexie 에 영구 잔존 →
 * 실험·구 시드가 기기에 유령으로 남아 FIFO 최상단 노출(2026-06-29 결함 토론회 잔존 사고).
 * serverOwned(today_lessons/math_problems) 에만: 기기는 완료만 하고 생성 안 함 → 서버에 없으면 삭제된 것.
 * session_logs/reviewQueue 등 기기-작성 테이블엔 미적용(미푸시 데이터 보호). 'ok'(서버≥1행) pull 에서만.
 */
export function staleIdsToDelete(serverIds, localIds) {
  return (localIds || []).filter((id) => !serverIds.has(id));
}

// Supabase REST 기본 행 상한. pull 이 이 수에 닿으면 페이지가 잘렸을 수 있어(전체 서버 id 미확보)
// 삭제 전파 시 1000행 밖 정상 카드를 stale 로 오삭제할 위험 → 상한 도달 시 삭제 보류(2026-06-29).
export const PULL_PAGE_LIMIT = 1000;

/* 상한 도달 시 전체 재조회 (2026-08-29) — 단발 .eq() 조회는 REST 상한(PULL_PAGE_LIMIT)에서 잘린다.
 * 잘림이 감지된 경우에만 정렬(.order('id'))+range 로 전량을 다시 읽는다. 정렬 없는 첫 페이지와
 * 정렬 페이지를 섞으면 누락·중복이 생기므로 재조회는 처음부터 다시 한다.
 * 반환: { data, error, complete } — complete=false 면 잘렸을 수 있는 부분 데이터(폴백). */
async function fetchAllRows(table, userId, columns) {
  const first = await supabase.from(table).select(columns).eq('user_id', userId);
  if (first.error) return { data: null, error: first.error, complete: false };
  const firstData = first.data || [];
  if (firstData.length < PULL_PAGE_LIMIT) return { data: firstData, error: null, complete: true };
  const all = [];
  for (let from = 0; ; from += PULL_PAGE_LIMIT) {
    const page = await supabase.from(table).select(columns).eq('user_id', userId)
      .order('id', { ascending: true }).range(from, from + PULL_PAGE_LIMIT - 1);
    if (page.error) {
      console.warn(`[sync] fetchAllRows ${table} 페이지 ${from} 실패 — 첫 페이지 부분 데이터로 폴백`, page.error);
      return { data: firstData, error: null, complete: false };
    }
    all.push(...(page.data || []));
    if (!page.data || page.data.length < PULL_PAGE_LIMIT) break;
  }
  return { data: all, error: null, complete: true };
}

export async function pullTable(mapping, db, userId) {
  if (!supabase) return { table: mapping.dexie, status: 'skipped', reason: 'no_supabase' };
  if (!db) return { table: mapping.dexie, status: 'skipped', reason: 'no_db' };
  if (!userId) return { table: mapping.dexie, status: 'skipped', reason: 'no_user' };
  try {
    const { data, error, complete } = await fetchAllRows(mapping.supabase, userId, '*');
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
    // Wave 11.20 — snake_case → camelCase 변환 (mapping.toDexie). 변환 실패 row 제외.
    const transformed = typeof mapping.toDexie === 'function'
      ? data.map(mapping.toDexie).filter(Boolean)
      : data;
    // soft-delete 1단계 (2026-07-22, 백로그 1순위 착수) — reviewQueue: 서버 행 explanation._deleted=true
    // 는 '삭제'다. 저장하지 않고 로컬에서 지운다. pushTable 이 upsert-only 라 서버만 지우면 기기가
    // 되살리던 결함(pos-test 유령)의 전파 관문. 컬럼(deleted_at) DDL 적용 수단이 없어 JSONB 플래그 —
    // 구버전 앱이 판정을 push 해 덮는 창은 남는다(서버측 가드는 컬럼+트리거 도입 시 후속).
    let rowsToPut = transformed;
    let tombstoned = [];
    if (mapping.dexie === 'reviewQueue') {
      tombstoned = rowsToPut.filter((r) => r?.explanation?._deleted).map((r) => r.id);
      if (tombstoned.length) rowsToPut = rowsToPut.filter((r) => !r?.explanation?._deleted);
    }
    /* pronunciationLog 로컬 전용 필드 보존 (2026-08-29) — prosodyIssues 는 동기화 매핑 밖이라
     * pull 의 bulkPut 이 지워버렸다(매 기동 리셋 — 감점 단가 보정 축적 소실). 서버 값이 정본인
     * 필드는 서버 행 그대로, 로컬 전용 필드만 이월한다. bulkGet 없는 가짜 store(테스트)면 통과. */
    if (mapping.dexie === 'pronunciationLog' && typeof store.bulkGet === 'function') {
      // 로컬 전용 필드 목록 — 감점 단가 보정 원천 (2026-08-29 오후 wordScores·omissions·insertions,
      // 2026-08-31 감점제 전환 표식 accuracyScore·scoreModel 추가)
      const LOCAL_ONLY = ['prosodyIssues', 'wordScores', 'omissions', 'insertions', 'accuracyScore', 'scoreModel'];
      const localRows = await store.bulkGet(rowsToPut.map((r) => r.id));
      rowsToPut = rowsToPut.map((serverRow, i) => {
        const local = localRows[i];
        if (!local) return serverRow;
        const carry = LOCAL_ONLY.filter((f) => local[f] != null && serverRow[f] == null);
        if (!carry.length) return serverRow;
        const out = { ...serverRow };
        for (const f of carry) out[f] = local[f];
        return out;
      });
    }
    // reviewQueue 만 충돌 해결 (다른 테이블은 단순 bulkPut)
    if (mapping.dexie === 'reviewQueue' && typeof store.bulkGet === 'function') {
      const ids = rowsToPut.map((r) => r.id);
      const localRows = await store.bulkGet(ids);
      rowsToPut = rowsToPut.map((serverRow, i) => preserveLocalOnlyFields(localRows[i], resolveConflict(localRows[i], serverRow)));
    }
    await store.bulkPut(rowsToPut);
    if (tombstoned.length && typeof store.bulkDelete === 'function') {
      await store.bulkDelete(tombstoned);
    }
    // 서버 삭제 전파 (serverOwned 만, 'ok' pull 에서만 — data≥1 확인됨). Dexie store 한정 가드.
    // 페이지네이션 가드: fetchAllRows 가 complete=false 면(페이지 조회 실패 폴백) stale 판정 불가 → 삭제 보류.
    if (mapping.serverOwned && !complete) {
      console.warn(`[sync] pullTable ${mapping.supabase} ${data.length}행(불완전 페이지) — 삭제 전파 보류`);
    } else if (mapping.serverOwned && typeof store.toCollection === 'function' && typeof store.bulkDelete === 'function') {
      try {
        const serverIds = new Set(rowsToPut.map((r) => r.id));
        const localIds = await store.toCollection().primaryKeys();
        const stale = staleIdsToDelete(serverIds, localIds);
        if (stale.length) await store.bulkDelete(stale);
      } catch (e) {
        console.error(`[sync] pullTable ${mapping.supabase} stale 삭제 전파 실패`, e);
      }
    }
    return { table: mapping.dexie, status: 'ok', count: rowsToPut.length };
  } catch (e) {
    console.error(`[sync] pullTable ${mapping.supabase} 예외`, e);
    return { table: mapping.dexie, status: 'error', error: e };
  }
}

/**
 * 4 테이블 동시 다운로드. `Promise.all` 부분 실패 시 로컬 데이터 보존.
 * 반환: `{ ok, results, failed }`.
 */
export async function pullAll(db, userId) {
  if (!supabase) return { ok: false, reason: 'no_supabase', results: [], failed: 0 };
  if (!db || !userId) return { ok: false, reason: 'preconditions', results: [], failed: 0 };
  // 4 테이블 + dailyStats + user_meta + pr_records (Wave 11.68-a).
  // user_meta / pr_records 는 maybeSingle 1 row → N dexie rows 분해.
  const [tableResults, statsResult, metaResult, prResult] = await Promise.all([
    Promise.all(TABLE_MAP.map((m) => pullTable(m, db, userId))),
    pullDailyStats(db, userId),
    pullUserMeta(db, userId),
    pullPrRecords(db, userId),
  ]);
  const results = [...tableResults, statsResult, metaResult, prResult];
  const failed = results.filter((r) => r.status === 'error').length;
  // Wave 11.13.3 — 급감 차단을 위해 server count 마킹 (성공·empty 만, error 는 모름 → 마킹 X)
  for (const r of results) {
    if (r.status === 'ok') _serverCounts.set(r.table, r.count ?? 0);
    else if (r.status === 'empty') _serverCounts.set(r.table, 0);
  }
  return { ok: failed === 0, results, failed };
}

/**
 * 한 테이블 업로드. Dexie 에서 ids 를 bulkGet → user_id 주입 → Supabase upsert (id PK 기반).
 * ids=null/[] 이면 전체 push (시드 등 1회 보강 시나리오 — 일반 hook 경로에선 사용 안 함).
 * Dexie 스키마엔 user_id 가 없으나 RLS 매칭을 위해 row 마다 자동 주입 (sync.js 다운로드 경로의 역).
 *
 * 반환: `{ table, status, count?, reason?, error? }`.
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
      // bulkGet 은 missing key 에 undefined 반환 (Dexie 4) — 그 사이 삭제된 row 제외.
      rows = got.filter(Boolean);
    } else if (ids === null) {
      rows = await store.toArray();
    } else {
      // ids === [] : push 대상 없음 (정상)
      return { table: mapping.dexie, status: 'empty', count: 0 };
    }
    if (!rows || rows.length === 0) {
      return { table: mapping.dexie, status: 'empty', count: 0 };
    }
    // Wave 11.13.3 — 급감 차단 (spec §4 line 189): 서버 count 마킹된 0 + 로컬 row > 0 → 차단.
    // 마킹 없음 (첫 startSync 전 또는 allowEmptyServerPush 후) 은 차단 안 함.
    if (_serverCounts.has(mapping.dexie) && _serverCounts.get(mapping.dexie) === 0 && rows.length > 0) {
      return {
        table: mapping.dexie,
        status: 'blocked',
        reason: 'server_empty_local_nonempty',
        count: rows.length,
      };
    }
    // Wave 11.20 — camelCase → snake_case 변환 (mapping.toSupabase). user_id 자동 주입.
    // toSupabase 함수가 user_id 포함 → 별도 ...spread 불필요. 변환 실패 row 제외.
    const transformed = typeof mapping.toSupabase === 'function'
      ? rows.map((r) => mapping.toSupabase(r, userId)).filter(Boolean)
      : rows.map((r) => ({ ...r, user_id: userId }));
    const { error } = await supabase
      .from(mapping.supabase)
      .upsert(transformed, { onConflict: 'id' });
    if (error) {
      console.error(`[sync] pushTable ${mapping.supabase} 실패`, error);
      return { table: mapping.dexie, status: 'error', error };
    }
    return { table: mapping.dexie, status: 'ok', count: transformed.length };
  } catch (e) {
    console.error(`[sync] pushTable ${mapping.supabase} 예외`, e);
    return { table: mapping.dexie, status: 'error', error: e };
  }
}

/**
 * 4 테이블 동시 업로드. byTable: `Map<dexieName, Set<id>>` — 없으면 전체 push (4 테이블 toArray).
 * 일반 경로 (hook → queueUpload → flushPendingUploads) 는 byTable 로 변경된 id 만 push.
 * Promise.all 부분 실패 허용 (다른 테이블 보존).
 *
 * 반환: `{ ok, results, failed, reason? }`.
 */
export async function pushAll(db, userId, byTable = null) {
  if (!supabase) return { ok: false, reason: 'no_supabase', results: [], failed: 0 };
  if (!db || !userId) return { ok: false, reason: 'preconditions', results: [], failed: 0 };
  const results = await Promise.all(
    TABLE_MAP.map((m) => {
      if (byTable) {
        const idsSet = byTable.get(m.dexie);
        const ids = idsSet ? Array.from(idsSet) : [];
        return pushTable(m, db, userId, ids);
      }
      return pushTable(m, db, userId, null);
    }),
  );
  const failed = results.filter((r) => r.status === 'error').length;
  return { ok: failed === 0, results, failed };
}

// ============================================================
// Wave 11.13.x — dailyStats 매핑 (PK 차이 + camelCase↔snake_case)
// 0001_study_init.sql L128-137: PK=id text ('<date>_<lang>_<userId>')
// schema.js L25: Dexie PK=date (단일 lang/day 전제 — spec L10)
// ============================================================

/**
 * Dexie dailyStats row → Supabase study_daily_stats row 변환.
 * input 예 (mocks/session.html L1375-1379 인용 패턴):
 *   { date: '2026-04-30', lang: 'en', utteranceCount, studyTimeSec, newSentences, reviewCount }
 * output 예: { id: '<date>_<lang>_<userId>', user_id, date, lang, utterance_count, ... }
 */
export function dailyStatsDexieToSupabase(row, userId) {
  if (!row || !userId) return null;
  return {
    id: `${row.date}_${row.lang}_${userId}`,
    user_id: userId,
    date: row.date,
    lang: row.lang,
    utterance_count: row.utteranceCount ?? 0,
    study_time_sec: row.studyTimeSec ?? 0,
    new_sentences: row.newSentences ?? 0,
    review_count: row.reviewCount ?? 0,
  };
}

/** Supabase row → Dexie row. id 제거 + snake_case → camelCase. */
export function dailyStatsSupabaseToDexie(row) {
  if (!row) return null;
  return {
    date: row.date,
    lang: row.lang,
    utteranceCount: row.utterance_count ?? 0,
    studyTimeSec: row.study_time_sec ?? 0,
    newSentences: row.new_sentences ?? 0,
    reviewCount: row.review_count ?? 0,
  };
}

/**
 * dailyStats 다운로드. select * → 변환 → bulkPut.
 * Dexie PK=date → 같은 date 의 다른 lang row 가 있으면 마지막만 살아남음 (spec L10 단일 lang/day 전제).
 */
export async function pullDailyStats(db, userId) {
  if (!supabase) return { table: 'dailyStats', status: 'skipped', reason: 'no_supabase' };
  if (!db) return { table: 'dailyStats', status: 'skipped', reason: 'no_db' };
  if (!userId) return { table: 'dailyStats', status: 'skipped', reason: 'no_user' };
  try {
    const { data, error } = await supabase
      .from('study_daily_stats')
      .select('*')
      .eq('user_id', userId);
    if (error) {
      console.error('[sync] pullDailyStats 실패', error);
      return { table: 'dailyStats', status: 'error', error };
    }
    if (!data || data.length === 0) {
      return { table: 'dailyStats', status: 'empty', count: 0 };
    }
    const store = db.dailyStats;
    if (!store?.bulkPut) {
      return { table: 'dailyStats', status: 'error', reason: 'no_store' };
    }
    const rows = data.map(dailyStatsSupabaseToDexie).filter(Boolean);
    await store.bulkPut(rows);
    return { table: 'dailyStats', status: 'ok', count: rows.length };
  } catch (e) {
    console.error('[sync] pullDailyStats 예외', e);
    return { table: 'dailyStats', status: 'error', error: e };
  }
}

/**
 * dailyStats 업로드. Dexie 의 모든 row 또는 지정 dates 만 push.
 * dates=null → 전체 toArray. dates=[] → empty. _serverCounts 급감 차단 적용.
 */
export async function pushDailyStats(db, userId, dates = null) {
  if (!supabase) return { table: 'dailyStats', status: 'skipped', reason: 'no_supabase' };
  if (!db) return { table: 'dailyStats', status: 'skipped', reason: 'no_db' };
  if (!userId) return { table: 'dailyStats', status: 'skipped', reason: 'no_user' };
  try {
    const store = db.dailyStats;
    if (!store) return { table: 'dailyStats', status: 'error', reason: 'no_store' };
    let rows;
    if (Array.isArray(dates) && dates.length > 0) {
      const got = await store.bulkGet(dates);
      rows = got.filter(Boolean);
    } else if (dates === null) {
      rows = await store.toArray();
    } else {
      return { table: 'dailyStats', status: 'empty', count: 0 };
    }
    if (!rows || rows.length === 0) {
      return { table: 'dailyStats', status: 'empty', count: 0 };
    }
    if (
      _serverCounts.has('dailyStats') &&
      _serverCounts.get('dailyStats') === 0 &&
      rows.length > 0
    ) {
      return {
        table: 'dailyStats',
        status: 'blocked',
        reason: 'server_empty_local_nonempty',
        count: rows.length,
      };
    }
    const supabaseRows = rows.map((r) => dailyStatsDexieToSupabase(r, userId)).filter(Boolean);
    const { error } = await supabase
      .from('study_daily_stats')
      .upsert(supabaseRows, { onConflict: 'id' });
    if (error) {
      console.error('[sync] pushDailyStats 실패', error);
      return { table: 'dailyStats', status: 'error', error };
    }
    return { table: 'dailyStats', status: 'ok', count: supabaseRows.length };
  } catch (e) {
    console.error('[sync] pushDailyStats 예외', e);
    return { table: 'dailyStats', status: 'error', error: e };
  }
}

/**
 * 서버에 없는 로컬 dailyStats 행만 재push — 큐 유실(탭 닫힘)·과거 push 실패로
 * 로컬에만 남은 완료 기록(예: 6/19)을 startSync 때 회복한다.
 *  - 덮어쓰기 위험 0: 서버에 같은 id(`${date}_${lang}_${userId}`)가 있으면 절대 push 안 함
 *    (서버가 더 최신인 행을 로컬 값으로 덮을 일 없음 — missing-only).
 *  - server-empty 급감 차단(pushDailyStats 가드)은 그대로 적용.
 */
export async function reconcileDailyStats(db, userId) {
  if (!supabase) return { table: 'dailyStats', status: 'skipped', reason: 'no_supabase' };
  if (!db) return { table: 'dailyStats', status: 'skipped', reason: 'no_db' };
  if (!userId) return { table: 'dailyStats', status: 'skipped', reason: 'no_user' };
  try {
    const store = db.dailyStats;
    if (!store?.toArray) return { table: 'dailyStats', status: 'error', reason: 'no_store' };
    const local = await store.toArray();
    if (!local || local.length === 0) return { table: 'dailyStats', status: 'empty', pushed: 0 };
    const { data, error } = await supabase
      .from('study_daily_stats')
      .select('id')
      .eq('user_id', userId);
    if (error) {
      console.error('[sync] reconcileDailyStats 서버 조회 실패', error);
      return { table: 'dailyStats', status: 'error', error };
    }
    const serverIds = new Set((data || []).map((r) => r.id));
    const missingDates = local
      .filter((r) => r && r.date && r.lang && !serverIds.has(`${r.date}_${r.lang}_${userId}`))
      .map((r) => r.date);
    if (missingDates.length === 0) return { table: 'dailyStats', status: 'ok', pushed: 0, missing: 0 };
    const r = await pushDailyStats(db, userId, missingDates);
    return {
      table: 'dailyStats',
      status: r.status,
      pushed: r.status === 'ok' ? (r.count || 0) : 0,
      missing: missingDates.length,
      pushReason: r.reason,
    };
  } catch (e) {
    console.error('[sync] reconcileDailyStats 예외', e);
    return { table: 'dailyStats', status: 'error', error: e };
  }
}

/**
 * reconcileTable — pull 이 못 가져온 '로컬 전용' 행을 서버에 직접 upsert (급감 가드 우회).
 *
 * 배경(2026-06): 급감 가드(pushTable 의 server_empty_local_nonempty)는 서버 count=0 인 테이블의
 * push 를 차단한다. 해제 장치 allowEmptyServerPush 는 '모든 테이블 empty(신규 유저)' 일 때만 발동 →
 * 일부 테이블엔 서버 데이터가 있으나 sessionLogs/reviewQueue 만 서버-빈 '기존 유저' 는 그 두 테이블이
 * 영구 차단돼 멀티기기(다른 브라우저·iOS 홈화면 PWA)에서 0 으로 보인다. reconcileDailyStats 와 동일
 * 철학으로, 서버에 '이미 있는 id' 를 제외한 누락분만 직접 upsert → 삭제 행 부활·발산 행 덮어쓰기 없이
 * 보강. 첫 보강으로 서버 count>0 이 되면 이후엔 일반 hook push 가 정상 동작. startSync 의 pull 후 호출.
 */
export async function reconcileTable(db, userId, mapping) {
  if (!supabase) return { table: mapping?.dexie, status: 'skipped', reason: 'no_supabase' };
  if (!db || !userId || !mapping) return { table: mapping?.dexie, status: 'skipped', reason: 'preconditions' };
  try {
    const store = db[mapping.dexie];
    if (!store?.toArray) return { table: mapping.dexie, status: 'error', reason: 'no_store' };
    const local = await store.toArray();
    if (!local || local.length === 0) return { table: mapping.dexie, status: 'empty', pushed: 0 };
    const { data, error, complete } = await fetchAllRows(mapping.supabase, userId, 'id');
    if (error) {
      console.error(`[sync] reconcileTable ${mapping.supabase} 서버 조회 실패`, error);
      return { table: mapping.dexie, status: 'error', error };
    }
    if (!complete) {
      // 서버 id 집합이 불완전하면 '누락' 판정이 오판이 된다 — 이미 있는 행을 기동마다 재upsert
      // 하는 영구 루프(실측 재현)를 만드느니 이번 보강을 건너뛴다 (2026-08-29 감사).
      console.warn(`[sync] reconcileTable ${mapping.supabase} 서버 id 불완전(${(data || []).length}) — 보강 보류`);
      return { table: mapping.dexie, status: 'deferred', reason: 'incomplete_server_ids' };
    }
    const serverIds = new Set((data || []).map((r) => r.id));
    const missing = local.filter((r) => r && r.id != null && !serverIds.has(r.id));
    if (missing.length === 0) return { table: mapping.dexie, status: 'ok', pushed: 0, missing: 0 };
    const rows = typeof mapping.toSupabase === 'function'
      ? missing.map((r) => mapping.toSupabase(r, userId)).filter(Boolean)
      : missing.map((r) => ({ ...r, user_id: userId }));
    const { error: upErr } = await supabase.from(mapping.supabase).upsert(rows, { onConflict: 'id' });
    if (upErr) {
      console.error(`[sync] reconcileTable ${mapping.supabase} upsert 실패`, upErr);
      return { table: mapping.dexie, status: 'error', error: upErr };
    }
    // 서버가 더 이상 비어 있지 않다 → 같은 세션의 후속 push 가 급감 가드에 막히지 않도록 마킹 갱신.
    // (갱신 안 하면 아웃박스 항목이 그 세션 내내 blocked 로 재큐잉만 반복된다. 다음 로드의 pullAll 이
    //  어차피 count>0 을 마킹하지만, 한 세션을 통째로 낭비할 이유가 없다.)
    _serverCounts.set(mapping.dexie, serverIds.size + rows.length);
    return { table: mapping.dexie, status: 'ok', pushed: rows.length, missing: missing.length };
  } catch (e) {
    console.error(`[sync] reconcileTable ${mapping?.supabase} 예외`, e);
    return { table: mapping?.dexie, status: 'error', error: e };
  }
}

// ============================================================
// Wave 11.13.x — user_meta 매핑 (1↔4 row 분해/합산)
// 0001_study_init.sql L180-187: PK=user_id, 4 jsonb 컬럼 (lang_en/lang_ja/weak_phonemes_en/weak_phonemes_ja)
// schema.js L27: Dexie meta PK=key (key-value 4 row 패턴)
// ============================================================

/**
 * Dexie meta key ↔ Supabase user_meta column 매핑.
 * Dexie 측 명명은 mocks 코드 기준 (mocks/session.html L1419: 'weakPhonemes_en' camelCase).
 * 다른 keys (studySettings / activeSession 등) 는 sync 대상 외 (Supabase 컬럼 없음).
 */
export const USER_META_KEY_MAP = Object.freeze([
  Object.freeze({ dexieKey: 'lang_en', supabaseCol: 'lang_en' }),
  Object.freeze({ dexieKey: 'lang_ja', supabaseCol: 'lang_ja' }),
  Object.freeze({ dexieKey: 'weakPhonemes_en', supabaseCol: 'weak_phonemes_en' }),
  Object.freeze({ dexieKey: 'weakPhonemes_ja', supabaseCol: 'weak_phonemes_ja' }),
]);

/**
 * Dexie 4 rows (key-value) → Supabase 1 row (4 jsonb 컬럼) 합산.
 * USER_META_KEY_MAP 의 4 keys 만 추출. 누락된 key 는 null.
 */
export function userMetaDexieToSupabase(rows, userId) {
  if (!userId) return null;
  const out = { user_id: userId };
  const map = new Map((rows || []).map((r) => [r?.key, r?.value]));
  for (const m of USER_META_KEY_MAP) {
    out[m.supabaseCol] = map.has(m.dexieKey) ? map.get(m.dexieKey) ?? null : null;
  }
  return out;
}

/** Supabase 1 row → Dexie 4 rows. value null/undefined 컬럼은 row 생성 안 함. */
export function userMetaSupabaseToDexie(row) {
  if (!row) return [];
  const now = Date.now();
  const result = [];
  for (const m of USER_META_KEY_MAP) {
    const value = row[m.supabaseCol];
    if (value !== null && value !== undefined) {
      result.push({ key: m.dexieKey, value, at: now });
    }
  }
  return result;
}

// ============================================================
// Wave 11.68-a — study_pr_records 매핑 (1↔5 row 분해/합산)
// 0002_study_pr_records.sql: PK=user_id, 5 jsonb 컬럼
// (daily_utterance / daily_study_time / weekly_utterance / weekly_pass / history)
// USER_META_KEY_MAP 패턴 답습. Dexie meta 의 5 prefix key 사용 — 다른 keys 와 충돌 회피.
// ============================================================

/** Dexie meta key (camelCase, 'pr' prefix) ↔ Supabase column (snake_case). */
export const PR_RECORDS_KEY_MAP = Object.freeze([
  Object.freeze({ dexieKey: 'prDailyUtterance', supabaseCol: 'daily_utterance' }),
  Object.freeze({ dexieKey: 'prDailyStudyTime', supabaseCol: 'daily_study_time' }),
  Object.freeze({ dexieKey: 'prWeeklyUtterance', supabaseCol: 'weekly_utterance' }),
  Object.freeze({ dexieKey: 'prWeeklyPass', supabaseCol: 'weekly_pass' }),
  Object.freeze({ dexieKey: 'prHistory', supabaseCol: 'history' }),
]);

/** Dexie 5 rows → Supabase 1 row. user_meta 패턴 동일. */
export function prRecordsDexieToSupabase(rows, userId) {
  if (!userId) return null;
  const out = { user_id: userId };
  const map = new Map((rows || []).map((r) => [r?.key, r?.value]));
  for (const m of PR_RECORDS_KEY_MAP) {
    out[m.supabaseCol] = map.has(m.dexieKey) ? map.get(m.dexieKey) ?? null : null;
  }
  return out;
}

/** Supabase 1 row → Dexie 5 rows. value null/undefined 컬럼은 row 생성 안 함. */
export function prRecordsSupabaseToDexie(row) {
  if (!row) return [];
  const now = Date.now();
  const result = [];
  for (const m of PR_RECORDS_KEY_MAP) {
    const value = row[m.supabaseCol];
    if (value !== null && value !== undefined) {
      result.push({ key: m.dexieKey, value, at: now });
    }
  }
  return result;
}

/**
 * user_meta 다운로드. 1 row 가져와서 4 Dexie rows 분해 후 bulkPut.
 *
 * Wave 11.15 — `.maybeSingle()` 제거 → `.eq + data[0]` 패턴 (supabase-js tree-shake 위해 PostgrestSingleResponse 청크 회피).
 * user_id 가 PK 라 RLS 통과 시 1 row 보장 — `.eq` 결과 배열의 첫 요소면 충분.
 */
export async function pullUserMeta(db, userId) {
  if (!supabase) return { table: 'meta', status: 'skipped', reason: 'no_supabase' };
  if (!db) return { table: 'meta', status: 'skipped', reason: 'no_db' };
  if (!userId) return { table: 'meta', status: 'skipped', reason: 'no_user' };
  try {
    const { data, error } = await supabase
      .from('study_user_meta')
      .select('*')
      .eq('user_id', userId);
    if (error) {
      console.error('[sync] pullUserMeta 실패', error);
      return { table: 'meta', status: 'error', error };
    }
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!row) {
      return { table: 'meta', status: 'empty', count: 0 };
    }
    const rows = userMetaSupabaseToDexie(row);
    if (rows.length === 0) {
      return { table: 'meta', status: 'empty', count: 0 };
    }
    const store = db.meta;
    if (!store?.bulkPut) {
      return { table: 'meta', status: 'error', reason: 'no_store' };
    }
    await store.bulkPut(rows);
    return { table: 'meta', status: 'ok', count: rows.length };
  } catch (e) {
    console.error('[sync] pullUserMeta 예외', e);
    return { table: 'meta', status: 'error', error: e };
  }
}

/**
 * user_meta 업로드. Dexie 의 4 specific keys bulkGet → 합산 → upsert (onConflict: user_id).
 * 4 keys 모두 없으면 empty (push 의미 없음).
 */
export async function pushUserMeta(db, userId) {
  if (!supabase) return { table: 'meta', status: 'skipped', reason: 'no_supabase' };
  if (!db) return { table: 'meta', status: 'skipped', reason: 'no_db' };
  if (!userId) return { table: 'meta', status: 'skipped', reason: 'no_user' };
  try {
    const store = db.meta;
    if (!store) return { table: 'meta', status: 'error', reason: 'no_store' };
    const keys = USER_META_KEY_MAP.map((m) => m.dexieKey);
    const got = await store.bulkGet(keys);
    const rows = got.filter(Boolean);
    if (rows.length === 0) {
      return { table: 'meta', status: 'empty', count: 0 };
    }
    if (
      _serverCounts.has('meta') &&
      _serverCounts.get('meta') === 0 &&
      rows.length > 0
    ) {
      return {
        table: 'meta',
        status: 'blocked',
        reason: 'server_empty_local_nonempty',
        count: rows.length,
      };
    }
    const supabaseRow = userMetaDexieToSupabase(rows, userId);
    if (!supabaseRow) {
      return { table: 'meta', status: 'error', reason: 'transform_failed' };
    }
    const { error } = await supabase
      .from('study_user_meta')
      .upsert([supabaseRow], { onConflict: 'user_id' });
    if (error) {
      console.error('[sync] pushUserMeta 실패', error);
      return { table: 'meta', status: 'error', error };
    }
    return { table: 'meta', status: 'ok', count: rows.length };
  } catch (e) {
    console.error('[sync] pushUserMeta 예외', e);
    return { table: 'meta', status: 'error', error: e };
  }
}

/**
 * pr_records 다운로드. user_meta 패턴 동일 (1 row → 5 Dexie rows).
 *
 * Wave 11.68-a — table 라벨은 'prRecords' (TABLE_MAP / serverCounts 충돌 회피).
 */
export async function pullPrRecords(db, userId) {
  if (!supabase) return { table: 'prRecords', status: 'skipped', reason: 'no_supabase' };
  if (!db) return { table: 'prRecords', status: 'skipped', reason: 'no_db' };
  if (!userId) return { table: 'prRecords', status: 'skipped', reason: 'no_user' };
  try {
    const { data, error } = await supabase
      .from('study_pr_records')
      .select('*')
      .eq('user_id', userId);
    if (error) {
      console.error('[sync] pullPrRecords 실패', error);
      return { table: 'prRecords', status: 'error', error };
    }
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!row) {
      return { table: 'prRecords', status: 'empty', count: 0 };
    }
    const rows = prRecordsSupabaseToDexie(row);
    if (rows.length === 0) {
      return { table: 'prRecords', status: 'empty', count: 0 };
    }
    const store = db.meta;
    if (!store?.bulkPut) {
      return { table: 'prRecords', status: 'error', reason: 'no_store' };
    }
    await store.bulkPut(rows);
    return { table: 'prRecords', status: 'ok', count: rows.length };
  } catch (e) {
    console.error('[sync] pullPrRecords 예외', e);
    return { table: 'prRecords', status: 'error', error: e };
  }
}

/**
 * pr_records 업로드. Dexie 5 specific keys bulkGet → 합산 → upsert.
 * 5 keys 모두 없으면 empty (push 의미 없음).
 */
export async function pushPrRecords(db, userId) {
  if (!supabase) return { table: 'prRecords', status: 'skipped', reason: 'no_supabase' };
  if (!db) return { table: 'prRecords', status: 'skipped', reason: 'no_db' };
  if (!userId) return { table: 'prRecords', status: 'skipped', reason: 'no_user' };
  try {
    const store = db.meta;
    if (!store) return { table: 'prRecords', status: 'error', reason: 'no_store' };
    const keys = PR_RECORDS_KEY_MAP.map((m) => m.dexieKey);
    const got = await store.bulkGet(keys);
    const rows = got.filter(Boolean);
    if (rows.length === 0) {
      return { table: 'prRecords', status: 'empty', count: 0 };
    }
    if (
      _serverCounts.has('prRecords') &&
      _serverCounts.get('prRecords') === 0 &&
      rows.length > 0
    ) {
      return {
        table: 'prRecords',
        status: 'blocked',
        reason: 'server_empty_local_nonempty',
        count: rows.length,
      };
    }
    const supabaseRow = prRecordsDexieToSupabase(rows, userId);
    if (!supabaseRow) {
      return { table: 'prRecords', status: 'error', reason: 'transform_failed' };
    }
    const { error } = await supabase
      .from('study_pr_records')
      .upsert([supabaseRow], { onConflict: 'user_id' });
    if (error) {
      console.error('[sync] pushPrRecords 실패', error);
      return { table: 'prRecords', status: 'error', error };
    }
    return { table: 'prRecords', status: 'ok', count: rows.length };
  } catch (e) {
    console.error('[sync] pushPrRecords 예외', e);
    return { table: 'prRecords', status: 'error', error: e };
  }
}

/**
 * prRecords 보강 (2026-07-15) — 서버에 pr_records 행이 없고 로컬에 PR 키가 있으면 직접 upsert.
 *
 * pushPrRecords 의 급감 가드(server count 0 → blocked)는 '기존 유저' (다른 테이블엔 서버 데이터가 있어
 * allowEmptyServerPush 가 발동하지 않는 사용자) 에게 영구 차단으로 작동한다 → 역대 최고 기록(pr.js 가
 * Dexie meta 에 쓰는 5 키)이 이 기기에만 남는다. pr_records 는 user_id PK 단일 행이라 서버가 비어 있으면
 * 덮어쓸 것이 없으므로 직접 upsert 가 안전 (reconcileTable 의 missing-only 철학과 동일).
 * 서버에 행이 이미 있으면 손대지 않는다 (일반 hook push 경로가 처리 — 서버 최신값 보호).
 */
export async function reconcilePrRecords(db, userId) {
  if (!supabase) return { table: 'prRecords', status: 'skipped', reason: 'no_supabase' };
  if (!db || !userId) return { table: 'prRecords', status: 'skipped', reason: 'preconditions' };
  try {
    const store = db.meta;
    if (!store?.bulkGet) return { table: 'prRecords', status: 'error', reason: 'no_store' };
    const keys = PR_RECORDS_KEY_MAP.map((m) => m.dexieKey);
    const rows = (await store.bulkGet(keys)).filter(Boolean);
    if (rows.length === 0) return { table: 'prRecords', status: 'empty', pushed: 0 };
    const { data, error } = await supabase
      .from('study_pr_records')
      .select('user_id')
      .eq('user_id', userId);
    if (error) {
      console.error('[sync] reconcilePrRecords 서버 조회 실패', error);
      return { table: 'prRecords', status: 'error', error };
    }
    if (Array.isArray(data) && data.length > 0) {
      return { table: 'prRecords', status: 'ok', pushed: 0 };
    }
    const supabaseRow = prRecordsDexieToSupabase(rows, userId);
    if (!supabaseRow) return { table: 'prRecords', status: 'error', reason: 'transform_failed' };
    const { error: upErr } = await supabase
      .from('study_pr_records')
      .upsert([supabaseRow], { onConflict: 'user_id' });
    if (upErr) {
      console.error('[sync] reconcilePrRecords upsert 실패', upErr);
      return { table: 'prRecords', status: 'error', error: upErr };
    }
    _serverCounts.set('prRecords', 1);
    return { table: 'prRecords', status: 'ok', pushed: 1 };
  } catch (e) {
    console.error('[sync] reconcilePrRecords 예외', e);
    return { table: 'prRecords', status: 'error', error: e };
  }
}

/**
 * 급감 차단 unlock (Wave 11.13.3 · spec §4 line 189 안전장치 해제).
 *
 * 사용 시나리오:
 *  - 신규 사용자 onboarding (서버 0 + 로컬 seed 데이터 push) — 첫 push 차단 회피용.
 *  - 사용자 명시 "다시 동기화" 트리거 (UI 버튼 — 다음 Wave 의 settings 화면).
 *
 * 본 Wave 는 export 만. main.js / app.js 호출은 별 Wave (onboarding flow 추가 시).
 */
export function allowEmptyServerPush() {
  _serverCounts.clear();
}

/**
 * 변경 id 를 업로드 큐에 추가 + 3초 debounce 타이머 갱신.
 * Dexie creating/updating hook 또는 외부 명시적 호출 (테스트) 에서 사용.
 *
 * id falsy 시 무시 (Dexie 의 creating hook 이 auto-increment 가 아닌 string PK 케이스에서 primKey null 가능).
 */
export function queueUpload(dexieName, id) {
  if (!id) return;
  if (!_pendingUploads.has(dexieName)) {
    _pendingUploads.set(dexieName, new Set());
  }
  _pendingUploads.get(dexieName).add(id);
  // 목록을 먼저 디스크에 적는다 — 타이머(3초)가 돌기 전에 탭이 죽어도 다음 로드가 회수.
  persistOutbox();
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    flushPendingUploads().catch((e) => console.error('[sync] flush 실패', e));
  }, DEBOUNCE_MS);
}

/**
 * 큐를 즉시 flush (debounce 무시). 세션 완료 시 호출 (spec §4 line 187 — 세션 완료 시 즉시 동기화).
 * 큐가 비어있거나 컨텍스트(_currentDB / _currentUserId) 없으면 즉시 반환.
 *
 * Wave 11.14 — 4 테이블 (pushAll) + dailyStats (pushDailyStats) + user_meta (pushUserMeta) 동시.
 * 반환: `{ ok, results, failed, reason? }`. results 는 4 + dailyStats? + meta? 결합.
 */
export async function flushPendingUploads({ skipServerOwned = false, onlyServerOwned = false } = {}) {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
  if (_pendingUploads.size === 0) {
    return { ok: true, results: [], failed: 0 };
  }
  if (!_currentDB || !_currentUserId) {
    // hook 발화 후 stopSync 가 컨텍스트 비운 race — 큐 보존 (다음 startSync 에서 flush 가능)
    return { ok: false, reason: 'no_session', results: [], failed: 0 };
  }
  // 큐를 스냅샷 후 비우고 push (push 도중 새 변경 들어오면 hook 이 다시 큐에 넣음 → 다음 flush).
  // startSync 는 이 큐를 두 번에 나눠 비운다 (skipServerOwned → pull → onlyServerOwned).
  const byTable = new Map();
  for (const [k, set] of _pendingUploads) {
    if (skipServerOwned && SERVER_OWNED.has(k)) continue;
    if (onlyServerOwned && !SERVER_OWNED.has(k)) continue;
    byTable.set(k, new Set(set));
    _pendingUploads.delete(k);
  }
  if (byTable.size === 0) {
    return { ok: true, results: [], failed: 0 };
  }
  // 디스크 아웃박스는 '서버 성공 응답 이후에만' 비운다 (at-least-once).
  // 먼저 비우면 pagehide flush 도중 탭이 죽는 순간 — 이 기능이 지켜야 할 바로 그 시나리오 —
  // 디스크는 이미 비었는데 응답이 안 와 재큐잉도 못 해 tail 이 증발한다 (2026-07-15 실기기에서 잡음).
  // 중복 push 는 무해하다 (id 기준 upsert).
  // 4 테이블 + dailyStats + user_meta + pr_records (Wave 11.68-a) 동시 push
  const promises = [pushAll(_currentDB, _currentUserId, byTable)];
  if (byTable.has('dailyStats') && byTable.get('dailyStats').size > 0) {
    const dates = Array.from(byTable.get('dailyStats'));
    promises.push(pushDailyStats(_currentDB, _currentUserId, dates));
  }
  if (byTable.has('meta') && byTable.get('meta').size > 0) {
    promises.push(pushUserMeta(_currentDB, _currentUserId));
  }
  if (byTable.has('prRecords') && byTable.get('prRecords').size > 0) {
    promises.push(pushPrRecords(_currentDB, _currentUserId));
  }
  const settled = await Promise.all(promises);
  const tableResult = settled[0];
  const extras = settled.slice(1);
  const allResults = [...(tableResult.results || []), ...extras];
  const failed = (tableResult.failed || 0) + extras.filter((r) => r.status === 'error').length;
  // 올라간 것만 디스크에서 지우고, 못 올라간 것(error/blocked/skipped)은 큐에 되돌린다.
  // 이전 구현은 await 이전에 clear 만 해서 실패 = 영구 소실이었다. 되돌린 항목은 다음 debounce·
  // pagehide flush·online 복귀·다음 startSync 에서 재시도된다.
  const drained = new Map();
  const retry = [];
  for (const r of allResults) {
    if (!r || !byTable.has(r.table)) continue;
    if (r.status === 'ok' || r.status === 'empty') drained.set(r.table, byTable.get(r.table));
    else retry.push(r);
  }
  for (const r of retry) {
    if (!_pendingUploads.has(r.table)) _pendingUploads.set(r.table, new Set());
    const set = _pendingUploads.get(r.table);
    for (const id of byTable.get(r.table)) set.add(id);
  }
  persistOutbox(drained);
  // 사용자 가시화 — 실패가 조용히 쌓이는 상태(gym 2026-07-14 사고)를 앱이 알려줄 수 있게 기록.
  recordSyncResult(_currentUserId, {
    ok: failed === 0 && retry.length === 0,
    pending: pendingCount(),
    error: retry[0]?.reason || retry[0]?.error?.message || null,
  });
  return {
    ok: failed === 0,
    results: allResults,
    failed,
  };
}

/** 미푸시 대기 id 총수 (아웃박스 = in-memory 큐와 동일 내용). */
function pendingCount() {
  let n = 0;
  for (const set of _pendingUploads.values()) n += set.size;
  return n;
}

/** 현재 사용자의 동기화 건강 상태 (UI 표시용). 세션 없으면 null. */
export function currentSyncHealth() {
  return _currentUserId ? readSyncHealth(_currentUserId) : null;
}

/**
 * 동기화 시작. main.js 부트스트랩 + app.js `onAuthStateChange` SIGNED_IN 양쪽에서 호출.
 *
 * 1차 (Wave 11.13.1) 다운로드 + 2차 (Wave 11.13.2) hook attach. 이미 활성이면 noop.
 */
export async function startSync(user) {
  if (!user?.id) return { ok: false, reason: 'no_user' };
  if (typeof window === 'undefined' || !window.studyDB) {
    console.warn('[sync] window.studyDB 없음 — startSync 무시');
    return { ok: false, reason: 'no_db' };
  }
  if (_syncActive) {
    return { ok: true, reason: 'already_active' };
  }
  _syncActive = true;
  _currentDB = window.studyDB;
  _currentUserId = user.id;
  _outboxKey = OUTBOX_PREFIX + user.id;
  // 1) 이전 세션의 미푸시 tail 을 pull '이전에' 올린다.
  //    dailyStats/meta/prRecords 는 로컬 read-modify-write 누적(sessionFinish.js 의 mergeDailyStats)이라
  //    pull(bulkPut)이 먼저 오면 로컬 증분이 서버의 옛 값으로 덮여 사라지고, 그 뒤 push 는 서버 값을
  //    되밀 뿐인 no-op 이 된다 → push-before-pull 이 필수.
  //    serverOwned(todayLessons/mathProblems)만 pull 뒤로 미룬다 (서버에서 삭제된 행을 되살리지 않도록 —
  //    pull 의 staleIdsToDelete 가 로컬에서 지우면 push 대상이 자연 소멸).
  //    이 시점 _serverCounts 는 비어 있어 급감 가드 미발동 → 서버-빈 테이블도 정상 push.
  restoreOutbox();
  try { await flushPendingUploads({ skipServerOwned: true }); }
  catch (e) { console.warn('[sync] 아웃박스 선(先) flush 실패', e); }
  // 2) pullAll 의 bulkPut 이 hook 발화 시 다운로드한 row 가 다시 push 큐로 — 순서: pull 먼저, hook 나중.
  const result = await pullAll(_currentDB, _currentUserId);
  if (!result.ok) {
    console.warn('[sync] pullAll 부분 실패', result);
  }
  _hookHandlers = attachHooks(_currentDB);
  // 3) serverOwned tail (todayLessons 완료 플래그 등) — 서버 삭제 전파 후라 유령 행 부활 없음.
  try { await flushPendingUploads({ onlyServerOwned: true }); }
  catch (e) { console.warn('[sync] 아웃박스 후(後) flush 실패', e); }
  // 4) pull 이 못 가져온 '로컬에만 있는' 완료 dailyStats 를 재push — 큐 유실·과거 push 실패 회복.
  // 서버 직접 upsert(미동기 행만) 라 Dexie hook 미발화 → 루프 없음. 실패해도 startSync 무영향.
  try { await reconcileDailyStats(_currentDB, _currentUserId); }
  catch (e) { console.warn('[sync] reconcileDailyStats', e); }
  // 급감 가드에 막혀 서버-빈 채로 남는 기기-작성 테이블을 멀티기기 동기화 (누락 행만 직접 upsert).
  // 기존 유저(일부 테이블만 서버-빈)에서 다른 브라우저·iOS PWA 가 0 으로 보이던 버그 보강. 실패해도 무영향.
  try {
    for (const dexie of DEVICE_WRITTEN_TABLES) {
      const m = TABLE_MAP.find((x) => x.dexie === dexie);
      if (m) await reconcileTable(_currentDB, _currentUserId, m);
    }
  } catch (e) { console.warn('[sync] reconcileTable', e); }
  try { await reconcilePrRecords(_currentDB, _currentUserId); }
  catch (e) { console.warn('[sync] reconcilePrRecords', e); }
  return result;
}

/**
 * 동기화 정리. `auth.registerOnSignOut` 으로 main.js 가 등록 (auth.js 의 await cb() 가 Promise 보장).
 * 순서: hook detach → 잔여 큐 flush (컨텍스트 살아있을 때) → 컨텍스트 비우기.
 */
export async function stopSync() {
  if (_hookHandlers && _currentDB) {
    detachHooks(_currentDB, _hookHandlers);
  }
  _hookHandlers = null;
  if (_pendingUploads.size > 0 && _currentDB && _currentUserId) {
    try { await flushPendingUploads(); }
    catch (e) { console.warn('[sync] stopSync flush 실패', e); }
  } else if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
  _currentDB = null;
  _currentUserId = null;
  _syncActive = false;
  // 아웃박스 localStorage 항목은 지우지 않는다 — flush 가 실패한 미푸시 id 는 다음 로그인의
  // startSync 가 복원해 재시도해야 한다 (로그아웃이 유실 사유가 되면 안 됨).
  _outboxKey = null;
  // Wave 11.13.3 — server count 마킹은 다음 startSync 의 pullAll 이 다시 채움
  _serverCounts.clear();
}

/**
 * Dexie creating/updating hook 등록. 6 테이블 (Wave 11.14 — 4 + dailyStats + meta).
 * deleting 은 등록 안 함 (spec §4 line 189 "급감 차단" 안전장치 없이 cascade 삭제 위험 — 11.13.3 분리).
 *
 * meta hook 은 USER_META_KEY_MAP 의 4 specific keys 만 queueUpload (다른 keys 는 로컬 전용).
 *
 * 반환: `Map<dexieName, {onCreating, onUpdating}>` — detachHooks 입력.
 */
function attachHooks(db) {
  const handlers = new Map();
  // 단순 4 테이블 (Wave 11.13.2)
  for (const m of TABLE_MAP) {
    const store = db?.[m.dexie];
    if (!store?.hook) continue;
    const onCreating = function (primKey, obj) {
      // creating hook 의 primKey 는 outbound (auto-increment) 시 미정. string PK (id) 이면 obj.id 사용.
      const id = primKey || obj?.id;
      if (id) queueUpload(m.dexie, id);
    };
    const onUpdating = function (_mods, primKey) {
      if (primKey) queueUpload(m.dexie, primKey);
    };
    try {
      store.hook('creating', onCreating);
      store.hook('updating', onUpdating);
      handlers.set(m.dexie, { onCreating, onUpdating });
    } catch (e) {
      console.warn(`[sync] attachHook ${m.dexie} 실패`, e);
    }
  }
  // Wave 11.14 — dailyStats hook (PK=date)
  if (db?.dailyStats?.hook) {
    const onCreating = function (primKey, obj) {
      const date = primKey || obj?.date;
      if (date) queueUpload('dailyStats', date);
    };
    const onUpdating = function (_mods, primKey) {
      if (primKey) queueUpload('dailyStats', primKey);
    };
    try {
      db.dailyStats.hook('creating', onCreating);
      db.dailyStats.hook('updating', onUpdating);
      handlers.set('dailyStats', { onCreating, onUpdating });
    } catch (e) {
      console.warn('[sync] attachHook dailyStats 실패', e);
    }
  }
  // Wave 11.14 / 11.68-a — meta hook
  // USER_META_KEY_MAP 4 keys → queueUpload('meta', key)
  // PR_RECORDS_KEY_MAP 5 keys → queueUpload('prRecords', key)
  // 다른 keys (studySettings / activeSession / weakPhonemes_<lang>) 는 로컬 전용 — sync 안 됨
  if (db?.meta?.hook) {
    const userMetaKeys = new Set(USER_META_KEY_MAP.map((m) => m.dexieKey));
    const prKeys = new Set(PR_RECORDS_KEY_MAP.map((m) => m.dexieKey));
    const routeKey = (key) => {
      if (!key) return null;
      if (userMetaKeys.has(key)) return 'meta';
      if (prKeys.has(key)) return 'prRecords';
      return null;
    };
    const onCreating = function (primKey, obj) {
      const route = routeKey(primKey || obj?.key);
      if (route) queueUpload(route, primKey || obj?.key);
    };
    const onUpdating = function (_mods, primKey, obj) {
      const route = routeKey(primKey || obj?.key);
      if (route) queueUpload(route, primKey || obj?.key);
    };
    try {
      db.meta.hook('creating', onCreating);
      db.meta.hook('updating', onUpdating);
      handlers.set('meta', { onCreating, onUpdating });
    } catch (e) {
      console.warn('[sync] attachHook meta 실패', e);
    }
  }
  return handlers;
}

/** Dexie hook 해제. unsubscribe 실패 시에도 다른 테이블은 계속 시도 (best-effort). */
function detachHooks(db, handlers) {
  if (!db || !handlers) return;
  // 단순 4 테이블
  for (const m of TABLE_MAP) {
    const store = db[m.dexie];
    const h = handlers.get(m.dexie);
    if (!store?.hook || !h) continue;
    try {
      store.hook('creating').unsubscribe(h.onCreating);
      store.hook('updating').unsubscribe(h.onUpdating);
    } catch (e) {
      console.warn(`[sync] detachHook ${m.dexie} 실패`, e);
    }
  }
  // Wave 11.14 — dailyStats / meta
  for (const name of ['dailyStats', 'meta']) {
    const store = db[name];
    const h = handlers.get(name);
    if (!store?.hook || !h) continue;
    try {
      store.hook('creating').unsubscribe(h.onCreating);
      store.hook('updating').unsubscribe(h.onUpdating);
    } catch (e) {
      console.warn(`[sync] detachHook ${name} 실패`, e);
    }
  }
}

/** 현재 sync 활성 여부 (UI 표시용 — 다음 Wave). */
export function isSyncActive() {
  return _syncActive;
}

export const Sync = {
  TABLE_MAP,
  USER_META_KEY_MAP,
  PR_RECORDS_KEY_MAP,
  DEBOUNCE_MS,
  pullTable,
  pullAll,
  pushTable,
  pushAll,
  queueUpload,
  flushPendingUploads,
  resolveConflict,
  staleIdsToDelete,
  allowEmptyServerPush,
  // Wave 11.13.x — dailyStats / user_meta (PK 차이 + camelCase↔snake_case + 1↔4 row)
  dailyStatsDexieToSupabase,
  dailyStatsSupabaseToDexie,
  pullDailyStats,
  pushDailyStats,
  reconcileDailyStats,
  reconcileTable,
  reconcilePrRecords,
  userMetaDexieToSupabase,
  userMetaSupabaseToDexie,
  pullUserMeta,
  pushUserMeta,
  // Wave 11.68-a — pr_records (1↔5 row, user_meta 패턴 답습)
  prRecordsDexieToSupabase,
  prRecordsSupabaseToDexie,
  pullPrRecords,
  pushPrRecords,
  // Wave 11.20 — 단순 4 테이블 camelCase↔snake_case 변환
  reviewQueueDexieToSupabase,
  reviewQueueSupabaseToDexie,
  todayLessonsDexieToSupabase,
  todayLessonsSupabaseToDexie,
  sessionLogsDexieToSupabase,
  sessionLogsSupabaseToDexie,
  pronunciationLogDexieToSupabase,
  pronunciationLogSupabaseToDexie,
  startSync,
  stopSync,
  isSyncActive,
  currentSyncHealth,
};

if (typeof window !== 'undefined') {
  window.studySync = Sync;
}

export default Sync;
