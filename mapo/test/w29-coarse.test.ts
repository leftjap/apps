import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { decodeLanes } from '../src/data/road.ts';
import { makeBusRoutes } from '../src/sim/buses.ts';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeIntersections } from '../src/sim/intersection/index.ts';
import { makeSimProvider } from '../src/sim/provider.ts';

// 재작업 W29: 클럽거리 토 21시(배포본 dpr 1)에 프레임 JS 가운데 차가 17ms 로 fps(41~43)를 막았다. 판 전체 차 3,200대 가운데
// 보는 곳(반지름 250m) 안은 100대뿐이라, 보는 곳 둘레 밖이고 화면에도 없는 차는 몇 걸음에 한 번 밀린 시간만큼 움직인다(setDetail).
// 성기게 돌려도 화면 밖 차의 평균 속도·선 차 비율·구간 넘김이 매 걸음 돌린 것과 같고 몸통이 겹치지 않아야 한다.
const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(read('board.json'));
const marks = decodeMarks(read('marks.json') as MarksJson);
const lanes = decodeLanes(read('road.json').lanes);
const lamps = read('signals.json');
const [FX, FZ, FR] = [290, 40, 250];
const vis = (x: number, z: number) => Math.hypot(x - FX, z - FZ) < 350;

function run(coarse: boolean) {
  const g = buildCarGraph(board.roads, lanes, marks.arrows);
  const inter = makeIntersections(g, { crosswalks: board.crosswalks, stopLines: board.stopLines, lamps });
  const sim = makeCars(g, makeSimProvider(), 11, 5000, makeBusRoutes(board.buses, g, undefined, board.crosswalks), inter, { list: board.crosswalks, busy: new Uint32Array(board.crosswalks.length) });
  sim.setFocus(FX, FZ, FR, vis);
  if (coarse) sim.setDetail(vis);
  const start = { tod: 21 * 3600, dow: 6, doy: 320 };
  sim.fill(sim.target(start));
  sim.fillBuses(start);
  const c = sim.cars;
  const D = sim.debug();
  let now = { ...start };
  const DT = 1 / 42;
  let vs = 0;
  let vn = 0;
  let stopped = 0;
  let changes = 0;
  let overlap = 0;
  let samples = 0;
  const lastE = new Map<number, number>();
  for (let k = 0; k < 90 * 42; k++) {
    now = { ...now, tod: now.tod + DT };
    sim.step(DT, now);
    if (k % 42 || k < 20 * 42) continue;
    samples++;
    const grid = new Map<number, number[]>();
    for (let i = 0; i < c.n; i++) {
      const key = Math.floor(c.x[i] / 4) * 100000 + Math.floor(c.z[i] / 4);
      (grid.get(key) ?? grid.set(key, []).get(key)!).push(i);
    }
    for (let i = 0; i < c.n; i++) {
      const gx = Math.floor(c.x[i] / 4);
      const gz = Math.floor(c.z[i] / 4);
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (const j of grid.get((gx + a) * 100000 + gz + b) ?? []) if (j > i && Math.abs(c.y[i] - c.y[j]) < 1 && Math.hypot(c.x[i] - c.x[j], c.z[i] - c.z[j]) < 1.5) overlap++;
      if (Math.hypot(c.x[i] - FX, c.z[i] - FZ) < 400) continue;
      vs += D.v[i];
      vn++;
      if (D.v[i] < 0.3) stopped++;
      const u = c.uid[i];
      if (lastE.has(u) && lastE.get(u) !== D.edge[i]) changes++;
      lastE.set(u, D.edge[i]);
    }
  }
  return { v: vs / vn, stopped: stopped / vn, changes: changes / samples, overlap };
}

describe('화면 밖 차 성기게 돌리기(W29)', () => {
  it('성기게 돌려도 화면 밖 차 흐름이 같고 몸통이 겹치지 않는다', () => {
    const fine = run(false);
    const coarse = run(true);
    expect(coarse.overlap).toBe(0);
    expect(Math.abs(coarse.v / fine.v - 1)).toBeLessThan(0.1);
    expect(Math.abs(coarse.stopped - fine.stopped)).toBeLessThan(0.05);
    expect(Math.abs(coarse.changes / fine.changes - 1)).toBeLessThan(0.1);
  }, 300_000);
});
