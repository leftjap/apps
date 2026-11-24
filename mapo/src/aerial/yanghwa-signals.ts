import * as THREE from 'three';
import { pointAt } from '../poly.ts';
import { headingNear } from '../sim/graph.ts';
import { GREEN, LEFT, RED, RIGHT, STRAIGHT, UTURN } from '../sim/intersection/index.ts';
import { insideOutline, nearestOutlineEdge, type Outline } from './connected-traffic.ts';
import type { hapjeongCarGraph, HapjeongCars, XZ } from './hapjeong-car-graph.ts';

const vehicleHeight = 4.8;
const walkHeight = 1.72;

// Supply linear values even when the survey viewer disables Three's input
// color conversion. The output pass still converts to sRGB.
function signalColor(r: number, g: number, b: number) {
  const toLinear = (c: number) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  return new THREE.Color().setRGB(toLinear(r), toLinear(g), toLinear(b));
}
const active = [signalColor(.03,.94,.24), signalColor(1,.68,.03), signalColor(1,.055,.035)];
const dark = signalColor(.09,.105,.12);
const frame = signalColor(.24,.28,.31);

function offset([x,z]: XZ, [dx,dz]: XZ, distance: number): XZ {
  return [x+dx*distance, z+dz*distance];
}
const maxSurveyDistance = 50;

export function makeYanghwaSignals(data: HapjeongCars, graph: ReturnType<typeof hapjeongCarGraph>, sidewalk?: Outline) {
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
  function curb(at: XZ, fallback: XZ) {
    if (!sidewalk) return fallback;
    if (insideOutline(sidewalk, at)) return at;
    const { point, distance } = nearestOutlineEdge(sidewalk, at);
    if (distance > 16) return fallback;
    return point;
  }
  const cars = approaches.flatMap(({ edge, at, movements, heading }, index) => {
    const measured = surveyed.get(index);
    const left: XZ = [Math.sin(heading), -Math.cos(heading)];
    const forward: XZ = [Math.cos(heading), Math.sin(heading)];
    const pole = measured?.at ?? curb(at, offset(at, left, -2.4));
    const towardLane: XZ = [(at[0]-pole[0]), (at[1]-pole[1])];
    const side = towardLane[0]*left[0] + towardLane[1]*left[1] < 0 ? -1 : 1;
    return movements.map((movement, i) => ({
      edge, movement, at: pole, surveyed: i === 0 ? measured?.id : undefined, heading,
      head: offset(pole, left, side*(2.1 + .95*i)),
      forward,
    }));
  });
  const walks = data.crosswalks.flatMap((walk, crossing) => {
    if (!walk.sig || !S.list[S.crossSite[crossing]]?.steps.length) return [];
    return walk.ends.map((end, i) => {
      const other = walk.ends[1-i];
      const heading = Math.atan2(other[1]-end[1], other[0]-end[0]);
      const at = curb(end, offset(end, [Math.sin(heading), -Math.cos(heading)], .65));
      return { crossing, at, heading };
    });
  });

  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ toneMapped: false });
  const uniquePoles = new Set<string>();
  const geometry = new THREE.BoxGeometry(1,1,1);
  const frames = new THREE.InstancedMesh(geometry, material, cars.length*4 + walks.length*2);
  const lens = new THREE.SphereGeometry(.5,10,6);
  const vehicleLenses = new THREE.InstancedMesh(lens, material, cars.length*3);
  const pedestrianLenses = new THREE.InstancedMesh(lens, material, walks.length*2);
  const pose = new THREE.Object3D();
  function instance(mesh: THREE.InstancedMesh, index: number, at: XZ, y: number,
                    width: number, height: number, depth: number, rotation = 0) {
    pose.position.set(at[0], y, at[1]);
    pose.rotation.y = rotation;
    pose.scale.set(width, height, depth);
    pose.updateMatrix();
    mesh.setMatrixAt(index, pose.matrix);
  }

  let parts = 0;
  function box(at: XZ, y: number, width: number, height: number, depth: number, rotation = 0, color = frame) {
    instance(frames, parts, at, y, width, height, depth, rotation);
    frames.setColorAt(parts++, color);
  }
  function post(at: XZ, y: number, width: number) {
    const key = at.join(',');
    if (uniquePoles.has(key)) return;
    uniquePoles.add(key);
    box(at,y/2,width,y,width);
  }
  cars.forEach(({at, head, heading, forward, movement}, i) => {
    const supportY = vehicleHeight+.78;
    post(at,supportY,.19);
    const middle: XZ = [(at[0]+head[0])/2, (at[1]+head[1])/2];
    const span = Math.hypot(at[0]-head[0], at[1]-head[1]);
    const rotation = Math.PI/2-heading;
    box(middle,supportY,span,.14,.14,rotation);
    box(head,vehicleHeight,.8,1.69,.31,rotation, dark);
    // A short directional plate distinguishes a separate left-turn head.
    if (movement === LEFT) box(offset(head,forward,.16),vehicleHeight+.74,.65,.09,.06,rotation,frame);
    for (let slot=0; slot<3; slot++)
      instance(vehicleLenses,i*3+slot,head,vehicleHeight+(.51-slot*.51),.56,.50,.55,rotation);
  });
  walks.forEach(({ at, heading },i) => {
    const rotation = Math.PI/2-heading;
    post(at,walkHeight,.14);
    box(at,walkHeight,.58,1.02,.27,rotation,dark);
    for (let slot=0; slot<2; slot++)
      instance(pedestrianLenses,i*2+slot,at,walkHeight+.24-slot*.48,.43,.42,.46,rotation);
  });
  frames.count = parts;
  group.add(frames,vehicleLenses,pedestrianLenses);

  function update(tod: number) {
    cars.forEach(({ edge, movement }, i) => {
      const state = S.state(edge,movement,tod);
      for (let slot=0;slot<3;slot++)
        vehicleLenses.setColorAt(i*3+slot,slot === 2-state ? active[state] : dark);
    });
    walks.forEach(({ crossing }, i) => {
      const state = S.walkState(crossing,tod) === GREEN ? GREEN : RED;
      for (let slot=0;slot<2;slot++)
        pedestrianLenses.setColorAt(i*2+slot,slot === (state === GREEN ? 1 : 0) ? active[state] : dark);
    });
    if (vehicleLenses.instanceColor) vehicleLenses.instanceColor.needsUpdate = true;
    if (pedestrianLenses.instanceColor) pedestrianLenses.instanceColor.needsUpdate = true;
  }
  update(0);
  return { group, cars, walks, update };
}
