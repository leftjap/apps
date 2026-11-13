// 차. 방향 그래프의 구간 위를 달리며 앞차와의 간격으로 속도를 정한다(IDM을 줄인 식).
// 구간 끝에서는 직진에 가까운 다음 구간을 고르고, 판 밖으로 나가면 사라진다.
import { headingAt, pointAt } from '../poly.ts';
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
}

const VFREE = [22, 14, 12.5, 10]; // 등급별 자유 속도(m/s)
const A_MAX = 1.6;
const B_COMF = 2.5;

export function makeCars(edges: Edge[], provider: DataProvider, seed = 1, max = 1400) {
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
  };
  const edge = new Int32Array(max);
  const nextE = new Int32Array(max);
  const s = new Float32Array(max);
  const v = new Float32Array(max);
  const lane = new Uint8Array(max);
  const vf = new Float32Array(max);
  const size = new Float32Array(max);
  const acc = new Float32Array(max);

  const laneKm = edges.reduce((sum, e) => sum + (e.len * e.lanes) / 1000, 0);
  const placeW = edges.map((e) => e.len * e.lanes);
  const entries = edges.filter((e) => e.entry);
  const entryW = entries.map((e) => e.lanes * (4 - e.cls));
  const speed = new Float32Array(edges.length).fill(10);
  let speedAge = Infinity;
  const lists: number[][] = edges.map(() => []);
  const tail = new Int32Array(edges.length * 8);
  const tmp = [0, 0, 0];

  const chooseNext = (e: Edge) => (e.next.length ? e.next[pick(e.nextW, rand())] : -1);

  function put(i: number, e: Edge, at: number, ln: number) {
    edge[i] = e.id;
    nextE[i] = chooseNext(e);
    s[i] = at;
    lane[i] = ln;
    vf[i] = 0.86 + rand() * 0.26;
    v[i] = speed[e.id] * vf[i] * 0.8;
    const r = rand();
    cars.kind[i] = e.cls >= 1 && r < 0.05 ? 1 : r < 0.13 ? 2 : 0;
    size[i] = cars.kind[i] === 1 ? 11 : 4.6;
    cars.tint[i] = rand();
    cars.brake[i] = 0;
    cars.fade[i] = 0;
  }
  function remove(i: number) {
    const j = --cars.n;
    if (i === j) return;
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

  /** 길 전체에 고르게 n대를 놓는다(처음 화면이 비어 보이지 않게) */
  function fill(n: number) {
    const total = placeW.reduce((a, b) => a + b, 0);
    n = Math.min(n, max);
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

  function step(dt: number, now: Now, spawn = true) {
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
      const v0 = Math.max(0.5, speed[e.id] * vf[i]);
      const want = 2 + v[i] * 1.3 + Math.max(0, (v[i] * dv) / (2 * Math.sqrt(A_MAX * B_COMF)));
      let a = A_MAX * (1 - (v[i] / v0) ** 4);
      if (front >= 0) a -= A_MAX * (want / Math.max(0.3, gap)) ** 2;
      a = Math.max(-8, Math.min(A_MAX, a));
      const slow = v[i] < 0.3 * VFREE[e.cls] * vf[i];
      cars.brake[i] += ((a < -0.5 || slow ? 1 : 0) - cars.brake[i]) * Math.min(1, dt * 6);
      cars.fade[i] = Math.min(1, cars.fade[i] + dt * 2);
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
        lane[i] = Math.min(lane[i], e.lanes - 1);
        nextE[i] = chooseNext(e);
      }
      if (gone) remove(i);
      else locate(i);
    }
    if (spawn && entries.length) {
      const want = target(now);
      for (let k = 0; k < 6 && cars.n < want; k++) {
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
    target,
    meanSpeed: () => (cars.n ? v.subarray(0, cars.n).reduce((a, b) => a + b, 0) / cars.n : 0),
  };
}
