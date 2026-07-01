/**
 * Dexie 공통 쿼리 레이어 (spec §4, §12 · Wave 11.7.x 팩토리 대응).
 *
 * 변경: schema.js 의 고정 인스턴스 import 폐기 → auth.ensureUserDB 가 동적 할당한
 * `window.gymDB` 를 호출 시점에 조회. 미할당 상태(미인증) 호출은 throw.
 *
 * mocks 허브(iframe)에서도 inline script 로 접근 가능하도록
 * `window.gymQueries` 에 노출 — Study 앱 `window.studyDB` 패턴 대응.
 *
 * Wave 11.7.1: settings + customExercises CRUD 추가. exercises 마스터는 별 모듈
 * (`./exercises.js`) — 정적 카탈로그라 DB 무관, queries 레이어를 통하지 않음.
 */

import {
  BUILTIN_EXERCISES,
  PART_IDS,
  INCREMENT,
  getBuiltinExercise,
  resolveWeightIncrement,
  listBuiltinByPart,
  listAllBuiltin,
} from './exercises.js';

function db() {
  const inst = typeof window !== 'undefined' ? window.gymDB : null;
  if (!inst) {
    throw new Error('[gymQueries] window.gymDB 미초기화 — 인증 후 ensureUserDB 가 호출되어야 함.');
  }
  return inst;
}

/* ───────────────────────────── sessions ───────────────────────────── */

/** YYYY-MM-DD 문자열 범위 내 완료 세션 — 날짜 정렬 오름차순 */
export async function getSessionsByRange(fromISO, toISO) {
  return await db().sessions
    .where('date').between(fromISO, toISO, true, true)
    .and(s => s.status === 'completed')
    .sortBy('date');
}

/** 특정 날짜 완료 세션 (하루 1건 가정, 여러 건이면 첫 건) */
export async function getSessionByDate(iso) {
  const rows = await db().sessions
    .where('date').equals(iso)
    .and(s => s.status === 'completed')
    .toArray();
  return rows[0] || null;
}

/** id 로 세션 조회 */
export async function getSessionById(id) {
  return await db().sessions.get(id);
}

/** 세션 upsert — 기존 id 가 있으면 덮어쓰기 (spec §7 세션 종료 시 호출) */
export async function upsertSession(session) {
  return await db().sessions.put(session);
}

/** 세션 삭제 (spec §9-1 꾹누르기 → 세션 삭제) */
export async function deleteSession(id) {
  return await db().sessions.delete(id);
}

/** 활성 (미완료) 세션 — 세션 재개용 (spec §8) */
export async function getActiveSession() {
  const rows = await db().sessions
    .where('status').equals('active')
    .toArray();
  return rows.sort((a, b) => (b.startTime || 0) - (a.startTime || 0))[0] || null;
}

/* ───────────────────────────── prs ───────────────────────────── */

/**
 * PR 객체 upsert. PK = [exerciseId + type] (복합).
 *  - type 누락 시 'e1rm' default.
 *  - exerciseId 또는 e1rm/weight/reps 비숫자면 throw — buildPR 통과한 객체만 받음.
 */
export async function upsertPR(pr) {
  if (!pr || typeof pr !== 'object') throw new Error('[upsertPR] pr 객체 누락');
  if (!pr.exerciseId) throw new Error('[upsertPR] exerciseId 누락');
  const row = { ...pr, type: pr.type || 'e1rm' };
  if (!Number.isFinite(row.e1rm) || !Number.isFinite(row.weight) || !Number.isFinite(row.reps)) {
    throw new Error('[upsertPR] e1rm·weight·reps 숫자 필수');
  }
  await db().prs.put(row);
  return row;
}

/** 운동의 type='e1rm' PR row (해당 키 없으면 null) */
export async function getBestE1RM(exerciseId) {
  if (!exerciseId) throw new Error('[getBestE1RM] exerciseId 누락');
  const row = await db().prs.get([exerciseId, 'e1rm']);
  return row || null;
}

/** 운동의 모든 type PR row (e1rm·weight·reps·volume 등) */
export async function listPRsByExercise(exerciseId) {
  if (!exerciseId) throw new Error('[listPRsByExercise] exerciseId 누락');
  return await db().prs.where('exerciseId').equals(exerciseId).toArray();
}

/** 전체 PR row — 운동별 통계 / 재계산 화면용 */
export async function listAllPRs() {
  return await db().prs.toArray();
}

/** PR 삭제 — 명시 type 필수 (default 'e1rm'). 복합 PK. */
export async function deletePR(exerciseId, type = 'e1rm') {
  if (!exerciseId) throw new Error('[deletePR] exerciseId 누락');
  return await db().prs.delete([exerciseId, type]);
}

/**
 * 세션 1건이 만든 PR row 모두 제거 (재계산 1단계).
 * 호출자는 후속 단계로 모든 sessions 를 순회하며 운동별 best 를 다시 빌드해야 함 (별 함수).
 * 반환: 삭제된 row 수.
 */
export async function deletePRsBySession(sessionId) {
  if (!sessionId) throw new Error('[deletePRsBySession] sessionId 누락');
  const all = await listAllPRs();
  const targets = all.filter(p => p.sessionId === sessionId);
  let removed = 0;
  for (const p of targets) {
    await db().prs.delete([p.exerciseId, p.type || 'e1rm']);
    removed += 1;
  }
  return removed;
}

/* ───────────────────────────── weights ───────────────────────────── */

/**
 * 체중 upsert (spec §10-2, §12).
 *  - PK = date (하루 1건). 같은 날 재입력은 덮어쓰기.
 *  - height 는 옵션 — 누락 시 기존 row 의 height 보존, 신규 row 면 settings.height fallback.
 *  - weight 는 양수 필수. 소수점 1자리 권장 (호출자 책임).
 */
export async function upsertWeight(date, weight, height) {
  if (!date || typeof date !== 'string') {
    throw new Error('[upsertWeight] date 누락 (YYYY-MM-DD)');
  }
  if (!Number.isFinite(weight) || weight <= 0) {
    throw new Error('[upsertWeight] weight 는 양수 필수');
  }
  const existing = await db().weights.get(date);
  let resolvedHeight = height;
  if (resolvedHeight == null) {
    if (existing && Number.isFinite(existing.height)) {
      resolvedHeight = existing.height;
    } else {
      const s = await getUserSettings();
      resolvedHeight = s.height ?? null;
    }
  }
  const row = { date, weight, height: resolvedHeight };
  await db().weights.put(row);
  return row;
}

/** 특정 날짜 체중 row 조회 — 없으면 null */
export async function getWeightByDate(date) {
  const row = await db().weights.get(date);
  return row || null;
}

/** 가장 최근 체중 row (date 내림차순 1건) — 없으면 null */
export async function getLatestWeight() {
  const all = await db().weights.toArray();
  if (!all.length) return null;
  return all.sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0))[0];
}

/** YYYY-MM-DD 범위 내 체중 row — date 오름차순 */
export async function listWeightsByRange(fromISO, toISO) {
  const rows = await db().weights
    .where('date').between(fromISO, toISO, true, true)
    .toArray();
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 모든 체중 row (date 오름차순) — 그래프 그릴 때 활용 */
export async function listAllWeights() {
  const rows = await db().weights.toArray();
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 체중 삭제 */
export async function deleteWeight(date) {
  if (!date) throw new Error('[deleteWeight] date 누락');
  return await db().weights.delete(date);
}

/* ───────────────────────────── settings ───────────────────────────── */

/** spec §12 설정 객체의 기본값. getUserSettings 가 없을 때 in-memory merge 로만 사용 (write 없음). */
export const DEFAULT_SETTINGS = Object.freeze({
  key: 'userSettings',
  weeklyGoal: 4,
  height: 173,
  birthYear: null,
  goalWeight: 69,
  hiddenExercises: [],
  deletedExercises: [],
  exerciseOrder: {},
  exercisePartOverride: {},
});

/** 사용자 설정 조회 — 없으면 DEFAULT_SETTINGS clone 반환 (DB write 없음) */
export async function getUserSettings() {
  const row = await db().settings.get('userSettings');
  if (!row) return cloneSettings(DEFAULT_SETTINGS);
  // DEFAULT_SETTINGS 와 row 머지 — 새 필드 추가 시 기존 row 가 누락 필드를 갖게 되는 것 방지.
  return { ...cloneSettings(DEFAULT_SETTINGS), ...row, key: 'userSettings' };
}

/** 사용자 설정 부분 업데이트 — patch 와 머지 후 put. key 는 항상 'userSettings'. */
export async function upsertUserSettings(patch) {
  if (!patch || typeof patch !== 'object') {
    throw new Error('[upsertUserSettings] patch 는 객체여야 함');
  }
  const existing = await getUserSettings();
  // updatedAt — 동기화 LWW 용 클라이언트 타임스탬프 (settings JSONB 에 실려 push/pull, 클럭 일관).
  const merged = { ...existing, ...patch, key: 'userSettings', updatedAt: Date.now() };
  await db().settings.put(merged);
  return merged;
}

function cloneSettings(s) {
  return {
    ...s,
    hiddenExercises: [...s.hiddenExercises],
    deletedExercises: [...(s.deletedExercises || [])],
    exerciseOrder: { ...s.exerciseOrder },
    exercisePartOverride: { ...s.exercisePartOverride },
  };
}

/* ───────────────────────────── customExercises ───────────────────────────── */

/**
 * 커스텀 운동 생성. id 가 비어 있으면 `cust_<uuid8>` 자동 부여.
 * part / equipment 필수 — 각각 PART_IDS / INCREMENT 키 검증은 호출자 책임 (UI 가드).
 */
export async function createCustomExercise(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('[createCustomExercise] input 객체 누락');
  }
  if (!input.name || !input.part || !input.equipment) {
    throw new Error('[createCustomExercise] name·part·equipment 필수');
  }
  if (!PART_IDS.includes(input.part)) {
    throw new Error(`[createCustomExercise] part='${input.part}' 는 PART_IDS 아님`);
  }
  const id = input.id || `cust_${randomId8()}`;
  const row = {
    id,
    name: String(input.name),
    part: input.part,
    equipment: input.equipment,
    defaultSets: Number.isFinite(input.defaultSets) ? input.defaultSets : 3,
    defaultReps: Number.isFinite(input.defaultReps) ? input.defaultReps : 10,
    defaultWeight: Number.isFinite(input.defaultWeight) ? input.defaultWeight : 0,
    met: Number.isFinite(input.met) ? input.met : 4.0,
    createdAt: Date.now(),
  };
  await db().customExercises.add(row);
  return row;
}

/** 커스텀 운동 부분 업데이트. id 누락·비매칭 시 throw. */
export async function updateCustomExercise(id, patch) {
  if (!id) throw new Error('[updateCustomExercise] id 누락');
  if (!patch || typeof patch !== 'object') throw new Error('[updateCustomExercise] patch 누락');
  const existing = await db().customExercises.get(id);
  if (!existing) throw new Error(`[updateCustomExercise] id='${id}' 없음`);
  if (patch.part && !PART_IDS.includes(patch.part)) {
    throw new Error(`[updateCustomExercise] part='${patch.part}' 는 PART_IDS 아님`);
  }
  const merged = { ...existing, ...patch, id, updatedAt: Date.now() };
  await db().customExercises.put(merged);
  return merged;
}

/** 커스텀 운동 삭제 */
export async function deleteCustomExercise(id) {
  if (!id) throw new Error('[deleteCustomExercise] id 누락');
  return await db().customExercises.delete(id);
}

/** 모든 커스텀 운동 — part·name 사전순 정렬 */
export async function listCustomExercises() {
  const rows = await db().customExercises.toArray();
  return rows.sort((a, b) => {
    if (a.part !== b.part) {
      return PART_IDS.indexOf(a.part) - PART_IDS.indexOf(b.part);
    }
    return a.name.localeCompare(b.name, 'ko');
  });
}

/**
 * 통합 운동 리스트 — BUILTIN + 커스텀 + 사용자 설정 적용 (spec §10-1).
 *
 * options:
 *   part: 'chest'|'back'|... 지정 시 그 부위만. 'all'/null 이면 전체.
 *   includeHidden: true → 숨김 운동도 포함 (관리 화면용). false → 숨김 제외 (운동 선택용).
 *
 * 적용 순서:
 *   1) BUILTIN_EXERCISES 와 customExercises 합치기 (중복 id 는 custom 이 우선).
 *   2) settings.exercisePartOverride 가 있으면 part 재할당.
 *   3) part 필터.
 *   4) settings.hiddenExercises 가 있고 includeHidden=false 면 제외.
 *   5) settings.exerciseOrder[part] 가 있으면 그 순서로 정렬, 없는 id 는 뒤에 정의 순서 유지.
 *
 * 반환 row: BUILTIN/커스텀 원본 + { hidden: boolean, custom: boolean, weightIncrement }.
 */
export async function listExercisesForUser({ part = null, includeHidden = true } = {}) {
  const settings = await getUserSettings();
  const customs = await listCustomExercises();
  const partOverride = settings.exercisePartOverride || {};
  const hidden = new Set(settings.hiddenExercises || []);
  const deleted = new Set(settings.deletedExercises || []);

  // 1+2) 머지 + part override
  const map = new Map();
  for (const e of BUILTIN_EXERCISES) {
    const finalPart = partOverride[e.id] || e.part;
    map.set(e.id, { ...e, part: finalPart, custom: false });
  }
  for (const c of customs) {
    const finalPart = partOverride[c.id] || c.part;
    map.set(c.id, { ...c, part: finalPart, custom: true });
  }

  // 3) 영구 삭제 운동 제외 (항상 — 관리 리스트·운동 선택 모두). 빌트인 '삭제'의 실제 효과.
  let list = Array.from(map.values()).filter(e => !deleted.has(e.id));
  // part 필터
  if (part && part !== 'all') {
    list = list.filter(e => e.part === part);
  }

  // 4) hidden 적용
  if (!includeHidden) {
    list = list.filter(e => !hidden.has(e.id));
  }
  list = list.map(e => ({
    ...e,
    hidden: hidden.has(e.id),
    weightIncrement: resolveWeightIncrement(e),
  }));

  // 5) exerciseOrder 적용 — part 별 order 만 사용 (전체 정렬은 BUILTIN 정의 순서 유지)
  if (part && part !== 'all') {
    const order = (settings.exerciseOrder || {})[part] || [];
    if (order.length) {
      const idx = (id) => {
        const i = order.indexOf(id);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      };
      list.sort((a, b) => {
        const ia = idx(a.id), ib = idx(b.id);
        if (ia !== ib) return ia - ib;
        // order 누락 사이의 정렬은 정의 순서 (BUILTIN 우선, 그 다음 custom 한국어 사전순)
        if (a.custom !== b.custom) return a.custom ? 1 : -1;
        return a.name.localeCompare(b.name, 'ko');
      });
    }
  }
  return list;
}


/**
 * 운동 숨기기 토글 — settings.hiddenExercises 배열에서 add/remove.
 * 반환: 갱신된 settings.hiddenExercises 배열.
 */
export async function toggleExerciseHidden(exerciseId) {
  if (!exerciseId) throw new Error('[toggleExerciseHidden] exerciseId 누락');
  const settings = await getUserSettings();
  const set = new Set(settings.hiddenExercises || []);
  if (set.has(exerciseId)) set.delete(exerciseId);
  else set.add(exerciseId);
  const next = Array.from(set);
  await upsertUserSettings({ hiddenExercises: next });
  return next;
}

/**
 * 빌트인 운동 영구 삭제 — settings.deletedExercises 에 add/remove (숨김과 별개).
 * 삭제된 빌트인은 listExercisesForUser 에서 항상 제외(관리 리스트·운동 선택 모두).
 * 빌트인은 코드 카탈로그라 DB 행이 없으므로 이 set 으로 "삭제" 영속. 커스텀은 deleteCustomExercise.
 * 반환: 갱신된 settings.deletedExercises 배열.
 */
export async function setExerciseDeleted(exerciseId, deleted = true) {
  if (!exerciseId) throw new Error('[setExerciseDeleted] exerciseId 누락');
  const settings = await getUserSettings();
  const set = new Set(settings.deletedExercises || []);
  if (deleted) set.add(exerciseId);
  else set.delete(exerciseId);
  const next = Array.from(set);
  await upsertUserSettings({ deletedExercises: next });
  return next;
}

/**
 * 부위별 운동 순서 갱신 — settings.exerciseOrder[part] = [exerciseId, ...].
 * 호출자(드래그 종료 핸들러)가 새 순서 배열 전달.
 */
export async function setExerciseOrderForPart(part, orderedIds) {
  if (!part) throw new Error('[setExerciseOrderForPart] part 누락');
  if (!Array.isArray(orderedIds)) throw new Error('[setExerciseOrderForPart] orderedIds 배열 필수');
  const settings = await getUserSettings();
  const next = { ...(settings.exerciseOrder || {}), [part]: [...orderedIds] };
  await upsertUserSettings({ exerciseOrder: next });
  return next[part];
}

/**
 * 운동 부위 변경 — settings.exercisePartOverride[id] = newPart.
 * BUILTIN 운동의 부위를 사용자가 변경할 수 있도록 (spec §10-1).
 */
export async function setExercisePartOverride(exerciseId, newPart) {
  if (!exerciseId) throw new Error('[setExercisePartOverride] exerciseId 누락');
  if (!PART_IDS.includes(newPart)) {
    throw new Error(`[setExercisePartOverride] newPart='${newPart}' 는 PART_IDS 아님`);
  }
  const settings = await getUserSettings();
  const next = { ...(settings.exercisePartOverride || {}), [exerciseId]: newPart };
  await upsertUserSettings({ exercisePartOverride: next });
  return next;
}

function randomId8() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().split('-')[0];
  }
  // fallback (vitest jsdom 미사용 환경 대비)
  return Math.random().toString(36).slice(2, 10);
}

/* ───────────────────────────── 날짜 유틸 ───────────────────────────── */

/** 날짜 → 요일 인덱스 (0=월, 6=일) — 월 시작 기준 주 캘린더 매핑 */
export function isoToWeekdayIdx(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const js = new Date(y, m - 1, d).getDay(); // 0=일 ~ 6=토
  return (js + 6) % 7; // 0=월 ~ 6=일
}

/** Date → YYYY-MM-DD */
export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 월 범위 [from, to] ISO — YYYY, 1-based month */
export function monthRangeISO(year, monthOneBased) {
  const from = `${year}-${String(monthOneBased).padStart(2, '0')}-01`;
  const lastDay = new Date(year, monthOneBased, 0).getDate();
  const to = `${year}-${String(monthOneBased).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

/** 주 범위 [월요일 ISO, 일요일 ISO] — 기준일 포함 주 */
export function weekRangeISO(baseDate) {
  const js = baseDate.getDay(); // 0=일
  const dayOffsetFromMonday = (js + 6) % 7;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - dayOffsetFromMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: toISODate(monday), to: toISODate(sunday) };
}

/* mocks 허브 inline script 접근용 */
if (typeof window !== 'undefined') {
  window.gymQueries = {
    // sessions
    getSessionsByRange,
    getSessionByDate,
    getSessionById,
    upsertSession,
    deleteSession,
    getActiveSession,
    // prs
    upsertPR,
    getBestE1RM,
    listPRsByExercise,
    listAllPRs,
    deletePR,
    deletePRsBySession,
    // weights
    upsertWeight,
    getWeightByDate,
    getLatestWeight,
    listWeightsByRange,
    listAllWeights,
    deleteWeight,
    // settings
    DEFAULT_SETTINGS,
    getUserSettings,
    upsertUserSettings,
    // customExercises
    createCustomExercise,
    updateCustomExercise,
    deleteCustomExercise,
    listCustomExercises,
    // 마스터 (정적 — DB 무관)
    BUILTIN_EXERCISES,
    getBuiltinExercise,
    listBuiltinByPart,
    listAllBuiltin,
    listExercisesForUser,
    toggleExerciseHidden,
    setExerciseDeleted,
    setExerciseOrderForPart,
    setExercisePartOverride,
    // utils
    isoToWeekdayIdx,
    toISODate,
    monthRangeISO,
    weekRangeISO,
  };
}
