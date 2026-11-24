import { expect, it } from 'vitest';
import { makeSurveyBuildings, type SurveyBuilding } from '../src/aerial/survey-buildings.ts';

it('batches distant buildings without façade textures or parapet geometry', () => {
  const building = (x: number): SurveyBuilding => ({
    height: 9, floors: 3,
    faces: [[[[x, 2], [x + 10, 2], [x + 10, 12], [x, 12], [x, 2]]]],
  });
  const buildings = [building(1), building(120)];
  const close = makeSurveyBuildings(buildings);
  const distant = makeSurveyBuildings(buildings, { detail: false, chunkSize: 384 });

  expect(close).toHaveLength(2);
  expect(close[0].geometry.hasAttribute('facade')).toBe(true);
  expect(distant).toHaveLength(1);
  const { geometry } = distant[0];
  expect(geometry.hasAttribute('facade')).toBe(false);
  expect(geometry.getAttribute('position').count).toBe(60); // two roofs and eight walls
  expect(geometry.boundingBox?.max.y).toBe(9);
});
