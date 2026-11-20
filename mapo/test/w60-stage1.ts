// 1단계 바닥 정적 검사(재작업 W60, mapo/CLAUDE.md 1단계). 차·사람을 돌리지 않고 구운 판만 잰다.
// 연석 출렁임: 차 그래프 땅 위 구간마다 양쪽으로 그린 찻길 면 경계까지 거리를 1m 마다 재고, 15m 안에서 0.3m 넘게 들어갔다 나오는(또는 나왔다 들어가는)
// 꺾임을 센다. 2m 넘게 바뀌는 것은 골목 어귀·버스 정차 공간 같은 실제 지형이라 뺀다. 한쪽으로만 바뀌는 차로 늘고 줌은 꺾임이 아니다.
import { pointAt } from '../src/poly.ts';
import { bitsAt, fillBits, makeBits } from '../tools/lib/bits.ts';
import { laneBands, bandQuad } from '../src/data/laneGround.ts';
import { carPaths, strokeFlat } from '../tools/road/surface.ts';
import type { Inter } from '../src/sim/intersection/index.ts';
import { readFileSync } from 'node:fs';
import { decodeSurface, GCELL, tileRings, type SurfaceJson } from '../src/data/surface.ts';
import { BOARD_R } from '../src/geo.ts';
import { headingNear, laneOff, laneWidth, leftEdge, MED, rightEdge, type Edge } from '../src/sim/graph.ts';
import type { Drawn } from './w51-surface.ts';

export interface Wobble {
  n: number;
  spots: { x: number; z: number; amp: number; edge: number; side: number }[];
}

/** 구간 e 의 s 자리에서 side(1 오른쪽, −1 왼쪽) 차로 가장자리부터 바깥으로 짚어 그린 찻길 면이 끝나는 자리의 가운데선에서 거리(m). 8m 안에서 끝나지 않으면 NaN */
function reach(D: Drawn, e: Edge, s: number, side: number, P: number[]): number {
  pointAt(e.p, e.cum, s, P);
  if (Math.abs(P[1]) > 0.3) return NaN;
  let o = side > 0 ? rightEdge(e, s) : leftEdge(e, s);
  if (side < 0 && (e.mo.length || e.med)) o = Math.min(o, laneOff(e, MED, s) - laneWidth(e, 0, s) / 2);
  const h = headingNear(e, s, o);
  const nx = -Math.sin(h), nz = Math.cos(h);
  const start = o - side * 0.5;
  for (let d = 0; d <= 8; d += 0.25) {
    const v = start + side * d;
    // 차로 가장자리가 아니라 길 가운데선에서 잰 거리(차로 가장자리가 흔들려도 곧은 연석은 곧게 잰다)
    if (!(bitsAt(D.B, P[0] + nx * v, P[2] + nz * v) & 1)) return side * v;
  }
  return NaN;
}

export function curbWobble(D: Drawn, g: Edge[], minAmp = 0.3, maxAmp = 2, win = 15, trim = 12): Wobble {
  const spots: Wobble['spots'] = [];
  const P = [0, 0, 0];
  for (const e of g) {
    if (e.len < 2 * trim + 2 * win) continue;
    for (const side of [1, -1]) {
      const s0 = trim, n = Math.floor(e.len - 2 * trim);
      const o = Array.from({ length: n }, (_, i) => reach(D, e, s0 + i, side, P));
      let last = -1e9;
      for (let i = win; i + win < n; i++) {
        if (!Number.isFinite(o[i]) || i - last < win) continue;
        let loL = Infinity, hiL = -Infinity, loR = Infinity, hiR = -Infinity, ok = true;
        for (let k = i - win; k <= i + win; k++) {
          if (!Number.isFinite(o[k])) { ok = false; break; }
          if (k < i) (loL = Math.min(loL, o[k])), (hiL = Math.max(hiL, o[k]));
          if (k > i) (loR = Math.min(loR, o[k])), (hiR = Math.max(hiR, o[k]));
        }
        if (!ok) continue;
        // 봉우리(양옆이 다 낮음) 또는 골짜기(양옆이 다 높음)
        const peak = Math.min(o[i] - loL, o[i] - loR);
        const dip = Math.min(hiL - o[i], hiR - o[i]);
        const amp = Math.max(peak, dip);
        if (amp < minAmp || amp > maxAmp) continue;
        if (peak >= minAmp && o[i] < Math.max(hiL, hiR) - 1e-6) continue;
        if (dip >= minAmp && o[i] > Math.min(loL, loR) + 1e-6) continue;
        pointAt(e.p, e.cum, s0 + i, P);
        spots.push({ x: P[0], z: P[2], amp, edge: e.id, side });
        last = i;
      }
    }
  }
  spots.sort((a, b) => b.amp - a.amp);
  return { n: spots.length, spots };
}

/** 그린 연석 선 자체의 S자 출렁임(기준선 없이): 선을 1m 로 다시 찍고, 앞뒤 win m 를 잇는 현에서 벗어난 거리(왼쪽 +)를 잰다.
 *  win m 안에서 +minAmp 넘게와 −minAmp 넘게가 함께 나오면(방향이 바뀌는 물결) 한 곳으로 센다. 2m 넘게 벗어나는 모퉁이 곡선은 뺀다 */
export function curbS(curbs: Float32Array[], minAmp = 0.3, maxAmp = 2, win = 15): Wobble {
  const spots: Wobble['spots'] = [];
  for (const c of curbs) {
    const pts: number[] = [];
    for (let i = 0; i + 3 < c.length; i += 3) {
      const [ax, az, bx, bz] = [c[i], c[i + 2], c[i + 3], c[i + 5]];
      const L = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < L; s += 1) pts.push(ax + ((bx - ax) * s) / L, az + ((bz - az) * s) / L);
    }
    const n = pts.length / 2;
    if (n < 2 * win + 1) continue;
    const sag = new Float32Array(n).fill(NaN);
    for (let i = win; i + win < n; i++) {
      const [ax, az, bx, bz] = [pts[(i - win) * 2], pts[(i - win) * 2 + 1], pts[(i + win) * 2], pts[(i + win) * 2 + 1]];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      sag[i] = ((bx - ax) * (pts[i * 2 + 1] - az) - (bz - az) * (pts[i * 2] - ax)) / L;
    }
    let last = -1e9;
    for (let i = win; i + win < n; i++) {
      if (i - last < win || !(Math.abs(sag[i]) >= minAmp && Math.abs(sag[i]) <= maxAmp)) continue;
      let opp = 0;
      for (let k = Math.max(win, i - win); k <= Math.min(n - win - 1, i + win); k++) if (Math.sign(sag[k]) !== Math.sign(sag[i]) && Math.abs(sag[k]) >= minAmp && Math.abs(sag[k]) <= maxAmp) opp = Math.max(opp, Math.abs(sag[k]));
      if (!opp) continue;
      spots.push({ x: pts[i * 2], z: pts[i * 2 + 1], amp: Math.abs(sag[i]) + opp, edge: -1, side: 0 });
      last = i;
    }
  }
  spots.sort((a, b) => b.amp - a.amp);
  return { n: spots.length, spots };
}

/** 건물 외곽선이 그린 찻길 면 안(0.3m 넘게)에 든 자리: 외곽선을 1m 로 찍어, 그 점과 둘레 0.3m 여덟 점이 모두 찻길이면 침범으로 센다.
 *  침범 점마다 등급을 붙인다: 둘레 0.3m 안에 차가 달리는 자리(차로 띠 가장자리 + 0.3m, 교차로 경로 반폭 1.2m: 굽기가 남기는 core)가 있으면 −1(차로를 지킨 자리, 2026-11-20 지오 결정),
 *  아니면 가장 가까운 길 가운데선의 등급(board.roads cls) */
/** 굽기가 정한 찻길 면(surface.json g 외곽선, 그릴 때 둥글리기 없이). 앱은 외곽선을 chaikin 으로 둥글려 그려 건물 모퉁이 옆 오목 모서리를
 *  건물 쪽으로 0.5~1m 깎아 들어가지만 그 자리는 건물이 덮는다(재작업 W60 순서 2: HEAD 에도 있던 것, 굽기 칸에는 없다) */
export function bakedGround(dir: string): Pick<Drawn, 'B'> {
  const B = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, GCELL);
  const sf = decodeSurface(JSON.parse(readFileSync(`${dir}/surface.json`, 'utf8')) as SurfaceJson);
  for (const t of tileRings(sf.ground, 0)) fillBits(B, t.rings, 1);
  return { B };
}

export function buildingIntrusion(D: Pick<Drawn, 'B'>, board: { buildings: { pts: ArrayLike<number> }[]; roads: { p: ArrayLike<number>; cls: number }[] }, g: Edge[] = [], X?: Inter['X']) {
  // 굽기(tools/road/surface.ts ⑥)가 건물과 겹쳐도 남기는 차가 달리는 자리(core): 차로 띠 + 교차로 경로
  const BB = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, GCELL);
  for (const { sec } of laneBands(g)) for (let k = 0; k + 1 < sec.length / 4; k++) fillBits(BB, [bandQuad(sec, k)], 1);
  if (X) carPaths(g, X, (run) => strokeFlat(BB, run, 1.2, 1));
  const nearBand = (x: number, z: number) => {
    if (bitsAt(BB, x, z)) return true;
    for (let k = 0; k < 8; k++) if (bitsAt(BB, x + 0.3 * Math.cos((k * Math.PI) / 4), z + 0.3 * Math.sin((k * Math.PI) / 4))) return true;
    return false;
  };
  const C = 20;
  const key = (x: number, z: number) => Math.floor(x / C) * 100003 + Math.floor(z / C);
  const G = new Map<number, number[]>();
  board.roads.forEach((r, ri) => {
    for (let i = 0; i + 5 < r.p.length; i += 3) {
      const L = Math.hypot(r.p[i + 3] - r.p[i], r.p[i + 5] - r.p[i + 2]);
      for (let s = 0; s <= L; s += C / 2) {
        const u = s / (L || 1);
        const k = key(r.p[i] + (r.p[i + 3] - r.p[i]) * u, r.p[i + 2] + (r.p[i + 5] - r.p[i + 2]) * u);
        const a = G.get(k) ?? G.set(k, []).get(k)!;
        if (a[a.length - 1] !== ri * 10000 + i / 3) a.push(ri * 10000 + i / 3);
      }
    }
  });
  const nearCls = (x: number, z: number) => {
    let best = 1e9, bc = -1;
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const c of G.get(key(x + dx * C, z + dz * C)) ?? []) {
          const r = board.roads[Math.floor(c / 10000)], k = (c % 10000) * 3;
          const [ax, az, vx, vz] = [r.p[k], r.p[k + 2], r.p[k + 3] - r.p[k], r.p[k + 5] - r.p[k + 2]];
          const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
          const d = Math.hypot(ax + vx * t - x, az + vz * t - z);
          if (d < best) (best = d), (bc = r.cls);
        }
    return bc;
  };
  const on = (x: number, z: number) => (bitsAt(D.B, x, z) & 1) === 1;
  const deep = (x: number, z: number) => {
    if (!on(x, z)) return false;
    for (let k = 0; k < 8; k++) if (!on(x + 0.3 * Math.cos((k * Math.PI) / 4), z + 0.3 * Math.sin((k * Math.PI) / 4))) return false;
    return true;
  };
  const byCls = new Map<number, { n: number; bldg: Set<number>; at: [number, number][] }>();
  board.buildings.forEach((b, bi) => {
    const p = b.pts;
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length;
      const L = Math.hypot(p[j] - p[i], p[j + 1] - p[i + 1]);
      for (let s = 0; s < L; s += 1) {
        const u = s / (L || 1);
        const [x, z] = [p[i] + (p[j] - p[i]) * u, p[i + 1] + (p[j + 1] - p[i + 1]) * u];
        if (!deep(x, z)) continue;
        const c = nearBand(x, z) ? -1 : nearCls(x, z);
        const o = byCls.get(c) ?? byCls.set(c, { n: 0, bldg: new Set(), at: [] }).get(c)!;
        o.n++;
        o.bldg.add(bi);
        if (o.at.length < 10) o.at.push([x, z]);
      }
    }
  });
  return byCls;
}
