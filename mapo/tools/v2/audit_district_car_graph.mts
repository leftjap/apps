/** Inspect replay-ready A2 signals and routes without starting a simulation. */
import { districtCarGraph, type HapjeongCars } from '../../src/aerial/hapjeong-car-graph.ts';
import { CYCLE } from '../../src/sim/intersection/index.ts';
import { carGridRadius } from '../../src/sim/cars.ts';
import { loadArea, readAsset } from './area.mts';

const area = loadArea();
const data = readAsset(area, 'cars') as HapjeongCars;
const routes = data.districtTraffic!;
const selected = new Set(routes.selected);
const graph = districtCarGraph(data, area.title);
const { X, S } = graph.inter;
const conflicts = [], walks = [];
const mergeCount = new Map<number, number>();
for (const edge of graph.edges) {
  for (const next of edge.next) mergeCount.set(next, (mergeCount.get(next) ?? 0) + 1);
}
for (const [c, site] of S.list.entries()) {
  const paths = X.paths.filter(p => S.approach.get(p.a)?.c === c);
  for (const step of site.steps) {
    if (site.j < 0 && step.green.size && step.walk.size) {
      walks.push({ site: c, at: step.start, seconds: step.dur, from: 'midblock' });
    }
    const green = paths.filter(p => ((step.green.get(p.a) ?? 0) & p.move) !== 0);
    for (let i = 0; i < green.length; i++) {
      const a = green[i];
      for (const b of green.slice(i + 1)) {
        if (a.a !== b.a && X.conflict(a.id, b.id)) {
          conflicts.push({ site: c, at: step.start, seconds: step.dur, from: [a.a, b.a].map(k => graph.links[k].id) });
        }
      }
      for (const crossing of a.xw) {
        if (step.walk.has(crossing)) walks.push({site: c, at: step.start, seconds: step.dur,
          from: graph.links[a.a].id, crossing: data.crosswalks[crossing].id });
      }
    }
  }
}
const report = {
  edges: data.links.length, selected: graph.edges.length,
  ordinary: data.links.filter(link => link.kind === '6').length,
  routedOrdinary: graph.links.filter(link => link.kind === '6').length,
  portals: { entries: routes.entries, exits: routes.exits },
  merges: [...mergeCount.values()].filter(n => n > 1).length,
  cycle: CYCLE,
  gridRadius: carGridRadius(data.window),
  gradePairsInService: routes.gradeCrossings.filter(p => selected.has(p.lower) && selected.has(p.upper)),
  signals: S.list.map((s, c) => ({ at: [s.x, s.z], junction: s.j, offset: s.offset,
    approaches: [...S.approach].filter(([, ap]) => ap.c === c).length,
    faces: [...S.crossSite].filter(i => i === c).length, steps: s.steps.length })),
  buses: graph.buses.map(r => ({ length: r.len, edges: r.edges.length, stops: r.stopNames })),
  vehicleSeconds: conflicts.reduce((n, event) => n + event.seconds, 0),
  pedestrianSeconds: walks.reduce((n, event) => n + event.seconds, 0),
  conflicts, walks,
};
console.log(JSON.stringify(report, null, 2));
if (!report.selected || !report.signals.length || !report.buses.length || report.gradePairsInService.length ||
    report.vehicleSeconds || report.pedestrianSeconds) process.exitCode = 1;
