import { describe, expect, it } from 'vitest';
import { makeSurveyBuildings, type SurveyBuilding } from '../src/aerial/survey-buildings.ts';

const building: SurveyBuilding = {
  height: 6, floors: 2,
  faces: [[[[0,0], [12,0], [12,8], [0,8], [0,0]]]],
  appearance: [{ roof: '#365269', wall: '#b7ab9e', style: 'urban', street: [0] }],
};

describe('survey building meshes', () => {
  it('batches faces, preserves the envelope and puts the roof below its coping', () => {
    const [mesh, ...rest] = makeSurveyBuildings([building, building]);
    expect(rest).toHaveLength(0);
    const geometry = mesh.geometry;
    expect(geometry.boundingBox!.min.length()).toBe(0);
    expect(geometry.boundingBox!.max.toArray()).toEqual([12, 6, 8]);
    const pos = geometry.getAttribute('position'), facade = geometry.getAttribute('facade');
    const roofs = Array.from({length: pos.count}, (_, i) => pos.getY(i)).filter((_, i) => facade.getY(i) < 0);
    expect(roofs.some(y => Math.abs(y - 5.78) < .001)).toBe(true);
    expect(roofs.some(y => Math.abs(y - 6) < .001)).toBe(true);
  });

  it('marks only the selected street wall for separate ground-floor glazing', () => {
    const [mesh] = makeSurveyBuildings([building]);
    const pos = mesh.geometry.getAttribute('position'), facade = mesh.geometry.getAttribute('facade');
    const street = Array.from({length: pos.count}, (_, i) => i).filter(i => facade.getZ(i) >= 2);
    expect(street).toHaveLength(6);
    expect(street.every(i => pos.getZ(i) === 0)).toBe(true);
    expect(Math.max(...street.map(i => facade.getX(i)))).toBe(5);
    expect(Math.max(...street.map(i => facade.getY(i)))).toBe(2);
  });
});
