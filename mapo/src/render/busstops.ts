// 버스 정류장 쉼터. 정류장마다 보도 위에 지붕, 뒷벽 유리, 기둥, 파란 정류장 표지를 세운다.
// 사람이 정류장에서 줄을 서고 버스에 타고 내리므로, 그 자리가 정류장이라는 것을 보여 준다.
import * as THREE from 'three';
import { material } from './env.ts';
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
