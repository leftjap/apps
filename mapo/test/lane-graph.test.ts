import { describe, expect, it } from 'vitest';
import type { DirLanes, RoadLanes } from '../src/data/lanes.ts';
import { buildCarGraph, laneOff, lanePos } from '../src/sim/graph.ts';
import { makeJunctions } from '../src/sim/junctions.ts';
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
    expect(g.find((e) => e.road === 1)!.plain).toBe(true);
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
    const jn = makeJunctions(g2);
    const end = g2.find((e) => e.road === 0 && e.lanes === 3)!;
    expect(jn.rIn[end.id]).toBeCloseTo(10, 1); // 차로 끝(방향 s 190)에서 조각 끝(200)까지
  });
  it('양방향 길의 두 방향 구간은 나뉜 자리가 겹쳐도 서로 되돌아가는 쪽으로 잇지 않는다', () => {
    const two: RoadLanes = [[{ a: -1, b: -1, runs: [run(0, 50, [[0, 1.6]]), run(50, 100, [[50, 1.6, 4.8]])] }, { a: -1, b: -1, runs: [run(0, 50, [[0, 1.6, 4.8]]), run(50, 100, [[50, 1.6]])] }]];
    const g3 = buildCarGraph([road([[0, 0], [100, 0]], { lanes: 2 })], two);
    for (const e of g3) for (const k of e.next) expect(g3[k].rev).toBe(e.rev);
  });
});
