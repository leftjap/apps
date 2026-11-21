// 찻길 바닥. 굽기(tools/lib/surface.ts)가 교차로마다 면 하나와 길 조각마다 띠를 그릴 구간을 정해 public/data/surface.json 에 두고,
// 렌더러는 띠를 그 구간만 그리고 교차로 면을 그대로 칠한다. 띠 가장자리 점은 굽기와 렌더러가 이 파일의 carriageSections 하나로 만들므로
// 띠 끝 단면과 교차로 면의 변이 같은 점에서 만난다(겹치지도 벌어지지도 않는다).
import { curbAt, type Road } from './board.ts';
import { BOARD_R } from '../geo.ts';
import { cumLen } from '../poly.ts';

export interface SurfaceJson {
  /** 2: 길 정본에서 구운 찻길 면·보도 면·분리대 녹지(g·w·m, 재작업 W51). cut·jn·dr 은 사람 굽기·흐름 띠·시험이 읽어 그대로 둔다 */
  v: 1 | 2;
  /** 길 조각마다 띠를 그리는 구간 [시작 s, 끝 s, ...](dm). 끝 −1 은 조각 끝까지, 시작 ≥ 끝이면 그리지 않는다(교차로 면 안의 조각) */
  cut: number[];
  /** 교차로 면마다 [등급, 바깥 고리 점 수, x, z, ..., 구멍 수, (점 수, x, z, ...)...]. 좌표는 cm 이고 고리마다 첫 점 뒤는 앞 점과의 차이 */
  jn: number[][];
  /** 그리기 전용 찻길 면(차는 다니지 않는다): 횡단보도가 OSM 길 밖에 걸친 자리. jn 과 같은 꼴(구멍 없음) */
  dr?: number[][];
  /** 찻길 면 하나(설계 문서 59절 G5): 칸 층(tileRings). 차로 띠·교차로 경로·모퉁이·횡단보도 밑·분리대 아닌 가운데 틈을 한 격자에 칠해 외곽선을 한 번 딴 것 */
  g?: number[];
  /** 보도 면(G8)과 그 밑 찻길(보도 면은 찻길 밑까지 깔아 둘 사이에 틈이 없다) */
  w?: number[];
  /** 분리대 녹지(연석 안쪽 0.5m 뒤) */
  m?: number[];
}

/** 연석 선(public/data/curbs.json, 재작업 W14): 그린 찻길 면 전체(띠·교차로 면·분리대·그리기 전용 면)의 경계. 줄마다 [점 수, x, z, 뒤 점마다 차이](dm).
 *  v2(재작업 W51)는 c 가 비어 있고 앱이 찻길 면 하나(surface.json g)의 외곽선에서 연석을 만든다. 점자블록 t 만 굽는다 */
export interface CurbsJson {
  v: 1 | 2;
  c: number[][];
  /** 횡단보도 끝 점자블록 [가운데 x, z, 바깥 방향 ×1000 (x, z), 폭](dm) */
  t?: number[];
}

export interface Curbs {
  /** 연석 선 [x, 0, z, ...] */
  lines: Float32Array[];
  /** 점자블록 띠: 가운데, 바깥 방향(단위), 폭(m) */
  tactile: { x: number; z: number; ux: number; uz: number; w: number }[];
}

export function decodeCurbs(j: CurbsJson): Curbs {
  const t = j.t ?? [];
  const tactile: Curbs['tactile'] = [];
  for (let i = 0; i + 4 < t.length; i += 5) tactile.push({ x: t[i] / 10, z: t[i + 1] / 10, ux: t[i + 2] / 1000, uz: t[i + 3] / 1000, w: t[i + 4] / 10 });
  return { lines: decodeLines(j), tactile };
}

function decodeLines(j: CurbsJson): Float32Array[] {
  return j.c.map((a) => {
    const n = a[0];
    const p = new Float32Array(n * 3);
    let x = 0;
    let z = 0;
    for (let i = 0; i < n; i++) {
      x += a[1 + i * 2];
      z += a[2 + i * 2];
      p.set([x / 10, 0, z / 10], i * 3);
    }
    return p;
  });
}

export interface Face {
  /** 면에 닿는 길 가운데 가장 큰 길의 등급(작은 숫자) */
  cls: number;
  /** 바깥 고리 [x, z, ...](닫는 점 없이) */
  outer: Float32Array;
  /** 교통섬 */
  holes: Float32Array[];
}

export interface Surface {
  /** 길 조각 i 의 띠 구간 [cut[2i], cut[2i+1]](m) */
  cut: Float32Array;
  faces: Face[];
  /** 그리기 전용 찻길 면 */
  draw: Face[];
  /** v2 칸 층(SurfaceJson g·w·m). 없으면 빈 배열 */
  ground: number[];
  walk: number[];
  median: number[];
}

export function decodeFace(a: ArrayLike<number>): Face {
  let k = 1;
  const ring = () => {
    const n = a[k++];
    const r = new Float32Array(n * 2);
    let x = 0;
    let z = 0;
    for (let i = 0; i < n; i++) {
      x += a[k++];
      z += a[k++];
      r[i * 2] = x / 100;
      r[i * 2 + 1] = z / 100;
    }
    return r;
  };
  const outer = ring();
  const holes: Float32Array[] = [];
  for (let h = a[k++]; h > 0; h--) holes.push(ring());
  return { cls: a[0], outer, holes };
}

export function decodeSurface(j: SurfaceJson): Surface {
  return { cut: Float32Array.from(j.cut, (v) => (v < 0 ? Infinity : v / 10)), faces: j.jn.map(decodeFace), draw: (j.dr ?? []).map(decodeFace), ground: j.g ?? [], walk: j.w ?? [], median: j.m ?? [] };
}

// ── 칸 층(재작업 W51, 설계 문서 59절 B2) ──
// 굽기가 판 전체를 0.25m 칸으로 칠한 면을 64m(256칸) 타일마다 외곽선으로 딴다. 고리 점은 칸 꼭짓점(타일 안 정수 0~256)이고,
// 타일 테두리 위 점은 고정한 채 0.3m 안에서 줄였다. 앱과 시험은 같은 이 함수로 고정점을 둔 채 차이킨 깎기 두 번을 해서 쓴다:
// 타일마다 따로 깎아도 이웃 타일과 테두리에서 같은 점으로 만나 틈·겹침이 없고, 삼각형 나누기를 타일마다 작게 할 수 있다.

/** 칸 크기(m), 타일 칸 수, 판 칸 수, 판 타일 수 */
export const GCELL = 0.25;
export const GTILE = 256;
export const GN = Math.ceil((2 * BOARD_R) / GCELL);
export const GNT = Math.ceil(GN / GTILE);

export interface TileRings {
  tile: number;
  /** 깎은 고리들(판 좌표 [x, z, ...], 닫는 점 없이). 바깥 고리는 넓이 양수, 구멍은 음수 */
  rings: Float32Array[];
  /** 외곽선 가운데 타일 테두리를 따라가는 줄을 뺀 꺾은선들(연석 자리, 판 좌표 [x, z, ...]) */
  edges: Float32Array[];
}

/** 차이킨이 변 양 끝에서 깎는 비율: 변 길이의 1/4, 다만 4칸(1m)까지. 외곽선을 줄여 변이 긴 날카로운 모퉁이를 몇 m 씩 잘라 내지 않게(골목 9,-1199 목, 재작업 W65) */
const cutFrac = (ax: number, az: number, bx: number, bz: number) => Math.min(0.25, 4 / (Math.hypot(bx - ax, bz - az) || 1));
/** 열린 꺾은선(끝점 고정) 차이킨 깎기 한 번 */
function chaikinOpen(p: number[]): number[] {
  const n = p.length / 2;
  if (n < 3) return p;
  const o = [p[0], p[1]];
  for (let k = 0; k + 1 < n; k++) {
    const [ax, az, bx, bz] = [p[k * 2], p[k * 2 + 1], p[k * 2 + 2], p[k * 2 + 3]];
    const f = cutFrac(ax, az, bx, bz);
    if (k > 0) o.push(ax + (bx - ax) * f, az + (bz - az) * f);
    if (k + 2 < n) o.push(bx + (ax - bx) * f, bz + (az - bz) * f);
  }
  o.push(p[n * 2 - 2], p[n * 2 - 1]);
  return o;
}
/** 닫힌 고리 차이킨 깎기 한 번 */
function chaikinClosed(p: number[]): number[] {
  const n = p.length / 2;
  const o: number[] = [];
  for (let k = 0; k < n; k++) {
    const [ax, az, bx, bz] = [p[k * 2], p[k * 2 + 1], p[((k + 1) % n) * 2], p[((k + 1) % n) * 2 + 1]];
    const f = cutFrac(ax, az, bx, bz);
    o.push(ax + (bx - ax) * f, az + (bz - az) * f, bx + (ax - bx) * f, bz + (az - bz) * f);
  }
  return o;
}

/** 칸 층 풀기: [타일 번호, 고리 수, (점 수, 첫 x, z, 뒤 점마다 차이)...] 를 타일마다 깎은 고리와 연석 자리로. x 는 두 배 + 테두리 변 표시(1 이면 그 점에서 나가는 테두리 위 변이 진짜 외곽선) */
export function tileRings(layer: ArrayLike<number>, passes = 2): TileRings[] {
  const out: TileRings[] = [];
  const T = GTILE;
  let k = 0;
  while (k < layer.length) {
    const tile = layer[k++];
    const nl = layer[k++];
    const ox = -BOARD_R + (tile % GNT) * T * GCELL;
    const oz = -BOARD_R + Math.floor(tile / GNT) * T * GCELL;
    const rings: Float32Array[] = [];
    const edges: Float32Array[] = [];
    const world = (q: number[]) => Float32Array.from(q, (v, i) => (i % 2 ? oz : ox) + v * GCELL);
    for (let l = 0; l < nl; l++) {
      const n = layer[k++];
      // x 는 두 배 + flag(그 점에서 나가는 타일 테두리 위 변이 진짜 외곽선이면 1)로 적혀 있다
      const p: number[] = [];
      const flag: number[] = [];
      let x = 0;
      let z = 0;
      for (let i = 0; i < n; i++) {
        x += layer[k++];
        z += layer[k++];
        p.push(x >> 1, z);
        flag.push(x & 1);
      }
      const pin = (i: number) => p[i * 2] === 0 || p[i * 2] === T || p[i * 2 + 1] === 0 || p[i * 2 + 1] === T;
      const first = [...Array(n).keys()].find(pin);
      if (first === undefined) {
        let q = p;
        for (let it = 0; it < passes; it++) q = chaikinClosed(q);
        rings.push(world(q));
        edges.push(world([...q, q[0], q[1]]));
        continue;
      }
      // 고정점에서 고정점까지 줄마다 깎는다. 두 끝이 같은 테두리 위인 두 점 줄은 타일 테두리(연석 아님)
      const ring: number[] = [];
      let i = first;
      do {
        let j = (i + 1) % n;
        const chain = [p[i * 2], p[i * 2 + 1]];
        while (!pin(j)) (chain.push(p[j * 2], p[j * 2 + 1]), (j = (j + 1) % n));
        chain.push(p[j * 2], p[j * 2 + 1]);
        const [ax, az, bx, bz] = [chain[0], chain[1], chain[chain.length - 2], chain[chain.length - 1]];
        const rim = chain.length === 4 && !flag[i] && ((ax === bx && (ax === 0 || ax === T)) || (az === bz && (az === 0 || az === T)));
        let q = chain;
        if (!rim) {
          for (let it = 0; it < passes; it++) q = chaikinOpen(q);
          edges.push(world(q));
        }
        for (let m = 0; m + 2 < q.length; m += 2) ring.push(q[m], q[m + 1]);
        i = j;
      } while (i !== first);
      rings.push(world(ring));
    }
    out.push({ tile, rings, edges });
  }
  return out;
}

/** 고리 넓이(넓이 양수 = 바깥 고리) */
export function loopArea(r: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0, m = r.length - 2; i < r.length; m = i, i += 2) s += r[m] * r[i + 1] - r[i] * r[m + 1];
  return s / 2;
}

const inLoop = (r: ArrayLike<number>, x: number, z: number) => {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < r[i] + ((z - r[i + 1]) / (r[j + 1] - r[i + 1])) * (r[j] - r[i])) c = !c;
  return c;
};

/** 고리들을 바깥 고리마다 그 안 구멍과 묶는다(구멍은 그 첫 점을 품은 가장 작은 바깥 고리에) */
export function groupLoops(rings: Float32Array[]): { outer: Float32Array; holes: Float32Array[] }[] {
  const outs = rings.filter((r) => loopArea(r) > 0).map((r) => ({ outer: r, holes: [] as Float32Array[], a: loopArea(r) }));
  outs.sort((a, b) => a.a - b.a);
  for (const h of rings) {
    if (loopArea(h) >= 0 || h.length < 6) continue;
    // 구멍 변 가운데 한 점(꼭짓점이 바깥 고리와 닿을 수 있어 첫 변 가운데를 조금 안쪽으로)
    const [x, z] = [(h[0] + h[2]) / 2, (h[1] + h[3]) / 2];
    const o = outs.find((q) => inLoop(q.outer, x, z));
    if (o) o.holes.push(h);
  }
  return outs.map(({ outer, holes }) => ({ outer, holes }));
}


/** 땅 위 찻길 조각(등급 5 이하, 교량·올린 둑길 아님). 교차로 면과 띠 자르기는 이 조각만 다룬다. 찻길 터널도 넣는다(입구 경사는 roads.ts 가 띠 구간 안에서 내려 그린다) */
export function isGroundRoad(r: Road): boolean {
  if (r.cls > 5 || r.p.length < 6) return false;
  for (let i = 1; i < r.p.length; i += 3) if (r.p[i] >= 0.3) return false;
  return true;
}

const key = (x: number, z: number) => `${Math.round(x * 10)},${Math.round(z * 10)}`;

/**
 * 땅 위 찻길 조각 둘만 만나는 노드(길이 이어지기만 하는 곳)에서 두 띠를 잇는 단면 방향.
 * 조각마다 [시작 쪽 dx, dz, 끝 쪽 dx, dz](길 진행 방향, 단위 벡터). 0 이면 그 끝은 조각 방향 그대로 자른다
 */
export function roadJoints(roads: Road[]): Float32Array {
  const out = new Float32Array(roads.length * 4);
  const at = new Map<string, [number, number][]>();
  roads.forEach((r, i) => {
    if (!isGroundRoad(r)) return;
    const n = r.p.length;
    for (const [e, x, z] of [[0, r.p[0], r.p[2]], [1, r.p[n - 3], r.p[n - 1]]] as const) {
      const k = key(x, z);
      (at.get(k) ?? at.set(k, []).get(k)!).push([i, e]);
    }
  });
  /** 노드로 들어오는 방향(조각 끝이면 진행 방향, 시작이면 거꾸로) */
  const inward = (r: Road, e: number): [number, number] => {
    const n = r.p.length;
    const [dx, dz] = e ? [r.p[n - 3] - r.p[n - 6], r.p[n - 1] - r.p[n - 4]] : [r.p[0] - r.p[3], r.p[2] - r.p[5]];
    const d = Math.hypot(dx, dz) || 1;
    return [dx / d, dz / d];
  };
  for (const ends of at.values()) {
    if (ends.length !== 2 || ends[0][0] === ends[1][0]) continue;
    const [[ra, ea], [rb, eb]] = ends;
    const [ax, az] = inward(roads[ra], ea);
    const [bx, bz] = inward(roads[rb], eb);
    // 지나가는 방향: a 로 들어와 b 로 나간다
    let tx = ax - bx;
    let tz = az - bz;
    const d = Math.hypot(tx, tz);
    if (d < 0.5) continue; // 거의 되돌아 나가는 곳
    tx /= d;
    tz /= d;
    // 조각 진행 방향으로: 끝(e=1)으로 들어오면 그대로, 시작(e=0)에서 나가면 그대로(나가는 방향 = 진행 방향)
    out.set(ea ? [tx, tz] : [-tx, -tz], ra * 4 + ea * 2);
    out.set(eb ? [-tx, -tz] : [tx, tz], rb * 4 + eb * 2);
  }
  return out;
}

export interface Section {
  s: number;
  x: number;
  y: number;
  z: number;
  /** 오른쪽·왼쪽 찻길 가장자리 점 */
  rx: number;
  rz: number;
  lx: number;
  lz: number;
  /** 가운데선에서 오른쪽·왼쪽 가장자리까지(꺾인 자리에서는 늘인 값) */
  er: number;
  el: number;
}

/**
 * 길 조각 r 의 s0~s1 구간 찻길 띠 단면들: 양 끝, 사이의 꼭짓점, 연석선으로 읽은 가장자리 자료 자리마다.
 * 꼭짓점에서는 앞뒤 조각 방향의 가운데로 자르고 폭이 줄지 않게 늘인다. joint 는 roadJoints 값(이 조각 몫 4개)
 */
export function carriageSections(r: Road, s0: number, s1: number, joint?: ArrayLike<number>): Section[] {
  const P = r.p;
  const n = P.length / 3;
  const L = cumLen(P);
  const len = L[n - 1];
  s0 = Math.max(0, Math.min(len, s0));
  s1 = Math.max(0, Math.min(len, s1));
  if (s1 - s0 < 1e-3) return [];
  // 단면 자리: [s, 꼭짓점 번호(아니면 −1)]
  const at: [number, number][] = [[s0, s0 <= 1e-6 ? 0 : -1]];
  for (let k = 1; k < n - 1; k++) if (L[k] > s0 + 0.05 && L[k] < s1 - 0.05) at.push([L[k], k]);
  if (r.edge) for (const p of [r.edge.r, r.edge.l]) for (const s of p.s) if (s > s0 + 0.05 && s < s1 - 0.05) at.push([s, -1]);
  at.push([s1, s1 >= len - 1e-6 ? n - 1 : -1]);
  at.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const pts = at.filter((a, i) => i === 0 || i === at.length - 1 || (a[0] - at[i - 1][0] > 0.05 && at[at.length - 1][0] - a[0] > 0.05));
  const unit = (i: number): [number, number] => {
    const dx = P[i * 3 + 3] - P[i * 3];
    const dz = P[i * 3 + 5] - P[i * 3 + 2];
    const d = Math.hypot(dx, dz) || 1;
    return [dx / d, dz / d];
  };
  return pts.map(([s, k]) => {
    let seg = 0;
    while (seg < n - 2 && L[seg + 1] <= s) seg++;
    const t = Math.max(0, Math.min(1, (s - L[seg]) / (L[seg + 1] - L[seg] || 1)));
    const a = seg * 3;
    let x = P[a] + (P[a + 3] - P[a]) * t;
    let y = P[a + 1] + (P[a + 4] - P[a + 1]) * t;
    let z = P[a + 2] + (P[a + 5] - P[a + 2]) * t;
    let [dx, dz] = unit(seg);
    let m = 1;
    const j0 = joint && (joint[0] || joint[1]);
    const j1 = joint && (joint[2] || joint[3]);
    if (k > 0 && k < n - 1) {
      // 꺾이는 꼭짓점: 앞뒤 방향의 가운데
      [x, y, z] = [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]];
      const [ax, az] = unit(k - 1);
      const [bx, bz] = unit(k);
      const d = Math.hypot(ax + bx, az + bz) || 1;
      [dx, dz] = [(ax + bx) / d, (az + bz) / d];
      m = Math.min(1.7, 1 / Math.max(0.3, ax * dx + az * dz));
    } else if (k === 0 && j0) {
      const [ax, az] = unit(0);
      [dx, dz] = [joint![0], joint![1]];
      m = Math.min(1.7, 1 / Math.max(0.3, ax * dx + az * dz));
    } else if (k === n - 1 && j1) {
      const [ax, az] = unit(n - 2);
      [dx, dz] = [joint![2], joint![3]];
      m = Math.min(1.7, 1 / Math.max(0.3, ax * dx + az * dz));
    }
    const er = curbAt(r, s, 1) * m;
    const el = curbAt(r, s, -1) * m;
    return { s, x, y, z, rx: x - dz * er, rz: z + dx * er, lx: x + dz * el, lz: z - dx * el, er, el };
  });
}

/** 찻길 터널 깊이(m)와 입구 경사 길이(m): 차 그래프(src/sim/graph.ts sinkTunnels)와 같은 값 */
export const TUNNEL_DEPTH = 8;
export const TUNNEL_RAMP = 30;

/**
 * 찻길 터널 조각마다 시작·끝에서 가장 가까운 입구(터널이 아닌 길과 만나는 노드)까지 터널을 따라간 거리.
 * 터널 조각이 아니면 null. 차 그래프가 차를 내리는 깊이와 같게 그리도록 tunnelDepth 로 깊이를 구한다
 */
export function tunnelReach(roads: Road[]): ([number, number] | null)[] {
  const out: ([number, number] | null)[] = roads.map(() => null);
  const ends = (r: Road) => {
    const n = r.p.length;
    return [key(r.p[0], r.p[2]), key(r.p[n - 3], r.p[n - 1])];
  };
  // 입구: 터널 조각이 하나만 닿는 노드(차 그래프는 앞뒤에 터널 구간이 없는 끝을 입구로 본다)
  const tun = roads.flatMap((r, i) => (r.tunnel && r.cls <= 5 && r.p.length >= 6 ? [i] : []));
  const count = new Map<string, number>();
  for (const i of tun) for (const k of new Set(ends(roads[i]))) count.set(k, (count.get(k) ?? 0) + 1);
  const dist = new Map<string, number>();
  for (const [k, c] of count) dist.set(k, c === 1 ? 0 : Infinity);
  const len = (r: Road) => {
    const L = cumLen(r.p);
    return L[L.length - 1];
  };
  for (let pass = 0; pass < 30; pass++) {
    let changed = false;
    for (const i of tun) {
      const [a, b] = ends(roads[i]);
      const l = len(roads[i]);
      const da = dist.get(a)!;
      const db = dist.get(b)!;
      if (db + l < da) (dist.set(a, db + l), (changed = true));
      if (da + l < db) (dist.set(b, da + l), (changed = true));
    }
    if (!changed) break;
  }
  for (const i of tun) {
    const [a, b] = ends(roads[i]);
    out[i] = [dist.get(a)!, dist.get(b)!];
  }
  return out;
}

/** 터널 조각의 s 자리 깊이(m, 양수): 가까운 입구에서 터널을 따라간 거리 d 로 TUNNEL_DEPTH × smoothstep(d / TUNNEL_RAMP) */
export function tunnelDepth(reach: [number, number], s: number, len: number): number {
  const t = Math.min(1, Math.min(reach[0] + s, reach[1] + len - s) / TUNNEL_RAMP);
  return TUNNEL_DEPTH * t * t * (3 - 2 * t);
}
