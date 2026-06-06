import { el } from '../ui/dom.js';
// T11에서 채움 (왓챠 CSV 업로드 → 미리보기 → 저장).
export function mount({ userId } = {}) {
  return el('div', {}, el('p', {}, '가져오기 — T11'));
}
