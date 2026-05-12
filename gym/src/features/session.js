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
import { mapNameToExerciseId, persistSetPR } from './session-pr.js';

const VIEW_ATTR = 'data-spa-managed';
let _activePart = 'chest';
// (f-5-1) 사용자가 footer pill 탭으로 선택한 block idx (없으면 마지막 single 자동)
let _currentBlockIdx = null;

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

  // 직전 세션 동일 세트번호 표시 ("55kg × 9"). prev session 없거나 해당 set 부재 시 hidden.
  // spec §6-3-3 의 preset 우선순위와 별개 — cardPrevSet 은 항상 직전 세션 기준.
  const prevEl = doc.getElementById('cardPrevSet');
  if (prevEl) {
    let prevDisplay = null;
    try {
      const prevSessionSets = await getPrevSessionLastSets(block.exerciseId);
      const p = prevSessionSets && prevSessionSets[cur];
      if (p && Number.isFinite(p.weight) && Number.isFinite(p.reps)) {
        prevDisplay = `${p.weight}kg × ${p.reps}`;
      }
    } catch (e) { console.error('[gymSession] cardPrevSet prev session lookup', e); }
    if (prevDisplay) {
      prevEl.textContent = prevDisplay;
      prevEl.style.display = '';
    } else {
      prevEl.style.display = 'none';
    }
  }

  // S1..Sn 도트 — diff-based 갱신 (DOM 유지로 transition 트리거) + 활성 set 가운데 정렬
  const setDotsEl = doc.getElementById('cardSetDots');
  if (setDotsEl) {
    renderSetDotsDiff(setDotsEl, sets, cur);
    const centerActiveSet = () => {
      const active = setDotsEl.querySelector('[data-current="1"]');
      if (!active) return;
      try {
        const containerRect = setDotsEl.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        const activeCenterRel = activeRect.left + activeRect.width / 2 - containerRect.left;
        const targetScrollLeft = setDotsEl.scrollLeft + activeCenterRel - containerRect.width / 2;
        if (typeof setDotsEl.scrollTo === 'function') {
          setDotsEl.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
        } else {
          setDotsEl.scrollLeft = targetScrollLeft;
        }
      } catch (_) { /* fallback */ }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(centerActiveSet);
    else centerActiveSet();
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

  // (f-5-1) spec §6-8 — footer nav pill 동적 렌더 + click handler
  try { renderFooterPills(doc, session, block); } catch (e) { console.error('[gymSession] renderFooterPills', e); }
  try { wireFooterPillClick(doc); } catch (e) { console.error('[gymSession] wireFooterPillClick', e); }
  // (f-5-3a) spec §6-9 — reorder mode drag 추적 (idempotent)
  try { wireReorderDrag(doc); } catch (e) { console.error('[gymSession] wireReorderDrag', e); }

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
  // 단일 dot HTML — 초기 mount (innerHTML 한 번에 박을 때) 만 사용. 후속 mount 는 renderSetDotsDiff
  // 가 기존 DOM 갱신 (transition 트리거 보존).
  const setNum = idx + 1;
  const isDone = !!(set && set.done);
  const color = (isCurrent || isDone) ? 'var(--accent)' : 'rgba(255,255,255,0.25)';
  const weight = isCurrent ? '600' : '400';
  const hasVal = set && Number.isFinite(set.weight) && Number.isFinite(set.reps);
  const valueText = (isDone || isCurrent) && hasVal ? `${set.weight}·${set.reps}` : '—';
  // 폰트 위계 — current 큰 (label 13px / value 17px), 그 외 작은 (10px / 13px). transition 으로 부드럽게.
  const labelSize = isCurrent ? '13px' : '10px';
  const valueSize = isCurrent ? '17px' : '13px';
  const currentAttr = isCurrent ? ' data-current="1"' : '';
  return `
        <div data-set-idx="${idx}"${currentAttr} data-longpress="set-row" style="text-align:center;color:${color};font-weight:${weight};flex-shrink:0;cursor:pointer;transition:color 220ms ease-out, font-weight 220ms ease-out;">
          <div style="font-size:${labelSize};letter-spacing:0.06em;transition:font-size 220ms ease-out;">S${setNum}</div>
          <div style="font-size:${valueSize};margin-top:4px;transition:font-size 220ms ease-out;">${escapeHtml(valueText)}</div>
        </div>`;
}

/**
 * diff-based set dot 갱신 — innerHTML 재생성 폐기 (transition 트리거 보존).
 *  - 기존 children 매칭 (data-set-idx) → text + style 갱신
 *  - 부족하면 append, 초과하면 remove
 *  - 활성 set 변경 시 font-size 220ms transition 자연 트리거 (DOM 유지)
 */
function renderSetDotsDiff(setDotsEl, sets, cur) {
  if (!setDotsEl) return;
  // 부족한 dot 추가 (단순 append — 갱신은 아래 루프)
  while (setDotsEl.children.length < sets.length) {
    const wrap = document.createElement('div');
    wrap.innerHTML = renderSetDotHtml(setDotsEl.children.length, sets[setDotsEl.children.length], false);
    // wrap.firstElementChild 가 div data-set-idx — 그것만 append
    const dot = wrap.firstElementChild;
    if (dot) setDotsEl.appendChild(dot);
  }
  // 초과 제거
  while (setDotsEl.children.length > sets.length) {
    setDotsEl.removeChild(setDotsEl.lastChild);
  }
  // 각 dot 갱신 (inline style + textContent)
  for (let i = 0; i < sets.length; i++) {
    const dot = setDotsEl.children[i];
    if (!dot) continue;
    const set = sets[i];
    const isCurrent = i === cur;
    const isDone = !!(set && set.done);
    const hasVal = set && Number.isFinite(set.weight) && Number.isFinite(set.reps);
    const valueText = (isDone || isCurrent) && hasVal ? `${set.weight}·${set.reps}` : '—';
    const color = (isCurrent || isDone) ? 'var(--accent)' : 'rgba(255,255,255,0.25)';
    const weight = isCurrent ? '600' : '400';
    const labelSize = isCurrent ? '13px' : '10px';
    const valueSize = isCurrent ? '17px' : '13px';
    // wrap div style 갱신
    dot.style.color = color;
    dot.style.fontWeight = weight;
    if (isCurrent) dot.setAttribute('data-current', '1');
    else dot.removeAttribute('data-current');
    // 자식 두 div 갱신 (label / value)
    const labelEl = dot.children[0];
    const valueEl = dot.children[1];
    if (labelEl) {
      labelEl.textContent = `S${i + 1}`;
      labelEl.style.fontSize = labelSize;
    }
    if (valueEl) {
      valueEl.textContent = valueText;
      valueEl.style.fontSize = valueSize;
    }
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
      // 자식 longpress target (예: 세트 도트) 이 부모 (cardSwipeArea active-card) 까지 동시 발화 방지.
      // stopPropagation 대신 target 검사 — pillsEl 의 wireReorderDrag bubble listener 등 외부 listener 보존.
      if (e.target && e.target !== el && e.target.closest?.('[data-longpress]') !== el) return;
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
        // scale 복원을 onTrigger 전에 (transition 으로 부드럽게). onTrigger 의 setReorderMode 등이
        // transform 을 다시 설정해도 충돌 없음 (cleanup 이 그 후 발화하지 않음).
        el.style.transform = '';
        setTimeout(() => { el.style.transition = ''; }, 200);
        if (typeof onTrigger === 'function') {
          try { onTrigger({ kind: el.dataset.longpress, target: el }); }
          catch (err) { console.error('[gymSession] longpress onTrigger', err); }
        }
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

/* ──────────────────── footer nav pill (spec §6-8 / f-5-1) ──────────────────── */

/**
 * spec §6-8 운동 상태 판정.
 *  - currentBlock 과 동일 → 'current'
 *  - single 블록의 sets 모두 done → 'done'
 *  - single 블록의 일부 set done → 'hold' (보류)
 *  - 그 외 (예정 또는 단일 아닌 타입) → 'pending'
 *  - 서킷 폐기 (spec §16) — block.type !== 'single' 은 graceful skip → pending.
 */
function classifyBlockState(block, isCurrent) {
  if (isCurrent) return 'current';
  if (!block || block.type !== 'single') return 'pending';
  const sets = Array.isArray(block.sets) ? block.sets : [];
  if (sets.length === 0) return 'pending';
  const allDone = sets.every((s) => s && s.done);
  if (allDone) return 'done';
  const anyDone = sets.some((s) => s && s.done);
  if (anyDone) return 'hold';
  return 'pending';
}

/**
 * 진행도 텍스트 — current/hold/done 별 spec §6-8 footer nav 표현.
 *  - current : "·N/M" (현재 set / 총)
 *  - hold    : "·N/M"
 *  - done    : "·N세트 ✓" 의 N 부분 (✓ 는 별도 prefix span 으로 렌더)
 */
function blockProgressText(block, state) {
  if (!block || block.type !== 'single') return '';
  const sets = Array.isArray(block.sets) ? block.sets : [];
  const total = sets.length;
  if (state === 'done') return `·${total}세트`;
  if (state === 'current' || state === 'hold') {
    const cur = sets.findIndex((s) => !s.done);
    const num = cur === -1 ? total : cur + 1;
    return `·${num}/${total}`;
  }
  return '';
}

function blockDisplayName(block) {
  if (!block) return '';
  if (block.type === 'single') return resolveExerciseName(block.exerciseId);
  // 서킷 폐기 (spec §16) — 다른 타입은 빈 라벨 (graceful skip).
  return '';
}

function renderFooterPillHtml({ blockIdx, state, name, progress }) {
  // data-ex-state : 'active' | 'completed' | 'hold' | 'upcoming' (footer-exercise hold 메뉴와 호환)
  const exStateAttr = state === 'current' ? 'active'
    : state === 'done' ? 'completed'
    : state === 'hold' ? 'hold' : 'upcoming';
  const wrapStart = `<div data-longpress="footer-exercise" data-ex-state="${exStateAttr}" data-block-idx="${blockIdx}" style="position:relative;display:flex;align-items:center;gap:4px;padding-bottom:4px;flex-shrink:0;cursor:pointer;">`;
  const wrapEnd = `</div>`;
  if (state === 'current') {
    return wrapStart + `
      <span style="position:absolute;top:-8px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:2px;background:var(--accent);"></span>
      <span style="font-size:15px;font-weight:600;color:var(--accent);">${escapeHtml(name)}</span>
      <span style="font-size:10px;color:rgba(255,255,255,0.5);">${escapeHtml(progress)}</span>
      <span style="position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--accent);"></span>
    ` + wrapEnd;
  }
  if (state === 'done') {
    return wrapStart + `
      <span style="color:var(--sage);font-size:12px;">✓</span>
      <span style="font-size:13px;font-weight:400;color:rgba(255,255,255,0.5);">${escapeHtml(name)}</span>
      <span style="font-size:10px;color:rgba(255,255,255,0.4);">${escapeHtml(progress)}</span>
    ` + wrapEnd;
  }
  if (state === 'hold') {
    return wrapStart + `
      <span style="font-size:13px;font-weight:400;color:rgba(255,255,255,0.5);">${escapeHtml(name)}</span>
      <span style="font-size:10px;color:rgba(255,255,255,0.4);">${escapeHtml(progress)}</span>
    ` + wrapEnd;
  }
  // pending
  return wrapStart + `<span style="font-size:13px;font-weight:400;color:rgba(255,255,255,0.28);">${escapeHtml(name)}</span>` + wrapEnd;
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
  const html = session.blocks.map((block, i) => {
    if (!block || block.type !== 'single') return ''; // 서킷 폐기 — non-single graceful skip
    const isCurrent = block === currentBlock;
    const state = classifyBlockState(block, isCurrent);
    const name = blockDisplayName(block);
    const progress = blockProgressText(block, state);
    return renderFooterPillHtml({ blockIdx: i, state, name, progress });
  }).join('');
  pillsEl.innerHTML = html;
  // §6-8 UX — 활성 pill 가시 영역 중앙 정렬 (horizontal carousel).
  // scrollIntoView({ inline: 'center' }) 가 iOS Safari PWA 등 일부 환경에서 동작 불완전 →
  // 직접 scrollLeft 계산 + scrollTo 호출로 호환성 보장. rAF 로 layout 완료 후 paint frame 에서 호출.
  const centerActivePill = () => {
    const active = pillsEl.querySelector('[data-ex-state="active"]');
    if (!active) return;
    try {
      const containerRect = pillsEl.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const activeCenterRel = activeRect.left + activeRect.width / 2 - containerRect.left;
      const targetScrollLeft = pillsEl.scrollLeft + activeCenterRel - containerRect.width / 2;
      if (typeof pillsEl.scrollTo === 'function') {
        pillsEl.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
      } else {
        pillsEl.scrollLeft = targetScrollLeft;
      }
    } catch (_) { /* fallback */ }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(centerActivePill);
  } else {
    centerActivePill();
  }
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
        // (f-5-2) reorder 모드 진입 — 현재 currentBlock 의 idx 를 src 로
        const ctx = await getCurrentBlockAndCursor();
        if (ctx && Number.isFinite(ctx.blockIdx)) setReorderMode(doc, true, ctx.blockIdx);
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
      // (f-5-1) — 동적 pill 의 data-block-idx 기반 진짜 핸들러
      const blockIdx = parseInt(target?.dataset?.blockIdx, 10);
      if (!Number.isFinite(blockIdx)) return;
      if (actionId === 'finish') {
        // active state pill — 해당 block 을 current 로 전환 후 좌 스와이프 (현재 set commit)
        _currentBlockIdx = blockIdx;
        await handleLeftSwipe();
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
      if (actionId === 'reorder') {
        // (f-5-2) reorder 모드 진입 — 해당 block 을 src 로
        setReorderMode(doc, true, blockIdx);
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

  // (g) PR 판정 (spec §6-11) — cur 유효 + commit 시점만. cur===-1 (advance only) 분기는 PR 발화 없음.
  let prResult = null;
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
    }
  }

  blocks[blockIdx] = { ...block, sets };

  // 좌 스와이프 commit 책장 넘김 애니메이션:
  //   - OUT (180ms): translateX(0 → -28) + opacity(1 → 0). opacity 0 보장 → 이후 우측 jump 가 invisible
  //   - DB upsert + mount 는 OUT 과 병렬 (Promise.all) → OUT 끝과 mount 끝이 거의 동시 → 좌측 정지 시간 0
  //   - IN reset (jump): transform translateX(+28), opacity 0 (invisible 상태)
  //   - IN (200ms): translateX(+28 → 0) + opacity(0 → 1)
  const doc = typeof document !== 'undefined' ? document : null;
  const swipeArea = doc?.getElementById('cardSwipeArea');
  const canAnimate = swipeArea && typeof requestAnimationFrame === 'function';

  if (!canAnimate) {
    try { await upsertSession({ ...session, blocks }); }
    catch (e) {
      if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
        console.error('[gymSession] handleLeftSwipe upsert', e);
      }
      return;
    }
    await mountSessionView();
    if (prResult && prResult.isPR && typeof document !== 'undefined') showPrPop(document);
    return;
  }

  // OUT 시작
  swipeArea.style.transition = 'transform 180ms ease-out, opacity 180ms ease-out';
  swipeArea.style.transform = 'translateX(-28px)';
  swipeArea.style.opacity = '0';
  const outDone = new Promise((r) => setTimeout(r, 180));

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
    swipeArea.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';
    swipeArea.style.transform = 'translateX(0)';
    swipeArea.style.opacity = '1';
    return;
  }

  // IN 시작점 jump (invisible — opacity 0 이라 사용자 안 보임)
  swipeArea.style.transition = 'none';
  swipeArea.style.transform = 'translateX(28px)';
  swipeArea.style.opacity = '0';
  // 강제 reflow 로 style flush 보장 (rAF 대기 없이도 transition 트리거)
  void swipeArea.offsetHeight;
  // IN 트랜지션
  swipeArea.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';
  swipeArea.style.transform = 'translateX(0)';
  swipeArea.style.opacity = '1';

  // PR 팝 (mountSessionView 후 — 새 dot 노드에 대해 PR 표시는 이미 적용됨, pop 만 추가)
  if (prResult && prResult.isPR && typeof document !== 'undefined') {
    showPrPop(document);
  }
}

/**
 * spec §6-11 — "PR" 텍스트 1초 페이드아웃 (위로 살짝 떠오름). DOM 한 번 + opacity/transform 토글.
 *  - opacity 0 → 1 (220ms ease, fade-in)
 *  - transform translateY(0) → translateY(-12px) (700ms ease, 위로 떠오름)
 *  - 800ms 후 fade-out (opacity 1 → 0, transform 복원)
 */
function showPrPop(doc) {
  const el = doc.getElementById('cardPrPop');
  if (!el) return;
  el.style.opacity = '1';
  el.style.transform = 'translateY(-12px)';
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(0)';
  }, 800);
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

  // 우 스와이프 책장 넘김 (좌 스와이프 대칭) — OUT 우측 + IN 좌측에서 들어옴.
  const doc = typeof document !== 'undefined' ? document : null;
  const swipeArea = doc?.getElementById('cardSwipeArea');
  const canAnimate = swipeArea && typeof requestAnimationFrame === 'function';

  if (!canAnimate) {
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

  swipeArea.style.transition = 'transform 180ms ease-out, opacity 180ms ease-out';
  swipeArea.style.transform = 'translateX(28px)';
  swipeArea.style.opacity = '0';
  const outDone = new Promise((r) => setTimeout(r, 180));

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
    swipeArea.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';
    swipeArea.style.transform = 'translateX(0)';
    swipeArea.style.opacity = '1';
    return;
  }

  // IN 시작점 jump (좌측 invisible)
  swipeArea.style.transition = 'none';
  swipeArea.style.transform = 'translateX(-28px)';
  swipeArea.style.opacity = '0';
  void swipeArea.offsetHeight;
  swipeArea.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';
  swipeArea.style.transform = 'translateX(0)';
  swipeArea.style.opacity = '1';
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
  listEl.innerHTML = list
    .map((ex) => {
      const meta = formatMeta(ex);
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
