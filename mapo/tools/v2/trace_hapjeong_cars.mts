import { replaySteps } from './hapjeong_signal_phases.mts';
import { loadArea, readAsset } from './area.mts';
import { carPlayback, carVisibility } from '../../src/aerial/hapjeong-car-playback.ts';
import type { HapjeongCars } from '../../src/aerial/hapjeong-car-graph.ts';
import { headingNear } from '../../src/sim/graph.ts';
import { CYCLE, GREEN, RED, STRAIGHT } from '../../src/sim/intersection/index.ts';
import { BODY_R } from '../../src/sim/people/index.ts';
import type { HapjeongPeopleInput } from '../../src/aerial/hapjeong-people.ts';

const area = loadArea();
const read = (name: string) => readAsset(area, name);
const data: HapjeongCars = read('cars');
const signalTest = process.argv.includes('--signal-test');
const cycleArg = process.argv.indexOf('--cycles');
const cycles = cycleArg < 0 ? undefined : Number(process.argv[cycleArg + 1]);
if (cycles !== undefined && (!Number.isSafeInteger(cycles) || cycles < 1)) throw Error('--cycles requires a positive integer');
const people: HapjeongPeopleInput | undefined = signalTest || process.argv.includes('--people')
  ? { walk: read('walk'), entrances: read('entrances'), signalTest } : undefined;
const run = carPlayback(data, !process.argv.includes('--seeded'), people, true,
  process.argv.includes('--unscaled') ? undefined : read('demand'), cycles, undefined, area);
const { inter: { X, S }, edges, links } = run.graph;
const site = S.list.find(row => row.j >= 0)!;
const phases = replaySteps(S, !!data.signalSites);
const visible = carVisibility(area.views.simulation);
const wraps = (a: number) => ((a * 180 / Math.PI + 540) % 360) - 180;
const approach = [...S.approach].map(([i, row]) => {
  const degree = wraps(headingNear(edges[i], edges[i].len));
  return { id: links[i].id, edge: i, group: row.group, degree, moves: row.moves, stop: links[i].stop,
    green: phases.filter(step => step.green.has(i)).map(s => [s.start, s.start+s.dur, s.green.get(i)]),
  };
});
console.log(JSON.stringify({
  links: links.map(r => r.id), entries: edges.filter(e => e.entry).map(e => links[e.id].id),
  approach, cycle: CYCLE, duration: run.duration, offset: site.offset, axis: wraps(site.axis),
  ingressAudit: run.ingressAudit, overlappingTerminals: [...run.overlappingTerminals],
  busRoutes: run.graph.buses.map(route => route.edges.map(id => links[id].id)),
  views: area.views.simulation,
  gates:Object.fromEntries(approach.map(a=>[a.edge,edges[a.edge].len-X.gate(a.edge,0)])),
  portalAudit: run.people()?.portalAudit,
  crossingTrial: run.people()?.crossingTrial?.courses,
  removedWalkLinks: run.crossings?.omitted, bodyRadius: BODY_R,
  entrances: people?.entrances?.exits, platforms: people?.entrances?.platforms,
  unlinkedExits: people?.entrances?.unlinkedExits?.map(exit => exit.key),
  crosswalks: data.crosswalks.map((r, i) => ({ id:r.id.slice(-4), sig:r.sig,
    green: phases.filter(s => s.walk.has(i)).map(s => [s.start, s.start+s.dur]),
    associated: S.crossSite[i] >= 0,
  })),
  signalSites: data.signalSites && S.list.map((s,c) => ({
    at:[s.x,s.z], junction:s.j, offset:s.offset, cycle:CYCLE,
    approaches:approach.filter(a=>S.approach.get(a.edge)?.c===c).map(a=>a.id),
    crossings:data.crosswalks.filter((_,i)=>S.crossSite[i]===c).map(r=>r.id),
    steps:s.steps.map(p=>({start:p.start,end:p.start+p.dur,green:p.green.size,amber:p.amber.size,
      walks:[...p.walk].map(i=>data.crosswalks[i].id)})),
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
    const light = ap ? S.moveState(ap, data.signalSites && S.midApproach.has(e) ? STRAIGHT : move, tod) : -1;
    const midQueue = data.signalSites && S.midApproach.has(e) && d.aheadWhy[i] === 5 && light > 0;
    let crossingHold = false;
    if (data.signalSites && d.v[i] < .12 && d.aheadWhy[i] === 11) {
      const { XG, XW, XT } = d.xwAhead(i);
      for (let n = 0; n < XG.length; n += 4) {
        const [start, end, from, to] = XG.slice(n, n+4);
        if (start < .3) continue;
        const clearSeconds = (end + d.size[i] + 1) / 3 + 1;
        crossingHold = XW.slice(from, to).some(x => S.walkState(x, tod) !== RED || S.walkIn(x, tod) < clearSeconds);
        for (let a = 0; !crossingHold && a < XT.length; a += 3)
          if (XT[a] > start && XT[a] - d.size[i] < end + 1)
            crossingHold = S.state(XT[a+1], STRAIGHT, tod) !== GREEN;
        break;
      }
    }
    return [cars.uid[i], cars.x[i], cars.z[i], cars.yaw[i], cars.kind[i], d.size[i], d.wid[i], e, d.s[i],
      d.v[i], d.aheadWhy[i], light, d.go[i], d.past[i],
      p?.j ?? -1, p?.move ?? 0, X.jStart[e] >= 0 && X.jStart[e] === X.jEnd[e],
      visible(cars.x[i], cars.z[i]), d.blockBy[i] >= 0 ? cars.uid[d.blockBy[i]] : null,
      d.ahead[i] >= 0 ? cars.uid[d.ahead[i]] : null,
      ap && d.v[i] < .12 && !d.past[i] ? (midQueue ? 1 : d.gateWhy(i, tod)) : -1, d.nextE[i], d.lane[i], edges[e].len-(ap?.setback??0), p?.a??-1, p?.edges.at(-1)??-1, d.jk[i], d.dwell[i], ...(data.signalSites ? [crossingHold] : [])];
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
      walk.crossingTrial?.active.get(w.id[i]), state === 'wait' && sig ? [S.walkLeft(xw,tod),
        walk.crossingTime(i, run.crossings?.signalPairs.find(pair => pair.includes(xw)))] : undefined];
  }) : undefined;
  console.log(JSON.stringify([t, rows, pedestrians, people ? Array.from(run.busy()) : undefined,
    walk?.busEvents.filter(event=>Math.abs(event.at-t)<1e-5),
    walk && people?.entrances ? Object.fromEntries(people.entrances.platforms.map(
      ({key})=>[key,walk.waitingAt(key)])) : undefined]));
}
