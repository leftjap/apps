// Replay vehicles against scripted cameras and write the camera census as JSON and Markdown.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Vector3 } from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { loadArea, readAsset } from './area.mts';
import { CAR_TICK, carPlayback } from '../../src/aerial/hapjeong-car-playback.ts';
import { bodyType } from '../../src/sim/bodies.ts';
import type { CarLifecycleEvent } from '../../src/sim/cars.ts';
import type { HapjeongCars, XZ } from '../../src/aerial/hapjeong-car-graph.ts';
import { SHAPES } from '../../src/render/cars.ts';
import { CameraView, Lifecycle, poseAt, type Pose, type CameraSetup } from './camera_car_view.mts';
import { distribution, LaneUse, Overlaps, Queues, type Sample } from './camera_car_metrics.mts';

type Scenario = {id: string; seconds: number; frames: (Pose & {time: number})[]};
type Floor = {frames: number; vehicles: number; samples: number;
  byEdge: Record<number,number>; maxM2: number; worst: [number,number,number,number,number] | null};

const { values } = parseArgs({options: {
  area:{type:'string'}, scenarios:{type:'string'}, scenario:{type:'string',multiple:true},
  out:{type:'string'}, 'legacy-trace':{type:'string'}, python:{type:'string'},
}});
if (!values.area || !values.scenarios || !values.out)
  throw Error('Usage: node --experimental-strip-types tools/v2/check_camera_cars.mts --area PATH --scenarios PATH --out DIR [--scenario ID] [--legacy-trace ID] [--python PATH]');
const started = performance.now();
const area = loadArea();
if (!area.replay.connectedTraffic) throw Error('The camera census requires a connected replay area.');
const all: Scenario[] = JSON.parse(readFileSync(values.scenarios,'utf8'));
const scenarios = all.filter(s => !values.scenario || values.scenario.includes(s.id));
if (!scenarios.length || values.scenario?.some(id => !scenarios.some(s=>s.id===id)) ||
  (values['legacy-trace'] && !scenarios.some(s=>s.id===values['legacy-trace']))) throw Error('Unknown scenario ID');
if (new Set(scenarios.map(s=>s.id)).size !== scenarios.length) throw Error('Duplicate scenario ID');
for (const s of scenarios) {
  if (!/^[\w-]+$/.test(s.id) || !Number.isFinite(s.seconds) || s.seconds <= 0 || s.frames[0]?.time !== 0 ||
      s.frames.some((f,i) => !Number.isFinite(f.time) || f.time > s.seconds || (i > 0 && f.time <= s.frames[i-1].time)
        || f.center.length !== 2 || f.screen.length !== 2 || f.screen.some(n=>!Number.isInteger(n) || n<=0)
        || ![...f.center,f.bearing,f.tilt].every(Number.isFinite)
        || (f.width !== 'overview' && (!Number.isFinite(f.width) || f.width <= 0)))) throw Error(`Invalid camera scenario ${s.id}`);
}
const out = values.out;
mkdirSync(out,{recursive:true});

const asset = area.replay.carAsset ?? 'cars';
const data: HapjeongCars = readAsset(area,asset);
const demand = readAsset(area,'demand');
const buildings: {window:[number,number,number,number]; ground:CameraSetup['ground'];
  buildings:{faces: XZ[][][]; height:number}[]} = readAsset(area,'buildings');
const cameraRules = (area as typeof area & {camera?: CameraSetup['rules']}).camera;
if (!cameraRules) throw Error('The area manifest must declare camera rules.');
const [w,n,e,south] = buildings.window;
// The legacy district viewer fits exactly these ground and rooftop vertices.
const points = buildings.ground.flatMap(([ring])=>ring.map(([x,z])=>new Vector3(x,0,z)));
for (const row of buildings.buildings) for (const [ring] of row.faces)
  for (const [x,z] of ring) points.push(new Vector3(x,row.height,z));
const hull = new ConvexHull().setFromPoints(points);
const corners = [...new Set(hull.faces.flatMap(({edge})=>[edge.head().point,edge.next.head().point,edge.prev.head().point]))];
const setup: CameraSetup = {center:[(w+e)/2,(n+south)/2], ground:buildings.ground, corners, rules:cameraRules};
const sizes = [SHAPES.sedan,SHAPES.suv,SHAPES.kei,SHAPES.van,SHAPES.taxi,SHAPES.bus,SHAPES.coach,SHAPES.minibus].map(make=>{
  const mesh = make();
  mesh.computeBoundingBox();
  const {min,max} = mesh.boundingBox!;
  mesh.dispose();
  return {height:max.y,len:2*Math.max(-min.x,max.x),halfWidth:Math.max(-min.z,max.z)};
});
const python = values.python ?? (existsSync('tools/.venv/bin/python') ? 'tools/.venv/bin/python' : 'python3');
const worker = spawn(python,['-B','tools/v2/camera_car_floor.py','--area',values.area],{stdio:['pipe','pipe','inherit']});
const workerExit = once(worker,'close');
const messages = createInterface({input:worker.stdout})[Symbol.asyncIterator]();
async function message() {
  const {done,value} = await messages.next();
  if (done) throw Error('The road footprint worker exited before returning results.');
  return JSON.parse(value);
}

const batchSize = 8192;
const rowSize = 7 * 8;
let buffer = Buffer.allocUnsafe(batchSize * rowSize);
let buffered = 0;
const flush = () => {
  const ready = worker.stdin.write(buffer);
  buffer = Buffer.allocUnsafe(batchSize * rowSize);
  buffered = 0;
  return ready;
};
function pushFloor(frame: number,r: Sample) {
  let offset = buffered++ * rowSize;
  for (const value of [frame,r.uid,r.x,r.z,r.yaw,r.model,r.edge]) {
    buffer.writeDoubleLE(value,offset);
    offset += 8;
  }
  return buffered < batchSize || flush();
}
async function finishFloor(): Promise<Floor> {
  buffer.writeDoubleLE(-1,buffered++*rowSize);
  for (let i=buffered;i<batchSize;i++) buffer.writeDoubleLE(-2,i*rowSize);
  flush();
  return message();
}

async function measure(scenario: Scenario, names: Record<string,string>) {
  const wall = performance.now();
  const view = new CameraView(setup);
  view.set(poseAt(scenario.frames,0));
  const observed = new Map<number,{cause:CarLifecycleEvent; edge:number}>();
  const run = carPlayback(data,true,undefined,true,demand,undefined,undefined,area,{
    // A radius covers any car envelope at an unknown heading. Body events
    // below use the oriented dimensions of the actual vehicle.
    visible:(x,z)=>view.point(x,z,1.5,broadMargin),
    lifecycle:(uid,cause,edge)=>observed.set(uid,{cause,edge}),
  });
  const initialized = performance.now();
  const lanes = new LaneUse(data,run.graph,names), queues = new Queues(run), overlap = new Overlaps(), events = new Lifecycle();
  const wait = [new Map(data.districtTraffic?.entries.map(p=>[p.edge,p])),
    new Map(data.districtTraffic?.exits.map(p=>[p.edge,p]))];
  const times: number[] = [], visibleCars: number[] = [], allCars: number[] = [];
  const trace = values['legacy-trace'] === scenario.id
    ? createWriteStream(join(out,`legacy-${scenario.id}.ndjson`)) : null;
  trace?.write(JSON.stringify({links:run.graph.links.map(l=>l.id),tick:CAR_TICK})+'\n');
  const staticCamera = scenario.frames.length === 1;
  const finalFrame = Math.round(scenario.seconds / CAR_TICK);
  for (let frame=0;frame<=finalFrame;frame++) {
    const t = frame * CAR_TICK;
    if (!staticCamera && frame) view.set(poseAt(scenario.frames,t));
    observed.clear();
    const start = performance.now();
    const sim = run.at(t);
    if (frame) times.push(performance.now()-start);
    const d = sim.debug(), {cars} = sim, rows:Sample[] = [];
    let nVisible = 0;
    for (let i=0;i<cars.n;i++) {
      const model = cars.kind[i] === 1 ? (cars.tint[i]===3 ? 7 : cars.tint[i]===2 ? 6 : 5)
        : cars.kind[i] === 2 ? 4 : bodyType(cars.tint[i]);
      const edge=d.edge[i];
      const r = {uid:cars.uid[i],x:cars.x[i],y:cars.y[i],z:cars.z[i],yaw:cars.yaw[i],...sizes[model],
        link:run.graph.links[edge].id,edge,model,lane:d.lane[i],at:d.s[i],speed:d.v[i],visible:false};
      r.visible = view.body(r);
      if (r.visible) {
        nVisible++;
        if (!pushFloor(frame,r)) await once(worker.stdin,'drain');
      }
      rows.push(r);
    }
    visibleCars.push(nVisible);
    allCars.push(cars.n);
    const causes = new Map<number,string>();
    const engineLinks = new Map<number,string>();
    for (const [uid,{cause,edge}] of observed) {
      const portals = cause === 'entry' ? wait[0] : cause === 'link-end' ? wait[1] : undefined;
      const portal = portals?.get(run.graph.edges[edge].key);
      causes.set(uid,portal ? (portal.boundary ? 'boundary' : 'declared-interior') : cause);
      engineLinks.set(uid,run.graph.links[edge].id);
    }
    const count = events.events.length;
    events.add(t,rows,view,causes);
    for (let i=count;i<events.events.length;i++) {
      const ev = events.events[i];
      Object.assign(ev,{engineLink:engineLinks.get(ev.uid) ?? null, engineCause:observed.get(ev.uid)?.cause ?? null,
        legacyVisible:run.visible(ev.x,ev.z)});
    }
    lanes.add(rows,view,frame===0 || !staticCamera);
    queues.add(frame,rows,d,view);
    overlap.add(rows);
    if (trace && !trace.write(JSON.stringify([t,rows.map(r=>[r.uid,r.x,r.z,Number(r.visible)])])+'\n'))
      await once(trace,'drain');
  }
  if (trace) {
    trace.end();
    await once(trace,'finish');
  }
  const floor = await finishFloor();
  const life = Object.fromEntries((['initial','birth','exit'] as const).map(type=>{
    const rows = events.events.filter(e=>e.type===type);
    return [type,{all:rows.length,legacy:rows.filter(e=>Reflect.get(e,'legacyVisible')).length,
      dots:rows.filter(e=>e.pixels!==null && e.pixels<2).length,
      body:rows.filter(e=>e.pixels!==null && e.pixels>=2).length}];
  }));
  return {scenario, initialCameraWidth:viewWidth(setup,scenario), life, events:events.events,
    laneUse:lanes.result(),...queues.result(),overlap:overlap.result(),
    offFloor:{...floor,byLink:Object.fromEntries(Object.entries(floor.byEdge).map(([k,v])=>[run.graph.links[Number(k)].id,v])),
      worst:floor.worst && {time:floor.worst[0]*CAR_TICK,uid:floor.worst[1],x:floor.worst[2],z:floor.worst[3],
        link:run.graph.links[floor.worst[4]].id}},
    cars:distribution(visibleCars),totalCars:distribution(allCars),
    tickMs:distribution(times),setupSeconds:(initialized-wall)/1000,wallSeconds:(performance.now()-wall)/1000};
}

function viewWidth(setup:CameraSetup, scenario:Scenario) {
  const view = new CameraView(setup);
  const pose = poseAt(scenario.frames,0);
  view.set(pose);
  const target = pose.width === 'overview' ? setup.center : pose.center;
  const center = view.camera.position;
  // The configured width is already measured at the ground target.
  return pose.width === 'overview'
    ? Math.hypot(center.x-target[0],center.y,center.z-target[1]) * 2*view.camera.aspect*Math.tan(17*Math.PI/180)
    : pose.width;
}

function summary(results:Awaited<ReturnType<typeof measure>>[], seconds:number) {
  const fixed = (n:number|null,d=1) => n === null ? '—' : n.toFixed(d);
  return [
    '# 카메라 기준 차량 재생', '',
    '| 각본 (초) | 생성 점/차 | 소멸 점/차 | 채움 % | 대/차로-km | 화면 차 중앙값 | 빨강 끝 중앙값 | 초록에 정지 >3/5/10초 | 3초 초과 최다 까닭 | >120초 | 겹침 틱 | 이탈 틱 | 틱 ms 중앙값/p95 | 실행 초 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|',
    ...results.map(r=>{
      const reason = Object.entries(r.greenStops[0].byReason).sort((a,b)=>b[1]-a[1])[0];
      return `| ${r.scenario.id} (${r.scenario.seconds}) | ${r.life.birth.dots}/${r.life.birth.body} | ${r.life.exit.dots}/${r.life.exit.body} | ${fixed(r.laneUse.coveragePct)} | ${fixed(r.laneUse.carsPerLaneKm)} | ${fixed(r.cars.median,0)} | ${fixed(r.redEnds.median)} | ${r.greenStops.map(g=>g.episodes).join('/')} | ${reason?.join(' × ') ?? '—'} | ${r.stalls.length} | ${r.overlap.frames} | ${r.offFloor.frames} | ${fixed(r.tickMs.median,2)}/${fixed(r.tickMs.p95,2)} | ${fixed(r.wallSeconds)} |`;
    }), '',
    `총 ${fixed(seconds)}초. 준비 시간과 재생·계측 시간을 포함합니다.`, '',
    '점은 투영 길이 2 CSS 픽셀 미만입니다. 0초의 초기 차량은 JSON의 initial에 기록했습니다.',
    '화면 판정은 건물 가림을 제외한 카메라 시야와 차체 외곽 상자입니다. 도로 이탈은 실제 모형의 바닥 투영을 사용합니다.',
    '채움은 중복을 뺀 원자료 A2 일반 차로(종류 6)를 5m 이하 구간으로 나눠, 화면 안 중앙점과 실제 전진을 집계합니다. 미운행 차로도 분모에 포함합니다. 대/차로-km는 화면 일반 차량 수 합을 같은 차로 길이 합으로 나눕니다.',
    '도로명은 수치지형도 중심선과의 방향·거리 대조 결과입니다. 이름 미대조 도로도 전체에 들어갑니다.',
    '빨강 끝은 경로별 빨강→초록 직전 정지 대수입니다. 화면의 빈 차로도 포함합니다.',
    '초록 정지는 0.12m/s 미만이며 현재 진입 링크와 바로 다음 링크에서 앞 범퍼 간격 10m 초과인 연속 구간입니다. 뒤차는 같은 차로에서 범퍼 간격 10m 이하로 연속해서 선 차량입니다.',
    '연속 화면 정지 120초 초과는 차량별로 셌습니다. 틱 시간은 카메라 갱신과 계측을 제외한 Node 재생 한 틱입니다.', '',
  ].join('\n');
}

const broadMargin=Math.max(...sizes.map(b=>Math.hypot(b.len/2,b.halfWidth,b.height)));
try {
  const { roads } = await message();
  const prepSeconds = (performance.now()-started)/1000;
  const results = [];
  for (const scenario of scenarios) {
    const result = await measure(scenario,roads);
    results.push(result);
    console.error(`${scenario.id}: ${result.wallSeconds.toFixed(1)}s`);
    const wallSeconds = (performance.now()-started)/1000;
    writeFileSync(join(out,'baseline.json'),JSON.stringify({area:area.title,asset,demand,prepSeconds,wallSeconds,results},null,2)+'\n');
    writeFileSync(join(out,'baseline.md'),summary(results,wallSeconds));
  }
  worker.stdin.end();
  const [code] = await workerExit;
  if (code !== 0) throw Error(`Road footprint worker exited ${code}`);
} finally {
  worker.stdin.destroy();
  worker.kill();
}
