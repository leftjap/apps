// 보행자. 걷는 길 그래프(walknet.ts: 보도 면 안의 보도 선, 골목, 보행로) 위를 걷는다. 사람은 역 출구·버스 정류장·건물 문에서만 나타나고 사라진다.
// 나타날 때는 출구·정류장이 붙은 선에서 걷기 시작하고, 한동안 돌아다니다가 가장 가까운 출구·정류장으로 걸어가 들어간다
// (정류장에서는 버스가 올 때까지 기다렸다가 탄다). 큰길은 그래프에 건너는 선이 없어 횡단보도 연결로만 건넌다:
// 연결의 노드에 닿으면 보도 쪽 기다리는 자리로 가서 신호·차를 보고, 축을 따라 건너편 기다리는 자리로 건너 그쪽 선으로 나온다.
import type { Now } from './clock.ts';
import { clamp01, commute, daytime, nightlife } from './curves.ts';
import type { Road } from '../data/board.ts';
import { ISLAND_BACK, ISLAND_L } from './graph.ts';
import type { CrossLink, WalkGraph } from './walknet.ts';
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
  /** 중앙버스정류장: (x, z)는 버스가 서는 자리(승강장 가운데에서 버스 진행 방향으로 ISLAND_BACK 앞), yaw 는 버스 진행 방향(승강장은 버스 오른쪽) */
  median?: boolean;
  yaw?: number;
}

/** 중앙버스정류장으로 건너가는 자리: 승강장을 지나는 횡단보도 연결과 그 이쪽 보도 끝(e), 축 위 승강장 자리(i),
 *  승강장 가운데(c)와 버스 진행 방향(u), 승강장 가운데에서 i 까지 진행 방향 거리(s) */
interface Island {
  l: number;
  ex: number;
  ez: number;
  ix: number;
  iz: number;
  cx: number;
  cz: number;
  ux: number;
  uz: number;
  s: number;
}

/** 구역 id → 판 위의 중심과 반지름(m). 실시간 도시데이터 장소의 대략적인 범위. 겹치는 곳은 작은 구역이 먼저다 */
export const ZONES: Record<string, [number, number, number]> = {
  'hongik-stn': [573, -643, 260],
  hapjeong: [-470, 240, 300],
  mangwon: [-1560, 120, 300],
  yeonnam: [300, -1050, 420],
  hongdae: [350, -250, 520],
};
export const ZONE_IDS = Object.keys(ZONES);

/** 하루 가운데 밖에 나와 다니는 정도(0~1). 새벽에는 대부분 실내에 있다 */
const outdoors = (now: Now) => clamp01(0.05 + 0.95 * Math.max(daytime(now.tod), nightlife(now.tod), 0.8 * commute(now.tod)));
/** 구역 인구 가운데 밖에 나와 걷는 사람 비율(가정한 값). 가게·집 안에 있는 사람이 대부분인 상업지와 달리 공원은 대부분 밖에 있다 */
const OUT_SHARE: Record<string, number> = { mangwon: 0.3 };

/** 비(0~1)가 올 때 밖에 남는 비율: 거리는 우산을 쓰고 다니는 사람이 남지만, 한강공원은 거의 비운다(가정한 값) */
const RAIN_KEEP: Record<string, number> = { mangwon: 0.15 };
const rainKeep = (id: string, rain: number) => 1 - (1 - (RAIN_KEEP[id] ?? 0.6)) * clamp01(rain);

/** 구역마다 지금 밖에 나와 걷는 실제 사람 수. 마지막 칸은 구역 밖 출구·정류장 둘레의 사람(구역 인원의 12%) */
function outside(provider: DataProvider, now: Now, rain = 0): number[] {
  const act = outdoors(now);
  const pop: Record<string, number> = {};
  for (const a of provider.areas(now)) pop[a.id] = (a.pplMin + a.pplMax) / 2;
  const t = ZONE_IDS.map((id) => (pop[id] ?? 0) * (OUT_SHARE[id] ?? 0.12) * act * rainKeep(id, rain));
  t.push(t.reduce((a, b) => a + b, 0) * 0.12);
  return t;
}
/** 화면 1명이 실제 몇 명인가. 상한 안이면 1, 넘치면 모든 구역을 같은 배율로 줄인다 */
export function walkerScale(provider: DataProvider, now: Now, max: number, rain = 0): number {
  return Math.max(1, outside(provider, now, rain).reduce((a, b) => a + b, 0) / max);
}
/** 구역마다 지금 화면에 있어야 할 사람 수: 구역 인구에 비례하므로 인구 밀도가 높은 구역일수록 빽빽하다 */
export function zoneTargets(provider: DataProvider, now: Now, max: number, rain = 0): number[] {
  const k = walkerScale(provider, now, max, rain);
  return outside(provider, now, rain).map((v) => v / k);
}

/** 지금 화면에 있어야 할 보행자 수 */
export function walkerTarget(provider: DataProvider, now: Now, max: number, rain = 0): number {
  return Math.min(max, Math.round(zoneTargets(provider, now, max, rain).reduce((a, b) => a + b, 0)));
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

/** 출구·정류장이 붙은 선: a→b 위 t(m) 지점. lat 은 선에서 a→b 오른쪽으로 떨어진 거리(걷는 띠 안에서 출구·정류장에 가장 가까운 자리), side 는 출구·정류장이 선의 오른쪽(+1)·왼쪽(−1) */
interface Dock extends Portal {
  a: number;
  b: number;
  t: number;
  len: number;
  lat: number;
  side: number;
  /** 구역 번호(ZONE_IDS 순서, 구역 밖이면 ZONE_IDS.length) */
  zone: number;
  /** 건물 출입구: 건물 벽 위 문 자리와 드나드는 사람의 몫(바닥 넓이 × 층수) */
  door?: [number, number];
  weight?: number;
  /** 중앙버스정류장으로 건너가는 자리 */
  island?: Island;
}

const WANDER = 0;
const HOMING = 1;
const WAITING = 2;
const LEAVING = 3;
const BOARDING = 4; // 버스 문으로 걸어가는 중
const MAX_WAIT = 300; // 정류장에서 버스를 기다리는 가장 긴 시간(초)
const QUEUE_GAP = 1.5; // 정류장 줄에서 앞뒤 사람 사이(m). 사람을 실제보다 키워 그리므로 넉넉하게 둔다
const ALIGHT_T = 1.6; // 버스 문에서 보도까지 걸어 나오는 시간(초)
const HURRY = 2; // 초록불이 모자라 서둘러 건널 때 가장 빠른 걸음(m/s)
const TURN_RATE = 7; // 몸 방향이 1초에 도는 가장 큰 각(라디안). 모퉁이·되돌아서기에서 한 프레임에 확 꺾이지 않게

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
  cross: {
    /** 횡단보도마다 지금 사람이 건너고 있는 자리: 축을 E0 쪽 끝부터 2m 칸으로 나눈 비트(차가 보고 선다) */
    busy?: Uint32Array;
    /** 신호 없는 횡단보도로 차가 다가오는가 */
    traffic?: (l: CrossLink) => boolean;
  } = {},
) {
  const links = { list: g.links, at: g.linkAt };
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
  const side = new Float32Array(max); // -1~1: 걷는 띠의 오른쪽(+)·왼쪽(−) 절반 가운데 어디를, 띠 가운데에서 얼마나 바깥으로 걷는가
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
  // 횡단보도: 노드 to[i] 에서 건널 연결(−1 이면 건너지 않는다)과 건넌 뒤 나올 노드. 건너는 상태는 0 아님, 1 이쪽 기다리는 자리(N)로 걸어감,
  // 2 N 에서 기다림, 3 축을 따라 건너편 기다리는 자리(F)로 건넘, 4 F 에서 나갈 선의 자리(D)로 걸어감
  const nextX = new Int32Array(max).fill(-1);
  const nextDep = new Int32Array(max);
  const xing = new Uint8Array(max);
  const xLink = new Int32Array(max);
  const xNx = new Float32Array(max);
  const xNz = new Float32Array(max);
  const xFx = new Float32Array(max);
  const xFz = new Float32Array(max);
  const xDx = new Float32Array(max);
  const xDz = new Float32Array(max);
  const marked: number[] = []; // 지난 단계에 건너는 자리를 표시한 횡단보도
  const tx = new Float32Array(max); // 버스 문(타러 걸어가는 곳)
  const tz = new Float32Array(max);
  const ox = new Float32Array(max); // 버스에서 막 내린 사람: 보도 자리에서 버스 문까지(줄어들어 0이 된다)
  const oz = new Float32Array(max);
  const alightT = new Float32Array(max);
  const dodge = new Float32Array(max); // 앞사람을 비켜 옆으로 옮긴 거리(m, off 와 같은 방향)
  const curK = new Int32Array(max); // 지금 걷는 선: 노드 from 의 이웃 번호
  const head = new Float32Array(max); // 걷는 방향(판단에 쓴다). 그려지는 몸 방향(w.yaw)은 이쪽으로 TURN_RATE 만큼씩 돈다
  const queued = new Uint8Array(max); // 신호를 기다리는 사람 뒤에 줄을 서서 멈췄다
  const xSlot = new Uint8Array(max); // 횡단보도 앞에서 빈자리를 찾아 옮겨 간 횟수
  // 건너는 길: 이쪽 기다리는 자리(N) → 이쪽 칠 끝(A) → 건너편 칠 끝(B) → 건너편 기다리는 자리(F). xLeg 는 지금 가는 자리(0 A, 1 B, 2 F)
  const xLeg = new Uint8Array(max);
  const xAx = new Float32Array(max);
  const xAz = new Float32Array(max);
  const xBx = new Float32Array(max);
  const xBz = new Float32Array(max);
  const xLat = new Float32Array(max); // 횡단보도에서 축 오른쪽으로 비켜 걷는 거리(m)
  const xSpd = new Float32Array(max); // 찻길을 건너는 동안의 걸음(m/s). 초록불이 모자라면 서둘러 걷는다
  // 중앙버스정류장 오가기: 1 승강장으로 감, 2 승강장에서 보도로 나옴. 네 자리(rx·rz 의 0~3)를 차례로 걷는다(rLeg).
  // rLeg 1 을 시작하기 전에 신호·차를 보고(rHold), rCross 번째 구간이 찻길을 건너는 구간이다.
  // 승강장은 버스 쪽 가장자리에 줄을 서고, 반대쪽 가장자리로 걸어 다닌다
  const rt = new Uint8Array(max);
  const rLeg = new Uint8Array(max);
  const rHold = new Uint8Array(max);
  const rCross = new Uint8Array(max);
  const rLink = new Int32Array(max);
  const rx = [0, 1, 2, 3].map(() => new Float32Array(max));
  const rz = [0, 1, 2, 3].map(() => new Float32Array(max));
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
  // 중앙버스정류장은 승강장을 지나는 횡단보도(축이 승강장 가운데선과 만나는 자리가 승강장 끝에서 20m 안인 것 가운데 가장 가까운 것)의
  // 양 끝 보도에 같은 정류장으로 건너가는 자리 둘을 붙인다. 그런 횡단보도가 없으면 그 정류장은 쓰지 않는다
  const places: (Portal & { island?: Island })[] = [];
  for (const p of portals) {
    if (!p.median) {
      places.push(p);
      continue;
    }
    const ux = Math.cos(p.yaw ?? 0);
    const uz = Math.sin(p.yaw ?? 0);
    const cx = p.x - ux * ISLAND_BACK;
    const cz = p.z - uz * ISLAND_BACK;
    let best: { l: number; s: number; la: number } | null = null;
    links.list.forEach((l, li) => {
      const la = Math.hypot(l.bx - l.ax, l.bz - l.az) || 1;
      const vx = (l.bx - l.ax) / la;
      const vz = (l.bz - l.az) / la;
      const den = ux * vz - uz * vx;
      if (Math.abs(den) < 0.8) return; // 승강장과 비스듬히 0~53° 로 만나는 축은 승강장을 건너지 않는다
      const wx = l.ax - cx;
      const wz = l.az - cz;
      const s = (wx * vz - wz * vx) / den;
      const t = (wx * uz - wz * ux) / den;
      if (t < 1 || t > la - 1 || Math.abs(s) > ISLAND_L / 2 + 20) return;
      if (!best || Math.abs(s) < Math.abs(best.s)) best = { l: li, s, la };
    });
    if (!best) continue;
    const { l: li, s } = best;
    const l = links.list[li];
    const base = { l: li, ix: cx + ux * s, iz: cz + uz * s, cx, cz, ux, uz, s };
    places.push({ ...p, x: l.pax, z: l.paz, island: { ...base, ex: l.pax, ez: l.paz } });
    places.push({ ...p, x: l.pbx, z: l.pbz, island: { ...base, ex: l.pbx, ez: l.pbz } });
  }
  const docks: Dock[] = [];
  for (const p of places) {
    // 가장 가까운 선. 걷는 띠 안에서 출구·정류장에 가장 가까운 자리에 붙는다
    const hit = g.nearestEdge(p.x, p.z);
    if (!hit) continue;
    const [a, kb, tt] = hit;
    const b = g.adj[a][kb];
    const [ax, az] = pos(a);
    const [bx, bz] = pos(b);
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const right = (p.x - ax) * (-(bz - az) / len) + (p.z - az) * ((bx - ax) / len);
    const [lo, hi] = g.band[a][kb];
    const best: Dock = { ...p, a, b, t: tt, len, lat: Math.max(lo, Math.min(hi, right)), side: right >= 0 ? 1 : -1, zone: zoneOf(p.x, p.z) };
    if (p.poly) {
      // 건물 출입구: 보도 자리에서 가장 가까운 벽 위 점이 문이다. 길에서 20m 넘게 떨어진 건물은 빼고, 드나드는 몫은 바닥 넓이 × 층수
      docks.push(best);
      const s = dockPoint(docks.length - 1);
      docks.pop();
      const door = nearestOnPoly(p.poly, s.x, s.z);
      const dd = Math.hypot(door[0] - s.x, door[1] - s.z);
      if (dd > 20) continue;
      // 문턱: 벽에서 보도 쪽으로 0.5m 나온 자리에서 나타나고 사라진다
      const out = Math.min(0.5, dd / 2) / (dd || 1);
      best.door = [door[0] + (s.x - door[0]) * out, door[1] + (s.z - door[1]) * out];
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
  let rain = 0;

  // ── 집으로 가는 길: 모든 출구·정류장에서 거꾸로 퍼진 최단 거리 D(노드)는 그 노드에서 출구·정류장까지 걸을 거리다.
  //    큰길은 그래프에 건너는 선이 없으므로 횡단보도 연결(한 번에 CROSS_COST 를 더한다)로만 건너간다 ──
  const N = g.adj.length;
  const eBase = new Int32Array(N + 1);
  for (let n = 0; n < N; n++) eBase[n + 1] = eBase[n] + g.adj[n].length;
  /** 선마다(노드 a 의 이웃 k: eBase[a] + k) 그 선에 붙은 출구·정류장 [번호, a 에서 거리] */
  const docksOn = new Map<number, [number, number][]>();
  const segLen = (a: number, b: number) => Math.hypot(g.nx[b * 2] - g.nx[a * 2], g.nx[b * 2 + 1] - g.nx[a * 2 + 1]);
  /** 횡단보도 연결 l 을 E0 쪽(fromA) 또는 E1 쪽에서 건널 때: 이쪽 노드·기다리는 자리와 건너편 노드·기다리는 자리 */
  const ends = (l: CrossLink, fromA: boolean) =>
    fromA ? { near: l.na, nx: l.pax, nz: l.paz, dep: l.nb, fx: l.pbx, fz: l.pbz } : { near: l.nb, nx: l.pbx, nz: l.pbz, dep: l.na, fx: l.pax, fz: l.paz };
  const span = (l: CrossLink) => Math.hypot(l.pbx - l.pax, l.pbz - l.paz);
  const CROSS_COST = 12; // 신호·차를 기다리는 몫(m)
  const D = new Float64Array(N).fill(Infinity);
  {
    const h = heap();
    const seed = (n: number, d: number) => {
      if (d < D[n]) (D[n] = d), h.push(d, n);
    };
    docks.forEach((d, i) => {
      const ka = g.adj[d.a].indexOf(d.b);
      const kb = g.adj[d.b].indexOf(d.a);
      for (const [a, k, t] of [
        [d.a, ka, d.t],
        [d.b, kb, d.len - d.t],
      ] as const) {
        if (k < 0) continue;
        const key = eBase[a] + k;
        (docksOn.get(key) ?? docksOn.set(key, []).get(key)!).push([i, t]);
        seed(a, t);
      }
    });
    while (h.size) {
      const [dist, n] = h.pop();
      if (dist > D[n]) continue;
      g.adj[n].forEach((m, k) => {
        if (g.aw[n][k] > 0) seed(m, dist + segLen(n, m));
      });
      for (const li of links.at.get(n) ?? []) {
        const l = links.list[li];
        seed(l.na === n ? l.nb : l.na, dist + span(l) + CROSS_COST);
      }
    }
  }
  /** 노드 a 에서 이웃 k 쪽 선으로 들어서서 출구·정류장까지 걸을 거리 */
  const edgeCost = (a: number, k: number) => {
    let c = segLen(a, g.adj[a][k]) + D[g.adj[a][k]];
    for (const [, at] of docksOn.get(eBase[a] + k) ?? []) c = Math.min(c, at);
    return c;
  };

  /** 노드 a 에서 이웃 k 쪽으로 걸을 때 걸을 자리(선에서 진행 방향 오른쪽으로 떨어진 거리): 걷는 띠 가운데에서 sd × 띠 반폭만큼 */
  function offFor(a: number, k: number, sd: number) {
    const [lo, hi] = g.band[a][k];
    return (lo + hi) / 2 + (sd * (hi - lo)) / 2;
  }
  function aim(i: number, k: number) {
    curK[i] = k;
    offWant[i] = offFor(from[i], k, side[i]);
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
    head[i] = Math.atan2(dz, dx);
    return len;
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
    // 우측통행: 열에 아홉은 걷는 띠의 오른쪽 절반을 걷는다. 처음에는 출구·정류장 자리에서 나와 제자리로 옮겨 간다(거꾸로 걸으면 오른쪽·왼쪽이 바뀐다)
    side[i] = (rand() < 0.9 ? 1 : -1) * (0.1 + rand() * 0.9);
    const k = g.adj[from[i]].indexOf(to[i]);
    aim(i, k);
    off[i] = forward ? d.lat : -d.lat;
    dodge[i] = 0;
    // 이미 사람이 서 있는 자리면 조금 앞으로 나와 선다(한 자리에 겹쳐 나오지 않게)
    for (let tries = 0; tries < 4 && crowdedAt(i); tries++) t[i] = Math.min(d.len, t[i] + 0.8);
    speed[i] = 1.0 + rand() * 0.55;
    life[i] = 150 + rand() * 350; // 구역 안쪽 골목까지 걸어 들어갈 만큼
    mode[i] = WANDER;
    endT[i] = -1;
    dockOf[i] = -1;
    holdT[i] = 0;
    xing[i] = 0;
    nextX[i] = -1;
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
    queued[i] = 0;
    rt[i] = 0;
    place(i);
    w.yaw[i] = head[i];
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
    for (const a of [from, to, sx, sz, t, speed, off, offWant, side, life, mode, endT, dockOf, holdT, faceX, faceZ, nextK, turnU, startV, nextOff, nextSide, nextX, nextDep, xing, xLink, xNx, xNz, xFx, xFz, xDx, xDz, xLeg, xAx, xAz, xBx, xBz, home, tx, tz, ox, oz, alightT, dodge, curK, head, queued, xSlot, xLat, xSpd, rt, rLeg, rHold, rCross, rLink, ...rx, ...rz, w.x, w.z, w.yaw, w.phase, w.fade, w.tint, w.id, w.photo, w.moving, w.age, w.female])
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
      const dk = ds[Math.floor(rand() * ds.length)];
      const i = spawnAt(dk);
      if (i < 0) return;
      const isl = docks[dk].island;
      if (isl) {
        // 중앙버스정류장: 버스 문 쪽 승강장 가장자리에 내려 승강장을 따라 횡단보도 자리로 가고, 신호를 기다렸다가
        // 나머지를 건너 이쪽 보도 끝으로, 그다음 보도 자리(지금 놓인 자리)로 간다
        const sd = (doorX - isl.cx) * isl.ux + (doorZ - isl.cz) * isl.uz + (k - (count - 1) / 2) * 0.8;
        const [px, pz] = [w.x[i], w.z[i]];
        [w.x[i], w.z[i]] = islandAt(isl, sd, -0.55);
        // 승강장 걷는 쪽에서 신호를 기다릴 빈자리 → 축 위 승강장 자리(건너는 방향 오른쪽으로 비켜) → 이쪽 보도 끝 → 보도 자리
        const [cx, cz] = crossPair(isl.ix, isl.iz, isl.ex, isl.ez);
        startRoute(i, 2, isl, [waitSpot(i, isl), [cx[0], cz[0]], [cx[1], cz[1]], [px, pz]], 2);
        continue;
      }
      // 버스 문에서 보도 자리까지 ALIGHT_T 초 동안 걸어 나온다(사람마다 조금씩 늦게)
      ox[i] = doorX - w.x[i];
      oz[i] = doorZ - w.z[i];
      alightT[i] = ALIGHT_T + k * 0.5;
      lift(i);
    }
  }
  /** 중앙버스정류장 오가기를 시작한다. pts 네 자리를 차례로 걷고, cross 번째 구간이 찻길을 건넌다(그 앞 구간을 시작하기 전에 신호를 본다) */
  function startRoute(i: number, kind: number, isl: Island, pts: [number, number][], cross: number) {
    rt[i] = kind;
    rLeg[i] = 0;
    rHold[i] = 0;
    rCross[i] = cross;
    rLink[i] = isl.l;
    pts.forEach(([x, z], k) => ((rx[k][i] = x), (rz[k][i] = z)));
  }
  /** 승강장 위 자리: 승강장 가운데선에서 진행 방향으로 sd, 버스 쪽(왼쪽)으로 lat. 승강장 길이 안으로 자른다 */
  const islandAt = (isl: Island, sd: number, lat: number): [number, number] => {
    const c = Math.max(-ISLAND_L / 2 + 0.5, Math.min(ISLAND_L / 2 - 0.5, sd));
    return [isl.cx + isl.ux * c + isl.uz * lat, isl.cz + isl.uz * c - isl.ux * lat];
  };
  /** 횡단보도 축 위 두 점 a → b 를 건너는 방향 오른쪽으로 0.7m 비킨 두 점(우측통행) */
  const crossPair = (ax: number, az: number, bx: number, bz: number): [number[], number[]] => {
    const l = Math.hypot(bx - ax, bz - az) || 1;
    const ox = (-(bz - az) / l) * 0.7;
    const oz = ((bx - ax) / l) * 0.7;
    return [
      [ax + ox, bx + ox],
      [az + oz, bz + oz],
    ];
  };
  /** 승강장에서 줄 설 자리: 축 위 승강장 자리에서 승강장 가운데 쪽으로, 먼저 와 기다리거나 줄 자리로 가는 사람 수만큼 QUEUE_GAP 씩, 버스 쪽 가장자리 */
  function islandSpot(i: number, isl: Island): number {
    const key = docks[dockOf[i]].key;
    let n = 0;
    for (let j = 0; j < w.n; j++) if (j !== i && docks[dockOf[j]]?.key === key && (mode[j] === WAITING || (rt[j] === 1 && rLeg[j] >= 2))) n++;
    return isl.s + (isl.s > 0 ? -1 : 1) * (1.2 + n * QUEUE_GAP);
  }
  /** 내린 사람이 신호를 기다릴 승강장 걷는 쪽 빈자리: 축 위 승강장 자리에서 가운데 쪽으로 1.2m 부터 0.75m 씩 */
  function waitSpot(i: number, isl: Island): [number, number] {
    const dir = isl.s > 0 ? -1 : 1;
    let first: [number, number] | null = null;
    for (let m = 0; m < 8; m++)
      for (const lat of [-0.55, 0.05]) {
        const p = islandAt(isl, isl.s + dir * (1.2 + m * 0.75), lat);
        first ??= p;
        let taken = !freeAt(i, p[0], p[1]);
        for (let j = 0; j < w.n && !taken; j++) if (j !== i && rt[j] === 2 && rLeg[j] === 0 && Math.hypot(rx[0][j] - p[0], rz[0][j] - p[1]) < 0.7) taken = true;
        if (!taken) return p;
      }
    return first!;
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
  /** k번 출구·정류장에서 사람이 서는 자리(걷는 띠 안에서 출구·정류장에 가장 가까운 자리)와, 찻길(정류장 쪽)에서 멀어지는 쪽이 +z 가 되는 방향 */
  function dockPoint(k: number): { x: number; z: number; yaw: number } {
    const d = docks[k];
    const [ax, az] = pos(d.a);
    const [bx, bz] = pos(d.b);
    const dx = (bx - ax) / (d.len || 1);
    const dz = (bz - az) / (d.len || 1);
    const o = d.lat;
    const h = Math.atan2(dz, dx);
    return { x: ax + dx * d.t - dz * o, z: az + dz * d.t + dx * o, yaw: d.side > 0 ? h + Math.PI : h };
  }
  /** 정류장 줄의 n번째 자리: 정류장 자리에서 선을 따라 더 긴 쪽으로 n × QUEUE_GAP. 선 끝에서는 가장 곧게 이어지는 선으로 넘어가고,
   *  옆으로는 걷는 띠 안 정류장 쪽 자리(lat)에 선다 */
  function queueSpot(dk: Dock, n: number): [number, number] {
    let p = dk.t < dk.len / 2 ? dk.a : dk.b;
    let q = p === dk.a ? dk.b : dk.a;
    let s = p === dk.a ? dk.t : dk.len - dk.t;
    const lat = p === dk.a ? dk.lat : -dk.lat;
    let left = n * QUEUE_GAP;
    for (let guard = 0; ; guard++) {
      const L = segLen(p, q) || 1;
      const ux = (g.nx[q * 2] - g.nx[p * 2]) / L;
      const uz = (g.nx[q * 2 + 1] - g.nx[p * 2 + 1]) / L;
      let next = -1;
      if (s + left > L && guard < 20) {
        let best = -2;
        g.adj[q].forEach((m, k) => {
          if (m === p || g.kind[q][k] === 3) return;
          const c = ((g.nx[m * 2] - g.nx[q * 2]) * ux + (g.nx[m * 2 + 1] - g.nx[q * 2 + 1]) * uz) / (segLen(q, m) || 1);
          if (c > best) (best = c), (next = m);
        });
      }
      if (next < 0) {
        const d = Math.min(L, s + left);
        const [lo, hi] = g.band[p][g.adj[p].indexOf(q)];
        const o = Math.max(lo, Math.min(hi, lat));
        return [g.nx[p * 2] + ux * d - uz * o, g.nx[p * 2 + 1] + uz * d + ux * o];
      }
      left -= L - s;
      p = q;
      q = next;
      s = 0;
    }
  }
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

  /** 노드 to[i] 에 닿으면 갈 길을 미리 고르고, 모퉁이에서 갈아탈 자리(횡단보도를 건너면 그 양 끝)를 계산한다.
   *  이 노드에서 나가는 선과, 이 노드에 닿은 횡단보도 연결을 건너 건너편 노드에서 나가는 선 가운데 고른다 */
  function plan(i: number): number {
    if (nextK[i] !== -1) return nextK[i];
    const b = to[i];
    const nb = g.adj[b];
    const moves: { k: number; x: number; fromA: boolean; dep: number }[] = [];
    for (let k = 0; k < nb.length; k++) if (g.aw[b][k] > 0) moves.push({ k, x: -1, fromA: true, dep: b });
    for (const li of links.at.get(b) ?? []) {
      const l = links.list[li];
      const fromA = l.na === b;
      const dep = fromA ? l.nb : l.na;
      g.adj[dep].forEach((_, km) => g.aw[dep][km] > 0 && moves.push({ k: km, x: li, fromA, dep }));
    }
    let j = -1;
    if (mode[i] === HOMING) {
      let best = Infinity;
      moves.forEach((mv, q) => {
        let c = edgeCost(mv.dep, mv.k);
        if (mv.x >= 0) c += span(links.list[mv.x]) + CROSS_COST;
        if (c < best) (best = c), (j = q);
      });
      if (!Number.isFinite(best)) j = -1;
    } else {
      // 나온 구역 밖으로 멀어지는 길은 거의 고르지 않는다(구역 밖 사람은 어디로든 간다). 횡단보도가 있으면 열에 서넛은 건넌다
      const z = home[i];
      const [cx, cz, r] = z < ZONE_IDS.length ? ZONES[ZONE_IDS[z]] : [0, 0, Infinity];
      const db = Math.hypot(g.nx[b * 2] - cx, g.nx[b * 2 + 1] - cz);
      const ws = moves.map((mv) => {
        const m = g.adj[mv.dep][mv.k];
        if (mv.x < 0 && m === from[i] && moves.length > 1) return 0;
        const v = g.aw[mv.dep][mv.k];
        const dn = Math.hypot(g.nx[m * 2] - cx, g.nx[m * 2 + 1] - cz);
        return dn > r && dn > db ? v * 0.04 : v;
      });
      let wn = 0;
      let wx = 0;
      moves.forEach((mv, q) => (mv.x < 0 ? (wn += ws[q]) : (wx += ws[q])));
      if (wn > 0 && wx > 0) moves.forEach((mv, q) => mv.x >= 0 && (ws[q] *= (wn * 0.5) / wx));
      j = pick(ws, rand());
    }
    if (j < 0) return (nextK[i] = -2);
    const mv = moves[j];
    const [bx, bz] = pos(b);
    let ax = bx - sx[i];
    let az = bz - sz[i];
    const la = Math.hypot(ax, az) || 1;
    ax /= la;
    az /= la;
    const dep = mv.dep;
    const [dx0, dz0] = pos(dep);
    const [mx, mz] = pos(g.adj[dep][mv.k]);
    let cx = mx - dx0;
    let cz = mz - dz0;
    const lc = Math.hypot(cx, cz) || 1;
    cx /= lc;
    cz /= lc;
    const sd = side[i];
    const o2 = offFor(dep, mv.k, sd);
    let u = 0;
    let v = 0;
    nextX[i] = mv.x;
    nextDep[i] = dep;
    if (mv.x >= 0) {
      // 이 노드에서 이쪽 기다리는 자리(N)로 가서 건너편 기다리는 자리(F)로 건너고, 나갈 선의 시작 자리(D)로 간다
      const en = ends(links.list[mv.x], mv.fromA);
      xNx[i] = en.nx;
      xNz[i] = en.nz;
      xFx[i] = en.fx;
      xFz[i] = en.fz;
      xDx[i] = dx0 - cz * o2;
      xDz[i] = dz0 + cx * o2;
      nextOff[i] = o2;
    } else {
      const back = g.adj[dep][mv.k] === from[i] && dep === b;
      const crs = ax * cz - az * cx;
      if (Math.abs(crs) > 0.3) {
        // 지금 보도 선(노드 + n1·o1 + a·u)과 다음 보도 선(노드 + n2·o2 + c·v)이 만나는 점. n = 진행 방향 오른쪽
        const o1 = offWant[i];
        const wx = -cz * o2 + az * o1;
        const wz = cx * o2 - ax * o1;
        u = Math.max(-0.8 * la, Math.min(25, (wx * cz - wz * cx) / crs));
        v = Math.max(-25, Math.min(0.8 * lc, (wx * az - wz * ax) / crs));
      }
      nextOff[i] = back ? -off[i] : Math.abs(crs) > 0.3 ? o2 : off[i];
    }
    turnU[i] = u;
    startV[i] = v;
    nextSide[i] = sd;
    return (nextK[i] = mv.k);
  }

  /** 노드 b 에서 이웃 k 쪽 조각으로 나간다. 집에 가는 길이면 이 조각 이쪽 보도에 붙은 출구·정류장에 들어간다 */
  function depart(i: number, b: number, k: number, tStart: number) {
    side[i] = nextSide[i];
    off[i] = nextOff[i];
    sx[i] = g.nx[b * 2];
    sz[i] = g.nx[b * 2 + 1];
    from[i] = b;
    to[i] = g.adj[b][k];
    t[i] = tStart;
    aim(i, k);
    endT[i] = -1;
    if (mode[i] === HOMING) homeHere(i);
  }
  /** 지금 걷는 선 앞쪽에 출구·정류장이 있으면 거기로 들어간다(걷는 띠 안 출구·정류장 쪽 자리로 옮겨 가며 다가간다) */
  function homeHere(i: number) {
    const list = docksOn.get(eBase[from[i]] + curK[i]);
    if (!list) return;
    let best = Infinity;
    for (const [di, at] of list)
      if (at >= t[i] - 1 && at < best) {
        best = at;
        endT[i] = at;
        dockOf[i] = di;
        offWant[i] = docks[di].a === from[i] ? docks[di].lat : -docks[di].lat;
      }
  }

  /** 갈아탈 자리에 닿았다: 미리 고른 다음 구간으로 옮긴다(횡단보도를 건널 차례면 그 앞에 선다). excess 는 갈아탈 자리를 지나친 거리 */
  function turn(i: number, excess: number) {
    const k = plan(i);
    if (k < 0) {
      mode[i] = LEAVING; // 갈 길이 없는 곳(일어나지 않아야 한다)
      return;
    }
    if (nextX[i] >= 0) {
      xing[i] = 1;
      xLink[i] = nextX[i];
      nextX[i] = -1;
      // 우측통행: 횡단보도 축에서 건너는 방향 오른쪽으로, 횡단보도 폭 안에서 사람마다 다른 거리만큼 비켜 건넌다
      const ux = xFx[i] - xNx[i];
      const uz = xFz[i] - xNz[i];
      const lu = Math.hypot(ux, uz) || 1;
      xLat[i] = Math.max(0, links.list[xLink[i]].wid / 2 - 0.4) * (0.15 + rand() * 0.85);
      xNx[i] -= (uz / lu) * xLat[i];
      xNz[i] += (ux / lu) * xLat[i];
      xFx[i] -= (uz / lu) * xLat[i];
      xFz[i] += (ux / lu) * xLat[i];
      xSlot[i] = 0;
      // 칠 끝은 축 양 끝에서 같은 쪽으로 비킨 자리. 기다리는 자리가 축 옆으로 비켜 있어도 찻길은 칠 위로 건넌다.
      // 기다리는 자리가 이미 이쪽 칠 끝보다 찻길 쪽이면 그 칠 끝은 건너뛰고, 건너편도 같다
      const l = links.list[xLink[i]];
      const fromA = Math.hypot(xNx[i] - l.ax, xNz[i] - l.az) <= Math.hypot(xNx[i] - l.bx, xNz[i] - l.bz);
      const [ax, az, bx, bz] = fromA ? [l.ax, l.az, l.bx, l.bz] : [l.bx, l.bz, l.ax, l.az];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      const vx = (bx - ax) / L;
      const vz = (bz - az) / L;
      xAx[i] = ax - vz * xLat[i];
      xAz[i] = az + vx * xLat[i];
      xBx[i] = bx - vz * xLat[i];
      xBz[i] = bz + vx * xLat[i];
      xLeg[i] = (xNx[i] - ax) * vx + (xNz[i] - az) * vz >= 0 ? 1 : 0;
      return;
    }
    depart(i, to[i], k, startV[i] + excess);
  }

  /** 신호 묶음 c 에서 방향 h 로 건너기 시작해도 되는가: 초록불이 8초 넘게 남았다(건너는 동안 빨간불이 되지 않게) */
  const green = (c: number, h: number, tod: number) => signals!.greenLeft(c, signals!.groupOf(c, h), tod) > 8;
  /** 횡단보도 앞에서 span(m)을 건너기 시작할 걸음(m/s). 건너기 시작하면 안 되면 0.
   *  보행 신호가 있으면 다 건널 만큼 초록불이 남았을 때 제 걸음으로 건넌다. 모자라면 남은 초록불(1초 남김) 안에 다 건너는 걸음이
   *  HURRY 아래일 때만 그 걸음으로 서둘러 건넌다(긴 횡단보도를 천천히 건너다 빨간불을 맞지 않게). 신호가 없으면 차가 다가오지 않을 때.
   *  신호 무리는 보행 신호등과 같이 횡단보도 자료의 축으로 정한 것(crossGroup)을 본다. 옆 빈자리·줄 뒤에서 건너편 자리를 보는
   *  방향으로 고르면 비스듬한 횡단보도에서 다른 무리를 본다 */
  function startSpeed(i: number, l: CrossLink, span: number, tod: number): number {
    const c = signals?.crossSite[l.xw] ?? -1;
    if (c >= 0) {
      const grp = signals!.crossGroup[l.xw];
      const left = signals!.greenLeft(c, grp, tod) - 1;
      if (left * speed[i] >= span) return speed[i];
      // 초록불 내내 HURRY 로도 다 못 건너는 긴 횡단보도는 초록불이 켜지고 2초 안에 출발하면 그 초록불 안에 건너는 걸음을 쓴다
      const P = signals!.list[c].plan;
      const most = Math.max(HURRY, span / ((grp === 0 ? P[0] : P[3] - P[2]) - 3));
      return left * most >= span ? span / left : 0;
    }
    return l.major && cross.traffic?.(l) ? 0 : speed[i];
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
  /** 건너는 사람이 있는 횡단보도 자리를 표시한다: 축 위 자리(2m 칸)와 양옆 칸(차가 보고 선다) */
  function markBusy(i: number, l: CrossLink) {
    if (!cross.busy) return;
    const ax = l.bx - l.ax;
    const az = l.bz - l.az;
    const al = Math.hypot(ax, az) || 1;
    const bin = Math.floor((((w.x[i] - l.ax) * ax + (w.z[i] - l.az) * az) / al) / 2);
    if (!cross.busy[l.xw]) marked.push(l.xw);
    for (let k = Math.max(0, bin - 1); k <= Math.min(31, bin + 1); k++) cross.busy[l.xw] |= 1 << k;
  }
  /** (x, z) 0.7m 안에 i 말고 다른 사람이 없는가 */
  function freeAt(i: number, x: number, z: number): boolean {
    const cx = Math.floor(x / 1.5);
    const cz = Math.floor(z / 1.5);
    for (let ax = -1; ax <= 1; ax++)
      for (let az = -1; az <= 1; az++)
        for (let j = gridHead[cellKey(cx + ax, cz + az)]; j >= 0; j = gridNext[j])
          if (j !== i && j < w.n && mode[j] !== LEAVING && Math.hypot(w.x[j] - x, w.z[j] - z) < 0.7) return false;
    return true;
  }
  /** 횡단보도 앞 기다릴 자리에 이미 사람이 있을 때 옮겨 설 빈자리: 지금 자리에서 옆으로 0.75m 씩, 그다음 보도 쪽으로 0.75m 씩 물러나며
   *  횡단보도 폭 안(축에서 폭/2 − 0.3m)에서 처음 빈 곳. 없으면 null */
  function freeSpot(i: number, l: CrossLink): [number, number] | null {
    let ux = xFx[i] - xNx[i];
    let uz = xFz[i] - xNz[i];
    const lu = Math.hypot(ux, uz) || 1;
    ux /= lu;
    uz /= lu;
    const ax = l.bx - l.ax;
    const az = l.bz - l.az;
    const la = Math.hypot(ax, az) || 1;
    const room = Math.max(0.2, l.wid / 2 - 0.3);
    for (const row of [0, 0.75, 1.5])
      for (const lat of [0, 0.75, -0.75, 1.5, -1.5, 2.25, -2.25, 3, -3]) {
        const x = w.x[i] - uz * lat - ux * row;
        const z = w.z[i] + ux * lat - uz * row;
        if (Math.abs(((x - l.ax) * az - (z - l.az) * ax) / la) > room) continue;
        if (freeAt(i, x, z)) return [x, z];
      }
    return null;
  }
  let followStand = false;
  /** 횡단보도를 오가는 사람: 앞(1.4m 안, 옆으로 0.5m 안)에 서 있거나 같은 쪽으로 가는 사람이 있으면 0.7m 뒤까지만 다가간다.
   *  마주 오거나 가로지르는 사람은 우측통행 자리로 피하므로 보지 않는다. 걸음에 곱할 값(0~1)을 돌려주고, 멈추게 한 사람이 서 있었는지 followStand 에 둔다 */
  function follow(i: number, hx: number, hz: number): number {
    const h = Math.atan2(hz, hx);
    const cx = Math.floor(w.x[i] / 1.5);
    const cz = Math.floor(w.z[i] / 1.5);
    let f = 1;
    followStand = false;
    for (let ax = -1; ax <= 1; ax++)
      for (let az = -1; az <= 1; az++)
        for (let j = gridHead[cellKey(cx + ax, cz + az)]; j >= 0; j = gridNext[j]) {
          if (j === i || j >= w.n || mode[j] === LEAVING || mode[j] === BOARDING) continue;
          const dx = w.x[j] - w.x[i];
          const dz = w.z[j] - w.z[i];
          const along = dx * hx + dz * hz;
          // 앞뒤로 0.3m 안에 나란히 선 사람은 앞사람으로 보지 않는다(초록불에 함께 출발한 무리가 서로를 앞사람으로 보고 모두 늦춘다)
          if (along <= 0.3 || along >= 1.4 || Math.abs(dz * hx - dx * hz) >= 0.5) continue;
          if (w.moving[j] && Math.cos(head[j] - h) < 0.3) continue;
          const q = Math.max(0, Math.min(1, (along - 0.7) / 0.7));
          if (q < f) (f = q), (followStand = !w.moving[j]);
        }
    return f;
  }
  /** 뒤에 줄을 서야 하는 앞사람인가: 신호를 기다려 서 있는 사람(횡단보도 앞·그 뒤 줄).
   *  서로 마주 보는 두 사람이 서로를 기다리지 않도록 대략 같은 쪽(cos > 0.3)을 볼 때만 줄로 본다.
   *  걸어가는 앞사람 뒤에서는 멈추지 않는다(붐비는 길에서 앞사람이 잠깐 늦출 때마다 뒤로 줄줄이 서 버린다) */
  const queueAhead = (i: number, j: number) =>
    !w.moving[j] && (xing[j] === 2 || queued[j] === 1) && Math.cos(head[j] - head[i]) > 0.3;
  /** 붐비는 길: 앞(1.6m 안, 옆으로 0.6m 안)에 사람이 있으면 늦추고 그 사람을 비켜 옆으로 선다. 0.7m 안으로 붙은 사람과는 옆으로 떨어진다.
   *  앞사람이 신호를 기다려 서 있으면(queueAhead) 0.75m 뒤에서 멈춰 선다(파고들지 않는다). 걸어가는 사람·버스 줄·구경하는 사람은
   *  늦추며 비켜 지나간다. 둘레 1.5m 안에 사람이 많을수록 느리게 걷는다. 역·건물로 들어가며 사라지는 사람은 비키지 않는다.
   *  걸음 속도에 곱할 값(0~1)을 돌려주고 비킨 거리를 고친다 */
  function jostle(i: number, dt: number): number {
    const hx = Math.cos(head[i]);
    const hz = Math.sin(head[i]);
    const cx = Math.floor(w.x[i] / 1.5);
    const cz = Math.floor(w.z[i] / 1.5);
    let f = 1;
    let push = 0;
    let near = 0;
    let queue = false;
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
            if (queueAhead(i, j)) {
              const q = Math.max(0, Math.min(1, (along - 0.75) / 0.85));
              if (q < f) (f = q), (queue = true);
            } else f = Math.min(f, Math.max(0.15, (along - 0.45) / 1.15));
            push += away * (0.6 - Math.abs(lat));
          }
          if (r2 < 0.49) push += away * (0.7 - Math.sqrt(r2)) * 1.5;
        }
    dodge[i] = Math.max(-1.2, Math.min(1.2, dodge[i] + (push * 2.5 - dodge[i] * 0.4) * dt));
    // 걷는 띠 밖으로는 비키지 않는다(모퉁이를 돌아 아직 띠 밖에 있으면 더 나가지만 않는다)
    const [lo, hi] = g.band[from[i]][curK[i]];
    const a = off[i] + dodge[i];
    if (a < Math.min(lo, off[i])) dodge[i] = Math.min(lo, off[i]) - off[i];
    else if (a > Math.max(hi, off[i])) dodge[i] = Math.max(hi, off[i]) - off[i];
    queued[i] = f === 0 && queue ? 1 : 0;
    return Math.min(f, 1 / (1 + 0.1 * near));
  }

  function step(dt: number, now: Now, ambient = true) {
    if (cross.busy) {
      for (const k of marked) cross.busy[k] = 0;
      marked.length = 0;
    }
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
        if (dd > 1e-3) head[i] = Math.atan2(dz, dx);
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
        head[i] = Math.atan2(faceZ[i] - w.z[i], faceX[i] - w.x[i]);
        w.moving[i] = 0;
        continue;
      }
      w.photo[i] = Math.max(0, w.photo[i] - dt * 2);
      w.moving[i] = 1;
      if (rt[i]) {
        // 중앙버스정류장 오가기
        const l = links.list[rLink[i]];
        const gx = rx[rLeg[i]][i];
        const gz = rz[rLeg[i]][i];
        let dx = gx - w.x[i];
        let dz = gz - w.z[i];
        const dd = Math.hypot(dx, dz);
        if (rHold[i]) {
          // 건너는 구간 끝까지 걸을 거리만큼 초록불이 남았는지 본다
          let span = dd;
          for (let k = rLeg[i]; k < rCross[i]; k++) span += Math.hypot(rx[k + 1][i] - rx[k][i], rz[k + 1][i] - rz[k][i]);
          xFx[i] = rx[rCross[i]][i];
          xFz[i] = rz[rCross[i]][i];
          const v = startSpeed(i, l, span, now.tod);
          if (!v) {
            w.moving[i] = 0;
            if (dd > 1e-3) head[i] = Math.atan2(dz, dx);
            continue;
          }
          xSpd[i] = v;
          rHold[i] = 0;
        }
        let d = Math.min(dd, (rLeg[i] >= 1 && rLeg[i] <= rCross[i] ? xSpd[i] : speed[i]) * dt);
        if (dd > 1e-3) {
          dx /= dd;
          dz /= dd;
          const f = follow(i, dx, dz);
          d *= rLeg[i] === rCross[i] ? Math.max(0.25, f) : f;
          if (d === 0) w.moving[i] = 0;
          head[i] = Math.atan2(dz, dx);
          w.x[i] += dx * d;
          w.z[i] += dz * d;
        }
        w.phase[i] += d * 4.6;
        if (rLeg[i] === rCross[i]) markBusy(i, l);
        if (dd - d < 0.05) {
          if (rLeg[i] < 3) {
            rLeg[i]++;
            if (rLeg[i] === 1) rHold[i] = 1;
            if (rLeg[i] === 2 && rt[i] === 1) {
              // 승강장에 올라섰다: 걷는 쪽 가장자리로 줄 자리 앞까지 가서, 버스 쪽 가장자리 줄 자리로 옮겨 선다
              const isl = docks[dockOf[i]].island!;
              const sd = islandSpot(i, isl);
              [rx[2][i], rz[2][i]] = islandAt(isl, sd, -0.55);
              [rx[3][i], rz[3][i]] = islandAt(isl, sd, 0.5);
            }
          } else if (rt[i] === 1) {
            // 승강장 줄에 서서 버스 쪽(진행 방향 왼쪽)을 보고 기다린다
            rt[i] = 0;
            const isl = docks[dockOf[i]].island!;
            mode[i] = WAITING;
            w.moving[i] = 0;
            life[i] = MAX_WAIT * (0.5 + rand() * 0.5);
            head[i] = Math.atan2(-isl.ux, isl.uz);
          } else {
            rt[i] = 0;
            place(i);
          }
        }
        continue;
      }
      if (xing[i]) {
        // 횡단보도: 이쪽 끝(N)으로 가서 신호·차를 보고 기다렸다가, 축을 따라 건너편 끝(F)으로 건너고, 나갈 보도 자리(D)로 간다
        const l = links.list[xLink[i]];
        if (xing[i] === 2) {
          const h = Math.atan2(xFz[i] - xNz[i], xFx[i] - xNx[i]);
          // 건널 거리: 칠 끝 둘을 거쳐 건너편 기다리는 자리까지
          const span =
            (xLeg[i] === 0 ? Math.hypot(xAx[i] - xNx[i], xAz[i] - xNz[i]) + Math.hypot(xBx[i] - xAx[i], xBz[i] - xAz[i]) : Math.hypot(xBx[i] - xNx[i], xBz[i] - xNz[i])) +
            Math.hypot(xFx[i] - xBx[i], xFz[i] - xBz[i]);
          const v = startSpeed(i, l, span, now.tod);
          if (!v) {
            w.moving[i] = 0;
            head[i] = h;
            continue;
          }
          xSpd[i] = v;
          xing[i] = 3;
        }
        if (xing[i] === 3 && xLeg[i] === 1 && (xFx[i] - xBx[i]) * (xBx[i] - xAx[i]) + (xFz[i] - xBz[i]) * (xBz[i] - xAz[i]) <= 0) xLeg[i] = 2;
        const gx = xing[i] === 1 ? xNx[i] : xing[i] === 3 ? [xAx, xBx, xFx][xLeg[i]][i] : xDx[i];
        const gz = xing[i] === 1 ? xNz[i] : xing[i] === 3 ? [xAz, xBz, xFz][xLeg[i]][i] : xDz[i];
        const dx = gx - w.x[i];
        const dz = gz - w.z[i];
        const dd = Math.hypot(dx, dz);
        let d = Math.min(dd, (xing[i] === 3 ? xSpd[i] : speed[i]) * dt);
        if (dd > 1e-3) {
          // 앞사람을 따라간다. 건너편으로 가는 중에는 멈추지 않고 늦추기만 한다(건너편에서 기다리는 사람 때문에 찻길에 서지 않게)
          const f = follow(i, dx / dd, dz / dd);
          const spot = xing[i] === 1 && f === 0 && followStand && Math.hypot(xNx[i] - w.x[i], xNz[i] - w.z[i]) < 4 && xSlot[i] < 3 && !freeAt(i, w.x[i], w.z[i]) ? freeSpot(i, l) : null;
          if (spot) {
            // 앞사람 뒤에 섰는데 옆 사람과 너무 붙으면 옆이나 뒤 빈자리로 옮겨 선다
            [xNx[i], xNz[i]] = spot;
            xSlot[i]++;
          } else if (xing[i] === 1 && f === 0 && followStand && Math.hypot(xNx[i] - w.x[i], xNz[i] - w.z[i]) < 4) {
            // 횡단보도 앞에서 기다리는 사람 뒤에 선다: 여기가 기다릴 자리다
            xNx[i] = w.x[i];
            xNz[i] = w.z[i];
            xing[i] = 2;
            w.moving[i] = 0;
            head[i] = Math.atan2(xFz[i] - w.z[i], xFx[i] - w.x[i]);
            continue;
          }
          d *= xing[i] === 1 ? f : Math.max(0.25, f);
          if (d === 0) w.moving[i] = 0;
        }
        w.phase[i] += d * 4.6;
        if (dd > 1e-3) {
          head[i] = Math.atan2(dz, dx);
          w.x[i] += (dx / dd) * d;
          w.z[i] += (dz / dd) * d;
        }
        if (xing[i] === 3) markBusy(i, l);
        if (dd - d < 0.05) {
          if (xing[i] === 4) {
            xing[i] = 0;
            depart(i, nextDep[i], nextK[i], startV[i]);
            place(i);
          } else if (xing[i] === 1 && xSlot[i] < 3 && !freeAt(i, w.x[i], w.z[i])) {
            // 기다릴 자리에 이미 사람이 있으면 옆이나 뒤 빈자리로 옮겨 선다
            const spot = freeSpot(i, l);
            if (spot) [xNx[i], xNz[i]] = spot;
            xSlot[i]++;
          } else if (xing[i] === 3 && xLeg[i] < 2) xLeg[i]++;
          else xing[i]++;
        }
        continue;
      }
      if (mode[i] === WANDER) {
        life[i] -= dt;
        if (life[i] <= 0) {
          mode[i] = HOMING;
          nextK[i] = -1; // 집 쪽으로 다시 고른다
          nextX[i] = -1;
          homeHere(i);
        }
      }
      plan(i);
      const len0 = Math.hypot(g.nx[to[i] * 2] - sx[i], g.nx[to[i] * 2 + 1] - sz[i]);
      const d = speed[i] * jostle(i, dt) * dt;
      if (d === 0) w.moving[i] = 0; // 앞사람 뒤에 멈춰 섰다
      t[i] += d;
      w.phase[i] += d * 4.6;
      off[i] += Math.max(-dt * 1.4, Math.min(dt * 1.4, offWant[i] - off[i]));
      if (endT[i] >= 0 && t[i] >= endT[i]) {
        // 출구·정류장에 닿았다
        t[i] = endT[i];
        place(i);
        const isl = docks[dockOf[i]].island;
        if (isl) {
          // 중앙버스정류장: 횡단보도 이쪽 끝에서 신호를 기다렸다가 승강장까지 건너, 승강장 줄 자리로 간다
          const [cx, cz] = crossPair(isl.ex, isl.ez, isl.ix, isl.iz);
          startRoute(i, 1, isl, [[cx[0], cz[0]], [cx[1], cz[1]], [cx[1], cz[1]], [cx[1], cz[1]]], 1);
          endT[i] = -1;
          continue;
        } else if (docks[dockOf[i]].kind === 'stop') {
          // 먼저 온 사람 뒤에 줄을 선다: 정류장 자리에서 선을 따라(더 긴 쪽으로) QUEUE_GAP 씩 물러난 자리 가운데 비어 있는 첫 자리
          const dk = docks[dockOf[i]];
          let spot: [number, number] | null = null;
          for (let n = 0; n < 12 && !spot; n++) {
            const sp = queueSpot(dk, n);
            let taken = false;
            for (let j = 0; j < w.n && !taken; j++) if (j !== i && mode[j] === WAITING && dockOf[j] === dockOf[i] && Math.hypot(w.x[j] - sp[0], w.z[j] - sp[1]) < 0.7) taken = true;
            if (!taken) spot = sp;
          }
          if (!spot) mode[i] = LEAVING; // 줄이 너무 길면 다른 길로 간 셈 친다
          else {
            mode[i] = WAITING;
            w.moving[i] = 0;
            life[i] = MAX_WAIT * (0.5 + rand() * 0.5);
            [w.x[i], w.z[i]] = spot;
            head[i] = Math.atan2(dk.z - w.z[i], dk.x - w.x[i]); // 정류장(찻길) 쪽을 본다
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
    // 몸 방향은 걷는 방향으로 1초에 TURN_RATE 라디안까지만 돈다. 막 나타나거나 사라지는 사람은 바로 맞춘다
    const turnMax = TURN_RATE * dt;
    for (let i = 0; i < w.n; i++) {
      let dy = head[i] - w.yaw[i];
      dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
      const y = w.fade[i] < 0.15 ? head[i] : w.yaw[i] + Math.max(-turnMax, Math.min(turnMax, dy));
      w.yaw[i] = y - Math.round(y / (2 * Math.PI)) * 2 * Math.PI;
    }
    if (!ambient || !docks.length) return;
    // 구역마다 화면 인원을 그 구역 인구에 맞춘다. 모자라면 그 구역 출구·정류장에서 지하철·버스로 막 도착한 사람처럼 나오고
    // (한 구역에서 1초에 목표의 1/40, 적어도 2명까지), 넘치면 그 구역 사람 몇 명을 일찍 들여보낸다
    const want = zoneTargets(provider, now, max, rain);
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

  /** 비 세기(0~1). 밖에 걷는 사람 수가 이 값에 따라 준다 */
  const setRain = (r: number) => {
    rain = r;
  };
  /** 구역마다 그 구역에서 나온 사람 수(들어가며 사라지는 사람 빼고, 마지막 칸은 구역 밖) */
  const zoneCounts = () => {
    const have = new Array<number>(ZONE_IDS.length + 1).fill(0);
    for (let i = 0; i < w.n; i++) if (mode[i] !== LEAVING) have[home[i]]++;
    return have;
  };
  return { w, step, burst, alight, board, waitingAt, hold, docks, dockPoint, setRain, zoneCounts };
}
