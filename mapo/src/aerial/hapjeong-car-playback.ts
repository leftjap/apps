import { Frustum, Matrix4, PerspectiveCamera, Sphere, Vector3 } from 'three';
import { makeCars } from '../sim/cars.ts';
import { headingNear } from '../sim/graph.ts';
import { CYCLE, LEFT, RIGHT, STRAIGHT } from '../sim/intersection/index.ts';
import { makeSimProvider } from '../sim/provider.ts';
import { hapjeongCarGraph, type HapjeongCars, type XZ } from './hapjeong-car-graph.ts';
import { hapjeongCrossings, makeHapjeongPeople, type HapjeongPeopleInput } from './hapjeong-people.ts';
import { AERIAL_BEARING } from './road-overlay.ts';

export const carViews = [
  { id: 'west', title: '서쪽 접근로', at: [-514, 257] as XZ, width: 80, mode: 'photo' as const },
  { id: 'southeast', title: '남동쪽 접근로', at: [-469, 273] as XZ, width: 80, mode: 'photo' as const },
  { id: 'platform', title: '중앙 승강장', at: [-495, 251] as XZ, width: 80, mode: 'photo' as const },
];

export function carVisibility() {
  const tilt = 28 * Math.PI / 180;
  const cameras = carViews.map(view => {
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

export function carPlayback(data: HapjeongCars, ambient = true, pedestrians?: HapjeongPeopleInput, carsEnabled = true) {
  const visible = carVisibility();
  const full = hapjeongCarGraph(data);
  const central = new Set(data.central);
  const bus = new Set(data.bus);
  const sideTurn = new Set(full.edges.filter(e =>
    data.links[e.id].kind === '6' && delta(headingNear(e, 0), headingNear(e, e.len)) > Math.PI / 3,
  ).map(e => e.id));
  const candidates: { chain: number[]; movement: number; ingress: number; duplicates: number }[] = [];
  const follow = (chain: number[]) => {
    const end = chain.at(-1)!;
    const next = full.edges[end].next.filter(id => !bus.has(id) && data.links[id].kind !== '4');
    if (chain.length > 20) return;
    for (const id of next) if (!chain.includes(id)) follow([...chain, id]);
    if (next.length || visible(...data.links[end].points.at(-1)!)) return;
    const intersection = chain.findIndex(i => central.has(i));
    const turning = chain.findIndex(i => sideTurn.has(i));
    if (intersection < 1 && turning < 0) return;
    let movement: number, ingress = -1;
    if (intersection >= 1) {
      // Keep the connector and its outlet so the original reservation can be released.
      ingress = chain[intersection - 1];
      const exit = full.inter.X.exits.get(ingress)?.find(ex => ex.edges.every((id, q) => chain[intersection - 1 + q] === id));
      if (!exit) return;
      movement = exit.move;
    } else {
      movement = RIGHT;
    }
    candidates.push({ chain, movement, ingress, duplicates: chain.filter(i => data.links[i].duplicateOf).length });
  };
  for (const e of full.edges) {
    if (data.links[e.id].kind !== '6' || e.len < 12 || visible(...data.links[e.id].points[0])) continue;
    follow([e.id]);
  }

  // Keep every complete route unless it would duplicate a physical lane
  // already present in the best available survey route.
  candidates.sort((a, b) => a.duplicates - b.duplicates ||
    full.edges[b.chain[0]].len - full.edges[a.chain[0]].len);
  const chosen: typeof candidates = [];
  const selected = new Set(data.bus);
  for (const route of candidates) {
    if (route.chain.some(i => [...selected].some(j =>
      data.links[i].duplicateOf === data.links[j].id || data.links[j].duplicateOf === data.links[i].id))) continue;
    chosen.push(route);
    for (const i of route.chain) selected.add(i);
  }
  const destinations = new Set([...selected].flatMap(i => full.edges[i].next.filter(j => selected.has(j))));
  const entries = new Set(chosen.map(r => r.chain[0]).filter(i => !destinations.has(i)));
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
  const graph = hapjeongCarGraph(data, selected, entries, 8);
  const index = new Map(graph.links.map((link, i) => [link.id, i]));
  const duration = CYCLE + 22;
  const dt = 1 / 30;
  const start = { tod: 14 * 3600, dow: 6, doy: 175 };
  const seed = 11, max = 256;
  const clock = (seconds: number) => ({ ...start, tod: start.tod + seconds });
  const crossings = pedestrians && hapjeongCrossings(pedestrians.walk, data.crosswalks, graph.inter.S);
  function reset() {
    const busy = new Uint32Array(graph.crosswalks.length);
    const sim = makeCars(graph.edges, makeSimProvider(), seed, max, [graph.bus], graph.inter,
      { list: graph.crosswalks, busy });
    const site = graph.inter.S.list.find(site => site.j >= 0);
    if (!site) throw Error('합정 차량 신호를 연결하지 못했습니다.');
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
    const people = pedestrians && crossings && makeHapjeongPeople(pedestrians, crossings, sim, busy, [site.x, site.z]);
    if (carsEnabled && !sim.addBus(0, Math.min(graph.edges[graph.bus.edges[0]].len - 18, 34))) {
      throw Error('버스 시험 출발점이 막혔습니다.');
    }
    if (people) {
      // Run the same clock during pre-roll so pedestrians and cars see one another from the start.
      for (let i = -12 / dt; i < 0; i++) {
        const now = clock(i * dt);
        if (carsEnabled) sim.step(dt, now, ambient);
        people.step(dt, now, true);
      }
    }
    return { sim, people, busy };
  }

  let state = reset(), frame = 0;
  function at(seconds: number) {
    const target = Math.round(Math.max(0, Math.min(duration, seconds)) / dt);
    if (target < frame) { state = reset(); frame = 0; }
    while (frame < target) {
      frame++;
      const now = clock(frame * dt);
      if (carsEnabled) state.sim.step(dt, now, ambient);
      state.people?.step(dt, now, true);
    }
    return state.sim;
  }
  return { at, clock, duration, graph, max, chosen, ingressAudit, crossings,
    people: () => state.people, busy: () => state.busy };
}
