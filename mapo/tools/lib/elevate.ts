// 교량·고가의 높이. 땅에 닿는 점에서 ramp(m)에 걸쳐 부드럽게 top까지 올라간다.
export function rampHeight(distToGround: number, top: number, ramp = 80): number {
  const t = Math.min(1, Math.max(0, distToGround / ramp));
  return top * t * t * (3 - 2 * t);
}
