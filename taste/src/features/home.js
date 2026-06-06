import { el } from '../ui/dom.js';
// T9에서 채움 (인트로 + 세그먼트 + Featured/트랙 빈상태 + 최근 평가).
export function mount({ userId } = {}) {
  return el('div', { class: 'home' }, el('p', {}, '홈 — T9'));
}
