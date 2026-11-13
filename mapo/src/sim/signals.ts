// 신호 교차로. 큰길(주간선·보조간선)이 낀 교차로마다 신호를 하나 둔다.
// 중앙분리대가 있는 길은 OSM 에서 한 방향씩 따로 그려져 한 교차로가 노드 여러 개로 나뉘므로, 35m 안의 교차 노드를 하나로 묶는다.
// 묶음으로 들어오는 길을 방향에 따라 두 무리로 나누고, 90초 주기로 번갈아 초록불을 준다. 신호는 시각만의 함수다.
import { LANE, type Edge } from './graph.ts';
import { hash01 } from './rng.ts';

export const GREEN = 0;
export const YELLOW = 1;
export const RED = 2;

const CYCLE = 90;
/** [무리 0 초록 끝, 노랑 끝, 전체 빨강 끝, 무리 1 초록 끝, 노랑 끝] (초) */
const PLAN = [40, 43, 45, 85, 88];
const JOIN = 35;

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
}

const key = (x: number, z: number) => `${Math.round(x * 10)},${Math.round(z * 10)}`;
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

export function makeSignals(edges: Edge[]) {
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
  for (const members of groups.values()) {
    const nodes = new Set(members.map((m) => m.k));
    // 묶음 밖에서 들어오는 길(간선도로·고속 진입로는 신호를 받지 않는다)
    const into = edges.filter((e) => e.cls >= 1 && e.cls <= 3 && nodes.has(key(...endOf(e))) && !nodes.has(key(e.p[0], e.p[2])));
    if (into.length < 3 || !into.some((e) => e.cls <= 2)) continue;
    const main = [...into].sort((a, b) => a.cls - b.cls || b.lanes - a.lanes)[0];
    const axis = ((endHeading(main) % Math.PI) + Math.PI) % Math.PI;
    const g = into.map((e) => (axisGap(endHeading(e), axis) < Math.PI / 4 ? 0 : 1));
    if (!g.includes(0) || !g.includes(1)) continue; // 한 방향으로만 합류하는 곳
    const c = list.length;
    list.push({
      x: members.reduce((s, m) => s + m.x, 0) / members.length,
      z: members.reduce((s, m) => s + m.z, 0) / members.length,
      axis,
      offset: hash01(c * 7.31 + 1) * CYCLE,
      nodes,
    });
    into.forEach((e, i) => {
      // 가로지르는 길의 절반 폭 바깥에 횡단보도(폭 3.2m)를 두고, 그 앞에 정지선을 둔다
      const cross = (incoming.get(key(...endOf(e))) ?? []).filter((o) => axisGap(endHeading(o), endHeading(e)) > Math.PI / 4);
      const half = Math.max(3, ...cross.map((o) => (o.off0 > 0 ? o.lanes * LANE : (o.lanes * LANE) / 2)));
      approach.set(e.id, { c, group: g[i], crosswalk: half + 1.6, setback: Math.min(e.len - 2, half + 4) });
    });
  }

  /** 묶음 c 의 무리 group 신호(GREEN·YELLOW·RED) */
  function state(c: number, group: number, tod: number): number {
    const u = (((tod + list[c].offset) % CYCLE) + CYCLE) % CYCLE;
    if (group === 0) return u < PLAN[0] ? GREEN : u < PLAN[1] ? YELLOW : RED;
    return u >= PLAN[2] && u < PLAN[3] ? GREEN : u >= PLAN[3] && u < PLAN[4] ? YELLOW : RED;
  }
  /** 좌표 (x, z)의 노드가 속한 신호 묶음(없으면 −1) */
  const siteAt = (x: number, z: number) => list.findIndex((s) => s.nodes.has(key(x, z)));
  /** 방향 h 로 걷는 사람·차가 속한 무리 */
  const groupOf = (c: number, h: number) => (axisGap(h, list[c].axis) < Math.PI / 4 ? 0 : 1);

  return { list, approach, state, siteAt, groupOf };
}

export type Signals = ReturnType<typeof makeSignals>;
