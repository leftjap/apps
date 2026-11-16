// 도로 조각 → 차가 달리는 방향 그래프(사람·고양이가 걷는 그래프는 walknet.ts).
// 구울 때 교차점마다 끊어 두었으므로 조각의 끝점끼리만 이어 주면 된다.
// 차로 자리는 서울시 차선으로 구운 차로 가운데선(public/data/lanes.json, tools/lib/carlanes.ts)을 따른다. 조각의 한 방향은 차로 수가 같은 구간마다
// 구간(Edge) 하나가 되고, 구간 안에서는 차로 가운데의 옆 거리가 길을 따라 바뀐다(차선이 휘거나 넓어지는 대로). 차로 수가 바뀌는 자리는 갈림 없는 이음매다.
// 서울시 선이 없는 길은 지금까지처럼 OSM 가운데선에서 차로 수 × 차로 폭으로 펼친다.
import type { Road } from '../data/board.ts';
import type { DirLanes, RoadLanes } from '../data/lanes.ts';
import { BOARD_R } from '../geo.ts';
import { cumLen, headingAt, pointAt } from '../poly.ts';
import { BODY_HW, BUS_HW } from './bodies.ts';


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

/** 분리대 폭 gap 인 한 방향 큰길에서 일반 차로 왼쪽 가장자리부터 중앙버스차로 가운데까지(m). 서울시 선으로 읽지 못한 곳에 쓴다 */
const medOff = (gap: number) => 0.5 + Math.max(1.4, Math.min(1.75, gap / 4));

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

/** 서울시 선이 없는 방향: 지금까지처럼 OSM 가운데선에서 차로 수 × 차로 폭으로 펼친다(양방향 길은 가운데선 오른쪽, 한 방향 길은 가운데선을 가운데로) */
function plainDir(r: Road, rev: boolean, len: number): DirLanes {
  const n = Math.max(1, rev ? r.lb : r.lf);
  const left = r.oneway ? (-n * r.lw) / 2 : 0;
  const off = Array.from({ length: n }, (_, l) => left + (l + 0.5) * r.lw);
  return { a: -1, b: -1, runs: [{ s0: 0, s1: len, n, st: [0], off, med: [] }] };
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
/** 교차로에서 a 끝에서 b 시작으로 가는 쪽(1 좌, 2 직진, 4 우): a 에서 갈 수 있는 구간 가운데 75° 안으로 곧은 것 하나가 직진(같은 이름 길이 있으면 그 길,
 *  없으면 가장 곧은 것)이고, 나머지는 꺾는 쪽이다 */
export const turnOf = (a: Edge, b: Edge) => {
  const all = edgesOf(a);
  let best = -1;
  let bestKey = Infinity;
  for (const k of a.next) {
    const t = Math.abs(turnAngle(a, all[k]));
    if (t >= (5 * Math.PI) / 12) continue;
    const key = (a.name && all[k].name === a.name ? 0 : 10) + t;
    if (key < bestKey) (bestKey = key), (best = k);
  }
  if (b.id === best) return 2;
  return turnAngle(a, b) < 0 ? 1 : 4;
};
/** 구간 e 가 든 그래프의 구간 배열 */
const owner = new WeakMap<Edge, Edge[]>();
const edgesOf = (e: Edge) => owner.get(e)!;
/** 구간 e 의 차로 l(−1 이면 아무 차로)에 유턴 화살표가 있는가. 유턴은 서울시 노면 유턴 표시가 있는 차로에서만 한다 */
export const uTurnOk = (e: Edge, l: number) => (l < 0 ? e.turns.some((m) => (m & 8) !== 0) : (e.turns[Math.min(Math.max(0, l), e.lanes - 1)] & 8) !== 0);
/** 차로 l 에서 next 구간 b 로 갈 수 있는가: 그 차로에 화살표가 없거나 화살표가 그쪽을 가리킨다 */
export const turnAllowed = (a: Edge, b: Edge, l: number) => {
  const m = a.turns[Math.min(Math.max(0, l), a.lanes - 1)];
  return !m || (m & turnOf(a, b)) !== 0;
};

export function buildCarGraph(roads: Road[], lanes?: RoadLanes, arrows: Arrow[] = []): Edge[] {
  const edges: Edge[] = [];
  roads.forEach((r, road) => {
    // 골목·진입로는 버스가 지나는 곳만 차가 다닌다
    if ((r.cls > 3 && !(r.bus && r.cls <= 5)) || r.p.length < 6) return;
    for (const rev of r.oneway ? [false] : [false, true]) {
      let p = r.p;
      if (rev) {
        p = new Float32Array(r.p.length);
        for (let i = 0; i < r.p.length; i += 3) p.set(r.p.subarray(i, i + 3), r.p.length - 3 - i);
      }
      const cum = cumLen(p);
      const full = cum[cum.length - 1];
      const read = lanes?.[road]?.[rev ? 1 : 0];
      const dir = read ?? plainDir(r, rev, full);
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
          lw: gaps.length ? gaps[gaps.length >> 1] : r.lw,
          st: Float32Array.from(run.st, (v) => v - s0),
          lo: Float32Array.from(run.off),
          plain: !read,
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
          med: run.med.length || (r.oneway && r.medBus) ? 1 : 0,
        });
      });
    }
  });
  for (const e of edges) owner.set(e, edges);
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
  // 중앙버스정류장 자리에서는 분리대 쪽 경계가 버스전용차선이 아니라 승강장 연석이라 차선 자료로 중앙버스차로를 읽지 못한다.
  // 분리대가 있는 한 방향 큰길 조각이 같은 이름 길을 따라 앞뒤 네 조각 안에서 중앙버스차로와 이어지면 중앙버스차로로 잇는다
  const prev: number[][] = edges.map(() => []);
  for (const e of edges) for (const k of e.next) prev[k].push(e.id);
  const roadOf = edges.map((e) => roads[e.road]);
  const open = (e: Edge) => !e.med && roadOf[e.id].oneway && e.cls <= 3 && roadOf[e.id].gap > 1;
  // 같은 조각이 차로 수 구간으로 나뉜 구간은 한 조각으로 센다
  const reach = (e: Edge, step: (e: Edge) => number[], left: number): boolean =>
    step(e).some((k) => {
      const same = edges[k].road === e.road;
      return edges[k].name === e.name && (edges[k].med > 0 || ((left > 1 || same) && open(edges[k]) && reach(edges[k], step, same ? left : left - 1)));
    });
  // 앞뒤가 바로 중앙버스차로인 40m 미만 한 방향 조각(교차로 안 조각 등)은 이름·분리대와 상관없이 잇는다. 이은 조각이 다음 조각을 이을 수 있으므로 바뀌지 않을 때까지 되풀이한다
  const between = (e: Edge) => !e.med && roadOf[e.id].oneway && e.cls <= 3 && e.len < 40 && prev[e.id].some((k) => edges[k].med > 0) && e.next.some((k) => edges[k].med > 0);
  for (let pass = 0; pass < 4; pass++) {
    const fill = edges.filter((e) => (e.name && open(e) && reach(e, (q) => q.next, 4) && reach(e, (q) => prev[q.id], 4)) || between(e));
    if (!fill.length) break;
    for (const e of fill) e.med = 1;
  }
  // 중앙버스차로 자리: 서울시 선으로 읽은 구간은 그 자리, 아니면 분리대 폭으로 어림한다
  for (const e of edges) if (e.med) e.med = e.mo.length ? Math.max(0.5, medAt(e, e.len / 2)) : medOff(roadOf[e.id].gap);
  keepApart(edges, roadOf);
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
  // 차로 잇기: 갈림 없는 이음매(들어온 구간의 다음이 하나, 다음 구간에 들어오는 구간이 하나)는 차로 자리로, 교차로는 화살표가 가리키는 차로에서 꺾는 쪽 차로끼리 나란히
  for (const a of edges)
    a.lmap = a.next.map((k) => {
      const b = edges[k];
      if (a.next.length === 1 && prev[k].length === 1) return nearMap(a, b);
      return turnMap(a, b);
    });
  return edges;
}

/** 교차로에서 a 끝에서 b 시작으로 꺾는 각(오른쪽 +, 라디안) */
export function turnAngle(a: Edge, b: Edge): number {
  let t = headingNear(b, 0) - headingNear(a, a.len);
  while (t > Math.PI) t -= 2 * Math.PI;
  while (t < -Math.PI) t += 2 * Math.PI;
  return t;
}

/** 교차로 차로 잇기: 그쪽으로 갈 수 있는 차로(노면 화살표, 없으면 모든 차로)를 왼쪽으로 꺾으면 안쪽(왼쪽) 차로끼리, 오른쪽으로 꺾으면 바깥(오른쪽) 차로끼리 나란히 잇는다.
 *  곧게 가면 비율대로. 그쪽으로 갈 수 없는 차로는 가장 가까운 갈 수 있는 차로와 같은 곳으로 잇는다(서로 엇갈리지 않게) */
function turnMap(a: Edge, b: Edge): Int8Array {
  const t = turnAngle(a, b);
  const ok = Array.from({ length: a.lanes }, (_, l) => l).filter((l) => turnAllowed(a, b, l));
  const use = ok.length ? ok : Array.from({ length: a.lanes }, (_, l) => l);
  const na = use.length;
  const nb = b.lanes;
  let sub: Int8Array;
  if (Math.abs(t) < Math.PI / 6) sub = spreadMap(na, nb);
  else {
    sub = new Int8Array(na * 2);
    for (let l = 0; l < na; l++) {
      // 꺾는 쪽에서 센 차로 번호
      const k = t < 0 ? l : na - 1 - l;
      let lo = Math.min(k, nb - 1);
      let hi = lo + 1;
      // 들어온 차로가 적으면 꺾는 쪽에서 가장 먼 차로가 남은 차로를 맡는다
      if (na < nb && k === na - 1) hi = nb;
      if (t > 0) [lo, hi] = [nb - hi, nb - lo];
      sub[l * 2] = lo;
      sub[l * 2 + 1] = hi;
    }
  }
  const out = new Int8Array(a.lanes * 2);
  for (let l = 0; l < a.lanes; l++) {
    let j = 0;
    for (let q = 1; q < na; q++) if (Math.abs(use[q] - l) < Math.abs(use[j] - l)) j = q;
    out[l * 2] = sub[j * 2];
    out[l * 2 + 1] = sub[j * 2 + 1];
  }
  return out;
}

/** 멀리서 조금 키워 그린 차 몸통의 반폭(m): 가장 넓은 승용차·버스 × 1.15 */
const CAR_HALF = Math.max(...BODY_HW) * 1.15;
const BUS_HALF = Math.max(...BUS_HW) * 1.15;

/**
 * 마주 오는 두 한 방향 찻길: 서울시 선이 없어 찻길 면 폭으로 차로를 나눈 구간(교량 위 등)은 두 찻길의 차로가 포개지거나
 * 분리대가 좁아 중앙버스차로 버스가 건너편 찻길로 넘어가는 곳이 있다(선으로 읽은 차로는 칠한 자리 그대로라 포개지지 않는다).
 * 그런 한 방향 찻길마다 왼쪽에 마주 오는 다른 길의 한 방향 찻길이 있으면, 두 찻길 왼쪽 가장자리 사이(분리대, 포개지면 음수)가 가장 좁은 곳을 재고
 * 그 가운데보다 왼쪽으로 차 몸통이 넘어가지 않게 한다: 중앙버스차로는 버스를 일반 차로 쪽으로 붙이고, 그래도 모자라면
 * 오른쪽 가장자리는 그대로 둔 채 왼쪽 가장자리를 옮겨 차로를 좁힌다(차로 폭 2.4m 까지, 더 모자라면 찻길을 오른쪽으로 옮긴다).
 * 구간 양 끝 3m(교차로·이음매에서 두 찻길이 만나는 곳)와 높이가 2.5m 넘게 다른 찻길(고가도로 위아래)은 재지 않는다
 */
function keepApart(edges: Edge[], roadOf: Road[]) {
  const one = edges.filter((e) => roadOf[e.id].oneway);
  const C = 10;
  const key = (x: number, z: number) => Math.floor(x / C) * 100003 + Math.floor(z / C);
  const grid = new Map<number, number[]>(); // 칸마다 [구간, x, z, 방향, 높이, 가운데선에서 왼쪽 가장자리까지] 6개씩
  const P = [0, 0, 0];
  for (const e of one)
    for (let d = 0; d <= e.len; d += 2) {
      const seg = pointAt(e.p, e.cum, d, P);
      const k = key(P[0], P[2]);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(e.id, P[0], P[2], headingAt(e.p, seg), P[1], -leftEdge(e, d));
    }
  const gap = new Map<number, number>();
  for (const e of one) {
    if (!e.plain) continue;
    let G = Infinity;
    for (let d = 3; d <= e.len - 3; d += 4) {
      const seg = pointAt(e.p, e.cum, d, P);
      const h = headingAt(e.p, seg);
      const hx = Math.cos(h);
      const hz = Math.sin(h);
      const le = -leftEdge(e, d);
      for (let gx = -2; gx <= 2; gx++)
        for (let gz = -2; gz <= 2; gz++) {
          const l = grid.get(key(P[0] + gx * C, P[2] + gz * C));
          if (!l) continue;
          for (let k = 0; k < l.length; k += 6) {
            const o = edges[l[k]];
            if (o.road === e.road || Math.cos(l[k + 3] - h) > -0.85 || Math.abs(l[k + 4] - P[1]) > 2.5) continue;
            const dx = l[k + 1] - P[0];
            const dz = l[k + 2] - P[2];
            const lat = dx * hz - dz * hx; // 왼쪽이 +
            if (Math.abs(dx * hx + dz * hz) > 1.5 || lat <= 0 || lat > 25) continue;
            G = Math.min(G, lat - le - l[k + 5]);
          }
        }
    }
    if (G < Infinity) gap.set(e.id, G);
  }
  for (const [id, G] of gap) {
    const e = edges[id];
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
    const n = e.lanes;
    for (let k = 0; k < e.st.length; k++) {
      const w = laneWidth(e, 0, e.st[k]);
      const le = -(e.lo[k * n] - w / 2);
      const right = e.lo[k * n + n - 1] + w / 2;
      const lw = Math.max(2.4, Math.min(w, (right + le - need) / n));
      for (let l = 0; l < n; l++) e.lo[k * n + l] = -le + need + lw / 2 + l * lw;
    }
    e.lw = n > 1 ? e.lo[1] - e.lo[0] : e.lw;
  }
}
