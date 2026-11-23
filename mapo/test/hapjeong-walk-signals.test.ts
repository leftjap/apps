import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { signalFrames, type SignalTrial } from '../src/aerial/hapjeong-signal-trial.ts';
import { decodeWalk, type WalkJson } from '../src/sim/walknet.ts';
import { RED } from '../src/sim/intersection/signal.ts';
import { walkSignals } from '../src/aerial/hapjeong-walk-signals.ts';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../public/data/v2/hapjeong-hd-${name}.json`, import.meta.url), 'utf8'));
const asset = read('walk') as WalkJson & { crossings: string[] };
const graph = decodeWalk(asset);
const vehicleTrial = read('signal-trial').straight as SignalTrial;
const frames = signalFrames(vehicleTrial);
const rehearsed = new Set<string>(read('pedestrians').people.flatMap(
  (p: { legs: { crossing?: string }[] }) => p.legs.flatMap(l => l.crossing ? [l.crossing] : []),
));

describe('Hapjeong pedestrian green follows the straight vehicle trial', () => {
  it('provides a usable green interval to each of the previously rehearsed crossings', () => {
    const plans = walkSignals(graph, asset.crossings, rehearsed, vehicleTrial, frames);
    for (const id of rehearsed) {
      const xw = asset.crossings.indexOf(id);
      expect(xw, id).toBeGreaterThanOrEqual(0);
      const { ax, az, bx, bz, pax, paz, pbx, pbz } = graph.links[xw];
      const length = Math.hypot(pax - ax, paz - az) + Math.hypot(ax - bx, az - bz) + Math.hypot(bx - pbx, bz - pbz);
      expect(Math.max(...plans[xw].left), id).toBeGreaterThan(length / 2.2 + 1);
      expect(plans[xw].left[0], id).toBe(0);
    }
  });

  it('keeps every interval red during conflicting vehicle phases or vehicle occupancy', () => {
    const plans = walkSignals(graph, asset.crossings, rehearsed, vehicleTrial, frames);
    let mapped = 0;
    let unmatched = 0;
    for (const [xw, p] of plans.entries()) {
      if (!p.groups.length && !rehearsed.has(asset.crossings[xw])) {
        expect(p.left.every(value => value === 0)).toBe(true);
        unmatched++;
      }
      if (p.groups.length) mapped++;
      for (const [i, left] of p.left.entries()) {
        if (!left) continue;
        expect(p.groups.every(group => frames[i].colors[group] === RED), `crossing ${xw} frame ${i}`).toBe(true);
        expect(p.occupied[i], `crossing ${xw} frame ${i}`).toBe(0);
        if (p.left[i + 1]) {
          expect(left - p.left[i + 1]).toBeCloseTo(frames[i + 1].time - frames[i].time, 4);
        } else {
          expect(left).toBeLessThanOrEqual(1 / 60 + 1e-6);
        }
      }
    }
    expect(mapped).toBeGreaterThan(0);
    expect(unmatched).toBeGreaterThan(0);
  });
});
