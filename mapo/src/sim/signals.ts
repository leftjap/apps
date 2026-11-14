// 신호 교차로. 중앙분리대가 있는 길은 OSM 에서 한 방향씩 따로 그려져 한 교차로가 노드 여러 개로 나뉘므로, 35m 안의 교차 노드를 하나로 묶는다.
// 묶음으로 들어오는 길을 방향에 따라 두 무리로 나누고, 90초 주기로 번갈아 초록불을 준다. 신호는 시각만의 함수다.
// 신호를 둘 곳: 횡단보도 자료가 있으면 보행 신호 횡단보도(자치구 횡단보도 정보의 보행등)가 25m 안에 있는 교차로와,
// 교차로가 아닌 곳의 보행 신호 횡단보도(굽기에서 그 자리에서 길 조각을 끊어 두었다). 자료가 없으면 큰길(주간선·보조간선)이 낀 교차로.
// 신호 시각은 실제와 다르다.
import type { Crosswalk } from '../data/board.ts';
import type { Edge } from './graph.ts';
import { makeJunctions } from './junctions.ts';
import { pointAt } from '../poly.ts';
import { hash01 } from './rng.ts';

export const GREEN = 0;
export const YELLOW = 1;
export const RED = 2;

const CYCLE = 90;
/** [무리 0 초록 끝, 노랑 끝, 전체 빨강 끝, 무리 1 초록 끝, 노랑 끝] (초) */
const PLAN = [40, 43, 45, 85, 88];
/** 길 중간 횡단보도처럼 무리 0 이 차, 무리 1 이 사람뿐인 신호: 차 60초, 사람 22초 */
const PLAN_WALK = [60, 63, 65, 87, 90];
/** 신호 사이를 달리는 차의 속도(m/s). 길 중간 신호는 바로 위쪽 교차로 신호에서 이 속도로 온 차가 초록불에 닿게 시각을 맞춘다 */
const WAVE = 11;
const JOIN = 35;
/** 보행 신호 횡단보도가 교차로 노드에서 이만큼 안이면 그 교차로 신호에 딸린다(굽기에서 길 조각을 끊는 기준과 같다) */
const NEAR = 25;

export interface Approach {
  /** 신호 묶음 번호 */
  c: number;
  /** 0 또는 1 */
  group: number;
  /** 구간 끝(교차 노드)에서 정지선까지 거리(m) */
  setback: number;
  /** 구간 끝에서 횡단보도 가운데까지 거리(m) */
  crosswalk: number;
}

export interface SignalSite {
  x: number;
  z: number;
  /** 무리 0 의 방향(라디안, 0~π) */
  axis: number;
  offset: number;
  /** 묶음에 속한 노드 좌표 열쇠들 */
  nodes: Set<string>;
  plan: number[];
}

/** 신호를 정할 때 쓰는 자료(구운 모형판의 횡단보도와 정지선) */
export interface SignalData {
  crosswalks: Crosswalk[];
  /** [x0, z0, x1, z1, ...] */
  stopLines: Float32Array;
}

/** 노드 좌표 열쇠(신호 묶음의 nodes 에 든 값) */
export const key = (x: number, z: number) => `${Math.round(x * 10)},${Math.round(z * 10)}`;
const endOf = (e: Edge) => [e.p[e.p.length - 3], e.p[e.p.length - 1]] as const;
const endHeading = (e: Edge) => {
  const n = e.p.length;
  return Math.atan2(e.p[n - 1] - e.p[n - 4], e.p[n - 3] - e.p[n - 6]);
};
/** 두 방향이 같은 축(평행 또는 반대)이면 0, 직각이면 π/2 */
const axisGap = (a: number, b: number) => {
  const d = Math.abs((((a - b) % Math.PI) + Math.PI) % Math.PI);
  return Math.min(d, Math.PI - d);
};

export function makeSignals(edges: Edge[], data?: SignalData) {
  const boxes = makeJunctions(edges);
  // 들어오는 길이 둘 이상의 서로 다른 도로인 노드 = 교차 노드
  const incoming = new Map<string, Edge[]>();
  for (const e of edges) {
    if (e.cls > 3) continue;
    const [x, z] = endOf(e);
    const k = key(x, z);
    (incoming.get(k) ?? incoming.set(k, []).get(k)!).push(e);
  }
  const junctions = [...incoming].filter(([, es]) => new Set(es.map((e) => e.road)).size >= 2).map(([k, es]) => ({ k, x: endOf(es[0])[0], z: endOf(es[0])[1] }));
  // 35m 안의 교차 노드를 묶는다
  const parent = junctions.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < junctions.length; i++)
    for (let j = i + 1; j < junctions.length; j++)
      if (Math.hypot(junctions[i].x - junctions[j].x, junctions[i].z - junctions[j].z) < JOIN) parent[find(i)] = find(j);
  const groups = new Map<number, typeof junctions>();
  junctions.forEach((jn, i) => (groups.get(find(i)) ?? groups.set(find(i), []).get(find(i))!).push(jn));

  const list: SignalSite[] = [];
  const approach = new Map<number, Approach>();
  const sigXw = (data?.crosswalks ?? []).map((c, i) => ({ c, i })).filter(({ c }) => c.sig);
  /** 교차로 노드들(묶음) 가운데 하나에서 NEAR 안에 보행 신호 횡단보도가 있는가 */
  const signalled = (pts: { x: number; z: number }[]) =>
    sigXw.some(({ c }) => pts.some((p) => Math.hypot(c.x - p.x, c.z - p.z) < NEAR + c.half * 0.5));
  /** 들어오는 구간 e 의 정지선: 정지선 자료 → 이 구간 위 횡단보도 → 가로지르는 길 폭으로 어림 */
  const setbackOf = (e: Edge, guess: number) => {
    const stops = data?.stopLines ?? new Float32Array();
    const n = e.p.length;
    const P = [0, 0, 0];
    let best = -1;
    for (let k = 0; k < stops.length; k += 4) {
      const mx = (stops[k] + stops[k + 2]) / 2;
      const mz = (stops[k + 1] + stops[k + 3]) / 2;
      if (Math.hypot(mx - e.p[n - 3], mz - e.p[n - 1]) > 50) continue;
      const lx = stops[k + 2] - stops[k];
      const lz = stops[k + 3] - stops[k + 1];
      const ll = Math.hypot(lx, lz) || 1;
      // 정지선 가운데를 구간에 내려 진행 거리와 옆 거리를 잰다
      for (let s = Math.max(0, e.len - 46); s <= e.len - 1; s += 1) {
        const seg = pointAt(e.p, e.cum, s, P);
        const hx = e.p[seg * 3 + 3] - e.p[seg * 3];
        const hz = e.p[seg * 3 + 5] - e.p[seg * 3 + 2];
        const hl = Math.hypot(hx, hz) || 1;
        const along = ((mx - P[0]) * hx + (mz - P[2]) * hz) / hl;
        if (Math.abs(along) > 0.5) continue;
        const lat = ((mx - P[0]) * -hz + (mz - P[2]) * hx) / hl;
        const cos = Math.abs((lx * hx + lz * hz) / (ll * hl));
        const lo = e.off0 - e.lw;
        const hi = e.off0 + e.lanes * e.lw + 0.5;
        // 이 방향 차로를 가로지르는 정지선(차로 가운데 쪽 절반이 이 방향 차로에 걸친다)
        if (cos < 0.45 && lat > lo - ll / 2 && lat < hi + ll / 2 && Math.min(hi, lat + ll / 2) - Math.max(lo, lat - ll / 2) > 1) best = Math.max(best, s);
        break;
      }
    }
    if (best >= 0) return Math.max(2, e.len - best);
    // 이 구간 위 보행 신호 횡단보도(축이 지나는 꼭짓점)
    for (const { c } of sigXw)
      for (let k = 0; k < c.verts.length; k += 2)
        for (let v = n - 3; v >= 0 && e.len - e.cum[v / 3] < 46; v -= 3)
          if (Math.abs(e.p[v] - c.verts[k]) < 0.05 && Math.abs(e.p[v + 2] - c.verts[k + 1]) < 0.05) return Math.max(2, e.len - e.cum[v / 3] + c.wid / 2 + 1);
    return guess;
  };
  for (const members of groups.values()) {
    const nodes = new Set(members.map((m) => m.k));
    // 묶음 밖에서 들어오는 길(간선도로·고속 진입로는 신호를 받지 않는다)
    const into = edges.filter((e) => e.cls >= 1 && e.cls <= 3 && nodes.has(key(...endOf(e))) && !nodes.has(key(e.p[0], e.p[2])));
    if (into.length < 3 || (data ? !signalled(members) : !into.some((e) => e.cls <= 2))) continue;
    const main = [...into].sort((a, b) => a.cls - b.cls || b.lanes - a.lanes)[0];
    const axis = ((endHeading(main) % Math.PI) + Math.PI) % Math.PI;
    const g = into.map((e) => (axisGap(endHeading(e), axis) < Math.PI / 4 ? 0 : 1));
    // 한 방향으로만 합류하는 곳: 자료가 없으면 신호를 두지 않고, 자료가 있으면 차는 모두 무리 0, 무리 1 은 사람만 건넌다
    const walkOnly = !g.includes(1);
    if (!data && walkOnly) continue;
    const c = list.length;
    list.push({
      x: members.reduce((s, m) => s + m.x, 0) / members.length,
      z: members.reduce((s, m) => s + m.z, 0) / members.length,
      axis,
      offset: hash01(c * 7.31 + 1) * CYCLE,
      nodes,
      plan: walkOnly ? PLAN_WALK : PLAN,
    });
    into.forEach((e, i) => {
      // 가로지르는 길의 절반 폭 바깥에 횡단보도(폭 3.2m)를 두고, 그 앞에 정지선을 둔다
      const cross = (incoming.get(key(...endOf(e))) ?? []).filter((o) => axisGap(endHeading(o), endHeading(e)) > Math.PI / 4);
      const half = Math.max(3, ...cross.map((o) => (o.off0 > 0 ? o.lanes * o.lw : (o.lanes * o.lw) / 2)));
      // 비스듬히 만나는 길은 교차로 상자가 길어지므로 정지선을 상자 앞까지 물린다
      const guess = Math.min(e.len - 2, Math.max(half + 4, boxes.rIn[e.id] + 0.5));
      approach.set(e.id, { c, group: g[i], crosswalk: half + 1.6, setback: Math.min(e.len - 2, Math.max(setbackOf(e, guess), boxes.rIn[e.id] + 0.5)) });
    });
  }
  // 교차로가 아닌 곳의 보행 신호 횡단보도: 그 꼭짓점에서 끝나는 큰길 구간들(교차로 신호에 이미 딸린 것은 빼고)
  const crossSite = new Int32Array(data?.crosswalks.length ?? 0).fill(-1);
  const ends = new Map<string, Edge[]>();
  for (const e of edges) if (e.cls <= 3) (ends.get(key(...endOf(e))) ?? ends.set(key(...endOf(e)), []).get(key(...endOf(e)))!).push(e);
  for (const { c: xw, i } of sigXw) {
    for (let k = 0; k < xw.verts.length; k += 2) {
      const vk = key(xw.verts[k], xw.verts[k + 1]);
      const into = (ends.get(vk) ?? []).filter((e) => !approach.has(e.id) && e.cls >= 1);
      if (!into.length) continue;
      let c = list.findIndex((s) => s.nodes.has(vk));
      if (c < 0) {
        // 두 단 횡단보도처럼 한 횡단보도가 지나는 꼭짓점들은 한 신호로 묶는다
        c = crossSite[i] >= 0 ? crossSite[i] : list.length;
        if (c === list.length)
          list.push({ x: xw.x, z: xw.z, axis: ((endHeading(into[0]) % Math.PI) + Math.PI) % Math.PI, offset: hash01(c * 7.31 + 1) * CYCLE, nodes: new Set(), plan: PLAN_WALK });
        list[c].nodes.add(vk);
      }
      crossSite[i] = c;
      for (const e of into) approach.set(e.id, { c, group: 0, crosswalk: xw.wid / 2, setback: Math.min(e.len - 2, setbackOf(e, xw.wid / 2 + 1)) });
    }
  }
  // 길 중간 신호의 시각 맞추기: 들어오는 구간을 거슬러 올라가(같은 이름 길 먼저, 400m 안) 처음 만나는 교차로 신호의
  // 그 방향 초록불이 켜진 뒤 차가 닿는 때에 이 신호의 차 초록불이 켜지게 한다
  const prev: number[][] = edges.map(() => []);
  for (const e of edges) for (const n of e.next) prev[n].push(e.id);
  list.forEach((site, c) => {
    if (site.plan !== PLAN_WALK) return;
    const first = [...approach].find(([, ap]) => ap.c === c);
    if (!first) return;
    let cur = edges[first[0]];
    let ahead = cur.len;
    for (let k = 0; k < 12 && ahead < 400; k++) {
      const ps = prev[cur.id].map((i) => edges[i]);
      if (!ps.length) break;
      const p = ps.find((q) => q.name && q.name === cur.name) ?? ps.sort((a, b) => b.lanes - a.lanes)[0];
      const ap = approach.get(p.id);
      if (ap && list[ap.c].plan === PLAN) {
        const start = ap.group === 0 ? 0 : PLAN[2];
        site.offset = (((list[ap.c].offset - start - ahead / WAVE) % CYCLE) + CYCLE) % CYCLE;
        break;
      }
      ahead += p.len;
      cur = p;
    }
  });
  // 교차로 신호에 딸린 보행 신호 횡단보도
  for (const { c: xw, i } of sigXw)
    if (crossSite[i] < 0) {
      let best = -1;
      let bd = NEAR + xw.half * 0.5;
      list.forEach((s, c) => {
        for (const k of s.nodes) {
          const [x, z] = k.split(',').map((v) => Number(v) / 10);
          const d = Math.hypot(xw.x - x, xw.z - z);
          if (d < bd) (bd = d), (best = c);
        }
      });
      crossSite[i] = best;
    }

  /** 묶음 c 의 무리 group 신호(GREEN·YELLOW·RED) */
  function state(c: number, group: number, tod: number): number {
    const u = (((tod + list[c].offset) % CYCLE) + CYCLE) % CYCLE;
    const P = list[c].plan;
    if (group === 0) return u < P[0] ? GREEN : u < P[1] ? YELLOW : RED;
    return u >= P[2] && u < P[3] ? GREEN : u >= P[3] && u < P[4] ? YELLOW : RED;
  }
  /** 좌표 (x, z)의 노드가 속한 신호 묶음(없으면 −1) */
  const siteAt = (x: number, z: number) => list.findIndex((s) => s.nodes.has(key(x, z)));
  // 묶음마다 노드 좌표(가까운 묶음 찾기용)
  const pts = list.map((s) => [...s.nodes].map((k) => k.split(',').map((v) => Number(v) / 10)));
  /** (x, z)에서 r(m) 안에 노드가 있는 신호 묶음(없으면 −1). 중앙분리대 있는 큰길처럼 노드가 여럿인 교차로의 가운데 노드도 잡는다 */
  const siteNear = (x: number, z: number, r = 25) => pts.findIndex((ps) => ps.some(([px, pz]) => Math.abs(px - x) < r && Math.abs(pz - z) < r && Math.hypot(px - x, pz - z) < r));
  /** 묶음 c 의 무리 group 초록불이 남은 시간(초). 초록불이 아니면 0 */
  function greenLeft(c: number, group: number, tod: number): number {
    const u = (((tod + list[c].offset) % CYCLE) + CYCLE) % CYCLE;
    const P = list[c].plan;
    if (group === 0) return u < P[0] ? P[0] - u : 0;
    return u >= P[2] && u < P[3] ? P[3] - u : 0;
  }
  /** 방향 h 로 걷는 사람·차가 속한 무리 */
  const groupOf = (c: number, h: number) => (axisGap(h, list[c].axis) < Math.PI / 4 ? 0 : 1);

  return { list, approach, state, greenLeft, siteAt, siteNear, groupOf, junctions: boxes, crossSite };
}

export type Signals = ReturnType<typeof makeSignals>;
