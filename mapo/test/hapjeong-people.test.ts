import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { carPlayback } from '../src/aerial/hapjeong-car-playback.ts';
import { hapjeongCrossings } from '../src/aerial/hapjeong-people.ts';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../public/data/v2/hapjeong-hd-${name}.json`, import.meta.url), 'utf8'));
const asset = read('cars'), walk = read('walk'), rehearsal = read('pedestrians');

it('uses the same signal indices for the walk graph and the running cars', () => {
  const run = carPlayback(asset);
  const crossings = hapjeongCrossings(walk, asset.crosswalks, run.graph.inter.S);
  const { S } = run.graph.inter;
  const xw = (suffix: string) => asset.crosswalks.findIndex((r: {id: string}) => r.id.endsWith(suffix));
  const unsignaled = xw('0041'), signaled = xw('0032'), outside = xw('0004');
  expect(crossings.graph.links.map(link => link.xw)).toContain(unsignaled);
  expect(crossings.graph.links.map(link => link.xw)).not.toContain(outside);
  expect(crossings.walkLeft(unsignaled, run.clock(7).tod)).toBe(-1);
  for (const t of [0, 35, 85]) {
    expect(crossings.walkLeft(signaled, run.clock(t).tod)).toBe(S.walkLeft(signaled, run.clock(t).tod));
  }
});

it('replays the same car and pedestrian state after seeking back with shared crossing occupancy', () => {
  const run = carPlayback(asset, true, { walk, rehearsal });
  const snapshot = (t: number) => {
    const cars = run.at(t).cars, people = run.people()!.w;
    return [cars.n, ...cars.x.slice(0, cars.n), people.n, ...people.x.slice(0, people.n), ...run.busy()];
  };
  let crossing = false;
  for (let t = 0; t <= run.duration; t += .5) {
    const {stateOf, w, MODES} = (run.at(t), run.people()!);
    crossing ||= Array.from({length:w.n}, (_, i) => stateOf(i)).some(s => s.mode === MODES.CROSS &&
      !!run.busy()[s.cross!.xw]);
  }
  expect(crossing).toBe(true);
  const t = 45.5, first = snapshot(t);
  expect(first.length).toBeGreaterThan(60);
  snapshot(120);
  expect(snapshot(t)).toEqual(first);
});

it('defines a single surveyed phase for each divided crossing, including both faces in the plan', () => {
  const { graph: { inter: { S } } } = carPlayback(asset);
  const suffix = (ids: string[]) => ids.map(id => id.slice(-4)).sort();
  expect(asset.walkSignalGroups?.map(suffix)).toEqual([['0031', '0032'], ['0044', '0046']]);
  for (const pair of asset.walkSignalGroups) {
    const [a, b] = pair.map((id: string) => asset.crosswalks.findIndex((row: {id: string}) => row.id === id));
    expect(S.crossSite[a]).toBeGreaterThanOrEqual(0);
    expect(S.crossSite[a]).toBe(S.crossSite[b]);
    const site = S.list[S.crossSite[a]];
    expect(site.steps.some(step => step.walk.has(a))).toBe(true);
    for (const step of site.steps) expect(step.walk.has(a)).toBe(step.walk.has(b));
  }
});
