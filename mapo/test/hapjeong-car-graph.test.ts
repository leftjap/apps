import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { hapjeongCarGraph, type HapjeongCars } from '../src/aerial/hapjeong-car-graph.ts';
import { nearestS } from '../src/poly.ts';
import { headingNear } from '../src/sim/graph.ts';
import { CYCLE, LEFT, STRAIGHT } from '../src/sim/intersection/index.ts';

const data: HapjeongCars = JSON.parse(readFileSync(new URL('../public/data/v2/hapjeong-hd-cars.json', import.meta.url), 'utf8'));

it('uses the same surveyed line for each junction path and its conflict samples', () => {
  const { edges, inter: { X, S }, links } = hapjeongCarGraph(data);
  expect(S.list.filter(s => s.j >= 0)).toHaveLength(1);
  expect(S.list[0].steps.reduce((s, step) => s + step.dur, 0)).toBe(CYCLE);
  // A2 stores parallel left lanes as separate Edges. They still have to
  // receive the legacy two-lane left phase rather than the one-lane phase.
  expect(S.list[0].steps.some(step => step.dur >= 13 &&
    [...step.green.values()].length > 1 && [...step.green.values()].every(m => m === LEFT))).toBe(true);
  const moves = new Set<number>();
  for (const [entry, exits] of X.exits) {
    for (const [k, exit] of exits.entries()) {
      const path = X.pathAny(entry, 0, k)!;
      moves.add(exit.move);
      expect(path.edges.slice(1, -1).every(id => links[id].kind === '1')).toBe(true);
      for (let i = 0; i < path.pts.length; i += 4) {
        const [x, , z] = path.pts.subarray(i, i + 3);
        const distances = path.edges.map(id => nearestS(edges[id].p, edges[id].cum, x, z).d);
        expect(Math.min(...distances)).toBeLessThan(.0001);
      }
    }
  }
  for (const m of [LEFT, STRAIGHT]) expect(moves.has(m)).toBe(true);
  // The surveyed slip roads are type 6 and are outside the central signal box.
  expect(edges.some(e => {
    const delta = (headingNear(e, e.len) - headingNear(e, 0) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    return links[e.id].kind === '6' && delta > Math.PI / 3 && e.next.length && edges.some(a => a.next.includes(e.id));
  })).toBe(true);
  for (const [i, row] of links.entries()) {
    if (!row.stop || !S.approach.has(i)) continue;
    expect(edges[i].len - X.stopAt(i, 0)).toBeLessThanOrEqual(row.stop.at);
  }
});
