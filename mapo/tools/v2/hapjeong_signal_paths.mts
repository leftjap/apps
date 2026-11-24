import { loadArea, readAsset } from './area.mts';
import { carPlayback } from '../../src/aerial/hapjeong-car-playback.ts';
import { headingNear } from '../../src/sim/graph.ts';
import { CYCLE } from '../../src/sim/intersection/index.ts';
import { pointAt } from '../../src/poly.ts';

const area = loadArea();
const read = (name: string) => readAsset(area, name);
const data = read('cars') as import('../../src/aerial/hapjeong-car-graph.ts').HapjeongCars;
const run = carPlayback(data,true,{walk:read('walk')},true,read('demand'),undefined,undefined,area);
const {inter:{X,S},edges,links} = run.graph;
const site = S.list.find(site=>site.j>=0)!;
const paths = X.paths.filter(p=>p.j===site.j).map(p=>{
  const route = p.edges.map((id,k)=>{
    const e = edges[id];
    const start = k ? 0 : e.len - X.gate(id,p.lanes[k]);
    const end = k === p.edges.length-1 ? Math.min(e.len,X.relEnd(id,p.lanes[k])+10) : e.len;
    const points = [start,...e.cum.subarray(1,-1).filter(x=>x>start&&x<end),end].map(s=>{
      const xyz = [0,0,0];
      pointAt(e.p,e.cum,s,xyz);
      return [xyz[0],xyz[2]];
    });
    return {id:links[id].id,points};
  });
  const angle = headingNear(edges[p.a],edges[p.a].len);
  return { id:p.id, ingress:links[p.a].id, outlet:route.at(-1)!.id, group:S.approach.get(p.a)?.group,
    phase:site.steps.filter(s=>((s.green.get(p.a)??0)&p.move)!==0).map(s=>s.start),
    angle, move:p.move, route, crossIds:p.xw, touches:X.paths.filter(q=>X.touch(p.id,q.id,0,0)).map(q=>q.id) };
});
const groups = data.walkSignalGroups ?? [];
console.log(JSON.stringify({cycle:CYCLE,offset:site.offset,paths,axis:site.axis,
  phase:site.steps.map(s=>({start:s.start,duration:s.dur,green:[...s.green].map(([id,move])=>[links[id].id,move]),
    walk:[...s.walk].flatMap(i=>groups.find(g=>g.includes(data.crosswalks[i].id))??[data.crosswalks[i].id])})),
  faces:data.crosswalks.map((c,i)=>({...c,i,signal:S.crossSite[i]>=0})),
  linked:run.crossings!.graph.links,
}));
