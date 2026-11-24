import * as THREE from 'three';
import { PAINT_DASHES } from './ground-paint.ts';
import { AERIAL_DEV_ORIGIN, tileBounds } from './map.ts';
import { AERIAL_BEARING } from './road-overlay.ts';
import { hapjeongArea, photoTiles, type SurveyArea } from './survey-area.ts';
import type { HapjeongEntrances, HapjeongPeopleInput } from './hapjeong-people.ts';

type XZ = [number, number];
type Face = XZ[][];
type BuiltArea = {
  window: [number, number, number, number];
  ground?: Face[];
  buildings: { faces: Face[]; height: number }[];
  parking: Face[];
};
type Path = XZ[];
type Feature = { faces: Face[] };
type Ink = { color: number; width: number; dash: number };
type Asset = {
  floor: { road: Face[]; walk: Face[]; islands: Face[]; a4: Feature[] };
  lines: { paths: Path[]; ink: Ink }[];
  crossings: (Feature & { stripes: Face[] })[];
  bicycles: Feature[];
  links: { paths: Path[]; type: string }[];
};

const status = document.querySelector<HTMLParagraphElement>('#status')!;
const flat = (color: string, groundLayer = 0) => new THREE.MeshBasicMaterial({
  color, side: THREE.DoubleSide,
  // Ground overlays remain depth-tested against buildings and vehicles.
  polygonOffset: groundLayer > 0, polygonOffsetFactor: 0, polygonOffsetUnits: -groundLayer,
});

async function photoPlane(photo: SurveyArea['photo'], trial = false) {
  const [first, last] = photoTiles(photo);
  const mosaic = document.createElement('canvas');
  mosaic.width = (last.x - first.x + 1) * 256;
  mosaic.height = (last.y - first.y + 1) * 256;
  const context = mosaic.getContext('2d', { alpha: false })!;
  const tiles: {x: number; y: number}[] = [];
  if (location.origin !== AERIAL_DEV_ORIGIN) throw Error('로컬 항공사진은 5198에서 열어 주세요.');
  for (let y = first.y; y <= last.y; y++) {
    for (let x = first.x; x <= last.x; x++) {
      tiles.push({x,y});
    }
  }
  const load = async ({x,y}: {x: number; y: number}) => {
    const attempts = trial ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const image = new Image();
      image.src = `${import.meta.env.BASE_URL}__aerial/${y}/${x}.jpeg`;
      try {
        await image.decode();
        context.drawImage(image, (x-first.x)*256, (y-first.y)*256, 256, 256);
        return;
      } catch {
        if (attempt+1 === attempts) throw Error(`항공사진 타일 ${y}/${x} 응답 오류`);
      }
    }
  };
  // Keep large comparison views from issuing every request at once.
  const batch = trial || 'bounds' in photo ? 7 : tiles.length;
  for (let i=0;i<tiles.length;i+=batch) await Promise.all(tiles.slice(i,i+batch).map(load));
  const texture = new THREE.CanvasTexture(mosaic);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const { west, north } = tileBounds(first);
  const { east, south } = tileBounds(last);
  const geometry = new THREE.PlaneGeometry(east-west, south-north).rotateX(-Math.PI/2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture }));
  mesh.position.set((east+west)/2, 0, (south+north)/2);
  return mesh;
}

function groundShape([outer, ...holes]: Face) {
  const vector = (ring: Path) => ring.map(([x,z]) => new THREE.Vector2(x,-z));
  const shape = new THREE.Shape(vector(outer));
  shape.holes = holes.map(ring => new THREE.Path(vector(ring)));
  return shape;
}

function addFaces(parent: THREE.Object3D, faces: Face[], material: THREE.Material, y: number) {
  for (const face of faces) {
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(groundShape(face)).rotateX(-Math.PI/2), material);
    mesh.position.y = y;
    parent.add(mesh);
  }
}

function addBuiltArea(parent: THREE.Group, area: BuiltArea) {
  const [west, north, east, south] = area.window;
  addFaces(parent, area.ground ?? [[[[west,north], [east,north], [east,south], [west,south]]]], flat('#a8a093'), 0);
  addFaces(parent, area.parking, flat('#87837d',1), .004);
  const roof = new THREE.MeshLambertMaterial({ color: '#d9cbbc' });
  const wall = new THREE.MeshLambertMaterial({ color: '#b2a79a' });
  for (const { height, faces } of area.buildings) for (const face of faces) {
    const geometry = new THREE.ExtrudeGeometry(groundShape(face), { depth: height, bevelEnabled: false });
    parent.add(new THREE.Mesh(geometry.rotateX(-Math.PI/2), [roof,wall]));
  }
}

function stroke(vertices: number[], path: Path, y: number, width: number, dash: number) {
  const [on, off] = PAINT_DASHES[dash];
  const cycle = on + off;
  let along = 0;
  for (let i = 1; i < path.length; i++) {
    const [x,z] = path[i-1];
    const [x1,z1] = path[i];
    const length = Math.hypot(x1-x,z1-z);
    if (!length) continue;
    const ux=(x1-x)/length, uz=(z1-z)/length;
    const sx=-uz*width/2, sz=ux*width/2;
    const quad = (start: number, end: number) => {
      if (start >= end) return;
      const ax=x+ux*start, az=z+uz*start, bx=x+ux*end, bz=z+uz*end;
      vertices.push(ax-sx,y,az-sz, bx-sx,y,bz-sz, bx+sx,y,bz+sz,
        ax-sx,y,az-sz, bx+sx,y,bz+sz, ax+sx,y,az+sz);
    };
    if (cycle) {
      for (let step = Math.floor(along/cycle); step*cycle < along+length; step++) {
        const from = step*cycle-along;
        quad(Math.max(0,from), Math.min(length,from+on));
      }
    } else {
      quad(0,length);
    }
    along += length;
  }
}

function addInk(parent: THREE.Object3D, vertices: number[], color: string, groundLayer: number) {
  if (!vertices.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  parent.add(new THREE.Mesh(geometry, flat(color,groundLayer)));
}

const areaManifests = import.meta.glob<SurveyArea>('../../tools/v2/areas/*.json', { import: 'default' });

async function init() {
  const query = new URLSearchParams(location.search);
  const requestedArea = query.get('area');
  const loadArea = requestedArea && areaManifests[`../../tools/v2/areas/${requestedArea}.json`];
  if (requestedArea && !loadArea) throw Error(`알 수 없는 구역 · ${requestedArea}`);
  const area = loadArea ? await loadArea() : hapjeongArea;
  document.title = document.querySelector('h1')!.textContent = `${area.title} 정밀도로지도`;
  const canReplay = area.replay.enabled !== false;
  const peopleMode = canReplay && area.replay.people !== false && (query.get('people') === '1' || query.get('pedestrians') === '1');
  const carsMode = canReplay && query.get('cars') === '1';
  const simulation = carsMode || peopleMode;
  const variantA = simulation || query.get('variant') === 'a' || area.combinedByDefault;
  const suffix = variantA ? '-a' : '';
  const directory = area.output.directory.replace(/^public\//, '');
  const asset = `${import.meta.env.BASE_URL}${directory}/${area.output.stem}`;
  const response = await fetch(`${asset}${suffix}.json`);
  if (!response.ok) throw Error(`가공 자료 응답 ${response.status}`);
  const data: Asset = await response.json();
  let people: HapjeongPeopleInput | undefined;
  const load = async (name: string) => {
    const response = await fetch(`${asset}-${name}.json`);
    if (!response.ok) throw Error(`${area.title} 자료 응답 ${response.status} · ${name}`);
    return response.json();
  };
  const entrances = simulation && area.replay.people !== false ? await load('entrances') as HapjeongEntrances : undefined;
  if (peopleMode) {
    people = { walk: await load('walk'), entrances, signalTest: query.get('signaltest') === '1' };
  }
  const cars = simulation ? await load('cars') as import('./hapjeong-car-graph.ts').HapjeongCars : undefined;
  const demand = simulation ? await load('demand') as import('./hapjeong-car-playback.ts').HapjeongDemand : undefined;
  // The whole-area view only changes the camera, never replay entry/exit placement.
  const overview = area.views.overview ?? area.views.display.find(view => view.id === 'all');
  const views = simulation
    ? [...area.views.simulation, ...(overview ? [overview] : [])]
    : variantA ? area.views.display.filter(view => view.mode === 'photo') : area.views.display;
  const photo = new THREE.Scene();
  const model = new THREE.Scene();
  photo.background = new THREE.Color('#46555a');
  model.background = new THREE.Color('#3b414a');

  const survey = new THREE.Group();
  const hd = new THREE.Group();
  const route = new THREE.Group();
  const buildings = new THREE.Group();
  const sun = new THREE.DirectionalLight('#fff0d8', 1.35);
  sun.position.set(-200, 300, 100);
  model.add(survey, hd, route, buildings, sun, new THREE.HemisphereLight('#dceafa','#5c5751',2));
  if (people?.entrances && area.station) {
    const { makeStations } = await import('../render/stations.ts');
    const { exits, lines } = people.entrances;
    const station = area.station;
    const stations = makeStations({
      exits, stations: [{ name:station, x:0, z:0 }], buildings: [], elevators: new Float32Array(),
      lines: lines.map(line=>({ ...line, stopNames:[station] })),
    });
    stations.setUnderVisible(false);
    model.add(stations.group);
  }
  addFaces(model,data.floor.road,flat('#535e69'),.01);
  const walk = flat('#e0c9a8',1);
  addFaces(survey,[...data.floor.walk,...data.floor.islands],walk,.02);
  addFaces(hd,data.floor.a4.flatMap(row=>row.faces),walk,.02);

  const white = flat('#fbf2d9',3);
  const crossingBase = flat('#6b827e',2);
  const unresolved = flat('#9eada4',2);
  for (const cross of data.crossings) {
    addFaces(model,cross.faces,cross.stripes.length ? crossingBase : unresolved,.044);
    addFaces(model,cross.stripes,white,.05);
  }
  addFaces(model,data.bicycles.flatMap(row=>row.faces),flat('#619188',3),.052);
  const colors = ['#a5a9ab','#ebc75e','#f9f2db','#679bf9'];
  const paint = colors.map(() => [] as number[]);
  for (const row of data.lines) {
    for (const path of row.paths) stroke(paint[row.ink.color],path,.065,row.ink.width,row.ink.dash);
  }
  paint.forEach((vertices,i)=>addInk(model,vertices,colors[i],4));
  const lane: number[] = [], inside: number[] = [];
  for (const row of data.links) {
    for (const path of row.paths) stroke(row.type === '1' ? inside : lane,path,.095,.23,0);
  }
  addInk(route,lane,'#69e7ff',5);
  addInk(route,inside,'#f6a3eb',5);
  const [imagery, builtArea] = await Promise.all([photoPlane(area.photo, simulation),load('buildings') as Promise<BuiltArea>]);
  addBuiltArea(buildings,builtArea);
  photo.add(imagery);

  const camera = new THREE.PerspectiveCamera(34,1);
  const canvas = (id: string) => document.querySelector<HTMLCanvasElement>(`#${id}`)!;
  const left = new THREE.WebGLRenderer({ canvas:canvas('left'), antialias:true });
  const right = new THREE.WebGLRenderer({ canvas:canvas('right'), antialias:true, preserveDrawingBuffer:simulation });
  const form = document.querySelector<HTMLSelectElement>('#view')!;
  const pair = document.querySelector<HTMLDivElement>('#pair')!;
  const leftCaption = document.querySelector<HTMLDivElement>('#left-caption')!;
  const rightCaption = document.querySelector<HTMLDivElement>('#right-caption')!;
  const routeLegend = document.querySelectorAll<HTMLElement>('[data-route]');
  for (const view of views) form.add(new Option(view.title,view.id));
  form.value = views.find(view => view.id===query.get('view'))?.id ?? (simulation ? area.views.replayDefault : area.views.default);
  document.getElementById('bicycle')!.hidden = !data.bicycles.length;
  document.getElementById('missing')!.hidden = data.crossings.every(row => row.stripes.length);
  const gallery = document.querySelector<HTMLAnchorElement>('#capture-gallery')!;
  const galleryInfo = area.galleries?.[simulation ? 'replay' : variantA ? 'combined' : 'base'];
  gallery.hidden = !galleryInfo;
  if (galleryInfo) {
    gallery.href = galleryInfo.url;
    gallery.textContent = galleryInfo.label;
  }

  let refreshSimulation: (() => void) | undefined;
  function draw() {
    const view = views.find(row=>row.id===form.value)!;
    const w = left.domElement.clientWidth, h = left.domElement.clientHeight;
    if (!w || !h) return;
    camera.aspect=w/h;
    const distance = view.width/(2*camera.aspect*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
    const tiltDegrees = view.tilt ?? 28;
    const tilt = THREE.MathUtils.degToRad(tiltDegrees);
    const offset = distance * Math.sin(tilt);
    const [x,z] = view.at;
    camera.position.set(x+offset*Math.sin(AERIAL_BEARING),distance*Math.cos(tilt),z+offset*Math.cos(AERIAL_BEARING));
    camera.lookAt(x,0,z);
    camera.near = distance/5;
    camera.far = distance*2;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    const comparison = view.mode === 'floors';
    route.visible = view.mode === 'paths';
    survey.visible = true;
    hd.visible = false;
    const render = (renderer: THREE.WebGLRenderer, scene: THREE.Scene) => {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
      renderer.setSize(w,h,false);
      renderer.render(scene,camera);
      renderer.domElement.dataset.camera = JSON.stringify({
        center:view.at, width:view.width, tilt:tiltDegrees, bearing:THREE.MathUtils.radToDeg(AERIAL_BEARING),
        worldInverse:camera.matrixWorldInverse.elements, projection:camera.projectionMatrix.elements,
      });
    };
    render(left,comparison ? model : photo);
    survey.visible = !comparison;
    hd.visible = comparison;
    refreshSimulation?.();
    render(right,model);
    leftCaption.textContent = comparison ? '수치지형도 인도·교통섬' : '브이월드 항공사진';
    rightCaption.textContent = variantA ? 'A · 합친 인도·교통섬과 정밀도로지도 노면'
      : comparison ? '정밀도로지도 A4 인도·교통섬' : '수치지형도 바닥 · 정밀도로지도 노면';
    routeLegend.forEach(entry=>{entry.hidden = !route.visible;});
    status.textContent = `${view.title} · 폭 ${view.width}m · 수직 기준 기울기 ${tiltDegrees}°`;
    pair.dataset.view=view.id;
    pair.dataset.mode=view.mode;
    const params = new URLSearchParams();
    if (requestedArea) params.set('area', requestedArea);
    if (variantA && (simulation || !area.combinedByDefault || query.has('variant'))) params.set('variant', 'a');
    if (peopleMode) params.set('people', '1');
    if (carsMode) params.set('cars', '1');
    params.set('view', view.id);
    for (const key of ['paused', 'at', 'seeded', 'signaltest']) if (query.has(key)) params.set(key, query.get(key)!);
    history.replaceState(null, '', `?${params}`);
  }
  form.addEventListener('change',draw);
  new ResizeObserver(draw).observe(left.domElement.parentElement!);
  draw();
  if (cars) {
    const { attachHapjeongSimulation } = await import('./hapjeong-cars.ts');
    refreshSimulation = attachHapjeongSimulation(
      model, camera, right.domElement, cars, () => right.render(model, camera), query, carsMode, people, demand, entrances, area,
    );
  }
  document.querySelector('main')!.dataset.ready='true';
}

init().catch((error: unknown)=>{
  status.textContent = `비교 화면을 열 수 없습니다. ${error instanceof Error ? error.message : ''}`;
  status.dataset.error='true';
});
