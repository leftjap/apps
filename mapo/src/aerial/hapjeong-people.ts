import { makePeople, type CarBodies, type Portal } from '../sim/people/index.ts';
import { makeSimProvider } from '../sim/provider.ts';
import { decodeWalk, LINK_N, type WalkGraph } from '../sim/walknet.ts';
import { walkSignals, type HapjeongWalk } from './hapjeong-walk-signals.ts';
import type { SignalFrame, SignalTrial } from './hapjeong-signal-trial.ts';
import type { XZ } from './hapjeong-vehicles.ts';

export type PeopleRehearsal = {
  traffic: 'straight';
  people: { id: string; label: string; view: { at: XZ }; legs: { path: XZ[]; crossing?: string }[] }[];
};

const START = { tod: 14 * 3600, dow: 6, doy: 175 };

function inRing(ring: number[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const [a, b] = [ring[i + 1], ring[j + 1]];
    if ((a > z) !== (b > z) && x < ring[i] + (z - a) * (ring[j] - ring[i]) / (b - a)) inside = !inside;
  }
  return inside;
}

export function peopleViews(rehearsal: PeopleRehearsal) {
  const centre = rehearsal.people.reduce(([x, z], p) => [x + p.view.at[0], z + p.view.at[1]], [0, 0]);
  return rehearsal.people.map(p => ({
    id: p.id, title: p.label, width: 80, mode: 'photo' as const,
    at: p.view.at.map((value, axis) => value * .6 + .4 * centre[axis] / rehearsal.people.length) as XZ,
  }));
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

export function peoplePlayback(asset: HapjeongWalk & { portals: Portal[] }, rehearsal: PeopleRehearsal,
                               trial: SignalTrial, frames: SignalFrame[], ambient: boolean) {
  const rehearsed = new Set(rehearsal.people.flatMap(p => p.legs.flatMap(leg => leg.crossing ? [leg.crossing] : [])));
  const signals = walkSignals(decodeWalk(asset), asset.crossings, rehearsed, trial, frames);
  const active = signals.map(signal => signal.left.some(seconds => seconds > 0));
  // Keep unscheduled crossings red. They have no traversable interval in this
  // replay, so don't send people to a route they can never complete.
  const graph = decodeWalk({ ...asset, x: asset.x.filter((_, i) => active[asset.x[i - i % LINK_N]]) });
  const origins = rehearsal.people.map(row => pavementPoint(graph, row.legs[0].path[0]));
  const destinations = rehearsal.people.map(row => pavementPoint(graph, row.legs.at(-1)!.path.at(-1)!));
  const stops: Portal[] = destinations.map(([x, z], i) => ({ kind: 'stop', key: rehearsal.people[i].id, x, z }));
  const max = ambient ? 64 : rehearsal.people.length;
  const portals = ambient ? asset.portals.filter(portal =>
    rehearsal.people.some(({ view }) => Math.hypot(portal.x - view.at[0], portal.z - view.at[1]) <= 48)) : [];
  const n = trial.vehicles.length;
  const cars: CarBodies = {
    n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), yaw: new Float32Array(n),
    kind: Uint8Array.from(trial.vehicles, v => Number(v.kind === 'bus')), tint: new Float32Array(n),
  };
  function setCars(frame: SignalFrame) {
    frame.vehicles.forEach(({ center, heading }, i) => {
      [cars.x[i], cars.z[i]] = center;
      cars.yaw[i] = Math.PI / 2 - heading;
    });
  }

  const now = (index: number) => ({ ...START, tod: START.tod + frames[index].time });
  function reset() {
    setCars(frames[0]);
    const people = makePeople(graph, [...portals, ...stops], makeSimProvider(), 5, max, {
      cars,
      crossingContains: asset.crossAreas && ((xw, x, z) => asset.crossAreas![xw].some(
        ([outer, ...holes]) => inRing(outer, x, z) && !holes.some(ring => inRing(ring, x, z)),
      )),
      walkLeft(xw, tod) {
        const frame = Math.round((tod - START.tod) * 60);
        return signals[xw]?.left[frame] ?? 0;
      },
    });
    for (const [i, from] of origins.entries()) {
      const id = people.put(...from, ...destinations[i]);
      if (id < 0) throw Error(`보행 시험 출발점에 사람을 놓지 못했습니다. ${rehearsal.people[i].id}`);
      people.goHome(id, 1);
    }
    if (ambient) {
      people.setFocus(...trial.view.at, 90);
      // Fill the scene from its portals before playback. Future vehicle
      // frames are unknown during warm-up, so all crossings stay red.
      people.warm(12, now(0));
    }
    return people;
  }

  let people = reset();
  let index = 0;
  function at(target: number) {
    if (target < index) {
      people = reset();
      index = 0;
    }
    while (index < target) {
      index++;
      setCars(frames[index]);
      people.step(frames[index].time - frames[index - 1].time, now(index), ambient);
    }
    return people;
  }
  return { at, now, signals, max };
}
