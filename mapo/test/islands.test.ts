import { describe, expect, it } from 'vitest';
import { ringArea } from '../tools/lib/contour.ts';
import { carveIslands } from '../tools/lib/islands.ts';

const rect = (x0: number, z0: number, x1: number, z1: number) => [x0, z0, x1, z0, x1, z1, x0, z1];

describe('교차로 면 안의 섬', () => {
  // 40m × 40m 교차로 면. 찻길 띠가 가운데 10m × 10m 를 둘러싸고, 오른쪽 위 5m × 5m 모퉁이(면 테두리에 닿음)는 어느 띠도 덮지 않는다.
  // 가운데 빈 곳의 왼쪽 2m 는 횡단보도 칠이다
  const face = () => ({ cls: 2, outer: rect(0, 0, 40, 40), holes: [] as number[][] });
  const cover = [rect(0, 0, 40, 15), rect(0, 25, 35, 40), rect(35, 25, 40, 35), rect(0, 15, 15, 25), rect(25, 15, 40, 25)];
  const paint = [rect(15, 15, 17, 25)];

  it('어느 찻길 띠·횡단보도 칠에도 덮이지 않고 면 테두리에 닿지 않는 곳만 섬 구멍으로 낸다', () => {
    const f = face();
    const n = carveIslands([f], [...cover, ...paint]);
    expect(n).toBe(1);
    expect(f.holes).toHaveLength(1);
    // 구멍은 바깥 고리와 반대 방향이고, 넓이는 칠을 뺀 8m × 10m 안팎
    expect(ringArea(f.holes[0])).toBeLessThan(0);
    expect(Math.abs(ringArea(f.holes[0]))).toBeGreaterThan(70);
    expect(Math.abs(ringArea(f.holes[0]))).toBeLessThan(90);
    for (let k = 0; k < f.holes[0].length; k += 2) {
      expect(f.holes[0][k]).toBeGreaterThan(16.5);
      expect(f.holes[0][k + 1]).toBeGreaterThan(14.5);
      expect(f.holes[0][k + 1]).toBeLessThan(25.5);
    }
  });
  it('띠 사이 좁은 틈(폭 0.4m)은 섬으로 보지 않는다', () => {
    const f = face();
    const n = carveIslands([f], [rect(0, 0, 40, 19.8), rect(0, 20.2, 40, 40), rect(0, 0, 1, 40), rect(39, 0, 40, 40)]);
    expect(n).toBe(0);
    expect(f.holes).toHaveLength(0);
  });
});
