// Seed six cars per eligible approach to expose the fourth-to-sixth discharge.
import { loadArea, readAsset } from './area.mts';
import { carPlayback } from '../../src/aerial/hapjeong-car-playback.ts';
import { makeCars } from '../../src/sim/cars.ts';
import { CYCLE, STRAIGHT } from '../../src/sim/intersection/index.ts';
import { makeSimProvider } from '../../src/sim/provider.ts';

const area = loadArea();
const read = (name: string) => readAsset(area, name);
const run = carPlayback(read('cars'),true,undefined,true,undefined,undefined,undefined,area);
const { edges,links,buses,crosswalks,inter } = run.graph;
const {X,S} = inter;
const cases = [...S.approach].flatMap(([id, row])=>{
  const lane = edges[id];
  if (!(row.moves&STRAIGHT) || lane.bus>=0) return [];
  const site = S.list[row.c];
  const green = site.steps.find(step=>(step.green.get(id)??0)&STRAIGHT);
  if (!green) return [];
  const gate = lane.len-X.gate(id,0);
  const back = 3+5*7.5-gate;
  const upstream = edges.filter(e=>e.next.length===1 && e.next[0]===id && e.len>back+4)
    .sort((a,b)=>b.len-a.len)[0];
  if (back>0 && !upstream) return [];
  const sim = makeCars(edges,makeSimProvider(),11,12,buses,inter,{list:crosswalks,busy:new Uint32Array(crosswalks.length)});
  for (let k=0;k<6;k++) {
    const m = gate-3-k*7.5;
    sim.put(m>=0?id:upstream.id,m>=0?m:upstream.len+m,0);
  }
  const target = (green.start-site.offset+CYCLE)%CYCLE;
  const prev: number[] = [], events: {rank:number;at:number;speed:number}[] = [];
  for (let frame=-25*30;frame<35*30;frame++) {
    const t=frame/30;
    sim.step(1/30,run.clock(target+t),false);
    const s=sim.debug(), {cars}=sim;
    for (let k=0;k<cars.n;k++) {
      const rank=cars.uid[k], d=s.edge[k]===id ? s.s[k]+s.size[k]/2-gate : -Infinity;
      if (prev[rank]<=0&&d>0) events.push({rank,at:t,speed:s.v[k]*3.6});
      prev[rank]=d;
    }
  }
  return [{lane:links[id].id,events}];
});
console.log(JSON.stringify(cases));
