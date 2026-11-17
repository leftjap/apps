import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { decodeLanes, type RoadJson } from '../src/data/road.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { decodeSurface, type SurfaceJson } from '../src/data/surface.ts';
import { BODY_HW, BODY_LEN, bodyType } from '../src/sim/bodies.ts';
import { busStopPortals, makeBusRoutes } from '../src/sim/buses.ts';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph, ISLAND_BACK, ISLAND_L, ISLAND_W } from '../src/sim/graph.ts';
import { makeIntersections } from '../src/sim/intersection/index.ts';
import { BODY_R, makePeople, PASS_D, underpasses, ZONES, type Portal } from '../src/sim/people/index.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { decodeWalk, type WalkJson } from '../src/sim/walknet.ts';
import { bitsAt, fillBits } from '../tools/lib/bits.ts';
import { majorGround } from '../tools/lib/walkfix.ts';

// 재작업 W21: 사람 규칙을 실제 판(public/data)·실제 차·신호로 돌려 잰다(토 21시, 클럽거리·홍대입구역 둘레를 보는 곳으로).
// 모두 0 이어야 한다: 출구·정류장·문 밖에서 생기거나 사라짐, 사람끼리 몸통 겹침(가운데 사이 PASS_D 0.6m 안. 막혀 비집고 지날 때 머리(0.8m)는 스칠 수 있다), 사람과 차 몸통 겹침, 찻길 면 안(횡단보도 통로·중앙 승강장 밖) 자리,
// 한 프레임 1m 넘는 이동, 10m 안에서 30초 넘게 오가기
const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(read('board.json'));
const surface = decodeSurface(read('surface.json') as SurfaceJson);
const P = read('surface-polys.json') as { car: number[][]; med: number[][] };
const dm = (a: number[]) => a.map((v) => v / 10);

const FOCUS = [330, -300, 260] as const;
const SECS = 60;
const DT = 1 / 30;
const R = {
  born: [] as string[],
  gone: [] as string[],
  overlap: 0,
  pairs: [] as string[],
  car: [] as string[],
  carN: 0,
  paceN: 0,
  road: [] as string[],
  jump: [] as string[],
  pace: [] as string[],
  frames: 0,
  people: 0,
  crossed: 0,
};

beforeAll(() => {
  const win = [FOCUS[0] - 700, FOCUS[1] - 700, FOCUS[0] + 700, FOCUS[1] + 700] as [number, number, number, number];
  const G = majorGround(board.roads, surface.faces, surface.draw.map((f) => f.outer), P.car.map((c) => [c[0], dm(c.slice(1))] as [number, number[]]), P.med.map(dm), win);
  for (const [tx, tz] of underpasses(board.roads, ...ZONES.mangwon)) fillBits(G, [Array.from({ length: 48 }, (_, k) => (k % 2 ? tz + Math.sin((Math.floor(k / 2) * Math.PI) / 12) * 20 : tx + Math.cos((Math.floor(k / 2) * Math.PI) / 12) * 20))], 1, true);
  const W = decodeWalk(read('walk.json') as WalkJson);
  const marks = decodeMarks(read('marks.json') as MarksJson);
  const provider = makeSimProvider();
  const start = { tod: 21 * 3600, dow: 6, doy: 320 };
  const carGraph = buildCarGraph(board.roads, decodeLanes((read('road.json') as RoadJson).lanes), marks.arrows);
  const inter = makeIntersections(carGraph, { crosswalks: board.crosswalks, stopLines: board.stopLines });
  const busy = new Uint32Array(board.crosswalks.length);
  const cars = makeCars(carGraph, provider, 11, 700, makeBusRoutes(board.buses, carGraph, undefined, board.crosswalks), inter, { list: board.crosswalks, busy });
  cars.setFocus(FOCUS[0], FOCUS[1], 400, () => false);
  cars.fill(cars.target(start));
  cars.fillBuses(start);
  const stops = busStopPortals(cars.routes, carGraph);
  const portals: Portal[] = [
    ...board.exits.map((e) => ({ kind: 'exit' as const, key: e.st, x: e.x, z: e.z })),
    ...stops.portals,
    ...underpasses(board.roads, ...ZONES.mangwon).map(([x, z]) => ({ kind: 'exit' as const, key: '망원나들목', x, z })),
  ];
  const walkLeft = (xw: number, tod: number) => (inter.S.crossSite[xw] < 0 ? -1 : inter.S.walkLeft(xw, tod));
  const p = makePeople(W, portals, provider, 5, 3000, { buildings: board.buildings, walkLeft, busy, traffic: (xw) => cars.approaching(xw), cars: cars.cars });
  cars.setPeople(p.w);
  p.setFocus(FOCUS[0], FOCUS[1], 200);
  p.warm(120, start);
  // 생기고 사라져도 되는 자리: 건물 문턱, 출구·피크닉 자리, 정류장 자리(버스 문 앞 6m 안)
  const spots: [number, number, number][] = [];
  p.docks.forEach((d, k) => {
    const [x, z] = d.kind === 'door' ? (d as unknown as { door: [number, number] }).door : p.dockPos(k);
    spots.push([x, z, d.kind === 'stop' ? 6.5 : 1]);
  });
  const nearSpot = (x: number, z: number) => {
    let b = '';
    let bd = Infinity;
    p.docks.forEach((d, k) => {
      const [sx, sz] = d.kind === 'door' ? (d as unknown as { door: [number, number] }).door : p.dockPos(k);
      const dd = Math.hypot(sx - x, sz - z);
      if (dd < bd) (bd = dd), (b = `${d.kind} ${dd.toFixed(1)}m`);
    });
    return b;
  };
  const atSpot = (x: number, z: number) => spots.some(([sx, sz, r]) => Math.abs(sx - x) <= r && Math.abs(sz - z) <= r && Math.hypot(sx - x, sz - z) <= r);
  // 중앙버스정류장 승강장
  const isl = stops.portals.filter((s) => s.median).map((s) => ({ cx: s.x - Math.cos(s.yaw!) * ISLAND_BACK, cz: s.z - Math.sin(s.yaw!) * ISLAND_BACK, yaw: s.yaw! }));
  const onIsland = (x: number, z: number) => isl.some((s) => Math.abs((x - s.cx) * Math.cos(s.yaw) + (z - s.cz) * Math.sin(s.yaw)) < ISLAND_L / 2 && Math.abs(-(x - s.cx) * Math.sin(s.yaw) + (z - s.cz) * Math.cos(s.yaw)) < ISLAND_W / 2);
  // 횡단보도 통로(건너기 길에서 통로 반폭 + 몸 반지름 안)
  const segD = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(ax + dx * t - x, az + dz * t - z);
  };
  const inCrossing = (x: number, z: number) =>
    p.crosses.some((c) => {
      if (Math.abs(c.pts[0] - x) > 60 || Math.abs(c.pts[1] - z) > 60) return false;
      for (let k = 2; k < c.pts.length; k += 2) if (segD(x, z, c.pts[k - 2], c.pts[k - 1], c.pts[k], c.pts[k + 1]) <= c.hw + 0.05) return true;
      return false;
    });
  const last = new Map<number, [number, number]>();
  const hist = new Map<number, number[]>(); // 1초마다 [x, z, 걸은 거리]
  const walkedM = new Map<number, number>();
  for (let i = 0; i < p.w.n; i++) last.set(p.w.id[i], [p.w.x[i], p.w.z[i]]);
  const now = { ...start };
  const crossedIds = new Set<number>();
  const N = Math.round(SECS / DT);
  for (let f = 0; f < N; f++) {
    now.tod = start.tod + f * DT;
    cars.step(DT, now);
    for (const [r, k, i] of cars.dwells) {
      const key = stops.keyOf(r, k);
      const [dx, dz] = cars.door(i);
      p.board(key, dx, dz);
      p.alight(key, Math.floor((f * 7 + i) % 4), dx, dz);
    }
    p.step(DT, now);
    R.frames++;
    R.people += p.w.n;
    const w = p.w;
    const seen = new Set<number>();
    // 몸 겹침(격자)
    const grid = new Map<number, number[]>();
    for (let i = 0; i < w.n; i++) {
      const key = Math.floor(w.x[i]) * 100003 + Math.floor(w.z[i]);
      (grid.get(key) ?? grid.set(key, []).get(key)!).push(i);
    }
    for (let i = 0; i < w.n; i++) {
      const id = w.id[i];
      seen.add(id);
      const x = w.x[i];
      const z = w.z[i];
      const prev = last.get(id);
      if (!prev) {
        if (!atSpot(x, z) && R.born.length < 20) R.born.push(`${id}@${x.toFixed(1)},${z.toFixed(1)} mode ${p.stateOf(i).mode} ${nearSpot(x, z)}`);
      } else {
        const d = Math.hypot(x - prev[0], z - prev[1]);
        if (d > 1 && R.jump.length < 20) R.jump.push(`${id} ${d.toFixed(2)}m @${x.toFixed(1)},${z.toFixed(1)}`);
        walkedM.set(id, (walkedM.get(id) ?? 0) + d);
      }
      last.set(id, [x, z]);
      if (p.stateOf(i).mode === p.MODES.CROSS) crossedIds.add(id);
      for (let ax = -1; ax <= 1; ax++)
        for (let az = -1; az <= 1; az++)
          for (const j of grid.get((Math.floor(x) + ax) * 100003 + Math.floor(z) + az) ?? [])
            if (j > i && Math.hypot(w.x[j] - x, w.z[j] - z) < PASS_D - 0.01) {
              R.overlap++;
              if (R.pairs.length < 12 && !R.pairs.some((q) => q.startsWith(`${id}-${w.id[j]}`))) R.pairs.push(`${id}-${w.id[j]} d ${Math.hypot(w.x[j] - x, w.z[j] - z).toFixed(2)} @${x.toFixed(1)},${z.toFixed(1)} modes ${p.stateOf(i).mode},${p.stateOf(j).mode} f${f}`);
            }
      // 찻길 면 안(횡단보도 통로·승강장 밖)
      if (bitsAt(G, x, z) & 1 && !inCrossing(x, z) && !onIsland(x, z) && R.road.length < 20) R.road.push(`${id}@${x.toFixed(1)},${z.toFixed(1)} mode ${p.stateOf(i).mode}`);
      // 차 몸통
      const c = cars.cars;
      for (let k = 0; k < c.n; k++) {
        const dx = x - c.x[k];
        const dz = z - c.z[k];
        if (Math.abs(dx) > 8 || Math.abs(dz) > 8 || Math.abs(c.y[k]) > 0.6) continue;
        const hl = c.kind[k] === 1 ? 5.75 : BODY_LEN[c.kind[k] === 2 ? 0 : bodyType(c.tint[k])] / 2;
        const hw = c.kind[k] === 1 ? 1.1 : BODY_HW[c.kind[k] === 2 ? 0 : bodyType(c.tint[k])];
        const cs = Math.cos(c.yaw[k]);
        const sn = Math.sin(c.yaw[k]);
        if (Math.abs(dx * cs + dz * sn) < hl + BODY_R - 0.02 && Math.abs(-dx * sn + dz * cs) < hw + BODY_R - 0.02 && R.carN++ < 20) R.car.push(`${id}@${x.toFixed(1)},${z.toFixed(1)} mode ${p.stateOf(i).mode} car ${k} kind ${c.kind[k]} at ${c.x[k].toFixed(1)},${c.y[k].toFixed(1)},${c.z[k].toFixed(1)} yaw ${c.yaw[k].toFixed(2)} onRoad ${bitsAt(G, c.x[k], c.z[k]) & 1} valid ${p.validAt(i)}`);
      }
      // 1초마다 자리: 30초 창 안 모든 자리가 첫 자리에서 10m 안인데 15m 넘게 걸었으면 오가며 갇힌 것
      if (f % 30 === 0) {
        const h = hist.get(id) ?? hist.set(id, []).get(id)!;
        h.push(x, z, walkedM.get(id) ?? 0);
        if (h.length >= 31 * 3) {
          const b = h.length - 31 * 3;
          let far = 0;
          for (let q = b; q < h.length; q += 3) far = Math.max(far, Math.hypot(h[q] - h[b], h[q + 1] - h[b + 1]));
          if (far < 10 && h[h.length - 1] - h[b + 2] > 15 && !R.pace.some((s) => s.startsWith(`${id}@`)) && R.paceN++ >= 0) {
            R.pace.push(`${id}@${x.toFixed(1)},${z.toFixed(1)} mode ${p.stateOf(i).mode} goal ${p.stateOf(i).goal}`);
            if (R.pace.length <= 3) R.pace.push('  ' + Array.from({ length: 31 }, (_, q) => `${h[b + q * 3].toFixed(1)},${h[b + q * 3 + 1].toFixed(1)}`).join(' '));
          }
        }
      }
    }
    for (const [id, pos] of last)
      if (!seen.has(id)) {
        if (!atSpot(pos[0], pos[1]) && R.gone.length < 20) R.gone.push(`${id}@${pos[0].toFixed(1)},${pos[1].toFixed(1)}`);
        last.delete(id);
      }
  }
  R.crossed = crossedIds.size;
}, 600_000);

describe('W21 사람 규칙(토 21시, 실제 판·차·신호)', () => {
  it('사람이 있고 횡단보도를 건넌다', () => {
    expect(R.people / R.frames).toBeGreaterThan(1500);
    expect(R.crossed).toBeGreaterThan(20);
  });
  it('출구·정류장·문 밖에서 생기거나 사라지는 사람 0', () => {
    expect(R.born).toEqual([]);
    expect(R.gone).toEqual([]);
  });
  it('사람끼리 몸 겹침 0', () => {
    expect(R.pairs).toEqual([]);
    expect(R.overlap).toBe(0);
  });
  // W21b 까지 망원나들목 동쪽 골목(−1388, 98)에서 차와 함께 쓰는 골목을 걷던 사람에게 차가 다가와 겹쳤다(16 프레임). W22 부터 차가 사람 몸에 닿지 않는다
  it('사람과 차 몸통 겹침 0(망원나들목 포함)', () => expect(R.car).toEqual([]));
  it('찻길 면 안(횡단보도 통로·중앙 승강장 밖) 자리 0', () => expect(R.road).toEqual([]));
  it('한 프레임 1m 넘는 이동 0', () => expect(R.jump).toEqual([]));
  // 목표는 0 이다. 2026-11-17 남은 것: 약 2,900명 가운데 50명 안팎. 집(문·출구)으로 가는 사람이 문 앞 외줄 길에서 마주 오는 사람과 비켜 주며 오간 것,
  // 교통섬·짧은 횡단보도 둘레를 오간 것, 붐비는 길에서 조금씩 비집고 나아가며 30초에 10m 를 못 벗어난 것이 섞여 있다(메모). 늘지 않는지 본다
  // W21b: 사람이 굳지 않고 흘러가면서 크게 늘었다(약 3,000명 가운데 429명). 막힌 곳에서 돌아서 짧게 되돌아간 사람, 붐비는 갈래 길에서 길을 바꾸다 돌아온 사람,
  // 오가다 들킨 뒤 가장 가까운 문으로 되돌아간 사람이 대부분이다(메모 mapo-w21b-flow.md). 줄지 않은 남은 일
  // W23: 차로 정본에서 선 없는 줄을 고르게 옮겨 가게 하자(월드컵로 r7966) 차 흐름이 바뀌어 429 → 443
  // W24: 미리 돌리기를 큰 걸음으로 줄인 뒤 591. W26: 문·노드에 닿는 곳을 영역으로, 돌아서기를 20m 에 한 번으로, 오가기 감시(가장 가까운 문으로 보내기)를 지워 591 → 288.
  // W28: 걷는 면 위를 걷고, 돌아다니는 사람은 200m 먼 자리를 향하며, 막혀도 20초까지는 돌아서지 않고 서서 기다려 288 → 144(W27 차로 정본과 함께 157).
  // 목표(0, 적어도 50 아래)에 못 미쳤다. 여러 씨앗·시각은 w26-pacing 이 본다(설계 문서 55절)
  it('10m 안에서 30초 넘게 오가기(목표 0)', () => expect(R.paceN).toBeLessThanOrEqual(170));
});
