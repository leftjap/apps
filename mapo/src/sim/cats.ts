// 길고양이 18마리. 자리는 손으로 정한 것이고 실제 급식소 위치나 서식 통계와는 무관하다.
// 하루를 30분 칸으로 나누고, 칸마다 할 일(낮잠·그루밍·급식소·순찰·친구와 장난)을 정한다.
// 낮에는 대개 건물 남쪽 옆 볕 드는 자리에서 쉬고, 밤에는 급식소에 가거나 골목을 돌거나 이웃 고양이와 만나 논다.
// 칸은 늘 쉬는 자리에서 시작해 쉬는 자리에서 끝나므로 위치가 튀지 않는다. 위치와 상태는 시각과 고양이 번호만으로 정해진다.
// 사람에 대한 반응(숨기·다가가기)은 catReact.ts 가 이 위에 덧씌운다.
import type { Building } from '../data/board.ts';
import { toXZ } from '../geo.ts';
import { cumLen, pointAt } from '../poly.ts';
import type { Now } from './clock.ts';
import { smooth, sunAngles } from './curves.ts';
import type { WalkGraph } from './graph.ts';
import { hash01, rng } from './rng.ts';

export type Personality = 'shy' | 'friendly';
export const PERSONALITY_KO: Record<Personality, string> = { shy: '경계심 많음', friendly: '개냥이' };

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

/** 고양이가 걷는 길: [x,y,z, ...]와 누적 거리 */
export interface Path {
  line: Float32Array;
  cum: Float32Array;
  len: number;
}

export interface CatDef {
  id: number;
  dong: string;
  coat: Coat;
  personality: Personality;
  /** 쉬는 자리 */
  loaf: [number, number];
  /** 순찰 길. 쉬는 자리에서 시작한다 */
  route: Float32Array;
  cum: Float32Array;
  /** 쉬는 자리 → 급식소 */
  feed: (Path & { at: [number, number] }) | null;
  /** 함께 노는 이웃 고양이(없으면 −1)와, 만나는 곳까지의 길 */
  buddy: number;
  meet: Path | null;
  /** 둘 다 만나는 곳에 닿는 시각(칸 시작 뒤 초) */
  meetT: number;
}

/** 0 식빵 자세, 1 앉음, 2 밥 먹기, 3 장난치기, 4 그루밍 */
export type Pose = 0 | 1 | 2 | 3 | 4;

export interface CatState {
  x: number;
  z: number;
  yaw: number;
  /** 다리를 움직이는 정도 0~1 */
  walk: number;
  pose: Pose;
  status: string;
  /** 보이는 정도 0~1(숨으면 0) */
  alpha: number;
}

export const catName = (c: CatDef) => `${c.dong} ${COAT_KO[c.coat]}냥`;

export const SLOT = 1800; // 하루를 나누는 칸(초)
const PACE = 0.5; // 걷는 빠르기(m/s)
const EAT = 240;
const DRINK = 60;
const PLAY = 300;

/** 그래프에서 a → b 최단 경로(노드 열). 길이가 maxLen 을 넘으면 null */
function shortest(g: WalkGraph, a: number, b: number, maxLen: number): number[] | null {
  const dist = new Map<number, number>([[a, 0]]);
  const prev = new Map<number, number>();
  const open = [a];
  const done = new Set<number>();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist.get(open[i])! < dist.get(open[bi])!) bi = i;
    const n = open.splice(bi, 1)[0];
    if (n === b) break;
    done.add(n);
    for (const m of g.adj[n]) {
      if (done.has(m)) continue;
      const d = dist.get(n)! + Math.hypot(g.nx[m * 2] - g.nx[n * 2], g.nx[m * 2 + 1] - g.nx[n * 2 + 1]);
      if (d > maxLen || d >= (dist.get(m) ?? Infinity)) continue;
      if (!dist.has(m)) open.push(m);
      dist.set(m, d);
      prev.set(m, n);
    }
  }
  if (!dist.has(b)) return null;
  const out = [b];
  while (out[0] !== a) out.unshift(prev.get(out[0])!);
  return out;
}

function toPath(pts: number[]): Path {
  const line = Float32Array.from(pts);
  const cum = cumLen(line);
  return { line, cum, len: cum[cum.length - 1] };
}

export function makeCats(spots: CatSpot[], g: WalkGraph, buildings: Building[]): CatDef[] {
  const homes: number[] = [];
  const cats = spots.map((sp, id): CatDef => {
    // 쉬는 자리: 가장 가까운 건물의 가장 남쪽 벽 바로 밖(볕이 드는 쪽)
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
    // 순찰 길: 집 근처 골목을 따라 몇 구간 나갔다가 같은 길로 돌아온다
    const rand = rng(id * 977 + 13);
    const pts = [loaf[0], 0, loaf[1]];
    let cur = g.nearest(sp.x, sp.z, true);
    homes.push(cur);
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
    const personality: Personality = (id * 7) % 5 < 3 ? 'friendly' : 'shy';
    return { id, dong: sp.dong, coat: sp.coat, personality, loaf, route, cum: cumLen(route), feed: null, buddy: -1, meet: null, meetT: 0 };
  });
  /** 쉬는 자리에서 집 앞 노드를 거쳐 노드 열을 따라가는 길 */
  const walkPath = (c: CatDef, nodes: number[], tail?: [number, number]) => {
    const pts = [c.loaf[0], 0, c.loaf[1]];
    for (const n of nodes) pts.push(g.nx[n * 2], 0, g.nx[n * 2 + 1]);
    if (tail) pts.push(tail[0], 0, tail[1]);
    if (pts.length < 6) pts.push(c.loaf[0] + 0.5, 0, c.loaf[1]);
    return toPath(pts);
  };

  // 급식소: 동네마다 고양이들 가운데쯤의 골목 노드 옆. 360m 안에서 닿는 고양이만 다닌다(왕복과 식사가 한 칸 안에 끝나도록)
  const byDong = new Map<string, CatDef[]>();
  for (const c of cats) (byDong.get(c.dong) ?? byDong.set(c.dong, []).get(c.dong)!).push(c);
  for (const group of byDong.values()) {
    const cx = group.reduce((s, c) => s + c.loaf[0], 0) / group.length;
    const cz = group.reduce((s, c) => s + c.loaf[1], 0) / group.length;
    const fn = g.nearest(cx, cz, true);
    if (fn < 0) continue;
    const at: [number, number] = [g.nx[fn * 2] + 1.2, g.nx[fn * 2 + 1] + 1.2];
    for (const c of group) {
      const nodes = homes[c.id] >= 0 ? shortest(g, homes[c.id], fn, 360) : null;
      if (nodes) c.feed = { ...walkPath(c, nodes, at), at };
    }
  }

  // 이웃 짝: 쉬는 자리가 320m 안이고 골목으로 420m 안에 닿는 가장 가까운 고양이. 길 가운데에서 만난다
  for (const a of cats) {
    if (a.buddy >= 0 || homes[a.id] < 0) continue;
    const cand = cats
      .filter((b) => b !== a && b.buddy < 0 && homes[b.id] >= 0 && Math.hypot(b.loaf[0] - a.loaf[0], b.loaf[1] - a.loaf[1]) < 320)
      .sort((p, q) => Math.hypot(p.loaf[0] - a.loaf[0], p.loaf[1] - a.loaf[1]) - Math.hypot(q.loaf[0] - a.loaf[0], q.loaf[1] - a.loaf[1]));
    for (const b of cand) {
      const nodes = shortest(g, homes[a.id], homes[b.id], 420);
      if (!nodes || nodes.length < 2) continue;
      // 경로 길이의 절반 지점 노드에서 만난다
      let acc = 0;
      const seg: number[] = [0];
      for (let i = 1; i < nodes.length; i++) seg.push((acc += Math.hypot(g.nx[nodes[i] * 2] - g.nx[nodes[i - 1] * 2], g.nx[nodes[i] * 2 + 1] - g.nx[nodes[i - 1] * 2 + 1])));
      let m = 0;
      while (m < nodes.length - 1 && seg[m] < acc / 2) m++;
      const pa = walkPath(a, nodes.slice(0, m + 1));
      const pb = walkPath(b, nodes.slice(m).reverse());
      const meetT = Math.max(pa.len, pb.len) / PACE + 5;
      if (2 * meetT + PLAY > SLOT - 30) continue; // 오가고 노는 일이 한 칸 안에 끝나야 한다
      a.buddy = b.id;
      b.buddy = a.id;
      a.meet = pa;
      b.meet = pb;
      a.meetT = b.meetT = meetT;
      break;
    }
  }
  return cats;
}

/** 급식소 자리들(겹치지 않게) */
export function feeders(cats: CatDef[]): [number, number][] {
  const out: [number, number][] = [];
  for (const c of cats) if (c.feed && !out.some(([x, z]) => x === c.feed!.at[0] && z === c.feed!.at[1])) out.push(c.feed.at);
  return out;
}

type Act = 'nap' | 'groom' | 'feed' | 'patrol' | 'play';

/** 칸 k 의 밤 정도(칸 가운데 시각 기준이라 한 칸 안에서는 바뀌지 않는다) */
const nightOf = (k: number, doy: number) => 1 - smooth(0, 4, sunAngles(k * SLOT + SLOT / 2, doy).elev);

function activity(c: CatDef, k: number, doy: number): Act {
  const night = nightOf(k, doy) > 0.5;
  // 짝끼리는 같은 값을 쓰므로 두 마리가 함께 놀러 나간다
  if (c.buddy >= 0 && c.meet && hash01(Math.min(c.id, c.buddy) * 613 + k * 29 + 5) < (night ? 0.3 : 0.06)) return 'play';
  const r = hash01(c.id * 131 + k * 17 + 3);
  if (night) return r < 0.3 && c.feed ? 'feed' : r < 0.75 ? 'patrol' : 'nap';
  return r < 0.15 && c.feed ? 'feed' : r < 0.3 ? 'groom' : 'nap';
}

const tmp = [0, 0, 0];
const ta = [0, 0, 0];
const tb = [0, 0, 0];
/** 길 위 s 지점. 양 끝을 뺀 곳에서는 길 가장자리로 1m 붙는다. 방향은 앞뒤 2m 지점으로 구해 모퉁이에서도 부드럽게 돈다 */
function along(p: { line: Float32Array; cum: Float32Array }, s: number, len: number, back: boolean) {
  pointAt(p.line, p.cum, s, tmp);
  pointAt(p.line, p.cum, Math.max(0, s - 2), ta);
  pointAt(p.line, p.cum, s + 2, tb);
  const dir = Math.atan2(tb[2] - ta[2], tb[0] - ta[0]);
  const edge = Math.max(0, Math.min(1, s / 4, (len - s) / 4));
  return { x: tmp[0] - Math.sin(dir) * edge, z: tmp[2] + Math.cos(dir) * edge, yaw: back ? dir + Math.PI : dir };
}

export function catAt(c: CatDef, now: Now): CatState {
  const k = Math.floor(now.tod / SLOT);
  const t = now.tod - k * SLOT;
  const act = activity(c, k, now.doy);
  const night = nightOf(k, now.doy) > 0.5;
  const rest = (status: string, pose: Pose = 0): CatState => ({ x: c.loaf[0], z: c.loaf[1], yaw: Math.PI / 2 - 0.4 + hash01(c.id * 3 + k) * 0.8, walk: 0, pose, status, alpha: 1 });
  /** 길 p 를 T초 동안 걸어 L 까지 간다(back 이면 되돌아온다). 시작·끝에서 천천히 */
  const walking = (p: { line: Float32Array; cum: Float32Array }, L: number, u: number, T: number, back: boolean, status: string): CatState => {
    const f = smooth(0, 1, u / T);
    const s = (back ? 1 - f : f) * L;
    const a = along(p, s, L, back);
    return { ...a, walk: Math.min(1, u / 1.5, (T - u) / 1.5), pose: 0, status, alpha: 1 };
  };

  if (act === 'nap') return rest(night ? '쉬는 중' : hash01(c.id * 131 + k) < 0.5 ? '식빵 굽는 중' : '낮잠 중');
  if (act === 'groom') return rest('그루밍 중', 4);
  if (act === 'feed') {
    const f = c.feed!;
    const T = f.len / PACE;
    if (t < T) return walking(f, f.len, t, T, false, '급식소로 가는 중');
    const end = along(f, f.len, f.len, false);
    if (t < T + EAT) return { ...end, walk: 0, pose: 2, status: '급식소에서 밥 먹는 중', alpha: 1 };
    if (t < T + EAT + DRINK) return { ...end, walk: 0, pose: 2, status: '물 마시는 중', alpha: 1 };
    if (t < 2 * T + EAT + DRINK) return walking(f, f.len, t - T - EAT - DRINK, T, true, '집으로 돌아가는 중');
    return rest('쉬는 중');
  }
  if (act === 'play') {
    const m = c.meet!;
    const L = Math.max(0, m.len - 0.55); // 만나는 곳 바로 앞에서 멈춰 마주 본다
    const T = L / PACE;
    if (t < T) return walking(m, L, t, T, false, '친구 고양이에게 가는 중');
    const end = along(m, L, L, false);
    if (t < c.meetT) return { ...end, walk: 0, pose: 1, status: '친구 고양이에게 가는 중', alpha: 1 };
    if (t < c.meetT + PLAY) return { ...end, walk: 0, pose: 3, status: '친구 고양이와 장난치는 중', alpha: 1 };
    if (t < c.meetT + PLAY + T) return walking(m, L, t - c.meetT - PLAY, T, true, '집으로 돌아가는 중');
    return rest('쉬는 중');
  }
  // 순찰: 칸의 38% 동안 나가고, 12% 동안 살피고, 38% 동안 돌아온다
  const L = Math.min(c.cum[c.cum.length - 1], 0.42 * 0.38 * SLOT);
  const W = 0.38 * SLOT;
  const p = { line: c.route, cum: c.cum };
  if (t < W) return walking(p, L, t, W, false, '영역 순찰 중');
  if (t < W + 0.12 * SLOT) return { ...along(p, L, L, false), walk: 0, pose: 1, status: '주변을 살피는 중', alpha: 1 };
  if (t < 2 * W + 0.12 * SLOT) return walking(p, L, t - W - 0.12 * SLOT, W, true, '영역 순찰 중');
  return rest('쉬는 중');
}
