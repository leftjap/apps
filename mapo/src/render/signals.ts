// 횡단보도·정지선·신호등. 횡단보도는 서울시 교통안전시설물 횡단보도 면(구운 모형판의 crosswalks)을 실제 자리·방향·폭으로 칠하고,
// 정지선은 서울시 차선 자료의 정지선을 그대로 긋는다. 신호에 서는 차의 정지선 자리가 그 자료와 다르면(자료가 없는 곳) 그 자리에도 긋는다.
// 신호등 기둥은 정지선 옆 보도 끝에 세우고, 불빛은 매 프레임 신호 상태로 바꾼다.
import * as THREE from 'three';
import type { Crosswalk } from '../data/board.ts';
import { laneTest, type Edge } from '../sim/graph.ts';
import type { Signals } from '../sim/signals.ts';
import { material } from './env.ts';
import { addRibbon, instanced, merge, part, ribbon, ribbonGeometry } from './util.ts';

export function makeSignalMarks(edges: Edge[], signals: Signals, crosswalks: Crosswalk[], stopLines: Float32Array) {
  const group = new THREE.Group();
  const marks = ribbon();
  const poles: [number, number, number, number][] = []; // x, z, 방향, 신호 번호(approach 순서)
  const list: { c: number; group: number }[] = [];
  // 횡단보도: 축을 따라 폭만큼의 띠. 줄무늬는 띠 방향으로 0.5m 칠하고 0.5m 띈다
  for (const c of crosswalks) addRibbon(marks, [c.x - c.ux * c.half, 0.35, c.z - c.uz * c.half, c.x + c.ux * c.half, 0.35, c.z + c.uz * c.half], c.wid, [1, 0, 0, 0]);
  // 정지선 가운데가 차로 위에 있는 것만 긋는다(차가 다니지 않는 골목 어귀의 정지선은 길 폭이 달라 엉뚱한 곳에 떠 보인다)
  const onLanes = laneTest(edges);
  for (let k = 0; k < stopLines.length; k += 4)
    if (onLanes((stopLines[k] + stopLines[k + 2]) / 2, (stopLines[k + 1] + stopLines[k + 3]) / 2))
      addRibbon(marks, [stopLines[k], 0.35, stopLines[k + 1], stopLines[k + 2], 0.35, stopLines[k + 3]], 0.45, [0, 1, 0, 0]);
  const nearStop = (x: number, z: number) => {
    for (let k = 0; k < stopLines.length; k += 4) {
      const ax = stopLines[k];
      const az = stopLines[k + 1];
      const dx = stopLines[k + 2] - ax;
      const dz = stopLines[k + 3] - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) < 2) return true;
    }
    return false;
  };
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
    // 진행 방향 오른쪽: (-az, ax). 이 방향 차로가 차지하는 폭(양방향 길이면 가운데선부터)
    const inner = e.off0 > 0 ? 0.2 : e.off0 - e.lw / 2;
    const outer = e.off0 + (e.lanes - 0.5) * e.lw;
    const mid = (inner + outer) / 2;
    const sx = ex - ax * ap.setback - az * mid;
    const sz = ez - az * ap.setback + ax * mid;
    if (!nearStop(sx, sz)) addRibbon(marks, [ex - ax * ap.setback - az * inner, 0.35, ez - az * ap.setback + ax * inner, ex - ax * ap.setback - az * outer, 0.35, ez - az * ap.setback + ax * outer], 0.45, [0, 1, 0, 0]);
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
          float zebra = vInfo.x * step(0.5, fract(vUV.y)) * (1.0 - smoothstep(0.9, 1.0, abs(vUV.x)));
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

