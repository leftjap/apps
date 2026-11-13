// 한강 배(연출)와 주말 한강공원 피크닉 소품.
// 배: 유람선은 2층 갑판, 한강버스는 쌍동선. 밤에는 창에 따뜻한 불이 켜지고, 뒤로 물결 자국(항적)을 덧그린다.
// 피크닉: 알록달록한 돗자리와 작은 텐트. 주말 낮에만 보인다.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { headingAt, pointAt } from '../poly.ts';
import type { BoatPos } from '../sim/boats.ts';
import { material } from './env.ts';
import { instanced, merge, part } from './util.ts';

const rbox = (w: number, h: number, d: number, x: number, y: number, z: number, r: number) => new RoundedBoxGeometry(w, h, d, 2, r).translate(x, y, z);

// 부품: 0 선체, 1 갑판 벽(창), 2 지붕, 3 선체 띠. 앞은 +x
const cruise = () =>
  merge([
    part(rbox(34, 3.2, 8, 0, 1.0, 0, 1.4), 0),
    part(rbox(34.4, 0.6, 8.2, 0, 2.2, 0, 0.3), 3),
    part(rbox(25, 2.6, 7, -1.5, 3.9, 0, 0.6), 1),
    part(rbox(25.6, 0.35, 7.4, -1.5, 5.35, 0, 0.15), 2),
    part(rbox(15, 2.3, 6, -3.5, 6.7, 0, 0.5), 1),
    part(rbox(15.6, 0.35, 6.4, -3.5, 8.0, 0, 0.15), 2),
  ]);
const riverbus = () =>
  merge([
    part(rbox(24, 1.8, 2.6, 0, 0.5, 3.1, 1.0), 0),
    part(rbox(24, 1.8, 2.6, 0, 0.5, -3.1, 1.0), 0),
    part(rbox(20, 0.5, 8.6, -0.5, 1.6, 0, 0.2), 3),
    part(rbox(16, 2.6, 7.6, -1.0, 3.1, 0, 0.9), 1),
    part(rbox(16.4, 0.35, 8.0, -1.0, 4.5, 0, 0.15), 2),
  ]);

export function makeBoats(river: Float32Array, cum: Float32Array) {
  const group = new THREE.Group();
  const kinds = [cruise(), riverbus()].map((base) => {
    const inst = instanced(base, 4, { aInst: 4 });
    return inst;
  });
  // 공통 값(env)은 재질마다 같은 객체를 물어야 하므로 clone 하지 않고 종류마다 새로 만든다
  const boatMaterial = (kind: number) => material({
    uniforms: { uKind: { value: kind } },
    vertex: /* glsl */ `
      attribute vec4 aInst; attribute float aPart;
      varying vec3 vN; varying float vPart; varying float vDist; varying vec3 vO;
      void main() {
        vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
        float s = zoomScale(-cv.z, 30.0, 26.0, 1.0, 2.6);
        vec3 p = position * s;
        p.y += sin(uTime * 0.8 + aInst.w) * 0.12;                 // 물 위에서 살짝 흔들린다
        float cs = cos(aInst.z), sn = sin(aInst.z);
        vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y - 0.4, aInst.y + p.x * sn + p.z * cs);
        vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
        vPart = aPart; vO = position;
        vec4 mv = viewMatrix * vec4(w, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragment: /* glsl */ `
      uniform float uKind;
      varying vec3 vN; varying float vPart; varying float vDist; varying vec3 vO;
      void main() {
        vec3 n = normalize(vN);
        vec3 hull = uKind < 0.5 ? vec3(0.95, 0.95, 0.93) : vec3(0.93, 0.95, 0.97);
        vec3 band = uKind < 0.5 ? vec3(0.16, 0.30, 0.62) : vec3(0.10, 0.55, 0.70);
        vec3 alb = vPart < 0.5 ? hull : vPart < 1.5 ? vec3(0.92) : vPart < 2.5 ? band * 0.9 + 0.1 : band;
        float win = 0.0;
        if (vPart > 0.5 && vPart < 1.5) win = step(abs(n.y), 0.5) * step(0.25, fract(vO.x / 1.6)) * smoothstep(0.2, 0.5, fract(vO.y / 2.6 + 0.35));
        alb = mix(alb, vec3(0.18, 0.24, 0.32), win * 0.8);
        vec3 col = lit(alb, n);
        col = mix(col, col * 0.55, uNight * 0.5);
        col += vec3(1.0, 0.82, 0.5) * win * uNight * 1.1;         // 밤: 갑판의 따뜻한 불빛
        gl_FragColor = vec4(fogged(col, vDist), 1.0);
      }`,
  });
  kinds.forEach((k, i) => {
    const mesh = new THREE.Mesh(k.geo, boatMaterial(i));
    mesh.frustumCulled = false;
    group.add(mesh);
  });

  // 항적: 배 뒤로 퍼지는 V자 물결
  const wakeGeo = instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(-0.5, 0, 0), 8, { aInst: 4 });
  const wake = new THREE.Mesh(
    wakeGeo.geo,
    material({
      transparent: true,
      depthWrite: false,
      offset: 3,
      vertex: /* glsl */ `
        attribute vec4 aInst;   // x, z, 방향, 길이
        varying vec2 vP;
        void main() {
          vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          float s = zoomScale(-cv.z, 30.0, 26.0, 1.0, 2.6);
          vec3 p = vec3(position.x * aInst.w * s, 0.0, position.z * aInst.w * 0.6 * s);
          float cs = cos(aInst.z), sn = sin(aInst.z);
          vP = vec2(-position.x, position.z * 2.0);   // x: 배에서 뒤로 0~1, y: 가로 −1~1
          gl_Position = projectionMatrix * viewMatrix * vec4(aInst.x + p.x * cs - p.z * sn, 0.25, aInst.y + p.x * sn + p.z * cs, 1.0);
        }`,
      fragment: /* glsl */ `
        varying vec2 vP;
        void main() {
          float spread = vP.x * 0.9 + 0.08;
          float arm = smoothstep(0.08, 0.0, abs(abs(vP.y) - spread)) ;
          float foam = smoothstep(0.25, 0.0, abs(vP.y)) * (1.0 - vP.x);
          float ripple = 0.6 + 0.4 * sin(vP.x * 40.0 - uTime * 3.0);
          float a = (arm * ripple * 0.7 + foam * 0.5) * (1.0 - vP.x) * step(abs(vP.y), 1.0);
          gl_FragColor = vec4(mix(vec3(0.92, 0.96, 1.0), vec3(0.75, 0.82, 0.95), uNight), a * 0.75);
        }`,
    }),
  );
  wake.frustumCulled = false;
  wake.renderOrder = -1;
  group.add(wake);

  const tmp = [0, 0, 0];
  /** 배를 놓고, 고르기·따라가기에 쓸 자리를 돌려준다 */
  function update(boats: (BoatPos | null)[], kindOf: number[]): ({ x: number; z: number } | null)[] {
    const n = [0, 0];
    let w = 0;
    const out = boats.map((b, i) => {
      if (!b || river.length < 6) return null;
      const seg = pointAt(river, cum, b.s, tmp);
      const yaw = headingAt(river, seg) + (b.dir < 0 ? Math.PI : 0);
      const k = kindOf[i];
      kinds[k].arr.aInst.set([tmp[0], tmp[2], yaw, i * 1.7], n[k]++ * 4);
      wakeGeo.arr.aInst.set([tmp[0] - Math.cos(yaw) * (k ? 11 : 16), tmp[2] - Math.sin(yaw) * (k ? 11 : 16), yaw, k ? 70 : 90], w++ * 4);
      return { x: tmp[0], z: tmp[2] };
    });
    kinds.forEach((k, i) => {
      k.geo.instanceCount = n[i];
      k.attr.aInst.needsUpdate = true;
    });
    wakeGeo.geo.instanceCount = w;
    wakeGeo.attr.aInst.needsUpdate = true;
    return out;
  }
  return { group, update };
}

/** 주말 한강공원 피크닉: 돗자리(색이 다른 납작한 판)와 그 위에 앉은 두 사람, 작은 세모 텐트 */
export function makePicnic(spots: Float32Array) {
  const n = spots.length / 2;
  const base = merge([
    part(new THREE.BoxGeometry(2.6, 0.06, 2.0).translate(0, 0.05, 0), 0),
    part(new THREE.ConeGeometry(1.1, 1.5, 4).rotateY(Math.PI / 4).scale(1.2, 1, 0.9).translate(0.4, 0.75, 1.9), 1),
    // 앉은 사람(보행자와 같은 2등신): 몸통과 머리
    part(new THREE.CapsuleGeometry(0.28, 0.12, 3, 8).translate(-0.6, 0.38, 0.2), 2),
    part(new THREE.SphereGeometry(0.36, 10, 7).translate(-0.6, 0.98, 0.2), 2),
    part(new THREE.CapsuleGeometry(0.28, 0.12, 3, 8).translate(0.55, 0.38, -0.3), 3),
    part(new THREE.SphereGeometry(0.36, 10, 7).translate(0.55, 0.98, -0.3), 3),
  ]);
  const inst = instanced(base, Math.max(1, n), { aInst: 4 });
  for (let i = 0; i < n; i++) inst.arr.aInst.set([spots[i * 2], spots[i * 2 + 1], (i * 2.39) % 6.28, i % 3 === 0 ? 1 : 0], i * 4);
  inst.geo.instanceCount = n;
  const mesh = new THREE.Mesh(
    inst.geo,
    material({
      vertex: /* glsl */ `
        attribute vec4 aInst; attribute float aPart;
        varying vec3 vN; varying float vPart; varying float vSeed; varying float vDist; varying vec3 vO;
        void main() {
          vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          vec3 p = position * zoomScale(-cv.z, 2.6, 7.0, 1.2, 4.0);
          if (aPart > 0.5 && aPart < 1.5) p *= aInst.w;        // 텐트는 세 자리 가운데 한 곳에만
          float cs = cos(aInst.z), sn = sin(aInst.z);
          vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y, aInst.y + p.x * sn + p.z * cs);
          vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
          vPart = aPart; vSeed = fract(aInst.z * 3.7); vO = position;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        varying vec3 vN; varying float vPart; varying float vSeed; varying float vDist; varying vec3 vO;
        void main() {
          vec3 a = vSeed < 0.25 ? vec3(0.95, 0.45, 0.42) : vSeed < 0.5 ? vec3(0.35, 0.62, 0.92) : vSeed < 0.75 ? vec3(0.98, 0.80, 0.30) : vec3(0.55, 0.80, 0.50);
          float check = step(0.5, fract(vO.x * 1.2)) == step(0.5, fract(vO.z * 1.2)) ? 1.0 : 0.0;
          vec3 alb = vPart < 0.5 ? mix(a, vec3(0.98), check * 0.6) : mix(vec3(0.96, 0.60, 0.25), vec3(0.30, 0.65, 0.85), vSeed);
          if (vPart > 1.5) alb = vPart < 2.5 ? vec3(1.0, 0.94, 0.96) : vec3(0.92, 0.96, 1.0);   // 사람: 보행자처럼 흰색 바탕
          gl_FragColor = vec4(fogged(lit(alb, normalize(vN)) * (vPart > 1.5 ? 1.08 : 1.0), vDist), 1.0);
        }`,
    }),
  );
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}
