// Basic-board reference, using the same surveyed measurement window and 80m views.
import { readFileSync } from 'node:fs';
import { decodeBoard } from '../../src/data/board.ts';
import { decodeMarks } from '../../src/data/marks.ts';
import { decodeLanes } from '../../src/data/road.ts';
import { groundPoint } from '../../src/aerial/map.ts';
import { carVisibility, carViews } from '../../src/aerial/hapjeong-car-playback.ts';
import { toLatLon } from '../../src/geo.ts';
import { busStopPortals, makeBusRoutes } from '../../src/sim/buses.ts';
import { makeCars } from '../../src/sim/cars.ts';
import { buildCarGraph, headingNear } from '../../src/sim/graph.ts';
import { CYCLE, makeIntersections } from '../../src/sim/intersection/index.ts';
import { makePeople, underpasses, ZONES } from '../../src/sim/people/index.ts';
import { makeSimProvider } from '../../src/sim/provider.ts';
import { decodeWalk } from '../../src/sim/walknet.ts';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../public/data/${name}.json`, import.meta.url), 'utf8'));
const [xmin, zmin, xmax, zmax] = read('v2/hapjeong-hd-cars').window;
const toLocal = (x: number, z: number) => {
  const [lat, lon] = toLatLon(x, z);
  return groundPoint([lon,lat]);
};
const inside = (x: number, z: number) => {
  const [a,b] = toLocal(x,z);
  return a >= xmin && a <= xmax && b >= zmin && b <= zmax;
};
const visible = carVisibility();
const onScreen = (x: number, z: number) => visible(...toLocal(x,z));
const board = decodeBoard(read('board'));
const edges = buildCarGraph(board.roads, decodeLanes(read('road').lanes), decodeMarks(read('marks')).arrows);
const inter = makeIntersections(edges, { crosswalks: board.crosswalks, stopLines: board.stopLines, lamps: read('signals') });
const { X, S } = inter;
const site = S.list.filter(s=>s.j>=0&&!s.walkOnly).sort((a,b)=>
  Math.hypot(a.x-carViews[2].at[0],a.z-carViews[2].at[1])-Math.hypot(b.x-carViews[2].at[0],b.z-carViews[2].at[1]))[0];
const approach = [...S.approach].filter(([,a])=>S.list[a.c]===site).map(([i,a])=>({
  id:String(i), edge:i, group:a.group, degree:headingNear(edges[i],edges[i].len)*180/Math.PI, moves:a.moves,
  green:site.steps.filter(step=>step.green.has(i)).map(step=>[step.start,step.start+step.dur,step.green.get(i)]),
  lanes:edges[i].lanes, bus:edges[i].bus,
}));
const approaches = new Set(approach.map(a=>a.edge));
const provider = makeSimProvider();
const now = { tod: 14 * 3600, dow: 6, doy: 175 };
const busy = new Uint32Array(board.crosswalks.length);
const routes = makeBusRoutes(board.buses, edges, undefined, board.crosswalks);
const sim = makeCars(edges, provider, 11, 5000, routes, inter, {list:board.crosswalks,busy});
const duration = 240;
sim.setFocus(site.x, site.z, 250, onScreen);
sim.setDetail(onScreen);
sim.fill(sim.target(now));
sim.fillBuses(now);
const peopleOnly = process.argv.includes('--people-only');
const noPeople = process.argv.includes('--cars-only');
const stops = busStopPortals(routes, edges).portals;
const people = noPeople ? undefined : makePeople(decodeWalk(read('walk')), [
  ...board.exits.map(e=>({kind:'exit' as const,key:e.st,x:e.x,z:e.z})), ...stops,
  ...underpasses(board.roads, ...ZONES.mangwon).map(([x,z])=>({kind:'exit' as const,key:'망원나들목',x,z})),
  ...Array.from({ length:board.picnic.length/2 },(_,i)=>({kind:'exit' as const,key:'망원한강공원',x:board.picnic[i*2],z:board.picnic[i*2+1]})),
], provider, 5, 8000, {buildings:board.buildings,busy,walkLeft:(j,tod)=>S.crossSite[j]<0?-1:S.walkLeft(j,tod),traffic:sim.approaching,
  cars:peopleOnly?undefined:sim.cars});
if (people) {
  sim.setPeople(people.w);
  people.setFocus(site.x,site.z,150);
  people.warm(300,now);
}
console.log(JSON.stringify({approach,views:carViews,offset:site.offset,cycle:CYCLE,duration,basic:true,junction:site.j,axis:site.axis*180/Math.PI}));
for(let i=0;i<=duration*10;i++) {
  const t=i/10, tod=now.tod+t;
  if(i && !peopleOnly) sim.step(.1,{...now,tod});
  if(i && people) people.step(.1,{...now,tod});
  const {cars}=sim,d=sim.debug(), cr=[], pr=[];
  for(let k=0;k<cars.n&&!peopleOnly;k++) {
    const e=d.edge[k],path=X.paths[d.jp[k]>=0?d.jp[k]:d.pp[k]];
    if (!inside(cars.x[k],cars.z[k])&&!approaches.has(e)&&path?.j!==site.j) continue;
    const [x,z]=toLocal(cars.x[k],cars.z[k]);
    const light=approaches.has(e)?S.state(e,path?.move??2,tod):-1;
    cr.push([cars.uid[k],x,z,cars.yaw[k],cars.kind[k],d.size[k],d.wid[k],e,d.s[k],d.v[k],d.aheadWhy[k],light,d.go[k],d.past[k],
      path?.j??-1,path?.move??0,X.jStart[e]===site.j&&X.jEnd[e]===site.j,onScreen(cars.x[k],cars.z[k]),null,
      d.ahead[k]>=0?cars.uid[d.ahead[k]]:null,-1,d.nextE[k],d.lane[k],edges[e].len-X.gate(e,d.lane[k]),path?.a??-1,path?.edges.at(-1)??-1,d.jk[k]]);
  }
  if(people){
    const {w}=people;
    for(let k=0;k<w.n;k++) if(inside(w.x[k],w.z[k])) pr.push([w.id[k],...toLocal(w.x[k],w.z[k])]);
  }
  console.log(JSON.stringify([t,cr,pr]));
}
