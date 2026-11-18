import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { decodeLanes, type RoadJson } from '../src/data/road.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { busStopPortals, makeBusRoutes } from '../src/sim/buses.ts';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeIntersections } from '../src/sim/intersection/index.ts';
import { makePeople, underpasses, ZONES, type Portal } from '../src/sim/people/index.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { decodeWalk, type WalkJson } from '../src/sim/walknet.ts';

// 재작업 W46: 판 한 자리만 바꿔도 먼 사람은 그대로여야 한다(국소성).
// 고치기 전에는 사람 쪽 고르기(옷·빠르기·수명·처음 방향, 어느 문에서 낼지, 넘칠 때 누구를 집으로 보낼지, 열차 출구)가 공유 난수 하나를 차례로 썼고,
// 고유 번호가 나온 차례(1, 2, 3…)였고, 빠진 자리를 끝 사람으로 채워 계산 차례가 바뀌었다. 그래서 한 곳에서 사람 하나가 달리 움직이면
// 판 전체 사람이 다른 표본이 됐다(W45: 합정 남쪽 철도 둘레 걷는 선 300m 를 잘라 내자 1km 넘게 떨어진 걷고싶은거리 맴돌기가 씨앗 여섯 평균 153 → 198).
// 같은 씨앗 두 판(w31 차림과 같게 차 700대·사람 3,000명·문에서 나오고 들어가기·2분 미리 돌리기)에서 한쪽만 두 사람을 20초 세운다(고양이를 찍는 사람, hold):
// 보는 곳(걷고싶은거리) 가운데 한 사람과, 1km 떨어진 합정역 둘레(보는 곳 밖) 한 사람. 세운 사람에게서 300m 넘게 떨어진 사람은 1/30초 걸음마다
// 두 판에서 같은 사람이 같은 자리에 있어야 한다. 차도 함께 돈다(차는 사람을 보고 서고 사람은 차를 비킨다).
// 사람 수를 맞추는 규칙(구역마다 보는 곳 안·밖 목표 인원)은 구역 전체에 걸친다: 보는 곳 안 사람이 한 명 일찍 들어가면 보는 곳 안 다른 문에서 한 명이 일찍 나온다.
// 보는 곳 반지름(200m, 넓혀도 283m)이 300m 보다 작아 세운 사람이 보는 곳 가운데에 있으면 이 몫은 300m 안에 머문다. 보는 곳 가장자리(홍대입구역 둘레)에서 세우면
// 보는 곳 반대쪽 문에서 나오는 차례가 바뀌어 300m 밖 사람이 달라진다(W46 기록: 60초 끝에 88명). 그것은 난수가 아니라 인원 규칙이 이은 몫이다
const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(read('board.json'));
const marks = decodeMarks(read('marks.json') as MarksJson);
const lanes = decodeLanes((read('road.json') as RoadJson).lanes);
const W = decodeWalk(read('walk.json') as WalkJson);
const DT = 1 / 30;
const SECS = 60;
const FAR = 300;
const [FX, FZ] = [330, -350];

function sim(seed: number) {
  const provider = makeSimProvider();
  const start = { tod: 21 * 3600, dow: 6, doy: 320 };
  const carGraph = buildCarGraph(board.roads, lanes, marks.arrows);
  const inter = makeIntersections(carGraph, { crosswalks: board.crosswalks, stopLines: board.stopLines });
  const busy = new Uint32Array(board.crosswalks.length);
  const cars = makeCars(carGraph, provider, seed, 700, makeBusRoutes(board.buses, carGraph, undefined, board.crosswalks), inter, { list: board.crosswalks, busy });
  cars.setFocus(FX, FZ, 400, () => false);
  cars.fill(cars.target(start));
  cars.fillBuses(start);
  const stops = busStopPortals(cars.routes, carGraph);
  const portals: Portal[] = [
    ...board.exits.map((e) => ({ kind: 'exit' as const, key: e.st, x: e.x, z: e.z })),
    ...stops.portals,
    ...underpasses(board.roads, ...ZONES.mangwon).map(([x, z]) => ({ kind: 'exit' as const, key: '망원나들목', x, z })),
  ];
  const walkLeft = (xw: number, tod: number) => (inter.S.crossSite[xw] < 0 ? -1 : inter.S.walkLeft(xw, tod));
  const p = makePeople(W, portals, provider, seed, 3000, { buildings: board.buildings, walkLeft, busy, traffic: (xw) => cars.approaching(xw), cars: cars.cars });
  cars.setPeople(p.w);
  p.setFocus(FX, FZ, 200);
  p.warm(120, start);
  const step = (f: number) => {
    const now = { ...start, tod: start.tod + f * DT };
    cars.step(DT, now);
    for (const [r, k, i] of cars.dwells) {
      const key = stops.keyOf(r, k);
      const [dx, dz] = cars.door(i);
      p.board(key, dx, dz);
      p.alight(key, Math.floor((f * 7 + i) % 4), dx, dz);
    }
    p.step(DT, now);
  };
  return { p, cars, step };
}

describe('W46 한 자리를 바꿔도 먼 사람은 그대로다', () => {
  const res = { far: 0, near: 0, nearDiff: 0, bad: [] as string[], badN: 0, frames: 0 };
  beforeAll(() => {
    const A = sim(11);
    const B = sim(11);
    // B 에서만 두 자리에 가장 가까운 걷는 사람을 20초 세운다
    const held: [number, number][] = [];
    for (const [x0, z0] of [
      [FX, FZ],
      [-470, 240],
    ]) {
      let hi = -1;
      let hd = Infinity;
      for (let i = 0; i < B.p.w.n; i++) {
        const d = Math.hypot(B.p.w.x[i] - x0, B.p.w.z[i] - z0);
        if (B.p.stateOf(i).mode === B.p.MODES.WALK && d < hd) (hd = d), (hi = i);
      }
      held.push([B.p.w.x[hi], B.p.w.z[hi]]);
      B.p.hold(B.p.w.id[hi], 20, B.p.w.x[hi] + 5, B.p.w.z[hi]);
    }
    const near = (x: number, z: number) => held.some(([hx, hz]) => Math.hypot(x - hx, z - hz) <= FAR);
    const badIds = new Set<number>();
    for (let f = 0; f < SECS / DT; f++) {
      A.step(f);
      B.step(f);
      const at = new Map<number, number>();
      for (let j = 0; j < B.p.w.n; j++) at.set(B.p.w.id[j], j);
      for (let i = 0; i < A.p.w.n; i++) {
        const x = A.p.w.x[i];
        const z = A.p.w.z[i];
        const j = at.get(A.p.w.id[i]);
        const same = j !== undefined && B.p.w.x[j] === x && B.p.w.z[j] === z;
        if (near(x, z)) {
          res.near++;
          if (!same) res.nearDiff++;
          continue;
        }
        res.far++;
        if (!same) badIds.add(A.p.w.id[i]);
        if (!same && res.bad.length < 20) res.bad.push(`f${f} ${A.p.w.id[i]}@${x.toFixed(1)},${z.toFixed(1)} ${j === undefined ? '없음' : `${Math.hypot(B.p.w.x[j] - x, B.p.w.z[j] - z).toFixed(2)}m`}`);
      }
      res.frames++;
    }
    res.badN = badIds.size;
  }, 300_000);
  it('세운 사람 둘레(300m 안)는 실제로 달라진다', () => expect(res.nearDiff).toBeGreaterThan(0));
  it('300m 밖 사람은 걸음마다 두 판에서 같은 자리에 있다', () => {
    expect(res.far).toBeGreaterThan(100_000);
    expect(res.bad, `300m 밖에서 달라진 사람 ${res.badN}명`).toEqual([]);
  });
});
