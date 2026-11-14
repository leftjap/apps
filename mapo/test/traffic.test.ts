import { describe, expect, it } from 'vitest';
import { makeCars, type Cars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeJunctions } from '../src/sim/junctions.ts';
import type { DataProvider } from '../src/sim/provider.ts';
import { fixedProvider, road } from './helpers.ts';

const R = 1990;

/** 두 차의 차체(길이 4.6m·폭 1.8m 에서 가장자리 0.2m 를 뺀 직사각형)가 겹치는가 */
function touching(c: Cars, i: number, j: number) {
  if (Math.abs(c.y[i] - c.y[j]) > 2 || Math.hypot(c.x[i] - c.x[j], c.z[i] - c.z[j]) > 5) return false;
  const box = (k: number) => {
    const cs = Math.cos(c.yaw[k]);
    const sn = Math.sin(c.yaw[k]);
    return [
      [2.1, 0.7],
      [2.1, -0.7],
      [-2.1, 0.7],
      [-2.1, -0.7],
    ].map(([a, b]) => [c.x[k] + a * cs - b * sn, c.z[k] + a * sn + b * cs]);
  };
  const A = box(i);
  const B = box(j);
  for (const yaw of [c.yaw[i], c.yaw[j]])
    for (const [ax, az] of [
      [Math.cos(yaw), Math.sin(yaw)],
      [-Math.sin(yaw), Math.cos(yaw)],
    ]) {
      const pa = A.map(([x, z]) => x * ax + z * az);
      const pb = B.map(([x, z]) => x * ax + z * az);
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
  return true;
}
function overlaps(c: Cars) {
  let n = 0;
  for (let i = 0; i < c.n; i++) for (let j = i + 1; j < c.n; j++) if (touching(c, i, j)) n++;
  return n;
}
/** keys 에 든 구간만 속도 비율이 v 이고 나머지는 원활한 공급자 */
const slowOn = (keys: Set<number>, v: number): DataProvider => ({ ...fixedProvider(1), roadSpeed: (_now, _cls, key) => (keys.has(key) ? v : 1) });
const now = (t: number) => ({ tod: 18 * 3600 + t, dow: 2, doy: 317 });

describe('앞차 보기', () => {
  it('짧은 구간 너머에 서 있다시피 한 차를 미리 보고, 겹치지 않게 그 뒤에 선다', () => {
    const g = buildCarGraph([
      road([[-R, 0], [-8, 0]], { cls: 0, oneway: true, lanes: 1 }),
      road([[-8, 0], [0, 0]], { cls: 0, oneway: true, lanes: 1 }),
      road([[0, 0], [R, 0]], { cls: 0, oneway: true, lanes: 1 }),
    ]);
    const last = g.find((e) => e.p[0] > -1)!;
    const first = g.find((e) => e.p[0] < -R + 1)!;
    const sim = makeCars(g, slowOn(new Set([last.key]), 0), 3, 10);
    sim.put(last.id, 0.5, 0); // 곧 0.5m/s 로 기어가는 차
    for (let k = 0; k < 30; k++) sim.step(0.1, now(k * 0.1), false);
    sim.put(first.id, first.len - 60, 0); // 그 뒤에서 고속도로 속도로 달려오는 차
    const c = sim.cars;
    let closest = Infinity;
    for (let k = 30; k < 300; k++) {
      sim.step(0.1, now(k * 0.1), false);
      const [a, b] = c.x[0] > c.x[1] ? [0, 1] : [1, 0];
      closest = Math.min(closest, c.x[a] - c.x[b]);
    }
    expect(closest).toBeGreaterThan(4.6);
  });
});

describe('합류', () => {
  it('비스듬히 합쳐지는 두 길의 차가 합류 전 차로가 겹치는 곳에서 서로 겹치지 않는다', () => {
    const g = buildCarGraph([
      road([[-R, 0], [0, 0]], { cls: 1, oneway: true, lanes: 2 }),
      road([[-R, 90], [-400, 14], [0, 0]], { cls: 1, oneway: true, lanes: 2 }),
      road([[0, 0], [R, 0]], { cls: 1, oneway: true, lanes: 2 }),
    ]);
    const sim = makeCars(g, fixedProvider(1), 4, 160);
    sim.fill(120);
    let bad = 0;
    for (let k = 0; k < 1800; k++) {
      sim.step(0.1, now(k * 0.1));
      if (k % 5 === 0) bad += overlaps(sim.cars);
    }
    expect(bad).toBe(0);
  });
});

describe('꼬리 물기', () => {
  it('빠져나갈 길이 막혀 있으면 교차로에 들어가지 않아서, 교차로 상자에 걸쳐 서 있는 차가 없다', () => {
    // 한 방향 4차로씩인 큰길끼리 만나는 넓은 교차로(상자 반지름 14m): 앞차가 상자를 다 건너기 전에 뒤차가 들어갈지 정한다
    const g = buildCarGraph([
      road([[-R, 0], [0, 0]], { cls: 3, lanes: 8 }),
      road([[0, 0], [120, 0]], { cls: 3, lanes: 8 }),
      road([[120, 0], [R, 0]], { cls: 3, lanes: 8 }),
      road([[0, -R], [0, 0]], { cls: 3, lanes: 8 }),
      road([[0, 0], [0, R]], { cls: 3, lanes: 8 }),
    ]);
    // 동쪽으로 120m 나간 곳부터 거의 막혀 있어서 줄이 교차로까지 밀려온다
    const jam = g.find((e) => e.p[0] === 120 && e.p[e.p.length - 3] > R - 1)!;
    const east = g.find((e) => e.p[0] === 0 && e.p[e.p.length - 3] === 120)!;
    const sim = makeCars(g, slowOn(new Set([jam.key]), 0.04), 6, 400);
    const box = makeJunctions(g).rOut[east.id];
    sim.fill(300);
    let stuck = 0;
    for (let k = 0; k < 2400; k++) {
      sim.step(0.1, now(k * 0.1));
      if (k % 5) continue;
      const c = sim.cars;
      // 교차로를 빠져나가는 쪽을 보고 줄에 막혀 기어가거나 선 차(0.6m/s 미만)의 꽁무니(반 길이 2.3m)가 상자 안으로 0.2m 넘게 들어와 있으면 걸쳐 선 것이다
      for (let i = 0; i < c.n; i++) {
        const out = c.x[i] * Math.cos(c.yaw[i]) + c.z[i] * Math.sin(c.yaw[i]) > 0;
        if (out && sim.speedOf(i) < 0.6 && Math.hypot(c.x[i], c.z[i]) - 2.3 < box - 0.2) stuck++;
      }
    }
    expect(stuck).toBe(0);
  });
});
