import { describe, expect, it } from 'vitest';
import { tunnelDepth, tunnelReach, TUNNEL_DEPTH } from '../src/data/surface.ts';
import { decodeDir, type RoadLanes } from '../src/data/road.ts';
import { clipLine, drawnGround, onGround } from '../tools/lib/groundclip.ts';
import { widenEdges } from '../tools/lib/laneedges.ts';
import { snapArrows } from '../tools/lib/arrows.ts';
import { road } from './helpers.ts';

// 재작업 W14: 찻길 면·노면 표시·화살표를 서울시 선에 맞추기

describe('노면 표시 자르기', () => {
  // 0~20 × 0~10 네모 찻길
  const B = drawnGround([[[0, 0, 20, 0, 20, 10, 0, 10]]]);
  it('면 밖으로 나간 부분을 잘라 낸다', () => {
    const parts = clipLine(B, [
      [-10, 5],
      [30, 5],
    ]);
    expect(parts.length).toBe(1);
    const [a, b] = [parts[0][0], parts[0][parts[0].length - 1]];
    expect(a[0]).toBeGreaterThan(-0.6);
    expect(a[0]).toBeLessThan(0.1);
    expect(b[0]).toBeGreaterThan(19.9);
    expect(b[0]).toBeLessThan(20.6);
  });
  it('면 밖에만 있는 선은 남지 않는다', () => {
    expect(
      clipLine(B, [
        [-10, 20],
        [30, 20],
      ]),
    ).toEqual([]);
  });
  it('가장자리 0.3m 안은 면으로 친다', () => {
    expect(onGround(B, 20.2, 5)).toBe(true);
    expect(onGround(B, 20.6, 5)).toBe(false);
  });
});

describe('찻길 가장자리 넓히기', () => {
  // 동쪽으로 가는 양방향 길(가운데선 z = 0), 오른쪽(+z) 가장자리는 차로로 어림한 3.8m
  const r = road(
    [
      [0, 0],
      [60, 0],
    ],
    { lanes: 2, measured: true, lw: 3.3 },
  );
  it('가장자리 밖 칠한 선까지 넓히고, 안쪽 선·엇갈린 선은 보지 않는다', () => {
    const lines = [
      { k: 6, p: [[5, 5.5], [55, 5.5]] as [number, number][] }, // 차선(오른쪽 5.5m)
      { k: 6, p: [[5, -2], [55, -2]] as [number, number][] }, // 이미 안쪽
      { k: 6, p: [[30, -15], [30, 15]] as [number, number][] }, // 길을 가로지르는 선
    ];
    const w = widenEdges([r], [true], lines);
    const e = w.edges.get(0)!;
    const at = (p: { s: number[]; v: number[] }, s: number) => {
      let k = 0;
      while (k + 2 < p.s.length && p.s[k + 1] < s) k++;
      return p.v[k] + ((p.v[k + 1] - p.v[k]) * (s - p.s[k])) / (p.s[k + 1] - p.s[k]);
    };
    expect(at(e[0], 30)).toBeGreaterThanOrEqual(5.8 - 1e-6);
    expect(at(e[1], 30)).toBeCloseTo(3.8, 5);
  });
  it('4m 넘게 떨어진 선은 맡기지 않는다', () => {
    const w = widenEdges([r], [true], [{ k: 6, p: [[5, 9], [55, 9]] }]);
    expect(w.edges.size).toBe(0);
    expect(w.far).toBeGreaterThan(0);
  });
});

describe('노면 화살표를 차로 가운데로', () => {
  // 동쪽으로 가는 한 방향 길, 차로 가운데 옆 거리 1.6·4.8m(오른쪽 +)
  const r = road(
    [
      [0, 0],
      [100, 0],
    ],
    { oneway: true, lanes: 2 },
  );
  const dir = decodeDir([1, 0, 100, 1, 0, 100, 2, 2, 0, 0, 0, 0, 1.6, 4.8, 100, 1.6, 4.8]);
  const lanes: RoadLanes = [[dir, null]];
  it('가장 가까운 차로 가운데로 옮기고 방향을 길에 맞춘다', () => {
    const s = snapArrows([r], lanes, [{ kind: 7, x: 50, z: 2.6, fx: Math.cos(0.2), fz: Math.sin(0.2) }]);
    expect(s.moved).toBe(1);
    expect(s.out[0].x).toBeCloseTo(50, 3);
    expect(s.out[0].z).toBeCloseTo(1.6, 3);
    expect(s.out[0].fx).toBeCloseTo(1, 5);
  });
  it('반대 방향 화살표와 3.6m 넘게 떨어진 화살표는 그대로 둔다', () => {
    const s = snapArrows([r], lanes, [
      { kind: 7, x: 50, z: 1.6, fx: -1, fz: 0 },
      { kind: 7, x: 50, z: 9, fx: 1, fz: 0 },
    ]);
    expect(s.moved).toBe(0);
  });
});

describe('찻길 터널 입구 깊이', () => {
  // 땅 위 길 — 터널 20m — 터널 40m — 땅 위 길
  const g1 = road([
    [-30, 0],
    [0, 0],
  ]);
  const t1 = road(
    [
      [0, 0],
      [20, 0],
    ],
    { tunnel: true },
  );
  const t2 = road(
    [
      [20, 0],
      [60, 0],
    ],
    { tunnel: true },
  );
  const g2 = road([
    [60, 0],
    [90, 0],
  ]);
  it('가장 가까운 입구까지 터널을 따라간 거리', () => {
    const re = tunnelReach([g1, t1, t2, g2]);
    expect(re[0]).toBeNull();
    expect(re[1]).toEqual([0, 20]); // 끝 노드(x = 20)는 되돌아 나가는 입구가 더 가깝다
    expect(re[2]).toEqual([20, 0]);
  });
  it('입구에서 0, 30m 들어가면 다 내려간다', () => {
    expect(tunnelDepth([0, 100], 0, 60)).toBe(0);
    expect(tunnelDepth([0, 100], 30, 60)).toBeCloseTo(TUNNEL_DEPTH, 5);
    expect(tunnelDepth([0, 100], 15, 60)).toBeCloseTo(TUNNEL_DEPTH / 2, 5);
  });
});
