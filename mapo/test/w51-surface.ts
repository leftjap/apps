// 찻길 면·보도 면 화면 결함 정적 검사(재작업 W51, 설계 문서 59절 B2). 앱이 그리는 찻길 면을 판 전체 0.25m 칸에 칠해 잰다.
// 그리는 찻길 면: surface.json v2 면 g(길 정본에서 구운 면 하나), v1 이면 그때 앱이 그리던 찻길 띠·교차로 면·그리기 전용 면·실행 중 차로 띠(분리대 띠는 분리대).
import { readFileSync } from 'node:fs';
import { decodeCurbs, decodeSurface, GCELL, GN, tileRings, type CurbsJson, type SurfaceJson } from '../src/data/surface.ts';
import { bandQuad, bandTest, laneBands } from '../src/data/laneGround.ts';
import { BOARD_R } from '../src/geo.ts';
import { pointAt } from '../src/poly.ts';
import { headingNear, laneOff, laneWidth, leftEdge, MED } from '../src/sim/graph.ts';
import { fillBits, makeBits, strokeBits, type Bits } from '../tools/lib/bits.ts';
import { load, type Stage2Data } from './w48-stage2.ts';

export interface Drawn {
  /** 1 찻길, 2 분리대(v1 분리대 띠, v2 분리대 녹지), 4 교통섬 */
  B: Bits;
  /** 그리는 연석 선 [x, 0, z, ...] */
  curbs: Float32Array[];
  v2: boolean;
}

const cache = new Map<string, Drawn>();
export function drawn(d: Stage2Data = load()): Drawn {
  const hit = cache.get(d.dir);
  if (hit) return hit;
  const data = (f: string) => JSON.parse(readFileSync(`${d.dir}/${f}`, 'utf8'));
  const sj = data('surface.json') as SurfaceJson;
  const sf = decodeSurface(sj);
  const B = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, GCELL);
  let curbs: Float32Array[];
  const v2 = !!sj.g?.length;
  if (v2) {
    for (const t of tileRings(sf.ground)) fillBits(B, t.rings, 1);
    for (const t of tileRings(sf.median)) fillBits(B, t.rings, 2);
    curbs = tileRings(sf.ground).flatMap((t) => t.edges.map((e) => Float32Array.from({ length: (e.length / 2) * 3 }, (_, k) => (k % 3 === 1 ? 0 : e[Math.floor(k / 3) * 2 + (k % 3 ? 1 : 0)]))));
  } else {
    const sp = data('surface-polys.json') as { car: number[][]; med: number[][]; draw: number[][] };
    const dm = (a: number[]) => Float32Array.from(a, (v) => v / 10);
    for (const c of sp.car) if (!d.board.roads[c[0]]?.tunnel) fillBits(B, [dm(c.slice(1))], 1);
    for (const f of sf.faces) fillBits(B, [f.outer, ...f.holes], 1);
    for (const f of sf.draw) fillBits(B, [f.outer], 1);
    for (const q of sp.draw) fillBits(B, [dm(q)], 1);
    for (const { sec } of laneBands(d.g)) for (let k = 0; k + 1 < sec.length / 4; k++) fillBits(B, [bandQuad(sec, k)], 1);
    for (const m of sp.med) fillBits(B, [dm(m)], 2);
    // 그때 앱은 연석 가운데 차로 띠 안쪽(0.3m) 것을 그리지 않았다(render/curbs.ts onLane)
    const onLane = bandTest(laneBands(d.g, -0.3));
    curbs = [];
    for (const P of decodeCurbs(data('curbs.json') as CurbsJson).lines) {
      let run: number[] = [];
      for (let i = 0; i + 1 < P.length / 3; i++) {
        const [ax, az, bx, bz] = [P[i * 3], P[i * 3 + 2], P[i * 3 + 3], P[i * 3 + 5]];
        if (onLane((ax + bx) / 2, (az + bz) / 2)) {
          if (run.length >= 6) curbs.push(Float32Array.from(run));
          run = [];
          continue;
        }
        if (!run.length) run.push(ax, 0, az);
        run.push(bx, 0, bz);
      }
      if (run.length >= 6) curbs.push(Float32Array.from(run));
    }
  }
  // 교통섬(교차로 면의 구멍, surface-polys.json isl): 연석을 두른 섬이라 뜻 없는 면이 아니다
  for (const r of (data('surface-polys.json') as { isl: number[][] }).isl) fillBits(B, [Float32Array.from(r, (v) => v / 10)], 4);
  // 찻길 칸에 분리대·섬이 겹치면 찻길
  for (let i = 0; i < B.v.length; i++) if (B.v[i] & 1) B.v[i] = 1;
  const out = { B, curbs, v2 };
  cache.set(d.dir, out);
  return out;
}

/** 0/1 판 정사각형 (2r+1) 칸 늘이기·줄이기 */
export function morph(a: Uint8Array, n: number, r: number, grow: boolean): Uint8Array {
  const t = new Uint8Array(a.length);
  const o = new Uint8Array(a.length);
  for (let q = 0; q < n; q++) {
    const b = q * n;
    for (let i = 0; i < n; i++) {
      let v = grow ? 0 : 1;
      for (let d = -r; d <= r; d++) {
        const j = i + d;
        const x = j < 0 || j >= n ? 0 : a[b + j];
        if (grow ? x : !x) {
          v = 1 - v;
          break;
        }
      }
      t[b + i] = v;
    }
  }
  for (let q = 0; q < n; q++)
    for (let i = 0; i < n; i++) {
      let v = grow ? 0 : 1;
      for (let d = -r; d <= r; d++) {
        const j = i + d;
        const x = j < 0 || j >= n ? 0 : t[j * n + q];
        if (grow ? x : !x) {
          v = 1 - v;
          break;
        }
      }
      o[i * n + q] = v;
    }
  return o;
}

/** a 에 있고 b 에 없는 칸을 4이웃 덩어리로 묶어 넓이(칸 수)가 min 넘는 덩어리들의 [가운데 x, z, 칸 수] */
function blobs(a: Uint8Array, b: Uint8Array, n: number, min: number, skip?: Uint8Array): number[][] {
  const seen = new Uint8Array(a.length);
  const out: number[][] = [];
  const st: number[] = [];
  for (let s = 0; s < a.length; s++) {
    if (!a[s] || b[s] || seen[s]) continue;
    let c = 0;
    let sx = 0;
    let sz = 0;
    let skipped = false;
    st.push(s);
    seen[s] = 1;
    while (st.length) {
      const q = st.pop()!;
      c++;
      if (skip?.[q]) skipped = true;
      sx += q % n;
      sz += Math.floor(q / n);
      const i = q % n;
      for (const r of [i > 0 ? q - 1 : -1, i < n - 1 ? q + 1 : -1, q - n, q + n]) if (r >= 0 && r < a.length && a[r] && !b[r] && !seen[r]) (seen[r] = 1), st.push(r);
    }
    if (c >= min && !skipped) out.push([-BOARD_R + (sx / c + 0.5) * GCELL, -BOARD_R + (sz / c + 0.5) * GCELL, c]);
  }
  return out;
}

const roadPlane = (D: Drawn) => {
  const o = new Uint8Array(D.B.v.length);
  for (let i = 0; i < o.length; i++) o[i] = D.B.v[i] & 1;
  return o;
};
const where = (b: number[][]) => b.slice(0, 12).map(([x, z, c]) => `${Math.round(x)},${Math.round(z)} ${(c * GCELL * GCELL).toFixed(1)}m²`);

/** 찻길 면 외곽에서 폭 0.5m 아래로 튀어나온 조각(모퉁이 삼각형 등): 찻길 − 열기(0.75m 정사각형) 가운데 0.5m² 넘는 덩어리 수와 넓이 */
export function thinOut(D: Drawn) {
  const R = roadPlane(D);
  const open = morph(morph(R, GN, 1, false), GN, 1, true);
  const b = blobs(R, open, GN, 8);
  return { n: b.length, area: b.reduce((a, q) => a + q[2], 0) * GCELL * GCELL, where: where(b) };
}

/** 찻길 면 안쪽으로 0.5m 아래로 좁게 파고든 찻길 아닌 조각(빗금 둘레 보도색 조각 등): 닫기(0.75m) − 찻길 가운데 0.5m² 넘는 덩어리 수와 넓이 */
export function thinIn(D: Drawn, skip?: Uint8Array) {
  const R = roadPlane(D);
  const close = morph(morph(R, GN, 1, true), GN, 1, false);
  const b = blobs(close, R, GN, 8, skip);
  return { n: b.length, area: b.reduce((a, q) => a + q[2], 0) * GCELL * GCELL, where: where(b) };
}

/**
 * 마주 오는 한 방향 큰길 사이의 뜻 없는 면(중앙버스차로 둘레, 58절의 '분리대 간격 10m' 자리): 한 방향 큰길(분리대 폭이 있거나 중앙버스차로)마다 1m 간격으로 왼쪽 차로 가장자리에서 왼쪽으로 짚어,
 * 제 찻길을 지나 10m 안에서 다시 찻길을 만나고 그 찻길(1.5m 안쪽 2.5m 안)이 마주 오는 차로인 빈 곳 가운데 분리대·교통섬 칸이 하나도 없는 것의 넓이(m², 1m 단면 × 폭)
 */
export function greyGap(d: Stage2Data, D: Drawn) {
  const { B } = D;
  const at = (x: number, z: number) => {
    const i = Math.floor((x + BOARD_R) / GCELL);
    const j = Math.floor((z + BOARD_R) / GCELL);
    return i < 0 || j < 0 || i >= GN || j >= GN ? 0 : B.v[j * GN + i];
  };
  const P = [0, 0, 0];
  // 차로(중앙버스차로 포함) 가운데 점(2m 마다, 진행 방향)을 4m 칸에: 건너편이 마주 오는 차로인지 본다
  const G = 4;
  const lanePts = new Map<number, number[]>();
  for (const e of d.g)
    for (const l of e.mo.length || e.med ? [...Array(e.lanes).keys(), MED] : [...Array(e.lanes).keys()])
      for (let s = 1; s < e.len; s += 2) {
        pointAt(e.p, e.cum, s, P);
        const o = laneOff(e, l, s);
        const h = headingNear(e, s, o);
        const [x, z] = [P[0] - Math.sin(h) * o, P[2] + Math.cos(h) * o];
        const k = (Math.floor(x / G) + 1000) * 4000 + Math.floor(z / G) + 1000;
        (lanePts.get(k) ?? lanePts.set(k, []).get(k)!).push(x, z, Math.cos(h), Math.sin(h));
      }
  /** (x, z) 2.5m 안에 진행 방향 (hx, hz) 와 마주 오는(cos −0.7 아래) 차로가 있는가 */
  const facing = (x: number, z: number, hx: number, hz: number) => {
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const [px, pz, ux, uz] of chunk(lanePts.get((Math.floor(x / G) + a + 1000) * 4000 + Math.floor(z / G) + b + 1000) ?? []))
          if (Math.hypot(px - x, pz - z) < 2.5 && ux * hx + uz * hz < -0.7) return true;
    return false;
  };
  let area = 0;
  let of = 0;
  const w: string[] = [];
  for (const e of d.g) {
    const r = d.board.roads[e.road];
    if (!r || !r.oneway || r.cls > 3 || !(r.gap > 0 || e.med || e.mo.length)) continue;
    for (let s = 0.5; s < e.len; s += 1) {
      pointAt(e.p, e.cum, s, P);
      if (Math.abs(P[1]) > 0.3) continue;
      let l = leftEdge(e, s);
      if (e.mo.length || e.med) l = Math.min(l, laneOff(e, MED, s) - laneWidth(e, 0, s) / 2);
      const h = headingNear(e, s, l);
      const [nx, nz] = [-Math.sin(h), Math.cos(h)];
      const v = (o: number) => at(P[0] + nx * o, P[2] + nz * o);
      of++;
      let o = l;
      while (o > l - 4 && v(o) & 1) o -= 0.25;
      if (o <= l - 4) continue;
      const o1 = o;
      let med = false;
      while (o > o1 - 10 && !(v(o) & 1)) (med ||= !!(v(o) & 6)), (o -= 0.25);
      if (o <= o1 - 10) continue;
      // 건너편 찻길이 마주 오는 차로가 아니면(교차로 모퉁이 너머 다른 길) 세지 않는다
      if (!facing(P[0] + nx * (o - 1.5), P[2] + nz * (o - 1.5), Math.cos(h), Math.sin(h))) continue;
      if (med) continue;
      area += o1 - o;
      if (o1 - o > 0.5 && w.length < 12) w.push(`e${e.id} ${Math.round(P[0])},${Math.round(P[2])} ${(o1 - o).toFixed(1)}m`);
    }
  }
  return { area, of, where: w };
}

/** 연석과 찻길 외곽: 외곽 칸(찻길 칸 가운데 4이웃에 찻길 아닌 칸이 있는 것) 가운데 연석이 0.45m 안에 없는(연석 조각마다 양 끝까지 0.45m 늘인 띠 밖) 길이(m)와, 찻길 외곽에서 0.5m 넘게 안쪽에 그은 연석 길이(m). 판 가장자리 3m 안은 빼고 */
/** 건물 외곽선 둘레 m 안 칸(1). 골목 찻길 면은 건물에서 잘라 내므로(재작업 W60 순서 2) 건물 벽에 붙은 좁은 틈·그 둘레 연석은 결함이 아니다:
 *  건물이 찻길(지킨 차로 띠 포함) 쪽으로 좁게 나온 실제 모양이고 그리면 건물이 덮는다 */
export function nearBuildings(buildings: { pts: ArrayLike<number> }[], m = 0.5): Uint8Array {
  const H = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, GCELL);
  for (const b of buildings) fillBits(H, [Float32Array.from(b.pts)], 1);
  return morph(H.v, GN, Math.round(m / GCELL), true);
}

export function curbGap(D: Drawn, skip?: Uint8Array) {
  const R = roadPlane(D);
  const C = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, GCELL);
  let inside = 0;
  let total = 0;
  const w: string[] = [];
  const isR = (x: number, z: number) => {
    const i = Math.floor((x + BOARD_R) / GCELL);
    const j = Math.floor((z + BOARD_R) / GCELL);
    return i >= 0 && j >= 0 && i < GN && j < GN && R[j * GN + i] === 1;
  };
  for (const p of D.curbs) {
    const line: number[] = [];
    for (let k = 0; k < p.length; k += 3) line.push(p[k], p[k + 2]);
    for (let k = 0; k + 3 < line.length; k += 2) {
      const [ax, az, bx, bz] = [line[k], line[k + 1], line[k + 2], line[k + 3]];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-4) continue;
      total += L;
      strokeBits(C, [ax, az, bx, bz], 0.45, 1);
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      if (Math.hypot(mx, mz) > BOARD_R - 3) continue;
      if (skip?.[Math.floor((mz + BOARD_R) / GCELL) * GN + Math.floor((mx + BOARD_R) / GCELL)]) continue;
      let all = true;
      for (let a = 0; a < 8 && all; a++) all = isR(mx + Math.cos((a * Math.PI) / 4) * 0.5, mz + Math.sin((a * Math.PI) / 4) * 0.5);
      if (all) {
        inside += L;
        if (w.length < 6) w.push(`안쪽 연석 ${Math.round(mx)},${Math.round(mz)}`);
      }
    }
  }
  let missing = 0;
  let nearTile = 0;
  for (let j = 1; j < GN - 1; j++)
    for (let i = 1; i < GN - 1; i++) {
      const q = j * GN + i;
      if (!R[q] || (R[q - 1] && R[q + 1] && R[q - GN] && R[q + GN])) continue;
      const x = -BOARD_R + (i + 0.5) * GCELL;
      const z = -BOARD_R + (j + 0.5) * GCELL;
      if (Math.hypot(x, z) > BOARD_R - 3 || C.v[q]) continue;
      missing += GCELL;
      if (i % 256 < 3 || i % 256 > 252 || j % 256 < 3 || j % 256 > 252) nearTile += GCELL;
      if (w.length < 12 && missing % 50 < GCELL) w.push(`연석 없음 ${Math.round(x)},${Math.round(z)}`);
    }
  return { missing, inside, total, nearTile, where: w };
}

/** 다각형들(고리 묶음마다 짝홀)의 겹친 넓이(두 다각형 넘게 덮인 칸, m²)와, 합친 면을 1m 닫았을 때 새로 메워지는 1m² 넘는 틈 넓이(m²) */
export function overlapGap(polys: ArrayLike<number>[][]) {
  let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const rs of polys) for (const r of rs) for (let k = 0; k < r.length; k += 2) (x0 = Math.min(x0, r[k])), (x1 = Math.max(x1, r[k])), (z0 = Math.min(z0, r[k + 1])), (z1 = Math.max(z1, r[k + 1]));
  const n = Math.ceil(Math.max(x1 - x0, z1 - z0) / GCELL) + 12;
  const ox = x0 - 6 * GCELL;
  const oz = z0 - 6 * GCELL;
  const cnt = new Uint8Array(n * n);
  const one = makeBits(ox, oz, ox + n * GCELL, oz + n * GCELL, GCELL);
  for (const rs of polys) {
    one.v.fill(0);
    fillBits(one, rs, 1);
    for (let i = 0; i < cnt.length; i++) if (one.v[i]) cnt[i] = Math.min(255, cnt[i] + 1);
  }
  let over = 0;
  const U = new Uint8Array(n * n);
  for (let i = 0; i < cnt.length; i++) {
    if (cnt[i] > 1) over++;
    if (cnt[i]) U[i] = 1;
  }
  const close = morph(morph(U, n, 2, true), n, 2, false);
  const b = blobs(close, U, n, 16);
  return { overlap: over * GCELL * GCELL, gap: b.reduce((a, q) => a + q[2], 0) * GCELL * GCELL, gaps: b.length };
}

function* chunk(a: number[]): Generator<number[]> {
  for (let i = 0; i + 3 < a.length; i += 4) yield [a[i], a[i + 1], a[i + 2], a[i + 3]];
}
