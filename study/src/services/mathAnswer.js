/**
 * mathAnswer.js — 수학 세션 자동 채점 (순수 함수, 테스트 가능).
 *
 * 지원: 정수·소수·분수("a/b")·퍼센트("n%") 동치 비교, accept[] 대체답, range[lo,hi] 추정형.
 */

export function normalize(s) {
  return (s ?? '').toString().trim().toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[,，]/g, '')
    .replace(/[×*]/g, 'x')
    .replace(/[÷]/g, '/')
    .replace(/[％]/g, '%');
}

/** 문자열 → 숫자 (분수·퍼센트·소수). 실패 시 NaN. */
export function toNumber(s) {
  const v = normalize(s);
  const frac = v.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (frac) {
    const d = parseFloat(frac[2]);
    return d === 0 ? NaN : parseFloat(frac[1]) / d;
  }
  const pct = v.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (pct) return parseFloat(pct[1]); // % 는 숫자값으로 취급 (문제별 accept 로 보정)
  if (/^-?\d+(?:\.\d+)?$/.test(v)) return parseFloat(v);
  return NaN;
}

/**
 * checkAnswer(input, problem) → { correct, empty? }
 * problem: { answer, accept?:string[], range?:[lo,hi], tol?:number }
 */
export function checkAnswer(input, problem) {
  const v = normalize(input);
  if (!v) return { correct: false, empty: true };

  const accept = (problem.accept || []).map(normalize);
  if (accept.includes(v)) return { correct: true };

  const n = toNumber(v);
  if (!Number.isNaN(n)) {
    if (Array.isArray(problem.range)) {
      const [lo, hi] = problem.range;
      if (n >= lo && n <= hi) return { correct: true };
    }
    const target = toNumber(problem.answer);
    if (!Number.isNaN(target) && Math.abs(n - target) < (problem.tol ?? 1e-9)) {
      return { correct: true };
    }
  }
  return { correct: false };
}

export default checkAnswer;
