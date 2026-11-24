import { busHeadway } from '../sim/buses.ts';
import { rng } from '../sim/rng.ts';
import { Frustum, Matrix4, PerspectiveCamera, Sphere, Vector3 } from 'three';
import { pointAt } from '../poly.ts';
import { makeCars, VFREE } from '../sim/cars.ts';
import { headingNear, type Edge } from '../sim/graph.ts';
import { CYCLE, LEFT, RIGHT, STRAIGHT } from '../sim/intersection/index.ts';
import { makeSimProvider } from '../sim/provider.ts';
import { carBoundary, districtCarGraph, hapjeongCarGraph, type HapjeongCars, type XZ } from './hapjeong-car-graph.ts';
import { hapjeongCrossings, makeHapjeongPeople, type HapjeongPeopleInput } from './hapjeong-people.ts';
import { AERIAL_BEARING } from './road-overlay.ts';
import { surveyBoundaryTraffic, insideOutline, nearestOutlineEdge, insideTrafficView } from './connected-traffic.ts';

import { hapjeongArea, type SurveyArea } from './survey-area.ts';

export const carViews = hapjeongArea.views.simulation;

export function carVisibility(views = carViews) {
  const tilt = 28 * Math.PI / 180;
  const cameras = views.map(view => {
    const camera = new PerspectiveCamera(34, 4 / 3);
    const d = view.width / (2 * camera.aspect * Math.tan(camera.fov * Math.PI / 360));
    const off = d * Math.sin(tilt);
    const [x, z] = view.at;
    camera.position.set(x + off * Math.sin(AERIAL_BEARING), d * Math.cos(tilt), z + off * Math.cos(AERIAL_BEARING));
    camera.lookAt(x, 0, z);
    camera.near = d / 5;
    camera.far = d * 2;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    return new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  });
  const sphere = new Sphere(new Vector3(), 7);
  return (x: number, z: number) => {
    sphere.center.set(x, 1, z);
    return cameras.some(frustum => frustum.intersectsSphere(sphere));
  };
}

function delta(a: number, b: number) {
  return (b - a + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
}

/** One target speed per A2 link. Sample over metres, independent of point spacing. */
function speedRatio(edge: Edge) {
  // At a pronounced right slip turn, the tightest part sets the speed.
  // Across broader turns, use a representative radius of the central arc.
  const turn = delta(headingNear(edge, 0), headingNear(edge, edge.len));
  const tight = turn > Math.PI / 3;
  const arm = Math.min(tight ? 3 : 6, edge.len / 2);
  const span = edge.len - 2 * arm;
  const count = Math.max(1, Math.ceil(span / 3) + 1);
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  const curvature: number[] = [];
  for (let i = 0; i < count; i++) {
    const s = arm + span * i / Math.max(1, count - 1);
    pointAt(edge.p, edge.cum, s - arm, a);
    pointAt(edge.p, edge.cum, s, b);
    pointAt(edge.p, edge.cum, s + arm, c);
    const abx = b[0] - a[0], abz = b[2] - a[2];
    const acx = c[0] - a[0], acz = c[2] - a[2];
    const product = Math.hypot(abx, abz) * Math.hypot(acx, acz) * Math.hypot(c[0] - b[0], c[2] - b[2]);
    if (product > 0) curvature.push(2 * Math.abs(abx * acz - abz * acx) / product);
  }
  curvature.sort((a, b) => a - b);
  const quantile = tight ? 1 : turn < -Math.PI / 3 ? .5 : .7;
  const bend = curvature[Math.round((curvature.length - 1) * quantile)] ?? 0;
  return Math.min(VFREE[edge.cls], 40 / 3.6, Math.sqrt(2.5 / bend)) / VFREE[edge.cls];
}

/** Basic-board measurements from the same survey window, Saturday at 14:00. */
export type HapjeongDemand = { vehicles: number; walkers: number };

export const CAR_TICK = 1 / 30;

export function carPlayback(data: HapjeongCars, ambient = true, pedestrians?: HapjeongPeopleInput, carsEnabled = true,
                            demand?: HapjeongDemand, replayCycles?: number, entrances = pedestrians?.entrances,
                            area: Pick<SurveyArea,'title'|'views'|'replay'> = hapjeongArea) {
  const connected = area.replay.connectedTraffic;
  const district = data.districtTraffic;
  const outline = connected && data.boundaryFaces;
  const interiorTerminals = district ? [...district.entries,...district.exits].filter(p=>!p.boundary).map(p=>p.at) : [];
  const visible = outline ? (x: number,z: number) =>
    (district ? insideTrafficView(outline, interiorTerminals, [x,z])
      : insideOutline(outline,[x,z]) && nearestOutlineEdge(outline,[x,z]).distance > 15)
    : carVisibility(area.views.simulation);
  const full = hapjeongCarGraph(data, undefined, undefined, undefined, undefined, undefined, area.replay.busName);
  const central = new Set(data.central);
  const boundary = (point: XZ) => carBoundary(data, point);
  const terminalKey = (i: number) => data.links[i].points.at(-1)!.join(',');
  const service = entrances?.busService;
  const idsByLink = new Map<string, number[]>();
  for (const [i, row] of data.links.entries()) {
    const key = row.source ?? row.id;
    if (!idsByLink.has(key)) idsByLink.set(key, []);
    idsByLink.get(key)!.push(i);
  }
  const buses = service ? service.map(route => route.links.flatMap(id => {
    const pieces = idsByLink.get(id);
    if (!pieces) throw Error(`Bus route link missing: ${id}`);
    return pieces;
  })) : data.busRoutes ?? [data.bus];
  // The two A2 paths are directions. Several legacy services share each
  // direction, so combine their departures per second, not their intervals.
  const sharedHeadway = service ? (r: number, tod: number) => {
    let rate = 0;
    for (const line of service[r].services) {
      const interval = busHeadway(line,tod);
      if (interval) rate += 1/interval;
    }
    return rate ? 1/rate : 0;
  } : area.replay.busIntervals && ((r: number) => area.replay.busIntervals?.[r] ?? 0);
  function busOutlet(chain: number[]): number[] | undefined {
    const last = chain.at(-1)!;
    const next = full.edges[last].next;
    if (!next.length) return chain.some(i => central.has(i)) && !visible(...data.links[last].points.at(-1)!) ? chain : undefined;
    for (const id of next) {
      if (chain.includes(id)) continue;
      const route = busOutlet([...chain, id]);
      if (route) return route;
    }
  }
  if (!service && !data.busRoutes) for (const [i, row] of data.links.entries()) {
    if (row.kind !== '4' || i === data.bus[0] || !row.next.some(id => central.has(id)) || visible(...row.points[0])) continue;
    const route = busOutlet([i]);
    if (route) buses.push(route);
  }
  const bus = new Set(buses.flat());
  const sideTurn = new Set(full.edges.filter(e =>
    data.links[e.id].kind === '6' && delta(headingNear(e, 0), headingNear(e, e.len)) > Math.PI / 3,
  ).map(e => e.id));
  const candidates: { chain: number[]; movement: number; ingress: number; duplicates: number }[] = [];
  const follow = (chain: number[]) => {
    const end = chain.at(-1)!;
    const next = full.edges[end].next.filter(id => !bus.has(id) && data.links[id].kind !== '4');
    if (chain.length > 20) return;
    for (const id of next) if (!chain.includes(id)) follow([...chain, id]);
    const endpoint = data.links[end].points.at(-1)!;
    if (next.length || visible(...endpoint) || (data.signalSites && !boundary(endpoint))) return;
    const intersection = chain.findIndex(i => central.has(i));
    const turning = chain.findIndex(i => sideTurn.has(i));
    if (intersection < 1 && turning < 0 && !data.boundaryRoutes) return;
    let movement: number, ingress = -1;
    if (intersection >= 1) {
      // Keep the connector and its outlet so the original reservation can be released.
      ingress = chain[intersection - 1];
      const exit = full.inter.X.exits.get(ingress)?.find(ex => ex.edges.every((id, q) => chain[intersection - 1 + q] === id));
      if (!exit) return;
      movement = exit.move;
    } else {
      movement = turning < 0 ? STRAIGHT : RIGHT;
    }
    candidates.push({ chain, movement, ingress, duplicates: chain.filter(i => data.links[i].duplicateOf).length });
  };
  for (const e of connected ? [] : full.edges) {
    if (data.links[e.id].kind !== '6' || e.len < (data.boundaryRoutes ? 8.5 : 12) || visible(...data.links[e.id].points[0]) ||
      (data.signalSites && !boundary(data.links[e.id].points[0]))) continue;
    follow([e.id]);
  }

  // Keep every complete route unless it would duplicate a physical lane
  // already present in the best available survey route.
  candidates.sort((a, b) => Number(a.ingress < 0) - Number(b.ingress < 0) || a.duplicates - b.duplicates ||
    full.edges[b.chain[0]].len - full.edges[a.chain[0]].len);
  const chosen: typeof candidates = [];
  let selected = new Set(bus);
  const terminals = new Map(buses.map(chain => [terminalKey(chain.at(-1)!), chain.at(-1)!]));
  const overlappingTerminals = new Set<string>();
  for (const route of candidates) {
    if (route.chain.some(i => [...selected].some(j =>
      data.links[i].duplicateOf === data.links[j].id || data.links[j].duplicateOf === data.links[i].id))) continue;
    const end = route.chain.at(-1)!;
    const old = terminals.get(terminalKey(end));
    // Two polylines meeting at a sink need a verified common outlet to yield
    // through a merge. Keep the through route if the peripheral route ends at the same sink.
    if (route.ingress < 0 && old !== undefined && old !== end) {
      overlappingTerminals.add(data.links[end].id);
      continue;
    }
    chosen.push(route);
    terminals.set(terminalKey(end), end);
    for (const i of route.chain) selected.add(i);
  }
  const destinations = new Set([...selected].flatMap(i => full.edges[i].next.filter(j => selected.has(j))));
  let entries = new Set(chosen.map(r => r.chain[0]).filter(i => !destinations.has(i)));
  let routedData = data;
  let routingAudit;
  if (district) {
    selected = new Set(district.selected);
    routingAudit = { links: data.links.length, selected: selected.size,
      entries: district.entries.length, exits: district.exits.length,
      excluded: district.excluded };
  } else if (connected) {
    const routes = surveyBoundaryTraffic(data.links, full.edges, bus, boundary);
    entries = routes.entries;
    selected = new Set([...bus,...routes.selected]);
    const busNext = new Map<number,number[]>();
    for (const chain of buses) for (let i=1;i<chain.length;i++)
      busNext.set(chain[i-1],[...(busNext.get(chain[i-1]) ?? []),chain[i]]);
    routedData = {...data,links:data.links.map((row,i)=>({...row,next:busNext.get(i)
      ?? routes.successors[i].filter(j=>routes.selected.has(j))}))};
    routingAudit = { links:data.links.length, selected:selected.size, entries:routes.allInlets.filter(i=>selected.has(i)).length, totalEntries:routes.allInlets.length,
      exits:routes.allOutlets.filter(i=>selected.has(i)).length, totalExits:routes.allOutlets.length,
      excluded:data.links.flatMap((row,i)=>selected.has(i) ? [] : [{id:row.id,
        reason:routes.shadows.has(i) ? 'duplicate' : row.kind === '4' ? 'unused bus lane'
          : !routes.entryReachable.has(i) ? (routes.exitReachable.has(i) ? 'no boundary ingress' : 'no boundary ingress or egress')
          : 'no boundary egress'}]) };
  }
  const byIngress = new Set(candidates.map(route => route.ingress));
  const ingressAudit = [...full.inter.X.exits].filter(([i, paths]) =>
    paths.length || full.edges[i].next.some(j => central.has(j))).map(([i]) => {
    const link = data.links[i];
    const shadow = [...selected].find(j => data.links[j].id === link.duplicateOf || data.links[j].duplicateOf === link.id);
    const reason = selected.has(i) ? 'active' : shadow !== undefined ? 'duplicate'
      : byIngress.has(i) ? 'overlapping-route' : 'no-complete-offscreen-route';
    return { id: link.id, reason };
  });
  // Keep the entire body inside the drawn map at source and sink boundaries.
  const graph = district ? districtCarGraph(data, area.replay.busName) :
    hapjeongCarGraph(routedData, selected, entries, 8, buses, entrances?.platforms ?? data.platforms, area.replay.busName);
  const index = new Map(graph.links.map((link, i) => [link.id, i]));
  const speeds = new Map(graph.edges.map(edge => [edge.key, speedRatio(edge)]));
  // Keep the second walk phase available for trips that reach a refuge
  // too late to finish both faces during their first green.
  const duration = replayCycles !== undefined ? CYCLE * replayCycles
    : demand ? CYCLE * 2 : CYCLE + (pedestrians ? 60 : 22);
  const dt = CAR_TICK;
  const start = { tod: 14 * 3600, dow: 6, doy: 175 };
  const seed = 11, max = connected?.maxVehicles ?? 256;
  const clock = (seconds: number) => ({ ...start, tod: start.tod + seconds });
  const crossings = pedestrians && hapjeongCrossings(pedestrians.walk, data.crosswalks, graph.inter.S, data.walkSignalGroups);
  const paintedStops = area.replay.enforcePaintedMidStops && new Map(
    graph.links.flatMap((link, edge) => link.stop?.id && graph.inter.S.midApproach.has(edge)
      ? [[edge, link.stop.at] as const] : []));
  function reset() {
    const busy = new Uint32Array(graph.crosswalks.length);
    const provider = { ...makeSimProvider(), roadSpeed: (_now: ReturnType<typeof clock>, _cls: number, key: number) => speeds.get(key)! };
    const sim = makeCars(graph.edges, provider, seed, max, graph.buses, graph.inter,
      { list: graph.crosswalks, busy }, ambient ? demand?.vehicles : undefined, paintedStops || undefined,
      district && data.window);
    const site = graph.inter.S.list.find(site => site.j >= 0);
    if (!site) throw Error(`${area.title} 차량 신호를 연결하지 못했습니다.`);
    sim.setFocus(site.x, site.z, 100, visible);
    const seeded = new Set<number>();
    for (const move of ambient || !carsEnabled ? [] : [STRAIGHT, LEFT, RIGHT]) {
      const route = chosen.find(r => r.movement === move && !seeded.has(r.chain[0]));
      if (!route) continue;
      seeded.add(route.chain[0]);
      const e = graph.edges[index.get(data.links[route.chain[0]].id)!];
      const at = Math.min(e.len - 5, 22);
      sim.put(e.id, at, 0);
      if (move === STRAIGHT && at >= 14) sim.put(e.id, at - 12, 0);
    }
    const people = pedestrians && crossings && makeHapjeongPeople(pedestrians, crossings, sim, busy, start.tod, (x,z)=>!visible(x,z), carsEnabled && ambient ? sharedHeadway : undefined,
      area.replay.boundaryTrips);
    if (carsEnabled && graph.buses.length && (!ambient || !sharedHeadway) && !sim.addBus(0, Math.min(graph.edges[graph.buses[0].edges[0]].len - 18, 34))) {
      throw Error('버스 시험 출발점이 막혔습니다.');
    }
    const dispatchRandom = rng(seed);
    const nextBus = new Float64Array(graph.buses.length).fill(Infinity);
    const lastBus = new Uint32Array(graph.buses.length);
    function stepCars(now: ReturnType<typeof clock>) {
      sim.step(dt, now, ambient);
      if (!ambient || !sharedHeadway) return;
      const { cars } = sim;
      const state = sim.debug();
      for (let r = 0; r < graph.buses.length; r++) {
        const route = graph.buses[r];
        const first = route.edges[0];
        const headway = sharedHeadway(r, now.tod);
        if (!headway) continue;
        const schedule = () => now.tod + headway * (.85 + .30 * dispatchRandom());
        let space = true;
        for (let i = 0; i < cars.n; i++) {
          // A bus already sent by the legacy scheduler counts towards the
          // combined frequency, and restarts this direction's interval.
          if (cars.route[i] === r && cars.uid[i] > lastBus[r]) {
            lastBus[r] = cars.uid[i];
            nextBus[r] = schedule();
          }
          if (state.edge[i] === first && state.s[i] <= 16) space = false;
        }
        if (now.tod < nextBus[r] || !space || !sim.addBus(r)) continue;
        lastBus[r] = cars.uid[cars.n - 1];
        nextBus[r] = schedule();
      }
    }
    if (people && ambient && carsEnabled && sharedHeadway) {
      // Start the previous signal cycle's walks without changing normal
      // replay seeding, so the first visible bus may have a line to serve.
      const warmup = area.replay.boundaryTrips?.passengerWarmupSeconds ?? CYCLE;
      for (let i = -Math.round((warmup + 12) / dt); i < -12 / dt; i++)
        people.advance(dt, clock(i * dt), true);
    }
    if (people || demand) {
      // Run the same clock during pre-roll so pedestrians and cars see one another from the start.
      for (let i = -Math.round((connected?.warmupSeconds ?? 12) / dt); i < 0; i++) {
        const now = clock(i * dt);
        if (carsEnabled) stepCars(now);
        people?.advance(dt, now);
      }
    }
    return { sim, people, busy, stepCars };
  }

  let state = reset(), frame = 0;
  function at(seconds: number) {
    const target = Math.round(Math.max(0, connected ? seconds : Math.min(duration, seconds)) / dt);
    if (target < frame) { state = reset(); frame = 0; }
    while (frame < target) {
      frame++;
      const now = clock(frame * dt);
      if (carsEnabled) state.stepCars(now);
      state.people?.advance(dt, now);
    }
    return state.sim;
  }
  return { at, clock, duration, graph, max, chosen, ingressAudit, overlappingTerminals, crossings, visible, routingAudit,
    people: () => state.people, busy: () => state.busy };
}
