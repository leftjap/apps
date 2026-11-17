import { describe, expect, it } from 'vitest';
import type { DirLanes, RoadLanes } from '../src/data/road.ts';
import { buildCarGraph, laneOff, lanePos } from '../src/sim/graph.ts';
import { buildIntersections } from '../src/sim/intersection/index.ts';
import { makeCars } from '../src/sim/cars.ts';
import { at, fixedProvider, road } from './helpers.ts';

/** 차로 수 구간 하나: s0~s1, 단면마다 [s, 차로 가운데 옆 거리...] */
const run = (s0: number, s1: number, rows: number[][]) => ({ s0, s1, n: rows[0].length - 1, st: rows.map((r) => r[0]), off: rows.flatMap((r) => r.slice(1)), med: [] });

describe('서울시 선으로 읽은 차로로 차 그래프 만들기', () => {
  // 동쪽으로 가는 한 방향 200m 길. 0~100m 는 2차로, 100m 부터 왼쪽에 차로가 하나 생겨 3차로다(좌회전 차로처럼)
  const dir: DirLanes = {
    a: 5,
    b: 190,
    runs: [run(0, 100, [[1, -1.6, 1.6], [99, -1.6, 2.0]]), run(100, 200, [[101, -4.8, -1.6, 1.6], [199, -4.8, -1.6, 1.6]])],
  };
  const lanes: RoadLanes = [[dir, null], null, null];
  const roads = [road([[0, 0], [200, 0]], { oneway: true, lanes: 2 }), road([[-100, 0], [0, 0]], { oneway: true, lanes: 2 }), road([[200, 0], [300, 0]], { oneway: true, lanes: 3 })];
  const g = buildCarGraph(roads, lanes);
  const [a, b] = g.filter((e) => e.road === 0);
  it('차로 수가 바뀌는 자리에서 구간이 나뉘고, 구간마다 그 차로 수와 차로 가운데 옆 거리를 쓴다', () => {
    expect(g.filter((e) => e.road === 0).map((e) => [e.lanes, Math.round(e.len)])).toEqual([[2, 100], [3, 100]]);
    expect(a.next).toEqual([b.id]);
    expect(laneOff(a, 1, 50)).toBeCloseTo(1.8, 2); // 1m 의 1.6 과 99m 의 2.0 사이
    expect(laneOff(b, 0, 50)).toBeCloseTo(-4.8, 2);
    expect(a.plain).toBe(false);
  });
  it('선이 없는 조각이 갈림 없는 이음매로 선을 읽은 구간과 이어지면 그 끝의 차로 자리를 이어받는다(이음매에서 차로가 엇갈리지 않게)', () => {
    const p = g.find((e) => e.road === 1)!;
    expect(laneOff(p, 0, 50)).toBeCloseTo(-1.6, 2);
    expect(laneOff(p, 1, p.len)).toBeCloseTo(1.6, 2);
    expect(Array.from(p.lmap[0])).toEqual([0, 1, 1, 2]);
  });
  it('양방향 길에서 한 방향만 선을 읽었으면 선이 없는 방향은 읽은 방향의 왼쪽 가장자리(실제 가운데선) 너머에 놓는다', () => {
    // 동쪽 방향 차로 가운데 0.6·3.8m(왼쪽 가장자리 −1.0m, OSM 가운데선이 실제 중앙선보다 1m 오른쪽), 서쪽 방향은 선이 없다
    const two: RoadLanes = [[{ a: -1, b: -1, runs: [run(0, 100, [[0, 0.6, 3.8], [100, 0.6, 3.8]])] }, null]];
    const g3 = buildCarGraph([road([[0, 0], [100, 0]], { lanes: 4 })], two);
    const back = g3.find((e) => e.rev)!;
    expect(laneOff(back, 0, 50)).toBeCloseTo(1.0 + 3.3 / 2, 2);
    expect(laneOff(back, 1, 50)).toBeCloseTo(1.0 + 3.3 * 1.5, 2);
  });
  it('차로가 생기는 이음매에서는 옆 거리가 가까운 차로끼리 잇는다: 왼쪽 차로는 새 차로와 제자리 차로로 나뉘고 오른쪽 차로는 제자리로 간다', () => {
    expect(Array.from(a.lmap[0])).toEqual([0, 2, 2, 3]);
    expect(lanePos(a, b, 1.5)).toBeCloseTo(2.5, 5);
    expect(lanePos(a, b, 0.25)).toBeCloseTo(0.5, 5);
  });
  it('차는 그려진 차로 가운데를 달린다', () => {
    const sim = makeCars(g, fixedProvider(1), 1, 10);
    sim.put(a.id, 40, 1);
    sim.step(0.1, at(14), false);
    expect(sim.cars.z[0]).toBeCloseTo(laneOff(a, 1, sim.debug().s[0]), 1);
  });
  it('교차로 상자는 서울시 차선이 끝나는 자리와 시작하는 자리에서 시작한다', () => {
    // 동쪽 끝 노드에 갈림길을 붙여 교차로로 만든다
    const g2 = buildCarGraph([...roads, road([[200, 0], [200, 100]], { oneway: true, lanes: 1 })], lanes);
    const jn = buildIntersections(g2);
    const end = g2.find((e) => e.road === 0 && e.lanes === 3)!;
    expect(jn.rIn[end.id]).toBeCloseTo(10, 1); // 차로 끝(방향 s 190)에서 조각 끝(200)까지
  });
  it('양방향 길의 두 방향 구간은 나뉜 자리가 겹쳐도 서로 되돌아가는 쪽으로 잇지 않는다', () => {
    const two: RoadLanes = [[{ a: -1, b: -1, runs: [run(0, 50, [[0, 1.6]]), run(50, 100, [[50, 1.6, 4.8]])] }, { a: -1, b: -1, runs: [run(0, 50, [[0, 1.6, 4.8]]), run(50, 100, [[50, 1.6]])] }]];
    const g3 = buildCarGraph([road([[0, 0], [100, 0]], { lanes: 2 })], two);
    for (const e of g3) for (const k of e.next) expect(g3[k].rev).toBe(e.rev);
  });
});

describe('노면 화살표로 교차로 차로 배정', () => {
  // 동쪽으로 가는 한 방향 3차로가 x=100 교차로에서 북(왼쪽, −z)·동(직진)·남(오른쪽)으로 갈린다. 0번 차로에 좌회전, 1·2번 차로에 직진 화살표
  const dir: DirLanes = { a: 1, b: 92, runs: [run(0, 100, [[1, -3.2, 0, 3.2], [99, -3.2, 0, 3.2]])] };
  const roads = [
    road([[0, 0], [100, 0]], { oneway: true, lanes: 3 }),
    road([[100, 0], [100, -100]], { oneway: true, lanes: 2 }),
    road([[100, 0], [200, 0]], { oneway: true, lanes: 3 }),
    road([[100, 0], [100, 100]], { oneway: true, lanes: 2 }),
  ];
  const arrows = [
    { kind: 5, x: 80, z: -3.2, fx: 1, fz: 0 },
    { kind: 7, x: 80, z: 0, fx: 1, fz: 0 },
    { kind: 7, x: 80, z: 3.2, fx: 1, fz: 0 },
  ];
  const g = buildCarGraph(roads, [[dir, null], null, null, null], arrows);
  const a = g.find((e) => e.road === 0)!;
  const north = g.find((e) => e.road === 1)!;
  const east = g.find((e) => e.road === 2)!;
  it('차로마다 그 차로에 놓인 화살표를 읽는다', () => {
    expect(Array.from(a.turns)).toEqual([1, 2, 2]);
  });
  it('좌회전 차로 경로는 0번 차로에서 나갈 길 안쪽(0번) 차로로, 직진은 1·2번 차로가 나갈 길 차로에 비율대로 나란히 잇는다', () => {
    const X = buildIntersections(g);
    const ex = X.exits.get(a.id)!;
    const k = (o: number) => ex.findIndex((x) => x.edges[x.edges.length - 1] === o);
    expect(X.path(a.id, 0, k(north.id))!.lanes.at(-1)).toBe(0);
    expect(X.path(a.id, 1, k(north.id))).toBeUndefined();
    expect(X.path(a.id, 1, k(east.id))!.lanes.at(-1)).toBe(0);
    expect(X.path(a.id, 2, k(east.id))!.lanes.at(-1)).toBe(2);
    expect(X.path(a.id, 0, k(east.id))).toBeUndefined();
  });
  it('좌회전 차로의 차는 왼쪽으로만, 직진 차로의 차는 오른쪽으로 꺾지 않는다', () => {
    const sim = makeCars(g, fixedProvider(1), 5, 30);
    const seen = new Set<string>();
    for (let k = 0; k < 10 * 120; k++) {
      if (k % 25 === 0 && k < 10 * 60) sim.put(a.id, 5, Math.floor(k / 25) % 3);
      sim.step(0.1, at(14), false);
      const d = sim.debug();
      for (let i = 0; i < sim.cars.n; i++) if (d.edge[i] === a.id && d.nextE[i] >= 0) seen.add(`${d.lane[i]}>${g[d.nextE[i]].road}`);
    }
    expect([...seen].filter((s) => s.startsWith('0>')).sort()).toEqual(['0>1']);
    expect([...seen].filter((s) => !s.startsWith('0>') && s.endsWith('>3'))).toEqual([]);
  });
});

describe('유턴', () => {
  // 동쪽으로 가는 한 방향 길이 x=100 노드에서 동쪽(직진)과, 북쪽 8m 짧은 연결 조각을 지나 서쪽으로 되돌아가는 한 방향 길(유턴)로 갈린다
  const roads = [
    road([[0, 0], [100, 0]], { oneway: true, lanes: 2 }),
    road([[100, 0], [400, 0]], { oneway: true, lanes: 2 }),
    road([[100, 0], [100, -8]], { oneway: true, lanes: 2 }),
    road([[100, -8], [-200, -8]], { oneway: true, lanes: 2 }),
  ];
  const dir: DirLanes = { a: 1, b: 92, runs: [run(0, 100, [[1, -1.6, 1.6], [99, -1.6, 1.6]])] };
  const count = (arrows: { kind: number; x: number; z: number; fx: number; fz: number }[]) => {
    const g = buildCarGraph(roads, [[dir, null], null, null, null], arrows);
    const a = g.find((e) => e.road === 0)!;
    const back = g.find((e) => e.road === 2)!;
    const sim = makeCars(g, fixedProvider(1), 3, 40);
    let u = 0;
    let all = 0;
    for (let k = 0; k < 10 * 200; k++) {
      if (k % 20 === 0) sim.put(a.id, 5, (k / 20) % 2);
      sim.step(0.1, at(14), false);
      const d = sim.debug();
      for (let i = 0; i < sim.cars.n; i++) if (d.edge[i] === a.id && d.s[i] > 90 && d.nextE[i] >= 0) (all++, d.nextE[i] === back.id && u++);
    }
    return [u, all];
  };
  it('유턴 표시가 없는 교차로에서는 되돌아가지 않는다', () => {
    const [u, all] = count([]);
    expect(all).toBeGreaterThan(100);
    expect(u).toBe(0);
  });
  it('안쪽 차로에 유턴 화살표가 있으면 그 차로의 차만 되돌아갈 수 있다', () => {
    const [u] = count([{ kind: 10, x: 80, z: -1.6, fx: 1, fz: 0 }]);
    expect(u).toBeGreaterThan(0);
  });
});
