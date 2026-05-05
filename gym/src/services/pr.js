/**
 * PR 감지 — Epley e1RM 공식 + 판정 (spec §6-11, §12).
 *
 * 책임:
 *  - Epley 추정 1RM 계산 (weight × (1 + reps/30)).
 *  - PR 판정 — 입력 e1RM 이 이전 최고 e1RM 을 엄격 초과하면 PR.
 *  - PR 객체 생성 — { exerciseId, type='e1rm', weight, reps, e1rm, date, sessionId }.
 *  - 세션 단위 PR 재계산 — 세트 삭제/수정 시 호출.
 *
 * 순수 함수만 (DB 무관). queries.js 의 prs CRUD 와 결합해 사용.
 */

/**
 * Epley 1RM 추정.
 *  - weight 또는 reps 가 양수 아니면 0 반환 (PR 판정에서 prevBest 초과 못함 보장).
 *  - reps=1 이면 e1RM = weight × (1 + 1/30) ≈ weight × 1.033.
 */
export function epley(weight, reps) {
  const w = Number(weight);
  const r = Number(reps);
  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return 0;
  return w * (1 + r / 30);
}

/** 0.1 단위 반올림 — PR 비교는 정확하지만 표시값은 반올림 */
export function roundE1RM(e1rm) {
  return Math.round((Number(e1rm) || 0) * 10) / 10;
}

/**
 * 운동의 이전 최고 e1RM. prs 배열 (queries.listPRsByExercise 결과) 입력.
 * type='e1rm' 만 대상. 비어있으면 null.
 */
export function findBestE1RM(prs, exerciseId) {
  if (!Array.isArray(prs) || !prs.length) return null;
  const candidates = prs.filter(p => p.exerciseId === exerciseId && p.type === 'e1rm');
  if (!candidates.length) return null;
  return candidates.reduce((best, p) => {
    const e = Number(p.e1rm) || 0;
    return e > (best?.e1rm ?? -Infinity) ? p : best;
  }, null);
}

/**
 * 세트 PR 판정.
 *  set: { weight, reps, sessionId?, date? } — done 여부는 호출자가 보장.
 *  prs: queries.listPRsByExercise(exerciseId) 결과 — type='e1rm' 만 비교.
 *
 * 반환: { isPR, e1rm, prevBest }.
 *  - isPR: 새 e1rm 이 prevBest.e1rm 보다 엄격 큼 (동률 false).
 *  - e1rm: roundE1RM(epley(...)) — 0.1 단위 반올림.
 *  - prevBest: 이전 최고 row 또는 null.
 */
export function evaluateSetPR({ weight, reps }, prs, exerciseId) {
  const e = roundE1RM(epley(weight, reps));
  if (e <= 0) return { isPR: false, e1rm: 0, prevBest: null };
  const prev = findBestE1RM(prs, exerciseId);
  const prevE = prev ? roundE1RM(prev.e1rm) : null;
  const isPR = prevE == null ? true : e > prevE;
  return { isPR, e1rm: e, prevBest: prev };
}

/**
 * PR 객체 생성 — queries.upsertPR 에 그대로 전달 가능.
 *  - sessionId 누락 시 createdAt 기반 fallback 가능하지만 호출자가 명시 권장.
 */
export function buildPR({ exerciseId, weight, reps, date, sessionId, type = 'e1rm' }) {
  if (!exerciseId) throw new Error('[buildPR] exerciseId 누락');
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) {
    throw new Error('[buildPR] weight·reps 숫자 필수');
  }
  return {
    exerciseId,
    type,
    weight,
    reps,
    e1rm: roundE1RM(epley(weight, reps)),
    date: date || null,
    sessionId: sessionId || null,
  };
}

/**
 * 세션 1건 안의 운동별 최고 e1RM 세트 추출 (재계산용).
 *  - blocks 의 single·circuit 모두 순회.
 *  - 같은 운동에서 여러 세트가 있으면 최고 e1RM 1건만.
 *
 * 반환: Map<exerciseId, { weight, reps, e1rm }>.
 */
export function findBestSetsInSession(session) {
  const out = new Map();
  if (!session || !Array.isArray(session.blocks)) return out;
  for (const block of session.blocks) {
    if (block.type === 'single') {
      const exId = block.exerciseId
        || (block.exercises && block.exercises[0]?.exerciseId);
      const sets = block.sets
        || (block.exercises && block.exercises[0]?.sets)
        || [];
      considerSetsForBest(out, exId, sets);
    } else if (block.type === 'circuit' && Array.isArray(block.rounds)) {
      // 라운드별 [{ exerciseId, weight, reps, done }]
      for (const round of block.rounds) {
        if (!Array.isArray(round)) continue;
        for (const item of round) {
          if (!item || !item.exerciseId || item.done === false) continue;
          considerOne(out, item.exerciseId, item.weight, item.reps);
        }
      }
    }
  }
  return out;
}

function considerSetsForBest(map, exerciseId, sets) {
  if (!exerciseId || !Array.isArray(sets)) return;
  for (const s of sets) {
    if (!s || s.done === false) continue;
    considerOne(map, exerciseId, s.weight, s.reps);
  }
}

function considerOne(map, exerciseId, weight, reps) {
  const e = roundE1RM(epley(weight, reps));
  if (e <= 0) return;
  const prev = map.get(exerciseId);
  if (!prev || e > prev.e1rm) {
    map.set(exerciseId, { weight: Number(weight), reps: Number(reps), e1rm: e });
  }
}

/* mocks 허브 inline script 접근용 */
if (typeof window !== 'undefined') {
  window.gymPR = {
    epley,
    roundE1RM,
    findBestE1RM,
    evaluateSetPR,
    buildPR,
    findBestSetsInSession,
  };
}
