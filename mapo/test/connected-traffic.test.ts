import { expect, it } from 'vitest';
import type { HapjeongCars } from '../src/aerial/hapjeong-car-graph.ts';
import { surveyBoundaryTraffic, boundaryTraffic, insideOutline, nearestOutlinePoint } from '../src/aerial/connected-traffic.ts';

const outline: [number,number][][][] = [[[[0,0],[50,0],[50,12],[12,12],[12,30],[0,30],[0,0]]]];

it('clamps blank corners to the polygon while preserving points on the map', () => {
  expect(insideOutline(outline,[40,20])).toBe(false);
  expect(nearestOutlinePoint(outline,[40,20])).toEqual([40,12]);
  expect(nearestOutlinePoint(outline,[6,20])).toEqual([6,20]);
});

it('keeps long boundary-to-boundary paths and excludes interior dead ends', () => {
  const successors = Array.from({length:23},(_,i)=>[i+1]).concat([[],[],[24]]);
  successors[4].push(24);
  const route = boundaryTraffic(successors,[0,25],[23]);
  expect([...route.selected].sort((a,b)=>a-b)).toEqual(Array.from({length:24},(_,i)=>i));
  expect(route.entries).toEqual(new Set([0]));
});

it('excludes short survey pieces and connectors from boundary portals', () => {
  const links = [
    { id: 'short', len: 3, kind: '6', points: [[0, 5], [3, 5]], next: [1], duplicateOf: null },
    { id: 'through', len: 44, kind: '6', points: [[3, 5], [47, 5]], next: [2], duplicateOf: null },
    { id: 'connector', len: 3, kind: '1', points: [[47, 5], [50, 5]], next: [], duplicateOf: null },
    { id: 'interior-dead-end', len: 4, kind: '6', points: [[3, 5], [3, 9]], next: [], duplicateOf: null },
    { id: 'valid-inlet', len: 9, kind: '6', points: [[0, 8], [9, 8]], next: [5, 6], duplicateOf: null },
    { id: 'valid-outlet', len: 41, kind: '6', points: [[9, 8], [50, 8]], next: [], duplicateOf: null },
    { id: 'long-connector', len: 41, kind: '1', points: [[9, 8], [50, 10]], next: [], duplicateOf: null },
  ] as HapjeongCars['links'];
  const route = surveyBoundaryTraffic(links, links, new Set<number>(), point=>point[0] === 0 || point[0] === 50);
  expect([...route.selected]).toEqual([4, 5]);
  expect([...route.entries]).toEqual([4]);
  expect(route.outlets).toEqual([5]);
});
