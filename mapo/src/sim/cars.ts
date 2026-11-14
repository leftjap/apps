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
  const claimT = new Float32Array(max); // 잡아 둔 지 몇 초
  const prevClaim = new Int32Array(max).fill(-1);
  const prevPath = new Int32Array(max);
  const prevExit = new Int32Array(max);
  const prevE = new Int32Array(max).fill(-1); // 바로 앞에 달린 구간과 차로(교차로 곡선에 쓴다)
  const prevLane = new Uint8Array(max);
  const waitT = new Float32Array(max); // 교차로 앞에서 기다린 시간(초)
  const held: number[][] = Array.from({ length: jn.count }, () => []);
  const coming: number[][] = Array.from({ length: jn.count }, () => []);

  // 판 가장자리로 빠져나갈 수 있는 구간: 끝이 가장자리에 닿거나, 그런 구간으로 이어진다
  const canLeave = new Uint8Array(edges.length);
  const before: number[][] = edges.map(() => []);
  for (const e of edges) for (const k of e.next) before[k].push(e.id);
  const queue = edges.filter((e) => Math.hypot(e.p[e.p.length - 3], e.p[e.p.length - 1]) > BOARD_R - 40).map((e) => e.id);
  for (const k of queue) canLeave[k] = 1;
  while (queue.length) for (const k of before[queue.pop()!]) if (!canLeave[k]) (canLeave[k] = 1), queue.push(k);
  const laneKm = edges.reduce((sum, e) => sum + (e.len * e.lanes) / 1000, 0);
  const placeW = edges.map((e) => (canLeave[e.id] ? e.len * e.lanes : 0));
  const entries = edges.filter((e) => e.entry);
  const entryW = entries.map((e) => e.lanes * Math.max(0, 4 - e.cls));
  const speed = new Float32Array(edges.length).fill(10);
  let speedAge = Infinity;
  const lists: number[][] = edges.map(() => []);
  const tail = new Int32Array(edges.length * 8);
  const tmp = [0, 0, 0];

  function chooseNext(i: number, e: Edge, ahead = 1, leave = -1): number {
    const r = cars.route[i];
    if (r >= 0) return rpos[i] + ahead < routes[r].edges.length ? routes[r].edges[rpos[i] + ahead] : -1;
    if (!e.next.length) return -1;
    const ok = e.next.filter((k) => canLeave[k]);
    if (ok.length && ok.length < e.next.length) {
      const w = ok.map((k) => e.nextW[e.next.indexOf(k)]);
      return ok[pick(w, rand())];
    }
    // 교차로 안을 맴돌지 않도록, 묶인 교차로 안 구간에서는 빠져나가는 쪽을 고른다
    if (leave >= 0) {
      const out = e.next.filter((k) => jn.groupOfEnd[k] !== leave);
      if (out.length) return out[Math.floor(rand() * out.length)];
    }
    return e.next[pick(e.nextW, rand())];
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
    if (nextE[i] >= 0 && s[i] > e.len - jn.rIn[e.id]) {
      const o = edges[nextE[i]];
      jn.curve(e, o, lane[i], outLane(i, o), s[i] - (e.len - jn.rIn[e.id]), cv);
      inBox = true;
    } else if (prevE[i] >= 0 && s[i] < jn.rOut[e.id]) {
      const a = edges[prevE[i]];
      jn.curve(a, e, prevLane[i], lane[i], jn.rIn[a.id] + s[i], cv);
      inBox = true;
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
  const densPeak = Math.max(...Array.from({ length: 96 }, (_, k) => density({ tod: k * 900, dow: 2, doy: 1 })));
  /** 목표 대수: 하루 가장 붐비는 때에 상한(또는 차로 길이 × 밀도)이 차고, 다른 시간에는 교통량에 비례해 줄어든다 */
  function target(now: Now): number {
    return Math.round((Math.min(laneKm * densPeak, max - reserve) * density(now)) / densPeak);
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
  function fill(n: number) {
    const total = placeW.reduce((a, b) => a + b, 0);
    n = Math.min(n, max - reserve - (cars.n - nBus));
    for (let k = 0; k < n; k++) {
      let x = ((k + rand() * 0.5) / n) * total;
      let ei = 0;
      while (ei < edges.length - 1 && x > placeW[ei]) x -= placeW[ei++];
      const e = edges[ei];
      const ln = Math.min(e.lanes - 1, Math.floor(x / e.len));
      put(cars.n, e, x - ln * e.len, ln);
      cars.fade[cars.n] = 1;
      locate(cars.n++);
    }
  }

  /** 신호 때문에 서 있거나 설 차인가 */
  function redAhead(i: number, tod: number): boolean {
    const ap = signals?.approach.get(edge[i]);
    return !!ap && signals!.state(ap.c, ap.group, tod) !== GREEN;
  }
  /** 차 i 가 교차로 g 에 정한 경로 p 로 지금 들어가도 되는가 */
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
    // 빠져나갈 구간에 한 대 들어설 자리가 없으면 교차로 안에 서 버리므로 들어가지 않는다(꼬리 물기 금지)
    const x = edges[plan[b + n - 1]];
    const t = tail[x.id * 8 + (cars.route[i] >= 0 ? x.lanes - 1 : Math.min(lane[i], x.lanes - 1))];
    if (t >= 0 && t !== i && s[t] - size[t] / 2 < jn.rOut[x.id] + size[i] + 1) return false;
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
      for (const e of edges) speed[e.id] = VFREE[e.cls] * provider.roadSpeed(now, e.cls, e.key);
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
        const ne = edges[nextE[i]];
        front = tail[ne.id * 8 + Math.min(lane[i], ne.lanes - 1)];
        if (front >= 0) gap = e.len - s[i] + s[front];
      }
      if (front >= 0) {
        gap -= (size[front] + size[i]) / 2;
        dv = v[i] - v[front];
      }
      // 신호: 빨간불(멈출 수 있으면 노란불도)이면 정지선을 멈춰 선 앞차처럼 다룬다
      const ap = signals?.approach.get(e.id);
      let red = false;
      if (ap) {
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
            claimT[i] = 0;
            waitT[i] = 0;
            held[G].push(i);
          } else if (toBox > -0.5) {
            if (v[i] < 0.5) waitT[i] += dt;
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
    if (spawn && entries.length) {
      const want = Math.min(target(now), max - reserve);
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
