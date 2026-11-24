import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import yanghwa from '../../tools/v2/areas/yanghwa-map.json';
import { makeYanghwaTerrain, type YanghwaBuildings, type YanghwaFloor } from './yanghwa-terrain.ts';
import { nearestOutlinePoint } from './connected-traffic.ts';
import type { HapjeongCars, XZ } from './hapjeong-car-graph.ts';
import type { HapjeongDemand } from './hapjeong-car-playback.ts';
import type { SurveyArea } from './survey-area.ts';

type MapManifest = Pick<SurveyArea,'title'|'views'|'replay'> &
  { camera: typeof yanghwa.camera; output: typeof yanghwa.output & { gzip?: boolean } };
const manifests = import.meta.glob<{ default: MapManifest }>('../../tools/v2/areas/*.json');
const canvas = document.querySelector('canvas')!;
const main = document.querySelector('main')!;
const reset = document.querySelector<HTMLButtonElement>('#overview')!;
const play = document.querySelector<HTMLButtonElement>('#play')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const clamp = THREE.MathUtils.clamp;
const radians = THREE.MathUtils.degToRad;
const degrees = THREE.MathUtils.radToDeg;

async function init() {
  THREE.ColorManagement.enabled = false;
  const district = canvas.dataset.area;
  const loadDistrict = manifests[`../../tools/v2/areas/${district}.json`];
  if (district && !loadDistrict) throw Error(`구역 설정 없음: ${district}`);
  const area: MapManifest = district ? (await loadDistrict()).default : yanghwa;
  const { minWidth, minTilt, maxTilt, initialTilt, initialBearing, fitPadding } = area.camera;
  async function read<T>(suffix: string): Promise<T> {
    const { directory, stem, gzip: compressed } = area.output;
    const base = directory.replace(/^public\//, '');
    const gzip = compressed && (suffix === 'a' || suffix === 'buildings' || suffix === area.replay?.carAsset);
    const extension = gzip ? '.json.gz' : '.json';
    const response = await fetch(`${import.meta.env.BASE_URL}${base}/${stem}-${suffix}${extension}`);
    if (!response.ok) throw Error(`${suffix} 자료 응답 ${response.status}`);
    // Vite serves .json.gz as HTTP-encoded JSON. Static hosts may serve it as a gzip file.
    return gzip && !response.headers.get('content-encoding')?.includes('gzip')
      ? new Response(response.body!.pipeThrough(new DecompressionStream('gzip'))).json()
      : response.json();
  }
  const [data, buildings] = await Promise.all([read<YanghwaFloor>('a'),read<YanghwaBuildings>('buildings')]);
  const [west,north,east,south] = buildings.window;
  const center = new THREE.Vector3((west+east)/2,0,(north+south)/2);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b0d11');
  const detailed = district ? (await import('./district-terrain.ts')).makeDistrictTerrain(data,buildings) : undefined;
  const terrain = detailed?.group ?? makeYanghwaTerrain(data,buildings);
  const sun = new THREE.DirectionalLight('#fff0d8',1.35);
  sun.position.set(-200,300,100);
  scene.add(terrain,sun,new THREE.HemisphereLight('#dceafa','#5c5751',2));
  scene.updateMatrixWorld(true);

  // Fit the actual outline and roofs, including at oblique bearings.
  const points = buildings.ground.flatMap(([outer])=>outer.map(([x,z])=>new THREE.Vector3(x,0,z)));
  for (const building of buildings.buildings) for (const [outer] of building.faces)
    for (const [x,z] of outer) points.push(new THREE.Vector3(x,building.height,z));
  const hull = new ConvexHull().setFromPoints(points);
  const corners = [...new Set(hull.faces.flatMap(({edge})=>[
    edge.head().point,edge.next.head().point,edge.prev.head().point,
  ]))];

  const renderer = new THREE.WebGLRenderer({canvas,antialias:true,logarithmicDepthBuffer:true});
  const camera = new THREE.PerspectiveCamera(34,1);
  const controls = new MapControls(camera,canvas);
  controls.minPolarAngle = radians(minTilt);
  controls.maxPolarAngle = radians(maxTilt);
  const tanY = Math.tan(radians(camera.fov/2));
  const widthPerDepth = () => 2*camera.aspect*tanY;
  const target = controls.target;
  const up = new THREE.Vector3(0,1,0);
  const right = new THREE.Vector3();
  const screenUp = new THREE.Vector3();
  const relative = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let frame = 0;
  const query = new URLSearchParams(location.search);
  const value = (key: string,fallback: number) => {
    const raw = query.get(key);
    const n = raw?.trim() ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : fallback;
  };

  const requestDraw = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const traffic = area.replay?.connectedTraffic && query.get('cars') === '1' ? await (async () => {
    const [{carPlayback,CAR_TICK},{makeCarMeshes},{env,updateEnv},{makeYanghwaSignals},cars,demand] = await Promise.all([
      import('./hapjeong-car-playback.ts'),import('../render/cars.ts'),import('../render/env.ts'),
      import('./yanghwa-signals.ts'),
      read<HapjeongCars>(area.replay.carAsset ?? 'cars'),read<HapjeongDemand>('demand'),
    ]);
    const run = carPlayback(cars,true,undefined,true,demand,undefined,undefined,area);
    const limit = area.replay.connectedTraffic!.maxTicksPerFrame;
    const mesh = makeCarMeshes(run.max,true);
    const signals = makeYanghwaSignals(cars, run.graph, data.floor.walk);
    scene.add(mesh.group, signals.group);
    let ticks = Math.round(Math.max(0,value('at',0))/CAR_TICK);
    let sim = run.at(ticks*CAR_TICK);
    const shade = document.createElement('div');
    updateEnv(run.clock(0),0,shade);
    env.uFogK.value = 0;
    let paused = query.get('paused') === '1';
    let last: number | undefined;
    let elapsed = 0;
    function resetClock() { last=undefined; elapsed=0; }
    document.addEventListener('visibilitychange',()=>{
      resetClock();
      if (!paused && !document.hidden) requestDraw();
    });
    const label = () => { play.textContent = paused ? '재생' : '멈춤'; };
    play.onclick = () => { paused=!paused; resetClock(); label(); requestDraw(); };
    label();
    play.hidden = false;
    return function update(stamp: number) {
      if (!paused && !document.hidden) {
        if (last !== undefined) elapsed = Math.min(CAR_TICK*limit,elapsed+(stamp-last)/1000);
        last = stamp;
        const steps = Math.max(0,Math.floor((elapsed+1e-9)/CAR_TICK));
        if (steps) {
          elapsed -= steps*CAR_TICK;
          ticks += steps;
          sim = run.at(ticks*CAR_TICK);
        }
        requestDraw();
      }
      mesh.update(sim.cars,0,camera);
      signals.group.visible = camera.position.distanceTo(target) * widthPerDepth() <= 500;
      if (signals.group.visible) signals.update(run.clock(ticks * CAR_TICK).tod);
      canvas.dataset.traffic = JSON.stringify({seconds:ticks*CAR_TICK,vehicles:sim.cars.n,paused});
    };
  })() : undefined;
  const signalPreview = !traffic && district && query.get('signals') === '1' ? await (async () => {
    const [{districtCarGraph},{makeYanghwaSignals},cars] = await Promise.all([
      import('./hapjeong-car-graph.ts'), import('./yanghwa-signals.ts'), read<HapjeongCars>('cars'),
    ]);
    const graph = districtCarGraph(cars, '');
    const signals = makeYanghwaSignals(cars, graph, data.floor.walk);
    signals.update(14*3600+Math.max(0,value('at',0)));
    scene.add(signals.group);
    return signals.group;
  })() : undefined;

  function fit(out: THREE.Vector3) {
    right.crossVectors(up,out).normalize();
    screenUp.crossVectors(out,right);
    let distance = controls.minDistance;
    for (const corner of corners) {
      relative.subVectors(corner,center);
      const width = Math.abs(relative.dot(right))/(tanY*camera.aspect);
      const height = Math.abs(relative.dot(screenUp))/tanY;
      distance = Math.max(distance,relative.dot(out)+fitPadding*Math.max(width,height));
    }
    return distance;
  }

  function draw(stamp = performance.now()) {
    frame = 0;
    offset.subVectors(camera.position,target);
    direction.copy(offset).normalize();
    controls.maxDistance = fit(direction);
    const [x,z] = nearestOutlinePoint(buildings.ground,[target.x,target.z]);
    target.set(x,0,z);
    const distance = clamp(offset.length(),controls.minDistance,controls.maxDistance);
    camera.position.copy(target).addScaledVector(direction,distance);
    camera.lookAt(target);
    let closest = Infinity, farthest = 0;
    for (const corner of corners) {
      const depth = relative.subVectors(camera.position,corner).dot(direction);
      closest = Math.min(closest,depth);
      farthest = Math.max(farthest,depth);
    }
    camera.near = Math.max(.1,closest*.75);
    camera.far = Math.max(camera.near+1,farthest*1.02+1);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    traffic?.(stamp);
    if (signalPreview) signalPreview.visible = distance*widthPerDepth() <= 500;
    detailed?.update(camera,distance*widthPerDepth());
    renderer.render(scene,camera);
    canvas.dataset.camera = JSON.stringify({
      center: [target.x,target.z],
      width: distance*widthPerDepth(),
      tilt: degrees(Math.acos(clamp(direction.y,-1,1))),
      bearing: (degrees(Math.atan2(direction.x,direction.z))+360)%360,
      near: camera.near, far: camera.far,
    });
  }

  controls.addEventListener('change',requestDraw);

  function pose(bearing: number, tilt: number, at: [number, number], width?: number) {
    const polar = radians(clamp(tilt,minTilt,maxTilt));
    const azimuth = radians(bearing%360);
    direction.set(Math.sin(polar)*Math.sin(azimuth),Math.cos(polar),Math.sin(polar)*Math.cos(azimuth));
    controls.maxDistance = fit(direction);
    const [x,z] = nearestOutlinePoint(buildings.ground,at);
    target.set(x,0,z);
    const distance = clamp(width === undefined ? controls.maxDistance : width/widthPerDepth(),
      controls.minDistance,controls.maxDistance);
    camera.position.copy(target).addScaledVector(direction,distance);
    controls.update();
    cancelAnimationFrame(frame);
    draw();
  }

  function size() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    camera.aspect = w/Math.max(h,1);
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    renderer.setSize(w,h,false);
    controls.minDistance = minWidth/widthPerDepth();
  }

  function overview() { pose(initialBearing,initialTilt,[center.x,center.z]); }
  const at = (query.get('center') ?? query.get('at'))?.split(',').map(part=>part.trim() ? Number(part) : NaN);
  size();
  const width = value('width',Infinity);
  pose(value('bearing',initialBearing),value('tilt',initialTilt),
    at?.length === 2 && at.every(Number.isFinite) ? [at[0],at[1]] : [center.x,center.z],
    Number.isFinite(width) ? width : undefined);
  reset.onclick = overview;
  addEventListener('resize',()=>{
    const width = camera.position.distanceTo(target)*widthPerDepth();
    offset.subVectors(camera.position,target).normalize();
    const bearing = degrees(Math.atan2(offset.x,offset.z));
    const tilt = degrees(Math.acos(clamp(offset.y,-1,1)));
    const at: XZ = [target.x,target.z];
    size();
    pose(bearing,tilt,at,width);
  });
  reset.disabled = false;
  status.hidden = true;
  canvas.dataset.bounds = JSON.stringify(buildings.window);
  canvas.dataset.ready = main.dataset.ready = 'true';
}

init().catch((error: unknown)=>{
  status.textContent = `지도를 열 수 없습니다. ${error instanceof Error ? error.message : ''}`;
  status.dataset.error = 'true';
});
