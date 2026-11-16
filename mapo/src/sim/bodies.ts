// 승용차 차종. 시뮬레이션은 차종 길이로 줄을 세우고, 그리기(src/render/cars.ts)는 같은 차종의 모형을 그린다.

/** 승용차 차종 비율 [세단, SUV, 경차, 승합(카니발·스타리아)]. 길 위의 차(등록 대수) 기준 어림값 */
export const CAR_MIX = [0.4, 0.38, 0.1, 0.12];
/** 차종별 차 길이(m). 모형 옆모습의 앞뒤 끝 사이(render/cars.ts CAR_SHAPES 의 look.len × 2) */
export const BODY_LEN = [4.94, 4.74, 3.64, 5.22];

/** 차의 색 값(0~1 균등)과 섞이지 않게 다른 자리 수로 차종을 고른다 */
export function bodyType(t: number): number {
  let u = (t * 7919) % 1;
  for (let k = 0; k < CAR_MIX.length - 1; k++) {
    if (u < CAR_MIX[k]) return k;
    u -= CAR_MIX[k];
  }
  return CAR_MIX.length - 1;
}
