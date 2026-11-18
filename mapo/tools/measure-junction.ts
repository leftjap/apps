// 교차로·신호·차로 0 기준 측정(재작업 W20, 설계 문서 45절). 시험(test/w20-junction.test.ts)이 합정·홍대입구역 둘레로 잘라 부르고,
// 판 전체는 `node tools/measure-junction.ts [잴 초] [씨앗] [조건 번호|-] [all]` 로 잰다(all 이 없으면 시험과 같은 둘레).
// main.ts 와 같은 순서로 차·신호·버스를 만들고(사람은 돌리지 않는다) 1/30초 단계로 [버릴 초] 뒤 [잴 초] 동안 센다. 조건: 일 14:00·토 17:00·평일 08:30.
//  1 red     자기 움직임이 빨간불인데 게이트(차로 정지 자리)를 넘은 차. 움직임은 실제로 빠져나간 길로 정한다(Intersections.moveOf)
//  2 lane    진입로를 떠날 때의 차로가 실제 움직임을 허용하지 않음(Intersections.laneMoves, 나가는 길이 둘 이상인 진입로)
//  3 cross   게이트를 넘은 때부터 뒤꽁무니가 상자를 나갈 때까지 같은 교차로에 있던 두 차의 경로가 30° 넘게 가로지름
//    offPath 교차로 안 차 가운데가 제 차로 경로에서 0.5m 넘게 벗어남(중앙 정류장에서 비켜 서는 중앙버스차로 버스 빼고)
//  4 walk    보행 초록 횡단보도 면에 차 몸통이 걸침
//    stopXw  신호 횡단보도 면에 몸통이 걸친 채 선 차(속도 0.3m/s 아래, 신호와 상관없이. 재작업 W22)
//  5 center  상자 밖 양방향 길에서 차 몸 왼쪽이 중앙선(그 방향 찻길 왼쪽 가장자리)을 0.2m 넘게 넘음(중앙버스차로 버스 빼고)
//  6 side    한 단계(1/30초)에 옆으로 0.3m 넘게 움직임(지난 단계 방향 기준)
//  7 overlap 몸통 겹친 쌍(배율 1, 높이 2.5m 안, 3단계마다)
//  speed     평균 속도(m/s, 시험은 재기만 한다)
// 아래 셋은 셀 둘레(count)가 아니라 길을 남긴 둘레(keep)에서 50m 안쪽까지 1초마다 센다(재작업 W44, 설계 문서 58절). 땅 위(높이 1.5m 안) 차만 본다
//  stuck     10초 넘게 선 차 가운데 앞차 사슬 끝의 차에 까닭(신호·게이트·횡단보도·정류장·사람·돌발)이 없는 것(사슬 끝이 앞차 없이 서 있거나 사슬이 맞물림). 10초를 넘는 때 한 번 센다
//  offRoad   차 몸 네 모서리 가운데 하나가 그린 찻길 면(v2: 길 정본에서 구운 면 surface.json g, 재작업 W51. v1: 찻길 띠·교차로 면·분리대·그리기 전용 면·길 정본 차로 띠)에서 0.3m 넘게 밖인 차·초
//  onGore    차 몸 가운데나 모서리가 안전지대(빗금) 안인 차·초
import { readFileSync } from 'node:fs';
import { decodeSurface, tileRings } from '../src/data/surface.ts';
import { BOARD_R } from '../src/geo.ts';
import { bitsAt, fillBits, makeBits, type Bits } from './lib/bits.ts';
import { bandQuad, laneBands } from '../src/data/laneGround.ts';
import type { Edge } from '../src/sim/graph.ts';
import { decodeBoard, type Board, type Road } from '../src/data/board.ts';
import { decodeMarks } from '../src/data/marks.ts';
import { decodeLanes } from '../src/data/road.ts';
import { cumLen, pointAt } from '../src/poly.ts';
import { buildCarGraph, headingNear, leftEdge, MED } from '../src/sim/graph.ts';
import { GREEN, makeIntersections, RED, STRAIGHT } from '../src/sim/intersection/index.ts';
import { makeCars } from '../src/sim/cars.ts';
import { makeBusRoutes } from '../src/sim/buses.ts';
import { makeSimProvider } from '../src/sim/provider.ts';

export const CASES: [string, number, number][] = [
  ['일 14:00', 0, 14 * 3600],
  ['토 17:00', 6, 17 * 3600],
  ['평일 08:30', 2, 8.5 * 3600],
];
/** 시험 둘레: 합정역 사거리, 홍대입구역 사거리 */
export const CENTERS: [number, number][] = [
  [-491, 254],
  [222, -410],
];

export interface AuditOptions {
  /** 판 폴더(기본 public/data) */
  data?: string;
  seconds: number;
  warm?: number;
  seed?: number;
  cases?: number[];
  /** 길을 남길 둘레(m, 없으면 판 전체)와 셀 둘레(m) */
  keep?: number;
  count?: number;
}
export interface AuditResult {
  case: string;
  red: number;
  lane: number;
  cross: number;
  offPath: number;
  walk: number;
  stopXw: number;
  center: number;
  side: number;
  overlap: number;
  stuck: number;
  offRoad: number;
  onGore: number;
  speed: number;
  cars: number;
  passes: number;
  where: Record<string, string[]>;
}

function obb(ax: number, az: number, ay: number, al: number, aw: number, bx: number, bz: number, by: number, bl: number, bw: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  for (const t of [ay, ay + Math.PI / 2, by, by + Math.PI / 2]) {
    const ux = Math.cos(t);
    const uz = Math.sin(t);
    const ra = Math.abs(al * Math.cos(ay - t)) + Math.abs(aw * Math.sin(ay - t));
    const rb = Math.abs(bl * Math.cos(by - t)) + Math.abs(bw * Math.sin(by - t));
    if (Math.abs(dx * ux + dz * uz) >= ra + rb) return false;
  }
  return true;
}
const inRing = (r: ArrayLike<number>, x: number, z: number) => {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < r[i] + ((z - r[i + 1]) / (r[j + 1] - r[i + 1])) * (r[j] - r[i])) c = !c;
  return c;
};
const segX = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) => {
  const r1x = bx - ax, r1z = bz - az, r2x = dx - cx, r2z = dz - cz;
  const den = r1x * r2z - r1z * r2x;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((cx - ax) * r2z - (cz - az) * r2x) / den;
  const u = ((cx - ax) * r1z - (cz - az) * r1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 && Math.abs(den) / ((Math.hypot(r1x, r1z) || 1) * (Math.hypot(r2x, r2z) || 1)) > Math.sin(Math.PI / 6);
};
/** 차 몸통(회전 사각형)이 다각형과 겹치는가 */
function bodyInRing(x: number, z: number, yaw: number, hl: number, hw: number, ring: Float32Array): boolean {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const corner = (a: number, b: number) => [x + c * a - s * b, z + s * a + c * b];
  const pts = [corner(hl, hw), corner(hl, -hw), corner(-hl, -hw), corner(-hl, hw)];
  if (pts.some(([px, pz]) => inRing(ring, px, pz)) || inRing(ring, x, z)) return true;
  for (let k = 0; k < ring.length; k += 2) {
    const lx = (ring[k] - x) * c + (ring[k + 1] - z) * s;
    const lz = -(ring[k] - x) * s + (ring[k + 1] - z) * c;
    if (Math.abs(lx) < hl && Math.abs(lz) < hw) return true;
  }
  return false;
}

/** 그린 찻길 면(비트 1: v2 는 surface.json g, v1 은 찻길 띠·교차로 면·분리대·그리기 전용 면과 길 정본 차로 띠)과 안전지대(비트 2) 칸 격자(0.25m). 판 폴더마다 한 번 만든다 */
const groundCache = new Map<string, Bits>();
export function groundBits(DATA: string, g: Edge[], keep?: number, cell = 0.25): Bits {
  const key = `${DATA}|${g.length}|${keep ?? 0}|${cell}`;
  const hit = groundCache.get(key);
  if (hit) return hit;
  const data = (f: string) => JSON.parse(readFileSync(`${DATA}/${f}`, 'utf8'));
  const sf = decodeSurface(data('surface.json'));
  const sp = data('surface-polys.json') as { car: number[][]; med: number[][]; draw: number[][] };
  const dm = (a: number[]) => Float32Array.from(a, (v) => v / 10);
  // 길을 남긴 둘레만 덮는다(판 전체 0.25m 칸은 256MB)
  const xs = CENTERS.map(([x]) => x), zs = CENTERS.map(([, z]) => z);
  const B = keep ? makeBits(Math.min(...xs) - keep, Math.min(...zs) - keep, Math.max(...xs) + keep, Math.max(...zs) + keep, cell) : makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, cell);
  if (sf.ground.length) {
    // v2(재작업 W51): 앱이 그리는 찻길 면은 길 정본에서 구운 면 하나(surface.json g)다
    for (const t of tileRings(sf.ground)) fillBits(B, t.rings, 1);
  } else {
    for (const c of sp.car) fillBits(B, [dm(c.slice(1))], 1);
    for (const f of sf.faces) fillBits(B, [f.outer, ...f.holes], 1);
    for (const f of sf.draw) fillBits(B, [f.outer], 1);
    for (const m of sp.med) fillBits(B, [dm(m)], 1);
    for (const d of sp.draw) fillBits(B, [dm(d)], 1);
    for (const { sec } of laneBands(g)) for (let k = 0; k + 1 < sec.length / 4; k++) fillBits(B, [bandQuad(sec, k)], 1);
  }
  for (const z of decodeMarks(data('marks.json')).zones) fillBits(B, [z.ring], 2);
  groundCache.set(key, B);
  return B;
}
export const onBit = (B: Bits, x: number, z: number, bit: number, tol: number) => {
  if (bitsAt(B, x, z) & bit) return true;
  for (let k = 0; k < 8; k++) if (bitsAt(B, x + Math.cos((k * Math.PI) / 4) * tol, z + Math.sin((k * Math.PI) / 4) * tol) & bit) return true;
  return false;
};

/** 둘레 안 길만 남긴 판(번호는 그대로, 둘레 밖 조각은 빈 조각)과 노선(둘레 안 가장 긴 연속 부분) */
function clip(board: Board, keep: number): Board {
  const inside = (r: Road) => {
    for (let k = 0; k < r.p.length; k += 3) if (CENTERS.some(([x, z]) => Math.hypot(r.p[k] - x, r.p[k + 2] - z) < keep)) return true;
    return false;
  };
  const ok = board.roads.map(inside);
  const roads = board.roads.map((r, i) => (ok[i] ? r : { ...r, p: new Float32Array(0) }));
  const len = board.roads.map((r) => (r.p.length >= 6 ? cumLen(r.p)[r.p.length / 3 - 1] : 0));
  const buses = board.buses.flatMap((run) => {
    let best: [number, number] = [0, 0];
    for (let a = 0; a < run.segs.length; ) {
      if (!ok[Math.abs(run.segs[a]) - 1]) {
        a++;
        continue;
      }
      let b = a;
      while (b < run.segs.length && ok[Math.abs(run.segs[b]) - 1]) b++;
      if (b - a > best[1] - best[0]) best = [a, b];
      a = b;
    }
    if (best[1] - best[0] < 2) return [];
    let off = 0;
    for (let k = 0; k < best[0]; k++) off += len[Math.abs(run.segs[k]) - 1];
    let total = 0;
    for (let k = best[0]; k < best[1]; k++) total += len[Math.abs(run.segs[k]) - 1];
    const keepS = run.stops.map((s, i) => [s - off, i] as [number, number]).filter(([s]) => s >= 0 && s < total);
    return [{ ...run, segs: run.segs.slice(best[0], best[1]), stops: keepS.map(([s]) => s), stopNames: keepS.map(([, i]) => run.stopNames[i]) }];
  });
  return { ...board, roads, buses };
}

/** 시험과 같은 판·차를 만든다(조건 k) */
export function setup(o: AuditOptions, k: number) {
  const DATA = o.data ?? new URL('../public/data/', import.meta.url).pathname;
  const data = (f: string) => JSON.parse(readFileSync(`${DATA}/${f}`, 'utf8'));
  const full = decodeBoard(data('board.json'));
  const board = o.keep ? clip(full, o.keep) : full;
  const [name, dow, tod] = CASES[k];
  const g = buildCarGraph(board.roads, decodeLanes(data('road.json').lanes), decodeMarks(data('marks.json')).arrows);
  const inter = makeIntersections(g, { crosswalks: board.crosswalks, stopLines: board.stopLines, lamps: data('signals.json') });
  const busy = new Uint32Array(board.crosswalks.length);
  const sim = makeCars(g, makeSimProvider(), o.seed ?? 11, 5000, makeBusRoutes(board.buses, g, undefined, board.crosswalks), inter, { list: board.crosswalks, busy });
  const start = { tod, dow, doy: 320 };
  const cx = o.keep ? (CENTERS[0][0] + CENTERS[1][0]) / 2 : 0;
  const cz = o.keep ? (CENTERS[0][1] + CENTERS[1][1]) / 2 : 0;
  sim.setFocus(cx, cz, o.keep ? 1200 : 2200, () => false);
  sim.fill(sim.target(start));
  sim.fillBuses(start);
  return { name, board, g, inter, sim, start };
}

export function audit(o: AuditOptions): AuditResult[] {
  const out: AuditResult[] = [];
  for (const k of o.cases ?? [0, 1, 2]) {
    const { name, board, g, inter, sim, start } = setup(o, k);
    const { X, S } = inter;
    const c = sim.cars;
    const D = sim.debug();
    const counted = (x: number, z: number) => !o.count || CENTERS.some(([px, pz]) => Math.hypot(x - px, z - pz) < o.count!);
    const res: AuditResult = { case: name, red: 0, lane: 0, cross: 0, offPath: 0, walk: 0, stopXw: 0, center: 0, side: 0, overlap: 0, stuck: 0, offRoad: 0, onGore: 0, speed: 0, cars: 0, passes: 0, where: {} };
    const GB = groundBits(o.data ?? new URL('../public/data/', import.meta.url).pathname, g, o.keep);
    const wide = (x: number, z: number) => !o.keep || CENTERS.some(([px, pz]) => Math.hypot(x - px, z - pz) < o.keep! - 50);
    const stopT = new Map<number, number>();
    const note = (kind: keyof AuditResult, x: number, z: number, info = '') => {
      (res[kind] as number)++;
      const w = (res.where[kind] ??= []);
      if (w.length < 12) w.push(`${Math.round(x)},${Math.round(z)}${info ? ' ' + info : ''}`);
    };
    // 양방향 길 구간
    const twoWay = new Uint8Array(g.length);
    const dirs = new Map<number, number>();
    for (const e of g) dirs.set(e.road, (dirs.get(e.road) ?? 0) | (e.rev ? 2 : 1));
    for (const e of g) twoWay[e.id] = dirs.get(e.road) === 3 ? 1 : 0;
    // 차마다 교차로 통과 기록
    type Pass = { j: number; a: number; lane: number; t0: number; t1: number; state: number[]; line: boolean; x: number; z: number; pts: number[]; x1: number; done: boolean; sim?: number };
    const pass = new Map<number, Pass>();
    const passes: (Pass & { path: number })[] = [];
    const last = new Map<number, { e: number; s: number; x: number; z: number; yaw: number; lane: number }>();
    const DT = 1 / 30;
    const warm = o.warm ?? 30;
    const steps = Math.round((warm + o.seconds) / DT);
    let now = { ...start };
    let spSum = 0;
    let spN = 0;
    const P = [0, 0, 0];
    const xwSig = board.crosswalks.map((_, i) => i).filter((i) => S.crossSite[i] >= 0);
    for (let st = 0; st < steps; st++) {
      now = { ...now, tod: (now.tod + DT) % 86400 };
      sim.step(DT, now);
      const T = st * DT;
      const on = T >= warm;
      const seen = new Set<number>();
      for (let i = 0; i < c.n; i++) {
        const u = c.uid[i];
        seen.add(u);
        const e = g[D.edge[i]];
        const s = D.s[i];
        const ln = D.lane[i];
        const front = s + D.size[i] / 2;
        const p = last.get(u);
        last.set(u, { e: e.id, s, x: c.x[i], z: c.z[i], yaw: c.yaw[i], lane: ln });
        if (!p) continue;
        const cnt = on && counted(c.x[i], c.z[i]);
        // 6 옆 이동
        if (cnt) {
          const dx = c.x[i] - p.x;
          const dz = c.z[i] - p.z;
          const lat = Math.abs(-dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw));
          if (lat > 0.3) note('side', c.x[i], c.z[i], `${lat.toFixed(2)} e${e.id}`);
        }
        // 1·2·3 게이트를 넘음
        const J = X.jEnd[e.id];
        const isAp = (J >= 0 && X.jStart[e.id] !== J) || S.midApproach.has(e.id);
        if (isAp && p.e === e.id) {
          const line = e.len - X.gate(e.id, ln);
          if (p.s + D.size[i] / 2 <= line && front > line && !pass.has(u)) {
            const ap = S.approach.get(e.id);
            pass.set(u, { j: J, a: e.id, lane: ln, t0: T, t1: -1, state: ap ? [1, 2, 4, 8].map((m) => S.state(e.id, m, now.tod)) : [GREEN, GREEN, GREEN, GREEN], line: true, x: c.x[i], z: c.z[i], pts: [], x1: -1, done: false });
          }
        }
        // 진입로를 떠남: 차로 기록(게이트를 넘지 않고 지나간 차도)
        if (p.e !== e.id && X.jEnd[p.e] >= 0 && X.jStart[p.e] !== X.jEnd[p.e] && !pass.has(u)) {
          // 게이트를 넘는 단계에 구간도 바뀐 차
          const ap = S.approach.get(p.e);
          pass.set(u, { j: X.jEnd[p.e], a: p.e, lane: p.lane, t0: T, t1: -1, state: ap ? [1, 2, 4, 8].map((m) => S.state(p.e, m, now.tod)) : [GREEN, GREEN, GREEN, GREEN], line: true, x: c.x[i], z: c.z[i], pts: [], x1: -1, done: false });
        }
        const ps = pass.get(u);
        if (ps && p.e === ps.a && e.id === ps.a) ps.lane = ln;
        if (ps && ps.sim === undefined) ps.sim = D.jp[i] >= 0 ? D.jp[i] : D.pp[i];
        if (ps && ps.j >= 0) {
          // 경로 위(진입로 상자 가장자리부터 나가는 길 상자 끝까지)에 있을 때만
          const onPath = (e.id === ps.a ? s > e.len - X.rIn[e.id] : true) && !(X.jStart[e.id] === ps.j && X.jEnd[e.id] !== ps.j && s > X.rOut[e.id]);
          if (st % 3 === 0 && onPath) ps.pts.push(c.x[i], c.z[i]);
          // 나가는 길에 올라섬
          if (ps.x1 < 0 && X.jStart[e.id] === ps.j && X.jEnd[e.id] !== ps.j) ps.x1 = e.id;
          if (ps.x1 >= 0 && (e.id !== ps.x1 || s - D.size[i] / 2 > X.rOut[e.id])) ps.done = true;
        } else if (ps && ps.j < 0 && e.id !== ps.a) ps.done = true;
        if (ps && ps.done) {
          pass.delete(u);
          ps.t1 = T;
          if (!on || !counted(ps.x, ps.z)) continue;
          res.passes++;
          if (ps.j < 0) {
            if (ps.state[1] === RED) note('red', ps.x, ps.z, `mid e${ps.a}`);
            continue;
          }
          const mv = X.moveOf(ps.a, ps.x1);
          if (ps.state[[1, 2, 4, 8].indexOf(mv)] === RED && S.approach.has(ps.a)) note('red', ps.x, ps.z, `e${ps.a} l${ps.lane} m${mv}`);
          const ex = X.exits.get(ps.a)!;
          if (ex.length > 1 && !(X.laneMoves(ps.a, ps.lane) & mv)) note('lane', ps.x, ps.z, `e${ps.a} l${ps.lane} m${mv} ok${X.laneMoves(ps.a, ps.lane)}`);
          const k = ex.findIndex((q) => q.edges[q.edges.length - 1] === ps.x1);
          const path = k >= 0 ? X.path(ps.a, ps.lane, k) : undefined;
          if (path) {
            // 경로를 벗어남
            let worst = 0;
            for (let q = 0; q < ps.pts.length; q += 2) {
              let best = Infinity;
              // 경로 꺾은선의 선분까지 거리(경로 점은 구간 거리 0.5m 간격이라 휘는 곳에서는 점 사이가 더 벌어진다)
              const pp = path.pts;
              for (let m = 0; m + 4 < pp.length; m += 4) {
                const ax = pp[m], az = pp[m + 2], bx = pp[m + 4], bz = pp[m + 6];
                const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1e-9;
                const t = Math.max(0, Math.min(1, ((ps.pts[q] - ax) * (bx - ax) + (ps.pts[q + 1] - az) * (bz - az)) / l2));
                best = Math.min(best, Math.hypot(ax + t * (bx - ax) - ps.pts[q], az + t * (bz - az) - ps.pts[q + 1]));
              }
              worst = Math.max(worst, best);
            }
            // 중앙버스차로 버스는 중앙 정류장 둘레에서 승강장 폭만큼 비켜 서므로(설계 문서 19절) 경로 이탈로 세지 않는다
            if (worst > 0.5 && ps.pts.length && ps.lane !== MED) note('offPath', ps.x, ps.z, `e${ps.a} ${worst.toFixed(2)} p${path.id} sim${ps.sim} l${ps.lane}`);
            passes.push({ ...ps, path: path.id });
          }
        }
        if (!cnt) continue;
        // 5 중앙선
        const jb = (X.jEnd[e.id] >= 0 && s > e.len - X.rIn[e.id]) || (X.jStart[e.id] >= 0 && s < X.rOut[e.id]);
        if (!jb && twoWay[e.id] && ln !== MED && s > X.rOut[e.id] && s < e.len - X.rIn[e.id]) {
          pointAt(e.p, e.cum, s, P);
          const h = headingNear(e, s);
          const lat = (c.x[i] - P[0]) * -Math.sin(h) + (c.z[i] - P[2]) * Math.cos(h);
          const left = lat - D.wid[i] * Math.abs(Math.cos(c.yaw[i] - h)) - (D.size[i] / 2) * Math.abs(Math.sin(c.yaw[i] - h));
          if (left < leftEdge(e, s) - 0.2) note('center', c.x[i], c.z[i], `e${e.id} ${(leftEdge(e, s) - left).toFixed(2)}`);
        }
      }
      for (const u of [...last.keys()]) if (!seen.has(u)) last.delete(u);
      for (const u of [...pass.keys()]) if (!seen.has(u)) pass.delete(u);
      if (!on) continue;
      // 4 보행 초록 횡단보도, 횡단보도 위에 선 차
      if (st % 3 === 0)
        for (const x of xwSig) {
          const green = S.walkState(x, now.tod) === GREEN;
          const cw = board.crosswalks[x];
          if (!counted(cw.x, cw.z)) continue;
          for (let i = 0; i < c.n; i++) {
            if (!green && D.v[i] >= 0.3) continue;
            if (Math.abs(c.x[i] - cw.x) > cw.half + 8 || Math.abs(c.z[i] - cw.z) > cw.half + 8) continue;
            if (!cw.rings.some((r) => bodyInRing(c.x[i], c.z[i], c.yaw[i], D.size[i] / 2, D.wid[i], r))) continue;
            if (green) note('walk', c.x[i], c.z[i], `xw${x} e${D.edge[i]} v${D.v[i].toFixed(1)}`);
            if (D.v[i] < 0.3) note('stopXw', c.x[i], c.z[i], `xw${x} e${D.edge[i]}`);
          }
        }
      // 7 겹침
      if (st % 3 === 0) {
        const cell = new Map<number, number[]>();
        for (let i = 0; i < c.n; i++) {
          const k = Math.floor(c.x[i] / 10) * 4096 + Math.floor(c.z[i] / 10);
          (cell.get(k) ?? cell.set(k, []).get(k)!).push(i);
        }
        for (let i = 0; i < c.n; i++) {
          if (!counted(c.x[i], c.z[i])) continue;
          const gx = Math.floor(c.x[i] / 10), gz = Math.floor(c.z[i] / 10);
          for (let dx = -1; dx <= 1; dx++)
            for (let dz = -1; dz <= 1; dz++)
              for (const j of cell.get((gx + dx) * 4096 + gz + dz) ?? []) {
                if (j <= i || Math.abs(c.y[i] - c.y[j]) > 2.5) continue;
                if (obb(c.x[i], c.z[i], c.yaw[i], D.size[i] / 2, D.wid[i], c.x[j], c.z[j], c.yaw[j], D.size[j] / 2, D.wid[j])) note('overlap', c.x[i], c.z[i], `e${D.edge[i]}/${D.edge[j]}`);
              }
        }
      }
      // stuck·offRoad·onGore(재작업 W44)
      if (st % 30 === 0) {
        for (let i = 0; i < c.n; i++) {
          const u = c.uid[i];
          const t = D.v[i] < 0.3 ? (stopT.get(u) ?? 0) + 1 : 0;
          stopT.set(u, t);
          if (Math.abs(c.y[i]) > 1.5 || !wide(c.x[i], c.z[i])) continue;
          if (t === 11) {
            let r = i;
            const seenR = new Set<number>([i]);
            let cyc = false;
            for (let h = 0; h < 60; h++) {
              const q = D.ahead[r];
              if (q < 0 || q === r) break;
              if (seenR.has(q)) {
                cyc = true;
                break;
              }
              seenR.add(q);
              r = q;
            }
            if (cyc || (D.ahead[r] < 0 && D.dwell[r] <= 0 && D.v[r] < 0.3)) note('stuck', c.x[r], c.z[r], `${cyc ? 'cycle' : 'none'} e${D.edge[r]} l${D.lane[r]} u${c.uid[r]}${D.blockBy[r] >= 0 ? ' by e' + D.edge[D.blockBy[r]] : ''}`);
          }
          const hx = Math.cos(c.yaw[i]), hz = Math.sin(c.yaw[i]);
          const hl = D.size[i] / 2, hw = D.wid[i];
          let out = false, gore = (bitsAt(GB, c.x[i], c.z[i]) & 2) !== 0;
          for (const [a, b] of [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw]]) {
            const px = c.x[i] + hx * a - hz * b, pz = c.z[i] + hz * a + hx * b;
            if (!onBit(GB, px, pz, 1, 0.3)) out = true;
            if (bitsAt(GB, px, pz) & 2) gore = true;
          }
          if (out) note('offRoad', c.x[i], c.z[i], `e${D.edge[i]} l${D.lane[i]}`);
          if (gore) note('onGore', c.x[i], c.z[i], `e${D.edge[i]} l${D.lane[i]}`);
        }
      }
      if (st % 30 === 0) {
        let sum = 0;
        let n = 0;
        for (let i = 0; i < c.n; i++) if (counted(c.x[i], c.z[i])) (sum += D.v[i]), n++;
        spSum += n ? sum / n : 0;
        spN++;
        res.cars += n;
      }
    }
    // 3 가로지르는 두 경로가 같은 때 교차로 안
    passes.sort((a, b) => a.t0 - b.t0);
    for (let a = 0; a < passes.length; a++)
      for (let b = a + 1; b < passes.length && passes[b].t0 < passes[a].t1; b++) {
        const A = passes[a];
        const B = passes[b];
        if (A.j !== B.j || A.path === B.path) continue;
        const pa = X.paths[A.path].pts;
        const pb = X.paths[B.path].pts;
        let hit = false;
        for (let i = 0; !hit && i + 4 < pa.length; i += 4)
          for (let k = 0; k + 4 < pb.length; k += 4)
            if (segX(pa[i], pa[i + 2], pa[i + 4], pa[i + 6], pb[k], pb[k + 2], pb[k + 4], pb[k + 6])) {
              hit = true;
              break;
            }
        if (hit) note('cross', A.x, A.z, `e${A.a}l${A.lane}/e${B.a}l${B.lane}`);
      }
    res.speed = +(spSum / Math.max(1, spN)).toFixed(3);
    res.cars = Math.round(res.cars / Math.max(1, spN));
    out.push(res);
  }
  return out;
}

if (process.argv[1]?.endsWith('measure-junction.ts')) {
  const seconds = Number(process.argv[2] ?? 300);
  const seed = Number(process.argv[3] ?? 11);
  const only = process.argv[4] === undefined || process.argv[4] === '-' ? undefined : [Number(process.argv[4])];
  const all = process.argv[5] === 'all';
  for (const k of only ?? [0, 1, 2]) {
    const [r] = audit({ data: process.env.MAPO_DATA, seconds, seed, cases: [k], keep: all ? undefined : 450, count: all ? undefined : 300 });
    console.log(JSON.stringify(r));
  }
}
