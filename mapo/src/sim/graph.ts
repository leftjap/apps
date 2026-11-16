// 도로 조각 → 차가 달리는 방향 그래프(사람·고양이가 걷는 그래프는 walknet.ts).
// 구울 때 교차점마다 끊어 두었으므로 조각의 끝점끼리만 이어 주면 된다.
import { type Road } from '../data/board.ts';
import { BOARD_R } from '../geo.ts';
import { cumLen, headingAt, pointAt } from '../poly.ts';
import { BODY_HW, BUS_HW } from './bodies.ts';

/** 차선 자료가 없는 길의 차로 폭(m) */
export const LANE = 3.3;

/** 중앙버스차로를 달리는 버스의 차로 번호(일반 차로 번호와 겹치지 않는 값) */
export const MED = 7;
/** 중앙버스정류장 승강장 폭·길이(m)와, 버스가 서는 자리에서 승강장 가운데까지 뒤로 물린 거리(m). 버스 두 대가 함께 설 수 있다 */
export const ISLAND_W = 2.2;
export const ISLAND_L = 30;
export const ISLAND_BACK = 3;

/** 좌표(데시미터 정밀도)로 만든 노드 열쇠 */
const nodeKey = (x: number, z: number) => (Math.round(x * 10) + 40000) * 80001 + (Math.round(z * 10) + 40000);

export interface Edge {
  id: number;
  /** 진행 방향 순서의 중심선 [x,y,z,...] */
  p: Float32Array;
  cum: Float32Array;
  len: number;
  cls: number;
  /** 이 방향의 차로 수 */
  lanes: number;
  /** 차로 폭(m) */
  lw: number;
  /** 0번 차로 중심이 중심선에서 오른쪽으로 떨어진 거리. i번 차로는 off0 + i × lw */
  off0: number;
  next: number[];
  nextW: number[];
  /** 판 가장자리에서 시작해 새 차가 들어오는 구간 */
  entry: boolean;
  name: string;
  /** 자료 공급자에게 넘기는 구간 고유값 */
  key: number;
  /** 원래 도로 조각 번호와, 저장된 방향을 거슬러 가는가 */
  road: number;
  rev: boolean;
  /** 중앙버스차로: 0 이면 없고, 아니면 일반 차로 왼쪽 가장자리에서 버스차로 가운데까지 거리(m). 한 방향 큰길 왼쪽 분리대 안이다 */
  med: number;
}

const H0 = [0, 0, 0];
const H1 = [0, 0, 0];
/** 구간 e 의 s 지점 진행 방향. 꺾인 꼭짓점에서 방향과 차로 옆 거리가 한순간에 바뀌지 않게 앞뒤 1.5m 두 점으로 구한다 */
export function headingNear(e: Edge, s: number): number {
  const d = Math.min(1.5, e.len / 2);
  pointAt(e.p, e.cum, Math.max(0, s - d), H0);
  pointAt(e.p, e.cum, Math.min(e.len, s + d), H1);
  return Math.atan2(H1[2] - H0[2], H1[0] - H0[0]);
}

/** 분리대 폭 gap 인 한 방향 큰길에서 일반 차로 왼쪽 가장자리부터 중앙버스차로 가운데까지(m) */
const medOff = (gap: number) => 0.5 + Math.max(1.4, Math.min(1.75, gap / 4));

/** 구간 e 의 l번 차로 가운데가 중심선에서 오른쪽으로 떨어진 거리(중앙버스차로는 왼쪽이라 음수) */
export const laneOffset = (e: Edge, l: number) => (l === MED ? e.off0 - e.lw / 2 - e.med : e.off0 + l * e.lw);

export function buildCarGraph(roads: Road[]): Edge[] {
  const edges: Edge[] = [];
  const twin: number[] = [];
  const add = (r: Road, road: number, p: Float32Array, lanes: number, off0: number, rev: boolean, med = 0) => {
    const cum = cumLen(p);
    edges.push({ id: edges.length, p, cum, len: cum[cum.length - 1], cls: r.cls, lanes, lw: r.lw, off0, next: [], nextW: [], entry: false, name: r.name, key: edges.length, road, rev, med });
  };
  roads.forEach((r, road) => {
    // 골목·진입로는 버스가 지나는 곳만 차가 다닌다
    if ((r.cls > 3 && !(r.bus && r.cls <= 5)) || r.p.length < 6) return;
    if (r.oneway) {
      const lanes = Math.max(1, r.lf);
      // 중앙버스차로는 왼쪽 분리대의 이쪽 절반(찻길 가장자리 0.5m 밖부터 분리대 폭의 절반) 가운데.
      // 교차로 앞처럼 분리대가 좁아지는 곳도 버스가 차로를 오가지 않게 차로를 끊지 않는다(분리대가 좁으면 버스가 조금 걸친다)
      const med = r.medBus ? medOff(r.gap) : 0;
      add(r, road, r.p, lanes, (-(lanes - 1) / 2) * r.lw, false, med);
      twin.push(-1);
    } else {
      // 양방향 길의 가운데선은 중앙선 자리다. 방향마다 차로 수가 다를 수 있다
      const rev = new Float32Array(r.p.length);
      for (let i = 0; i < r.p.length; i += 3) rev.set(r.p.subarray(i, i + 3), r.p.length - 3 - i);
      add(r, road, r.p, Math.max(1, r.lf), r.lw / 2, false);
      add(r, road, rev, Math.max(1, r.lb), r.lw / 2, true);
      twin.push(edges.length - 1, edges.length - 2);
    }
  });
  const starts = new Map<number, number[]>();
  for (const e of edges) {
    const k = nodeKey(e.p[0], e.p[2]);
    (starts.get(k) ?? starts.set(k, []).get(k)!).push(e.id);
  }
  const hasIn = new Set<number>();
  for (const e of edges) {
    const n = e.p.length;
    const ex = e.p[n - 3] - e.p[n - 6];
    const ez = e.p[n - 1] - e.p[n - 4];
    const el = Math.hypot(ex, ez) || 1;
    for (const j of starts.get(nodeKey(e.p[n - 3], e.p[n - 1])) ?? []) {
      if (j === twin[e.id] || j === e.id) continue;
      const o = edges[j];
      const sx = o.p[3] - o.p[0];
      const sz = o.p[5] - o.p[2];
      const straight = (ex * sx + ez * sz) / (el * (Math.hypot(sx, sz) || 1));
      e.next.push(j);
      // 직진에 가깝고, 같은 이름의 길이고, 넓을수록 많이 고른다
      e.nextW.push((((straight + 1) / 2) ** 3 + 0.02) * (e.name && e.name === o.name ? 2.5 : 1) * o.lanes);
      hasIn.add(j);
    }
  }
  // 새 차는 판 가장자리에서 시작하는 구간으로만 들어온다(판 안에서 갑자기 나타나지 않게)
  for (const e of edges) e.entry = !hasIn.has(e.id) && Math.hypot(e.p[0], e.p[2]) > BOARD_R - 40;
  // 중앙버스정류장 자리에서는 분리대 쪽 경계가 버스전용차선이 아니라 승강장 연석이라 차선 자료로 중앙버스차로를 읽지 못한다.
  // 분리대가 있는 한 방향 큰길 조각이 같은 이름 길을 따라 앞뒤 네 조각 안에서 중앙버스차로와 이어지면 중앙버스차로로 잇는다
  const prev: number[][] = edges.map(() => []);
  for (const e of edges) for (const k of e.next) prev[k].push(e.id);
  const roadOf = edges.map((e) => roads[e.road]);
  const open = (e: Edge) => !e.med && roadOf[e.id].oneway && e.cls <= 3 && roadOf[e.id].gap > 1;
  const reach = (e: Edge, step: (e: Edge) => number[], left: number): boolean =>
    step(e).some((k) => edges[k].name === e.name && (edges[k].med > 0 || (left > 1 && open(edges[k]) && reach(edges[k], step, left - 1))));
  // 앞뒤가 바로 중앙버스차로인 40m 미만 한 방향 조각(교차로 안 조각 등)은 이름·분리대와 상관없이 잇는다. 이은 조각이 다음 조각을 이을 수 있으므로 바뀌지 않을 때까지 되풀이한다
  const between = (e: Edge) => !e.med && roadOf[e.id].oneway && e.cls <= 3 && e.len < 40 && prev[e.id].some((k) => edges[k].med > 0) && e.next.some((k) => edges[k].med > 0);
  for (let pass = 0; pass < 4; pass++) {
    const fill = edges.filter((e) => (e.name && open(e) && reach(e, (q) => q.next, 4) && reach(e, (q) => prev[q.id], 4)) || between(e));
    if (!fill.length) break;
    for (const e of fill) e.med = medOff(roadOf[e.id].gap);
  }
  keepApart(edges, roadOf);
  return edges;
}

/** 멀리서 조금 키워 그린 차 몸통의 반폭(m): 가장 넓은 승용차·버스 × 1.15 */
const CAR_HALF = Math.max(...BODY_HW) * 1.15;
const BUS_HALF = Math.max(...BUS_HW) * 1.15;

/**
 * 마주 오는 두 한 방향 찻길: 자료(가운데선·차로 수·차로 폭)에서 두 찻길의 차로가 포개지거나 분리대가 좁아 중앙버스차로 버스가 건너편 찻길로 넘어가는 곳이 있다.
 * 한 방향 찻길마다 왼쪽에 마주 오는 다른 길의 한 방향 찻길이 있으면, 두 찻길 왼쪽 가장자리 사이(분리대, 포개지면 음수)가 가장 좁은 곳을 재고
 * 그 가운데보다 왼쪽으로 차 몸통이 넘어가지 않게 한다: 중앙버스차로는 버스를 일반 차로 쪽으로 붙이고, 그래도 모자라면
 * 오른쪽 가장자리는 그대로 둔 채 왼쪽 가장자리를 옮겨 차로를 좁힌다(차로 폭 2.4m 까지, 더 모자라면 찻길을 오른쪽으로 옮긴다).
 * 구간 양 끝 3m(교차로·이음매에서 두 찻길이 만나는 곳)와 높이가 2.5m 넘게 다른 찻길(고가도로 위아래)은 재지 않는다
 */
function keepApart(edges: Edge[], roadOf: Road[]) {
  const one = edges.filter((e) => roadOf[e.id].oneway);
  const C = 10;
  const key = (x: number, z: number) => Math.floor(x / C) * 100003 + Math.floor(z / C);
  const grid = new Map<number, number[]>(); // 칸마다 [구간, x, z, 방향, 높이] 5개씩
  const P = [0, 0, 0];
  for (const e of one)
    for (let d = 0; d <= e.len; d += 2) {
      const seg = pointAt(e.p, e.cum, d, P);
      const k = key(P[0], P[2]);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(e.id, P[0], P[2], headingAt(e.p, seg), P[1]);
    }
  const left = (e: Edge) => e.lw / 2 - e.off0; // 가운데선에서 왼쪽 가장자리까지
  const gap = new Map<number, number>();
  for (const e of one) {
    let G = Infinity;
    for (let d = 3; d <= e.len - 3; d += 4) {
      const seg = pointAt(e.p, e.cum, d, P);
      const h = headingAt(e.p, seg);
      const hx = Math.cos(h);
      const hz = Math.sin(h);
      for (let gx = -2; gx <= 2; gx++)
        for (let gz = -2; gz <= 2; gz++) {
          const l = grid.get(key(P[0] + gx * C, P[2] + gz * C));
          if (!l) continue;
          for (let k = 0; k < l.length; k += 5) {
            const o = edges[l[k]];
            if (o.road === e.road || Math.cos(l[k + 3] - h) > -0.85 || Math.abs(l[k + 4] - P[1]) > 2.5) continue;
            const dx = l[k + 1] - P[0];
            const dz = l[k + 2] - P[2];
            const lat = dx * hz - dz * hx; // 왼쪽이 +
            if (Math.abs(dx * hx + dz * hz) > 1.5 || lat <= 0 || lat > 25) continue;
            G = Math.min(G, lat - left(e) - left(o));
          }
        }
    }
    if (G < Infinity) gap.set(e.id, G);
  }
  for (const [id, G] of gap) {
    const e = edges[id];
    const le = left(e);
    const room = G / 2 - 0.05; // 왼쪽 가장자리 밖으로 쓸 수 있는 거리(음수면 안쪽으로 비켜야 한다)
    let need = 0;
    if (e.med) {
      const near = BUS_HALF + CAR_HALF - e.lw / 2 + 0.3; // 버스가 1차로 차 몸통과 닿지 않는 가장 가까운 자리(굽은 길에서 비스듬해지는 몫 0.3m)
      const fit = room - BUS_HALF;
      if (fit >= near) e.med = Math.min(e.med, fit);
      else {
        e.med = near;
        need = near - fit;
      }
    } else need = Math.max(0, CAR_HALF - e.lw / 2 - room);
    if (need <= 0) continue;
    const right = e.off0 + (e.lanes - 0.5) * e.lw;
    e.lw = Math.max(2.4, Math.min(e.lw, (right + le - need) / e.lanes));
    e.off0 = -le + need + e.lw / 2;
  }
}
