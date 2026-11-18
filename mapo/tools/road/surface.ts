// 찻길 면·보도 면을 길 정본에서 굽는다(재작업 W51, 설계 문서 59절 B2: G5 찻길 면 하나, G6 연석, 분리대, G8 보도 면).
// 판 전체를 0.25m 칸 하나에 칠한다. 찻길 = 지금 찻길 띠·교차로 면·그리기 전용 면(연석 쪽 선까지 넓힌 가장자리·모퉁이 호·횡단보도 밑, 44절) ∪ 길 정본 차로 띠
// ∪ 교차로·이음매 경로 띠(차 몸 반폭 + 0.3m) ∪ 마주 오는 한 방향 찻길 사이 틈(서울시 가장자리구역선 007·버스정차구획선 015 가 양쪽에서 1m 넘게 떨어져 마주 보는 곳은
// 분리대, 아니면 찻길) − 분리대 − 땅 위 철도 부지(선로 띠·터파기). 0.5m 보다 좁은 틈은 메우고 좁은 조각은 깎은 뒤, 64m 타일마다 외곽선을 따서
// 칸 층(src/data/surface.ts tileRings)으로 낸다. 연석은 앱이 이 외곽선에서 만든다(tileRings 의 edges). 보도 면은 도시생태현황도 도로 부지·광장과
// 지금 보도 면(채움 포함)·교통섬·분리대·찻길을 합쳐 철도 부지를 뺀 것이고 찻길 밑까지 깐다. 차·사람 움직임 자료(road·walk·board)는 읽기만 한다.
import type { Board } from '../../src/data/board.ts';
import { GK } from '../../src/data/board.ts';
import { laneBands, bandQuad } from '../../src/data/laneGround.ts';
import type { MarkLine } from '../../src/data/marks.ts';
import { GCELL, GN, GNT, GTILE, tileRings, type Surface } from '../../src/data/surface.ts';
import { BOARD_R } from '../../src/geo.ts';
import { pointAt } from '../../src/poly.ts';
import { headingNear, laneOff, laneWidth, leftEdge, MED, rightEdge, type Edge } from '../../src/sim/graph.ts';
import type { Inter } from '../../src/sim/intersection/index.ts';
import { makeBits, fillBits, type Bits } from '../lib/bits.ts';
import { traceLoops, ringArea } from '../lib/contour.ts';

/** 칸 비트 */
export const SB = { ROAD: 1, MED: 2, RAIL: 4, RES: 8, GAP: 16, KEEP: 32, WIDE: 64, WALK: 128 } as const;

export interface SurfaceInput {
  board: Board;
  g: Edge[];
  inter: Inter;
  /** 지금 surface.json(띠 구간·교차로 면·그리기 전용 면) */
  sf: Surface;
  /** 지금 surface-polys.json(dm): 찻길 띠 [조각, 고리], 보도 면, 교통섬, 그리기 전용 면 */
  polys: { car: number[][]; walk: number[][]; isl: number[][]; draw: number[][] };
  /** 자르기 전 땅 위 서울시 선(tools/raw/seoul-lines-ground.json): 분리대 판정(007·015) */
  seoul: MarkLine[];
  /** 걷는 그물(walk.json n·e): 사람이 걷는 보도·보행로 선이 지나는 섬·분리대는 찻길로 메우지 않는다 */
  walk?: { n: number[]; e: number[] };
}

export interface SurfaceOut {
  /** surface.json v2 칸 층 */
  g: number[];
  w: number[];
  m: number[];
  /** 횡단보도 끝 점자블록(curbs.json t) */
  tactile: number[];
  /** 마지막 찻길 칸(판 전체 0.25m, 1 = 찻길) */
  road: Bits;
  log: string;
}

/** 땅 위 철도 조각 [ax, az, bx, bz, 반폭]: 터널 빼고, 선로 높이 5m 넘는 다리 빼고. 선로 띠 4.5m, 땅 밑 터파기 6.2m(옹벽 + 0.5m). test/w48-stage2.ts railSegs 와 같은 정의 */
export function railSegs(board: Board): number[][] {
  const out: number[][] = [];
  for (const l of board.lines) {
    const n = l.p.length / 3;
    for (let i = 0; i + 1 < n; i++) {
      if (l.kind[i] === -1) continue;
      const ya = l.p[i * 3 + 1];
      const yb = l.p[i * 3 + 4];
      if (Math.min(ya, yb) >= 5) continue;
      out.push([l.p[i * 3], l.p[i * 3 + 2], l.p[i * 3 + 3], l.p[i * 3 + 5], Math.min(ya, yb) < 0 ? 6.2 : 4.5]);
    }
  }
  return out;
}

const dmRing = (a: ArrayLike<number>, from = 0) => Float32Array.from(Array.prototype.slice.call(a, from) as number[], (v) => v / 10);

/** 선(꺾은선 [x, z, ...])을 반폭 half 사각형들로 칠한다(끝을 늘이지 않는다) */
function strokeFlat(B: Bits, line: ArrayLike<number>, half: number, bit: number) {
  for (let k = 0; k + 3 < line.length; k += 2) {
    const [ax, az, bx, bz] = [line[k], line[k + 1], line[k + 2], line[k + 3]];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-4) continue;
    const nx = (-(bz - az) / L) * half;
    const nz = ((bx - ax) / L) * half;
    fillBits(B, [[ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz, ax - nx, az - nz]], bit);
  }
}

/** 비트 bit 판을 0/1 판으로 */
function plane(B: Bits, bit: number): Uint8Array {
  const o = new Uint8Array(B.v.length);
  for (let i = 0; i < o.length; i++) o[i] = B.v[i] & bit ? 1 : 0;
  return o;
}

/** 0/1 판 늘이기(grow) 또는 줄이기: 정사각형 (2r+1) 칸, 가로·세로 나눠서 */
function morph(a: Uint8Array, w: number, h: number, r: number, grow: boolean): Uint8Array {
  const t = new Uint8Array(a.length);
  const o = new Uint8Array(a.length);
  const pass = (src: Uint8Array, dst: Uint8Array, horiz: boolean) => {
    const [n, m, step, line] = horiz ? [h, w, 1, w] : [w, h, w, 1];
    for (let q = 0; q < n; q++) {
      const base = q * line;
      for (let i = 0; i < m; i++) {
        let v = grow ? 0 : 1;
        for (let d = -r; d <= r; d++) {
          const j = i + d;
          // 판 밖은 늘이기에서는 비어 있고 줄이기에서는 차 있는 것으로 본다(판 가장자리에서 잘린 찻길을 줄이지 않는다)
          const x = j < 0 || j >= m ? (grow ? 0 : 1) : src[base + j * step];
          if (grow ? x : !x) {
            v = grow ? 1 : 0;
            break;
          }
        }
        dst[base + i * step] = v;
      }
    }
  };
  pass(a, t, true);
  pass(t, o, false);
  return o;
}

/** 0/1 판을 타일마다 외곽선(고정점 둔 0.3m 줄이기)으로 → 칸 층 */
export function encodeTiles(a: Uint8Array, minArea = 1): number[] {
  const T = GTILE;
  const sub = new Uint8Array(T * T);
  // 1차: 타일마다 외곽선을 따서 줄인다. 줄인 고리가 타일 테두리를 따라가는 칸 변(테두리 위 두 고정점 사이)을 '이 타일 면이 테두리에 닿는 변'으로 적는다
  const tiles: [number, number[][]][] = [];
  /** 테두리 칸 변 열쇠: 가로 변 (gx, gz)→(gx+1, gz) 은 h = 0, 세로 변 (gx, gz)→(gx, gz+1) 은 h = 1, 면이 변의 어느 쪽인가(side: 0 앞(작은 좌표) 쪽, 1 뒤 쪽) */
  const key = (gx: number, gz: number, h: number, side: number) => ((gz * (GN + 1) + gx) * 2 + h) * 2 + side;
  const touch = new Set<number>();
  for (let tj = 0; tj < GNT; tj++)
    for (let ti = 0; ti < GNT; ti++) {
      sub.fill(0);
      let any = false;
      for (let j = 0; j < T; j++) {
        const gj = tj * T + j;
        if (gj >= GN) break;
        for (let i = 0; i < T; i++) {
          const gi = ti * T + i;
          if (gi >= GN) break;
          if (a[gj * GN + gi]) (sub[j * T + i] = 1), (any = true);
        }
      }
      if (!any) continue;
      const loops: number[][] = [];
      for (const loop of traceLoops(sub, T)) {
        const q = simplifyPinned(loop, 0.3 / GCELL, T);
        const pinned = q.some((v) => v === 0 || v === T);
        if (q.length < 6 || (!pinned && Math.abs(ringArea(q)) * GCELL * GCELL < minArea)) continue;
        loops.push(q);
        const n = q.length / 2;
        for (let k = 0; k < n; k++) {
          const [x0, z0, x1, z1] = [q[k * 2], q[k * 2 + 1], q[((k + 1) % n) * 2], q[((k + 1) % n) * 2 + 1]];
          if (z0 === z1 && (z0 === 0 || z0 === T)) for (let x = Math.min(x0, x1); x < Math.max(x0, x1); x++) touch.add(key(ti * T + x, tj * T + z0, 0, z0 === 0 ? 1 : 0));
          if (x0 === x1 && (x0 === 0 || x0 === T)) for (let z = Math.min(z0, z1); z < Math.max(z0, z1); z++) touch.add(key(ti * T + x0, tj * T + z, 1, x0 === 0 ? 1 : 0));
        }
      }
      if (loops.length) tiles.push([tj * GNT + ti, loops]);
    }
  // 2차: 테두리를 따라가는 변마다 건너편 타일 면이 그 칸 변에 닿지 않으면 진짜 외곽선(연석)이다. 닿는 곳과 안 닿는 곳이 바뀌는 점에서 나누고,
  // 그 변의 시작 점 x 에 1 을 더해 적는다(x 는 두 배로 적는다, src/data/surface.ts tileRings)
  const out: number[] = [];
  for (const [tile, loops] of tiles) {
    const [ti, tj] = [tile % GNT, Math.floor(tile / GNT)];
    out.push(tile, loops.length);
    for (const q of loops) {
      const n = q.length / 2;
      const pts: number[] = [];
      for (let k = 0; k < n; k++) {
        const [x0, z0, x1, z1] = [q[k * 2], q[k * 2 + 1], q[((k + 1) % n) * 2], q[((k + 1) % n) * 2 + 1]];
        const horiz = z0 === z1 && (z0 === 0 || z0 === T);
        const vert = x0 === x1 && (x0 === 0 || x0 === T);
        if (!horiz && !vert) {
          pts.push(x0 * 2, z0);
          continue;
        }
        // 이 변의 칸 변마다 건너편이 닿는가(건너편 = 같은 칸 변, 면이 반대쪽)
        const L = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
        const sx = Math.sign(x1 - x0);
        const sz = Math.sign(z1 - z0);
        const open = (m: number) => {
          const [ux, uz] = [x0 + sx * m, z0 + sz * m];
          const gx = ti * T + (horiz ? Math.min(ux, ux + sx) : ux);
          const gz = tj * T + (vert ? Math.min(uz, uz + sz) : uz);
          const outside = horiz ? (z0 === 0 ? tj === 0 : tj === GNT - 1 || (tj + 1) * T >= GN) : x0 === 0 ? ti === 0 : ti === GNT - 1 || (ti + 1) * T >= GN;
          return outside || !touch.has(key(gx, gz, horiz ? 0 : 1, horiz ? (z0 === 0 ? 0 : 1) : x0 === 0 ? 0 : 1)) ? 1 : 0;
        };
        let f = open(0);
        pts.push(x0 * 2 + f, z0);
        for (let m = 1; m < L; m++) {
          const g = open(m);
          if (g !== f) (pts.push((x0 + sx * m) * 2 + g, z0 + sz * m), (f = g));
        }
      }
      out.push(pts.length / 2);
      for (let k = 0; k < pts.length; k++) out.push(k < 2 ? pts[k] : pts[k] - pts[k - 2]);
    }
  }
  return out;
}

/** 닫힌 격자 고리를 tol(칸) 안에서 줄인다. 타일 테두리(0·T) 위 점은 두되 같은 테두리 위에 곧게 늘어선 가운데 점은 지운다 */
function simplifyPinned(p: number[], tol: number, T: number): number[] {
  const n = p.length / 2;
  const on = (i: number) => p[i * 2] === 0 || p[i * 2] === T || p[i * 2 + 1] === 0 || p[i * 2 + 1] === T;
  const keep = new Uint8Array(n);
  const pins: number[] = [];
  for (let i = 0; i < n; i++) if (on(i)) pins.push(i);
  if (!pins.length) {
    // 고정점 없는 고리: 가장 먼 두 점으로 나눠 줄인다(tools/lib/contour.ts simplifyLoop 과 같다)
    let far = 0;
    let best = -1;
    for (let i = 1; i < n; i++) {
      const d = Math.hypot(p[i * 2] - p[0], p[i * 2 + 1] - p[1]);
      if (d > best) (best = d), (far = i);
    }
    pins.push(0, far);
  }
  for (const i of pins) keep[i] = 1;
  const dp = (s: number, e: number) => {
    const stack: [number, number][] = [[s, e]];
    while (stack.length) {
      const [a, b] = stack.pop()!;
      const [ax, az, bx, bz] = [p[(a % n) * 2], p[(a % n) * 2 + 1], p[(b % n) * 2], p[(b % n) * 2 + 1]];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      let m = -1;
      let md = tol;
      for (let i = a + 1; i < b; i++) {
        const x = p[(i % n) * 2];
        const z = p[(i % n) * 2 + 1];
        const d = Math.abs((bx - ax) * (az - z) - (ax - x) * (bz - az)) / L;
        if (d > md) (md = d), (m = i);
      }
      if (m >= 0) {
        keep[m % n] = 1;
        stack.push([a, m], [m, b]);
      }
    }
  };
  for (let k = 0; k < pins.length; k++) {
    const a = pins[k];
    const b = k + 1 < pins.length ? pins[k + 1] : pins[0] + n;
    if (b - a > 1) dp(a, b);
  }
  // 같은 테두리 위에 곧게 늘어선 고정점은 가운데 것을 지운다
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) idx.push(i);
  const side = (i: number, j: number) => (p[i * 2] === p[j * 2] && (p[i * 2] === 0 || p[i * 2] === T)) || (p[i * 2 + 1] === p[j * 2 + 1] && (p[i * 2 + 1] === 0 || p[i * 2 + 1] === T));
  const m = idx.length;
  const drop = new Uint8Array(m);
  for (let k = 0; k < m; k++) {
    const [a, b, c] = [idx[(k + m - 1) % m], idx[k], idx[(k + 1) % m]];
    if (m > 3 && on(b) && side(a, b) && side(b, c) && ((p[a * 2] === p[b * 2] && p[b * 2] === p[c * 2]) || (p[a * 2 + 1] === p[b * 2 + 1] && p[b * 2 + 1] === p[c * 2 + 1]))) drop[k] = 1;
  }
  const out: number[] = [];
  for (let k = 0; k < m; k++) if (!drop[k]) out.push(p[idx[k] * 2], p[idx[k] * 2 + 1]);
  return out;
}

/** 길 정본에서 찻길 면·보도 면·분리대를 굽는다 */
export function bakeSurface(inp: SurfaceInput): SurfaceOut {
  const { board, g, inter, sf, polys, seoul } = inp;
  const { X } = inter;
  const B = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, GCELL);
  /** 차가 달리는 자리(차로 띠·교차로 경로): 분리대가 이 자리를 지우지 않는다 */
  const core = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, GCELL);
  if (B.w !== GN || B.h !== GN) throw new Error(`격자 크기 ${B.w}×${B.h} ≠ ${GN}`);
  const log: string[] = [];
  const t0 = Date.now();
  // ① 지금 찻길 면: 띠(찻길 터널 조각 빼고)·교차로 면(구멍 = 교통섬)·그리기 전용 면
  for (const c of polys.car) if (!board.roads[c[0]]?.tunnel) fillBits(B, [dmRing(c, 1)], SB.ROAD);
  for (const f of sf.faces) fillBits(B, [f.outer, ...f.holes], SB.ROAD);
  for (const f of sf.draw) fillBits(B, [f.outer], SB.ROAD);
  for (const d of polys.draw) fillBits(B, [dmRing(d)], SB.ROAD);
  // ② 길 정본 차로 띠(땅 위 구간, 차로 가장자리 + 0.3m)
  let nb = 0;
  for (const { sec } of laneBands(g))
    for (let k = 0; k + 1 < sec.length / 4; k++, nb++) {
      fillBits(B, [bandQuad(sec, k)], SB.ROAD);
      fillBits(core, [bandQuad(sec, k)], 1);
    }
  // 이어지는 구간이 없는 차로 끝(판 가장자리 등)은 1.5m 더 늘인다: 외곽선을 깎으면 띠 끝 모서리가 둥글어져 차 몸이 걸친다
  const hasPrev = new Uint8Array(g.length);
  for (const e of g) for (const k of e.next) hasPrev[k] = 1;
  const Q = [0, 0, 0];
  for (const e of g) {
    if (e.len < 0.5) continue;
    for (const [s, dir, open] of [[e.len, 1, !e.next.length], [0, -1, !hasPrev[e.id]]] as const) {
      if (!open) continue;
      pointAt(e.p, e.cum, s, Q);
      if (Math.abs(Q[1]) > 0.3) continue;
      let l = leftEdge(e, s);
      if (e.mo.length || e.med) l = Math.min(l, laneOff(e, MED, s) - laneWidth(e, 0, s) / 2);
      const rr = rightEdge(e, s);
      const h = headingNear(e, s);
      const [fx, fz] = [Math.cos(h) * 1.5 * dir, Math.sin(h) * 1.5 * dir];
      const p = (o: number): [number, number] => [Q[0] - Math.sin(h) * o, Q[2] + Math.cos(h) * o];
      const [a, b] = [p(l - 0.3), p(rr + 0.3)];
      fillBits(B, [[...a, ...b, b[0] + fx, b[1] + fz, a[0] + fx, a[1] + fz]], SB.ROAD);
    }
  }
  // ③ 교차로 경로(모든 진입로·차로·나가는 길)와 15° 넘게 꺾인 이음매 곡선: 땅 위 점만, 차 몸 반폭 0.9m + 0.3m
  let np = 0;
  const strokeGround = (pts: ArrayLike<number>, stride: number) => {
    let run: number[] = [];
    const flush = () => {
      if (run.length >= 4) (strokeFlat(B, run, 1.2, SB.ROAD), strokeFlat(core, run, 1.2, 1));
      run = [];
    };
    for (let i = 0; i < pts.length; i += stride) {
      if (Math.abs(pts[i + 1]) > 0.3) flush();
      else run.push(pts[i], pts[i + 2]);
    }
    flush();
  };
  for (const [a, exs] of X.exits) {
    const e = g[a];
    const ls = e.mo.length || e.med ? [...Array(e.lanes).keys(), MED] : [...Array(e.lanes).keys()];
    for (const l of ls)
      for (let k = 0; k < exs.length; k++) {
        const p = X.path(a, l, k);
        if (p) (strokeGround(p.pts, 4), np++);
      }
  }
  const o4 = [0, 0, 0, 0];
  for (const a of g) {
    if (X.jEnd[a.id] >= 0 || X.rIn[a.id] <= 0) continue;
    a.next.forEach((bi, j) => {
      const b = g[bi];
      for (let l = 0; l < a.lanes; l++) {
        const lb = a.lmap[j][l * 2];
        if (lb >= b.lanes) continue;
        const pts: number[] = [];
        for (let d = 0; d <= X.rIn[a.id] + X.rOut[b.id] + 1e-3; d += 0.5) (X.curve(a, b, l, lb, d, o4), pts.push(o4[0], o4[1], o4[2]));
        strokeGround(pts, 3);
      }
    });
  }
  log.push(`차로 띠 ${nb}칸·교차로 경로 ${np}개 ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  // 지금까지 칠한 찻길(① ∪ ② ∪ ③)을 다듬는다: 1m 안 틈은 메우고(닫기, 1.25m 정사각형), 1m 보다 좁게 튀어나온 조각은 깎는다(열기).
  // 외곽선을 0.3m 안에서 줄이고 깎아도 0.5m 아래 좁은 조각이 다시 생기지 않게 검사(test/w51-surface.ts, 0.75m)보다 넉넉히 한다
  const v = B.v;
  let road: Uint8Array = plane(B, SB.ROAD);
  road = morph(morph(road, GN, GN, 2, true), GN, GN, 2, false);
  road = morph(morph(road, GN, GN, 2, false), GN, GN, 2, true);
  // 사람이 걷는 선(걷는 그물의 보도·보행로, 반폭 0.3m): 그 선이 지나는 둘러싸인 빈 곳은 섬이라 메우지 않는다
  if (inp.walk) {
    const W = inp.walk;
    const nx: number[] = [];
    let wx = 0;
    let wz = 0;
    for (let i = 0; i < W.n.length; i += 2) nx.push((wx += W.n[i]) / 10, (wz += W.n[i + 1]) / 10);
    let a = 0;
    for (let k = 0; k < W.e.length; k += 5) {
      a += W.e[k];
      const b = a + W.e[k + 1];
      const kind = W.e[k + 2] >> 4;
      if (kind === 0 || kind === 2) strokeFlat(B, [nx[a * 2], nx[a * 2 + 1], nx[b * 2], nx[b * 2 + 1]], 0.3, SB.WALK);
    }
  }
  // 차로(중앙버스차로 포함) 가운데 점(2m 마다, 진행 방향, 4m 칸): 가운데 틈 건너편이 마주 오는 차로인지 본다
  const LG = 4;
  const lanePts = new Map<number, number[]>();
  {
    const R = [0, 0, 0];
    for (const e of g)
      for (const l of e.mo.length || e.med ? [...Array(e.lanes).keys(), MED] : [...Array(e.lanes).keys()])
        for (let s = 1; s < e.len; s += 2) {
          pointAt(e.p, e.cum, s, R);
          const o = laneOff(e, l, s);
          const h = headingNear(e, s, o);
          const [x, z] = [R[0] - Math.sin(h) * o, R[2] + Math.cos(h) * o];
          const k = (Math.floor(x / LG) + 1000) * 4000 + Math.floor(z / LG) + 1000;
          (lanePts.get(k) ?? lanePts.set(k, []).get(k)!).push(x, z, Math.cos(h), Math.sin(h));
        }
  }
  /** (x, z) 2.5m 안에 진행 방향 (hx, hz) 와 마주 오는(cos −0.7 아래) 차로가 있는가 */
  const facing = (x: number, z: number, hx: number, hz: number) => {
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const c = lanePts.get((Math.floor(x / LG) + a + 1000) * 4000 + Math.floor(z / LG) + b + 1000) ?? [];
        for (let k = 0; k + 3 < c.length; k += 4) if (Math.hypot(c[k] - x, c[k + 1] - z) < 2.5 && c[k + 2] * hx + c[k + 3] * hz < -0.7) return true;
      }
    return false;
  };
  // ④ 마주 오는 한 방향 찻길 사이: 1m 마다 왼쪽 가장자리에서 왼쪽으로 짚어, 제 찻길을 지나 빈 곳이 다시 찻길을 만나면 그 사이를 찻길로(15m 안,
  //    서울시 황색 중앙선이 그 사이를 지나면 30m 안). 그 사이를 가로지르는 서울시 007·015 선이 양쪽에서 1m 넘게 떨어져 있고 그 둘 사이에 중앙선이 없으면
  //    두 선 사이는 분리대, 사이에 가로수가 서 있으면(앞뒤 6m 안) 사이 전체가 분리대(3m 넘게 이어질 때만). 건너편이 마주 오는 차로일 때만 본다
  //    (사람이 걷는 선은 보지 않는다: 중앙 정류장으로 건너는 선이 지나는 틈을 분리대로 두면 승강장 옆으로 비켜서는 버스가 그 위를 달린다).
  //    이웃 단면끼리 사각형으로 이어 칠한다
  const C = 8;
  const gk = (i: number, j: number) => (i + 1000) * 4000 + j + 1000;
  const index = (ks: number[]) => {
    const grid = new Map<number, number[][]>();
    for (const l of seoul) {
      if (!ks.includes(l.k)) continue;
      for (let k = 3; k < l.p.length; k += 3) {
        const sg = [l.p[k - 3], l.p[k - 1], l.p[k], l.p[k + 2]];
        for (let i = Math.floor(Math.min(sg[0], sg[2]) / C); i <= Math.floor(Math.max(sg[0], sg[2]) / C); i++)
          for (let j = Math.floor(Math.min(sg[1], sg[3]) / C); j <= Math.floor(Math.max(sg[1], sg[3]) / C); j++) (grid.get(gk(i, j)) ?? grid.set(gk(i, j), []).get(gk(i, j))!).push(sg);
      }
    }
    return grid;
  };
  const curbGrid = index([7, 15]);
  const centreGrid = index([1]);
  /** (ax, az) → (bx, bz) 선분이 가로지르는 선 자리(a 에서 거리 m) */
  const crossings = (grid: Map<number, number[][]>, ax: number, az: number, bx: number, bz: number): number[] => {
    const seen = new Set<number[]>();
    const L = Math.hypot(bx - ax, bz - az);
    const hits: number[] = [];
    for (let t = 0; t <= L + C; t += C / 2) {
      const x = ax + ((bx - ax) * Math.min(t, L)) / (L || 1);
      const z = az + ((bz - az) * Math.min(t, L)) / (L || 1);
      for (const sg of grid.get(gk(Math.floor(x / C), Math.floor(z / C))) ?? []) {
        if (seen.has(sg)) continue;
        seen.add(sg);
        const [cx, cz, dx, dz] = sg;
        const rx = bx - ax, rz = bz - az, ux = dx - cx, uz = dz - cz;
        const den = rx * uz - rz * ux;
        if (Math.abs(den) < 1e-9) continue;
        const tt = ((cx - ax) * uz - (cz - az) * ux) / den;
        const u = ((cx - ax) * rz - (cz - az) * rx) / den;
        if (tt >= 0 && tt <= 1 && u >= 0 && u <= 1) hits.push(tt * L);
      }
    }
    return hits.sort((p, q) => p - q);
  };
  const P = [0, 0, 0];
  let gapRoad = 0;
  let gapMed = 0;
  const isRoad = (x: number, z: number) => {
    const i = Math.floor((x - B.x0) / GCELL);
    const j = Math.floor((z - B.z0) / GCELL);
    return i >= 0 && j >= 0 && i < GN && j < GN && road[j * GN + i] === 1;
  };
  /** 단면: 빈 곳 양 끝 a·b, 분리대 [u0, u1](a 에서 m) */
  type Cut = { ax: number; az: number; bx: number; bz: number; w: number; med: [number, number] | null; tree: boolean } | null;
  // 가로수(board.trees): 사이에 나무가 선 곳은 분리대다(나무를 심은 분리대에 서울시 007·015 선이 없는 곳이 많다)
  const TG = 4;
  const treeGrid = new Map<number, number[]>();
  for (let i = 0; i < board.trees.length; i += 2) {
    const k = gk(Math.floor(board.trees[i] / TG), Math.floor(board.trees[i + 1] / TG));
    (treeGrid.get(k) ?? treeGrid.set(k, []).get(k)!).push(board.trees[i], board.trees[i + 1]);
  }
  /** a→b 선분(길이 w) 옆 0.6m 안, 양 끝 0.25m 안쪽에 선 나무가 있는가 */
  const treeOn = (ax: number, az: number, bx: number, bz: number, w: number) => {
    const [ux, uz] = [(bx - ax) / w, (bz - az) / w];
    for (let t = 0; t <= w + TG; t += TG / 2) {
      const [x, z] = [ax + ux * Math.min(t, w), az + uz * Math.min(t, w)];
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++) {
          const c = treeGrid.get(gk(Math.floor(x / TG) + a, Math.floor(z / TG) + b));
          if (c)
            for (let k = 0; k < c.length; k += 2) {
              const u = (c[k] - ax) * ux + (c[k + 1] - az) * uz;
              if (u > 0.25 && u < w - 0.25 && Math.abs(-(c[k] - ax) * uz + (c[k + 1] - az) * ux) < 0.6) return true;
            }
        }
    }
    return false;
  };
  const quads: [number[], number][] = [];
  const along = (c: NonNullable<Cut>, u: number): [number, number] => [c.ax + ((c.bx - c.ax) * u) / c.w, c.az + ((c.bz - c.az) * u) / c.w];
  for (const e of g) {
    const r = board.roads[e.road];
    if (!r || !r.oneway || r.cls > 3 || !(r.gap > 0 || e.med || e.mo.length)) continue;
    const cuts: Cut[] = [];
    for (let s = 0.5; s < e.len; s += 1) {
      pointAt(e.p, e.cum, s, P);
      cuts.push(null);
      if (Math.abs(P[1]) > 0.3) continue;
      let l = leftEdge(e, s);
      if (e.mo.length || e.med) l = Math.min(l, laneOff(e, MED, s) - laneWidth(e, 0, s) / 2);
      const h = headingNear(e, s, l);
      // 오른쪽 법선 (−sin h, cos h): 옆 거리 o 자리 = P + n·o. 왼쪽으로 갈수록 o 가 작아진다
      const [nx, nz] = [-Math.sin(h), Math.cos(h)];
      const at = (o: number): [number, number] => [P[0] + nx * o, P[2] + nz * o];
      let o = l - 0.3;
      let lim = o - 5;
      while (o > lim && isRoad(...at(o))) o -= 0.25; // 제 찻길(넓힌 띠)
      if (o <= lim) continue;
      const o1 = o;
      lim = o1 - 30;
      while (o > lim && !isRoad(...at(o))) o -= 0.25;
      if (o <= lim || o1 - o < 0.3) continue;
      const [ax, az] = at(o1 + 0.25);
      const [bx, bz] = at(o);
      const w = o1 + 0.25 - o;
      const centre = crossings(centreGrid, ax, az, bx, bz);
      if (w > 15 && !centre.length) {
        // 15m 넘게 벌어진 사이(넓은 분리대·광장 등)는 칠하지 않고, 건너편에서 짚은 틈이 그 안을 반쯤 칠하지 않게 막아 둔다
        const [dx, dz] = [Math.cos(h) * 0.55, Math.sin(h) * 0.55];
        quads.push([[ax - dx, az - dz, bx - dx, bz - dz, bx + dx, bz + dz, ax + dx, az + dz], SB.WIDE]);
        continue;
      }
      // 건너편이 마주 오는 차로가 아니면(같은 쪽으로 가는 연결로·교차로 너머 다른 길과 사이의 교통섬) 칠하지 않는다
      if (!facing(...at(o - 1.5), Math.cos(h), Math.sin(h))) continue;
      const hit = crossings(curbGrid, ax, az, bx, bz);
      const [u0, u1] = [hit[0], hit[hit.length - 1]];
      const med: [number, number] | null = hit.length >= 2 && u1 - u0 > 1 && !centre.some((c) => c > u0 && c < u1) ? [u0, u1] : null;
      cuts[cuts.length - 1] = { ax, az, bx, bz, w, med, tree: treeOn(ax, az, bx, bz, w) };
    }
    // 나무가 선 단면 앞뒤 6m(가로수 간격) 안의 단면은 사이 전체가 분리대
    const near = cuts.map(() => false);
    cuts.forEach((c, i) => {
      if (c?.tree) for (let k = Math.max(0, i - 6); k <= Math.min(cuts.length - 1, i + 6); k++) near[k] = true;
    });
    cuts.forEach((c, i) => {
      if (c && near[i]) c.med = [0, c.w];
    });
    // 3m 보다 짧게 이어진 분리대 단면은 찻길로
    for (let i = 0; i < cuts.length; ) {
      if (!cuts[i]?.med) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < cuts.length && cuts[j + 1]?.med) j++;
      if (j - i + 1 < 3) for (let k = i; k <= j; k++) cuts[k]!.med = null;
      i = j + 1;
    }
    cuts.forEach((c, i) => {
      if (!c) return;
      gapRoad += c.w - (c.med ? c.med[1] - c.med[0] : 0);
      gapMed += c.med ? c.med[1] - c.med[0] : 0;
      const n = cuts[i + 1];
      if (n) {
        quads.push([[c.ax, c.az, n.ax, n.az, n.bx, n.bz, c.bx, c.bz], SB.GAP]);
        if (c.med && n.med) quads.push([[...along(c, c.med[0]), ...along(n, n.med[0]), ...along(n, n.med[1]), ...along(c, c.med[1])], SB.MED]);
      } else if (!cuts[i - 1]) {
        // 앞뒤 단면이 없는 단면 하나: 진행 방향 앞뒤 0.55m 사각형
        const [dx, dz] = [-(c.bz - c.az) / c.w, (c.bx - c.ax) / c.w];
        quads.push([[c.ax - dx * 0.55, c.az - dz * 0.55, c.bx - dx * 0.55, c.bz - dz * 0.55, c.bx + dx * 0.55, c.bz + dz * 0.55, c.ax + dx * 0.55, c.az + dz * 0.55], SB.GAP]);
      }
    });
  }
  for (const [ring, bit] of quads) fillBits(B, [ring], bit);
  log.push(`가운데 틈: 찻길로 ${Math.round(gapRoad / 2)}m², 분리대 ${Math.round(gapMed / 2)}m² 어림(1m 단면 합의 반, 두 방향에서 잰다)`);
  // ⑤ 땅 위 철도 부지
  for (const [ax, az, bx, bz, hw] of railSegs(board)) {
    const L = Math.hypot(bx - ax, bz - az) || 1;
    const [nx, nz] = [(-(bz - az) / L) * hw, ((bx - ax) / L) * hw];
    fillBits(B, [[ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz, ax - nx, az - nz]], SB.RAIL);
  }
  // 찻길 = 다듬은 찻길 ∪ 가운데 틈 − 분리대 − 철도. 틈을 더한 뒤 한 번 더 다듬고, 철도·분리대를 뺀 뒤 0.5m 로 한 번 더 깎는다
  for (let i = 0; i < v.length; i++) if (v[i] & SB.GAP && !(v[i] & SB.WIDE)) road[i] = 1;
  for (let i = 0; i < v.length; i++) if (v[i] & SB.MED && !core.v[i]) road[i] = 0;
  road = morph(morph(road, GN, GN, 2, true), GN, GN, 2, false);
  road = morph(morph(road, GN, GN, 2, false), GN, GN, 2, true);
  // 철도 부지는 0.5m 더 넓게 뺀다(외곽선을 0.3m 안에서 줄이고 깎으므로 경계가 그만큼 움직인다)
  let rail: Uint8Array = new Uint8Array(v.length);
  for (let i = 0; i < v.length; i++) rail[i] = v[i] & SB.RAIL ? 1 : 0;
  rail = morph(rail, GN, GN, 2, true);
  for (let i = 0; i < v.length; i++) if ((v[i] & SB.MED && !core.v[i]) || rail[i]) road[i] = 0;
  road = morph(morph(road, GN, GN, 1, false), GN, GN, 1, true);
  // 찻길에 둘러싸인 50m² 아래 빈 곳 가운데 교통섬(교차로 면 구멍, OSM 교통섬)·분리대·철도·건물·사람이 걷는 선에 닿지 않는 것은 띠·면 사이에 남은 틈이라 찻길로 메운다
  for (const r of polys.isl) fillBits(B, [dmRing(r)], SB.KEEP);
  for (const a of board.groundAreas) if (a.kind === GK.ISLAND) fillBits(B, [a.outer, ...a.holes], SB.KEEP);
  for (const b of board.buildings) fillBits(B, [b.pts], SB.KEEP);
  let pockets = 0;
  {
    // 빈 칸 덩어리를 800칸(50m²)까지만 넓혀 본다. lab: 1 지금 보는 덩어리, 2 큰 덩어리(또는 판 가장자리에 닿음), 3 남길 작은 덩어리
    const lab = new Uint8Array(v.length);
    const stack = new Int32Array(8192);
    const cells = new Int32Array(801);
    for (let s0 = 0; s0 < v.length; s0++) {
      if (road[s0] || lab[s0]) continue;
      let sp = 0;
      let nc = 0;
      stack[sp++] = s0;
      lab[s0] = 1;
      let keep = false;
      let big = false;
      while (sp && !big) {
        const q = stack[--sp];
        cells[nc++] = q;
        if (nc > 800) big = true;
        if (v[q] & (SB.KEEP | SB.MED | SB.RAIL | SB.WALK)) keep = true;
        const i = q % GN;
        const j = (q - i) / GN;
        if (i === 0 || j === 0 || i === GN - 1 || j === GN - 1) big = true;
        for (const r of [i > 0 ? q - 1 : -1, i < GN - 1 ? q + 1 : -1, j > 0 ? q - GN : -1, j < GN - 1 ? q + GN : -1]) {
          if (r < 0 || road[r]) continue;
          if (lab[r] === 2) big = true;
          if (lab[r]) continue;
          lab[r] = 1;
          stack[sp++] = r;
        }
      }
      const mark = big ? 2 : 3;
      for (let k = 0; k < nc; k++) lab[cells[k]] = mark;
      for (let k = 0; k < sp; k++) lab[stack[k]] = mark;
      if (!big && !keep) {
        for (let k = 0; k < nc; k++) road[cells[k]] = 1;
        pockets++;
      }
    }
  }
  log.push(`찻길 칸 ${((road.reduce((a, x) => a + x, 0) * GCELL * GCELL) / 1e6).toFixed(3)}km²(둘러싸인 틈 ${pockets}곳 메움) ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  // 분리대: 찻길이 아닌 분리대 칸. 녹지는 연석 안쪽 0.25m 뒤(0.75m 보다 좁은 분리대는 녹지 없이 보도 블록)
  const med = new Uint8Array(v.length);
  for (let i = 0; i < v.length; i++) med[i] = v[i] & SB.MED && !road[i] && !(v[i] & SB.RAIL) ? 1 : 0;
  const green = morph(med, GN, GN, 1, false);
  // 보도 면: 도로 부지·광장 ∪ 지금 보도 면(채움 포함) ∪ 교통섬 ∪ 분리대 ∪ 찻길 − 철도 부지. 찻길 밑까지 깔아 연석에서 틈이 생기지 않게 한다
  for (const a of board.groundAreas) if (a.kind === GK.ROADSIDE || a.kind === GK.PLAZA) fillBits(B, [a.outer, ...a.holes], SB.RES);
  for (const w of polys.walk) fillBits(B, [dmRing(w)], SB.RES);
  for (const w of polys.isl) fillBits(B, [dmRing(w)], SB.RES);
  const walk = new Uint8Array(v.length);
  for (let i = 0; i < v.length; i++) walk[i] = (v[i] & SB.RES || road[i] || med[i]) && !(v[i] & SB.RAIL) ? 1 : 0;
  // 점자블록: 횡단보도 축을 따라 바깥으로 짚어 찻길이 끝나는 자리(연석)에서 보도 쪽 0.4m
  const onRoad = (x: number, z: number) => {
    const i = Math.floor((x - B.x0) / GCELL);
    const j = Math.floor((z - B.z0) / GCELL);
    return i >= 0 && j >= 0 && i < GN && j < GN && road[j * GN + i] === 1;
  };
  const dm = (x: number) => Math.round(x * 10);
  const tactile: number[] = [];
  for (const c of board.crosswalks)
    for (const sg of [-1, 1]) {
      const [ux, uz] = [c.ux * sg, c.uz * sg];
      let d = c.half - 1;
      while (d < c.half + 6 && onRoad(c.x + ux * d, c.z + uz * d)) d += 0.1;
      if (d >= c.half + 6) continue;
      tactile.push(dm(c.x + ux * (d + 0.4)), dm(c.z + uz * (d + 0.4)), Math.round(ux * 1000), Math.round(uz * 1000), dm(c.wid));
    }
  const gL = encodeTiles(road);
  const wL = encodeTiles(walk, 2);
  const mL = encodeTiles(green, 1);
  log.push(`칸 층 찻길 ${gL.length}·보도 ${wL.length}·녹지 ${mL.length} 수, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  const out: Bits = { x0: B.x0, z0: B.z0, cell: GCELL, w: GN, h: GN, v: road };
  return { g: gL, w: wL, m: mL, tactile, road: out, log: log.join('; ') };
}

/**
 * 노면 표시를 새 찻길 면 안으로 자른다(땅 위 선 l 만, 화살표·안전지대·고가 선은 그대로). 검사(test/w48-stage2.ts ⑤)와 같게 0.5m 칸에 칠한 찻길 면에서
 * 선 조각마다 0.5m 간격 가운데 점이 면에서 0.3m 넘게 밖인지 보고, 밖인 점과 안인 점 사이에서 조각을 나눈다(점은 dm 로 반올림한 뒤 다시 본다).
 * 끝까지 밖인 조각은 버리고, 나뉜 선의 점선 위상(ld)은 앞 조각 길이만큼 더한다. 지금 표시가 모두 면 안이면 그대로 돌려준다
 */
export function clipMarksToGround(marks: { l: number[][]; ld?: number[] }, ground: ArrayLike<number>): { l: number[][]; ld: number[]; cut: number } {
  const B = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, 0.5);
  for (const t of tileRings(ground)) fillBits(B, t.rings, 1);
  const at = (x: number, z: number) => {
    const i = Math.floor((x - B.x0) / B.cell);
    const j = Math.floor((z - B.z0) / B.cell);
    return i >= 0 && j >= 0 && i < B.w && j < B.h ? B.v[j * B.w + i] & 1 : 0;
  };
  const on = (x: number, z: number) => {
    if (at(x, z)) return true;
    for (let k = 0; k < 8; k++) if (at(x + Math.cos((k * Math.PI) / 4) * 0.3, z + Math.sin((k * Math.PI) / 4) * 0.3)) return true;
    return false;
  };
  /** 조각 a→b(dm 정수)의 0.5m 가운데 점들이 면 안인가 */
  const samples = (ax: number, az: number, bx: number, bz: number) => {
    // 앱·시험은 dm 를 10 으로 나눠 32비트로 푼다(src/data/marks.ts): 같은 자리에서 본다
    const [x0, z0, x1, z1] = [Math.fround(ax / 10), Math.fround(az / 10), Math.fround(bx / 10), Math.fround(bz / 10)];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.5));
    return Array.from({ length: n }, (_, q) => on(x0 + ((x1 - x0) * (q + 0.5)) / n, z0 + ((z1 - z0) * (q + 0.5)) / n));
  };
  const outL: number[][] = [];
  const outD: number[] = [];
  let cut = 0;
  marks.l.forEach((line, li) => {
    const code = line[0];
    const n = line[1];
    const P: number[][] = [];
    let x = 0;
    let z = 0;
    for (let k = 0; k < n; k++) P.push([(x += line[2 + k * 2]), (z += line[3 + k * 2])]);
    // 조각을 안·밖 경계에서 나눈다(네 번까지 다시 본다)
    let pts = P;
    for (let it = 0; it < 4; it++) {
      const next: number[][] = [pts[0]];
      let split = false;
      for (let k = 1; k < pts.length; k++) {
        const [a, b] = [pts[k - 1], pts[k]];
        const s = samples(a[0], a[1], b[0], b[1]);
        const m = s.length;
        for (let q = 1; q < m; q++)
          if (s[q] !== s[q - 1]) {
            const p = [Math.round(a[0] + ((b[0] - a[0]) * q) / m), Math.round(a[1] + ((b[1] - a[1]) * q) / m)];
            const last = next[next.length - 1];
            if ((p[0] !== last[0] || p[1] !== last[1]) && (p[0] !== b[0] || p[1] !== b[1])) (next.push(p), (split = true));
          }
        next.push(b);
      }
      pts = next;
      if (!split) break;
    }
    // 밖인 조각에서 끊는다
    const d0 = marks.ld?.[li] ?? 0;
    let run: number[][] = [];
    let runAt = 0;
    let along = 0;
    const flush = () => {
      if (run.length >= 2) {
        outL.push([code, run.length, ...run[0], ...run.slice(1).flatMap((p, k) => [p[0] - run[k][0], p[1] - run[k][1]])]);
        outD.push(Math.round(d0 + runAt));
      }
      run = [];
    };
    for (let k = 1; k < pts.length; k++) {
      const [a, b] = [pts[k - 1], pts[k]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (samples(a[0], a[1], b[0], b[1]).every(Boolean)) {
        if (!run.length) (run.push(a), (runAt = along));
        run.push(b);
      } else {
        cut += len / 10;
        flush();
      }
      along += len;
    }
    flush();
  });
  return { l: outL, ld: outD, cut };
}
