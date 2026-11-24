import { expect, it } from 'vitest';
import { carGridRadius } from '../src/sim/cars.ts';

it('uses the default grid for the legacy board and covers all district coordinates when requested', () => {
  expect(carGridRadius()).toBe(2000);
  expect(carGridRadius([-2375.1, -1821.1, 1576.5, 1033.3])).toBe(2376);
});
