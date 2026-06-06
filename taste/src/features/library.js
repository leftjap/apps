import { el } from '../ui/dom.js';
// T12에서 채움 (전체 평점 목록 영화/책 → 상세 연결).
export function mount({ userId } = {}) {
  return el('div', {}, el('p', {}, '내 서재 — T12'));
}
