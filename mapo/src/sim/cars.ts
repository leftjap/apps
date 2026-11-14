// 차. 방향 그래프의 구간 위를 달리며 앞차와의 간격으로 속도를 정한다(IDM을 줄인 식).
// 구간 끝에서는 직진에 가까운 다음 구간을 고르고, 판 밖으로 나가면 사라진다. 판 가장자리로 나갈 수 없는 막다른 길은 고르지 않는다.
// 교차로에서는 부딪는 방향으로 상자에 들어간 차가 있으면 상자 앞에서 기다린다. 작은 길 차는 큰길 차에 양보한다.
// 버스는 노선의 구간 열을 따라 맨 오른쪽 차로로 달리고, 정류장마다 잠시 선다.
import { headingAt, pointAt } from '../poly.ts';
import { busHeadway, type BusRoute } from './buses.ts';
import { GREEN, YELLOW, type Signals } from './signals.ts';
import type { Now } from './clock.ts';
import { commute, daytime, nightlife } from './curves.ts';
import { BOARD_R } from '../geo.ts';
import { LANE, type Edge } from './graph.ts';
import { makeJunctions } from './junctions.ts';
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
}

const VFREE = [22, 14, 12.5, 10, 7, 5.5]; // 등급별 자유 속도(m/s)
const BUS_LEN = [11.5, 11.5, 12, 7.5]; // 종류별 버스 길이(m)
const A_MAX = 1.6;
const B_COMF = 2.5;

export function makeCars(edges: Edge[], provider: DataProvider, seed = 1, max = 1400, routes: BusRoute[] = [], signals?: Signals) {
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
  const vf = new Float32Array(max);
  const size = new Float32Array(max);
  const acc = new Float32Array(max);
  const rpos = new Int16Array(max); // 노선의 몇 번째 구간인가
  const stopK = new Int16Array(max); // 다음에 설 정류장 번호
  const dwell = new Float32Array(max); // 정류장에 남은 정차 시간(초)
  const wait = new Float32Array(routes.length); // 노선별 다음 출발까지(초)
  const jn = signals?.junctions ?? makeJunctions(edges);
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
  const claimLane = new Uint8Array(max); // 잡을 때의 차로
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
  const entryW = entries.map((e) => e.lanes * Math.max(0, 4 - e.cls));
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
  function avoid(k: number): number {
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
    if (n > 1) pathOf[i] = jn.pathId(plan.subarray(b, b + n), n);
  }

  function put(i: number, e: Edge, at: number, ln: number, route = -1) {
    edge[i] = e.id;
    s[i] = at;
    lane[i] = ln;
    vf[i] = 0.86 + rand() * 0.26;
    v[i] = speed[e.id] * vf[i] * 0.8;
    cars.route[i] = route;
    cars.uid[i] = nextUid++;
    cars.kind[i] = route >= 0 ? 1 : rand() < 0.09 ? 2 : 0;
    size[i] = route >= 0 ? BUS_LEN[routes[route].kind] ?? 11.5 : 4.6;
    cars.tint[i] = route >= 0 ? routes[route].kind : rand();
    cars.brake[i] = 0;
    cars.fade[i] = 0;
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
    put(i, e, Math.min(e.len - 0.1, at - R.start[k]), e.lanes - 1, r);
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
    edge[i] = edge[j];
    nextE[i] = nextE[j];
    s[i] = s[j];
    v[i] = v[j];
    lane[i] = lane[j];
    vf[i] = vf[j];
    size[i] = size[j];
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
    claimLane[i] = claimLane[j];
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
  const outLane = (i: number, o: Edge) => (cars.route[i] >= 0 ? o.lanes - 1 : Math.min(lane[i], o.lanes - 1));
  function locate(i: number) {
    const e = edges[edge[i]];
    // 교차로 상자 안에서는 들어온 차로와 나갈 차로를 잇는 곡선을 따라간다
    let inBox = false;
    boxed[i] = 0;
    if (nextE[i] >= 0 && s[i] > e.len - jn.rIn[e.id]) {
      const o = edges[nextE[i]];
      jn.curve(e, o, lane[i], outLane(i, o), s[i] - (e.len - jn.rIn[e.id]), cv);
      inBox = true;
      boxed[i] = jn.groupOfEnd[e.id] >= 0 ? 1 : 0;
    } else if (prevE[i] >= 0 && s[i] < jn.rOut[e.id]) {
      const a = edges[prevE[i]];
      jn.curve(a, e, prevLane[i], lane[i], jn.rIn[a.id] + s[i], cv);
      inBox = true;
      boxed[i] = jn.groupOfStart[e.id] >= 0 ? 1 : 0;
    }
    if (inBox) {
      cars.x[i] = cv[0];
      cars.y[i] = cv[1];
      cars.z[i] = cv[2];
      cars.yaw[i] = cv[3];
      return;
    }
    const seg = pointAt(e.p, e.cum, s[i], tmp);
    const yaw = headingAt(e.p, seg);
    const off = e.off0 + lane[i] * LANE;
    cars.x[i] = tmp[0] - Math.sin(yaw) * off;
    cars.y[i] = tmp[1];
    cars.z[i] = tmp[2] + Math.cos(yaw) * off;
    cars.yaw[i] = yaw;
  }

  /** 시간대 교통량(차로 1km 에 몇 대) */
  function density(now: Now): number {
    const weekend = now.dow === 0 || now.dow === 6;
    return 2.5 + 9 * commute(now.tod) * (weekend ? 0.5 : 1) + 4 * daytime(now.tod) + 2.5 * nightlife(now.tod);
  }
  // ── 차량 수 ──
  // 구간마다 지금 있어야 할 실제 차 수는 흐름 속도로 정한다. 원활(속도 비율 0.65 이상)하면 시간대 교통량만큼이고,
  // 느려질수록 늘어 속도 비율 0.15(꽉 막힘)에서 차로 1km 에 100대가 된다(서행 0.35 에서 약 60대).
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
    let F = 0;
    let O = 0;
    for (const e of edges) {
      const r = provider.roadSpeed(now, e.cls, e.key, midX[e.id], midZ[e.id], midH[e.id]);
      const k = Math.min(base + (JAM - base) * Math.max(0, Math.min(1, (0.65 - r) / 0.5)), 1000 / (6.6 + 1.3 * r * VFREE[e.cls]));
      real[e.id] = (k * e.len * e.lanes) / 1000;
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
      const w = !placeable[e.id] || jammed ? 0 : Math.max(0, real[e.id] * (inF[e.id] / ratioIn + (1 - inF[e.id]) / ratioOut) - l.length);
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
    const ln = Math.floor(rand() * e.lanes);
    const seg = pointAt(e.p, e.cum, at, tmp);
    const yaw = headingAt(e.p, seg);
    const off = e.off0 + ln * LANE;
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
      if (!placeable[e.id]) continue;
      const perM = has ? real[e.id] / e.len : e.lanes;
      for (let d = 0; d < e.len; d += 20) {
        const L = Math.min(20, e.len - d);
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
      const ln = Math.min(e.lanes - 1, Math.floor(u / piece[p + 2]));
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
    if (a.lanes !== b.lanes) return a.lanes > b.lanes;
    return cars.uid[i] < cars.uid[j];
  }

  /** 정해 둔 경로로 교차로를 빠져나갈 때의 차로 */
  function exitLane(i: number): number {
    const b = i * PLAN;
    let ln = lane[i];
    for (let k = 1; k < planN[i]; k++) {
      const o = edges[plan[b + k]];
      ln = cars.route[i] >= 0 ? o.lanes - 1 : Math.min(ln, o.lanes - 1);
    }
    return ln;
  }
  /** 교차로를 빠져나간 구간 x 의 ln 차로에서 상자 끝부터 맨 뒤 차 꽁무니까지 빈 길이.
   *  x 끝 신호가 초록불이 아니면 정지선까지만 설 수 있다 */
  function roomOn(x: Edge, ln: number, tod: number): number {
    const ap = signals?.approach.get(x.id);
    const cap = ap && signals!.state(ap.c, ap.group, tod) !== GREEN ? x.len - ap.setback - jn.rOut[x.id] : Infinity;
    let d = -jn.rOut[x.id];
    for (let e = x, k = 0; k < 4 && d < 40; k++) {
      ln = Math.min(ln, e.lanes - 1);
      const t = tail[e.id * 8 + ln];
      if (t >= 0) return Math.min(cap, d + s[t] - size[t] / 2);
      d += e.len;
      if (e.next.length !== 1) break;
      e = edges[e.next[0]];
    }
    return cap;
  }

  function mayEnter(i: number, g: number, p: number, e: Edge, tod: number): boolean {
    const b = i * PLAN;
    const n = planN[i];
    // 경로 위 가장 적은 차로 수: 다른 차로에서 같은 경로로 들어온 두 차가 이 차로 수 안으로 모이는가
    let fewest = 8;
    for (let k = 0; k < n; k++) fewest = Math.min(fewest, edges[plan[b + k]].lanes);
    for (const h of held[g]) {
      if (h === i) continue;
      const hp = claim[h] === g ? claimPath[h] : prevPath[h];
      if (jn.conflict(p, hp)) return false;
      if (hp === p && claimLane[h] !== lane[i] && Math.min(claimLane[h], fewest - 1) === Math.min(lane[i], fewest - 1)) return false;
    }
    // 묶인 교차로 안의 신호가 지금 초록불이 아니면 들어가지 않는다(들어간 뒤에는 그 신호에 서지 않고 빠져나간다)
    if (signals)
      for (let k = 1; k < n - 1; k++) {
        const ap = signals.approach.get(plan[b + k]);
        if (ap && signals.state(ap.c, ap.group, tod) !== GREEN) return false;
      }
    // 빠져나갈 차로에 이 차와, 먼저 같은 차로로 나가려고 들어간 차들이 설 자리가 없으면 교차로 안에 서 버리므로 들어가지 않는다(꼬리 물기 금지)
    const x = edges[plan[b + n - 1]];
    const xl = exitLane(i);
    let need = size[i] + 2.5;
    for (const h of held[g]) if (h !== i && claim[h] === g && claimExit[h] === x.id && claimXL[h] === xl && edge[h] !== x.id) need += size[h] + 2.5;
    if (roomOn(x, xl, tod) < need) return false;
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
    // 구간·차로별로 줄 세우고 맨 뒤 차를 적어 둔다
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
        lead[lane[i]] = i;
      }
      for (let k = 0; k < e.lanes; k++) tail[e.id * 8 + k] = lead[k];
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
        if (keep && claimT[i] < 30) {
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
      if (front >= 0) gap = s[front] - s[i];
      else if (nextE[i] >= 0) {
        // 같은 차로에서 다른 쪽으로 막 갈라져 나간 앞차: 꽁무니가 상자를 벗어날 때까지 따라간다
        const lt = leaveTail[e.id * 8 + lane[i]];
        if (lt >= 0 && edge[lt] !== nextE[i]) {
          front = lt;
          gap = e.len - s[i] + s[lt];
        }
        // 다음 구간들에서 같은 차로의 맨 뒤 차를 찾는다. 짧은 구간 너머에 선 차도 제동 거리 안에서 미리 본다
        const horizon = 20 + v[i] * 2 + (v[i] * v[i]) / (2 * B_COMF);
        let d = e.len - s[i];
        let ln = lane[i];
        let id = nextE[i];
        for (let k = 1; id >= 0 && d < horizon; k++) {
          const ne = edges[id];
          ln = cars.route[i] >= 0 ? ne.lanes - 1 : Math.min(ln, ne.lanes - 1);
          const t = tail[ne.id * 8 + ln];
          if (t >= 0) {
            if (d + s[t] < gap) {
              front = t;
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
        // 교차로 상자 안 곡선은 길을 따라 잰 거리보다 짧을 수 있으므로, 둘 중 하나가 상자 안이면 그려진 자리 사이 거리로도 잰다
        if (boxed[i] || boxed[front]) gap = Math.min(gap, Math.hypot(cars.x[front] - cars.x[i], cars.z[front] - cars.z[i]) - (size[front] + size[i]) / 2);
      }
      // 교차로가 아닌 곳에서 차로가 줄어들면, 구간 끝 40m 안에서 한 차로로 합쳐질 차들을 한 줄로 보고 바로 앞 차를 따라간다(앞선 차가 먼저)
      if (cars.route[i] < 0 && nextE[i] >= 0 && jn.groupOfEnd[e.id] < 0 && e.len - s[i] < 40 && edges[nextE[i]].lanes < e.lanes) {
        const nl = edges[nextE[i]].lanes;
        const tl = Math.min(lane[i], nl - 1);
        let best = -1;
        for (const j of lists[e.id]) {
          if (j === i || lane[j] === lane[i] || Math.min(lane[j], nl - 1) !== tl) continue;
          if (s[j] < s[i] || (s[j] === s[i] && cars.uid[j] > cars.uid[i])) continue;
          if (best < 0 || s[j] < s[best]) best = j;
        }
        if (best >= 0) {
          const g2 = s[best] - s[i] - (size[best] + size[i]) / 2;
          if (g2 < gap) {
            gap = g2;
            dv = v[i] - v[best];
            front = best;
          }
        }
      }
      // 비스듬히 합쳐지는 길에서는 합치기 전부터 차로가 겹친다. 같은 구간으로 합류할 다른 구간의 차가 내 차로 앞을 막고 있으면 그 차도 앞차로 본다.
      // 둘이 서로 상대를 앞에 두면 큰길 차가 먼저 간다. 교차로 상자 안끼리는 교차로 잡기가 맡는다
      if (!boxed[i]) {
        const hx = Math.cos(cars.yaw[i]);
        const hz = Math.sin(cars.yaw[i]);
        const reach = size[i] / 2 + 6 + v[i] * 1.5;
        const wi = cars.kind[i] === 1 ? 1.25 : 0.9;
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
              if (nextE[i] < 0 || (nextE[j] !== nextE[i] && edge[j] !== nextE[i])) continue; // 합류하지 않는 나란한 길의 차는 보지 않는다
              const dx = cars.x[j] - cars.x[i];
              const dz = cars.z[j] - cars.z[i];
              const along = dx * hx + dz * hz;
              if (along <= 0 || along > reach + size[j] / 2) continue;
              const wj = cars.kind[j] === 1 ? 1.25 : 0.9;
              if (Math.abs(dz * hx - dx * hz) > wi + wj + 0.3) continue;
              const jx = Math.cos(cars.yaw[j]);
              const jz = Math.sin(cars.yaw[j]);
              const cosd = hx * jx + hz * jz;
              if (cosd < 0.64) continue; // 가로지르거나 마주 오는 차
              // 나도 그 차의 앞에 있으면 우선순위가 낮은 쪽이 기다린다
              if (-(dx * jx + dz * jz) > 0 && Math.abs(dx * jz - dz * jx) < wi + wj + 0.3 && outranks(i, j)) continue;
              const g2 = along - (size[i] + size[j]) / 2;
              if (g2 < gap) {
                gap = g2;
                dv = v[i] - v[j] * cosd;
                front = j;
              }
            }
      }
      // 신호: 빨간불(멈출 수 있으면 노란불도)이면 정지선을 멈춰 선 앞차처럼 다룬다
      const ap = signals?.approach.get(e.id);
      let red = false;
      // 묶인 교차로 안의 신호는 이미 교차로를 잡고 들어온 차를 세우지 않는다
      if (ap && !(claim[i] >= 0 && jn.groupOfStart[e.id] === claim[i])) {
        const st = signals!.state(ap.c, ap.group, now.tod);
        const toLine = e.len - ap.setback - s[i] - size[i] / 2;
        if (st !== GREEN && toLine > -0.5 && !(st === YELLOW && toLine < (v[i] * v[i]) / 6)) {
          red = true;
          if (claim[i] === jn.groupOfEnd[e.id] && planK[i] === 0) claim[i] = -1; // 신호에 서는 동안 교차로를 잡아 두지 않는다
          if (toLine + 2 < gap) {
            gap = toLine + 2;
            dv = v[i];
            front = i;
          }
        }
      }
      // 교차로: 정한 경로로 들어가도 되면 교차로를 잡고, 아니면 상자 앞을 멈춰 선 앞차처럼 다룬다
      const G = jn.groupOfEnd[e.id];
      if (G >= 0 && pathOf[i] >= 0 && planK[i] === 0 && !(claim[i] === G && claimPath[i] === pathOf[i]) && !red) {
        const toBox = e.len - s[i] - size[i] / 2 - jn.rIn[e.id];
        if (toBox < Math.max(4, v[i] * 2.5 + 2)) {
          if (mayEnter(i, G, pathOf[i], e, now.tod)) {
            if (claim[i] >= 0 && claim[i] !== G) {
              // 앞 교차로를 아직 다 빠져나가지 못했으면 그 교차로는 둘째 칸에 옮겨 잡아 둔다
              prevClaim[i] = claim[i];
              prevPath[i] = claimPath[i];
              prevExit[i] = claimExit[i];
            }
            claim[i] = G;
            claimPath[i] = pathOf[i];
            claimExit[i] = plan[i * PLAN + planN[i] - 1];
            claimLane[i] = lane[i];
            claimXL[i] = exitLane(i);
            claimT[i] = 0;
            waitT[i] = 0;
            held[G].push(i);
          } else if (toBox > -0.5) {
            if (v[i] < 0.5) waitT[i] += dt;
            // 20초 넘게 못 들어가면 막힌 쪽을 피해 빠져나갈 길을 다시 고른다(4초에 한 번꼴)
            if (waitT[i] > 20 && cars.route[i] < 0 && rand() < dt / 4) {
              planN[i] = 0;
              onEdge(i, e);
            }
            if (toBox + 1.7 < gap) {
              gap = toBox + 1.7;
              dv = v[i];
              front = i;
            }
          }
        }
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
        }
      }
      const v0 = Math.max(0.5, speed[e.id] * vf[i]);
      const want = 2 + v[i] * 1.3 + Math.max(0, (v[i] * dv) / (2 * Math.sqrt(A_MAX * B_COMF)));
      let a = A_MAX * (1 - (v[i] / v0) ** 4);
      if (front >= 0) a -= A_MAX * (want / Math.max(0.3, gap)) ** 2;
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
        e = edges[nextE[i]];
        edge[i] = e.id;
        lane[i] = outLane(i, e);
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
        const t = tail[e.id * 8 + e.lanes - 1];
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
        const ln = Math.floor(rand() * e.lanes);
        const t = tail[e.id * 8 + ln];
        if (t >= 0 && s[t] < 16) continue;
        put(cars.n, e, 0.5, ln);
        tail[e.id * 8 + ln] = cars.n;
        locate(cars.n++);
      }
    }
  }

  return {
    cars,
    step,
    fill,
    fillBuses,
    addBus,
    /** 구간 edgeId 의 at(m) 지점, lane 차로에 승용차 한 대를 놓는다(시험용) */
    put(edgeId: number, at: number, lane: number) {
      if (cars.n >= max) return;
      put(cars.n, edges[edgeId], at, lane);
      cars.kind[cars.n] = 0;
      size[cars.n] = 4.6;
      locate(cars.n++);
    },
    target,
    setFocus,
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
    meanSpeed: () => (cars.n ? v.subarray(0, cars.n).reduce((a, b) => a + b, 0) / cars.n : 0),
  };
}
