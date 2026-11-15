// 돌발정보(사고·공사·통제)를 차 구간에 붙인다. 실시간 도로 속도에는 사고로 생긴 정체가 이미 들어 있으므로 속도를 낮추지 않고,
// 사고·공사는 그 자리 차로 하나를 막고(차가 옆 차로로 비켜 간다), 통제는 그 둘레 구간에 차를 들이지 않는다.
// 막힌 차로 옆을 지나는 차는 앞뒤 25m 에서 5m/s 까지 늦추고(좁아진 자리를 조심해 지난다), 차로가 하나뿐인 길은 막으면 길이 끊기므로 3m/s 로 지나가게 한다.
import { headingAt, pointAt } from '../poly.ts';
import type { Edge } from './graph.ts';

export interface Incident {
  id: string;
  /** 유형(교통사고·공사·행사 등) */
  kind: string;
  detail: string;
  info: string;
  start: string;
  end: string;
  /** 판 좌표(m) */
  x: number;
  z: number;
  /** close: 통제(구간에 차를 들이지 않음), lane: 한 차로 막기 */
  effect: 'close' | 'lane';
}

/** 통제인가 한 차로 막기인가. 전면통제·행사·집회·시위·통제는 통제, 나머지(사고·공사·고장·낙하물)는 한 차로 막기 */
export function effectOf(kind: string, detail: string, info: string): 'close' | 'lane' {
  if (/행사|집회|시위|통제/.test(kind) || /행사|집회|시위/.test(detail)) return 'close';
  return /전면\s*통제|전면통제|양방향\s*통제/.test(info) ? 'close' : 'lane';
}

export interface IncidentSpot {
  id: string;
  edge: number;
  /** 구간 위 거리(m) */
  s: number;
  /** 막은 차로(통제·서행이면 −1) */
  lane: number;
  effect: 'close' | 'lane';
}

const REACH = 30;
const tmp = [0, 0, 0];

/** 점 (x, z)를 구간 e 에 비춘 자리: 구간 위 거리, 오른쪽으로 떨어진 거리, 중심선까지 거리 */
function project(e: Edge, x: number, z: number): { s: number; right: number; d: number } {
  let best = { s: 0, right: 0, d: Infinity };
  for (let k = 0; k + 3 < e.p.length; k += 3) {
    const x0 = e.p[k];
    const z0 = e.p[k + 2];
    const dx = e.p[k + 3] - x0;
    const dz = e.p[k + 5] - z0;
    const L = Math.hypot(dx, dz) || 1;
    const u = Math.max(0, Math.min(L, ((x - x0) * dx + (z - z0) * dz) / L));
    const px = x0 + (dx / L) * u;
    const pz = z0 + (dz / L) * u;
    const d = Math.hypot(x - px, z - pz);
    // 진행 방향 (dx, dz)의 오른쪽은 (−dz, dx)
    if (d < best.d) best = { s: e.cum[k / 3] + u, right: ((x - px) * -dz + (z - pz) * dx) / L, d };
  }
  return best;
}

/** 돌발 목록을 차 구간에 붙인다: 막을 차로, 통제할 구간, 서행 지점, 그릴 자리 */
export function matchIncidents(edges: Edge[], list: Incident[]) {
  const blocks: { edge: number; lane: number; at: number }[] = [];
  const close = new Set<number>();
  const slow: { edge: number; at: number; v: number }[] = [];
  const spots: IncidentSpot[] = [];
  for (const q of list) {
    if (q.effect === 'close') {
      for (const e of edges) {
        const p = project(e, q.x, q.z);
        if (p.d >= REACH || close.has(e.id)) continue;
        close.add(e.id);
        spots.push({ id: q.id, edge: e.id, s: p.s, lane: -1, effect: 'close' });
      }
      continue;
    }
    // 가장 가까운 차로: 구간마다 그 자리의 차로 가운데까지 거리로 고른다(양방향 길은 두 구간이 같은 중심선을 쓴다)
    let best: { e: Edge; s: number; lane: number; d: number } | null = null;
    for (const e of edges) {
      const p = project(e, q.x, q.z);
      if (p.d >= REACH) continue;
      const lane = Math.max(0, Math.min(e.lanes - 1, Math.round((p.right - e.off0) / e.lw)));
      const d = Math.hypot(p.right - (e.off0 + lane * e.lw), Math.max(0, p.d - Math.abs(p.right)));
      if (!best || d < best.d) best = { e, s: p.s, lane, d };
    }
    if (!best) continue;
    if (best.e.lanes >= 2) blocks.push({ edge: best.e.id, lane: best.lane, at: best.s });
    else slow.push({ edge: best.e.id, at: best.s, v: 3 });
    spots.push({ id: q.id, edge: best.e.id, s: best.s, lane: best.e.lanes >= 2 ? best.lane : -1, effect: 'lane' });
  }
  return { blocks, close: [...close], slow, spots };
}

/** 그릴 자리의 판 좌표와 진행 방향(차로 가운데, 통제·서행이면 차로들 가운데) */
export function spotXZ(e: Edge, sp: IncidentSpot): [number, number, number] {
  const seg = pointAt(e.p, e.cum, Math.min(e.len, Math.max(0, sp.s)), tmp);
  const yaw = headingAt(e.p, seg);
  const off = sp.lane >= 0 ? e.off0 + sp.lane * e.lw : e.off0 + ((e.lanes - 1) * e.lw) / 2;
  return [tmp[0] - Math.sin(yaw) * off, tmp[2] + Math.cos(yaw) * off, yaw];
}
