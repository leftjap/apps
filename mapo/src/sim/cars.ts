// 차. 방향 그래프의 구간 위를 달리며 앞차와의 간격으로 속도를 정한다(IDM을 줄인 식).
// 구간 끝에서는 직진에 가까운 다음 구간을 고르고, 판 밖으로 나가면 사라진다.
// 버스는 노선의 구간 열을 따라 맨 오른쪽 차로로 달리고, 정류장마다 잠시 선다.
import { headingAt, pointAt } from '../poly.ts';
import { busHeadway, type BusRoute } from './buses.ts';
import { GREEN, YELLOW, type Signals } from './signals.ts';
import type { Now } from './clock.ts';
import { commute, daytime, nightlife } from './curves.ts';
import { LANE, type Edge } from './graph.ts';
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

  const laneKm = edges.reduce((sum, e) => sum + (e.len * e.lanes) / 1000, 0);
  const placeW = edges.map((e) => e.len * e.lanes);
  const entries = edges.filter((e) => e.entry);
  const entryW = entries.map((e) => e.lanes * Math.max(0, 4 - e.cls));
  const speed = new Float32Array(edges.length).fill(10);
  let speedAge = Infinity;
  const lists: number[][] = edges.map(() => []);
  const tail = new Int32Array(edges.length * 8);
  const tmp = [0, 0, 0];

  function chooseNext(i: number, e: Edge): number {
    const r = cars.route[i];
    if (r >= 0) return rpos[i] + 1 < routes[r].edges.length ? routes[r].edges[rpos[i] + 1] : -1;
    return e.next.length ? e.next[pick(e.nextW, rand())] : -1;
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
    if (route < 0) rpos[i] = 0;
    nextE[i] = chooseNext(i, e);
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
  }

  function locate(i: number) {
    const e = edges[edge[i]];
    const seg = pointAt(e.p, e.cum, s[i], tmp);
    const yaw = headingAt(e.p, seg);
    const off = e.off0 + lane[i] * LANE;
    cars.x[i] = tmp[0] - Math.sin(yaw) * off;
    cars.y[i] = tmp[1];
    cars.z[i] = tmp[2] + Math.cos(yaw) * off;
    cars.yaw[i] = yaw;
  }

  /** 목표 대수: 차로 길이 × 시간대 밀도 */
  function target(now: Now): number {
    const weekend = now.dow === 0 || now.dow === 6;
    const dens = 2.5 + 9 * commute(now.tod) * (weekend ? 0.5 : 1) + 4 * daytime(now.tod) + 2.5 * nightlife(now.tod);
    return Math.min(max, Math.round(laneKm * dens));
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

  /** 이번 단계에 정류장에 막 선 버스들: [노선 번호, 정류장 번호] */
  const dwells: [number, number][] = [];

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
      if (ap) {
        const st = signals!.state(ap.c, ap.group, now.tod);
        const toLine = e.len - ap.setback - s[i] - size[i] / 2;
        if (st !== GREEN && toLine > -0.5 && !(st === YELLOW && toLine < (v[i] * v[i]) / 6) && toLine + 2 < gap) {
          gap = toLine + 2;
          dv = v[i];
          front = i;
        }
      }
      if (r >= 0 && stopK[i] < routes[r].stops.length) {
        // 다음 정류장을 멈춰 선 앞차처럼 다룬다. 앞에 2m를 두고 서므로 2m를 더해 정류장 바로 위에 서게 한다
        const toStop = routes[r].stops[stopK[i]] - (routes[r].start[rpos[i]] + s[i]);
        if (toStop < 2.5 && v[i] < 0.6) {
          dwell[i] = 9 + rand() * 6;
          v[i] = 0;
          dwells.push([r, stopK[i]]);
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
        e = edges[nextE[i]];
        edge[i] = e.id;
        if (cars.route[i] >= 0) {
          rpos[i]++;
          lane[i] = e.lanes - 1;
        } else lane[i] = Math.min(lane[i], e.lanes - 1);
        nextE[i] = chooseNext(i, e);
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
    /** i번 차의 속도(m/s) */
    speedOf: (i: number) => v[i],
    /** i번 버스가 다음에 설 정류장 이름 */
    nextStop: (i: number) => (cars.route[i] >= 0 ? routes[cars.route[i]].stopNames[stopK[i]] ?? '' : ''),
    meanSpeed: () => (cars.n ? v.subarray(0, cars.n).reduce((a, b) => a + b, 0) / cars.n : 0),
  };
}
