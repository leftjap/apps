import { MODULE_COUNTING } from './m1-counting.js';
import { MODULE_VISUAL } from './m2-visual.js';
import { MODULE_SHAPES } from './m3-shapes.js';

// 학습 순서(기하 중심): 모양으로 세기 → 넓이는 변형 → 도형의 약속(피타고라스·닮음·원).
export const MATH_CONTENT = [...MODULE_COUNTING, ...MODULE_VISUAL, ...MODULE_SHAPES];

export default MATH_CONTENT;
