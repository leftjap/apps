import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import area from '../../tools/v2/areas/yanghwa-map.json';
import { makeYanghwaTerrain, type YanghwaBuildings, type YanghwaFloor } from './yanghwa-terrain.ts';

const canvas = document.querySelector('canvas')!;
const main = document.querySelector('main')!;
const reset = document.querySelector('button')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const { minWidth, minTilt, maxTilt, initialTilt, initialBearing, fitPadding } = area.camera;
const clamp = THREE.MathUtils.clamp;
const radians = THREE.MathUtils.degToRad;
const degrees = THREE.MathUtils.radToDeg;

async function read<T>(suffix: string): Promise<T> {
  const { directory, stem } = area.output;
  const base = directory.replace(/^public\//, '');
  const response = await fetch(`${import.meta.env.BASE_URL}${base}/${stem}-${suffix}.json`);
  if (!response.ok) throw Error(`${suffix} 자료 응답 ${response.status}`);
  return response.json();
}

async function init() {
  THREE.ColorManagement.enabled = false;
  const [data, buildings] = await Promise.all([read<YanghwaFloor>('a'),read<YanghwaBuildings>('buildings')]);
  const [west,north,east,south] = buildings.window;
  const center = new THREE.Vector3((west+east)/2,0,(north+south)/2);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b0d11');
  const terrain = makeYanghwaTerrain(data,buildings);
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

  function draw() {
    frame = 0;
    offset.subVectors(camera.position,target);
    direction.copy(offset).normalize();
    controls.maxDistance = fit(direction);
    target.set(clamp(target.x,west,east),0,clamp(target.z,north,south));
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
    renderer.render(scene,camera);
    canvas.dataset.camera = JSON.stringify({
      center: [target.x,target.z],
      width: distance*widthPerDepth(),
      tilt: degrees(Math.acos(clamp(direction.y,-1,1))),
      bearing: (degrees(Math.atan2(direction.x,direction.z))+360)%360,
      near: camera.near, far: camera.far,
    });
  }

  controls.addEventListener('change',()=>{
    if (!frame) frame = requestAnimationFrame(draw);
  });

  function pose(bearing: number, tilt: number, at: [number, number], width?: number) {
    const polar = radians(clamp(tilt,minTilt,maxTilt));
    const azimuth = radians(bearing%360);
    direction.set(Math.sin(polar)*Math.sin(azimuth),Math.cos(polar),Math.sin(polar)*Math.cos(azimuth));
    controls.maxDistance = fit(direction);
    target.set(clamp(at[0],west,east),0,clamp(at[1],north,south));
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
  const query = new URLSearchParams(location.search);
  const value = (key: string,fallback: number) => {
    const raw = query.get(key);
    const n = raw?.trim() ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : fallback;
  };
  const at = query.get('at')?.split(',').map(part=>part.trim() ? Number(part) : NaN);
  size();
  const width = value('width',Infinity);
  pose(value('bearing',initialBearing),value('tilt',initialTilt),
    at?.length === 2 && at.every(Number.isFinite) ? [at[0],at[1]] : [center.x,center.z],
    Number.isFinite(width) ? width : undefined);
  reset.onclick = overview;
  addEventListener('resize',()=>{size();overview();});
  reset.disabled = false;
  status.hidden = true;
  canvas.dataset.bounds = JSON.stringify(buildings.window);
  canvas.dataset.ready = main.dataset.ready = 'true';
}

init().catch((error: unknown)=>{
  status.textContent = `지도를 열 수 없습니다. ${error instanceof Error ? error.message : ''}`;
  status.dataset.error = 'true';
});
