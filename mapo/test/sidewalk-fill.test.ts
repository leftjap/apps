import { describe, expect, it } from 'vitest';
import { roadJoints } from '../src/data/surface.ts';
import { GK } from '../src/data/board.ts';
import { surfacePolys } from '../tools/lib/surface.ts';
import { ringArea } from '../tools/lib/contour.ts';
import { road } from './helpers.ts';

/** 고리들(짝홀) 안인가 */
const inside = (rings: number[][], x: number, z: number) => {
  let c = false;
  for (const r of rings) for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < r[i] + ((z - r[i + 1]) / (r[j + 1] - r[i + 1])) * (r[j] - r[i])) c = !c;
  return c;
};

describe('보도 면 채우기', () => {
  // 동서 큰길(4차로, 연석 ±7.1m). 북쪽(−z)에는 도로 부지 자료가 있고 남쪽(+z)에는 없다. 남쪽 연석 4m 밖에 건물이 늘어서 있다
  const roads = [road([[-80, 0], [80, 0]], { cls: 2, lanes: 4 })];
  const built = { cut: Float32Array.from([0, Infinity]), faces: [], internal: new Uint8Array(1) };
  const areas = [{ kind: GK.ROADSIDE, outer: [-80, -7.1, 80, -7.1, 80, -12, -80, -12], holes: [] }];
  const building = [-60, 11.1, 60, 11.1, 60, 30, -60, 30];

  it('도로 부지 자료가 없는 큰길 쪽은 연석에서 건물까지(6m 안) 보도 면으로 채우고, 건물과 찻길에는 겹치지 않는다', () => {
    const p = surfacePolys(roads, built, roadJoints(roads), areas, [GK.ROADSIDE], 100, [], [building], true);
    expect(inside(p.walk, 0, -9.5)).toBe(true); // 자료가 있는 북쪽
    expect(inside(p.walk, 0, 9)).toBe(true); // 채운 남쪽
    expect(inside(p.walk, 0, 12)).toBe(false); // 건물 안
    expect(inside(p.walk, 0, 5)).toBe(false); // 찻길
    expect(inside(p.walk, 70, 12.5)).toBe(true); // 건물이 없는 곳은 연석 6m 밖(13.1m)까지
    expect(inside(p.walk, 70, 13.5)).toBe(false);
    expect(p.walk.some((r) => ringArea(r) > 0)).toBe(true);
  });
  it('그 쪽에 실폭도로 면이 있으면 그 면이 이어지는 데까지만 채운다', () => {
    // 남쪽 실폭도로 면은 연석에서 3m(z 7.1~10.1)까지
    const p = surfacePolys(roads, built, roadJoints(roads), areas, [GK.ROADSIDE], 100, [], [building], true, [{ outer: [-80, 7.1, 80, 7.1, 80, 10.1, -80, 10.1], holes: [] }]);
    expect(inside(p.walk, 70, 9)).toBe(true);
    expect(inside(p.walk, 70, 11)).toBe(false);
    expect(p.filledRw).toBeGreaterThan(0);
  });
  it('채우기를 켜지 않으면 자료 있는 쪽만 보도 면이고, 건물 외곽선은 보도 면에서 뺀다', () => {
    const p = surfacePolys(roads, built, roadJoints(roads), [...areas, { kind: GK.ROADSIDE, outer: [-80, 7.1, 80, 7.1, 80, 20, -80, 20], holes: [] }], [GK.ROADSIDE], 100, [], [building]);
    expect(inside(p.walk, 0, 9)).toBe(true);
    expect(inside(p.walk, 0, 12)).toBe(false);
    expect(inside(p.walk, 70, 16)).toBe(true);
  });
  it('교차로 면 바깥 테두리 쪽도 6m 안에 보도 면이 없으면 같은 방식으로 채운다(교차로 모퉁이에 붙은 횡단보도 끝)', () => {
    // 동서 큰길 두 조각 사이(x −10~10)가 교차로 면이다. 남쪽에는 도로 부지 자료가 없다
    const rs = [road([[-80, 0], [-10, 0]], { cls: 2, lanes: 4 }), road([[10, 0], [80, 0]], { cls: 2, lanes: 4 })];
    const face = { cls: 2, outer: [-10, -7.1, 10, -7.1, 10, 7.1, -10, 7.1], holes: [], nodes: 2, arms: 2 };
    const b2 = { cut: Float32Array.from([0, Infinity, 0, Infinity]), faces: [face], internal: new Uint8Array(2) };
    const p = surfacePolys(rs, b2, roadJoints(rs), areas, [GK.ROADSIDE], 100, [], [building], true);
    expect(inside(p.walk, 0, 9)).toBe(true); // 교차로 면 남쪽
    expect(inside(p.walk, 0, 5)).toBe(false); // 교차로 면 안
    expect(inside(p.walk, 0, 12)).toBe(false); // 건물 안
  });
});
