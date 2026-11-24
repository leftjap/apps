import * as THREE from 'three';
import { groundShape, makeSurveyBuildings, type Face, type SurveyBuilding } from './survey-buildings.ts';

type Feature = { faces: Face[] };

export type YanghwaFloor = {
  floor: { road: Face[]; walk: Face[]; islands: Face[]; a4: Feature[] };
  crossings: (Feature & { stripes: Face[] })[];
  bicycles: Feature[];
  paint: (Feature & { color: number })[];
  land?: Face[];
  water?: Face[];
  parks?: Face[];
  decks?: Feature[];
};

export type YanghwaBuildings = {
  window: [number, number, number, number];
  ground: Face[];
  buildings: SurveyBuilding[];
  parking: Face[];
};

const CHUNK = 192;
const ink = ['#a5a9ab', '#ebc75e', '#f9f2db', '#679bf9'];

export function tileSurface(faces: Face[], cellSize: number) {
  const cells = new Map<string, number[]>();
  const geometry = new THREE.ShapeGeometry(faces.map(groundShape)).rotateX(-Math.PI / 2);
  const { index } = geometry;
  const pos = geometry.getAttribute('position');
  for (let i = 0; index && i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    const x = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const z = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const key = `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
    let points = cells.get(key);
    if (!points) cells.set(key, points = []);
    for (const at of [a, b, c]) points.push(pos.getX(at), pos.getY(at), pos.getZ(at));
  }
  geometry.dispose();
  return [...cells.values()].map(points => new THREE.BufferGeometry()
    .setAttribute('position', new THREE.Float32BufferAttribute(points, 3)));
}

export function makeYanghwaTerrain(data: YanghwaFloor, area: YanghwaBuildings, batch = true, tileSize = 0) {
  const group = new THREE.Group();
  const layer = (faces: Face[], color: string, y: number, priority = 0) => {
    const material = new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide,
      polygonOffset: priority > 0, polygonOffsetFactor: 0, polygonOffsetUnits: -priority,
    });
    const add = (geometry: THREE.BufferGeometry) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = y;
      group.add(mesh);
    };
    if (tileSize) {
      for (const geometry of tileSurface(faces, tileSize)) add(geometry);
      return;
    }
    const chunks = new Map<string | number, Face[]>();
    faces.forEach((face, i) => {
      const [x,z] = face[0][0];
      const key = batch ? `${Math.floor(x/CHUNK)},${Math.floor(z/CHUNK)}` : i;
      const list = chunks.get(key);
      if (list) list.push(face);
      else chunks.set(key,[face]);
    });
    for (const chunk of chunks.values()) {
      add(new THREE.ShapeGeometry(chunk.map(groundShape)).rotateX(-Math.PI/2));
    }
  };

  layer(data.land ?? area.ground,'#a8a093',0);
  if (data.parks) layer(data.parks,'#829369',0);
  if (data.water) layer(data.water,'#54879b',0);
  layer(area.parking,'#87837d',.004,1);
  layer(data.floor.road,'#535e69',.01);
  if (data.decks) layer(data.decks.flatMap(row=>row.faces),'#535e69',.012,1);
  layer([...data.floor.walk,...data.floor.islands,...data.floor.a4.flatMap(row=>row.faces)],'#e0c9a8',.02,1);
  layer(data.crossings.filter(row=>row.stripes.length).flatMap(row=>row.faces),'#6b827e',.044,2);
  layer(data.crossings.filter(row=>!row.stripes.length).flatMap(row=>row.faces),'#9eada4',.044,2);
  layer(data.crossings.flatMap(row=>row.stripes),'#fbf2d9',.05,3);
  layer(data.bicycles.flatMap(row=>row.faces),'#619188',.052,3);
  for (const row of data.paint) layer(row.faces,ink[row.color],.065,4);
  if (area.buildings.length) group.add(...makeSurveyBuildings(area.buildings));
  return group;
}
