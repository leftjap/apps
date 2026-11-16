// 버스 노선. 구운 노선(도로 조각 열)을 차 그래프의 구간 열로 바꾸고, 종류와 시간대로 배차 간격을 정한다.
// 버스는 차 시뮬레이션 안에서 다른 차와 함께 달린다(cars.ts).
// 중앙버스전용차로가 있는 구간에서는 마을버스가 아닌 버스가 중앙버스차로로 달리고, 서울시 버스정류소 위치정보의 중앙차로 정류장(길 가운데 승강장)에만 선다.
import type { BusRun, Crosswalk } from '../data/board.ts';
import { MED_STOPS } from '../data/medStops.ts';
import { headingAt, pointAt } from '../poly.ts';
import { ISLAND_BACK, ISLAND_L, ISLAND_W, leftEdge, rightEdge, type Edge } from './graph.ts';

/** 서울 시내버스 도색 */
export const BUS_KINDS = [
  { name: '간선버스', color: '#3a6fd6' },
  { name: '지선버스', color: '#3daa47' },
  { name: '광역버스', color: '#e2383a' },
  { name: '마을버스', color: '#a8d43c' },
];

export interface BusRoute {
  ref: string;
  kind: number;
  to: string;
  /** 차 구간 id 열 */
  edges: number[];
  /** 구간마다 노선 위에서 시작하는 거리(m) */
  start: number[];
  len: number;
  stops: number[];
  stopNames: string[];
  /** 정류장마다 중앙 정류장(길 가운데 승강장)인가 */
  med: boolean[];
  /** 중앙버스차로가 있는 구간에서 그 차로로 달리는가(마을버스는 길가 차로로 달린다) */
  usesMed: boolean;
}

/** 마을버스 종류 번호 */
const VILLAGE = 3;

/** 구간 e 위에 점 (x, z)를 내린 자리: [구간 시작에서 거리, 진행 방향 오른쪽으로 떨어진 거리] */
function project(e: Edge, x: number, z: number): [number, number] {
  let best = Infinity;
  let along = 0;
  let lat = 0;
  for (let k = 0; k + 3 < e.p.length; k += 3) {
    const ax = e.p[k];
    const az = e.p[k + 2];
    const dx = e.p[k + 3] - ax;
    const dz = e.p[k + 5] - az;
    const L = Math.hypot(dx, dz) || 1;
    const u = Math.max(0, Math.min(L, ((x - ax) * dx + (z - az) * dz) / L));
    const px = ax + (dx / L) * u;
    const pz = az + (dz / L) * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      along = e.cum[k / 3] + u;
      lat = ((x - ax) * -dz + (z - az) * dx) / L;
    }
  }
  return [along, lat];
}

export function makeBusRoutes(runs: BusRun[], edges: Edge[], medStops: [string, string, number, number][] = MED_STOPS, crosswalks: Crosswalk[] = []): BusRoute[] {
  const tmp = [0, 0, 0];
  const byRoad = new Map<string, number>();
  for (const e of edges) byRoad.set(`${e.road}${e.rev ? '-' : '+'}`, e.id);
  const out: BusRoute[] = [];
  for (const run of runs) {
    const ids: number[] = [];
    for (const v of run.segs) {
      const id = byRoad.get(`${Math.abs(v) - 1}${v < 0 ? '-' : '+'}`);
      if (id === undefined) break; // 굽기에서 이어진 조각만 내보내므로 생기지 않지만, 생기면 거기서 끊는다
      ids.push(id);
    }
    if (!ids.length) continue;
    const start: number[] = [];
    let len = 0;
    for (const id of ids) {
      start.push(len);
      len += edges[id].len;
    }
    const usesMed = run.kind !== VILLAGE;
    /** 노선 위 거리 s 의 구간 */
    const edgeAt = (s: number) => {
      let k = 0;
      while (k < ids.length - 1 && start[k + 1] <= s) k++;
      return edges[ids[k]];
    };
    // 중앙버스차로로 달리는 구간에서는 길가 정류장에 설 수 없다
    const stops: [number, string, boolean][] = run.stops
      .map((s, i) => [s, run.stopNames[i], false] as [number, string, boolean])
      .filter(([s]) => s < len && !(usesMed && edgeAt(s).med));
    // 길가 정류장: 선 버스 몸통(가장 긴 버스 12m 의 반)이 이 길을 가로지르는 횡단보도 칠에 걸치면 횡단보도 앞(가운데가 횡단보도를
    // 지났으면 뒤)으로 민다. 앞문이 칠 위에 놓이면 타러 가는 사람이 횡단보도로 들어선다
    const marks: [number, number][] = []; // [노선 위 거리, 버스 가운데가 떨어져야 할 거리]
    ids.forEach((id, k) => {
      const e = edges[id];
      for (const c of crosswalks) {
        if (Math.hypot(c.x - e.p[0], c.z - e.p[2]) > e.len + 25) continue;
        const [ac, lc] = project(e, c.x, c.z);
        if (Math.abs(lc) > 20 || ac <= 0 || ac >= e.len) continue;
        const yaw = headingAt(e.p, pointAt(e.p, e.cum, ac, tmp));
        if (Math.abs(Math.cos(yaw) * c.ux + Math.sin(yaw) * c.uz) > Math.SQRT1_2) continue; // 이 길과 나란한 횡단보도(옆 골목을 건넌다)
        marks.push([start[k] + ac, c.wid / 2 + 6]);
      }
    });
    for (const q of stops)
      for (let guard = 0; guard < 3; guard++) {
        const m = marks.find(([at, r]) => Math.abs(q[0] - at) < r);
        if (!m) break;
        q[0] = Math.max(0.5, Math.min(len - 0.5, m[0] >= q[0] ? m[0] - m[1] : m[0] + m[1]));
      }
    // 중앙 정류장: 이 노선이 중앙버스차로로 지나는 구간의 일반 차로 왼쪽 가장자리 바로 밖(분리대 위 6m 안)에 있는 것
    if (usesMed)
      for (const [, name, x, z] of medStops) {
        let best = 6;
        let at = -1;
        let on = -1;
        ids.forEach((id, k) => {
          const e = edges[id];
          if (!e.med) return;
          const [along, lat] = project(e, x, z);
          const miss = Math.abs(lat - (leftEdge(e, along) - 0.25 - ISLAND_W / 2));
          if (along > 0.5 && along < e.len - 0.5 && miss < best) (best = miss), (at = along), (on = k);
        });
        if (on < 0) continue;
        // 승강장(정차 자리 뒤 ISLAND_BACK 가 가운데, 길이 ISLAND_L)이 횡단보도에 걸치면 횡단보도 앞에서 끝나게 민다. 사람은 횡단보도 끝에서 승강장에 오른다
        const e = edges[ids[on]];
        for (const c of crosswalks) {
          const [ac, lc] = project(e, c.x, c.z);
          if (Math.abs(lc) > 20 || ac <= 0 || ac >= e.len) continue;
          const pad = c.wid / 2 + 0.5;
          const lo = at - ISLAND_BACK - ISLAND_L / 2;
          const hi = at - ISLAND_BACK + ISLAND_L / 2;
          if (ac + pad <= lo || ac - pad >= hi) continue;
          at = ac > at - ISLAND_BACK ? ac - pad - (ISLAND_L / 2 - ISLAND_BACK) : ac + pad + ISLAND_L / 2 + ISLAND_BACK;
        }
        stops.push([start[on] + Math.max(0.5, Math.min(e.len - 0.5, at)), name, true]);
      }
    stops.sort((a, b) => a[0] - b[0]);
    out.push({ ref: run.ref, kind: run.kind, to: run.to, edges: ids, start, len, stops: stops.map((q) => q[0]), stopNames: stops.map((q) => q[1]), med: stops.map((q) => q[2]), usesMed });
  }
  return out;
}

/** [출퇴근, 낮, 밤 늦게] 배차 간격(초). 화면에 보이는 대수를 맞추려고 실제보다 조금 넉넉하게 잡는다 */
const HEADWAY: [number, number, number][] = [
  [360, 540, 840],
  [420, 600, 900],
  [600, 900, 1200],
  [540, 720, 1080],
];

/** 이 시각의 배차 간격(초). 0이면 다니지 않는다 */
export function busHeadway(r: { kind: number; ref: string }, tod: number): number {
  const h = tod / 3600;
  if (/^N/.test(r.ref)) return h >= 23.5 || h < 4.5 ? 1500 : 0;
  if (r.kind === 3 ? h >= 23.5 || h < 5.5 : h >= 0.67 && h < 4.5) return 0;
  const [peak, day, late] = HEADWAY[r.kind] ?? HEADWAY[1];
  if ((h >= 7 && h < 9.5) || (h >= 17.5 && h < 20)) return peak;
  if (h >= 22 || h < 6) return late;
  return day;
}

/**
 * 버스 정류장을 사람이 타고 내리는 곳으로 바꾼다. 정류장 자리는 그 구간의 진행 방향 오른쪽 보도이고,
 * 중앙 정류장은 일반 차로 왼쪽 가장자리 밖 분리대 위 승강장 가운데다(버스는 그 왼쪽 중앙버스차로에 서서 오른쪽 문을 연다).
 * 25m 안에 있는 같은 이름·같은 종류의 정류장은 여러 노선이 함께 쓰는 하나로 합친다.
 */
export function busStopPortals(routes: BusRoute[], edges: Edge[]) {
  const portals: { kind: 'stop'; key: string; x: number; z: number; name: string; yaw: number; median: boolean }[] = [];
  const keys = new Map<string, string>();
  const tmp = [0, 0, 0];
  routes.forEach((R, r) =>
    R.stops.forEach((s, k) => {
      let e = 0;
      while (e < R.edges.length - 1 && R.start[e + 1] <= s) e++;
      const edge = edges[R.edges[e]];
      const seg = pointAt(edge.p, edge.cum, s - R.start[e], tmp);
      const yaw = headingAt(edge.p, seg);
      const median = R.med[k];
      const at = s - R.start[e];
      const off = median ? leftEdge(edge, at) - 0.25 - ISLAND_W / 2 : rightEdge(edge, at) + edge.lw / 2 + 1.2;
      const x = tmp[0] - Math.sin(yaw) * off;
      const z = tmp[2] + Math.cos(yaw) * off;
      const name = R.stopNames[k];
      let p = portals.find((q) => q.name === name && q.median === median && Math.hypot(q.x - x, q.z - z) < 25);
      if (!p) portals.push((p = { kind: 'stop', key: `stop-${portals.length}`, x, z, name, yaw, median }));
      keys.set(`${r}:${k}`, p.key);
    }),
  );
  return { portals, keyOf: (r: number, k: number) => keys.get(`${r}:${k}`) ?? '' };
}
