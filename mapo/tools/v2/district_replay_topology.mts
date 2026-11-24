/** Report the transitions the surveyed engine can actually drive. */
import { readFileSync } from 'node:fs';
import { districtCarGraph, type HapjeongCars } from '../../src/aerial/hapjeong-car-graph.ts';

const data: HapjeongCars = JSON.parse(readFileSync(0, 'utf8'));
const { edges, links, inter: { X }, buses } = districtCarGraph(data, '');
const entersJunction = (a: number, b: number) =>
  (X.jEnd[b] >= 0 && X.jStart[b] === X.jEnd[b]) ||
  (X.jStart[b] >= 0 && X.jStart[b] === X.jEnd[a]);
const approaches = (a: number) => X.jEnd[a] >= 0 && X.jStart[a] !== X.jEnd[a];
const key = (i: number) => edges[i].key;
const allowed = edges.map(() => new Set<number>());
const validApproaches = new Set<number>();
for (const a of edges) {
  if (!approaches(a.id)) continue;
  for (const [i, path] of (X.exits.get(a.id) ?? []).entries()) {
    if (!X.path(a.id, 0, i)) continue;
    validApproaches.add(a.id);
    for (let j = 1; j < path.edges.length; j++) allowed[path.edges[j - 1]].add(path.edges[j]);
  }
}
const rejected = [];
for (const a of edges) {
  const hasPath = validApproaches.has(a.id);
  for (const b of a.next) {
    if (allowed[a.id].has(b)) continue;
    if (!hasPath && !entersJunction(a.id, b)) allowed[a.id].add(b);
    else rejected.push({ from: key(a.id), to: key(b), reason: hasPath ? 'not in an engine path' :
      approaches(a.id) ? 'approach has no engine path' : 'junction connector without a path' });
  }
}
const busProblems = buses.map(({ edges: route }) => {
  const problems = [];
  // A matched path authorizes its entire chain. Without it onEdge will
  // terminate a bus attempting to enter a junction connector.
  for (let i = 0; i+1 < route.length; i++) {
    const a = route[i], b = route[i+1];
    const choice = approaches(a) ? (X.exits.get(a) ?? []).findIndex(
      p => p.edges.every((id, n) => route[i+n] === id),
    ) : -1;
    const path = choice < 0 ? undefined : X.path(a,0,choice) ?? X.pathAny(a,0,choice);
    if (path) i += path.edges.length - 2;
    else if (entersJunction(a,b)) problems.push({ from: key(a), to: key(b) });
  }
  return problems;
});
console.log(JSON.stringify({
  lanes: edges.map((edge, i) => ({ key: key(i), points: links[i].points, next: [...allowed[i]].map(key) })),
  rejected,
  busProblems,
}));
