import { readFileSync } from 'node:fs';
import { carPlayback, carVisibility } from '../../src/aerial/hapjeong-car-playback.ts';
import type { HapjeongCars } from '../../src/aerial/hapjeong-car-graph.ts';
import { headingNear } from '../../src/sim/graph.ts';
import { CYCLE, STRAIGHT } from '../../src/sim/intersection/index.ts';

const data: HapjeongCars = JSON.parse(readFileSync(new URL('../../public/data/v2/hapjeong-hd-cars.json', import.meta.url), 'utf8'));
const run = carPlayback(data, !process.argv.includes('--seeded'));
const { inter: { X, S }, edges, links } = run.graph;
const site = S.list.find(row => row.j >= 0)!;
const visible = carVisibility();
const wraps = (a: number) => ((a * 180 / Math.PI + 540) % 360) - 180;
const approach = [...S.approach].map(([i, row]) => {
  const degree = wraps(headingNear(edges[i], edges[i].len));
  return { id: links[i].id, edge: i, group: row.group, degree, moves: row.moves, stop: links[i].stop,
    green: site.steps.filter(step => step.green.has(i)).map(s => [s.start, s.start+s.dur, s.green.get(i)]),
  };
});
console.log(JSON.stringify({
  links: links.map(r => r.id), entries: edges.filter(e => e.entry).map(e => links[e.id].id),
  approach, cycle: CYCLE, duration: run.duration, offset: site.offset, axis: wraps(site.axis),
  crosswalks: data.crosswalks.map((r, i) => ({ id:r.id.slice(-4), sig:r.sig,
    green: site.steps.filter(s => s.walk.has(i)).map(s => [s.start, s.start+s.dur]),
    associated: S.crossSite[i] >= 0,
  })),
  curves: edges.flatMap(e => links[e.id].kind === '6' &&
    wraps(headingNear(e,e.len) - headingNear(e,0)) > 60 ? [e.id] : []),
}));
for (let frame = 0; frame <= run.duration * 30; frame++) {
  const t = frame / 30;
  const sim = run.at(t);
  const { cars } = sim;
  const d = sim.debug(), tod = run.clock(t).tod;
  const rows = Array.from({length:cars.n}, (_, i) => {
    const e = d.edge[i], k = d.jp[i] >= 0 ? d.jp[i] : d.pp[i];
    const p = k >= 0 ? X.paths[k] : null, ap = S.approach.get(e);
    const move = p?.move ?? STRAIGHT;
    return [cars.uid[i], cars.x[i], cars.z[i], cars.yaw[i], cars.kind[i], d.size[i], d.wid[i], e, d.s[i],
      d.v[i], d.aheadWhy[i], ap ? S.moveState(ap, move, tod) : -1, d.go[i], d.past[i],
      p?.j ?? -1, p?.move ?? 0, X.jStart[e] >= 0 && X.jStart[e] === X.jEnd[e],
      visible(cars.x[i], cars.z[i]), d.blockBy[i] >= 0 ? cars.uid[d.blockBy[i]] : null,
      d.ahead[i] >= 0 ? cars.uid[d.ahead[i]] : null,
      ap && d.v[i] < .12 && !d.past[i] ? d.gateWhy(i, tod) : -1];
  });
  console.log(JSON.stringify([t, rows]));
}
