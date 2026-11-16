// 그린 차 몸통끼리 겹치지 않는가(tools/measure-cars.ts 의 겹침 측정으로 판에서 찾은 까닭의 재현)
import { describe, expect, it } from 'vitest';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { bodyType } from '../src/sim/bodies.ts';
import { CAR_SHAPES } from '../src/render/cars.ts';
import { at, fixedProvider, road } from './helpers.ts';

const HW = [CAR_SHAPES.sedan, CAR_SHAPES.suv, CAR_SHAPES.kei, CAR_SHAPES.van].map((s) => s.look.hw);

/** 지금 그려진 차 몸통(시뮬레이션 길이 × 차종 폭, 배율 1)이 겹친 쌍의 수 */
function overlaps(sim: ReturnType<typeof makeCars>): number {
  const c = sim.cars;
  const D = sim.debug();
  const corners = (i: number) => {
    const L = D.size[i] / 2;
    const W = c.kind[i] === 1 ? 1.245 : HW[c.kind[i] === 2 ? 0 : bodyType(c.tint[i])];
    const cs = Math.cos(c.yaw[i]);
    const sn = Math.sin(c.yaw[i]);
    return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [c.x[i] + a * L * cs - b * W * sn, c.z[i] + a * L * sn + b * W * cs]);
  };
  const apart = (P: number[][], Q: number[][]) => {
    for (const poly of [P, Q])
      for (let k = 0; k < 4; k++) {
        const nx = -(poly[(k + 1) % 4][1] - poly[k][1]);
        const nz = poly[(k + 1) % 4][0] - poly[k][0];
        const a = P.map(([x, z]) => x * nx + z * nz);
        const b = Q.map(([x, z]) => x * nx + z * nz);
        if (Math.max(...a) <= Math.min(...b) || Math.max(...b) <= Math.min(...a)) return true;
      }
    return false;
  };
  let n = 0;
  for (let i = 0; i < c.n; i++)
    for (let j = i + 1; j < c.n; j++) if (Math.hypot(c.x[i] - c.x[j], c.z[i] - c.z[j]) < 14 && !apart(corners(i), corners(j))) n++;
  return n;
}

describe('굽은 길에서 줄 선 차', () => {
  it('차로가 많은 길이 갈림 없이 90° 꺾이는 곳에 줄이 서도 안쪽 차로 차들이 겹치지 않는다', () => {
    // 4차로 일방통행이 (0,0) 에서 북쪽(+z)으로 꺾인다. 꺾인 뒤 60m 앞이 돌발 서행(0.05m/s)으로 막혀 줄이 꺾인 곳 너머까지 선다
    const g = buildCarGraph([
      road([[-300, 0], [0, 0]], { oneway: true, lanes: 4, cls: 2 }),
      road([[0, 0], [0, 300]], { oneway: true, lanes: 4, cls: 2 }),
    ]);
    const west = g.find((e) => e.p[0] === -300)!;
    const north = g.find((e) => e.p[0] === 0)!;
    const sim = makeCars(g, fixedProvider(1), 4, 80);
    sim.setIncidents({ blocks: [], close: [], slow: [{ edge: north.id, at: 60, v: 0.05 }] });
    let worst = 0;
    for (let k = 0; k < 10 * 90; k++) {
      if (k % 20 === 0 && k < 240) for (let l = 0; l < 4; l++) sim.put(west.id, 5, l);
      sim.step(0.1, at(14), false);
      if (k > 10 * 30) worst = Math.max(worst, overlaps(sim));
    }
    expect(sim.cars.n).toBe(48);
    expect(worst).toBe(0);
  });
});

describe('차로 수가 늘어나는 이음매', () => {
  it('한 차로가 두 차로로 갈라지는 곳에서 앞차가 다른 차로로 갔어도 뒤차가 곡선 위에서 그 차와 겹치지 않는다', () => {
    // 1차로 일방통행이 (0,0) 에서 2차로가 되며 오른쪽으로 25° 꺾인다. 40m 앞이 막혀 두 차로에 줄이 선다
    const t = (25 * Math.PI) / 180;
    const g = buildCarGraph([
      road([[-300, 0], [0, 0]], { oneway: true, lanes: 1, cls: 2 }),
      road([[0, 0], [300 * Math.cos(t), 300 * Math.sin(t)]], { oneway: true, lanes: 2, cls: 2 }),
    ]);
    const west = g.find((e) => e.p[0] === -300)!;
    const east = g.find((e) => e.p[0] === 0)!;
    let worst = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = makeCars(g, fixedProvider(1), seed, 60);
      sim.setIncidents({ blocks: [], close: [], slow: [{ edge: east.id, at: 40, v: 0.05 }] });
      for (let k = 0; k < 10 * 120; k++) {
        if (k % 25 === 0 && k < 10 * 60) sim.put(west.id, 5, 0);
        sim.step(0.1, at(14), false);
        worst = Math.max(worst, overlaps(sim));
      }
    }
    expect(worst).toBe(0);
  });
});
