// 버스 정류장 쉼터. 정류장마다 보도 위에 지붕, 뒷벽 유리, 기둥, 파란 정류장 표지를 세운다.
// 사람이 정류장에서 줄을 서고 버스에 타고 내리므로, 그 자리가 정류장이라는 것을 보여 준다.
// 중앙버스정류장은 길 가운데 분리대 위 승강장(낮은 단, 긴 지붕, 일반 차로 쪽 유리 난간, 양 끝 표지)으로 따로 그린다.
import * as THREE from 'three';
import { material } from './env.ts';
import { ISLAND_BACK, ISLAND_L, ISLAND_W } from '../sim/graph.ts';
import { instanced, merge, part } from './util.ts';

/** 부품: 0 지붕·기둥, 1 뒷벽 유리, 2 표지판. 앞(+x)은 버스가 가는 쪽, +z 는 찻길에서 먼 쪽 */
function shelter(): THREE.BufferGeometry {
  return merge([
    part(new THREE.BoxGeometry(3.4, 0.14, 1.5).translate(0, 2.55, 0.75), 0),
    part(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 5).translate(-1.5, 1.25, 1.35), 0),
    part(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 5).translate(1.5, 1.25, 1.35), 0),
    part(new THREE.BoxGeometry(3.0, 1.8, 0.06).translate(0, 1.35, 1.4), 1),
    part(new THREE.CylinderGeometry(0.06, 0.06, 3.1, 5).translate(2.3, 1.55, 0.1), 0),
    part(new THREE.BoxGeometry(0.08, 0.7, 0.9).translate(2.3, 2.9, 0.1), 2),
  ]);
}

export function makeBusStops(stops: { x: number; z: number; yaw: number }[]) {
  const inst = instanced(shelter(), stops.length, { aInst: 4 });
  stops.forEach((s, i) => inst.arr.aInst.set([s.x, s.z, s.yaw, 0], i * 4));
  inst.geo.instanceCount = stops.length;
  const mesh = new THREE.Mesh(
    inst.geo,
    material({
      vertex: /* glsl */ `
        attribute vec4 aInst; attribute float aPart;
        varying vec3 vN; varying float vPart; varying float vDist;
        void main() {
          vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          vec3 p = position * zoomScale(-cv.z, 3.0, 6.0, 1.0, 3.0);
          float cs = cos(aInst.z), sn = sin(aInst.z);
          // 앞(+x)은 진행 방향, +z 는 진행 방향 오른쪽
          vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y, aInst.y + p.x * sn + p.z * cs);
          vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
          vPart = aPart;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        varying vec3 vN; varying float vPart; varying float vDist;
        void main() {
          vec3 alb = vPart < 0.5 ? vec3(0.32, 0.36, 0.42) : vPart < 1.5 ? vec3(0.62, 0.78, 0.86) : vec3(0.16, 0.42, 0.86);
          vec3 col = lit(alb, normalize(vN));
          if (vPart > 1.5) col += alb * 0.5 * uNight;          // 밤에 표지판이 빛난다
          gl_FragColor = vec4(fogged(col, vDist), 1.0);
        }`,
    }),
  );
  mesh.frustumCulled = false;
  return mesh;
}

/** 부품: 0 지붕·기둥, 1 유리 난간, 2 표지판, 3 승강장 바닥. 앞(+x)은 버스가 가는 쪽, +z 는 일반 차로 쪽(버스는 −z 쪽에 선다) */
function island(): THREE.BufferGeometry {
  const h = ISLAND_W / 2;
  const parts = [
    part(new THREE.BoxGeometry(ISLAND_L, 0.2, ISLAND_W).translate(0, 0.1, 0), 3),
    part(new THREE.BoxGeometry(ISLAND_L - 6, 0.12, ISLAND_W + 0.5).translate(0, 2.9, -0.15), 0),
    part(new THREE.BoxGeometry(ISLAND_L - 2, 1.1, 0.05).translate(0, 0.75, h - 0.08), 1),
    part(new THREE.CylinderGeometry(0.07, 0.07, 3.3, 5).translate(-ISLAND_L / 2 + 0.6, 1.65, 0), 0),
    part(new THREE.BoxGeometry(0.1, 0.8, 1.2).translate(-ISLAND_L / 2 + 0.6, 3.0, 0), 2),
    part(new THREE.CylinderGeometry(0.07, 0.07, 3.3, 5).translate(ISLAND_L / 2 - 0.6, 1.65, 0), 0),
    part(new THREE.BoxGeometry(0.1, 0.8, 1.2).translate(ISLAND_L / 2 - 0.6, 3.0, 0), 2),
  ];
  for (let x = -ISLAND_L / 2 + 4; x <= ISLAND_L / 2 - 4; x += 5.5) parts.push(part(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 5).translate(x, 1.5, h - 0.2), 0));
  return merge(parts);
}

/** 중앙 정류장 승강장. stops 는 버스가 서는 자리(승강장 가운데에서 ISLAND_BACK 앞)와 버스가 가는 방향 */
export function makeBusIslands(stops: { x: number; z: number; yaw: number }[]) {
  const inst = instanced(island(), Math.max(1, stops.length), { aInst: 4 });
  stops.forEach((s, i) => inst.arr.aInst.set([s.x - Math.cos(s.yaw) * ISLAND_BACK, s.z - Math.sin(s.yaw) * ISLAND_BACK, s.yaw, 0], i * 4));
  inst.geo.instanceCount = stops.length;
  const mesh = new THREE.Mesh(
    inst.geo,
    material({
      vertex: /* glsl */ `
        attribute vec4 aInst; attribute float aPart;
        varying vec3 vN; varying float vPart; varying float vDist;
        void main() {
          vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          // 길이·폭은 실제 크기로 두고(찻길과 맞아야 한다) 높이만 멀리서 볼 때 키운다
          vec3 p = vec3(position.x, position.y * zoomScale(-cv.z, 3.0, 6.0, 1.0, 2.5), position.z);
          float cs = cos(aInst.z), sn = sin(aInst.z);
          vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y, aInst.y + p.x * sn + p.z * cs);
          vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
          vPart = aPart;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        varying vec3 vN; varying float vPart; varying float vDist;
        void main() {
          vec3 alb = vPart < 0.5 ? vec3(0.32, 0.36, 0.42) : vPart < 1.5 ? vec3(0.62, 0.78, 0.86) : vPart < 2.5 ? vec3(0.16, 0.42, 0.86) : vec3(0.66, 0.64, 0.6);
          vec3 col = lit(alb, normalize(vN));
          if (vPart > 1.5 && vPart < 2.5) col += alb * 0.5 * uNight;   // 밤에 표지판이 빛난다
          gl_FragColor = vec4(fogged(col, vDist), 1.0);
        }`,
    }),
  );
  mesh.frustumCulled = false;
  return mesh;
}
