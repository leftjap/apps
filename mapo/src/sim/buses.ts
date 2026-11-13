// 버스 노선. 구운 노선(도로 조각 열)을 차 그래프의 구간 열로 바꾸고, 종류와 시간대로 배차 간격을 정한다.
// 버스는 차 시뮬레이션 안에서 다른 차와 함께 달린다(cars.ts).
import type { BusRun } from '../data/board.ts';
import type { Edge } from './graph.ts';

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
