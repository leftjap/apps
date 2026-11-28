/**
 * 작가 눈금 — 그날 쓴 매수로 도달한 작가, 다음 작가, 남은 매수를 정한다.
 */

export const WRITERS = Object.freeze([
  Object.freeze({ sheets: 3, name: '김중혁' }),
  Object.freeze({ sheets: 5, name: '김연수' }),
  Object.freeze({ sheets: 6, name: '헤밍웨이' }),
  Object.freeze({ sheets: 8, name: '성석제' }),
  Object.freeze({ sheets: 10, name: '이기호' }),
  Object.freeze({ sheets: 15, name: '장강명' }),
  Object.freeze({ sheets: 20, name: '무라카미 하루키' }),
  Object.freeze({ sheets: 25, name: '스티븐 킹' }),
]);

export const SCALE_MAX = 25;

const round1 = (n) => Math.round(n * 10) / 10;

/** 매수 표기 — 정수면 소수점 생략, 아니면 소수 1자리 (달력 합계 행과 같음). */
export function fmtSheets(sheets) {
  const v = round1(sheets || 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** @returns {{ reached: object|null, next: object|null, remaining: number|null }} */
export function writerProgress(sheets) {
  const v = sheets || 0;
  let reached = null;
  let next = null;
  for (const w of WRITERS) {
    if (v >= w.sheets) reached = w;
    else { next = w; break; }
  }
  return { reached, next, remaining: next ? round1(next.sheets - v) : null };
}

/** 띠 문구의 작가 부분 — 「헤밍웨이 · 성석제까지 1.8매」 / 「김중혁까지 3매」 / 「스티븐 킹」. */
export function scaleLabel(sheets) {
  const { reached, next, remaining } = writerProgress(sheets);
  const parts = [];
  if (reached) parts.push(reached.name);
  if (next) parts.push(`${next.name}까지 ${fmtSheets(remaining)}매`);
  return parts.join(' · ');
}
