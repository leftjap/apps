// 걷는 자리 측정(브라우저 없이 시뮬레이션만 돌린다): node tools/measure-walk.ts [초] [씨앗,...] [조건 번호] [까닭]
// 조건 번호를 주지 않으면 조건 0~2 를 돌린다. 조건 3(토 21:40)은 15절 옛 측정(2분)과 같은 시각이다.
// 신호 횡단보도에 건너는 방향으로 들어서는 순간(0.1초마다 본다, 같은 횡단보도를 나온 지 5초 안에 다시 들어선 것은 같은 건넘) 그 방향 보행 신호가 빨간불인 횟수, 초록불에 들어섰는데 건너는 도중 빨간불이 되어
// 4초 넘게 횡단보도 위에 있던 사람, 신호 교차로(30m) 밖에서 큰길 찻길에 들어선 횟수(횡단보도 면·승강장·나들목 제외)도 센다.
// main.ts 와 같은 순서로 차·신호·버스·사람을 만들고, 사람만 0.5초씩 600번 미리 돌린 뒤 1/30초 단계로 30초 안정시키고
// [초] 동안 1초마다 사람 자리를 판 칸 격자(0.5m)에 대어 센다. 조건은 일 14:00·토 17:00·평일(화) 08:30.
// 큰길 찻길 = 등급 3 이하 땅 위 찻길 띠(교차로를 지나 끝까지) ∪ 분리대 ∪ 큰길 교차로 면 가운데 골목 띠 밖(골목 어귀는 뺀다).
// 도로 부지 = 도시생태현황도 도로 부지·광장 ∪ 찻길 띠·교차로 면·그리기 전용 찻길 면·분리대·교통섬. 그 밖은 보행로 띠(등급 6·7 둘레)만 걷는 자리로 본다.
// 보도 면·도로 부지 안인지는 0.2m 여유를 두고(칸 0.5m 의 가장자리 오차), 큰길 찻길은 칸 가운데로, 건물 안은 외곽선으로 본다.
import { readFileSync } from 'node:fs';
import { decodeBoard, GK } from '../src/data/board.ts';
import { carriageSections, decodeSurface, isGroundRoad, roadJoints } from '../src/data/surface.ts';
import { decodeWalk } from '../src/sim/walknet.ts';
import { buildCarGraph, ISLAND_BACK, ISLAND_L, ISLAND_W } from '../src/sim/graph.ts';
import { makeSignals, RED } from '../src/sim/signals.ts';
import { makeCars } from '../src/sim/cars.ts';
import { busStopPortals, makeBusRoutes } from '../src/sim/buses.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { arrivals } from '../src/sim/trains.ts';
import { makeWalkers, underpasses, zoneTargets, ZONE_IDS, ZONES } from '../src/sim/walkers.ts';
import { BOARD_R } from '../src/geo.ts';
import { bitsAt, fillBits, makeBits, strokeBits } from './lib/bits.ts';

const MEAS = Number(process.argv[2] ?? 180);
const SEEDS = (process.argv[3] ?? '5,9').split(',').map(Number);
/** 넷째 인자가 있으면 그 번호 조건만 돌리고, 큰길 찻길 위·건물 안·도로 부지 밖 사람을 까닭별로 나눠 적는다 */
const ONLY = process.argv[4] === undefined ? -1 : Number(process.argv[4]);
const WHY = process.argv[5] === '까닭';
const CASES: [string, number, number][] = [
  ['일 14:00', 0, 14 * 3600],
  ['토 17:00', 6, 17 * 3600],
  ['평일 08:30', 2, 8.5 * 3600],
  ['토 21:40', 6, 21 * 3600 + 40 * 60],
];
const data = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const board = decodeBoard(data('board.json'));
const surface = decodeSurface(data('surface.json'));
const polys = data('surface-polys.json') as { car: number[][]; med: number[][]; isl: number[][]; walk: number[][]; draw: number[][] };
const walkNet = data('walk.json');
const dm = (r: number[]) => r.map((v) => v / 10);

// ── 판 칸 격자 ──
const WALK = 1;
const MAJOR = 2;
const XW = 4;
const BLDG = 8;
const LAND = 16;
const ALLEY = 32;
const PATH = 64;
const B = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, 0.5);
const joints = roadJoints(board.roads);
const full = (i: number) => {
  const s = carriageSections(board.roads[i], 0, Infinity, joints.subarray(i * 4, i * 4 + 4));
  return [...s.flatMap((q) => [q.lx, q.lz]), ...s.reverse().flatMap((q) => [q.rx, q.rz])];
};
fillBits(B, polys.walk.map(dm), WALK);
for (const r of polys.isl) fillBits(B, [dm(r)], WALK); // 교통섬은 보도 면으로 친다
for (const f of surface.faces) if (f.cls <= 3) fillBits(B, [f.outer, ...f.holes], MAJOR);
board.roads.forEach((r, i) => {
  if (isGroundRoad(r) && r.cls >= 4) fillBits(B, [full(i)], MAJOR, true);
});
board.roads.forEach((r, i) => {
  if (isGroundRoad(r) && r.cls <= 3) fillBits(B, [full(i)], MAJOR);
});
for (const m of polys.med) fillBits(B, [dm(m)], MAJOR);
for (const c of board.crosswalks) fillBits(B, c.rings, XW);
for (const r of board.crosswalkMarks) fillBits(B, [r], XW);
for (const b of board.buildings) fillBits(B, [b.pts], BLDG);
// 건물 안은 칸이 아니라 외곽선으로 다시 본다(칸 0.5m 로는 벽 앞 0.35m 도 안으로 잡힌다)
const bgrid = new Map<number, number[]>();
board.buildings.forEach((b, i) => {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k < b.pts.length; k += 2) (x0 = Math.min(x0, b.pts[k])), (x1 = Math.max(x1, b.pts[k])), (z0 = Math.min(z0, b.pts[k + 1])), (z1 = Math.max(z1, b.pts[k + 1]));
  for (let cx = Math.floor(x0 / 20); cx <= Math.floor(x1 / 20); cx++) for (let cz = Math.floor(z0 / 20); cz <= Math.floor(z1 / 20); cz++) (bgrid.get(cx * 1000 + cz) ?? bgrid.set(cx * 1000 + cz, []).get(cx * 1000 + cz)!).push(i);
});
const inBuilding = (x: number, z: number) =>
  (bgrid.get(Math.floor(x / 20) * 1000 + Math.floor(z / 20)) ?? []).some((i) => {
    const r = board.buildings[i].pts;
    let c = false;
    for (let a = 0, j = r.length - 2; a < r.length; j = a, a += 2) if (r[a + 1] > z !== r[j + 1] > z && x < r[a] + ((z - r[a + 1]) / (r[j + 1] - r[a + 1])) * (r[j] - r[a])) c = !c;
    return c;
  });
for (const a of board.groundAreas) if (a.kind === GK.ROADSIDE || a.kind === GK.PLAZA) fillBits(B, [a.outer, ...a.holes], LAND);
for (const r of [...polys.car.map((c) => c.slice(1)), ...polys.med, ...polys.isl, ...polys.draw]) fillBits(B, [dm(r)], LAND);
for (const f of [...surface.faces, ...surface.draw]) fillBits(B, [f.outer, ...f.holes], LAND);
for (const c of polys.car) if (board.roads[c[0]].cls >= 4) fillBits(B, [dm(c.slice(1))], ALLEY);
for (const f of surface.faces) if (f.cls >= 4) fillBits(B, [f.outer, ...f.holes], ALLEY);
for (const r of board.roads) {
  if (r.cls < 6 || r.bridge) continue;
  const line: number[] = [];
  for (let k = 0; k < r.p.length; k += 3) line.push(r.p[k], r.p[k + 2]);
  strokeBits(B, line, r.cls === 6 ? 2.9 : 1.1, PATH);
}

// ── 걷는 선(보도 선)이 보도 면 위에 있는 비율: 보도 선을 1m 마다 찍는다 ──
const graph = decodeWalk(walkNet);
let lineN = 0;
let lineIn = 0;
for (let a = 0; a < graph.adj.length; a++)
  graph.adj[a].forEach((b, k) => {
    if (b < a || graph.kind[a][k] !== 0) return;
    const ax = graph.nx[a * 2];
    const az = graph.nx[a * 2 + 1];
    const L = Math.hypot(graph.nx[b * 2] - ax, graph.nx[b * 2 + 1] - az);
    for (let d = 0.5; d < L; d += 1) {
      const f = d / L;
      lineN++;
      if (bitsAt(B, ax + (graph.nx[b * 2] - ax) * f, az + (graph.nx[b * 2 + 1] - az) * f) & WALK) lineIn++;
    }
  });

// 신호 판정용: 횡단보도 면 고리를 20m 칸에 넣어 둔다
const xwGrid = new Map<number, number[]>();
board.crosswalks.forEach((c, i) => {
  for (const r of c.rings) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < r.length; k += 2) (x0 = Math.min(x0, r[k])), (x1 = Math.max(x1, r[k])), (z0 = Math.min(z0, r[k + 1])), (z1 = Math.max(z1, r[k + 1]));
    for (let cx = Math.floor(x0 / 20); cx <= Math.floor(x1 / 20); cx++) for (let cz = Math.floor(z0 / 20); cz <= Math.floor(z1 / 20); cz++) (xwGrid.get(cx * 1000 + cz) ?? xwGrid.set(cx * 1000 + cz, []).get(cx * 1000 + cz)!).push(i);
  }
});
const inRing = (r: ArrayLike<number>, x: number, z: number) => {
  let c = false;
  for (let a = 0, j = r.length - 2; a < r.length; j = a, a += 2) if (r[a + 1] > z !== r[j + 1] > z && x < r[a] + ((z - r[a + 1]) / (r[j + 1] - r[a + 1])) * (r[j] - r[a])) c = !c;
  return c;
};
/** (x, z)가 든 횡단보도 번호(없으면 −1) */
const xwAt = (x: number, z: number) => (xwGrid.get(Math.floor(x / 20) * 1000 + Math.floor(z / 20)) ?? []).find((i) => board.crosswalks[i].rings.some((r) => inRing(r, x, z))) ?? -1;

function run(dow: number, tod: number, seed: number) {
  const provider = makeSimProvider();
  const start = { tod, dow, doy: 320 };
  const carGraph = buildCarGraph(board.roads);
  const signals = makeSignals(carGraph, { crosswalks: board.crosswalks, stopLines: board.stopLines });
  const crossBusy = new Uint32Array(board.crosswalks.length);
  const cars = makeCars(carGraph, provider, 11, 5000, makeBusRoutes(board.buses, carGraph, undefined, board.crosswalks), signals, { list: board.crosswalks, busy: crossBusy });
  cars.setFocus(0, 0, 2200, () => false);
  cars.fill(cars.target(start));
  cars.fillBuses(start);
  const stops = busStopPortals(cars.routes, carGraph);
  const islands = stops.portals.filter((p) => p.median).map((s) => ({ cx: s.x - Math.cos(s.yaw) * ISLAND_BACK, cz: s.z - Math.sin(s.yaw) * ISLAND_BACK, yaw: s.yaw }));
  const onIsland = (x: number, z: number) =>
    islands.some((s) => {
      const dx = x - s.cx;
      const dz = z - s.cz;
      return Math.abs(dx * Math.cos(s.yaw) + dz * Math.sin(s.yaw)) < ISLAND_L / 2 + 0.3 && Math.abs(-dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw)) < ISLAND_W / 2 + 0.3;
    });
  const portals = [
    ...board.exits.map((e) => ({ kind: 'exit' as const, key: e.st, x: e.x, z: e.z })),
    ...stops.portals,
    ...underpasses(board.roads, ...ZONES.mangwon).map(([x, z]) => ({ kind: 'exit' as const, key: '망원나들목', x, z })),
    ...Array.from({ length: board.picnic.length / 2 }, (_, i) => ({ kind: 'exit' as const, key: '망원한강공원', x: board.picnic[i * 2], z: board.picnic[i * 2 + 1] })),
    ...board.buildings.flatMap((b) => {
      let x = 0;
      let z = 0;
      for (let k = 0; k < b.pts.length; k += 2) (x += b.pts[k]), (z += b.pts[k + 1]);
      x /= b.pts.length / 2;
      z /= b.pts.length / 2;
      let a = 0;
      for (let i = 0, j = b.pts.length - 2; i < b.pts.length; j = i, i += 2) a += b.pts[j] * b.pts[i + 1] - b.pts[i] * b.pts[j + 1];
      const inZone = Object.entries(ZONES).some(([id, [cx, cz, r]]) => id !== 'mangwon' && Math.hypot(x - cx, z - cz) < r);
      return inZone && Math.abs(a) / 2 > 40 ? [{ kind: 'door' as const, key: '', x, z, poly: b.pts, h: b.h }] : [];
    }),
  ];
  const walkers = makeWalkers(graph, portals, provider, seed, 8000, undefined, signals, { busy: crossBusy, traffic: (l) => cars.approaching(l.xw) });
  // 까닭 나누기: 문 오가기(문과 그 문의 보도 자리 사이 0.8m 안), 횡단보도(기다리는 자리 2.5m 안·건너는 선 1.5m 안),
  // 정류장(정류장 자리 3m 안), 나들목(자동차 전용도로 밑, 20m 안), 그 밖은 가장 가까운 걷는 선의 종류
  const doorSegs: number[] = [];
  walkers.docks.forEach((d, k) => {
    if (!d.door) return;
    const p = walkers.dockPoint(k);
    doorSegs.push(d.door[0], d.door[1], p.x, p.z);
  });
  const stopPts = walkers.docks.flatMap((d, k) => (d.kind === 'stop' ? [walkers.dockPoint(k)] : []));
  const tunnels = underpasses(board.roads, ...ZONES.mangwon);
  const segD = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(ax + dx * t - x, az + dz * t - z);
  };
  const why = (x: number, z: number) => {
    for (let k = 0; k < doorSegs.length; k += 4) if (Math.abs(doorSegs[k] - x) < 25 && segD(x, z, doorSegs[k], doorSegs[k + 1], doorSegs[k + 2], doorSegs[k + 3]) < 0.8) return '문 오가기';
    if (tunnels.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 20)) return '나들목';
    for (const l of graph.links) {
      if (Math.hypot(l.pax - x, l.paz - z) < 2.5 || Math.hypot(l.pbx - x, l.pbz - z) < 2.5) return '횡단보도 기다림';
      if (segD(x, z, l.pax, l.paz, l.pbx, l.pbz) < 1.5) return '횡단보도 건넘';
    }
    if (stopPts.some((p) => Math.hypot(p.x - x, p.z - z) < 3)) return '정류장';
    for (let k = 0; k < cars.cars.n; k++) if (cars.cars.kind[k] === 1 && Math.hypot(cars.cars.x[k] - x, cars.cars.z[k] - z) < 7) return '버스 옆';
    const e = graph.nearestEdge(x, z);
    if (!e) return '선 없음';
    return `${['보도', '골목', '보행로', '잇는 선'][graph.kind[e[0]][e[1]]]} 선 ${e[3] < 1 ? '1m 안' : e[3] < 3 ? '1~3m' : '3m 넘게'}`;
  };
  const causes: Record<string, Record<string, number>> = { major: {}, building: {}, offLand: {} };
  const note = (kind: string, x: number, z: number) => {
    if (!WHY) return;
    const k = why(x, z);
    causes[kind][k] = (causes[kind][k] ?? 0) + 1;
  };
  for (let i = 0; i < 600; i++) walkers.step(0.5, { ...start, tod: (start.tod - 300 + i * 0.5 + 86400) % 86400 });
  const DT = 1 / 30;
  let now = { ...start };
  let prevTod = now.tod;
  const c = { samples: 0, people: 0, major: 0, building: 0, offLand: 0, sideN: 0, sideWalk: 0, carV: 0 };
  const zoneHave = new Array(ZONE_IDS.length).fill(0);
  const zoneWant = new Array(ZONE_IDS.length).fill(0);
  const zoneHome = new Array(ZONE_IDS.length).fill(0);
  const hot = new Map<string, number>();
  // 들어섬 판정: 사람마다 지난 판정 때 큰길 찻길 위였는가, 든 횡단보도, 그 횡단보도에 초록불에 들어섰는가, 빨간불 아래 있던 시간
  const wasMajor = new Map<number, boolean>();
  const wasXw = new Map<number, number>();
  const redOn = new Map<number, number>();
  const left = new Map<number, [number, number]>(); // 사람마다 마지막으로 나온 횡단보도와 시각
  const midRed = new Set<number>();
  let redEntry = 0;
  let redPass = 0;
  const redWhy: Record<string, number> = {};
  let majorEntry = 0;
  const steps = Math.round((30 + MEAS) / DT);
  for (let s = 0; s < steps; s++) {
    now = { ...now, tod: (now.tod + DT) % 86400 };
    for (const a of arrivals(board.lines, prevTod, now.tod).slice(0, 12)) walkers.burst(a.name, Math.max(1, Math.min(14, Math.round(provider.alighting(now, a.name) / 150))));
    prevTod = now.tod;
    cars.step(DT, now);
    for (const [r, k, i] of cars.dwells) {
      const key = stops.keyOf(r, k);
      const [dx, dz] = cars.door(i);
      walkers.board(key, dx, dz);
      walkers.alight(key, Math.floor(Math.random() * 4), dx, dz);
    }
    walkers.step(DT, now);
    if (s * DT >= 30 && s % 3 === 0) {
      const w = walkers.w;
      const seen = new Set<number>();
      for (let i = 0; i < w.n; i++) {
        if (w.fade[i] < 0.3) continue;
        const id = w.id[i];
        seen.add(id);
        const x = w.x[i];
        const z = w.z[i];
        const xi = xwAt(x, z);
        const site = xi >= 0 ? signals.crossSite[xi] : -1;
        if (site >= 0) {
          const c = board.crosswalks[xi];
          const sg = (x - c.x) * c.ux + (z - c.z) * c.uz < 0 ? 1 : -1; // 들어선 쪽 반대 끝으로 건넌다
          const red = signals.state(site, signals.groupOf(site, Math.atan2(c.uz * sg, c.ux * sg)), now.tod) === RED;
          // 같은 횡단보도를 나온 지 5초 안에 다시 들어선 것(두 단 횡단보도의 섬, 칠한 면 가장자리를 따라 건넘)은 같은 건넘이다
          const back = left.get(id);
          const again = back !== undefined && back[0] === xi && now.tod - back[1] < 5;
          if (wasXw.has(id) && wasXw.get(id) !== xi && !again) {
            // 건너는 방향(축과 45° 안)으로 들어선 사람만 센다. 골목을 따라 걷다 골목을 가로지르는 횡단보도 면을 지나는 사람은 따로 센다
            const along = Math.abs(Math.cos(w.yaw[i]) * c.ux + Math.sin(w.yaw[i]) * c.uz) > 0.7071;
            if (red && along) {
              redEntry++;
              if (WHY) {
                // 까닭: 이 횡단보도의 연결 위(1.5m 안)인가, 다른 횡단보도의 연결 위인가, 연결 밖(걷는 선·잇는 선)인가
                let k = '연결 밖';
                for (const l of graph.links) {
                  const dx = l.pbx - l.pax;
                  const dz = l.pbz - l.paz;
                  const t = Math.max(0, Math.min(1, ((x - l.pax) * dx + (z - l.paz) * dz) / (dx * dx + dz * dz || 1)));
                  if (Math.hypot(l.pax + dx * t - x, l.paz + dz * t - z) < 1.5) k = l.xw === xi ? '이 횡단보도 연결' : '다른 횡단보도 연결';
                  if (k === '이 횡단보도 연결') break;
                }
                if (k === '연결 밖') {
                  const e = graph.nearestEdge(x, z);
                  if (e) k += ` (${['보도', '골목', '보행로', '잇는 선'][graph.kind[e[0]][e[1]]]} 선 ${e[3].toFixed(1)}m)`;
                }
                redWhy[k] = (redWhy[k] ?? 0) + 1;
              }
            }
            else if (red) redPass++;
            redOn.set(id, red ? -1 : 0);
          } else if (red && (redOn.get(id) ?? -1) >= 0) {
            redOn.set(id, redOn.get(id)! + 0.1);
            if (redOn.get(id)! > 4) midRed.add(id);
          }
        }
        if (xi < 0 && (wasXw.get(id) ?? -1) >= 0) left.set(id, [wasXw.get(id)!, now.tod]);
        wasXw.set(id, xi);
        const f = bitsAt(B, x, z);
        const major = (f & MAJOR) !== 0 && !(f & XW) && !onIsland(x, z) && !tunnels.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 20);
        if (major && wasMajor.get(id) === false && signals.siteNear(x, z, 30) < 0) majorEntry++;
        wasMajor.set(id, major);
      }
      for (const id of [...wasMajor.keys()]) if (!seen.has(id)) wasMajor.delete(id), wasXw.delete(id), redOn.delete(id), left.delete(id);
    }
    if (s * DT < 30 || s % 30) continue;
    c.samples++;
    c.carV += cars.meanSpeed();
    const w = walkers.w;
    const want = zoneTargets(provider, now, 8000);
    const home = walkers.zoneCounts();
    for (let z = 0; z < ZONE_IDS.length; z++) (zoneWant[z] += want[z]), (zoneHome[z] += home[z]);
    for (let i = 0; i < w.n; i++) {
      const x = w.x[i];
      const z = w.z[i];
      const zi = ZONE_IDS.findIndex((id) => Math.hypot(x - ZONES[id][0], z - ZONES[id][1]) < ZONES[id][2]);
      if (zi >= 0) zoneHave[zi]++;
      if (w.fade[i] < 0.3) continue;
      c.people++;
      // 보도 면·도로 부지·골목·보행로 띠 안은 0.2m 여유(둘레 네 점 가운데 하나라도), 큰길 찻길·횡단보도·건물은 칸 가운데로 본다
      const f0 = bitsAt(B, x, z);
      const near = bitsAt(B, x - 0.2, z - 0.2) | bitsAt(B, x + 0.2, z - 0.2) | bitsAt(B, x - 0.2, z + 0.2) | bitsAt(B, x + 0.2, z + 0.2);
      const f = (f0 & (MAJOR | XW | BLDG)) | ((f0 | near) & (WALK | LAND | ALLEY | PATH));
      const isl = onIsland(x, z);
      if (f & BLDG && inBuilding(x, z)) c.building++, note('building', x, z);
      // 나들목: 걷는 길이 자동차 전용도로 밑을 지나는 곳(자료에는 그 도로가 땅 높이로 있다)은 찻길 위로 치지 않는다
      if (f & MAJOR && !(f & XW) && !isl && !tunnels.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 20)) {
        c.major++;
        note('major', x, z);
        const k = `${Math.round(x / 25) * 25},${Math.round(z / 25) * 25}`;
        hot.set(k, (hot.get(k) ?? 0) + 1);
      }
      if (!(f & (LAND | PATH)) && !isl) c.offLand++, note('offLand', x, z);
      // 보도를 걷는 사람: 골목 찻길(차와 함께 쓰는 곳)·횡단보도·승강장·도로 부지 밖 보행로 위가 아닌 사람
      if (!(f & ALLEY && !(f & MAJOR)) && !(f & XW) && !isl && !(f & PATH && !(f & LAND))) {
        c.sideN++;
        if (f & WALK) c.sideWalk++;
      }
    }
  }
  const S = c.samples;
  return {
    people: c.people / S,
    majorPct: (100 * c.major) / c.people,
    major: c.major / S,
    building: c.building / S,
    offLand: c.offLand / S,
    sideWalkPct: (100 * c.sideWalk) / c.sideN,
    carV: c.carV / S,
    zones: ZONE_IDS.map((id, z) => [id, Math.round(zoneHome[z] / S), Math.round(zoneWant[z] / S), Math.round((100 * zoneHome[z]) / zoneWant[z] - 100)]),
    zonesAt: ZONE_IDS.map((id, z) => [id, Math.round(zoneHave[z] / S), Math.round((100 * zoneHave[z]) / zoneWant[z] - 100)]),
    redEntry,
    redPass,
    redWhy: Object.entries(redWhy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '),
    midRed: midRed.size,
    majorEntry,
    causes: Object.fromEntries(Object.entries(causes).map(([k, o]) => [k, Object.entries(o).sort((a, b) => b[1] - a[1]).map(([w, v]) => `${w} ${(v / S).toFixed(1)}`).join(', ')])),
    hot: [...hot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}:${(v / S).toFixed(1)}`),
  };
}

console.log(`보도 선 1m 점 ${lineN}개 가운데 보도 면 위 ${((100 * lineIn) / Math.max(1, lineN)).toFixed(1)}%`);
for (const [name, dow, tod] of CASES.filter((_, q) => (ONLY < 0 ? q < 3 : q === ONLY)))
  for (const seed of SEEDS) {
    const t0 = performance.now();
    const r = run(dow, tod, seed);
    console.log(
      `${name} 씨앗 ${seed}: 사람 ${r.people.toFixed(0)}, 큰길 찻길 위 ${r.major.toFixed(1)}명(${r.majorPct.toFixed(2)}%), 건물 안 ${r.building.toFixed(1)}, 도로 부지 밖 ${r.offLand.toFixed(1)}, ` +
        `보도 사람 가운데 보도 면 위 ${r.sideWalkPct.toFixed(1)}%, 차 평균 ${r.carV.toFixed(3)}m/s (${((performance.now() - t0) / 1000).toFixed(0)}초)`,
    );
    console.log(`  구역에서 나온 사람(실제/목표/차이%): ${r.zones.map((z) => z.join(' ')).join(', ')}`);
    console.log(`  참고, 구역 원 안에 있는 사람(실제/차이%): ${r.zonesAt.map((z) => z.join(' ')).join(', ')}`);
    console.log(`  큰길 찻길 위가 많은 25m 칸: ${r.hot.join(', ')}`);
    console.log(`  신호 횡단보도에 빨간불에 건너는 방향으로 들어섬 ${r.redEntry}회(다른 방향으로 지나감 ${r.redPass}회), 초록불에 들어서 건너는 중 빨간불 4초 넘게 ${r.midRed}명, 신호 교차로 밖에서 큰길 찻길에 들어섬 ${r.majorEntry}회(${MEAS}초)`);
    if (WHY) console.log(`  빨간불에 들어선 까닭: ${r.redWhy}`);
    if (WHY) for (const [k, v] of Object.entries(r.causes)) console.log(`  ${k} 까닭: ${v}`);
  }
