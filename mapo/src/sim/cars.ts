// 차. 방향 그래프의 구간 위를 달리며 앞차와의 간격으로 속도를 정한다(ACC 식으로 누그러뜨린 IDM).
// 교차로·신호·차로 고르기는 src/sim/intersection/ 이 정한다(재작업 W20, 설계 문서 45절):
//  - 차는 교차로 진입로에 올라서기 전에(게이트가 가까운 짧은 진입로는 앞 구간에서) 지금 차로가 허용하는 나가는 길 하나와 그 차로 경로를 고른다.
//    교차로 안에서는 그 경로(고정 곡선)만 따라가고 차로를 바꾸지 않는다.
//  - 게이트(차로 정지 자리)에서만 들어갈지 정한다: 내 움직임 신호가 초록이고(노란불은 편히 못 설 때만), 경로가 부딪는 차가 교차로를 잡고 있지 않고,
//    나갈 차로에 설 자리가 있고, 양보할 움직임이면 우선 차가 곧 오지 않고, 지나는 횡단보도 보행 초록이 켜지기 전에 빠져나갈 수 있을 때.
//    들어가기로 한 차는 게이트 몇 초 앞부터 교차로를 잡고, 뒤꽁무니가 경로 끝을 지날 때까지 놓지 않는다.
//  - 교차로 밖에서는 차로 가운데선을 따라가고, 차로 수 이음매는 이음매 곡선으로 옮겨 간다.
// 버스는 노선의 구간 열을 따라 달리고 정류장마다 잠시 선다. 중앙버스차로가 있는 구간에서는 그 차로로 달리고(마을버스 빼고)
// 중앙 정류장 가까이에서는 승강장 폭만큼 더 왼쪽으로 비켜 서서 오른쪽 문이 승강장에 닿는다. 일반 차는 중앙버스차로·가로변 버스전용차로를 쓰지 않는다.
import { headingAt, pointAt } from '../poly.ts';
import { BODY_HW, BODY_LEN, BUS_HW, bodyType } from './bodies.ts';
import { busHeadway, type BusRoute } from './buses.ts';
import type { Now } from './clock.ts';
import { commute, daytime, nightlife } from './curves.ts';
import { BOARD_R } from '../geo.ts';
import type { Crosswalk } from '../data/board.ts';
import { headingNear, ISLAND_BACK, ISLAND_L, ISLAND_W, laneOff, lanePos, leftEdge, MED, medAt, type Edge } from './graph.ts';
import { GREEN, LEFT, makeIntersections, RED, RIGHT, STEP, STRAIGHT, UTURN, YELLOW, type Inter, type LanePath } from './intersection/index.ts';
import type { DataProvider } from './provider.ts';
import { pick, rng } from './rng.ts';
import { B_COMF, capStopSpeed, DEFAULT_FOLLOWING, followingAcceleration, integrateSpeed, limitAcceleration, type Following } from './longitudinal.ts';

export interface Cars {
  n: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  yaw: Float32Array;
  /** 브레이크등 밝기 0~1 */
  brake: Float32Array;
  /** 0 승용차, 1 버스, 2 택시 */
  kind: Uint8Array;
  /** 차마다 다른 0~1 값(색) */
  tint: Float32Array;
  /** 막 나타난 차는 0에서 1로 커진다 */
  fade: Float32Array;
  /** 버스 노선 번호(버스가 아니면 −1) */
  route: Int16Array;
  /** 차마다 붙는 고유 번호(배열 자리가 바뀌어도 그대로) */
  uid: Int32Array;
  /** 그릴 때 차 길이를 늘일 수 있는 한도(m): 앞뒤 차와의 가운데 거리, 앞의 정지선·정류장까지 가운데 거리의 두 배 가운데 가장 작은 값 */
  room: Float32Array;
}

const VFREE = [22, 14, 12.5, 10, 7, 5.5]; // 등급별 자유 속도(m/s)
const BUS_LEN = [11.5, 11.5, 12, 7.5]; // 종류별 버스 길이(m)
/** 가장 긴 차의 반길이(m) */
const HALF_MAX = Math.max(...BUS_LEN, ...BODY_LEN, 11.5) / 2;
/** 차로를 바꿀 때 옆으로 옮겨 가는 빠르기(m/s) */
const SIDE_V = 1.1;
/** 노란불에 편히 설 수 있는 감속(m/s²)과 빨간불에 서는 가장 센 감속 */
const B_AMBER = 3;
const B_HARD = 6;
const SURVEYED_FOLLOWING: Following = { headway:.45, acceleration:2.4 };

/** 따라가기 규칙(서 있는 장애물이 obs 에 있다고 보고, 바라는 속도 v0)대로 속도 u 에서 달려 앞 범퍼가 need 를 지나는 데 걸리는 시간(초, 못 지나면 ∞)과 그때 짐 차 꽁무니 자리.
 *  짐으로 본 바로 앞차(꽁무니 xl, 속도 ul, 없으면 xl = ∞)도 같은 규칙으로 달린다고 보고 그 꽁무니를 따라간다. 거리는 모두 내 앞 범퍼 기준 */
export function clearRun(v0: number, u: number, need: number, obs: number, xl: number, ul: number,
                         freeAt?: (distance: number) => number, following = DEFAULT_FOLLOWING,
                         leaderFollowing = following): [number, number] {
  const idm = (w: number, gap: number, free: number, { headway, acceleration }: Following) => {
    let a = acceleration * (1 - (w / free) ** 4);
    if (gap < Infinity) a -= acceleration * ((2 + w * headway + (w * w) / (2 * Math.sqrt(acceleration * B_COMF))) / Math.max(0.3, gap)) ** 2;
    return Math.max(-8, Math.min(acceleration, a));
  };
  const load = xl < Infinity;
  // obs 는 짐이 장애물 뒤에 붙어 섰을 때 가장 가까운 짐의 꽁무니 자리라, 그 짐 앞 범퍼가 볼 장애물은 꽁무니 좌표로 obs + 2.5 다(재작업 W42: 전에는 내 몸 길이를 더해 짐을 그만큼 더 보냈다)
  const obsL = obs + 2.5;
  const h = 0.2;
  let x = 0;
  let t = 0;
  while (x < need) {
    const a = idm(u, Math.min(obs - x, xl - x), freeAt?.(x) ?? v0, following);
    if (load) {
      ul = Math.max(0, ul + idm(ul, obsL - xl, freeAt?.(xl) ?? v0, leaderFollowing) * h);
      xl += ul * h;
    }
    u = Math.max(0, u + a * h);
    x += u * h;
    t += h;
    if (t > 40 || (u < 0.05 && a <= 0)) return [Infinity, xl];
  }
  return [t, xl];
}

/** The projected front must move a body length past each face to clear the rear. */
export function clearsWalkSignals(faces: readonly [end: number, greenIn: number][], length: number,
                                  travelTime: (distance: number) => number) {
  return faces.every(([end, greenIn]) => travelTime(end + length) + 1 < greenIn);
}

export function makeCars(
  edges: Edge[],
  provider: DataProvider,
  seed = 1,
  max = 1400,
  routes: BusRoute[] = [],
  inter?: Inter,
  /** 횡단보도와, 횡단보도마다 지금 사람이 건너고 있는 자리(축을 2m 칸으로 나눈 비트, 보행자가 쓴다) */
  xw?: { list: Crosswalk[]; busy: Uint32Array },
  surveyedCount?: number,
) {
  const rand = rng(seed);
  const I = inter ?? makeIntersections(edges, xw ? { crosswalks: xw.list, stopLines: new Float32Array() } : undefined);
  const X = I.X;
  const S = I.S;
  const boundaryDemand = X.surveyed ? surveyedCount : undefined;
  const stops = X.stops;
  const cars: Cars = {
    n: 0,
    x: new Float32Array(max),
    y: new Float32Array(max),
    z: new Float32Array(max),
    yaw: new Float32Array(max),
    brake: new Float32Array(max),
    kind: new Uint8Array(max),
    tint: new Float32Array(max),
    fade: new Float32Array(max),
    route: new Int16Array(max).fill(-1),
    uid: new Int32Array(max),
    room: new Float32Array(max).fill(99),
  };
  const followingOf = (i: number) => X.surveyed && cars.route[i] < 0 ? SURVEYED_FOLLOWING : DEFAULT_FOLLOWING;
  let nextUid = 1;
  let nBus = 0;
  /** 버스 몫으로 남겨 두는 자리. 일반 차는 max - reserve 대까지만 둔다 */
  const reserve = routes.length ? Math.min(300, Math.floor(max * 0.2)) : 0;
  const edge = new Int32Array(max);
  const nextE = new Int32Array(max);
  const s = new Float32Array(max);
  const v = new Float32Array(max);
  const lane = new Uint8Array(max);
  // 차로 위 자리(0~1): 차로가 L개인 구간에서 floor(값 × L)번 차로. 이음매에서 graph.ts lanePos 로 옮긴다
  const pref = new Float32Array(max);
  const vf = new Float32Array(max);
  const size = new Float32Array(max);
  const wid = new Float32Array(max);
  const acc = new Float32Array(max);
  const rpos = new Int16Array(max);
  const stopK = new Int16Array(max);
  const dwell = new Float32Array(max);
  const wait = new Float32Array(routes.length);
  // 차로 바꾸기: 차로 번호는 바로 바꾸고, 그려진 자리는 옛 차로 쪽으로 남은 옆 거리(m, 오른쪽 +)를 초당 SIDE_V 씩 줄여 옮겨 간다
  const side = new Float32Array(max);
  const prevE = new Int32Array(max).fill(-1);
  const prevLane = new Uint8Array(max);
  const waitT = new Float32Array(max);
  const stopT = new Float32Array(max);
  // 교차로: 고른 차로 경로(jp), 그 경로에서 지금 구간의 자리(jk, 진입로 앞 구간이면 −1), 지나온 경로(pp, 뒤꽁무니가 빠져나갈 때까지),
  // 경로 위 거리(pd, 차 가운데), 들어가기로 했나(go), 게이트를 넘었나(past)
  const jp = new Int32Array(max).fill(-1);
  const jk = new Int8Array(max);
  const pp = new Int32Array(max).fill(-1);
  const pd = new Float32Array(max);
  const go = new Uint8Array(max);
  const past = new Uint8Array(max);
  // 게이트 앞에 붙은 횡단보도 묶음(그 묶음과 게이트 사이에 내 몸이 설 자리가 없다)이 있으면 들어갈지를 그 묶음 앞에서 정한다(재작업 W25):
  // 정하는 자리까지 앞 범퍼 거리(gdist), 그 자리를 넘어 들어가기로 굳혔나(commit, 넘은 뒤로는 게이트를 넘은 차처럼 들어가기를 거두지 않는다)
  const gdist = new Float32Array(max).fill(Infinity);
  const commit = new Uint8Array(max);
  // 중앙버스차로 버스가 다음 교차로에서 우회전하려고 중앙버스차로를 나왔다(그 교차로를 지나면 다시 0)
  const offMed = new Uint8Array(max);
  // 측정용: 이번 단계에 따라간 앞 대상(차 번호, 자기 자신이면 서는 자리, 없으면 −1)과 그 까닭
  const ahead = new Int32Array(max).fill(-1);
  const aheadWhy = new Uint8Array(max);
  const held: number[][] = X.list.map(() => []);
  const coming: number[][] = X.list.map(() => []);
  const PS = X.paths;

  // 판 가장자리로 빠져나갈 수 있는 구간
  const canLeave = new Uint8Array(edges.length);
  const before: number[][] = edges.map(() => []);
  for (const e of edges) for (const k of e.next) before[k].push(e.id);
  const mergeHold = new Float32Array(X.surveyed ? max : 0);
  const mergePairs: { outlet: number; feeders: [number, number]; limit: [number, number] }[] = [];
  if (X.surveyed) {
    const busEdges = new Set(routes.flatMap(route => route.edges));
    const shapes = edges.map(e => {
      const hl = busEdges.has(e.id) ? HALF_MAX : Math.max(...BODY_LEN) / 2;
      const hw = busEdges.has(e.id) ? Math.max(...BUS_HW) : Math.max(...BODY_HW);
      const points: { s: number; x: number; z: number; yaw: number }[] = [];
      const p = [0, 0, 0];
      for (let d = 0; d <= Math.min(24, e.len); d += STEP) {
        const at = e.len - d;
        pointAt(e.p, e.cum, at, p);
        points.push({ s: at, x: p[0], z: p[2], yaw: headingNear(e, at) });
      }
      return { hl, hw, points };
    });
    for (const [outlet, feeders] of before.entries()) {
      for (let a = 0; a < feeders.length; a++) for (let b = a + 1; b < feeders.length; b++) {
        const p = shapes[feeders[a]], q = shapes[feeders[b]];
        let firstP = Infinity, firstQ = Infinity;
        for (const u of p.points) for (const w of q.points) {
          if (!hit(u.x, u.z, u.yaw, p.hl, p.hw, w.x, w.z, w.yaw, q.hl, q.hw)) continue;
          firstP = Math.min(firstP, u.s);
          firstQ = Math.min(firstQ, w.s);
        }
        if (!Number.isFinite(firstP)) continue;
        mergePairs.push({ outlet, feeders: [feeders[a], feeders[b]], limit: [firstP - 2*STEP, firstQ - 2*STEP] });
      }
    }
  }
  const queue = edges.filter((e) => Math.hypot(e.p[e.p.length - 3], e.p[e.p.length - 1]) > BOARD_R - 40).map((e) => e.id);
  for (const k of queue) canLeave[k] = 1;
  while (queue.length) for (const k of before[queue.pop()!]) if (!canLeave[k]) (canLeave[k] = 1), queue.push(k);
  const placeable = canLeave.some((c) => c) ? canLeave : new Uint8Array(edges.length).fill(1);
  const entries = edges.filter((e) => e.entry);
  const entryW = entries.map((e) => X.surveyed ? Math.max(1, 4 - e.cls) : e.vol * Math.max(0, 4 - e.cls));
  const speed = new Float32Array(edges.length).fill(10);
  const midX = new Float32Array(edges.length);
  const midZ = new Float32Array(edges.length);
  const midH = new Float32Array(edges.length);
  for (const e of edges) {
    const m = [0, 0, 0];
    const seg = pointAt(e.p, e.cum, e.len / 2, m);
    midX[e.id] = m[0];
    midZ[e.id] = m[2];
    midH[e.id] = headingAt(e.p, seg);
  }
  let speedAge = Infinity;
  const lists: number[][] = edges.map(() => []);
  const tail = new Int32Array(edges.length * 8);
  const leaveTail = new Int32Array(edges.length * 8); // 구간·차로에서 막 빠져나가 아직 상자 안에 꽁무니가 있는 차
  const CELL = 8;
  const GW = Math.ceil((2 * BOARD_R + 400) / CELL);
  const cellHead = new Int32Array(GW * GW);
  const cellNext = new Int32Array(max);
  const cellAt = (x: number) => Math.max(0, Math.min(GW - 1, Math.floor((x + BOARD_R + 200) / CELL)));
  const tmp = [0, 0, 0];
  const meanV = new Float32Array(edges.length).fill(-1);
  const blockLane = new Int8Array(edges.length).fill(-1);
  const closed = new Uint8Array(edges.length);
  const slowAt = new Float32Array(edges.length).fill(-1);
  const slowV = new Float32Array(edges.length);

  /** 진입로인가(끝이 교차로이고 시작은 그 교차로가 아니다) */
  const isApproach = (k: number) => X.jEnd[k] >= 0 && X.jStart[k] !== X.jEnd[k];
  /** 교차로 안 구간 */
  const inner = (k: number) => X.jEnd[k] >= 0 && X.jStart[k] === X.jEnd[k];
  /** 구간 e 에서 차로 ln 이 막혀 있으면 옆 차로로 */
  const free = (e: Edge, ln: number) => (ln !== blockLane[e.id] || e.lanes < 2 ? ln : ln + 1 < e.lanes ? ln + 1 : ln - 1);
  /** 일반 차가 쓸 수 있는 차로 수: 가로변 버스전용차로(맨 오른쪽)는 뺀다 */
  const carLanes = (e: Edge) => (e.bus >= 0 ? e.bus : e.lanes);
  const carLane = (e: Edge, x: number) => {
    const ln = free(e, Math.min(carLanes(e) - 1, Math.max(0, Math.floor(x))));
    return ln === e.bus ? ln - 1 : ln;
  };
  /** 차로가 모이는 이음매 앞 구간: 갈림 없는 다음 구간으로 두 차로가 한 차로로 이어진다(차로 수가 줄거나, 차로 자리로 이어 둘이 한 차로로 모인다. 재작업 W22) */
  const mergeSeam = new Uint8Array(edges.length);
  for (const e of edges) {
    if (e.next.length !== 1) continue;
    const ne = edges[e.next[0]];
    const seen = new Set<number>();
    for (let l = 0; l < carLanes(e); l++) {
      const t = carLane(ne, lanePos(e, ne, l + 0.5));
      if (seen.has(t)) mergeSeam[e.id] = 1;
      seen.add(t);
    }
  }
  function avoid(k: number): number {
    if (closed[k]) return 1e-4;
    const e = edges[k];
    let room = 0;
    for (let l = 0; l < e.lanes; l++) {
      const t = tail[k * 8 + l];
      room = Math.max(room, t >= 0 ? s[t] - size[t] / 2 : e.len);
    }
    const slow = meanV[k] < 0 ? 1 : Math.max(0.1, Math.min(1, meanV[k] / (0.5 * VFREE[e.cls])));
    return Math.max(0.01, Math.min(1, room / 60) ** 2 * slow);
  }
  /** 차 i 가 차로 위 자리 x 에서 구간 o 를 달릴 차로(버스는 맨 오른쪽 쪽 그대로, 중앙버스차로 노선이면 중앙버스차로) */
  const laneAt = (i: number, o: Edge, x: number) =>
    cars.route[i] >= 0 ? (o.med && routes[cars.route[i]].usesMed && !offMed[i] ? MED : free(o, Math.min(o.lanes - 1, Math.max(0, Math.floor(x))))) : carLane(o, x);

  // ── 교차로 경로 고르기 ──
  /** 진입로 a 의 차로 l 에서 나갈 경로를 고른다. 버스는 노선(q = 노선에서 a 의 자리)을, 일반 차는 그 차로가 허용하는 나가는 길 가운데 무게로 */
  function pickPath(i: number, a: number, l: number, q: number): LanePath | undefined {
    const ex = X.exits.get(a) ?? [];
    const r = cars.route[i];
    if (r >= 0) {
      const R = routes[r].edges;
      const k = ex.findIndex((x) => x.edges.every((id, m) => R[q + m] === id));
      if (k < 0) return undefined;
      return X.path(a, l, k) ?? X.pathAny(a, l, k);
    }
    const e = edges[a];
    const cand: LanePath[] = [];
    const w: number[] = [];
    ex.forEach((x, k) => {
      const p = X.path(a, l, k);
      if (!p) return;
      const out = x.edges[x.edges.length - 1];
      const first = e.next.indexOf(x.edges[1]);
      cand.push(p);
      w.push((first >= 0 ? e.nextW[first] : 0.1) * avoid(out) * (canLeave[out] ? 1 : 1e-3) * (closed[out] ? 1e-4 : 1));
    });
    if (!cand.length) return undefined;
    return cand[pick(w, rand())];
  }
  /** 차 i 가 진입로 a 에 올라설 때 달릴 차로(지금 구간 e 에서 차로 위 자리로 옮겨) */
  const laneInto = (i: number, e: Edge, a: Edge) => laneAt(i, a, lanePos(e, a, pref[i] * e.lanes));
  /** 지금 경로(또는 지나온 경로)에서 구간 k 를 달릴 차로. 경로 밖이면 −1 */
  function pathLane(i: number, k: number): number {
    for (let pk = 0; pk < 2; pk++) {
      const id = pk ? pp[i] : jp[i];
      if (id < 0) continue;
      const q = PS[id].edges.indexOf(k);
      if (q >= 0) return PS[id].lanes[q];
    }
    return -1;
  }
  /** 지나온 경로를 놓는 자리(경로 위 거리): 경로 끝이 아니라 나간 차로가 같은 교차로 다른 경로·다른 나가는 길과 몸이 닿지 않게 되는 자리(holdOut, 재작업 W25) */
  const holdEnd = (P: LanePath) => {
    const x = P.edges[P.edges.length - 1];
    return P.end + Math.max(0, X.holdOut(x, P.lanes[P.lanes.length - 1]) - X.rOut[x]);
  };
  /** 몸 크기 종류(교차로 몸 닿기 견주기): 0 승용차, 1 버스 */
  const bigOf = (i: number) => (cars.route[i] >= 0 || size[i] > 5.4 ? 1 : 0);
  /** 경로 id 위 거리 d 의 자리 → out [x, y, z, 방향] */
  function pathPose(id: number, d: number, out: number[]) {
    if (X.surveyed) {
      const path = PS[id];
      let q = 0;
      while (q + 1 < path.edges.length && path.base[q + 1] <= d) q++;
      const e = edges[path.edges[q]];
      const at = d - path.base[q];
      pointAt(e.p, e.cum, at, out);
      out[3] = headingNear(e, at);
      return;
    }
    const p = PS[id].pts;
    const f = Math.max(0, Math.min(p.length / 4 - 1.001, d / STEP));
    const k = Math.floor(f);
    const t = f - k;
    const a = k * 4;
    const b = Math.min(p.length - 4, a + 4);
    out[0] = p[a] + (p[b] - p[a]) * t;
    out[1] = p[a + 1] + (p[b + 1] - p[a + 1]) * t;
    out[2] = p[a + 2] + (p[b + 2] - p[a + 2]) * t;
    let dh = p[b + 3] - p[a + 3];
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    out[3] = p[a + 3] + dh * t;
  }

  /** 차 i 가 구간 e 에 막 올라섰다: 경로 자리를 옮기고, 진입로면 경로를 고르고, 다음 구간을 정한다 */
  function onEdge(i: number, e: Edge) {
    // 지나온 경로: 나가는 길을 벗어나도 뒤꽁무니가 경로 끝을 지날 때까지 둔다(pd 로 잰다)
    if (jp[i] >= 0) {
      const P = PS[jp[i]];
      if (jk[i] < 0 && e.id === P.a) {
        if (lane[i] === P.lane) jk[i] = 0;
        else dropPath(i);
      } else if (jk[i] >= 0 && P.edges[jk[i] + 1] === e.id) {
        jk[i]++;
        lane[i] = P.lanes[jk[i]];
        if (jk[i] === P.edges.length - 1) {
          pp[i] = jp[i];
          jp[i] = -1;
          offMed[i] = 0;
          go[i] = 0;
          past[i] = 0;
          commit[i] = 0;
          gdist[i] = Infinity;
        }
      } else dropPath(i);
    }
    const r = cars.route[i];
    if (jp[i] < 0 && isApproach(e.id)) {
      const P = pickPath(i, e.id, lane[i], rpos[i]);
      if (P) {
        jp[i] = P.id;
        jk[i] = 0;
        go[i] = 0;
        past[i] = 0;
        waitT[i] = 0;
      }
    }
    if (jp[i] >= 0 && jk[i] >= 0) nextE[i] = PS[jp[i]].edges[jk[i] + 1];
    else if (r >= 0) nextE[i] = rpos[i] + 1 < routes[r].edges.length ? routes[r].edges[rpos[i] + 1] : -1;
    else if (X.surveyed && e.next.length > 1) {
      const weights = e.next.map((id, k) => e.nextW[k] * avoid(id));
      nextE[i] = e.next[pick(weights, rand())];
    }
    else nextE[i] = e.next.length ? e.next[0] : -1;
    if (nextE[i] >= 0 && jp[i] < 0 && (inner(nextE[i]) || (X.jStart[nextE[i]] >= 0 && X.jStart[nextE[i]] === X.jEnd[e.id]))) {
      // 경로 없이 교차로로 들어가게 된 차(진입로에서 고를 경로가 없었다): 거기서 끝낸다
      nextE[i] = -1;
    }
    // 게이트가 가까운 짧은 진입로는 지금 구간에서 미리 경로를 고른다
    if (jp[i] < 0 && nextE[i] >= 0 && isApproach(nextE[i])) {
      const a = edges[nextE[i]];
      const l = laneInto(i, e, a);
      if (a.len - X.gate(a.id, l) < 60) {
        const P = pickPath(i, a.id, l, rpos[i] + 1);
        if (P) {
          jp[i] = P.id;
          jk[i] = -1;
          go[i] = 0;
          past[i] = 0;
        }
      }
    }
  }
  function dropPath(i: number) {
    jp[i] = -1;
    go[i] = 0;
    past[i] = 0;
    commit[i] = 0;
    gdist[i] = Infinity;
  }

  function put(i: number, e: Edge, at: number, ln: number, route = -1) {
    edge[i] = e.id;
    s[i] = at;
    lane[i] = ln;
    pref[i] = (ln === MED ? 0.5 : ln + Math.min(0.999, rand())) / e.lanes;
    vf[i] = 0.86 + rand() * 0.26;
    v[i] = speed[e.id] * vf[i] * 0.8;
    if (slowAt[e.id] >= 0 && Math.abs(at - slowAt[e.id]) < 25) v[i] = Math.min(v[i], slowV[e.id]);
    cars.route[i] = route;
    cars.uid[i] = nextUid++;
    cars.kind[i] = route >= 0 ? 1 : rand() < 0.09 ? 2 : 0;
    cars.tint[i] = route >= 0 ? routes[route].kind : rand();
    size[i] = route >= 0 ? BUS_LEN[routes[route].kind] ?? 11.5 : BODY_LEN[cars.kind[i] === 2 ? 0 : bodyType(cars.tint[i])];
    wid[i] = route >= 0 ? BUS_HW[routes[route].kind] ?? 1.245 : BODY_HW[cars.kind[i] === 2 ? 0 : bodyType(cars.tint[i])];
    cars.brake[i] = 0;
    cars.fade[i] = 0;
    cars.room[i] = 99;
    dwell[i] = 0;
    stopK[i] = 0;
    waitT[i] = 0;
    stopT[i] = 0;
    prevE[i] = -1;
    side[i] = 0;
    blockBy[i] = -1;
    holdYaw[i] = 0;
    zclaim[i] = -1;
    jp[i] = -1;
    pp[i] = -1;
    go[i] = 0;
    past[i] = 0;
    commit[i] = 0;
    gdist[i] = Infinity;
    offMed[i] = 0;
    if (route < 0) rpos[i] = 0;
    onEdge(i, e);
  }

  function addBus(r: number, at = 0.5): boolean {
    const R = routes[r];
    if (cars.n >= max || !R) return false;
    let k = 0;
    while (k < R.edges.length - 1 && R.start[k + 1] <= at) k++;
    const e = edges[R.edges[k]];
    const i = cars.n;
    rpos[i] = k;
    const sAt = Math.min(e.len - 0.1, at - R.start[k]);
    // 교차로 안이나 게이트를 넘은 자리에는 놓지 않는다
    if (inner(e.id) || (X.jStart[e.id] >= 0 && sAt < X.rOut[e.id] + 6) || ((isApproach(e.id) || S.midApproach.has(e.id)) && sAt > e.len - X.gate(e.id, e.lanes - 1) - 8) || onCrosswalk(e, sAt, 12)) return false;
    put(i, e, sAt, e.med && R.usesMed ? MED : e.bus >= 0 ? e.bus : e.lanes - 1, r);
    while (stopK[i] < R.stops.length && R.stops[stopK[i]] < at) stopK[i]++;
    cars.n++;
    nBus++;
    locate(i);
    return true;
  }
  function remove(i: number) {
    if (cars.route[i] >= 0) nBus--;
    const j = --cars.n;
    if (i === j) return;
    for (const a of [coarse, owe, rpos, stopK, dwell, cars.route, cars.uid, cars.room, cars.x, cars.y, cars.z, cars.yaw, edge, nextE, s, v, lane, pref, vf, size, wid, cars.kind, cars.tint, cars.brake, cars.fade, stopT, waitT, prevE, prevLane, side, blockBy, blockUid, holdYaw, zclaim, zLeft, jp, jk, pp, pd, go, past, commit, gdist, offMed])
      a[i] = a[j];
  }

  // ── 자리 ──
  const cv = [0, 0, 0, 0];
  /** 차 i 의 자리 out = [x, y, z, 방향, 교차로 경로 위(1)]. 구간 eid 의 sv(m), 차로 ln */
  function pose(i: number, eid: number, sv: number, ln: number, out: number[]) {
    const e = edges[eid];
    out[4] = 0;
    // 교차로 경로 위
    for (let pk = 0; pk < 2; pk++) {
      const id = pk ? pp[i] : jp[i];
      if (id < 0) continue;
      const P = PS[id];
      const q = P.edges.indexOf(eid);
      if (q < 0 || (id === jp[i] && jk[i] < 0)) continue;
      const d = P.base[q] + sv;
      if (d < 0 || d > P.end) continue;
      pathPose(id, d, cv);
      const w = (P.lane === MED && cars.route[i] >= 0 ? islandShift(i, medAlongPath(P, d), eid, sv) : 0) - side[i];
      out[0] = cv[0] + Math.sin(cv[3]) * w;
      out[1] = cv[1];
      out[2] = cv[2] - Math.cos(cv[3]) * w;
      out[3] = cv[3];
      out[4] = 1;
      return;
    }
    // 갈림 없는 이음매가 꺾이는 곳(15° 넘게)은 이음매 곡선으로 돈다(차로 수·자리가 어긋난 곳은 곡선 대신 옆 거리로 옮겨 간다)
    const nx = nextE[i];
    if (nx >= 0 && X.jEnd[eid] < 0 && eid === edge[i] && sv > e.len - X.rIn[eid] && bent(e, edges[nx])) {
      const o = edges[nx];
      X.curve(e, o, ln, laneAt(i, o, lanePos(e, o, pref[i] * e.lanes)), sv - (e.len - X.rIn[eid]), cv);
      curveOut(i, out);
      return;
    }
    const pe = prevE[i];
    if (pe >= 0 && X.jStart[eid] < 0 && eid === edge[i] && sv < X.rOut[eid] && edges[pe].next.includes(eid) && bent(edges[pe], e)) {
      X.curve(edges[pe], e, prevLane[i], ln, X.rIn[pe] + sv, cv);
      curveOut(i, out);
      return;
    }
    pointAt(e.p, e.cum, sv, tmp);
    const off = laneOff(e, ln, sv) - (ln === MED ? islandShift(i, medAt(e, sv), eid, sv) : 0) + side[i];
    const yaw = headingNear(e, sv, off);
    out[0] = tmp[0] - Math.sin(yaw) * off;
    out[1] = tmp[1];
    out[2] = tmp[2] + Math.cos(yaw) * off;
    out[3] = yaw;
  }
  /** 이음매 a→b 가 15° 넘게 꺾이는가 */
  const bent = (a: Edge, b: Edge) => {
    let t = Math.abs(headingNear(b, 0) - headingNear(a, a.len));
    if (t > Math.PI) t = 2 * Math.PI - t;
    return t > (15 * Math.PI) / 180;
  };
  function curveOut(i: number, out: number[]) {
    out[0] = cv[0] - Math.sin(cv[3]) * side[i];
    out[1] = cv[1];
    out[2] = cv[2] + Math.cos(cv[3]) * side[i];
    out[3] = cv[3];
  }
  /** 경로 위 거리 d 의 중앙버스차로 자리(경로 앞뒤 구간 med 를 잇는다) */
  function medAlongPath(P: LanePath, d: number): number {
    const a = edges[P.a];
    const x = edges[P.edges[P.edges.length - 1]];
    const ma = a.med ? medAt(a, a.len - X.rIn[a.id]) : 0;
    const mb = x.med ? medAt(x, X.rOut[x.id]) : 0;
    if (!ma || !mb) return ma || mb;
    const u = Math.max(0, Math.min(1, d / Math.max(0.1, P.end)));
    return ma + (mb - ma) * u;
  }
  const PO = [0, 0, 0, 0, 0];
  const PS0 = [0, 0, 0, 0, 0];
  const PS1 = [0, 0, 0, 0, 0];
  function locate(i: number) {
    pose(i, edge[i], s[i], lane[i], PO);
    if (holdYaw[i]) PO[3] = cars.yaw[i];
    cars.x[i] = PO[0];
    cars.y[i] = PO[1];
    cars.z[i] = PO[2];
    cars.yaw[i] = PO[3];
  }
  /** 중앙버스차로 버스가 구간 eid 의 sv 자리에서 중앙 정류장 둘레 승강장 폭만큼 왼쪽으로 비켜서는 거리(m).
   *  자리는 지금 자리가 아니라 그려 볼 자리로 잰다(몸통 겹침 막기가 다음 걸음 자리를 미리 그려 볼 때 비켜서기가 어긋나지 않게, 재작업 W22) */
  function islandShift(i: number, med: number, eid: number, sv: number): number {
    const R = routes[cars.route[i]];
    const k = R.edges[rpos[i]] !== eid && R.edges[rpos[i] + 1] === eid ? rpos[i] + 1 : rpos[i];
    const at = R.start[k] + sv;
    let w = 0;
    let extra = 0;
    for (const k of [stopK[i] - 1, stopK[i]])
      if (R.med[k]) {
        const wk = Math.min(1, Math.max(0, (ISLAND_L / 2 + 22 - Math.abs(at - R.stops[k] + ISLAND_BACK)) / 22));
        if (wk > w) (w = wk), (extra = R.shift[k] ?? 0);
      }
    return Math.max(0, 0.25 + ISLAND_W + 0.15 + 1.25 + extra - med) * w;
  }

  // ── 차로 바꾸기(버스, 가로변 버스전용차로 우회전) ──
  /** 버스 i 가 구간 e 에서 있어야 할 차로: 노선 200m 안 다음 교차로에서 할 움직임을 허용하는 차로(좌회전·유턴은 가장 왼쪽, 아니면 가장 오른쪽).
   *  다음 정류장이 먼저면 가장 오른쪽. 중앙버스차로는 −1(바꾸지 않는다) */
  function busWant(i: number, e: Edge): number {
    const R = routes[cars.route[i]];
    if (lane[i] === MED || (e.med && R.usesMed && !offMed[i])) {
      // 중앙버스차로에서는 노선 200m 안 다음 교차로가 그 차로에서 못 하는 우회전일 때만(정류장이 먼저면 정류장 뒤) 나온다
      const stopAt = stopK[i] < R.stops.length ? R.stops[stopK[i]] : Infinity;
      for (let k = rpos[i], d = -s[i]; k + 1 < R.edges.length && d < 200; k++) {
        const a = edges[R.edges[k]];
        d += a.len;
        if (!isApproach(a.id)) continue;
        if (R.start[k] + a.len > stopAt && stopAt > R.start[rpos[i]] + s[i]) return -1;
        const x = (X.exits.get(a.id) ?? []).find((q) => q.edges.every((id, m) => R.edges[k + m] === id));
        if (!x || x.move !== RIGHT || X.laneMoves(a.id, MED) & RIGHT) return -1;
        offMed[i] = 1;
        return e.lanes - 1;
      }
      return -1;
    }
    const right = e.bus >= 0 ? e.bus : e.lanes - 1;
    const stopAt = stopK[i] < R.stops.length ? R.stops[stopK[i]] : Infinity;
    const at = R.start[rpos[i]] + s[i];
    for (let k = rpos[i], d = -s[i]; k + 1 < R.edges.length && d < 200; k++) {
      const a = edges[R.edges[k]];
      d += a.len;
      if (!isApproach(a.id)) continue;
      if (R.start[k] + a.len > stopAt && stopAt > at) return right;
      const ex = X.exits.get(a.id) ?? [];
      const x = ex.find((q) => q.edges.every((id, m) => R.edges[k + m] === id));
      if (!x) return right;
      // 다음 교차로가 뒤 구간이면 지금 구간에서 미리 그쪽 끝 차로로 간다(진입로가 짧아 실선 구간 밖이 없는 곳, 재작업 W25)
      if (a.id !== e.id) return x.move === LEFT || x.move === UTURN ? 0 : x.move === RIGHT ? right : lane[i];
      const users: number[] = [];
      for (let l = 0; l < a.lanes; l++) if (X.laneMoves(a.id, l) & x.move) users.push(l);
      if (!users.length) return right;
      return x.move === LEFT || x.move === UTURN ? users[0] : users[users.length - 1];
    }
    return right;
  }
  function laneGap(i: number, e: Edge, tl: number): boolean {
    for (const j of lists[e.id]) {
      if (j === i || lane[j] !== tl) continue;
      const d = s[j] - s[i];
      const room = Math.abs(d) - (size[i] + size[j]) / 2;
      if (d >= 0 ? room < 2 + 0.6 * v[i] : room < 3 + 1.2 * v[j]) return false;
    }
    return true;
  }
  /** 차로를 바꿀 수 없는 곳: 교차로 앞 실선 구간(게이트 30m 앞 안), 상자·이음매 곡선 위, 경로를 고른 뒤 */
  const solid = (i: number, e: Edge) => (isApproach(e.id) && e.len - X.gate(e.id, lane[i]) - s[i] < 30) || s[i] < X.rOut[e.id] || s[i] > e.len - X.rIn[e.id] || pp[i] >= 0;
  const SL0 = [0, 0, 0, 0, 0];
  const SL1 = [0, 0, 0, 0, 0];
  function shiftLane(i: number, e: Edge, tl: number) {
    // 옆 거리는 그린 자리 차이로 넘긴다(중앙버스차로 버스가 승강장 비켜서기를 한 채 나올 때 그 거리만큼 튀던 것, 재작업 W25)
    pose(i, e.id, s[i], lane[i], SL0);
    const sd = side[i];
    side[i] = 0;
    pose(i, e.id, s[i], tl, SL1);
    side[i] = (SL0[0] - SL1[0]) * -Math.sin(SL1[3]) + (SL0[2] - SL1[2]) * Math.cos(SL1[3]);
    if (!Number.isFinite(side[i])) side[i] = sd + laneOff(e, lane[i], s[i]) - laneOff(e, tl, s[i]);
    lane[i] = tl;
    pref[i] = (tl + 0.5) / e.lanes;
    // 고른 경로는 새 차로에서 다시 고른다
    if (jp[i] >= 0 && jk[i] === 0 && !go[i]) {
      dropPath(i);
      onEdge(i, e);
    }
  }

  // ── 몸통 겹침 막기: 한 걸음(옆으로 옮겨 가는 것도) 간 자리가 다른 차 몸통과 새로 겹치면 가지 않는다 ──
  const PC = [0, 0, 0, 0, 0];
  let hitBy = -1;
  const blockBy = new Int32Array(max).fill(-1);
  /** 이번 걸음은 방향을 바꾸지 않고 나아간다(뒤에 선 차 쪽으로 꽁무니를 돌리지 않게, 재작업 W25) */
  const holdYaw = new Uint8Array(max);
  /** 차 j 가 차 i 뒤에 있는가: i 가운데가 j 앞 범퍼보다 j 진행 방향으로 앞이고, j 가 i 진행 방향으로 뒤다 */
  const behind = (i: number, j: number) =>
    (cars.x[i] - cars.x[j]) * Math.cos(cars.yaw[j]) + (cars.z[i] - cars.z[j]) * Math.sin(cars.yaw[j]) > size[j] / 2 &&
    (cars.x[j] - cars.x[i]) * Math.cos(cars.yaw[i]) + (cars.z[j] - cars.z[i]) * Math.sin(cars.yaw[i]) < 0;
  const blockUid = new Int32Array(max);
  function hit(ax: number, az: number, ay: number, al: number, aw: number, bx: number, bz: number, by: number, bl: number, bw: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    for (let k = 0; k < 4; k++) {
      const t = k === 0 ? ay : k === 1 ? ay + Math.PI / 2 : k === 2 ? by : by + Math.PI / 2;
      const ux = Math.cos(t);
      const uz = Math.sin(t);
      const ra = Math.abs(al * Math.cos(ay - t)) + Math.abs(aw * Math.sin(ay - t));
      const rb = Math.abs(bl * Math.cos(by - t)) + Math.abs(bw * Math.sin(by - t));
      if (Math.abs(dx * ux + dz * uz) >= ra + rb) return false;
    }
    return true;
  }
  /** 두 회전 사각형이 겹친 깊이(m, 분리축마다 겹친 길이 가운데 가장 짧은 것). 떨어져 있으면 0 이하 */
  function depth(ax: number, az: number, ay: number, al: number, aw: number, bx: number, bz: number, by: number, bl: number, bw: number): number {
    const dx = bx - ax;
    const dz = bz - az;
    let m = Infinity;
    for (let k = 0; k < 4; k++) {
      const t = k === 0 ? ay : k === 1 ? ay + Math.PI / 2 : k === 2 ? by : by + Math.PI / 2;
      const ux = Math.cos(t);
      const uz = Math.sin(t);
      const ra = Math.abs(al * Math.cos(ay - t)) + Math.abs(aw * Math.sin(ay - t));
      const rb = Math.abs(bl * Math.cos(by - t)) + Math.abs(bw * Math.sin(by - t));
      m = Math.min(m, ra + rb - Math.abs(dx * ux + dz * uz));
    }
    return m;
  }
  // ── 사람 몸(재작업 W22): 차는 사람 몸(반지름 PED_R)에 새로 닿는 걸음을 하지 않고, 앞길에 선 사람 0.4m 앞에 선다(사람이 비켜 간다) ──
  let peds: { n: number; x: Float32Array; z: Float32Array } | null = null;
  const PED_R = 0.4;
  let pedHead = new Int32Array(0);
  let pedNext = new Int32Array(0);
  function pedGrid() {
    if (!peds) return;
    if (pedHead.length !== GW * GW) pedHead = new Int32Array(GW * GW);
    if (pedNext.length < peds.n) pedNext = new Int32Array(peds.x.length);
    pedHead.fill(-1);
    for (let k = 0; k < peds.n; k++) {
      const c = cellAt(peds.x[k]) * GW + cellAt(peds.z[k]);
      pedNext[k] = pedHead[c];
      pedHead[c] = k;
    }
  }
  /** 차 몸통(가운데 x, z, 방향 yaw, 반길이 hl, 반폭 hw)이 사람 몸에 들어간 가장 깊은 값(0 이면 안 닿음). 높이가 다른 차(지하차도·경사·고가)는 0 */
  function pedDepth(x: number, z: number, y: number, yaw: number, hl: number, hw: number): number {
    if (!peds || Math.abs(y) > 0.6) return 0;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    let m = 0;
    for (let gx = cellAt(x - 8); gx <= cellAt(x + 8); gx++)
      for (let gz = cellAt(z - 8); gz <= cellAt(z + 8); gz++)
        for (let k = pedHead[gx * GW + gz]; k >= 0; k = pedNext[k]) {
          const dx = peds.x[k] - x;
          const dz = peds.z[k] - z;
          const a = hl + PED_R - Math.abs(dx * c + dz * sn);
          const b = hw + PED_R - Math.abs(-dx * sn + dz * c);
          if (a > 0 && b > 0) m = Math.max(m, Math.min(a, b));
        }
    return m;
  }
  /** 차 i 앞길(앞 범퍼에서 reach 안, 옆 반폭 + PED_R + 0.2)에 선 사람까지 앞 범퍼에서 사람 몸 가장자리 거리(없으면 ∞) */
  function pedAhead(i: number, reach: number): number {
    if (!peds || Math.abs(cars.y[i]) > 0.6) return Infinity;
    const hx = Math.cos(cars.yaw[i]);
    const hz = Math.sin(cars.yaw[i]);
    const hl = size[i] / 2;
    const cx = cars.x[i] + hx * (hl + reach / 2);
    const cz = cars.z[i] + hz * (hl + reach / 2);
    const r = reach / 2 + 2;
    let best = Infinity;
    for (let gx = cellAt(cx - r); gx <= cellAt(cx + r); gx++)
      for (let gz = cellAt(cz - r); gz <= cellAt(cz + r); gz++)
        for (let k = pedHead[gx * GW + gz]; k >= 0; k = pedNext[k]) {
          const dx = peds.x[k] - cars.x[i];
          const dz = peds.z[k] - cars.z[i];
          const along = dx * hx + dz * hz - hl - PED_R;
          if (along < -PED_R || along > reach || Math.abs(-dx * hz + dz * hx) > wid[i] + PED_R + 0.2) continue;
          best = Math.min(best, Math.max(0, along));
        }
    return best;
  }
  /** 차 i 를 (구간 eid, 거리 sv, 차로 ln) 자리에 두면 다른 차 몸통이나 사람 몸과 새로 겹치는가(이미 겹친 차·사람과는 더 다가가지 않으면 괜찮다) */
  function blockedAt(i: number, eid: number, sv: number, ln: number): boolean {
    pose(i, eid, sv, ln, PC);
    if (holdYaw[i]) PC[3] = cars.yaw[i];
    const hl = size[i] / 2;
    if (peds) {
      const dp = pedDepth(PC[0], PC[2], PC[1], PC[3], hl, wid[i]);
      if (dp > 0 && dp > pedDepth(cars.x[i], cars.z[i], cars.y[i], cars.yaw[i], hl, wid[i]) + 1e-4) {
        hitBy = -1;
        return true;
      }
    }
    // 둘러볼 칸: 아래 reach 의 가장 큰 값(가장 긴 차 반길이)까지만(차 계산 시간, 재작업 W29)
    const R = hl + HALF_MAX + 1;
    for (let gx = cellAt(PC[0] - R); gx <= cellAt(PC[0] + R); gx++)
      for (let gz = cellAt(PC[2] - R); gz <= cellAt(PC[2] + R); gz++)
        for (let j = cellHead[gx * GW + gz]; j >= 0; j = cellNext[j]) {
          if (j === i || j >= cars.n || Math.abs(cars.y[j] - PC[1]) > 2.5) continue;
          const reach = hl + size[j] / 2 + 1;
          if (Math.abs(cars.x[j] - PC[0]) > reach || Math.abs(cars.z[j] - PC[2]) > reach) continue;
          const dNew = depth(PC[0], PC[2], PC[3], hl, wid[i], cars.x[j], cars.z[j], cars.yaw[j], size[j] / 2, wid[j]);
          // 2cm 넘게 떨어져 있으면 괜찮다. 그보다 가까운(이미 겹친) 두 차는 더 다가가지만 않으면 괜찮다(돌면서 파고드는 것도 막는다)
          if (dNew <= -0.02) continue;
          if (dNew <= depth(cars.x[i], cars.z[i], cars.yaw[i], hl, wid[i], cars.x[j], cars.z[j], cars.yaw[j], size[j] / 2, wid[j])) continue;
          hitBy = j;
          return true;
        }
    return false;
  }

  const fresh: number[] = [];
  function touches(i: number): boolean {
    const near = (j: number) =>
      j !== i && j < cars.n && Math.abs(cars.y[j] - cars.y[i]) < 2.5 && hit(cars.x[i], cars.z[i], cars.yaw[i], size[i] / 2 + 0.5, wid[i] + 0.2, cars.x[j], cars.z[j], cars.yaw[j], size[j] / 2, wid[j]);
    for (let gx = cellAt(cars.x[i] - 14); gx <= cellAt(cars.x[i] + 14); gx++)
      for (let gz = cellAt(cars.z[i] - 14); gz <= cellAt(cars.z[i] + 14); gz++) for (let j = cellHead[gx * GW + gz]; j >= 0; j = cellNext[j]) if (near(j)) return true;
    return fresh.some(near);
  }

  // ── 차량 수(교차로와 상관없음) ──
  function density(now: Now): number {
    const weekend = now.dow === 0 || now.dow === 6;
    return 2.5 + 9 * commute(now.tod) * (weekend ? 0.5 : 1) + 4 * daytime(now.tod) + 2.5 * nightlife(now.tod);
  }
  const JAM = 100;
  const real = new Float32Array(edges.length);
  const inF = new Float32Array(edges.length);
  let focus: { x: number; z: number; r: number } | null = null;
  let seen: (x: number, z: number) => boolean = () => false;
  let nIn = 0;
  let nOut = 0;
  let ratioIn = 1;
  let ratioOut = 1;
  const cumIn = new Float64Array(edges.length);
  const cumOut = new Float64Array(edges.length);
  function allot(now: Now): number {
    const base = density(now);
    const busy = Math.min(1, Math.max(0, (base - 3) / 1.5));
    let F = 0;
    let O = 0;
    for (const e of edges) {
      const r = provider.roadSpeed(now, e.cls, e.key, midX[e.id], midZ[e.id], midH[e.id]);
      const curve = base + (JAM - base) * Math.max(0, Math.min(1, (0.65 - r) / 0.5));
      const k = Math.min(curve + (Math.min(curve, base / Math.max(r, 0.15)) - curve) * (1 - busy), 1000 / (6.6 + 1.3 * r * VFREE[e.cls]));
      real[e.id] = (k * e.len * (X.surveyed ? e.lanes : e.vol)) / 1000;
      F += real[e.id] * inF[e.id];
      O += real[e.id] * (1 - inF[e.id]);
    }
    const B = max - reserve;
    nIn = Math.min(F, B * 0.85);
    ratioIn = nIn > 0 ? F / nIn : 1;
    nOut = Math.min(O / ratioIn, B - nIn);
    ratioOut = nOut > 0 ? O / nOut : ratioIn;
    let ci = 0;
    let co = 0;
    for (const e of edges) {
      const l = lists[e.id];
      let vm = 0;
      for (const j of l) vm += v[j];
      meanV[e.id] = l.length ? vm / l.length : -1;
      const jammed = l.length > 0 && vm / l.length < 0.4 * speed[e.id];
      const w = !placeable[e.id] || jammed || closed[e.id] || inner(e.id) || (X.surveyed && carLanes(e) === 0) ? 0 : Math.max(0, real[e.id] * (inF[e.id] / ratioIn + (1 - inF[e.id]) / ratioOut) - l.length);
      ci += w * inF[e.id];
      co += w * (1 - inF[e.id]);
      cumIn[e.id] = ci;
      cumOut[e.id] = co;
    }
    return Math.round(nIn + nOut);
  }
  function setFocus(x: number, z: number, r: number, visible: (x: number, z: number) => boolean) {
    focus = { x, z, r };
    seen = visible;
    for (const e of edges) {
      let k = 0;
      let n = 0;
      for (let d = 5; d < e.len; d += 20, n++) {
        pointAt(e.p, e.cum, d, tmp);
        if (Math.hypot(tmp[0] - x, tmp[2] - z) < r) k++;
      }
      inF[e.id] = n ? k / n : Math.hypot(e.p[0] - x, e.p[2] - z) < r ? 1 : 0;
    }
  }
  const nearFocus = (x: number, z: number) => !!focus && Math.hypot(x - focus.x, z - focus.z) < focus.r;
  function pickEdge(cum: Float64Array): number {
    const total = cum[cum.length - 1];
    if (!(total > 0)) return -1;
    const x = rand() * total;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cum[m] < x) lo = m + 1;
      else hi = m;
    }
    return lo;
  }
  /** 새 차를 놓을 때 뒤 차 앞으로 비워 둘 거리(m) */
  const SPAWN_BACK = 40;
  /** 구간 e 에서 차를 놓을 수 있는 범위: 상자·이음매 곡선 3m 밖, 진입로는 게이트 8m 앞까지, 교차로 안 구간은 없음 */
  const spawnRange = (e: Edge): [number, number] => {
    if (inner(e.id)) return [0, -1];
    let lo = X.rOut[e.id] + 3;
    // 교차로에서 나온 길은 같은 교차로 다른 경로와 닿는 첫머리(clearOut) 너머에만 놓는다
    if (X.jStart[e.id] >= 0 && X.jEnd[e.id] !== X.jStart[e.id]) for (let l = 0; l < e.lanes; l++) lo = Math.max(lo, X.relEnd(e.id, l) + 3);
    const hi = isApproach(e.id) || S.midApproach.has(e.id) ? e.len - Math.max(X.gate(e.id, 0), X.gate(e.id, e.lanes - 1)) - 8 : e.len - X.rIn[e.id] - 3;
    return [lo, hi];
  };
  /** 구간 e 의 at 자리에 길이 len 인 차를 놓으면 몸(앞뒤 1m 여유)이 횡단보도 면에 걸치는가 */
  const onCrosswalk = (e: Edge, at: number, len: number) => {
    const sp = stops.xwAll(e.id);
    for (let q = 0; q < sp.length; q += 2) if (at + len / 2 + 1 > sp[q] && at - len / 2 - 1 < sp[q + 1]) return true;
    return false;
  };
  function spawnHidden(inside: boolean): boolean {
    const id = pickEdge(inside ? cumIn : cumOut);
    if (id < 0) return false;
    const e = edges[id];
    const [lo, hi] = spawnRange(e);
    if (hi <= lo) return false;
    const at = lo + rand() * (hi - lo);
    if (onCrosswalk(e, at, 5.5)) return false;
    const ln = carLane(e, rand() * carLanes(e));
    const seg = pointAt(e.p, e.cum, at, tmp);
    const yaw = headingAt(e.p, seg);
    const off = laneOff(e, ln, at);
    const x = tmp[0] - Math.sin(yaw) * off;
    const z = tmp[2] + Math.cos(yaw) * off;
    if (nearFocus(x, z) !== inside || seen(x, z)) return false;
    let ah = -1;
    for (const j of lists[id]) {
      if (lane[j] !== ln) continue;
      if (Math.abs(s[j] - at) < (size[j] + 4.6) / 2 + 2 + 1.3 * v[j]) return false;
      // 뒤 차 앞 SPAWN_BACK 안에는 놓지 않는다: 뒤 차가 횡단보도·교차로에 들어가며 잡아 둔 너머 자리를 새 차가 빼앗지 않게(재작업 W25)
      if (s[j] < at && at - s[j] < SPAWN_BACK) return false;
      if (s[j] > at && (ah < 0 || s[j] < s[ah])) ah = j;
    }
    if (at < SPAWN_BACK) for (const b of before[id]) for (const j of lists[b]) if (edges[b].len - s[j] + at < SPAWN_BACK) return false;
    const i = cars.n;
    put(i, e, at, ln);
    if (ah >= 0 && s[ah] - at < 60) v[i] = Math.min(v[i], v[ah]);
    cars.n++;
    locate(i);
    if (touches(i)) {
      cars.n--;
      return false;
    }
    lists[id].push(i);
    fresh.push(i);
    return true;
  }
  function dropHidden(inside?: boolean): boolean {
    const i = Math.floor(rand() * cars.n);
    if (cars.route[i] >= 0 || go[i] || pp[i] >= 0 || inner(edge[i]) || seen(cars.x[i], cars.z[i])) return false;
    if (inside === undefined ? stopT[i] < 90 : nearFocus(cars.x[i], cars.z[i]) !== inside) return false;
    remove(i);
    return true;
  }
  function fillBuses(now: Now) {
    routes.forEach((R, r) => {
      const h = busHeadway(R, now.tod);
      wait[r] = h ? rand() * h : 60;
      if (!h) return;
      const count = R.len / (h * 6.5);
      const k = Math.floor(count) + (rand() < count % 1 ? 1 : 0);
      for (let j = 0; j < k; j++) if (addBus(r, ((j + rand() * 0.6) / Math.max(1, count)) * R.len * Math.min(1, count)) && overlapsAny(cars.n - 1)) remove(cars.n - 1);
    });
  }
  /** 차 i 의 몸통(앞뒤 0.5m 여유)이 다른 어느 차와 겹치는가(자리 격자 없이, 처음 놓을 때) */
  function overlapsAny(i: number): boolean {
    for (let j = 0; j < cars.n; j++)
      if (j !== i && Math.abs(cars.x[j] - cars.x[i]) < 20 && Math.abs(cars.z[j] - cars.z[i]) < 20 && Math.abs(cars.y[j] - cars.y[i]) < 2.5 && hit(cars.x[i], cars.z[i], cars.yaw[i], size[i] / 2 + 0.5, wid[i] + 0.2, cars.x[j], cars.z[j], cars.yaw[j], size[j] / 2, wid[j])) return true;
    return false;
  }
  /** n대를 길에 놓는다(처음 화면이 비어 보이지 않게). 구간마다 실제 차 수에 초점 안·밖 비율을 나눈 밀도로, 같은 차로에서는 고른 간격으로 */
  function fill(n: number) {
    n = Math.min(n, max - reserve - (cars.n - nBus));
    if (n <= 0) return;
    const has = real.some((r) => r > 0);
    const piece: number[] = [];
    let total = 0;
    for (const e of edges) {
      if (!placeable[e.id] || closed[e.id]) continue;
      const perM = has ? real[e.id] / e.len : e.vol;
      const [lo, hi] = spawnRange(e);
      for (let d = lo; d < hi; d += 20) {
        const L = Math.min(20, hi - d);
        pointAt(e.p, e.cum, d + L / 2, tmp);
        total += perM * L * (nearFocus(tmp[0], tmp[2]) ? 1 / ratioIn : 1 / ratioOut);
        piece.push(e.id, d, L, total);
      }
    }
    if (!(total > 0)) return;
    const near = new Map<number, number[]>();
    const keyOf = (x: number, z: number) => Math.floor(x / 8) * 4096 + Math.floor(z / 8);
    for (let i = 0; i < cars.n; i++) (near.get(keyOf(cars.x[i], cars.z[i])) ?? near.set(keyOf(cars.x[i], cars.z[i]), []).get(keyOf(cars.x[i], cars.z[i]))!).push(i);
    for (let k = 0, p = 0; k < n; k++) {
      const x = ((k + rand() * 0.5) / n) * total;
      while (p + 4 < piece.length && piece[p + 3] < x) p += 4;
      const e = edges[piece[p]];
      const w = piece[p + 3] - (p ? piece[p - 1] : 0);
      const u = ((x - (piece[p + 3] - w)) / w) * piece[p + 2] * carLanes(e);
      const ln = carLane(e, u / piece[p + 2]);
      const i = cars.n;
      const at = Math.min(e.len - 0.1, piece[p + 1] + u - ln * piece[p + 2]);
      if (onCrosswalk(e, at, 5.5)) continue;
      put(i, e, at, ln);
      locate(i);
      const gx = Math.floor(cars.x[i] / 8);
      const gz = Math.floor(cars.z[i] / 8);
      let clash = false;
      for (let dx = -1; dx <= 1 && !clash; dx++)
        for (let dz = -1; dz <= 1 && !clash; dz++)
          for (const j of near.get((gx + dx) * 4096 + gz + dz) ?? [])
            if (Math.abs(cars.y[j] - cars.y[i]) < 2.5 && hit(cars.x[i], cars.z[i], cars.yaw[i], size[i] / 2 + 0.5, wid[i] + 0.2, cars.x[j], cars.z[j], cars.yaw[j], size[j] / 2, wid[j])) clash = true;
      if (clash) continue;
      (near.get(gx * 4096 + gz) ?? near.set(gx * 4096 + gz, []).get(gx * 4096 + gz)!).push(i);
      cars.fade[i] = 1;
      cars.n++;
    }
  }

  // ── 교차로 게이트 ──
  /** 차 i 의 앞 범퍼에서 고른 경로 게이트까지(m) */
  function gateDist(i: number): number {
    const P = PS[jp[i]];
    const a = edges[P.a];
    const toA = jk[i] < 0 ? edges[edge[i]].len - s[i] : -s[i];
    return toA + a.len - X.gate(P.a, P.lane) - size[i] / 2;
  }
  /** 나갈 차로(경로 끝 구간·차로)에 내가 설 자리가 있는가. 자리는 상자 끝이 아니라 그 차로가 지나는 횡단보도(상자 끝 20m 안) 끝부터 잰다(횡단보도 위에 서지 않게).
   *  나가는 길 끝이 게이트(다음 교차로·길 중간 신호)면, 그 직진이 내가 닿을 때까지 초록으로 남지 않는 한 그 게이트 앞까지만 설 수 있다 */
  function exitRoom(i: number, P: LanePath, tod: number): boolean {
    const x = edges[P.edges[P.edges.length - 1]];
    const xl = P.lanes[P.lanes.length - 1];
    let need = size[i] + 2.5;
    const mine: number[] = [];
    for (const h of held[P.j])
      if (h !== i && jp[h] >= 0 && PS[jp[h]].edges[PS[jp[h]].edges.length - 1] === x.id && PS[jp[h]].lanes[PS[jp[h]].lanes.length - 1] === xl) {
        need += size[h] + 2.5;
        mine.push(h);
      }
    const clear = X.relEnd(x.id, xl);
    let cap = Infinity;
    if (isApproach(x.id) || S.midApproach.has(x.id)) {
      const line = x.len - X.gate(x.id, xl === MED ? 0 : xl);
      const reach = (P.end - X.rOut[x.id] + line + size[i]) / Math.max(4, v[i]);
      if (!(S.state(x.id, STRAIGHT, tod) === GREEN && S.greenLeft(x.id, STRAIGHT, tod) > reach + 2)) cap = line - clear;
    }
    let d = -clear;
    let xp = xl === MED ? 0.5 : xl + 0.5;
    for (let e = x, k = 0; k < 4 && d < 40; k++) {
      // 달리는 차는 짐으로 더하고 첫 장애물까지 잰다(재작업 W37)
      for (let t = tail[e.id * 8 + (xl === MED && e.med ? MED : Math.min(e.lanes - 1, Math.floor(xp)))]; t >= 0; t = acc[t]) {
        if (t === i || mine.includes(t)) continue;
        const h = holdTail(t);
        if (h < Infinity) return Math.min(cap, d + h) >= need;
        need += size[t] + 2.5;
      }
      d += e.len;
      if (e.next.length !== 1) break;
      xp = lanePos(e, edges[e.next[0]], xp);
      e = edges[e.next[0]];
    }
    return cap >= need;
  }
  /** 고른 경로가 지금 차로에서 할 수 없는 움직임인가(노선을 지키느라 맞는 차로로 옮기지 못한 버스) */
  const wrongLane = (i: number) => jp[i] >= 0 && !(X.laneMoves(PS[jp[i]].a, PS[jp[i]].lane) & PS[jp[i]].move);
  /** 길 우선순위(작을수록 큰길) */
  const rankOf = (e: Edge) => e.cls * 10 - e.vol;
  /** 차 i 가 지금 게이트를 넘어 교차로에 들어가도 되는가 */
  const mayGo = (i: number, dist: number, tod: number) => gateWhy(i, dist, tod) === 0;
  /** 들어가면 안 되는 까닭: 0 들어간다, 1 빨간불, 2 노란불, 3 부딪는 경로의 차가 교차로를 잡음, 4 나갈 차로에 자리 없음, 5 우선 차 양보, 6 횡단보도 보행 초록 전에 못 빠져나감, 7 차로가 그 움직임을 못 함 */
  function gateWhy(i: number, dist: number, tod: number): number {
    const P = PS[jp[i]];
    // 차로가 그 움직임을 못 하면(맞는 차로로 옮기지 못한 버스) 옮길 때까지 들어가지 않는다(재작업 W25)
    if (wrongLane(i)) return 7;
    const sig = S.approach.has(P.a);
    if (sig) {
      const st = S.state(P.a, P.move, tod);
      if (st === RED) return 1;
      if (st === YELLOW) return go[i] === 1 && dist < (v[i] * v[i]) / (2 * B_AMBER) + 0.3 ? 0 : 2;
    }
    // 교차로를 잡은 차 가운데 몸이 닿을 수 있는 경로의 차가 있으면 기다린다(재작업 W25: 경로 가운데선 거리가 아니라 두 차 몸 자리로 견준다)
    for (const h of held[P.j]) {
      if (h === i) continue;
      const hp = jp[h] >= 0 && PS[jp[h]].j === P.j ? jp[h] : pp[h];
      if (hp < 0) continue;
      if (!X.touchAfter) {
        if (X.touch(P.id, hp, bigOf(i), bigOf(h))) return 3;
      } else {
        const Q = PS[hp];
        const k = Q.edges.indexOf(edge[h]);
        const progress = k >= 0 ? Q.base[k] + s[h] : pp[h] === hp ? pd[h] : -Infinity;
        if (X.touchAfter(P.id, hp, bigOf(i), bigOf(h), progress)) return 3;
      }
    }
    if (!exitRoom(i, P, tod)) return 4;
    // 양보: 신호 교차로의 양보 움직임, 신호 없는 교차로의 작은 길
    const yieldsNow = sig ? S.yields(P.a, P.move, tod) : true;
    if (yieldsNow) {
      for (const a of coming[P.j]) {
        if (a === i || go[a] || jp[a] < 0 || PS[jp[a]].j !== P.j || !X.conflict(P.id, jp[a])) continue;
        const da = gateDist(a);
        const eta = da / Math.max(v[a], 0.5);
        const Q = PS[jp[a]];
        if (sig) {
          if (S.state(Q.a, Q.move, tod) !== GREEN || S.yields(Q.a, Q.move, tod)) continue;
          if (eta < 5 || da < 3) return 5;
        } else {
          const ra = rankOf(edges[Q.a]);
          const ri = rankOf(edges[P.a]);
          if (ra < ri && eta < 4.5 && waitT[i] < 20) return 5;
          if (ra === ri && da < 3 && (waitT[a] > waitT[i] + 1 || (Math.abs(waitT[a] - waitT[i]) <= 1 && cars.uid[a] < cars.uid[i]))) return 5;
        }
      }
    }
    // 게이트 뒤 횡단보도 가운데 그 앞에 서면 몸이 상자에 남는 것들(재작업 W22): 그 너머에 내가 다 들어갈 자리가 있고, 보행 초록이 켜지기 전에 다 지난다
    xwAhead(i, Math.max(60, dist + 60), true);
    let c0 = Infinity;
    let c1 = -Infinity;
    let a = -1;
    let b = -1;
    const zones: number[] = [];
    for (let g = 0; g < XG.length; g += 4)
      if (bound(i, XG[g], XG[g + 1])) {
        if (a < 0) (a = XG[g + 2]), (c0 = XG[g]);
        c1 = XG[g + 1];
        b = XG[g + 3];
        zones.push(...XZ[g / 4]);
      }
    skipLoads = true;
    const ok = a < 0 || clearOk(i, c0, c1, a, b, tod, zones);
    skipLoads = false;
    return ok ? 0 : 6;
  }

  /** 길 중간 보행 신호 진입로 a(게이트까지 dist)를 지금 지나가도 되는가: 초록이고, 노란불은 편히 못 설 때만. 횡단보도는 횡단보도 지키기가 따로 본다 */
  function midGo(i: number, a: Edge, dist: number, tod: number): boolean {
    const st = S.state(a.id, STRAIGHT, tod);
    if (st === RED) return false;
    if (st === YELLOW) return dist < (v[i] * v[i]) / (2 * B_AMBER) + 0.3;
    return true;
  }

  // ── 횡단보도 지키기(재작업 W22, 설계 문서 49절) ──
  // 차는 횡단보도 면(stops.xwOf: 차로 가운데선과 양옆 1m 가 면 위를 지나는 구간)에 앞 범퍼를 들이기 전에 정한다. 들어가는 것은
  // 그 너머에 내 몸이 다 들어갈 자리가 있고(앞차 꽁무니, 초록이 남지 않을 다음 게이트), 신호 횡단보도면 보행 신호가 빨강이고 따라가기 규칙대로 달려
  // 뒤꽁무니가 면을 다 지나기 1초 전까지 보행 초록이 켜지지 않을 때뿐이다. 내 몸 길이 + 3m 안으로 이어진 횡단보도는 한 묶음으로 본다(그 사이에 서면 앞 것에 걸친다).
  // 교차로 게이트 뒤 묶음 가운데 그 앞에 서면 몸이 교차로 상자에 남는 것은 게이트에서 함께 정하고(gateWhy 6), 게이트를 넘은 뒤에는 서지 않는다.
  /** 반대 방향 차로와 포개진 구간: 차로 가운데선이 반대 방향 다른 구간 차로 가운데선과 2m 안(차로 자료 어긋남, 홍대입구역 앞 양화로 e29·e361 과 e95·e371 같은 곳).
   *  차로마다 [s0, s1, ...]. 횡단보도 면처럼 그 안에서 서지 않는다(서 있으면 마주 오는 차가 몸통 겹침 막기에 걸려 둘 다 굳는다) */
  const clash: Float32Array[] = [];
  /** 포개진 구간마다 [자리 번호 × 2 + 쪽](clash 와 같은 차례) */
  const clashZone: Int32Array[] = [];
  /** 포개진 자리마다 지금 들어선 쪽(비트 1 쪽 0, 비트 2 쪽 1). 마주 오는 두 쪽은 함께 들어서지 않는다(재작업 W25) */
  let zoneOcc = new Uint8Array(0);
  /** 차가 잡은 포개진 자리(자리 × 2 + 쪽, 없으면 −1)와 그 자리를 다 지날 때까지 남은 거리(m) */
  const zclaim = new Int32Array(max).fill(-1);
  const zLeft = new Float32Array(max);
  // 성기게 돌리기(재작업 W29): setDetail 로 켜면, 보는 곳 둘레 밖이고 화면에도 없는 차는 COARSE 걸음에 한 번(차례는 고유 번호로 나눈다) 밀린 시간만큼 한 번에 움직인다.
  // 판 전체 차 3,000여 대 가운데 보는 곳 안은 100~300대라 차 계산 대부분이 화면 밖 차였다. 보는 곳 안·화면 안 차는 그대로 매 걸음 정한다
  const COARSE = 3;
  let detail: ((x: number, z: number) => boolean) | null = null;
  const coarse = new Uint8Array(max);
  const owe = new Float64Array(max);
  const cdt = new Float64Array(max);
  let tick = 0;
  let coarseAge = Infinity;
  {
    const C2 = 4;
    const px: number[] = [];
    const pz: number[] = [];
    const ph: number[] = [];
    const py: number[] = [];
    const key: number[] = [];
    const ps: number[] = [];
    const P3 = [0, 0, 0];
    for (const e of edges)
      for (const l of [...Array.from({ length: e.lanes }, (_, q) => q), ...(e.med ? [MED] : [])])
        for (let sv = 0; sv <= e.len; sv += 1) {
          pointAt(e.p, e.cum, Math.min(sv, e.len), P3);
          const off = laneOff(e, l, sv);
          const h = headingNear(e, sv, off);
          px.push(P3[0] - Math.sin(h) * off);
          pz.push(P3[2] + Math.cos(h) * off);
          py.push(P3[1]);
          ph.push(h);
          key.push(e.id * 8 + l);
          ps.push(sv);
        }
    const grid = new Map<number, number[]>();
    for (let k = 0; k < px.length; k++) {
      const c = Math.floor(px[k] / C2) * 100003 + Math.floor(pz[k] / C2);
      (grid.get(c) ?? grid.set(c, []).get(c)!).push(k);
    }
    const hits = new Map<number, number[]>();
    const pairs: number[] = [];
    for (let k = 0; k < px.length; k++) {
      const gx = Math.floor(px[k] / C2);
      const gz = Math.floor(pz[k] / C2);
      let hit = -1;
      for (let dx = -1; dx <= 1 && hit < 0; dx++)
        for (let dz = -1; dz <= 1 && hit < 0; dz++)
          for (const q of grid.get((gx + dx) * 100003 + gz + dz) ?? []) {
            if (key[q] >> 3 === key[k] >> 3 || Math.cos(ph[q] - ph[k]) > -0.8 || Math.abs(py[q] - py[k]) > 2.5) continue;
            if (Math.hypot(px[q] - px[k], pz[q] - pz[k]) < 2) {
              hit = q;
              break;
            }
          }
      if (hit >= 0) {
        (hits.get(key[k]) ?? hits.set(key[k], []).get(key[k])!).push(ps[k]);
        pairs.push(k, hit);
      }
    }
    for (const [kk, list] of hits) {
      const out: number[] = [];
      for (const sv of list) {
        if (out.length && sv - 1 <= out[out.length - 1] + 1.5) out[out.length - 1] = sv + 1;
        else out.push(Math.max(0, sv - 1), sv + 1);
      }
      clash[kk] = Float32Array.from(out);
    }
    // 포개진 구간 묶기(재작업 W25): 서로 포개진 두 방향 구간을 한 '포개진 자리'로 묶고, 자리마다 방향(쪽 0·1)을 정한다
    const nodeOf = (kk: number, sv: number) => {
      const sp = clash[kk];
      for (let m = 0; m < sp.length; m += 2) if (sv >= sp[m] - 1e-3 && sv <= sp[m + 1] + 1e-3) return `${kk},${m}`;
      return '';
    };
    const parent = new Map<string, string>();
    const find = (a: string): string => {
      let r = a;
      while (parent.get(r) !== r) r = parent.get(r)!;
      parent.set(a, r);
      return r;
    };
    for (const [kk, sp] of Object.entries(clash)) for (let m = 0; m < sp.length; m += 2) parent.set(`${kk},${m}`, `${kk},${m}`);
    for (let n = 0; n < pairs.length; n += 2) {
      const a = nodeOf(key[pairs[n]], ps[pairs[n]]);
      const b = nodeOf(key[pairs[n + 1]], ps[pairs[n + 1]]);
      if (a && b) parent.set(find(a), find(b));
    }
    const zid = new Map<string, number>();
    const ref: number[] = [];
    for (const [kk, sp] of Object.entries(clash)) {
      const k = Number(kk);
      const zs = new Int32Array(sp.length / 2);
      for (let m = 0; m < sp.length; m += 2) {
        const r = find(`${kk},${m}`);
        let z = zid.get(r);
        const h = headingNear(edges[k >> 3], (sp[m] + sp[m + 1]) / 2);
        if (z === undefined) {
          zid.set(r, (z = ref.length));
          ref.push(h);
        }
        zs[m / 2] = z * 2 + (Math.cos(h - ref[z]) > 0 ? 0 : 1);
      }
      clashZone[k] = zs;
    }
    zoneOcc = new Uint8Array(ref.length);
  }
  /** 묶음 [c0, c1, XW 시작, XW 끝]: 앞 범퍼에서 길 따라 거리(m) */
  const XG: number[] = [];
  /** 묶음의 신호 횡단보도 번호 */
  const XW: number[] = [];
  const walkEnds: number[] = [];
  /** 묶음마다 든 포개진 자리(자리 × 2 + 쪽) */
  const XZ: number[][] = [];
  /** 앞길 구간 [구간, 차로, 앞 범퍼에서 그 구간 시작까지 거리] */
  const XP: number[] = [];
  const SW = [0, 0, 0, 0, 0];
  /** 앞길을 따라 내 몸을 앞으로 옮겨 그려 보며(1m 간격) 다른 차 몸에 처음 닿는 앞 범퍼 거리(없으면 ∞, reach 까지).
   *  곧은 띠(bodyAhead)가 못 보는 굽은 길·포개진 차로·옆으로 옮겨 가는 차를 너머 자리에서 뺀다(재작업 W25) */
  function sweepAhead(i: number, reach: number): number {
    const hl = size[i] / 2;
    const sd = side[i];
    // 앞길 구간마다 내 옆 거리: 지금 구간은 지금 옆 거리, 꺾이지 않은 이음매 너머는 이음매에서 넘겨받을 옆 거리(그린 자리가 이어지게 걸음이 넘기는 값과 같은 식).
    // 전에는 이음매 너머를 차로 가운데(0)로 그려 보아, 차로 나눔이 어긋난 이음매(월드컵로 e343 → e49, 2.8m)를 넘자마자 옆 차로 차에 막혀 횡단보도 위에 섰다(재작업 W29)
    XS.length = 0;
    for (let k = 0; k < XP.length; k += 3) {
      if (k === 0) {
        XS.push(XP[0] === edge[i] ? sd : 0);
        continue;
      }
      const pe = edges[XP[k - 3]];
      const e = edges[XP[k]];
      let w = 0;
      if (!X.surveyed && X.jEnd[pe.id] < 0 && !bent(pe, e)) {
        side[i] = XS[XS.length - 1];
        pose(i, pe.id, pe.len, XP[k - 2], PS0);
        side[i] = 0;
        pose(i, e.id, 0, XP[k + 1], PS1);
        w = (PS0[0] - PS1[0]) * -Math.sin(PS1[3]) + (PS0[2] - PS1[2]) * Math.cos(PS1[3]);
        if (!Number.isFinite(w)) w = 0;
      }
      XS.push(w);
    }
    for (let x = 1; x <= reach; x += 1) {
      const c = x - hl;
      let k = 0;
      while (k + 3 < XP.length && XP[k + 5] <= c) k += 3;
      const id = XP[k];
      if (id === undefined) break;
      const sv = Math.min(edges[id].len, Math.max(0, c - XP[k + 2]));
      // 옆 거리가 남은 동안은 차로 가운데로 옮겨 가며 지나는 자리(옆 거리의 2/3·1/3·0)도 그려 본다(재작업 W32):
      // 이음매에서 넘겨받은 옆 거리 그대로만 그리면 옮겨 가며 지나는 옆 차로에 선 차를 못 봤다(월드컵로 xw430 e49, 옆 거리 5.9m)
      const sk = XS[k / 3];
      for (let q = 0, nq = Math.abs(sk) > 0.3 ? 4 : 1; q < nq; q++) {
        side[i] = sk * (1 - q / 3);
        pose(i, id, sv, XP[k + 1], SW);
        side[i] = sd;
        for (let gx = cellAt(SW[0] - 8); gx <= cellAt(SW[0] + 8); gx++)
          for (let gz = cellAt(SW[2] - 8); gz <= cellAt(SW[2] + 8); gz++)
            for (let j = cellHead[gx * GW + gz]; j >= 0; j = cellNext[j]) {
              if (j === i || j >= cars.n || Math.abs(cars.y[j] - SW[1]) > 2.5 || (skipLoads && loadMk[j] === loadStamp)) continue;
              if (Math.abs(cars.x[j] - SW[0]) > hl + size[j] / 2 + 2 || Math.abs(cars.z[j] - SW[2]) > hl + size[j] / 2 + 2) continue;
              const dn = depth(SW[0], SW[2], SW[3], hl, wid[i], cars.x[j], cars.z[j], cars.yaw[j], size[j] / 2, wid[j]);
              // 지금 이미 그만큼 가까이 나란히 있는 차는 빼고, 더 가까워지는 차만
              if (dn > -0.1 && dn > depth(cars.x[i], cars.z[i], cars.yaw[i], hl, wid[i], cars.x[j], cars.z[j], cars.yaw[j], size[j] / 2, wid[j]) + 0.01) return x - 1;
              // 옆으로 옮겨 가는 차는 옮겨 갈 자리(옆 거리 0)에서도 본다(재작업 W29)
              if (Math.abs(side[j]) > 0.3) {
                restPose(j, RP);
                const dr = depth(SW[0], SW[2], SW[3], hl, wid[i], RP[0], RP[2], RP[3], size[j] / 2, wid[j]);
                if (dr > -0.1 && dr > depth(cars.x[i], cars.z[i], cars.yaw[i], hl, wid[i], RP[0], RP[2], RP[3], size[j] / 2, wid[j]) + 0.01) return x - 1;
              }
            }
      }
    }
    return Infinity;
  }
  /** 앞길 구간마다 그려 볼 내 옆 거리(XP 와 같은 차례) */
  const XS: number[] = [];
  const RP = [0, 0, 0, 0, 0];
  /** 옆으로 옮겨 가는 차 j 가 옮겨 갈 자리(옆 거리 0) */
  function restPose(j: number, out: number[]) {
    const sd = side[j];
    side[j] = 0;
    pose(j, edge[j], s[j], lane[j], out);
    side[j] = sd;
  }
  /** 앞 게이트 [앞 범퍼에서 거리, 진입로, 차로] */
  const XT: number[] = [];
  /** 길 따라 앞차 꽁무니, 고른 경로의 상자 끝, 지나온 경로의 상자 끝, 고른 경로 게이트(넘었으면 −∞): 앞 범퍼에서 거리 */
  const XA = { lead: Infinity, boxEnd: -Infinity, ppEnd: -Infinity, gate: -Infinity, load: 0, v0: Infinity, first: -1, firstAt: Infinity };
  // ── 줄 지어 들어가기(재작업 W37, 설계 문서 57절) ──
  // 교차로 게이트에서 나갈 차로 자리·건너편 횡단보도 너머 자리를 잴 때, 같은 길을 앞서 달리는 차는 서 있는 장애물이 아니라 내 앞에 함께 설 짐(몸 길이 + 2.5m)으로 보고
  // 그 앞 첫 장애물(서 있는 차, 앞 게이트 앞에 설 차, 초록이 남지 않을 게이트)까지 잰다(자리 보존: 짐이 모두 장애물 뒤에 붙어 서도 내 몫이 남을 때만 들어간다).
  // 전에는 앞차 꽁무니를 서 있는 장애물로 재어, 뒤차가 앞차가 상자와 건너편 횡단보도를 다 지날 때까지 게이트에서 기다렸다(합정 교차로 9 약 12초에 한 대)
  const V_MOVER = 2;
  /** 차 j 가 달리며 제 앞길을 비워 가는 차인가: 2m/s 넘게 달리고, 지난 걸음에 제 정지선·횡단보도 앞에 서려던 차가 아니며, 따라가는 것이 없거나 같은 차로 앞차이고
   *  그 앞차도 달리며(서 있는 앞차 뒤에는 곧 선다), 앞 게이트를 이미 들어가기로 정했거나 앞 게이트가 없다 */
  function mover(j: number): boolean {
    if (v[j] < V_MOVER || ahead[j] === j || aheadWhy[j] > 2) return false;
    if (ahead[j] >= 0 && ahead[j] < cars.n && v[ahead[j]] < 1) return false;
    return !(jp[j] >= 0 && !go[j] && !past[j]);
  }
  /** 짐이 아닌 차 j 의 꽁무니가 설 자리(구간 위 거리): 앞 게이트를 아직 정하지 않고 그 게이트 말고는 따라가는 것이 없는 달리는 차는 게이트 앞까지 간다 */
  function stopTail(j: number): number {
    const t = s[j] - size[j] / 2;
    if (v[j] < V_MOVER || jp[j] < 0 || go[j] || past[j] || (ahead[j] >= 0 && ahead[j] !== j)) return t;
    return Math.max(t, s[j] + size[j] / 2 + Math.max(0, Math.min(gateDist(j), gdist[j]) - 1.7) - size[j]);
  }
  /** 차 j 의 꽁무니가 가장 일찍 설 수 있는 자리(구간 위 거리). 짐이면(달리며 앞길을 비워 가고 그 앞에 아직 정하지 않은 게이트가 없다) ∞.
   *  들어가기로 정한 경로의 나가는 길이 다음 교차로 진입로·길 중간 신호면 그 게이트에서 다시 정하므로 그 앞에 설 수 있다(합정 교차로 9 → e317: 앞차가 다음 교차로 게이트에서
   *  경로 예약을 기다리며 서자 뒤따라 들어온 차가 건너편 횡단보도 위에 섰다, 재작업 W37) */
  function holdTail(j: number): number {
    if (!mover(j)) return stopTail(j);
    if (jp[j] < 0) return Infinity;
    const P = PS[jp[j]];
    const x = edges[P.edges[P.edges.length - 1]];
    if (!isApproach(x.id) && !S.midApproach.has(x.id)) return Infinity;
    // 지금 구간 시작에서 나가는 길 시작까지
    let d = jk[j] < 0 ? edges[edge[j]].len : 0;
    for (let k = Math.max(0, jk[j]); k < P.edges.length - 1; k++) d += edges[P.edges[k]].len;
    const xl = P.lanes[P.lanes.length - 1];
    const line = d + x.len - X.gate(x.id, xl === MED ? 0 : xl);
    // 그 게이트가 j 가 닿을 때까지 초록으로 남는 신호면 지나간다고 본다. 신호 없는 교차로는 지금 그 교차로를 잡은 차나 곧 들어설 차가 없을 때만
    if (S.approach.has(x.id) || S.midApproach.has(x.id)) {
      if (S.state(x.id, STRAIGHT, nowTod) === GREEN && S.greenLeft(x.id, STRAIGHT, nowTod) > (line - s[j]) / Math.max(4, v[j]) + 2) return Infinity;
    } else {
      const jn = X.jEnd[x.id];
      // 같은 진입로·같은 차로로 앞서 들어간 차(j 와 같은 줄)는 뺀다
      const other = (h: number) => {
        const hp = jp[h] >= 0 && PS[jp[h]].j === jn ? jp[h] : pp[h];
        return h !== j && !(hp >= 0 && PS[hp].a === x.id && PS[hp].lane === xl);
      };
      if (!held[jn].some(other) && !coming[jn].some((c) => other(c) && gateDist(c) < 20)) return Infinity;
    }
    return line - 1 - size[j];
  }
  /** 지금 걸음 시각(초, 하루 안) */
  let nowTod = 0;
  /** 짐으로 본 차 표시(xwAhead 줄 지어 보기 한 번마다 새 번호) */
  const loadMk = new Uint32Array(max);
  let loadStamp = 0;
  /** 너머 자리 그려 보기(bodyAhead·sweepAhead)에서 짐으로 본 차를 뺄까 */
  let skipLoads = false;
  /** 차 t 부터 같은 구간·차로 앞쪽(acc)으로 짐인 차는 XA.load 에 더하고 표시한 뒤, 첫 장애물 꽁무니 자리(off 를 더한 앞 범퍼 기준)를 돌린다. 끝까지 짐이면 ∞ */
  function chainLead(i: number, t: number, off: number): number {
    for (; t >= 0; t = acc[t]) {
      if (t === i || loadMk[t] === loadStamp) continue;
      const h = holdTail(t);
      if (h < Infinity) return off + h;
      loadMk[t] = loadStamp;
      if (XA.first < 0) (XA.first = t), (XA.firstAt = off + s[t] - size[t] / 2);
      XA.load += size[t] + 2.5;
    }
    return Infinity;
  }
  function xwAhead(i: number, reach: number, platoon = false) {
    XG.length = 0;
    XW.length = 0;
    walkEnds.length = 0;
    XZ.length = 0;
    XP.length = 0;
    XT.length = 0;
    const e0 = edges[edge[i]];
    const head = s[i] + size[i] / 2;
    const xEnd = jp[i] >= 0 ? PS[jp[i]].edges[PS[jp[i]].edges.length - 1] : -1;
    const ppX = pp[i] >= 0 ? PS[pp[i]].edges[PS[pp[i]].edges.length - 1] : -1;
    XA.boxEnd = jp[i] >= 0 ? Infinity : -Infinity;
    XA.ppEnd = pp[i] >= 0 ? Infinity : -Infinity;
    XA.gate = jp[i] >= 0 && !past[i] ? gateDist(i) : -Infinity;
    XA.lead = Infinity;
    XA.v0 = Infinity;
    XA.load = 0;
    XA.first = -1;
    XA.firstAt = Infinity;
    if (platoon) {
      loadStamp++;
      if (acc[i] >= 0) XA.lead = chainLead(i, acc[i], -head);
      const lt = leaveTail[e0.id * 8 + lane[i]];
      if (XA.lead === Infinity && lt >= 0 && lt !== i) XA.lead = chainLead(i, lt, e0.len - head);
    } else if (acc[i] >= 0) XA.lead = s[acc[i]] - size[acc[i]] / 2 - head;
    else {
      const lt = leaveTail[e0.id * 8 + lane[i]];
      if (lt >= 0 && lt !== i) XA.lead = e0.len - head + s[lt] - size[lt] / 2;
    }
    let off = -head;
    let load = 0;
    let pRear = Infinity;
    let ln = lane[i];
    let xp = pref[i] * e0.lanes;
    let pe = e0;
    // 짐(모일 차·줄 지어 달리는 앞차)이 있으면 그만큼 더 멀리 장애물을 찾는다: 짐은 장애물 뒤에 붙어 서므로, reach 밖 장애물이라도 짐을 빼면 reach 안이 된다(재작업 W37).
    // 전에는 reach(40m) 안에서만 찾아, 홍대입구 e94 → e371 → e95(차로가 줄어드는 이음매, 모일 차 짐 20.8m) 에서 reach 밖에 선 차를 못 보고 xw726 에 들어가 섰다
    for (let id = e0.id, k = 0; id >= 0 && k < 8 && off < reach + load + XA.load; k++) {
      const e = edges[id];
      if (k > 0) {
        xp = lanePos(pe, e, xp);
        const pl = pathLane(i, id);
        ln = pl >= 0 ? pl : laneAt(i, e, xp);
        if (pl >= 0) xp = ln === MED ? 0.5 : ln + 0.5;
        const t = tail[id * 8 + ln];
        if (XA.lead === Infinity && t >= 0 && t !== i) XA.lead = platoon ? chainLead(i, t, off) : off + s[t] - size[t] / 2;
      }
      // 차로 수가 줄어드는 이음매 앞 구간: 다른 차로에서 내 다음 차로로 모일 차도 앞차로 본다(모이는 차 뒤에 서서 횡단보도에 걸치지 않게)
      const nx = k === 0 ? nextE[i] : laterEdge(i, e);
      // 차로가 모이는 이음매 앞 구간(차로 수가 줄거나, 차로 자리로 이어 두 차로가 한 차로로 모인다): 다른 차로에서 내 다음 차로로 모일 차 가운데
      // 모이는 차례가 나보다 앞인 차(구간 위 자리가 앞)는 내 앞에 선다. 앞차 자리 = min(그 차 꽁무니, 차로 앞차 꽁무니 − 그 차들 길이)
      if (ln !== MED && nx >= 0 && X.jEnd[id] < 0 && mergeSeam[id]) {
        const ne = edges[nx];
        // 모일 차로는 앞차 따라가기의 차로 합침(why 3)과 같게 고른다
        const tl = laneAt(i, ne, lanePos(e, ne, xp));
        const first = (j: number) => s[j] > s[i] || (s[j] === s[i] && cars.uid[j] < cars.uid[i]);
        for (const j of lists[id]) {
          if (j === i || lane[j] === ln || lane[j] === MED || (k === 0 && !first(j))) continue;
          if (nextE[j] !== ne.id || laneAt(j, ne, lanePos(e, ne, pref[j] * e.lanes)) !== tl) continue;
          pRear = Math.min(pRear, Math.max(0, off + s[j] - size[j] / 2));
          load += size[j] + 2.5;
        }
        if (k === 1)
          for (const j of lists[e0.id]) {
            if (j === i || lane[j] === lane[i] || lane[j] === MED || !first(j)) continue;
            if (nextE[j] !== e.id) continue;
            const xj = lanePos(e0, e, pref[j] * e0.lanes);
            if (laneAt(j, e, xj) === ln || laneAt(j, ne, lanePos(e, ne, xj)) !== tl) continue;
            pRear = Math.min(pRear, Math.max(0, s[j] - size[j] / 2 - head));
            load += size[j] + 2.5;
          }
      }
      // 이 구간 이 차로의 횡단보도 면 구간과 반대 방향 차로와 포개진 구간(신호 없는 묶음), 길 따라 차례로
      const q = stops.xwOf(id, ln === MED ? 0 : ln);
      const cl = clash[id * 8 + ln];
      for (let m = 0, c = 0; m < q.length || (cl && c < cl.length); ) {
        const useX = m < q.length && (!cl || c >= cl.length || q[m] <= cl[c]);
        const c0 = off + (useX ? q[m] : cl![c]);
        const c1 = off + (useX ? q[m + 1] : cl![c + 1]);
        const x = useX ? q[m + 2] : -1;
        const zc = useX ? -1 : clashZone[id * 8 + ln][c / 2];
        if (useX) m += 4;
        else c += 2;
        if (c1 < -size[i] - 1) continue;
        const n = XG.length;
        if (n && c0 <= XG[n - 3] + size[i] + 3) XG[n - 3] = Math.max(XG[n - 3], c1);
        else XG.push(c0, c1, XW.length, XW.length), XZ.push([]);
        if (zc >= 0 && !XZ[XZ.length - 1].includes(zc)) XZ[XZ.length - 1].push(zc);
        if (x >= 0 && S.crossSite[x] >= 0) {
          const k = XW.lastIndexOf(x);
          if (k < XG[XG.length - 2]) {
            XW.push(x);
            walkEnds.push(c1);
            XG[XG.length - 1] = XW.length;
          } else walkEnds[k] = Math.max(walkEnds[k], c1);
        }
      }
      // 따라가기 규칙의 바라는 속도: 이 앞 구간들 가운데 가장 느린 것
      XA.v0 = Math.min(XA.v0, Math.max(0.5, speed[id] * vf[i]));
      if (id === xEnd) XA.boxEnd = off + X.rOut[id];
      if (id === ppX) XA.ppEnd = off + X.rOut[id];
      // 앞 게이트: 길 중간 보행 신호, 아직 넘지 않은 교차로 진입로
      const mine = jp[i] >= 0 && PS[jp[i]].a === id;
      if (S.midApproach.has(id) || (isApproach(id) && (!mine || !past[i]) && !(pp[i] >= 0 && PS[pp[i]].a === id))) {
        const d = off + e.len - X.gate(id, ln === MED ? 0 : ln);
        if (d > -0.5) XT.push(d, id, ln);
      }
      XP.push(id, ln, off);
      off += e.len;
      pe = e;
      id = nx;
    }
    XA.lead = Math.min(XA.lead - load - XA.load, pRear);
    XA.load += load;
    // 마주 오는 쪽이 잡은 포개진 자리는 그 1.6m 앞에 선 장애물로 본다(그 앞 횡단보도에 들어가 자리가 없어 면 위에 서지 않게, 재작업 W25)
    for (let g = 0; g < XG.length; g += 4)
      for (const zc of XZ[g / 4]) if (zclaim[i] !== zc && zoneOcc[zc >> 1] & (1 << (1 - (zc & 1)))) XA.lead = Math.min(XA.lead, XG[g] - 1.6);
  }
  /** 묶음 시작 c0 가 지금 경로 게이트에서 함께 정할 묶음인가: 게이트 뒤이고 그 앞에 서면 뒤꽁무니가 상자 끝을 넘지 못한다 */
  const bound = (i: number, c0: number, c1: number) => (c0 >= XA.gate - 0.5 && c0 - 1.6 - size[i] < XA.boxEnd + 0.5) || glued(i, c0, c1);
  /** 게이트 앞에 붙은 묶음: 게이트보다 앞에서 시작하고, 그 묶음 끝 너머 1.5m 와 게이트 사이에 내 몸이 다 들어가지 않는다(게이트에 서면 몸이 그 묶음에 걸친다, 재작업 W25) */
  const glued = (i: number, c0: number, c1: number) => c0 < XA.gate - 0.5 && XA.gate - size[i] < c1 + 1.5;
  /** 들어갈지를 정하는 자리까지 앞 범퍼 거리: 게이트(dist), 게이트 앞에 붙은 묶음이 있으면 그 1.6m 앞(재작업 W25) */
  function entryDist(i: number, dist: number): number {
    xwAhead(i, Math.max(60, dist + 10));
    for (let g = 0; g < XG.length; g += 4) if (XG[g] > 0.3 && glued(i, XG[g], XG[g + 1])) return Math.min(dist, XG[g] - 1.6);
    return dist;
  }
  /** 게이트(앞 범퍼에서 d)가 내가 닿을 때까지 초록으로 남는가(신호 없는 진입로는 연 것으로 본다) */
  function gateOpen(i: number, d: number, a: number, tod: number): boolean {
    if (!S.approach.has(a)) return true;
    const mv = jp[i] >= 0 && PS[jp[i]].a === a ? PS[jp[i]].move : STRAIGHT;
    return S.state(a, mv, tod) === GREEN && S.greenLeft(a, mv, tod) > d / Math.max(4, v[i]) + 2;
  }
  /** 차 i 앞으로 곧게(지금 방향) reach 안에서 몸이 내 몸 폭 띠에 걸친 다른 차까지 앞 범퍼에서 그 차 몸까지 거리(차로 자료가 어긋나 다른 구간·차로 차가 내 앞을 막는 곳) */
  function bodyAhead(i: number, reach: number): number {
    const hx = Math.cos(cars.yaw[i]);
    const hz = Math.sin(cars.yaw[i]);
    const hl = size[i] / 2;
    const cx = cars.x[i] + hx * (hl + reach / 2);
    const cz = cars.z[i] + hz * (hl + reach / 2);
    const r = reach / 2 + 7;
    let best = Infinity;
    for (let gx = cellAt(cx - r); gx <= cellAt(cx + r); gx++)
      for (let gz = cellAt(cz - r); gz <= cellAt(cz + r); gz++)
        for (let j = cellHead[gx * GW + gz]; j >= 0; j = cellNext[j]) {
          if (j === i || j >= cars.n || Math.abs(cars.y[j] - cars.y[i]) > 2.5 || (skipLoads && loadMk[j] === loadStamp)) continue;
          // 옆으로 옮겨 가는 차는 옮겨 갈 자리(옆 거리 0)에서도 본다(월드컵로 xw578: 옆 차로에서 버스 앞으로 옮겨 오던 차, 재작업 W29)
          const drift = Math.abs(side[j]) > 0.3;
          if (drift) restPose(j, RP);
          for (let q = 0; q < (drift ? 2 : 1); q++) {
            const dx = (q ? RP[0] : cars.x[j]) - cars.x[i];
            const dz = (q ? RP[2] : cars.z[j]) - cars.z[i];
            const jx = Math.cos(q ? RP[3] : cars.yaw[j]);
            const jz = Math.sin(q ? RP[3] : cars.yaw[j]);
            // 그 차 몸의 내 방향 앞뒤 반길이·옆 반폭
            const ra = Math.abs((size[j] / 2) * (jx * hx + jz * hz)) + Math.abs(wid[j] * (jx * hz - jz * hx));
            const rb = Math.abs((size[j] / 2) * (jx * hz - jz * hx)) + Math.abs(wid[j] * (jx * hx + jz * hz));
            const along = dx * hx + dz * hz - hl - ra;
            // 옆 간격은 앞차 따라가기의 다른 구간 차 띠(두 반폭 + 비스듬한 몫 + 0.2m)만큼 넉넉히 본다: 따라가기가 앞차로 볼 차를 너머 자리에서 빼야
            // 횡단보도에 들어선 뒤 그 차 뒤에 서지 않는다(월드컵로 xw430 e48, 재작업 W25)
            if (along < -0.5 || along > reach || Math.abs(-dx * hz + dz * hx) > wid[i] + rb + 0.25) continue;
            best = Math.min(best, Math.max(0, along));
          }
        }
    return best;
  }
  /** 앞 범퍼에서 c0~c1 묶음(신호 횡단보도 XW[a..b))에 지금 들어가도 되는가 */
  function clearOk(i: number, c0: number, c1: number, a: number, b: number, tod: number, zones: number[] = []): boolean {
    // 포개진 자리: 마주 오는 쪽이 들어서 있으면(잡았으면) 들어가지 않는다(재작업 W25)
    for (const zc of zones) if (zoneOcc[zc >> 1] & (1 << (1 - (zc & 1))) && zclaim[i] !== zc) return false;
    // 값이 싼 것부터 본다(차 계산 시간, 재작업 W29): 앞차·게이트·보행 신호로 이미 못 들어가면 내 몸을 앞으로 옮겨 그려 보지 않는다
    const need = c1 + 1 + size[i];
    let obs = Math.min(XA.lead, mergeHold[i] ?? Infinity);
    for (let k = 0; k < XT.length; k += 3) if (XT[k] > c0 && XT[k] - size[i] < c1 + 1 && !gateOpen(i, XT[k], XT[k + 1], tod)) obs = Math.min(obs, XT[k] + 1.7);
    if (obs < need + 2.5) return false;
    let soon = Infinity;
    const deadlines: [number, number][] = [];
    for (let k = a; k < b; k++) {
      if (S.walkState(XW[k], tod) !== RED) return false;
      const greenIn = S.walkIn(XW[k], tod);
      if (X.surveyed) deadlines.push([walkEnds[k], greenIn]);
      else soon = Math.min(soon, greenIn);
    }
    // 짐으로 본 앞차를 뺀 그려 보기에서 찾은 장애물 뒤에도 그 짐이 함께 선다(재작업 W37)
    const ld = skipLoads ? XA.load : 0;
    // Surveyed motion follows the A2 path exactly. The straight ray can
    // mistake a stopped car on another approach for an outlet obstruction.
    if (!X.surveyed) {
      obs = Math.min(obs, bodyAhead(i, need + 3 + ld) - ld);
      if (obs < need + 2.5) return false;
    }
    // 옮겨 그려 보기는 지금 장애물(obs)보다 가까운 것만 찾으면 된다
    obs = Math.min(obs, sweepAhead(i, Math.min(need + 3, obs + 1) + ld) - ld);
    if (obs < need + 2.5) return false;
    if (X.surveyed) return clearsWalkSignals(deadlines, size[i], distance => clearSim(i, distance, obs));
    return soon > 40 || clearSim(i, need, obs) + 1 < soon;
  }
  /** clearRun 을 차 i 로: 바라는 속도는 앞 구간들 가운데 가장 느린 것, 짐으로 본 바로 앞차가 있으면(재작업 W37) 그 꽁무니를 따라간다 */
  function clearSim(i: number, need: number, obs: number): number {
    const fl = skipLoads ? XA.first : -1;
    const freeAt = X.surveyed ? (front: number) => {
      const center = front - size[i]/2;
      let k = 0;
      while (k + 3 < XP.length && XP[k+5] <= center) k += 3;
      return Math.max(.5, speed[XP[k] ?? edge[i]] * vf[i]);
    } : undefined;
    return clearRun(Math.min(XA.v0, Math.max(0.5, speed[edge[i]] * vf[i])), v[i], need, obs,
      fl >= 0 ? XA.firstAt : Infinity, fl >= 0 ? v[fl] : 0, freeAt, followingOf(i),
      fl >= 0 ? followingOf(fl) : undefined)[0];
  }

  /** 정류장에 선 버스 몸(가운데가 정류장 자리 2.5m 앞까지, 그 노선 버스 길이)이 횡단보도 면에 걸치면 걸치지 않을 때까지 앞으로 옮기는 거리(m, 노선·정류장마다, 재작업 W22) */
  const stopAdj = routes.map((R) => {
    const L = BUS_LEN[R.kind] ?? 11.5;
    const spans: number[] = [];
    R.edges.forEach((id, k) => {
      const q = stops.xwAll(id);
      for (let m = 0; m < q.length; m += 2) spans.push(R.start[k] + q[m], R.start[k] + q[m + 1]);
    });
    return R.stops.map((P) => {
      let adj = 0;
      for (let pass = 0; pass < 4; pass++)
        for (let m = 0; m < spans.length; m += 2) if (spans[m] < P + adj + L / 2 + 0.3 && spans[m + 1] > P + adj - L / 2 - 2.8) adj = Math.min(20, spans[m + 1] + 2.8 + L / 2 - P);
      return adj;
    });
  });
  /** 이번 단계에 정류장에 막 선 버스들: [노선 번호, 정류장 번호, 버스(차 번호)] */
  const dwells: [number, number, number][] = [];

  function step(dt: number, now: Now, spawn = true) {
    nowTod = now.tod;
    dwells.length = 0;
    // 0 이하 단계(화면 프레임 시각이 거꾸로 간 첫 프레임)는 건너뛴다. 음수 단계로 차가 구간 시작 뒤로 물러나 교차로 한가운데 포개졌다
    if (!(dt > 0)) return;
    fresh.length = 0;
    speedAge += dt;
    // 성기게 돌릴 차와 이번 걸음 시간(0 이면 이번에는 건너뛴다)
    tick++;
    coarseAge += dt;
    if (coarseAge > 0.25) {
      coarseAge = 0;
      for (let i = 0; i < cars.n; i++) coarse[i] = detail && !nearFocus(cars.x[i], cars.z[i]) && !detail(cars.x[i], cars.z[i]) ? 1 : 0;
    }
    for (let i = 0; i < cars.n; i++) {
      if (coarse[i] && (cars.uid[i] + tick) % COARSE) {
        owe[i] += dt;
        cdt[i] = 0;
      } else {
        cdt[i] = Math.min(0.25, owe[i] + dt);
        owe[i] = 0;
      }
    }
    if (speedAge > 1) {
      speedAge = 0;
      for (const e of edges) speed[e.id] = VFREE[e.cls] * provider.roadSpeed(now, e.cls, e.key, midX[e.id], midZ[e.id], midH[e.id]);
      allot(now);
    }
    cars.room.fill(99, 0, cars.n);
    for (const l of lists) l.length = 0;
    for (let i = 0; i < cars.n; i++) lists[edge[i]].push(i);
    tail.fill(-1);
    const lead = new Int32Array(8);
    for (const e of edges) {
      const l = lists[e.id];
      if (!l.length) continue;
      l.sort((a, b) => s[b] - s[a]);
      lead.fill(-1);
      for (const i of l) {
        acc[i] = lead[lane[i]];
        if (acc[i] >= 0) {
          const d = Math.min(s[acc[i]] - s[i], Math.hypot(cars.x[acc[i]] - cars.x[i], cars.z[acc[i]] - cars.z[i]));
          cars.room[i] = Math.min(cars.room[i], d);
          cars.room[acc[i]] = Math.min(cars.room[acc[i]], d);
        }
        lead[lane[i]] = i;
      }
      for (let k = 0; k < e.lanes; k++) tail[e.id * 8 + k] = lead[k];
      if (e.med) tail[e.id * 8 + MED] = lead[MED];
    }
    if (X.surveyed) {
      mergeHold.fill(Infinity);
      // On surveyed single-lane edges, two separate feeders can overlap
      // before they share an edge ID. Yield before the first body contact.
      for (const { outlet, feeders: [p, q], limit: [ps, qs] } of mergePairs) {
        const a = lists[p].find(i => nextE[i] === outlet);
        const b = lists[q].find(i => nextE[i] === outlet);
        if (a === undefined || b === undefined) continue;
        const da = ps - s[a], db = qs - s[b];
        if (da > Math.max(8, 2 * v[a]) || db > Math.max(8, 2 * v[b])) continue;
        const ta = da / Math.max(1, v[a]), tb = db / Math.max(1, v[b]);
        const first = (da < .5) !== (db < .5) ? da < .5 : ta < tb || (ta === tb && cars.uid[a] < cars.uid[b]);
        const yielding = first ? b : a, distance = first ? db : da;
        if (distance > 0) mergeHold[yielding] = Math.min(mergeHold[yielding], distance);
      }
    }
    leaveTail.fill(-1);
    for (let i = 0; i < cars.n; i++) {
      if (prevE[i] < 0 || s[i] - size[i] / 2 > X.rOut[edge[i]]) continue;
      const k = prevE[i] * 8 + prevLane[i];
      if (leaveTail[k] < 0 || s[i] < s[leaveTail[k]]) leaveTail[k] = i;
    }
    cellHead.fill(-1);
    for (let i = 0; i < cars.n; i++) {
      const k = cellAt(cars.x[i]) * GW + cellAt(cars.z[i]);
      cellNext[i] = cellHead[k];
      cellHead[k] = i;
    }
    pedGrid();
    // 교차로를 잡은 차(들어가기로 해 게이트 3초 앞 안이거나 넘은 차, 뒤꽁무니가 지나온 경로 끝을 지나기 전인 차)와 다가오는 차
    for (const l of held) l.length = 0;
    for (const l of coming) l.length = 0;
    zoneOcc.fill(0);
    for (let i = 0; i < cars.n; i++) if (zclaim[i] >= 0) zoneOcc[zclaim[i] >> 1] |= 1 << (zclaim[i] & 1);
    for (let i = 0; i < cars.n; i++) {
      if (pp[i] >= 0) {
        if (pd[i] - size[i] / 2 > holdEnd(PS[pp[i]]) + 0.3) pp[i] = -1;
        else held[PS[pp[i]].j].push(i);
      }
      if (jp[i] >= 0) {
        const j = PS[jp[i]].j;
        if (go[i] && (past[i] || commit[i] || Math.min(gateDist(i), gdist[i]) < Math.max(3, v[i] * 3))) held[j].push(i);
        else if (gateDist(i) < 60) coming[j].push(i);
      }
    }
    for (let i = 0; i < cars.n; i++) {
      const dt = cdt[i];
      if (!dt) continue;
      const e = edges[edge[i]];
      cars.fade[i] = Math.min(1, cars.fade[i] + dt * 2);
      const r = cars.route[i];
      if (r >= 0 && dwell[i] > 0) {
        dwell[i] -= dt;
        v[i] = 0;
        cars.brake[i] += (1 - cars.brake[i]) * Math.min(1, dt * 6);
        if (dwell[i] <= 0) stopK[i]++;
        continue;
      }
      let front = acc[i];
      let gap = Infinity;
      let dv = 0;
      let why = front >= 0 ? 1 : 0;
      if (front >= 0) gap = s[front] - s[i];
      else if (nextE[i] >= 0) {
        // 같은 차로에서 막 빠져나간 앞차: 꽁무니가 상자를 벗어날 때까지 따라간다
        const lt = leaveTail[e.id * 8 + lane[i]];
        if (lt >= 0) {
          front = lt;
          why = 2;
          gap = e.len - s[i] + s[lt];
        }
        // 다음 구간들에서 내가 달릴 차로의 맨 뒤 차
        const horizon = 20 + v[i] * 2 + (v[i] * v[i]) / (2 * B_COMF);
        let d = e.len - s[i];
        let id = nextE[i];
        let xp = pref[i] * e.lanes;
        for (let k = 1, pe = e; id >= 0 && d < horizon && k < 8; k++) {
          const ne = edges[id];
          xp = lanePos(pe, ne, xp);
          const pl = pathLane(i, ne.id);
          const ln = pl >= 0 ? pl : laneAt(i, ne, xp);
          if (pl >= 0) xp = ln === MED ? 0.5 : ln + 0.5;
          const t = tail[ne.id * 8 + ln];
          if (t >= 0) {
            if (d + s[t] < gap) {
              front = t;
              why = 2;
              gap = d + s[t];
            }
            break;
          }
          d += ne.len;
          pe = ne;
          id = laterEdge(i, ne);
        }
      }
      if (front >= 0) {
        gap -= (size[front] + size[i]) / 2;
        dv = v[i] - v[front];
        gap = Math.min(gap, Math.hypot(cars.x[front] - cars.x[i], cars.z[front] - cars.z[i]) - (size[front] + size[i]) / 2);
      }
      // 교차로가 아닌 곳에서 차로 수가 줄면, 구간 끝 40m 안에서 다음 구간의 한 차로로 모일 차들을 한 줄로 보고 앞선 차를 따라간다
      let merging = -1;
      if (cars.route[i] < 0 && nextE[i] >= 0 && X.jEnd[e.id] < 0 && e.len - s[i] < Math.max(40, v[i] * 3.5) && (edges[nextE[i]].lanes !== e.lanes || mergeSeam[e.id])) {
        const ne = edges[nextE[i]];
        const tl = laneAt(i, ne, lanePos(e, ne, pref[i] * e.lanes));
        let best = -1;
        for (const j of lists[e.id]) {
          if (j === i || lane[j] === lane[i] || nextE[j] !== ne.id || laneAt(j, ne, lanePos(e, ne, pref[j] * e.lanes)) !== tl) continue;
          if (s[j] < s[i] || (s[j] === s[i] && cars.uid[j] > cars.uid[i])) continue;
          if (best < 0 || s[j] < s[best]) best = j;
        }
        if (best >= 0) {
          const g2 = s[best] - s[i] - (size[best] + size[i]) / 2;
          if (g2 < gap) {
            gap = g2;
            dv = v[i] - v[best];
            front = best;
            why = 3;
            merging = best;
          }
        }
      }
      // 다른 구간의 차가 내 앞을 막고 있으면 그 차도 앞차로 본다(비스듬히 합쳐지는 길, 포개진 길). 교차로 경로 위끼리는 게이트·예약이 맡는다
      if (!(jp[i] >= 0 && past[i]) && pp[i] < 0) {
        const hx = Math.cos(cars.yaw[i]);
        const hz = Math.sin(cars.yaw[i]);
        const reach = size[i] / 2 + 6 + v[i] * 1.5;
        const cx = cars.x[i] + (hx * reach) / 2;
        const cz = cars.z[i] + (hz * reach) / 2;
        const rad = reach / 2 + 7;
        for (let gx = cellAt(cx - rad); gx <= cellAt(cx + rad); gx++)
          for (let gz = cellAt(cz - rad); gz <= cellAt(cz + rad); gz++)
            for (let j = cellHead[gx * GW + gz]; j >= 0; j = cellNext[j]) {
              if (j === i || j === front || edge[j] === edge[i] || Math.abs(cars.y[j] - cars.y[i]) > 2.5) continue;
              if (ahead[j] === i && aheadWhy[j] >= 1 && aheadWhy[j] <= 3) continue;
              const dx = cars.x[j] - cars.x[i];
              const dz = cars.z[j] - cars.z[i];
              const along = dx * hx + dz * hz;
              if (along <= 0 || along > reach + size[j] / 2) continue;
              const jx = Math.cos(cars.yaw[j]);
              const jz = Math.sin(cars.yaw[j]);
              const cosd = hx * jx + hz * jz;
              if (cosd < 0.64) continue;
              const sind = Math.abs(hx * jz - hz * jx);
              if (Math.abs(dz * hx - dx * hz) > wid[i] + wid[j] + sind * (size[j] / 2) + 0.2) continue;
              if (-(dx * jx + dz * jz) > 0 && Math.abs(dx * jz - dz * jx) < wid[i] + wid[j] + sind * (size[i] / 2) + 0.2 && (rankOf(e) < rankOf(edges[edge[j]]) || (rankOf(e) === rankOf(edges[edge[j]]) && cars.uid[i] < cars.uid[j]))) continue;
              const g2 = along - (size[i] + size[j]) / 2;
              if (g2 < gap) {
                gap = g2;
                dv = v[i] - v[j] * cosd;
                front = j;
                why = 4;
              }
            }
      }
      if ((mergeHold[i] ?? Infinity) + 2 < gap) {
        gap = mergeHold[i] + 2;
        dv = v[i];
        front = i;
        why = 14;
      }
      // 앞길에 선 사람: 사람 몸 0.4m 앞에 선다(사람은 차가 0.6m 안으로 다가오면 비켜난다)
      if (peds) {
        const pg = pedAhead(i, 3 + v[i] * 1.5 + (v[i] * v[i]) / (2 * B_COMF));
        if (pg + 1.6 < gap) {
          gap = pg + 1.6;
          dv = v[i];
          front = i;
          why = 13;
        }
      }
      // 지난 걸음에 몸통 겹침으로 막은 차는 다음 걸음에 앞차로 보고 미리 늦춘다
      const bj = blockBy[i];
      if (bj >= 0 && bj < cars.n && cars.uid[bj] === blockUid[i]) {
        const hx = Math.cos(cars.yaw[i]);
        const hz = Math.sin(cars.yaw[i]);
        const along = (cars.x[bj] - cars.x[i]) * hx + (cars.z[bj] - cars.z[i]) * hz;
        const g2 = along - (size[i] + size[bj]) / 2;
        // 뒤에 있는 차(옆으로 옮겨 가다 걸린 차)는 앞차로 보지 않는다. 앞차로 보면 간격 0 으로 서서 둘이 서로 막아 굳는다(재작업 W22)
        if (along > 0 && g2 < gap) {
          gap = Math.max(0, g2);
          dv = v[i] - v[bj] * Math.max(0, Math.cos(cars.yaw[bj] - cars.yaw[i]));
          front = bj;
          why = 12;
        }
      }
      // 횡단보도 지키기(재작업 W22): 아직 들어서지 않은 첫 묶음에 지금 들어가면 안 되면 그 앞(앞 6m 안 게이트가 있으면 게이트)에 선다
      {
        xwAhead(i, Math.max(40, (v[i] * v[i]) / (2 * B_COMF) + 30));
        if (front >= 0 && front !== i) XA.lead = Math.min(XA.lead, gap);
        for (let g = 0; g < XG.length; g += 4) {
          const c0 = XG[g];
          if (c0 < 0.3) continue;
          // 넘은 게이트나 지나온 경로의 게이트에서 정한 묶음(그 앞에 서면 뒤꽁무니가 상자 끝을 넘지 못한다)
          if (c0 - 1.6 - size[i] < (past[i] ? Math.max(XA.boxEnd, XA.ppEnd) : XA.ppEnd) + 0.5) continue;
          // 게이트에서 함께 정할 묶음
          if (jp[i] >= 0 && !past[i] && bound(i, c0, XG[g + 1])) break;
          const zs = XZ[g / 4];
          let enter = true;
          if (!clearOk(i, c0, XG[g + 1], XG[g + 2], XG[g + 3], now.tod, zs)) {
            let stopD = c0 - 1.6;
            for (let k = 0; k < XT.length; k += 3) if (XT[k] > 0 && XT[k] <= c0 && XT[k] > c0 - 6) stopD = Math.min(stopD, XT[k] - 0.3);
            if (stopD > (v[i] * v[i]) / (2 * B_HARD) - 0.5) {
              enter = false;
              if (stopD + 2 < gap) {
                gap = stopD + 2;
                dv = v[i];
                front = i;
                why = 11;
              }
            }
          }
          // 곧 들어설 포개진 자리를 잡는다(같은 걸음에 뒤에 정하는 마주 오는 차가 본다, 재작업 W25)
          if (enter && zs.length && zclaim[i] < 0 && c0 < 3 * v[i] + 6) {
            zclaim[i] = zs[0];
            zLeft[i] = XG[g + 1] + size[i] + 0.5;
            zoneOcc[zs[0] >> 1] |= 1 << (zs[0] & 1);
          }
          break;
        }
      }
      // 게이트: 교차로 진입로(경로를 골랐다)와 길 중간 신호
      if (jp[i] >= 0 && !past[i]) {
        const dist = gateDist(i);
        if (dist < 0) past[i] = go[i] ? 1 : past[i];
        if (!past[i]) {
          const horizon = (v[i] * v[i]) / (2 * 2) + 25;
          // 정하는 자리: 게이트, 게이트 앞에 붙은 횡단보도 묶음이 있으면 그 앞. 들어가기로 하고 그 자리를 넘으면 굳힌다
          const de = commit[i] ? dist : entryDist(i, dist);
          gdist[i] = de;
          if (go[i] && de < 0) commit[i] = 1;
          if (de < horizon || commit[i]) {
            const ok = commit[i] ? true : mayGo(i, de, now.tod);
            const canStop = !commit[i] && de > (v[i] * v[i]) / (2 * B_HARD) + 0.2;
            if (ok) go[i] = 1;
            else if (go[i] && canStop) go[i] = 0;
            if (go[i] && !past[i] && (commit[i] || de < Math.max(3, v[i] * 3)) && !held[PS[jp[i]].j].includes(i)) held[PS[jp[i]].j].push(i);
            if (!go[i]) {
              if (v[i] < 0.5) waitT[i] += dt;
              if (de + 1.7 < gap) {
                gap = de + 1.7;
                dv = v[i];
                front = i;
                why = 5;
              }
              // 20초 넘게 못 들어가면(빨간불이 아닌데 막혔다) 지금 차로가 허용하는 다른 길을 다시 고른다
              const P = PS[jp[i]];
              if (waitT[i] > 20 && cars.route[i] < 0 && jk[i] === 0 && (!S.approach.has(P.a) || S.state(P.a, P.move, now.tod) === GREEN) && rand() < dt / 4) {
                dropPath(i);
                onEdge(i, e);
                waitT[i] = 0;
              }
            } else if (go[i] && dist < 0) past[i] = 1;
          }
        }
      }
      {
        // 길 중간 보행 신호(이 구간 끝이나, 이 구간이 교차로가 아니면 다음 구간 끝). 교차로 게이트와 따로 본다(교차로 앞 짧은 구간에 있는 신호)
        const a = S.midApproach.has(e.id) ? e : nextE[i] >= 0 && X.jEnd[e.id] < 0 && S.midApproach.has(nextE[i]) ? edges[nextE[i]] : null;
        if (a) {
          const la = a === e ? lane[i] : laneAt(i, a, lanePos(e, a, pref[i] * e.lanes));
          const dist = (a === e ? 0 : e.len) - s[i] + a.len - X.gate(a.id, la === MED ? 0 : la) - size[i] / 2;
          if (dist > -0.3 && !midGo(i, a, dist, now.tod) && dist > (v[i] * v[i]) / (2 * B_HARD) - 0.3 && dist + 1.7 < gap) {
            gap = dist + 1.7;
            dv = v[i];
            front = i;
            why = a === e ? 5 : 6;
          }
        }
      }
      // 횡단보도: 내 차로가 지나는 횡단보도 면(이 구간과 다음 구간)에 사람이 건너고 있으면 그 면 1m 앞에 선다(게이트를 넘은 차는 교차로 경로를 따라가며 이미 비켜 있다)
      if (xw && !(jp[i] >= 0 && past[i]) && pp[i] < 0) {
        let d0 = -s[i];
        for (let id = e.id, k = 0; id >= 0 && k < 2; k++) {
          const pl = pathLane(i, id);
          const ln = k === 0 ? lane[i] : pl >= 0 ? pl : laneAt(i, edges[id], lanePos(e, edges[id], pref[i] * e.lanes));
          const q = stops.xwOf(id, ln === MED ? 0 : ln);
          for (let m = 0; m < q.length; m += 4) {
            if (!xw.busy[q[m + 2]]) continue;
            const toLine = d0 + q[m] - 1 - size[i] / 2;
            if (toLine > (v[i] * v[i]) / (2 * B_HARD) - 0.5 && toLine + 2 < gap) {
              gap = toLine + 2;
              dv = v[i];
              front = i;
              why = 7;
            }
          }
          d0 += edges[id].len;
          id = k === 0 ? nextE[i] : -1;
        }
      }
      if (slowAt[e.id] >= 0 && s[i] < slowAt[e.id] - 25 && slowAt[e.id] - 25 - s[i] + 2 < gap) {
        gap = slowAt[e.id] - 25 - s[i] + 2;
        dv = v[i] - slowV[e.id];
        front = i;
        why = 9;
      }
      if (r >= 0 && stopK[i] < routes[r].stops.length) {
        const toStop = routes[r].stops[stopK[i]] + stopAdj[r][stopK[i]] - (routes[r].start[rpos[i]] + s[i]);
        if (toStop < 2.5 && v[i] < 0.6) {
          dwell[i] = 9 + rand() * 6;
          v[i] = 0;
          dwells.push([r, stopK[i], i]);
          continue;
        }
        if (toStop + 2 < gap) {
          gap = toStop + 2;
          dv = v[i];
          front = i;
          why = 10;
        }
      }
      const v0 = slowAt[e.id] >= 0 && Math.abs(s[i] - slowAt[e.id]) < 25 ? Math.min(slowV[e.id], Math.max(0.5, speed[e.id] * vf[i])) : Math.max(0.5, speed[e.id] * vf[i]);
      const following = followingOf(i);
      let a = followingAcceleration(v[i], v0, dv, gap, front >= 0, following);
      if (front >= 0 && front !== i) {
        const dc = Math.max(0, gap) + (size[front] + size[i]) / 2;
        cars.room[i] = Math.min(cars.room[i], dc);
        cars.room[front] = Math.min(cars.room[front], dc);
      } else if (front === i) cars.room[i] = Math.min(cars.room[i], 2 * Math.max(0, gap - 2 + size[i] / 2));
      if (front >= 0 && front === merging) a = Math.max(a, -1.2 * B_COMF);
      ahead[i] = front;
      aheadWhy[i] = front >= 0 ? why : 0;
      // 서는 자리(게이트·신호) 앞에서는 거기를 넘지 않게: 남은 거리에 설 수 있는 감속을 쓴다(최대 8m/s²)
      a = limitAcceleration(a, v[i], gap, front === i, following.acceleration);
      const slow = v[i] < 0.3 * VFREE[e.cls] * vf[i];
      cars.brake[i] += ((a < -0.5 || slow ? 1 : 0) - cars.brake[i]) * Math.min(1, dt * 6);
      v[i] = integrateSpeed(v[i], a, dt);
      // 서는 자리를 넘지 않는다
      if (front === i) v[i] = capStopSpeed(v[i], gap, dt);
      stopT[i] = v[i] < 0.3 ? stopT[i] + dt : 0;
      // 일반 차: 가로변 버스전용차로가 있는 진입로에서 우회전할 차는 상자 앞 45~30m 에서 버스전용차로로 들어간다(그 차로가 우회전을 허용하면)
      if (r < 0 && e.bus >= 0 && jp[i] >= 0 && jk[i] === 0 && !go[i] && PS[jp[i]].move === RIGHT && lane[i] === e.bus - 1 && Math.abs(side[i]) < 0.3) {
        const toGate = e.len - X.gate(e.id, lane[i]) - s[i];
        if (toGate > 30 && toGate < 45 && X.laneMoves(e.id, e.bus) & RIGHT && laneGap(i, e, e.bus)) shiftLane(i, e, e.bus);
      }
      // 버스: 다음 교차로 움직임을 허용하는 차로로 실선 구간 앞에서 한 칸씩 옮긴다
      // 지금 차로가 경로 움직임을 못 하는 버스는 실선 구간에서도 게이트 앞까지는 옮긴다(재작업 W25, 차선대로 회전)
      if (r >= 0 && (!solid(i, e) || (wrongLane(i) && pp[i] < 0 && s[i] < e.len - X.rIn[e.id] - size[i] / 2))) {
        const w = busWant(i, e);
        if (w >= 0 && w !== lane[i] && Math.abs(side[i]) < 0.3) {
          const tl = lane[i] === MED ? 0 : lane[i] + Math.sign(w - lane[i]);
          if (tl >= 0 && tl < e.lanes && laneGap(i, e, tl)) shiftLane(i, e, tl);
        }
      }
    }
    // 걸음: 한 걸음(옆으로 옮겨 가는 것 포함) 간 자리가 다른 차 몸통과 새로 겹치면 반만, 그래도 겹치면 서고 옆 이동도 멈춘다
    const gone = new Uint8Array(cars.n);
    for (let i = 0; i < cars.n; i++) {
      const dt = cdt[i];
      if (!dt || (dwell[i] > 0 && cars.route[i] >= 0)) continue;
      const side0 = side[i];
      // 옆 거리를 줄여 간다. 몸이 그 방향 찻길 왼쪽 가장자리(양방향 길의 칠한 중앙선)를 넘은 동안은 빨리(초당 3.5m) 돌아온다
      let sideV = SIDE_V;
      const ee = edges[edge[i]];
      if (side[i] < 0 && lane[i] !== MED && laneOff(ee, lane[i], s[i]) + side[i] - wid[i] < leftEdge(ee, s[i])) sideV = 3.5;
      // 교차로 상자 40m 앞부터는 상자에 들어서기 전에 차로 가운데로 돌아온다(교차로 안에서는 경로를 그대로 따른다)
      if (isApproach(ee.id) && ee.len - X.rIn[ee.id] - s[i] < 40) sideV = Math.max(sideV, 3.5);
      const sideTo = side[i] - Math.sign(side[i]) * Math.min(Math.abs(side[i]), sideV * dt);
      // 중앙선을 넘었거나 상자 앞이라 빨리 돌아오는 차는 틈을 보지 않는다
      if (Math.abs(side[i]) < 0.5 || sideV > SIDE_V || driftOk(i, sideTo)) side[i] = sideTo;
      let ds = v[i] * dt;
      blockBy[i] = -1;
      // 걸음 없이도 그린 자리가 바뀔 수 있다(옆으로 옮겨 가기, 정류장 승강장 비켜 서기). 그 자리도 새로 겹치면 그대로 둔다
      let frozen = false;
      // 지난 걸음에 곧게 간(아래 straightStep) 차는 차로 방향으로 돌아가는 것이 다른 차 몸에 새로 닿으면 방향을 그대로 둔다(제자리에서 돌며 겹치지 않게, 재작업 W32)
      const held = holdYaw[i];
      holdYaw[i] = 0;
      const keep = held === 2 && blockedAt(i, edge[i], s[i], lane[i]) ? 2 : 0;
      holdYaw[i] = keep;
      // 앞으로 가는 걸음이 뒤에 선 차에 막히면(돌면서 꽁무니가 뒤 차 쪽으로 쓸린다) 이번 걸음은 방향을 그대로 두고 나아간다.
      // 앞선 차가 뒤 차 때문에 서면 뒤 차가 기다리는 너머 자리도 비지 않아 둘이 굳었다(월드컵로 xw430, 재작업 W25)
      if (ds > 0 && blockedNext(i, ds) && hitBy >= 0 && behind(i, hitBy)) {
        holdYaw[i] = 1;
        if (blockedNext(i, ds)) holdYaw[i] = keep;
      }
      // 선 채로(걸음 0, 옆 거리 그대로) 있는 차는 새로 겹칠 일이 없어 보지 않는다(차 계산 시간, 재작업 W29)
      if ((ds > 0 || side[i] !== side0) && blockedNext(i, ds)) {
        // 옆으로 옮겨 가다 걸렸으면 옆 거리를 그대로 두고 앞으로만 가 본다(나란히 걸친 두 차가 서로 막아 굳지 않게, 재작업 W22)
        const sideNew = side[i];
        side[i] = side0;
        if (sideNew !== side0 && ds > 0 && !blockedNext(i, ds)) {
          // 옆 거리를 그대로 두면 갈 수 있다
        } else if (!X.surveyed && ds > 0 && hitBy >= 0 && waitsOn(hitBy, i) && leads(i, hitBy) && straightStep(i, ds, hitBy)) {
          // 나란한 두 차는 앞선 차가 먼저 간다(곧게 한 걸음)
        } else {
          side[i] = sideNew;
          ds *= 0.5;
          if (ds === 0 || blockedNext(i, ds)) {
            ds = 0;
            if (side[i] !== side0) side[i] = side0;
            if (blockedNext(i, 0)) frozen = true;
          }
          v[i] = ds / dt;
          blockBy[i] = hitBy;
          blockUid[i] = hitBy >= 0 ? cars.uid[hitBy] : -1;
        }
      }
      s[i] += ds;
      pd[i] += ds;
      if (zclaim[i] >= 0 && (zLeft[i] -= ds) < 0) zclaim[i] = -1;
      let e = edges[edge[i]];
      while (s[i] >= e.len) {
        if (nextE[i] < 0) {
          gone[i] = 1;
          break;
        }
        const o = edges[nextE[i]];
        // 교차로가 아닌 이음매: 지난 구간 끝의 그린 자리와 새 구간 차로 자리의 옆 차이를 옆 거리(side)로 넘겨 이어 그린다(곡선으로 꺾지 않고 초당 SIDE_V 로 옮겨 간다)
        const seam = !X.surveyed && X.jEnd[e.id] < 0 && !bent(e, o);
        if (seam) {
          const s0 = s[i];
          s[i] = e.len;
          pose(i, e.id, e.len, lane[i], PS0);
          s[i] = s0;
        }
        s[i] -= e.len;
        prevE[i] = e.id;
        prevLane[i] = lane[i];
        const x = lanePos(e, o, pref[i] * e.lanes);
        lane[i] = laneAt(i, o, x);
        const lx = Math.min(o.lanes - 1, Math.max(0, Math.floor(x)));
        pref[i] = (lx + Math.max(0.001, Math.min(0.999, x - lx))) / o.lanes;
        if (prevLane[i] === MED && lane[i] !== MED) pref[i] = 0.001 / o.lanes;
        const sideOld = side[i];
        e = o;
        edge[i] = e.id;
        if (cars.route[i] >= 0) rpos[i]++;
        onEdge(i, e);
        // 경로 위 차로와 차로 위 자리
        const pl = pathLane(i, e.id);
        if (pl >= 0) {
          lane[i] = pl;
          pref[i] = (pl === MED ? 0.5 : pl + 0.5) / e.lanes;
        }
        if (seam) {
          side[i] = 0;
          pose(i, e.id, Math.min(e.len, s[i]), lane[i], PS1);
          side[i] = (PS0[0] - PS1[0]) * -Math.sin(PS1[3]) + (PS0[2] - PS1[2]) * Math.cos(PS1[3]);
          if (!Number.isFinite(side[i])) side[i] = sideOld;
        }
      }
      // 경로 위 거리(차 가운데)
      const cur = jp[i] >= 0 && jk[i] >= 0 ? jp[i] : pp[i];
      if (cur >= 0) {
        const q = PS[cur].edges.indexOf(edge[i]);
        if (q >= 0) pd[i] = PS[cur].base[q] + s[i];
      }
      if (!gone[i] && !frozen) locate(i);
    }
    for (let i = gone.length - 1; i >= 0; i--) if (gone[i]) remove(i);
    cellHead.fill(-1);
    for (let i = 0; i < cars.n; i++) {
      const k = cellAt(cars.x[i]) * GW + cellAt(cars.z[i]);
      cellNext[i] = cellHead[k];
      cellHead[k] = i;
    }
    if (spawn)
      routes.forEach((R, r) => {
        wait[r] -= dt;
        if (wait[r] > 0) return;
        const h = busHeadway(R, now.tod);
        const e = edges[R.edges[0]];
        const t = tail[e.id * 8 + (e.med && R.usesMed ? MED : e.lanes - 1)];
        if (!h) wait[r] = 60;
        else if ((t < 0 || s[t] > 16) && addBus(r)) {
          wait[r] = h * (0.85 + rand() * 0.3);
          // 같은 단계에 같은 출발 구간에 놓인 다른 노선 버스와도 겹치지 않게(새로 놓은 차 목록에 넣는다)
          if (touches(cars.n - 1)) remove(cars.n - 1);
          else fresh.push(cars.n - 1);
        }
      });
    if (spawn && focus && boundaryDemand === undefined) {
      let cin = 0;
      let cout = 0;
      for (let i = 0; i < cars.n; i++) if (cars.route[i] < 0) nearFocus(cars.x[i], cars.z[i]) ? cin++ : cout++;
      for (let k = 0; k < 8 && cin < nIn && cars.n < max; k++) if (spawnHidden(true)) cin++;
      for (let k = 0; k < 8 && cout < nOut && cars.n < max && cin + cout < max - reserve; k++) if (spawnHidden(false)) cout++;
      for (let k = 0; k < 8 && cin > nIn * 1.05 + 2; k++) if (dropHidden(true)) cin--;
      for (let k = 0; k < 8 && cout > nOut * 1.05 + 2; k++) if (dropHidden(false)) cout--;
      for (let k = 0; k < 4; k++) dropHidden();
    }
    if (spawn && entries.length) {
      const want = boundaryDemand === undefined ? Math.round(nIn + nOut) : Math.max(0, boundaryDemand - nBus);
      for (let k = 0; k < 6 && cars.n - nBus < want && cars.n < max; k++) {
        const e = entries[pick(entryW, rand())];
        if (closed[e.id] || inner(e.id)) continue;
        const ln = carLane(e, rand() * carLanes(e));
        const t = tail[e.id * 8 + ln];
        if (t >= 0 && s[t] < 16) continue;
        put(cars.n, e, 0.5, ln);
        locate(cars.n++);
        if (touches(cars.n - 1) || (boundaryDemand !== undefined && seen(cars.x[cars.n - 1], cars.z[cars.n - 1]))) {
          cars.n--;
          continue;
        }
        tail[e.id * 8 + ln] = cars.n - 1;
        fresh.push(cars.n - 1);
      }
    }
  }
  /** 옆으로 옮겨 가는(이음매에서 차로 자리가 어긋나 옆 거리를 줄여 가는) 차 i 가 옆 거리 to 로 가도 되는가: 다가가는 쪽 뒤에 오는 차와
   *  옆 간격이 두 몸 폭 + 0.3m 안이 되면서 앞뒤 간격이 그 차의 따라가기 간격(2m + 1.3초)보다 짧으면 옮기지 않는다(차로 바꾸기처럼 틈을 본다, 재작업 W25).
   *  전에는 이음매 어긋남(홍대입구 e95 → e358 중앙버스차로 4m)으로 옆 차로를 가로지르던 버스가 뒤에 오던 차 앞을 막고 그 차에 걸려 둘이 굳었다 */
  function driftOk(i: number, to: number): boolean {
    const sd = side[i];
    side[i] = to;
    pose(i, edge[i], s[i], lane[i], PC);
    side[i] = sd;
    for (let gx = cellAt(PC[0] - 25); gx <= cellAt(PC[0] + 25); gx++)
      for (let gz = cellAt(PC[2] - 25); gz <= cellAt(PC[2] + 25); gz++)
        for (let j = cellHead[gx * GW + gz]; j >= 0; j = cellNext[j]) {
          if (j === i || j >= cars.n || Math.abs(cars.y[j] - PC[1]) > 2.5 || !behind(i, j)) continue;
          const hx = Math.cos(cars.yaw[j]);
          const hz = Math.sin(cars.yaw[j]);
          const latNew = Math.abs(-(PC[0] - cars.x[j]) * hz + (PC[2] - cars.z[j]) * hx);
          const latOld = Math.abs(-(cars.x[i] - cars.x[j]) * hz + (cars.z[i] - cars.z[j]) * hx);
          if (latNew >= latOld || latNew > wid[i] + wid[j] + 0.3) continue;
          const gapAlong = (PC[0] - cars.x[j]) * hx + (PC[2] - cars.z[j]) * hz - (size[i] + size[j]) / 2;
          if (gapAlong < 2 + 1.3 * v[j]) return false;
        }
    return true;
  }
  // ── 나란한 두 차의 우선순위(재작업 W32) ──
  // 몸통 겹침 막기는 두 차 모두에게 '새로 다가가지 않기'를 요구해, 나란히 달리는 두 차의 차로 자리가 서로 가까워지는 곳(차로 옆 거리가
  // 흔들리는 서교로 e119, 버스 모서리가 돌며 옆 차로로 나오는 곳)에서는 두 차가 서로를 막아 둘 다 끝까지 섰다.
  // 나란한(방향 차 20° 안, 앞뒤로 몸이 겹치는) 두 차가 서로를 기다리면(막은 차가 나 때문에 섰다), 두 방향 가운데선으로 잰 가운데가 앞선 차(같으면 고유 번호가 작은 차)만
  // 먼저 간다: 그 차는 차로를 따라가는 걸음이 막히면 뒤 차의 진행 방향으로 곧게(방향 그대로, 옆 거리로 차로 자리 차이를 받는다) 한 걸음 간다.
  // 뒤 차 몸의 옆면과 나란히 움직이므로 뒤 차 쪽으로 다가가지 않고, 뒤 차는 앞 차가 지나갈 때까지 기다린다. 우선순위가 한쪽으로만 정해져 고리가 생기지 않는다
  /** 차 j 가 차 i 때문에 서 있는가(몸통 겹침으로 막혔거나 i 를 앞차로 따라가며 섰다) */
  const waitsOn = (j: number, i: number) => blockBy[j] === i || (ahead[j] === i && v[j] < 0.3);
  /** 차 i 가 나란한 차 j 보다 앞섰는가 */
  function leads(i: number, j: number): boolean {
    let dy = Math.abs(cars.yaw[i] - cars.yaw[j]) % (2 * Math.PI);
    if (dy > Math.PI) dy = 2 * Math.PI - dy;
    if (dy > (20 * Math.PI) / 180) return false;
    const hx = Math.cos(cars.yaw[i]) + Math.cos(cars.yaw[j]);
    const hz = Math.sin(cars.yaw[i]) + Math.sin(cars.yaw[j]);
    const along = ((cars.x[i] - cars.x[j]) * hx + (cars.z[i] - cars.z[j]) * hz) / Math.hypot(hx, hz);
    if (Math.abs(along) >= (size[i] + size[j]) / 2) return false;
    return along > 0 || (along === 0 && cars.uid[i] < cars.uid[j]);
  }
  /** 앞선 차 i 가 뒤 차 j 진행 방향으로 곧게 ds 가 본다(교차로 경로 밖, 구간을 넘으면 꺾이지 않은 이음매만. 옆 거리는 이음매에서 걸음과 같은 식으로 넘어간다).
   *  막히지 않으면 옆 거리·방향을 그대로 두고 참 */
  function straightStep(i: number, ds: number, j: number): boolean {
    const e = edges[edge[i]];
    const sv = s[i] + ds;
    if (sv >= e.len && (nextE[i] < 0 || X.jEnd[e.id] >= 0 || bent(e, edges[nextE[i]]))) return false;
    const sd = side[i];
    side[i] = 0;
    pose(i, e.id, Math.min(sv, e.len), lane[i], PC);
    side[i] = sd;
    if (PC[4] || !Number.isFinite(PC[0])) return false;
    const tx = cars.x[i] + Math.cos(cars.yaw[j]) * ds;
    const tz = cars.z[i] + Math.sin(cars.yaw[j]) * ds;
    const w = (tx - PC[0]) * -Math.sin(PC[3]) + (tz - PC[2]) * Math.cos(PC[3]);
    const h = holdYaw[i];
    side[i] = w;
    holdYaw[i] = 2;
    if (blockedNext(i, ds)) {
      side[i] = sd;
      holdYaw[i] = h;
      return false;
    }
    return true;
  }
  /** 차 i 가 ds 나아간 자리(구간이 바뀌면 다음 구간)가 막혔는가 */
  function blockedNext(i: number, ds: number): boolean {
    const e = edges[edge[i]];
    const sv = s[i] + ds;
    if (sv < e.len) return blockedAt(i, e.id, sv, lane[i]);
    if (nextE[i] < 0) return false;
    const o = edges[nextE[i]];
    const pl = pathLane(i, o.id);
    const ln = pl >= 0 ? pl : laneAt(i, o, lanePos(e, o, pref[i] * e.lanes));
    // 다음 구간 자리에서 자리를 셈하려고 잠깐 옮겨 본다(꺾이지 않은 이음매는 넘어가며 옆 거리를 넘기는 것까지 같게)
    const se = edge[i];
    const ss = s[i];
    const sl = lane[i];
    const pe = prevE[i];
    const pl0 = prevLane[i];
    const sd = side[i];
    const seam = X.jEnd[e.id] < 0 && !bent(e, o);
    if (seam) {
      s[i] = e.len;
      pose(i, e.id, e.len, sl, PS0);
    }
    edge[i] = o.id;
    s[i] = Math.min(o.len, sv - e.len);
    prevE[i] = e.id;
    prevLane[i] = sl;
    lane[i] = ln;
    if (seam) {
      side[i] = 0;
      pose(i, o.id, s[i], ln, PS1);
      side[i] = (PS0[0] - PS1[0]) * -Math.sin(PS1[3]) + (PS0[2] - PS1[2]) * Math.cos(PS1[3]);
      if (!Number.isFinite(side[i])) side[i] = sd;
    }
    const b = blockedAt(i, o.id, s[i], ln);
    edge[i] = se;
    s[i] = ss;
    lane[i] = sl;
    prevE[i] = pe;
    prevLane[i] = pl0;
    side[i] = sd;
    return b;
  }
  /** 차 i 가 구간 from 다음에 갈 구간(정해 둔 경로·노선, 갈림 없는 길). 모르면 −1 */
  function laterEdge(i: number, from: Edge): number {
    for (let pk = 0; pk < 2; pk++) {
      const id = pk ? pp[i] : jp[i];
      if (id < 0) continue;
      const q = PS[id].edges.indexOf(from.id);
      if (q >= 0 && q + 1 < PS[id].edges.length) return PS[id].edges[q + 1];
    }
    const r = cars.route[i];
    if (r >= 0) {
      const q = routes[r].edges.indexOf(from.id, rpos[i]);
      return q >= 0 && q + 1 < routes[r].edges.length ? routes[r].edges[q + 1] : -1;
    }
    return from.next.length === 1 ? from.next[0] : -1;
  }

  /** 횡단보도 xi 로 차가 다가오는가: 그 횡단보도가 지나는 구간에서 횡단보도 앞 (10m + 4초 거리) 안이거나 횡단보도 위에 있는 차 */
  const xwEdges: [number, number][][] = (xw?.list ?? []).map(() => []);
  if (xw)
    for (const e of edges)
      for (let l = 0; l < e.lanes; l++) {
        const q = stops.xwOf(e.id, l);
        for (let k = 0; k < q.length; k += 4) if (!xwEdges[q[k + 2]].some(([id]) => id === e.id)) xwEdges[q[k + 2]].push([e.id, (q[k] + q[k + 1]) / 2]);
      }
  function approaching(xi: number): boolean {
    const hw = (xw?.list[xi].wid ?? 4) / 2;
    for (const [id, d] of xwEdges[xi] ?? []) {
      for (const j of lists[id]) if (s[j] + size[j] / 2 > d - hw - 10 - v[j] * 4 && s[j] - size[j] / 2 < d + hw + 1) return true;
      if (d < 40) for (const b of before[id]) for (const j of lists[b]) if (edges[b].len - s[j] + d - hw < 10 + v[j] * 4) return true;
    }
    return false;
  }

  return {
    cars,
    step,
    approaching,
    fill,
    fillBuses,
    addBus,
    /** 구간 edgeId 의 at(m) 지점, lane 차로에 승용차 한 대를 놓는다(시험용) */
    put(edgeId: number, at: number, ln: number) {
      if (cars.n >= max) return;
      put(cars.n, edges[edgeId], at, ln);
      cars.kind[cars.n] = 0;
      size[cars.n] = BODY_LEN[bodyType(cars.tint[cars.n])];
      wid[cars.n] = BODY_HW[bodyType(cars.tint[cars.n])];
      locate(cars.n++);
    },
    target: (now: Now) => allot(now),
    setFocus,
    /** 성기게 돌리기: 보는 곳 둘레 밖에서 fine 이 거짓인 차는 몇 걸음에 한 번 움직인다(null 이면 모든 차를 매 걸음, 시험·측정 기본값) */
    setDetail(fine: ((x: number, z: number) => boolean) | null) {
      detail = fine;
      coarseAge = Infinity;
    },
    setIncidents(inc: { blocks: { edge: number; lane: number; at: number }[]; close: number[]; slow: { edge: number; at: number; v: number }[] }) {
      blockLane.fill(-1);
      closed.fill(0);
      slowAt.fill(-1);
      for (const b of inc.blocks) {
        blockLane[b.edge] = b.lane;
        slowAt[b.edge] = b.at;
        slowV[b.edge] = 5;
      }
      for (const c of inc.close) closed[c] = 1;
      for (let changed = inc.close.length > 0; changed; ) {
        changed = false;
        for (const e of edges) if (!closed[e.id] && e.next.length && e.next.every((k) => closed[k])) (closed[e.id] = 1), (changed = true);
      }
      for (const w of inc.slow) (slowAt[w.edge] = w.at), (slowV[w.edge] = w.v);
    },
    /** 사람 자리(사람 모듈의 w). 차는 사람 몸에 새로 닿지 않는다 */
    setPeople(w: { n: number; x: Float32Array; z: Float32Array }) {
      peds = w;
    },
    laneOf: (i: number) => lane[i],
    scale: () => [ratioIn, ratioOut],
    routes,
    dwells,
    door: (i: number): [number, number] => {
      const y = cars.yaw[i];
      const f = size[i] / 2 - 1.3;
      return [cars.x[i] + Math.cos(y) * f - Math.sin(y) * 1.7, cars.z[i] + Math.sin(y) * f + Math.cos(y) * 1.7];
    },
    speedOf: (i: number) => v[i],
    nextStop: (i: number) => (cars.route[i] >= 0 ? routes[cars.route[i]].stopNames[stopK[i]] ?? '' : ''),
    /** 측정용 읽기 전용 값: 구간·거리·속도·차로·다음 구간·길이·반폭, 고른 경로·지나온 경로·들어가기로 했나, 따라간 앞 대상과 까닭
     *  (12 몸통 겹침으로 막은 차, 1 같은 차로 앞차, 2 다음 구간 앞차, 3 차로 합침, 4 다른 구간 차, 5 게이트·신호, 6 다음 구간 신호, 7 횡단보도 사람, 9 돌발 서행, 10 정류장, 11 횡단보도 지키기, 13 앞길 사람) */
    debug: () => ({ edge, s, v, lane, nextE, size, wid, jp, jk, pp, go, past, ahead, aheadWhy, blockBy, dwell, stopK, side, inter: I, gateWhy: (i: number, tod: number) => (jp[i] >= 0 ? gateWhy(i, gateDist(i), tod) : -1), xwAhead: (i: number) => (xwAhead(i, 60), { XG: [...XG], XW: [...XW], XT: [...XT], ...XA }) }),
    meanSpeed: () => (cars.n ? v.subarray(0, cars.n).reduce((a, b) => a + b, 0) / cars.n : 0),
  };
}
