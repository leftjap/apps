// 차로마다 서는 자리. 교차로·신호 앞 진입 구간의 차로마다 서울시 정지선(일시정지선 004, 구운 판의 stopLines)이 그 차로 가운데선을 가로지르는 자리를
// 정지 자리로 쓴다. 정지선이 없으면 그 차로가 지나는 횡단보도 면(구간 끝에 가장 가까운 것)의 바깥 변 1m 앞이다.
// 차로마다 그 차로 가운데선이 횡단보도 면 위를 지나는 구간도 적어 둔다(차는 앞이 막혔을 때 횡단보도 위에 서지 않는다, cars.ts).
import type { Crosswalk } from '../data/board.ts';
import { pointAt } from '../poly.ts';
import { headingNear, laneOff, lanePos, MED, type Edge } from './graph.ts';

export interface LaneStops {
  /** 구간 e 의 차로 l 정지 자리: 구간 끝에서 앞 범퍼까지 거리(m, 앞 구간에 서면 구간 길이보다 크다). 정지선도 횡단보도도 없으면 −1 */
  back(e: number, l: number): number;
  /** 구간 e 의 차로 l 가운데선이 횡단보도 면 위를 지나는 구간 [s0, s1, s0, s1, ...](구간 시작에서 m) */
  xw(e: number, l: number): Float32Array;
  /** 구간 e 의 어느 차로든 횡단보도 면 위를 지나는 구간을 합친 것(차로를 바꾸는 이음매 곡선 위 차도 덮는다) */
  xwAll(e: number): Float32Array;
}

/** 정지선을 찾는 범위: 구간 끝에서 46m 안(차선이 끝나는 자리를 알면 그 6m 뒤까지) */
const REACH = 46;
/** 앞 범퍼를 칠한 정지선(폭 0.45m)의 가운데에서 이만큼 뒤에 둔다 */
const BEHIND = 0.3;
const STEP = 0.5;

export function laneStops(edges: Edge[], stopLines: ArrayLike<number>, crosswalks: Crosswalk[]): LaneStops {
  const C = 20;
  const key = (x: number, z: number) => Math.floor(x / C) * 100003 + Math.floor(z / C);
  // 정지선 선분 격자
  const lineGrid = new Map<number, number[]>();
  for (let k = 0; k + 3 < stopLines.length; k += 4) {
    const [ax, az, bx, bz] = [stopLines[k], stopLines[k + 1], stopLines[k + 2], stopLines[k + 3]];
    for (let gx = Math.floor(Math.min(ax, bx) / C); gx <= Math.floor(Math.max(ax, bx) / C); gx++)
      for (let gz = Math.floor(Math.min(az, bz) / C); gz <= Math.floor(Math.max(az, bz) / C); gz++) {
        const kk = gx * 100003 + gz;
        (lineGrid.get(kk) ?? lineGrid.set(kk, []).get(kk)!).push(k);
      }
  }
  // 횡단보도 면 격자
  const rings = crosswalks.flatMap((c) => c.rings);
  const ringGrid = new Map<number, number[]>();
  rings.forEach((r, i) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < r.length; k += 2) (x0 = Math.min(x0, r[k])), (x1 = Math.max(x1, r[k])), (z0 = Math.min(z0, r[k + 1])), (z1 = Math.max(z1, r[k + 1]));
    for (let gx = Math.floor(x0 / C); gx <= Math.floor(x1 / C); gx++)
      for (let gz = Math.floor(z0 / C); gz <= Math.floor(z1 / C); gz++) {
        const kk = gx * 100003 + gz;
        (ringGrid.get(kk) ?? ringGrid.set(kk, []).get(kk)!).push(i);
      }
  });
  const inRing = (r: Float32Array, x: number, z: number) => {
    let c = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < r[i] + ((z - r[i + 1]) / (r[j + 1] - r[i + 1])) * (r[j] - r[i])) c = !c;
    return c;
  };
  const onCrosswalk = (x: number, z: number) => (ringGrid.get(key(x, z)) ?? []).some((i) => inRing(rings[i], x, z));

  const backs = new Float32Array(edges.length * 8).fill(-1);
  const spans: Float32Array[] = new Array(edges.length * 8);
  const EMPTY = new Float32Array(0);
  const P = [0, 0, 0];
  const fromStart: [number, number][] = [];
  for (const e of edges) {
    const lanes = [...Array.from({ length: e.lanes }, (_, l) => l), ...(e.med ? [MED] : [])];
    for (const l of lanes) {
      // 차로 가운데선 점들
      const n = Math.max(1, Math.ceil(e.len / STEP));
      const xs = new Float32Array(n + 1);
      const zs = new Float32Array(n + 1);
      for (let k = 0; k <= n; k++) {
        const s = Math.min(e.len, k * STEP);
        pointAt(e.p, e.cum, s, P);
        const h = headingNear(e, s);
        const off = laneOff(e, l, s);
        xs[k] = P[0] - Math.sin(h) * off;
        zs[k] = P[2] + Math.cos(h) * off;
      }
      // 횡단보도 면 위 구간
      const sp: number[] = [];
      let open = -1;
      for (let k = 0; k <= n; k++) {
        const on = onCrosswalk(xs[k], zs[k]);
        if (on && open < 0) open = k;
        if ((!on || k === n) && open >= 0) {
          sp.push(Math.max(0, open * STEP - STEP / 2), Math.min(e.len, (on ? k : k - 1) * STEP + STEP / 2));
          open = -1;
        }
      }
      spans[e.id * 8 + l] = sp.length ? Float32Array.from(sp) : EMPTY;
      // 정지 자리: 구간 끝에 가장 가까운 정지선, 없으면 가장 가까운 횡단보도 면의 바깥 변 1m 앞
      const sMax = e.lb >= 0 ? Math.min(e.len, e.lb + 6) : e.len;
      const k0 = Math.max(0, Math.floor((e.len - REACH) / STEP));
      const k1 = Math.min(n, Math.floor(sMax / STEP));
      let best = -1;
      for (let k = k1 - 1; k >= k0 && best < 0; k--) {
        const [ax, az, bx, bz] = [xs[k], zs[k], xs[k + 1], zs[k + 1]];
        for (const q of new Set([...(lineGrid.get(key(ax, az)) ?? []), ...(lineGrid.get(key(bx, bz)) ?? [])])) {
          const [cx, cz, dx, dz] = [stopLines[q], stopLines[q + 1], stopLines[q + 2], stopLines[q + 3]];
          const rx = bx - ax, rz = bz - az, ux = dx - cx, uz = dz - cz;
          const den = rx * uz - rz * ux;
          if (Math.abs(den) < 1e-9) continue;
          // 진행 방향을 가로지르는 정지선만(진행 방향과 53° 넘게 기운 것)
          if (Math.abs(rx * ux + rz * uz) / (Math.hypot(rx, rz) * Math.hypot(ux, uz) || 1) > 0.6) continue;
          const t = ((cx - ax) * uz - (cz - az) * ux) / den;
          const u = ((cx - ax) * rz - (cz - az) * rx) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          best = Math.max(best, (k + t) * STEP);
        }
      }
      if (best >= 0) backs[e.id * 8 + l] = e.len - Math.max(0, best - BEHIND);
      else
        for (let j = sp.length - 2; j >= 0; j -= 2)
          if (sp[j] >= e.len - REACH && sp[j] <= sMax) {
            backs[e.id * 8 + l] = e.len - (sp[j] - 1);
            if (sp[j] <= STEP) fromStart.push([e.id, l]);
            break;
          }
    }
  }
  // 횡단보도가 앞 구간 끝에서 시작해 이 구간 시작까지 걸친 곳(길 조각이 횡단보도에서 끊긴 자리): 정지 자리는 앞 구간의 횡단보도 바깥 변 1m 앞이다.
  // 구간 끝에서 거리가 이 구간 길이보다 커진다(앞 구간에서 다음 구간 신호를 미리 보는 차가 그 자리에 선다)
  const prev: number[][] = edges.map(() => []);
  for (const e of edges) for (const k of e.next) prev[k].push(e.id);
  for (const [id, l] of fromStart) {
    const e = edges[id];
    for (const pid of prev[id]) {
      const p = edges[pid];
      if (p.next.length !== 1) continue;
      for (let lp = 0; lp < p.lanes; lp++) {
        if (Math.min(e.lanes - 1, Math.floor(lanePos(p, e, lp + 0.5))) !== l) continue;
        const sp = spans[pid * 8 + lp];
        if (sp.length && sp[sp.length - 1] >= p.len - STEP && sp[sp.length - 2] > STEP) backs[id * 8 + l] = Math.max(backs[id * 8 + l], e.len + p.len - (sp[sp.length - 2] - 1));
      }
    }
  }
  const all = edges.map((e) => {
    const list: [number, number][] = [];
    for (let l = 0; l < e.lanes; l++) {
      const sp = spans[e.id * 8 + l];
      for (let q = 0; q < sp.length; q += 2) list.push([sp[q], sp[q + 1]]);
    }
    list.sort((a, b) => a[0] - b[0]);
    const out: number[] = [];
    for (const [a, b] of list) {
      if (out.length && a <= out[out.length - 1] + 0.6) out[out.length - 1] = Math.max(out[out.length - 1], b);
      else out.push(a, b);
    }
    return out.length ? Float32Array.from(out) : EMPTY;
  });
  return {
    xwAll: (e) => all[e],
    back: (e, l) => backs[e * 8 + Math.min(7, Math.max(0, l))],
    xw: (e, l) => spans[e * 8 + Math.min(7, Math.max(0, l))] ?? EMPTY,
  };
}
