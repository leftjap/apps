import type { makeCars } from '../sim/cars.ts';
import type { SignalPlan } from '../sim/intersection/signal.ts';
import { makePeople, type Portal } from '../sim/people/index.ts';
import type { Now } from '../sim/clock.ts';
import { pick, rng } from '../sim/rng.ts';
import { makeSimProvider } from '../sim/provider.ts';
import { decodeWalk, LINK_N, type WalkGraph, type WalkJson } from '../sim/walknet.ts';
import { crossingCourses } from './hapjeong-walk-trial.ts';
import type { HapjeongCars, XZ } from './hapjeong-car-graph.ts';

export type HapjeongPortal = Portal & { origin: XZ };
export type HapjeongWalk = WalkJson & { crossings: string[]; portals: HapjeongPortal[] };
export type HapjeongPeopleInput = { walk: HapjeongWalk; signalTest?: boolean };

export function hapjeongCrossings(asset: HapjeongWalk, crossings: HapjeongCars['crosswalks'], signals: SignalPlan, groups: readonly string[][] = []) {
  const byId = new Map(crossings.map((c, i) => [c.id, i]));
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
  }
  return {
    graph: decodeWalk({ ...asset, x }), omitted, signals,
    signalPairs: groups.map(group => group.map(id => byId.get(id)!)),
    walkLeft: (xw: number, tod: number) => crossings[xw].sig ? signals.walkLeft(xw, tod) : -1,
  };
}

function portalRoutes(graph: WalkGraph, portals: HapjeongPortal[]) {
  const nodes = portals.map(portal => graph.nearest(portal.x, portal.z));
  const edges = graph.adj.map((row, a) => row.map(b => ({
    b, crossing: -1, cost: Math.hypot(graph.nx[a*2]-graph.nx[b*2], graph.nx[a*2+1]-graph.nx[b*2+1]),
  })));
  for (const link of graph.links) {
    const cost = 12 + Math.hypot(link.ax-link.pax, link.az-link.paz) +
      Math.hypot(link.bx-link.ax, link.bz-link.az) + Math.hypot(link.pbx-link.bx, link.pbz-link.bz);
    edges[link.na].push({ b:link.nb, cost, crossing:link.xw });
    edges[link.nb].push({ b:link.na, cost, crossing:link.xw });
  }
  return nodes.map((source, from) => {
    const distances = new Float64Array(edges.length).fill(Infinity);
    const visited = new Uint8Array(edges.length);
    const previous = new Int32Array(edges.length).fill(-1);
    const stripe = new Int32Array(edges.length).fill(-1);
    distances[source] = 0;
    // The local graph is small. Positive lengths keep each trip on an acyclic
    // route and let us identify destinations omitted by the live signal plan.
    for (;;) {
      let a = -1, best = Infinity;
      for (let k = 0; k < distances.length; k++) {
        if (!visited[k] && distances[k] < best) { a = k; best = distances[k]; }
      }
      if (a < 0) break;
      visited[a] = 1;
      for (const { b, cost, crossing } of edges[a]) {
        if (best + cost >= distances[b]) continue;
        distances[b] = best + cost;
        previous[b] = a;
        stripe[b] = crossing;
      }
    }
    return nodes.flatMap((n, to) => {
      if (to === from || !Number.isFinite(distances[n]) || distances[n] <= 1) return [];
      const stripes = new Set<number>();
      for (let node = n; node !== source && node >= 0; node = previous[node])
        if (stripe[node] >= 0) stripes.add(stripe[node]);
      return [{ from, to, cost:distances[n], stripes }];
    }).sort((a,b) => a.cost-b.cost);
  });
}

export const HAPJEONG_PEOPLE_MAX = 64;

export function makeHapjeongPeople(input: HapjeongPeopleInput, crossings: ReturnType<typeof hapjeongCrossings>,
                                   cars: ReturnType<typeof makeCars>, busy: Uint32Array, start = 14 * 3600) {
  const { portals } = input.walk;
  const { graph, walkLeft, signalPairs } = crossings;
  const trial = input.signalTest ? crossingCourses(graph, signalPairs, crossings.signals, start) : undefined;
  const people = makePeople(graph, trial ? [...portals, ...trial.portals] : portals, makeSimProvider(), 5,
    HAPJEONG_PEOPLE_MAX + (trial?.pending.length ?? 0), {
    cars: cars.cars, busy, walkLeft, traffic: cars.approaching,
  });
  const routes = portalRoutes(graph, portals);
  const portalAudit = portals.map((p,i) => ({ ...p, destinations: routes[i].map(row => portals[row.to].key) }));
  const froms = routes.flatMap((row,i) => row.length ? [i] : []);
  // Start the replay with a real, shortest trip across each divided
  // crossing in both directions. Subsequent trips rotate through all exits.
  const trips = routes.flat();
  const firstTrips = signalPairs.flatMap(pair => {
    const candidates = trips.filter(route => pair.every(x => route.stripes.has(x)));
    candidates.sort((a,b) => a.cost-b.cost);
    const first = candidates[0];
    return first ? candidates.filter(route => (route.from === first.from && route.to === first.to) ||
      (route.from === first.to && route.to === first.from)) : [];
  });
  const journeys = new Map<number, { from: string; to: string; tod: number }>();
  const rand = rng(5);
  let untilNext = 0;
  let cursor = 0;
  const dockIndices = new Map(people.docks.map((dock, i) => [dock.key, i]));
  function advance(dt: number, now: Now) {
    people.step(dt, now, false);
    if (trial) {
      const present = new Set(people.w.id.subarray(0,people.w.n));
      for (const id of trial.active.keys()) if (!present.has(id)) trial.active.delete(id);
      for (let i = 0; i < trial.pending.length; i++) {
        const probe = trial.pending[i];
        if (now.tod < probe.at) continue;
        const { keys } = trial.courses[probe.course];
        const id = people.trip(dockIndices.get(keys[probe.side]) ?? -1, dockIndices.get(keys[1-probe.side]) ?? -1);
        if (id < 0) {
          probe.at = now.tod + .5;
          continue;
        }
        const entry = {uid:id,course:probe.course,wave:probe.wave,side:probe.side,at:now.tod-start};
        trial.walkers.push(entry);
        trial.active.set(id,entry);
        trial.pending.splice(i--,1);
      }
    }
    untilNext -= dt;
    if (untilNext > 0 || !froms.length) return;
    if (trial && people.w.n-trial.active.size >= HAPJEONG_PEOPLE_MAX) return;
    const earlier = firstTrips.shift();
    const nearby = earlier ? [earlier] : routes[froms[cursor++ % froms.length]].slice(0, 5);
    const { from, to } = nearby[pick(nearby.map(row => 1 / (30 + row.cost)), rand())];
    const id = people.trip(dockIndices.get(portals[from].key) ?? -1, dockIndices.get(portals[to].key) ?? -1);
    if (id >= 0) journeys.set(id, { from:portals[from].key, to:portals[to].key, tod:now.tod });
    untilNext = 1.5 + 1.1 * rand();
  }
  cars.setPeople(people.w);
  return { ...people, advance, portalAudit, journeys, crossingTrial:trial };
}
