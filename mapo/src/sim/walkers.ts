// 보행자. 골목·보행로 그래프 위를 걷는다. 열차가 도착하면 역 출구에서 무리가 나오고,
// 평소에는 구역 인구에 비례해 길 위에 나타났다가 얼마 뒤 사라진다.
import type { Now } from './clock.ts';
import { clamp01, commute, daytime, nightlife } from './curves.ts';
import type { WalkGraph } from './graph.ts';
import type { DataProvider } from './provider.ts';
import { pick, rng } from './rng.ts';

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
}

export interface Exit {
  st: string;
  x: number;
  z: number;
}

/** 화면의 캐릭터 한 명이 대신하는 실제 인원 */
export const PEOPLE_PER_FIGURE = 60;

/** 구역 id → 판 위의 중심과 반지름(m). 실시간 도시데이터 장소의 대략적인 범위 */
const ZONES: Record<string, [number, number, number]> = {
  hongdae: [350, -250, 520],
  'hongik-stn': [573, -643, 260],
  yeonnam: [300, -1050, 420],
  hapjeong: [-470, 240, 300],
  mangwon: [-1300, 330, 450],
};

/** 지금 화면에 있어야 할 보행자 수 */
export function walkerTarget(provider: DataProvider, now: Now, max: number): number {
  const active = clamp01(0.05 + 0.95 * Math.max(daytime(now.tod), nightlife(now.tod), 0.8 * commute(now.tod)));
  const people = provider.areas(now).reduce((s, a) => s + a.pplMin, 0);
  return Math.min(max, Math.round((people / PEOPLE_PER_FIGURE) * active));
}

export function makeWalkers(g: WalkGraph, exits: Exit[], provider: DataProvider, seed = 1, max = 1500) {
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
  };
  let nextId = 1;
  const holdT = new Float32Array(max); // 멈춰 서 있을 남은 시간(초)
  const faceX = new Float32Array(max);
  const faceZ = new Float32Array(max);
  // 걷는 구간: (sx,sz) → 노드 b
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

  // 구역별 노드 목록(인기도 누적)
  const zoneNodes: Record<string, { nodes: number[]; w: number[] }> = {};
  for (const id in ZONES) {
    const [cx, cz, r] = ZONES[id];
    const nodes: number[] = [];
    const ws: number[] = [];
    for (let i = 0; i < g.adj.length; i++) {
      if (!g.adj[i].length || Math.hypot(g.nx[i * 2] - cx, g.nx[i * 2 + 1] - cz) > r) continue;
      nodes.push(i);
      ws.push(g.aw[i].reduce((a, b) => a + b, 0));
    }
    zoneNodes[id] = { nodes, w: ws };
  }
  const exitsOf = new Map<string, Exit[]>();
  for (const e of exits) (exitsOf.get(e.st) ?? exitsOf.set(e.st, []).get(e.st)!).push(e);

  function aim(i: number, k: number) {
    // 노드 from[i] 에서 이웃 k 로: 그 길에서 걸을 자리를 정한다
    const [lo, hi] = g.lat[from[i]][k];
    offWant[i] = Math.sign(side[i] || 1) * (lo + Math.abs(side[i]) * (hi - lo));
  }
  function add(x: number, z: number, a: number, b: number, k: number): number {
    const i = w.n++;
    from[i] = a;
    to[i] = b;
    sx[i] = x;
    sz[i] = z;
    t[i] = 0;
    speed[i] = 1.0 + rand() * 0.55;
    side[i] = rand() * 2 - 1;
    off[i] = 0;
    offWant[i] = 0;
    if (a >= 0) {
      aim(i, k);
      off[i] = offWant[i];
    }
    life[i] = 80 + rand() * 170;
    w.phase[i] = rand() * 6.28;
    w.fade[i] = 0;
    w.tint[i] = rand();
    w.id[i] = nextId++;
    w.photo[i] = 0;
    holdT[i] = 0;
    place(i);
    return i;
  }
  function remove(i: number) {
    const j = --w.n;
    if (i === j) return;
    for (const a of [from, to, sx, sz, t, speed, off, offWant, side, life, w.x, w.z, w.yaw, w.phase, w.fade, w.tint, w.id, w.photo, holdT, faceX, faceZ]) a[i] = a[j];
  }
  function place(i: number) {
    const ex = g.nx[to[i] * 2];
    const ez = g.nx[to[i] * 2 + 1];
    const dx = ex - sx[i];
    const dz = ez - sz[i];
    const len = Math.hypot(dx, dz) || 1;
    const k = Math.min(1, t[i] / len);
    w.x[i] = sx[i] + dx * k - (dz / len) * off[i];
    w.z[i] = sz[i] + dz * k + (dx / len) * off[i];
    w.yaw[i] = Math.atan2(dz, dx);
    return len;
  }

  /** 역 출구에서 count 명이 나온다 */
  function burst(station: string, count: number) {
    const ex = exitsOf.get(station);
    if (!ex) return;
    for (let k = 0; k < count && w.n < max; k++) {
      const e = ex[Math.floor(rand() * ex.length)];
      const b = g.nearest(e.x, e.z);
      if (b < 0) return;
      const a = rand() * 6.28;
      const r = rand() * 5;
      add(e.x + Math.cos(a) * r, e.z + Math.sin(a) * r, -1, b, 0);
    }
  }

  /** id 인 사람을 secs 초 동안 세워 (fx, fz) 쪽을 보게 한다 */
  function hold(id: number, secs: number, fx: number, fz: number) {
    for (let i = 0; i < w.n; i++)
      if (w.id[i] === id) {
        holdT[i] = secs;
        faceX[i] = fx;
        faceZ[i] = fz;
        life[i] = Math.max(life[i], secs + 20);
        return;
      }
  }

  function step(dt: number, now: Now, ambient = true) {
    for (let i = w.n - 1; i >= 0; i--) {
      if (holdT[i] > 0) {
        holdT[i] -= dt;
        w.photo[i] = Math.min(1, w.photo[i] + dt * 2);
        w.yaw[i] = Math.atan2(faceZ[i] - w.z[i], faceX[i] - w.x[i]);
        continue;
      }
      w.photo[i] = Math.max(0, w.photo[i] - dt * 2);
      life[i] -= dt;
      if (life[i] <= 0) {
        w.fade[i] -= dt * 1.6;
        if (w.fade[i] <= 0) {
          remove(i);
          continue;
        }
      } else w.fade[i] = Math.min(1, w.fade[i] + dt * 2.2);
      const d = speed[i] * dt;
      t[i] += d;
      w.phase[i] += d * 4.6;
      off[i] += Math.max(-dt * 1.4, Math.min(dt * 1.4, offWant[i] - off[i]));
      const len = place(i);
      if (t[i] < len) continue;
      // 노드에 닿았다: 온 길이 아닌 이웃 가운데 하나를 고른다
      const b = to[i];
      const nb = g.adj[b];
      const ws = g.aw[b].map((v, k) => (nb[k] === from[i] && nb.length > 1 ? 0 : v));
      const k = pick(ws, rand());
      t[i] -= len;
      sx[i] = g.nx[b * 2];
      sz[i] = g.nx[b * 2 + 1];
      from[i] = b;
      to[i] = nb[k];
      aim(i, k);
    }
    if (!ambient) return;
    const want = walkerTarget(provider, now, max);
    if (w.n < want) {
      const areas = provider.areas(now).filter((a) => zoneNodes[a.id]?.nodes.length);
      if (!areas.length) return;
      const share = areas.map((a) => a.pplMin);
      for (let k = 0; k < 8 && w.n < want; k++) {
        const z = zoneNodes[areas[pick(share, rand())].id];
        const a = z.nodes[pick(z.w, rand())];
        const j = pick(g.aw[a], rand());
        add(g.nx[a * 2], g.nx[a * 2 + 1], a, g.adj[a][j], j);
      }
    } else if (w.n > want * 1.1 + 10) {
      // 인원이 넘치면 몇 명을 일찍 들여보낸다
      for (let k = 0; k < 3; k++) {
        const i = Math.floor(rand() * w.n);
        life[i] = Math.min(life[i], 0);
      }
    }
  }

  return { w, step, burst, hold };
}
