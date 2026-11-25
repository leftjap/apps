import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { carBoundary, districtCarGraph, hapjeongCarGraph, type HapjeongCars } from '../src/aerial/hapjeong-car-graph.ts';
import { nearestS } from '../src/poly.ts';
import { headingNear } from '../src/sim/graph.ts';
import { CYCLE, GREEN, LEFT, STRAIGHT, type LanePath } from '../src/sim/intersection/index.ts';

const data: HapjeongCars = JSON.parse(readFileSync(new URL('../public/data/v2/hapjeong-hd-cars.json', import.meta.url), 'utf8'));

it('matches a diagonal edge of survey coverage without treating its bounding box as a boundary', () => {
  const polygon: HapjeongCars = { ...data, boundaryFaces: [[[[0,0],[10,10],[20,0],[0,0]]]] };
  expect(carBoundary(polygon,[5,5])).toBe(true);
  expect(carBoundary(polygon,[5,5.0005])).toBe(true);
  expect(carBoundary(polygon,[5,10])).toBe(false);
  expect(carBoundary(polygon,[11,11])).toBe(false);
});

it('keeps the published district phases while admitting compatible new A2 paths', () => {
  const drive: HapjeongCars = JSON.parse(gunzipSync(readFileSync(
    new URL('../public/data/v2/hongdae-district-drive.json.gz', import.meta.url))).toString());
  const survey: HapjeongCars = JSON.parse(readFileSync(
    new URL('../public/data/v2/hongdae-district-cars.json', import.meta.url), 'utf8'));
  const original = districtCarGraph({ ...drive, signalTopology: undefined }, '');
  const districtTraffic = { ...drive.districtTraffic!,
    selected: [...new Set([...drive.districtTraffic!.selected, ...survey.districtTraffic!.selected])] };
  const grown = districtCarGraph({ ...drive, districtTraffic, links: survey.links }, '');

  function timings({ links, inter: { S } }: typeof original) {
    return new Map([...S.approach].map(([a, approach]) => {
      const site = S.list[approach.c];
      return [links[a].id, {
        offset: site.offset, moves: approach.moves,
        steps: site.steps.map(s => [s.start, s.dur, s.green.get(a) ?? 0, s.amber.get(a) ?? 0, s.yields.get(a) ?? 0]),
      }];
    }));
  }
  const baseline = timings(original);
  expect(baseline.size).toBe(105);
  expect(timings(districtCarGraph(drive, ''))).toEqual(baseline);
  const candidate = timings(grown);
  for (const [id, phases] of baseline) expect(candidate.get(id), id).toEqual(phases);

  const pathKey = (path: LanePath, links: HapjeongCars['links']) => path.edges.map(id => links[id].id).join('/');
  const originalPaths = new Set(original.inter.X.paths.map(p => pathKey(p, original.links)));
  const { X, S } = grown.inter;
  const paths = [...X.exits].flatMap(([a, exits]) => exits.flatMap((_, k) => X.path(a, 0, k) ?? []));
  const existingSites = new Set([...S.approach].filter(([a]) => baseline.has(grown.links[a].id)).map(([, ap]) => ap.c));
  const added = paths.filter(p => existingSites.has(S.siteOf(p.a)) && !originalPaths.has(pathKey(p, grown.links)));
  expect(added.length).toBeGreaterThan(0);
  for (const p of added) {
    const c = S.siteOf(p.a);
    const { steps, offset } = S.list[c];
    const greenSteps = steps.filter(s => S.state(p.a, p.move, s.start + s.dur / 2 - offset) === GREEN);
    expect(greenSteps.length, pathKey(p, grown.links)).toBeGreaterThan(0);
    for (const step of greenSteps) {
      expect(p.xw.some(x => step.walk.has(x))).toBe(false);
      const tod = step.start + step.dur / 2 - offset;
      expect(paths.some(q => p.a !== q.a && S.siteOf(q.a) === c &&
        S.state(q.a, q.move, tod) === GREEN && X.conflict(p.id, q.id))).toBe(false);
    }
  }
});

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
