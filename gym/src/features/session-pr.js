/**
 * 세션 화면 PR 영속화 어댑터 (Wave 11.7.3b).
 *
 * mocks/session.html 은 한국어 exerciseName 기반 in-memory 판정만 함.
 * SPA 환경 (window.gymDB 셋업 후) 일 때:
 *   - exerciseName → exerciseId 매핑 (BUILTIN_EXERCISES 직접 import)
 *   - listPRsByExercise → evaluateSetPR → isPR 면 upsertPR (fire-and-forget)
 *   - getPrevBestE1RMForName: 세션 진입 시 state.prevBestE1rm 동기화용
 *
 * 의존성 직접 import — window.gym* 노출에 의존하지 않아 vitest(node) 환경 호환.
 * mocks 허브(iframe) 환경에서는 db() 호출이 throw → catch 해서 no-op 처리.
 */

import { BUILTIN_EXERCISES } from '../db/exercises.js';
import {
  listPRsByExercise,
  upsertPR,
  getBestE1RM,
  toISODate,
} from '../db/queries.js';
import { evaluateSetPR, buildPR } from '../services/pr.js';

/** exerciseName(한국어) → exerciseId(영문 snake_case) 매핑. 매칭 없으면 name 자체 반환. */
export function mapNameToExerciseId(name) {
  if (!name) return null;
  const exact = BUILTIN_EXERCISES.find(e => e.name === name);
  if (exact) return exact.id;
  const trimmed = String(name).trim();
  const trimMatch = BUILTIN_EXERCISES.find(e => e.name === trimmed);
  if (trimMatch) return trimMatch.id;
  // 공백 제거 후 부분 매칭 (mocks 의 "바벨로우" vs builtin "바벨 로우")
  const noSpace = trimmed.replace(/\s+/g, '');
  const partial = BUILTIN_EXERCISES.find(e => e.name.replace(/\s+/g, '') === noSpace);
  if (partial) return partial.id;
  return name; // fallback (운동 마스터에 없는 사용자 입력 운동)
}

/**
 * 세트 1건의 PR 판정 + 영속화. fire-and-forget 권장 (mocks 의 동기 흐름 유지).
 *
 * input: { exerciseName, weight, reps, sessionId?, date? }
 * 반환: { ok, isPR, e1rm, exerciseId } (실패 시 ok=false).
 */
export async function persistSetPR({ exerciseName, weight, reps, sessionId, date }) {
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) {
    return { ok: false, reason: 'invalid-numbers' };
  }
  const exerciseId = mapNameToExerciseId(exerciseName);
  if (!exerciseId) return { ok: false, reason: 'no-exercise-id' };
  try {
    const prs = await listPRsByExercise(exerciseId);
    const evalResult = evaluateSetPR({ weight, reps }, prs, exerciseId);
    if (!evalResult.isPR) {
      return { ok: true, isPR: false, e1rm: evalResult.e1rm, exerciseId };
    }
    const pr = buildPR({
      exerciseId,
      weight,
      reps,
      date: date || toISODate(new Date()),
      sessionId: sessionId || null,
    });
    await upsertPR(pr);
    return { ok: true, isPR: true, e1rm: pr.e1rm, exerciseId };
  } catch (e) {
    // mocks 허브 환경에선 db() 가 throw — 이건 정상 fallback (no-op).
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) {
      return { ok: false, reason: 'no-db' };
    }
    console.error('[session-pr] persistSetPR 실패', e);
    return { ok: false, reason: 'error', error: e?.message };
  }
}

/**
 * 세션 진입 시 mocks state.prevBestE1rm 동기화용.
 * 반환: 해당 운동의 type='e1rm' 최고값 (없으면 0).
 */
export async function getPrevBestE1RMForName(exerciseName) {
  const exerciseId = mapNameToExerciseId(exerciseName);
  if (!exerciseId) return 0;
  try {
    const row = await getBestE1RM(exerciseId);
    return row ? Number(row.e1rm) || 0 : 0;
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) return 0;
    console.error('[session-pr] getPrevBestE1RMForName 실패', e);
    return 0;
  }
}

/* mocks 허브 inline script 접근용 */
if (typeof window !== 'undefined') {
  window.gymSessionPR = {
    mapNameToExerciseId,
    persistSetPR,
    getPrevBestE1RMForName,
  };
}
