import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { signalFrames, type SignalTrial } from '../src/aerial/hapjeong-signal-trial.ts';
import { peoplePlayback, type PeopleRehearsal } from '../src/aerial/hapjeong-people.ts';
import type { HapjeongWalk } from '../src/aerial/hapjeong-walk-signals.ts';
import type { Portal } from '../src/sim/people/index.ts';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../public/data/v2/hapjeong-hd-${name}.json`, import.meta.url), 'utf8'));
const graph = read('walk') as HapjeongWalk & { portals: Portal[] };
const rehearsal = read('pedestrians') as PeopleRehearsal;
const trial = read('signal-trial').straight as SignalTrial;
const frames = signalFrames(trial);

it('walks three people on the original engine and reproduces their state after seeking back', () => {
  const playback = peoplePlayback(graph, rehearsal, trial, frames, false);
  const ids = [...playback.at(0).w.id.slice(0, 3)];
  const waited = new Set<number>();
  const crossed = new Set<number>();
  const crossings = new Map<number, Set<number>>();
  for (let i = 0; i < frames.length; i++) {
    const simulator = playback.at(i);
    expect(simulator.w.n).toBe(3);
    for (let n = 0; n < simulator.w.n; n++) {
      const id = simulator.w.id[n];
      const state = simulator.stateOf(n);
      expect(simulator.validAt(n)).toBe(true);
      if (state.mode === simulator.MODES.WAITX) waited.add(id);
      if (state.mode === simulator.MODES.CROSS) {
        crossed.add(id);
        if (!crossings.has(id)) crossings.set(id, new Set());
        crossings.get(id)!.add(state.cross!.xw);
      }
    }
  }
  const end = [...playback.at(frames.length - 1).w.x.slice(0, 3)];
  expect([...waited].sort(), JSON.stringify([...crossings].map(([id, links]) => [id, [...links].map(i => graph.crossings[i].slice(-4))]))).toEqual(ids.sort());
  expect([...crossed].sort()).toEqual(ids.sort());
  for (const [i, person] of rehearsal.people.entries()) {
    const id = playback.at(0).w.id[i];
    expect([...crossings.get(id) ?? []].map(k => graph.crossings[k]), person.id).toContain(person.legs.find(leg => leg.crossing)!.crossing);
  }
  playback.at(0);
  expect([...playback.at(frames.length - 1).w.x.slice(0, 3)]).toEqual(end);
});

it('starts with 30–60 people, including automatic arrivals from Hapjeong exits and pavement', () => {
  const playback = peoplePlayback(graph, rehearsal, trial, frames, true);
  const initial = playback.at(0);
  expect(initial.docks.filter(p => p.kind === 'exit' && p.key === '합정').length).toBeGreaterThan(0);
  expect(initial.docks.filter(p => p.kind === 'exit' && p.key === '인도').length).toBeGreaterThan(0);
  for (const frame of [0, 900, 1800, 2700, frames.length - 1]) {
    const people = playback.at(frame).w.n;
    expect(people).toBeGreaterThanOrEqual(30);
    expect(people).toBeLessThanOrEqual(60);
  }
});

it.fails('the showcase walker reaches the platform with the full crowd', () => {
  const playback = peoplePlayback(graph, rehearsal, trial, frames, true);
  const id = playback.at(0).w.id[rehearsal.people.findIndex(p => p.id === 'platform')];
  const end = playback.at(frames.length - 1);
  expect(end.stateOf(end.w.id.indexOf(id)).mode).toBe(end.MODES.QUEUE);
});
