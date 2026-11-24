import * as THREE from 'three';
import { makeSurveyBuildings, type SurveyBuilding } from './survey-buildings.ts';
import { makeYanghwaTerrain, type SurveyRoadPaint, type YanghwaBuildings, type YanghwaFloor } from './yanghwa-terrain.ts';

const DETAIL_CELL = 192;
const DETAIL_WIDTH = 360;
type Cell = { buildings: SurveyBuilding[]; bounds: THREE.Box3; group?: THREE.Group };

export function makeDistrictTerrain(data: YanghwaFloor, area: YanghwaBuildings, roadPaint: SurveyRoadPaint) {
  const group = makeYanghwaTerrain(data, { ...area, buildings: [] }, true, 320, roadPaint);
  const distant = new THREE.Group().add(...makeSurveyBuildings(area.buildings, { chunkSize: 512, detail: false }));
  const nearby = new THREE.Group();
  group.add(distant, nearby);

  const cells = new Map<string, Cell>();
  const point = new THREE.Vector3();
  for (const building of area.buildings) for (const [i, face] of building.faces.entries()) {
    const [x, z] = face[0][0];
    const key = `${Math.floor(x / DETAIL_CELL)},${Math.floor(z / DETAIL_CELL)}`;
    let cell = cells.get(key);
    if (!cell) cells.set(key, cell = { buildings: [], bounds: new THREE.Box3() });
    cell.buildings.push({ ...building, faces: [face], appearance:
      building.appearance && [building.appearance[i]] });
    for (const ring of face) for (const [x, z] of ring) {
      cell.bounds.expandByPoint(point.set(x, 0, z));
      cell.bounds.expandByPoint(point.set(x, building.height, z));
    }
  }

  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4();
  const fade = { value: 1 };
  const cache = new Map<Cell, THREE.Group>();
  function update(camera: THREE.Camera, width: number) {
    distant.visible = width >= DETAIL_WIDTH;
    nearby.visible = !distant.visible;
    if (!nearby.visible) return;
    fade.value = THREE.MathUtils.clamp((DETAIL_WIDTH - width) / 90, 0, 1);
    frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const cell of cells.values()) {
      const visible = frustum.intersectsBox(cell.bounds);
      if (cell.group) cell.group.visible = visible;
      if (!visible) continue;
      if (!cell.group) {
        cell.group = new THREE.Group().add(...makeSurveyBuildings(cell.buildings, {
          chunkSize: DETAIL_CELL, facadeFade: fade,
        }));
        nearby.add(cell.group);
      }
      cache.delete(cell);
      cache.set(cell, cell.group);
    }
    for (const [cell, model] of cache) {
      if (cache.size <= 40) break;
      if (model.visible) continue;
      for (const mesh of model.children as THREE.Mesh[]) mesh.geometry.dispose();
      const material = (model.children[0] as THREE.Mesh).material as THREE.Material;
      material.dispose();
      model.removeFromParent();
      cell.group = undefined;
      cache.delete(cell);
    }
  }

  return { group, update };
}
