// 보행자. 골목·보도 그래프 위를 걷는다. 사람은 역 출구와 버스 정류장에서만 나타나고 사라진다.
// 나타날 때는 출구·정류장이 붙은 길의 그쪽 보도에서 걷기 시작하고, 한동안 돌아다니다가
// 가장 가까운 출구·정류장으로 걸어가 들어간다(정류장에서는 버스가 올 때까지 기다렸다가 탄다).
import type { Now } from './clock.ts';
import { clamp01, commute, daytime, nightlife } from './curves.ts';
import type { Road } from '../data/board.ts';
import type { WalkGraph } from './graph.ts';
import type { DataProvider } from './provider.ts';
import { pick, rng } from './rng.ts';
import type { Signals } from './signals.ts';

export interface Walkers {
  n: number;
  x: Float32Array;
  z: Float32Array;
  yaw: Float32Array;
  /** 걸음 위상(라디안). 걸은 거리에 비례해 늘어난다 */
  phase: Float32Array;
  /** 나타날 때 0→1, 사라질 때 1→0 */
  fade: Float32Array;
  /** 캐릭터마다 다른 0~1 값(색) */
  tint: Float32Array;
  /** 고유 번호(배열 자리가 바뀌어도 그대로) */
  id: Int32Array;
  /** 휴대폰을 든 정도 0~1(멈춰 서서 고양이를 찍는 중) */
  photo: Float32Array;
  /** 걷는 중이면 1, 서 있으면 0 (걸음 흔들림에 쓴다) */
  moving: Float32Array;
  /** 나이대: 0 아이(0~9세), 1 10·20대, 2 30~50대, 3 60대 이상 */
  age: Uint8Array;
  /** 여성이면 1 */
  female: Uint8Array;
}

/** 사람이 들고 나는 곳. 역 출구는 key 가 역 이름, 정류장은 정류장 열쇠. 건물 출입구는 바닥 외곽선 [x,z, ...]과 높이(m)를 함께 준다 */
export interface Portal {
  kind: 'exit' | 'stop' | 'door';
  key: string;
  x: number;
  z: number;
  poly?: Float32Array;
  h?: number;
}

/** 구역 id → 판 위의 중심과 반지름(m). 실시간 도시데이터 장소의 대략적인 범위. 겹치는 곳은 작은 구역이 먼저다 */
export const ZONES: Record<string, [number, number, number]> = {
  'hongik-stn': [573, -643, 260],
  hapjeong: [-470, 240, 300],
  mangwon: [-1560, 120, 300],
  yeonnam: [300, -1050, 420],
  hongdae: [350, -250, 520],
};
const ZONE_IDS = Object.keys(ZONES);

/** 하루 가운데 밖에 나와 다니는 정도(0~1). 새벽에는 대부분 실내에 있다 */
const outdoors = (now: Now) => clamp01(0.05 + 0.95 * Math.max(daytime(now.tod), nightlife(now.tod), 0.8 * commute(now.tod)));
/** 구역 인구 가운데 밖에 나와 걷는 사람 비율(가정한 값). 가게·집 안에 있는 사람이 대부분인 상업지와 달리 공원은 대부분 밖에 있다 */
const OUT_SHARE: Record<string, number> = { mangwon: 0.3 };

/** 구역마다 지금 밖에 나와 걷는 실제 사람 수. 마지막 칸은 구역 밖 출구·정류장 둘레의 사람(구역 인원의 12%) */
function outside(provider: DataProvider, now: Now): number[] {
  const act = outdoors(now);
  const pop: Record<string, number> = {};
  for (const a of provider.areas(now)) pop[a.id] = (a.pplMin + a.pplMax) / 2;
  const t = ZONE_IDS.map((id) => (pop[id] ?? 0) * (OUT_SHARE[id] ?? 0.12) * act);
  t.push(t.reduce((a, b) => a + b, 0) * 0.12);
  return t;
}
/** 화면 1명이 실제 몇 명인가. 상한 안이면 1, 넘치면 모든 구역을 같은 배율로 줄인다 */
export function walkerScale(provider: DataProvider, now: Now, max: number): number {
  return Math.max(1, outside(provider, now).reduce((a, b) => a + b, 0) / max);
}
/** 구역마다 지금 화면에 있어야 할 사람 수: 구역 인구에 비례하므로 인구 밀도가 높은 구역일수록 빽빽하다 */
export function zoneTargets(provider: DataProvider, now: Now, max: number): number[] {
  const k = walkerScale(provider, now, max);
  return outside(provider, now).map((v) => v / k);
}

/** 지금 화면에 있어야 할 보행자 수 */
export function walkerTarget(provider: DataProvider, now: Now, max: number): number {
  return Math.min(max, Math.round(zoneTargets(provider, now, max).reduce((a, b) => a + b, 0)));
}

/** 걷는 길(골목·보행로)이 자동차 전용도로 밑을 같은 높이로 지나는 곳: 한강공원 나들목. (x, z) 반지름 r 안에서 찾는다 */
export function underpasses(roads: Road[], x: number, z: number, r: number): [number, number][] {
  const near = (p: Float32Array) => {
    for (let i = 0; i < p.length; i += 3) if (Math.hypot(p[i] - x, p[i + 2] - z) < r) return true;
    return false;
  };
  const motor = roads.filter((m) => m.cls <= 1 && near(m.p));
  const out: [number, number][] = [];
  for (const w of roads) {
    if (w.cls < 4 || w.bridge || !near(w.p)) continue;
    for (let i = 0; i + 5 < w.p.length; i += 3)
      for (const m of motor)
        for (let k = 0; k + 5 < m.p.length; k += 3) {
          const [ax, ay, az, bx, , bz] = [w.p[i], w.p[i + 1], w.p[i + 2], w.p[i + 3], w.p[i + 4], w.p[i + 5]];
          const [cx, cy, cz, dx, , dz] = [m.p[k], m.p[k + 1], m.p[k + 2], m.p[k + 3], m.p[k + 4], m.p[k + 5]];
          const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
          if (Math.abs(den) < 1e-9) continue;
          const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
          const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1 || Math.abs(ay - cy) > 2 || ay > 2) continue;
          const px = ax + t * (bx - ax);
          const pz = az + t * (bz - az);
          if (Math.hypot(px - x, pz - z) < r && !out.some(([qx, qz]) => Math.hypot(qx - px, qz - pz) < 25)) out.push([px, pz]);
        }
  }
  return out;
}

/** 출구·정류장이 붙은 길 조각: a→b 위 t(m) 지점, 길 오른쪽(+1)·왼쪽(−1) */
interface Dock extends Portal {
  a: number;
  b: number;
  t: number;
  len: number;
  side: number;
  /** 구역 번호(ZONE_IDS 순서, 구역 밖이면 ZONE_IDS.length) */
  zone: number;
  /** 건물 출입구: 건물 벽 위 문 자리와 드나드는 사람의 몫(바닥 넓이 × 층수) */
  door?: [number, number];
  weight?: number;
}

const WANDER = 0;
const HOMING = 1;
const WAITING = 2;
const LEAVING = 3;
const BOARDING = 4; // 버스 문으로 걸어가는 중
const MAX_WAIT = 300; // 정류장에서 버스를 기다리는 가장 긴 시간(초)
const QUEUE_GAP = 1.5; // 정류장 줄에서 앞뒤 사람 사이(m). 사람을 실제보다 키워 그리므로 넉넉하게 둔다
const ALIGHT_T = 1.6; // 버스 문에서 보도까지 걸어 나오는 시간(초)

/** 외곽선 [x,z, ...] 넓이 */
function polyArea(p: Float32Array): number {
  let a = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1];
  return Math.abs(a) / 2;
}
/** 외곽선 [x,z, ...] 위에서 (x, z)에 가장 가까운 점 */
function nearestOnPoly(p: Float32Array, x: number, z: number): [number, number] {
  let best: [number, number] = [p[0], p[1]];
  let bd = Infinity;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const ax = p[j];
    const az = p[j + 1];
    const dx = p[i] - ax;
    const dz = p[i + 1] - az;
    const l2 = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const qx = ax + dx * u;
    const qz = az + dz * u;
    const d = Math.hypot(qx - x, qz - z);
    if (d < bd) (bd = d), (best = [qx, qz]);
  }
  return best;
}

/** 작은 이진 힙(거리 순) */
function heap() {
  const k: number[] = [];
  const v: number[] = [];
  return {
    get size() {
      return k.length;
    },
    push(key: number, val: number) {
      k.push(key);
      v.push(val);
      let i = k.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (k[p] <= k[i]) break;
        [k[p], k[i]] = [k[i], k[p]];
        [v[p], v[i]] = [v[i], v[p]];
        i = p;
      }
    },
    pop(): [number, number] {
      const top: [number, number] = [k[0], v[0]];
      const lk = k.pop()!;
      const lv = v.pop()!;
      if (k.length) {
        k[0] = lk;
        v[0] = lv;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < k.length && k[l] < k[m]) m = l;
          if (r < k.length && k[r] < k[m]) m = r;
          if (m === i) break;
          [k[m], k[i]] = [k[i], k[m]];
          [v[m], v[i]] = [v[i], v[m]];
          i = m;
        }
      }
      return top;
    },
  };
}

export function makeWalkers(
  g: WalkGraph,
  portals: Portal[],
  provider: DataProvider,
  seed = 1,
  max = 1500,
  onLeave?: (x: number, z: number) => void,
  signals?: Signals,
  /** 좌표가 차로 위인가(횡단보도 앞에서 차로 위에 서서 기다리지 않도록) */
  onLanes?: (x: number, z: number) => boolean,
  /** 좌표가 큰길(주간선~집산도로) 차로 안쪽인가(신호 없는 곳에서 큰길을 가로지르지 않도록) */
  onMajor?: (x: number, z: number) => boolean,
) {
  const rand = rng(seed);
  const w: Walkers = {
    n: 0,
    x: new Float32Array(max),
    z: new Float32Array(max),
    yaw: new Float32Array(max),
    phase: new Float32Array(max),
    fade: new Float32Array(max),
    tint: new Float32Array(max),
    id: new Int32Array(max),
    photo: new Float32Array(max),
    moving: new Float32Array(max),
    age: new Uint8Array(max),
    female: new Uint8Array(max),
  };
  let nextId = 1;
  // 걷는 구간: (sx,sz) → 노드 to, 시작점에서 t(m)
  const from = new Int32Array(max);
  const to = new Int32Array(max);
  const sx = new Float32Array(max);
  const sz = new Float32Array(max);
  const t = new Float32Array(max);
  const speed = new Float32Array(max);
  const off = new Float32Array(max);
  const offWant = new Float32Array(max);
  const side = new Float32Array(max); // -1~1: 길의 어느 쪽, 얼마나 바깥으로 걷는가
  const life = new Float32Array(max);
  const mode = new Uint8Array(max);
  const endT = new Float32Array(max); // 이 거리에 닿으면 출구·정류장에 도착(−1 이면 없음)
  const dockOf = new Int32Array(max); // 도착할(기다리는) 출구·정류장 번호
  const holdT = new Float32Array(max); // 멈춰 서 있을 남은 시간(초)
  const faceX = new Float32Array(max);
  const faceZ = new Float32Array(max);
  const nextK = new Int32Array(max); // 노드 to[i] 에 닿으면 갈 이웃 번호(−1 아직 안 정함, −2 갈 곳 없음)
  // 모퉁이: 지금 보도 선과 다음 보도 선이 만나는 곳에서 갈아탄다. 노드를 기준으로 지금 구간의 갈아탈 거리(turnU)와 다음 구간의 시작 거리(startV)
  const turnU = new Float32Array(max);
  const startV = new Float32Array(max);
  const nextOff = new Float32Array(max);
  const nextSide = new Float32Array(max);
  const waitStart = new Uint8Array(max); // 다음 구간 첫머리에서 길을 건너기 전에 신호를 기다려야 하는가(왼쪽으로 꺾을 때 두 번째 횡단보도)
  const tx = new Float32Array(max); // 버스 문(타러 걸어가는 곳)
  const tz = new Float32Array(max);
  const ox = new Float32Array(max); // 버스에서 막 내린 사람: 보도 자리에서 버스 문까지(줄어들어 0이 된다)
  const oz = new Float32Array(max);
  const alightT = new Float32Array(max);
  const dodge = new Float32Array(max); // 앞사람을 비켜 옆으로 옮긴 거리(m, off 와 같은 방향)
  const bandLo = new Float32Array(max); // 지금 걷는 띠(보도·골목)의 안쪽·바깥쪽 끝(중심선에서 m)
  const bandHi = new Float32Array(max);
  const curK = new Int32Array(max); // 지금 걷는 길 조각: 노드 from 의 이웃 번호
  // 지금 자리가 차로 위·큰길 차로 안쪽인가(바로 전 단계에 앞 자리로 잰 값, 255 = 모름)
  const inLanes = new Uint8Array(max).fill(255);
  const inMajor = new Uint8Array(max).fill(255);
  const laneHold = new Uint8Array(max); // 신호를 기다려 차로 앞에 멈춰 있다(다음 확인까지)
  let frame = 0;
  // 보행 노드마다 25m·30m 안의 신호 묶음(−2 = 아직 안 찾음)
  const site25 = new Int16Array(g.adj.length).fill(-2);
  const site30 = new Int16Array(g.adj.length).fill(-2);
  const siteOf = (n: number, far = false) => {
    const a = far ? site30 : site25;
    if (a[n] === -2) a[n] = signals ? signals.siteNear(g.nx[n * 2], g.nx[n * 2 + 1], far ? 30 : 25) : -1;
    return a[n];
  };
  // 보행 조각마다 차로에 닿는가(1: 차로, 2: 큰길 차로 안쪽). 걷는 띠와 비켜 서는 폭(0.2m)까지 2m 간격으로 처음 쓸 때 재어 둔다(255 = 아직 안 잼)
  const touch = g.adj.map((nb) => new Uint8Array(nb.length).fill(255));
  function touchOf(a: number, k: number): number {
    if (touch[a][k] !== 255) return touch[a][k];
    let f = 0;
    const b = g.adj[a][k];
    const dx = g.nx[b * 2] - g.nx[a * 2];
    const dz = g.nx[b * 2 + 1] - g.nx[a * 2 + 1];
    const L = Math.hypot(dx, dz) || 1;
    const [lo, hi] = g.lat[a][k];
    for (let d = -4; d <= L + 4 && f !== 3; d += 2)
      for (const o of [lo - 0.2, (lo + hi) / 2, hi + 0.2])
        for (const sd of [1, -1]) {
          const x = g.nx[a * 2] + (dx / L) * d - (dz / L) * o * sd;
          const z = g.nx[a * 2 + 1] + (dz / L) * d + (dx / L) * o * sd;
          if (onLanes?.(x, z)) f |= 1;
          if (onMajor?.(x, z)) f |= 2;
        }
    return (touch[a][k] = f);
  }
  // 가까운 사람 찾기용 격자(1.5m 칸을 해시로 묶는다)
  const GH = 32768;
  const gridHead = new Int32Array(GH).fill(-1);
  const gridNext = new Int32Array(max);
  const cellKey = (cx: number, cz: number) => ((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) >>> 0) & (GH - 1);

  const pos = (n: number): [number, number] => [g.nx[n * 2], g.nx[n * 2 + 1]];
  const zoneOf = (x: number, z: number) => {
    const k = ZONE_IDS.findIndex((id) => Math.hypot(x - ZONES[id][0], z - ZONES[id][1]) < ZONES[id][2]);
    return k < 0 ? ZONE_IDS.length : k;
  };
  const home = new Uint8Array(max); // 사람이 나온 구역(그 구역 안을 돌아다닌다)
  const budget = new Float32Array(ZONE_IDS.length + 1).fill(1); // 구역마다 이번에 내보낼 수 있는 인원(초당 쌓인다)
  // 구역마다 나이대(아이·10·20대·30~50대·60대 이상, 누적 비율)와 여성 비율. 마지막 칸은 구역 밖(구역들의 평균)
  const looks = Array.from({ length: ZONE_IDS.length + 1 }, () => ({ ages: [0.05, 0.4, 0.85, 1], female: 0.5 }));

  // ── 출구·정류장을 가장 가까운 길 조각에 붙인다 ──
  const docks: Dock[] = [];
  for (const p of portals) {
    const n0 = g.nearest(p.x, p.z);
    if (n0 < 0) continue;
    let best: Dock | null = null;
    let bd = Infinity;
    const seen = new Set<number>();
    // 가장 가까운 노드에서 두 칸 안의 길 조각 가운데 출구·정류장에 가장 가까운 것
    const ring = new Set([n0, ...g.adj[n0]]);
    for (const a of [...ring]) for (const b of g.adj[a]) ring.add(b);
    for (const a of ring)
      for (const [kb, b] of g.adj[a].entries()) {
        const key = Math.min(a, b) * 1e7 + Math.max(a, b);
        if (seen.has(key) || g.aw[a][kb] === 0) continue; // 차로 위에 그려진 보행로에는 붙이지 않는다
        seen.add(key);
        const [ax, az] = pos(a);
        const [bx, bz] = pos(b);
        const dx = bx - ax;
        const dz = bz - az;
        const len = Math.hypot(dx, dz) || 1;
        const tt = Math.min(len, Math.max(0, ((p.x - ax) * dx + (p.z - az) * dz) / len));
        const d = Math.hypot(ax + (dx / len) * tt - p.x, az + (dz / len) * tt - p.z);
        if (d < bd) {
          bd = d;
          const right = (p.x - ax) * (-dz / len) + (p.z - az) * (dx / len);
          // 한쪽만 걸을 수 있는 길이면 그쪽 보도에 붙인다
          best = { ...p, a, b, t: tt, len, side: g.dir[a][kb] || (right >= 0 ? 1 : -1), zone: zoneOf(p.x, p.z) };
        }
      }
    if (!best) continue;
    if (p.poly) {
      // 건물 출입구: 보도 자리에서 가장 가까운 벽 위 점이 문이다. 길에서 20m 넘게 떨어진 건물은 빼고, 드나드는 몫은 바닥 넓이 × 층수
      docks.push(best);
      const s = dockPoint(docks.length - 1);
      docks.pop();
      const door = nearestOnPoly(p.poly, s.x, s.z);
      if (Math.hypot(door[0] - s.x, door[1] - s.z) > 20) continue;
      best.door = door;
      best.weight = polyArea(p.poly) * Math.max(1, (p.h ?? 6) / 3);
    }
    docks.push(best);
  }

  // 구역별로 사람이 나오는 곳: 건물 출입구와 역 출구(와 나들목). 건물이 있는 구역에서는 열에 셋을 역 출구에서 내보낸다.
  // 정류장에서는 버스가 섰을 때 내리는 사람으로 모자란 인원을 채운다
  const docksIn: number[][] = Array.from({ length: ZONE_IDS.length + 1 }, () => []);
  const dockW: number[][] = Array.from({ length: ZONE_IDS.length + 1 }, () => []);
  for (let z = 0; z <= ZONE_IDS.length; z++) {
    const exits = docks.map((d, k) => (d.zone === z && d.kind === 'exit' ? k : -1)).filter((k) => k >= 0);
    const doors = docks.map((d, k) => (d.zone === z && d.kind === 'door' ? k : -1)).filter((k) => k >= 0);
    const doorSum = doors.reduce((s, k) => s + (docks[k].weight ?? 1), 0);
    for (const k of doors) docksIn[z].push(k), dockW[z].push(docks[k].weight ?? 1);
    for (const k of exits) docksIn[z].push(k), dockW[z].push(doors.length ? (doorSum * 0.3) / 0.7 / exits.length : 1);
  }
  const short = new Float32Array(ZONE_IDS.length + 1); // 구역마다 모자란 인원(버스에서 내릴 사람)

  // ── 집으로 가는 길: 모든 출구·정류장에서 거꾸로 퍼진 최단 경로. via[n] 은 가장 가까운 출구·정류장 쪽 다음 노드 ──
  const N = g.adj.length;
  const dist = new Float64Array(N).fill(Infinity);
  const via = new Int32Array(N).fill(-1);
  const srcDock = new Int32Array(N).fill(-1);
  {
    const h = heap();
    docks.forEach((d, i) => {
      for (const [n, dd] of [
        [d.a, d.t],
        [d.b, d.len - d.t],
      ] as const)
        if (dd < dist[n]) {
          dist[n] = dd;
          srcDock[n] = i;
          via[n] = -1;
          h.push(dd, n);
        }
    });
    while (h.size) {
      const [d, n] = h.pop();
      if (d > dist[n]) continue;
      const [nx, nz] = pos(n);
      for (const m of g.adj[n]) {
        const [mx, mz] = pos(m);
        const nd = d + Math.hypot(mx - nx, mz - nz);
        if (nd < dist[m]) {
          dist[m] = nd;
          via[m] = n;
          srcDock[m] = -1;
          h.push(nd, m);
        }
      }
    }
  }

  /** 노드 a 에서 이웃 k 로 갈 때 걸을 자리(중심선에서 떨어진 거리, 부호는 쪽) */
  function offFor(a: number, k: number, sd: number) {
    const [lo, hi] = g.lat[a][k];
    return (g.dir[a][k] || Math.sign(sd) || 1) * (lo + Math.abs(sd) * (hi - lo));
  }
  function aim(i: number, k: number) {
    curK[i] = k;
    offWant[i] = offFor(from[i], k, side[i]);
    [bandLo[i], bandHi[i]] = g.lat[from[i]][k];
    nextK[i] = -1;
  }
  function place(i: number) {
    const [ex, ez] = pos(to[i]);
    const dx = ex - sx[i];
    const dz = ez - sz[i];
    const len = Math.hypot(dx, dz) || 1;
    const k = t[i] / len; // 모퉁이에서는 노드를 지나거나 노드 앞에서 갈아타므로 0~1 밖도 쓴다
    w.x[i] = sx[i] + dx * k - (dz / len) * (off[i] + dodge[i]);
    w.z[i] = sz[i] + dz * k + (dx / len) * (off[i] + dodge[i]);
    w.yaw[i] = Math.atan2(dz, dx);
    return len;
  }
  /** 신호 교차로 노드 b 에서 횡단보도 앞 대기 자리까지 거리: 그 노드에 닿는 길 가운데 가장 넓은 길의 보도 안쪽 */
  const curbAt = new Float32Array(N).fill(-1);
  function curb(b: number) {
    if (curbAt[b] < 0) curbAt[b] = Math.max(3, ...g.lat[b].map(([lo]) => lo - 0.4));
    return curbAt[b];
  }

  /** 출구·정류장 d 에서 한 사람이 나온다 */
  function spawnAt(di: number): number {
    if (w.n >= max) return -1;
    const d = docks[di];
    const i = w.n++;
    const forward = rand() < 0.5;
    from[i] = forward ? d.a : d.b;
    to[i] = forward ? d.b : d.a;
    [sx[i], sz[i]] = pos(from[i]);
    // 출구 폭(건물 문 앞이면 문 폭)만큼 흩어져 나온다
    t[i] = Math.max(0, Math.min(d.len, (forward ? d.t : d.len - d.t) + (rand() - 0.5) * (d.door ? 2 : 6)));
    // 출구가 있는 쪽 보도로 나온다. 거꾸로 걸으면 오른쪽·왼쪽이 바뀐다
    side[i] = (forward ? d.side : -d.side) * (0.2 + rand() * 0.8);
    const k = g.adj[from[i]].indexOf(to[i]);
    aim(i, k);
    off[i] = offWant[i];
    dodge[i] = 0;
    // 이미 사람이 서 있는 자리면 조금 앞으로 나와 선다(한 자리에 겹쳐 나오지 않게)
    for (let tries = 0; tries < 4 && crowdedAt(i); tries++) t[i] = Math.min(d.len, t[i] + 0.8);
    speed[i] = 1.0 + rand() * 0.55;
    life[i] = 150 + rand() * 350; // 구역 안쪽 골목까지 걸어 들어갈 만큼
    mode[i] = WANDER;
    endT[i] = -1;
    dockOf[i] = -1;
    holdT[i] = 0;
    waitStart[i] = 0;
    inLanes[i] = inMajor[i] = 255;
    laneHold[i] = 0;
    w.phase[i] = rand() * 6.28;
    w.fade[i] = 0;
    w.tint[i] = rand();
    w.id[i] = nextId++;
    w.photo[i] = 0;
    home[i] = d.zone;
    alightT[i] = 0;
    const look = looks[d.zone];
    const u = rand();
    w.age[i] = u < look.ages[0] ? 0 : u < look.ages[1] ? 1 : u < look.ages[2] ? 2 : 3;
    w.female[i] = rand() < look.female ? 1 : 0;
    if (w.age[i] === 3) speed[i] *= 0.75; // 나이 든 사람은 천천히 걷는다
    w.moving[i] = 1;
    place(i);
    if (d.door) {
      // 건물 문에서 보도 자리까지 걸어 나온다
      ox[i] = d.door[0] - w.x[i];
      oz[i] = d.door[1] - w.z[i];
      alightT[i] = ALIGHT_T;
      lift(i);
    }
    return i;
  }
  function remove(i: number) {
    onLeave?.(w.x[i], w.z[i]);
    const j = --w.n;
    if (i === j) return;
    for (const a of [from, to, sx, sz, t, speed, off, offWant, side, life, mode, endT, dockOf, holdT, faceX, faceZ, nextK, turnU, startV, nextOff, nextSide, waitStart, home, tx, tz, ox, oz, alightT, dodge, bandLo, bandHi, curK, inLanes, inMajor, laneHold, w.x, w.z, w.yaw, w.phase, w.fade, w.tint, w.id, w.photo, w.moving, w.age, w.female])
      a[i] = a[j];
  }

  const docksOf = (kind: Portal['kind'], key: string) => docks.map((d, i) => (d.kind === kind && d.key === key ? i : -1)).filter((i) => i >= 0);

  /** 역 출구에서 count 명이 나온다(열차 도착) */
  function burst(station: string, count: number) {
    const ds = docksOf('exit', station);
    if (!ds.length) return;
    for (let k = 0; k < count; k++) spawnAt(ds[Math.floor(rand() * ds.length)]);
  }
  /** 버스 문이 (doorX, doorZ)인 버스가 정류장에 섰다: count 명이 내린다. 그 구역 인원이 모자라면 몇 명 더 내린다 */
  function alight(key: string, count: number, doorX: number, doorZ: number) {
    const ds = docksOf('stop', key);
    if (!ds.length) return;
    const z = docks[ds[0]].zone;
    count += Math.min(6, Math.floor(Math.max(0, short[z])));
    short[z] -= count;
    for (let k = 0; k < count; k++) {
      const i = spawnAt(ds[Math.floor(rand() * ds.length)]);
      if (i < 0) return;
      // 버스 문에서 보도 자리까지 ALIGHT_T 초 동안 걸어 나온다(사람마다 조금씩 늦게)
      ox[i] = doorX - w.x[i];
      oz[i] = doorZ - w.z[i];
      alightT[i] = ALIGHT_T + k * 0.5;
      lift(i);
    }
  }
  /** 막 내린 사람을 버스 문 쪽으로 옮겨 그린다 */
  function lift(i: number) {
    const k = Math.min(1, alightT[i] / ALIGHT_T);
    w.x[i] += ox[i] * k;
    w.z[i] += oz[i] * k;
  }
  /** 정류장에서 기다리던 사람들이 버스 문(doorX, doorZ)으로 걸어가 탄다 */
  function board(key: string, doorX: number, doorZ: number) {
    for (let i = 0; i < w.n; i++)
      if (mode[i] === WAITING && docks[dockOf[i]].key === key) {
        mode[i] = BOARDING;
        tx[i] = doorX;
        tz[i] = doorZ;
      }
  }
  /** k번 출구·정류장에서 사람이 서는 보도 자리(보도 가운데)와, 찻길에서 멀어지는 쪽이 +z 가 되는 방향 */
  function dockPoint(k: number): { x: number; z: number; yaw: number } {
    const d = docks[k];
    const [ax, az] = pos(d.a);
    const [bx, bz] = pos(d.b);
    const dx = (bx - ax) / (d.len || 1);
    const dz = (bz - az) / (d.len || 1);
    const o = offFor(d.a, g.adj[d.a].indexOf(d.b), d.side * 0.5);
    const h = Math.atan2(dz, dx);
    return { x: ax + dx * d.t - dz * o, z: az + dz * d.t + dx * o, yaw: o >= 0 ? h : h + Math.PI };
  }
  const waitingOn = (dk: number) => {
    let n = 0;
    for (let i = 0; i < w.n; i++) if (mode[i] === WAITING && dockOf[i] === dk) n++;
    return n;
  };
  const waitingAt = (key: string) => {
    let n = 0;
    for (let i = 0; i < w.n; i++) if (mode[i] === WAITING && docks[dockOf[i]].key === key) n++;
    return n;
  };

  /** id 인 사람을 secs 초 동안 세워 (fx, fz) 쪽을 보게 한다 */
  function hold(id: number, secs: number, fx: number, fz: number) {
    for (let i = 0; i < w.n; i++)
      if (w.id[i] === id && mode[i] < WAITING) {
        holdT[i] = secs;
        faceX[i] = fx;
        faceZ[i] = fz;
        life[i] = Math.max(life[i], secs + 20);
        return;
      }
  }

  /** 노드 b 에서 이웃 kk 로 가려면 큰길(주간선~집산도로) 갈래를 건너야 하는가. 걷는 쪽(오른쪽 보도면 오른쪽)으로 돌며
   *  들어온 방향과 나갈 방향 사이에 놓인 갈래를 건넌다 */
  function crossesMajor(i: number, b: number, kk: number): boolean {
    const nb = g.adj[b];
    const bx = g.nx[b * 2];
    const bz = g.nx[b * 2 + 1];
    const hIn = Math.atan2(bz - sz[i], bx - sx[i]);
    const rel = (j: number) => {
      const d = Math.atan2(g.nx[nb[j] * 2 + 1] - bz, g.nx[nb[j] * 2] - bx) - hIn;
      return Math.atan2(Math.sin(d), Math.cos(d)); // + 는 오른쪽으로 꺾는 쪽
    };
    const out = rel(kk);
    const right = (Math.sign(offWant[i]) || 1) > 0;
    for (let j = 0; j < nb.length; j++) {
      if (j === kk || nb[j] === from[i] || g.cls[b][j] > 3) continue;
      const r = rel(j);
      if (right ? r > out && r < Math.PI - 0.05 : r < out && r > -Math.PI + 0.05) return true;
    }
    return false;
  }

  /** 노드 to[i] 에 닿으면 갈 이웃을 미리 고르고, 모퉁이에서 갈아탈 자리를 계산한다 */
  function plan(i: number): number {
    if (nextK[i] !== -1) return nextK[i];
    const b = to[i];
    const nb = g.adj[b];
    let k: number;
    if (mode[i] === HOMING) {
      if (srcDock[b] >= 0) {
        const d = docks[srcDock[b]];
        k = nb.indexOf(d.a === b ? d.b : d.a);
      } else k = via[b] >= 0 ? nb.indexOf(via[b]) : -1;
    } else {
      // 나온 구역 밖으로 멀어지는 길은 거의 고르지 않는다(구역 밖 사람은 어디로든 간다)
      const z = home[i];
      const [cx, cz, r] = z < ZONE_IDS.length ? ZONES[ZONE_IDS[z]] : [0, 0, Infinity];
      const db = Math.hypot(g.nx[b * 2] - cx, g.nx[b * 2 + 1] - cz);
      let ws = g.aw[b].map((v, kk) => {
        if (nb[kk] === from[i] && nb.length > 1) return 0;
        const dn = Math.hypot(g.nx[nb[kk] * 2] - cx, g.nx[nb[kk] * 2 + 1] - cz);
        return dn > r && dn > db ? v * 0.04 : v;
      });
      // 신호 없는 교차로에서는 큰길을 건너지 않는 쪽으로 간다(그런 쪽이 없으면 건넌다)
      if (signals && siteOf(b) < 0) {
        const ok = ws.map((v, kk) => (crossesMajor(i, b, kk) ? 0 : v));
        if (ok.some((v) => v > 0)) ws = ok;
      }
      k = pick(ws, rand());
    }
    if (k < 0) return (nextK[i] = -2);
    const [bx, bz] = pos(b);
    const [mx, mz] = pos(nb[k]);
    let ax = bx - sx[i];
    let az = bz - sz[i];
    const la = Math.hypot(ax, az) || 1;
    ax /= la;
    az /= la;
    let cx = mx - bx;
    let cz = mz - bz;
    const lc = Math.hypot(cx, cz) || 1;
    cx /= lc;
    cz /= lc;
    const back = ax * cx + az * cz < -0.95; // 되돌아선다(막다른 길): 같은 쪽 보도를 유지한다
    let sd = back ? -side[i] : side[i];
    if (mode[i] === HOMING && srcDock[b] >= 0) {
      // 출구·정류장이 있는 길로 꺾어 들어가는 교차로에서 그쪽 보도로 건너간다(길 조각을 거꾸로 지나면 오른쪽·왼쪽이 바뀐다)
      const d = docks[srcDock[b]];
      sd = (d.a === b ? 1 : -1) * d.side * Math.max(0.3, Math.abs(side[i]));
    }
    const o2 = offFor(b, k, sd);
    const cr = ax * cz - az * cx;
    let u = 0;
    let v = 0;
    if (Math.abs(cr) > 0.3) {
      // 지금 보도 선(노드 + n1·o1 + a·u)과 다음 보도 선(노드 + n2·o2 + c·v)이 만나는 점. n = 진행 방향 오른쪽
      const o1 = offWant[i];
      const wx = -cz * o2 + az * o1;
      const wz = cx * o2 - ax * o1;
      u = Math.max(-0.8 * la, Math.min(25, (wx * cz - wz * cx) / cr));
      v = Math.max(-25, Math.min(0.8 * lc, (wx * az - wz * ax) / cr));
    }
    turnU[i] = u;
    startV[i] = v;
    nextSide[i] = sd;
    nextOff[i] = back ? -off[i] : Math.abs(cr) > 0.3 ? o2 : off[i];
    return (nextK[i] = k);
  }

  /** 갈아탈 자리에 닿았다: 미리 고른 다음 구간으로 옮긴다. excess 는 갈아탈 자리를 지나친 거리 */
  function turn(i: number, excess: number) {
    const b = to[i];
    const k = plan(i);
    if (k < 0) {
      mode[i] = LEAVING; // 갈 길이 없는 곳(일어나지 않아야 한다)
      return;
    }
    if (mode[i] === HOMING && srcDock[b] >= 0) {
      // 이 노드에 붙은 길 조각에 출구·정류장이 있다
      const d = docks[srcDock[b]];
      endT[i] = d.a === b ? d.t : d.len - d.t;
      dockOf[i] = srcDock[b];
    }
    waitStart[i] = signals && startV[i] < -2 && siteOf(b) >= 0 ? 1 : 0;
    inLanes[i] = inMajor[i] = 255;
    side[i] = nextSide[i];
    off[i] = nextOff[i];
    const m = g.adj[b][k];
    sx[i] = g.nx[b * 2];
    sz[i] = g.nx[b * 2 + 1];
    from[i] = b;
    to[i] = m;
    t[i] = startV[i] + excess;
    aim(i, k);
  }

  /** 신호 묶음 c 에서 방향 h 로 건너기 시작해도 되는가: 초록불이 8초 넘게 남았다(건너는 동안 빨간불이 되지 않게) */
  const green = (c: number, h: number, tod: number) => signals!.greenLeft(c, signals!.groupOf(c, h), tod) > 8;
  /** 신호 교차로 노드 to[i] 앞에서: 건너야 하는데 그 방향이 초록불이 아니면 false */
  function mayCross(i: number, tod: number): boolean {
    const b = to[i];
    const c = siteOf(b);
    if (c < 0) return true;
    const k = plan(i);
    if (k < 0) return true;
    const m = g.adj[b][k];
    const hIn = Math.atan2(g.nx[b * 2 + 1] - sz[i], g.nx[b * 2] - sx[i]);
    const hOut = Math.atan2(g.nx[m * 2 + 1] - g.nx[b * 2 + 1], g.nx[m * 2] - g.nx[b * 2]);
    let d = hOut - hIn;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > 2.8) return true; // 되돌아선다
    // 보도 쪽으로 꺾으면 건너지 않는다. 곧장 가거나 반대쪽으로 꺾으면 먼저 가로지르는 길을 건넌다
    if (Math.abs(d) > Math.PI / 4 && Math.sign(d) === (Math.sign(offWant[i]) || 1)) return true;
    return green(c, hIn, tod);
  }

  /** i 가 지금 자리에 놓이면 0.6m 안에 다른 사람이 있는가 */
  function crowdedAt(i: number): boolean {
    place(i);
    const cx = Math.floor(w.x[i] / 1.5);
    const cz = Math.floor(w.z[i] / 1.5);
    for (let ax = -1; ax <= 1; ax++)
      for (let az = -1; az <= 1; az++)
        for (let j = gridHead[cellKey(cx + ax, cz + az)]; j >= 0; j = gridNext[j])
          if (j !== i && j < w.n && Math.hypot(w.x[j] - w.x[i], w.z[j] - w.z[i]) < 0.6) return true;
    return false;
  }
  /** 걷던 길 조각에서 되돌아선다(같은 쪽 보도를 그대로 쓴다) */
  function turnBack(i: number, len0: number) {
    const a = from[i];
    from[i] = to[i];
    to[i] = a;
    [sx[i], sz[i]] = pos(from[i]);
    t[i] = len0 - t[i];
    side[i] = -side[i];
    off[i] = -off[i];
    dodge[i] = -dodge[i];
    endT[i] = -1;
    waitStart[i] = 0;
    inLanes[i] = inMajor[i] = 255;
    aim(i, g.adj[from[i]].indexOf(to[i]));
  }
  /** 붐비는 길: 앞(1.6m 안, 옆으로 0.6m 안)에 사람이 있으면 늦추고 그 사람을 비켜 옆으로 선다. 0.7m 안으로 붙은 사람과는 옆으로 떨어진다.
   *  둘레 1.5m 안에 사람이 많을수록 느리게 걷는다. 역·건물로 들어가며 사라지는 사람은 비키지 않는다.
   *  걸음 속도에 곱할 값(0.15~1)을 돌려주고 비킨 거리를 고친다 */
  function jostle(i: number, dt: number): number {
    const hx = Math.cos(w.yaw[i]);
    const hz = Math.sin(w.yaw[i]);
    const cx = Math.floor(w.x[i] / 1.5);
    const cz = Math.floor(w.z[i] / 1.5);
    let f = 1;
    let push = 0;
    let near = 0;
    for (let ax = -1; ax <= 1; ax++)
      for (let az = -1; az <= 1; az++)
        for (let j = gridHead[cellKey(cx + ax, cz + az)]; j >= 0; j = gridNext[j]) {
          if (j === i || j >= w.n || mode[j] === LEAVING || mode[j] === BOARDING) continue;
          const dx = w.x[j] - w.x[i];
          const dz = w.z[j] - w.z[i];
          const r2 = dx * dx + dz * dz;
          if (r2 > 2.25) continue;
          near++;
          const along = dx * hx + dz * hz;
          const lat = dz * hx - dx * hz; // off 와 같은 방향(진행 방향 오른쪽)이 +
          const away = lat > 0 || (lat === 0 && w.id[i] & 1) ? -1 : 1;
          if (along > 0 && along < 1.6 && Math.abs(lat) < 0.6) {
            f = Math.min(f, Math.max(0.15, (along - 0.45) / 1.15));
            push += away * (0.6 - Math.abs(lat));
          }
          if (r2 < 0.49) push += away * (0.7 - Math.sqrt(r2)) * 1.5;
        }
    dodge[i] = Math.max(-1.2, Math.min(1.2, dodge[i] + (push * 2.5 - dodge[i] * 0.4) * dt));
    // 걷는 띠 밖으로는 비키지 않는다
    const sg = Math.sign(off[i]) || 1;
    const a = sg * (off[i] + dodge[i]);
    if (a < bandLo[i] - 0.2) dodge[i] = sg * (bandLo[i] - 0.2) - off[i];
    else if (a > bandHi[i] + 0.2) dodge[i] = sg * (bandHi[i] + 0.2) - off[i];
    return Math.min(f, 1 / (1 + 0.1 * near));
  }

  function step(dt: number, now: Now, ambient = true) {
    frame++;
    gridHead.fill(-1);
    for (let i = 0; i < w.n; i++) {
      const k = cellKey(Math.floor(w.x[i] / 1.5), Math.floor(w.z[i] / 1.5));
      gridNext[i] = gridHead[k];
      gridHead[k] = i;
    }
    for (let i = w.n - 1; i >= 0; i--) {
      if (mode[i] === LEAVING) {
        w.fade[i] -= dt * 1.6;
        w.moving[i] = 0;
        if (w.fade[i] <= 0) remove(i);
        continue;
      }
      w.fade[i] = Math.min(1, w.fade[i] + dt * 2.2);
      if (mode[i] === BOARDING) {
        // 버스 문까지 곧장 걸어가서 탄다
        const dx = tx[i] - w.x[i];
        const dz = tz[i] - w.z[i];
        const dd = Math.hypot(dx, dz);
        const d = Math.min(dd, Math.max(1.3, speed[i]) * dt);
        w.moving[i] = 1;
        w.phase[i] += d * 4.6;
        if (dd > 1e-3) w.yaw[i] = Math.atan2(dz, dx);
        w.x[i] += (dx / (dd || 1)) * d;
        w.z[i] += (dz / (dd || 1)) * d;
        if (dd - d < 0.35) mode[i] = LEAVING;
        continue;
      }
      if (mode[i] === WAITING) {
        life[i] -= dt;
        w.moving[i] = 0;
        if (life[i] <= 0) mode[i] = LEAVING; // 오래 기다리면 다른 버스를 탄 셈 친다
        continue;
      }
      if (holdT[i] > 0) {
        holdT[i] -= dt;
        w.photo[i] = Math.min(1, w.photo[i] + dt * 2);
        w.yaw[i] = Math.atan2(faceZ[i] - w.z[i], faceX[i] - w.x[i]);
        w.moving[i] = 0;
        continue;
      }
      w.photo[i] = Math.max(0, w.photo[i] - dt * 2);
      w.moving[i] = 1;
      if (mode[i] === WANDER) {
        life[i] -= dt;
        if (life[i] <= 0) {
          mode[i] = HOMING;
          nextK[i] = -1; // 집 쪽으로 다시 고른다
        }
      }
      plan(i);
      const len0 = Math.hypot(g.nx[to[i] * 2] - sx[i], g.nx[to[i] * 2 + 1] - sz[i]);
      if (signals) {
        let stop = false;
        if (waitStart[i]) {
          // 왼쪽으로 꺾은 뒤 두 번째 횡단보도 앞
          const c = siteOf(from[i]);
          if (c >= 0 && !green(c, Math.atan2(g.nx[to[i] * 2 + 1] - sz[i], g.nx[to[i] * 2] - sx[i]), now.tod)) stop = true;
          else waitStart[i] = 0;
        } else if (endT[i] < 0 && nextK[i] >= 0) {
          // 횡단보도 앞: 사람마다 0~2.7m 뒤에 서서 한 점에 겹치지 않는다. 대기 자리를 지나쳤어도 차도에 들어서기 전이면 신호를 지킨다
          const cb = curb(to[i]) + (w.id[i] % 4) * 0.9;
          if (t[i] >= len0 - cb && t[i] < len0 - curb(to[i]) + 0.3 && len0 > cb + 1 && !mayCross(i, now.tod)) stop = true;
        }
        if (stop) {
          // 횡단보도 앞에서 초록불을 기다린다. 그 자리가 차로 위(비스듬히 만나거나 노드가 여럿인 교차로)면 10m 까지 물러선다
          w.moving[i] = 0;
          place(i);
          for (let back = 0; back < 20 && onLanes?.(w.x[i], w.z[i]); back++) {
            t[i] -= 0.5;
            place(i);
          }
          continue;
        }
      }
      const d = speed[i] * jostle(i, dt) * dt;
      // 신호 교차로 둘레(30m 안)에서 걷던 길이 차로로 들어가면(비스듬히 만나거나 노드가 여럿인 교차로) 그 앞에서 진행 방향 신호를 지킨다.
      // 신호 교차로가 없는 곳에서 큰길 차로 안쪽으로 들어서려 하면(길 중간을 가로지르는 보행로 등) 되돌아선다
      // 차로 확인은 사람마다 세 단계에 한 번(그 사이 걸을 거리까지 앞을 본다). 멈춤은 다음 확인까지 유지한다
      const near = signals && onLanes ? touchOf(from[i], curK[i]) : 0;
      if (near && (frame + i) % 3) {
        if (laneHold[i]) {
          w.moving[i] = 0;
          continue;
        }
      } else if (near) {
        laneHold[i] = 0;
        const nx = w.x[i] + Math.cos(w.yaw[i]) * (d * 3 + 0.4);
        const nz = w.z[i] + Math.sin(w.yaw[i]) * (d * 3 + 0.4);
        const site = siteOf(to[i], true) >= 0 ? siteOf(to[i], true) : siteOf(from[i], true);
        if (near & 1) {
          if (inLanes[i] === 255) inLanes[i] = onLanes!(w.x[i], w.z[i]) ? 1 : 0;
          const ahead = onLanes!(nx, nz) ? 1 : 0;
          if (ahead && !inLanes[i] && site >= 0 && !green(site, w.yaw[i], now.tod)) {
            w.moving[i] = 0;
            laneHold[i] = 1;
            continue;
          }
          inLanes[i] = ahead;
        }
        if (near & 2 && onMajor) {
          if (inMajor[i] === 255) inMajor[i] = onMajor(w.x[i], w.z[i]) ? 1 : 0;
          const ahead = onMajor(nx, nz) ? 1 : 0;
          if (ahead && !inMajor[i] && site < 0) {
            turnBack(i, len0);
            place(i);
            continue;
          }
          inMajor[i] = ahead;
        }
      }
      t[i] += d;
      w.phase[i] += d * 4.6;
      off[i] += Math.max(-dt * 1.4, Math.min(dt * 1.4, offWant[i] - off[i]));
      if (endT[i] >= 0 && t[i] >= endT[i]) {
        // 출구·정류장에 닿았다
        t[i] = endT[i];
        place(i);
        if (docks[dockOf[i]].kind === 'stop') {
          // 먼저 온 사람 뒤에 줄을 선다: 정류장 자리에서 길 조각 안쪽(더 긴 쪽)으로 QUEUE_GAP 씩 물러난다
          const n = waitingOn(dockOf[i]);
          if (n >= 12) mode[i] = LEAVING; // 줄이 너무 길면 다른 길로 간 셈 친다
          else {
            mode[i] = WAITING;
            w.moving[i] = 0;
            life[i] = MAX_WAIT * (0.5 + rand() * 0.5);
            const dk = docks[dockOf[i]];
            const [ax, az] = pos(dk.a);
            const [bx, bz] = pos(dk.b);
            const dir = (dk.t < dk.len / 2 ? 1 : -1) / (dk.len || 1);
            w.x[i] += (bx - ax) * dir * n * QUEUE_GAP;
            w.z[i] += (bz - az) * dir * n * QUEUE_GAP;
            w.yaw[i] += (Math.sign(off[i]) || 1) * (Math.PI / 2); // 찻길 쪽을 본다
          }
        } else if (docks[dockOf[i]].door) {
          // 건물 문으로 걸어 들어간다
          mode[i] = BOARDING;
          [tx[i], tz[i]] = docks[dockOf[i]].door!;
        } else mode[i] = LEAVING;
        endT[i] = -1;
        continue;
      }
      if (nextK[i] === -2 && t[i] >= len0) mode[i] = LEAVING; // 갈 길이 없는 곳(일어나지 않아야 한다)
      else if (nextK[i] >= 0 && t[i] >= len0 + turnU[i]) turn(i, t[i] - len0 - turnU[i]);
      place(i);
      if (alightT[i] > 0) {
        alightT[i] = Math.max(0, alightT[i] - dt);
        lift(i);
      }
    }
    if (!ambient || !docks.length) return;
    // 구역마다 화면 인원을 그 구역 인구에 맞춘다. 모자라면 그 구역 출구·정류장에서 지하철·버스로 막 도착한 사람처럼 나오고
    // (한 구역에서 1초에 목표의 1/40, 적어도 2명까지), 넘치면 그 구역 사람 몇 명을 일찍 들여보낸다
    const want = zoneTargets(provider, now, max);
    // 나이대·성별 비율을 구역마다 새로 읽는다
    const areas = provider.areas(now);
    const avg = [0, 0, 0, 0];
    let fem = 0;
    let cnt = 0;
    ZONE_IDS.forEach((id, z) => {
      const a = areas.find((q) => q.id === id);
      if (!a) return;
      const g4 = [a.ages[0], a.ages[1] + a.ages[2], a.ages[3] + a.ages[4] + a.ages[5], a.ages[6] + a.ages[7]];
      const sum = g4.reduce((x, y) => x + y, 0) || 1;
      let c = 0;
      looks[z] = { ages: g4.map((v) => (c += v / sum)), female: a.female / 100 };
      g4.forEach((v, k) => (avg[k] += v / sum));
      fem += a.female / 100;
      cnt++;
    });
    if (cnt) {
      let c = 0;
      looks[ZONE_IDS.length] = { ages: avg.map((v) => (c += v / cnt)), female: fem / cnt };
    }
    const have = new Array<number>(want.length).fill(0);
    for (let i = 0; i < w.n; i++) if (mode[i] !== LEAVING) have[home[i]]++;
    for (let z = 0; z < want.length; z++) {
      short[z] = want[z] - have[z];
      if (!docksIn[z].length) continue;
      budget[z] = Math.min(8, budget[z] + dt * Math.max(2, want[z] / 40));
      while (have[z] < want[z] && budget[z] >= 1 && w.n < max) {
        spawnAt(docksIn[z][pick(dockW[z], rand())]);
        have[z]++;
        budget[z]--;
      }
      if (have[z] > want[z] * 1.15 + 5)
        for (let k = 0; k < 2; k++) {
          const i = Math.floor(rand() * w.n);
          if (home[i] === z && mode[i] === WANDER) life[i] = 0;
        }
    }
  }

  return { w, step, burst, alight, board, waitingAt, hold, docks, dockPoint };
}
