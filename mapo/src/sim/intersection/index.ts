// 교차로와 신호(재작업 W20). 차(cars.ts)·사람(walkers.ts)·신호등 그림(render/signals.ts)이 이것 하나를 함께 쓴다.
import type { Edge } from '../graph.ts';
import { buildIntersections, type Intersections, type SurveyedIntersection } from './build.ts';
import { makeSignalPlan, type SignalData, type SignalPlan } from './signal.ts';

export * from './build.ts';
export * from './signal.ts';

export interface Inter {
  X: Intersections;
  S: SignalPlan;
}

/** 차 그래프와 신호 자료(횡단보도·정지선·신호등)로 교차로와 신호를 만든다 */
export function makeIntersections(edges: Edge[], data?: SignalData, surveyed?: SurveyedIntersection): Inter {
  const X = buildIntersections(edges, data?.crosswalks ?? [], data?.stopLines ?? new Float32Array(), surveyed);
  const S = makeSignalPlan(X, data);
  return { X, S };
}
