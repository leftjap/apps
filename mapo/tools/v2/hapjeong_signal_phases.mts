import { CYCLE } from '../../src/sim/intersection/index.ts';
import type { SignalPlan } from '../../src/sim/intersection/signal.ts';

/** Express site-relative phases on the main site's clock for the existing audits. */
export function replaySteps(plan: SignalPlan, measured: boolean) {
  const main = plan.list.find(site => site.j >= 0)!;
  if (!measured) return main.steps;
  const wrap = (t: number) => ((t % CYCLE) + CYCLE) % CYCLE;
  const changes = plan.list.flatMap(site => site.steps.map(step => wrap(step.start + main.offset - site.offset)));
  const boundaries = [...new Set([0, CYCLE, ...changes])].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, i) => {
    const dur = boundaries[i+1] - start;
    const sample = start + dur/2;
    const steps = plan.list.map(site => {
      const local = wrap(sample - main.offset + site.offset);
      return site.steps.find(step => step.start <= local && local < step.start + step.dur)!;
    });
    return { start, dur, green: new Map(steps.flatMap(step => [...step.green])),
      amber: new Map(steps.flatMap(step => [...step.amber])),
      yields: new Map(steps.flatMap(step => [...step.yields])),
      walk: new Set(steps.flatMap(step => [...step.walk])) };
  });
}
