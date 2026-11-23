import { expect, it } from 'vitest';
import { followingAcceleration, limitAcceleration } from '../src/sim/longitudinal.ts';

it('uses the local following parameters without changing the default equations', () => {
  const inputs = [5, 9, 0, 6, true] as const;
  const ordinary = followingAcceleration(...inputs);
  const measured = { headway:.45, acceleration:2.4 };
  expect(followingAcceleration(...inputs, measured)).toBeGreaterThan(ordinary);
  expect(limitAcceleration(3,0,Infinity,false,measured.acceleration)).toBe(2.4);
  expect(followingAcceleration(...inputs)).toBe(ordinary);
  expect(limitAcceleration(3,0,Infinity,false)).toBe(1.6);
});
