import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { carPlayback, carVisibility } from '../src/aerial/hapjeong-car-playback.ts';
import { nearestS, pointAt } from '../src/poly.ts';
import { makeCars } from '../src/sim/cars.ts';
import { CYCLE } from '../src/sim/intersection/index.ts';
import { makeSimProvider } from '../src/sim/provider.ts';

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
  expect(graph.buses).toHaveLength(2);
  expect(graph.buses.every(bus => bus.edges.every((id, i) => !i || graph.edges[bus.edges[i-1]].next.includes(id)))).toBe(true);
});

it('feeds the surveyed slip lane at the southeast crossing as well as the through lanes', () => {
  const run = carPlayback(asset);
  const i = asset.crosswalks.findIndex((c: { id: string }) => c.id.endsWith('0040'));
  const lanes = new Set(run.graph.edges.filter(e =>
    run.graph.inter.X.stops.xwOf(e.id, 0).some((value, k) => k % 4 === 2 && value === i),
  ).map(e => e.id));
  let used = false;
  for (let t = 0; t <= run.duration; t += .5) {
    const cars = run.at(t);
    used ||= cars.debug().edge.subarray(0, cars.cars.n).some(id => lanes.has(id));
  }
  expect(used).toBe(true);
});

it('feeds from the mapped boundary to the measured reference count without dropping a visible car', () => {
  const walk = JSON.parse(readFileSync(new URL('../public/data/v2/hapjeong-hd-walk.json', import.meta.url), 'utf8'));
  const run = carPlayback(asset, true, { walk }, true, { vehicles:86, walkers:0 });
  const samples: number[] = [];
  let previous = new Map<number, boolean>();
  const onScreen = carVisibility();

  let removals = 0;
  for (let frame = 0; frame <= 180*30; frame++) {
    const { cars } = run.at(frame/30);
    const current = new Map(Array.from({length:cars.n}, (_,i)=>[cars.uid[i], onScreen(cars.x[i],cars.z[i])]));
    for (const [uid, visible] of previous) if (visible && !current.has(uid)) removals++;
    previous = current;
    if (frame >= 60*30 && frame%30===0) samples.push(cars.n);
  }
  const midpoint = samples.sort((a,b)=>a-b)[Math.floor(samples.length/2)];
  expect(midpoint).toBeGreaterThanOrEqual(0.85*86);
  expect(removals).toBe(0);
});

it('lets a bus with a clear curved A2 path reach its outlet during the replay', () => {
  const walk = JSON.parse(readFileSync(new URL('../public/data/v2/hapjeong-hd-walk.json', import.meta.url), 'utf8'));
  const run = carPlayback(asset,true,{walk});
  const route = run.graph.buses[1];
  let through = false;
  for (let frame=0; frame<=180*30; frame++) {
    const sim = run.at(frame/30);
    const { edge } = sim.debug();
    for (let i=0;i<sim.cars.n;i++) {
      if (sim.cars.route[i]===1 && edge[i]===route.edges.at(-1)) through = true;
    }
  }
  expect(through).toBe(true);
});

it('stops a bus for a person on its curved path and moves again when the path clears', () => {
  const run = carPlayback(asset, false);
  const { edges, inter, buses, crosswalks } = run.graph;
  const sim = makeCars(edges, makeSimProvider(), 11, 32, buses, inter,
    { list:crosswalks, busy:new Uint32Array(crosswalks.length) });
  const [entry, turn] = buses[1].edges;
  const approach = edges[entry], curve = edges[turn];
  const p = [0, 0, 0];
  pointAt(curve.p, curve.cum, curve.len / 2, p);
  const pedestrians = { n:1, x:Float32Array.of(p[0]), z:Float32Array.of(p[2]) };
  sim.setPeople(pedestrians);
  expect(sim.addBus(1, approach.len - inter.X.gate(entry,0) - 8)).toBe(true);
  let yielded = false, cleared = false;
  for (let frame=0; frame<=150*30; frame++) {
    const t = frame/30;
    if (t >= 18) pedestrians.n = 0;
    sim.step(1/30, run.clock(t), false);
    if (!sim.cars.n) break;
    const d = sim.debug();
    if (t < 18) {
      expect(d.edge[0] === turn && d.s[0] > curve.len / 2).toBe(false);
      yielded ||= d.edge[0] === turn && d.v[0] < .12;
    }
    cleared ||= d.edge[0] === buses[1].edges.at(-1);
  }
  expect(yielded).toBe(true);
  expect(cleared).toBe(true);
});

it('keeps a surveyed bus outside the junction when an occupied outlet cannot fit it', () => {
  const run = carPlayback(asset, false);
  const { edges, inter, buses, crosswalks } = run.graph;
  const sim = makeCars(edges, makeSimProvider(), 11, 32, buses, inter,
    { list:crosswalks, busy:new Uint32Array(crosswalks.length) });
  const entry = buses[1].edges[0], exit = buses[1].edges.at(-1)!;
  const outlet = edges[exit], at = inter.X.relEnd(exit, 0) + 6;
  const p = [0, 0, 0];
  pointAt(outlet.p, outlet.cum, at + 4, p);
  const pedestrians = { n:1, x:Float32Array.of(p[0]), z:Float32Array.of(p[2]) };
  sim.setPeople(pedestrians);
  sim.put(exit, at, 0);
  for (let frame=-5*30; frame<0; frame++) sim.step(1/30, run.clock(frame/30), false);
  expect(sim.debug().v[0]).toBeLessThan(.12);
  expect(sim.addBus(1, edges[entry].len - inter.X.gate(entry,0) - 8)).toBe(true);
  let full = false;
  for (let frame=0; frame<=9*30; frame++) {
    const t = frame/30, now = run.clock(t);
    sim.step(1/30, now, false);
    const d = sim.debug();
    expect(d.edge[1]).toBe(entry);
    full ||= d.gateWhy(1, now.tod) === 4;
  }
  expect(full).toBe(true);
});

it('releases a surveyed reservation after the last possible contact on the departing path', () => {
  const { graph: { inter: { X } } } = carPlayback(asset);
  const pair = X.paths.flatMap(p=>X.paths.filter(q=>p.move===1&&q.move===1&&X.touch(p.id,q.id,0,0)).map(q=>[p,q] as const))[0];
  expect(pair).toBeDefined();
  const [p,q]=pair;
  expect(X.touchAfter!(p.id,q.id,0,0,-Infinity)).toBe(true);
  expect(X.touchAfter!(p.id,q.id,0,0,q.end+40)).toBe(false);
});

it('resolves surveyed outlet merges without two cars blocking one another', () => {
  const walk = JSON.parse(readFileSync(new URL('../public/data/v2/hapjeong-hd-walk.json', import.meta.url), 'utf8'));
  const run = carPlayback(asset, true, { walk }, true, { vehicles:86, walkers:0 });
  let mutual = 0;
  for (let frame=0; frame<=60*30; frame++) {
    const sim = run.at(frame/30);
    const { blockBy } = sim.debug();
    for (let i=0; i<sim.cars.n; i++)
      if (blockBy[i] > i && blockBy[blockBy[i]] === i) mutual++;
  }
  expect(mutual).toBe(0);
});

it('releases both parallel left-turn lanes at green and clears the shared part in turns', () => {
  const run = carPlayback(asset);
  const {edges,inter,buses,crosswalks} = run.graph;
  const {X,S} = inter;
  const pair = X.paths.flatMap(p=>X.paths.filter(q=>q.id>p.id && p.move===1 && q.move===1 &&
    X.surveyed?.parallel?.get(p.a)?.includes(q.a) && X.touch(p.id,q.id,0,0)).map(q=>[p,q] as const))[0];
  expect(pair).toBeDefined();
  const site=S.list[S.approach.get(pair[0].a)!.c];
  const green=site.steps.find(s=>pair.every(p=>(s.green.get(p.a)??0)&1))!;
  const start=(green.start-site.offset+CYCLE)%CYCLE;
  const sim=makeCars(edges,makeSimProvider(),11,16,buses,inter,{list:crosswalks,busy:new Uint32Array(crosswalks.length)});
  for(const p of pair) for(const back of [3,11]) sim.put(p.a,edges[p.a].len-X.gate(p.a,p.lane)-back,p.lane);
  const departed=new Map<number,number>();
  const passed:number[]=[];
  for(let f=-15*30;f<=38*30;f++) {
    const t=f/30;
    sim.step(1/30,run.clock(start+t),false);
    const d=sim.debug();
    for(let i=0;i<sim.cars.n;i++) {
      const uid=sim.cars.uid[i], p=pair[uid>2?1:0];
      if(t>=0 && d.edge[i]===p.a && d.v[i]>=.12 && !departed.has(uid)) departed.set(uid,t);
      if(d.edge[i]===p.edges.at(-1) && !passed.includes(uid)) passed.push(uid);
    }
  }
  expect(departed.has(1) && departed.has(3)).toBe(true);
  expect(Math.abs(departed.get(1)!-departed.get(3)!)).toBeLessThanOrEqual(.5);
  expect(passed.length).toBeGreaterThanOrEqual(3);
  expect(passed.every((uid,k)=>!k || (uid>2)!==(passed[k-1]>2))).toBe(true);
});
