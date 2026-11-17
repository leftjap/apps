import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { busStopPortals, makeBusRoutes } from '../src/sim/buses.ts';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph } from '../src/sim/graph.ts';
import { makeIntersections } from '../src/sim/intersection/index.ts';
import { makePeople, underpasses, ZONES, type Portal } from '../src/sim/people/index.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { decodeWalk, type WalkJson } from '../src/sim/walknet.ts';

// 재작업 W24: 첫 화면 전 사람 미리 돌리기(warm 300초)가 배포본에서 15.7초를 써 첫 화면이 17초 넘게 늦었다.
// 앱(main.ts)과 같은 차림(사람 상한 8000, 역 출구·정류장·나들목·피크닉 자리)으로 미리 돌려, 걸린 시간과 미리 돌린 뒤 보는 곳 인원·분포를 잰다.
// 옛 값(W24 전, 토 21시, node): 판 전체 보기 17.0초·8000명(보는 곳 안 8000), 홍대 보기(반지름 1380m) 안 6994명,
// 문·출구·정류장 3m 안 11.0%·10.4%, 가장 가까운 문까지 가운데 거리 9.5m. 큰 걸음은 문 둘레를 조금 늘린다(3m 안 +2%p 남짓)
const ALL_IN = 8000;
const HONG_IN = 6994;
const LT3 = [0.11, 0.104];
const MID = 9.5;
const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const has = (f: string) => existsSync(new URL(f, import.meta.url));
const board = decodeBoard(read('board.json'));
const W = decodeWalk(read('walk.json') as WalkJson);
const marks = decodeMarks(read('marks.json') as MarksJson);
const start = { tod: 21 * 3600, dow: 6, doy: 320 };

/** 차로 자료: 길 정본(road.json, W23)이 있으면 그것을, 없으면 옛 lanes.json */
async function roadLanes() {
  const mod = has('../public/data/road.json') ? '../src/data/road.ts' : '../src/data/lanes.ts';
  const { decodeLanes } = await import(/* @vite-ignore */ mod);
  return has('../public/data/road.json') ? decodeLanes(read('road.json').lanes) : decodeLanes(read('lanes.json'));
}

async function warmed(fx: number, fz: number, fr: number) {
  const provider = makeSimProvider();
  const carGraph = buildCarGraph(board.roads, await roadLanes(), marks.arrows);
  const inter = makeIntersections(carGraph, { crosswalks: board.crosswalks, stopLines: board.stopLines });
  const busy = new Uint32Array(board.crosswalks.length);
  const cars = makeCars(carGraph, provider, 11, 3000, makeBusRoutes(board.buses, carGraph, undefined, board.crosswalks), inter, { list: board.crosswalks, busy });
  cars.setFocus(fx, fz, Math.max(250, fr), () => false);
  cars.fill(cars.target(start));
  cars.fillBuses(start);
  const stops = busStopPortals(cars.routes, carGraph);
  const portals: Portal[] = [
    ...board.exits.map((e) => ({ kind: 'exit' as const, key: e.st, x: e.x, z: e.z })),
    ...stops.portals,
    ...underpasses(board.roads, ...ZONES.mangwon).map(([x, z]) => ({ kind: 'exit' as const, key: '망원나들목', x, z })),
    ...Array.from({ length: board.picnic.length / 2 }, (_, i) => ({ kind: 'exit' as const, key: '망원한강공원', x: board.picnic[i * 2], z: board.picnic[i * 2 + 1] })),
  ];
  const walkLeft = (xw: number, tod: number) => (inter.S.crossSite[xw] < 0 ? -1 : inter.S.walkLeft(xw, tod));
  const p = makePeople(W, portals, provider, 5, 8000, { buildings: board.buildings, walkLeft, busy, traffic: (xw) => cars.approaching(xw), cars: cars.cars });
  cars.setPeople(p.w);
  p.setFocus(fx, fz, fr);
  const t0 = performance.now();
  p.warm(300, start);
  const ms = performance.now() - t0;
  // 보는 곳 안 인원, 가장 가까운 문·출구·정류장 자리까지 거리
  const G = 8;
  const grid = new Map<string, [number, number][]>();
  p.docks.forEach((d, k) => {
    const s = (d.kind === 'door' ? (d as unknown as { door: [number, number] }).door : p.dockPos(k)) as [number, number];
    const key = `${Math.floor(s[0] / G)},${Math.floor(s[1] / G)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(s);
  });
  const near = (x: number, z: number) => {
    let b = 99;
    const cx = Math.floor(x / G);
    const cz = Math.floor(z / G);
    for (let a = -4; a <= 4; a++) for (let c = -4; c <= 4; c++) for (const s of grid.get(`${cx + a},${cz + c}`) ?? []) b = Math.min(b, Math.hypot(s[0] - x, s[1] - z));
    return b;
  };
  let inF = 0;
  const ds: number[] = [];
  for (let i = 0; i < p.w.n; i++) {
    if (Math.hypot(p.w.x[i] - fx, p.w.z[i] - fz) < fr) inF++;
    ds.push(near(p.w.x[i], p.w.z[i]));
  }
  ds.sort((a, b) => a - b);
  return { ms, n: p.w.n, inF, lt3: ds.filter((d) => d < 3).length / ds.length, mid: ds[ds.length >> 1] };
}

describe('사람 미리 돌리기(W24)', () => {
  let all: Awaited<ReturnType<typeof warmed>>;
  let hong: Awaited<ReturnType<typeof warmed>>;
  beforeAll(async () => {
    all = await warmed(0, 120, 2200);
    hong = await warmed(470, -640, 1380);
  }, 180_000);
  // 혼자 돌면 2초 남짓, 다른 시험·측정과 함께 돌면 4초를 넘기도 한다. 옛 값 17초와 가려지는 상한을 둔다
  it('판 전체 보기 미리 돌리기 6초 안(옛 17초)', () => expect(all.ms).toBeLessThan(6000));
  it('보는 곳 안 인원은 옛 값의 90% 이상', () => {
    expect(all.inF).toBeGreaterThanOrEqual(0.9 * ALL_IN);
    expect(hong.inF).toBeGreaterThanOrEqual(0.9 * HONG_IN);
  });
  it('문·출구·정류장 둘레에 몰리지 않는다(3m 안 비율·가운데 거리)', () => {
    [all, hong].forEach((r, k) => {
      expect(r.lt3).toBeLessThan(LT3[k] + 0.04);
      expect(r.mid).toBeGreaterThan(MID * 0.8);
    });
  });
});
