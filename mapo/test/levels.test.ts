import { describe, expect, it } from 'vitest';
import { toLatLon } from '../src/geo.ts';
import { pointAt } from '../src/poly.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { roadLevels } from '../tools/lib/levels.ts';
import { road } from './helpers.ts';

/** 판 좌표 [x,z] 목록 → OSM 길 */
const way = (pts: [number, number][], tags: Record<string, string>) => ({ geometry: pts.map(([x, z]) => ((([lat, lon]) => ({ lat, lon }))(toLatLon(x, z)))), tags });
/** 구운 판 조각 [등급, 차로, 표시, 다리, 이름, 랜드마크, x, y, z(dm)...] */
const piece = (pts: [number, number, number][], bridge = 0) => [1, 2, 0, bridge, -1, 0, ...pts.flatMap(([x, y, z]) => [x * 10, y * 10, z * 10])];
const yAt = (q: number[], x: number) => {
  for (let k = 6; k + 5 < q.length; k += 3)
    if (q[k] / 10 <= x && q[k + 3] / 10 >= x) return (q[k + 1] + ((x - q[k] / 10) / (q[k + 3] / 10 - q[k] / 10 || 1)) * (q[k + 4] - q[k + 1])) / 10;
  return NaN;
};

describe('높이 다른 찻길 굽기(W15)', () => {
  it('OSM 찻길 터널을 따라 놓인 조각에 터널 표시를 단다', () => {
    const r = [piece([[0, 0, 0], [100, 0, 0]]), piece([[0, 0, 50], [100, 0, 50]])];
    const ways = [way([[0, 0], [100, 0]], { highway: 'primary', tunnel: 'yes', layer: '-1' }), way([[0, 50], [100, 50]], { highway: 'primary' })];
    expect(roadLevels(r, ways).tunnels).toBe(1);
    expect(r[0][3]).toBe(2);
    expect(r[1][3]).toBe(0);
  });
  it('다리가 노드 없이 넘는 찻길보다 6m 위가 되게 다리와 그 앞 둑길을 올린다(갈림 있는 노드는 그대로)', () => {
    // 다리(40~60m)가 x=50 에서 남북 찻길을 넘는다. 앞뒤 둑길은 갈림 없이 이어지고, 0m·100m 끝은 다른 길과 만나는 갈림 노드다
    const r = [
      piece([[0, 0, 0], [40, 0, 0]]),
      piece([[40, 0, 0], [60, 0, 0]], 1),
      piece([[60, 0, 0], [100, 0, 0]]),
      piece([[50, 0, -30], [50, 0, 30]]),
      piece([[0, 0, 0], [0, 0, 30]]),
      piece([[0, 0, 0], [0, 0, -30]]),
      piece([[100, 0, 0], [100, 0, 30]]),
      piece([[100, 0, 0], [100, 0, -30]]),
    ];
    const ways = [way([[40, 0], [60, 0]], { highway: 'primary', bridge: 'yes', layer: '1' }), way([[50, -30], [50, 30]], { highway: 'secondary' }), way([[0, 0], [40, 0]], { highway: 'primary' }), way([[60, 0], [100, 0]], { highway: 'primary' })];
    const { raised } = roadLevels(r, ways);
    expect(raised).toEqual(['50,0']);
    expect(yAt(r[1], 50)).toBeCloseTo(6, 1);
    expect(yAt(r[0], 40)).toBeGreaterThan(5); // 다리 끝 둑길도 함께 올라 있다
    expect(r[0][7]).toBe(0); // 갈림 노드는 그대로
    expect(yAt(r[3], 50)).toBe(0); // 넘는 찻길은 땅 위
  });
  it('차 그래프는 터널 조각을 입구에서 땅 밑으로 내린다', () => {
    const g = buildCarGraph([road([[-100, 0], [0, 0]], { oneway: true }), road([[0, 0], [200, 0]], { oneway: true, tunnel: true }), road([[200, 0], [300, 0]], { oneway: true })]);
    const t = g.find((e) => e.road === 1)!;
    const P = [0, 0, 0];
    pointAt(t.p, t.cum, 0, P);
    expect(P[1]).toBeCloseTo(0, 3);
    pointAt(t.p, t.cum, 100, P);
    expect(P[1]).toBeLessThan(-7);
    expect(t.len).toBeCloseTo(200, 1);
  });
});
