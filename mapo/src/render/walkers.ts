// 보행자. 둥근 머리와 캡슐 몸통의 2등신 캐릭터를 인스턴싱으로 그리고, 뒤뚱거리는 걸음은 버텍스 셰이더에서 만든다.
// 고양이를 구경하며 멈춰 선 사람은 휴대폰을 들고, 가끔 플래시가 반짝인다.
import * as THREE from 'three';
import type { Walkers } from '../sim/walkers.ts';
import { env, material, pal } from './env.ts';
import { instanced, merge, part } from './util.ts';

// 부품: 0 몸통, 1 머리, 2·3 발, 4 휴대폰, 5 발밑 그늘. 앞은 +x. 머리와 몸통이 거의 같은 높이인 2등신이다
function figure(): THREE.BufferGeometry {
  return merge([
    part(new THREE.CapsuleGeometry(0.3, 0.26, 3, 8).translate(0, 0.49, 0), 0),
    part(new THREE.SphereGeometry(0.4, 10, 7).translate(0.02, 1.14, 0), 1),
    part(new THREE.SphereGeometry(0.12, 5, 3).scale(1.4, 0.7, 1).translate(0.05, 0.07, 0.14), 2),
    part(new THREE.SphereGeometry(0.12, 5, 3).scale(1.4, 0.7, 1).translate(0.05, 0.07, -0.14), 3),
    part(new THREE.BoxGeometry(0.05, 0.24, 0.14).translate(0.48, 1.02, 0.06), 4),
    part(new THREE.CircleGeometry(0.42, 8).rotateX(-Math.PI / 2).translate(0, 0.03, 0), 5),
  ]);
}

const SCALE = 'zoomScale(-cv.z, 1.6, 8.0, 1.6, 6.5)';

export function makeWalkerMesh(max: number) {
  const { geo, arr, attr } = instanced(figure(), max, { aInst: 4, aMore: 3 });
  const mesh = new THREE.Mesh(
    geo,
    material({
      uniforms: { uFigure: { value: pal.figure }, uLand: { value: pal.land } },
      vertex: /* glsl */ `
        attribute vec4 aInst;      // x, z, 방향, 걸음 위상
        attribute vec3 aMore;      // 나타남, 색 값, 휴대폰 든 정도
        attribute float aPart;
        varying vec3 vN; varying float vPart; varying float vTint; varying float vDist; varying float vH; varying float vFlash;
        vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
        void main() {
          vec3 p = position;
          float photo = aMore.z;
          float move = 1.0 - photo;                          // 사진 찍는 동안은 서 있다
          float sw = sin(aInst.w) * move;
          if (aPart > 1.5 && aPart < 3.5) {                 // 발: 번갈아 앞뒤로, 앞으로 갈 때 살짝 든다
            float side = aPart < 2.5 ? 1.0 : -1.0;
            p.x += side * sw * 0.16;
            p.y += max(0.0, side * sw) * 0.07;
          }
          if (aPart > 3.5 && aPart < 4.5) p *= photo;       // 휴대폰은 사진 찍을 때만
          if (aPart < 4.5) {                                // 몸 전체: 좌우로 뒤뚱, 위아래로 통통
            p.yz = rot(p.yz, sw * 0.12);
            p.y += abs(cos(aInst.w)) * 0.06 * move;
            if (aPart > 0.5 && aPart < 1.5) p.xy = rot(p.xy - vec2(0.0, 0.8), photo * -0.12) + vec2(0.0, 0.8); // 화면을 내려다본다
          }
          vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          float s = ${SCALE} * aMore.x;
          p *= s;
          float cs = cos(aInst.z), sn = sin(aInst.z);
          vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y + 0.05, aInst.y + p.x * sn + p.z * cs);
          vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
          vPart = aPart; vTint = aMore.y; vH = position.y;
          // 휴대폰 화면이 가끔 번쩍인다(사진 찍는 순간)
          vFlash = photo * step(0.9, fract(uTime * 0.55 + aMore.y * 13.0));
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform vec3 uFigure, uLand;
        varying vec3 vN; varying float vPart; varying float vTint; varying float vDist; varying float vH; varying float vFlash;
        vec3 pastel(float t) {
          if (t < 0.70) return vec3(1.0);
          if (t < 0.76) return vec3(1.0, 0.80, 0.84);
          if (t < 0.82) return vec3(0.78, 0.93, 0.86);
          if (t < 0.88) return vec3(0.78, 0.88, 1.0);
          if (t < 0.94) return vec3(1.0, 0.93, 0.72);
          return vec3(0.88, 0.82, 0.98);
        }
        void main() {
          if (vPart > 4.5) {                                 // 발밑 그늘
            gl_FragColor = vec4(fogged(lit(uLand * 0.66, vec3(0.0, 1.0, 0.0)), vDist), 1.0);
            return;
          }
          vec3 n = normalize(vN);
          if (vPart > 3.5) {                                 // 휴대폰
            gl_FragColor = vec4(mix(vec3(0.12, 0.13, 0.16), vec3(1.0), vFlash), 1.0);
            return;
          }
          vec3 alb = uFigure * pastel(vTint) * mix(0.84, 1.0, smoothstep(0.0, 0.9, vH));
          vec3 col = lit(alb, n) * 1.06 + alb * (0.10 + 0.50 * uNight);
          gl_FragColor = vec4(fogged(col, vDist), 1.0);
        }`,
    }),
  );
  mesh.frustumCulled = false;

  // 사진 찍는 순간의 플래시 빛: 화면을 향한 작은 판을 더해 그린다
  const FLASH_MAX = 64;
  const fl = instanced(new THREE.PlaneGeometry(1, 1), FLASH_MAX, { aInst: 4 });
  const flash = new THREE.Mesh(
    fl.geo,
    material({
      transparent: true,
      additive: true,
      depthWrite: false,
      vertex: /* glsl */ `
        attribute vec4 aInst;   // x, y, z, 씨앗
        varying vec2 vP; varying float vOn;
        void main() {
          vec4 c = viewMatrix * vec4(aInst.xyz, 1.0);
          float size = max(1.4, -c.z * 0.018);
          c.xy += position.xy * size;
          vP = position.xy * 2.0;
          vOn = step(0.9, fract(uTime * 0.55 + aInst.w * 13.0));
          gl_Position = projectionMatrix * c;
        }`,
      fragment: /* glsl */ `
        varying vec2 vP; varying float vOn;
        void main() {
          float r = length(vP);
          float a = max(0.0, 1.0 - r) * vOn;
          float star = max(0.0, 1.0 - abs(vP.x) * 9.0) * max(0.0, 1.0 - abs(vP.y)) + max(0.0, 1.0 - abs(vP.y) * 9.0) * max(0.0, 1.0 - abs(vP.x));
          gl_FragColor = vec4(vec3(1.0, 0.98, 0.9) * (a * a * 1.4 + star * vOn * 0.8), 1.0);
        }`,
    }),
  );
  flash.frustumCulled = false;
  flash.renderOrder = 5;

  const tmpS = new THREE.Vector3();
  function update(w: Walkers, cam: THREE.Camera) {
    let f = 0;
    for (let i = 0; i < w.n; i++) {
      const j = i * 4;
      arr.aInst[j] = w.x[i];
      arr.aInst[j + 1] = w.z[i];
      arr.aInst[j + 2] = w.yaw[i];
      arr.aInst[j + 3] = w.phase[i];
      arr.aMore[i * 3] = w.fade[i];
      arr.aMore[i * 3 + 1] = w.tint[i];
      arr.aMore[i * 3 + 2] = w.photo[i];
      if (w.photo[i] > 0.9 && f < FLASH_MAX) {
        // 휴대폰이 있는 자리: 몸 앞 0.48m, 높이 1.02m 에 과장 배율을 곱한다
        tmpS.set(w.x[i], 0, w.z[i]).applyMatrix4(cam.matrixWorldInverse);
        const k = Math.min(6.5, Math.max(1.6, (8 * -tmpS.z) / (env.uProjK.value * 1.6))) * w.fade[i];
        fl.arr.aInst.set([w.x[i] + Math.cos(w.yaw[i]) * 0.55 * k, 1.05 * k, w.z[i] + Math.sin(w.yaw[i]) * 0.55 * k, w.tint[i]], f * 4);
        f++;
      }
    }
    geo.instanceCount = w.n;
    attr.aInst.needsUpdate = true;
    attr.aMore.needsUpdate = true;
    fl.geo.instanceCount = f;
    fl.attr.aInst.needsUpdate = true;
  }
  return { mesh, flash, update };
}
