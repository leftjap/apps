import { readFileSync } from 'node:fs';
import { Color, Matrix4, Vector3, type InstancedMesh } from 'three';
import { expect, it } from 'vitest';
import { carPlayback, type HapjeongDemand } from '../src/aerial/hapjeong-car-playback.ts';
import { districtCarGraph, type HapjeongCars } from '../src/aerial/hapjeong-car-graph.ts';
import type { SurveyArea } from '../src/aerial/survey-area.ts';
import { makeYanghwaSignals } from '../src/aerial/yanghwa-signals.ts';

const parse = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const data: HapjeongCars = parse('../public/data/v2/yanghwa-map-cars.json');
const demand: HapjeongDemand = parse('../public/data/v2/yanghwa-map-demand.json');
const area: SurveyArea = parse('../tools/v2/areas/yanghwa-map.json');

it('draws measured poles and switches exactly one physical lens per signal', () => {
  const run = carPlayback(data, true, undefined, true, demand, undefined, undefined, area);
  const { S } = run.graph.inter;
  const { group, cars, walks, update } = makeYanghwaSignals(data, run.graph);
  const [frames, vehicleLenses, pedestrianLenses] = group.children as InstancedMesh[];
  const active = (mesh: InstancedMesh, lamp: number, count: number) => {
    const color = new Color();
    return Array.from({ length: count }, (_, slot) => {
      mesh.getColorAt(lamp * count + slot, color);
      return color.r + color.g + color.b > .2 ? slot : -1;
    }).filter(slot => slot >= 0);
  };

  expect(group.children).toHaveLength(3);
  expect(frames.count).toBeGreaterThan(cars.length + walks.length);
  expect(vehicleLenses.count).toBe(cars.length * 3);
  expect(pedestrianLenses.count).toBe(walks.length * 2);
  const pose = new Matrix4();
  vehicleLenses.getMatrixAt(0, pose);
  const top = new Vector3().setFromMatrixPosition(pose);
  vehicleLenses.getMatrixAt(2, pose);
  expect(top.y).toBeGreaterThan(new Vector3().setFromMatrixPosition(pose).y);
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
    const [x, z] = data.crosswalks[lamp.crossing].ends[i % 2];
    expect(Math.hypot(lamp.at[0] - x, lamp.at[1] - z)).toBeLessThan(2);
  }
  expect(cars.some(lamp => lamp.movement === 1)).toBe(true);

  for (let seconds = 0; seconds <= 120; seconds += 15) {
    const { tod } = run.clock(seconds);
    update(tod);
    cars.forEach((lamp, i) => expect(active(vehicleLenses, i, 3)).toEqual([2 - S.state(lamp.edge, lamp.movement, tod)]));
    walks.forEach((lamp, i) => expect(active(pedestrianLenses, i, 2)).toEqual([S.walkState(lamp.crossing, tod) === 0 ? 1 : 0]));
  }
});

it('can display the district signal plan without creating vehicles', () => {
  const district: HapjeongCars = parse('../public/data/v2/hongdae-district-cars.json');
  const graph = districtCarGraph(district, '');
  const { cars, walks } = makeYanghwaSignals(district, graph);
  const activeSites = new Set(cars.map(lamp => graph.inter.S.approach.get(lamp.edge)?.c));
  expect(activeSites.size).toBe(53);
  expect(walks.every(lamp => district.crosswalks[lamp.crossing].sig)).toBe(true);
  expect(walks.length).toBeGreaterThan(0);
});
