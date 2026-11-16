import { describe, expect, it } from 'vitest';
import type { Crosswalk } from '../src/data/board.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeCars } from '../src/sim/cars.ts';
import { makeIntersections } from '../src/sim/intersection/index.ts';
import { laneStops } from '../src/sim/stops.ts';
import { at, fixedProvider, road } from './helpers.ts';

/** x0~x1 에 걸쳐 z −8~8 을 덮는 횡단보도 면(남북으로 건넌다) */
const xwalk = (x0: number, x1: number): Crosswalk => ({
  x: (x0 + x1) / 2,
  z: 0,
  ux: 0,
  uz: 1,
  half: 8,
  wid: x1 - x0,
  sig: false,
  sigUnknown: false,
  verts: new Float32Array(0),
  rings: [Float32Array.from([x0, -8, x1, -8, x1, 8, x0, 8])],
});

describe('차로마다 정지 자리', () => {
  // 동쪽으로 가는 양방향 4차로(한 방향 2차로) 100m 길이 x=100 에서 끝난다
  const g = buildCarGraph([road([[0, 0], [100, 0]], { lanes: 4 })]);
  const east = g.find((e) => e.p[3] > e.p[0])!;
  it('서울시 정지선이 차로 가운데선을 가로지르는 자리 0.3m 뒤에 앞 범퍼가 선다(차로마다)', () => {
    // 오른쪽 차로(z 4.95) 쪽은 x=88, 안쪽 차로(z 1.65) 쪽은 x=90 인 비스듬한 정지선
    const st = laneStops(g, Float32Array.from([90, 0, 86, 8]), []);
    expect(st.back(east.id, 0)).toBeCloseTo(100 - (90 - 1.65 / 2 - 0.3), 1);
    expect(st.back(east.id, 1)).toBeCloseTo(100 - (90 - 4.95 / 2 - 0.3), 1);
  });
  it('정지선이 없으면 구간 끝에 가장 가까운 횡단보도 면의 바깥 변 1m 앞이다', () => {
    const st = laneStops(g, new Float32Array(0), [xwalk(60, 64), xwalk(92, 96)]);
    expect(st.back(east.id, 0)).toBeCloseTo(100 - 91, 0);
    expect(Array.from(st.xw(east.id, 1)).map((v) => Math.round(v))).toEqual([60, 64, 92, 96]);
  });
  it('횡단보도가 앞 구간 끝에서 시작해 이 구간까지 걸치면 정지 자리는 앞 구간의 횡단보도 앞이다', () => {
    const g2 = buildCarGraph([road([[0, 0], [100, 0]], { lanes: 2, oneway: true }), road([[100, 0], [130, 0]], { lanes: 2, oneway: true })]);
    const st = laneStops(g2, new Float32Array(0), [xwalk(97, 103)]);
    expect(st.back(g2[1].id, 0)).toBeCloseTo(30 + 100 - 96, 0);
  });
});

describe('횡단보도 비워 두기', () => {
  it('앞이 막혀 서는 차는 횡단보도 면 위에 서지 않는다', () => {
    const g = buildCarGraph([road([[0, 0], [400, 0]], { oneway: true, lanes: 1 })]);
    const list = [xwalk(200, 205)];
    const signals = makeIntersections(g, { crosswalks: list, stopLines: new Float32Array(0) });
    const sim = makeCars(g, fixedProvider(1), 3, 40, [], signals, { list, busy: new Uint32Array(1) });
    // 횡단보도 너머 8m 에서 차들이 거의 멈춘다
    sim.setIncidents({ blocks: [], close: [], slow: [{ edge: g[0].id, at: 238, v: 0.05 }] });
    let onIt = 0;
    for (let k = 0; k < 10 * 150; k++) {
      if (k % 40 === 0 && k < 10 * 60) sim.put(g[0].id, 5, 0);
      sim.step(0.1, at(14), false);
      const d = sim.debug();
      for (let i = 0; i < sim.cars.n; i++) if (d.v[i] < 0.3 && sim.cars.x[i] > 200 && sim.cars.x[i] < 205) onIt++;
    }
    expect(sim.cars.n).toBeGreaterThan(8);
    expect(onIt).toBe(0);
  });
});

describe('사람이 건너는 횡단보도 앞에 서기', () => {
  it('교차로를 지나 나갈 구간 첫머리의 횡단보도(꼭짓점과 맞지 않는 면)에 사람이 있으면 그 앞에 선다', () => {
    // 동쪽으로 가는 길이 x=100 에서 끝나고 다음 조각이 이어진다. 횡단보도 면은 다음 조각 4~8m(꼭짓점 없이 면만 있다)
    const g = buildCarGraph([road([[0, 0], [100, 0]], { oneway: true, lanes: 1 }), road([[100, 0], [300, 0]], { oneway: true, lanes: 1 })]);
    const list = [xwalk(104, 108)];
    const busy = new Uint32Array(1);
    const sim = makeCars(g, fixedProvider(1), 2, 5, [], undefined, { list, busy });
    sim.put(g[0].id, 30, 0);
    busy[0] = 1 << 4; // 축 8~10m 칸에 사람
    for (let k = 0; k < 10 * 30; k++) sim.step(0.1, at(14), false);
    const D = sim.debug();
    const front = sim.cars.x[0] + D.size[0] / 2;
    expect(front).toBeLessThan(104);
    expect(front).toBeGreaterThan(100);
  });
});
