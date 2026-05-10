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
  toISODate,
} from '../db/queries.js';
import { PART_IDS, PARTS, getBuiltinExercise } from '../db/exercises.js';
import { mapNameToExerciseId } from './session-pr.js';

const VIEW_ATTR = 'data-spa-managed';
let _activePart = 'chest';

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
 *  - circuit 블록은 본 wave 범위 외 (별 wave).
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
  for (let i = 0; i < count; i += 1) {
    sets.push({
      weight: isCardio || isBodyweight ? null : weight,
      reps: isCardio ? null : reps,
      done: false,
      preset: true,
      pr: false,
    });
  }
  return sets;
}

/**
 * 단일 운동 추가. spec §6-1 — 첫 운동 추가 순간이 startTime.
 *  - 중복 (single 또는 circuit 의 어느 round 라도 exerciseId 매치) → added=false, reason='duplicate'
 *  - tags 에 part 누적 (중복 방지)
 *  - sets prefill (§6-3-3 ③) — defaultSets 개수만큼 preset:true
 *  - 반환: { session, added: boolean, reason? }
 */
export async function addExerciseToActiveSession(exerciseId, part) {
  if (!exerciseId) throw new Error('[gymSession] addExercise: exerciseId 누락');
  const session = await getOrCreateActiveSession();
  const exists = (session.blocks || []).some((b) => {
    if (b.type === 'single') return b.exerciseId === exerciseId;
    if (b.type === 'circuit') {
      return (b.rounds || []).some((round) =>
        (round || []).some((s) => s.exerciseId === exerciseId),
      );
    }
    return false;
  });
  if (exists) return { session, added: false, reason: 'duplicate' };

  // spec §6-3-3 — 우선순위 ② 이전 세션 → ③ 운동 기본값.
  const prevSets = await getPrevSessionLastSets(exerciseId);
  let sets;
  if (prevSets && prevSets.length) {
    // 이전 세션 sets 의 weight/reps 만 가져와 새 preset:true 객체로. done/pr 초기화.
    sets = prevSets.map((s) => ({
      weight: s?.weight ?? null,
      reps: s?.reps ?? null,
      done: false,
      preset: true,
      pr: false,
    }));
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
 *  - circuit 블록 무영향 (별 Wave 처리)
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
      weight: set.weight === undefined ? prev.weight : set.weight,
      reps: set.reps === undefined ? prev.reps : set.reps,
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
export async function finalizeActiveSession(opts = {}) {
  try {
    const session = await getActiveSession();
    if (!session) return { ok: false, reason: 'no_active_session' };

    const blocks = Array.isArray(session.blocks) ? session.blocks : [];
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
      endTime,
      durationMin,
      totalVolume,
      totalCalories,
      status: 'completed',
    };
    await upsertSession(finalized);
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
  if (field !== 'weight' && field !== 'reps') {
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
 * Phase B 단계 4 마무리 — mocks/session.html 진입 시 active 세션 유무로 분기.
 *  - active session + 1개 이상의 single 블록 → SessionC active 카드 정적 바인딩 (.session-active)
 *  - 그 외 → SessionEmpty 의 addex 시트 + 서킷 토글 (.session-empty)
 *
 * body[data-state] 토글 ('empty'|'active') 로 가시성 제어 (home.html HomeA/HomeC 패턴).
 * DB 미초기화·active 미존재 모두 graceful — empty branch 로 fallback.
 */
export async function mountSessionView() {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return { skipped: 'no-document' };

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

  if (route === 'active') {
    return mountSessionActive(doc, activeBlocks[activeBlocks.length - 1]);
  }
  return mountSessionEmpty(doc, dbUnavailable);
}

async function mountSessionEmpty(doc, dbUnavailable) {
  // 서킷 토글은 DOM 만 의존 → DB 상태 무관 wire
  try { wireCircuitToggle(doc); } catch (e) { console.error('[gymSession] wireCircuitToggle', e); }

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
function mountSessionActive(doc, block) {
  const sets = Array.isArray(block.sets) ? block.sets : [];
  let cur = sets.findIndex((s) => s && !s.done);
  if (cur === -1) cur = Math.max(0, sets.length - 1);
  const currentSet = sets[cur] || {};

  setTextById(doc, 'cardExName', resolveExerciseName(block.exerciseId));
  setTextById(doc, 'cardSetProgress', `SET ${pad2(cur + 1)} / ${pad2(sets.length || 1)}`);

  const weight = Number.isFinite(currentSet.weight) ? currentSet.weight : 0;
  const reps = Number.isFinite(currentSet.reps) ? currentSet.reps : 0;
  setTextById(doc, 'cardWeight', String(weight));
  setTextById(doc, 'cardReps', String(reps));

  // spec §6-3-3 — preset (placeholder) 톤: text-faint (opacity 0.45) / 사용자 입력: text-strong (opacity 1)
  const isPreset = !!currentSet.preset;
  const presetOpacity = isPreset ? '0.45' : '1';
  const cardWeightEl = doc.getElementById('cardWeight');
  const cardRepsEl = doc.getElementById('cardReps');
  if (cardWeightEl) cardWeightEl.style.opacity = presetOpacity;
  if (cardRepsEl) cardRepsEl.style.opacity = presetOpacity;

  // 이전 세트 ("55kg × 9") — 직전 set 의 weight/reps. 부재 시 hidden.
  const prevEl = doc.getElementById('cardPrevSet');
  if (prevEl) {
    const prev = cur > 0 ? sets[cur - 1] : null;
    if (prev && Number.isFinite(prev.weight) && Number.isFinite(prev.reps)) {
      prevEl.textContent = `${prev.weight}kg × ${prev.reps}`;
      prevEl.style.display = '';
    } else {
      prevEl.style.display = 'none';
    }
  }

  // S1..Sn 도트
  const setDotsEl = doc.getElementById('cardSetDots');
  if (setDotsEl) {
    setDotsEl.innerHTML = sets.map((s, idx) => renderSetDotHtml(idx, s, idx === cur)).join('');
  }

  // 진행바 + 볼륨 + %
  let totalDone = 0;
  let totalPlanned = 0;
  for (const s of sets) {
    const w = Number(s?.weight) || 0;
    const r = Number(s?.reps) || 0;
    totalPlanned += w * r;
    if (s && s.done) totalDone += w * r;
  }
  const pct = totalPlanned > 0 ? Math.round((totalDone / totalPlanned) * 100) : 0;
  const bar = doc.getElementById('cardProgressBar');
  if (bar) bar.style.width = `${pct}%`;
  setTextById(doc, 'cardProgressVol', `${totalDone.toLocaleString()} / ${totalPlanned.toLocaleString()}kg`);
  setTextById(doc, 'cardProgressPct', `${pct}%`);

  // spec §6-3-1 — 스와이프 핸들러 wire (idempotent — dataset.spaHooked guard)
  try { wireSwipeHandlers(doc); } catch (e) { console.error('[gymSession] wireSwipeHandlers', e); }
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
    });
  } catch (e) { console.error('[gymSession] wireLongPress', e); }

  return { mounted: true, branch: 'active', exerciseId: block.exerciseId, currentSetIdx: cur };
}

function setTextById(doc, id, text) {
  const el = doc.getElementById(id);
  if (el) el.textContent = text;
}

function pad2(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return String(v).padStart(2, '0');
}

function resolveExerciseName(id) {
  if (!id) return '';
  const builtin = getBuiltinExercise(id);
  if (builtin?.name) return builtin.name;
  return id;
}

function renderSetDotHtml(idx, set, isCurrent) {
  const setNum = idx + 1;
  const isDone = !!(set && set.done);
  let color = 'rgba(255,255,255,0.25)';
  let weight = '400';
  if (isCurrent) { color = 'var(--accent)'; weight = '600'; }
  else if (isDone) { color = 'rgba(255,255,255,0.55)'; weight = '400'; }
  const hasVal = set && Number.isFinite(set.weight) && Number.isFinite(set.reps);
  const valueText = (isDone || isCurrent) && hasVal ? `${set.weight}·${set.reps}` : '—';
  // spec §6-9 — 세트 행 hold 대상 (data-longpress="set-row" + data-set-idx)
  return `
        <div data-set-idx="${idx}" data-longpress="set-row" style="text-align:center;color:${color};font-weight:${weight};cursor:pointer;">
          <div style="font-size:10px;letter-spacing:0.06em;">S${setNum}</div>
          <div style="font-size:13px;margin-top:4px;">${escapeHtml(valueText)}</div>
        </div>`;
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
  let tracking = false;

  // (f-3a) 교차 취소 — hold 발화 시 외부에서 swipe tracking 무력화 가능
  area._swipeReset = () => { tracking = false; };

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    tracking = true;
  };

  const onUp = async (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    // spec §6-3-1 — 60px 임계 + 수평 dominant
    if (adx >= 60 && adx > ady) {
      try { navigator.vibrate?.(10); } catch (_) { /* iOS Safari 미지원 — silent */ }
      if (dx < 0) await handleLeftSwipe();
      else await handleRightSwipe();
      return;
    }
    // spec §6-3 — 정적 tap (이동 < 10px) → 좌 30% 감소·우 30% 증가
    if (adx < 10 && ady < 10) {
      await handleTap(doc, e.clientX, e.clientY);
    }
    // 그 외: 애매한 drag — 무시 (수직 스크롤로 처리됨)
  };

  const onCancel = () => { tracking = false; };

  area.addEventListener('pointerdown', onDown);
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
  const zones = [
    ['cardWeightZone', 'weight'],
    ['cardRepsZone', 'reps'],
  ];
  for (const [zoneId, field] of zones) {
    const z = doc.getElementById(zoneId);
    if (!z) continue;
    const r = z.getBoundingClientRect();
    if (y < r.top || y > r.bottom) continue;
    if (x < r.left || x > r.right) continue;
    const ratio = (x - r.left) / r.width;
    if (ratio < 0.3) await applyTapDelta(field, -1);
    else if (ratio > 0.7) await applyTapDelta(field, +1);
    else openKeypad(doc, field); // spec §6-3-2 — 중앙 40% → 키패드
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
    const color = danger ? 'var(--accent)' : '#fff';
    const weight = danger ? 600 : 400;
    return `<button class="action-item kr" data-action-id="${escapeHtml(it.id)}" type="button" style="width:100%;height:44px;border-radius:10px;border:0;background:rgba(255,255,255,0.04);color:${color};font-size:14px;font-weight:${weight};cursor:pointer;text-align:center;">${escapeHtml(it.label)}</button>`;
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
  itemsEl.innerHTML = `<button class="action-confirm kr" data-confirm="ok" type="button" style="width:100%;height:44px;border-radius:10px;border:0;background:var(--accent);color:#fff;font-size:14px;font-weight:600;cursor:pointer;text-align:center;">${escapeHtml(actionLabel)}</button>`;
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
 * spec §6-9 — kind → 데모 메뉴 매핑.
 *  - 본 (f-2) 단계 : session-end / footer-exercise 두 종류만. (f-3) 에서 active-card / set-row /
 *    circuit / 완료된·예정된 운동 등 다른 대상 추가 + onSelect 진짜 핸들러 연결.
 *  - 본 단계 onSelect : console.log 뿐 (마운트 상태에서 close 만).
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
      onSelect: (id) => { console.log('[gymSession] action', kind, id); },
    };
  }
  if (kind === 'active-card') {
    // spec §6-9 — 진행 중 운동 카드 : 완료 / 삭제 / 이동
    return {
      kind,
      title: '운동 카드',
      items: [
        { id: 'finish', label: '완료' },
        { id: 'delete', label: '삭제', danger: true },
        { id: 'reorder', label: '이동' },
      ],
      onSelect: (id) => { console.log('[gymSession] action', kind, id); },
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
      onSelect: (id) => { console.log('[gymSession] action', kind, setIdx, id); },
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
    items.push({ id: 'reorder', label: '이동' });
    return {
      kind,
      title: '운동 옵션',
      items,
      onSelect: (id) => { console.log('[gymSession] action', kind, state, id); },
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
  const { onTrigger, holdMs = 500, moveTolerance = 8 } = opts;

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

    const cancel = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      el.style.transform = '';
      el.style.transition = '';
      pid = null;
      triggered = false;
    };
    el._lpCancel = cancel;

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // bubble 방지 — 자식 longpress target (예: 세트 도트) 이 부모 (cardSwipeArea active-card) 까지
      // 동시 hold 발화하지 않도록. swipe 는 cardSwipeArea pointerdown 별도 — 도트 영역에선 swipe 의미 없음.
      e.stopPropagation();
      sx = e.clientX;
      sy = e.clientY;
      pid = e.pointerId;
      triggered = false;
      el.style.transition = 'transform 120ms ease';
      el.style.transform = 'scale(0.98)';
      timer = setTimeout(() => {
        timer = null;
        triggered = true;
        try { navigator.vibrate?.(10); } catch (_) { /* iOS Safari 미지원 — silent */ }
        if (typeof onTrigger === 'function') {
          try { onTrigger({ kind: el.dataset.longpress, target: el }); }
          catch (err) { console.error('[gymSession] longpress onTrigger', err); }
        }
        // 발화 후 200ms 뒤 scale 복원 (메뉴로 attention 이동)
        setTimeout(() => { el.style.transform = ''; el.style.transition = ''; }, 200);
      }, holdMs);
    });
    el.addEventListener('pointermove', (e) => {
      if (pid !== null && e.pointerId !== pid) return;
      if (triggered) return; // 이미 발화 — 이동은 메뉴 처리
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (Math.hypot(dx, dy) > moveTolerance) cancel();
    });
    el.addEventListener('pointerup', cancel);
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

/* ──────────────────── 액션 핸들러 (spec §6-9 진짜 핸들러 — f-3 wiring) ──────────────────── */

/**
 * spec §6-9 set-row 삭제 — block.sets[setIdx] 제거.
 *  - sets.length === 0 이 되면 block 자체도 제거 (운동 카드 통째 삭제와 같은 의미).
 *  - 마지막 single 블록 기준 (mountSessionActive 와 동일 정책).
 */
export async function persistRemoveSet(setIdx) {
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
  // 마지막 single 블록
  const singles = blocks.map((b, i) => ({ b, i })).filter(({ b }) => b && b.type === 'single');
  if (!singles.length) return { ok: false, reason: 'no_single_block' };
  const { b: block, i: blockIdx } = singles[singles.length - 1];
  const sets = Array.isArray(block.sets) ? block.sets.slice() : [];
  if (setIdx >= sets.length) return { ok: false, reason: 'index_out_of_range' };
  sets.splice(setIdx, 1);
  if (sets.length === 0) {
    blocks.splice(blockIdx, 1);
  } else {
    blocks[blockIdx] = { ...block, sets };
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
        // 좌 스와이프 동작 재사용 — 현재 set commit + 다음 set 진행 (spec §6-3-1 / §6-9)
        await handleLeftSwipe();
        return;
      }
      if (actionId === 'delete') {
        const ctx = await getCurrentBlockAndCursor();
        if (!ctx) return;
        await removeExerciseFromActiveSession(ctx.block.exerciseId);
        await mountSessionView();
        return;
      }
      if (actionId === 'reorder') {
        // (f-5) 후속 — 드래그 이동
        console.log('[gymSession] reorder — (f-5) 후속');
        return;
      }
      return;
    }
    if (kind === 'set-row') {
      const setIdx = parseInt(target?.dataset?.setIdx, 10);
      if (!Number.isFinite(setIdx)) return;
      if (actionId === 'edit') {
        // 키패드 open with prefill (weight 모드, 해당 set 기존 값)
        const ctx = await getCurrentBlockAndCursor();
        if (!ctx) return;
        const set = ctx.block.sets?.[setIdx];
        if (!set) return;
        openKeypad(doc, 'weight', { prefill: set.weight, setIdx });
        return;
      }
      if (actionId === 'delete') {
        await persistRemoveSet(setIdx);
        await mountSessionView();
        return;
      }
      return;
    }
    if (kind === 'footer-exercise') {
      // mocks 의 정적 pill 이라 실 데이터 미바인딩. 실 데이터 wiring 후속.
      console.log('[gymSession] footer-exercise', target?.dataset?.exState, actionId, '— mocks pill, 후속');
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
  sheet.dataset.buf = opts.prefill != null && Number.isFinite(opts.prefill)
    ? String(opts.prefill)
    : '';
  if (opts.setIdx != null && Number.isFinite(opts.setIdx)) {
    sheet.dataset.setIdx = String(opts.setIdx);
  } else {
    delete sheet.dataset.setIdx;
  }
  unit.textContent = field === 'weight' ? 'kg' : '회';
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
  const finalValue = field === 'reps' ? Math.round(parsed) : parsed;

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

  // 키 click — grid 위임
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.keypad-key');
    if (!btn) return;
    const k = btn.dataset.key;
    sheet.dataset.buf = updateKeypadBuf(sheet.dataset.buf || '', k);
    renderKeypadValue(sheet, value);
  });

  done.addEventListener('click', () => {
    applyKeypadValue(doc).catch((e) => console.error('[gymSession] keypad done', e));
  });

  backdrop.addEventListener('click', () => closeKeypad(doc));

  // 시트 아래 스와이프 → 취소 (60px+)
  let downY = 0;
  let tracking = false;
  sheet.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 키 버튼 직접 클릭은 swipe 추적 안 함 (의도치 않은 close 방지)
    if (e.target.closest('.keypad-key, #keypadDone')) return;
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
  const singles = session.blocks.filter((b) => b && b.type === 'single');
  if (!singles.length) return null;
  const block = singles[singles.length - 1];
  const sets = Array.isArray(block.sets) ? block.sets : [];
  const cur = sets.findIndex((s) => s && !s.done);
  const effectiveCur = cur === -1 ? Math.max(0, sets.length - 1) : cur;
  return { session, block, cur, effectiveCur };
}

/**
 * spec §6-3-1 좌 스와이프.
 *  - cur 가 유효 : sets[cur].done = true (preset:false).
 *  - cur === sets.length - 1 (마지막 set) : 새 set 추가 (이전 값 preset 카피).
 *  - cur === -1 (모두 이미 done) : 새 set 추가만 (advance 효과).
 */
export async function handleLeftSwipe() {
  let ctx;
  try { ctx = await getCurrentBlockAndCursor(); }
  catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymSession] handleLeftSwipe ctx', e);
    }
    return;
  }
  if (!ctx) return;
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
      done: false,
      preset: true,
      pr: false,
    });
  } else {
    const prev = sets[cur] || {};
    sets[cur] = {
      weight: prev.weight ?? null,
      reps: prev.reps ?? null,
      done: true,
      preset: false,
      pr: !!prev.pr,
    };
    if (cur === sets.length - 1) {
      sets.push({
        weight: prev.weight ?? null,
        reps: prev.reps ?? null,
        done: false,
        preset: true,
        pr: false,
      });
    }
  }

  blocks[blockIdx] = { ...block, sets };
  try { await upsertSession({ ...session, blocks }); }
  catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymSession] handleLeftSwipe upsert', e);
    }
    return;
  }
  await mountSessionView();
}

/**
 * spec §6-3-1 우 스와이프.
 *  - effectiveCur === 0 (첫 set) : 무시.
 *  - 직전 set (effectiveCur - 1) 의 done:false → 수정 모드 (다시 현재 set 으로).
 */
export async function handleRightSwipe() {
  let ctx;
  try { ctx = await getCurrentBlockAndCursor(); }
  catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymSession] handleRightSwipe ctx', e);
    }
    return;
  }
  if (!ctx) return;
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
  try { await upsertSession({ ...session, blocks }); }
  catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymSession] handleRightSwipe upsert', e);
    }
    return;
  }
  await mountSessionView();
}

/**
 * spec §6-2 — 시트 우상단 [서킷] 토글 click → data-circuit 'off'↔'on' + panel 표시 + 버튼 시각.
 * 본 단계 (a) 는 ON/OFF 시각 토글까지만. 다중선택·"완료" 활성 조건은 다음 단계.
 */
function wireCircuitToggle(doc) {
  const sheet = doc.getElementById('addexSheet');
  const btn = doc.getElementById('addexCircuitToggle');
  const panel = doc.getElementById('addexCircuitPanel');
  if (!sheet || !btn || !panel) return;
  if (btn.dataset.spaHooked === '1') return;
  btn.addEventListener('click', () => {
    const next = sheet.dataset.circuit === 'on' ? 'off' : 'on';
    sheet.dataset.circuit = next;
    btn.setAttribute('aria-pressed', next === 'on' ? 'true' : 'false');
    if (next === 'on') {
      panel.style.display = '';
      btn.style.background = 'var(--accent)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'transparent';
    } else {
      panel.style.display = 'none';
      btn.style.background = 'transparent';
      btn.style.color = 'rgba(255,255,255,0.55)';
      btn.style.borderColor = 'rgba(255,255,255,0.18)';
    }
  });
  btn.dataset.spaHooked = '1';
}

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
  listEl.innerHTML = list
    .map((ex) => {
      const meta = formatMeta(ex);
      return `
        <button class="addex-item" data-ex="${escapeHtml(ex.id)}" data-name="${escapeHtml(ex.name)}" data-part="${escapeHtml(ex.part)}" ${VIEW_ATTR}="1">
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

function formatMeta(ex) {
  if (ex.equipment === 'cardio') return `${ex.defaultSets ?? 1}회`;
  if (ex.equipment === 'bodyweight') return `맨몸 · ${ex.defaultReps ?? 0}회`;
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
      return;
    }
    try {
      await addExerciseToActiveSession(exerciseId, part);
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
    persistSetCommit,
    persistKeypadEdit,
    dumpActiveSessionFromState,
    finalizeActiveSession,
    mountSessionView,
    handleLeftSwipe,
    handleRightSwipe,
    applyTapDelta,
    updateKeypadBuf,
    applyKeypadValue,
    wireLongPress,
    openActionSheet,
    closeActionSheet,
    persistRemoveSet,
    discardActiveSession,
    getActivePart,
    setActivePart,
  };
}
