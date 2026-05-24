import { MODULE_COUNTING } from './m1-counting.js';
import { MODULE_VISUAL } from './m2-visual.js';
import { MODULE_SHAPES } from './m3-shapes.js';

// 학습 순서(기하 중심): 모양으로 세기 → 넓이는 변형 → 도형의 약속(피타고라스·닮음·원).
export const MATH_CONTENT = [...MODULE_COUNTING, ...MODULE_VISUAL, ...MODULE_SHAPES];

/**
 * 다음 '신규 개념 그룹' = 미완료 개념 + 그 개념의 미완료 응용들. **개념 설명을 항상 먼저** 두어
 * "문제부터 덜컥" 방지(하루 구조: 개념 1 → 응용 2~3). 개념이 이미 done 이어도 맥락 위해 다시 노출.
 * @param {Array} items  번들(+병합) 카드
 * @param {{done?:object, srs?:object}} progress  localStorage mathProgress
 * @returns {Array} [개념, ...미완료 응용]  (없으면 [])
 */
export function nextNewGroup(items, progress) {
  const done = (progress && progress.done) || {};
  const srs = (progress && progress.srs) || {};
  const order = [];
  for (const c of items) if (c.conceptId && !order.includes(c.conceptId)) order.push(c.conceptId);
  for (const cid of order) {
    const group = items.filter((c) => c.conceptId === cid);
    if (!group.some((c) => !done[c.id] && !srs[c.id])) continue; // 이 개념 그룹 미완료分 없음 → 다음
    const concept = group.find((c) => c.kind === 'concept');
    const applies = group.filter((c) => c.kind !== 'concept' && !done[c.id] && !srs[c.id]);
    return concept ? [concept, ...applies] : applies; // 개념 먼저, 그다음 미완료 응용
  }
  return [];
}

export default MATH_CONTENT;
