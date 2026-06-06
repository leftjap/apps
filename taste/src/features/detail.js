import { el } from '../ui/dom.js';
// T8에서 채움 (2열 그리드: rail+ratebox / 줄거리 + 갈래 빈상태).
export function mount({ userId, id } = {}) {
  return el('div', { class: 'detail' }, el('p', {}, '작품 상세 — T8 · id=' + (id || '')));
}
