// 걷는 길 그래프 굽기(public/data/walk.json). 보행자가 걷는 선을 길 가운데선에서 띄운 띠가 아니라 땅 위 면에서 정한다.
// ① 큰길 보도: 보도 면(surface-polys.json 의 walk)을 0.5m 칸으로 칠해 가늘게 깎은(Zhang–Suen) 뼈대 선. 선마다 양옆으로 보도 면 경계까지 남는 폭을 걷는 띠로 둔다
//    (좁은 보도는 한 줄, 넓은 광장은 퍼져 걷는다).
// ② 보도 없는 골목(등급 4·5): 가운데선을 큰길 찻길(끝까지 그린 띠·분리대·큰길 교차로 면 가운데 골목 띠 밖, 교통섬은 보도 면으로 친다)에 들어서는 자리에서 끊는다.
//    걷는 띠는 골목 폭 전체: 1.5m 마다 옆으로 쏜 선이 건물 벽(0.7m 앞)·큰길 찻길에 닿거나 찻길 가장자리 밖에서 도로 부지를 벗어나는 곳(0.3m 앞)까지, 가장자리 + 3m 까지.
//    골목이 건물 외곽선을 지나는 곳은 끊는다.
// ③ 도로 부지 밖 보행로(등급 6·7, 공원 길·숲길): 도로 부지·큰길 찻길·건물 밖 부분만 쓴다(도로 부지 안 보도는 ①이 맡는다).
// ④ 끝점 잇기: 끝점마다 8m 안의 다른 선 가운데 큰길 찻길·건물·횡단보도 면을 지나지 않고 곧게 닿는 가장 가까운 점에 잇는다(골목 어귀, 끊긴 보도 끝).
// ⑤ 횡단보도: 축 양 끝에서 바깥으로 큰길 찻길·횡단보도 면을 벗어난 자리(기다리는 자리, 축 위에 없으면 끝에서 5m 안 빈자리)를 정하고, 거기서 곧게 닿는 가장 가까운 선 위 점에 잇는다.
import { curbAt, GK, type Board, type Road } from '../../src/data/board.ts';
import { carriageSections, isGroundRoad, roadJoints } from '../../src/data/surface.ts';
import { underpasses, ZONES } from '../../src/sim/people/zones.ts';
import { ALLEY, LINK, LINK_N, PATH, SIDEWALK, type WalkJson } from '../../src/sim/walknet.ts';
import { BOARD_R } from '../../src/geo.ts';
import { bitsAt, fillBits, makeBits, type Bits } from './bits.ts';

/** 붐비는 길(사람이 더 많이 고른다) */
const HOT = /경의선|레드로드|어울마당|홍익로|와우산로|잔다리로|독막로|동교로|성미산로|양화로|월드컵로|연남로|한강|포은로|망원로|희우정로/;

/**
 * 판 자료로 걷는 길 그래프를 굽는다. faces 는 교차로 면, draw 는 그리기 전용 찻길 면 고리, polys 는 surfacePolys 결과(m)
 */
export function boardWalkNet(
  b: Board,
  faces: { cls: number; outer: ArrayLike<number>; holes: ArrayLike<number>[] }[],
  draw: ArrayLike<number>[],
  polys: { car: [number, ArrayLike<number>][]; med: ArrayLike<number>[]; isl: ArrayLike<number>[]; walk: ArrayLike<number>[] },
  onCross?: WalkInput['onCross'],
): WalkJson {
  const joints = roadJoints(b.roads);
  // 길 조각 띠를 교차로를 지나 끝까지 그린 것
  const full = (i: number) => {
    const s = carriageSections(b.roads[i], 0, Infinity, joints.subarray(i * 4, i * 4 + 4));
    return [...s.flatMap((q) => [q.lx, q.lz]), ...s.reverse().flatMap((q) => [q.rx, q.rz])];
  };
  const major: number[][][] = [];
  const alleys: number[][][] = [];
  b.roads.forEach((r, i) => {
    if (isGroundRoad(r)) (r.cls <= 3 ? major : alleys).push([full(i)]);
  });
  return buildWalkNet({
    bounds: [-BOARD_R, -BOARD_R, BOARD_R, BOARD_R],
    // 교통섬은 사람이 서서 건너는 곳이라 보도 면으로 친다
    walk: [polys.walk, ...polys.isl.map((m) => [m])],
    hardFaces: faces.filter((f) => f.cls <= 3).map((f) => [f.outer, ...f.holes]),
    softAlleys: alleys,
    hard: [...major, ...polys.med.map((m) => [m])],
    refuge: polys.med.map((m) => [m]),
    land: [
      ...b.groundAreas.filter((a) => a.kind === GK.ROADSIDE || a.kind === GK.PLAZA).map((a) => [a.outer, ...a.holes]),
      ...polys.car.map(([, r]) => [r]),
      ...faces.map((f) => [f.outer, ...f.holes]),
      ...draw.map((r) => [r]),
      ...polys.med.map((m) => [m]),
    ],
    buildings: b.buildings.map((q) => q.pts),
    roads: b.roads,
    crosswalks: b.crosswalks,
    paint: draw,
    tunnels: underpasses(b.roads, ...ZONES.mangwon),
    hot: HOT,
    onCross,
  });
}

export interface WalkInput {
  /** 판 범위 [x0, z0, x1, z1](m) */
  bounds: [number, number, number, number];
  /** 보도 면(도형마다 고리들, 짝홀) */
  walk: ArrayLike<number>[][];
  /** 보도 면에서 뺄 도형(도형마다 고리들) */
  notWalk?: ArrayLike<number>[][];
  /** 큰길 교차로 면(도형마다 고리들)과, 그 가운데 큰길 찻길로 치지 않는 골목 띠 */
  hardFaces: ArrayLike<number>[][];
  softAlleys: ArrayLike<number>[][];
  /** 큰길 찻길 띠(교차로를 지나 끝까지)·분리대 */
  hard: ArrayLike<number>[][];
  /** 분리대: 건너는 선이 지나도 칠 밖 찻길로 치지 않는다(칠이 분리대에서 끊긴 횡단보도) */
  refuge?: ArrayLike<number>[][];
  /** 도로 부지(도시생태현황도 도로 부지·광장과 찻길 면) */
  land: ArrayLike<number>[][];
  buildings: ArrayLike<number>[];
  /** 골목·보행로를 고를 길 조각 */
  roads: Road[];
  /** 횡단보도(rings 는 칠한 면). 칠한 면과 paint 는 기다리는 자리·잇는 선이 들어가지 않는다(횡단보도 연결로만 건넌다) */
  crosswalks: { x: number; z: number; ux: number; uz: number; half: number; wid: number; rings?: ArrayLike<number>[] }[];
  /** 횡단보도 밑 그리기 전용 찻길 면 */
  paint?: ArrayLike<number>[];
  /** 보행로가 자동차 전용도로 밑을 지나는 곳: 둘레 20m 안에서는 끊지 않는다 */
  tunnels?: [number, number][];
  /** 붐비는 길 이름 */
  hot?: RegExp;
  /** 횡단보도마다 이어졌는지와, 안 이어졌으면 그 끝(E0 쪽 a, E1 쪽 b)의 까닭(측정용) */
  onCross?: (xw: number, why: string | null) => void;
}

const WALK = 1;
const HARD = 2;
const LAND = 4;
const BLDG = 8;
const XW = 16;
const MED = 32;
const CELL = 0.5;
const REACH = 8; // 끝점·횡단보도를 이을 가장 먼 거리(m)

export function buildWalkNet(inp: WalkInput): WalkJson {
  const [x0, z0, x1, z1] = inp.bounds;
  const B = makeBits(x0, z0, x1, z1, CELL);
  for (const s of inp.walk) fillBits(B, s, WALK);
  for (const s of inp.notWalk ?? []) fillBits(B, s, WALK, true);
  for (const s of inp.hardFaces) fillBits(B, s, HARD);
  for (const s of inp.softAlleys) fillBits(B, s, HARD, true);
  for (const s of inp.hard) fillBits(B, s, HARD);
  for (const s of inp.land) fillBits(B, s, LAND);
  for (const s of inp.walk) fillBits(B, s, LAND);
  for (const b of inp.buildings) fillBits(B, [b], BLDG);
  for (const c of inp.crosswalks) for (const r of c.rings ?? []) fillBits(B, [r], XW);
  for (const r of inp.paint ?? []) fillBits(B, [r], XW);
  for (const s of inp.refuge ?? []) fillBits(B, s, MED);
  const hot = inp.hot ?? /$^/;
  const tunnels = inp.tunnels ?? [];
  const nearTunnel = (x: number, z: number) => tunnels.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 20);

  // ── 그래프 ──
  const nodes: number[] = [];
  const edges: { a: number; b: number; kind: number; cls: number; hot: boolean; lo: number; hi: number }[] = [];
  const keyed = new Map<string, number>();
  const node = (x: number, z: number) => (nodes.push(x, z), nodes.length / 2 - 1);
  const shared = (x: number, z: number) => {
    const k = `${Math.round(x * 10)},${Math.round(z * 10)}`;
    let n = keyed.get(k);
    if (n === undefined) keyed.set(k, (n = node(x, z)));
    return n;
  };
  const edge = (a: number, b: number, kind: number, cls: number, isHot: boolean, lo: number, hi: number) => {
    if (a !== b) edges.push({ a, b, kind, cls, hot: isHot, lo, hi });
  };

  // ① 보도 뼈대
  sidewalks(B, (pts, widths) => {
    let prev = -1;
    let at = 0;
    const keep = simplify(pts, 0.2);
    for (const k of keep) {
      const n = k === 0 && pts.ref0 >= 0 ? pts.ref0 : k === pts.length / 2 - 1 && pts.ref1 >= 0 ? pts.ref1 : node(pts[k * 2], pts[k * 2 + 1]);
      if (k === 0 && pts.ref0 < 0) pts.ref0 = n;
      if (k === 0 && pts.loop) pts.ref1 = n;
      if (k === pts.length / 2 - 1 && pts.ref1 < 0) pts.ref1 = n;
      if (prev >= 0) {
        let w = Infinity;
        for (let q = at; q <= k; q++) w = Math.min(w, widths[q]);
        const b = Math.max(0, Math.min(8, w - 0.75));
        edge(prev, n, SIDEWALK, 3, false, -b, b);
      }
      prev = n;
      at = k;
    }
  });

  // ②·③ 골목·보행로
  const ray = (x: number, z: number, nx: number, nz: number, curb: number, stop = BLDG | HARD): [number, boolean] => {
    for (let d = 0.25; d <= 8; d += 0.25) {
      const f = bitsAt(B, x + nx * d, z + nz * d);
      if (f & stop) return [d, true];
      if (d > curb && !(f & (LAND | WALK))) return [d, false];
    }
    return [8, false];
  };
  for (const r of inp.roads) {
    if (r.cls < 4 || r.bridge) continue;
    let top = 0;
    for (let i = 1; i < r.p.length; i += 3) top = Math.max(top, r.p[i]);
    if (top > 1) continue;
    const alley = r.cls <= 5;
    const blocked = (x: number, z: number) => {
      if (nearTunnel(x, z)) return false;
      const f = bitsAt(B, x, z);
      return alley ? (f & (HARD | BLDG)) !== 0 : (f & (HARD | LAND | BLDG | WALK)) !== 0;
    };
    // 길을 0.5m 마다 찍어 막히지 않은 구간만 쓴다
    const P = r.p;
    const n = P.length / 3;
    const S = [0];
    for (let i = 1; i < n; i++) S.push(S[i - 1] + Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 2] - P[i * 3 - 1]));
    const len = S[n - 1];
    const at = (s: number): [number, number] => {
      let k = 0;
      while (k + 2 < n && S[k + 1] < s) k++;
      const t = Math.max(0, Math.min(1, (s - S[k]) / (S[k + 1] - S[k] || 1)));
      return [P[k * 3] + (P[k * 3 + 3] - P[k * 3]) * t, P[k * 3 + 2] + (P[k * 3 + 5] - P[k * 3 + 2]) * t];
    };
    const marks: number[] = [];
    for (let s = 0; s < len; s += 0.5) marks.push(s);
    marks.push(len);
    const runs: [number, number][] = [];
    let open = -1;
    marks.forEach((s, q) => {
      const free = !blocked(...at(s));
      if (free && open < 0) open = s;
      if ((!free || q === marks.length - 1) && open >= 0) {
        const end = free ? s : marks[q - 1];
        if (end - open >= (alley ? 1 : 2)) runs.push([open, end]);
        open = -1;
      }
    });
    for (const [sa, sb] of runs) {
      const pts: [number, number, number][] = [[...at(sa), sa]];
      for (let i = 1; i < n - 1; i++) if (S[i] > sa + 0.05 && S[i] < sb - 0.05) pts.push([P[i * 3], P[i * 3 + 2], S[i]]);
      pts.push([...at(sb), sb]);
      const ids = pts.map(([x, z, s]) => (s < 1e-6 || s > len - 1e-6 || S.some((v) => Math.abs(v - s) < 1e-6) ? shared(x, z) : node(x, z)));
      for (let q = 1; q < pts.length; q++) {
        const [ax, az, s0] = pts[q - 1];
        const [bx, bz, s1] = pts[q];
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const nx = -(bz - az) / L;
        const nz = (bx - ax) / L;
        const ext = (side: number) => {
          const sm = (s0 + s1) / 2;
          const c = alley ? curbAt(r, sm, side) : r.cls === 6 ? 2.6 : 0.8;
          let lim = 8;
          let wall = false;
          const n = Math.max(2, Math.ceil(L / 1.5));
          for (let q = 0; q <= n; q++) {
            const f = q / n;
            // 보행로 띠는 칠한 횡단보도에서도 멈춘다(골목 띠는 골목을 가로지르는 칠 위를 그대로 지난다)
            const [d, isWall] = ray(ax + (bx - ax) * f, az + (bz - az) * f, nx * side, nz * side, alley ? c : Infinity, alley ? BLDG | HARD : BLDG | HARD | XW);
            if (d < lim) (lim = d), (wall = isWall);
          }
          if (!alley) return Math.max(0, Math.min(c, lim - 0.5));
          // 칸 가운데로 잰 거리라 반 칸(0.25m)을 더 물린다: 벽 0.7m 앞, 도로 부지 끝 0.3m 앞
          return Math.max(0.6, Math.min(c + 3, wall ? lim - 0.95 : lim - 0.55));
        };
        edge(ids[q - 1], ids[q], alley ? ALLEY : PATH, r.cls, hot.test(r.name), -ext(-1), ext(1));
      }
    }
  }

  // 길 이름·등급: 보도 선은 가장 가까운 찻길 가운데선(25m 안)의 것을 쓴다
  const segs: number[] = [];
  const segRoad: number[] = [];
  const grid = new Map<number, number[]>();
  const gk = (cx: number, cz: number) => (cx + 2000) * 4000 + (cz + 2000);
  inp.roads.forEach((r, ri) => {
    if (r.cls > 5) return;
    for (let k = 0; k + 5 < r.p.length; k += 3) {
      const id = segRoad.length;
      segs.push(r.p[k], r.p[k + 2], r.p[k + 3], r.p[k + 5]);
      segRoad.push(ri);
      for (let cx = Math.floor(Math.min(r.p[k], r.p[k + 3]) / 25); cx <= Math.floor(Math.max(r.p[k], r.p[k + 3]) / 25); cx++)
        for (let cz = Math.floor(Math.min(r.p[k + 2], r.p[k + 5]) / 25); cz <= Math.floor(Math.max(r.p[k + 2], r.p[k + 5]) / 25); cz++)
          (grid.get(gk(cx, cz)) ?? grid.set(gk(cx, cz), []).get(gk(cx, cz))!).push(id);
    }
  });
  for (const e of edges) {
    if (e.kind !== SIDEWALK) continue;
    const mx = (nodes[e.a * 2] + nodes[e.b * 2]) / 2;
    const mz = (nodes[e.a * 2 + 1] + nodes[e.b * 2 + 1]) / 2;
    let bd = 25;
    let best = -1;
    for (let cx = Math.floor(mx / 25) - 1; cx <= Math.floor(mx / 25) + 1; cx++)
      for (let cz = Math.floor(mz / 25) - 1; cz <= Math.floor(mz / 25) + 1; cz++)
        for (const id of grid.get(gk(cx, cz)) ?? []) {
          const d = segDist(mx, mz, segs[id * 4], segs[id * 4 + 1], segs[id * 4 + 2], segs[id * 4 + 3])[0];
          if (d < bd) (bd = d), (best = segRoad[id]);
        }
    if (best >= 0) (e.cls = inp.roads[best].cls), (e.hot = hot.test(inp.roads[best].name));
  }

  // ④·⑤ 잇기
  const clear = (ax: number, az: number, bx: number, bz: number) => {
    const L = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d <= L; d += 0.25) if (bitsAt(B, ax + ((bx - ax) * d) / (L || 1), az + ((bz - az) * d) / (L || 1)) & (HARD | BLDG | XW)) return false;
    return true;
  };
  const adjOf = () => {
    const adj: number[][] = Array.from({ length: nodes.length / 2 }, () => []);
    edges.forEach((e, i) => (adj[e.a].push(i), adj[e.b].push(i)));
    return adj;
  };
  const egrid = new Map<number, number[]>();
  const addGrid = (i: number) => {
    const e = edges[i];
    const ax = nodes[e.a * 2];
    const az = nodes[e.a * 2 + 1];
    const bx = nodes[e.b * 2];
    const bz = nodes[e.b * 2 + 1];
    for (let cx = Math.floor(Math.min(ax, bx) / 10); cx <= Math.floor(Math.max(ax, bx) / 10); cx++)
      for (let cz = Math.floor(Math.min(az, bz) / 10); cz <= Math.floor(Math.max(az, bz) / 10); cz++) (egrid.get(gk(cx, cz)) ?? egrid.set(gk(cx, cz), []).get(gk(cx, cz))!).push(i);
  };
  edges.forEach((_, i) => addGrid(i));
  /** (x, z)에서 곧게 닿는(큰길 찻길·건물을 지나지 않는) 가장 가까운 선 위 점: [선 번호, 선 위 거리 비율, 거리]. skip 에 든 선은 보지 않는다 */
  const reach = (x: number, z: number, skip: Set<number>, R = REACH): [number, number, number] | null => {
    const cand: [number, number, number][] = [];
    const seen = new Set<number>();
    for (let cx = Math.floor((x - R) / 10); cx <= Math.floor((x + R) / 10); cx++)
      for (let cz = Math.floor((z - R) / 10); cz <= Math.floor((z + R) / 10); cz++)
        for (const i of egrid.get(gk(cx, cz)) ?? []) {
          if (seen.has(i) || skip.has(i) || edges[i].kind === LINK) continue;
          seen.add(i);
          const e = edges[i];
          const ax = nodes[e.a * 2];
          const az = nodes[e.a * 2 + 1];
          const bx = nodes[e.b * 2];
          const bz = nodes[e.b * 2 + 1];
          const L = Math.hypot(bx - ax, bz - az);
          const [d0, t0] = segDist(x, z, ax, az, bx, bz);
          if (d0 > R) continue;
          cand.push([i, t0, d0]);
          for (let s = 0; s <= L; s += 1) {
            const t = L ? s / L : 0;
            const d = Math.hypot(ax + (bx - ax) * t - x, az + (bz - az) * t - z);
            if (d <= R) cand.push([i, t, d]);
          }
        }
    cand.sort((p, q) => p[2] - q[2]);
    for (const c of cand) {
      const e = edges[c[0]];
      const px = nodes[e.a * 2] + (nodes[e.b * 2] - nodes[e.a * 2]) * c[1];
      const pz = nodes[e.a * 2 + 1] + (nodes[e.b * 2 + 1] - nodes[e.a * 2 + 1]) * c[1];
      if (clear(x, z, px, pz)) return c;
    }
    return null;
  };
  /** 선 i 의 비율 t 자리에 노드를 둔다(끝 0.5m 안이면 끝 노드) */
  const splitAt = (i: number, t: number) => {
    const e = edges[i];
    const L = Math.hypot(nodes[e.b * 2] - nodes[e.a * 2], nodes[e.b * 2 + 1] - nodes[e.a * 2 + 1]);
    if (t * L < 0.5) return e.a;
    if ((1 - t) * L < 0.5) return e.b;
    const n = node(nodes[e.a * 2] + (nodes[e.b * 2] - nodes[e.a * 2]) * t, nodes[e.a * 2 + 1] + (nodes[e.b * 2 + 1] - nodes[e.a * 2 + 1]) * t);
    const b = e.b;
    e.b = n;
    edges.push({ ...e, a: n, b });
    addGrid(i);
    addGrid(edges.length - 1);
    return n;
  };
  // ④ 끝점 잇기: 끝점에서 그래프를 따라 24m 안에 있는 선은 제 길이라 보지 않는다
  {
    const adj = adjOf();
    const ends: number[] = [];
    for (let n = 0; n < adj.length; n++) if (adj[n].length === 1) ends.push(n);
    for (const n of ends) {
      const near = new Set<number>();
      const dist = new Map<number, number>([[n, 0]]);
      const q = [n];
      while (q.length) {
        const m = q.shift()!;
        for (const i of adj[m] ?? []) {
          near.add(i);
          const e = edges[i];
          const o = e.a === m ? e.b : e.a;
          const d = dist.get(m)! + Math.hypot(nodes[o * 2] - nodes[m * 2], nodes[o * 2 + 1] - nodes[m * 2 + 1]);
          if (d < REACH * 3 && !dist.has(o)) dist.set(o, d), q.push(o);
        }
      }
      const x = nodes[n * 2];
      const z = nodes[n * 2 + 1];
      const hit = reach(x, z, near);
      if (!hit) continue;
      const m = splitAt(hit[0], hit[1]);
      edges.push({ a: n, b: m, kind: LINK, cls: 4, hot: false, lo: -0.4, hi: 0.4 });
    }
  }
  // ⑤ 횡단보도
  const links: number[] = [];
  inp.crosswalks.forEach((c, xw) => {
    const side = (sg: number) => {
      const ex = c.x + c.ux * c.half * sg;
      const ez = c.z + c.uz * c.half * sg;
      // 축 끝에서 바깥으로 가며 큰길 찻길·건물이 0.4m 넘게 없는 첫 자리 끝에서 기다린다(6m 안).
      // 그 전에 건물에 닿으면 건물 앞 빈 곳(0.25m 넘는 것) 가운데에서 기다린다
      const freeAt = (d: number, land: boolean) => {
        const f = bitsAt(B, ex + c.ux * sg * d, ez + c.uz * sg * d);
        return !(f & (HARD | BLDG | XW)) && (!land || (f & (LAND | WALK)) !== 0);
      };
      // 도로 부지 안 자리를 먼저 찾고, 없으면(도로 부지 자료가 빠진 곳) 도로 부지 밖이라도 찻길·건물이 아닌 자리
      const find = (land: boolean) => {
        const free = (d: number) => freeAt(d, land);
        let d = 0;
        let run = -1;
        while (d < 6 && !(free(d) && free(d + 0.2) && free(d + 0.4))) {
          if (bitsAt(B, ex + c.ux * sg * d, ez + c.uz * sg * d) & BLDG) return run < 0 || d - run < 0.25 ? -1 : (run + d) / 2 - 0.4;
          run = free(d) ? (run < 0 ? d : run) : -1;
          d += 0.25;
        }
        return d >= 6 ? -1 : d;
      };
      let d = find(true);
      if (d < 0) d = find(false);
      // 기다릴 자리 후보: 축을 따라 찾은 자리, 그다음 끝에서 5m 안, 건너편 쪽이 아닌 곳에서 0.4m 둘레가 비어 있는 자리(가까운 것부터).
      // 모퉁이·짧은 길에 붙은 끝은 축을 따라가면 칠 밖 찻길을 몇 m 지나야 보도에 닿으므로, 짝은 아래에서 칠 밖 찻길이 가장 짧은 것으로 고른다
      const cands: { px: number; pz: number }[] = [];
      if (d >= 0) cands.push({ px: ex + c.ux * sg * (d + 0.4), pz: ez + c.uz * sg * (d + 0.4) });
      const spots: [number, number, number][] = [];
      for (let dx = -5; dx <= 5; dx += 0.25)
        for (let dz = -5; dz <= 5; dz += 0.25) {
          const r = Math.hypot(dx, dz);
          if (r > 5 || (dx * c.ux + dz * c.uz) * sg < 0.3) continue;
          const x = ex + dx;
          const z = ez + dz;
          let ok = true;
          for (const [ox, oz] of [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) {
            const f = bitsAt(B, x + ox, z + oz);
            if (f & (HARD | BLDG | XW) || (ox === 0 && oz === 0 && !(f & (LAND | WALK)))) ok = false;
          }
          if (ok) spots.push([x, z, r]);
        }
      spots.sort((p, q) => p[2] - q[2]);
      for (const [px, pz] of spots.filter((_, k) => k < 12 || k % 8 === 0).slice(0, 40)) cands.push({ px, pz });
      const out: { ex: number; ez: number; px: number; pz: number; hit: [number, number, number] }[] = [];
      for (const q of cands) {
        if (out.length >= 6) break;
        if (out.some((o) => Math.hypot(o.px - q.px, o.pz - q.pz) < 0.75)) continue;
        const hit = reach(q.px, q.pz, new Set(), 12);
        if (hit) out.push({ ex, ez, ...q, hit });
      }
      if (out.length) return out;
      if (d >= 0 || spots.length) return '선 없음';
      // 까닭: 축 끝에서 바깥 3m 자리가 무엇인가
      const f = bitsAt(B, ex + c.ux * sg * 3, ez + c.uz * sg * 3);
      return f & BLDG ? '건물' : f & HARD ? '큰길 찻길' : f & XW ? '횡단보도 면' : '자리 없음';
    };
    // 큰길 찻길을 건너는가(아니면 골목을 건넌다: 골목 선의 걷는 띠가 길 폭을 덮는다)
    let major = false;
    for (let d = -c.half; d <= c.half; d += 0.5) if (bitsAt(B, c.x + c.ux * d, c.z + c.uz * d) & HARD) major = true;
    const as = side(-1);
    const bs = side(1);
    if (typeof as === 'string' || typeof bs === 'string') {
      inp.onCross?.(xw, `${major ? '' : '골목 위 '}${typeof as === 'string' ? 'a:' + as : ''}${typeof as === 'string' && typeof bs === 'string' ? ' ' : ''}${typeof bs === 'string' ? 'b:' + bs : ''}`);
      return;
    }
    // 기다리는 자리끼리 잇는 건너는 선이 칠한 횡단보도 면 밖의 큰길 찻길을 3m 넘게 지나면 잇지 않는다(줄무늬는 연석 앞 0.5~1m 에서 끝난다).
    // 분리대는 칠이 끊겨도 서서 건너는 곳이라 세지 않는다. 후보 짝 가운데 칠 밖 찻길이 가장 짧은 짝(같으면 앞 후보)을 쓴다
    const bareOf = (p: { px: number; pz: number }, q: { px: number; pz: number }) => {
      const L = Math.hypot(q.px - p.px, q.pz - p.pz);
      let bare = 0;
      for (let d = 0; d <= L; d += 0.25) {
        const f = bitsAt(B, p.px + ((q.px - p.px) * d) / (L || 1), p.pz + ((q.pz - p.pz) * d) / (L || 1));
        if (f & HARD && !(f & (XW | MED))) bare += 0.25;
      }
      return bare;
    };
    let best = Infinity;
    let a = as[0];
    let b = bs[0];
    for (const p of as)
      for (const q of bs) {
        const v = bareOf(p, q);
        if (v < best) (best = v), (a = p), (b = q);
      }
    if (best > 3) return inp.onCross?.(xw, '칠 밖 찻길 3m 넘음');
    const na = splitAt(a.hit[0], a.hit[1]);
    // 앞에서 나눈 선 번호가 바뀌었을 수 있으므로 건너편은 다시 찾는다
    const hb = reach(b.px, b.pz, new Set(), 12);
    if (!hb) return inp.onCross?.(xw, 'b:선 없음');
    const nb = splitAt(hb[0], hb[1]);
    if (na === nb) return inp.onCross?.(xw, '양 끝 같은 노드');
    inp.onCross?.(xw, null);
    // 끝마다 사람이 비켜 설 수 있는 폭: 기다리는 자리에서 축을 가로질러(a→b 오른쪽 +) 옮겨도, 거기서 보도 쪽으로 0·0.75·1.5m 물러난
    // 자리가 모두 큰길 찻길·건물·칠 밖이고 도로 부지·보도 면 안인 범위(칠 폭/2 − 0.3m 안). 모퉁이에서는 연석이 축과 비스듬해 한쪽이 찻길이다
    const L = Math.hypot(b.ex - a.ex, b.ez - a.ez) || 1;
    const vx = (b.ex - a.ex) / L;
    const vz = (b.ez - a.ez) / L;
    const room = (p: { px: number; pz: number }, back: number) => {
      const sp = (p.px - a.ex) * -vz + (p.pz - a.ez) * vx;
      const tp = (p.px - a.ex) * vx + (p.pz - a.ez) * vz;
      const lim = Math.max(c.wid / 2 - 0.3, Math.abs(sp));
      const clear = (sv: number) =>
        [0, 0.75, 1.5].every((r) => {
          const t = tp + back * r;
          const f = bitsAt(B, a.ex + vx * t - vz * sv, a.ez + vz * t + vx * sv);
          return !(f & (HARD | BLDG | XW)) && (f & (LAND | WALK)) !== 0;
        });
      let lo = sp;
      let hi = sp;
      if (clear(sp)) {
        while (lo - 0.25 >= -lim && clear(lo - 0.25)) lo -= 0.25;
        while (hi + 0.25 <= lim && clear(hi + 0.25)) hi += 0.25;
      }
      return [lo, hi];
    };
    links.push(xw, na, nb, a.ex, a.ez, b.ex, b.ez, a.px, a.pz, b.px, b.pz, c.wid, major ? 1 : 0, ...room(a, -1), ...room(b, 1));
  });

  // 작은 조각(선 길이 합 15m 미만, 횡단보도에 닿지 않는 것)은 버린다
  const N = nodes.length / 2;
  const root = Int32Array.from({ length: N }, (_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
  for (const e of edges) root[find(e.a)] = find(e.b);
  for (let k = 0; k < links.length; k += LINK_N) root[find(links[k + 1])] = find(links[k + 2]);
  const size = new Float64Array(N);
  for (const e of edges) size[find(e.a)] += Math.hypot(nodes[e.b * 2] - nodes[e.a * 2], nodes[e.b * 2 + 1] - nodes[e.a * 2 + 1]);
  const keepNode = (n: number) => size[find(n)] >= 15;
  const used = new Int32Array(N).fill(-1);
  const out: number[] = [];
  let px = 0;
  let pz = 0;
  const id = (n: number) => {
    if (used[n] < 0) {
      used[n] = out.length / 2;
      const x = Math.round(nodes[n * 2] * 10);
      const z = Math.round(nodes[n * 2 + 1] * 10);
      out.push(x - px, z - pz);
      px = x;
      pz = z;
    }
    return used[n];
  };
  const list = edges.filter((e) => keepNode(e.a)).map((e) => ({ ...e, a: id(e.a), b: id(e.b) }));
  list.sort((p, q) => p.a - q.a);
  const e: number[] = [];
  let pa = 0;
  for (const q of list) {
    e.push(q.a - pa, q.b - q.a, q.kind * 16 + Math.min(7, q.cls) * 2 + (q.hot ? 1 : 0), -Math.round(-q.lo * 10), Math.round(q.hi * 10));
    pa = q.a;
  }
  const x: number[] = [];
  for (let k = 0; k < links.length; k += LINK_N) {
    if (!keepNode(links[k + 1])) continue;
    x.push(links[k], id(links[k + 1]), id(links[k + 2]), ...links.slice(k + 3, k + 12).map((v) => Math.round(v * 10)), links[k + 12], ...links.slice(k + 13, k + 17).map((v) => Math.round(v * 10)));
  }
  return { v: 2, n: out, e, x };
}

/** 점과 선분 사이 거리와 선분 위 비율 */
function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number): [number, number] {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return [Math.hypot(ax + dx * t - x, az + dz * t - z), t];
}

/** 더글러스-포이커: 남길 점 번호 */
function simplify(p: ArrayLike<number>, tol: number): number[] {
  const n = p.length / 2;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1;
    let fd = tol;
    for (let k = a + 1; k < b; k++) {
      const d = segDist(p[k * 2], p[k * 2 + 1], p[a * 2], p[a * 2 + 1], p[b * 2], p[b * 2 + 1])[0];
      if (d > fd) (fd = d), (far = k);
    }
    if (far >= 0) (keep[far] = 1), stack.push([a, far], [far, b]);
  }
  const out: number[] = [];
  keep.forEach((v, k) => v && out.push(k));
  return out;
}

type Chain = number[] & { ref0: number; ref1: number; loop: boolean };

/**
 * 보도 면 칸을 가늘게 깎아 뼈대 선을 찾고, 선마다 [점 좌표 x, z, ...]와 점마다 보도 면 경계까지 거리(m)를 넘긴다.
 * 갈래점은 여러 선이 같은 노드를 쓰도록 ref0·ref1 에 노드 번호를 함께 적는다
 */
function sidewalks(B: Bits, emit: (pts: Chain, widths: number[]) => void) {
  const { w: W, h: H } = B;
  const s = new Uint8Array(W * H);
  let cnt = 0;
  // 칠한 횡단보도가 보도까지 덮은 곳은 보도에서 뺀다(뼈대 폭으로 정하는 걷는 띠가 칠 끝을 덮으면 보도를 걷는 사람이 칠을 밟는다)
  for (let i = 0; i < W * H; i++) if ((B.v[i] & (WALK | HARD | BLDG | XW)) === WALK) (s[i] = 1), cnt++;
  let cur = new Int32Array(cnt);
  for (let i = 0, k = 0; i < W * H; i++) if (s[i]) cur[k++] = i;
  // Zhang–Suen
  const del: number[] = [];
  for (let changed = true; changed; ) {
    changed = false;
    for (const sub of [0, 1]) {
      del.length = 0;
      let m = 0;
      for (let q = 0; q < cur.length; q++) {
        const i = cur[q];
        if (!s[i]) continue;
        cur[m++] = i;
        const x = i % W;
        const y = (i - x) / W;
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        const p2 = s[i - W], p3 = s[i - W + 1], p4 = s[i + 1], p5 = s[i + W + 1], p6 = s[i + W], p7 = s[i + W - 1], p8 = s[i - 1], p9 = s[i - W - 1];
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;
        const a = (+(!p2 && p3)) + (+(!p3 && p4)) + (+(!p4 && p5)) + (+(!p5 && p6)) + (+(!p6 && p7)) + (+(!p7 && p8)) + (+(!p8 && p9)) + (+(!p9 && p2));
        if (a !== 1) continue;
        if (sub === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
        del.push(i);
      }
      cur = cur.subarray(0, m);
      for (const i of del) s[i] = 0;
      if (del.length) changed = true;
    }
  }
  const OFF = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1];
  const DX = [-1, 0, 1, -1, 1, -1, 0, 1];
  const DY = [-1, -1, -1, 0, 0, 1, 1, 1];
  const inside = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    return x >= 1 && y >= 1 && x < W - 1 && y < H - 1;
  };
  // 계단 모양으로 남은 군더더기 칸: 이웃이 셋 넘고, 지워도 이웃끼리 이어져 있으면 지운다
  for (const i of cur) {
    if (!s[i] || !inside(i)) continue;
    const on: number[] = [];
    for (let k = 0; k < 8; k++) if (s[i + OFF[k]]) on.push(k);
    if (on.length < 3) continue;
    const seen = new Set([on[0]]);
    const q = [on[0]];
    while (q.length) {
      const k = q.pop()!;
      for (const o of on) if (!seen.has(o) && Math.abs(DX[o] - DX[k]) <= 1 && Math.abs(DY[o] - DY[k]) <= 1) seen.add(o), q.push(o);
    }
    if (seen.size === on.length) s[i] = 0;
  }
  const px = (i: number) => B.x0 + ((i % W) + 0.5) * B.cell;
  const pz = (i: number) => B.z0 + (Math.floor(i / W) + 0.5) * B.cell;
  const deg = (i: number) => {
    let d = 0;
    for (let k = 0; k < 8; k++) if (s[i + OFF[k]]) d++;
    return d;
  };
  // 보도 면 경계(보도 면이 아닌 가장 가까운 칸)까지 거리
  const wid = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    let best = 40;
    for (let r = 1; r < 40 && r - 1 < best; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const X = x + dx;
          const Y = y + dy;
          if (X < 0 || Y < 0 || X >= W || Y >= H || (B.v[Y * W + X] & (WALK | HARD | BLDG)) !== WALK) best = Math.min(best, Math.hypot(dx, dy));
        }
    return best * B.cell;
  };
  // 노드 칸(이웃 수 ≠ 2)을 이웃끼리 묶는다
  const live: number[] = [];
  for (const i of cur) if (s[i] && inside(i)) live.push(i);
  const cluster = new Map<number, number>();
  const members: number[][] = [];
  for (const i of live) {
    if (deg(i) === 2 || cluster.has(i)) continue;
    const c = members.length;
    const m = [i];
    cluster.set(i, c);
    for (let q = 0; q < m.length; q++)
      for (const o of OFF) {
        const j = m[q] + o;
        if (s[j] && !cluster.has(j) && deg(j) !== 2) cluster.set(j, c), m.push(j);
      }
    members.push(m);
  }
  type Raw = { a: number; b: number; px: number[] };
  const chains: Raw[] = [];
  const visited = new Uint8Array(W * H);
  const trace = (c: number, from: number, q: number) => {
    const pts = [from, q];
    let prev = from;
    let at = q;
    visited[q] = 1;
    while (!cluster.has(at)) {
      let next = -1;
      for (const o of OFF) {
        const j = at + o;
        if (s[j] && j !== prev && (cluster.has(j) || !visited[j])) {
          next = j;
          if (cluster.has(j)) break;
        }
      }
      if (next < 0) return;
      prev = at;
      at = next;
      pts.push(at);
      if (!cluster.has(at)) visited[at] = 1;
    }
    const b = cluster.get(at)!;
    if (b === c && pts.length < 4) return;
    chains.push({ a: c, b, px: pts });
  };
  for (let c = 0; c < members.length; c++)
    for (const m of members[c])
      for (const o of OFF) {
        const q = m + o;
        if (!s[q] || visited[q] || cluster.has(q)) continue;
        trace(c, m, q);
      }
  // 갈래점 없는 고리(둘레를 다 도는 보도): 아무 칸에서 시작한다
  for (const i of live) {
    if (visited[i] || cluster.has(i) || !s[i]) continue;
    const c = members.length;
    members.push([i]);
    cluster.set(i, c);
    for (const o of OFF) if (s[i + o] && !visited[i + o]) {
      trace(c, i, i + o);
      break;
    }
  }
  // 갈래점에서 짧게 뻗은 가지(면 모서리로 뻗은 깎다 남은 것)를 지운다
  const cDeg = new Int32Array(members.length);
  const alive = chains.map(() => true);
  const len = (ch: Raw) => {
    let L = 0;
    for (let k = 1; k < ch.px.length; k++) L += Math.hypot(px(ch.px[k]) - px(ch.px[k - 1]), pz(ch.px[k]) - pz(ch.px[k - 1]));
    return L;
  };
  const lens = chains.map(len);
  for (let round = 0; round < 4; round++) {
    cDeg.fill(0);
    chains.forEach((ch, k) => alive[k] && (cDeg[ch.a]++, cDeg[ch.b]++));
    let cut = false;
    chains.forEach((ch, k) => {
      if (!alive[k] || ch.a === ch.b) return;
      const [tip, hub] = cDeg[ch.a] === 1 && cDeg[ch.b] >= 3 ? [ch.a, ch.b] : cDeg[ch.b] === 1 && cDeg[ch.a] >= 3 ? [ch.b, ch.a] : [-1, -1];
      if (tip < 0) return;
      if (lens[k] < 1.6 * wid(members[hub][0]) + 1) (alive[k] = false), (cut = true), cDeg[hub]--;
    });
    if (!cut) break;
  }
  // 갈래점 자리는 묶인 칸의 가운데. 양 끝 모두 끝점인 짧은 선(3m 미만)은 버린다
  const ref = new Int32Array(members.length).fill(-1);
  const center = members.map((m) => [m.reduce((a, i) => a + px(i), 0) / m.length, m.reduce((a, i) => a + pz(i), 0) / m.length]);
  chains.forEach((ch, k) => {
    if (!alive[k]) return;
    if (cDeg[ch.a] === 1 && cDeg[ch.b] === 1 && lens[k] < 3) return;
    const pts = [] as unknown as Chain;
    const widths: number[] = [];
    ch.px.forEach((i, q) => {
      const [x, z] = q === 0 ? center[ch.a] : q === ch.px.length - 1 ? center[ch.b] : [px(i), pz(i)];
      pts.push(x, z);
      widths.push(wid(i));
    });
    pts.ref0 = ref[ch.a];
    pts.ref1 = ref[ch.b];
    pts.loop = ch.a === ch.b;
    emit(pts, widths);
    ref[ch.a] = pts.ref0;
    ref[ch.b] = pts.ref1;
  });
}
