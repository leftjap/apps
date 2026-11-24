import type { HapjeongCars, XZ } from './hapjeong-car-graph.ts';

export type Outline = XZ[][][];

function inRing(ring: XZ[], [x,z]: XZ) {
  let inside = false;
  let [a,b] = ring.at(-1)!;
  for (const [c,d] of ring) {
    if ((b>z) !== (d>z) && x < a+(c-a)*(z-b)/(d-b)) inside = !inside;
    a=c; b=d;
  }
  return inside;
}

export function insideOutline(outline: Outline, point: XZ) {
  return outline.some(([outer,...holes])=>inRing(outer,point)&&!holes.some(ring=>inRing(ring,point)));
}

export function nearestOutlineEdge(outline: Outline, [x,z]: XZ) {
  let best: XZ = [x,z], distance = Infinity;
  for (const face of outline) for (const ring of face) {
    let [ax,az] = ring.at(-1)!;
    for (const [bx,bz] of ring) {
      const dx=bx-ax, dz=bz-az, square=dx*dx+dz*dz;
      if (square) {
        const t = Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/square));
        const nx=ax+t*dx, nz=az+t*dz;
        const d=Math.hypot(x-nx,z-nz);
        if (d<distance) { best=[nx,nz]; distance=d; }
      }
      ax=bx; az=bz;
    }
  }
  return { point:best, distance };
}

export function nearestOutlinePoint(outline: Outline, point: XZ) {
  return insideOutline(outline,point) ? point : nearestOutlineEdge(outline,point).point;
}

export function boundaryTraffic(successors: number[][], inlets: number[], outlets: number[]) {
  const previous: number[][] = successors.map(()=>[]);
  for (const [a,next] of successors.entries()) for (const b of next) previous[b].push(a);
  const visit = (seeds: number[], arcs: number[][]) => {
    const visited = new Set(seeds);
    const queue = [...seeds];
    for (const id of queue) for (const next of arcs[id]) if (!visited.has(next)) {
      visited.add(next);
      queue.push(next);
    }
    return visited;
  };
  const exitReachable = visit(outlets,previous);
  const entries = new Set(inlets.filter(i=>exitReachable.has(i)));
  const entryReachable = visit(inlets,successors);
  const selected = new Set([...entryReachable].filter(i=>exitReachable.has(i)));
  return { selected, entries, entryReachable, exitReachable };
}

export function surveyBoundaryTraffic(links: HapjeongCars['links'], edges: Pick<HapjeongCars['links'][number], 'len' | 'next'>[],
                                      bus: ReadonlySet<number>, boundary: (point: XZ)=>boolean) {
  const regular = (i: number) => !bus.has(i) && links[i].kind !== '4';
  const allInlets = links.flatMap((link,i)=>boundary(link.points[0]) ? [i] : []);
  const allOutlets = links.flatMap((link,i)=>boundary(link.points.at(-1)!) ? [i] : []);
  // Only ordinary lanes with room at the outline serve as car portals.
  const portal = (i: number) => regular(i) && links[i].kind === '6' && edges[i].len >= 8.5;
  const inlets = allInlets.filter(portal);
  const outlets = allOutlets.filter(portal);
  const next = edges.map((edge,i)=>regular(i) ? edge.next.filter(regular) : []);
  const reachable = boundaryTraffic(next,inlets,outlets);
  const byId = new Map(links.map((link,i)=>[link.id,i]));
  const shadows = new Set([...reachable.selected].filter(i=>{
    const duplicate = byId.get(links[i].duplicateOf ?? '');
    return duplicate !== undefined && reachable.selected.has(duplicate);
  }));
  const successors = next.map((arcs,i)=>shadows.has(i) ? [] : arcs.filter(j=>!shadows.has(j)));
  const routes = boundaryTraffic(successors,inlets.filter(i=>!shadows.has(i)),outlets.filter(i=>!shadows.has(i)));
  return { ...routes, successors, shadows, allInlets, allOutlets, outlets:outlets.filter(i=>routes.selected.has(i)) };
}
