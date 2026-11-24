import { expect, it } from 'vitest';
import { insideTrafficView, type Outline } from '../src/aerial/connected-traffic.ts';

it('authorizes an interior entry or exit only within eight metres of its measured terminal', () => {
  const outline: Outline = [[[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]]];
  expect(insideTrafficView(outline, [[50, 50]], [58, 50])).toBe(false);
  expect(insideTrafficView(outline, [[50, 50]], [58.1, 50])).toBe(true);
  expect(insideTrafficView(outline, [], [14.99, 50])).toBe(false);
});
