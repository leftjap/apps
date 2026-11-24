import * as THREE from 'three';
import { pointAt } from '../poly.ts';
import { headingNear } from '../sim/graph.ts';
import { LEFT, RIGHT, STRAIGHT, UTURN } from '../sim/intersection/index.ts';
import type { hapjeongCarGraph, HapjeongCars, XZ } from './hapjeong-car-graph.ts';

const colors = [0x56eb8b, 0xffcb56, 0xff5656];
const vehicleHeight = 4.5;
const walkHeight = 1.6;
const maxSurveyDistance = 50;

export function makeYanghwaSignals(data: HapjeongCars, graph: ReturnType<typeof hapjeongCarGraph>) {
  const { edges, links, inter: { S, X } } = graph;
  const approaches = [...S.approach].flatMap(([edge, approach]) => {
    const site = S.list[approach.c];
    if (!site.steps.length || !approach.moves) return [];
    const lane = edges[edge];
    const xyz = [0, 0, 0];
    const stop = lane.len - approach.setback;
    pointAt(lane.p, lane.cum, stop, xyz);
    const at: XZ = [xyz[0], xyz[2]];
    const source = links[edge].source ?? links[edge].id;
    const connectors = new Set((X.exits.get(edge) ?? []).flatMap(path => path.edges
      .filter(i => site.j >= 0 && X.jStart[i] === site.j && X.jEnd[i] === site.j)
      .map(i => links[i].source ?? links[i].id)));
    const phases = new Set<string>();
    const movements = [STRAIGHT, LEFT, RIGHT, UTURN].filter(movement => {
      if (!(approach.moves & movement)) return false;
      const phase = site.steps.map(step => ((step.green.get(edge) ?? 0) & movement) ? 'g'
        : ((step.amber.get(edge) ?? 0) & movement) ? 'y' : 'r').join('');
      if (phases.has(phase)) return false;
      phases.add(phase);
      return true;
    });
    return [{ edge, at, source, connectors, movements, heading: headingNear(lane, stop) }];
  });
  // A C1 point may reference the incoming lane or a connector in its path.
  // Prefer the incoming link itself and use a measured point only once.
  const matches = approaches.flatMap((approach, index) => (data.lights ?? []).flatMap(light => {
    if ((light.kind !== '1' && light.kind !== '2') || !light.link) return [];
    const direct = light.link === approach.source;
    if (!direct && !approach.connectors.has(light.link)) return [];
    const distance = Math.hypot(light.at[0] - approach.at[0], light.at[1] - approach.at[1]);
    return distance <= maxSurveyDistance ? [{ index, light, direct, distance }] : [];
  })).sort((a, b) => Number(b.direct) - Number(a.direct) || a.distance - b.distance);
  const surveyed = new Map<number, NonNullable<HapjeongCars['lights']>[number]>();
  const used = new Set<string>();
  for (const { index, light } of matches) {
    if (surveyed.has(index) || used.has(light.id)) continue;
    surveyed.set(index, light);
    used.add(light.id);
  }
  const cars = approaches.flatMap(({ edge, at, movements, heading }, index) => movements.map((movement, i) => {
    const measured = i === 0 ? surveyed.get(index) : undefined;
    const left: XZ = [Math.sin(heading), -Math.cos(heading)];
    const position: XZ = measured?.at ?? [at[0] + left[0] * i * 2, at[1] + left[1] * i * 2];
    return { edge, movement, at: position, surveyed: measured?.id, left };
  }));
  const walks = data.crosswalks.flatMap((walk, crossing) =>
    walk.sig && S.list[S.crossSite[crossing]]?.steps.length ? walk.ends.map(at => ({ crossing, at })) : []);

  const group = new THREE.Group();
  const bulbMaterial = new THREE.MeshBasicMaterial();
  const walkBulb = new THREE.OctahedronGeometry(.47);
  const vehicleMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.75, 12, 8), bulbMaterial, cars.length);
  const walkMesh = new THREE.InstancedMesh(walkBulb, bulbMaterial, walks.length);
  const matrix = new THREE.Matrix4();
  const outline = new THREE.EdgesGeometry(walkBulb);
  const vertices = outline.getAttribute('position');
  const white: number[] = [];
  cars.forEach(({ at: [x, z], movement, left: [dx, dz] }, i) => {
    vehicleMesh.setMatrixAt(i, matrix.makeTranslation(x, vehicleHeight, z));
    if (movement !== LEFT) return;
    const y = vehicleHeight + .76;
    const tip = [x + dx*.42, y, z + dz*.42];
    white.push(x - dx*.14 - dz*.29, y, z - dz*.14 + dx*.29, ...tip,
      ...tip, x - dx*.14 + dz*.29, y, z - dz*.14 - dx*.29);
  });
  walks.forEach(({ at: [x, z] }, i) => {
    walkMesh.setMatrixAt(i, matrix.makeTranslation(x, walkHeight, z));
    for (let v = 0; v < vertices.count; v++)
      white.push(x + vertices.getX(v), walkHeight + vertices.getY(v), z + vertices.getZ(v));
  });
  outline.dispose();
  const lines = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(white, 3));
  group.add(vehicleMesh, walkMesh, new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0xf3f9ff })));

  const palette = colors.map(hex => new THREE.Color(hex));
  function update(tod: number) {
    cars.forEach(({ edge, movement }, i) => vehicleMesh.setColorAt(i, palette[S.state(edge, movement, tod)]));
    walks.forEach(({ crossing }, i) => walkMesh.setColorAt(i, palette[S.walkState(crossing, tod)]));
    if (vehicleMesh.instanceColor) vehicleMesh.instanceColor.needsUpdate = true;
    if (walkMesh.instanceColor) walkMesh.instanceColor.needsUpdate = true;
  }
  return { group, cars, walks, update };
}
