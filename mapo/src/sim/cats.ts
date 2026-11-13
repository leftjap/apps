// 길고양이 18마리. 자리는 손으로 정한 것이고 실제 급식소 위치나 서식 통계와는 무관하다.
// 해가 떠 있으면 건물 남쪽 옆에서 식빵 자세로 쉬고, 해 질 녘부터 새벽까지는 집 주변 골목을 천천히 오간다.
// 위치와 상태는 시각과 고양이 번호만으로 정해진다.
import type { Building } from '../data/board.ts';
import { toXZ } from '../geo.ts';
import { cumLen, headingAt, pointAt } from '../poly.ts';
import type { Now } from './clock.ts';
import { smooth, sunAngles } from './curves.ts';
import type { WalkGraph } from './graph.ts';
import { hash01, rng } from './rng.ts';

export type Coat = 'cheese' | 'calico' | 'mackerel' | 'tuxedo';
export const COAT_KO: Record<Coat, string> = { cheese: '치즈', calico: '삼색', mackerel: '고등어', tuxedo: '턱시도' };

export interface CatSpot {
  dong: string;
  coat: Coat;
  x: number;
  z: number;
}

const spot = (dong: string, coat: Coat, lat: number, lon: number): CatSpot => {
  const [x, z] = toXZ(lat, lon);
  return { dong, coat, x, z };
};

export const CAT_SPOTS: CatSpot[] = [
  // 경의선숲길 연남 구간 풀숲과 연남동 주택가
  spot('연남동', 'cheese', 37.5598, 126.9247),
  spot('연남동', 'calico', 37.5615, 126.9233),
  spot('연남동', 'mackerel', 37.5632, 126.9219),
  spot('연남동', 'tuxedo', 37.5622, 126.9262),
  spot('동교동', 'cheese', 37.5585, 126.9225),
  // 망원동 주택가 골목과 한강공원 가장자리
  spot('망원동', 'mackerel', 37.556, 126.905),
  spot('망원동', 'cheese', 37.5545, 126.901),
  spot('망원동', 'tuxedo', 37.5578, 126.9075),
  spot('망원한강공원', 'calico', 37.5508, 126.9035),
  // 서교동
  spot('서교동', 'calico', 37.5525, 126.9185),
  spot('서교동', 'tuxedo', 37.554, 126.9215),
  spot('서교동', 'cheese', 37.5558, 126.9165),
  // 합정동·상수동
  spot('합정동', 'mackerel', 37.5478, 126.9115),
  spot('합정동', 'calico', 37.5462, 126.915),
  spot('상수동', 'tuxedo', 37.5468, 126.9215),
  spot('상수동', 'mackerel', 37.546, 126.9245),
  // 와우산 자락과 경의선숲길 땡땡거리 쪽
  spot('창전동', 'cheese', 37.5512, 126.9288),
  spot('창전동', 'calico', 37.5521, 126.931),
];

export interface CatDef {
  id: number;
  dong: string;
  coat: Coat;
  /** 낮에 쉬는 자리 */
  loaf: [number, number];
  /** 밤에 오가는 길 [x,y,z,...]. 식빵 자리에서 시작한다 */
  route: Float32Array;
  cum: Float32Array;
  /** 길 끝에 급식소가 있는가 */
  eats: boolean;
}

export interface CatState {
  x: number;
  z: number;
  yaw: number;
  /** 0 = 식빵 자세, 1 = 걷는 중 */
  pose: number;
  status: string;
}

export const catName = (c: CatDef) => `${c.dong} ${COAT_KO[c.coat]}냥`;

/** 하루(86400초)를 나누어떨어지는 주기들. 자정에 위치가 튀지 않는다 */
const PERIODS = [240, 270, 288, 300, 320, 360, 384, 400, 432];
const WALK = 0.38; // 주기 가운데 한쪽 방향으로 걷는 비율
const PAUSE = 0.12;
const PACE = 0.42; // 평균 걸음(m/s)

export function makeCats(spots: CatSpot[], g: WalkGraph, buildings: Building[]): CatDef[] {
  const cats = spots.map((sp, id): CatDef => {
    // 식빵 자리: 가장 가까운 건물의 가장 남쪽 벽 바로 밖(볕이 드는 쪽)
    let loaf: [number, number] = [sp.x, sp.z];
    let bd = 70;
    for (const b of buildings) {
      if (Math.abs(b.pts[0] - sp.x) > 120 || Math.abs(b.pts[1] - sp.z) > 120) continue;
      const n = b.pts.length / 2;
      let cx = 0;
      let cz = 0;
      for (let i = 0; i < n; i++) (cx += b.pts[i * 2] / n), (cz += b.pts[i * 2 + 1] / n);
      const d = Math.hypot(cx - sp.x, cz - sp.z);
      if (d >= bd) continue;
      bd = d;
      let best = -Infinity;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const mz = (b.pts[i * 2 + 1] + b.pts[j * 2 + 1]) / 2;
        if (mz > best) (best = mz), (loaf = [(b.pts[i * 2] + b.pts[j * 2]) / 2, mz + 0.9]);
      }
    }
    // 밤길: 집 근처 골목을 따라 몇 구간 나갔다가 같은 길로 돌아온다
    const rand = rng(id * 977 + 13);
    const pts = [loaf[0], 0, loaf[1]];
    let cur = g.nearest(sp.x, sp.z, true);
    const seen = new Set<number>([cur]);
    if (cur >= 0) pts.push(g.nx[cur * 2], 0, g.nx[cur * 2 + 1]);
    for (let step = 0; step < 9 && cur >= 0; step++) {
      const opts = g.adj[cur].filter((n, k) => g.cls[cur][k] >= 4 && !seen.has(n) && Math.hypot(g.nx[n * 2] - sp.x, g.nx[n * 2 + 1] - sp.z) < 130);
      if (!opts.length) break;
      cur = opts[Math.floor(rand() * opts.length)];
      seen.add(cur);
      pts.push(g.nx[cur * 2], 0, g.nx[cur * 2 + 1]);
    }
    if (pts.length < 6) pts.push(loaf[0] + 6, 0, loaf[1] + 1);
    const route = Float32Array.from(pts);
    return { id, dong: sp.dong, coat: sp.coat, loaf, route, cum: cumLen(route), eats: false };
  });
  // 동네마다 첫 고양이의 길 끝에 급식소를 둔다. 길 끝이 급식소에서 30m 안인 고양이는 거기서 밥을 먹는다
  const fs = feeders(cats);
  for (const c of cats) {
    const [ex, ez] = reach(c);
    c.eats = fs.some(([fx, fz]) => Math.hypot(fx - ex, fz - ez) < 30);
  }
  return cats;
}

const period = (c: CatDef) => PERIODS[c.id % PERIODS.length];
/** 한 주기에 다녀올 수 있는 거리 */
const span = (c: CatDef) => Math.min(c.cum[c.cum.length - 1], PACE * WALK * period(c));
const tmp = [0, 0, 0];
/** 고양이가 가장 멀리 가는 지점 */
function reach(c: CatDef): [number, number] {
  pointAt(c.route, c.cum, span(c), tmp);
  return [tmp[0], tmp[2]];
}

/** 급식소 자리들 */
export function feeders(cats: CatDef[]): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const c of cats) {
    if (seen.has(c.dong)) continue;
    seen.add(c.dong);
    out.push(reach(c));
  }
  return out;
}

const DAY_STATUS = ['식빵 굽는 중', '낮잠 중', '그루밍 중'];

export function catAt(c: CatDef, now: Now): CatState {
  const night = 1 - smooth(0, 4, sunAngles(now.tod, now.doy).elev); // 해가 4도 아래로 내려가는 동안 0 → 1
  if (night <= 0) {
    const r = hash01(c.id * 131 + Math.floor(now.tod / 2400));
    return { x: c.loaf[0], z: c.loaf[1], yaw: Math.PI / 2, pose: 0, status: DAY_STATUS[r < 0.5 ? 0 : r < 0.85 ? 1 : 2] };
  }
  const P = period(c);
  const u = ((now.tod + hash01(c.id * 7 + 3) * P) / P) % 1;
  const L = span(c) * night; // 해 질 녘에는 조금씩만 멀어진다
  let f: number; // 길 위의 위치(0 집 ~ 1 끝)
  let walk = 0; // 이 구간에서 걷기 시작한 뒤·끝나기 전 남은 시간(초)의 작은 쪽
  let back = false;
  let status: string;
  if (u < WALK) {
    f = smooth(0, 1, u / WALK);
    walk = Math.min(u, WALK - u) * P;
    status = '어슬렁거리는 중';
  } else if (u < WALK + PAUSE) {
    f = 1;
    status = c.eats ? '급식소에서 밥 먹는 중' : '주변을 살피는 중';
  } else if (u < 2 * WALK + PAUSE) {
    const k = (u - WALK - PAUSE) / WALK;
    f = 1 - smooth(0, 1, k);
    walk = Math.min(k, 1 - k) * WALK * P;
    back = true;
    status = '어슬렁거리는 중';
  } else {
    f = 0;
    status = '쉬는 중';
  }
  const seg = pointAt(c.route, c.cum, f * L, tmp);
  const dir = headingAt(c.route, seg);
  // 길 한쪽 가장자리로 붙어 걷는다(식빵 자리 근처에서는 붙지 않는다)
  const edge = Math.min(1, (f * L) / 4);
  return {
    x: tmp[0] - Math.sin(dir) * edge,
    z: tmp[2] + Math.cos(dir) * edge,
    yaw: back ? dir + Math.PI : dir,
    pose: night > 0.03 ? Math.min(1, walk / 2) : 0,
    status,
  };
}
