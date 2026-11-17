// 도로 조각 → 차가 달리는 방향 그래프(사람·고양이가 걷는 그래프는 walknet.ts).
// 구울 때 교차점마다 끊어 두었으므로 조각의 끝점끼리만 이어 주면 된다.
// 차로 자리는 길 정본의 차로(public/data/road.json, 굽기 tools/road.ts·src/sim/lanes.ts, 설계 문서 51절)를 그대로 따른다. 조각의 한 방향은 차로 수가 같은 구간마다
// 구간(Edge) 하나가 되고, 구간 안에서는 차로 가운데의 옆 거리가 길을 따라 바뀐다(차선이 휘거나 넓어지는 대로). 차로 수가 바뀌는 자리는 갈림 없는 이음매다.
// 서울시 선이 없는 길의 차로 자리도 굽기가 정한다(src/sim/lanes.ts).
import type { Road } from '../data/board.ts';
import { isCanon, type CanonLanes, type RoadLanes } from '../data/road.ts';
import { resolveLanes } from './lanes.ts';
import { BOARD_R } from '../geo.ts';
import { cumLen, pointAt } from '../poly.ts';


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
  /** 이 방향의 차로 수(차로 기하) */
  lanes: number;
  /** 도로 조각의 이 방향 차로 수(구운 판의 lf·lb). 교통량·경로 고르기·신호 시간·양보 순서는 고치기 전처럼 이 값으로 정한다 */
  vol: number;
  /** 차로 폭 대푯값(m): 이웃한 차로 가운데 사이의 중앙값. 길이나 폭을 어림할 때만 쓰고, 차로 자리는 st·lo 로 정한다 */
  lw: number;
  /** 차로 가운데 옆 거리 표: 구간 시작에서 st[k] m 자리마다 차로 l(0 이 왼쪽)의 가운데가 중심선에서 오른쪽으로 lo[k × lanes + l] m */
  st: Float32Array;
  lo: Float32Array;
  /** 차로를 서울시 선으로 읽지 못해 찻길 면 폭을 고르게 나눈 구간 */
  plain: boolean;
  /** 중앙버스차로 가운데 옆 거리(st 자리마다, 서울시 중앙버스전용차선으로 읽은 것). 비어 있으면 med 로 정한다 */
  mo: Float32Array;
  /** 차로 선이 시작하는 자리(교차로를 빠져나온 뒤, 구간 시작에서 m)와 끝나는 자리(교차로 앞). 모르면 −1 */
  la: number;
  lb: number;
  /** 이 구간이 도로 조각의 그 방향에서 시작하는 거리와 그 방향 전체 길이(m) */
  s0: number;
  full: number;
  next: number[];
  nextW: number[];
  /** next[j] 로 넘어갈 때 차로 l 이 맡는 다음 구간 차로 범위 [lmap[j][2l], lmap[j][2l+1]) */
  lmap: Int8Array[];
  /** 차로마다 노면 화살표로 갈 수 있는 쪽(1 좌회전, 2 직진, 4 우회전, 8 유턴 비트). 0 이면 화살표가 없다 */
  turns: Uint8Array;
  /** 판 가장자리에서 시작해 새 차가 들어오는 구간 */
  entry: boolean;
  name: string;
  /** 자료 공급자에게 넘기는 구간 고유값 */
  key: number;
  /** 원래 도로 조각 번호와, 저장된 방향을 거슬러 가는가 */
  road: number;
  rev: boolean;
  /** 가로변 버스전용차로(서울시 파란 버스전용차선이 그은 맨 오른쪽 차로)의 차로 번호. 없으면 −1. 버스만 달리고 일반 차는 들어가지 않는다 */
  bus: number;
  /** 중앙버스차로: 0 이면 없고, 아니면 일반 차로 왼쪽 가장자리에서 버스차로 가운데까지 거리(m, 구간 가운데 자리). 한 방향 큰길 왼쪽 분리대 안이다 */
  med: number;
}

const H0 = [0, 0, 0];
const H1 = [0, 0, 0];
/** 구간 e 의 s 지점 진행 방향. 꺾인 꼭짓점에서 방향과 차로 옆 거리가 한순간에 바뀌지 않게 앞뒤 1.5m 두 점으로 구한다.
 *  off 를 주면(그 자리 차로가 가운데선에서 떨어진 거리) 앞뒤 거리를 그 절반(최대 8m)까지 늘린다: 서울시 선으로 읽은 차로는 OSM 가운데선에서 10m 넘게 떨어진 곳이 있어,
 *  꼭짓점에서 방향이 1.5m 안에 바뀌면 옆으로 옮긴 차 자리가 옆 거리에 비례해 크게 휘둘린다 */
export function headingNear(e: Edge, s: number, off = 0): number {
  const d = Math.min(Math.max(1.5, Math.min(8, Math.abs(off) / 2)), e.len / 2);
  pointAt(e.p, e.cum, Math.max(0, s - d), H0);
  pointAt(e.p, e.cum, Math.min(e.len, s + d), H1);
  return Math.atan2(H1[2] - H0[2], H1[0] - H0[0]);
}


/** 표 st 위 s 자리를 [앞 칸, 비율]로 */
function cell(st: Float32Array, s: number): [number, number] {
  const m = st.length;
  if (m < 2 || s <= st[0]) return [0, 0];
  if (s >= st[m - 1]) return [m - 1, 0];
  let k = 0;
  while (st[k + 1] < s) k++;
  return [k, (s - st[k]) / (st[k + 1] - st[k] || 1)];
}

/** 구간 e 의 s 자리에서 l번 차로 가운데가 중심선에서 오른쪽으로 떨어진 거리(m). MED 는 중앙버스차로 */
export function laneOff(e: Edge, l: number, s: number): number {
  if (l === MED) return e.mo.length ? lerp(e.st, e.mo, 1, 0, s) : leftEdge(e, s) - e.med;
  return lerp(e.st, e.lo, e.lanes, Math.min(Math.max(0, l), e.lanes - 1), s);
}
function lerp(st: Float32Array, v: Float32Array, n: number, l: number, s: number): number {
  const [k, t] = cell(st, s);
  return t ? v[k * n + l] + (v[(k + 1) * n + l] - v[k * n + l]) * t : v[k * n + l];
}
/** s 자리 l번 차로의 폭(m): 이웃 차로 가운데까지 거리(차로가 하나면 대푯값) */
export function laneWidth(e: Edge, l: number, s: number): number {
  if (e.lanes < 2) return e.lw;
  const k = Math.min(Math.max(0, l), e.lanes - 1);
  return k + 1 < e.lanes ? laneOff(e, k + 1, s) - laneOff(e, k, s) : laneOff(e, k, s) - laneOff(e, k - 1, s);
}
/** s 자리 일반 차로들의 왼쪽·오른쪽 가장자리(중심선에서 오른쪽으로 m) */
export function leftEdge(e: Edge, s: number): number {
  return lerp(e.st, e.lo, e.lanes, 0, s) - laneWidth(e, 0, s) / 2;
}
export function rightEdge(e: Edge, s: number): number {
  return laneOff(e, e.lanes - 1, s) + laneWidth(e, e.lanes - 1, s) / 2;
}
/** s 자리 중앙버스차로 가운데가 일반 차로 왼쪽 가장자리에서 떨어진 거리(m) */
export const medAt = (e: Edge, s: number) => (e.mo.length ? leftEdge(e, s) - lerp(e.st, e.mo, 1, 0, s) : e.med);

/** 구간 a 의 차로 위 자리 x(차로 번호 + 그 차로 안 자리 0~1)를 다음 구간 b 의 차로 위 자리로 옮긴다(lmap 표) */
export function lanePos(a: Edge, b: Edge, x: number): number {
  const j = a.next.indexOf(b.id);
  if (j < 0) return (x * b.lanes) / a.lanes;
  const t = a.lmap[j];
  const la = Math.min(a.lanes - 1, Math.max(0, Math.floor(x)));
  const f = Math.min(1, Math.max(0, x - la));
  return t[la * 2] + f * (t[la * 2 + 1] - t[la * 2]);
}

/** 차로 수 na 에서 nb 로 비율대로(늘면 들어온 차로마다 정수 개씩, 줄면 비율대로 합친다) */
function spreadMap(na: number, nb: number): Int8Array {
  const t = new Int8Array(na * 2);
  for (let l = 0; l < na; l++) {
    if (nb <= na) {
      const k = Math.min(nb - 1, Math.floor(((l + 0.5) * nb) / na));
      t[l * 2] = k;
      t[l * 2 + 1] = k + 1;
    } else {
      t[l * 2] = Math.floor((l * nb) / na);
      t[l * 2 + 1] = Math.floor(((l + 1) * nb) / na);
    }
  }
  return t;
}
/** 차로 자리로 잇기: 다음 구간 차로마다 옆 거리가 가장 가까운 들어온 차로가 맡는다. 맡을 차로가 없는 들어온 차로(없어지는 차로)는 가장 가까운 다음 차로로 합친다 */
function nearMap(a: Edge, b: Edge): Int8Array {
  const A = Array.from({ length: a.lanes }, (_, l) => laneOff(a, l, a.len));
  const B = Array.from({ length: b.lanes }, (_, l) => laneOff(b, l, 0));
  const near = (v: number, list: number[]) => list.reduce((best, w, k) => (Math.abs(w - v) < Math.abs(list[best] - v) ? k : best), 0);
  const owner = B.map((v) => near(v, A));
  const t = new Int8Array(a.lanes * 2);
  for (let l = 0; l < a.lanes; l++) {
    const mine = owner.map((o, k) => (o === l ? k : -1)).filter((k) => k >= 0);
    const lo = mine.length ? mine[0] : near(A[l], B);
    const hi = mine.length ? mine[mine.length - 1] + 1 : lo + 1;
    t[l * 2] = lo;
    t[l * 2 + 1] = hi;
  }
  // 엇갈리지 않게(앞 차로 범위보다 앞서지 않게) 다듬는다
  for (let l = 1; l < a.lanes; l++) {
    t[l * 2] = Math.max(t[l * 2], t[l * 2 - 2]);
    t[l * 2 + 1] = Math.max(t[l * 2 + 1], t[l * 2] + 1);
  }
  return t;
}

/** 꺾은선 p 의 s0~s1 부분 */
function subLine(p: Float32Array, cum: Float32Array, s0: number, s1: number): Float32Array {
  if (s0 <= 0 && s1 >= cum[cum.length - 1]) return p;
  const tmp = [0, 0, 0];
  const out: number[] = [];
  pointAt(p, cum, s0, tmp);
  out.push(...tmp);
  for (let i = 1; i < cum.length - 1; i++) if (cum[i] > s0 + 0.05 && cum[i] < s1 - 0.05) out.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  pointAt(p, cum, s1, tmp);
  out.push(...tmp);
  return Float32Array.from(out);
}

/** 노면 화살표(src/data/marks.ts): 종류(A055_KND_CDE 번호), 자리, 가리키는 방향(단위 벡터) */
export interface Arrow {
  kind: number;
  x: number;
  z: number;
  fx: number;
  fz: number;
}
/** 화살표 종류 → 갈 수 있는 쪽(1 좌회전, 2 직진, 4 우회전, 8 유턴. 유턴은 꺾는 쪽도 함께 준다). 금지 표시·양보·오르막은 넣지 않는다 */
const ARROW_TURNS: Record<number, number> = { 5: 1, 6: 4, 7: 2, 8: 3, 9: 6, 10: 9, 11: 9, 13: 5, 14: 7, 15: 11, 20: 12 };
/** 차가 다니는 도로 조각인가: 등급 3 이하, 버스가 지나는 등급 5 이하(골목·진입로는 버스가 지나는 곳만 차가 다닌다) */
export const carRoad = (r: { cls: number; bus?: boolean; p: ArrayLike<number> }) => (r.cls <= 3 || (r.bus === true && r.cls <= 5)) && r.p.length >= 6;

/** 방향별 차로 표(dirs)로 차 그래프의 구간을 만든다(구간 하나 = 차로 수 구간 하나). 차로 표가 없는 방향은 만들지 않는다 */
export function makeEdges(roads: Road[], dirs: RoadLanes): Edge[] {
  const edges: Edge[] = [];
  roads.forEach((r, road) => {
    if (!carRoad(r)) return;
    for (const rev of r.oneway ? [false] : [false, true]) {
      let p = r.p;
      if (rev) {
        p = new Float32Array(r.p.length);
        for (let i = 0; i < r.p.length; i += 3) p.set(r.p.subarray(i, i + 3), r.p.length - 3 - i);
      }
      const cum = cumLen(p);
      const full = cum[cum.length - 1];
      const dir = dirs[road]?.[rev ? 1 : 0];
      if (!dir) continue;
      dir.runs.forEach((run, k) => {
        const s0 = k === 0 ? 0 : run.s0;
        const s1 = k === dir.runs.length - 1 ? full : run.s1;
        const q = subLine(p, cum, s0, s1);
        const qc = cumLen(q);
        const len = qc[qc.length - 1];
        const n = run.n;
        const gaps: number[] = [];
        for (let i = 0; i < run.st.length; i++) for (let l = 1; l < n; l++) gaps.push(run.off[i * n + l] - run.off[i * n + l - 1]);
        gaps.sort((x, y) => x - y);
        const inside = (v: number) => (v >= s0 - 0.01 && v <= s1 + 0.01 ? Math.min(len, Math.max(0, v - s0)) : -1);
        edges.push({
          id: edges.length,
          p: q,
          cum: qc,
          len,
          cls: r.cls,
          lanes: n,
          vol: Math.max(1, rev ? r.lb : r.lf),
          lw: run.lwv || (gaps.length ? gaps[gaps.length >> 1] : r.lw),
          st: Float32Array.from(run.st, (v) => v - s0),
          lo: Float32Array.from(run.off),
          plain: dir.read === false,
          mo: Float32Array.from(run.med),
          la: dir.a >= 0 && k === 0 ? inside(dir.a) : -1,
          lb: dir.b >= 0 && k === dir.runs.length - 1 ? inside(dir.b) : -1,
          s0,
          full,
          next: [],
          nextW: [],
          lmap: [],
          turns: new Uint8Array(n),
          entry: false,
          name: r.name,
          key: edges.length,
          road,
          rev,
          med: run.medv ?? (run.med.length || (r.oneway && r.medBus) ? 1 : 0),
          bus: (rev ? r.busL : r.busR) && n >= 2 ? n - 1 : -1,
        });
      });
    }
  });
    return edges;
}

/** 구간 끝점끼리 잇고(next·nextW·entry) 들어오는 구간 목록을 돌려준다 */
export function linkEdges(edges: Edge[]): number[][] {
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
      const o = edges[j];
      if (j === e.id || (o.road === e.road && o.rev !== e.rev)) continue; // 같은 길로 되돌아가기
      const sx = o.p[3] - o.p[0];
      const sz = o.p[5] - o.p[2];
      const straight = (ex * sx + ez * sz) / (el * (Math.hypot(sx, sz) || 1));
      e.next.push(j);
      // 직진에 가깝고, 같은 이름의 길이고, 넓을수록 많이 고른다
      e.nextW.push((((straight + 1) / 2) ** 3 + 0.02) * (e.name && e.name === o.name ? 2.5 : 1) * o.vol);
      hasIn.add(j);
    }
  }
  // 새 차는 판 가장자리에서 시작하는 구간으로만 들어온다(판 안에서 갑자기 나타나지 않게)
  for (const e of edges) e.entry = !hasIn.has(e.id) && Math.hypot(e.p[0], e.p[2]) > BOARD_R - 40;
    const prev: number[][] = edges.map(() => []);
  for (const e of edges) for (const k of e.next) prev[k].push(e.id);
  return prev;
}

/**
 * 차 그래프. lanes 가 정본(road.json, 굽기가 정한 최종 차로)이면 그대로 쓰고 실행 중에 차로 자리를 고치지 않는다.
 * 정본이 아니면(시험의 만든 길, 굽기) src/sim/lanes.ts resolveLanes 로 정본을 만든 뒤 쓴다
 */
export function buildCarGraph(roads: Road[], lanes?: RoadLanes | CanonLanes, arrows: Arrow[] = []): Edge[] {
  const canon = isCanon(lanes) ? lanes : resolveLanes(roads, lanes);
  const edges = makeEdges(roads, canon.dirs);
  const prev = linkEdges(edges);
  sinkTunnels(edges, prev, roads);
// 노면 화살표: 서울시 선으로 차로를 읽은 구간에서 차로가 끝나는 자리 앞 45m 안, 그 차로 가운데 반폭 안에 같은 방향으로 놓인 화살표
  const ag = new Map<number, number[]>();
  arrows.forEach((a, i) => {
    const k = Math.floor(a.x / 20) * 100003 + Math.floor(a.z / 20);
    (ag.get(k) ?? ag.set(k, []).get(k)!).push(i);
  });
  const P = [0, 0, 0];
  const Q = [0, 0, 0];
  for (const e of edges) {
    if (e.plain || !arrows.length) continue;
    const end = e.lb >= 0 ? e.lb : e.len;
    for (let d = Math.max(0, end - 45); d <= end + 2 && d <= e.len; d += 10) {
      pointAt(e.p, e.cum, d, P);
      for (let gx = -1; gx <= 1; gx++)
        for (let gz = -1; gz <= 1; gz++)
          for (const i of ag.get((Math.floor(P[0] / 20) + gx) * 100003 + Math.floor(P[2] / 20) + gz) ?? []) {
            const a = arrows[i];
            const m = ARROW_TURNS[a.kind];
            if (!m) continue;
            const s = Math.max(0, Math.min(e.len, d + (a.x - P[0]) * Math.cos(headingNear(e, d)) + (a.z - P[2]) * Math.sin(headingNear(e, d))));
            if (s < end - 45 || s > end + 2 || Math.abs(s - d) > 5) continue;
            const h = headingNear(e, s);
            if (a.fx * Math.cos(h) + a.fz * Math.sin(h) < 0.8) continue;
            pointAt(e.p, e.cum, s, Q);
            const lat = (a.x - Q[0]) * -Math.sin(h) + (a.z - Q[2]) * Math.cos(h);
            let best = -1;
            for (let l = 0; l < e.lanes; l++) if (Math.abs(lat - laneOff(e, l, s)) < laneWidth(e, l, s) / 2 && (best < 0 || Math.abs(lat - laneOff(e, l, s)) < Math.abs(lat - laneOff(e, best, s)))) best = l;
            if (best >= 0) e.turns[best] |= m;
          }
    }
  }
  setLaneMaps(edges, prev);
  return edges;
}

/** 차로 잇기: 갈림 없는 이음매(들어온 구간의 다음이 하나, 다음 구간에 들어오는 구간이 하나)는 차로 자리로, 교차로는 비율대로
 *  (교차로를 지나는 차는 src/sim/intersection/ 의 차로 경로가 나갈 차로를 정한다) */
export function setLaneMaps(edges: Edge[], prev: number[][]) {
  for (const a of edges)
    a.lmap = a.next.map((k) => {
      const b = edges[k];
      if (a.next.length === 1 && prev[k].length === 1) return nearMap(a, b);
      return spreadMap(a.lanes, b.lanes);
    });
}


/** 찻길 터널 깊이(m)와, 입구에서 그 깊이까지 내려가는 거리(m) */
const TUNNEL_DEPTH = 8;
const TUNNEL_RAMP = 30;
/**
 * 찻길 터널(지하차도·강변북로 지하 구간) 구간을 땅 밑으로 내린다. 구운 판은 터널을 땅 높이에 두어 그 위를 가로지르는 찻길 차와 같은 높이에서 겹쳐 보였다.
 * 입구(터널이 아닌 구간과 만나는 끝)에서 터널을 따라간 거리 d 에 대해 깊이 TUNNEL_DEPTH × smoothstep(d / TUNNEL_RAMP) 만큼 내리고(2m 마다 다시 찍는다),
 * 그리는 쪽은 땅 밑 2m 보다 깊은 차를 그리지 않는다(render/cars.ts). 차는 입구로 들어가며 사라지고 나오며 나타난다
 */
export function sinkTunnels(edges: Edge[], prev: number[][], roads: Road[]) {
  const tun = edges.map((e) => !!roads[e.road].tunnel);
  if (!tun.some((t) => t)) return;
  // 구간 시작·끝에서 가장 가까운 입구까지 터널을 따라간 거리
  const dIn = edges.map((e) => (tun[e.id] && prev[e.id].some((k) => tun[k]) ? Infinity : 0));
  const dOut = edges.map((e) => (tun[e.id] && e.next.some((k) => tun[k]) ? Infinity : 0));
  for (let pass = 0; pass < 20; pass++)
    for (const e of edges) {
      if (!tun[e.id]) continue;
      for (const k of prev[e.id]) if (tun[k]) dIn[e.id] = Math.min(dIn[e.id], dIn[k] + edges[k].len);
      for (const k of e.next) if (tun[k]) dOut[e.id] = Math.min(dOut[e.id], dOut[k] + edges[k].len);
    }
  const P = [0, 0, 0];
  for (const e of edges) {
    if (!tun[e.id]) continue;
    const n = Math.max(1, Math.ceil(e.len / 2));
    const p = new Float32Array((n + 1) * 3);
    const cum = new Float32Array(n + 1);
    for (let k = 0; k <= n; k++) {
      const s = (e.len * k) / n;
      pointAt(e.p, e.cum, s, P);
      const t = Math.min(1, Math.min(dIn[e.id] + s, dOut[e.id] + e.len - s) / TUNNEL_RAMP);
      p.set([P[0], P[1] - TUNNEL_DEPTH * t * t * (3 - 2 * t), P[2]], k * 3);
      cum[k] = s;
    }
    e.p = p;
    e.cum = cum;
  }
}

