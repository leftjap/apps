// 신호 교차로의 바닥 표시와 신호등. 들어오는 길마다 진행 방향 오른쪽 절반에 정지선과 횡단보도를 칠하고,
// 정지선 옆 보도 끝에 신호등 기둥을 세운다. 신호등 불빛은 매 프레임 신호 상태로 바꾼다.
import * as THREE from 'three';
import type { Edge } from '../sim/graph.ts';
import { LANE } from '../sim/graph.ts';
import type { Signals } from '../sim/signals.ts';
import { material } from './env.ts';
import { addRibbon, instanced, merge, part, ribbon, ribbonGeometry } from './util.ts';

export function makeSignalMarks(edges: Edge[], signals: Signals) {
  const group = new THREE.Group();
  const marks = ribbon();
  const poles: [number, number, number, number][] = []; // x, z, 방향, 신호 번호(approach 순서)
  const list: { c: number; group: number }[] = [];
  for (const [id, ap] of signals.approach) {
    const e = edges[id];
    const n = e.p.length;
    const ex = e.p[n - 3];
    const ez = e.p[n - 1];
    const dx = e.p[n - 3] - e.p[n - 6];
    const dz = e.p[n - 1] - e.p[n - 4];
    const len = Math.hypot(dx, dz) || 1;
    const ax = dx / len;
    const az = dz / len;
    // 진행 방향 오른쪽: (-az, ax). 이 방향 차로가 차지하는 폭
    const inner = e.off0 > 0 ? 0 : e.off0 - LANE / 2;
    const outer = e.off0 + (e.lanes - 0.5) * LANE;
    const across = (d: number, from: number, to: number) => [ex - ax * d - az * from, 0.35, ez - az * d + ax * from, ex - ax * d - az * to, 0.35, ez - az * d + ax * to];
    addRibbon(marks, across(ap.crosswalk, inner, outer + 0.4), 3.2, [1, 0, 0, 0]); // 횡단보도
    addRibbon(marks, across(ap.setback, Math.max(inner, 0.2), outer), 0.45, [0, 1, 0, 0]); // 정지선
    const px = ex - ax * ap.setback - az * (outer + 1.6);
    const pz = ez - az * ap.setback + ax * (outer + 1.6);
    poles.push([px, pz, Math.atan2(az, ax), list.length]);
    list.push({ c: ap.c, group: ap.group });
  }
  const markMesh = new THREE.Mesh(
    ribbonGeometry(marks),
    material({
      transparent: true,
      depthWrite: false,
      offset: 5,
      doubleSide: true,
      vertex: /* glsl */ `
        attribute vec2 aUV; attribute vec4 aInfo;
        varying vec2 vUV; varying vec4 vInfo; varying float vDist;
        void main() { vUV = aUV; vInfo = aInfo; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragment: /* glsl */ `
        varying vec2 vUV; varying vec4 vInfo; varying float vDist;
        void main() {
          float zebra = vInfo.x * step(0.5, fract(vUV.y / 1.1)) * (1.0 - smoothstep(0.85, 1.0, abs(vUV.x)));
          float a = max(zebra, vInfo.y) * (1.0 - smoothstep(1200.0, 2200.0, vDist));
          gl_FragColor = vec4(vec3(0.96, 0.96, 0.94) * (0.8 + 0.25 * (1.0 - uNight)), a * 0.85);
        }`,
    }),
  );
  markMesh.renderOrder = -2.5;
  markMesh.frustumCulled = false;
  group.add(markMesh);

  // 신호등: 기둥, 가로 팔, 불빛 상자, 불빛. 앞은 +x(다가오는 차 쪽을 보도록 돌린다)
  const pole = merge([
    part(new THREE.CylinderGeometry(0.12, 0.14, 5.2, 6).translate(0, 2.6, 0), 0),
    part(new THREE.BoxGeometry(0.5, 1.4, 0.45).translate(0, 4.9, 0), 0),
    part(new THREE.SphereGeometry(0.17, 8, 6).translate(-0.26, 5.35, 0), 1),
    part(new THREE.SphereGeometry(0.17, 8, 6).translate(-0.26, 4.9, 0), 2),
    part(new THREE.SphereGeometry(0.17, 8, 6).translate(-0.26, 4.45, 0), 3),
  ]);
  const inst = instanced(pole, poles.length, { aInst: 4 });
  poles.forEach((p, i) => inst.arr.aInst.set(p, i * 4));
  inst.geo.instanceCount = poles.length;
  const stateArr = new Float32Array(Math.max(1, poles.length));
  const stateAttr = new THREE.InstancedBufferAttribute(stateArr, 1);
  stateAttr.setUsage(THREE.DynamicDrawUsage);
  inst.geo.setAttribute('aState', stateAttr);
  const poleMesh = new THREE.Mesh(
    inst.geo,
    material({
      vertex: /* glsl */ `
        attribute vec4 aInst; attribute float aPart; attribute float aState;
        varying vec3 vN; varying float vPart; varying float vState; varying float vDist;
        void main() {
          vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          vec3 p = position * zoomScale(-cv.z, 5.0, 7.0, 1.0, 3.0);
          float cs = cos(aInst.z), sn = sin(aInst.z);
          vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y, aInst.y + p.x * sn + p.z * cs);
          vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
          vPart = aPart; vState = aState;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        varying vec3 vN; varying float vPart; varying float vState; varying float vDist;
        void main() {
          vec3 col = lit(vec3(0.22, 0.24, 0.27), normalize(vN));
          // 위에서부터 빨강·노랑·초록. 켜진 불만 밝다
          float red = step(0.5, vPart) * step(vPart, 1.5);
          float yel = step(1.5, vPart) * step(vPart, 2.5);
          float grn = step(2.5, vPart);
          float on = red * step(1.5, vState) + yel * step(0.5, vState) * step(vState, 1.5) + grn * step(vState, 0.5);
          vec3 lamp = red * vec3(1.0, 0.15, 0.1) + yel * vec3(1.0, 0.75, 0.1) + grn * vec3(0.2, 1.0, 0.55);
          col = mix(col, lamp * mix(0.18, 1.3 + uNight * 0.6, on), step(0.5, vPart));
          gl_FragColor = vec4(fogged(col, vDist), 1.0);
        }`,
    }),
  );
  poleMesh.frustumCulled = false;
  group.add(poleMesh);

  return {
    group,
    update(tod: number) {
      list.forEach((a, i) => (stateArr[i] = signals.state(a.c, a.group, tod)));
      stateAttr.needsUpdate = true;
    },
  };
}

