import { Frustum, Matrix4, PerspectiveCamera, Sphere, Vector3 } from 'three';
import { makeCars } from '../sim/cars.ts';
import { headingNear } from '../sim/graph.ts';
import { CYCLE, LEFT, RIGHT, STRAIGHT } from '../sim/intersection/index.ts';
import { makeSimProvider } from '../sim/provider.ts';
import { hapjeongCarGraph, type HapjeongCars } from './hapjeong-car-graph.ts';
import type { XZ } from './hapjeong-vehicles.ts';
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

export function carPlayback(data: HapjeongCars, ambient = true) {
  const visible = carVisibility();
  const full = hapjeongCarGraph(data);
  const central = new Set(data.central);
  const bus = new Set(data.bus);
  const sideTurn = new Set(full.edges.filter(e =>
    data.links[e.id].kind === '6' && delta(headingNear(e, 0), headingNear(e, e.len)) > Math.PI / 3,
  ).map(e => e.id));
  const candidates: { chain: number[]; movement: number; approach: number; duplicates: number }[] = [];
  const follow = (chain: number[]) => {
    const a = chain[0], end = chain.at(-1)!;
    const next = full.edges[end].next.filter(id => !bus.has(id) && data.links[id].kind !== '4');
    if (chain.length > 20) return;
    for (const id of next) if (!chain.includes(id)) follow([...chain, id]);
    if (next.length || visible(...data.links[end].points.at(-1)!)) return;
    const intersection = chain.findIndex(i => central.has(i));
    const turning = chain.findIndex(i => sideTurn.has(i));
    if (intersection < 1 && turning < 0) return;
    let movement: number, approach: number;
    if (intersection >= 1) {
      // Keep the connector and its outlet so the original reservation can be released.
      const entry = chain[intersection - 1];
      const exit = full.inter.X.exits.get(entry)?.find(ex => ex.edges.every((id, q) => chain[intersection - 1 + q] === id));
      if (!exit) return;
      movement = exit.move;
      approach = headingNear(full.edges[entry], full.edges[entry].len);
    } else {
      movement = RIGHT;
      approach = headingNear(full.edges[chain[turning]], 0);
    }
    candidates.push({ chain, movement, approach, duplicates: chain.filter(i => data.links[i].duplicateOf).length });
  };
  for (const e of full.edges) {
    if (data.links[e.id].kind !== '6' || e.len < 12 || visible(...data.links[e.id].points[0])) continue;
    follow([e.id]);
  }

  // Multiple vintages cover some lanes. Keep the best continuous route for
  // each arm and movement, favouring recent data when the whole route works.
  candidates.sort((a, b) => a.duplicates - b.duplicates ||
    full.edges[b.chain[0]].len - full.edges[a.chain[0]].len);
  const chosen = candidates.filter((r, i) => !candidates.slice(0, i).some(s =>
    r.movement === s.movement && Math.abs(delta(r.approach, s.approach)) < Math.PI / 5));
  const entries = new Set(chosen.map(r => r.chain[0]));
  const selected = new Set([...data.bus, ...chosen.flatMap(r => r.chain)]);
  // Keep the entire body inside the drawn map at source and sink boundaries.
  const graph = hapjeongCarGraph(data, selected, entries, 8);
  const index = new Map(graph.links.map((link, i) => [link.id, i]));
  const duration = CYCLE + 22;
  const dt = 1 / 30;
  const start = { tod: 14 * 3600, dow: 6, doy: 175 };
  const seed = 11, max = 22;
  function reset() {
    const sim = makeCars(graph.edges, makeSimProvider(), seed, max, [graph.bus], graph.inter,
      { list: graph.crosswalks, busy: new Uint32Array(graph.crosswalks.length) });
    const site = graph.inter.S.list.find(site => site.j >= 0);
    if (!site) throw Error('합정 차량 신호를 연결하지 못했습니다.');
    sim.setFocus(site.x, site.z, 100, visible);
    const seeded = new Set<number>();
    for (const move of [STRAIGHT, LEFT, RIGHT]) {
      const route = chosen.find(r => r.movement === move && !seeded.has(r.chain[0]));
      if (!route) continue;
      seeded.add(route.chain[0]);
      const e = graph.edges[index.get(data.links[route.chain[0]].id)!];
      const at = Math.min(e.len - 5, 22);
      sim.put(e.id, at, 0);
      if (move === STRAIGHT && at >= 14) sim.put(e.id, at - 12, 0);
    }
    if (!sim.addBus(0, Math.min(graph.edges[graph.bus.edges[0]].len - 18, 34))) throw Error('버스 시험 출발점이 막혔습니다.');
    return sim;
  }

  let sim = reset(), frame = 0;
  const clock = (seconds: number) => ({ ...start, tod: start.tod + seconds });
  function at(seconds: number) {
    const target = Math.round(Math.max(0, Math.min(duration, seconds)) / dt);
    if (target < frame) { sim = reset(); frame = 0; }
    while (frame < target) {
      frame++;
      sim.step(dt, clock(frame * dt), ambient && frame * dt >= 12);
    }
    return sim;
  }
  return { at, clock, duration, graph, max, chosen };
}
