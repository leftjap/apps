// 버스 노선. 구운 노선(도로 조각 열)을 차 그래프의 구간 열로 바꾸고, 종류와 시간대로 배차 간격을 정한다.
// 버스는 차 시뮬레이션 안에서 다른 차와 함께 달린다(cars.ts).
import type { BusRun } from '../data/board.ts';
import { headingAt, pointAt } from '../poly.ts';
import { LANE, type Edge } from './graph.ts';

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
}

export function makeBusRoutes(runs: BusRun[], edges: Edge[]): BusRoute[] {
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
    const keep = run.stops.map((s, i) => [s, i] as const).filter(([s]) => s < len);
    out.push({ ref: run.ref, kind: run.kind, to: run.to, edges: ids, start, len, stops: keep.map(([s]) => s), stopNames: keep.map(([, i]) => run.stopNames[i]) });
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
 * 25m 안에 있는 같은 이름의 정류장은 여러 노선이 함께 쓰는 하나로 합친다.
 */
export function busStopPortals(routes: BusRoute[], edges: Edge[]) {
  const portals: { kind: 'stop'; key: string; x: number; z: number; name: string }[] = [];
  const keys = new Map<string, string>();
  const tmp = [0, 0, 0];
  routes.forEach((R, r) =>
    R.stops.forEach((s, k) => {
      let e = 0;
      while (e < R.edges.length - 1 && R.start[e + 1] <= s) e++;
      const edge = edges[R.edges[e]];
      const seg = pointAt(edge.p, edge.cum, s - R.start[e], tmp);
      const yaw = headingAt(edge.p, seg);
      const curb = edge.off0 + edge.lanes * LANE + 1.2;
      const x = tmp[0] - Math.sin(yaw) * curb;
      const z = tmp[2] + Math.cos(yaw) * curb;
      const name = R.stopNames[k];
      let p = portals.find((q) => q.name === name && Math.hypot(q.x - x, q.z - z) < 25);
      if (!p) portals.push((p = { kind: 'stop', key: `stop-${portals.length}`, x, z, name }));
      keys.set(`${r}:${k}`, p.key);
    }),
  );
  return { portals, keyOf: (r: number, k: number) => keys.get(`${r}:${k}`) ?? '' };
}
