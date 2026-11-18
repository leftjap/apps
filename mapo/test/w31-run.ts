import { readFileSync } from 'node:fs';
import { decodeBoard } from '../src/data/board.ts';
import { decodeLanes, type RoadJson } from '../src/data/road.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { decodeSurface, type SurfaceJson } from '../src/data/surface.ts';
import { busStopPortals, makeBusRoutes } from '../src/sim/buses.ts';
import { makeCars } from '../src/sim/cars.ts';
import { buildCarGraph, ISLAND_BACK, ISLAND_L, ISLAND_W } from '../src/sim/graph.ts';
import { makeIntersections } from '../src/sim/intersection/index.ts';
import { makePeople, PASS_D, underpasses, ZONES, type Portal } from '../src/sim/people/index.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { decodeWalk, type WalkJson } from '../src/sim/walknet.ts';
import { bitsAt, fillBits } from '../tools/lib/bits.ts';
import { majorGround } from '../tools/lib/walkfix.ts';

// 재작업 W31(설계 mapo-w31-people-design.md 2-4절 6번): 사람 이동을 한 차림으로 잰다. 차 700대·사람 3,000명, 보는 곳 반지름 200m(차는 400m),
// 2분 미리 돌린 뒤 60초를 1/30초로 돌린다. w31-people.test.ts 가 쓰고, 측정 도구(mapo/tmp/…)도 이 함수를 그대로 부른다.
//  - 0 규칙: 출구·정류장·문 밖에서 생기거나 사라짐, 몸통 겹침(가운데 PASS_D 안), 찻길 면 안(횡단보도 통로·중앙 승강장 밖), 한 프레임 1m 넘는 이동,
//    되돌아감(목적지가 있는 사람의 남은 길이 30초 안에 10m 넘게 늘어남. 지금은 돌아다니는 사람이 거의 전부라 목적지가 있는 사람만 센다)
//    W41: 남은 길은 지금 선 위 앞쪽 문·정류장까지를 센다(debugOf left). 선 끝 + 선 끝에서 목적지까지로만 재면, 길 고르기가 문이 붙은 선으로 갈아탈 때
//    문 몇 m 앞인데도 선 끝 너머 길(최대 100m)을 더해 되돌아감으로 잡혔다(연트럴 씨앗 11: 1610번 8.6m → 103.7m, 다음 표본에 문으로 들어감)
//  - 맴돌기: 1초마다 자리를 적어 30초 창 안 모든 자리가 첫 자리에서 10m 안인데 15m 넘게 걸은 사람(w26 과 같은 정의)
//  - 10초 흐름: 10초마다 보는 곳 안 걷는 사람(신호 대기·정류장 줄·들어가는 사람·머무는 사람 빼고)을 적어 10초 뒤 3m 넘게 나아간 몫
//  - 20초 정체: 1초마다 보는 곳 안 걷는 사람 가운데, 지난 20초 내내 대기 상태가 아니었는데 20초 동안 1m 안에 머문 몫
const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(read('board.json'));
const surface = decodeSurface(read('surface.json') as SurfaceJson);
const P = read('surface-polys.json') as { car: number[][]; med: number[][] };
const dm = (a: number[]) => a.map((v) => v / 10);
const W = decodeWalk(read('walk.json') as WalkJson);
const marks = decodeMarks(read('marks.json') as MarksJson);
const lanes = decodeLanes((read('road.json') as RoadJson).lanes);
const DT = 1 / 30;
const SECS = 60;
const R_FOCUS = 200;

export interface W31Res {
  /** 평균 사람 수 */
  people: number;
  pace: string[];
  born: string[];
  gone: string[];
  overlap: string[];
  road: string[];
  jump: string[];
  back: string[];
  /** 한 프레임에 0.6m/s 넘게 걸었는데 '줄 선 사람'(게이트 앞 줄 뒤에 서 있다)으로 표시된 사람 */
  staleQ: string[];
  /** 10초 흐름 [3m 넘게 나아간 수, 잰 수] */
  flow10: [number, number];
  /** 20초 정체 [선 사람 표본, 표본] */
  still20: [number, number];
  /** 사람 계산 ms/프레임 */
  ms: number;
}

const grounds = new Map<string, ReturnType<typeof majorGround>>();
function ground(fx: number, fz: number) {
  const key = `${fx},${fz}`;
  let G = grounds.get(key);
  if (G) return G;
  const win = [fx - 700, fz - 700, fx + 700, fz + 700] as [number, number, number, number];
  G = majorGround(board.roads, surface.faces, surface.draw.map((f) => f.outer), P.car.map((c) => [c[0], dm(c.slice(1))] as [number, number[]]), P.med.map(dm), win);
  for (const [tx, tz] of underpasses(board.roads, ...ZONES.mangwon)) fillBits(G, [Array.from({ length: 48 }, (_, k) => (k % 2 ? tz + Math.sin((Math.floor(k / 2) * Math.PI) / 12) * 20 : tx + Math.cos((Math.floor(k / 2) * Math.PI) / 12) * 20))], 1, true);
  grounds.set(key, G);
  return G;
}

/** 칸 열쇠(정수)마다 번호를 잇는 목록: 열린 주소 해시(열쇠를 그대로 비교한다). push 한 차례의 거꾸로 읽힌다 */
function cellLists() {
  let size = 0;
  let key = new Int32Array(0);
  let top = new Int32Array(0);
  let mark = new Int32Array(0);
  let stamp = 0;
  const L = {
    next: new Int32Array(0),
    clear(n: number) {
      if (size < n * 4) {
        size = 1 << Math.ceil(Math.log2(Math.max(64, n * 4)));
        key = new Int32Array(size);
        top = new Int32Array(size);
        mark = new Int32Array(size);
        stamp = 0;
      }
      if (L.next.length < n) L.next = new Int32Array(n * 2);
      stamp++;
    },
    slot(k: number) {
      let h = (Math.imul(k, 0x9e3779b1) >>> 0) & (size - 1);
      while (mark[h] === stamp && key[h] !== k) h = (h + 1) & (size - 1);
      return h;
    },
    push(k: number, i: number) {
      const h = L.slot(k);
      if (mark[h] !== stamp) (mark[h] = stamp), (key[h] = k), (top[h] = -1);
      L.next[i] = top[h];
      top[h] = i;
    },
    head(k: number) {
      const h = L.slot(k);
      return mark[h] === stamp ? top[h] : -1;
    },
  };
  return L;
}

export function runW31(seed: number, dow: number, hour: number, fx: number, fz: number): W31Res {
  const G = ground(fx, fz);
  const R: W31Res = { people: 0, pace: [], born: [], gone: [], overlap: [], road: [], jump: [], back: [], staleQ: [], flow10: [0, 0], still20: [0, 0], ms: 0 };
  const provider = makeSimProvider();
  const start = { tod: hour * 3600, dow, doy: 320 };
  const carGraph = buildCarGraph(board.roads, lanes, marks.arrows);
  const inter = makeIntersections(carGraph, { crosswalks: board.crosswalks, stopLines: board.stopLines });
  const busy = new Uint32Array(board.crosswalks.length);
  const cars = makeCars(carGraph, provider, seed, 700, makeBusRoutes(board.buses, carGraph, undefined, board.crosswalks), inter, { list: board.crosswalks, busy });
  cars.setFocus(fx, fz, 400, () => false);
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
  p.setFocus(fx, fz, R_FOCUS);
  p.warm(120, start);
  const M = p.MODES;
  const spots: [number, number, number][] = p.docks.map((d, k) => {
    const [x, z] = d.kind === 'door' ? (d as unknown as { door: [number, number] }).door : p.dockPos(k);
    return [x, z, d.kind === 'stop' ? 6.5 : 1];
  });
  const atSpot = (x: number, z: number) => spots.some(([sx, sz, r]) => Math.abs(sx - x) <= r && Math.abs(sz - z) <= r && Math.hypot(sx - x, sz - z) <= r);
  const isl = stops.portals.filter((s) => s.median).map((s) => ({ cx: s.x - Math.cos(s.yaw!) * ISLAND_BACK, cz: s.z - Math.sin(s.yaw!) * ISLAND_BACK, yaw: s.yaw! }));
  const onIsland = (x: number, z: number) => isl.some((s) => Math.abs((x - s.cx) * Math.cos(s.yaw) + (z - s.cz) * Math.sin(s.yaw)) < ISLAND_L / 2 && Math.abs(-(x - s.cx) * Math.sin(s.yaw) + (z - s.cz) * Math.cos(s.yaw)) < ISLAND_W / 2);
  const segD = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(ax + dx * t - x, az + dz * t - z);
  };
  // 건너기 길을 첫 점의 60m 칸으로 나눠 둔다(W43: 큰길 위 사람마다 프레임마다 건너기 길 수천 개를 모두 돌았다). 첫 점이 60m 안인 길만 보던 것과 같다(반올림 여유로 둘레 두 칸까지)
  const crossCell = new Map<number, (typeof p.crosses)[number][]>();
  const cellOf = (x: number, z: number) => Math.floor(x / 60) * 100003 + Math.floor(z / 60);
  for (const c of p.crosses) {
    const k = cellOf(c.pts[0], c.pts[1]);
    (crossCell.get(k) ?? crossCell.set(k, []).get(k)!).push(c);
  }
  const inCrossing = (x: number, z: number) => {
    const cx = Math.floor(x / 60);
    const cz = Math.floor(z / 60);
    for (let a = -2; a <= 2; a++)
      for (let b = -2; b <= 2; b++)
        for (const c of crossCell.get((cx + a) * 100003 + cz + b) ?? []) {
          if (Math.abs(c.pts[0] - x) > 60 || Math.abs(c.pts[1] - z) > 60) continue;
          for (let k = 2; k < c.pts.length; k += 2) if (segD(x, z, c.pts[k - 2], c.pts[k - 1], c.pts[k], c.pts[k + 1]) <= c.hw + 0.05) return true;
        }
    return false;
  };
  /** 걷는 중(대기 상태가 아님): 신호 대기·정류장 줄·들어가는 사람·들어가려 문턱으로 가는 사람·머무는 사람·갈래 영역 게이트 앞에서 차례를 기다리는 사람 빼고.
   *  게이트 대기(W38)는 신호 대기와 같은 '서 있는 차례 기다림'이다: 차례가 오면 영역에 들어가 지나간다. 걷는 사람으로 세면 게이트가 순환 대기를 끊는 대신
   *  만든 짧은 기다림이 막힘으로 잡혀, 교착(Y 갈림 40명 중 13명 못 지남)을 그대로 두는 HEAD 보다 흐름이 낮게 나왔다(W36 t16 홍대 토21 씨앗 11: 10초 3m 못 간 표본의 17% 가 게이트 앞·영역 안) */
  const walking = (i: number) => {
    const st = p.stateOf(i);
    return !(st.mode === M.WAITX || st.mode === M.QUEUE || st.mode === M.LEAVE || st.mode === M.INDOOR || st.hold || st.gate);
  };
  const inF = (i: number) => Math.hypot(p.w.x[i] - fx, p.w.z[i] - fz) < R_FOCUS;
  const last = new Map<number, [number, number]>();
  const hist = new Map<number, number[]>();
  const walked = new Map<number, number>();
  /** 되돌아감: 사람마다 [목적지, 시각, 남은 길, …] */
  const left = new Map<number, number[]>();
  /** 20초 정체: 사람마다 1초 표본 [x, z, 걷는 중 1/0, …] 마지막 21개 */
  const still = new Map<number, number[]>();
  let snap10: Map<number, [number, number]> | null = null;
  for (let i = 0; i < p.w.n; i++) last.set(p.w.id[i], [p.w.x[i], p.w.z[i]]);
  const now = { ...start };
  const N = Math.round(SECS / DT);
  let ms = 0;
  const grid = cellLists();
  for (let f = 0; f < N; f++) {
    now.tod = start.tod + f * DT;
    cars.step(DT, now);
    for (const [r, k, i] of cars.dwells) {
      const key = stops.keyOf(r, k);
      const [dx, dz] = cars.door(i);
      p.board(key, dx, dz);
      p.alight(key, Math.floor((f * 7 + i) % 4), dx, dz);
    }
    const t0 = performance.now();
    p.step(DT, now);
    ms += performance.now() - t0;
    const w = p.w;
    R.people += w.n / N;
    // 10초 흐름
    if (f % 300 === 0) {
      snap10 = new Map();
      for (let i = 0; i < w.n; i++) if (inF(i) && walking(i)) snap10.set(w.id[i], [w.x[i], w.z[i]]);
    }
    if (f % 300 === 299 && snap10)
      for (let i = 0; i < w.n; i++) {
        const q = snap10.get(w.id[i]);
        if (!q) continue;
        R.flow10[1]++;
        if (Math.hypot(w.x[i] - q[0], w.z[i] - q[1]) >= 3) R.flow10[0]++;
      }
    const seen = new Set<number>();
    // 1m 칸마다 사람 번호를 작은 것부터 잇는 목록(W43: 프레임마다 칸 배열 수천 개를 새로 만들고 Map 으로 찾았다. 칸 열쇠·차례는 같다)
    grid.clear(w.n);
    for (let i = w.n - 1; i >= 0; i--) grid.push(Math.floor(w.x[i]) * 100003 + Math.floor(w.z[i]), i);
    for (let i = 0; i < w.n; i++) {
      const id = w.id[i];
      const x = w.x[i];
      const z = w.z[i];
      seen.add(id);
      const prev = last.get(id);
      if (!prev) {
        if (!atSpot(x, z) && R.born.length < 10) R.born.push(`${id}@${x.toFixed(1)},${z.toFixed(1)}`);
      } else {
        const d = Math.hypot(x - prev[0], z - prev[1]);
        if (d > 1 && R.jump.length < 10) R.jump.push(`${id} ${d.toFixed(2)}m @${x.toFixed(1)},${z.toFixed(1)}`);
        walked.set(id, (walked.get(id) ?? 0) + d);
        if (d > 0.6 * DT && R.staleQ.length < 10 && p.stateOf(i).queued) R.staleQ.push(`${id} f${f} @${x.toFixed(1)},${z.toFixed(1)}`);
      }
      if (prev) (prev[0] = x), (prev[1] = z);
      else last.set(id, [x, z]);
      for (let ax = -1; ax <= 1; ax++)
        for (let az = -1; az <= 1; az++)
          for (let j = grid.head((Math.floor(x) + ax) * 100003 + Math.floor(z) + az); j >= 0; j = grid.next[j])
            if (j > i && Math.hypot(w.x[j] - x, w.z[j] - z) < PASS_D - 0.01 && R.overlap.length < 10) R.overlap.push(`${id}-${w.id[j]} @${x.toFixed(1)},${z.toFixed(1)} f${f}`);
      if (bitsAt(G, x, z) & 1 && !inCrossing(x, z) && !onIsland(x, z) && R.road.length < 10) R.road.push(`${id}@${x.toFixed(1)},${z.toFixed(1)} mode ${p.stateOf(i).mode}`);
      if (f % 30 !== 0) continue;
      // 맴돌기
      const h = hist.get(id) ?? hist.set(id, []).get(id)!;
      h.push(x, z, walked.get(id) ?? 0);
      if (h.length >= 31 * 3) {
        const b = h.length - 31 * 3;
        let far = 0;
        for (let q = b; q < h.length; q += 3) far = Math.max(far, Math.hypot(h[q] - h[b], h[q + 1] - h[b + 1]));
        if (far < 10 && h[h.length - 1] - h[b + 2] > 15 && !R.pace.some((s) => s.startsWith(`${id}@`))) R.pace.push(`${id}@${x.toFixed(1)},${z.toFixed(1)} mode ${p.stateOf(i).mode} goal ${p.stateOf(i).goal}`);
      }
      // 되돌아감: 목적지가 있는 걷는 사람의 남은 길(지금 선 끝까지 + 선 끝에서 목적지까지, 지금 선 위 앞쪽에 문·정류장이 있으면 그 자리까지)
      const dbg = p.debugOf(i);
      const lt = left.get(id) ?? left.set(id, []).get(id)!;
      if (dbg.mode === M.WALK && dbg.goal >= 0 && Number.isFinite(dbg.D)) {
        const rem = dbg.left;
        if (lt.length && lt[lt.length - 3] !== dbg.goal) lt.length = 0;
        lt.push(dbg.goal, f * DT, rem);
        while (lt.length && lt[1] < f * DT - 30) lt.splice(0, 3);
        let lo = Infinity;
        for (let q = 2; q < lt.length; q += 3) lo = Math.min(lo, lt[q]);
        if (rem - lo > 10 && !R.back.some((s) => s.startsWith(`${id}@`)) && R.back.length < 50) R.back.push(`${id}@${x.toFixed(1)},${z.toFixed(1)} +${(rem - lo).toFixed(1)}m`);
      } else lt.length = 0;
      // 20초 정체
      const sl = still.get(id) ?? still.set(id, []).get(id)!;
      const wk = walking(i);
      sl.push(x, z, wk ? 1 : 0);
      if (sl.length > 21 * 3) sl.splice(0, 3);
      if (wk && inF(i)) {
        R.still20[1]++;
        if (sl.length === 21 * 3) {
          let ok = true;
          for (let q = 0; q < sl.length && ok; q += 3) ok = sl[q + 2] === 1 && Math.hypot(sl[q] - x, sl[q + 1] - z) < 1;
          if (ok) R.still20[0]++;
        }
      }
    }
    for (const [id, pos] of last)
      if (!seen.has(id)) {
        if (!atSpot(pos[0], pos[1]) && R.gone.length < 10) R.gone.push(`${id}@${pos[0].toFixed(1)},${pos[1].toFixed(1)}`);
        last.delete(id);
        still.delete(id);
        left.delete(id);
      }
  }
  R.ms = ms / N;
  return R;
}
