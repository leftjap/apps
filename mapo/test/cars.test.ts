import { describe, expect, it } from 'vitest';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { at, fixedProvider, road } from './helpers.ts';

// 한 변 400m 정사각형을 시계 방향으로 도는 일방통행 1차로 순환로
const ring = () =>
  buildCarGraph([
    road([[0, 0], [400, 0]], { oneway: true, lanes: 1 }),
    road([[400, 0], [400, 400]], { oneway: true, lanes: 1 }),
    road([[400, 400], [0, 400]], { oneway: true, lanes: 1 }),
    road([[0, 400], [0, 0]], { oneway: true, lanes: 1 }),
  ]);

describe('차 그래프', () => {
  it('양방향 도로는 서로 반대인 구간 둘, 일방통행은 하나', () => {
    const two = buildCarGraph([road([[0, 0], [100, 0]])]);
    expect(two.length).toBe(2);
    expect(two[0].p[0]).toBe(0);
    expect(two[1].p[0]).toBe(100);
    expect(buildCarGraph([road([[0, 0], [100, 0]], { oneway: true })]).length).toBe(1);
  });
  it('끝이 맞닿으면 이어지고, 온 길로 되돌아가는 구간은 뺀다', () => {
    const g = buildCarGraph([road([[0, 0], [100, 0]]), road([[100, 0], [200, 0]])]);
    const fwd = g.find((e) => e.p[0] === 0)!;
    const next = fwd.next.map((i) => g[i]);
    expect(next.length).toBe(1);
    expect(next[0].p[0]).toBe(100);
    expect(next[0].p[3]).toBe(200);
  });
  it('보행로와 골목에는 차 구간을 만들지 않는다', () => {
    expect(buildCarGraph([road([[0, 0], [100, 0]], { cls: 7 }), road([[0, 0], [0, 100]], { cls: 4 })]).length).toBe(0);
  });
  it('양방향 도로의 차로는 진행 방향 오른쪽에 놓인다', () => {
    const [e] = buildCarGraph([road([[0, 0], [100, 0]], { lanes: 4 })]);
    expect(e.lanes).toBe(2);
    expect(e.off0).toBeGreaterThan(0);
  });
});

describe('차 이동', () => {
  it('300초 뒤에도 같은 차로의 앞뒤 차는 4.5m 넘게 떨어져 있다', () => {
    const g = ring();
    const sim = makeCars(g, fixedProvider(1), 7, 60);
    sim.fill(60);
    for (let i = 0; i < 3000; i++) sim.step(0.1, at(8.5), false);
    expect(sim.cars.n).toBe(60);
    const c = sim.cars;
    let min = Infinity;
    for (let i = 0; i < c.n; i++)
      for (let j = i + 1; j < c.n; j++) min = Math.min(min, Math.hypot(c.x[i] - c.x[j], c.z[i] - c.z[j]));
    expect(min).toBeGreaterThan(4.5);
  });
  it('차는 길 위에 있다', () => {
    const sim = makeCars(ring(), fixedProvider(1), 3, 40);
    sim.fill(40);
    for (let i = 0; i < 600; i++) sim.step(0.1, at(8.5), false);
    const c = sim.cars;
    for (let i = 0; i < c.n; i++) {
      const dEdge = Math.min(Math.abs(c.z[i]), Math.abs(c.x[i] - 400), Math.abs(c.z[i] - 400), Math.abs(c.x[i]));
      expect(dEdge).toBeLessThan(3);
    }
  });
  it('속도 비율이 낮으면 느려지고 브레이크등이 늘어난다', () => {
    const run = (k: number) => {
      const sim = makeCars(ring(), fixedProvider(k), 5, 40);
      sim.fill(40);
      for (let i = 0; i < 1200; i++) sim.step(0.1, at(8.5), false);
      const c = sim.cars;
      let brake = 0;
      for (let i = 0; i < c.n; i++) brake += c.brake[i] > 0.5 ? 1 : 0;
      return { speed: sim.meanSpeed(), brake };
    };
    const free = run(1);
    const jam = run(0.2);
    expect(jam.speed).toBeLessThan(free.speed * 0.5);
    expect(jam.brake).toBeGreaterThan(free.brake);
  });
  it('새벽 3시의 목표 대수는 출근 시간보다 적다', () => {
    const sim = makeCars(ring(), makeSimProvider(), 1, 500);
    expect(sim.target(at(3))).toBeLessThan(sim.target(at(8.5)) * 0.5);
  });
});
