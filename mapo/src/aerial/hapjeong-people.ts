import type { makeCars } from '../sim/cars.ts';
import type { SignalPlan } from '../sim/intersection/signal.ts';
import { makePeople, type Portal } from '../sim/people/index.ts';
import { makeSimProvider } from '../sim/provider.ts';
import { decodeWalk, LINK_N, type WalkGraph, type WalkJson } from '../sim/walknet.ts';
import type { HapjeongCars, XZ } from './hapjeong-car-graph.ts';

export type PeopleRehearsal = {
  people: { id: string; view: { at: XZ }; legs: { path: XZ[] }[] }[];
};

export type HapjeongWalk = WalkJson & { crossings: string[]; crossAreas?: number[][][][]; portals: Portal[] };
export type HapjeongPeopleInput = { walk: HapjeongWalk; rehearsal: PeopleRehearsal };

function inRing(ring: number[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const [a, b] = [ring[i + 1], ring[j + 1]];
    if ((a > z) !== (b > z) && x < ring[i] + (z - a) * (ring[j] - ring[i]) / (b - a)) inside = !inside;
  }
  return inside;
}

export function hapjeongCrossings(asset: HapjeongWalk, crossings: HapjeongCars['crosswalks'], signals: SignalPlan) {
  const byId = new Map(crossings.map((c, i) => [c.id, i]));
  const area = new Map<number, number[][][]>();
  const omitted: string[] = [];
  const x: number[] = [];
  for (let i = 0; i < asset.x.length; i += LINK_N) {
    const source = asset.x[i];
    const id = asset.crossings[source];
    const xw = byId.get(id);
    if (xw === undefined) throw Error(`보행망의 횡단 자료가 없습니다. ${id}`);
    if (crossings[xw].sig && (signals.crossSite[xw] < 0 || !signals.walkLen(xw))) {
      omitted.push(id);
      continue;
    }
    // Walk and car data span different subsets of the surveyed faces.
    // Remap the packed walk links so busy, signal and approaching all use the same index.
    x.push(xw, ...asset.x.slice(i + 1, i + LINK_N));
    if (asset.crossAreas) area.set(xw, asset.crossAreas[source]);
  }
  return {
    graph: decodeWalk({ ...asset, x }), omitted,
    walkLeft: (xw: number, tod: number) => crossings[xw].sig ? signals.walkLeft(xw, tod) : -1,
    crossingContains: asset.crossAreas && ((xw: number, x: number, z: number) =>
      area.get(xw)?.some(([outer, ...holes]) => inRing(outer, x, z) && !holes.some(ring => inRing(ring, x, z))) ?? false),
  };
}

function pavementPoint(graph: WalkGraph, [x, z]: XZ): XZ {
  const hit = graph.nearestEdge(x, z);
  if (!hit || hit[3] > 8) throw Error('보행 시험 출발점 또는 목적지가 보행망에 닿지 않습니다.');
  const [a, k, distance] = hit;
  const b = graph.adj[a][k];
  const ax = graph.nx[a * 2], az = graph.nx[a * 2 + 1];
  const dx = graph.nx[b * 2] - ax, dz = graph.nx[b * 2 + 1] - az;
  const t = distance / Math.hypot(dx, dz);
  return [ax + dx * t, az + dz * t];
}

export const HAPJEONG_PEOPLE_MAX = 64;

export function makeHapjeongPeople(input: HapjeongPeopleInput, crossings: ReturnType<typeof hapjeongCrossings>,
                                   cars: ReturnType<typeof makeCars>, busy: Uint32Array, focus: XZ) {
  const { walk, rehearsal } = input;
  const { graph, walkLeft, crossingContains } = crossings;
  const origins = rehearsal.people.map(row => pavementPoint(graph, row.legs[0].path[0]));
  const destinations = rehearsal.people.map(row => pavementPoint(graph, row.legs.at(-1)!.path.at(-1)!));
  const stops: Portal[] = destinations.map(([x, z], i) => ({ kind: 'stop', key: rehearsal.people[i].id, x, z }));
  const portals = walk.portals.filter(portal =>
    rehearsal.people.some(({ view }) => Math.hypot(portal.x - view.at[0], portal.z - view.at[1]) <= 48));
  const people = makePeople(graph, [...portals, ...stops], makeSimProvider(), 5, HAPJEONG_PEOPLE_MAX, {
    cars: cars.cars, busy, walkLeft, crossingContains,
    traffic: cars.approaching,
  });
  for (const [i, from] of origins.entries()) {
    const id = people.put(...from, ...destinations[i]);
    if (id < 0) throw Error(`보행 시험 출발점에 사람을 놓지 못했습니다. ${rehearsal.people[i].id}`);
    people.goHome(id, 1);
  }
  people.setFocus(...focus, 90);
  cars.setPeople(people.w);
  return people;
}
