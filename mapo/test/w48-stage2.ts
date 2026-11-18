// 차로 정본 2단계 시험 정의(재작업 W48, 설계 문서 59절). 구운 자료(public/data 또는 깨끗한 사본의 판 폴더)만 읽는 정적 검사들이다.
// 2단계(B: 찻길 면·연석·노면 표시·정지선·보도 면을 길 정본에서 굽기)를 넣기 전 값은 59절 표에 적었다. 시험 파일(w48-stage2.test.ts)은
// 지금 깨지는 검사를 it.fails 로 두고, 해당 단계가 들어가는 커밋에서 it 로 바꾼다. 기준(0·0.3m)은 풀지 않는다.
import { readFileSync } from 'node:fs';
import { decodeBoard, type Board } from '../src/data/board.ts';
import { laneBands, bandQuad } from '../src/data/laneGround.ts';
import { decodeMarks, type Marks } from '../src/data/marks.ts';
import { decodeLanes } from '../src/data/road.ts';
import { decodeSurface, tileRings } from '../src/data/surface.ts';
import { BOARD_R } from '../src/geo.ts';
import { pointAt } from '../src/poly.ts';
import { buildCarGraph, headingNear, laneOff, MED, type Edge } from '../src/sim/graph.ts';
import { makeIntersections, type Inter } from '../src/sim/intersection/index.ts';
import { lanePoint } from '../src/sim/lanes.ts';
import { bitsAt, fillBits, makeBits, type Bits } from '../tools/lib/bits.ts';

export const DATA_DIR = new URL('../public/data/', import.meta.url).pathname;

export interface Stage2Data {
  board: Board;
  marks: Marks;
  g: Edge[];
  inter: Inter;
  /** 구운 판 폴더 */
  dir: string;
}

const cache = new Map<string, Stage2Data>();
export function load(dir = DATA_DIR): Stage2Data {
  const hit = cache.get(dir);
  if (hit) return hit;
  const data = (f: string) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  const board = decodeBoard(data('board.json'));
  const marks = decodeMarks(data('marks.json'));
  const g = buildCarGraph(board.roads, decodeLanes(data('road.json').lanes), marks.arrows);
  const inter = makeIntersections(g, { crosswalks: board.crosswalks, stopLines: board.stopLines, lamps: data('signals.json') });
  const d = { board, marks, g, inter, dir };
  cache.set(dir, d);
  return d;
}

/** 차가 쓰는 차로(일반 차로 + 중앙버스차로) */
export const lanesOf = (e: Edge) => (e.mo.length || e.med ? [...Array(e.lanes).keys(), MED] : [...Array(e.lanes).keys()]);

const P = [0, 0, 0];
const Q = [0, 0, 0];
/** 차로 l 가운데선의 s 자리와 진행 방향, 땅 위(|y| ≤ 0.3m)인가 */
function laneAt(e: Edge, l: number, s: number): { x: number; z: number; h: number; ground: boolean } {
  pointAt(e.p, e.cum, s, P);
  const o = laneOff(e, l, s);
  const h = headingNear(e, s, o);
  return { x: P[0] - Math.sin(h) * o, z: P[2] + Math.cos(h) * o, h, ground: Math.abs(P[1]) <= 0.3 };
}

/** 칸 비트: 1 구운 찻길 면(v2 는 surface.json g, v1 은 찻길 띠·교차로 면·그리기 전용 면·분리대. 실행 중에 덧칠하던 차로 띠 laneBands 는 넣지 않는다), 2 안전지대(빗금),
 *  4 땅 위 철도 부지(터널·5m 넘는 다리 빼고, 재작업 W45 railSite 와 같은 정의) 가운데 선로가 땅 높이 이상인 곳, 16 땅 밑으로 내려간 터파기(옹벽까지),
 *  8 실행 중 차로 띠(laneBands) */
export const BIT = { CAR: 1, GORE: 2, RAIL: 4, BAND: 8, TROUGH: 16 } as const;
const bitsCache = new Map<string, Bits>();
export function stage2Bits(d: Stage2Data, cell = 0.5): Bits {
  const key = `${d.dir}|${cell}`;
  const hit = bitsCache.get(key);
  if (hit) return hit;
  const data = (f: string) => JSON.parse(readFileSync(`${d.dir}/${f}`, 'utf8'));
  const sf = decodeSurface(data('surface.json'));
  const sp = data('surface-polys.json') as { car: number[][]; med: number[][]; draw: number[][] };
  const dm = (a: number[]) => Float32Array.from(a, (v) => v / 10);
  const B = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, cell);
  if (sf.ground.length) {
    // v2(재작업 W51): 길 정본에서 구운 찻길 면 하나(surface.json g)가 구운 찻길 면이다
    for (const t of tileRings(sf.ground)) fillBits(B, t.rings, BIT.CAR);
  } else {
    // 찻길 터널 조각의 띠는 렌더러가 입구 경사만 그리므로 넣지 않는다(render/roads.ts addTrench)
    for (const c of sp.car) if (!d.board.roads[c[0]]?.tunnel) fillBits(B, [dm(c.slice(1))], BIT.CAR);
    for (const f of sf.faces) fillBits(B, [f.outer, ...f.holes], BIT.CAR);
    for (const f of sf.draw) fillBits(B, [f.outer], BIT.CAR);
    for (const m of sp.med) fillBits(B, [dm(m)], BIT.CAR);
    for (const q of sp.draw) fillBits(B, [dm(q)], BIT.CAR);
  }
  for (const z of d.marks.zones) fillBits(B, [z.ring], BIT.GORE);
  for (const [ax, az, bx, bz, h] of railSegs(d.board)) {
    const L = Math.hypot(bx - ax, bz - az) || 1;
    const [nx, nz] = [(-(bz - az) / L) * h, ((bx - ax) / L) * h];
    fillBits(B, [[ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz, ax - nx, az - nz]], h > 5 ? BIT.TROUGH : BIT.RAIL);
  }
  for (const { sec } of laneBands(d.g)) for (let k = 0; k + 1 < sec.length / 4; k++) fillBits(B, [bandQuad(sec, k)], BIT.BAND);
  bitsCache.set(key, B);
  return B;
}

/** 땅 위 철도 조각 [ax, az, bx, bz, 반폭]: 터널 조각 빼고, 선로 높이 5m 넘는 다리 조각 빼고. 반폭은 그리는 선로 띠 4.5m, 땅 밑 터파기는 6.2m(굽기가 찻길 면에서 빼는 폭: 안쪽 반폭 5.2m + 옹벽 + 0.5m, tools/bake.ts 1954줄).
 *  재작업 W45 의 src/sim/railSite.ts 가 들어오면 그 함수로 바꾼다(정의는 같다) */
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

const on = (B: Bits, x: number, z: number, bit: number, tol: number) => {
  if (bitsAt(B, x, z) & bit) return true;
  for (let k = 0; k < 8; k++) if (bitsAt(B, x + Math.cos((k * Math.PI) / 4) * tol, z + Math.sin((k * Math.PI) / 4) * tol) & bit) return true;
  return false;
};

/** 결과: 센 값과 처음 몇 곳 */
export interface Found {
  n: number;
  /** 센 것의 전체(길이 m·자리 수 등, 검사마다 다르다) */
  of: number;
  where: string[];
}
const note = (f: Found, s: string) => {
  if (f.where.length < 12) f.where.push(s);
};

/**
 * ① 이음매 차로 끊김: 교차로가 아닌 이음매(구간 끝 노드가 교차로에 들지 않음)에서 15° 넘게 꺾이지 않아 차가 곡선 없이 넘어가는 곳마다,
 * 지난 구간 차로 l 의 끝점과 그 차로가 맡는 다음 구간 차로들(lmap) 시작점 사이 거리의 가장 큰 값(중앙버스차로가 끊기면 0번 차로까지). tol(0.3m) 넘는 이음매를 센다.
 * 차가 넘겨받는 옆 거리(진행 방향 법선 성분)보다 넓게(평면 거리로) 잰다.
 * 지금은 이 차이를 차가 옆 거리(side)로 받아 초당 1.1m 로 줄인다. 2단계에서는 굽기가 이음매마다 연결 곡선을 만들어 끝점이 맞는다.
 */
export function seamBreaks(d: Stage2Data, tol = 0.3): Found & { changed: number } {
  const { g, inter } = d;
  const { X } = inter;
  const f = { n: 0, of: 0, where: [] as string[], changed: 0 };
  const bent = (a: Edge, b: Edge) => {
    let t = Math.abs(headingNear(b, 0) - headingNear(a, a.len));
    if (t > Math.PI) t = 2 * Math.PI - t;
    return t > (15 * Math.PI) / 180;
  };
  for (const a of g) {
    if (X.jEnd[a.id] >= 0 || !a.next.length) continue;
    a.next.forEach((k, j) => {
      const b = g[k];
      if (bent(a, b)) return;
      f.of++;
      if (a.lanes !== b.lanes) f.changed++;
      let worst = 0;
      let wl = -1;
      let wx = 0;
      let wz = 0;
      // 차로 l 의 차는 맡은 범위 [lo, hi) 가운데 어느 차로로든 넘어갈 수 있다(cars.ts lanePos·laneAt): 범위 안 가장 먼 것을 센다
      const jump = (la: number, lb: number, l: number) => {
        lanePoint(a, la, a.len, P);
        const dd = Math.hypot(P[0] - lanePoint(b, lb, 0, Q)[0], P[2] - Q[2]);
        if (dd > worst) (worst = dd), (wl = l), (wx = P[0]), (wz = P[2]);
      };
      for (let l = 0; l < a.lanes; l++) for (let lb = a.lmap[j][l * 2]; lb < a.lmap[j][l * 2 + 1]; lb++) jump(l, lb, l);
      const am = !!(a.mo.length || a.med);
      const bm = !!(b.mo.length || b.med);
      // 중앙버스차로가 이어지면 그 차로끼리, 끊기면(버스가 일반 차로로 나옴) 0번 차로로(cars.ts 1960~1968)
      if (am) jump(MED, bm ? MED : 0, MED);
      if (worst > tol) {
        f.n++;
        note(f, `e${a.id}→e${b.id} l${wl} ${worst.toFixed(1)}m @${Math.round(wx)},${Math.round(wz)}`);
      }
    });
  }
  return f;
}

/** 차로마다 1m 간격으로 땅 위 차로 가운데선을 짚어 cb(가운데 자리, 진행 방향, 구간, 차로, s)를 부른다. skipBox 면 교차로·이음매 상자 안은 건너뛴다 */
function eachLanePoint(d: Stage2Data, skipBox: boolean, cb: (x: number, z: number, h: number, e: Edge, l: number, s: number) => void) {
  const { X } = d.inter;
  for (const e of d.g)
    for (const l of lanesOf(e))
      for (let s = 0.5; s < e.len; s += 1) {
        if (skipBox && (s < X.rOut[e.id] || s > e.len - X.rIn[e.id])) continue;
        const q = laneAt(e, l, s);
        if (q.ground) cb(q.x, q.z, q.h, e, l, s);
      }
}

/** ② 차 몸 폭 띠(차로 가운데 ± 0.9m)가 구운 찻길 면 밖(tol 넘게)인 길이(m). 실행 중 차로 띠는 넣지 않는다: 2단계에서는 구운 찻길 면이 차로 띠를 품는다 */
export function laneBodyOffBaked(d: Stage2Data, tol = 0.3): Found {
  const B = stage2Bits(d);
  const f = { n: 0, of: 0, where: [] as string[] };
  eachLanePoint(d, false, (x, z, h, e, l) => {
    f.of++;
    const [nx, nz] = [-Math.sin(h) * 0.9, Math.cos(h) * 0.9];
    if (on(B, x, z, BIT.CAR, tol) && on(B, x + nx, z + nz, BIT.CAR, tol) && on(B, x - nx, z - nz, BIT.CAR, tol)) return;
    f.n++;
    note(f, `e${e.id} l${l} ${Math.round(x)},${Math.round(z)}`);
  });
  return f;
}

/** ③ 빗금(안전지대) 위 차로 가운데선 길이(m) */
export function lanesOnGore(d: Stage2Data): Found {
  const B = stage2Bits(d);
  const f = { n: 0, of: 0, where: [] as string[] };
  eachLanePoint(d, false, (x, z, _h, e, l) => {
    f.of++;
    if (!(bitsAt(B, x, z) & BIT.GORE)) return;
    f.n++;
    note(f, `e${e.id} l${l} ${Math.round(x)},${Math.round(z)}`);
  });
  return f;
}

/** 땅 위 선인가: decodeMarks 는 고가 위 선(h)을 높이를 붙여 같은 목록에 넣는다 */
const groundLine = (ln: Marks['lines'][number]) => {
  for (let k = 1; k < ln.p.length; k += 3) if (Math.abs(ln.p[k]) > 0.3) return false;
  return true;
};

/** 높이 3m 안 선(둑길·터파기 경사 진입로의 정지선, 재작업 W49) */
const lowLine = (ln: Marks['lines'][number]) => {
  for (let k = 1; k < ln.p.length; k += 3) if (Math.abs(ln.p[k]) > 3) return false;
  return true;
};

/** 칠한 선 조각 격자(종류 ks, 땅 위 선만. low 면 둑길·터파기 경사(높이 3m 안) 위 선도): [ax, az, bx, bz] */
function lineGrid(lines: Marks['lines'], ks: Set<number>, C = 10, low = false) {
  const grid = new Map<number, number[][]>();
  const key = (x: number, z: number) => (Math.floor(x / C) + 1000) * 4000 + Math.floor(z / C) + 1000;
  for (const ln of lines) {
    if (!ks.has(ln.k) || !(low ? lowLine(ln) : groundLine(ln))) continue;
    for (let k = 3; k < ln.p.length; k += 3) {
      const sg = [ln.p[k - 3], ln.p[k - 1], ln.p[k], ln.p[k + 2]];
      for (let cx = Math.floor(Math.min(sg[0], sg[2]) / C); cx <= Math.floor(Math.max(sg[0], sg[2]) / C); cx++)
        for (let cz = Math.floor(Math.min(sg[1], sg[3]) / C); cz <= Math.floor(Math.max(sg[1], sg[3]) / C); cz++) {
          const kk = (cx + 1000) * 4000 + cz + 1000;
          (grid.get(kk) ?? grid.set(kk, []).get(kk)!).push(sg);
        }
    }
  }
  return (x: number, z: number) => grid.get(key(x, z)) ?? [];
}

/** ④ 칠한 차선 위를 달리는 차로: 상자 밖 차로 가운데선 가운데, 나란한(25° 안) 차로를 가르는 칠한 선(중앙선·버스전용·차선·진로변경제한선·중앙버스전용)이
 *  0.3m 안에 있는 길이(m). 2단계에서는 차선을 차로 사이 경계에서 그리므로 0 이다 */
export function lanesOnPaint(d: Stage2Data, near = 0.3): Found {
  const at = lineGrid(d.marks.lines, new Set([1, 5, 6, 8, 17]));
  const f = { n: 0, of: 0, where: [] as string[] };
  const cos25 = Math.cos((25 * Math.PI) / 180);
  eachLanePoint(d, true, (x, z, h, e, l) => {
    f.of++;
    const [ux, uz] = [Math.cos(h), Math.sin(h)];
    for (const [ax, az, bx, bz] of at(x, z)) {
      const dx = bx - ax;
      const dz = bz - az;
      const L = Math.hypot(dx, dz) || 1;
      if (Math.abs((dx * ux + dz * uz) / L) < cos25) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L)));
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) < near) {
        f.n++;
        note(f, `e${e.id} l${l} ${Math.round(x)},${Math.round(z)}`);
        return;
      }
    }
  });
  return f;
}

/** ⑤ 땅 위 노면 표시(선)가 구운 찻길 면 밖(tol 넘게)인 길이(m, 0.5m 표본). 고가 위 선은 보지 않는다 */
export function marksOffBaked(d: Stage2Data, tol = 0.3): Found {
  const B = stage2Bits(d);
  const f = { n: 0, of: 0, where: [] as string[] };
  for (const ln of d.marks.lines) {
    if (!groundLine(ln)) continue;
    for (let k = 3; k < ln.p.length; k += 3) {
      const [ax, az, bx, bz] = [ln.p[k - 3], ln.p[k - 1], ln.p[k], ln.p[k + 2]];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 0.5));
      for (let q = 0; q < n; q++) {
        const x = ax + ((bx - ax) * (q + 0.5)) / n;
        const z = az + ((bz - az) * (q + 0.5)) / n;
        f.of += 0.5;
        if (on(B, x, z, BIT.CAR, tol)) continue;
        f.n += 0.5;
        note(f, `k${ln.k} ${Math.round(x)},${Math.round(z)}`);
      }
    }
  }
  return f;
}

/**
 * ⑥ 신호 교차로 진입로 정지선: 신호를 따르는 진입로(교차로로 들어가는 구간)의 일반 차로마다, 차가 빨간불에 서는 자리(`X.stopAt`, 앞 범퍼)에서
 * 1.5m 안에 칠한 정지선(서울시 004)이 없으면 누락(n). 서는 자리가 구간 길이보다 멀면(정지선이 앞 구간에 있음) 하나뿐인 앞 구간에서 잰다.
 * 끝 46m 안 차로 가운데선을 가로지르는 칠한 정지선이 둘 넘으면 겹침(dup). of = 본 차로 수. 2단계에서는 정지선을 서는 자리에서 진입로 폭만큼 하나로 그린다
 */
export function stopLineCover(d: Stage2Data): Found & { dup: number } {
  const { X, S } = d.inter;
  // 정지선은 차로가 땅 위가 아닌 진입로(둑길·터파기 경사, 재작업 W49)에서는 그 찻길 높이로 칠한다: 높이 3m 안 선을 평면 거리로 본다
  const at = lineGrid(d.marks.lines, new Set([4]), 10, true);
  const f = { n: 0, of: 0, where: [] as string[], dup: 0 };
  const prev: number[][] = d.g.map(() => []);
  for (const e of d.g) for (const k of e.next) prev[k].push(e.id);
  const near = (x: number, z: number, r: number) => {
    for (const [ax, az, bx, bz] of [...at(x - r, z - r), ...at(x + r, z - r), ...at(x - r, z + r), ...at(x + r, z + r)]) {
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) < r) return true;
    }
    return false;
  };
  for (const e of d.g) {
    if (X.jEnd[e.id] < 0 || S.siteOf(e.id) < 0 || e.len < 2) continue;
    for (let l = 0; l < e.lanes; l++) {
      f.of++;
      const back = X.stopAt(e.id, l);
      let p = laneAt(e, l, Math.max(0, e.len - back));
      if (back > e.len && prev[e.id].length === 1) {
        const q = d.g[prev[e.id][0]];
        p = laneAt(q, Math.min(l, q.lanes - 1), Math.max(0, q.len - (back - e.len)));
      }
      if (!near(p.x, p.z, 1.5)) {
        f.n++;
        note(f, `e${e.id} l${l} ${Math.round(p.x)},${Math.round(p.z)}`);
      }
      // 끝 46m 안에서 차로 가운데선을 가로지르는 칠한 정지선(2m 안 끝점은 같은 선으로 본다)
      const hit: number[][] = [];
      let a = laneAt(e, l, Math.max(0, e.len - 46));
      for (let s = Math.max(0, e.len - 46) + 0.5; s <= e.len; s += 0.5) {
        const q = laneAt(e, l, s);
        for (const [cx, cz, dx, dz] of [...at(a.x, a.z), ...at(q.x, q.z)]) {
          const rx = q.x - a.x, rz = q.z - a.z, ux = dx - cx, uz = dz - cz;
          const den = rx * uz - rz * ux;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((cx - a.x) * uz - (cz - a.z) * ux) / den;
          const u = ((cx - a.x) * rz - (cz - a.z) * rx) / den;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && !hit.some(([hx, hz]) => Math.hypot(hx - cx, hz - cz) < 2)) hit.push([cx, cz]);
        }
        a = q;
      }
      if (hit.length > 1) f.dup++;
    }
  }
  return f;
}

/** ⑦ 철도 부지 위: 땅 높이 선로 띠 위 찻길 면(m², n), 터파기 위 찻길 면(m², trough), 철도 부지(둘 다) 위 차로 가운데선(m, lanes). of = 땅 높이 선로 띠 넓이 */
export function railOverlap(d: Stage2Data): Found & { trough: number; lanes: number } {
  const B = stage2Bits(d);
  const f = { n: 0, of: 0, where: [] as string[], trough: 0, lanes: 0 };
  const a = B.cell * B.cell;
  for (let j = 0; j < B.h; j++)
    for (let i = 0; i < B.w; i++) {
      const v = B.v[j * B.w + i];
      if (v & BIT.RAIL) f.of += a;
      if (!(v & BIT.CAR) || !(v & (BIT.RAIL | BIT.TROUGH))) continue;
      if (v & BIT.RAIL) {
        f.n += a;
        note(f, `${Math.round(B.x0 + (i + 0.5) * B.cell)},${Math.round(B.z0 + (j + 0.5) * B.cell)}`);
      } else f.trough += a;
    }
  eachLanePoint(d, false, (x, z, _h, e, l) => {
    if (bitsAt(B, x, z) & (BIT.RAIL | BIT.TROUGH)) {
      f.lanes++;
      note(f, `lane e${e.id} l${l} ${Math.round(x)},${Math.round(z)}`);
    }
  });
  return f;
}

/**
 * ⑧ 중앙선 한 줄: 양방향 땅 위 큰길 조각(등급 3 이하)의 띠 구간(교차로 면 밖)을 4m 마다 가로질러, 찻길 폭 안에서 만나는 칠한 황색 중앙선(서울시 001)을 센다.
 * 0.6m 안에 붙은 것(복선)은 하나로 본다. 둘 넘는 단면(n)과 본 단면(of). 2단계에서는 중앙선을 마주 오는 두 차로 묶음 사이에 하나만 그린다
 */
export function centreLines(d: Stage2Data): Found {
  const data = JSON.parse(readFileSync(`${d.dir}/surface.json`, 'utf8'));
  const cut = decodeSurface(data).cut;
  const at = lineGrid(d.marks.lines, new Set([1]), 10);
  const f = { n: 0, of: 0, where: [] as string[] };
  const R = [0, 0, 0];
  d.board.roads.forEach((r, i) => {
    if (r.oneway || r.cls > 3 || r.bridge || r.tunnel || r.p.length < 6) return;
    const L = cumLenOf(r.p);
    const s0 = cut[i * 2];
    const s1 = Math.min(L, cut[i * 2 + 1]);
    for (let s = s0 + 2; s < s1 - 2; s += 4) {
      const seg = pointAt(r.p, cumLen(r.p), s, R);
      if (Math.abs(R[1]) > 0.3) continue;
      const dx = r.p[seg * 3 + 3] - r.p[seg * 3];
      const dz = r.p[seg * 3 + 5] - r.p[seg * 3 + 2];
      const len = Math.hypot(dx, dz) || 1;
      const [nx, nz] = [-dz / len, dx / len];
      const half = Math.max(r.lf, r.lb) * r.lw + 1;
      const [ax, az, bx, bz] = [R[0] - nx * half, R[2] - nz * half, R[0] + nx * half, R[2] + nz * half];
      const hits: number[] = [];
      const cells = new Set<number[]>();
      for (let t = 0; t <= 1; t += 0.25) for (const sg of at(ax + (bx - ax) * t, az + (bz - az) * t)) cells.add(sg);
      for (const [cx, cz, ex, ez] of cells) {
        const rx = bx - ax, rz = bz - az, ux = ex - cx, uz = ez - cz;
        const den = rx * uz - rz * ux;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((cx - ax) * uz - (cz - az) * ux) / den;
        const u = ((cx - ax) * rz - (cz - az) * rx) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) hits.push(t * half * 2);
      }
      hits.sort((p, q) => p - q);
      const groups = hits.filter((h, k) => k === 0 || h - hits[k - 1] > 0.6).length;
      f.of++;
      if (groups > 1) {
        f.n++;
        note(f, `r${i} ${groups}줄 ${Math.round(R[0])},${Math.round(R[2])}`);
      }
    }
  });
  return f;
}
const cumCache = new WeakMap<Float32Array, Float32Array>();
function cumLen(p: Float32Array): Float32Array {
  let c = cumCache.get(p);
  if (!c) {
    const n = p.length / 3;
    c = new Float32Array(n);
    for (let i = 1; i < n; i++) c[i] = c[i - 1] + Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 2] - p[i * 3 - 1]);
    cumCache.set(p, c);
  }
  return c;
}
const cumLenOf = (p: Float32Array) => cumLen(p)[p.length / 3 - 1];

/** ⑨ 사람: 걷는 그물의 보도 선(종류 0)이 실행 중 차로 띠(차가 달리는 자리, 0.3m 안쪽) 위인 길이(m, 0.5m 표본). W44 1단계 뒤 차로 띠는 찻길로 칠하지만
 *  걷는 그물은 그 띠를 모르고 구워졌다. 2단계에서는 보도 면·걷는 그물을 구운 찻길 면에서 다시 만든다 */
export function sidewalkOnLanes(d: Stage2Data): Found {
  const j = JSON.parse(readFileSync(`${d.dir}/walk.json`, 'utf8')) as { n: number[]; e: number[] };
  const B = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, 0.5);
  for (const { sec } of laneBands(d.g, -0.3)) for (let k = 0; k + 1 < sec.length / 4; k++) fillBits(B, [bandQuad(sec, k)], 1);
  const nx: number[] = [];
  let x = 0;
  let z = 0;
  for (let i = 0; i < j.n.length; i += 2) nx.push((x += j.n[i]) / 10, (z += j.n[i + 1]) / 10);
  const f = { n: 0, of: 0, where: [] as string[] };
  let a = 0;
  for (let k = 0; k < j.e.length; k += 5) {
    a += j.e[k];
    const b = a + j.e[k + 1];
    if (j.e[k + 2] >> 4 !== 0) continue;
    const [ax, az, bx, bz] = [nx[a * 2], nx[a * 2 + 1], nx[b * 2], nx[b * 2 + 1]];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 0.5));
    for (let q = 0; q < n; q++) {
      const px = ax + ((bx - ax) * (q + 0.5)) / n;
      const pz = az + ((bz - az) * (q + 0.5)) / n;
      f.of += 0.5;
      if (!(bitsAt(B, px, pz) & 1)) continue;
      f.n += 0.5;
      note(f, `${Math.round(px)},${Math.round(pz)}`);
    }
  }
  return f;
}
