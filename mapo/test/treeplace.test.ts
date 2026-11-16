import { describe, expect, it } from 'vitest';
import { pushTreesOffRoad } from '../tools/lib/treeplace.ts';
import { treeKinds } from '../tools/lib/trees.ts';
import { toLatLon } from '../src/geo.ts';

describe('찻길 위 가로수 옮기기(W15)', () => {
  // 찻길 면: z 가 −5~5 인 띠
  const onCar = (_x: number, z: number) => Math.abs(z) < 5;
  it('찻길 면 위 나무를 가장 가까운 찻길 밖 자리로 옮기고 0.8m 더 들인다. 찻길 밖 나무는 그대로', () => {
    const t = [0, 40, 100, 80];
    expect(pushTreesOffRoad(t, onCar)).toEqual({ moved: 1, left: 0 });
    expect(t[0]).toBe(0);
    expect(t[1] / 10).toBeCloseTo(5.8, 1);
    expect(t.slice(2)).toEqual([100, 80]);
  });
  it('옮긴 나무는 자리가 꼭 맞는 짝이 없는 가장 가까운 원래 점의 수종을 받는다', () => {
    const [lat, lon] = toLatLon(0, 4);
    const [lat2, lon2] = toLatLon(20, 8);
    // 판 나무 둘: 옮긴 나무(0, 5.8)와 원래 자리 그대로인 나무(20, 8)
    const kinds = treeKinds([0, 58, 200, 80], [[lat, lon, '은행나무'], [lat2, lon2, '벚나무']], (_x, z) => Math.abs(z) < 5);
    expect(kinds[0]).toBe(0);
    expect(kinds[1]).toBe(3);
  });
});
