// 걷는 선 면 폭과 갈래 영역(재작업 W31 S2, 설계 mapo-w31-people-design.md 4절). 사람 모듈의 차로(S3)·갈래 영역 입장(S4)이 쓴다.
//  - 면 폭: 선마다 ¼·가운데·¾ 세 자리에서 선에 수직으로 잰 걷는 면(몸 가운데가 설 수 있는 칸) 폭 가운데 가장 작은 값.
//    자리가 면 밖이면(칠한 작은 길 위 골목 선, #55) 수직으로 4m 안 가장 가까운 면 자리에서 잰다(사람은 그 면으로 비켜 걷는다).
//    4m 안에 면이 없으면 선 띠 폭(사람은 선 띠를 걷는다, W34: 이 자리를 0 으로 재 2m 넘는 걷는 선 4.4% 가 폭 0 이었다). 길이 0 인 선은 0
//  - 갈래 영역: 갈래 노드(이웃 셋 이상) 둘이 그물 위로 JUNC_R 안에 있으면 한 뭉치로 묶고(이어서 묶임), 그 사이 길의 노드도 넣는다.
//    W36(S4): 4m 로는 어울마당로 Y 갈림의 두 갈래 노드(4.4m)가 묶이지 않아 5m 로 넓히고, 이어 묶기가 사슬로 커지지 않게 묶은 뭉치의 갈래 노드 지름이 JUNC_D 를 넘으면 묶지 않는다
//    (혼자 남는 갈래 노드는 4m 안이면 그래도 묶는다)
//    넓이는 영역 노드와 영역 안 선에서 JUNC_PAD 안 걷는 면, 정원은 넓이 / PER_HEAD
import { decodeArea } from '../../src/sim/people/area.ts';
import { decodeWalk, type WalkJson } from '../../src/sim/walknet.ts';

/** 갈래 노드를 한 영역으로 묶는 그물 위 거리(m) */
export const JUNC_R = 5;
/** 한 영역 갈래 노드들의 가장 먼 두 노드 사이(m): 넘으면 묶지 않는다(4m 이어 묶기에서 지름 86m 영역이 생겼다) */
export const JUNC_D = 12;
/** 영역 넓이를 재는 거리(m): 영역 노드·영역 안 선에서 */
export const JUNC_PAD = 2;
/** 한 사람 몫 넓이(m²): 정원 = 넓이 / PER_HEAD */
export const PER_HEAD = 1.2;
/** 면 폭 단위(m) */
export const WIDTH_UNIT = 0.25;

/** 선마다(e 순서) 면 폭(WIDTH_UNIT 단위 정수) */
export function edgeWidths(json: WalkJson): number[] {
  const g = decodeWalk(json);
  const A = decodeArea(json.a);
  if (!A) throw new Error('walk.json 에 걷는 면(a)이 없다');
  const across = (x: number, z: number, nx: number, nz: number, band: number) => {
    for (let d = 0; d <= 4; d += 0.25)
      for (const sg of d ? [1, -1] : [1]) {
        const px = x + nx * d * sg;
        const pz = z + nz * d * sg;
        if (A.at(px, pz)) return A.room(px, pz, nx, nz, 10) + A.room(px, pz, -nx, -nz, 10);
      }
    return band;
  };
  const out: number[] = [];
  for (let k = 0; k < g.edgeAt.length / 2; k++) {
    const a = g.edgeAt[k * 2];
    const b = g.adj[a][g.edgeAt[k * 2 + 1]];
    const [lo, hi] = g.band[a][g.edgeAt[k * 2 + 1]];
    const [ax, az, bx, bz] = [g.nx[a * 2], g.nx[a * 2 + 1], g.nx[b * 2], g.nx[b * 2 + 1]];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-3) {
      out.push(0);
      continue;
    }
    const nx = -(bz - az) / L;
    const nz = (bx - ax) / L;
    let m = Infinity;
    for (const t of [0.25, 0.5, 0.75]) m = Math.min(m, across(ax + (bx - ax) * t, az + (bz - az) * t, nx, nz, hi - lo));
    out.push(Math.round(m / WIDTH_UNIT));
  }
  return out;
}

/** 영역에 붙여 넣는 좁은 선 길이 상한(m) */
export const JUNC_NARROW_L = 12;
/** 이 면 폭(m) 아래인 선은 좁은 선 */
export const JUNC_NARROW_W = 1.6;

/** 갈래 영역마다 [노드 수, 넓이(m², 반올림), 첫 노드, 앞 노드와 차이 …](노드는 오름차순). widths(edgeWidths 결과)를 주면 영역 노드에 붙은 좁은 선(면 폭 JUNC_NARROW_W 미만,
 *  JUNC_NARROW_L 이하)의 맞은편 길 노드(이웃 둘)도 영역에 넣는다(W36: 어울마당로 Y 갈림은 걷는 면 밖을 지나는 폭 0 선 둘(3.4·10.5m)로 넓은 바닥에 이어진다.
 *  사람은 그 선을 따라가지 않고 바닥을 가로지르므로, 그 선 끝까지가 갈래 길이다) */
export function junctions(json: WalkJson, widths?: number[]): number[] {
  const g = decodeWalk(json);
  const A = decodeArea(json.a);
  if (!A) throw new Error('walk.json 에 걷는 면(a)이 없다');
  const N = g.adj.length;
  const X = (n: number) => g.nx[n * 2];
  const Z = (n: number) => g.nx[n * 2 + 1];
  const len = (a: number, b: number) => Math.hypot(X(b) - X(a), Z(b) - Z(a));
  const branch = (n: number) => g.adj[n].length >= 3;
  const up = new Int32Array(N).map((_, i) => i);
  const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i])));
  /** 뭉치(뿌리)마다 갈래 노드 목록 */
  const mem = new Map<number, number[]>();
  const members = (r: number) => mem.get(r) ?? [r];
  /** 두 뭉치를 묶어도 갈래 노드 지름이 JUNC_D 안인가 */
  const fits = (r1: number, r2: number) => {
    for (const p of members(r1)) for (const q of members(r2)) if (len(p, q) > JUNC_D) return false;
    return true;
  };
  /** 영역에 드는 노드(갈래 노드 사이 길의 노드 포함) */
  const inJ = new Uint8Array(N);
  // 갈래 노드마다 그물 위 JUNC_R 안을 펼쳐(작은 다익스트라) 닿은 갈래 노드와 묶는다
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  for (let s = 0; s < N; s++) {
    if (!branch(s)) continue;
    dist.clear();
    prev.clear();
    dist.set(s, 0);
    const open = [s];
    const done = new Set<number>();
    while (open.length) {
      let bi = 0;
      for (let q = 1; q < open.length; q++) if (dist.get(open[q])! < dist.get(open[bi])!) bi = q;
      const u = open.splice(bi, 1)[0];
      if (done.has(u)) continue;
      done.add(u);
      if (u !== s && branch(u)) {
        const ru = find(u);
        const rs = find(s);
        // 혼자인 갈래 노드는 4m 안이면 지름을 넘어도 묶는다(4m 안 이웃 갈래 노드가 있는 갈래 노드는 모두 영역 안, S2)
        const lone = (members(ru).length === 1 || members(rs).length === 1) && dist.get(u)! <= 4;
        if (ru !== rs && (fits(ru, rs) || lone)) {
          mem.set(rs, [...members(rs), ...members(ru)]);
          mem.delete(ru);
          up[ru] = rs;
        }
        if (find(u) === find(s)) {
          for (let v = u; v !== s; v = prev.get(v)!) inJ[v] = 1;
          inJ[s] = 1;
        }
      }
      for (const v of g.adj[u]) {
        const d = dist.get(u)! + len(u, v);
        if (d > JUNC_R || d >= (dist.get(v) ?? Infinity)) continue;
        dist.set(v, d);
        prev.set(v, u);
        open.push(v);
      }
    }
  }
  // 좁은 선(면 폭 1.6m 미만, 12m 이하)으로 영역 노드에 붙은 길 노드(이웃 둘)도 그 뭉치로(한 칸만)
  const extra = new Map<number, number>();
  if (widths) {
    const wOf = new Map<number, number>();
    for (let k = 0; k < g.edgeAt.length / 2; k++) {
      const a = g.edgeAt[k * 2];
      const b = g.adj[a][g.edgeAt[k * 2 + 1]];
      wOf.set(Math.min(a, b) * N + Math.max(a, b), widths[k] * WIDTH_UNIT);
    }
    for (let a = 0; a < N; a++) {
      if (!inJ[a] || !branch(a)) continue;
      for (const b of g.adj[a]) {
        if (inJ[b] || extra.has(b) || g.adj[b].length !== 2 || len(a, b) > JUNC_NARROW_L) continue;
        if ((wOf.get(Math.min(a, b) * N + Math.max(a, b)) ?? Infinity) < JUNC_NARROW_W) extra.set(b, find(a));
      }
    }
  }
  // 길의 노드도 그 길 끝 갈래 노드의 뭉치로
  const groups = new Map<number, number[]>();
  for (const [b, r] of extra) (groups.get(r) ?? groups.set(r, []).get(r)!).push(b);
  for (let n = 0; n < N; n++) {
    if (!inJ[n]) continue;
    if (!branch(n)) {
      // 길의 노드: 이웃을 따라 가장 가까운 영역 갈래 노드의 뭉치
      let r = -1;
      const seen = new Set([n]);
      let front = [n];
      while (r < 0 && front.length) {
        const nxt: number[] = [];
        for (const u of front)
          for (const v of g.adj[u]) {
            if (seen.has(v) || !inJ[v]) continue;
            if (branch(v)) r = find(v);
            seen.add(v);
            nxt.push(v);
          }
        front = nxt;
      }
      if (r >= 0) (groups.get(r) ?? groups.set(r, []).get(r)!).push(n);
      continue;
    }
    const r = find(n);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(n);
  }
  const C = 0.5;
  const out: number[] = [];
  for (const nodes of groups.values()) {
    nodes.sort((p, q) => p - q);
    const set = new Set(nodes);
    // 영역 안 선(두 끝이 모두 영역 노드)
    const segs: number[] = [];
    for (const a of nodes) for (const b of g.adj[a]) if (b > a && set.has(b)) segs.push(X(a), Z(a), X(b), Z(b));
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const n of nodes) (x0 = Math.min(x0, X(n))), (z0 = Math.min(z0, Z(n))), (x1 = Math.max(x1, X(n))), (z1 = Math.max(z1, Z(n)));
    const near = (x: number, z: number) => {
      for (const n of nodes) if (Math.hypot(X(n) - x, Z(n) - z) <= JUNC_PAD) return true;
      for (let k = 0; k < segs.length; k += 4) if (segDist(x, z, segs[k], segs[k + 1], segs[k + 2], segs[k + 3]) <= JUNC_PAD) return true;
      return false;
    };
    let cells = 0;
    for (let x = Math.floor((x0 - JUNC_PAD) / C) * C + C / 2; x < x1 + JUNC_PAD; x += C)
      for (let z = Math.floor((z0 - JUNC_PAD) / C) * C + C / 2; z < z1 + JUNC_PAD; z += C) if (A.at(x, z) && near(x, z)) cells++;
    out.push(nodes.length, Math.round(cells * C * C), ...nodes.map((n, k) => (k ? n - nodes[k - 1] : n)));
  }
  return out;
}

function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(ax + dx * t - x, az + dz * t - z);
}
