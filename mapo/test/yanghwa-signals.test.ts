import { readFileSync } from 'node:fs';
import { Color, type InstancedMesh } from 'three';
import { expect, it } from 'vitest';
import { carPlayback, type HapjeongDemand } from '../src/aerial/hapjeong-car-playback.ts';
import type { HapjeongCars } from '../src/aerial/hapjeong-car-graph.ts';
import type { SurveyArea } from '../src/aerial/survey-area.ts';
import { makeYanghwaSignals } from '../src/aerial/yanghwa-signals.ts';

const parse = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const data: HapjeongCars = parse('../public/data/v2/yanghwa-map-cars.json');
const demand: HapjeongDemand = parse('../public/data/v2/yanghwa-map-demand.json');
const area: SurveyArea = parse('../tools/v2/areas/yanghwa-map.json');

it('shows the active signal plan in three batches at the correct positions and colors', () => {
  const run = carPlayback(data, true, undefined, true, demand, undefined, undefined, area);
  const { S } = run.graph.inter;
  const { group, cars, walks, update } = makeYanghwaSignals(data, run.graph);
  const [vehicleMesh, walkMesh] = group.children as InstancedMesh[];
  const colors = [0x56eb8b, 0xffcb56, 0xff5656].map(hex => new Color(hex));
  const expectColor = (mesh: InstancedMesh, i: number, state: number) => {
    const color = new Color();
    mesh.getColorAt(i, color);
    const expected = colors[state];
    expect(Math.hypot(color.r - expected.r, color.g - expected.g, color.b - expected.b)).toBeLessThan(1e-6);
  };

  expect(group.children).toHaveLength(3);
  expect(new Set(cars.map(lamp => lamp.edge))).toEqual(new Set(S.approach.keys()));
  expect(new Set(cars.map(lamp => S.approach.get(lamp.edge)!.c)).size).toBe(13);
  const signed = data.crosswalks.flatMap((c, i) => c.sig && S.crossSite[i] >= 0 ? [i, i] : []);
  expect(walks.map(lamp => lamp.crossing)).toEqual(signed);
  const matched = cars.filter(lamp => lamp.surveyed);
  expect(matched.length).toBeGreaterThan(0);
  expect(matched.length).toBeLessThan(cars.length);
  expect(new Set(matched.map(lamp => lamp.surveyed)).size).toBe(matched.length);
  for (const lamp of matched) expect(lamp.at).toEqual(data.lights?.find(light => light.id === lamp.surveyed)?.at);
  for (const [i, lamp] of walks.entries()) {
    expect(lamp.at).toEqual(data.crosswalks[lamp.crossing].ends[i % 2]);
  }
  expect(cars.some(lamp => lamp.movement === 1)).toBe(true);

  for (let seconds = 0; seconds <= 120; seconds += 15) {
    const { tod } = run.clock(seconds);
    update(tod);
    cars.forEach((lamp, i) => expectColor(vehicleMesh, i, S.state(lamp.edge, lamp.movement, tod)));
    walks.forEach((lamp, i) => expectColor(walkMesh, i, S.walkState(lamp.crossing, tod)));
  }
});
