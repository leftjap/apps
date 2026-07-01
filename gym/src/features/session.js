/**
 * Wave 11.9.1 — 운동 세션 코어 (시작 + 운동 추가).
 *
 * 책임:
 *   - createEmptySession() — 빈 active 세션 row (id 자동, status='active', startTime=null, blocks/tags 빈)
 *   - getOrCreateActiveSession() — active 1건 보장
 *   - addExerciseToActiveSession(exerciseId, part) — single 블록 추가, tags 누적, startTime null 이면 Date.now()
 *   - mountSessionView() — mocks/session.html 진입 시 #addexChips/#addexList hydrate + click 위임
 *
 * SPA hijack 패턴은 Wave 11.7.4b exercises-admin.js 답습.
 * mocks 의 setActivePart/onAddExItemTap 호출 안 함 (SPA 자체 listener).
 * mocks 의 window.addExerciseToSession(name) 만 호출 (nav DOM 효과).
 */

import {
  getActiveSession,
  upsertSession,
  listExercisesForUser,
  listCustomExercises,
  getBestE1RM,
  toISODate,
} from '../db/queries.js';
import { PART_IDS, PARTS, getBuiltinExercise, resolveExerciseName, primeCustomExerciseCache } from '../db/exercises.js';
import { mapNameToExerciseId, persistSetPR } from './session-pr.js';
import { epley } from '../services/pr.js';

const VIEW_ATTR = 'data-spa-managed';
let _activePart = 'chest';
// (f-5-1) 사용자가 footer pill 탭으로 선택한 block idx (없으면 마지막 single 자동)
let _currentBlockIdx = null;
// 좌스와이프 커밋 1회성 신호 — 커밋한 종목 exerciseId. mountSessionActive 가 count-up/축하 모션 발화 후 소비(null).
// 데이터-델타 추론(exDoneVol 증가) 만으로는 키패드 done-세트 수정도 오발화 → 명시 신호로 커밋만 구분.
let _justCommittedExId = null;

/* ───────────────────────────── Dexie 어댑터 ───────────────────────────── */

/** spec §12 — id='session_<ts>', status='active', startTime=null. blocks/tags 빈. */
export async function createEmptySession() {
  const now = Date.now();
  const session = {
    id: `session_${now}`,
    date: toISODate(new Date(now)),
    startTime: null,
    endTime: null,
    blocks: [],
    tags: [],
    totalVolume: 0,
    totalCalories: 0,
    durationMin: 0,
    status: 'active',
  };
  await upsertSession(session);
  return session;
}

/** active 1건 보장 — 있으면 반환, 없으면 createEmptySession. */
export async function getOrCreateActiveSession() {
  const existing = await getActiveSession();
  if (existing) return existing;
  return createEmptySession();
}

/**
 * BUILTIN + customExercises 통합 조회. 누락 시 fallback (defaultSets=5/Reps=10/Weight=0, equipment=null).
 * 반환: { id, name?, part?, equipment, defaultSets, defaultReps, defaultWeight }
 */
export async function getExerciseDefaults(exerciseId) {
  if (!exerciseId) throw new Error('[gymSession] getExerciseDefaults: exerciseId 누락');
  const builtin = getBuiltinExercise(exerciseId);
  if (builtin) return builtin;
  try {
    const customs = await listCustomExercises();
    const c = customs.find((x) => x.id === exerciseId);
    if (c) return c;
  } catch (_) { /* db 없음 fallback */ }
  return {
    id: exerciseId,
    equipment: null,
    defaultSets: 5,
    defaultReps: 10,
    defaultWeight: 0,
  };
}

/**
 * spec §6-3-3 ② 우선순위 — 가장 최근 completed 세션에서 같은 운동의 sets 반환.
 *  - status='completed' 만 (active 는 진행 중).
 *  - date 내림차순 → 같은 date 는 endTime 내림차순.
 *  - blocks 의 type='single' && exerciseId 매치 블록의 sets (배열). 매치 없으면 null.
 *  - circuit 블록은 폐기 (spec §16) — single 만 처리.
 */
export async function getPrevSessionLastSets(exerciseId) {
  if (!exerciseId) throw new Error('[gymSession] getPrevSessionLastSets: exerciseId 누락');
  try {
    const db = (typeof window !== 'undefined' ? window.gymDB : null);
    if (!db) return null;
    const rows = await db.sessions.where('status').equals('completed').toArray();
    if (!rows.length) return null;
    rows.sort((a, b) => {
      const da = String(a.date || ''), dbS = String(b.date || '');
      if (da !== dbS) return da < dbS ? 1 : -1;
      return (b.endTime || 0) - (a.endTime || 0);
    });
    for (const session of rows) {
      const block = (session.blocks || []).find(
        (b) => b && b.type === 'single' && b.exerciseId === exerciseId,
      );
      if (block && Array.isArray(block.sets) && block.sets.length) {
        return block.sets;
      }
    }
    return null;
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) return null;
    console.error('[gymSession] getPrevSessionLastSets', e);
    return null;
  }
}

/**
 * 직전 세션(가장 최근 완료) 의 총 볼륨 — 우상단 세션 단위 비교용 (워크아웃 전체).
 *  - 완료 시 저장된 totalVolume 필드 사용 (모든 done 세트 weight×reps 합, §6-6 v2.2).
 *  - 현재 active 세션(excludeId) 제외. 직전 기록 없으면 0.
 */
export async function getPrevSessionTotalVolume(excludeId) {
  try {
    const db = (typeof window !== 'undefined' ? window.gymDB : null);
    if (!db) return 0;
    const rows = await db.sessions.where('status').equals('completed').toArray();
    const completed = rows.filter((r) => r && r.id !== excludeId);
    if (!completed.length) return 0;
    completed.sort((a, b) => {
      const da = String(a.date || ''), dbS = String(b.date || '');
      if (da !== dbS) return da < dbS ? 1 : -1;
      return (b.endTime || 0) - (a.endTime || 0);
    });
    return Number(completed[0].totalVolume) || 0;
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) return 0;
    console.error('[gymSession] getPrevSessionTotalVolume', e);
    return 0;
  }
}

/**
 * spec §6-3-3 ③ 운동 기본값 prefill — defaultSets 개수만큼 preset:true 객체.
 *  - cardio (equipment='cardio'): weight=null, reps=null (시간 기반은 별 wave)
 *  - bodyweight (equipment='bodyweight'): weight=null
 *  - 일반: weight=defaultWeight, reps=defaultReps
 */
export function buildPresetSets(exercise) {
  if (!exercise) return [];
  const count = Math.max(1, Number.isFinite(exercise.defaultSets) ? exercise.defaultSets : 5);
  const reps = Number.isFinite(exercise.defaultReps) ? exercise.defaultReps : 10;
  const weight = Number.isFinite(exercise.defaultWeight) ? exercise.defaultWeight : 0;
  const isCardio = exercise.equipment === 'cardio';
  const isBodyweight = exercise.equipment === 'bodyweight';
  const sets = [];
  // cardio 는 단일 세트 (spec §6-4 — 1운동 = 1기록). count 무시.
  const finalCount = isCardio ? 1 : count;
  for (let i = 0; i < finalCount; i += 1) {
    const base = {
      weight: isCardio || isBodyweight ? null : weight,
      reps: isCardio ? null : reps,
      done: false,
      preset: true,
      pr: false,
    };
    if (isCardio) {
      base.duration = null;
      base.distance = null;
    }
    sets.push(base);
  }
  return sets;
}

/**
 * 단일 운동 추가. spec §6-1 — 첫 운동 추가 순간이 startTime.
 *  - 중복 (single 블록 중 같은 exerciseId) → added=false, reason='duplicate'
 *  - circuit 블록 (§16 폐기) 은 graceful skip — 데이터 마이그레이션 전까지 무시.
 *  - tags 에 part 누적 (중복 방지)
 *  - sets prefill (§6-3-3 ③) — defaultSets 개수만큼 preset:true
 *  - 반환: { session, added: boolean, reason? }
 */
export async function addExerciseToActiveSession(exerciseId, part) {
  if (!exerciseId) throw new Error('[gymSession] addExercise: exerciseId 누락');
  const session = await getOrCreateActiveSession();
  const exists = (session.blocks || []).some(
    (b) => b && b.type === 'single' && b.exerciseId === exerciseId,
  );
  if (exists) return { session, added: false, reason: 'duplicate' };

  // spec §6-3-3 — 우선순위 ② 이전 세션 → ③ 운동 기본값.
  const prevSets = await getPrevSessionLastSets(exerciseId);
  let sets;
  if (prevSets && prevSets.length) {
    // 이전 세션 sets 값 그대로 — weight/reps + cardio 의 duration/distance 도 보존.
    sets = prevSets.map((s) => {
      const next = {
        weight: s?.weight ?? null,
        reps: s?.reps ?? null,
        done: false,
        preset: true,
        pr: false,
      };
      if (s && (s.duration != null || s.distance != null)) {
        next.duration = s.duration ?? null;
        next.distance = s.distance ?? null;
      }
      return next;
    });
  } else {
    const exercise = await getExerciseDefaults(exerciseId);
    sets = buildPresetSets(exercise);
  }

  if (!session.startTime) session.startTime = Date.now();
  session.blocks = [
    ...(session.blocks || []),
    { type: 'single', exerciseId, sets },
  ];
  if (part && !(session.tags || []).includes(part)) {
    session.tags = [...(session.tags || []), part];
  }
  await upsertSession(session);
  return { session, added: true };
}

/**
 * 운동 제거 (토글 OFF). spec §6-2 다중 추가/제거 자유 — single 블록만 처리.
 *  - blocks 에서 type==='single' && exerciseId 일치 첫 매치 제거
 *  - 해당 part 의 다른 single 블록이 더 없으면 tags 에서도 part 제거
 *  - 서킷 폐기 (spec §16) — single 블록만 처리
 *  - 반환: { session, removed: boolean, reason? }
 */
export async function removeExerciseFromActiveSession(exerciseId) {
  if (!exerciseId) throw new Error('[gymSession] removeExercise: exerciseId 누락');
  const session = await getOrCreateActiveSession();
  const blocks = Array.isArray(session.blocks) ? session.blocks.slice() : [];
  const idx = blocks.findIndex((b) => b && b.type === 'single' && b.exerciseId === exerciseId);
  if (idx === -1) return { session, removed: false, reason: 'not_found' };
  const removed = blocks[idx];
  blocks.splice(idx, 1);
  let tags = Array.isArray(session.tags) ? session.tags.slice() : [];
  const removedPart = removed && (removed.part || (await getExerciseDefaults(exerciseId).catch(() => null))?.part);
  if (removedPart) {
    const stillUsed = blocks.some(
      (b) => b && b.type === 'single' && (b.part === removedPart || (b.exerciseId && tagPartMatchHint(b.exerciseId, removedPart))),
    );
    if (!stillUsed) tags = tags.filter((t) => t !== removedPart);
  }
  const next = { ...session, blocks, tags };
  await upsertSession(next);
  return { session: next, removed: true };
}

function tagPartMatchHint(otherExerciseId, part) {
  const builtin = getBuiltinExercise(otherExerciseId);
  return builtin ? builtin.part === part : false;
}

/**
 * 세트 완료(좌 스와이프) 시 Dexie blocks[i].sets[setIdx] 갱신. spec §6-3-1.
 *
 * mocks/session.html 의 completeCurrentSet 에서 fire-and-forget 호출.
 * mapNameToExerciseId (Wave 11.7.3b) 로 한국어 exerciseName → exerciseId 매핑 후
 * 활성 세션의 매칭 single 블록 찾아 sets[setIdx] 만 부분 갱신 (preset 강제 false).
 *
 * input: { exerciseName, setIdx, set: { weight, reps, done, pr } }
 * 반환:
 *   { ok: true, exerciseId } — 정상
 *   { ok: false, reason: 'no_active_session'|'no_match'|'index_out_of_range'|'invalid_input'|'no_db'|'error' }
 *
 * setIdx 가 sets.length 초과 — 'index_out_of_range' (mocks 의 새 세트 push 는 Wave 11.9.4 책임).
 */
export async function persistSetCommit({ exerciseName, setIdx, set } = {}) {
  if (!exerciseName || !Number.isFinite(setIdx) || setIdx < 0 || !set || typeof set !== 'object') {
    return { ok: false, reason: 'invalid_input' };
  }
  const exerciseId = mapNameToExerciseId(exerciseName);
  try {
    const session = await getActiveSession();
    if (!session) return { ok: false, reason: 'no_active_session' };
    const blocks = session.blocks || [];
    const blockIdx = blocks.findIndex(
      (b) => b && b.type === 'single' && b.exerciseId === exerciseId,
    );
    if (blockIdx === -1) return { ok: false, reason: 'no_match', exerciseId };
    const block = blocks[blockIdx];
    const sets = Array.isArray(block.sets) ? block.sets.slice() : [];
    if (setIdx >= sets.length) {
      return { ok: false, reason: 'index_out_of_range', exerciseId };
    }
    const prev = sets[setIdx] || {};
    sets[setIdx] = {
      // prev 스프레드 — cardio 의 duration·distance 등 명시 키 외 필드 보존.
      // (구버전이 5개 키로 재구성해 cardio 입력값이 스와이프 완료 시 유실 — 2026-06-10 사용자 보고)
      ...prev,
      weight: set.weight === undefined ? prev.weight : set.weight,
      reps: set.reps === undefined ? prev.reps : set.reps,
      duration: set.duration === undefined ? prev.duration : set.duration,
      distance: set.distance === undefined ? prev.distance : set.distance,
      done: set.done === undefined ? true : !!set.done,
      preset: false,
      pr: !!set.pr,
    };
    const nextBlocks = blocks.slice();
    nextBlocks[blockIdx] = { ...block, sets };
    const nextSession = { ...session, blocks: nextBlocks };
    await upsertSession(nextSession);
    return { ok: true, exerciseId };
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) {
      return { ok: false, reason: 'no_db' };
    }
    console.error('[gymSession] persistSetCommit', e);
    return { ok: false, reason: 'error', error: e?.message };
  }
}

/**
 * spec §7 종료 흐름 — active session 을 completed 로 마감.
 *  - status='active' 1건 찾아 endTime/durationMin/totalVolume/totalCalories 계산 후 status='completed'.
 *  - totalVolume = 모든 single 블록의 done 세트의 weight × reps 합산.
 *  - totalCalories = durationMin × 5.5 (mocks 답습 — 평균 MET. spec §7-3 정확 공식은 체중 통합 별 wave).
 *  - durationMin = (endTime - startTime) / 60_000, 최소 1.
 *
 * 반환:
 *   { ok: true, session } — finalize 성공
 *   { ok: false, reason: 'no_active_session'|'no_db'|'error' }
 */
/**
 * 운동 완료·세션 종료 시 입력 안 된 (done !== true) 빈 세트 제거.
 * 좌 스와이프 auto-append (line 2202·2219) + 사용자 미입력 세트 모두 일괄 정리.
 *  - block.type !== 'single' 은 통과 (sets 의미 single 전용)
 *  - kept.length === sets.length 면 같은 참조 반환 (no-op fast path)
 */
function pruneEmptySets(block) {
  if (!block || block.type !== 'single' || !Array.isArray(block.sets)) return block;
  const kept = block.sets.filter((s) => s && s.done === true);
  if (kept.length === block.sets.length) return block;
  return { ...block, sets: kept };
}

/**
 * 운동 완료 후 현재 종목 — 첫 미완료(finishedAt 없음) single block idx (원래 인덱스 순서).
 * 서킷 재정렬상 완료분은 좌측에 완료순으로 쌓이고, 남은 것 중 첫째가 현재가 된다 (사용자 결정 2026-06-22).
 * 전부 완료면 null (방금 완료한 카드 그대로 read-only 유지).
 * spec §16 — circuit/cardio 폐기, single 만 대상.
 */
function findFirstUnfinishedBlock(session) {
  if (!session || !Array.isArray(session.blocks)) return null;
  for (let i = 0; i < session.blocks.length; i += 1) {
    const b = session.blocks[i];
    if (b && b.type === 'single' && !isBlockDone(b)) return i;
  }
  return null;
}

/**
 * 사용자가 명시적으로 "완료" 액션을 누른 운동 (block.finishedAt marker).
 * 회색 read-only 표시 + 스와이프·증감 차단 가드.
 * 단순 "모든 set done" 만으로는 read-only 아님 (기존 push/revert 동작 보존).
 */
function isBlockLocked(block) {
  return !!(block && Number.isFinite(block.finishedAt));
}

export async function finalizeActiveSession(opts = {}) {
  try {
    // opts.session 명시 시 그 세션을 마감 (sweepStaleSessions 가 최신 아닌 고아 active 를 지정). 없으면 최신 active.
    const session = opts.session || await getActiveSession();
    if (!session) return { ok: false, reason: 'no_active_session' };

    // 완료(done) 세트만 보존 후, 완료 세트 0개인 single 운동 블록은 통째 제거
    // (현재 세트는 완료 세트 아님 — 미수행 운동은 저장 안 함).
    const blocks = (Array.isArray(session.blocks) ? session.blocks : [])
      .map(pruneEmptySets)
      .filter((b) => !(b && b.type === 'single' && Array.isArray(b.sets) && b.sets.length === 0));
    const totalVolume = blocks.reduce((sum, b) => {
      if (!b || b.type !== 'single') return sum;
      const sets = Array.isArray(b.sets) ? b.sets : [];
      return sum + sets.reduce((s, set) => {
        if (!set || !set.done) return s;
        return s + (Number(set.weight) || 0) * (Number(set.reps) || 0);
      }, 0);
    }, 0);

    const endTime = Number.isFinite(opts.endTime) ? opts.endTime : Date.now();
    const startTime = session.startTime || endTime;
    const durationMin = Math.max(1, Math.round((endTime - startTime) / 60_000));
    const totalCalories = Math.round(durationMin * 5.5);

    const finalized = {
      ...session,
      blocks,
      endTime,
      durationMin,
      totalVolume,
      totalCalories,
      status: 'completed',
    };
    await upsertSession(finalized);
    try {
      if (typeof sessionStorage !== 'undefined' && finalized.id) {
        sessionStorage.setItem('gym.summary.sessionId', finalized.id);
      }
    } catch (_) { /* private mode */ }
    return { ok: true, session: finalized };
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) {
      return { ok: false, reason: 'no_db' };
    }
    console.error('[gymSession] finalizeActiveSession', e);
    return { ok: false, reason: 'error', error: e?.message };
  }
}

/**
 * 이전 날 미완료(active) 세션 자동 마감 — 사용자가 '종료'를 안 눌러 active 로 방치된
 * 지난 운동을 기록으로 살린다(앱 부트스트랩에서 호출, sync hook attach 후).
 *  - 오늘(또는 미래) 날짜 active 는 진행 중일 수 있어 건드리지 않음.
 *  - 완료(done) 세트가 하나라도 있으면 finalize — endTime 은 '지금'이 아니라 마지막 활동
 *    시각(블록 finishedAt 최대, 없으면 startTime)으로 둬 duration 과대계산을 막는다.
 *  - 완료 세트가 전혀 없으면 폐기(discard) — 0볼륨 junk completed 세션 생성 방지.
 *  getActiveSession 은 최신 1건만 반환하므로 여기서 전체 active 를 직접 순회한다.
 */
export async function sweepStaleSessions(now = Date.now()) {
  const db = (typeof window !== 'undefined' ? window.gymDB : null);
  if (!db) return { swept: 0, discarded: 0 };
  const today = toISODate(new Date(now));
  let swept = 0, discarded = 0;
  try {
    const actives = await db.sessions.where('status').equals('active').toArray();
    for (const s of actives) {
      if (!s || String(s.date) >= today) continue; // 오늘/미래 진행중 보존
      const blocks = Array.isArray(s.blocks) ? s.blocks : [];
      const hasDone = blocks.some(
        (b) => b && b.type === 'single' && Array.isArray(b.sets) && b.sets.some((set) => set && set.done),
      );
      try {
        if (!hasDone) {
          await db.sessions.delete(s.id);
          discarded += 1;
          continue;
        }
        const finishedAts = blocks.map((b) => Number(b && b.finishedAt) || 0).filter(Boolean);
        const endTime = finishedAts.length ? Math.max(...finishedAts) : (Number(s.startTime) || now);
        const r = await finalizeActiveSession({ session: s, endTime });
        if (r && r.ok) swept += 1;
      } catch (e) {
        console.error('[gymSession] sweepStaleSessions 세션', s.id, e);
      }
    }
  } catch (e) {
    console.error('[gymSession] sweepStaleSessions', e);
  }
  return { swept, discarded };
}

/**
 * spec §6-3-2 — 키패드 commit 시 sets[setIdx] 의 단일 field (weight 또는 reps) 만 갱신.
 *
 * persistSetCommit 와 차이: 좌 스와이프 commit (done:true) 가 아닌 키패드 입력만.
 *   - done / pr 은 prev 그대로 보존 (commit 안 된 상태 유지)
 *   - preset:false 강제 (사용자 입력 — placeholder 해제)
 *
 * input: { exerciseName, setIdx, field: 'weight'|'reps', value: number }
 * 반환: { ok, exerciseId } 또는 { ok:false, reason: 'no_active_session'|'no_match'|'index_out_of_range'|'invalid_input'|'invalid_field'|'no_db'|'error' }
 */
export async function persistKeypadEdit({ exerciseName, setIdx, field, value } = {}) {
  if (!exerciseName || !Number.isFinite(setIdx) || setIdx < 0 || !field || !Number.isFinite(value)) {
    return { ok: false, reason: 'invalid_input' };
  }
  if (field !== 'weight' && field !== 'reps' && field !== 'duration' && field !== 'distance') {
    return { ok: false, reason: 'invalid_field' };
  }
  const exerciseId = mapNameToExerciseId(exerciseName);
  try {
    const session = await getActiveSession();
    if (!session) return { ok: false, reason: 'no_active_session' };
    const blocks = session.blocks || [];
    const blockIdx = blocks.findIndex(
      (b) => b && b.type === 'single' && b.exerciseId === exerciseId,
    );
    if (blockIdx === -1) return { ok: false, reason: 'no_match', exerciseId };
    const block = blocks[blockIdx];
    const sets = Array.isArray(block.sets) ? block.sets.slice() : [];
    if (setIdx >= sets.length) {
      return { ok: false, reason: 'index_out_of_range', exerciseId };
    }
    const prev = sets[setIdx] || {};
    sets[setIdx] = {
      ...prev,
      [field]: value,
      preset: false,
    };
    const nextBlocks = blocks.slice();
    nextBlocks[blockIdx] = { ...block, sets };
    await upsertSession({ ...session, blocks: nextBlocks });
    return { ok: true, exerciseId };
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) {
      return { ok: false, reason: 'no_db' };
    }
    console.error('[gymSession] persistKeypadEdit', e);
    return { ok: false, reason: 'error', error: e?.message };
  }
}

/**
 * spec §8 — 30초 timer + visibilitychange backstop. mocks state 통째 → active session 의 blocks dump.
 *
 * 좌 스와이프 commit (Wave 11.9.3) / 키패드 commit (Wave 11.12) 안 거치는 변경 (예: 빈 영역 탭 증감)
 * 의 데이터 손실 방지. 30초마다 + 백그라운드 진입 시 mocks state 전체 dump.
 *
 * input: { exerciseName, sets, exerciseStates }
 *   - exerciseName: 현재 운동명 (한국어, mocks state.exerciseName)
 *   - sets: 현재 운동 sets 배열
 *   - exerciseStates: { [name]: { sets, ... } } — mocks 다른 운동 snapshot
 *
 * 처리:
 *   - allStates = { ...exerciseStates, [exerciseName]: { sets } } (현재 운동 우선)
 *   - mapNameToExerciseId 로 영문 매핑
 *   - active session 의 매칭 single 블록 sets replace (preset/done/pr 은 mocks state 그대로 흐름)
 *   - 매칭 없는 mocks 운동 무시 (Wave 11.9.1 의 addExerciseToActiveSession 가 정상 흐름 보장)
 *
 * 반환: { ok, dumped: count } 또는 { ok:false, reason: 'no_active_session'|'invalid_input'|'no_db'|'error' }
 */
export async function dumpActiveSessionFromState(stateData) {
  if (!stateData || typeof stateData !== 'object') {
    return { ok: false, reason: 'invalid_input' };
  }
  const { exerciseName, sets, exerciseStates } = stateData;
  try {
    const session = await getActiveSession();
    if (!session) return { ok: false, reason: 'no_active_session' };

    // 모든 운동 스냅 합치기 — 현재 운동 우선
    const allStates = { ...(exerciseStates || {}) };
    if (exerciseName && Array.isArray(sets)) {
      allStates[exerciseName] = { sets };
    }

    const blocks = Array.isArray(session.blocks) ? session.blocks.slice() : [];
    let dumpedCount = 0;
    for (const [name, snap] of Object.entries(allStates)) {
      if (!snap || !Array.isArray(snap.sets)) continue;
      const exerciseId = mapNameToExerciseId(name);
      const blockIdx = blocks.findIndex(
        (b) => b && b.type === 'single' && b.exerciseId === exerciseId,
      );
      if (blockIdx === -1) continue; // 매칭 없으면 무시
      blocks[blockIdx] = {
        ...blocks[blockIdx],
        sets: snap.sets.map((s) => ({
          weight: s?.weight ?? null,
          reps: s?.reps ?? null,
          done: !!s?.done,
          preset: !!s?.preset,
          pr: !!s?.pr,
        })),
      };
      dumpedCount += 1;
    }

    if (dumpedCount === 0) return { ok: true, dumped: 0 };

    await upsertSession({ ...session, blocks });
    return { ok: true, dumped: dumpedCount };
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) {
      return { ok: false, reason: 'no_db' };
    }
    console.error('[gymSession] dumpActiveSessionFromState', e);
    return { ok: false, reason: 'error', error: e?.message };
  }
}

/* ───────────────────────────── DOM hijack (mocks/session.html) ───────────────────────────── */

/**
 * SessionHeader (§6-6) + Footer + (§6-2) 짧은 탭 wiring.
 *  - .js-session-home click → #/home (empty/active 양쪽 phone wrapper 의 홈 SVG 버튼)
 *  - #sessionEndBtn click → openActionSheet({kind:'session-end'}) (longpress 동일 메뉴, UX 보강)
 *  - #sessionAddexBtn click → body.dataset.state='empty' + mountSessionEmpty hydrate
 * 모두 idempotent (body.dataset.spaShortcuts guard).
 */
export function wireSessionShortcuts(doc) {
  if (!doc) return { wired: 0 };
  if (doc.body?.dataset?.spaShortcuts === '1') return { wired: 0 };

  let wired = 0;

  const homeBtns = doc.querySelectorAll?.('.js-session-home') || [];
  homeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (typeof window !== 'undefined') window.location.hash = '#/home';
    });
    wired += 1;
  });

  const endBtn = doc.getElementById?.('sessionEndBtn');
  if (endBtn) {
    endBtn.addEventListener('click', () => {
      const menu = getActionMenuFor('session-end', endBtn);
      if (!menu) return;
      openActionSheet(doc, {
        ...menu,
        onSelect: (actionId) => handleActionSelect(doc, 'session-end', actionId, endBtn),
      });
    });
    wired += 1;
  }

  const addexBtn = doc.getElementById?.('sessionAddexBtn');
  if (addexBtn) {
    addexBtn.addEventListener('click', () => {
      // spec §6-2 — + 클릭 → 시트 슬라이드업 (transform translateY(0)). §6-10 "DOM 한 번 생성 + transform 토글" 준수.
      // body.dataset.state 토글 폐기 (이전 5c6ef5f 의 풀스크린 토글이 §6-2 의도 위반).
      const sheet = doc.getElementById('sessionAddexSheet');
      const backdrop = doc.getElementById('sessionAddexBackdrop');
      if (!sheet) return;
      sheet.dataset.open = 'true';
      sheet.style.transform = 'translateY(0)';
      if (backdrop) {
        backdrop.dataset.open = 'true';
        backdrop.style.opacity = '1';
        backdrop.style.pointerEvents = 'auto';
      }
      setStatusBarDim(doc, true);
    });
    wired += 1;
  }

  // 백드롭 click → 시트 슬라이드다운 (외부 click 닫힘)
  const addexBackdrop = doc.getElementById?.('sessionAddexBackdrop');
  if (addexBackdrop) {
    addexBackdrop.addEventListener('click', () => {
      const sheet = doc.getElementById('sessionAddexSheet');
      if (sheet) {
        sheet.dataset.open = 'false';
        sheet.style.transform = 'translateY(100%)';
      }
      addexBackdrop.dataset.open = 'false';
      addexBackdrop.style.opacity = '0';
      addexBackdrop.style.pointerEvents = 'none';
      setStatusBarDim(doc, false);
    });
    wired += 1;
  }

  if (doc.body?.dataset) doc.body.dataset.spaShortcuts = '1';
  return { wired };
}

/**
 * Phase B 단계 4 마무리 — mocks/session.html 진입 시 active 세션 유무로 분기.
 *  - active session + 1개 이상의 single 블록 → SessionC active 카드 정적 바인딩 (.session-active)
 *  - 그 외 → SessionEmpty 의 addex 시트 (.session-empty)
 *
 * body[data-state] 토글 ('empty'|'active') 로 가시성 제어 (home.html HomeA/HomeC 패턴).
 * DB 미초기화·active 미존재 모두 graceful — empty branch 로 fallback.
 */
export async function mountSessionView() {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return { skipped: 'no-document' };

  // 커스텀 운동 이름 동기 lookup 캐시 prime — 카드/footer 의 resolveExerciseName 이 cust_* id 대신 이름 표시.
  try { primeCustomExerciseCache(await listCustomExercises()); } catch (_) { /* db 없음 fallback */ }

  const hasActiveCard = !!doc.getElementById('cardExName');
  const hasEmptySheet = !!doc.getElementById('addexChips') && !!doc.getElementById('addexList');
  if (!hasActiveCard && !hasEmptySheet) return { skipped: 'no-mounts' };

  // active session 조회 (DB 미초기화·예외 모두 empty branch 로 fallback)
  let session = null;
  let dbUnavailable = false;
  try {
    session = await getActiveSession();
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) {
      dbUnavailable = true;
    } else {
      console.error('[gymSession] mountSessionView getActiveSession', e);
    }
  }

  const activeBlocks = (session && Array.isArray(session.blocks))
    ? session.blocks.filter((b) => b && b.type === 'single')
    : [];
  const route = !dbUnavailable && activeBlocks.length > 0 && hasActiveCard ? 'active' : 'empty';

  if (doc.body && doc.body.dataset) doc.body.dataset.state = route;

  // SessionHeader §6-6 + Footer + §6-2 — 짧은 탭/click wiring (idempotent).
  // §7-1 꾹누르기 메뉴 외에 short-click 도 동일 메뉴 노출 (UX 보강, 사용자 피드백 반영).
  try { wireSessionShortcuts(doc); } catch (e) { console.error('[gymSession] wireSessionShortcuts', e); }

  if (route === 'active') {
    // (f-5-1) — _currentBlockIdx 가 유효한 single 블록을 가리키면 그 block, 그 외 마지막 single 자동
    let pickedBlock = activeBlocks[activeBlocks.length - 1];
    let pickedIdx = session.blocks.indexOf(pickedBlock);
    if (_currentBlockIdx != null && _currentBlockIdx >= 0 && _currentBlockIdx < session.blocks.length) {
      const candidate = session.blocks[_currentBlockIdx];
      if (candidate && candidate.type === 'single') {
        pickedBlock = candidate;
        pickedIdx = _currentBlockIdx;
      }
    }
    // (f-5-3c) — _currentBlockIdx 항상 displayed block idx 와 동기화. drop 후 보정 일관성.
    _currentBlockIdx = pickedIdx;
    return mountSessionActive(doc, pickedBlock, session);
  }
  return mountSessionEmpty(doc, dbUnavailable);
}

async function mountSessionEmpty(doc, dbUnavailable) {
  const chipsEl = doc.getElementById('addexChips');
  const listEl = doc.getElementById('addexList');
  if (!chipsEl || !listEl) return { skipped: 'no-mounts' };
  if (dbUnavailable) return { skipped: 'no-db' };

  try {
    await renderChips(chipsEl);
    await renderList(listEl);
    hookClicks(chipsEl, listEl);
    return { mounted: true, branch: 'empty', part: _activePart };
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) {
      return { skipped: 'no-db' };
    }
    console.error('[gymSession] mountSessionView empty', e);
    return { error: e?.message };
  }
}

/**
 * SessionC active 카드 정적 바인딩.
 *  - 운동명 / SET N/M / 중량 / 횟수 / 이전 세트 / S1..Sn 도트 / 진행바·볼륨·%
 *  - 마지막 single 블록을 "현재 운동" 으로 사용 (단계 a — 정적).
 *  - currentSetIdx = 첫 un-done set. 모두 done 이면 마지막 set.
 */
async function mountSessionActive(doc, block, session) {
  const sets = Array.isArray(block.sets) ? block.sets : [];
  let cur = sets.findIndex((s) => s && !s.done);
  if (cur === -1) cur = Math.max(0, sets.length - 1);
  const currentSet = sets[cur] || {};

  setTextById(doc, 'cardExName', resolveExerciseName(block.exerciseId));

  // spec §6-4 / §6-3 — equipment 별 카드 분기 (cardio / bodyweight / weight)
  let exerciseEq = 'weight';
  let exPartLabel = '';
  try {
    const exDef = await getExerciseDefaults(block.exerciseId);
    if (exDef?.equipment === 'cardio') exerciseEq = 'cardio';
    else if (exDef?.equipment === 'bodyweight') exerciseEq = 'bodyweight';
    exPartLabel = PARTS[exDef?.part] || '';
  } catch (_) { /* graceful */ }
  applyCardKind(doc, exerciseEq);
  // 작업지시서 §세션 — 타이틀에 부위 1단어.
  setTextById(doc, 'cardExPart', exPartLabel);

  // 우상단 (§6-6 v2.2) — SET N/M 대신 세션 단위 볼륨 (오늘 누적 / 직전 세션 총 볼륨).
  //   set 진행도는 S1..Sn dot 이 이미 표시 → 중복 제거하고 워크아웃 단위 동기부여로 대체.
  //   numerator = 현재 세션 모든 블록 done 세트 volume, denominator = 직전 세션 totalVolume.
  let sessionDoneVol = 0;
  for (const b of (session.blocks || [])) {
    if (!b || b.type !== 'single' || !Array.isArray(b.sets)) continue;
    for (const s of b.sets) {
      if (s && s.done) sessionDoneVol += (Number(s.weight) || 0) * (Number(s.reps) || 0);
    }
  }
  let prevSessionVol = 0;
  try { prevSessionVol = await getPrevSessionTotalVolume(session.id); }
  catch (_) { /* graceful — 직전 기록 없으면 0 */ }
  // P1 라이트 — 타이틀 우상단: 이번(숫자만, kg 라벨은 markup static) / 직전(별도 줄).
  // 우상단 누적(최종값) — 단, count-up 분기는 아래에서 시작값으로 덮어써 역방향 깜빡임 방지(리뷰 #8/#9).
  setTextById(doc, 'cardSetProgress', Math.round(sessionDoneVol).toLocaleString());
  setTextById(doc, 'cardSessVolPrev', prevSessionVol > 0 ? `직전 ${Math.round(prevSessionVol).toLocaleString()}kg` : '');

  const isPreset = !!currentSet.preset;
  // preset/input 모두 흰색 (사용자 가독성 우선) — 구분은 font-weight + setDots accent 로.
  const presetOpacity = '1';
  const cardWeightEl = doc.getElementById('cardWeight');
  const cardRepsEl = doc.getElementById('cardReps');
  // 완료된 운동 (block.finishedAt marker) — 회색 톤 (footer pill done state 와 동일)
  const blockDone = isBlockLocked(block);
  const doneColor = 'var(--ink-4)'; // P1 라이트 — 완료(read-only) 회색 톤
  const cardSetProgressEl = doc.getElementById('cardSetProgress');
  if (cardSetProgressEl) {
    cardSetProgressEl.style.color = blockDone ? doneColor : '';
  }

  if (exerciseEq === 'cardio') {
    const durSec = Number(currentSet.duration) || 0;
    const distKm = Number(currentSet.distance) || 0;
    setTextById(doc, 'cardWeight', String(Math.round(durSec / 60)));
    setTextById(doc, 'cardReps', distKm ? String(distKm) : '0');
    renderCardioPace(doc, durSec, distKm);
  } else if (exerciseEq === 'bodyweight') {
    const reps = Number.isFinite(currentSet.reps) ? currentSet.reps : 0;
    setTextById(doc, 'cardWeight', '맨몸');
    setTextById(doc, 'cardReps', String(reps));
  } else {
    const weight = Number.isFinite(currentSet.weight) ? currentSet.weight : 0;
    const reps = Number.isFinite(currentSet.reps) ? currentSet.reps : 0;
    setTextById(doc, 'cardWeight', String(weight));
    setTextById(doc, 'cardReps', String(reps));
  }

  // spec §6-3-3 — preset/input 모두 opacity 1 (가독성 우선). 구분은 setDots accent + font-weight.
  // blockDone 시 회색 톤 (opacity 는 1 유지, color 만 변경 — 운동 완료 read-only 표시).
  // P1 라이트 — active 무게/횟수는 잉크 1 (가장 진한). blockDone 시 doneColor.
  const activeColor = 'var(--ink-1)';
  if (cardWeightEl) {
    cardWeightEl.style.opacity = blockDone ? '1' : presetOpacity;
    cardWeightEl.style.color = blockDone ? doneColor : activeColor;
  }
  if (cardRepsEl) {
    cardRepsEl.style.opacity = blockDone ? '1' : presetOpacity;
    // 작업지시서 §4 옵션 B — 무게(ink-1 주인공) 대비 횟수는 보조 위계(ink-2).
    cardRepsEl.style.color = blockDone ? doneColor : 'var(--ink-2)';
  }

  // 완료 상태 (§9) — 잠긴 운동(blockDone) 은 히어로를 ✓(sage) + "N세트 완료" 요약으로 (기록 태그는 정적 잔류 → FIG 4).
  //   cardio 는 단일 기록(거리/시간) 이라 ✓ 요약 제외.
  const cardDoneLabelEl = doc.getElementById('cardDoneLabel');
  const cardRepsZoneEl = doc.getElementById('cardRepsZone');
  const cardWeightUnitEl = doc.getElementById('cardWeightUnit');
  if (blockDone && exerciseEq !== 'cardio') {
    const doneSetCount = sets.filter((s) => s && s.done).length;
    if (cardWeightEl) { cardWeightEl.textContent = '✓'; cardWeightEl.style.fontSize = '92px'; cardWeightEl.style.color = 'var(--sage)'; }
    if (cardWeightUnitEl) cardWeightUnitEl.style.display = 'none';
    if (cardRepsZoneEl) cardRepsZoneEl.style.display = 'none';
    if (cardDoneLabelEl) { cardDoneLabelEl.textContent = `${doneSetCount}세트 완료`; cardDoneLabelEl.style.display = 'block'; }
  } else {
    if (cardDoneLabelEl) cardDoneLabelEl.style.display = 'none';
    if (cardRepsZoneEl && exerciseEq !== 'cardio') cardRepsZoneEl.style.display = 'flex'; // inline 복구 ('' = block fallback 방지)
  }

  // 직전 세션 동일 세트번호 lookup — S1..Sn dot 의 preview 표시에 사용 (spec §6-3-3).
  let prevSessionSets = null;
  try {
    prevSessionSets = await getPrevSessionLastSets(block.exerciseId);
  } catch (e) { console.error('[gymSession] prev session lookup', e); }

  // 작업지시서 §3 R1 — 역대 최고(e1RM) 세트 (무게×횟수 슬롯 + 막대 높이 정규화). 무게 종목만·없으면 null(§3-5).
  let bestE1RMRow = null;
  if (exerciseEq === 'weight') {
    try { bestE1RMRow = await getBestE1RM(block.exerciseId); }
    catch (e) {
      if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) console.error('[gymSession] getBestE1RM', e);
    }
  }
  // 작업지시서 §3-3 — 세트바 헤더 '높이 = 강도' 보조 라벨은 무게 종목(높이 인코딩 유효)일 때만.
  const setBarHintEl = doc.getElementById('cardSetBarHint');
  if (setBarHintEl) setBarHintEl.style.display = exerciseEq === 'weight' ? '' : 'none';

  // S1..Sn 도트 — diff-based 갱신 (DOM 유지로 transition 트리거) + 활성 set 가운데 정렬
  const setDotsEl = doc.getElementById('cardSetDots');
  if (setDotsEl) {
    renderSetDotsDiff(setDotsEl, sets, cur, prevSessionSets, exerciseEq, bestE1RMRow);
    const centerActiveSet = () => {
      const active = setDotsEl.querySelector('[data-current="1"]');
      if (!active) return;
      try {
        const containerRect = setDotsEl.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        const activeCenterRel = activeRect.left + activeRect.width / 2 - containerRect.left;
        const targetScrollLeft = setDotsEl.scrollLeft + activeCenterRel - containerRect.width / 2;
        // 첫 정렬(mount 직후 — 새 DOM 이라 dataset.aligned 없음)은 즉시 점프. 컨테이너 inline 의
        // scroll-behavior:smooth 때문에 scrollLeft 대입조차 애니메이션화되므로, 임시로 'auto' 로 덮어
        // 즉시 점프 → 세트 도트가 우→좌 슬라이드되는 "날아오는" 체감 제거 (앱 재개·reload 시).
        // 이후 세트 변경 재정렬(같은 DOM 유지 — renderSetDotsDiff)만 smooth.
        const firstAlign = setDotsEl.dataset.aligned !== '1';
        if (firstAlign) {
          const prevSB = setDotsEl.style.scrollBehavior;
          setDotsEl.style.scrollBehavior = 'auto';
          setDotsEl.scrollLeft = targetScrollLeft;
          setDotsEl.style.scrollBehavior = prevSB;
          setDotsEl.dataset.aligned = '1';
        } else if (typeof setDotsEl.scrollTo === 'function') {
          setDotsEl.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
        } else {
          setDotsEl.scrollLeft = targetScrollLeft;
        }
      } catch (_) { /* fallback */ }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(centerActiveSet);
    else centerActiveSet();
  }

  // 진행바 (§6-7) — 이번 운동 현재 누적 볼륨 / 직전 이 운동의 총 볼륨.
  //   분모는 직전 세션 같은 종목의 총 볼륨(prevSessionSets 합) — "오늘 계획"이 아니라 고정된
  //   "지난번 넘기" 타깃. 분자(done)가 분모를 넘으면 pct>100% (직전 기록 돌파).
  let exDoneVol = 0;
  for (const s of sets) {
    if (s && s.done) exDoneVol += (Number(s.weight) || 0) * (Number(s.reps) || 0);
  }
  let prevExVol = 0;
  if (Array.isArray(prevSessionSets)) {
    for (const s of prevSessionSets) {
      const r = Number(s?.reps) || 0;
      if (r > 0) prevExVol += (Number(s?.weight) || 0) * r; // 의미값(reps>0) 만
    }
  }
  // 직전 기록 없으면(첫 세션) 오늘 계획 볼륨으로 폴백 — 바가 빈 채로 남지 않게.
  let denom = prevExVol;
  if (denom <= 0) {
    for (const s of sets) denom += (Number(s?.weight) || 0) * (Number(s?.reps) || 0);
  }
  const pct = denom > 0 ? Math.round((exDoneVol / denom) * 100) : 0;
  const widthPct = Math.min(100, pct); // 바 fill 은 100% cap, 초과는 over 상태(§7-over) 로
  const bar = doc.getElementById('cardProgressBar');
  const edge = doc.getElementById('volEdge');
  const exVolText = (v) => (prevExVol > 0
    ? `${Math.round(v).toLocaleString()} / 직전 ${Math.round(denom).toLocaleString()}kg`
    : `${Math.round(v).toLocaleString()} / ${Math.round(denom).toLocaleString()}kg`);
  const RMV = prefersReducedMotion();
  // 커밋 카운트업 — handleLeftSwipe 가 세운 1회성 커밋 플래그가 이 종목과 일치 + 직전 렌더 대비 exDoneVol 증가 + 비-RM.
  //   키패드 done-세트 수정·탭증감·우스와이프·reload 는 플래그 없음 → 오발화 차단 (리뷰 #6).
  const prevExNum = bar ? Number(bar.dataset.exVol) : NaN;
  const sameEx = bar && bar.dataset.exId === block.exerciseId && Number.isFinite(prevExNum);
  const isCommit = _justCommittedExId === block.exerciseId;
  const countUp = sameEx && exDoneVol > prevExNum && !RMV && isCommit;
  const topBefore = sessionDoneVol - (exDoneVol - (Number.isFinite(prevExNum) ? prevExNum : exDoneVol));
  if (countUp) {
    // 바·엣지는 CSS transition(620ms) 가 자동으로 width/left 보간 (DOM 영속).
    if (bar) bar.style.width = `${widthPct}%`;
    if (edge) edge.style.left = `${widthPct}%`;
    // 시작값 즉시 세팅 — 725 의 cardSetProgress 최종값 선-paint 역방향 점프 방지 (animNum 첫 tick 은 다음 프레임, 리뷰 #8/#9).
    setTextById(doc, 'cardProgressVol', exVolText(prevExNum));
    setTextById(doc, 'cardSetProgress', Math.round(topBefore).toLocaleString());
    animNum(prevExNum, exDoneVol, 620, (v, isFinal) => {
      setTextById(doc, 'cardProgressVol', exVolText(isFinal ? exDoneVol : v));
      setTextById(doc, 'cardSetProgress', Math.round(isFinal ? sessionDoneVol : topBefore + (v - prevExNum)).toLocaleString());
    });
  } else {
    // 첫 마운트 / 종목 변경 / 감소 / reduced-motion / 비-커밋 → 즉시 (transition 일시 차단으로 fill-in 방지).
    if (bar) { const t = bar.style.transition; bar.style.transition = 'none'; bar.style.width = `${widthPct}%`; void bar.offsetWidth; bar.style.transition = t; }
    if (edge) { const t = edge.style.transition; edge.style.transition = 'none'; edge.style.left = `${widthPct}%`; void edge.offsetWidth; edge.style.transition = t; }
    setTextById(doc, 'cardProgressVol', exVolText(exDoneVol));
  }
  if (bar) { bar.dataset.exVol = String(exDoneVol); bar.dataset.exId = String(block.exerciseId); }
  setTextById(doc, 'cardProgressPct', `${pct}%`);

  // over(직전 기록 돌파) 상태 (§7) — 정적 (reload/재렌더 반영). prevExVol>0 (실제 직전 기록 존재) 한정.
  const exOver = prevExVol > 0 && exDoneVol >= prevExVol;
  const volGoalEl = doc.getElementById('volGoal');
  const volMarkCapEl = doc.getElementById('volMarkCap');
  const volBreakEl = doc.getElementById('volBreak');
  const volBreakAmtEl = doc.getElementById('volBreakAmt');
  if (bar) bar.classList.toggle('is-over', exOver);
  if (volGoalEl) volGoalEl.classList.toggle('broken', exOver);
  if (volMarkCapEl) volMarkCapEl.style.opacity = exOver ? '0' : '';
  if (volBreakEl) {
    if (exOver) {
      if (volBreakAmtEl) volBreakAmtEl.textContent = `+${Math.round(exDoneVol - prevExVol).toLocaleString()}kg`;
      volBreakEl.style.opacity = '1'; // inline opacity 로 가시성 보장 — 모션은 transform 만 (§7 콜아웃, throttle 시 0 갇힘 방지)
    } else {
      volBreakEl.style.opacity = '0';
    }
  }
  // 돌파 순간 1회성 — 커밋 증가(countUp) + 임계 교차 시 버스트 + 바 팝 + 태그 rise-in.
  if (countUp && prevExNum < prevExVol && exDoneVol >= prevExVol) exRecordBurst(doc);

  // 우상단 워크아웃 총볼륨 신기록 (§8) — 정적 (reload/재렌더 반영). prevSessionVol>0 + 오늘 누적이 직전 총볼륨 초과 시.
  const topRecord = prevSessionVol > 0 && sessionDoneVol > prevSessionVol;
  const sessPrevEl = doc.getElementById('cardSessVolPrev');
  const recordTagEl = doc.getElementById('cardRecordTag');
  if (sessPrevEl) sessPrevEl.classList.toggle('struck', topRecord);
  if (recordTagEl) {
    if (topRecord) {
      recordTagEl.innerHTML = `<span class="arw" style="font-size:8px;line-height:1;">▲</span> 신기록 +${Math.round(sessionDoneVol - prevSessionVol).toLocaleString()}kg`;
      recordTagEl.style.opacity = '1';
    } else {
      recordTagEl.style.opacity = '0';
    }
  }
  // 우상단 총볼륨 링 (§8) — 오늘 누적 / 직전 총볼륨 비율로 채움. 돌파 시 완성(offset 0) + 펄스.
  //   prevSessionVol 없으면(첫 세션) 빈 링. CSS transition 으로 채움 애니, count-up 숫자와 동기.
  const ringFill = doc.getElementById('cardVolRingFill');
  const ringPulse = doc.getElementById('cardVolRingPulse');
  if (ringFill) {
    const RING_C = 100.53; // 2π·16 (반지름 16)
    const ratio = prevSessionVol > 0 ? Math.min(1, sessionDoneVol / prevSessionVol) : 0;
    ringFill.style.strokeDashoffset = String(RING_C * (1 - ratio));
  }
  // 시안 §A — 링 가운데 직전 대비 달성률 %. 직전 기록 없으면 '—'.
  const ringPct = doc.getElementById('cardVolRingPct');
  if (ringPct) {
    ringPct.textContent = prevSessionVol > 0
      ? `${Math.round((sessionDoneVol / prevSessionVol) * 100)}%`
      : '—';
  }
  if (ringPulse) ringPulse.classList.toggle('is-record', topRecord);
  // 신기록 순간 1회성 — 커밋 증가(countUp) + 임계 교차 시 누적 숫자 펄스 + 태그 rise-in.
  if (countUp && topBefore <= prevSessionVol && sessionDoneVol > prevSessionVol) topRecordPulse(doc);
  _justCommittedExId = null; // 커밋 1회성 신호 소비 — 다음 재렌더(키패드·탭증감 등)는 비-커밋.

  // P1 라이트 — PR 칩(progressive overload 넛지). 현재 무게가 직전 세션 동일 종목 최대 무게 초과 시 +Δkg.
  //   기존 데이터(prevSessionSets)만 사용 — 새 PR 로직 발명 X. weight 종목·미완료 블록 한정.
  try {
    const prChip = doc.getElementById('cardPrChip');
    const prChipVal = doc.getElementById('cardPrChipVal');
    if (prChip && prChipVal) {
      let show = false;
      if (exerciseEq === 'weight' && !blockDone && Array.isArray(prevSessionSets)) {
        const curW = Number(currentSet.weight) || 0;
        let prevMax = 0;
        for (const s of prevSessionSets) {
          const w = Number(s?.weight) || 0;
          if ((Number(s?.reps) || 0) > 0 && w > prevMax) prevMax = w;
        }
        const delta = curW - prevMax;
        if (prevMax > 0 && delta > 0) {
          prChipVal.textContent = `+${Number.isInteger(delta) ? delta : delta.toFixed(1)}kg`;
          show = true;
        }
      }
      // absolute 슬롯(흐름 밖) — opacity 토글로 무게·횟수 레이아웃 불변 (display 토글 시 재중앙정렬 떨림 제거).
      prChip.style.opacity = show ? '1' : '0';
    }
  } catch (e) { console.error('[gymSession] PR chip', e); }

  // (f-5-1) spec §6-8 — footer nav pill 동적 렌더 + click handler
  try { renderFooterPills(doc, session, block); } catch (e) { console.error('[gymSession] renderFooterPills', e); }
  try { wireFooterPillClick(doc); } catch (e) { console.error('[gymSession] wireFooterPillClick', e); }
  // (f-5-3a) spec §6-9 — reorder mode drag 추적 (idempotent)
  try { wireReorderDrag(doc); } catch (e) { console.error('[gymSession] wireReorderDrag', e); }

  // spec §6-3-1 — 스와이프 핸들러 wire (idempotent — dataset.spaHooked guard)
  try { wireSwipeHandlers(doc); } catch (e) { console.error('[gymSession] wireSwipeHandlers', e); }
  // 세션 헤더 타이머 — session.startTime 부터 경과 MM:SS 1초 갱신.
  // 이전 mount 의 interval 은 cleanup 후 새로 set (재마운트 시 중복 방지).
  try {
    const sessionTimeEl = doc.getElementById('sessionTime');
    if (sessionTimeEl && session.startTime) {
      const renderTime = () => {
        const elapsedSec = Math.max(0, Math.floor((Date.now() - session.startTime) / 1000));
        const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const ss = String(elapsedSec % 60).padStart(2, '0');
        sessionTimeEl.textContent = `${mm}:${ss}`;
      };
      renderTime();
      if (typeof window !== 'undefined') {
        if (window._gymSessionTimerId) clearInterval(window._gymSessionTimerId);
        window._gymSessionTimerId = setInterval(renderTime, 1000);
      }
    }
  } catch (e) { console.error('[gymSession] sessionTimer', e); }

  // spec §6-3-2 — 키패드 시트 wire (idempotent — sheet.dataset.spaHooked guard)
  try { wireKeypad(doc); } catch (e) { console.error('[gymSession] wireKeypad', e); }
  // spec §6-9 — 액션 시트 wire + 꾹누르기 → 액션 시트 open 연결
  try { wireActionSheet(doc); } catch (e) { console.error('[gymSession] wireActionSheet', e); }
  try {
    wireLongPress(doc, {
      onTrigger: ({ kind, target }) => {
        // (f-3a) 교차 취소 — hold 발화 시 같은 element 의 swipe tracking 무력화
        if (typeof target?._swipeReset === 'function') target._swipeReset();
        const menu = getActionMenuFor(kind, target);
        if (!menu) return;
        // (f-3 wiring) — onSelect 를 handleActionSelect 디스패처로 교체 (진짜 핸들러)
        openActionSheet(doc, {
          ...menu,
          onSelect: (actionId) => handleActionSelect(doc, kind, actionId, target),
        });
      },
      // footer-exercise armed-for-drag : long-press hold + move 시 reorder drag 진입.
      // setReorderMode 로 pillsEl.dataset.reorder='1' set 후 가짜 pointerdown dispatch →
      // wireReorderDrag 의 pointerdown 핸들러가 drag init (dragging=true, setPointerCapture).
      // 이후 사용자 실제 pointermove/pointerup 은 wireReorderDrag 가 처리.
      onArmedDrag: ({ kind, target, pointerEvent }) => {
        if (kind !== 'footer-exercise') return;
        const blockIdx = parseInt(target.dataset.blockIdx, 10);
        if (!Number.isFinite(blockIdx)) return;
        setReorderMode(doc, true, blockIdx);
        try {
          const fake = new PointerEvent('pointerdown', {
            bubbles: true, cancelable: true,
            pointerId: pointerEvent.pointerId,
            pointerType: pointerEvent.pointerType,
            clientX: pointerEvent.clientX,
            clientY: pointerEvent.clientY,
            button: 0,
          });
          fake.__lpDispatched = true; // wireLongPress 재발화 방지 marker
          target.dispatchEvent(fake);
        } catch (err) { console.error('[gymSession] armedDrag dispatch', err); }
      },
    });
  } catch (e) { console.error('[gymSession] wireLongPress', e); }

  // spec §6-2 — active 분기 운동 추가 시트 hydrate (DOM 한 번 생성 + transform 토글).
  // wireSessionShortcuts 의 + 버튼 핸들러가 sheet.dataset.open='true' 토글 + transform 슬라이드업.
  // mount 시 시트 open 상태면 유지 (운동 토글 후 mountSessionView remount 흐름에서 시트 가시 유지).
  try {
    const sSheet = doc.getElementById('sessionAddexSheet');
    const sBackdrop = doc.getElementById('sessionAddexBackdrop');
    // 처음 mount (시트 dataset.open 미설정 또는 'false') 만 hidden 으로 reset. 열린 상태 mount = 유지.
    if (sSheet && sSheet.dataset.open !== 'true') {
      sSheet.dataset.open = 'false';
      sSheet.style.transform = 'translateY(100%)';
      if (sBackdrop) {
        sBackdrop.dataset.open = 'false';
        sBackdrop.style.opacity = '0';
        sBackdrop.style.pointerEvents = 'none';
      }
      setStatusBarDim(doc, false); // 시트 닫힌 상태 mount — status bar dim 잔존 방지
    }
    const sChipsEl = doc.getElementById('sessionAddexChips');
    const sListEl = doc.getElementById('sessionAddexList');
    if (sChipsEl && sListEl) {
      await renderChips(sChipsEl);
      await renderList(sListEl);
      hookClicks(sChipsEl, sListEl);
    }
  } catch (e) { console.error('[gymSession] active 시트 hydrate', e); }

  return { mounted: true, branch: 'active', exerciseId: block.exerciseId, currentSetIdx: cur };
}

function setTextById(doc, id, text) {
  const el = doc.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * spec §6-4 + §6 — equipment 별 카드 분기. data-card-kind 어트리뷰트 + 단위 라벨/
 * setDots/progressbar visibility 동시 토글. CSS 의존 없이 inline 으로 처리.
 */
function applyCardKind(doc, kind) {
  const area = doc.getElementById('cardSwipeArea');
  if (area) area.setAttribute('data-card-kind', kind);
  const weightUnit = doc.getElementById('cardWeightUnit');
  const repsUnit = doc.getElementById('cardRepsUnit');
  const weightEl = doc.getElementById('cardWeight');
  const setDotsEl = doc.getElementById('cardSetDots');
  const paceEl = doc.getElementById('cardPaceZone');
  const progressBar = doc.getElementById('cardProgressBar');
  const progressVol = doc.getElementById('cardProgressVol');
  const progressPct = doc.getElementById('cardProgressPct');
  // mocks/session.html 의 cardSetDots / progressVol 부모는 inline display:flex.
  // style.display='' 는 inline 을 wipe → block 으로 fallback (세로 쌓임 회귀).
  // 따라서 hide 외엔 'flex' 로 명시. progressBar 부모는 inline display 없음 → 'block' 명시.
  const setProgressVis = (show) => {
    if (progressBar?.parentElement) progressBar.parentElement.style.display = show ? 'block' : 'none';
    if (progressVol?.parentElement) progressVol.parentElement.style.display = show ? 'flex' : 'none';
  };
  // P1 라이트 — weight 종목은 KG 라벨 없음(단위 숨김), 큰 숫자 중앙. cardio 만 '분' 단위 노출.
  if (kind === 'cardio') {
    if (weightUnit) { weightUnit.textContent = '분'; weightUnit.style.display = 'block'; }
    if (repsUnit) repsUnit.textContent = 'km';
    if (weightEl) weightEl.style.fontSize = '120px';
    if (setDotsEl) setDotsEl.style.display = 'none';
    if (paceEl) paceEl.style.display = 'block';
    setProgressVis(false);
  } else if (kind === 'bodyweight') {
    if (weightUnit) { weightUnit.textContent = ''; weightUnit.style.display = 'none'; }
    if (repsUnit) repsUnit.textContent = '회';
    if (weightEl) weightEl.style.fontSize = '64px';
    if (setDotsEl) setDotsEl.style.display = 'flex';
    if (paceEl) paceEl.style.display = 'none';
    setProgressVis(true);
  } else {
    // 작업지시서 §C 옵션 B — weight 종목은 'kg' 단위 라벨 노출 (무게 주인공 + 단위 명확).
    if (weightUnit) { weightUnit.textContent = 'kg'; weightUnit.style.display = 'block'; }
    if (repsUnit) repsUnit.textContent = '회';
    if (weightEl) weightEl.style.fontSize = '122px'; // 작업지시서 §4 히어로 weight 122px
    if (setDotsEl) setDotsEl.style.display = 'flex';
    if (paceEl) paceEl.style.display = 'none';
    setProgressVis(true);
  }
}

function renderCardioPace(doc, durSec, distKm) {
  const el = doc.getElementById('cardPaceZone');
  if (!el) return;
  if (!durSec || !distKm) { el.textContent = ''; return; }
  const paceSecPerKm = durSec / distKm;
  const mm = Math.floor(paceSecPerKm / 60);
  const ss = Math.round(paceSecPerKm % 60);
  el.textContent = `${mm}:${String(ss).padStart(2, '0')}/km`;
}

/**
 * dot 표시 값 결정. spec §6-3-3 프리셋 우선순위:
 *  - done/current: 실제 sets[i] 값 (accent 톤)
 *  - 미입력 preview: ① 이전 세션 같은 세트번호 (지난 기록을 세트별 타깃으로 우선 표시)
 *                  → ② 이번 세션 직전 세트 (done 또는 현재 세트 값) → ③ sets[i] 자체 preset → '—'. preview 는 회색 톤.
 *  - kind='bodyweight': weight 무시, reps 만으로 값 판정·표기 ("15"). 그 외: "weight·reps".
 */
export function resolveDotDisplay(sets, i, cur, prevSessionSets, kind = 'weight') {
  const bw = kind === 'bodyweight';
  const set = sets[i];
  const isCurrent = i === cur;
  const isDone = !!(set && set.done);
  // 표기 가능 값 (맨몸은 reps 만, 그 외 weight+reps)
  const hasVal = (s) => !!(s && Number.isFinite(s.reps) && (bw || Number.isFinite(s.weight)));
  const fmt = (s) => (bw ? `${s.reps}` : `${s.weight}·${s.reps}`);
  // 전파·상속용 의미값 — reps>0 (합성 0·0 미입력 제외)
  const meaningful = (s) => hasVal(s) && s.reps > 0;
  // current: 항상 실제 값 (실시간 입력) — 값 없으면 '—'
  if (isCurrent) {
    return { text: hasVal(set) ? fmt(set) : '—', isPreview: false };
  }
  // done && 값 있음: 입력 완료 — 실제 값 accent
  if (isDone && hasVal(set)) {
    return { text: fmt(set), isPreview: false };
  }
  // preview 폴백 — 세트바는 "직전 세션 기록" 이므로 직전 세션 값이 우선이고, 직전에 없으면 '—'.
  // ① 이전 세션 같은 세트번호 — 지난번 기록이 있으면 세트별 타깃으로 표시.
  const p = prevSessionSets && prevSessionSets[i];
  if (hasVal(p)) {
    return { text: fmt(p), isPreview: true };
  }
  // 직전 세션이 존재하지만 이 세트번호엔 기록이 없음(직전보다 세트를 더 추가) → '—'.
  // 구현 레퍼런스 - 세션.html 정합: 직전에 없던 세트는 현재 세션 값으로 전파하지 않는다.
  if (Array.isArray(prevSessionSets) && prevSessionSets.length > 0) {
    return { text: '—', isPreview: true };
  }
  // 직전 세션 자체가 없을 때만(첫 운동) — 전부 '—' 방지 위해 현재 세션 값 폴백/전파:
  // ② 이번 세션 직전 세트 (이전의 done 세트 또는 현재 세트 값).
  for (let j = i - 1; j >= 0; j -= 1) {
    const s = sets[j];
    if (meaningful(s) && (s.done || j === cur)) {
      return { text: fmt(s), isPreview: true };
    }
  }
  // ③ sets[i] preset
  if (hasVal(set)) return { text: fmt(set), isPreview: true };
  return { text: '—', isPreview: true };
}

/**
 * 작업지시서 §B — 세트바 2줄 표기. resolveDotDisplay 의 text 를 중량(굵게)+×횟수(작게) 로 분리.
 *  - weight: "90·8" → { top:'90', bottom:'×8' }
 *  - bodyweight: "15" → { top:'15', bottom:'회' }
 *  - 미수행/대시: { top:'—', bottom:'' }
 * resolveDotDisplay 반환 형태(text/isPreview)는 불변 — 표시 분리만 담당.
 */
export function formatSetSegment(display, kind = 'weight') {
  const text = display && typeof display.text === 'string' ? display.text : '—';
  if (text === '—' || text === '') return { top: '—', bottom: '' };
  if (kind === 'bodyweight') return { top: text, bottom: '회' };
  if (kind === 'cardio') return { top: text, bottom: '' };
  const dot = text.indexOf('·');
  if (dot === -1) return { top: text, bottom: '' };
  return { top: text.slice(0, dot), bottom: `×${text.slice(dot + 1)}` };
}

/**
 * 작업지시서 §3-4 R1 — 막대 높이 = e1RM 강도 인코딩 (차트 아님, 9~24px 텍스처).
 *  - e1 / maxE1 비례로 9~24px 클램프. maxE1 ≤ 0 (전부 맨몸·미입력) 이면 0 나눗셈 없이 하한 9px.
 */
export function barHeightForE1RM(e1, maxE1) {
  const e = Number(e1) || 0;
  const m = Number(maxE1) || 0;
  if (m <= 0) return 9;
  return Math.round(Math.max(9, Math.min(24, 9 + (e / m) * 15)));
}

/**
 * 작업지시서 §3-4 R1 — 세트바 높이 정규화 분모. 최고 e1RM 과 working 세트 epley 중 최댓값.
 *  - 최고(bestE1rm)가 없으면 working 세트 최댓값으로 폴백 (§3-5 graceful, 0 나눗셈 방지).
 */
export function setBarMaxE1RM(sets, bestE1rm) {
  let max = Number(bestE1rm) || 0;
  if (Array.isArray(sets)) {
    for (const s of sets) {
      const e = epley(s?.weight, s?.reps);
      if (e > max) max = e;
    }
  }
  return max;
}

/**
 * 작업지시서 §3-3 R1 — 역대 최고(e1RM) 세트를 세트바 끝 별도 슬롯으로 병기하는 DOM.
 *  - best 는 getBestE1RM row {weight,reps,e1rm,...}. null 또는 무게·횟수 비숫자면 '' (§3-5 미생성).
 *  - 표기는 무게×횟수 (볼륨 금지 §8). 막대 높이는 barH (e1RM 강도).
 *  - 구분선(data-best-divider)·슬롯(data-best-slot) 둘 다 renderSetDotsDiff 초과 제거 보호 마커를 단다.
 */
export function buildSetBestSlotHtml(best, barH) {
  if (!best || !Number.isFinite(best.weight) || !Number.isFinite(best.reps)) return '';
  const h = Number.isFinite(Number(barH)) ? Number(barH) : 9;
  return (
    // 구분선 (직전 ┃ 최고 경계)
    `<div data-best-divider="1" style="width:1px;align-self:flex-end;height:44px;background:var(--line);margin:0 2px;flex:none;"></div>`
    // 최고 슬롯 (data-best-slot 로 diff 보호)
    + `<div class="seg-best" data-best-slot="1" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;">`
    + `<span style="font-size:8px;font-weight:700;color:var(--crail-deep);letter-spacing:0.04em;display:flex;align-items:center;gap:3px;line-height:1;">`
    + `<span style="font-size:7px;">▲</span>최고</span>`
    + `<span style="width:100%;height:${h}px;border-radius:5px;background:var(--crail-tint);border:1.5px dashed var(--crail-base);"></span>`
    + `<span style="display:flex;flex-direction:column;align-items:center;line-height:1.05;gap:2px;">`
    + `<span style="font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:12.5px;font-weight:700;color:var(--crail-deep);letter-spacing:-0.02em;">${escapeHtml(String(best.weight))}</span>`
    + `<span style="font-family:var(--font-mono);font-size:10px;font-weight:500;color:var(--crail-deep);">×${escapeHtml(String(best.reps))}</span>`
    + `</span></div>`
  );
}

function renderSetDotHtml(idx, set, isCurrent, sets, cur, prevSessionSets, kind = 'weight') {
  // P1 라이트 — 세그먼트(.seg = bar + 값). 초기 mount append 용. 후속은 renderSetDotsDiff 가 갱신.
  //   완료=.done(ink bar) / 현재=.now(crail 맥동 bar) / 예정=ghost(line 보더). 값=직전 세션 per-set 타깃.
  const isDone = !!(set && set.done);
  const display = resolveDotDisplay(sets || [set], idx, isCurrent ? idx : -1, prevSessionSets, kind);
  const stateClass = isCurrent ? ' now' : (isDone ? ' done' : '');
  const currentAttr = isCurrent ? ' data-current="1"' : '';
  const seg = formatSetSegment(display, kind);
  // 구현 레퍼런스 - 세션.html: .seg > .seg-bar + .seg-n > (.w 중량 + .r ×횟수). seg-flash 는 앱 확정 애니.
  return `
        <div class="seg${stateClass}" data-set-idx="${idx}"${currentAttr} data-longpress="set-row">
          <i class="seg-flash"></i>
          <span class="seg-bar"></span>
          <span class="seg-n"><span class="w">${escapeHtml(seg.top)}</span><span class="r">${escapeHtml(seg.bottom)}</span></span>
        </div>`;
}

/**
 * diff-based set dot 갱신 — innerHTML 재생성 폐기 (transition 트리거 보존).
 *  - 기존 children 매칭 (data-set-idx) → text + style 갱신
 *  - 부족하면 append, 초과하면 remove
 *  - 활성 set 변경 시 font-size 220ms transition 자연 트리거 (DOM 유지)
 */
function renderSetDotsDiff(setDotsEl, sets, cur, prevSessionSets, kind = 'weight', best = null) {
  if (!setDotsEl) return;
  // 작업지시서 §3-2 R1 — 최고(e1RM) 슬롯·구분선은 diff 대상에서 제외한다. 매 렌더 앞단에서 제거해
  //   아래 세그먼트 diff(부족 append / 초과 remove)가 세트 도트만 세도록 보장 (data-best-slot 오제거 방지).
  //   슬롯은 정적(세트별 애니 불필요)이라 재빌드가 저렴 — strip → diff → re-append 로 구조적으로 보호.
  Array.from(setDotsEl.children).forEach((c) => {
    if (c.dataset && (c.dataset.bestSlot === '1' || c.dataset.bestDivider === '1')) {
      setDotsEl.removeChild(c);
    }
  });
  let appendedCount = 0;
  // 부족한 세그먼트 추가 (초기 non-current 로 박은 뒤 아래 루프가 상태 클래스 확정 → bar transition).
  while (setDotsEl.children.length < sets.length) {
    const wrap = document.createElement('div');
    const idx = setDotsEl.children.length;
    wrap.innerHTML = renderSetDotHtml(idx, sets[idx], false, sets, cur, prevSessionSets, kind);
    const seg = wrap.firstElementChild;
    if (seg) {
      setDotsEl.appendChild(seg);
      appendedCount += 1;
    }
  }
  // 초과 제거
  while (setDotsEl.children.length > sets.length) {
    setDotsEl.removeChild(setDotsEl.lastChild);
  }
  // append 시 force reflow → initial 상태 commit (bar background/height transition 시작점 확보)
  if (appendedCount > 0) {
    void setDotsEl.offsetHeight;
  }
  // 작업지시서 §3-4 R1 — 막대 높이 = e1RM 강도 (무게 종목만; 맨몸·유산소는 e1RM 무의미 → 기존 높이 유지).
  //   maxE1 은 최고 e1RM 과 working 세트 최댓값 중 큰 값 (§3-5 최고 없으면 working 폴백, 0 나눗셈 방지).
  const encodeHeight = kind === 'weight';
  const maxE1 = encodeHeight ? setBarMaxE1RM(sets, best ? best.e1rm : 0) : 0;
  // 각 세그먼트 상태 갱신 (클래스 토글 + 값)
  for (let i = 0; i < sets.length; i++) {
    const seg = setDotsEl.children[i];
    if (!seg) continue;
    const set = sets[i];
    const isCurrent = i === cur;
    const isDone = !!(set && set.done);
    const display = resolveDotDisplay(sets, i, cur, prevSessionSets, kind);
    // 상태 클래스 (.seg base 유지 + done/now 토글 → CSS 가 bar/값 색·높이 transition)
    seg.classList.toggle('now', isCurrent);
    seg.classList.toggle('done', isDone && !isCurrent);
    // spec §6-9 set-row 꾹누르기 — cardio 제외(단일 세트 + display:none → 수정은 zone 키패드).
    if (kind === 'cardio') {
      seg.removeAttribute('data-longpress');
    } else if (seg.getAttribute('data-longpress') !== 'set-row') {
      seg.setAttribute('data-longpress', 'set-row');
    }
    if (isCurrent) seg.setAttribute('data-current', '1');
    else seg.removeAttribute('data-current');
    // 값 라벨 갱신 — 중량(굵게) + ×횟수(작게) 2줄 (작업지시서 §B)
    const parts = formatSetSegment(display, kind);
    const wEl = seg.querySelector('.seg-n .w');
    const rEl = seg.querySelector('.seg-n .r');
    if (wEl) wEl.textContent = parts.top;
    if (rEl) rEl.textContent = parts.bottom;
    // 작업지시서 §3-4 — 막대 높이 인코딩 (.seg-bar transition:height .22s 로 애니 유지). 상태 색·펄스는 CSS 가 계속 담당.
    //   비-무게 종목(맨몸·유산소)은 인라인 높이 제거 → CSS 기본 높이 복원 (무게→맨몸 전환 시 stale 높이 잔존 방지).
    const barEl = seg.querySelector('.seg-bar');
    if (barEl) {
      if (encodeHeight) barEl.style.height = `${barHeightForE1RM(epley(set?.weight, set?.reps), maxE1)}px`;
      else if (barEl.style.height) barEl.style.height = '';
    }
  }
  // 작업지시서 §3-3 R1 — 세트바 끝에 역대 최고(e1RM) 슬롯 병기 (무게 종목 + 최고 존재 시만; §3-5 graceful).
  if (encodeHeight && best) {
    setDotsEl.insertAdjacentHTML('beforeend', buildSetBestSlotHtml(best, barHeightForE1RM(best.e1rm, maxE1)));
  }
}

/**
 * spec §6-3-1 + §6-3 — cardSwipeArea pointer 통합 핸들러 (스와이프 + 빈 공간 탭 증감).
 *  - dx ≥ 60 + 수평 dominant : swipe (좌=완료·우=이전 수정)
 *  - dx,dy < 10 (정적 클릭) : tap (좌 30%=감소 / 우 30%=증가, zone = cardWeightZone | cardRepsZone)
 *  - 그 외 (애매한 drag) : 무시 (수직 스크롤 보존)
 *  - 햅틱: swipe 시만 navigator.vibrate(10).
 *  - touch-action: pan-y 로 수직 네이티브 스크롤 보존.
 */
function wireSwipeHandlers(doc) {
  const area = doc.getElementById('cardSwipeArea');
  if (!area) return;
  if (area.dataset.spaHooked === '1') return;

  let startX = 0;
  let startY = 0;
  let tracking = false;   // pointerdown~up 추적 중
  let dragging = false;   // 수평 드래그 추종 engage 됨
  let captured = false;   // setPointerCapture 적용 여부
  let committing = false; // 커밋 핸들러 in-flight 락 — 빠른 연속 스와이프 레이스(이중 커밋·전이 깜빡임) 방지 (리뷰 #4)

  const heroEl = () => doc.getElementById('cardHeroVals');
  const revealEl = () => doc.getElementById('completeReveal');
  const nowSegBar = () => doc.getElementById('cardSetDots')?.querySelector('.seg.now .seg-bar');

  const resetDragVisual = () => {
    const rv = revealEl();
    if (rv) { rv.style.opacity = '0'; rv.style.transform = 'translateY(-50%) translateX(14px) scale(0.9)'; }
    const sb = nowSegBar();
    if (sb) sb.style.transform = '';
  };

  // (f-3a) 교차 취소 — hold 발화 시 외부에서 swipe tracking 무력화 가능
  area._swipeReset = () => {
    tracking = false; dragging = false;
    resetDragVisual();
    const h = heroEl(); if (h) h.style.transform = '';
  };

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (committing) return; // 커밋 애니 진행 중 — 새 제스처 무시 (참조 시안 S.busy 답습, 리뷰 #4)
    startX = e.clientX;
    startY = e.clientY;
    tracking = true;
    dragging = false;
    captured = false;
  };

  // 드래그 추종 (작업지시서 §4 / FIG 2) — 수평 우세 + 8px 초과 시 engage. 그 전엔 수직 스크롤(pan-y) 보존.
  const onMove = (e) => {
    if (!tracking) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragging) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        dragging = true;
        try { area._lpCancel?.(); } catch (_) { /* longpress 중단 — scale/transform 경합 차단 */ }
        try { area.setPointerCapture?.(e.pointerId); captured = true; } catch (_) {}
      } else {
        return; // 수직/미세 이동 — 네이티브 스크롤에 양보
      }
    }
    const h = heroEl();
    if (!h) return;
    let tx = dx;
    if (tx > 0) tx *= 0.25;     // 우드래그 저항
    tx = Math.max(tx, -150);     // 좌 clamp
    h.style.transition = '';
    h.style.transform = `translateX(${tx}px)`;
    // "완료" 칩 비례 노출 (좌드래그) + 완료될 세그 미세 부풀림
    const p = Math.min(1, Math.max(0, -dx / 90));
    const rv = revealEl();
    if (rv) { rv.style.opacity = String(p); rv.style.transform = `translateY(-50%) translateX(${(1 - p) * 14}px) scale(${0.9 + p * 0.1})`; }
    const sb = nowSegBar();
    if (sb) sb.style.transform = `scaleY(${1 + p * 0.28})`;
  };

  const springBack = () => {
    const h = heroEl();
    if (!h) return;
    const from = h.style.transform || 'translateX(0)';
    if (typeof h.animate === 'function' && !prefersReducedMotion()) {
      h.animate([
        { transform: from },
        { transform: 'translateX(6px)', offset: 0.6 },
        { transform: 'translateX(0)' },
      ], { duration: 320, easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
    h.style.transform = ''; // RM: 즉시 복귀
  };

  const onUp = async (e) => {
    if (!tracking) return;
    tracking = false;
    if (captured) { try { area.releasePointerCapture?.(e.pointerId); } catch (_) {} captured = false; }
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (dragging) {
      dragging = false;
      resetDragVisual();
      // spec §6-3-1 — 좌 -60 커밋 / 우 +60 이전 수정 / 미세 떨림(±10 미만) 탭 폴백 / 그 외 스프링백.
      if (dx <= -60) {
        // 진동·링은 handleLeftSwipe 의 playSetHaptic 가 담당 (이중 진동 방지 — 부록 햅틱 링).
        committing = true;
        try { await handleLeftSwipe({ fromDrag: true }); } finally { committing = false; }
      } else if (dx >= 60 && adx > ady) {
        try { navigator.vibrate?.(10); } catch (_) { /* 미지원 silent */ }
        committing = true;
        try { await handleRightSwipe({ fromDrag: true }); } finally { committing = false; }
      } else if (adx < 10 && ady < 10) {
        // 미세 떨림(8px 초과로 engage 됐으나 최종 <10px) — 드래그 추종 transform 즉시 복원 후 탭 폴백 (리뷰 #2)
        const h = heroEl(); if (h) { h.style.transition = 'none'; h.style.transform = ''; }
        await handleTap(doc, e.clientX, e.clientY);
      } else {
        springBack();
      }
      return;
    }
    // 드래그 미engage — 정적 tap (이동 < 10px) → 좌 30% 감소·우 30% 증가
    if (adx < 10 && ady < 10) {
      await handleTap(doc, e.clientX, e.clientY);
    }
    // 그 외: 애매한 미세 drag — 무시 (수직 스크롤로 처리됨)
  };

  const onCancel = (e) => {
    tracking = false;
    if (captured && e) { try { area.releasePointerCapture?.(e.pointerId); } catch (_) {} captured = false; }
    if (dragging) { dragging = false; resetDragVisual(); springBack(); }
  };

  area.addEventListener('pointerdown', onDown);
  area.addEventListener('pointermove', onMove);
  area.addEventListener('pointerup', onUp);
  area.addEventListener('pointercancel', onCancel);
  area.dataset.spaHooked = '1';
}

/**
 * spec §6-3 — 빈 공간 탭 위치 → zone (weight/reps) + 좌 30%/우 30% 분기.
 *  - cardWeightZone: 중량 증감 (장비별 증분 — applyTapDelta 참조)
 *  - cardRepsZone: 횟수 증감 (1)
 *  - 중앙 40% (0.3 ≤ ratio ≤ 0.7) : 키패드 영역 (단계 d) — 본 단계 무시
 */
async function handleTap(doc, x, y) {
  // 완료된 운동 (block.finishedAt) — 키패드·증감 모두 차단 (회색 read-only).
  try {
    const ctx = await getCurrentBlockAndCursor();
    if (ctx && isBlockLocked(ctx.block)) return;
  } catch (_) { /* graceful */ }
  // spec §6-4 — cardio 운동 시 zone 의 field 매핑이 'duration'·'distance' 로 swap.
  // 운동 종류는 cardSwipeArea data-card-kind (applyCardKind 가 mount 시 set) 로 확인.
  const area = doc.getElementById('cardSwipeArea');
  const kind = area?.getAttribute('data-card-kind') || 'weight';
  const isCardio = kind === 'cardio';
  const zones = isCardio
    ? [['cardWeightZone', 'duration'], ['cardRepsZone', 'distance']]
    : [['cardWeightZone', 'weight'], ['cardRepsZone', 'reps']];
  for (const [zoneId, field] of zones) {
    const z = doc.getElementById(zoneId);
    if (!z) continue;
    const r = z.getBoundingClientRect();
    if (y < r.top || y > r.bottom) continue;
    if (x < r.left || x > r.right) continue;
    const ratio = (x - r.left) / r.width;
    if (!isCardio && ratio < 0.3) await applyTapDelta(field, -1);
    else if (!isCardio && ratio > 0.7) await applyTapDelta(field, +1);
    else {
      // spec §6-3-2 — 중앙 40% → 키패드 (cardio 는 전 영역 키패드). prefill 박아 시작점 제공.
      let prefill;
      try {
        const ctx = await getCurrentBlockAndCursor();
        const set = ctx && ctx.block && Array.isArray(ctx.block.sets) ? ctx.block.sets[ctx.effectiveCur] : null;
        if (set && Number.isFinite(set[field])) {
          // duration 은 DB 에 초 단위 저장 → 키패드 prefill 은 분으로 변환
          prefill = field === 'duration' ? Math.round(set[field] / 60) : set[field];
        }
      } catch (_) { /* graceful */ }
      openKeypad(doc, field, { prefill });
    }
    return;
  }
}

/**
 * spec §6-3 — 현재 set 의 weight/reps 증감.
 *  - 장비별 증분 : barbell/machine/cable 5kg, dumbbell 2kg, bodyweight 중량 증감 불가, reps 1
 *  - 0 이하 clamp (음수 방지)
 *  - 변화 없으면 (e.g. 0 - 1 = -1 → clamp 0 = 동일) no-op
 *  - preset:false 강제 (사용자 입력 → placeholder 해제)
 *  - 갱신 후 mountSessionView 재호출 + flashElement(150ms)
 */
export async function applyTapDelta(field, deltaSign) {
  if (field !== 'weight' && field !== 'reps') return;
  if (deltaSign !== 1 && deltaSign !== -1) return;

  let ctx;
  try { ctx = await getCurrentBlockAndCursor(); }
  catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymSession] applyTapDelta ctx', e);
    }
    return;
  }
  if (!ctx) return;
  // 완료된 운동 (회색 read-only) 은 weight/reps 증감 차단
  if (isBlockLocked(ctx.block)) return;
  const { session, block, effectiveCur } = ctx;
  const sets = Array.isArray(block.sets) ? block.sets.slice() : [];
  const set = sets[effectiveCur];
  if (!set) return;

  // 장비별 증분
  let delta = 1;
  if (field === 'weight') {
    let ex;
    try { ex = await getExerciseDefaults(block.exerciseId); }
    catch (_) { ex = null; }
    const eq = ex?.equipment;
    if (eq === 'bodyweight' || eq === 'cardio') return; // 중량 증감 불가
    delta = eq === 'dumbbell' ? 2 : 5;
  }

  const curVal = Number(set[field]) || 0;
  let nextVal = curVal + deltaSign * delta;
  if (nextVal < 0) nextVal = 0;
  if (nextVal === curVal) return; // no-op

  const blocks = session.blocks.slice();
  const blockIdx = blocks.indexOf(block);
  if (blockIdx === -1) return;
  sets[effectiveCur] = { ...set, [field]: nextVal, preset: false };
  blocks[blockIdx] = { ...block, sets };

  try { await upsertSession({ ...session, blocks }); }
  catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymSession] applyTapDelta upsert', e);
    }
    return;
  }
  await mountSessionView();

  if (typeof document !== 'undefined') {
    flashElement(document.getElementById(field === 'weight' ? 'cardWeight' : 'cardReps'));
  }
}

/**
 * spec §6-3 — 증감 시 150ms 미세 플래시 (opacity dip). element 가 있으면 짧게 0.45→1 복귀.
 */
function flashElement(el) {
  if (!el || !el.style) return;
  el.style.transition = 'opacity 75ms ease';
  el.style.opacity = '0.45';
  setTimeout(() => {
    el.style.opacity = '1';
    setTimeout(() => { el.style.transition = ''; }, 75);
  }, 75);
}

/* ──────────────────── 액션 시트 (spec §6-9 메뉴 / §6-10) ──────────────────── */

/**
 * spec §6-9 — 꾹누르기 메뉴 액션 시트. DOM 한 번 (mocks/session.html) + transform 토글.
 *  - input : { kind, title, items: [{ id, label, danger? }], onSelect }
 *  - 항목 click → onSelect(id, kind) + 자동 close
 *  - 취소 / backdrop / 시트 아래 60px 스와이프 → close
 *  - onSelect 는 itemsEl._onSelect 에 보관 (open 마다 교체).
 */
// P4 — 액션 항목 아이콘 (action id 별). 매핑 없는 id 는 라벨만 (아이콘 없음).
const ACTION_ICONS = {
  edit: '<svg width="17" height="17" viewBox="0 0 18 18" fill="none"><path d="M11.5 2.5l4 4L6 16H2v-4L11.5 2.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  delete: '<svg width="17" height="17" viewBox="0 0 18 18" fill="none"><path d="M3.5 5h11M7 5V3.5h4V5M5 5l.6 9a1 1 0 001 1h4.8a1 1 0 001-1L13 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  discard: '<svg width="17" height="17" viewBox="0 0 18 18" fill="none"><path d="M3.5 5h11M7 5V3.5h4V5M5 5l.6 9a1 1 0 001 1h4.8a1 1 0 001-1L13 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  finish: '<svg width="17" height="17" viewBox="0 0 18 18" fill="none"><path d="M3.5 9.5l3.5 3.5 7.5-8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export function openActionSheet(doc, { kind = '', title = '', items = [], onSelect } = {}) {
  const sheet = doc?.getElementById?.('actionSheet');
  const backdrop = doc?.getElementById?.('actionBackdrop');
  const titleEl = doc?.getElementById?.('actionTitle');
  const itemsEl = doc?.getElementById?.('actionItems');
  if (!sheet || !backdrop || !itemsEl) return;
  sheet.dataset.kind = kind;
  // (f-4) — open 마다 step='1' (메뉴) 초기화. confirmId 클리어.
  sheet.dataset.step = '1';
  delete sheet.dataset.confirmId;
  if (titleEl) titleEl.textContent = title;
  itemsEl.innerHTML = items.map((it) => {
    const danger = !!it.danger;
    const icon = ACTION_ICONS[it.id] || '';
    return `<button class="action-item${danger ? ' danger' : ''}" data-action-id="${escapeHtml(it.id)}" type="button">${icon}${escapeHtml(it.label)}</button>`;
  }).join('');
  itemsEl._items = items;
  itemsEl._onSelect = typeof onSelect === 'function' ? onSelect : null;
  sheet.dataset.open = 'true';
  sheet.style.transform = 'translateY(0)';
  backdrop.dataset.open = 'true';
  backdrop.style.opacity = '1';
  backdrop.style.pointerEvents = 'auto';
}

/**
 * spec §6-9 — 파괴 액션 (danger:true) 선택 시 자동 step 전환 (DOM 한 번 §6-10).
 *  - title : "{label}하시겠습니까?"
 *  - items 영역 : 단일 .action-confirm 버튼 (accent fill, 라벨 = action label).
 *  - 시트 하단 actionCancel 그대로 노출 → 취소 버튼.
 *  - .action-confirm click → _onSelect(actionId, kind) 호출 후 close.
 *  - 취소 / backdrop / 아래 스와이프 → onSelect 미호출 + close.
 */
function showConfirmStep(doc, kind, actionId, actionLabel) {
  const sheet = doc.getElementById('actionSheet');
  const titleEl = doc.getElementById('actionTitle');
  const itemsEl = doc.getElementById('actionItems');
  if (!sheet || !titleEl || !itemsEl) return;
  sheet.dataset.step = '2';
  sheet.dataset.confirmId = actionId;
  titleEl.textContent = `${actionLabel}하시겠습니까?`;
  itemsEl.innerHTML = `<button class="action-confirm" data-confirm="ok" type="button">${escapeHtml(actionLabel)}</button>`;
}

export function closeActionSheet(doc) {
  const sheet = doc?.getElementById?.('actionSheet');
  const backdrop = doc?.getElementById?.('actionBackdrop');
  if (!sheet || !backdrop) return;
  sheet.dataset.open = 'false';
  sheet.style.transform = 'translateY(100%)';
  backdrop.dataset.open = 'false';
  backdrop.style.opacity = '0';
  backdrop.style.pointerEvents = 'none';
  // P4 — 선택 링(held) 해제 (set-row 등 꾹누른 대상).
  try { doc.querySelectorAll?.('.held').forEach((el) => el.classList.remove('held')); } catch (_) { /* noop */ }
}

function wireActionSheet(doc) {
  const sheet = doc.getElementById('actionSheet');
  const backdrop = doc.getElementById('actionBackdrop');
  const itemsEl = doc.getElementById('actionItems');
  const cancelBtn = doc.getElementById('actionCancel');
  if (!sheet || !backdrop || !itemsEl || !cancelBtn) return;
  if (sheet.dataset.spaHooked === '1') return;

  itemsEl.addEventListener('click', (e) => {
    // (f-4) step 2 — 파괴 액션 확인 단계
    const confirmBtn = e.target.closest('.action-confirm');
    if (confirmBtn) {
      const c = confirmBtn.dataset.confirm;
      const actionId = sheet.dataset.confirmId;
      const kind = sheet.dataset.kind || '';
      if (c === 'ok' && typeof itemsEl._onSelect === 'function') {
        try { itemsEl._onSelect(actionId, kind); }
        catch (err) { console.error('[gymSession] action confirm', err); }
      }
      closeActionSheet(doc);
      return;
    }
    // step 1 — 일반 메뉴 항목
    const btn = e.target.closest('.action-item');
    if (!btn) return;
    const id = btn.dataset.actionId;
    const kind = sheet.dataset.kind || '';
    const items = itemsEl._items || [];
    const item = items.find((i) => i.id === id);
    // 파괴 액션 (danger:true) → 2단계 확인 (spec §6-9)
    if (item && item.danger) {
      showConfirmStep(doc, kind, id, item.label);
      return;
    }
    if (typeof itemsEl._onSelect === 'function') {
      try { itemsEl._onSelect(id, kind); }
      catch (err) { console.error('[gymSession] action onSelect', err); }
    }
    closeActionSheet(doc);
  });

  cancelBtn.addEventListener('click', () => closeActionSheet(doc));
  backdrop.addEventListener('click', () => closeActionSheet(doc));

  // 시트 아래 60px 스와이프 → 취소 (키패드 패턴 동일)
  let downY = 0;
  let tracking = false;
  sheet.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.action-item, #actionCancel')) return;
    downY = e.clientY;
    tracking = true;
  });
  sheet.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    if (e.clientY - downY >= 60) closeActionSheet(doc);
  });
  sheet.addEventListener('pointercancel', () => { tracking = false; });

  sheet.dataset.spaHooked = '1';
}

/**
 * spec §6-9 — kind → 메뉴 매핑.
 *  - 대상: session-end / active-card / set-row / footer-exercise.
 *  - onSelect 는 mountSessionActive 의 wireLongPress(onTrigger) 가 openActionSheet 호출 시
 *    handleActionSelect 디스패처로 연결 (진짜 핸들러).
 */
function getActionMenuFor(kind, target) {
  if (kind === 'session-end') {
    return {
      kind,
      title: '세션 옵션',
      items: [
        { id: 'finish', label: '종료' },
        { id: 'discard', label: '세션 삭제', danger: true },
      ],
    };
  }
  if (kind === 'active-card') {
    // spec §6-9 — 진행 중 운동 카드 : 완료 / 삭제 (이동은 long-press hold + drag 로 별도)
    return {
      kind,
      title: '운동 카드',
      items: [
        { id: 'finish', label: '완료' },
        { id: 'delete', label: '삭제', danger: true },
      ],
    };
  }
  if (kind === 'set-row') {
    // spec §6-9 — 세트 행 (완료/미완료) : 수정 / 삭제
    const setIdx = target?.dataset?.setIdx;
    return {
      kind,
      title: `세트 ${Number.isFinite(parseInt(setIdx, 10)) ? `S${parseInt(setIdx, 10) + 1}` : ''}`.trim(),
      items: [
        { id: 'edit', label: '수정' },
        { id: 'delete', label: '삭제', danger: true },
      ],
    };
  }
  if (kind === 'footer-exercise') {
    const state = target?.dataset?.exState || 'upcoming';
    const items = [];
    if (state === 'active') {
      items.push({ id: 'finish', label: '완료' });
    } else if (state === 'completed') {
      items.push({ id: 'edit', label: '수정' });
    }
    items.push({ id: 'delete', label: '삭제', danger: true });
    // 이동 메뉴 제거 — long-press hold + drag 로 별도 (spec §6-9 갱신)
    return {
      kind,
      title: '운동 옵션',
      items,
    };
  }
  return null;
}

/* ──────────────────── 꾹누르기 인프라 (spec §6-9) ──────────────────── */

/**
 * spec §6-9 — 500ms 홀드 시 햅틱 + scale 0.98 + onTrigger 콜백.
 *  - move 8px+ → 자동 취소 (실수 방지)
 *  - 글로벌 scroll → 모든 hold 취소 (실수 방지)
 *  - pointerup / cancel / leave → 취소
 *  - target = `[data-longpress="<kind>"]` element. kind 는 onTrigger 인자로 전달.
 *  - idempotent : el.dataset.spaLpHooked='1' / body.dataset.spaLpScroll='1' guard.
 *
 * (f-1) 인프라만. (f-2) 액션 시트 + (f-3) 대상별 wiring 은 후속.
 */
export function wireLongPress(doc, opts = {}) {
  if (!doc) return { wired: 0 };
  const { onTrigger, onArmedDrag, holdMs = 500, moveTolerance = 8 } = opts;

  const cancelAll = () => {
    doc.querySelectorAll('[data-longpress]').forEach((el) => {
      if (typeof el._lpCancel === 'function') el._lpCancel();
    });
  };

  let wired = 0;
  const targets = doc.querySelectorAll('[data-longpress]');
  for (const el of targets) {
    if (el.dataset.spaLpHooked === '1') continue;
    let timer = null;
    let pid = null;
    let sx = 0;
    let sy = 0;
    let triggered = false;
    // footer-exercise armed-for-drag : 시트 즉시 안 띄움, pointerup 까지 대기.
    // pointermove > tol 면 onArmedDrag 발화 (drag 진입), pointerup 이면 onTrigger (시트).
    let armedForDrag = false;

    const cancel = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      el.style.transform = '';
      el.style.transition = '';
      pid = null;
      triggered = false;
      armedForDrag = false;
    };
    el._lpCancel = cancel;

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // armed-drag 가 dispatch 한 가짜 pointerdown 무시 (wireReorderDrag 만 받게).
      // isTrusted 가드 대신 marker 기반 (vitest dispatchEvent 도 isTrusted=false 이므로 isTrusted 사용 불가).
      if (e.__lpDispatched) return;
      // 자식 longpress target (예: 세트 도트) 이 부모 (cardSwipeArea active-card) 까지 동시 발화 방지.
      if (e.target && e.target !== el && e.target.closest?.('[data-longpress]') !== el) return;
      sx = e.clientX;
      sy = e.clientY;
      pid = e.pointerId;
      triggered = false;
      armedForDrag = false;
      el.style.transition = 'transform 120ms ease';
      el.style.transform = 'scale(0.98)';
      timer = setTimeout(() => {
        timer = null;
        triggered = true;
        try { navigator.vibrate?.(10); } catch (_) { /* iOS Safari 미지원 — silent */ }
        el.style.transform = '';
        setTimeout(() => { el.style.transition = ''; }, 200);
        const kind = el.dataset.longpress;
        // footer-exercise 는 시트 즉시 X — armed 상태 유지 (move=drag / up=시트).
        if (kind === 'footer-exercise' && typeof onArmedDrag === 'function') {
          armedForDrag = true;
          return;
        }
        if (typeof onTrigger === 'function') {
          el.classList?.add('held'); // P4 — crail 선택 링 (시트 열린 동안 유지, closeActionSheet 가 제거)
          try { onTrigger({ kind, target: el }); }
          catch (err) { console.error('[gymSession] longpress onTrigger', err); }
        }
      }, holdMs);
    });
    el.addEventListener('pointermove', (e) => {
      if (pid !== null && e.pointerId !== pid) return;
      // cancel/armed 후(pid=null) — longpress 비활성. transform 재-wipe 방지 → 스와이프 드래그 추종 보존.
      if (pid === null) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      const moved = Math.hypot(dx, dy);
      if (armedForDrag && moved > moveTolerance) {
        // armed → drag 진입. setReorderMode + 가짜 pointerdown dispatch.
        armedForDrag = false;
        try {
          onArmedDrag({ kind: el.dataset.longpress, target: el, pointerEvent: e });
        } catch (err) { console.error('[gymSession] longpress onArmedDrag', err); }
        pid = null; // 이후 pointer event 는 wireReorderDrag 가 처리
        return;
      }
      if (triggered || armedForDrag) return;
      if (moved > moveTolerance) cancel();
    });
    el.addEventListener('pointerup', (e) => {
      if (pid !== null && e.pointerId !== pid) { cancel(); return; }
      if (armedForDrag) {
        // armed + drag 안 시작 → 시트 띄움.
        armedForDrag = false;
        if (typeof onTrigger === 'function') {
          try { onTrigger({ kind: el.dataset.longpress, target: el }); }
          catch (err) { console.error('[gymSession] longpress onTrigger', err); }
        }
      }
      cancel();
    });
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', cancel);

    el.dataset.spaLpHooked = '1';
    wired += 1;
  }

  // 글로벌 scroll cancel — 한 번만 등록
  if (doc.body && !doc.body.dataset.spaLpScroll) {
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('scroll', cancelAll, { passive: true });
    }
    doc.body.dataset.spaLpScroll = '1';
  }
  return { wired };
}

/* ──────────────────── 키패드 바텀시트 (spec §6-3-2 / §6-10) ──────────────────── */

/* ──────────────────── footer nav pill (spec §6-8 / f-5-1) ──────────────────── */

/**
 * 푸터 칩 '완료(done)' 판정 — 명시적 완료(finishedAt) 또는 세트 전부 done.
 * classifyBlockState 의 done 표시(✓)와 computeFooterOrder 의 done 정렬(좌측)이
 * 같은 기준을 쓰도록 공유 (불일치 시 ✓ 칩이 우측에 남는 버그 — 2026-06-22 사용자 보고).
 */
function isBlockDone(block) {
  if (!block || block.type !== 'single') return false;
  if (Number.isFinite(block.finishedAt)) return true;
  const sets = Array.isArray(block.sets) ? block.sets : [];
  return sets.length > 0 && sets.every((s) => s && s.done);
}

/**
 * spec §6-8 운동 상태 판정.
 *  - currentBlock 과 동일 → 'current'
 *  - 완료(finishedAt 또는 sets 전부 done) → 'done'
 *  - single 블록의 일부 set done → 'hold' (보류)
 *  - 그 외 (예정 또는 단일 아닌 타입) → 'pending'
 *  - 서킷 폐기 (spec §16) — block.type !== 'single' 은 graceful skip → pending.
 */
function classifyBlockState(block, isCurrent) {
  if (isCurrent) return 'current';
  if (!block || block.type !== 'single') return 'pending';
  if (isBlockDone(block)) return 'done'; // finishedAt 또는 세트 전부 done
  const sets = Array.isArray(block.sets) ? block.sets : [];
  const anyDone = sets.some((s) => s && s.done);
  if (anyDone) return 'hold';
  return 'pending';
}

/**
 * 진행도 텍스트 — current/hold/done 별 spec §6-8 footer nav 표현.
 *  - current : "N/M" (현재 set / 총)
 *  - hold    : "N/M"
 *  - done    : "N세트 ✓" 의 N 부분 (✓ 는 별도 prefix span 으로 렌더)
 */
function blockProgressText(block, state) {
  if (!block || block.type !== 'single') return '';
  const sets = Array.isArray(block.sets) ? block.sets : [];
  const total = sets.length;
  if (state === 'done') return `${total}세트`;
  if (state === 'current' || state === 'hold') {
    const cur = sets.findIndex((s) => !s.done);
    const num = cur === -1 ? total : cur + 1;
    return `${num}/${total}`;
  }
  return '';
}

function blockDisplayName(block) {
  if (!block) return '';
  if (block.type === 'single') return resolveExerciseName(block.exerciseId);
  // 서킷 폐기 (spec §16) — 다른 타입은 빈 라벨 (graceful skip).
  return '';
}

function renderFooterPillHtml({ blockIdx, state, name }) {
  // 종이톤 슬라이드 레일 칩 (작업지시서 §6.1). 마커 슬롯 + 운동명 (가로).
  // data-ex-state : 'active' | 'completed' | 'hold' | 'upcoming' (footer-exercise hold 메뉴와 호환)
  const exStateAttr = state === 'current' ? 'active'
    : state === 'done' ? 'completed'
    : state === 'hold' ? 'hold' : 'upcoming';
  const stateClass = state === 'current' ? 'is-current'
    : state === 'done' ? 'is-done'
    : state === 'hold' ? 'is-hold' : 'is-upcoming';
  const ariaCurrent = state === 'current' ? ' aria-current="true"' : '';

  // fp-check stroke 색은 CSS(.fp-check path{stroke:var(--sage)})로 지정 — SVG 속성 var() 미작동.
  let mk;
  if (state === 'current') {
    mk = `<span class="fp-dot-live"></span>`;
  } else if (state === 'done') {
    mk = `<svg class="fp-check" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.4 6.3l2.4 2.4L9.6 3.4" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  } else if (state === 'hold') {
    mk = `<span class="fp-dot-hold"></span>`;
  } else {
    mk = `<span class="fp-dot-todo"></span>`;
  }

  return `<button class="fp-chip ${stateClass}" type="button" data-longpress="footer-exercise" data-ex-state="${exStateAttr}" data-block-idx="${blockIdx}"${ariaCurrent}>`
    + `<span class="fp-chip__mk">${mk}</span>`
    + `<span class="fp-chip__name">${escapeHtml(name)}</span>`
    + `</button>`;
}

/**
 * 푸터 칩 서킷 배열 — [완료(완료순) 좌측 · 현재 · 예정(원래순) 우측].
 *  - 서킷 트레이닝(종목 번갈아 기록·완료)에서 완료분은 좌측에 완료순으로 쌓이고, 지금 기록 중인
 *    종목(current)이 그 오른쪽 첫 자리, 나머지 예정은 원래 인덱스 순서 (사용자 결정 2026-06-22).
 *  - renderFooterPills 가 이 순서로 DOM 렌더 + centerActivePill 로 현재를 가시 영역 가운데로 스크롤.
 *  - 원본 인덱스 i 보존 (blockIdx — click·hold·reorder 핸들러가 session.blocks[i] 참조).
 *  - single 블록만 (서킷 폐기 §16 — non-single 제외).
 */
export function computeFooterOrder(blocks, currentBlock) {
  const entries = (Array.isArray(blocks) ? blocks : [])
    .map((block, i) => ({ block, i }))
    .filter(({ block }) => block && block.type === 'single');
  const curIdx = Array.isArray(blocks) && currentBlock && currentBlock.type === 'single'
    ? blocks.indexOf(currentBlock) : -1;
  const isCurrent = (e) => e.i === curIdx;
  const done = entries
    .filter((e) => !isCurrent(e) && isBlockDone(e.block))
    .sort((a, b) => (a.block.finishedAt || 0) - (b.block.finishedAt || 0));
  const current = entries.filter(isCurrent); // 0 또는 1개
  const pending = entries.filter((e) => !isCurrent(e) && !isBlockDone(e.block));
  return [...done, ...current, ...pending];
}

/**
 * spec §6-8 — active session blocks → footer pill 동적 렌더.
 *  - currentBlock 은 mountSessionActive 가 사용 중인 그 block (accent + underline + dot + 진행도).
 *  - 다른 block 은 done/hold/pending 자동 판정.
 */
function renderFooterPills(doc, session, currentBlock) {
  const pillsEl = doc.getElementById('sessionFooterPills');
  if (!pillsEl || !session || !Array.isArray(session.blocks)) {
    if (pillsEl) pillsEl.innerHTML = '';
    return;
  }
  // 서킷 재정렬 — [완료(완료순) 좌 · 현재 · 예정(원래순) 우] (computeFooterOrder, 원본 인덱스 i 보존).
  // 칩을 래퍼 없이 직접 나열 — 레일(#sessionFooterPills.fp-rail)이 곧 flex 스크롤 컨테이너.
  const ordered = computeFooterOrder(session.blocks, currentBlock);
  const chips = ordered.map(({ block, i }) => {
    const state = classifyBlockState(block, block === currentBlock);
    return renderFooterPillHtml({ blockIdx: i, state, name: blockDisplayName(block) });
  });
  pillsEl.innerHTML = chips.join('');
  centerActivePill(pillsEl); // 현재 칩 가시 영역 가운데로
}

/**
 * 작업지시서 §6.3 — 현재 칩을 레일 가시 영역 가운데로 정렬.
 *  - 세트 도트 centerActiveSet 와 동일 패턴. 레일(pillsEl 자체)이 스크롤 컨테이너.
 *  - 레일이 넘칠 때만 동작, 스크롤 끝 clamp.
 *  - 칩 탭 전환은 mountSessionView 재마운트 → 새 DOM → 매번 즉시(instant) 중앙 정렬(smooth 아님).
 */
function centerActivePill(pillsEl) {
  const cur = pillsEl && pillsEl.querySelector('.fp-chip.is-current');
  if (!cur) return;
  const align = () => {
    try {
      if (pillsEl.scrollWidth <= pillsEl.clientWidth + 1) return; // 넘치지 않으면 정렬 불필요
      const target = cur.offsetLeft - (pillsEl.clientWidth - cur.offsetWidth) / 2;
      pillsEl.scrollLeft = Math.max(0, Math.min(target, pillsEl.scrollWidth - pillsEl.clientWidth));
    } catch (_) { /* fallback */ }
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(align);
  else align();
}

/**
 * spec §6-8 — pill click = 다른 운동으로 이동 (완료 아님).
 *  - data-block-idx 추출 → _currentBlockIdx 갱신 → mountSessionView 재바인딩.
 *  - hold 발화 (500ms) 와 click 은 별 이벤트 — 짧은 click 만 발화. hold 완료 시 pointerup 무발생.
 *  - reorder 모드 (pillsEl.dataset.reorder === '1') 중 일반 click 무시 (cancel 은 빈 영역).
 *  - idempotent : pillsEl.dataset.spaHooked guard.
 */
function wireFooterPillClick(doc) {
  const pillsEl = doc.getElementById('sessionFooterPills');
  if (!pillsEl || pillsEl.dataset.spaHooked === '1') return;
  pillsEl.addEventListener('click', (e) => {
    if (pillsEl.dataset.reorder === '1') return; // (f-5-2) reorder 모드 — pill click 무시
    const pill = e.target.closest('[data-block-idx]');
    if (!pill) return;
    const idx = parseInt(pill.dataset.blockIdx, 10);
    if (!Number.isFinite(idx)) return;
    _currentBlockIdx = idx;
    mountSessionView().catch((err) => console.error('[gymSession] pill click mount', err));
  });
  pillsEl.dataset.spaHooked = '1';
}

/**
 * spec §6-9 — reorder mode drag 추적 (f-5-3a).
 *  - reorder mode 활성 + src pill 의 pointerdown → drag 시작.
 *  - pointermove → src pill 의 transform 갱신 (scale 1.05 유지 + translate dx,dy).
 *  - pointerup → drop 처리 (f-5-3c 후속, 본 단계는 setReorderMode(false) 만).
 *  - pointercancel → drag 취소 + transform 복원.
 *  - idempotent : pillsEl.dataset.spaDragHooked guard.
 */
function wireReorderDrag(doc) {
  const pillsEl = doc.getElementById('sessionFooterPills');
  if (!pillsEl || pillsEl.dataset.spaDragHooked === '1') return;

  let dragging = false;
  let dragPill = null;
  let startX = 0;
  let startY = 0;
  let pointerId = null;

  pillsEl.addEventListener('pointerdown', (e) => {
    if (pillsEl.dataset.reorder !== '1') return;
    const srcIdx = parseInt(pillsEl.dataset.reorderSrc, 10);
    if (!Number.isFinite(srcIdx)) return;
    const pill = e.target.closest(`[data-block-idx="${srcIdx}"]`);
    if (!pill) return; // 다른 pill click 은 무시 (wireFooterPillClick 도 reorder 시 무시)
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    pointerId = e.pointerId;
    dragPill = pill;
    dragging = true;
    try { pill.setPointerCapture?.(e.pointerId); } catch (_) { /* ignore */ }
  });

  pillsEl.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== pointerId || !dragPill) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    // src pill 의 lift scale 유지하며 translate
    dragPill.style.transform = `scale(1.05) translate(${dx}px, ${dy}px)`;
    // (f-5-3b) drop 위치 hit test + 시각 피드백
    const srcIdx = parseInt(pillsEl.dataset.reorderSrc, 10);
    if (Number.isFinite(srcIdx)) {
      const dstIdx = computeDropIdx(pillsEl, e.clientX, srcIdx);
      pillsEl.dataset.reorderDst = String(dstIdx);
      applyDropPlaceholder(pillsEl, srcIdx, dstIdx);
    }
  });

  pillsEl.addEventListener('pointerup', async (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    if (dragPill) dragPill.style.transform = 'scale(1.05)';
    clearDropPlaceholder(pillsEl);
    // (f-5-3c) drop 처리 — srcIdx ≠ dstIdx 이면 blocks splice + mountSessionView
    const srcIdx = parseInt(pillsEl.dataset.reorderSrc, 10);
    const dstIdx = parseInt(pillsEl.dataset.reorderDst, 10);
    setReorderMode(doc, false);
    if (Number.isFinite(srcIdx) && Number.isFinite(dstIdx) && srcIdx !== dstIdx) {
      try {
        await performBlockReorder(srcIdx, dstIdx);
        await mountSessionView();
      } catch (err) {
        console.error('[gymSession] drop reorder', err);
      }
    }
  });

  pillsEl.addEventListener('pointercancel', () => {
    if (!dragging) return;
    dragging = false;
    pointerId = null;
    if (dragPill) dragPill.style.transform = 'scale(1.05)';
    clearDropPlaceholder(pillsEl);
  });

  pillsEl.dataset.spaDragHooked = '1';
}

/**
 * spec §6-9 — drop 위치 hit test (f-5-3b).
 *  - src pill 제외 다른 pill 의 boundingRect center.x 와 clientX 비교 → 가장 가까운 idx.
 *  - clientX < center → 그 pill 자리 (그 앞에 삽입), clientX > center → 그 pill 다음 자리.
 *  - 반환 : final dst idx (splice 보정 전, 원본 blocks idx 기준).
 */
export function computeDropIdx(pillsEl, clientX, srcIdx) {
  if (!pillsEl) return srcIdx;
  const pills = Array.from(pillsEl.querySelectorAll('[data-block-idx]'));
  let dstIdx = srcIdx;
  let bestDist = Infinity;
  pills.forEach((p) => {
    const idx = parseInt(p.dataset.blockIdx, 10);
    if (!Number.isFinite(idx) || idx === srcIdx) return;
    const r = p.getBoundingClientRect();
    const c = r.left + r.width / 2;
    const d = Math.abs(clientX - c);
    if (d < bestDist) {
      bestDist = d;
      dstIdx = clientX < c ? idx : idx + 1;
    }
  });
  return dstIdx;
}

/**
 * spec §6-9 — drop placeholder 시각 (f-5-3b).
 *  - dst 위치 (src 제외) pill 의 marginLeft 또는 marginRight 에 +18px gap 추가.
 *  - dst === srcIdx 또는 그 다음 자리면 gap 없음 (제자리 drop).
 */
function applyDropPlaceholder(pillsEl, srcIdx, dstIdx) {
  const pills = pillsEl.querySelectorAll('[data-block-idx]');
  pills.forEach((p) => {
    const idx = parseInt(p.dataset.blockIdx, 10);
    p.style.marginLeft = '';
    p.style.marginRight = '';
    if (idx === srcIdx) return;
    if (idx === dstIdx) p.style.marginLeft = '18px'; // dstIdx 자리 앞에 gap
    else if (idx === dstIdx - 1) p.style.marginRight = '18px'; // dstIdx 가 그 뒤이면 뒤에 gap
  });
}

function clearDropPlaceholder(pillsEl) {
  const pills = pillsEl?.querySelectorAll?.('[data-block-idx]');
  if (!pills) return;
  pills.forEach((p) => {
    p.style.marginLeft = '';
    p.style.marginRight = '';
  });
}

/**
 * spec §6-9 — drop 처리 (f-5-3c). srcIdx → dstIdx 로 blocks 순서 변경 + DB upsert.
 *  - dst > src : splice 후 idx 한 칸 당김 (insertIdx = dstIdx - 1).
 *  - dst ≤ src : splice 후 idx 그대로 (insertIdx = dstIdx).
 *  - _currentBlockIdx 보정 :
 *    - = src : insertIdx 로 이동
 *    - src 와 dst 사이 (src 가 dst 보다 큰 쪽 → cur 가 +1, 작은 쪽 → cur 가 -1)
 *  - 반환 : { ok, srcIdx, insertIdx } 또는 { ok:false, reason }
 */
export async function performBlockReorder(srcIdx, dstIdx) {
  if (!Number.isFinite(srcIdx) || !Number.isFinite(dstIdx)) {
    return { ok: false, reason: 'invalid_input' };
  }
  if (srcIdx === dstIdx) return { ok: true, srcIdx, insertIdx: srcIdx, unchanged: true };
  let session;
  try { session = await getActiveSession(); }
  catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) return { ok: false, reason: 'no_db' };
    console.error('[gymSession] performBlockReorder getActive', e);
    return { ok: false, reason: 'error' };
  }
  if (!session || !Array.isArray(session.blocks)) return { ok: false, reason: 'no_active_session' };
  const blocks = session.blocks.slice();
  if (srcIdx < 0 || srcIdx >= blocks.length) return { ok: false, reason: 'src_out_of_range' };
  const [removed] = blocks.splice(srcIdx, 1);
  // splice 후 dst 보정 — dst > src 면 한 칸 당김
  let insertIdx = dstIdx > srcIdx ? dstIdx - 1 : dstIdx;
  insertIdx = Math.max(0, Math.min(blocks.length, insertIdx));
  blocks.splice(insertIdx, 0, removed);
  try { await upsertSession({ ...session, blocks }); }
  catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymSession] performBlockReorder upsert', e);
    }
    return { ok: false, reason: 'error' };
  }
  // _currentBlockIdx 보정
  if (_currentBlockIdx === srcIdx) {
    _currentBlockIdx = insertIdx;
  } else if (_currentBlockIdx != null) {
    if (srcIdx < _currentBlockIdx && _currentBlockIdx <= dstIdx - 1) _currentBlockIdx -= 1;
    else if (dstIdx <= _currentBlockIdx && _currentBlockIdx < srcIdx) _currentBlockIdx += 1;
  }
  return { ok: true, srcIdx, insertIdx };
}

/**
 * spec §6-9 — reorder 모드 진입/종료 (f-5-2 시각만, drag/drop 은 f-5-3).
 *  - on=true + srcIdx : 선택된 pill 만 scale 1.05 + accent halo shadow + opacity 1, 다른 pill 은 scale 0.92 + opacity 0.55.
 *  - on=false : 모든 pill 시각 복귀.
 *  - 빈 영역 (footer 외) click → 자동 cancel (capture 단계 doc click listener).
 */
export function setReorderMode(doc, on, srcIdx = null) {
  const pillsEl = doc?.getElementById?.('sessionFooterPills');
  if (!pillsEl) return;
  const pills = pillsEl.querySelectorAll('[data-block-idx]');
  if (on) {
    pillsEl.dataset.reorder = '1';
    if (srcIdx != null) pillsEl.dataset.reorderSrc = String(srcIdx);
    pills.forEach((p) => {
      const idx = parseInt(p.dataset.blockIdx, 10);
      p.style.transition = 'transform 200ms ease, opacity 200ms ease, box-shadow 200ms ease';
      if (idx === srcIdx) {
        p.style.transform = 'scale(1.05)';
        p.style.opacity = '1';
        p.style.boxShadow = '0 8px 18px -4px rgba(217,119,87,0.45), 0 4px 8px -2px rgba(0,0,0,0.5)';
        p.style.zIndex = '10';
      } else {
        p.style.transform = 'scale(0.92)';
        p.style.opacity = '0.55';
        p.style.boxShadow = '';
        p.style.zIndex = '';
      }
    });
    // 빈 영역 click → cancel (한 번만 등록)
    if (doc.body && !doc.body.dataset.spaReorderEsc) {
      doc.addEventListener('click', (e) => {
        if (pillsEl.dataset.reorder !== '1') return;
        // pill 자체 click 은 wireFooterPillClick 가 이미 무시 — body 만 cancel
        if (e.target.closest('[data-block-idx]')) return;
        // 액션 시트 / backdrop click 은 closeActionSheet 만 — reorder cancel 트리거 X
        if (e.target.closest('#actionSheet, #actionBackdrop, #keypadSheet, #keypadBackdrop')) return;
        setReorderMode(doc, false);
      }, true);
      doc.body.dataset.spaReorderEsc = '1';
    }
  } else {
    delete pillsEl.dataset.reorder;
    delete pillsEl.dataset.reorderSrc;
    pills.forEach((p) => {
      p.style.transform = '';
      p.style.opacity = '';
      p.style.boxShadow = '';
      p.style.zIndex = '';
      setTimeout(() => { p.style.transition = ''; }, 220);
    });
  }
}

/* ──────────────────── 액션 핸들러 (spec §6-9 진짜 핸들러 — f-3 wiring) ──────────────────── */

/**
 * spec §6-9 set-row 삭제 — block.sets[setIdx] 제거.
 *  - sets.length === 0 이 되면 block 자체도 제거 (운동 카드 통째 삭제와 같은 의미).
 *  - 대상 블록: blockIdx 명시 single 우선, 미지정 시 마지막 single (하위호환).
 *    호출부(set-row 삭제)는 getCurrentBlockAndCursor 의 blockIdx 를 넘겨 '수정'과 동일 블록 보장
 *    (footer pill 로 이전 블록 전환 시 보이지 않는 블록 세트 삭제되던 회귀 방지).
 */
export async function persistRemoveSet(setIdx, blockIdx = null) {
  if (!Number.isFinite(setIdx) || setIdx < 0) return { ok: false, reason: 'invalid_input' };
  let session;
  try { session = await getActiveSession(); }
  catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) return { ok: false, reason: 'no_db' };
    console.error('[gymSession] persistRemoveSet getActive', e);
    return { ok: false, reason: 'error' };
  }
  if (!session) return { ok: false, reason: 'no_active_session' };
  const blocks = Array.isArray(session.blocks) ? session.blocks.slice() : [];
  // 대상 블록 — blockIdx 명시 single 우선, 그 외 마지막 single.
  let block = null;
  let targetIdx = -1;
  if (blockIdx != null && blockIdx >= 0 && blockIdx < blocks.length && blocks[blockIdx]?.type === 'single') {
    block = blocks[blockIdx];
    targetIdx = blockIdx;
  } else {
    const singles = blocks.map((b, i) => ({ b, i })).filter(({ b }) => b && b.type === 'single');
    if (!singles.length) return { ok: false, reason: 'no_single_block' };
    const pick = singles[singles.length - 1];
    block = pick.b;
    targetIdx = pick.i;
  }
  const sets = Array.isArray(block.sets) ? block.sets.slice() : [];
  if (setIdx >= sets.length) return { ok: false, reason: 'index_out_of_range' };
  sets.splice(setIdx, 1);
  if (sets.length === 0) {
    blocks.splice(targetIdx, 1);
  } else {
    blocks[targetIdx] = { ...block, sets };
  }
  try { await upsertSession({ ...session, blocks }); }
  catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymSession] persistRemoveSet upsert', e);
    }
    return { ok: false, reason: 'error' };
  }
  return { ok: true };
}

/**
 * spec §6-9 — 세션 삭제 (discard). active row 자체 DB 에서 제거.
 *  - 사용자 명시적 결정 ("세션 삭제" 메뉴 + 확인 단계 통과).
 *  - finalize 와 별개 (finalize = completed 마크, discard = row 제거).
 */
export async function discardActiveSession() {
  let session;
  try { session = await getActiveSession(); }
  catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) return { ok: false, reason: 'no_db' };
    console.error('[gymSession] discardActiveSession getActive', e);
    return { ok: false, reason: 'error' };
  }
  if (!session) return { ok: false, reason: 'no_active_session' };
  try {
    const db = (typeof window !== 'undefined' ? window.gymDB : null);
    if (!db) return { ok: false, reason: 'no_db' };
    await db.sessions.delete(session.id);
  } catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymSession] discardActiveSession delete', e);
    }
    return { ok: false, reason: 'error' };
  }
  return { ok: true, sessionId: session.id };
}

/**
 * spec §6-9 — 액션 시트 onSelect 통합 디스패처.
 *  - kind + actionId 별 분기. 각 액션은 DB 갱신 후 mountSessionView 재바인딩 또는 navigate.
 *  - footer-exercise 는 mocks pill 이라 실 데이터 wiring 부분만 (후속 — handoff 메모).
 */
async function handleActionSelect(doc, kind, actionId, target) {
  try {
    if (kind === 'session-end') {
      if (actionId === 'finish') {
        const r = await finalizeActiveSession();
        if (r && r.ok && typeof window !== 'undefined') {
          window.location.hash = '#/summary';
          return;
        }
        await mountSessionView();
        return;
      }
      if (actionId === 'discard') {
        await discardActiveSession();
        if (typeof window !== 'undefined') window.location.hash = '#/home';
        return;
      }
      return;
    }
    if (kind === 'active-card') {
      if (actionId === 'finish') {
        // 운동 완료 = 좌 스와이프로 입력 확정한 세트(done=true)만 유지. 빈 세트 폐기.
        // block.finishedAt marker → 회색 read-only 표시.
        // 다음 single block 자동 이동. 마지막이면 현재 block 유지 (회색 read-only).
        const ctx = await getCurrentBlockAndCursor();
        if (ctx) {
          const session = ctx.session;
          const blocks = session.blocks.slice();
          const pruned = pruneEmptySets(ctx.block);
          blocks[ctx.blockIdx] = { ...pruned, finishedAt: Date.now() };
          await upsertSession({ ...session, blocks });
          // 서킷 재정렬 — 완료 후 현재는 첫 미완료 종목 (완료분은 좌측에 쌓임).
          const nextIdx = findFirstUnfinishedBlock({ ...session, blocks });
          if (nextIdx != null) _currentBlockIdx = nextIdx;
        }
        await mountSessionView();
        return;
      }
      if (actionId === 'delete') {
        const ctx = await getCurrentBlockAndCursor();
        if (!ctx) return;
        await removeExerciseFromActiveSession(ctx.block.exerciseId);
        await mountSessionView();
        return;
      }
      return;
    }
    if (kind === 'set-row') {
      const setIdx = parseInt(target?.dataset?.setIdx, 10);
      if (!Number.isFinite(setIdx)) return;
      // edit/delete 공통 — 현재 표시 블록 (footer pill 전환 반영).
      const ctx = await getCurrentBlockAndCursor();
      if (actionId === 'edit') {
        if (!ctx) return;
        const set = ctx.block.sets?.[setIdx];
        if (!set) return;
        // 키패드 open with prefill (weight 모드, 해당 set 기존 값)
        openKeypad(doc, 'weight', { prefill: set.weight, setIdx });
        return;
      }
      if (actionId === 'delete') {
        await persistRemoveSet(setIdx, ctx ? ctx.blockIdx : null);
        await mountSessionView();
        return;
      }
      return;
    }
    if (kind === 'footer-exercise') {
      // (f-5-1) — 동적 pill 의 data-block-idx 기반 진짜 핸들러
      const blockIdx = parseInt(target?.dataset?.blockIdx, 10);
      if (!Number.isFinite(blockIdx)) return;
      if (actionId === 'finish') {
        // active state pill — 빈 세트 폐기 + finishedAt marker + 첫 미완료로 현재 이동(서킷 재정렬).
        // 전부 완료면 _currentBlockIdx 유지 (read-only).
        _currentBlockIdx = blockIdx;
        const session = await getActiveSession();
        if (session) {
          const blocks = session.blocks.slice();
          const pruned = pruneEmptySets(blocks[blockIdx]);
          blocks[blockIdx] = { ...pruned, finishedAt: Date.now() };
          await upsertSession({ ...session, blocks });
          const nextIdx = findFirstUnfinishedBlock({ ...session, blocks });
          if (nextIdx != null) _currentBlockIdx = nextIdx;
        }
        await mountSessionView();
        return;
      }
      if (actionId === 'edit') {
        // completed pill — 해당 block 으로 currentBlock 전환 (읽기 전용 모드는 후속)
        _currentBlockIdx = blockIdx;
        await mountSessionView();
        return;
      }
      if (actionId === 'delete') {
        const session = await getActiveSession();
        if (!session) return;
        const block = session.blocks?.[blockIdx];
        if (!block) return;
        if (block.type === 'single') {
          await removeExerciseFromActiveSession(block.exerciseId);
        } else {
          // 서킷 폐기 (spec §16) — 단순 splice (기존 IndexedDB 의 circuit 잔존 graceful 제거)
          const blocks = session.blocks.slice();
          blocks.splice(blockIdx, 1);
          await upsertSession({ ...session, blocks });
        }
        if (_currentBlockIdx === blockIdx) _currentBlockIdx = null;
        else if (_currentBlockIdx != null && _currentBlockIdx > blockIdx) _currentBlockIdx -= 1;
        await mountSessionView();
        return;
      }
      return;
    }
  } catch (e) {
    console.error('[gymSession] handleActionSelect', kind, actionId, e);
  }
}

/**
 * spec §6-3-2 — 키패드 buffer 갱신 순수함수.
 *  - '0~9' : append (선행 0 은 그대로 두면 안 됨? — spec 미명시. 단순 append 후 parseFloat 가 처리)
 *  - '.'   : 한 번만 허용. 빈 buf 면 '0.' 로 prefix.
 *  - 'del' : 한 자리 삭제.
 *  - 그 외 : 무시.
 */
export function updateKeypadBuf(buf, key) {
  const cur = String(buf || '');
  if (key === 'del') return cur.slice(0, -1);
  if (key === '.') {
    if (cur.includes('.')) return cur;
    return cur === '' ? '0.' : cur + '.';
  }
  if (/^[0-9]$/.test(String(key))) return cur + String(key);
  return cur;
}

/**
 * spec §6-10 — DOM 한 번 생성 후 transform/opacity 토글로 키패드 노출.
 *  - sheet : translateY(100%) → translateY(0)
 *  - backdrop : opacity 0 → 1, pointer-events none → auto
 *  - data-mode : 'weight'|'reps' (단위 라벨 + 적용 대상)
 *  - data-buf  : 입력 누적 (빈 시작)
 */
function openKeypad(doc, field, opts = {}) {
  const sheet = doc.getElementById('keypadSheet');
  const backdrop = doc.getElementById('keypadBackdrop');
  const value = doc.getElementById('keypadValue');
  const unit = doc.getElementById('keypadUnit');
  if (!sheet || !backdrop || !value || !unit) return;
  sheet.dataset.mode = field;
  // (f-3 wiring) — prefill 옵션 (set-row edit) + setIdx 보관 (특정 set 편집 모드)
  const hasPrefill = opts.prefill != null && Number.isFinite(opts.prefill);
  sheet.dataset.buf = hasPrefill ? String(opts.prefill) : '';
  // fresh="1" — prefill 표시 상태. 첫 숫자/. 입력 시 buf reset (prefill 위 덮어쓰기 의도).
  // del 키는 fresh 라도 buf 의 마지막 글자만 제거 (부분 수정 의도 보존).
  sheet.dataset.fresh = hasPrefill ? '1' : '0';
  if (opts.setIdx != null && Number.isFinite(opts.setIdx)) {
    sheet.dataset.setIdx = String(opts.setIdx);
  } else {
    delete sheet.dataset.setIdx;
  }
  setupKeypadChrome(doc, field, hasPrefill ? opts.prefill : null);
  renderKeypadValue(sheet, value);
  sheet.dataset.open = 'true';
  sheet.style.transform = 'translateY(0)';
  backdrop.dataset.open = 'true';
  backdrop.style.opacity = '1';
  backdrop.style.pointerEvents = 'auto';
}

function closeKeypad(doc) {
  const sheet = doc.getElementById('keypadSheet');
  const backdrop = doc.getElementById('keypadBackdrop');
  if (!sheet || !backdrop) return;
  sheet.dataset.open = 'false';
  sheet.style.transform = 'translateY(100%)';
  backdrop.dataset.open = 'false';
  backdrop.style.opacity = '0';
  backdrop.style.pointerEvents = 'none';
}

function renderKeypadValue(sheet, valueEl) {
  if (!valueEl) return;
  const buf = sheet?.dataset?.buf || '';
  valueEl.textContent = buf === '' ? '0' : buf;
}

/**
 * P3 라이트 키패드 chrome — 단위 라벨 + 무게/횟수(또는 시간/거리) 토글 active + 빠른증분 가시성 + 참조줄.
 *  - pair: weight↔reps / duration↔distance. bodyweight 는 weight 토글 숨김(횟수 전용).
 *  - quick(±2.5/+5 원판단위): weight 에서만 노출.
 *  - ref: prefill(편집 시작값) 이 있으면 "직전 Nkg".
 */
function setupKeypadChrome(doc, field, prefill) {
  const unit = doc.getElementById('keypadUnit');
  const seg = doc.getElementById('keypadModeSeg');
  const quick = doc.getElementById('keypadQuick');
  const ref = doc.getElementById('keypadRef');
  const unitText = field === 'weight' ? 'kg' : field === 'duration' ? '분' : field === 'distance' ? 'km' : '회';
  if (unit) unit.textContent = unitText;
  const isCardioField = field === 'duration' || field === 'distance';
  const pair = isCardioField ? [['duration', '시간'], ['distance', '거리']] : [['weight', '무게'], ['reps', '횟수']];
  const kind = doc.getElementById('cardSwipeArea')?.getAttribute('data-card-kind') || 'weight';
  if (seg) {
    const btns = seg.querySelectorAll('button');
    pair.forEach(([m, label], i) => {
      const b = btns[i];
      if (!b) return;
      b.dataset.kpmode = m;
      b.textContent = label;
      b.classList.toggle('on', m === field);
      // bodyweight 운동은 무게 편집 없음 → 무게 토글 숨김(횟수만).
      b.style.display = (kind === 'bodyweight' && m === 'weight') ? 'none' : '';
    });
  }
  if (quick) quick.style.display = field === 'weight' ? 'flex' : 'none';
  if (ref) {
    if (prefill != null && Number.isFinite(prefill)) {
      // 시안(session-keypad.html) ref 줄 — weight 모드는 탭존 증감 힌트 동반.
      // 시안 문구 "±2.5" 는 실 로직과 불일치 (applyTapDelta: barbell/machine/cable ±5, dumbbell ±2)
      // → 장비별로 달라 수치 미명시 (라이브 검증 2026-06-10 발견).
      const hint = field === 'weight' ? ' · 좌우 탭존으로도 증감' : '';
      ref.innerHTML = `직전 <b>${escapeHtml(String(prefill))}${escapeHtml(unitText)}</b>${hint}`;
    } else {
      ref.textContent = '';
    }
  }
}

/**
 * P3 — 키패드 내 무게/횟수 토글. 현재 set 의 새 field 값을 prefill 로 불러와 재초기화 (편집 set 유지).
 */
async function switchKeypadMode(doc, field) {
  const sheet = doc.getElementById('keypadSheet');
  if (!sheet || sheet.dataset.mode === field) return;
  let prefill;
  try {
    const ctx = await getCurrentBlockAndCursor();
    const setIdx = sheet.dataset.setIdx ? parseInt(sheet.dataset.setIdx, 10) : ctx?.effectiveCur;
    const set = ctx?.block?.sets?.[setIdx];
    if (set && Number.isFinite(set[field])) {
      prefill = field === 'duration' ? Math.round(set[field] / 60) : set[field];
    }
  } catch (_) { /* graceful */ }
  sheet.dataset.mode = field;
  const has = prefill != null && Number.isFinite(prefill);
  sheet.dataset.buf = has ? String(prefill) : '';
  sheet.dataset.fresh = has ? '1' : '0';
  setupKeypadChrome(doc, field, has ? prefill : null);
  renderKeypadValue(sheet, doc.getElementById('keypadValue'));
}

/**
 * 완료 버튼 click → buf 파싱 → persistKeypadEdit + mountSessionView.
 *  - reps 는 정수 round, weight 는 소수 보존 (덤벨 2.5kg).
 *  - 빈 buf 또는 invalid → 단순 close (취소와 동일).
 */
export async function applyKeypadValue(doc) {
  const sheet = doc?.getElementById?.('keypadSheet');
  if (!sheet) return;
  const field = sheet.dataset.mode;
  const buf = sheet.dataset.buf || '';
  const parsed = parseFloat(buf);
  if (!Number.isFinite(parsed) || parsed < 0) {
    closeKeypad(doc);
    return;
  }
  const finalValue =
    field === 'reps' ? Math.round(parsed)
    : field === 'duration' ? Math.round(parsed * 60) // 분 → 초
    : parsed;

  let ctx;
  try { ctx = await getCurrentBlockAndCursor(); }
  catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymSession] applyKeypadValue ctx', e);
    }
    closeKeypad(doc);
    return;
  }
  if (!ctx) { closeKeypad(doc); return; }

  const { block, effectiveCur } = ctx;
  // (f-3 wiring) — sheet.dataset.setIdx 가 있으면 특정 set 편집, 없으면 effectiveCur (기본)
  const sheetSetIdx = sheet.dataset.setIdx;
  const targetSetIdx = sheetSetIdx ? parseInt(sheetSetIdx, 10) : effectiveCur;
  const exerciseName = resolveExerciseName(block.exerciseId);
  const r = await persistKeypadEdit({ exerciseName, setIdx: targetSetIdx, field, value: finalValue });
  closeKeypad(doc);
  if (r && r.ok) await mountSessionView();
}

/**
 * spec §6-3-2 — 키패드 시트 click + 배경 탭 + 아래 스와이프 리스너 부착.
 *  - 1~9 / 0 / . / del click → updateKeypadBuf → 화면 갱신
 *  - 완료 click → applyKeypadValue
 *  - 배경 탭 → closeKeypad (취소)
 *  - 시트 아래 60px+ 스와이프 → closeKeypad (취소)
 */
function wireKeypad(doc) {
  const sheet = doc.getElementById('keypadSheet');
  const backdrop = doc.getElementById('keypadBackdrop');
  const done = doc.getElementById('keypadDone');
  const value = doc.getElementById('keypadValue');
  const grid = doc.getElementById('keypadGrid');
  if (!sheet || !backdrop || !done || !value || !grid) return;
  if (sheet.dataset.spaHooked === '1') return;

  // 키 click — grid 위임. fresh="1" (prefill 표시 상태) + 숫자/. 입력 시 buf reset.
  // del 키는 fresh 라도 그대로 (마지막 글자 제거, 부분 수정 의도).
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.keypad-key');
    if (!btn) return;
    const k = btn.dataset.key;
    let buf = sheet.dataset.buf || '';
    if (sheet.dataset.fresh === '1' && k !== 'del') {
      buf = '';
    }
    sheet.dataset.buf = updateKeypadBuf(buf, k);
    sheet.dataset.fresh = '0';
    renderKeypadValue(sheet, value);
  });

  // P3 — 무게/횟수(또는 시간/거리) 토글
  const modeSeg = doc.getElementById('keypadModeSeg');
  if (modeSeg) {
    modeSeg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-kpmode]');
      if (!b) return;
      switchKeypadMode(doc, b.dataset.kpmode).catch((err) => console.error('[gymSession] keypad mode', err));
    });
  }
  // P3 — 원판 단위 빠른 증분 (±2.5/+5). 현재 buf 에 delta 적용 (0 미만 clamp).
  const quick = doc.getElementById('keypadQuick');
  if (quick) {
    quick.addEventListener('click', (e) => {
      const b = e.target.closest('[data-kpdelta]');
      if (!b) return;
      const delta = parseFloat(b.dataset.kpdelta);
      if (!Number.isFinite(delta)) return;
      let next = (parseFloat(sheet.dataset.buf || '0') || 0) + delta;
      if (next < 0) next = 0;
      sheet.dataset.buf = Number.isInteger(next) ? String(next) : String(parseFloat(next.toFixed(2)));
      sheet.dataset.fresh = '0';
      renderKeypadValue(sheet, value);
    });
  }

  done.addEventListener('click', () => {
    applyKeypadValue(doc).catch((e) => console.error('[gymSession] keypad done', e));
  });

  // backdrop (빈 화면) 탭 → 입력된 값 commit + 닫힘 (사용자 명시 의도).
  // buf 가 빈 값 (사용자가 prefill 도 지우고 안 누름) 이면 applyKeypadValue 가 graceful close.
  backdrop.addEventListener('click', () => {
    applyKeypadValue(doc).catch((e) => console.error('[gymSession] keypad backdrop apply', e));
  });

  // 시트 아래 스와이프 → 취소 (60px+)
  let downY = 0;
  let tracking = false;
  sheet.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 키 버튼 직접 클릭은 swipe 추적 안 함 (의도치 않은 close 방지)
    if (e.target.closest('.keypad-key, #keypadDone, #keypadModeSeg, #keypadQuick')) return;
    downY = e.clientY;
    tracking = true;
  });
  sheet.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    if (e.clientY - downY >= 60) closeKeypad(doc);
  });
  sheet.addEventListener('pointercancel', () => { tracking = false; });

  sheet.dataset.spaHooked = '1';
}

/**
 * 현재 active block + cursor 조회 (mountSessionActive 와 동일 정책 — 마지막 single 블록).
 *  - cur : 첫 un-done set idx. 모두 done 이면 -1.
 *  - effectiveCur : cur === -1 이면 sets.length - 1 (표시상의 "현재 set").
 *  - 반환 null : active 세션·single 블록 부재.
 */
async function getCurrentBlockAndCursor() {
  const session = await getActiveSession();
  if (!session || !Array.isArray(session.blocks)) return null;
  // (f-5-1) — _currentBlockIdx 가 유효 single 블록을 가리키면 그 block, 그 외 마지막 single 자동
  let block = null;
  let blockIdx = -1;
  if (_currentBlockIdx != null && _currentBlockIdx >= 0 && _currentBlockIdx < session.blocks.length) {
    const candidate = session.blocks[_currentBlockIdx];
    if (candidate && candidate.type === 'single') {
      block = candidate;
      blockIdx = _currentBlockIdx;
    }
  }
  if (!block) {
    const singles = session.blocks
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b && b.type === 'single');
    if (!singles.length) return null;
    const pick = singles[singles.length - 1];
    block = pick.b;
    blockIdx = pick.i;
  }
  const sets = Array.isArray(block.sets) ? block.sets : [];
  const cur = sets.findIndex((s) => s && !s.done);
  const effectiveCur = cur === -1 ? Math.max(0, sets.length - 1) : cur;
  return { session, block, blockIdx, cur, effectiveCur };
}

/** prefers-reduced-motion: reduce 감지 (작업지시서 §10) — 모션 게이트 공통. SSR/미지원 시 false. */
function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 세그먼트 확정 플래시 (작업지시서 §6) — 완료 세그 하단 2px 라인 scaleX 0→1 후 페이드.
 * 확정 색 = 잉크(ink-1). 모든 방향 공통. reduced-motion 시 미재생(상태는 mountSessionActive 가 정적 반영).
 */
function playSegConfirmFlash(doc, idx, dur = 240) {
  if (prefersReducedMotion()) return;
  try {
    const flash = doc?.getElementById('cardSetDots')?.querySelector(`.seg[data-set-idx="${idx}"] .seg-flash`);
    if (!flash || typeof flash.animate !== 'function') return;
    flash.style.background = 'var(--ink-1)';
    flash.animate([
      { transform: 'scaleX(0)', opacity: 0 },
      { transform: 'scaleX(1)', opacity: 0.85, offset: 0.4 },
      { transform: 'scaleX(1)', opacity: 0 },
    ], { duration: dur * 1.6, easing: 'ease-out' });
  } catch (_) { /* WAAPI 미지원 graceful */ }
}

/**
 * 숫자 카운트업 (작업지시서 §7) — from→to ease-out-cubic. rAF + setTimeout 폴백(백그라운드 안전).
 * onUpd(value, isFinal) — isFinal 일 때 정확한 최종값 표시.
 */
function animNum(from, to, dur, onUpd) {
  if (typeof requestAnimationFrame !== 'function' || typeof performance === 'undefined') { onUpd(to, true); return; }
  const t0 = performance.now();
  let done = false;
  const tick = (now) => {
    if (done) return;
    const p = Math.min(1, (now - t0) / dur);
    if (p < 1) { const e = 1 - Math.pow(1 - p, 3); onUpd(from + (to - from) * e, false); requestAnimationFrame(tick); }
    else { done = true; onUpd(to, true); }
  };
  requestAnimationFrame(tick);
  setTimeout(() => { if (!done) { done = true; onUpd(to, true); } }, dur + 90);
}

/** 볼륨 진행바 리딩 엣지 플레어 (작업지시서 §7) — 완료 시 한 번 강하게. reduced-motion 은 호출부 게이트. */
function flareVolEdge(doc) {
  if (prefersReducedMotion()) return;
  try {
    const edge = doc?.getElementById('volEdge');
    if (!edge || typeof edge.animate !== 'function') return;
    edge.animate([
      { boxShadow: '0 0 0 2px var(--crail-base), 0 0 8px 2px rgba(217,119,87,0.45)', transform: 'translate(-50%,-50%) scale(1)' },
      { boxShadow: '0 0 0 3px var(--crail-base), 0 0 20px 7px rgba(217,119,87,0.7)', transform: 'translate(-50%,-50%) scale(1.4)', offset: 0.3 },
      { boxShadow: '0 0 0 2px var(--crail-base), 0 0 8px 2px rgba(217,119,87,0.45)', transform: 'translate(-50%,-50%) scale(1)' },
    ], { duration: 560, easing: 'ease-out' });
  } catch (_) { /* WAAPI 미지원 graceful */ }
}

/**
 * 직전 기록 돌파 순간 1회성 (작업지시서 §7-over) — 끝점 버스트 링 + 바 brightness 팝 + 돌파 태그 rise-in.
 * 정적 over 상태(is-over/broken/태그)는 mountSessionActive 가 담당. reduced-motion 은 호출부 게이트.
 */
function exRecordBurst(doc) {
  if (prefersReducedMotion()) return;
  try {
    const burst = doc?.getElementById('volBurst');
    const bar = doc?.getElementById('cardProgressBar');
    const brk = doc?.getElementById('volBreak');
    if (burst && typeof burst.animate === 'function') burst.animate([
      { opacity: 0, transform: 'translate(50%,-50%) scale(0.4)' },
      { opacity: 0.85, transform: 'translate(50%,-50%) scale(1.8)', offset: 0.3 },
      { opacity: 0, transform: 'translate(50%,-50%) scale(3.6)' },
    ], { duration: 660, easing: 'cubic-bezier(.2,.7,.2,1)' });
    if (bar && typeof bar.animate === 'function') bar.animate([
      { filter: 'brightness(1)' }, { filter: 'brightness(1.28)', offset: 0.3 }, { filter: 'brightness(1)' },
    ], { duration: 520, easing: 'ease-out' });
    if (brk && typeof brk.animate === 'function') brk.animate([
      { transform: 'translateY(7px)' }, { transform: 'translateY(0)' },
    ], { duration: 360, easing: 'cubic-bezier(.2,.8,.3,1)' });
  } catch (_) { /* WAAPI 미지원 graceful */ }
}

/**
 * 워크아웃 총볼륨 신기록 순간 1회성 (작업지시서 §8) — 누적 숫자 scale+crail 플래시 + 신기록 태그 rise-in.
 * 정적 상태(취소선·태그)는 mountSessionActive 가 담당. reduced-motion 은 호출부 게이트.
 */
function topRecordPulse(doc) {
  if (prefersReducedMotion()) return;
  try {
    const num = doc?.getElementById('cardSetProgress');
    const tag = doc?.getElementById('cardRecordTag');
    if (num && typeof num.animate === 'function') num.animate([
      { transform: 'scale(1)', color: 'var(--ink-1)' },
      { transform: 'scale(1.16)', color: 'var(--crail-deep)', offset: 0.32 },
      { transform: 'scale(1)', color: 'var(--ink-1)' },
    ], { duration: 580, easing: 'cubic-bezier(.2,.7,.2,1)' });
    if (tag && typeof tag.animate === 'function') tag.animate([
      { transform: 'translateY(6px)' }, { transform: 'translateY(0)' },
    ], { duration: 400, easing: 'cubic-bezier(.2,.8,.3,1)' });
  } catch (_) { /* WAAPI 미지원 graceful */ }
}

/**
 * 시트 dim 시 status bar(theme-color) 동조 — iOS standalone 은 status bar 가 웹 뷰포트 밖이라
 * 백드롭(inset:0)이 못 덮어 상단에 밝은 가로 띠(seam)가 남음 (사용자 보고 2026-06-11).
 * 시트 open 시 dim 합성색(#fdfdfd 위 oklch(22% .008 60 / .32) ≈ #b8b7b6), close 시 복원.
 */
function setStatusBarDim(doc, on) {
  try {
    const meta = doc?.querySelector?.('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', on ? '#b8b7b6' : '#fdfdfd');
  } catch (_) { /* graceful */ }
}

/**
 * 햅틱 + 링 시각화 (부록 작업지시서 — 햅틱 링) — 세트 완료 커밋 직후 1회.
 *  - navigator.vibrate 는 iOS Safari/PWA 미지원 → 링 애니가 시각적 확정감을 대체 (항상 병행 실행).
 *  - 일반: 420ms, scale .4→.72→1, 글로우 alpha .3 / PR: 540ms, scale .4→1.5→2.1, 글로우 alpha .45.
 *  - reduced-motion: 링·진동 모두 스킵 (부록 §조건).
 */
function playSetHaptic(doc, isPR) {
  if (prefersReducedMotion()) return;
  try { navigator.vibrate?.(isPR ? [12, 28, 12] : 10); } catch (_) { /* iOS 미지원 silent */ }
  try {
    const ring = doc?.getElementById('hapticRing');
    if (!ring || typeof ring.animate !== 'function') return;
    ring.animate([
      { opacity: 0, transform: 'translate(-50%,-50%) scale(0.4)', boxShadow: '0 0 0 0 rgba(217,119,87,0)' },
      isPR
        ? { opacity: 1, transform: 'translate(-50%,-50%) scale(1.5)', offset: 0.3 }
        : { opacity: 0.9, transform: 'translate(-50%,-50%) scale(0.72)', offset: 0.25 },
      { opacity: isPR ? 0.85 : 0.9, boxShadow: isPR ? '0 0 0 14px rgba(217,119,87,0.45)' : '0 0 0 8px rgba(217,119,87,0.3)', offset: 0.5 },
      { opacity: 0, transform: `translate(-50%,-50%) scale(${isPR ? 2.1 : 1.0})`, boxShadow: '0 0 0 0 rgba(217,119,87,0)' },
    ], { duration: isPR ? 540 : 420, easing: 'cubic-bezier(0.2,0.7,0.2,1)' });
  } catch (_) { /* WAAPI 미지원 graceful */ }
}

/**
 * spec §6-3-1 좌 스와이프.
 *  - cur 가 유효 : sets[cur].done = true (preset:false).
 *  - cur === sets.length - 1 (마지막 set) : 새 set 추가 (이전 값 preset 카피).
 *  - cur === -1 (모두 이미 done) : 새 set 추가만 (advance 효과).
 */
export async function handleLeftSwipe(options = {}) {
  const fromDrag = !!options.fromDrag; // 드래그 추종 커밋 — OUT 을 위치 점프 없이 페이드만 (이미 좌로 끌려있음).
  let ctx;
  try { ctx = await getCurrentBlockAndCursor(); }
  catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymSession] handleLeftSwipe ctx', e);
    }
    return;
  }
  if (!ctx) return;
  // 완료된 운동 (마지막 운동 회색 read-only) 은 스와이프 차단
  if (isBlockLocked(ctx.block)) return;
  const { session, block, cur } = ctx;
  const blocks = session.blocks.slice();
  const blockIdx = blocks.indexOf(block);
  if (blockIdx === -1) return;
  const sets = Array.isArray(block.sets) ? block.sets.slice() : [];

  if (cur === -1) {
    const last = sets[sets.length - 1] || {};
    sets.push({
      weight: last.weight ?? null,
      reps: last.reps ?? null,
      duration: last.duration ?? null,
      distance: last.distance ?? null,
      done: false,
      preset: true,
      pr: false,
    });
  } else {
    const prev = sets[cur] || {};
    const committedW = prev.weight ?? null;
    const committedR = prev.reps ?? null;
    sets[cur] = {
      // prev 스프레드 — cardio duration·distance 등 보존 (구버전 5키 재구성이 입력값 유실 — 2026-06-10 사용자 보고)
      ...prev,
      weight: committedW,
      reps: committedR,
      done: true,
      preset: false,
      pr: !!prev.pr,
    };
    if (cur === sets.length - 1) {
      sets.push({
        weight: committedW,
        reps: committedR,
        duration: prev.duration ?? null,
        distance: prev.distance ?? null,
        done: false,
        preset: true,
        pr: false,
      });
    } else {
      // spec §6-3-3 — 다음 세트 값 우선순위: ① 이전 세션 같은 세트번호 > ② 이번 세션 직전 세트 상속.
      // 직전 세트 상속(②)은 사용자 미수정 preset 이면서 + 이전 세션에 같은 세트번호 기록이 없을 때만.
      // 이전 세션 기록이 있으면 prefill 된 그 값을 보존 (직전 세트의 더 높은 값으로 덮어쓰지 않음) —
      // 미수정 preset 을 상속으로 덮으면 이전 세션 타깃이 진행하며 전부 사라지는 회귀.
      const next = sets[cur + 1];
      if (next && next.preset) {
        let prevSessionSets = null;
        try { prevSessionSets = await getPrevSessionLastSets(block.exerciseId); }
        catch (_) { /* 조회 실패 → 직전 세트 상속(②)으로 폴백 */ }
        const ps = prevSessionSets && prevSessionSets[cur + 1];
        // 이전 세션 같은 세트번호에 의미값(reps>0) 있으면 보존 — 없으면 직전 세트 상속.
        const hasPrevSame = !!(ps && Number.isFinite(ps.reps) && ps.reps > 0);
        if (!hasPrevSame) {
          sets[cur + 1] = { ...next, weight: committedW, reps: committedR };
        }
      }
    }
  }

  // (g) PR 판정 — cur 유효 + commit 시점만. cur===-1 (advance only) 분기는 PR 발화 없음.
  //   ① e1RM PR (persistSetPR): 통계 기록 + set.pr 영구 마크(renderSetDotHtml accent).
  //   ② PR 모먼트(팝+세그 crail 글로우+강햅틱): 작업지시서 §4 R2 = "역대 e1RM 신기록" 일 때만 (persistSetPR isPR 재사용).
  let prResult = null;
  let prMoment = false;
  if (cur !== -1) {
    const committed = sets[cur];
    if (committed && Number.isFinite(committed.weight) && Number.isFinite(committed.reps)
        && committed.weight > 0 && committed.reps > 0) {
      try {
        prResult = await persistSetPR({
          exerciseName: resolveExerciseName(block.exerciseId),
          weight: committed.weight,
          reps: committed.reps,
          sessionId: session.id,
          date: session.date,
        });
        if (prResult && prResult.isPR) {
          // set 자체에도 pr=true 영구 마크 (renderSetDotHtml 가 accent 영구 표시)
          sets[cur] = { ...sets[cur], pr: true };
        }
      } catch (e) {
        if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
          console.error('[gymSession] handleLeftSwipe PR', e);
        }
      }
      // §4 R2 — PR 모먼트는 역대 e1RM 신기록(엄격 초과)만. persistSetPR 의 isPR 재사용 (직전 최대무게 기반 폐기).
      //   무게 종목 한정 가드는 위 if(weight>0 && reps>0) 로 유지 — cardio/bodyweight 는 weight 0 → prResult.isPR false.
      prMoment = !!(prResult && prResult.isPR);
    }
  }

  blocks[blockIdx] = { ...block, sets };

  // 커밋 1회성 신호 — mountSessionActive 가 이 종목 count-up/축하 모션 발화 후 소비 (리뷰 #6).
  //   cur===-1(전부 done → advance only) 은 새 done 세트가 없어 축하 대상 아님.
  if (cur !== -1) _justCommittedExId = block.exerciseId;

  // 좌 스와이프 commit 책장 넘김 (방향 C · 산뜻 — 작업지시서 §5):
  //   - OUT (187ms, accel): translateX(0 → -26) + opacity(1 → 0). opacity 0 보장 → 이후 우측 jump 가 invisible
  //   - DB upsert + mount 는 OUT 과 병렬 (Promise.all) → OUT 끝과 mount 끝이 거의 동시 → 좌측 정지 시간 0
  //   - IN reset (jump): transform translateX(+26), opacity 0 (invisible 상태)
  //   - IN (220ms, decel): translateX(+26 → 0) + opacity(0 → 1) + 볼륨바 brightness 동반 강조
  //   - onfinish 비의존 (setTimeout 폴백 + Promise.all) → 백그라운드 탭 안전 (§5 콜아웃)
  const doc = typeof document !== 'undefined' ? document : null;
  const swipeArea = doc?.getElementById('cardSwipeArea');
  const heroVals = doc?.getElementById('cardHeroVals') || swipeArea; // 슬라이드/드래그 대상 = 내부 히어로 값 (완료 칩은 cardSwipeArea 직속 → 같이 안 움직임)
  const canAnimate = swipeArea && typeof requestAnimationFrame === 'function';

  // 햅틱 + 링 시각화 (부록) — 커밋 즉시(0ms). advance-only(cur===-1) 는 완료 아님 → 약진동만 (기존 동작 보존).
  if (cur !== -1) playSetHaptic(doc, prMoment);
  else { try { navigator.vibrate?.(10); } catch (_) { /* iOS 미지원 silent */ } }

  if (!canAnimate || prefersReducedMotion()) {
    // RM/비애니 — 드래그 추종이 남긴 translateX 즉시 복원 (애니 경로만 translateX(0) 복원하던 누락 보완, 리뷰 #1).
    if (heroVals) { heroVals.style.transition = 'none'; heroVals.style.transform = ''; heroVals.style.opacity = '1'; }
    try { await upsertSession({ ...session, blocks }); }
    catch (e) {
      if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
        console.error('[gymSession] handleLeftSwipe upsert', e);
      }
      return;
    }
    await mountSessionView();
    if (prMoment && typeof document !== 'undefined') showPrPop(document, cur);
    return;
  }

  // OUT 시작 — fromDrag 면 현재 끌린 위치에서 페이드만(점프 방지), 아니면 방향 C 슬라이드(가속).
  if (fromDrag) {
    heroVals.style.transition = 'opacity 150ms ease-out';
    heroVals.style.opacity = '0';
  } else {
    heroVals.style.transition = 'transform 187ms cubic-bezier(.4,0,1,1), opacity 187ms cubic-bezier(.4,0,1,1)';
    heroVals.style.transform = 'translateX(-26px)';
    heroVals.style.opacity = '0';
  }
  const outDone = new Promise((r) => setTimeout(r, fromDrag ? 150 : 187));

  // 병렬로 DB + mount 진행 (OUT 시간 동안 가려진 채로 데이터 갱신)
  let upsertErr = null;
  const mountDone = (async () => {
    try { await upsertSession({ ...session, blocks }); }
    catch (e) {
      if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
        console.error('[gymSession] handleLeftSwipe upsert', e);
      }
      upsertErr = e;
      return;
    }
    await mountSessionView();
  })();

  await Promise.all([outDone, mountDone]);

  if (upsertErr) {
    // upsert 실패 — 원상 복구 + 종료
    heroVals.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';
    heroVals.style.transform = 'translateX(0)';
    heroVals.style.opacity = '1';
    return;
  }

  // 세그먼트 확정 플래시 (§6) + 볼륨바 끝점 플레어 (§7) — 방금 완료한 세그(cur). advance-only(cur===-1) 제외.
  if (cur !== -1) { playSegConfirmFlash(doc, cur); flareVolEdge(doc); }

  // 자식 transition (set dot font-size 등) 시작 보장 — 다음 paint frame 까지 대기.
  // 이 대기 없이 곧장 swipeArea force reflow 호출하면 자식들의 transition trigger 가 skip 됨.
  // §5 콜아웃 — rAF 는 백그라운드 탭/헤드리스에서 안 fire → IN 미실행으로 히어로가 OUT(빈 화면)에 갇힘.
  // setTimeout 폴백으로 IN 진입 보장 (rAF·timer 중 먼저 도착하는 쪽).
  await new Promise((r) => {
    let settled = false;
    const go = () => { if (!settled) { settled = true; r(); } };
    requestAnimationFrame(go);
    setTimeout(go, 32);
  });

  // IN 시작점 jump (invisible — opacity 0 이라 사용자 안 보임)
  heroVals.style.transition = 'none';
  heroVals.style.transform = 'translateX(26px)';
  heroVals.style.opacity = '0';
  // 강제 reflow 로 style flush 보장 (rAF 대기 없이도 transition 트리거)
  void heroVals.offsetHeight;
  // IN 트랜지션 (방향 C — 감속 이징)
  heroVals.style.transition = 'transform 220ms cubic-bezier(.16,.84,.3,1), opacity 220ms cubic-bezier(.16,.84,.3,1)';
  heroVals.style.transform = 'translateX(0)';
  heroVals.style.opacity = '1';
  // 볼륨바 동반 강조 — brightness 1 → 1.14 → 1 (방향 C §5). WAAPI fill:none → 자동 복귀(throttle 안전).
  try {
    const volBarEl = doc.getElementById('cardProgressBar');
    if (volBarEl && typeof volBarEl.animate === 'function') {
      volBarEl.animate(
        [{ filter: 'brightness(1)' }, { filter: 'brightness(1.14)', offset: 0.4 }, { filter: 'brightness(1)' }],
        { duration: 440, easing: 'ease-out' },
      );
    }
  } catch (_) { /* WAAPI 미지원 graceful */ }

  // PR 팝 (mountSessionView 후 — 새 dot 노드에 대해 PR 표시는 이미 적용됨, pop 만 추가)
  if (prMoment && typeof document !== 'undefined') {
    showPrPop(document, cur);
  }
}

/**
 * spec §6-11 — "PR" 텍스트 1초 페이드아웃 (위로 살짝 떠오름). DOM 한 번 + opacity/transform 토글.
 *  - opacity 0 → 1 (220ms ease, fade-in)
 *  - transform translateY(0) → translateY(-12px) (700ms ease, 위로 떠오름)
 *  - 800ms 후 fade-out (opacity 1 → 0, transform 복원)
 */
function showPrPop(doc, segIdx) {
  // 진동·링은 playSetHaptic(부록 햅틱 링)이 담당 — 여기선 시각(팝+세그 글로우)만.
  if (prefersReducedMotion()) return; // RM — PR 팝/글로우 미재생 (PR 표시는 세그의 영구 accent 로 정적 전달).
  const el = doc.getElementById('cardPrPop');
  if (el) {
    if (typeof el.animate === 'function') {
      // PR rise & fade (작업지시서 §9) — 1000ms.
      el.animate([
        { opacity: 0, transform: 'translateY(10px) scale(0.92)' },
        { opacity: 1, transform: 'translateY(-2px) scale(1)', offset: 0.28 },
        { opacity: 1, transform: 'translateY(-7px) scale(1)', offset: 0.68 },
        { opacity: 0, transform: 'translateY(-16px) scale(1)' },
      ], { duration: 1000, easing: 'cubic-bezier(.2,.7,.2,1)' });
    } else {
      el.style.opacity = '1'; el.style.transform = 'translateY(-12px)';
      setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(0)'; }, 800);
    }
  }
  // 완료 세그 crail 글로우 1회 (§9) — PR 강조.
  if (Number.isFinite(segIdx)) {
    try {
      const segBar = doc.getElementById('cardSetDots')?.querySelector(`.seg[data-set-idx="${segIdx}"] .seg-bar`);
      if (segBar && typeof segBar.animate === 'function') segBar.animate([
        { boxShadow: '0 0 0 0 rgba(217,119,87,0)' },
        { boxShadow: '0 0 0 5px rgba(217,119,87,0.30)', offset: 0.4 },
        { boxShadow: '0 0 0 0 rgba(217,119,87,0)' },
      ], { duration: 950, easing: 'ease-out' });
    } catch (_) { /* WAAPI 미지원 graceful */ }
  }
}

/**
 * spec §6-3-1 우 스와이프.
 *  - effectiveCur === 0 (첫 set) : 무시.
 *  - 직전 set (effectiveCur - 1) 의 done:false → 수정 모드 (다시 현재 set 으로).
 */
export async function handleRightSwipe(options = {}) {
  const fromDrag = !!options.fromDrag; // 드래그 추종 커밋 — OUT 페이드만 (점프 방지).
  let ctx;
  try { ctx = await getCurrentBlockAndCursor(); }
  catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymSession] handleRightSwipe ctx', e);
    }
    return;
  }
  if (!ctx) return;
  // 완료된 운동 (회색 read-only) 은 스와이프 차단
  if (isBlockLocked(ctx.block)) return;
  const { session, block, effectiveCur } = ctx;
  if (effectiveCur === 0) return; // spec §6-3-1 — 첫 set 우 스와이프 무시
  const blocks = session.blocks.slice();
  const blockIdx = blocks.indexOf(block);
  if (blockIdx === -1) return;
  const sets = Array.isArray(block.sets) ? block.sets.slice() : [];
  const prevIdx = effectiveCur - 1;
  if (prevIdx < 0 || prevIdx >= sets.length) return;
  sets[prevIdx] = { ...sets[prevIdx], done: false };
  blocks[blockIdx] = { ...block, sets };

  // 우 스와이프 책장 넘김 (좌 스와이프 대칭) — OUT 우측 + IN 좌측에서 들어옴.
  const doc = typeof document !== 'undefined' ? document : null;
  const swipeArea = doc?.getElementById('cardSwipeArea');
  const heroVals = doc?.getElementById('cardHeroVals') || swipeArea; // 슬라이드/드래그 대상 = 내부 히어로 값 (완료 칩은 cardSwipeArea 직속 → 같이 안 움직임)
  const canAnimate = swipeArea && typeof requestAnimationFrame === 'function';

  if (!canAnimate || prefersReducedMotion()) {
    // RM/비애니 — 드래그 추종이 남긴 translateX 즉시 복원 (리뷰 #1).
    if (heroVals) { heroVals.style.transition = 'none'; heroVals.style.transform = ''; heroVals.style.opacity = '1'; }
    try { await upsertSession({ ...session, blocks }); }
    catch (e) {
      if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
        console.error('[gymSession] handleRightSwipe upsert', e);
      }
      return;
    }
    await mountSessionView();
    return;
  }

  if (fromDrag) {
    heroVals.style.transition = 'opacity 150ms ease-out';
    heroVals.style.opacity = '0';
  } else {
    heroVals.style.transition = 'transform 180ms ease-out, opacity 180ms ease-out';
    heroVals.style.transform = 'translateX(28px)';
    heroVals.style.opacity = '0';
  }
  const outDone = new Promise((r) => setTimeout(r, fromDrag ? 150 : 180));

  let upsertErr = null;
  const mountDone = (async () => {
    try { await upsertSession({ ...session, blocks }); }
    catch (e) {
      if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
        console.error('[gymSession] handleRightSwipe upsert', e);
      }
      upsertErr = e;
      return;
    }
    await mountSessionView();
  })();

  await Promise.all([outDone, mountDone]);

  if (upsertErr) {
    heroVals.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';
    heroVals.style.transform = 'translateX(0)';
    heroVals.style.opacity = '1';
    return;
  }

  // 자식 transition (set dot font-size 등) 시작 보장 — handleLeftSwipe 와 동일.
  // §5 콜아웃 — rAF 가 백그라운드 탭/헤드리스에서 안 fire 시 IN 미실행으로 카드가 OUT 에 갇히는 것 방지 (setTimeout 폴백).
  await new Promise((r) => {
    let settled = false;
    const go = () => { if (!settled) { settled = true; r(); } };
    requestAnimationFrame(go);
    setTimeout(go, 32);
  });

  // IN 시작점 jump (좌측 invisible)
  heroVals.style.transition = 'none';
  heroVals.style.transform = 'translateX(-28px)';
  heroVals.style.opacity = '0';
  void heroVals.offsetHeight;
  heroVals.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';
  heroVals.style.transform = 'translateX(0)';
  heroVals.style.opacity = '1';
}

// (서킷 폐기 — spec §16) wireCircuitToggle 제거.

async function renderChips(chipsEl) {
  chipsEl.innerHTML = PART_IDS.map((id) => {
    const isActive = id === _activePart ? ' is-active' : '';
    return `<button class="addex-chip${isActive}" data-part="${id}" ${VIEW_ATTR}="1">${escapeHtml(PARTS[id])}</button>`;
  }).join('');
}

async function renderList(listEl) {
  const list = await listExercisesForUser({ part: _activePart, includeHidden: false });
  if (!list.length) {
    listEl.innerHTML = `<div class="addex-empty" data-empty="1" ${VIEW_ATTR}="1">이 부위에 등록된 운동이 없습니다.</div>`;
    return;
  }
  // active session exerciseId Set 미리 조회 — innerHTML 생성 시 is-added 직접 박아
  // 신규 토글 후 renderList 재호출 시 기존 운동 토글이 default→is-added 로 transition
  // 트리거되며 깜빡이는 회귀 회피. syncIsAddedState 는 idempotent 안전망으로 유지.
  let activeIds = new Set();
  try {
    const session = await getActiveSession();
    if (session && Array.isArray(session.blocks)) {
      for (const b of session.blocks) {
        if (b && b.type === 'single' && b.exerciseId) activeIds.add(b.exerciseId);
      }
    }
  } catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymSession] renderList getActiveSession', e);
    }
  }
  const prevMap = await buildPrevTopWeightMap();
  listEl.innerHTML = list
    .map((ex) => {
      const meta = formatMeta(ex, prevMap);
      const addedClass = activeIds.has(ex.id) ? ' is-added' : '';
      return `
        <button class="addex-item${addedClass}" data-ex="${escapeHtml(ex.id)}" data-name="${escapeHtml(ex.name)}" data-part="${escapeHtml(ex.part)}" ${VIEW_ATTR}="1">
          <span class="ex-main">
            <span class="ex-name">${escapeHtml(ex.name)}</span>
            <span class="ex-meta">${escapeHtml(meta)}</span>
          </span>
          <span class="ex-toggle" aria-hidden="true"></span>
        </button>
      `;
    })
    .join('');
  await syncIsAddedState(listEl);
}

/** 렌더 직후 active session blocks 의 single exerciseId 와 매칭되는 버튼에 is-added 부여. */
export async function syncIsAddedState(listEl) {
  if (!listEl) return;
  let activeIds = new Set();
  try {
    const session = await getActiveSession();
    if (session && Array.isArray(session.blocks)) {
      for (const b of session.blocks) {
        if (b && b.type === 'single' && b.exerciseId) activeIds.add(b.exerciseId);
      }
    }
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) return; // DB 미초기화 silent
    console.error('[gymSession] syncIsAddedState', e);
    return;
  }
  listEl.querySelectorAll('.addex-item').forEach((btn) => {
    const id = btn.dataset.ex;
    if (id && activeIds.has(id)) btn.classList.add('is-added');
    else btn.classList.remove('is-added');
  });
}

/**
 * 모든 completed 세션을 1회 조회해 exerciseId → 직전(가장 최근 세션) { w: 톱중량, dur: 톱시간(분) } Map.
 * 시작 전/추가 시트 리스트 메타("직전 Nkg" / 유산소 "직전 N분") 용 — 종목마다
 * getPrevSessionLastSets 재조회(N×테이블 스캔)를 피해 한 번에 빌드. 최신 세션 우선 채택.
 */
async function buildPrevTopWeightMap() {
  const map = new Map();
  try {
    const db = (typeof window !== 'undefined' ? window.gymDB : null);
    if (!db) return map;
    const rows = await db.sessions.where('status').equals('completed').toArray();
    if (!rows.length) return map;
    rows.sort((a, b) => {
      const da = String(a.date || ''), dbS = String(b.date || '');
      if (da !== dbS) return da < dbS ? 1 : -1;
      return (b.endTime || 0) - (a.endTime || 0);
    });
    for (const s of rows) {
      for (const b of (s.blocks || [])) {
        if (!b || b.type !== 'single' || !b.exerciseId) continue;
        if (map.has(b.exerciseId)) continue; // 최신 세션의 값만 (이후 과거는 무시)
        let top = 0, dur = 0;
        for (const st of (Array.isArray(b.sets) ? b.sets : [])) {
          const w = Number(st?.weight) || 0; if (w > top) top = w;
          const d = Number(st?.duration) || 0; if (d > dur) dur = d;
        }
        map.set(b.exerciseId, { w: top, dur: Math.round(dur / 60) }); // 맨몸(w=0)·유산소도 기록해 과거값 덮어쓰기 차단
      }
    }
  } catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymSession] buildPrevTopWeightMap', e);
    }
  }
  return map;
}

/**
 * 작업지시서(3) 확정 [4] — 시작전/추가 시트 리스트 메타(.ex-meta).
 *  - weight 종목: 직전 사용 중량 "직전 Nkg" (기록 없으면 기본값 폴백)
 *  - 맨몸(bodyweight): "맨몸" (무게 없음)
 *  - 유산소(cardio): "직전 N분" (기록 없으면 "유산소")
 */
function formatMeta(ex, prevMap) {
  const prev = prevMap ? prevMap.get(ex.id) : undefined;
  if (ex.equipment === 'cardio') {
    return (prev && prev.dur > 0) ? `직전 ${prev.dur}분` : '유산소';
  }
  if (ex.equipment === 'bodyweight') return '맨몸';
  if (prev && Number.isFinite(prev.w) && prev.w > 0) return `직전 ${prev.w}kg`;
  return `${ex.defaultWeight ?? 0}kg × ${ex.defaultReps ?? 0}회`;
}

function hookClicks(chipsEl, listEl) {
  if (chipsEl.dataset.spaHooked !== '1') {
    chipsEl.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-part]');
      if (!b) return;
      _activePart = b.dataset.part;
      await renderChips(chipsEl);
      await renderList(listEl);
      // §6-2 UX — 선택 chip 가시 영역 중앙 정렬 (horizontal scroll). overflow-x:auto 시트 정합.
      const active = chipsEl.querySelector('.addex-chip.is-active');
      if (active && typeof active.scrollIntoView === 'function') {
        try { active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }
        catch (_) { /* old browser fallback */ }
      }
    });
    chipsEl.dataset.spaHooked = '1';
  }
  if (listEl.dataset.spaHooked === '1') return;
  listEl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ex]');
    if (!b) return;
    const exerciseId = b.dataset.ex;
    const exerciseName = b.dataset.name;
    const part = b.dataset.part;
    const isRemove = b.classList.contains('is-added');
    if (isRemove) {
      try {
        await removeExerciseFromActiveSession(exerciseId);
      } catch (err) {
        console.error('[gymSession] removeExerciseFromActiveSession', err);
      }
      if (typeof window !== 'undefined' && typeof window.removeExerciseFromSession === 'function') {
        try {
          window.removeExerciseFromSession(exerciseName, b);
        } catch (err) {
          console.error('[gymSession] mocks removeExerciseFromSession 호출 실패', err);
        }
      }
      b.classList.remove('is-added');
      // 제거된 블록이 현재 표시 중이면 카드·footer 가 유령 종목에 머묾 (라이브 검증 2026-06-10 발견)
      // — 추가 경로와 동일하게 재마운트. _currentBlockIdx 는 null 로 재픽 (mount 가 마지막 single 선택).
      _currentBlockIdx = null;
      try { await mountSessionView(); } catch (err) { console.error('[gymSession] addex remove remount', err); }
      return;
    }
    try {
      const res = await addExerciseToActiveSession(exerciseId, part);
      // 추가 즉시 그 운동을 현재로 선택 (사용자 결정 2026-06-13). 추가분은 blocks 맨 끝 append →
      // 마지막 인덱스를 명시 지정. 칩은 맨 끝에 렌더되고 centerActivePill 이 가운데로 스크롤.
      if (res && res.added && Array.isArray(res.session?.blocks)) {
        _currentBlockIdx = res.session.blocks.length - 1;
      }
    } catch (err) {
      console.error('[gymSession] addExerciseToActiveSession', err);
    }
    if (typeof window !== 'undefined' && typeof window.addExerciseToSession === 'function') {
      try {
        window.addExerciseToSession(exerciseName);
      } catch (err) {
        console.error('[gymSession] mocks addExerciseToSession 호출 실패', err);
      }
    }
    b.classList.add('is-added');
    // 다중 선택 유지 — mount 전 active 시트를 미리 open 상태로 설정해 mountSessionActive 의 reset (line 699)
    // 을 회피. empty→active 첫 전환 시 mocks default dataset.open="false" + transform translateY(100%) 라
    // mount 가 reset 적용 후 우리가 open 처리하면 200ms transition 깜빡임 발생. mount 전 'true' 설정 시
    // line 699 조건 false → skip → transform 변화 0 → 깜빡임 0. active+ 흐름은 idempotent.
    try {
      const doc = (typeof document !== 'undefined') ? document : null;
      if (doc) {
        const sSheet = doc.getElementById('sessionAddexSheet');
        if (sSheet) {
          sSheet.dataset.open = 'true';
          sSheet.style.transform = 'translateY(0)';
          const sBackdrop = doc.getElementById('sessionAddexBackdrop');
          if (sBackdrop) {
            sBackdrop.dataset.open = 'true';
            sBackdrop.style.opacity = '1';
            sBackdrop.style.pointerEvents = 'auto';
          }
          setStatusBarDim(doc, true);
        }
      }
    } catch (_) { /* graceful */ }
    // §6-2 — 종목 탭 → 세션 추가 + 시트 유지. mountSessionView 재호출로 active 분기 복귀
    // (active+ 흐름) 또는 첫 추가 시 active 분기 진입 (empty 자연 흐름) 양쪽 모두 자동 복귀.
    try { await mountSessionView(); } catch (err) { console.error('[gymSession] addex auto-remount', err); }
  });
  listEl.dataset.spaHooked = '1';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}

export function getActivePart() {
  return _activePart;
}
export function setActivePart(part) {
  if (PART_IDS.includes(part)) _activePart = part;
}

if (typeof window !== 'undefined') {
  window.gymSession = {
    createEmptySession,
    getOrCreateActiveSession,
    addExerciseToActiveSession,
    removeExerciseFromActiveSession,
    getExerciseDefaults,
    buildPresetSets,
    getPrevSessionLastSets,
    getPrevSessionTotalVolume,
    persistSetCommit,
    persistKeypadEdit,
    dumpActiveSessionFromState,
    finalizeActiveSession,
    sweepStaleSessions,
    mountSessionView,
    handleLeftSwipe,
    handleRightSwipe,
    applyTapDelta,
    updateKeypadBuf,
    applyKeypadValue,
    wireLongPress,
    wireSessionShortcuts,
    openActionSheet,
    closeActionSheet,
    persistRemoveSet,
    discardActiveSession,
    setReorderMode,
    computeDropIdx,
    performBlockReorder,
    getActivePart,
    setActivePart,
  };
}
