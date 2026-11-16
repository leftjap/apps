// 걷는 길 그물 바로잡기(재작업 W21). 뼈대 굽기(walknet.ts)가 만든 그물을 그린 찻길 면(W14) 기준으로 다시 맞춘다.
//  ① 큰길 찻길(등급 3 이하 띠·교차로 면·분리대·횡단보도 밑 그리기 전용 면, 골목 띠 자리는 뺀다)과 건물을 0.25m 칸으로 칠한다.
//  ② 모든 선(보도·골목·보행로·잇는 선)의 점이 사람 몸 반지름 + 여유(CLEAR) 안에 큰길 찻길·건물을 두지 않게: 닿는 구간은 잘라 내고,
//     걷는 띠는 양옆으로 그 거리 안까지만 남긴다. 노드마다 사람이 설 수 있는 원 반지름(r)을 함께 적는다(모퉁이에서 갈아탈 때 쓴다).
//  ③ 횡단보도는 다시 잇는다: 축 끝에서 바깥으로 가며 큰길 찻길이 몸 반지름 안에 없는 첫 자리(기다리는 자리)를 노드로 두고,
//     거기서 곧게(안 되면 칸을 따라 돌아서) 그물에 닿는 잇는 선을 낸다. 건너는 길은 기다리는 자리 → 축 끝 → 축 → 건너편 축 끝 → 기다리는 자리다.
//  ④ 그물은 한 덩어리만 남긴다. 떨어진 조각은 30m 안이면 칸을 따라 잇고, 그래도 떨어진 조각은 버린다.
//  ⑤ 건물 문: 문턱(벽에서 0.5m)에서 걷는 띠까지 곧게 가는 길이 큰길 찻길을 지나지 않는 자리만 문으로 둔다.
import { carriageSections, isGroundRoad, roadJoints, tunnelDepth, tunnelReach } from '../../src/data/surface.ts';
import { cumLen } from '../../src/poly.ts';

/** 교차로 면(등급·바깥 고리·교통섬) */
export type Face = { cls: number; outer: ArrayLike<number>; holes: ArrayLike<number>[] };
import type { Road } from '../../src/data/board.ts';
import { LINK, LINK_N, type WalkJson } from '../../src/sim/walknet.ts';
import { bitsAt, fillBits, makeBits, type Bits } from './bits.ts';

/** 사람 몸 반지름(m, 1.5배로 키운 그림의 머리 반지름 0.27 × 1.5) */
export const BODY_R = 0.4;
/** 선·걷는 띠가 큰길 찻길·건물에서 떨어질 거리(m): 몸 반지름 + 여유 */
export const CLEAR = 0.45;
/** 건물 벽에서 떨어질 거리(m) */
const WALL_CLEAR = 0.2;
/** 걷는 띠를 선 양 끝 너머로 쓰는 거리(m). 사람은 선 끝을 넘지 않고 노드에서 갈아탄다 */
export const EDGE_EXT = 0;
/** 칠한 횡단보도 끝에서 기다리는 자리까지 칠 밖 찻길을 지나는 가장 긴 거리(m, 한쪽 끝). 줄무늬는 연석 앞 0.5~1m 에서 끝난다 */
export const MAX_BARE = 6;
const ROAD = 1;
const BLDG = 2;
const XW = 4;
const CELL = 0.25;

/** 큰길 찻길 면 고리들: 등급 3 이하 땅 위 띠(터널 길 빼고)·등급 3 이하 교차로 면(골목 띠 자리 빼고)·분리대·그리기 전용 면.
 *  같은 정의를 시험(test/w21-walknet.test.ts)과 사람 측정이 쓴다 */
export function majorGround(
  roads: Road[],
  faces: Face[],
  draw: ArrayLike<number>[],
  car: [number, ArrayLike<number>][],
  med: ArrayLike<number>[],
  bounds: [number, number, number, number],
  cell = CELL,
): Bits {
  const B = makeBits(bounds[0], bounds[1], bounds[2], bounds[3], cell);
  const reach = tunnelReach(roads);
  const joints = roadJoints(roads);
  for (const f of faces) if (f.cls <= 3) fillBits(B, [f.outer, ...f.holes], ROAD);
  roads.forEach((r, i) => {
    if (!isGroundRoad(r) || r.cls <= 3) return;
    const s = carriageSections(r, 0, Infinity, joints.subarray(i * 4, i * 4 + 4));
    fillBits(B, [[...s.flatMap((q) => [q.lx, q.lz]), ...s.reverse().flatMap((q) => [q.rx, q.rz])]], ROAD, true);
  });
  // 큰길 띠는 교차로를 지나 끝까지(골목 띠를 뺀 자리 가운데 큰길 찻길은 되살린다)
  roads.forEach((r, i) => {
    if (!isGroundRoad(r) || r.cls > 3 || reach[i]) return;
    const s = carriageSections(r, 0, Infinity, joints.subarray(i * 4, i * 4 + 4));
    fillBits(B, [[...s.flatMap((q) => [q.lx, q.lz]), ...s.reverse().flatMap((q) => [q.rx, q.rz])]], ROAD);
  });
  for (const [i, ring] of car) if (roads[i].cls <= 3 && !reach[i]) fillBits(B, [ring], ROAD);
  // 터널 길(등급 5 이하)은 입구에서 몸이 들어설 높이(깊이 5.2m, 입구 벽)까지는 땅 위 찻길로 친다(입구 경사 위로 걷지 않게)
  roads.forEach((r, i) => {
    const rc = reach[i];
    if (!rc || r.cls > 5) return;
    const L = cumLen(r.p);
    const len = L[L.length - 1];
    let a = -1;
    for (let s = 0; s <= len + 1e-6; s += 0.5) {
      const shallow = tunnelDepth(rc, Math.min(s, len), len) < 5.2;
      if (shallow && a < 0) a = s;
      if ((!shallow || s + 0.5 > len) && a >= 0) {
        const sec = carriageSections(r, a, Math.min(len, shallow ? len : s), joints.subarray(i * 4, i * 4 + 4));
        if (sec.length >= 2) fillBits(B, [[...sec.flatMap((q) => [q.lx, q.lz]), ...sec.reverse().flatMap((q) => [q.rx, q.rz])]], ROAD);
        a = -1;
      }
    }
  });
  for (const m of med) fillBits(B, [m], ROAD);
  for (const d of draw) fillBits(B, [d], ROAD);
  return B;
}

/** bits 칸 a(→ 1)·b(→ 2)를 r 칸만큼 네모로 넓힌 칸 격자 */
function dilate(B: Bits, a: number, b: number, r: number): Bits {
  const { w, h } = B;
  const tmp = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const row = j * w;
    let la = -1e9;
    let lb = -1e9;
    // 왼쪽→오른쪽: 마지막으로 본 칸, 오른쪽→왼쪽도 같이
    for (let i = 0; i < w; i++) {
      const v = B.v[row + i];
      if (v & a) la = i;
      if (v & b) lb = i;
      tmp[row + i] = (i - la <= r ? 1 : 0) | (i - lb <= r ? 2 : 0);
    }
    la = 1e9;
    lb = 1e9;
    for (let i = w - 1; i >= 0; i--) {
      const v = B.v[row + i];
      if (v & a) la = i;
      if (v & b) lb = i;
      tmp[row + i] |= (la - i <= r ? 1 : 0) | (lb - i <= r ? 2 : 0);
    }
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w; i++) {
    let la = -1e9;
    let lb = -1e9;
    for (let j = 0; j < h; j++) {
      const v = tmp[j * w + i];
      if (v & 1) la = j;
      if (v & 2) lb = j;
      out[j * w + i] = (j - la <= r ? 1 : 0) | (j - lb <= r ? 2 : 0);
    }
    la = 1e9;
    lb = 1e9;
    for (let j = h - 1; j >= 0; j--) {
      const v = tmp[j * w + i];
      if (v & 1) la = j;
      if (v & 2) lb = j;
      out[j * w + i] |= (la - j <= r ? 1 : 0) | (lb - j <= r ? 2 : 0);
    }
  }
  return { ...B, v: out };
}

/** (x, z) 둘레 r 안(가운데와 12 방향)에 bit 칸이 있는가 */
export function hitDisc(B: Bits, x: number, z: number, r: number, bit: number): boolean {
  if (bitsAt(B, x, z) & bit) return true;
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6;
    if (bitsAt(B, x + Math.cos(a) * r, z + Math.sin(a) * r) & bit) return true;
    if (bitsAt(B, x + Math.cos(a) * r * 0.5, z + Math.sin(a) * r * 0.5) & bit) return true;
  }
  return false;
}

export interface FixInput {
  json: WalkJson;
  bounds: [number, number, number, number];
  roads: Road[];
  faces: Face[];
  draw: ArrayLike<number>[];
  car: [number, ArrayLike<number>][];
  med: ArrayLike<number>[];
  buildings: ArrayLike<number>[];
  crosswalks: { x: number; z: number; ux: number; uz: number; half: number; wid: number; rings?: ArrayLike<number>[] }[];
  /** 문을 둘 건물인가(건물 번호, 바닥 가운데) */
  doorOk?: (i: number, x: number, z: number) => boolean;
  log?: (s: string) => void;
}

interface E {
  a: number;
  b: number;
  kind: number;
  cls: number;
  hot: boolean;
  lo: number;
  hi: number;
}

export function fixWalkNet(inp: FixInput): WalkJson {
  const log = inp.log ?? (() => {});
  const B = majorGround(inp.roads, inp.faces, inp.draw, inp.car, inp.med, inp.bounds);
  for (const b of inp.buildings) fillBits(B, [b], BLDG);
  for (const c of inp.crosswalks) for (const r of c.rings ?? []) fillBits(B, [r], XW);
  // 큰길 찻길·건물 칸을 CLEAR 만큼 넓힌 칸(네모로 넓혀 원보다 넉넉하다): 1 몸이 찻길·건물에 닿음, 2 몸이 찻길에 닿음
  // 건물 벽은 몸이 스치는 정도(WALL_CLEAR)까지 다가가도 된다(좁은 보도가 끊기지 않게).
  // 칸 NEAR: 1 큰길 찻길 칸에서 2칸 안, 2 3칸 안, 4 건물 칸에서 1칸 안. 2칸 안은 막힘, 3칸 안은 몸 둘레를 직접 잰다
  const N2 = dilate(B, ROAD, ROAD, 2);
  const N3 = dilate(B, ROAD, ROAD, 3);
  const NB = dilate(B, BLDG, BLDG, Math.ceil(WALL_CLEAR / CELL));
  for (let k = 0; k < N2.v.length; k++) N2.v[k] = (N2.v[k] & 1) | (N3.v[k] & 1 ? 2 : 0) | (NB.v[k] & 1 ? 4 : 0);
  const NEAR = N2;
  const [bx0, bz0, bx1, bz1] = inp.bounds;
  /** 몸이 큰길 찻길에 닿는가(시험과 같은 방식: 몸 반지름과 여유 두 둘레) */
  const roadNear = (x: number, z: number) => {
    const f = bitsAt(NEAR, x, z);
    return (f & 1) !== 0 || ((f & 2) !== 0 && (hitDisc(B, x, z, BODY_R, ROAD) || hitDisc(B, x, z, CLEAR, ROAD)));
  };
  // 판 가장자리 1m 안도 막힌 곳으로 친다(판 밖 찻길은 칠하지 않았다)
  const blocked = (x: number, z: number) => x < bx0 + 1 || z < bz0 + 1 || x > bx1 - 1 || z > bz1 - 1 || (bitsAt(NEAR, x, z) & 4) !== 0 || roadNear(x, z);

  // ── 읽기 ──
  const nodes: number[] = [];
  {
    let x = 0;
    let z = 0;
    for (let i = 0; i < inp.json.n.length; i += 2) {
      x += inp.json.n[i];
      z += inp.json.n[i + 1];
      nodes.push(x / 10, z / 10);
    }
  }
  const src: E[] = [];
  {
    let a = 0;
    const e = inp.json.e;
    for (let k = 0; k < e.length; k += 5) {
      a += e[k];
      const code = e[k + 2];
      src.push({ a, b: a + e[k + 1], kind: code >> 4, cls: (code >> 1) & 7, hot: (code & 1) === 1, lo: e[k + 3] / 10, hi: e[k + 4] / 10 });
    }
  }
  const node = (x: number, z: number) => (nodes.push(x, z), nodes.length / 2 - 1);
  const X = (n: number) => nodes[n * 2];
  const Z = (n: number) => nodes[n * 2 + 1];

  /** 옆으로 쏜 선이 큰길 찻길·건물에 닿기 전까지 몸을 둘 수 있는 거리(최대 lim) */
  const room = (x: number, z: number, nx: number, nz: number, lim: number) => {
    let d = 0;
    while (d + 0.125 <= lim && !blocked(x + nx * (d + 0.125), z + nz * (d + 0.125))) d += 0.125;
    return d;
  };

  // ── ② 선 옮기기·자르기와 걷는 띠 줄이기 ──
  // 몸이 찻길·건물에 닿는 노드는 1.25m 안 가장 가까운 빈자리로 옮기고, 선 가운데가 닿으면 닿는 구간 가운데에 빈자리 노드를 넣어 꺾는다(네 번까지).
  // 그래도 닿는 구간은 잘라 낸다
  const nearFree = (x: number, z: number, R = 1.25): [number, number] | null => {
    if (!blocked(x, z)) return [x, z];
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let dx = -R; dx <= R; dx += 0.125)
      for (let dz = -R; dz <= R; dz += 0.125) {
        const r = dx * dx + dz * dz;
        if (r > R * R || r >= bd) continue;
        if (!blocked(x + dx, z + dz)) (bd = r), (best = [x + dx, z + dz]);
      }
    return best;
  };
  let movedN = 0;
  {
    const used = new Uint8Array(nodes.length / 2);
    for (const e of src) used[e.a] = used[e.b] = 1;
    for (let n = 0; n < used.length; n++) {
      if (!used[n] || !blocked(X(n), Z(n))) continue;
      const p = nearFree(X(n), Z(n));
      if (p) (nodes[n * 2] = p[0]), (nodes[n * 2 + 1] = p[1]), movedN++;
    }
  }
  const edges: E[] = [];
  let cutLen = 0;
  let bent = 0;
  const cutWhy = new Float64Array(8);
  let totLen = 0;
  const emit = (e: E, a: number, b: number, depth: number) => {
    const [ax, az, bx, bz] = [X(a), Z(a), X(b), Z(b)];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-3) return;
    const n = Math.max(1, Math.ceil(L / 0.25));
    const ok: boolean[] = [];
    for (let q = 0; q <= n; q++) ok.push(!blocked(ax + ((bx - ax) * q) / n, az + ((bz - az) * q) / n));
    if (depth < 4 && ok.some((v) => !v)) {
      // 가장 긴 닿는 구간 가운데를 빈자리로 옮겨 꺾는다
      let bq = -1;
      let bl = 0;
      for (let q = 0; q <= n; ) {
        if (ok[q]) {
          q++;
          continue;
        }
        let r = q;
        while (r + 1 <= n && !ok[r + 1]) r++;
        if (r - q + 1 > bl) (bl = r - q + 1), (bq = (q + r) / 2);
        q = r + 1;
      }
      const mx = ax + ((bx - ax) * bq) / n;
      const mz = az + ((bz - az) * bq) / n;
      const p = nearFree(mx, mz);
      if (p && Math.hypot(p[0] - ax, p[1] - az) > 0.2 && Math.hypot(p[0] - bx, p[1] - bz) > 0.2) {
        const m = node(p[0], p[1]);
        bent++;
        emit(e, a, m, depth + 1);
        emit(e, m, b, depth + 1);
        return;
      }
    }
    for (let q = 0; q <= n; q++) if (!ok[q]) cutWhy[e.kind * 2 + (roadNear(ax + ((bx - ax) * q) / n, az + ((bz - az) * q) / n) ? 0 : 1)] += L / (n + 1);
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    let q = 0;
    while (q <= n) {
      if (!ok[q]) {
        cutLen += L / n;
        q++;
        continue;
      }
      let r = q;
      while (r + 1 <= n && ok[r + 1]) r++;
      const s0 = (q / n) * L;
      const s1 = (r / n) * L;
      if (s1 - s0 >= 0.25) {
        const na = q === 0 ? a : node(ax + ux * s0, az + uz * s0);
        const nb = r === n ? b : node(ax + ux * s1, az + uz * s1);
        // 걷는 띠: 0.5m 마다 양옆으로 몸을 둘 수 있는 거리
        let lo = -e.lo;
        let hi = e.hi;
        for (let s = s0; s <= s1 + 1e-6; s += Math.min(0.2, Math.max(0.05, s1 - s0))) {
          const x = ax + ux * s;
          const z = az + uz * s;
          if (hi > 0) hi = Math.min(hi, room(x, z, -uz, ux, hi + 0.1) - 0.1);
          if (lo > 0) lo = Math.min(lo, room(x, z, uz, -ux, lo + 0.1) - 0.1);
        }
        edges.push({ ...e, a: na, b: nb, lo: -Math.max(0, lo), hi: Math.max(0, hi) });
      }
      q = r + 1;
    }
  };
  for (const e of src) {
    totLen += Math.hypot(X(e.b) - X(e.a), Z(e.b) - Z(e.a));
    emit(e, e.a, e.b, 0);
  }
  log(`선 옮기기·자르기: 전체 ${(totLen / 1000).toFixed(1)}km, 옮긴 노드 ${movedN}, 꺾은 곳 ${bent}, 몸이 닿아 잘라 낸 ${(cutLen / 1000).toFixed(2)}km (종류별 [찻길, 건물] m: ${Array.from(cutWhy, (v) => v.toFixed(0)).join(' ')})`);

  // 선 격자(10m 칸)
  const gk = (cx: number, cz: number) => (cx + 2000) * 4000 + (cz + 2000);
  const egrid = new Map<number, number[]>();
  const addGrid = (i: number) => {
    const e = edges[i];
    for (let cx = Math.floor(Math.min(X(e.a), X(e.b)) / 10); cx <= Math.floor(Math.max(X(e.a), X(e.b)) / 10); cx++)
      for (let cz = Math.floor(Math.min(Z(e.a), Z(e.b)) / 10); cz <= Math.floor(Math.max(Z(e.a), Z(e.b)) / 10); cz++) (egrid.get(gk(cx, cz)) ?? egrid.set(gk(cx, cz), []).get(gk(cx, cz))!).push(i);
  };
  edges.forEach((_, i) => addGrid(i));
  /** 선 i 의 a 에서 s(m) 자리에 노드를 둔다(끝 0.3m 안이면 끝 노드) */
  const splitAt = (i: number, s: number) => {
    const e = edges[i];
    const L = Math.hypot(X(e.b) - X(e.a), Z(e.b) - Z(e.a));
    if (s < 0.3) return e.a;
    if (L - s < 0.3) return e.b;
    const n = node(X(e.a) + ((X(e.b) - X(e.a)) * s) / L, Z(e.a) + ((Z(e.b) - Z(e.a)) * s) / L);
    const b = e.b;
    e.b = n;
    edges.push({ ...e, a: n, b });
    addGrid(i);
    addGrid(edges.length - 1);
    return n;
  };
  /** 두 점 사이를 몸이 지나갈 수 있는가(0.125m 마다) */
  const segClear = (ax: number, az: number, bx: number, bz: number) => {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / 0.125));
    for (let q = 0; q <= n; q++) if (blocked(ax + ((bx - ax) * q) / n, az + ((bz - az) * q) / n)) return false;
    return true;
  };
  /** (x, z)에서 R 안의 선 위 점 가운데 곧게 닿는 가장 가까운 것: [선, a 에서 거리, 거리]. ok 를 주면 그 선만 */
  const reachLine = (x: number, z: number, R: number, ok?: (i: number) => boolean): [number, number, number] | null => {
    const cand: [number, number, number][] = [];
    const seen = new Set<number>();
    for (let cx = Math.floor((x - R) / 10); cx <= Math.floor((x + R) / 10); cx++)
      for (let cz = Math.floor((z - R) / 10); cz <= Math.floor((z + R) / 10); cz++)
        for (const i of egrid.get(gk(cx, cz)) ?? []) {
          if (seen.has(i) || (ok && !ok(i))) continue;
          seen.add(i);
          const e = edges[i];
          const L = Math.hypot(X(e.b) - X(e.a), Z(e.b) - Z(e.a)) || 1e-6;
          for (let s = 0; s <= L + 1e-6; s += Math.min(0.5, L)) {
            const px = X(e.a) + ((X(e.b) - X(e.a)) * s) / L;
            const pz = Z(e.a) + ((Z(e.b) - Z(e.a)) * s) / L;
            const d = Math.hypot(px - x, pz - z);
            if (d <= R) cand.push([i, s, d]);
          }
        }
    cand.sort((p, q) => p[2] - q[2]);
    let tries = 0;
    for (const c of cand) {
      const e = edges[c[0]];
      const L = Math.hypot(X(e.b) - X(e.a), Z(e.b) - Z(e.a)) || 1e-6;
      if (segClear(x, z, X(e.a) + ((X(e.b) - X(e.a)) * c[1]) / L, Z(e.a) + ((Z(e.b) - Z(e.a)) * c[1]) / L)) return c;
      if (++tries > 60) break;
    }
    return null;
  };
  /** 칸을 따라 (x, z)에서 R 안의 선까지 몸이 지나갈 수 있는 길(꺾은선)을 찾는다. 닿은 선 [선, a 에서 거리]와 꺾은선 [x, z, ...] */
  const route = (x: number, z: number, R: number, ok?: (i: number) => boolean): { hit: [number, number]; pts: number[] } | null => {
    const C = 0.25;
    const W = Math.ceil((R * 2) / C) + 1;
    const ox = x - (W * C) / 2;
    const oz = z - (W * C) / 2;
    const free = new Int8Array(W * W).fill(-1);
    const isFree = (i: number) => {
      if (free[i] < 0) free[i] = blocked(ox + ((i % W) + 0.5) * C, oz + (Math.floor(i / W) + 0.5) * C) ? 0 : 1;
      return free[i] === 1;
    };
    // 목표 칸: 선이 지나는 칸
    const goal = new Map<number, [number, number]>();
    const seen = new Set<number>();
    for (let cx = Math.floor((x - R) / 10); cx <= Math.floor((x + R) / 10); cx++)
      for (let cz = Math.floor((z - R) / 10); cz <= Math.floor((z + R) / 10); cz++)
        for (const i of egrid.get(gk(cx, cz)) ?? []) {
          if (seen.has(i) || (ok && !ok(i))) continue;
          seen.add(i);
          const e = edges[i];
          const L = Math.hypot(X(e.b) - X(e.a), Z(e.b) - Z(e.a)) || 1e-6;
          for (let s = 0; s <= L + 1e-6; s += 0.125) {
            const gx = Math.floor((X(e.a) + ((X(e.b) - X(e.a)) * s) / L - ox) / C);
            const gz = Math.floor((Z(e.a) + ((Z(e.b) - Z(e.a)) * s) / L - oz) / C);
            if (gx >= 0 && gz >= 0 && gx < W && gz < W && !goal.has(gz * W + gx)) goal.set(gz * W + gx, [i, Math.min(s, L)]);
          }
        }
    if (!goal.size) return null;
    const s0 = Math.floor((z - oz) / C) * W + Math.floor((x - ox) / C);
    const dist = new Float64Array(W * W).fill(Infinity);
    const prev = new Int32Array(W * W).fill(-1);
    // 단순한 이진 힙
    const hk: number[] = [];
    const hv: number[] = [];
    const push = (k: number, v: number) => {
      hk.push(k), hv.push(v);
      let i = hk.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hk[p] <= hk[i]) break;
        [hk[p], hk[i]] = [hk[i], hk[p]];
        [hv[p], hv[i]] = [hv[i], hv[p]];
        i = p;
      }
    };
    const pop = () => {
      const v = hv[0];
      const lk = hk.pop()!;
      const lv = hv.pop()!;
      if (hk.length) {
        hk[0] = lk;
        hv[0] = lv;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          let m = i;
          if (l < hk.length && hk[l] < hk[m]) m = l;
          if (l + 1 < hk.length && hk[l + 1] < hk[m]) m = l + 1;
          if (m === i) break;
          [hk[m], hk[i]] = [hk[i], hk[m]];
          [hv[m], hv[i]] = [hv[i], hv[m]];
          i = m;
        }
      }
      return v;
    };
    dist[s0] = 0;
    push(0, s0);
    let end = -1;
    while (hk.length && hk.length < W * W * 4) {
      const d0 = hk[0];
      const c = pop();
      if (d0 > dist[c]) continue;
      if (goal.has(c) && c !== s0) {
        end = c;
        break;
      }
      const cx = c % W;
      const cz = (c - cx) / W;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= W) continue;
          const j = nz * W + nx;
          if (!isFree(j)) continue;
          const nd = d0 + (dx && dz ? Math.SQRT2 : 1);
          if (nd < dist[j]) (dist[j] = nd), (prev[j] = c), push(nd, j);
        }
    }
    if (end < 0) return null;
    const cells: number[] = [];
    for (let c = end; c >= 0; c = prev[c]) cells.push(c);
    cells.reverse();
    const P = cells.map((c) => [ox + ((c % W) + 0.5) * C, oz + (Math.floor(c / W) + 0.5) * C]);
    P[0] = [x, z];
    const hit = goal.get(end)!;
    const e = edges[hit[0]];
    const L = Math.hypot(X(e.b) - X(e.a), Z(e.b) - Z(e.a)) || 1e-6;
    P[P.length - 1] = [X(e.a) + ((X(e.b) - X(e.a)) * hit[1]) / L, Z(e.a) + ((Z(e.b) - Z(e.a)) * hit[1]) / L];
    // 줄 당기기: 곧게 닿는 가장 먼 점으로 건너뛴다
    const out = [P[0][0], P[0][1]];
    let i = 0;
    while (i < P.length - 1) {
      let j = P.length - 1;
      while (j > i + 1 && !segClear(P[i][0], P[i][1], P[j][0], P[j][1])) j--;
      out.push(P[j][0], P[j][1]);
      i = j;
    }
    return { hit, pts: out };
  };
  /** (x, z) 노드에서 그물까지 잇는다(곧게, 안 되면 칸을 따라). 이은 그물 쪽 노드를 돌려준다 */
  const linkUp = (from: number, R: number, ok?: (i: number) => boolean): number => {
    const x = X(from);
    const z = Z(from);
    const h = reachLine(x, z, Math.min(R, 15), ok);
    if (h) {
      const m = splitAt(h[0], h[1]);
      if (m !== from) edges.push({ a: from, b: m, kind: LINK, cls: 4, hot: false, lo: -1.2, hi: 1.2 }), addGrid(edges.length - 1);
      return m;
    }
    const r = route(x, z, R, ok);
    if (!r) return -1;
    const m = splitAt(r.hit[0], r.hit[1]);
    let p = from;
    for (let k = 2; k < r.pts.length; k += 2) {
      const q = k === r.pts.length - 2 ? m : node(r.pts[k], r.pts[k + 1]);
      if (q !== p) edges.push({ a: p, b: q, kind: LINK, cls: 4, hot: false, lo: -1.2, hi: 1.2 }), addGrid(edges.length - 1);
      p = q;
    }
    return m;
  };

  // ── 끊긴 끝 다시 잇기: 끝점마다 6m 안의 다른 선(그물을 따라 15m 안은 제 길이라 빼고)에 곧게, 안 되면 칸을 따라 잇는다 ──
  {
    const inc: number[][] = Array.from({ length: nodes.length / 2 }, () => []);
    edges.forEach((e, i) => (inc[e.a].push(i), inc[e.b].push(i)));
    const ends: number[] = [];
    for (let n = 0; n < inc.length; n++) if (inc[n].length === 1) ends.push(n);
    let tied = 0;
    for (const n of ends) {
      const near = new Set<number>();
      const dist = new Map<number, number>([[n, 0]]);
      const q = [n];
      while (q.length) {
        const m = q.shift()!;
        for (const i of inc[m] ?? []) {
          near.add(i);
          const e = edges[i];
          const o2 = e.a === m ? e.b : e.a;
          const d = dist.get(m)! + Math.hypot(X(o2) - X(m), Z(o2) - Z(m));
          if (d < 15 && !dist.has(o2)) dist.set(o2, d), q.push(o2);
        }
      }
      const before = edges.length;
      const m = linkUp(n, 6, (i) => !near.has(i) && i < before);
      if (m >= 0) tied++;
    }
    log(`끊긴 끝 ${ends.length}개 가운데 다시 이은 것 ${tied}`);
  }

  // 덩어리(선 길이가 가장 긴 것)
  const comps = () => {
    const N = nodes.length / 2;
    const root = Int32Array.from({ length: N }, (_, i) => i);
    const find = (i: number): number => {
      if (i >= N) return -1;
      while (root[i] !== i) (root[i] = root[root[i]]), (i = root[i]);
      return i;
    };
    for (const e of edges) root[find(e.a)] = find(e.b);
    for (let k = 0; k < links.length; k += LINK_N) root[find(links[k + 1])] = find(links[k + 2]);
    const len = new Float64Array(N);
    for (const e of edges) len[find(e.a)] += Math.hypot(X(e.b) - X(e.a), Z(e.b) - Z(e.a));
    let big = 0;
    for (let i = 0; i < N; i++) if (len[i] > len[big]) big = i;
    return { find, big: find(big), len };
  };
  const links: number[] = [];

  // ── ③ 횡단보도 ──
  let main = comps();
  const onMain = (i: number) => main.find(edges[i].a) === main.big;
  const bareLen: number[] = [];
  const failed: string[] = [];
  inp.crosswalks.forEach((c, xw) => {
    const ends: { ex: number; ez: number; px: number; pz: number; bare: number }[] = [];
    for (const sg of [-1, 1]) {
      const ex = c.x + c.ux * c.half * sg;
      const ez = c.z + c.uz * c.half * sg;
      // 축과 나란한 줄(축, 그다음 칠 폭 안 옆줄)을 따라 바깥으로 가며 몸이 큰길 찻길·건물에 닿지 않는 첫 자리
      let got: { ex: number; ez: number; px: number; pz: number; bare: number } | null = null;
      const lim = Math.max(0, c.wid / 2 - CLEAR);
      for (const lat of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 3, -3].filter((v) => Math.abs(v) <= Math.max(lim, 0.5))) {
        const sx = ex - c.uz * lat;
        const sz = ez + c.ux * lat;
        for (let d = -Math.min(c.half, 2); d <= 10; d += 0.125) {
          const px = sx + c.ux * sg * d;
          const pz = sz + c.uz * sg * d;
          if (bitsAt(B, px, pz) & BLDG) break;
          if (!blocked(px, pz)) {
            // 칠 끝에서 기다리는 자리까지 칠 밖 찻길을 지나는 거리
            let bare = 0;
            for (let t = 0; t <= d; t += 0.125) {
              const f = bitsAt(B, sx + c.ux * sg * t, sz + c.uz * sg * t);
              if (f & ROAD && !(f & XW)) bare += 0.125;
            }
            if (bare <= MAX_BARE) got = { ex: sx, ez: sz, px, pz, bare };
            break;
          }
        }
        if (got) break;
      }
      if (!got) {
        // 축을 따라 못 찾으면 끝에서 MAX_BARE 안 가장 가까운 빈자리(바깥쪽 반)
        let bd = Infinity;
        for (let dx = -MAX_BARE; dx <= MAX_BARE; dx += 0.25)
          for (let dz = -MAX_BARE; dz <= MAX_BARE; dz += 0.25) {
            const r = Math.hypot(dx, dz);
            if (r > MAX_BARE || r >= bd || (dx * c.ux + dz * c.uz) * sg < -0.5) continue;
            if (!blocked(ex + dx, ez + dz)) (bd = r), (got = { ex, ez, px: ex + dx, pz: ez + dz, bare: r });
          }
      }
      if (!got) return failed.push(`${xw} ${sg < 0 ? 'a' : 'b'}: 자리 없음`);
      ends.push(got);
    }
    if (ends.length < 2) return;
    const na = node(ends[0].px, ends[0].pz);
    const nb = node(ends[1].px, ends[1].pz);
    // 그물 큰 덩어리를 먼저 찾고, 없으면 아무 선에
    let ma = linkUp(na, 40, onMain);
    if (ma < 0) ma = linkUp(na, 40);
    let mb = linkUp(nb, 40, onMain);
    if (mb < 0) mb = linkUp(nb, 40);
    if (ma < 0 || mb < 0) return failed.push(`${xw}: 이을 선 없음(${ma < 0 ? 'a' : ''}${mb < 0 ? 'b' : ''})`);
    bareLen.push(ends[0].bare + ends[1].bare);
    // 기다리는 자리에서 축을 가로질러 비켜 설 수 있는 범위(a→b 오른쪽 +): 그 자리와 0.75m 뒤가 모두 몸이 찻길·건물에 닿지 않는 데까지(칠 폭/2 안)
    const vx = ends[1].ex - ends[0].ex;
    const vz = ends[1].ez - ends[0].ez;
    const vl = Math.hypot(vx, vz) || 1;
    const room2 = (p: (typeof ends)[0], back: number) => {
      const lim = Math.max(0.25, c.wid / 2 - 0.3);
      const okAt = (s: number) => [0, 0.75].every((r) => !blocked(p.px - (vz / vl) * s + (vx / vl) * back * r, p.pz + (vx / vl) * s + (vz / vl) * back * r));
      let lo = 0;
      let hi = 0;
      while (lo - 0.25 >= -lim && okAt(lo - 0.25)) lo -= 0.25;
      while (hi + 0.25 <= lim && okAt(hi + 0.25)) hi += 0.25;
      // 기다리는 자리 쪽 축 거리(축에서 기다리는 자리까지 옆으로 떨어진 거리)를 더해 축 기준으로 적는다
      const s0 = (p.px - ends[0].ex) * (-vz / vl) + (p.pz - ends[0].ez) * (vx / vl);
      return [s0 + lo, s0 + hi];
    };
    let major = false;
    for (let d = -c.half; d <= c.half; d += 0.5) if (bitsAt(B, c.x + c.ux * d, c.z + c.uz * d) & ROAD) major = true;
    links.push(xw, na, nb, ends[0].ex, ends[0].ez, ends[1].ex, ends[1].ez, ends[0].px, ends[0].pz, ends[1].px, ends[1].pz, c.wid, major ? 1 : 0, ...room2(ends[0], -1), ...room2(ends[1], 1));
  });
  bareLen.sort((p, q) => p - q);
  log(`횡단보도 ${inp.crosswalks.length}개 가운데 이은 것 ${links.length / LINK_N}, 못 이은 것 ${failed.length}${failed.length ? ` (${failed.join(', ')})` : ''}`);
  log(`칠 끝에서 기다리는 자리까지 칠 밖 찻길(양 끝 합): 중앙값 ${bareLen[bareLen.length >> 1]?.toFixed(2)}m, 90% ${bareLen[Math.floor(bareLen.length * 0.9)]?.toFixed(2)}m, 가장 긴 ${bareLen[bareLen.length - 1]?.toFixed(2)}m`);

  // ── ④ 한 덩어리 ──
  main = comps();
  {
    const N = nodes.length / 2;
    const small = new Map<number, number[]>();
    for (let n = 0; n < N; n++) {
      const r = main.find(n);
      if (r !== main.big) (small.get(r) ?? small.set(r, []).get(r)!).push(n);
    }
    let joined = 0;
    const linkNodes = new Set<number>();
    for (let k = 0; k < links.length; k += LINK_N) linkNodes.add(links[k + 1]), linkNodes.add(links[k + 2]);
    const bigRoot = main.big;
    const okBig = (i: number) => main.find(edges[i].a) === bigRoot;
    for (const [r, ns] of small) {
      if (main.len[r] < 10 && !ns.some((n) => linkNodes.has(n))) continue;
      // 조각 노드 몇 개(끝점부터)에서 큰 덩어리 선까지 칸을 따라 30m 안. 이은 조각은 큰 덩어리로 친다(뿌리를 큰 덩어리에 붙인다)
      for (const n of ns.filter((_, k) => k % Math.max(1, Math.floor(ns.length / 3)) === 0).slice(0, 3)) {
        const m = linkUp(n, 30, okBig);
        if (m >= 0) {
          joined++;
          break;
        }
      }
    }
    main = comps();
    log(`떨어진 조각 ${small.size}개 가운데 이은 것 ${joined}`);
  }
  const keep = (n: number) => main.find(n) === main.big;
  const keptLinks: number[] = [];
  let dropLinks = 0;
  for (let k = 0; k < links.length; k += LINK_N) {
    if (keep(links[k + 1]) && keep(links[k + 2])) keptLinks.push(...links.slice(k, k + LINK_N));
    else dropLinks++;
  }
  let dropLen = 0;
  for (const e of edges) if (!keep(e.a)) dropLen += Math.hypot(X(e.b) - X(e.a), Z(e.b) - Z(e.a));
  log(`한 덩어리 밖이라 버린 선 ${(dropLen / 1000).toFixed(2)}km, 횡단보도 ${dropLinks}`);

  // ── 좌표를 dm 로 반올림한 뒤 걷는 띠를 다시 잰다(짧은 선은 반올림으로 방향이 바뀌어 넓은 띠 끝이 옮겨 간다) ──
  for (let k = 0; k < nodes.length; k++) nodes[k] = Math.round(nodes[k] * 10) / 10;
  for (const e of edges) {
    if (!keep(e.a)) continue;
    const [ax, az, bx, bz] = [X(e.a), Z(e.a), X(e.b), Z(e.b)];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    let lo = -e.lo;
    let hi = e.hi;
    for (let s = 0; s <= L + 1e-6; s += Math.min(0.2, L)) {
      const x = ax + ux * s;
      const z = az + uz * s;
      if (hi > 0) hi = Math.min(hi, room(x, z, -uz, ux, hi + 0.1) - 0.1);
      if (lo > 0) lo = Math.min(lo, room(x, z, uz, -ux, lo + 0.1) - 0.1);
    }
    e.lo = -Math.max(0, lo);
    e.hi = Math.max(0, hi);
  }

  // ── 마지막 확인(시험과 같은 자리): 0.5m 마다 가운데선과 띠 양 끝에 선 몸이 큰길 찻길에 닿으면 그쪽 띠를 줄인다 ──
  {
    let shrunk = 0;
    let bad = 0;
    for (const e of edges) {
      if (!keep(e.a)) continue;
      const [ax, az, bx, bz] = [X(e.a), Z(e.a), X(e.b), Z(e.b)];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-6) continue;
      const ux = (bx - ax) / L;
      const uz = (bz - az) / L;
      const n = Math.max(1, Math.ceil(L / 0.5));
      // 사람은 띠를 선 양 끝 너머 EDGE_EXT 까지 쓴다(모퉁이에서 다음 선으로 갈아탈 때)
      const hit = (u: number) => {
        for (let q = -1; q <= n + 1; q++) {
          const t = q < 0 ? -EDGE_EXT : q > n ? L + EDGE_EXT : (L * q) / n;
          if (hitDisc(B, ax + ux * t - uz * u, az + uz * t + ux * u, BODY_R, ROAD)) return true;
        }
        return false;
      };
      e.lo = Math.ceil(e.lo * 10 - 1e-6) / 10;
      e.hi = Math.floor(e.hi * 10 + 1e-6) / 10;
      while (e.hi > 0 && hit(e.hi)) (e.hi = Math.max(0, Math.round((e.hi - 0.1) * 10) / 10)), shrunk++;
      while (e.lo < 0 && hit(e.lo)) (e.lo = Math.min(0, Math.round((e.lo + 0.1) * 10) / 10)), shrunk++;
      if (hit(0)) bad++;
    }
    log(`마지막 확인: 띠 줄임 ${shrunk}번, 가운데선이 닿는 선 ${bad}`);
  }

  // ── 노드 원 반지름: 16 방향으로 몸을 둘 수 있는 거리(이웃 선 띠 반폭보다 크지 않게) ──
  const N = nodes.length / 2;
  const deg: number[][] = Array.from({ length: N }, () => []);
  edges.forEach((e, i) => keep(e.a) && (deg[e.a].push(i), deg[e.b].push(i)));
  const rad = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    if (!deg[n].length) continue;
    // 이웃 선 띠 가운데 가장 넓은 반폭(최대 3m)까지: 한쪽으로 치우친 띠(가장자리를 따라가는 선)에서도 모퉁이를 돌 수 있게
    let r = 0;
    for (const i of deg[n]) r = Math.max(r, -edges[i].lo, edges[i].hi);
    r = Math.min(3, Math.max(r, 0.6));
    for (let k = 0; k < 16 && r > 0; k++) {
      const a = (k * Math.PI) / 8;
      r = Math.min(r, room(X(n), Z(n), Math.cos(a), Math.sin(a), r));
    }
    rad[n] = Math.max(0, r);
  }

  // ── ⑤ 건물 문: 문턱에서 걷는 띠까지 곧게, 큰길 찻길을 지나지 않는다 ──
  const doors: number[] = [];
  if (inp.doorOk) {
    const roadAt = roadNear;
    inp.buildings.forEach((p, bi) => {
      let cx = 0;
      let cz = 0;
      for (let k = 0; k < p.length; k += 2) (cx += p[k]), (cz += p[k + 1]);
      cx /= p.length / 2;
      cz /= p.length / 2;
      if (!inp.doorOk!(bi, cx, cz)) return;
      // 건물 가운데에서 가까운 선(25m 안) 몇 개: 그 선 위 가장 가까운 점, 벽 위 가장 가까운 점이 문
      const seen = new Set<number>();
      const cand: [number, number, number][] = [];
      for (let gx = Math.floor((cx - 30) / 10); gx <= Math.floor((cx + 30) / 10); gx++)
        for (let gz = Math.floor((cz - 30) / 10); gz <= Math.floor((cz + 30) / 10); gz++)
          for (const i of egrid.get(gk(gx, gz)) ?? []) {
            if (seen.has(i) || !keep(edges[i].a) || edges[i].kind === LINK) continue;
            seen.add(i);
            const e = edges[i];
            const L = Math.hypot(X(e.b) - X(e.a), Z(e.b) - Z(e.a)) || 1e-6;
            const t = Math.max(0, Math.min(L, ((cx - X(e.a)) * (X(e.b) - X(e.a)) + (cz - Z(e.a)) * (Z(e.b) - Z(e.a))) / L));
            cand.push([i, t, Math.hypot(X(e.a) + ((X(e.b) - X(e.a)) * t) / L - cx, Z(e.a) + ((Z(e.b) - Z(e.a)) * t) / L - cz)]);
          }
      cand.sort((p, q) => p[2] - q[2]);
      for (const [i, t] of cand.slice(0, 4)) {
        const e = edges[i];
        const L = Math.hypot(X(e.b) - X(e.a), Z(e.b) - Z(e.a)) || 1e-6;
        const sx = X(e.a) + ((X(e.b) - X(e.a)) * t) / L;
        const sz = Z(e.a) + ((Z(e.b) - Z(e.a)) * t) / L;
        // 벽 위 가장 가까운 점
        let bd = Infinity;
        let wx = 0;
        let wz = 0;
        for (let k = 0, j = p.length - 2; k < p.length; j = k, k += 2) {
          const dx = p[k] - p[j];
          const dz = p[k + 1] - p[j + 1];
          const l2 = dx * dx + dz * dz || 1;
          const u = Math.max(0, Math.min(1, ((sx - p[j]) * dx + (sz - p[j + 1]) * dz) / l2));
          const d = Math.hypot(p[j] + dx * u - sx, p[j + 1] + dz * u - sz);
          if (d < bd) (bd = d), (wx = p[j] + dx * u), (wz = p[j + 1] + dz * u);
        }
        if (bd > 20 || bd < 0.6) continue;
        const ox = wx + ((sx - wx) / bd) * 0.5;
        const oz = wz + ((sz - wz) / bd) * 0.5;
        // 문턱 → 선 위 점: 큰길 찻길에 몸이 닿지 않고 다른 건물 안을 지나지 않는다
        const n = Math.ceil(bd / 0.125);
        let ok = true;
        for (let q = 0; q <= n && ok; q++) {
          const x = ox + ((sx - ox) * q) / n;
          const z = oz + ((sz - oz) * q) / n;
          if (roadAt(x, z) || (q > 4 && bitsAt(B, x, z) & BLDG)) ok = false;
        }
        if (!ok) continue;
        doors.push(bi, i, t, ox, oz);
        break;
      }
    });
  }

  // ── 쓰기 ──
  const used = new Int32Array(N).fill(-1);
  const out: number[] = [];
  const r: number[] = [];
  let px = 0;
  let pz = 0;
  const id = (n: number) => {
    if (used[n] < 0) {
      used[n] = out.length / 2;
      const x = Math.round(X(n) * 10);
      const z = Math.round(Z(n) * 10);
      out.push(x - px, z - pz);
      r.push(Math.max(0, Math.floor(rad[n] * 10) - 1));
      px = x;
      pz = z;
    }
    return used[n];
  };
  const kept = edges.map((e, i) => ({ e, i })).filter(({ e }) => keep(e.a) && e.a !== e.b);
  const list = kept.map(({ e, i }) => ({ ...e, a: id(e.a), b: id(e.b), i }));
  list.sort((p, q) => p.a - q.a);
  const eOut: number[] = [];
  const edgeNo = new Map<number, number>();
  let pa = 0;
  list.forEach((q, k) => {
    edgeNo.set(q.i, k);
    // 걷는 띠는 dm 로 안쪽으로 내린다(반올림으로 넓어지지 않게)
    eOut.push(q.a - pa, q.b - q.a, q.kind * 16 + Math.min(7, q.cls) * 2 + (q.hot ? 1 : 0), Math.ceil(q.lo * 10 - 1e-6), Math.floor(q.hi * 10 + 1e-6));
    pa = q.a;
  });
  const x: number[] = [];
  for (let k = 0; k < keptLinks.length; k += LINK_N) {
    const v = keptLinks;
    x.push(v[k], id(v[k + 1]), id(v[k + 2]), ...v.slice(k + 3, k + 12).map((u) => Math.round(u * 10)), v[k + 12], Math.ceil(v[k + 13] * 10), Math.floor(v[k + 14] * 10), Math.ceil(v[k + 15] * 10), Math.floor(v[k + 16] * 10));
  }
  const d: number[] = [];
  for (let k = 0; k < doors.length; k += 5) {
    const no = edgeNo.get(doors[k + 1]);
    if (no === undefined) continue;
    d.push(doors[k], no, Math.round(doors[k + 2] * 10), Math.round(doors[k + 3] * 10), Math.round(doors[k + 4] * 10));
  }
  log(`걷는 길: 노드 ${out.length / 2}, 선 ${eOut.length / 5}, 횡단보도 연결 ${x.length / LINK_N}, 건물 문 ${d.length / 5}`);
  return { v: 3, n: out, e: eOut, x, r, d };
}

/** 판 자료로 걷는 길 그물을 굽고(walknet.ts) 바로잡는다. tools/bake.ts 와 tools/walk.ts 가 쓴다 */
export function bakeWalk(
  b: { roads: Road[]; buildings: { pts: ArrayLike<number> }[]; crosswalks: FixInput['crosswalks'] },
  raw: WalkJson,
  faces: Face[],
  draw: ArrayLike<number>[],
  polys: { car: [number, ArrayLike<number>][]; med: ArrayLike<number>[] },
  bounds: [number, number, number, number],
  doorOk?: FixInput['doorOk'],
  log?: (s: string) => void,
): WalkJson {
  return fixWalkNet({ json: raw, bounds, roads: b.roads, faces, draw, car: polys.car, med: polys.med, buildings: b.buildings.map((q) => q.pts), crosswalks: b.crosswalks, doorOk, log });
}
