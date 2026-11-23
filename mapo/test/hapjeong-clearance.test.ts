import { expect, it } from 'vitest';
import { clearsWalkSignals } from '../src/sim/cars.ts';

it('checks the rear leaving each crossing against that crossing’s own deadline', () => {
  const distanceToTime = (distance: number) => distance / 5;
  const faces: [number, number][] = [[12,5], [42,12]];
  expect(clearsWalkSignals(faces, 5, distanceToTime)).toBe(true);
  expect(clearsWalkSignals([[12,4], faces[1]], 5, distanceToTime)).toBe(false);
  expect(clearsWalkSignals([faces[0], [42,10]], 5, distanceToTime)).toBe(false);
});
