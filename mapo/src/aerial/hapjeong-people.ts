import type { Exit } from '../data/board.ts';
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
export type HapjeongWalk = WalkJson & { crossings: string[]; portals: HapjeongPortal[]; waitDepths?: [number,number][] };
export type HapjeongPlatform = { key: string; name: string; link: string; at: number; x: number; z: number; yaw: number };
export type HapjeongEntrances = {
  exits: (Exit & { key: string })[];
  station?: string | null;
  lines: { id: string; color: string }[];
  trains: number[];
  platforms: HapjeongPlatform[];
  doors: { key: string; x: number; z: number }[];
  busService?: { links: string[]; services: { ref: string; kind: number }[]; passengersPerBus: number; boundaryPassengersPerBus: number }[];
};
export type HapjeongPeopleInput = { walk: HapjeongWalk; signalTest?: boolean; entrances?: HapjeongEntrances };


export function hapjeongCrossings(asset: HapjeongWalk, crossings: HapjeongCars['crosswalks'], signals: SignalPlan, groups: readonly string[][] = []) {
  const byId = new Map(crossings.map((c, i) => [c.id, i]));
  const omitted: string[] = [];
  const x: number[] = [];
  const waitDepths: ([number,number] | undefined)[] | undefined = asset.waitDepths ? [] : undefined;
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
    if (waitDepths) waitDepths[xw] = asset.waitDepths![source];
  }
  return {
    graph: decodeWalk({ ...asset, x }), omitted, signals, waitDepths,
    signalPairs: groups.map(group => group.map(id => byId.get(id)!)),
    walkLeft: (xw: number, tod: number) => crossings[xw].sig ? signals.walkLeft(xw, tod) : -1,
  };
}

const CROSSING_COST = 12;

function portalRoutes(graph: WalkGraph, portals: HapjeongPortal[]) {
  const nodes = portals.map(portal => graph.nearest(portal.x, portal.z));
  const edges = graph.adj.map((row, a) => row.map(b => ({
    b, crossing: -1, cost: Math.hypot(graph.nx[a*2]-graph.nx[b*2], graph.nx[a*2+1]-graph.nx[b*2+1]),
  })));
  for (const link of graph.links) {
    const cost = CROSSING_COST + Math.hypot(link.ax-link.pax, link.az-link.paz) +
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

export function makeHapjeongPeople(input: HapjeongPeopleInput, crossings: ReturnType<typeof hapjeongCrossings>,
                                   cars: ReturnType<typeof makeCars>, busy: Uint32Array, start = 14 * 3600,
                                   offscreen = (_x: number, _z: number) => true,
                                   busHeadway?: (route: number, tod: number) => number) {
  const { entrances } = input;
  const exits = new Map(entrances?.exits.map(exit => [exit.key, exit]));
  const platforms = entrances?.platforms.filter(stop => cars.routes.some(route => route.stopNames.includes(stop.key))) ?? [];
  const portals = [
    ...input.walk.portals.flatMap((p): HapjeongPortal[] => {
      if (!entrances) return [p];
      const exit = exits.get(p.key);
      if (exit) return [{ ...p, x:exit.x, z:exit.z, mouth:[exit.x,exit.z] }];
      return offscreen(p.x, p.z) ? [p] : [];
    }),
    ...platforms.map((p): HapjeongPortal => ({ ...p, kind:'stop', origin:[p.x,p.z] })),
  ];
  const { graph, walkLeft, signalPairs, waitDepths } = crossings;
  const provider = makeSimProvider();
  const trial = input.signalTest ? crossingCourses(graph, signalPairs, crossings.signals, start, entrances ? 2 : 1) : undefined;
  const people = makePeople(graph, trial ? [...portals, ...trial.portals] : portals, provider, 5,
    (entrances ? 512 : 64) + (trial?.pending.length ?? 0), {
    cars: cars.cars, busy, walkLeft, traffic: cars.approaching, surveyedCrossings: !!entrances, signalPairs, waitDepths,
  });
  const routes = portalRoutes(graph, portals);
  const portalAudit = portals.map((p,i) => ({ ...p, destinations: routes[i].map(row => portals[row.to].key) }));
  const exitRoutes = routes.map((rows, i) => rows.filter(({to}) => portals[to].kind==='exit' &&
    (!entrances || exits.has(portals[i].key) !== exits.has(portals[to].key))).slice(0,6));
  const froms = exitRoutes.flatMap((row,i) => row.length && portals[i].kind==='exit' ? [i] : []);
  const rail = froms.filter(i => exits.has(portals[i].key));
  const foot = froms.filter(i => !exits.has(portals[i].key));
  const routeWeight = (r: {cost:number; stripes:Set<number>}) => 1/((30+r.cost)*(entrances ? 1+r.stripes.size : 1));
  const inboundRoutes = rail.map(to => foot.flatMap(from => exitRoutes[from].filter(r=>r.to===to))
    .sort((a,b)=>routeWeight(b)-routeWeight(a)));
  const inbound = new Uint16Array(portals.length);
  const railDeparture = new Float64Array(portals.length).fill(-Infinity);
  const journeys = new Map<number, { from: string; to: string; tod: number }>();
  const busEvents: { at:number; key:string; vehicle:number; alighted:number; boarding:number }[] = [];
  const rand = rng(5);
  let untilNext = 0, railCursor = 0, footCursor = 0, train = 0, burst = 0, enterStation = true;
  // The first replay filled the central view to 27 of the required 32.
  const cadence = 27/32;
  const dockIndices = new Map(people.docks.map((dock, i) => [dock.key, i]));
  const dock = (key:string) => dockIndices.get(key) ?? -1;
  const fromPlatform = new Map(platforms.map(p => [p.key, portals.findIndex(q => q.key === p.key)]));
  const nextPassenger = new Map<string, number>();
  const oneBank = (r: { stripes: Set<number> }) =>
    signalPairs.every(pair => pair.filter(i => r.stripes.has(i)).length <= 1);
  const railAccess = portals.map(p => exits.has(p.key));
  const nearestStop = routes.map(rows => rows.find(r => portals[r.to].kind === 'stop')?.to);
  const passengerCount = new Map<string, number>();
  const platformOrigins = new Map(platforms.map(stop => {
    const i = fromPlatform.get(stop.key)!;
    const candidates = (sources: number[]) => sources.flatMap(from => routes[from]
      .filter(r => r.to === i && nearestStop[from] === i && oneBank(r))).sort((a,b) => a.cost-b.cost);
    return [stop.key, { rail:candidates(rail), boundary:candidates(foot) }];
  }));
  if (!busHeadway) for (const stop of platforms) {
    const id = people.openingPassenger(dock(stop.key));
    if (id >= 0) journeys.set(id, {from:stop.key, to:stop.key, tod:start});
  }
  function supplyPassengers(now: Now) {
    if (!busHeadway || !entrances?.busService) return;
    for (const stop of platforms) {
      if (now.tod < (nextPassenger.get(stop.key) ?? -Infinity)) continue;
      const r = cars.routes.findIndex(route => route.stopNames.includes(stop.key));
      const interval = busHeadway(r, now.tod);
      if (!interval) continue;
      const { passengersPerBus, boundaryPassengersPerBus } = entrances.busService[r];
      const sent = passengerCount.get(stop.key) ?? 0;
      const origins = platformOrigins.get(stop.key)!;
      const boundary = sent % passengersPerBus >= passengersPerBus - boundaryPassengersPerBus;
      const preferred = boundary ? origins.boundary : origins.rail;
      const open = (preferred.length ? preferred : [...origins.rail, ...origins.boundary])
        .filter(({from}) => now.tod - railDeparture[from] >= 1);
      const first = open[0];
      if (!first) continue;
      // Share demand among similarly short walks without adding crossings.
      const similar = open.filter(route => route.stripes.size === first.stripes.size
        && route.cost <= first.cost + CROSSING_COST);
      const origin = similar[sent % similar.length];
      const { from, to } = origin;
      // Reuse the existing spawn and nearest-stop goal.
      const id = people.trip(dock(portals[from].key), dock(portals[exitRoutes[from][0].to].key));
      if (id < 0) continue;
      people.goHome(id,1);
      journeys.set(id,{from:portals[from].key,to:portals[to].key,tod:now.tod});
      if (railAccess[from]) railDeparture[from] = now.tod;
      passengerCount.set(stop.key,sent+1);
      nextPassenger.set(stop.key,now.tod + interval/passengersPerBus);
    }
  }

  function advance(dt: number, now: Now, passengersOnly = false) {
    people.step(dt, now, false);
    supplyPassengers(now);
    if (passengersOnly) return;
    for (const [r,k,i] of cars.dwells) {
      const key = cars.routes[r].stopNames[k];
      if (!platforms.some(stop => stop.key === key)) continue;
      const [x,z] = cars.door(i);
      const count = people.w.n;
      const boarding = people.board(key,x,z);
      people.alight(key, 2, x,z);
      for (let j=count;j<people.w.n;j++) {
        const uid=people.w.id[j];
        people.goHome(uid,0);
        journeys.set(uid,{from:key,to:'',tod:now.tod});
      }
      busEvents.push({at:now.tod-start,key,vehicle:cars.cars.uid[i],alighted:people.w.n-count,boarding});
    }
    if (trial) {
      const present = new Set(people.w.id.subarray(0,people.w.n));
      for (const id of trial.active.keys()) if (!present.has(id)) trial.active.delete(id);
      for (let i = 0; i < trial.pending.length; i++) {
        const probe = trial.pending[i];
        if (now.tod < probe.at) continue;
        const { keys } = trial.courses[probe.course];
        const id = people.trip(dock(keys[probe.side]), dock(keys[1-probe.side]));
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
    while (entrances?.station && train<entrances.trains.length && entrances.trains[train]<=now.tod) {
      train++;
      burst += Math.max(1, Math.min(14, Math.round(provider.alighting(now, entrances.station)/150)));
    }
    untilNext -= dt;
    if (untilNext > 0 || !froms.length) return;
    const entering = foot.length && (!rail.length || enterStation);
    let from: number, to: number;
    if (entering && rail.length) {
      const available = inboundRoutes.filter(r=>r.length);
      const least = Math.min(...available.map(([r])=>inbound[r.to]));
      const nearby = available.filter(([r])=>inbound[r.to]===least).map(r=>r[0]);
      // Pick among equally supplied destinations with the existing weights.
      // Each starts on the best route from the boundary, so long detours do
      // not accumulate at the approaches to the under-served exits.
      const r = nearby[pick(nearby.map(routeWeight),rand())];
      ({from,to} = r);
    } else {
      from = entering ? foot[footCursor++ % foot.length] : rail[railCursor++ % rail.length];
      const choices = exitRoutes[from];
      ({to} = choices[pick(choices.map(routeWeight),rand())]);
    }
    if (!entering && now.tod - railDeparture[from] < 1) return;
    const id = people.trip(dock(portals[from].key),dock(portals[to].key));
    if (id >= 0) {
      journeys.set(id,{from:portals[from].key,to:portals[to].key,tod:now.tod});
      if (entering) inbound[to]++;
      else {
        railDeparture[from] = now.tod;
        if (burst) burst--;
      }
      if (rail.length && foot.length) enterStation = !entering;
    }
    untilNext = entrances ? cadence * ((burst && !entering ? .46 : .76) + .16 * rand()) : 1.5 + 1.1 * rand();
  }
  cars.setPeople(people.w);
  return { ...people, advance, portalAudit, journeys, crossingTrial:trial, busEvents };
}
