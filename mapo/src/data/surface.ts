// 찻길 바닥. 굽기(tools/lib/surface.ts)가 교차로마다 면 하나와 길 조각마다 띠를 그릴 구간을 정해 public/data/surface.json 에 두고,
// 렌더러는 띠를 그 구간만 그리고 교차로 면을 그대로 칠한다. 띠 가장자리 점은 굽기와 렌더러가 이 파일의 carriageSections 하나로 만들므로
// 띠 끝 단면과 교차로 면의 변이 같은 점에서 만난다(겹치지도 벌어지지도 않는다).
import { curbAt, type Road } from './board.ts';
import { cumLen } from '../poly.ts';

export interface SurfaceJson {
  v: 1;
  /** 길 조각마다 띠를 그리는 구간 [시작 s, 끝 s, ...](dm). 끝 −1 은 조각 끝까지, 시작 ≥ 끝이면 그리지 않는다(교차로 면 안의 조각) */
  cut: number[];
  /** 교차로 면마다 [등급, 바깥 고리 점 수, x, z, ..., 구멍 수, (점 수, x, z, ...)...]. 좌표는 cm 이고 고리마다 첫 점 뒤는 앞 점과의 차이 */
  jn: number[][];
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
  return { cut: Float32Array.from(j.cut, (v) => (v < 0 ? Infinity : v / 10)), faces: j.jn.map(decodeFace) };
}

/** 땅 위 찻길 조각(등급 5 이하, 교량 아님). 교차로 면과 띠 자르기는 이 조각만 다룬다 */
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
