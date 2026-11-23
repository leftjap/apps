import { CYCLE } from '../sim/intersection/index.ts';
import { BODY_R } from '../sim/people/index.ts';
import { LINK, type CrossLink, type WalkGraph } from '../sim/walknet.ts';
import type { SignalPlan } from '../sim/intersection/signal.ts';
import type { HapjeongPortal } from './hapjeong-people.ts';

function ends(link: CrossLink) {
  return [
    { node:link.na, x:link.pax, z:link.paz, dx:link.ax-link.bx, dz:link.az-link.bz, width:link.aHi-link.aLo },
    { node:link.nb, x:link.pbx, z:link.pbz, dx:link.bx-link.ax, dz:link.bz-link.az, width:link.bHi-link.bLo },
  ] as const;
}

export function crossingCourses(graph: WalkGraph, pairs: readonly number[][], signals: SignalPlan, start: number, minPerSide = 1) {
  const portals: HapjeongPortal[] = [];
  const together = [...pairs, ...graph.links.filter(link=>!pairs.some(pair=>pair.includes(link.xw))).map(link=>[link.xw])];
  const courses = together.flatMap(crossings=>{
    const links = crossings.map(xw=>graph.links.find(link=>link.xw===xw));
    if (links.some(link=>!link)) return [];
    const a = ends(links[0]!);
    const b = links.length>1 ? ends(links[1]!) : a;
    // In a divided crossing, use the two banks farthest apart, across the refuge.
    const bank = links.length===1 ? a :
      a.flatMap(p=>b.map(q=>({ends:[p,q],distance:Math.hypot(p.x-q.x,p.z-q.z)})))
        .sort((p,q)=>q.distance-p.distance)[0].ends;
    const keys = bank.map((end, side)=>{
      const a = end.node, x = graph.nx[a*2], z = graph.nx[a*2+1];
      const next = graph.adj[a].flatMap((n,k)=>{
        if (graph.kind[a][k]===LINK) return [];
        const dx = graph.nx[n*2]-x, dz = graph.nx[n*2+1]-z;
        const len = Math.hypot(dx,dz);
        return len ? [{dx,dz,len,score:(dx*end.dx+dz*end.dz)/len}] : [];
      }).sort((p,q)=>q.score-p.score)[0];
      const fraction = next ? Math.min(.75,2.5/next.len) : 0;
      const px = x+(next?.dx??0)*fraction, pz = z+(next?.dz??0)*fraction;
      const key = `crossing-trial/${crossings.join('-')}/${side}`;
      portals.push({key,kind:'exit',x:px,z:pz,origin:[px,pz]});
      return key;
    });
    const first = crossings[0], signed = signals.crossSite[first]>=0;
    const since = start-12;
    const endOfGreen = since+signals.walkLeft(first,since);
    const green = signed ? endOfGreen+signals.walkIn(first,endOfGreen+.001)+.001 : start;
    const launch = signed ? Math.max(start-11,green-14) : start-6;
    const width = Math.min(...links.map(l=>l!.wid),...bank.map(side=>side.width));
    const perSide = Math.max(minPerSide,Math.floor(width/(4*BODY_R)));
    return [{crossings,keys,signed,perSide,launch:launch-start,green:green-start}];
  });
  const pending = courses.flatMap((course,index)=>[0,1].flatMap(wave=>[0,1].flatMap(side=>
    Array.from({length:course.perSide},(_,rank)=>({
      course:index,wave,side,at:start+course.launch+wave*CYCLE+rank*2,
    })))));
  const walkers: {uid:number; course:number; wave:number; side:number; at:number}[] = [];
  const active = new Map<number,typeof walkers[number]>();
  return {portals,courses,pending,walkers,active};
}
