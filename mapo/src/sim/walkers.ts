// 보행자. 골목·보도 그래프 위를 걷는다. 사람은 역 출구와 버스 정류장에서만 나타나고 사라진다.
// 나타날 때는 출구·정류장이 붙은 길의 그쪽 보도에서 걷기 시작하고, 한동안 돌아다니다가
// 가장 가까운 출구·정류장으로 걸어가 들어간다(정류장에서는 버스가 올 때까지 기다렸다가 탄다).
import type { Now } from './clock.ts';
import { clamp01, commute, daytime, nightlife } from './curves.ts';
import type { WalkGraph } from './graph.ts';
import type { DataProvider } from './provider.ts';
import { pick, rng } from './rng.ts';
import { GREEN, type Signals } from './signals.ts';

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
}

/** 사람이 들고 나는 곳. 역 출구는 key 가 역 이름, 정류장은 정류장 열쇠 */
export interface Portal {
  kind: 'exit' | 'stop';
  key: string;
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

/** 출구·정류장이 붙은 길 조각: a→b 위 t(m) 지점, 길 오른쪽(+1)·왼쪽(−1) */
interface Dock extends Portal {
  a: number;
  b: number;
  t: number;
  len: number;
  side: number;
  zone: string;
}

const WANDER = 0;
const HOMING = 1;
const WAITING = 2;
const LEAVING = 3;
const MAX_WAIT = 300; // 정류장에서 버스를 기다리는 가장 긴 시간(초)

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

  const pos = (n: number): [number, number] => [g.nx[n * 2], g.nx[n * 2 + 1]];
  const zoneOf = (x: number, z: number) => {
    for (const id in ZONES) {
      const [cx, cz, r] = ZONES[id];
      if (Math.hypot(x - cx, z - cz) < r) return id;
    }
    return '';
  };

  // ── 출구·정류장을 가장 가까운 길 조각에 붙인다 ──
  const docks: Dock[] = [];
  for (const p of portals) {
    const n0 = g.nearest(p.x, p.z);
    if (n0 < 0) continue;
    let best: Dock | null = null;
    let bd = Infinity;
    const seen = new Set<number>();
    for (const a of [n0, ...g.adj[n0]])
      for (const b of g.adj[a]) {
        const key = Math.min(a, b) * 1e7 + Math.max(a, b);
        if (seen.has(key)) continue;
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
          best = { ...p, a, b, t: tt, len, side: right >= 0 ? 1 : -1, zone: zoneOf(p.x, p.z) };
        }
      }
    if (best) docks.push(best);
  }

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
    offWant[i] = offFor(from[i], k, side[i]);
    nextK[i] = -1;
  }
  function place(i: number) {
    const [ex, ez] = pos(to[i]);
    const dx = ex - sx[i];
    const dz = ez - sz[i];
    const len = Math.hypot(dx, dz) || 1;
    const k = t[i] / len; // 모퉁이에서는 노드를 지나거나 노드 앞에서 갈아타므로 0~1 밖도 쓴다
    w.x[i] = sx[i] + dx * k - (dz / len) * off[i];
    w.z[i] = sz[i] + dz * k + (dx / len) * off[i];
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
    t[i] = forward ? d.t : d.len - d.t;
    // 출구가 있는 쪽 보도로 나온다. 거꾸로 걸으면 오른쪽·왼쪽이 바뀐다
    side[i] = (forward ? d.side : -d.side) * (0.2 + rand() * 0.8);
    const k = g.adj[from[i]].indexOf(to[i]);
    aim(i, k);
    off[i] = offWant[i];
    speed[i] = 1.0 + rand() * 0.55;
    life[i] = 80 + rand() * 170;
    mode[i] = WANDER;
    endT[i] = -1;
    dockOf[i] = -1;
    holdT[i] = 0;
    waitStart[i] = 0;
    w.phase[i] = rand() * 6.28;
    w.fade[i] = 0;
    w.tint[i] = rand();
    w.id[i] = nextId++;
    w.photo[i] = 0;
    w.moving[i] = 1;
    place(i);
    return i;
  }
  function remove(i: number) {
    onLeave?.(w.x[i], w.z[i]);
    const j = --w.n;
    if (i === j) return;
    for (const a of [from, to, sx, sz, t, speed, off, offWant, side, life, mode, endT, dockOf, holdT, faceX, faceZ, nextK, turnU, startV, nextOff, nextSide, waitStart, w.x, w.z, w.yaw, w.phase, w.fade, w.tint, w.id, w.photo, w.moving])
      a[i] = a[j];
  }

  const docksOf = (kind: Portal['kind'], key: string) => docks.map((d, i) => (d.kind === kind && d.key === key ? i : -1)).filter((i) => i >= 0);

  /** 역 출구에서 count 명이 나온다(열차 도착) */
  function burst(station: string, count: number) {
    const ds = docksOf('exit', station);
    if (!ds.length) return;
    for (let k = 0; k < count; k++) spawnAt(ds[Math.floor(rand() * ds.length)]);
  }
  /** 정류장에서 버스에서 내린 count 명이 나온다 */
  function alight(key: string, count: number) {
    const ds = docksOf('stop', key);
    if (!ds.length) return;
    for (let k = 0; k < count; k++) spawnAt(ds[Math.floor(rand() * ds.length)]);
  }
  /** 정류장에서 기다리던 사람들이 버스에 탄다 */
  function board(key: string) {
    for (let i = 0; i < w.n; i++) if (mode[i] === WAITING && docks[dockOf[i]].key === key) mode[i] = LEAVING;
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
      const ws = g.aw[b].map((v, kk) => (nb[kk] === from[i] && nb.length > 1 ? 0 : v));
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
    const sd = back ? -side[i] : side[i];
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
    waitStart[i] = signals && startV[i] < -2 && signals.siteAt(g.nx[b * 2], g.nx[b * 2 + 1]) >= 0 ? 1 : 0;
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

  /** 신호 묶음 c 에서 방향 h 로 건너도 되는가 */
  const green = (c: number, h: number, tod: number) => signals!.state(c, signals!.groupOf(c, h), tod) === GREEN;
  /** 신호 교차로 노드 to[i] 앞에서: 건너야 하는데 그 방향이 초록불이 아니면 false */
  function mayCross(i: number, tod: number): boolean {
    const b = to[i];
    const c = signals!.siteAt(g.nx[b * 2], g.nx[b * 2 + 1]);
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

  function step(dt: number, now: Now, ambient = true) {
    for (let i = w.n - 1; i >= 0; i--) {
      if (mode[i] === LEAVING) {
        w.fade[i] -= dt * 1.6;
        w.moving[i] = 0;
        if (w.fade[i] <= 0) remove(i);
        continue;
      }
      w.fade[i] = Math.min(1, w.fade[i] + dt * 2.2);
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
          const c = signals.siteAt(sx[i], sz[i]);
          if (c >= 0 && !green(c, Math.atan2(g.nx[to[i] * 2 + 1] - sz[i], g.nx[to[i] * 2] - sx[i]), now.tod)) stop = true;
          else waitStart[i] = 0;
        } else if (endT[i] < 0 && nextK[i] >= 0) {
          const cb = curb(to[i]);
          if (t[i] >= len0 - cb && t[i] < len0 - cb + 1.5 && len0 > cb + 1 && !mayCross(i, now.tod)) stop = true;
        }
        if (stop) {
          // 횡단보도 앞에서 초록불을 기다린다
          w.moving[i] = 0;
          place(i);
          continue;
        }
      }
      const d = speed[i] * dt;
      t[i] += d;
      w.phase[i] += d * 4.6;
      off[i] += Math.max(-dt * 1.4, Math.min(dt * 1.4, offWant[i] - off[i]));
      if (endT[i] >= 0 && t[i] >= endT[i]) {
        // 출구·정류장에 닿았다
        t[i] = endT[i];
        place(i);
        endT[i] = -1;
        if (docks[dockOf[i]].kind === 'stop') {
          mode[i] = WAITING;
          life[i] = MAX_WAIT * (0.5 + rand() * 0.5);
          w.yaw[i] += (Math.sign(off[i]) || 1) * (Math.PI / 2); // 찻길 쪽을 본다
        } else mode[i] = LEAVING;
        continue;
      }
      if (nextK[i] === -2 && t[i] >= len0) mode[i] = LEAVING; // 갈 길이 없는 곳(일어나지 않아야 한다)
      else if (nextK[i] >= 0 && t[i] >= len0 + turnU[i]) turn(i, t[i] - len0 - turnU[i]);
      place(i);
    }
    if (!ambient || !docks.length) return;
    const want = walkerTarget(provider, now, max);
    if (w.n < want) {
      // 지하철·버스로 막 도착한 사람처럼 출구·정류장에서 나온다. 붐비는 구역의 출구·정류장일수록 많이 나온다
      const ppl: Record<string, number> = {};
      for (const a of provider.areas(now)) ppl[a.id] = a.pplMin;
      const ws = docks.map((d) => (d.zone ? (ppl[d.zone] ?? 0) : 1500) / (d.kind === 'exit' ? 1 : 2));
      for (let k = 0; k < 8 && w.n < want; k++) spawnAt(pick(ws, rand()));
    } else if (w.n > want * 1.1 + 10) {
      // 인원이 넘치면 몇 명을 일찍 들여보낸다
      for (let k = 0; k < 3; k++) {
        const i = Math.floor(rand() * w.n);
        if (mode[i] === WANDER) life[i] = 0;
      }
    }
  }

  return { w, step, burst, alight, board, waitingAt, hold, docks };
}
