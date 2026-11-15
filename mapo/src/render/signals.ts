// 횡단보도·신호등. 횡단보도는 서울시 교통안전시설물 횡단보도 면(구운 모형판의 crosswalks)을 실제 자리·방향·폭으로 칠한다.
// 정지선은 노면 표시(src/render/marks.ts)가 서울시 차선 자료 그대로 긋는다.
// 신호등 기둥은 차가 서는 자리(시뮬레이션 정지 자리) 옆 보도 끝에 세우고, 불빛은 매 프레임 신호 상태로 바꾼다.
import * as THREE from 'three';
import type { Crosswalk } from '../data/board.ts';
import type { Edge } from '../sim/graph.ts';
import type { Signals } from '../sim/signals.ts';
import { material } from './env.ts';
import { instanced, merge, part, ribbon, ribbonGeometry, type Ribbon } from './util.ts';

/** 횡단보도 면 외곽선 하나를 칠한다. 줄무늬는 건너는 축(ux, uz)을 따라 (sx, sz)에서부터 0.5m 칠하고 0.5m 띈다 */
function addStripes(o: Ribbon, ring: Float32Array, sx: number, sz: number, ux: number, uz: number) {
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k < ring.length; k += 2) pts.push(new THREE.Vector2(ring[k], ring[k + 1]));
  const base = o.pos.length / 3;
  for (const p of pts) {
    o.pos.push(p.x, 0.35, p.y);
    o.uv.push(0, (p.x - sx) * ux + (p.y - sz) * uz);
    o.info.push(1, 0, 0, 0);
  }
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(pts, [])) o.idx.push(base + a, base + b, base + c);
}

export function makeSignalMarks(edges: Edge[], signals: Signals, crosswalks: Crosswalk[], crossMarks: Float32Array[] = []) {
  const group = new THREE.Group();
  const marks = ribbon();
  const poles: [number, number, number, number][] = []; // x, z, 방향, 신호 번호(approach 순서)
  const list: { c: number; group: number }[] = [];
  // 횡단보도: 서울시 횡단보도 면 모양 그대로(사다리꼴·평행사변형, 두 단 횡단보도는 조각마다). 줄무늬는 건너는 축을 따라 한쪽 끝에서부터 잇는다
  for (const c of crosswalks) for (const r of c.rings) addStripes(marks, r, c.x - c.ux * c.half, c.z - c.uz * c.half, c.ux, c.uz);
  // 판에 없는 골목·진입로 입구의 횡단보도: 가장 긴 변을 건너는 방향으로 본다
  for (const r of crossMarks) {
    let best = 0;
    let ux = 1;
    let uz = 0;
    for (let k = 0; k < r.length; k += 2) {
      const dx = r[(k + 2) % r.length] - r[k];
      const dz = r[(k + 3) % r.length] - r[k + 1];
      const l = Math.hypot(dx, dz);
      if (l > best) (best = l), (ux = dx / l), (uz = dz / l);
    }
    addStripes(marks, r, r[0], r[1], ux, uz);
  }
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
    const outer = e.off0 + (e.lanes - 0.5) * e.lw;
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
          float a = zebra * (1.0 - smoothstep(1200.0, 2200.0, vDist));
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

