import * as THREE from 'three';
import { groundShape, makeSurveyBuildings, type Face, type SurveyBuilding } from './survey-buildings.ts';

type Feature = { faces: Face[] };
export type SurveyRoadPaint = {
  zones: (Feature & { yellow: boolean; stripes: Face[] })[];
  symbols: Feature[];
  white: { fine: Face[]; stops: Face[] };
};

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

export function tileSurfaceCells(faces: Face[], cellSize: number) {
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
  return cells;
}

export function tileSurface(faces: Face[], cellSize: number) {
  return [...tileSurfaceCells(faces, cellSize).values()].map(points => new THREE.BufferGeometry()
    .setAttribute('position', new THREE.Float32BufferAttribute(points, 3)));
}

// Once a stripe is finer than a screen pixel, fade its coverage without
// widening it or leaving a high-contrast single-pixel trace at a distance.
function fadeFinePaint(material: THREE.MeshBasicMaterial, width: number) {
  material.transparent = true;
  material.depthWrite = false;
  material.forceSinglePass = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.paintWidth = { value: width };
    shader.vertexShader = 'varying vec2 paintGround;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\npaintGround = position.xz;');
    shader.fragmentShader = 'varying vec2 paintGround;\nuniform float paintWidth;\n' +
      shader.fragmentShader.replace('#include <alphatest_fragment>', `
        vec2 dx = dFdx(paintGround), dy = dFdy(paintGround);
        float pixel = max(min(length(dx), length(dy)), 0.001);
        diffuseColor.a *= pow(min(1.0, paintWidth / (0.9 * pixel)), 1.7);
        #include <alphatest_fragment>
      `);
  };
}

export function makeYanghwaSurfaceMaterial(color: string, priority = 0, fineWidth = 0) {
  const material = new THREE.MeshBasicMaterial({
    color, side: THREE.DoubleSide,
    polygonOffset: priority > 0, polygonOffsetFactor: 0, polygonOffsetUnits: -priority,
  });
  if (fineWidth) fadeFinePaint(material, fineWidth);
  return material;
}

export function visitYanghwaLayers(data: YanghwaFloor, area: YanghwaBuildings, roadPaint: SurveyRoadPaint | undefined,
                                  layer: (faces: Face[], color: string, y: number, priority?: number, fineWidth?: number) => void) {
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
  if (roadPaint) {
    layer(roadPaint.zones.filter(row=>row.yellow).flatMap(row=>row.stripes), ink[1], .055, 3, .22);
    layer(roadPaint.zones.filter(row=>!row.yellow).flatMap(row=>row.stripes), ink[2], .055, 3, .22);
    layer(roadPaint.symbols.flatMap(row=>row.faces), ink[2], .06, 4, .25);
  }
  for (const row of data.paint) {
    if (roadPaint && row.color === 2) {
      layer(roadPaint.white.fine, ink[2], .065, 4, .15);
      layer(roadPaint.white.stops, ink[2], .065, 4, .45);
    } else layer(row.faces, ink[row.color], .065, 4, .15);
  }
}

export function makeYanghwaTerrain(data: YanghwaFloor, area: YanghwaBuildings, batch = true, tileSize = 0, roadPaint?: SurveyRoadPaint) {
  const group = new THREE.Group();
  visitYanghwaLayers(data, area, roadPaint, (faces, color, y, priority, fineWidth) => {
    if (!faces.length) return;
    const material = makeYanghwaSurfaceMaterial(color, priority, fineWidth);
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
  });
  if (area.buildings.length) group.add(...makeSurveyBuildings(area.buildings));
  return group;
}
