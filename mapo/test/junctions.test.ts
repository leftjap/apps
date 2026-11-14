import { describe, expect, it } from 'vitest';
import { makeCars, type Cars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeSignals } from '../src/sim/signals.ts';
import { fixedProvider, road } from './helpers.ts';

// 서로 다른 방향의 두 차가 2.6m 안에 있으면 겹친 것으로 본다(같은 방향으로 나란히 달리는 차는 뺀다)
function overlaps(c: Cars) {
  let n = 0;
  for (let i = 0; i < c.n; i++)
    for (let j = i + 1; j < c.n; j++) {
      if (Math.hypot(c.x[i] - c.x[j], c.z[i] - c.z[j]) >= 2.6) continue;
      const d = Math.abs(((((c.yaw[i] - c.yaw[j]) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      if (d > 0.5) n++;
    }
  return n;
}

/** 판 가장자리에서 가장자리까지 가로지르는 두 길이 (0,0)에서 만나는 네거리 */
const R = 1990;
const cross = (cls: number, minor = cls) =>
  buildCarGraph([
    road([[-R, 0], [0, 0]], { cls }),
    road([[0, 0], [R, 0]], { cls }),
    road([[0, -R], [0, 0]], { cls: minor, bus: minor > 3 }),
    road([[0, 0], [0, R]], { cls: minor, bus: minor > 3 }),
  ]);

/** 네 갈래에서 차를 계속 들여보내며 dt 마다 겹침을 센다 */
function run(g: ReturnType<typeof cross>, secs: number, tod = 18 * 3600) {
  const signals = makeSignals(g);
  const sim = makeCars(g, fixedProvider(1), 5, 120, [], signals);
  sim.fill(sim.target({ tod, dow: 2, doy: 317 }));
  let bad = 0;
  let passed = 0;
  const seen = new Set<number>();
  for (let k = 0; k < secs * 10; k++) {
    sim.step(0.1, { tod: tod + k * 0.1, dow: 2, doy: 317 });
    bad += overlaps(sim.cars);
    for (let i = 0; i < sim.cars.n; i++) if (Math.hypot(sim.cars.x[i], sim.cars.z[i]) > 60 && Math.hypot(sim.cars.x[i], sim.cars.z[i]) < 70) seen.add(sim.cars.uid[i]);
  }
  passed = seen.size;
  return { bad, passed, signals: signals.list.length };
}

describe('교차로 양보', () => {
  it('신호 없는 네거리에서 가로지르는 차끼리 겹치지 않고, 모든 방향 차가 지나간다', () => {
    const r = run(cross(3), 240);
    expect(r.signals).toBe(0);
    expect(r.bad).toBe(0);
    expect(r.passed).toBeGreaterThan(40);
  });
  it('신호 네거리에서도 좌회전 차가 맞은편 직진 차와 겹치지 않는다', () => {
    const r = run(cross(2), 360);
    expect(r.signals).toBe(1);
    expect(r.bad).toBe(0);
    expect(r.passed).toBeGreaterThan(40);
  });
  it('작은 길 차는 큰길로 다가오는 차가 있으면 정지선 앞에서 기다린다', () => {
    const g = cross(3, 5);
    const sim = makeCars(g, fixedProvider(1), 9, 10, [], makeSignals(g));
    const west = g.find((e) => e.p[0] < -R + 1)!;
    const north = g.find((e) => e.p[2] < -R + 1)!;
    sim.put(west.id, R - 38, 0); // 큰길: 교차로까지 38m
    sim.put(north.id, R - 18, 0); // 작은 길: 교차로까지 18m
    const first: Record<number, number> = {};
    for (let k = 0; k < 400; k++) {
      sim.step(0.1, { tod: 18 * 3600, dow: 2, doy: 317 }, false);
      for (let i = 0; i < sim.cars.n; i++) if (first[sim.cars.uid[i]] === undefined && Math.hypot(sim.cars.x[i], sim.cars.z[i]) < 2) first[sim.cars.uid[i]] = k;
    }
    const [major, minor] = Object.keys(first).map(Number).sort((a, b) => a - b);
    expect(first[major]).toBeDefined();
    expect(first[minor]).toBeDefined();
    expect(first[minor]).toBeGreaterThan(first[major]);
  });
});
