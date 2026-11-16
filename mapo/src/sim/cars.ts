// 차. 방향 그래프의 구간 위를 달리며 앞차와의 간격으로 속도를 정한다(IDM을 줄인 식).
// 구간 끝에서는 직진에 가까운 다음 구간을 고르고, 판 밖으로 나가면 사라진다. 판 가장자리로 나갈 수 없는 막다른 길은 고르지 않는다.
// 교차로에서는 부딪는 방향으로 상자에 들어간 차가 있으면 상자 앞에서 기다린다. 작은 길 차는 큰길 차에 양보한다.
// 버스는 노선의 구간 열을 따라 맨 오른쪽 차로로 달리고, 정류장마다 잠시 선다. 중앙버스차로가 있는 구간에서는 그 차로로 달리고(마을버스 빼고)
// 중앙 정류장 가까이에서는 승강장 폭만큼 더 왼쪽으로 비켜 서서 오른쪽 문이 승강장에 닿는다. 일반 차는 중앙버스차로를 쓰지 않는다.
import { headingAt, pointAt } from '../poly.ts';
import { BODY_HW, BODY_LEN, BUS_HW, bodyType } from './bodies.ts';
import { busHeadway, type BusRoute } from './buses.ts';
import { GREEN, YELLOW, type Approach, type Signals } from './signals.ts';
import type { Now } from './clock.ts';
import { commute, daytime, nightlife } from './curves.ts';
import { BOARD_R } from '../geo.ts';
import type { Crosswalk } from '../data/board.ts';
import { headingNear, ISLAND_BACK, ISLAND_L, ISLAND_W, laneOff, lanePos, MED, medAt, turnAllowed, type Edge } from './graph.ts';
import { makeJunctions } from './junctions.ts';
import { laneStops } from './stops.ts';
import type { DataProvider } from './provider.ts';
import { pick, rng } from './rng.ts';

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
  /** 그릴 때 차 길이를 늘일 수 있는 한도(m): 앞뒤 차와의 가운데 거리, 앞의 정지선·정류장까지 가운데 거리의 두 배 가운데 가장 작은 값.
   *  멀리서 차를 키워 그려도 앞뒤 차와 겹치거나 정지선을 넘어 보이지 않게 한다 */
  room: Float32Array;
}

const VFREE = [22, 14, 12.5, 10, 7, 5.5]; // 등급별 자유 속도(m/s)
const BUS_LEN = [11.5, 11.5, 12, 7.5]; // 종류별 버스 길이(m)
const A_MAX = 1.6;
const B_COMF = 2.5;

export function makeCars(
  edges: Edge[],
  provider: DataProvider,
  seed = 1,
  max = 1400,
  routes: BusRoute[] = [],
  signals?: Signals,
  /** 횡단보도와, 횡단보도마다 지금 사람이 건너고 있는 자리(축을 2m 칸으로 나눈 비트, 보행자가 쓴다) */
  xw?: { list: Crosswalk[]; busy: Uint32Array },
) {
  const rand = rng(seed);
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
  let nextUid = 1;
  let nBus = 0;
  /** 버스 몫으로 남겨 두는 자리. 일반 차는 max - reserve 대까지만 둔다 */
  const reserve = routes.length ? Math.min(300, Math.floor(max * 0.2)) : 0;
  const edge = new Int32Array(max);
  const nextE = new Int32Array(max);
  const s = new Float32Array(max);
  const v = new Float32Array(max);
  const lane = new Uint8Array(max);
  // 차로 고르기: 차마다 0~1 값을 두고, 차로가 L개인 구간에서는 floor(값 × L)번 차로를 달린다.
  // 차로 수가 줄었다 늘어도 차들이 안쪽 차로로 몰리지 않고 다시 고르게 퍼진다
  const pref = new Float32Array(max);
  const vf = new Float32Array(max);
  const size = new Float32Array(max);
  const wid = new Float32Array(max); // 그리는 몸통의 반폭(m)
  const acc = new Float32Array(max);
  const rpos = new Int16Array(max); // 노선의 몇 번째 구간인가
  const stopK = new Int16Array(max); // 다음에 설 정류장 번호
  const dwell = new Float32Array(max); // 정류장에 남은 정차 시간(초)
  const wait = new Float32Array(routes.length); // 노선별 다음 출발까지(초)
  const jn = signals?.junctions ?? makeJunctions(edges);
  // 차로마다 정지 자리(서울시 정지선, 없으면 횡단보도 바깥 변 1m 앞)와 횡단보도 면 위 구간(src/sim/stops.ts). 신호 자료가 없으면 횡단보도로만 만든다
  const stops = signals?.stops ?? (xw ? laneStops(edges, new Float32Array(0), xw.list) : null);
  // 횡단보도마다 그 면을 지나는 [구간, 구간 위 거리](사람이 건너기 전에 다가오는 차를 본다, approaching)
  const xwEdges: [number, number][][] = (xw?.list ?? []).map(() => []);
  if (stops && xw)
    for (const e of edges)
      for (let l = 0; l < e.lanes; l++) {
        const q = stops.xwOf(e.id, l);
        for (let k = 0; k < q.length; k += 4) if (!xwEdges[q[k + 2]].some(([id]) => id === e.id)) xwEdges[q[k + 2]].push([e.id, (q[k] + q[k + 1]) / 2]);
      }
  const XS: number[] = [];
  /** 구간 e 의 차로 l 정지 자리(구간 끝에서 앞 범퍼까지 m). 차로 정지 자리가 없으면 신호 정지선(ap), 그것도 없으면 −1 */
  const stopBack = (e: Edge, l: number, ap?: Approach) => {
    const b = stops ? stops.back(e.id, l) : -1;
    return b >= 0 ? b : ap ? ap.setback : -1;
  };
  // 교차로 경로: 진입 구간에 올라서면 교차로를 빠져나가는 구간까지 미리 정한다
  const PLAN = 10;
  const plan = new Int32Array(max * PLAN);
  const planN = new Uint8Array(max);
  const planK = new Uint8Array(max); // 지금 달리는 구간이 경로의 몇 번째인가
  const pathOf = new Int32Array(max).fill(-1); // 정한 경로의 번호
  // 잡아 둔 교차로. 앞 교차로를 다 빠져나가기 전에 다음 교차로를 잡을 수 있어 두 칸을 둔다
  const claim = new Int32Array(max).fill(-1);
  const claimPath = new Int32Array(max);
  const claimExit = new Int32Array(max); // 잡은 경로의 나가는 구간
  const claimXL = new Uint8Array(max); // 잡은 경로로 빠져나갈 구간의 차로
  const claimT = new Float32Array(max); // 잡아 둔 지 몇 초
  const prevClaim = new Int32Array(max).fill(-1);
  const prevPath = new Int32Array(max);
  const prevExit = new Int32Array(max);
  const prevE = new Int32Array(max).fill(-1); // 바로 앞에 달린 구간과 차로(교차로 곡선에 쓴다)
  const prevLane = new Uint8Array(max);
  const waitT = new Float32Array(max); // 교차로 앞에서 기다린 시간(초)
  const boxed = new Uint8Array(max); // 교차로 상자 안 곡선 위에 있는가
  const stopT = new Float32Array(max); // 멈춰 선 지 몇 초
  // 측정용: 이번 단계에 따라간 앞 대상(차 번호, 자기 자신이면 정지선·상자 앞 같은 서는 자리, 없으면 −1)과 그 까닭(AHEAD 번호)
  const ahead = new Int32Array(max).fill(-1);
  const aheadWhy = new Uint8Array(max);
  const held: number[][] = Array.from({ length: jn.count }, () => []);
  const coming: number[][] = Array.from({ length: jn.count }, () => []);

  // 판 가장자리로 빠져나갈 수 있는 구간: 끝이 가장자리에 닿거나, 그런 구간으로 이어진다
  const canLeave = new Uint8Array(edges.length);
  const before: number[][] = edges.map(() => []);
  for (const e of edges) for (const k of e.next) before[k].push(e.id);
  const queue = edges.filter((e) => Math.hypot(e.p[e.p.length - 3], e.p[e.p.length - 1]) > BOARD_R - 40).map((e) => e.id);
  for (const k of queue) canLeave[k] = 1;
  while (queue.length) for (const k of before[queue.pop()!]) if (!canLeave[k]) (canLeave[k] = 1), queue.push(k);
  // 차를 놓을 수 있는 구간(판 밖으로 나갈 수 있는 구간, 그런 구간이 없는 시험용 길이면 모두)
  const placeable = canLeave.some((c) => c) ? canLeave : new Uint8Array(edges.length).fill(1);
  const entries = edges.filter((e) => e.entry);
  const entryW = entries.map((e) => e.vol * Math.max(0, 4 - e.cls));
  const speed = new Float32Array(edges.length).fill(10);
  // 구간 가운데 자리(도로 속도는 장소 둘레 혼잡에 따라 달라진다)
  const midX = new Float32Array(edges.length);
  const midZ = new Float32Array(edges.length);
  const midH = new Float32Array(edges.length); // 그 자리의 진행 방향(방향마다 다른 실제 도로 속도를 고른다)
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
  const leaveTail = new Int32Array(edges.length * 8); // 구간·차로에서 막 빠져나가 아직 교차로 상자 안에 꽁무니가 있는 차
  // 차 자리 격자(8m 칸): 다른 구간의 차가 내 차로 앞을 막는지 찾는 데 쓴다
  const CELL = 8;
  const GW = Math.ceil((2 * BOARD_R + 400) / CELL);
  const cellHead = new Int32Array(GW * GW);
  const cellNext = new Int32Array(max);
  const cellAt = (x: number) => Math.max(0, Math.min(GW - 1, Math.floor((x + BOARD_R + 200) / CELL)));
  const tmp = [0, 0, 0];
  /** 막힌 길일수록 덜 고른다: 들어설 첫머리에 빈 길이(가장 넉넉한 차로의 맨 뒤 차까지)가 60m 보다 짧을수록,
   *  그 구간 차들의 평균 속도가 제 속도의 절반보다 느릴수록 무게를 줄인다 */
  const meanV = new Float32Array(edges.length).fill(-1); // 구간 차들의 평균 속도(1초마다, 차가 없으면 −1)
  // 돌발정보(src/sim/incidents.ts): 막힌 차로(사고·공사, 없으면 −1), 통제 구간, 서행 지점(없으면 −1)과 그 앞뒤 25m 에서 낼 수 있는 속도
  const blockLane = new Int8Array(edges.length).fill(-1);
  const closed = new Uint8Array(edges.length);
  const slowAt = new Float32Array(edges.length).fill(-1);
  const slowV = new Float32Array(edges.length);
  /** 구간 e 에서 차로 ln 이 막혀 있으면 옆 차로(바깥쪽이 있으면 바깥쪽)로 */
  const free = (e: Edge, ln: number) => (ln !== blockLane[e.id] || e.lanes < 2 ? ln : ln + 1 < e.lanes ? ln + 1 : ln - 1);
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
  function chooseNext(i: number, e: Edge, ahead = 1, leave = -1): number {
    const r = cars.route[i];
    if (r >= 0) return rpos[i] + ahead < routes[r].edges.length ? routes[r].edges[rpos[i] + ahead] : -1;
    if (!e.next.length) return -1;
    // 교차로 앞 구간에서는 노면 화살표가 지금 차로에 허락하는 쪽만 고른다(그런 쪽이 없으면 모두)
    if (ahead === 1 && jn.groupOfEnd[e.id] >= 0 && e.id === edge[i]) {
      const by = e.next.filter((k) => turnAllowed(e, edges[k], lane[i]));
      if (by.length && by.length < e.next.length) {
        const w = by.map((k) => e.nextW[e.next.indexOf(k)] * avoid(k) * (canLeave[k] ? 1 : 1e-3));
        return by[pick(w, rand())];
      }
    }
    const ok = e.next.filter((k) => canLeave[k]);
    if (ok.length && ok.length < e.next.length) {
      const w = ok.map((k) => e.nextW[e.next.indexOf(k)] * avoid(k));
      return ok[pick(w, rand())];
    }
    // 교차로 안을 맴돌지 않도록, 묶인 교차로 안 구간에서는 빠져나가는 쪽을 고른다
    if (leave >= 0) {
      const out = e.next.filter((k) => jn.groupOfEnd[k] !== leave);
      if (out.length) return out[pick(out.map(avoid), rand())];
    }
    return e.next[pick(e.nextW.map((w, j) => w * avoid(e.next[j])), rand())];
  }

  /** 차 i 가 구간 from(다음 구간부터 k−1 칸 뒤) 다음에 갈 구간. 정해 둔 경로·노선이 없는데 갈림길이면 −1 */
  function laterEdge(i: number, from: Edge, k: number): number {
    const r = cars.route[i];
    if (r >= 0) return rpos[i] + 1 + k < routes[r].edges.length ? routes[r].edges[rpos[i] + 1 + k] : -1;
    if (planK[i] + 1 + k < planN[i]) return plan[i * PLAN + planK[i] + 1 + k];
    return from.next.length === 1 ? from.next[0] : -1;
  }

  /** 차 i 가 구간 e 에 막 올라섰다: 다음 구간을 정하고, 교차로 진입 구간이면 빠져나갈 때까지의 경로를 정한다 */
  function onEdge(i: number, e: Edge) {
    const b = i * PLAN;
    if (planK[i] + 1 < planN[i] && plan[b + planK[i] + 1] === e.id) {
      planK[i]++;
      if (planK[i] + 1 < planN[i]) {
        nextE[i] = plan[b + planK[i] + 1];
        return;
      }
    }
    planN[i] = 0;
    planK[i] = 0;
    pathOf[i] = -1;
    const g = jn.groupOfEnd[e.id];
    if (g < 0 || jn.groupOfStart[e.id] === g) {
      nextE[i] = chooseNext(i, e);
      return;
    }
    plan[b] = e.id;
    let n = 1;
    let cur = e;
    while (n < PLAN) {
      const nx = chooseNext(i, cur, n, n >= 2 ? g : -1);
      if (nx < 0) break;
      plan[b + n++] = nx;
      if (jn.groupOfEnd[nx] !== g) break;
      cur = edges[nx];
    }
    planN[i] = n;
    nextE[i] = n > 1 ? plan[b + 1] : -1;
    if (n > 1) {
      lanesAlong(i, b, n, 0, LI);
      pathOf[i] = jn.pathId(plan.subarray(b, b + n), n, LI);
    }
  }

  function put(i: number, e: Edge, at: number, ln: number, route = -1) {
    edge[i] = e.id;
    s[i] = at;
    lane[i] = ln;
    pref[i] = (ln + Math.min(0.999, rand())) / e.lanes;
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
    claim[i] = -1;
    prevClaim[i] = -1;
    planN[i] = 0;
    planK[i] = 0;
    waitT[i] = 0;
    stopT[i] = 0;
    prevE[i] = -1;
    if (route < 0) rpos[i] = 0;
    onEdge(i, e);
  }

  /** r번 노선의 at(m) 지점에 버스를 놓는다 */
  function addBus(r: number, at = 0.5): boolean {
    const R = routes[r];
    if (cars.n >= max || !R) return false;
    let k = 0;
    while (k < R.edges.length - 1 && R.start[k + 1] <= at) k++;
    const e = edges[R.edges[k]];
    const i = cars.n;
    rpos[i] = k;
    put(i, e, Math.min(e.len - 0.1, at - R.start[k]), e.med && R.usesMed ? MED : e.lanes - 1, r);
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
    rpos[i] = rpos[j];
    stopK[i] = stopK[j];
    dwell[i] = dwell[j];
    cars.route[i] = cars.route[j];
    cars.uid[i] = cars.uid[j];
    cars.room[i] = cars.room[j];
    cars.x[i] = cars.x[j];
    cars.y[i] = cars.y[j];
    cars.z[i] = cars.z[j];
    cars.yaw[i] = cars.yaw[j];
    edge[i] = edge[j];
    nextE[i] = nextE[j];
    s[i] = s[j];
    v[i] = v[j];
    lane[i] = lane[j];
    pref[i] = pref[j];
    vf[i] = vf[j];
    size[i] = size[j];
    wid[i] = wid[j];
    cars.kind[i] = cars.kind[j];
    cars.tint[i] = cars.tint[j];
    cars.brake[i] = cars.brake[j];
    cars.fade[i] = cars.fade[j];
    plan.copyWithin(i * PLAN, j * PLAN, j * PLAN + PLAN);
    planN[i] = planN[j];
    planK[i] = planK[j];
    pathOf[i] = pathOf[j];
    claim[i] = claim[j];
    claimPath[i] = claimPath[j];
    claimExit[i] = claimExit[j];
    claimXL[i] = claimXL[j];
    stopT[i] = stopT[j];
    boxed[i] = boxed[j];
    claimT[i] = claimT[j];
    prevClaim[i] = prevClaim[j];
    prevPath[i] = prevPath[j];
    prevExit[i] = prevExit[j];
    waitT[i] = waitT[j];
    prevE[i] = prevE[j];
    prevLane[i] = prevLane[j];
  }

  const cv = [0, 0, 0, 0];
  /** 차 i 가 차로 lanes 개인 구간에서 달릴 차로(버스는 맨 오른쪽) */
  // 차로 위 자리 x = 차로 번호 + 그 차로 안 자리(0~1). 지금 구간에서는 pref × 차로 수이고, 다음 구간으로 넘어갈 때 graph.ts lanePos 의 차로 잇기 표로 옮긴다
  /** 차 i 가 구간 o 의 차로 위 자리 x 에서 달릴 차로(버스는 맨 오른쪽, 중앙버스차로 노선이면 중앙버스차로) */
  const laneAt = (i: number, o: Edge, x: number) =>
    cars.route[i] >= 0 ? (o.med && routes[cars.route[i]].usesMed ? MED : free(o, o.lanes - 1)) : free(o, Math.min(o.lanes - 1, Math.max(0, Math.floor(x))));
  /** 차 i 가 지금 구간 다음의 구간 o 에서 달릴 차로 위 자리와 차로 */
  const nextPosOf = (i: number, o: Edge) => lanePos(edges[edge[i]], o, pref[i] * edges[edge[i]].lanes);
  const outLane = (i: number, o: Edge) => laneAt(i, o, nextPosOf(i, o));
  function locate(i: number) {
    const e = edges[edge[i]];
    // 교차로 상자 안에서는 들어온 차로와 나갈 차로를 잇는 곡선을 따라간다
    let inBox = false;
    let med = false; // 곡선 한쪽 끝이 중앙버스차로
    let mw = 0; // 곡선 위 그 자리의 중앙버스차로 자리(두 구간의 med 를 곡선을 따라 잇는다)
    boxed[i] = 0;
    if (nextE[i] >= 0 && s[i] > e.len - jn.rIn[e.id]) {
      const o = edges[nextE[i]];
      const lo = outLane(i, o);
      const d = s[i] - (e.len - jn.rIn[e.id]);
      jn.curve(e, o, lane[i], lo, d, cv);
      med = lane[i] === MED || lo === MED;
      mw = medAlong(e, o, d);
      inBox = true;
      boxed[i] = jn.groupOfEnd[e.id] >= 0 ? 1 : 0;
    } else if (prevE[i] >= 0 && s[i] < jn.rOut[e.id]) {
      const a = edges[prevE[i]];
      jn.curve(a, e, prevLane[i], lane[i], jn.rIn[a.id] + s[i], cv);
      med = prevLane[i] === MED || lane[i] === MED;
      mw = medAlong(a, e, jn.rIn[a.id] + s[i]);
      inBox = true;
      boxed[i] = jn.groupOfStart[e.id] >= 0 ? 1 : 0;
    }
    if (inBox) {
      const w = med && cars.route[i] >= 0 ? islandShift(i, mw) : 0;
      cars.x[i] = cv[0] + Math.sin(cv[3]) * w;
      cars.y[i] = cv[1];
      cars.z[i] = cv[2] - Math.cos(cv[3]) * w;
      cars.yaw[i] = cv[3];
      return;
    }
    pointAt(e.p, e.cum, s[i], tmp);
    const off = laneOff(e, lane[i], s[i]) - (lane[i] === MED ? islandShift(i, medAt(e, s[i])) : 0);
    const yaw = headingNear(e, s[i], off);
    cars.x[i] = tmp[0] - Math.sin(yaw) * off;
    cars.y[i] = tmp[1];
    cars.z[i] = tmp[2] + Math.cos(yaw) * off;
    cars.yaw[i] = yaw;
  }

  /** 상자 안 곡선(a 끝에서 b 시작까지, 들어선 뒤 d m)의 그 자리 중앙버스차로 자리 med. 한쪽에만 중앙버스차로가 있으면 그쪽 값 */
  function medAlong(a: Edge, b: Edge, d: number): number {
    const ma = a.med ? medAt(a, a.len - jn.rIn[a.id]) : 0;
    const mb = b.med ? medAt(b, jn.rOut[b.id]) : 0;
    if (!ma || !mb) return ma || mb;
    const u = Math.max(0, Math.min(1, d / Math.max(0.1, jn.rIn[a.id] + jn.rOut[b.id])));
    return ma + (mb - ma) * u;
  }
  /** 중앙버스차로 버스가 중앙 정류장 둘레에서 승강장 폭만큼 왼쪽으로 비켜서는 거리(m). 승강장 안에서 다 비키고, 승강장 끝에서 22m 밖은 0.
   *  med 는 그 자리의 중앙버스차로 자리(일반 차로 왼쪽 가장자리에서 버스차로 가운데까지)로, 비켜선 버스는 med 와 상관없이 같은 자리에 선다 */
  function islandShift(i: number, med: number): number {
    const R = routes[cars.route[i]];
    const at = R.start[rpos[i]] + s[i];
    let w = 0;
    let extra = 0;
    for (const k of [stopK[i] - 1, stopK[i]])
      if (R.med[k]) {
        const wk = Math.min(1, Math.max(0, (ISLAND_L / 2 + 22 - Math.abs(at - R.stops[k] + ISLAND_BACK)) / 22));
        if (wk > w) (w = wk), (extra = R.shift[k] ?? 0);
      }
    // 승강장이 휜 가장자리에 맞춰 표준 자리보다 더 왼쪽에 놓인 정류장(buses.ts shift)에서는 그만큼 더 비킨다
    return Math.max(0, 0.25 + ISLAND_W + 0.15 + 1.25 + extra - med) * w;
  }

  /** 시간대 교통량(차로 1km 에 몇 대) */
  function density(now: Now): number {
    const weekend = now.dow === 0 || now.dow === 6;
    return 2.5 + 9 * commute(now.tod) * (weekend ? 0.5 : 1) + 4 * daytime(now.tod) + 2.5 * nightlife(now.tod);
  }
  // ── 차량 수 ──
  // 구간마다 지금 있어야 할 실제 차 수는 흐름 속도로 정한다. 원활(속도 비율 0.65 이상)하면 시간대 교통량만큼이고,
  // 느려질수록 늘어 속도 비율 0.15(꽉 막힘)에서 차로 1km 에 100대가 된다(서행 0.35 에서 약 60대).
  // 교통량이 적은 시간(시간대 교통량 3대 미만, 새벽 1~6시)에는 밀도 = 교통량 ÷ 속도(시간대 교통량 ÷ 속도 비율)를 넘지 않게 하고, 4.5대 이상(낮·저녁·출퇴근, 밤 11시 전)이면 위 곡선 그대로다.
  // 새벽 실시간 자료의 정체는 대부분 짧은 구간(150m 미만)의 신호 대기라 차가 많다는 뜻이 아니다(2026-11-15 04:20 일요일: 정체 48구간 가운데 34구간).
  // 다만 그 속도로 달리는 차가 앞차와 띄우는 간격(차 길이 4.6m + 2m + 1.3초 거리)보다 촘촘할 수는 없다. 상한이 모자라면 보는 곳(초점) 안을 먼저 실제 밀도에 가깝게 채우고, 밖에는 남은 몫을 고르게 나눈다.
  // 초점 안·밖의 모자란 차와 넘치는 차는 화면 밖 길 위에서만 놓고 뺀다
  const JAM = 100;
  const real = new Float32Array(edges.length); // 구간마다 실제 차 수
  const inF = new Float32Array(edges.length); // 구간 길이 가운데 초점 안 비율
  let focus: { x: number; z: number; r: number } | null = null;
  let seen: (x: number, z: number) => boolean = () => false;
  let nIn = 0;
  let nOut = 0;
  let ratioIn = 1;
  let ratioOut = 1;
  const cumIn = new Float64Array(edges.length);
  const cumOut = new Float64Array(edges.length);
  /** 지금 시각의 구간별 실제 차 수를 정하고 상한 안에서 초점 안·밖 몫을 나눈다. 목표 대수를 돌려준다 */
  function allot(now: Now): number {
    const base = density(now);
    const busy = Math.min(1, Math.max(0, (base - 3) / 1.5));
    let F = 0;
    let O = 0;
    for (const e of edges) {
      const r = provider.roadSpeed(now, e.cls, e.key, midX[e.id], midZ[e.id], midH[e.id]);
      const curve = base + (JAM - base) * Math.max(0, Math.min(1, (0.65 - r) / 0.5));
      const k = Math.min(curve + (Math.min(curve, base / Math.max(r, 0.15)) - curve) * (1 - busy), 1000 / (6.6 + 1.3 * r * VFREE[e.cls]));
      real[e.id] = (k * e.len * e.vol) / 1000;
      F += real[e.id] * inF[e.id];
      O += real[e.id] * (1 - inF[e.id]);
    }
    const B = max - reserve;
    nIn = Math.min(F, B * 0.85);
    ratioIn = nIn > 0 ? F / nIn : 1;
    nOut = Math.min(O / ratioIn, B - nIn);
    ratioOut = nOut > 0 ? O / nOut : ratioIn;
    // 차를 놓을 구간의 무게: 그 구간 목표보다 모자란 만큼. 이미 막혀 차들이 제 속도의 40%도 못 내는 구간에는 놓지 않는다
    let ci = 0;
    let co = 0;
    for (const e of edges) {
      const l = lists[e.id];
      let vm = 0;
      for (const j of l) vm += v[j];
      meanV[e.id] = l.length ? vm / l.length : -1;
      const jammed = l.length > 0 && vm / l.length < 0.4 * speed[e.id];
      const w = !placeable[e.id] || jammed || closed[e.id] ? 0 : Math.max(0, real[e.id] * (inF[e.id] / ratioIn + (1 - inF[e.id]) / ratioOut) - l.length);
      ci += w * inF[e.id];
      co += w * (1 - inF[e.id]);
      cumIn[e.id] = ci;
      cumOut[e.id] = co;
    }
    return Math.round(nIn + nOut);
  }
  const target = (now: Now) => allot(now);
  /** 보는 곳을 정한다: 중심 (x, z), 반지름 r(m), 화면에 보이는 자리인지 알려 주는 함수 */
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
  /** 누적 무게 cum 에 비례해 구간 하나를 고른다 */
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
  /** 초점 안(inside) 또는 밖의 화면에 안 보이는 길 위, 앞뒤 차와 그 속도에 맞는 간격이 비는 자리에 차 한 대를 놓는다 */
  function spawnHidden(inside: boolean): boolean {
    const id = pickEdge(inside ? cumIn : cumOut);
    if (id < 0) return false;
    const e = edges[id];
    const lo = jn.rOut[id] + 3;
    const hi = e.len - jn.rIn[id] - 3;
    if (hi <= lo) return false;
    const at = lo + rand() * (hi - lo);
    const ln = free(e, Math.floor(rand() * e.lanes));
    const seg = pointAt(e.p, e.cum, at, tmp);
    const yaw = headingAt(e.p, seg);
    const off = laneOff(e, ln, at);
    const x = tmp[0] - Math.sin(yaw) * off;
    const z = tmp[2] + Math.cos(yaw) * off;
    if (nearFocus(x, z) !== inside || seen(x, z)) return false;
    let ahead = -1;
    for (const j of lists[id]) {
      if (lane[j] !== ln) continue;
      if (Math.abs(s[j] - at) < (size[j] + 4.6) / 2 + 2 + 1.3 * v[j]) return false;
      if (s[j] > at && (ahead < 0 || s[j] < s[ahead])) ahead = j;
    }
    const i = cars.n;
    put(i, e, at, ln);
    if (ahead >= 0 && s[ahead] - at < 60) v[i] = Math.min(v[i], v[ahead]);
    lists[id].push(i);
    cars.n++;
    locate(i);
    return true;
  }
  /** 초점 안(inside) 또는 밖에서 화면에 안 보이는 승용차 한 대를 뺀다(교차로에 들어선 차는 빼지 않는다). inside 가 없으면 90초 넘게 갇힌 차만 뺀다 */
  function dropHidden(inside?: boolean): boolean {
    const i = Math.floor(rand() * cars.n);
    if (cars.route[i] >= 0 || claim[i] >= 0 || prevClaim[i] >= 0 || boxed[i] || seen(cars.x[i], cars.z[i])) return false;
    if (inside === undefined ? stopT[i] < 90 : nearFocus(cars.x[i], cars.z[i]) !== inside) return false;
    remove(i);
    return true;
  }

  /** 노선마다 배차 간격에 맞는 수의 버스를 흩어 놓는다 */
  function fillBuses(now: Now) {
    routes.forEach((R, r) => {
      const h = busHeadway(R, now.tod);
      wait[r] = h ? rand() * h : 60;
      if (!h) return;
      const count = R.len / (h * 6.5);
      const k = Math.floor(count) + (rand() < count % 1 ? 1 : 0);
      for (let j = 0; j < k; j++) addBus(r, ((j + rand() * 0.6) / Math.max(1, count)) * R.len * Math.min(1, count));
    });
  }

  /** 길 전체에 고르게 n대를 놓는다(처음 화면이 비어 보이지 않게) */
  /** n대를 길에 놓는다(처음 화면이 비어 보이지 않게). 구간마다 실제 차 수에 초점 안·밖 비율을 나눈 밀도로, 같은 차로에서는 고른 간격으로 */
  function fill(n: number) {
    n = Math.min(n, max - reserve - (cars.n - nBus));
    if (n <= 0) return;
    const has = real.some((r) => r > 0);
    const piece: number[] = []; // [구간, 시작, 길이, 누적 무게]
    let total = 0;
    for (const e of edges) {
      if (!placeable[e.id] || closed[e.id]) continue;
      const perM = has ? real[e.id] / e.len : e.vol;
      // 교차로 상자와 그 앞뒤 3m 에는 놓지 않는다(상자 안에 엇갈린 방향 차가 처음부터 포개지지 않게, spawnHidden 과 같은 범위)
      const lo = jn.rOut[e.id] + 3;
      const hi = e.len - jn.rIn[e.id] - 3;
      for (let d = lo; d < hi; d += 20) {
        const L = Math.min(20, hi - d);
        pointAt(e.p, e.cum, d + L / 2, tmp);
        total += perM * L * (nearFocus(tmp[0], tmp[2]) ? 1 / ratioIn : 1 / ratioOut);
        piece.push(e.id, d, L, total);
      }
    }
    if (!(total > 0)) return;
    // 이미 놓은 차와 겹치는 자리(합쳐지는 길에서 다른 구간 차와 겹치는 곳)는 건너뛴다
    const near = new Map<number, number[]>();
    const keyOf = (x: number, z: number) => Math.floor(x / 8) * 4096 + Math.floor(z / 8);
    for (let i = 0; i < cars.n; i++) (near.get(keyOf(cars.x[i], cars.z[i])) ?? near.set(keyOf(cars.x[i], cars.z[i]), []).get(keyOf(cars.x[i], cars.z[i]))!).push(i);
    for (let k = 0, p = 0; k < n; k++) {
      const x = ((k + rand() * 0.5) / n) * total;
      while (p + 4 < piece.length && piece[p + 3] < x) p += 4;
      const e = edges[piece[p]];
      const w = piece[p + 3] - (p ? piece[p - 1] : 0);
      const u = ((x - (piece[p + 3] - w)) / w) * piece[p + 2] * e.lanes;
      const ln = free(e, Math.min(e.lanes - 1, Math.floor(u / piece[p + 2])));
      const i = cars.n;
      put(i, e, Math.min(e.len - 0.1, piece[p + 1] + u - ln * piece[p + 2]), ln);
      locate(i);
      const gx = Math.floor(cars.x[i] / 8);
      const gz = Math.floor(cars.z[i] / 8);
      let clash = false;
      for (let dx = -1; dx <= 1 && !clash; dx++)
        for (let dz = -1; dz <= 1 && !clash; dz++)
          for (const j of near.get((gx + dx) * 4096 + gz + dz) ?? [])
            if (Math.hypot(cars.x[j] - cars.x[i], cars.z[j] - cars.z[i]) < (size[i] + size[j]) / 2 + 1 && Math.cos(cars.yaw[j] - cars.yaw[i]) > 0.64) clash = true;
      if (clash) continue;
      (near.get(gx * 4096 + gz) ?? near.set(gx * 4096 + gz, []).get(gx * 4096 + gz)!).push(i);
      cars.fade[i] = 1;
      cars.n++;
    }
  }


  /** 신호 때문에 서 있거나 설 차인가 */
  function redAhead(i: number, tod: number): boolean {
    const ap = signals?.approach.get(edge[i]);
    return !!ap && signals!.state(ap.c, ap.group, tod) !== GREEN;
  }
  /** 차 i 가 교차로 g 에 정한 경로 p 로 지금 들어가도 되는가 */
  /** 차 i 가 j 보다 먼저 갈 차인가: 더 큰 길(등급이 낮고 차로가 많은 길), 같으면 먼저 나타난 차 */
  function outranks(i: number, j: number): boolean {
    const a = edges[edge[i]];
    const b = edges[edge[j]];
    if (a.cls !== b.cls) return a.cls < b.cls;
    if (a.vol !== b.vol) return a.vol > b.vol;
    return cars.uid[i] < cars.uid[j];
  }

  /** 정해 둔 경로로 교차로를 빠져나갈 때의 차로 */
  function exitLane(i: number): number {
    return planN[i] > 1 ? laneAt(i, edges[plan[i * PLAN + planN[i] - 1]], exitPos(i)) : lane[i];
  }
  /** 정해 둔 경로(지금 구간부터)를 따라가 빠져나갈 구간에 닿았을 때의 차로 위 자리 */
  function exitPos(i: number): number {
    const b = i * PLAN;
    let x = pref[i] * edges[plan[b + planK[i]]].lanes;
    for (let k = planK[i] + 1; k < planN[i]; k++) x = lanePos(edges[plan[b + k - 1]], edges[plan[b + k]], x);
    return x;
  }
  const LI = new Int8Array(PLAN);
  /** 차 i 가 경로(plan 의 b 부터 n 구간)의 k0번째 구간을 지금 달릴 때, k0번째부터 경로 끝까지 구간마다 달릴 차로를 out 에 쓴다 */
  function lanesAlong(i: number, b: number, n: number, k0: number, out: Int8Array) {
    out[k0] = lane[i];
    let x = pref[i] * edges[plan[b + k0]].lanes;
    for (let k = k0 + 1; k < n; k++) {
      const o = edges[plan[b + k]];
      x = lanePos(edges[plan[b + k - 1]], o, x);
      out[k] = laneAt(i, o, x);
    }
  }
  /** 차 i 가 교차로를 빠져나갈 구간 x 의 그 차로에서 상자 끝부터 맨 뒤 차 꽁무니까지 빈 길이.
   *  x 끝 신호가 초록불이 아니면 정지선까지만 설 수 있다 */
  function roomOn(i: number, x: Edge, tod: number): number {
    const ap = signals?.approach.get(x.id);
    let xp = exitPos(i);
    const cap = ap && signals!.state(ap.c, ap.group, tod) !== GREEN ? x.len - stopBack(x, laneAt(i, x, xp), ap) - jn.rOut[x.id] : Infinity;
    let d = -jn.rOut[x.id];
    for (let e = x, k = 0; k < 4 && d < 40; k++) {
      const t = tail[e.id * 8 + laneAt(i, e, xp)];
      if (t >= 0) return Math.min(cap, d + s[t] - size[t] / 2);
      d += e.len;
      if (e.next.length !== 1) break;
      xp = lanePos(e, edges[e.next[0]], xp);
      e = edges[e.next[0]];
    }
    return cap;
  }

  function mayEnter(i: number, g: number, p: number, e: Edge, tod: number): boolean {
    const b = i * PLAN;
    const n = planN[i];
    for (const h of held[g]) {
      if (h === i) continue;
      const hp = claim[h] === g ? claimPath[h] : prevPath[h];
      // 경로는 차로 단위라, 다른 차로에서 들어와 한 차로로 모이는 두 차도 곡선이 만나 부딪는 경로다
      if (jn.conflict(p, hp)) return false;
    }
    // 묶인 교차로 안의 신호는 그 정지선까지 가는 동안(지금 속도, 적어도 4m/s) 초록불이 남아 있을 때만 들어간다(들어간 뒤에는 그 신호에 서지 않고 빠져나간다)
    if (signals) {
      let dist = e.len - s[i];
      for (let k = 1; k < n - 1; k++) {
        const ek = edges[plan[b + k]];
        const ap = signals.approach.get(ek.id);
        if (ap && signals.greenLeft(ap.c, ap.group, tod) < (dist + ek.len - ap.setback) / Math.max(4, v[i]) + 1) return false;
        dist += ek.len;
      }
      // 빠져나갈 구간의 정지선이 상자 끝에서 10m 안이면(교차로를 빠져나오자마자 길 중간 횡단보도 신호) 그 신호도 지나갈 만큼 초록불이 남아야 들어간다
      const xe = edges[plan[b + n - 1]];
      const xap = signals.approach.get(xe.id);
      if (xap && xe.len - xap.setback < jn.rOut[xe.id] + 10 && signals.greenLeft(xap.c, xap.group, tod) < (dist + xe.len - xap.setback) / Math.max(4, v[i]) + 1) return false;
    }
    // 빠져나갈 차로에 이 차와, 먼저 같은 차로로 나가려고 들어간 차들이 설 자리가 없으면 교차로 안에 서 버리므로 들어가지 않는다(꼬리 물기 금지)
    const x = edges[plan[b + n - 1]];
    const xl = exitLane(i);
    let need = size[i] + 2.5;
    for (const h of held[g]) if (h !== i && claim[h] === g && claimExit[h] === x.id && claimXL[h] === xl && edge[h] !== x.id) need += size[h] + 2.5;
    if (roomOn(i, x, tod) < need) return false;
    for (const a of coming[g]) {
      const ea = edges[edge[a]];
      if (a === i || ea.id === e.id || !jn.conflict(p, pathOf[a])) continue;
      const ta = ea.len - s[a] - size[a] / 2 - jn.rIn[ea.id];
      // 큰길로 곧 닿을 차가 있으면 작은 길 차가 기다린다(20초 넘게 기다렸으면 끼어든다)
      if (ea.cls < e.cls && waitT[i] < 20 && ta / Math.max(v[a], 0.5) < 4.5 && !redAhead(a, tod)) return false;
      // 같은 급의 길이면 먼저 와서 기다린 차가 먼저 간다
      if (ea.cls === e.cls && ta < 3 && waitT[a] > waitT[i] + 1) return false;
    }
    return true;
  }

  /** 이번 단계에 정류장에 막 선 버스들: [노선 번호, 정류장 번호, 버스(차 번호)] */
  const dwells: [number, number, number][] = [];

  function step(dt: number, now: Now, spawn = true) {
    dwells.length = 0;
    speedAge += dt;
    if (speedAge > 1) {
      speedAge = 0;
      for (const e of edges) speed[e.id] = VFREE[e.cls] * provider.roadSpeed(now, e.cls, e.key, midX[e.id], midZ[e.id], midH[e.id]);
      allot(now);
    }
    // 구간·차로별로 줄 세우고 맨 뒤 차를 적어 둔다. 같은 차로에 줄 선 앞뒤 차끼리는 무엇을 따라가든 그릴 때 늘일 한도(room)를 서로 줄인다
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
        acc[i] = lead[lane[i]]; // 잠시 앞차 번호를 담아 둔다
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
    leaveTail.fill(-1);
    for (let i = 0; i < cars.n; i++) {
      if (prevE[i] < 0 || s[i] - size[i] / 2 > jn.rOut[edge[i]]) continue;
      const k = prevE[i] * 8 + prevLane[i];
      if (leaveTail[k] < 0 || s[i] < s[leaveTail[k]]) leaveTail[k] = i;
    }
    cellHead.fill(-1);
    for (let i = 0; i < cars.n; i++) {
      const k = cellAt(cars.x[i]) * GW + cellAt(cars.z[i]);
      cellNext[i] = cellHead[k];
      cellHead[k] = i;
    }
    // 교차로: 다 지나간 차는 잡아 둔 상자를 놓고, 상자마다 들어간 차와 다가오는 차를 적어 둔다
    for (const l of held) l.length = 0;
    for (const l of coming) l.length = 0;
    for (let i = 0; i < cars.n; i++) {
      const e = edges[edge[i]];
      const rear = s[i] - size[i] / 2;
      if (prevClaim[i] >= 0) {
        if (edge[i] === prevExit[i] && rear < jn.rOut[e.id]) held[prevClaim[i]].push(i);
        else prevClaim[i] = -1;
      }
      if (claim[i] >= 0) {
        claimT[i] += dt;
        // 교차로로 들어가는 중이거나 안에 있거나, 빠져나간 구간에서 뒤꽁무니가 아직 상자 안이면 잡고 있는다
        const keep = jn.groupOfEnd[e.id] === claim[i] || (edge[i] === claimExit[i] && rear < jn.rOut[e.id]);
        // 30초 넘게 못 들어간 차는 잡은 교차로를 놓는다. 상자 안에 들어선 차는 빠져나갈 때까지 놓지 않는다(놓으면 부딪는 경로의 차가 들어와 겹친다)
        if (keep && (claimT[i] < 30 || boxed[i])) {
          if (prevClaim[i] !== claim[i]) held[claim[i]].push(i);
        } else claim[i] = -1;
      }
      const g = jn.groupOfEnd[e.id];
      if (g >= 0 && pathOf[i] >= 0 && planK[i] === 0 && !(claim[i] === g && claimPath[i] === pathOf[i]) && e.len - s[i] < 50) coming[g].push(i);
    }
    for (let i = 0; i < cars.n; i++) {
      const e = edges[edge[i]];
      cars.fade[i] = Math.min(1, cars.fade[i] + dt * 2);
      const r = cars.route[i];
      if (r >= 0 && dwell[i] > 0) {
        // 정류장에 서 있다
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
        // 같은 차로에서 막 빠져나간 앞차: 다른 쪽으로 갔거나 같은 구간의 다른 차로로 갔어도 곡선은 처음에 겹치므로, 꽁무니가 상자를 벗어날 때까지 따라간다
        const lt = leaveTail[e.id * 8 + lane[i]];
        if (lt >= 0) {
          front = lt;
          why = 2;
          gap = e.len - s[i] + s[lt];
        }
        // 다음 구간들에서 같은 차로의 맨 뒤 차를 찾는다. 짧은 구간 너머에 선 차도 제동 거리 안에서 미리 본다
        const horizon = 20 + v[i] * 2 + (v[i] * v[i]) / (2 * B_COMF);
        let d = e.len - s[i];
        let id = nextE[i];
        let xp = pref[i] * e.lanes;
        for (let k = 1, pe = e; id >= 0 && d < horizon; k++) {
          const ne = edges[id];
          xp = lanePos(pe, ne, xp);
          pe = ne;
          const t = tail[ne.id * 8 + laneAt(i, ne, xp)];
          if (t >= 0) {
            if (d + s[t] < gap) {
              front = t;
              why = 2;
              gap = d + s[t];
            }
            break;
          }
          d += ne.len;
          id = laterEdge(i, ne, k);
        }
      }
      if (front >= 0) {
        gap -= (size[front] + size[i]) / 2;
        dv = v[i] - v[front];
        // 길을 따라 잰 거리는 가운데선 위 거리라, 굽은 길의 안쪽 차로나 교차로·이음매 곡선에서는 실제 차 사이보다 길다. 그려진 자리 사이 거리로도 재서 짧은 쪽을 쓴다
        gap = Math.min(gap, Math.hypot(cars.x[front] - cars.x[i], cars.z[front] - cars.z[i]) - (size[front] + size[i]) / 2);
      }
      // 교차로가 아닌 곳에서 차로 수가 바뀌면, 구간 끝 40m(빠르면 3.5초 거리) 안에서 다음 구간의 한 차로로 모일 차들을 한 줄로 보고 바로 앞 차를 따라간다(앞선 차가 먼저).
      // 옆 차로 차에게 자리를 내주는 것이라 편안한 감속까지만 늦춘다(아래 merging)
      let merging = -1;
      if (cars.route[i] < 0 && nextE[i] >= 0 && jn.groupOfEnd[e.id] < 0 && e.len - s[i] < Math.max(40, v[i] * 3.5) && edges[nextE[i]].lanes !== e.lanes) {
        const ne = edges[nextE[i]];
        const tl = outLane(i, ne);
        let best = -1;
        for (const j of lists[e.id]) {
          if (j === i || lane[j] === lane[i] || nextE[j] !== ne.id || outLane(j, ne) !== tl) continue;
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
      // 다른 구간의 차가 내 앞을 막고 있으면 그 차도 앞차로 본다: 비스듬히 합쳐지는 길은 합치기 전부터 차로가 겹치고,
      // 자료에서 같은 방향 두 길의 차로가 포개진 곳도 있다. 옆으로 떨어진 거리가 두 몸통의 반폭 합(비스듬하면 그 차 몸통이 옆으로 내민 만큼 더)보다 가까우면 막은 것이다.
      // 둘이 서로 상대를 앞에 두면 큰길 차가 먼저 간다. 교차로 상자 안끼리는 교차로 잡기가 맡는다
      if (!boxed[i]) {
        const hx = Math.cos(cars.yaw[i]);
        const hz = Math.sin(cars.yaw[i]);
        const reach = size[i] / 2 + 6 + v[i] * 1.5;
        const wi = wid[i];
        const cx = cars.x[i] + (hx * reach) / 2;
        const cz = cars.z[i] + (hz * reach) / 2;
        const rad = reach / 2 + 7;
        const x0 = cellAt(cx - rad);
        const x1 = cellAt(cx + rad);
        const z0 = cellAt(cz - rad);
        const z1 = cellAt(cz + rad);
        for (let gx = x0; gx <= x1; gx++)
          for (let gz = z0; gz <= z1; gz++)
            for (let j = cellHead[gx * GW + gz]; j >= 0; j = cellNext[j]) {
              if (j === i || j === front || edge[j] === edge[i] || Math.abs(cars.y[j] - cars.y[i]) > 2.5) continue;
              const dx = cars.x[j] - cars.x[i];
              const dz = cars.z[j] - cars.z[i];
              const along = dx * hx + dz * hz;
              if (along <= 0 || along > reach + size[j] / 2) continue;
              const jx = Math.cos(cars.yaw[j]);
              const jz = Math.sin(cars.yaw[j]);
              const cosd = hx * jx + hz * jz;
              if (cosd < 0.64) continue; // 가로지르거나 마주 오는 차
              const sind = Math.abs(hx * jz - hz * jx);
              if (Math.abs(dz * hx - dx * hz) > wi + wid[j] + sind * (size[j] / 2) + 0.2) continue;
              // 나도 그 차의 앞에 있으면 우선순위가 낮은 쪽이 기다린다
              if (-(dx * jx + dz * jz) > 0 && Math.abs(dx * jz - dz * jx) < wi + wid[j] + sind * (size[i] / 2) + 0.2 && outranks(i, j)) continue;
              const g2 = along - (size[i] + size[j]) / 2;
              if (g2 < gap) {
                gap = g2;
                dv = v[i] - v[j] * cosd;
                front = j;
                why = 4;
              }
            }
      }
      // 횡단보도 비워 두기: 앞차(6m/s 보다 느린)가 지금 자리에 선다고 볼 때 그 뒤에 서면 내 몸이 횡단보도 면 위에 걸치고, 횡단보도 너머에 내가 다 들어갈 자리가 없으면
      // 횡단보도 바깥 변 1m 앞에 선다. 이 구간과, 이 구간 끝이 교차로가 아니면 다음 구간의 그 차로를 본다(교차로 상자 안은 정지선 너머 8m 까지만 보고, 그 너머는 교차로 잡기가 맡는다)
      if (front >= 0 && front !== i && v[front] < 6 && stops) {
        const head = s[i] + size[i] / 2;
        const stopFront = head + gap - 2;
        // 두 구간에 걸친 횡단보도는 한 구간으로 잇는다
        XS.length = 0;
        for (let k = 0, id = e.id, off = 0, ln = lane[i]; k < 2 && id >= 0; k++) {
          const ee = edges[id];
          const sp = stops.xwAll(id);
          // 교차로 앞 구간은 상자 앞과, 정지선 너머 8m 안(정지선과 교차로 사이 횡단보도)까지
          const hb = jn.groupOfEnd[id] >= 0 ? stopBack(ee, ln) : -1;
          const until = jn.groupOfEnd[id] >= 0 ? Math.max(ee.len - jn.rIn[id], hb >= 0 ? ee.len - hb + 8 : 0) : Infinity;
          for (let q = 0; q < sp.length && sp[q] < until; q += 2) {
            if (XS.length && off + sp[q] <= XS[XS.length - 1] + 0.6) XS[XS.length - 1] = off + sp[q + 1];
            else XS.push(off + sp[q], off + sp[q + 1]);
          }
          if (k === 0 && (nextE[i] < 0 || jn.groupOfEnd[id] >= 0)) break;
          off += ee.len;
          id = nextE[i];
          ln = outLane(i, edges[id]);
        }
        for (let q = 0; q < XS.length; q += 2) {
          const c0 = XS[q];
          const c1 = XS[q + 1];
          if (c0 < head + 0.5 || stopFront <= c0 - 1 || stopFront - c1 >= size[i] + 0.5) continue;
          const g2 = c0 - 1 - head + 2;
          if (g2 < gap) {
            gap = g2;
            dv = v[i];
            front = i;
            why = 11;
          }
        }
      }
      // 신호: 빨간불(멈출 수 있으면 노란불도)이면 정지선을 멈춰 선 앞차처럼 다룬다
      const ap = signals?.approach.get(e.id);
      let red = false;
      // 묶인 교차로 안 구간(양 끝이 잡은 교차로)의 신호는 이미 교차로를 잡고 들어온 차를 세우지 않는다. 교차로를 빠져나온 구간 끝의 신호(길 중간 횡단보도 등)는 지킨다
      if (ap && !(claim[i] >= 0 && jn.groupOfStart[e.id] === claim[i] && jn.groupOfEnd[e.id] === claim[i])) {
        const st = signals!.state(ap.c, ap.group, now.tod);
        const toLine = e.len - stopBack(e, lane[i], ap) - s[i] - size[i] / 2;
        if (st !== GREEN && toLine > -0.5 && !(st === YELLOW && toLine < (v[i] * v[i]) / 6)) {
          red = true;
          if (claim[i] === jn.groupOfEnd[e.id] && planK[i] === 0) claim[i] = -1; // 신호에 서는 동안 교차로를 잡아 두지 않는다
          if (toLine + 2 < gap) {
            gap = toLine + 2;
            dv = v[i];
            front = i;
            why = 5;
          }
        }
      }
      // 이 구간 끝이 교차로가 아니고 다음 구간 끝에 신호가 있으면(정지선 바로 앞 조각이 짧은 길 중간 횡단보도 등) 그 신호도 미리 보고 늦춘다.
      // 지금 구간만 보면 짧은 조각에 올라선 뒤에야 빨간불을 보고 서지 못해 지나간다
      const ap2 = !ap && nextE[i] >= 0 && jn.groupOfEnd[e.id] < 0 ? signals?.approach.get(nextE[i]) : undefined;
      if (ap2) {
        const st = signals!.state(ap2.c, ap2.group, now.tod);
        const ne = edges[nextE[i]];
        const toLine = e.len - s[i] + ne.len - stopBack(ne, outLane(i, ne), ap2) - size[i] / 2;
        if (st !== GREEN && toLine > -0.5 && !(st === YELLOW && toLine < (v[i] * v[i]) / 6) && toLine + 2 < gap) {
          gap = toLine + 2;
          dv = v[i];
          front = i;
          why = 6;
        }
      }
      // 횡단보도: 내 차로가 지나는 횡단보도 면(이 구간과 다음 구간, 교차로 상자 안 포함)에 사람이 건너고 있으면 그 면 1m 앞에 선다
      if (xw && stops) {
        let d0 = -s[i];
        for (let id = e.id, k = 0; id >= 0 && k < 2; k++) {
          const ln = k === 0 ? lane[i] : outLane(i, edges[id]);
          const q = stops.xwOf(id, ln === MED ? 0 : ln);
          for (let m = 0; m < q.length; m += 4) {
            // 그 횡단보도 위 어디든 사람이 건너고 있으면 선다(넓은 횡단보도 건너편 사람도 다 건널 때까지)
            if (!xw.busy[q[m + 2]]) continue;
            const toLine = d0 + q[m] - 1 - size[i] / 2;
            if (toLine > -0.5 && toLine + 2 < gap) {
              gap = toLine + 2;
              dv = v[i];
              front = i;
              why = 7;
              if (k === 0) red = true; // 이 구간 끝 교차로는 잡지 않는다
            }
          }
          d0 += edges[id].len;
          id = k === 0 ? nextE[i] : -1;
        }
      }
      // 교차로: 정한 경로로 들어가도 되면 교차로를 잡고, 아니면 상자 앞을 멈춰 선 앞차처럼 다룬다
      const G = jn.groupOfEnd[e.id];
      if (G >= 0 && pathOf[i] >= 0 && planK[i] === 0 && !(claim[i] === G && claimPath[i] === pathOf[i]) && !red) {
        const toBox = e.len - s[i] - size[i] / 2 - jn.rIn[e.id];
        // 신호가 있는 진입로에서는 정지선(이 앞에 횡단보도가 있다) 가까이에서도 들어갈 수 있는지 보고, 못 들어가면 정지선에서 기다린다.
        // 정지선에 선 차가 앞 교차로 상자에 걸리는 짧은 구간이면 지금처럼 상자 앞에서 본다
        const hb = stopBack(e, lane[i], ap);
        const toLine = hb >= 0 && e.len - hb - size[i] > jn.rOut[e.id] ? e.len - hb - s[i] - size[i] / 2 : -1;
        const near = Math.max(4, v[i] * 2.5 + 2);
        if (toBox < near || (toLine > -0.5 && toLine < near)) {
          const ok = mayEnter(i, G, pathOf[i], e, now.tod);
          // 들어갈 수 있으면 교차로는 상자 가까이에서 잡는다
          if (ok && toBox < near) {
            if (claim[i] >= 0 && claim[i] !== G) {
              // 앞 교차로를 아직 다 빠져나가지 못했으면 그 교차로는 둘째 칸에 옮겨 잡아 둔다
              prevClaim[i] = claim[i];
              prevPath[i] = claimPath[i];
              prevExit[i] = claimExit[i];
            }
            claim[i] = G;
            claimPath[i] = pathOf[i];
            claimExit[i] = plan[i * PLAN + planN[i] - 1];
            claimXL[i] = exitLane(i);
            claimT[i] = 0;
            waitT[i] = 0;
            held[G].push(i);
          } else if (!ok && toBox > -0.5) {
            if (v[i] < 0.5) waitT[i] += dt;
            // 20초 넘게 못 들어가면 막힌 쪽을 피해 빠져나갈 길을 다시 고른다(4초에 한 번꼴)
            if (waitT[i] > 20 && cars.route[i] < 0 && rand() < dt / 4) {
              planN[i] = 0;
              onEdge(i, e);
            }
            const stopAt = toLine > -0.5 ? Math.min(toBox + 1.7, toLine + 2) : toBox + 1.7;
            if (stopAt < gap) {
              gap = stopAt;
              dv = v[i];
              front = i;
              why = 8;
            }
          }
        }
      }
      // 돌발 서행 지점: 들어서는 자리(25m 앞)를 서행 속도로 가는 앞차처럼 다뤄 미리 늦춘다
      if (slowAt[e.id] >= 0 && s[i] < slowAt[e.id] - 25 && slowAt[e.id] - 25 - s[i] + 2 < gap) {
        gap = slowAt[e.id] - 25 - s[i] + 2;
        dv = v[i] - slowV[e.id];
        front = i;
        why = 9;
      }
      if (r >= 0 && stopK[i] < routes[r].stops.length) {
        // 다음 정류장을 멈춰 선 앞차처럼 다룬다. 앞에 2m를 두고 서므로 2m를 더해 정류장 바로 위에 서게 한다
        const toStop = routes[r].stops[stopK[i]] - (routes[r].start[rpos[i]] + s[i]);
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
      // 돌발로 서행하는 자리(앞뒤 25m)에서는 서행 속도를 넘지 않는다
      const v0 = slowAt[e.id] >= 0 && Math.abs(s[i] - slowAt[e.id]) < 25 ? Math.min(slowV[e.id], Math.max(0.5, speed[e.id] * vf[i])) : Math.max(0.5, speed[e.id] * vf[i]);
      const want = 2 + v[i] * 1.3 + Math.max(0, (v[i] * dv) / (2 * Math.sqrt(A_MAX * B_COMF)));
      // 제 속도보다 빠르면(느린 길로 들어섰을 때) 편안한 정도로만 늦춘다
      let a = Math.max(-0.8 * B_COMF, A_MAX * (1 - (v[i] / v0) ** 4));
      if (front >= 0) {
        // ACC 식(Treiber·Kesting): IDM 은 가까이 나타난 정지 대상에 지나치게 세게 밟는다. 앞 대상이 지금 속도를 유지한다고 보고
        // 그 뒤에 멈추는 데 드는 감속(CAH)이 IDM 보다 약하면 그쪽으로 누그러뜨린다
        const idm = a - A_MAX * (want / Math.max(0.3, gap)) ** 2;
        const vl = Math.max(0, v[i] - dv);
        const cah = v[i] <= vl ? 0 : -((v[i] - vl) ** 2) / (2 * Math.max(0.1, gap - 2));
        a = idm >= cah ? idm : 0.01 * idm + 0.99 * (cah + B_COMF * Math.tanh((idm - cah) / B_COMF));
      }
      // 그릴 때 늘일 수 있는 길이: 따라가는 앞 차까지 가운데 거리(앞차의 한도도 함께 줄인다), 정지선·정류장이면 그곳까지 가운데 거리의 두 배
      if (front >= 0 && front !== i) {
        const dc = Math.max(0, gap) + (size[front] + size[i]) / 2;
        cars.room[i] = Math.min(cars.room[i], dc);
        cars.room[front] = Math.min(cars.room[front], dc);
      } else if (front === i) cars.room[i] = Math.min(cars.room[i], 2 * Math.max(0, gap - 2 + size[i] / 2));
      if (front >= 0 && front === merging) a = Math.max(a, -1.2 * B_COMF);
      ahead[i] = front;
      aheadWhy[i] = front >= 0 ? why : 0;
      a = Math.max(-8, Math.min(A_MAX, a));
      const slow = v[i] < 0.3 * VFREE[e.cls] * vf[i];
      cars.brake[i] += ((a < -0.5 || slow ? 1 : 0) - cars.brake[i]) * Math.min(1, dt * 6);
      v[i] = Math.max(0, v[i] + a * dt);
      s[i] += v[i] * dt;
      stopT[i] = v[i] < 0.3 ? stopT[i] + dt : 0;
    }
    for (let i = cars.n - 1; i >= 0; i--) {
      let e = edges[edge[i]];
      let gone = false;
      while (s[i] >= e.len) {
        if (nextE[i] < 0) {
          gone = true;
          break;
        }
        s[i] -= e.len;
        prevE[i] = e.id;
        prevLane[i] = lane[i];
        const o = edges[nextE[i]];
        const x = nextPosOf(i, o);
        lane[i] = laneAt(i, o, x);
        // 새 구간의 차로 안 자리로 옮긴다(소수 오차로 이웃 차로로 넘어가지 않게 차로 안쪽에 둔다)
        const lx = Math.min(o.lanes - 1, Math.max(0, Math.floor(x)));
        pref[i] = (lx + Math.max(0.001, Math.min(0.999, x - lx))) / o.lanes;
        e = o;
        edge[i] = e.id;
        if (cars.route[i] >= 0) rpos[i]++;
        onEdge(i, e);
      }
      if (gone) remove(i);
      else locate(i);
    }
    if (spawn)
      routes.forEach((R, r) => {
        wait[r] -= dt;
        if (wait[r] > 0) return;
        const h = busHeadway(R, now.tod);
        const e = edges[R.edges[0]];
        const t = tail[e.id * 8 + (e.med && R.usesMed ? MED : e.lanes - 1)];
        if (!h) wait[r] = 60;
        else if ((t < 0 || s[t] > 16) && addBus(r)) wait[r] = h * (0.85 + rand() * 0.3);
      });
    if (spawn && focus) {
      let cin = 0;
      let cout = 0;
      for (let i = 0; i < cars.n; i++) if (cars.route[i] < 0) nearFocus(cars.x[i], cars.z[i]) ? cin++ : cout++;
      for (let k = 0; k < 8 && cin < nIn && cars.n < max; k++) if (spawnHidden(true)) cin++;
      for (let k = 0; k < 8 && cout < nOut && cars.n < max && cin + cout < max - reserve; k++) if (spawnHidden(false)) cout++;
      for (let k = 0; k < 8 && cin > nIn * 1.05 + 2; k++) if (dropHidden(true)) cin--;
      for (let k = 0; k < 8 && cout > nOut * 1.05 + 2; k++) if (dropHidden(false)) cout--;
      // 화면 밖에서 90초 넘게 갇힌 차는 빼서 막힘이 판 전체로 번지지 않게 한다(모자란 자리는 위에서 다시 채운다)
      for (let k = 0; k < 4; k++) dropHidden();
    }
    if (spawn && entries.length) {
      const want = Math.round(nIn + nOut);
      for (let k = 0; k < 6 && cars.n - nBus < want && cars.n < max; k++) {
        const e = entries[pick(entryW, rand())];
        if (closed[e.id]) continue;
        const ln = free(e, Math.floor(rand() * e.lanes));
        const t = tail[e.id * 8 + ln];
        if (t >= 0 && s[t] < 16) continue;
        put(cars.n, e, 0.5, ln);
        tail[e.id * 8 + ln] = cars.n;
        locate(cars.n++);
      }
    }
  }

  /** 횡단보도 xi 로 차가 다가오는가: 그 횡단보도가 지나는 구간에서 횡단보도 앞 (10m + 4초 거리) 안이거나 횡단보도 위에 있는 차 */
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
    put(edgeId: number, at: number, lane: number) {
      if (cars.n >= max) return;
      put(cars.n, edges[edgeId], at, lane);
      cars.kind[cars.n] = 0;
      size[cars.n] = BODY_LEN[bodyType(cars.tint[cars.n])];
      wid[cars.n] = BODY_HW[bodyType(cars.tint[cars.n])];
      locate(cars.n++);
    },
    target,
    setFocus,
    /** 돌발정보를 바꾼다: 막을 차로, 통제할 구간, 서행 지점 */
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
      // 갈 곳이 모두 통제된 구간도 통제한다(갈림길까지 거슬러 올라가, 그 갈림길에서 다른 길을 고르게)
      for (let changed = inc.close.length > 0; changed; ) {
        changed = false;
        for (const e of edges) if (!closed[e.id] && e.next.length && e.next.every((k) => closed[k])) (closed[e.id] = 1), (changed = true);
      }
      for (const w of inc.slow) (slowAt[w.edge] = w.at), (slowV[w.edge] = w.v);
    },
    /** i번 차가 달리는 차로 */
    laneOf: (i: number) => lane[i],
    /** 화면 1대가 실제 몇 대인가: 초점 안, 밖 */
    scale: () => [ratioIn, ratioOut],
    routes,
    dwells,
    /** i번 버스의 앞문(차체 앞쪽 오른편 바로 밖) */
    door: (i: number): [number, number] => {
      const y = cars.yaw[i];
      const f = size[i] / 2 - 1.3;
      return [cars.x[i] + Math.cos(y) * f - Math.sin(y) * 1.7, cars.z[i] + Math.sin(y) * f + Math.cos(y) * 1.7];
    },
    /** i번 차의 속도(m/s) */
    speedOf: (i: number) => v[i],
    /** i번 버스가 다음에 설 정류장 이름 */
    nextStop: (i: number) => (cars.route[i] >= 0 ? routes[cars.route[i]].stopNames[stopK[i]] ?? '' : ''),
    /** 측정용 읽기 전용 값: 구간·구간 위 거리·속도·차로·다음 구간·상자 안·시뮬레이션 길이, 따라간 앞 대상과 까닭
     *  (1 같은 차로 앞차, 2 다음 구간 앞차, 3 차로 합침, 4 다른 구간 차, 5 신호, 6 다음 구간 신호, 7 횡단보도 사람, 8 교차로 진입 대기, 9 돌발 서행, 10 정류장, 11 횡단보도 비워 두기) */
    debug: () => ({ edge, s, v, lane, nextE, boxed, size, ahead, aheadWhy, junctions: jn }),
    meanSpeed: () => (cars.n ? v.subarray(0, cars.n).reduce((a, b) => a + b, 0) / cars.n : 0),
  };
}
