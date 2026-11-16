// 멀어질수록 키워 그리는 배율(크기 기준 하나). 모든 요소가 같은 꼴의 곡선을 쓴다:
// 카메라에서의 깊이가 SIZE_START(m) 안이면 1(실제 크기), 넘으면 깊이 / SIZE_START 로 커지고 요소마다 정한 상한에서 멈춘다.
// 사람·고양이·차·버스·열차는 같은 상한(mover)을 써서 멀어질 때 같은 비율로 커진다.
// 길 위에 고정된 것(정류장·출구·나무·신호등)은 길 폭을 넘어 옆 차로·건물을 덮지 않을 만큼만 키운다.

/** 이 깊이(m)까지는 실제 크기. 보는 거리 250m 인 가까운 보기의 화면 위쪽(깊이 약 290m)까지 사람·차 배율이 1.15 아래다 */
export const SIZE_START = 260;

export const SIZE_MAX = {
  /** 사람·고양이·차·버스·열차 */
  mover: 3.0,
  /** 나무(수관 지름 4~7m 가 옆 차로를 덮지 않게) */
  tree: 1.2,
  /** 지하철 출구 지붕 */
  exit: 1.3,
  /** 보도 위 버스 쉼터 */
  shelter: 1.3,
  /** 중앙버스정류장: 길이·폭은 실제 크기, 높이에만 쓴다 */
  island: 1.5,
  /** 신호등 */
  signal: 1.5,
};
export type SizeKind = keyof typeof SIZE_MAX;

export function sizeAt(kind: SizeKind, depth: number): number {
  return Math.min(SIZE_MAX[kind], Math.max(1, depth / SIZE_START));
}

/** 셰이더 식. depth 는 카메라에서의 깊이(보통 -cv.z) */
export const sizeGlsl = (kind: SizeKind, depth = '-cv.z') => `clamp((${depth}) / ${SIZE_START.toFixed(1)}, 1.0, ${SIZE_MAX[kind].toFixed(2)})`;
