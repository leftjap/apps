// 보행자. 머리(피부)·머리카락·상의·하의를 나눈 3등신쯤의 캐릭터를 인스턴싱으로 그리고, 걸음은 버텍스 셰이더에서 만든다.
// 나이대(실시간 도시데이터의 나이대 비율로 정한다)에 따라 모양이 다르다: 아이는 작고 머리가 크며 밝은 옷,
// 10·20대는 선명한 옷, 30~50대는 차분한 옷, 60대 이상은 흰머리에 허리를 조금 굽힌다. 여성 가운데 일부는 긴 머리다.
// 고양이를 구경하며 멈춰 선 사람은 휴대폰을 들고, 가끔 플래시가 반짝인다.
import * as THREE from 'three';
import type { Walkers } from '../sim/walkers.ts';
import { env, material, pal } from './env.ts';
import { instanced, merge, part } from './util.ts';

// 부품: 0 상의, 1 머리, 2·3 다리, 4 휴대폰, 5 발밑 그늘, 6 머리카락, 7 긴 머리. 앞은 +x. 엉덩이 높이 0.52m
function figure(): THREE.BufferGeometry {
  return merge([
    part(new THREE.CapsuleGeometry(0.25, 0.32, 3, 8).translate(0, 0.84, 0), 0),
    part(new THREE.SphereGeometry(0.24, 12, 8).translate(0.02, 1.37, 0), 1),
    part(new THREE.CapsuleGeometry(0.095, 0.36, 2, 6).translate(0, 0.3, 0.11), 2),
    part(new THREE.CapsuleGeometry(0.095, 0.36, 2, 6).translate(0, 0.3, -0.11), 3),
    part(new THREE.BoxGeometry(0.05, 0.22, 0.12).translate(0.36, 1.06, 0.06), 4),
    part(new THREE.CircleGeometry(0.36, 8).rotateX(-Math.PI / 2).translate(0, 0.03, 0), 5),
    part(new THREE.SphereGeometry(0.255, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(-0.02, 1.38, 0), 6),
    part(new THREE.CapsuleGeometry(0.13, 0.22, 2, 8).scale(0.7, 1, 1.45).translate(-0.13, 1.2, 0), 7),
  ]);
}

const SCALE = 'zoomScale(-cv.z, 1.6, 8.0, 1.6, 6.5)';

export function makeWalkerMesh(max: number) {
  const { geo, arr, attr } = instanced(figure(), max, { aInst: 4, aMore: 3, aLook: 2 });
  const mesh = new THREE.Mesh(
    geo,
    material({
      uniforms: { uLand: { value: pal.land } },
      vertex: /* glsl */ `
        attribute vec4 aInst;      // x, z, 방향, 걸음 위상
        attribute vec3 aMore;      // 나타남, 색 값, 휴대폰 든 정도
        attribute vec2 aLook;      // 나이대(0~3), 여성
        attribute float aPart;
        varying vec3 vN; varying float vPart; varying float vTint; varying float vDist; varying float vH; varying float vFlash; varying vec2 vLook;
        vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
        void main() {
          vec3 p = position;
          float age = aLook.x;
          float photo = aMore.z;
          float move = 1.0 - photo;                          // 사진 찍는 동안은 서 있다
          float sw = sin(aInst.w) * move;
          bool upper = aPart < 1.5 || aPart > 3.5;           // 다리 위
          // 긴 머리: 여성의 일부(60대 이상과 아이는 드물게)
          float longHair = aLook.y * step(fract(aMore.y * 3.7), age > 2.5 || age < 0.5 ? 0.2 : 0.7);
          if (aPart > 6.5) p *= longHair;
          if (aPart > 3.5 && aPart < 4.5) p *= photo;       // 휴대폰은 사진 찍을 때만
          // 아이: 머리가 크다
          if (age < 0.5 && (aPart > 0.5 && aPart < 1.5 || aPart > 5.5)) p = (p - vec3(0.0, 1.37, 0.0)) * 1.25 + vec3(0.0, 1.37, 0.0);
          // 다리: 엉덩이를 축으로 번갈아 앞뒤로
          if (aPart > 1.5 && aPart < 3.5) {
            float side = aPart < 2.5 ? 1.0 : -1.0;
            p.xy = rot(p.xy - vec2(0.0, 0.52), side * sw * 0.45) + vec2(0.0, 0.52);
          }
          if (upper && aPart < 4.5 || aPart > 5.5) {
            // 60대 이상은 허리를 조금 굽힌다. 걸을 때 몸이 좌우로 살짝 흔들리고 위아래로 통통
            p.xy = rot(p.xy - vec2(0.0, 0.52), age > 2.5 ? -0.16 : 0.0) + vec2(0.0, 0.52);
            p.yz = rot(p.yz, sw * 0.06);
            p.y += abs(cos(aInst.w)) * 0.04 * move;
            if (aPart > 0.5 && aPart < 1.5 || aPart > 5.5) p.xy = rot(p.xy - vec2(0.0, 1.15), photo * -0.15) + vec2(0.0, 1.15); // 화면을 내려다본다
          }
          vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          float s = ${SCALE} * aMore.x * (age < 0.5 ? 0.66 : 1.0);
          p *= s;
          float cs = cos(aInst.z), sn = sin(aInst.z);
          vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y + 0.05, aInst.y + p.x * sn + p.z * cs);
          vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
          vPart = aPart; vTint = aMore.y; vH = position.y; vLook = aLook;
          // 휴대폰 화면이 가끔 번쩍인다(사진 찍는 순간)
          vFlash = photo * step(0.9, fract(uTime * 0.55 + aMore.y * 13.0));
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform vec3 uLand;
        varying vec3 vN; varying float vPart; varying float vTint; varying float vDist; varying float vH; varying float vFlash; varying vec2 vLook;
        vec3 hex(float r, float g, float b) { return pow(vec3(r, g, b) / 255.0, vec3(2.2)); }
        // 나이대별 상의 색
        vec3 top(float age, float t) {
          if (age < 0.5) return t < 0.25 ? hex(255.,207.,61.) : t < 0.5 ? hex(255.,107.,107.) : t < 0.75 ? hex(95.,184.,255.) : hex(126.,217.,87.);
          if (age < 1.5) return t < 0.17 ? hex(255.,143.,171.) : t < 0.33 ? hex(139.,108.,255.) : t < 0.5 ? hex(46.,196.,182.) : t < 0.67 ? hex(245.,245.,245.) : t < 0.83 ? hex(32.,35.,42.) : hex(255.,159.,67.);
          if (age < 2.5) return t < 0.17 ? hex(31.,42.,68.) : t < 0.33 ? hex(107.,114.,128.) : t < 0.5 ? hex(216.,200.,165.) : t < 0.67 ? hex(34.,38.,46.) : t < 0.83 ? hex(238.,241.,244.) : hex(59.,110.,143.);
          return t < 0.25 ? hex(138.,111.,77.) : t < 0.5 ? hex(107.,112.,92.) : t < 0.75 ? hex(156.,163.,175.) : hex(124.,58.,45.);
        }
        vec3 pants(float age, float t) {
          if (age < 0.5) return t < 0.5 ? hex(43.,58.,103.) : hex(232.,120.,150.);
          if (age > 2.5) return t < 0.5 ? hex(75.,79.,87.) : hex(107.,91.,75.);
          return t < 0.3 ? hex(31.,41.,55.) : t < 0.6 ? hex(43.,58.,103.) : t < 0.8 ? hex(75.,85.,99.) : hex(229.,224.,213.);
        }
        vec3 hair(float age, float t) {
          if (age > 2.5) return mix(hex(190.,190.,190.), hex(240.,240.,240.), t);
          if (age > 0.5 && age < 1.5 && t > 0.8) return hex(164.,112.,58.);   // 물들인 갈색
          return t < 0.6 ? hex(29.,26.,25.) : hex(58.,42.,34.);
        }
        void main() {
          if (vPart > 4.5 && vPart < 5.5) {                  // 발밑 그늘
            gl_FragColor = vec4(fogged(lit(uLand * 0.66, vec3(0.0, 1.0, 0.0)), vDist), 1.0);
            return;
          }
          vec3 n = normalize(vN);
          if (vPart > 3.5 && vPart < 4.5) {                  // 휴대폰
            gl_FragColor = vec4(mix(vec3(0.12, 0.13, 0.16), vec3(1.0), vFlash), 1.0);
            return;
          }
          float age = vLook.x;
          vec3 alb;
          if (vPart < 0.5) alb = top(age, vTint);
          else if (vPart < 1.5) alb = mix(hex(243.,207.,177.), hex(214.,166.,128.), fract(vTint * 13.0));
          else if (vPart < 3.5) alb = pants(age, fract(vTint * 7.0)) * mix(0.55, 1.0, smoothstep(0.08, 0.16, vH));   // 신발은 어둡게
          else alb = hair(age, fract(vTint * 5.3));
          vec3 col = lit(alb, n) * 1.06 + alb * (0.10 + 0.45 * uNight);
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
      arr.aLook[i * 2] = w.age[i];
      arr.aLook[i * 2 + 1] = w.female[i];
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
    attr.aLook.needsUpdate = true;
    fl.geo.instanceCount = f;
    fl.attr.aInst.needsUpdate = true;
  }
  return { mesh, flash, update };
}
