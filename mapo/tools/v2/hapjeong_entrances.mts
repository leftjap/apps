// Use the basic board's station models, train arrivals and stop coordinates.
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeBoard, type BoardJson } from '../../src/data/board.ts';
import { exitLook } from '../../src/data/exits.ts';
import { exitOutline } from '../../src/data/exitFit.ts';
import { MED_STOPS } from '../../src/data/medStops.ts';
import { ORIGIN, toLatLon } from '../../src/geo.ts';
import { cumLen, headingAt, nearestS, pointAt } from '../../src/poly.ts';
import { decodeArea } from '../../src/sim/people/area.ts';
import { decodeWalk } from '../../src/sim/walknet.ts';
import { arrivals } from '../../src/sim/trains.ts';
import { areaPath, assetPath, loadArea } from './area.mts';
import type { HapjeongCars, XZ } from '../../src/aerial/hapjeong-car-graph.ts';
import type { HapjeongEntrances, HapjeongPlatform, HapjeongWalk } from '../../src/aerial/hapjeong-people.ts';

const areaConfig = loadArea();
const read = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8'));
const board = decodeBoard(read<BoardJson>(areaPath(areaConfig.sources.board)));
const walk = read<HapjeongWalk>(assetPath(areaConfig, '-walk'));
const graph = decodeWalk(walk), area=decodeArea(walk.a)!;
const {portals}=walk;
const floor = read<{floor:{road:XZ[][][];walk:XZ[][][]}}>(assetPath(areaConfig, '-a')).floor;
const {links,busRoutes} = read<HapjeongCars>(assetPath(areaConfig, '-cars'));
const station = areaConfig.station;
const mixed = areaConfig.replay.boundaryTrips?.stationShare !== undefined;
const unlinkedExits: HapjeongEntrances['exits'] = [];
const geometries = mixed ? read<{floor:{a4:{faces:XZ[][][]}[]}}>(assetPath(areaConfig)).floor.a4.flatMap(row=>row.faces) : [];

const radians = Math.PI / 180;
const circumference = 2 * Math.PI * 6_378_137 * Math.cos(ORIGIN.lat * radians);
const mercator = (lat: number) => (1 - Math.asinh(Math.tan(lat * radians)) / Math.PI) / 2;
const [originLon, originLat] = areaConfig.frame.origin;
const groundPoint = ([lon, lat]: XZ): XZ => [
  ((lon + 180) / 360 - (originLon + 180) / 360) * circumference,
  (mercator(lat) - mercator(originLat)) * circumference,
];
const lines = board.lines.filter(line => station && line.stopNames.includes(station));
function inside(ring:XZ[], x:number,z:number) {
  let yes = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [a,b]=ring[i], [c,d]=ring[j];
    if ((b>z)!==(d>z) && x < a+(c-a)*(z-b)/(d-b)) yes=!yes;
  }
  return yes;
}
const on = (faces:XZ[][][], x:number,z:number) => faces.some(([r,...holes]) => inside(r,x,z) && !holes.some(h=>inside(h,x,z)));
const exits = board.exits.filter(e=>e.st===station).flatMap(e=>{
  const key=`역 ${e.ref}번`, p=portals.find(portal=>portal.key===key);
  if (!p) {
    const missing = walk.rejectedPortals?.find(row=>row.key===key);
    if (mixed && missing) unlinkedExits.push({...e,key,x:missing.origin[0],z:missing.origin[1]});
    return [];
  }
  const angles=[0,...Array.from({length:12},(_,k)=>(k+1)*Math.PI/12).flatMap(a=>[a,-a])];
  const approaches = Array.from({length:33*33},(_,i)=>[p.x+(i%33-16)*.5,p.z+(Math.floor(i/33)-16)*.5] as XZ)
    .filter(([x,z])=>area.at(x,z)&&!Array.from({length:10},(_,i)=>(i+1)/10).some(t=>on(floor.road,p.x+(x-p.x)*t,p.z+(z-p.z)*t)&&!on(floor.walk,p.x+(x-p.x)*t,p.z+(z-p.z)*t)))
    .sort(([x,z],[a,b])=>Math.hypot(x-p.origin[0],z-p.origin[1])-Math.hypot(a-p.origin[0],b-p.origin[1]));
  const look=exitLook(e.st,e.ref);
  const options=approaches.flatMap(([x,z])=>{
    const edge=graph.nearestEdge(x,z);
    if(!edge||edge[3]>1.2)return [];
    return [{x,z,edge}];
  });
  for(const {x,z} of options) for(const angle of angles) {
    const yaw=e.yaw+angle;
    const entrance={...e,key,x,z,yaw};
    if (!exitOutline(entrance,look).some(([x,z])=>on(floor.road,x,z)&&!on(floor.walk,x,z))) return [entrance];
  }
  if (!mixed) throw Error(`출구 외곽을 인도에 맞출 수 없습니다. ${key}`);
  unlinkedExits.push({...e,key,x:p.origin[0],z:p.origin[1]});
  return [];
});
const limit = 14*3600;
const trains=station ? Array.from({length:252},(_,i)=>limit-11+i).flatMap(t=>
  arrivals(lines,t-1,t).filter(a=>a.name===station).map(()=>t)) : [];
const warmup = Math.ceil(areaConfig.replay.boundaryTrips?.passengerWarmupSeconds ?? 0) + 12;
const trainArrivals = mixed ? Array.from({length:240+warmup+1},(_,i)=>limit-warmup+i).flatMap(at=>
  arrivals(lines,at-1,at).filter(a=>a.name===station).map(({line})=>({line,at}))) : undefined;
const busLanes = new Set(busRoutes?.flat());
function projectedPlatform(link: HapjeongCars['links'][number], key: string, name: string, mx: number,mz: number) {
  if (link.len < 16) return [];
  const p = link.points.flatMap(([x,z])=>[x,0,z]), cum=cumLen(p);
  const nearest = nearestS(p,cum,mx,mz).s;
  const result: (HapjeongPlatform & { distance:number })[] = [];
  for (let shift=-14;shift<=14;shift+=.25) {
    const s=nearest+shift;
    if (s<8 || s>link.len-8 || link.stop && s>=link.stop.at-8 && s<=link.stop.at+8) continue;
    const xyz=[0,0,0], yaw=headingAt(p,pointAt(p,cum,s,xyz));
    const distance=Math.hypot(mx-xyz[0],mz-xyz[2]);
    if (distance>14) continue;
    for (let side=1.7;side<=5.6;side+=.15) {
      const dx=xyz[0]+3.5*Math.cos(yaw)-side*Math.sin(yaw);
      const dz=xyz[2]+3.5*Math.sin(yaw)+side*Math.cos(yaw);
      if (Math.hypot(dx-mx,dz-mz)>14 || !on(geometries,dx,dz) || !area.at(dx,dz) ||
          (graph.nearestEdge(dx,dz)?.[3] ?? Infinity)>.9) continue;
      result.push({key,name,link:link.id,at:s,x:dx,z:dz,yaw,distance:distance+2*(side-1.7)});
      break;
    }
  }
  return result;
}
const platforms = MED_STOPS.filter(([key])=>areaConfig.platforms?.keys.includes(key)).flatMap(([key,name,x,z])=>{
  const [lat,lon]=toLatLon(x,z);
  const [mx,mz]=groundPoint([lon,lat]);
  const candidates=links.flatMap((link,index)=>{
    if(link.kind!=='4')return [];
    if(mixed) return busLanes.has(index) ? projectedPlatform(link,key,name,mx,mz) : [];
    const p=link.points.flatMap(([x,z])=>[x,0,z]), cum=cumLen(p);
    const projected=nearestS(p,cum,mx,mz).s;
    // On a split link, stop the bus body on the approach side of a B2 line.
    const s=link.source && link.stop && projected > link.len-8 ? link.len-8 : projected;
    const xyz=[0,0,0];
    const yaw=headingAt(p,pointAt(p,cum,s,xyz));
    const distance=Math.hypot(mx-xyz[0],mz-xyz[2]);
    if(distance>12||s<8||s>link.len-8)return [];
    // Sample the platform side next to the front door of the existing buses.
    const [dx,dz]=[xyz[0]+3.5*Math.cos(yaw)-2.15*Math.sin(yaw),xyz[2]+3.5*Math.sin(yaw)+2.15*Math.cos(yaw)];
    if (!on(floor.walk,dx,dz))return [];
    return [{key,name,link:link.id,at:s,x:dx,z:dz,yaw,distance}];
  }).sort((a,b)=>a.distance-b.distance);
  const best=candidates[0];
  if(!best)return [];
  const {distance:_,...stop}=best;
  return [stop];
});
const data = {exits, station, lines:lines.map(({id,color})=>({id,color})), trains, platforms, doors:[], busService: areaConfig.busService,
  ...(mixed ? {unlinkedExits,trainArrivals} : {})};
writeFileSync(assetPath(areaConfig, '-entrances'),JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify(data));
