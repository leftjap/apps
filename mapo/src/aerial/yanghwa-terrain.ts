import * as THREE from 'three';
import { groundShape, makeSurveyBuildings, type Face, type SurveyBuilding } from './survey-buildings.ts';

type Feature = { faces: Face[] };

export type YanghwaFloor = {
  floor: { road: Face[]; walk: Face[]; islands: Face[]; a4: Feature[] };
  crossings: (Feature & { stripes: Face[] })[];
  bicycles: Feature[];
  paint: (Feature & { color: number })[];
};

export type YanghwaBuildings = {
  window: [number, number, number, number];
  ground: Face[];
  buildings: SurveyBuilding[];
  parking: Face[];
};

const CHUNK = 192;
const ink = ['#a5a9ab', '#ebc75e', '#f9f2db', '#679bf9'];

export function makeYanghwaTerrain(data: YanghwaFloor, area: YanghwaBuildings, batch = true) {
  const group = new THREE.Group();
  const layer = (faces: Face[], color: string, y: number, priority = 0) => {
    const material = new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide,
      polygonOffset: priority > 0, polygonOffsetFactor: 0, polygonOffsetUnits: -priority,
    });
    const chunks = new Map<string | number, Face[]>();
    faces.forEach((face, i) => {
      const [x,z] = face[0][0];
      const key = batch ? `${Math.floor(x/CHUNK)},${Math.floor(z/CHUNK)}` : i;
      const list = chunks.get(key);
      if (list) list.push(face);
      else chunks.set(key,[face]);
    });
    for (const chunk of chunks.values()) {
      const geometry = new THREE.ShapeGeometry(chunk.map(groundShape)).rotateX(-Math.PI/2);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = y;
      group.add(mesh);
    }
  };

  layer(area.ground,'#a8a093',0);
  layer(area.parking,'#87837d',.004,1);
  layer(data.floor.road,'#535e69',.01);
  layer([...data.floor.walk,...data.floor.islands,...data.floor.a4.flatMap(row=>row.faces)],'#e0c9a8',.02,1);
  layer(data.crossings.filter(row=>row.stripes.length).flatMap(row=>row.faces),'#6b827e',.044,2);
  layer(data.crossings.filter(row=>!row.stripes.length).flatMap(row=>row.faces),'#9eada4',.044,2);
  layer(data.crossings.flatMap(row=>row.stripes),'#fbf2d9',.05,3);
  layer(data.bicycles.flatMap(row=>row.faces),'#619188',.052,3);
  for (const row of data.paint) layer(row.faces,ink[row.color],.065,4);
  group.add(...makeSurveyBuildings(area.buildings));
  return group;
}
