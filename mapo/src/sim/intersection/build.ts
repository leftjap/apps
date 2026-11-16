// 교차로 구조(재작업 W20, 설계 문서 45절). 옛 junctions.ts·signals.ts 의 교차로 묶기·움직임·차로 잇기를 쓰지 않고 처음부터 정한다.
//  - 노드: 구간 끝점. 갈림이 없는 노드(들어온 구간마다 다음이 하나, 나가는 구간마다 들어오는 구간이 하나)는 이음매이고, 나머지는 교차로 노드다.
//  - 교차로 하나 = 교차로 노드 묶음: 상자가 2m 안으로 붙거나, 서로 다른 길이 만나는 큰길 노드끼리 35m 안이거나(분리대 있는 큰길의 한 교차로),
//    두 상자 사이 곧은 부분이 승용차 한 대도 못 설 만큼 짧으면 하나로 묶는다. 보행 신호 횡단보도에서 끊긴 이음매가 교차로 25m 안이면 그 교차로에 넣는다.
//    신호도 이 묶음 하나에 하나다(신호 묶음과 교차로 묶음이 다르지 않다).
//  - 진입로: 묶음 밖에서 묶음 안 노드로 들어오는 구간. 나가는 길: 묶음 안 노드에서 묶음 밖 노드로 가는 구간. 진입로마다 묶음 안을 따라가 닿는 나가는 길과 그 움직임(좌·직·우·유턴).
//  - 차로마다 허용 움직임: 노면 화살표, 없으면 맨 왼쪽 차로 좌회전, 맨 오른쪽 차로 우회전, 직진은 어느 차로나(그쪽 화살표를 그은 차로가 따로 있으면 그 차로만).
//  - 차로 경로: 진입로 차로 끝(상자 가장자리)에서 나가는 길 차로 시작까지 잇는 고정 곡선 하나. 차는 교차로 안에서 이 경로만 따라가고 차로를 바꾸지 않는다.
//  - 게이트: 차로마다 차가 서는 자리(정지선과 상자 가장자리 가운데 교차로에서 먼 쪽). 차는 게이트에서만 교차로에 들어갈지 정한다.
import type { Crosswalk } from '../../data/board.ts';
import { pointAt } from '../../poly.ts';
import { headingNear, laneOff, leftEdge, MED, rightEdge, type Edge } from '../graph.ts';
import { laneStops, type LaneStops } from '../stops.ts';

/** 움직임 비트(노면 화살표 비트와 같다) */
export const LEFT = 1;
export const STRAIGHT = 2;
export const RIGHT = 4;
export const UTURN = 8;

const D2R = Math.PI / 180;
/** 서로 다른 길이 만나는 큰길 노드를 한 교차로로 묶는 거리(m) */
const JOIN = 35;
/** 경로 점 간격(구간을 따라 잰 거리, m) */
export const STEP = 0.5;
/** 두 경로가 이만큼(m) 안으로 다가오면 부딪는다(버스 반폭 1.245 + 승용차 반폭 0.93 + 여유) */
const NEAR = 2.6;

export const nodeKey = (x: number, z: number) => `${Math.round(x * 10)},${Math.round(z * 10)}`;
const wrap = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};
const halfWidth = (e: Edge) => Math.max(Math.abs(leftEdge(e, 0)), Math.abs(rightEdge(e, 0)), Math.abs(leftEdge(e, e.len)), Math.abs(rightEdge(e, e.len)));

/** 진입로에서 나가는 길 하나 */
export interface Exit {
  /** 진입로부터 나가는 길까지 구간 열 */
  edges: number[];
  move: number;
}

/** 차로 경로: 진입로 a 의 차로 lane 에서 나가는 길 exit 의 차로 out 까지 */
export interface LanePath {
  id: number;
  /** 교차로 번호 */
  j: number;
  a: number;
  lane: number;
  /** 진입로의 몇 번째 나가는 길인가 */
  k: number;
  move: number;
  edges: number[];
  /** 구간마다 달릴 차로 */
  lanes: number[];
  /** 구간 edges[k] 의 0m 자리가 경로 위 거리 d 로 얼마인가(경로 위 거리 0 = 진입로 상자 가장자리) */
  base: Float32Array;
  /** 경로 끝(나가는 길 상자 가장자리)의 d */
  end: number;
  /** STEP 간격 점 [x, y, z, 방향] */
  pts: Float32Array;
  /** 게이트 뒤부터 나가는 길 상자 끝 12m 까지 차 몸통이 지나는 횡단보도 */
  xw: number[];
}

export interface Junction {
  id: number;
  x: number;
  z: number;
  nodes: Set<string>;
  /** 진입로 구간들 */
  into: number[];
}

export interface Intersections {
  edges: Edge[];
  list: Junction[];
  /** 구간 끝 노드가 속한 교차로(없으면 −1) */
  jEnd: Int32Array;
  /** 구간 시작 노드가 속한 교차로 */
  jStart: Int32Array;
  /** 구간 끝 쪽·시작 쪽 상자 가장자리까지(m). 교차로와 이음매 모두 */
  rIn: Float32Array;
  rOut: Float32Array;
  /** 진입로 구간 → 나가는 길 목록 */
  exits: Map<number, Exit[]>;
  /** 진입로 a 의 차로 l(MED 포함)이 할 수 있는 움직임 비트 */
  laneMoves(a: number, l: number): number;
  /** 진입로 a 의 차로 l 게이트: 구간 끝에서 거리(m, 구간 길이보다 클 수 있다) */
  gate(a: number, l: number): number;
  /** 진입로 a 의 차로 l 에서 k번째 나가는 길로 가는 경로(그 차로가 그 움직임을 못 하면 undefined) */
  path(a: number, l: number, k: number): LanePath | undefined;
  /** 차로 허용과 상관없이 만든 경로(노선이 정해진 버스가 맞는 차로로 옮기지 못했을 때만) */
  pathAny(a: number, l: number, k: number): LanePath | undefined;
  paths: LanePath[];
  /** 두 경로가 부딪는가(같은 차로에서 출발해 갈라지는 앞부분은 빼고, 같은 차로로 모이면 부딪는다) */
  conflict(p: number, q: number): boolean;
  /** 진입로 a 에서 신호·표지가 금하는 움직임(ban)과, 유턴 표지가 있어 유턴 화살표가 없어도 맨 왼쪽 차로에서 유턴할 수 있는가(신호를 정할 때 경로를 만들기 전에 정한다) */
  setRules(a: number, ban: number, uturnSign: boolean): void;
  /** 진입로 a 에서 나가는 길 x 로의 움직임 */
  moveOf(a: number, x: number): number;
  /** 이음매·상자 곡선 위 점: a 의 차로 la 끝 상자에서 b 의 차로 lb 로, a 상자 가장자리에서 d(m) 간 자리 → out [x, y, z, 방향] */
  curve(a: Edge, b: Edge, la: number, lb: number, d: number, out: number[]): void;
  stops: LaneStops;
}

export function buildIntersections(edges: Edge[], crosswalks: Crosswalk[] = [], stopLines: ArrayLike<number> = []): Intersections {
  // ── 노드 ──
  const ix = new Map<string, number>();
  const nx: number[] = [];
  const nz: number[] = [];
  const node = (x: number, z: number) => {
    const k = nodeKey(x, z);
    let n = ix.get(k);
    if (n === undefined) {
      ix.set(k, (n = nx.length));
      nx.push(x);
      nz.push(z);
    }
    return n;
  };
  const endN = edges.map((e) => node(e.p[e.p.length - 3], e.p[e.p.length - 1]));
  const startN = edges.map((e) => node(e.p[0], e.p[2]));
  const N = nx.length;
  const ins: number[][] = Array.from({ length: N }, () => []);
  const outs: number[][] = Array.from({ length: N }, () => []);
  for (const e of edges) {
    ins[endN[e.id]].push(e.id);
    outs[startN[e.id]].push(e.id);
  }
  const preds = new Int32Array(edges.length);
  for (const e of edges) for (const k of e.next) preds[k]++;
  const pass = (n: number) => ins[n].every((i) => edges[i].next.length <= 1) && outs[n].every((i) => preds[i] <= 1);
  /** 차로 수가 바뀌는 이음매 */
  const laneSeam = (n: number) => ins[n].some((i) => edges[i].next.some((k) => edges[k].lanes !== edges[i].lanes));

  // ── 상자 크기 ──
  const r = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    if (pass(n)) {
      let shift = 0;
      for (const i of ins[n]) for (const k of edges[i].next) shift = Math.max(shift, Math.abs(edges[i].lanes - edges[k].lanes) * edges[k].lw);
      r[n] = 3 + 1.5 * shift;
    } else r[n] = Math.max(2, ...[...ins[n], ...outs[n]].map((i) => halfWidth(edges[i]))) + 1;
  }

  // ── 묶기 ──
  const parent = Array.from({ length: N }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const unite = (a: number, b: number) => (parent[find(a)] = find(b));
  const C = 40;
  const grid = new Map<string, number[]>();
  for (let n = 0; n < N; n++) {
    const k = `${Math.floor(nx[n] / C)},${Math.floor(nz[n] / C)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(n);
  }
  const around = (n: number, f: (m: number) => void) => {
    const cx = Math.floor(nx[n] / C);
    const cz = Math.floor(nz[n] / C);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const m of grid.get(`${cx + dx},${cz + dz}`) ?? []) if (m !== n) f(m);
  };
  const dist = (a: number, b: number) => Math.hypot(nx[a] - nx[b], nz[a] - nz[b]);
  /** 서로 다른 길 둘 이상이 큰길(등급 3 이하)로 들어오는 노드 */
  const cross = (n: number) => !pass(n) && new Set(ins[n].filter((i) => edges[i].cls <= 3).map((i) => edges[i].road)).size >= 2;
  for (let n = 0; n < N; n++) {
    if (pass(n)) continue;
    around(n, (m) => {
      if (pass(m)) return;
      if (dist(n, m) < r[n] + r[m] + 2 || (cross(n) && cross(m) && dist(n, m) < JOIN)) unite(n, m);
    });
  }
  // 보행 신호 횡단보도 꼭짓점(굽기에서 길 조각을 끊은 자리)이 교차로 노드 25m 안이면 그 교차로에 넣는다
  const xwNode = new Set<number>();
  for (const c of crosswalks) if (c.sig) for (let k = 0; k < c.verts.length; k += 2) {
    const n = ix.get(nodeKey(c.verts[k], c.verts[k + 1]));
    if (n !== undefined) xwNode.add(n);
  }
  const joinPass = (n: number) => {
    if (!pass(n) || (laneSeam(n) && !xwNode.has(n))) return;
    let best = -1;
    let bd = Infinity;
    around(n, (m) => {
      if (pass(m)) return;
      const d = dist(n, m);
      // 횡단보도 꼭짓점은 상자 가장자리에서 25m 안(큰 교차로는 횡단보도가 노드에서 40m 넘게 떨어진다)
      const lim = xwNode.has(n) ? r[m] + 25 : r[n] + r[m] + 2;
      if (d < lim && d < bd) (bd = d), (best = m);
    });
    if (best >= 0) unite(n, best);
  };
  for (let n = 0; n < N; n++) joinPass(n);
  // 묶음 번호(교차로 노드가 하나라도 든 묶음만)
  const root = new Int32Array(N).fill(-1);
  const hasFork = new Set<number>();
  for (let n = 0; n < N; n++) if (!pass(n)) hasFork.add(find(n));

  // ── 상자 가장자리(구간 끝마다) ──
  const inJ = (n: number) => hasFork.has(find(n));
  const rIn = new Float32Array(edges.length);
  const rOut = new Float32Array(edges.length);
  // 교차로 쪽 끝은 서울시 차선이 끝나는(시작하는) 자리, 모르면 노드 상자. 비스듬히 만나 다른 길 차로와 겹치는 동안은 늘린다
  const P = [0, 0, 0];
  const Q = [0, 0, 0];
  const reach = new Float32Array(edges.length * 2);
  for (let n = 0; n < N; n++) {
    if (pass(n)) continue;
    const list = [...ins[n].map((id) => ({ id, end: 1 })), ...outs[n].map((id) => ({ id, end: 0 }))];
    for (let a = 0; a < list.length; a++)
      for (let b = a + 1; b < list.length; b++) {
        const ea = edges[list[a].id];
        const eb = edges[list[b].id];
        if (ea.road === eb.road) continue;
        const ha = list[a].end ? headingNear(ea, ea.len) + Math.PI : headingNear(ea, 0);
        const hb = list[b].end ? headingNear(eb, eb.len) + Math.PI : headingNear(eb, 0);
        if (list[a].end !== list[b].end && Math.cos(ha - hb) > Math.cos(15 * D2R)) continue; // 분리대 양쪽
        const w = halfWidth(ea) + halfWidth(eb);
        let over = 0;
        for (let d = 1; d <= 30; d++) {
          pointAt(ea.p, ea.cum, list[a].end ? ea.len - d : d, P);
          pointAt(eb.p, eb.cum, list[b].end ? eb.len - d : d, Q);
          if (Math.hypot(P[0] - Q[0], P[2] - Q[2]) < w - 0.5) over = d;
        }
        if (!over) continue;
        const ka = list[a].id * 2 + (list[a].end ? 0 : 1);
        const kb = list[b].id * 2 + (list[b].end ? 0 : 1);
        reach[ka] = Math.max(reach[ka], over + 1);
        reach[kb] = Math.max(reach[kb], over + 1);
      }
  }
  // 이음매가 꺾이면 안쪽 차로 곡선이 뒤로 돌지 않게 늘린다
  const laneW = (e: Edge, s: number) => Math.max(Math.abs(laneOff(e, 0, s)), Math.abs(laneOff(e, e.lanes - 1, s)));
  for (const a of edges)
    for (const k of a.next) {
      if (!pass(endN[a.id])) continue;
      const b = edges[k];
      const t = Math.abs(wrap(headingNear(b, 0) - headingNear(a, a.len)));
      const need = Math.min(30, Math.max(laneW(a, a.len), laneW(b, 0)) * Math.tan(Math.min(t, 2.6) / 2) + 1.5);
      reach[a.id * 2] = Math.max(reach[a.id * 2], need);
      reach[b.id * 2 + 1] = Math.max(reach[b.id * 2 + 1], need);
    }
  for (const e of edges) {
    const jIn = !pass(endN[e.id]);
    const jOut = !pass(startN[e.id]);
    const wi = jIn && e.lb >= 0 && e.len - e.lb <= 45 ? Math.max(2, e.len - e.lb) : Math.max(r[endN[e.id]], reach[e.id * 2]);
    const wo = jOut && e.la >= 0 && e.la <= 45 ? Math.max(2, e.la) : Math.max(r[startN[e.id]], reach[e.id * 2 + 1]);
    const k = Math.min(1, (e.len - 1) / (wi + wo));
    rIn[e.id] = Math.max(0, wi * k);
    rOut[e.id] = Math.max(0, wo * k);
  }
  // 두 교차로 사이 곧은 부분이 승용차 한 대(5.2m + 2.5m)도 못 서면 하나로
  for (const e of edges) {
    const a = startN[e.id];
    const b = endN[e.id];
    if (inJ(a) && inJ(b) && find(a) !== find(b) && e.len - rIn[e.id] - rOut[e.id] < 7.7) unite(a, b);
  }
  hasFork.clear();
  for (let n = 0; n < N; n++) if (!pass(n)) hasFork.add(find(n));

  const list: Junction[] = [];
  for (let n = 0; n < N; n++) {
    const f = find(n);
    if (!hasFork.has(f)) continue;
    if (root[f] < 0) {
      root[f] = list.length;
      list.push({ id: list.length, x: 0, z: 0, nodes: new Set(), into: [] });
    }
    root[n] = root[f];
    list[root[f]].nodes.add(nodeKey(nx[n], nz[n]));
  }
  for (const j of list) {
    let sx = 0;
    let sz = 0;
    for (const k of j.nodes) {
      const n = ix.get(k)!;
      sx += nx[n];
      sz += nz[n];
    }
    j.x = sx / j.nodes.size;
    j.z = sz / j.nodes.size;
  }
  const jEnd = Int32Array.from(endN, (n) => root[n]);
  const jStart = Int32Array.from(startN, (n) => root[n]);
  // 묶음 안 이음매 노드 쪽 끝은 교차로 상자로(이음매 곡선이 아니라 교차로 경로가 덮는다)
  for (const e of edges) {
    if (jEnd[e.id] >= 0 && pass(endN[e.id])) rIn[e.id] = Math.min(rIn[e.id], Math.max(0, (e.len - 1) / 2));
    if (jStart[e.id] >= 0 && pass(startN[e.id])) rOut[e.id] = Math.min(rOut[e.id], Math.max(0, (e.len - 1) / 2));
  }

  // ── 진입로·나가는 길·움직임 ──
  const exits = new Map<number, Exit[]>();
  for (const e of edges) {
    const j = jEnd[e.id];
    if (j < 0 || jStart[e.id] === j) continue;
    list[j].into.push(e.id);
    const out: Exit[] = [];
    const walk = (path: number[]) => {
      const last = edges[path[path.length - 1]];
      for (const k of last.next) {
        if (path.includes(k) || path.length > 8) continue;
        if (jEnd[k] === j) walk([...path, k]);
        else out.push({ edges: [...path, k], move: 0 });
      }
    };
    walk([e.id]);
    exits.set(e.id, out);
  }
  /** 나가는 길 방향: 묶음을 나간 구간의 8m 자리 */
  const outHeading = (x: Edge) => headingNear(x, Math.min(x.len, 8));
  for (const [a, out] of exits) {
    const e = edges[a];
    const h0 = headingNear(e, e.len);
    const dh = out.map((x) => wrap(outHeading(edges[x.edges[x.edges.length - 1]]) - h0));
    // 직진: 75° 안에서 가장 곧은 길(같은 이름 길이 있으면 그 길)
    let best = -1;
    let bk = Infinity;
    out.forEach((x, k) => {
      const t = Math.abs(dh[k]);
      if (t >= 75 * D2R) return;
      const o = edges[x.edges[x.edges.length - 1]];
      const key = (e.name && o.name === e.name ? 0 : 10) + t;
      if (key < bk) (bk = key), (best = k);
    });
    out.forEach((x, k) => {
      const t = dh[k];
      const side = t < 0 ? LEFT : RIGHT;
      if (Math.abs(t) > 150 * D2R) x.move = UTURN;
      else if (k === best)
        // 비스듬히(25° 넘게) 이어지는 길: 직진 화살표 차로가 없고 그쪽 화살표만 있으면 그쪽 회전
        x.move = Math.abs(t) > 25 * D2R && e.turns.some((m) => (m & side) !== 0) && !e.turns.some((m) => (m & STRAIGHT) !== 0) ? side : STRAIGHT;
      else x.move = side;
    });
  }
  const moveOf = (a: number, x: number) => exits.get(a)?.find((q) => q.edges[q.edges.length - 1] === x)?.move ?? STRAIGHT;

  // ── 차로별 허용 움직임 ──
  /** 일반 차가 쓰는 맨 오른쪽 차로(가로변 버스전용차로가 있으면 그 왼쪽) */
  const rightLane = (e: Edge) => (e.bus >= 0 ? e.bus - 1 : e.lanes - 1);
  const movesMask = new Map<number, number>();
  for (const [a, out] of exits) movesMask.set(a, out.reduce((m, x) => m | x.move, 0));
  const laneMoveCache = new Map<number, number>();
  const bans = new Map<number, number>();
  const uSign = new Set<number>();
  function setRules(a: number, ban: number, uturnSign: boolean) {
    if (ban) bans.set(a, ban);
    if (uturnSign) uSign.add(a);
    laneMoveCache.clear();
  }
  function laneMoves(a: number, l: number): number {
    const key = a * 8 + (l === MED ? 7 : l);
    const hit = laneMoveCache.get(key);
    if (hit !== undefined) return hit;
    const e = edges[a];
    const have = movesMask.get(a) ?? 0;
    let m = 0;
    if (l === MED) m = (LEFT | STRAIGHT | UTURN) & have;
    else if (e.lanes < 2) m = have & ~((e.turns[0] & UTURN) || uSign.has(a) ? 0 : UTURN);
    else {
      const arrow = e.turns[l] & have;
      if (arrow) m = arrow;
      else {
        const marked = (bit: number) => e.turns.some((x, k) => k !== l && (x & bit) !== 0);
        if (have & STRAIGHT && !(e.turns[l] && !(e.turns[l] & STRAIGHT) && marked(STRAIGHT))) m |= STRAIGHT;
        if (l === 0 && !marked(LEFT)) m |= LEFT;
        if ((l === rightLane(e) || l === e.bus) && !marked(RIGHT)) m |= RIGHT;
        if (l === 0 && !marked(UTURN) && uSign.has(a)) m |= UTURN;
        m &= have;
        if (!m && l === e.bus) m = (STRAIGHT | RIGHT) & have;
      }
    }
    const ok = have & ~(bans.get(a) ?? 0);
    // 노면 유턴 화살표가 없는 유턴은 유턴 표지가 있는 맨 왼쪽 차로에서만(위). 금한 움직임은 뺀다
    m &= ok;
    if (!m) m = ok & ~UTURN || ok; // 자료가 어긋난 곳(갈 수 있는 길이 차로 화살표·자리와 맞지 않음): 그 진입로가 할 수 있는 움직임
    laneMoveCache.set(key, m);
    return m;
  }

  // ── 정지 자리와 게이트 ──
  const stops = laneStops(edges, stopLines, crosswalks);
  function gate(a: number, l: number): number {
    const b = stops.back(a, l === MED ? 0 : l);
    return Math.max(rIn[a], b);
  }

  // ── 곡선 ──
  const lp = (e: Edge, s: number, l: number) => {
    pointAt(e.p, e.cum, s, P);
    const off = laneOff(e, l, s);
    const h = headingNear(e, s, off);
    return [P[0] - Math.sin(h) * off, P[1], P[2] + Math.cos(h) * off, h];
  };
  function curve(a: Edge, b: Edge, la: number, lb: number, d: number, out: number[]) {
    const p = lp(a, a.len - rIn[a.id], la);
    const q = lp(b, rOut[b.id], lb);
    const span = Math.hypot(q[0] - p[0], q[2] - p[2]) / 3;
    const k1x = p[0] + Math.cos(p[3]) * span;
    const k1z = p[2] + Math.sin(p[3]) * span;
    const k2x = q[0] - Math.cos(q[3]) * span;
    const k2z = q[2] - Math.sin(q[3]) * span;
    const u = Math.max(0, Math.min(1, d / Math.max(0.1, rIn[a.id] + rOut[b.id])));
    const m = 1 - u;
    out[0] = m * m * m * p[0] + 3 * m * m * u * k1x + 3 * m * u * u * k2x + u * u * u * q[0];
    out[1] = p[1] + (q[1] - p[1]) * u;
    out[2] = m * m * m * p[2] + 3 * m * m * u * k1z + 3 * m * u * u * k2z + u * u * u * q[2];
    const dx = 3 * m * m * (k1x - p[0]) + 6 * m * u * (k2x - k1x) + 3 * u * u * (q[0] - k2x);
    const dz = 3 * m * m * (k1z - p[2]) + 6 * m * u * (k2z - k1z) + 3 * u * u * (q[2] - k2z);
    out[3] = dx * dx + dz * dz > 1e-6 ? Math.atan2(dz, dx) : p[3];
  }

  // ── 횡단보도 면 격자 ──
  const G = 20;
  const ringGrid = new Map<number, [number, number][]>();
  crosswalks.forEach((c, ci) =>
    c.rings.forEach((rg, ri) => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < rg.length; k += 2) (x0 = Math.min(x0, rg[k])), (x1 = Math.max(x1, rg[k])), (z0 = Math.min(z0, rg[k + 1])), (z1 = Math.max(z1, rg[k + 1]));
      for (let gx = Math.floor(x0 / G); gx <= Math.floor(x1 / G); gx++)
        for (let gz = Math.floor(z0 / G); gz <= Math.floor(z1 / G); gz++) {
          const kk = gx * 100003 + gz;
          (ringGrid.get(kk) ?? ringGrid.set(kk, []).get(kk)!).push([ci, ri]);
        }
    }),
  );
  const inRing = (rg: ArrayLike<number>, x: number, z: number) => {
    let c = false;
    for (let i = 0, j = rg.length - 2; i < rg.length; j = i, i += 2) if (rg[i + 1] > z !== rg[j + 1] > z && x < rg[i] + ((z - rg[i + 1]) / (rg[j + 1] - rg[i + 1])) * (rg[j] - rg[i])) c = !c;
    return c;
  };
  const xwAt = (x: number, z: number) => {
    for (const [ci, ri] of ringGrid.get(Math.floor(x / G) * 100003 + Math.floor(z / G)) ?? []) if (inRing(crosswalks[ci].rings[ri], x, z)) return ci;
    return -1;
  };

  // ── 차로 경로 ──
  const paths: LanePath[] = [];
  const pathIx = new Map<string, number>();
  /** 일반 차로 수(가로변 버스전용차로 빼고) */
  const carLanes = (e: Edge) => (e.bus >= 0 ? e.bus : e.lanes);
  /** 진입로 a 의 차로 l 에서 나가는 길 x(움직임 move)의 차로: 그 움직임을 하는 차로들을 꺾는 쪽부터 나가는 길 차로에 나란히 잇는다 */
  function outLane(a: Edge, l: number, x: Edge, move: number): number {
    if (l === MED) return x.med ? MED : 0;
    if (l === a.bus) return x.bus >= 0 ? x.bus : x.lanes - 1;
    const users: number[] = [];
    for (let k = 0; k < carLanes(a); k++) if (laneMoves(a.id, k) & move) users.push(k);
    const at = Math.max(0, users.indexOf(l));
    const nb = carLanes(x);
    if (move === LEFT || move === UTURN) return Math.min(at, nb - 1);
    if (move === RIGHT) return Math.max(0, nb - users.length + at);
    return Math.min(nb - 1, Math.floor(((at + 0.5) * nb) / Math.max(1, users.length)));
  }
  function makePath(a: number, l: number, k: number): LanePath {
    const e = edges[a];
    const ex = exits.get(a)![k];
    const list = ex.edges;
    const n = list.length;
    const x = edges[list[n - 1]];
    const lo = outLane(e, l, x, ex.move);
    const lanes = list.map((id, q) => {
      if (q === 0) return l;
      if (q === n - 1) return lo;
      const o = edges[id];
      if (l === MED) return o.med ? MED : 0;
      const f = ((l + 0.5) / e.lanes) * (1 - q / (n - 1)) + ((lo + 0.5) / x.lanes) * (q / (n - 1));
      return Math.min(o.lanes - 1, Math.floor(f * o.lanes));
    });
    const base = new Float32Array(n);
    base[0] = -(e.len - rIn[a]);
    for (let q = 1; q < n; q++) base[q] = base[q - 1] + edges[list[q - 1]].len;
    const end = base[n - 1] + rOut[x.id];
    const pts: number[] = [];
    const o4 = [0, 0, 0, 0];
    for (let d = 0; d <= end + 1e-3; d += STEP) {
      let q = 0;
      while (q + 1 < n && base[q + 1] <= d) q++;
      const eq = edges[list[q]];
      const s = d - base[q];
      if (q + 1 < n && s >= eq.len - rIn[eq.id]) curve(eq, edges[list[q + 1]], lanes[q], lanes[q + 1], s - (eq.len - rIn[eq.id]), o4);
      else if (q > 0 && s <= rOut[eq.id]) curve(edges[list[q - 1]], eq, lanes[q - 1], lanes[q], rIn[list[q - 1]] + s, o4);
      else {
        const v = lp(eq, s, lanes[q]);
        o4[0] = v[0];
        o4[1] = v[1];
        o4[2] = v[2];
        o4[3] = v[3];
      }
      pts.push(o4[0], o4[1], o4[2], o4[3]);
    }
    // 지나는 횡단보도: 게이트부터(진입로 위), 경로, 나가는 길 상자 끝 12m 까지. 차 몸통 가운데와 양옆 1m
    const xw = new Set<number>();
    const look = (px: number, pz: number, h: number) => {
      for (const side of [0, 1, -1]) {
        const c = xwAt(px - Math.sin(h) * side, pz + Math.cos(h) * side);
        if (c >= 0) xw.add(c);
      }
    };
    for (let s = Math.max(0, e.len - gate(a, l)); s < e.len - rIn[a]; s += STEP) {
      const v = lp(e, s, l);
      look(v[0], v[2], v[3]);
    }
    for (let i = 0; i < pts.length; i += 4) look(pts[i], pts[i + 2], pts[i + 3]);
    for (let s = rOut[x.id]; s < Math.min(x.len, rOut[x.id] + 12); s += STEP) {
      const v = lp(x, s, lo);
      look(v[0], v[2], v[3]);
    }
    return { id: paths.length, j: jEnd[a], a, lane: l, k, move: ex.move, edges: list, lanes, base, end, pts: Float32Array.from(pts), xw: [...xw] };
  }
  function path(a: number, l: number, k: number, any = false): LanePath | undefined {
    const ex = exits.get(a)?.[k];
    if (!ex || (!any && !(laneMoves(a, l) & ex.move))) return undefined;
    const key = `${a},${l},${k}`;
    let id = pathIx.get(key);
    if (id === undefined) {
      const p = makePath(a, l, k);
      pathIx.set(key, (id = paths.length));
      paths.push(p);
    }
    return paths[id];
  }

  const cache = new Map<number, boolean>();
  function conflict(p: number, q: number): boolean {
    if (p === q) return false;
    const key = p < q ? p * 1e6 + q : q * 1e6 + p;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const A = paths[p];
    const B = paths[q];
    let c = false;
    if (A.j !== B.j) c = false;
    else {
      const xa = A.edges[A.edges.length - 1];
      const xb = B.edges[B.edges.length - 1];
      if (xa === xb && A.lanes[A.lanes.length - 1] === B.lanes[B.lanes.length - 1]) c = true;
      else {
        const pa = A.pts;
        const pb = B.pts;
        // 같은 차로에서 출발한 두 경로는 함께 지나는 앞부분(0.5m 안)을 빼고 본다(앞뒤로 줄 서 가는 것이지 엇갈리는 것이 아니다)
        let i0 = 0;
        if (A.a === B.a && A.lane === B.lane) while (i0 < Math.min(pa.length, pb.length) && Math.hypot(pa[i0] - pb[i0], pa[i0 + 2] - pb[i0 + 2]) < 0.5) i0 += 4;
        for (let i = i0; !c && i < pa.length; i += 4)
          for (let k = i0; k < pb.length; k += 4) {
            const dx = pa[i] - pb[k];
            if (dx > NEAR || dx < -NEAR) continue;
            if (Math.abs(pa[i + 1] - pb[k + 1]) > 2.5) continue;
            if (Math.hypot(dx, pa[i + 2] - pb[k + 2]) < NEAR) {
              c = true;
              break;
            }
          }
      }
    }
    cache.set(key, c);
    return c;
  }

  return { edges, list, jEnd, jStart, rIn, rOut, exits, laneMoves, setRules, gate, path: (a, l, k) => path(a, l, k), pathAny: (a, l, k) => path(a, l, k, true), paths, conflict, moveOf, curve, stops };
}
