import { expect, it } from 'vitest';
import { tileSurface } from '../src/aerial/yanghwa-terrain.ts';

it('places ground triangles in separate spatial meshes without losing a face', () => {
  const tile = (x: number) => [[[x, 2], [x + 5, 2], [x + 5, 7], [x, 7], [x, 2]]] as [number, number][][];
  const geometry = tileSurface([tile(2), tile(120)], 96);
  expect(geometry).toHaveLength(2);
  expect(geometry.map(part => part.getAttribute('position').count)).toEqual([6, 6]);
  expect(geometry.map(part => {
    part.computeBoundingBox();
    return part.boundingBox?.min.x;
  })).toEqual([2, 120]);
});
