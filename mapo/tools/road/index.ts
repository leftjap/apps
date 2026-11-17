// 길 정본 굽기(설계 문서 51절): 판의 도로 조각과 서울시 차선(자르기 전 땅 위 선)으로 public/data/road.json 을 만든다.
// 1 선 읽기(read.ts) → 2 차로 정하기(src/sim/lanes.ts resolveLanes: 선 없는 방향 채우기·중앙버스차로·마주 오는 찻길 떼어 놓기·정본 제약) → 파일.
import type { Crosswalk, Road } from '../../src/data/board.ts';
import type { MarkLine } from '../../src/data/marks.ts';
import { encodeLanes, type CanonLanes, type DirLanes, type RoadJson, type RoadLanes } from '../../src/data/road.ts';
import { resolveLanes } from '../../src/sim/lanes.ts';
import { readLanes } from './read.ts';

/** json: road.json 문자열, canon: 정본 차로, reads: 서울시 선으로 읽은 그대로의 차로(화살표 옮기기가 쓴다) */
export function bakeRoad(roads: Road[], lines: MarkLine[], crosswalks: Crosswalk[], stopLines: ArrayLike<number>): { json: string; canon: CanonLanes; reads: RoadLanes; log: string } {
  const r = readLanes(roads, lines);
  // W14~W22 는 읽은 차로를 파일(lanes.json, 거리 dm·옆 거리 cm)로 적은 뒤 실행 중에 채웠다. 차 움직임이 그때와 같게 같은 정밀도로 둔 읽기에서 정한다
  const dm = (v: number) => Math.round(v * 10) / 10;
  const cm = (v: number) => Math.round(v * 100) / 100;
  const reads: RoadLanes = r.lanes.map((d) => (d ? (d.map((x) => (x ? { a: dm(x.a), b: dm(x.b), runs: x.runs.map((q) => ({ s0: dm(q.s0), s1: dm(q.s1), n: q.n, st: q.st.map(dm), off: q.off.map(cm), med: q.med.map(cm) })) } : null)) as [DirLanes | null, DirLanes | null]) : null));
  const canon = resolveLanes(roads, reads, { crosswalks, stopLines });
  const out: RoadJson = { v: 1, lanes: encodeLanes(canon) };
  const json = JSON.stringify(out);
  let runs = 0;
  for (const d of canon.dirs) for (const x of d ?? []) runs += x?.runs.length ?? 0;
  return { json, canon, reads, log: `길 정본: 차가 다니는 방향 ${r.dirs}개 가운데 서울시 선으로 읽은 것 ${r.read}개, 차로 수 구간 ${runs}개, road.json ${(json.length / 1e6).toFixed(2)}MB` };
}
