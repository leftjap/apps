import { readFileSync } from 'node:fs';
import { carPlayback, carVisibility, carViews } from '../../src/aerial/hapjeong-car-playback.ts';
import type { HapjeongCars } from '../../src/aerial/hapjeong-car-graph.ts';
import { headingNear } from '../../src/sim/graph.ts';
import { CYCLE, STRAIGHT } from '../../src/sim/intersection/index.ts';
import { BODY_R } from '../../src/sim/people/index.ts';
import type { HapjeongPeopleInput } from '../../src/aerial/hapjeong-people.ts';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../public/data/v2/hapjeong-hd-${name}.json`, import.meta.url), 'utf8'));
const data: HapjeongCars = read('cars');
const signalTest = process.argv.includes('--signal-test');
const people: HapjeongPeopleInput | undefined = signalTest || process.argv.includes('--people') ? { walk: read('walk'), signalTest } : undefined;
const run = carPlayback(data, !process.argv.includes('--seeded'), people, true,
  process.argv.includes('--unscaled') ? undefined : read('demand'));
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
  ingressAudit: run.ingressAudit, overlappingTerminals: [...run.overlappingTerminals],
  busRoutes: run.graph.buses.map(route => route.edges.map(id => links[id].id)),
  views: carViews,
  gates:Object.fromEntries(approach.map(a=>[a.edge,edges[a.edge].len-X.gate(a.edge,0)])),
  portalAudit: run.people()?.portalAudit,
  crossingTrial: run.people()?.crossingTrial?.courses,
  removedWalkLinks: run.crossings?.omitted, bodyRadius: BODY_R,
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
      ap && d.v[i] < .12 && !d.past[i] ? d.gateWhy(i, tod) : -1, d.nextE[i], d.lane[i], edges[e].len-(ap?.setback??0), p?.a??-1, p?.edges.at(-1)??-1, d.jk[i]];
  });
  const walk = run.people();
  const pedestrians = walk ? Array.from({length:walk.w.n}, (_, i) => {
    const { w, MODES } = walk;
    const { mode, cross } = walk.stateOf(i);
    const xw = cross?.xw ?? -1;
    const sig = xw >= 0 && data.crosswalks[xw].sig;
    const state = mode === MODES.WAITX ? 'wait' : mode === MODES.CROSS ? 'cross' : mode === MODES.WALK ? 'walk' : mode === MODES.LEAVE ? 'leave' : 'other';
    let byCar = false;
    if (state === 'wait' && !sig && xw >= 0 && !w.moving[i] && sim.approaching(xw)) {
      const { tx, tz } = walk.debugOf(i);
      byCar = Math.hypot(w.x[i] - tx, w.z[i] - tz) <= .05;
    }
    return [w.id[i], w.x[i], w.z[i], state, xw, sig ? S.walkState(xw, tod) : -1, walk.validAt(i), byCar, w.moving[i], walk.journeys.get(w.id[i]),
      walk.crossingTrial?.active.get(w.id[i])];
  }) : undefined;
  console.log(JSON.stringify([t, rows, pedestrians, people ? Array.from(run.busy()) : undefined]));
}
