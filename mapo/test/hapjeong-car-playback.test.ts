import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { carPlayback } from '../src/aerial/hapjeong-car-playback.ts';
import { nearestS } from '../src/poly.ts';
import { CYCLE } from '../src/sim/intersection/index.ts';

const asset = JSON.parse(readFileSync(new URL('../public/data/v2/hapjeong-hd-cars.json', import.meta.url), 'utf8'));

it('seeds a small legacy car trial including a bus and resimulates a full cycle from the same seed', () => {
  const trial = carPlayback(asset, false);
  expect(trial.at(0).cars.n).toBeGreaterThanOrEqual(4);
  expect(trial.at(0).cars.n).toBeLessThanOrEqual(6);
  expect(trial.at(0).cars.kind.subarray(0, trial.at(0).cars.n)).toContain(1);
  const replay = carPlayback(asset);
  expect(replay.duration).toBeGreaterThanOrEqual(CYCLE);
  const positions = (t: number) => {
    const { cars } = replay.at(t);
    return [cars.n, ...cars.uid.slice(0, cars.n), ...cars.x.slice(0, cars.n), ...cars.z.slice(0, cars.n)];
  };
  const t = 72.13;
  const first = positions(t);
  replay.at(101);
  expect(positions(t)).toEqual(first);
});

it('keeps every vehicle on its A2 line through seams and turns', () => {
  const replay = carPlayback(asset);
  let worst = 0;
  for (let sample = 0; sample <= replay.duration * 30; sample++) {
    const sim = replay.at(sample / 30);
    const { edge } = sim.debug();
    for (let i = 0; i < sim.cars.n; i++) {
      const e = replay.graph.edges[edge[i]];
      worst = Math.max(worst, nearestS(e.p, e.cum, sim.cars.x[i], sim.cars.z[i]).d);
    }
  }
  expect(worst).toBeLessThan(.0001);
});

it('includes parallel central approaches with a complete offscreen route', () => {
  const { graph } = carPlayback(asset);
  const approaches = [...graph.inter.X.exits.values()].filter(exits => exits.length > 0);
  expect(approaches.length).toBeGreaterThan(8);
});
