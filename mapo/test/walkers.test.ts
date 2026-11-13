import { describe, expect, it } from 'vitest';
import { buildWalkGraph } from '../src/sim/graph.ts';
import { makeWalkers, walkerTarget } from '../src/sim/walkers.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { at, fixedProvider, road } from './helpers.ts';

// 100m 간격 격자 골목 (가로 3줄, 세로 3줄)
const lanes = () => {
  const out = [];
  for (const k of [0, 100, 200]) {
    out.push(road([[0, k], [100, k]], { cls: 4, lanes: 1 }), road([[100, k], [200, k]], { cls: 4, lanes: 1 }));
    out.push(road([[k, 0], [k, 100]], { cls: 4, lanes: 1 }), road([[k, 100], [k, 200]], { cls: 4, lanes: 1 }));
  }
  return out;
};
const exits = [{ st: '합정', x: 102, z: 98 }, { st: '상수', x: 0, z: 200 }];
const offGrid = (x: number, z: number) => {
  const d = (v: number) => Math.min(...[0, 100, 200].map((k) => Math.abs(v - k)));
  return Math.min(d(x), d(z));
};

describe('보행 그래프', () => {
  it('꼭짓점이 노드가 되고 맞닿은 길끼리 이어진다', () => {
    const g = buildWalkGraph(lanes());
    expect(g.adj.length).toBe(9);
    const centre = g.nearest(100, 100);
    expect(g.adj[centre].length).toBe(4);
  });
  it('간선도로와 교량은 걷지 않는다', () => {
    const g = buildWalkGraph([road([[0, 0], [100, 0]], { cls: 0 }), road([[0, 50], [100, 50]], { cls: 4, bridge: true, p: Float32Array.from([0, 12, 50, 100, 12, 50]) })]);
    expect(g.adj.length).toBe(0);
  });
});

describe('보행자', () => {
  it('열차가 도착하면 그 역 출구에서 무리가 나온다', () => {
    const sim = makeWalkers(buildWalkGraph(lanes()), exits, fixedProvider(1), 1, 200);
    sim.burst('합정', 20);
    expect(sim.w.n).toBe(20);
    for (let i = 0; i < 20; i++) expect(Math.hypot(sim.w.x[i] - 102, sim.w.z[i] - 98)).toBeLessThan(15);
  });
  it('모르는 역이면 아무도 나오지 않는다', () => {
    const sim = makeWalkers(buildWalkGraph(lanes()), exits, fixedProvider(1), 1, 200);
    sim.burst('없는역', 5);
    expect(sim.w.n).toBe(0);
  });
  it('60초 뒤에도 모두 길 위를 걷고 있다', () => {
    const sim = makeWalkers(buildWalkGraph(lanes()), exits, fixedProvider(1), 2, 200);
    sim.burst('합정', 30);
    const x0 = Array.from(sim.w.x.subarray(0, 30));
    for (let i = 0; i < 600; i++) sim.step(0.1, at(21, 5), false);
    let moved = 0;
    for (let i = 0; i < sim.w.n; i++) {
      expect(offGrid(sim.w.x[i], sim.w.z[i])).toBeLessThan(4.5);
      if (i < 30 && Math.abs(sim.w.x[i] - x0[i]) > 5) moved++;
    }
    expect(moved).toBeGreaterThan(10);
  });
  it('걸음 위상이 걸은 만큼 늘어난다', () => {
    const sim = makeWalkers(buildWalkGraph(lanes()), exits, fixedProvider(1), 2, 200);
    sim.burst('합정', 1);
    const p0 = sim.w.phase[0];
    for (let i = 0; i < 50; i++) sim.step(0.1, at(21, 5), false);
    expect(sim.w.phase[0]).toBeGreaterThan(p0 + 3);
  });
  it('목표 인원: 금요일 21시가 화요일 4시보다 훨씬 많다', () => {
    const p = makeSimProvider();
    expect(walkerTarget(p, at(21, 5), 1500)).toBeGreaterThan(walkerTarget(p, at(4, 2), 1500) * 5);
  });
  it('최대 인원을 넘지 않는다', () => {
    const sim = makeWalkers(buildWalkGraph(lanes()), exits, fixedProvider(1, 500000), 3, 50);
    sim.burst('합정', 80);
    for (let i = 0; i < 300; i++) sim.step(0.1, at(21, 5), true);
    expect(sim.w.n).toBeLessThanOrEqual(50);
    expect(sim.w.n).toBeGreaterThan(30);
  });
});

describe('멈춰 서서 구경하기', () => {
  it('붙잡힌 사람은 멈춰 서서 대상을 보며 휴대폰을 들고, 시간이 지나면 다시 걷는다', () => {
    const g = buildWalkGraph([road([[0, 0], [400, 0]], { cls: 4, lanes: 1 })]);
    const sim = makeWalkers(g, [{ st: 'x', x: 100, z: 0 }], fixedProvider(1, 0), 3, 10);
    sim.burst('x', 1);
    for (let k = 0; k < 20; k++) sim.step(0.1, at(14), false);
    const w = sim.w;
    const id = w.id[0];
    sim.hold(id, 5, w.x[0], w.z[0] + 2);
    sim.step(0.1, at(14), false);
    const x0 = w.x[0];
    for (let k = 0; k < 30; k++) sim.step(0.1, at(14), false);
    expect(Math.abs(w.x[0] - x0)).toBeLessThan(0.05);
    expect(Math.abs(w.yaw[0] - Math.PI / 2)).toBeLessThan(0.2);
    expect(w.photo[0]).toBeGreaterThan(0.5);
    for (let k = 0; k < 60; k++) sim.step(0.1, at(14), false);
    expect(Math.abs(w.x[0] - x0)).toBeGreaterThan(1);
    expect(w.photo[0]).toBeLessThan(0.5);
  });
});
