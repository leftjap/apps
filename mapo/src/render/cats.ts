// 길고양이와 급식소 소품. 식빵 자세와 걷는 자세는 pose 값(0~1)으로 버텍스 셰이더에서 바꾸고, 털 무늬는 프래그먼트 셰이더에서 만든다.
import * as THREE from 'three';
import type { CatDef, CatState, Coat } from '../sim/cats.ts';
import { material, pal } from './env.ts';
import { instanced, merge, part } from './util.ts';

const COAT_ID: Record<Coat, number> = { cheese: 0, calico: 1, mackerel: 2, tuxedo: 3 };

// 부품: 0 몸통, 1 머리, 2 귀, 3 꼬리, 4~7 다리(앞왼·앞오·뒤왼·뒤오), 8 발밑 그늘. 앞은 +x, 몸길이 약 0.5m
function cat(): THREE.BufferGeometry {
  const leg = (x: number, z: number, id: number) => part(new THREE.CylinderGeometry(0.03, 0.028, 0.2, 5).translate(x, 0.1, z), id);
  return merge([
    part(new THREE.SphereGeometry(1, 10, 8).scale(0.24, 0.125, 0.12).translate(0, 0.27, 0), 0),
    part(new THREE.SphereGeometry(0.105, 9, 7).translate(0.25, 0.36, 0), 1),
    part(new THREE.ConeGeometry(0.042, 0.1, 4).translate(0.25, 0.48, 0.062), 2),
    part(new THREE.ConeGeometry(0.042, 0.1, 4).translate(0.25, 0.48, -0.062), 2),
    part(new THREE.CylinderGeometry(0.02, 0.03, 0.36, 5).translate(0, 0.18, 0).rotateZ(0.55).translate(-0.24, 0.3, 0), 3),
    leg(0.14, 0.07, 4),
    leg(0.14, -0.07, 5),
    leg(-0.15, 0.07, 6),
    leg(-0.15, -0.07, 7),
    part(new THREE.CircleGeometry(0.3, 10).rotateX(-Math.PI / 2).translate(0, 0.01, 0), 8),
  ]);
}

// 급식소: 작은 나무 집과 밥그릇. 부품 0 벽, 1 지붕, 2 그릇
function feeder(): THREE.BufferGeometry {
  return merge([
    part(new THREE.BoxGeometry(0.7, 0.42, 0.55).translate(0, 0.21, 0), 0),
    part(new THREE.ConeGeometry(0.62, 0.3, 4).rotateY(Math.PI / 4).translate(0, 0.57, 0), 1),
    part(new THREE.CylinderGeometry(0.15, 0.11, 0.07, 8).translate(0.62, 0.035, 0.1), 2),
  ]);
}

/** 고양이·급식소가 함께 쓰는 과장 배율 */
const SCALE = 'zoomScale(-cv.z, 0.5, 15.0, 4.0, 15.0)';

export function makeCatMeshes(cats: CatDef[], feederSpots: [number, number][]) {
  const group = new THREE.Group();
  const { geo, arr, attr } = instanced(cat(), cats.length, { aInst: 4, aMore: 2 });
  cats.forEach((c, i) => arr.aMore.set([COAT_ID[c.coat], (i * 0.618) % 1], i * 2));
  geo.instanceCount = cats.length;
  attr.aMore.needsUpdate = true;
  const mesh = new THREE.Mesh(
    geo,
    material({
      uniforms: { uLand: { value: pal.land }, uPick: { value: -1 } },
      vertex: /* glsl */ `
        attribute vec4 aInst;      // x, z, 방향, pose
        attribute vec2 aMore;      // 털 무늬, 씨앗
        attribute float aPart;
        uniform float uPick;
        varying vec3 vN; varying vec3 vO; varying float vPart; varying float vCoat; varying float vDist; varying float vPicked;
        vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
        void main() {
          float pose = aInst.w;
          float seed = aMore.y * 40.0;
          vec3 p = position;
          vO = position;
          float ph = uTime * 7.0 + seed;
          if (aPart > 3.5 && aPart < 7.5) {                  // 다리: 대각선끼리 같이 움직이고, 식빵 자세에서는 몸 밑으로 접는다
            float diag = (aPart < 4.5 || aPart > 6.5) ? 1.0 : -1.0;
            p.y -= 0.2; p.xy = rot(p.xy, diag * sin(ph) * 0.55 * pose); p.y += 0.2;
            p.y *= pose;
          } else if (aPart > 2.5 && aPart < 3.5) {           // 꼬리: 걸을 때 세우고 살랑, 식빵 자세에서는 몸 옆으로 감는다
            p.z += sin(uTime * 2.3 + seed) * 0.05 * (p.y - 0.25) * 4.0;
            vec3 tucked = vec3(-0.16 + (p.y - 0.25) * 0.1, 0.05, 0.11 + (p.x + 0.24) * 0.2);
            p = mix(tucked, p, pose);
          } else if (aPart < 2.5) {                          // 몸통·머리·귀: 식빵 자세에서는 낮추고 숨 쉬듯 부푼다
            p.y -= (1.0 - pose) * 0.14;
            p.y += pose * abs(sin(ph)) * 0.012;
            p.y *= 1.0 + (1.0 - pose) * sin(uTime * 1.6 + seed) * 0.03 * step(aPart, 0.5);
            if (aPart > 0.5) p.x -= (1.0 - pose) * 0.03;
          }
          vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          float picked = step(abs(float(gl_InstanceID) - uPick), 0.5);
          float s = ${SCALE} * (1.0 + 0.25 * picked);
          p *= s;
          float cs = cos(aInst.z), sn = sin(aInst.z);
          vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y + 0.06, aInst.y + p.x * sn + p.z * cs);
          vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
          vPart = aPart; vCoat = aMore.x; vPicked = picked;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform vec3 uLand;
        varying vec3 vN; varying vec3 vO; varying float vPart; varying float vCoat; varying float vDist; varying float vPicked;
        void main() {
          if (vPart > 7.5) {
            gl_FragColor = vec4(fogged(lit(uLand * 0.66, vec3(0.0, 1.0, 0.0)), vDist), 1.0);
            return;
          }
          float stripe = smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(vO.x * 62.0 + vO.y * 18.0));
          float belly = 1.0 - smoothstep(0.17, 0.25, vO.y);
          vec3 alb;
          if (vCoat < 0.5) {                                  // 치즈: 주황 줄무늬, 배는 크림색
            alb = mix(vec3(0.95, 0.63, 0.27), vec3(0.83, 0.47, 0.16), stripe);
            alb = mix(alb, vec3(0.99, 0.91, 0.76), belly * 0.85);
          } else if (vCoat < 1.5) {                           // 삼색: 흰 바탕에 주황·검정 얼룩
            float k = hash21(floor(vec2(vO.x * 9.0 + 3.0, (vO.z + vO.y) * 11.0 + 5.0)));
            alb = k < 0.3 ? vec3(0.93, 0.56, 0.20) : k < 0.52 ? vec3(0.17, 0.15, 0.15) : vec3(0.98, 0.97, 0.94);
            alb = mix(alb, vec3(0.98, 0.97, 0.94), belly);
          } else if (vCoat < 2.5) {                           // 고등어: 회색 줄무늬
            alb = mix(vec3(0.62, 0.62, 0.61), vec3(0.28, 0.29, 0.30), stripe);
            alb = mix(alb, vec3(0.86, 0.85, 0.82), belly * 0.7);
          } else {                                            // 턱시도: 검정에 가슴·발·주둥이만 흰색
            float chest = step(0.1, vO.x) * (1.0 - smoothstep(0.24, 0.3, vO.y)) * step(vPart, 0.5);
            float paws = step(3.5, vPart) * (1.0 - step(0.07, vO.y));
            float muzzle = step(0.5, vPart) * step(vPart, 1.5) * step(0.29, vO.x) * (1.0 - step(0.36, vO.y));
            alb = mix(vec3(0.13, 0.13, 0.15), vec3(0.98, 0.97, 0.95), clamp(chest + paws + muzzle, 0.0, 1.0));
          }
          alb = mix(alb, vec3(0.95, 0.68, 0.68), step(1.5, vPart) * step(vPart, 2.5) * 0.25);
          vec3 col = lit(alb, normalize(vN)) * 1.05 + alb * (0.08 + 0.34 * uNight) + vec3(1.0, 0.9, 0.6) * vPicked * 0.22;
          // 밤에는 눈이 빛난다
          float eye = step(0.5, vPart) * step(vPart, 1.5) * step(0.325, vO.x) * step(0.028, abs(vO.z)) * step(abs(vO.z), 0.07) * step(0.36, vO.y) * step(vO.y, 0.4);
          col = mix(col, vec3(0.75, 1.0, 0.45) * (0.5 + uNight), eye);
          gl_FragColor = vec4(fogged(col, vDist), 1.0);
        }`,
    }),
  );
  mesh.frustumCulled = false;
  group.add(mesh);

  if (feederSpots.length) {
    const f = instanced(feeder(), feederSpots.length, { aInst: 4 });
    feederSpots.forEach(([x, z], i) => f.arr.aInst.set([x + 1.2, z + 1.2, i * 1.3, 0], i * 4));
    f.geo.instanceCount = feederSpots.length;
    const hut = new THREE.Mesh(
      f.geo,
      material({
        vertex: /* glsl */ `
          attribute vec4 aInst; attribute float aPart;
          varying vec3 vN; varying float vPart; varying float vDist;
          void main() {
            vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
            vec3 p = position * ${SCALE};
            float cs = cos(aInst.z), sn = sin(aInst.z);
            vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y + 0.05, aInst.y + p.x * sn + p.z * cs);
            vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
            vPart = aPart;
            vec4 mv = viewMatrix * vec4(w, 1.0);
            vDist = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragment: /* glsl */ `
          varying vec3 vN; varying float vPart; varying float vDist;
          void main() {
            vec3 alb = vPart < 0.5 ? vec3(0.80, 0.63, 0.44) : vPart < 1.5 ? vec3(0.45, 0.62, 0.52) : vec3(0.55, 0.75, 0.92);
            vec3 col = lit(alb, normalize(vN));
            col = mix(col, col * 0.6, uNight * 0.5) + alb * 0.12 * uNight;
            gl_FragColor = vec4(fogged(col, vDist), 1.0);
          }`,
      }),
    );
    hut.frustumCulled = false;
    group.add(hut);
  }

  const picked = mesh.material.uniforms.uPick;
  return {
    group,
    update(states: CatState[]) {
      states.forEach((s, i) => arr.aInst.set([s.x, s.z, s.yaw, s.pose], i * 4));
      attr.aInst.needsUpdate = true;
    },
    setPicked(i: number) {
      picked.value = i;
    },
  };
}
