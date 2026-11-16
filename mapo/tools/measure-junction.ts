// 교차로·신호·차로 0 기준 측정(재작업 W20, 설계 문서 45절). 시험(test/w20-junction.test.ts)이 합정·홍대입구역 둘레로 잘라 부르고,
// 판 전체는 `node tools/measure-junction.ts [잴 초] [씨앗] [조건 번호|-] [all]` 로 잰다(all 이 없으면 시험과 같은 둘레).
// main.ts 와 같은 순서로 차·신호·버스를 만들고(사람은 돌리지 않는다) 1/30초 단계로 [버릴 초] 뒤 [잴 초] 동안 센다. 조건: 일 14:00·토 17:00·평일 08:30.
//  1 red     자기 움직임이 빨간불인데 게이트(차로 정지 자리)를 넘은 차. 움직임은 실제로 빠져나간 길로 정한다(Intersections.moveOf)
//  2 lane    진입로를 떠날 때의 차로가 실제 움직임을 허용하지 않음(Intersections.laneMoves, 나가는 길이 둘 이상인 진입로)
//  3 cross   게이트를 넘은 때부터 뒤꽁무니가 상자를 나갈 때까지 같은 교차로에 있던 두 차의 경로가 30° 넘게 가로지름
//    offPath 교차로 안 차 가운데가 제 차로 경로에서 0.5m 넘게 벗어남(중앙 정류장에서 비켜 서는 중앙버스차로 버스 빼고)
//  4 walk    보행 초록 횡단보도 면에 차 몸통이 걸침
//  5 center  상자 밖 양방향 길에서 차 몸 왼쪽이 중앙선(그 방향 찻길 왼쪽 가장자리)을 0.2m 넘게 넘음(중앙버스차로 버스 빼고)
//  6 side    한 단계(1/30초)에 옆으로 0.3m 넘게 움직임(지난 단계 방향 기준)
//  7 overlap 몸통 겹친 쌍(배율 1, 높이 2.5m 안, 3단계마다)
//  speed     평균 속도(m/s, 시험은 재기만 한다)
import { readFileSync } from 'node:fs';
import { decodeBoard, type Board, type Road } from '../src/data/board.ts';
import { decodeMarks } from '../src/data/marks.ts';
import { decodeLanes } from '../src/data/lanes.ts';
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
  center: number;
  side: number;
  overlap: number;
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
  const g = buildCarGraph(board.roads, decodeLanes(data('lanes.json')), decodeMarks(data('marks.json')).arrows);
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
    const res: AuditResult = { case: name, red: 0, lane: 0, cross: 0, offPath: 0, walk: 0, center: 0, side: 0, overlap: 0, speed: 0, cars: 0, passes: 0, where: {} };
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
      // 4 보행 초록 횡단보도
      if (st % 3 === 0)
        for (const x of xwSig) {
          if (S.walkState(x, now.tod) !== GREEN) continue;
          const cw = board.crosswalks[x];
          if (!counted(cw.x, cw.z)) continue;
          for (let i = 0; i < c.n; i++) {
            if (Math.abs(c.x[i] - cw.x) > cw.half + 8 || Math.abs(c.z[i] - cw.z) > cw.half + 8) continue;
            if (cw.rings.some((r) => bodyInRing(c.x[i], c.z[i], c.yaw[i], D.size[i] / 2, D.wid[i], r))) note('walk', c.x[i], c.z[i], `xw${x} e${D.edge[i]}`);
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
