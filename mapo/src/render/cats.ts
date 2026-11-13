// 길고양이와 급식소 소품. 걷기·식빵 자세·앉기·밥 먹기·장난치기·그루밍은 버텍스 셰이더에서 자세 비중을 섞어 만들고,
// 털 무늬는 프래그먼트 셰이더에서 만든다. 숨을 때는 화면 점을 성기게 버려 흐려진다.
import * as THREE from 'three';
import type { CatDef, CatState, Coat } from '../sim/cats.ts';
import { material, pal } from './env.ts';
import { instanced, merge, part } from './util.ts';

const COAT_ID: Record<Coat, number> = { cheese: 0, calico: 1, mackerel: 2, tuxedo: 3 };

// 부품: 0 몸통, 1 머리, 2 귀, 3 꼬리, 4~7 다리(앞왼·앞오·뒤왼·뒤오), 8 발밑 그늘. 앞은 +x, 몸길이 약 0.5m.
// 몸통과 머리는 매끈한 곡면이고 살짝 통통하게, 다리는 짧고 굵게 만든다
function cat(): THREE.BufferGeometry {
  const leg = (x: number, z: number, id: number) => part(new THREE.CapsuleGeometry(0.038, 0.12, 2, 6).translate(x, 0.1, z), id);
  const tail = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([new THREE.Vector3(-0.22, 0.3, 0), new THREE.Vector3(-0.31, 0.38, 0), new THREE.Vector3(-0.34, 0.5, 0), new THREE.Vector3(-0.29, 0.6, 0)]),
    10,
    0.03,
    6,
  );
  return merge([
    part(new THREE.SphereGeometry(1, 18, 12).scale(0.25, 0.155, 0.15).translate(0, 0.27, 0), 0),
    part(new THREE.SphereGeometry(0.125, 16, 12).scale(1, 0.92, 1.1).translate(0.25, 0.38, 0), 1),
    part(new THREE.ConeGeometry(0.045, 0.1, 6).translate(0.24, 0.5, 0.065), 2),
    part(new THREE.ConeGeometry(0.045, 0.1, 6).translate(0.24, 0.5, -0.065), 2),
    part(tail, 3),
    leg(0.14, 0.075, 4),
    leg(0.14, -0.075, 5),
    leg(-0.15, 0.075, 6),
    leg(-0.15, -0.075, 7),
    part(new THREE.CircleGeometry(0.3, 12).rotateX(-Math.PI / 2).translate(0, 0.01, 0), 8),
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
  const { geo, arr, attr } = instanced(cat(), cats.length, { aInst: 4, aPose: 4, aMore: 4 });
  geo.instanceCount = cats.length;
  const mesh = new THREE.Mesh(
    geo,
    material({
      uniforms: { uLand: { value: pal.land }, uPick: { value: -1 } },
      vertex: /* glsl */ `
        attribute vec4 aInst;      // x, z, 방향, 걷기
        attribute vec4 aPose;      // 식빵 자세, 앉기, 밥 먹기, 장난치기
        attribute vec4 aMore;      // 털 무늬, 씨앗, 보이는 정도, 그루밍
        attribute float aPart;
        uniform float uPick;
        varying vec3 vN; varying vec3 vO; varying float vPart; varying float vCoat; varying float vDist; varying float vPicked; varying float vAlpha;
        vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
        void main() {
          float walk = aInst.w;
          float loaf = aPose.x, sit = aPose.y, eat = aPose.z, play = aPose.w;
          float seed = aMore.y * 40.0;
          vec3 p = position;
          vec3 n = normal;
          vO = position;
          float ph = uTime * 7.0 + seed;
          if (aPart > 3.5 && aPart < 7.5) {                  // 다리
            float diag = (aPart < 4.5 || aPart > 6.5) ? 1.0 : -1.0;
            p.y -= 0.2; p.xy = rot(p.xy, diag * sin(ph) * 0.55 * walk); p.y += 0.2;
            if (aPart < 5.5) {                                 // 앞다리: 놀 때 번갈아 앞발을 들고, 앉으면 몸을 받치려 길어진다
              float paw = play * max(0.0, sin(uTime * 6.0 + seed + (aPart < 4.5 ? 0.0 : 3.1)));
              p.y -= 0.2; p.xy = rot(p.xy, paw * 1.3); p.y += 0.2;
              p.y = 0.2 - (0.2 - p.y) * (1.0 + 0.75 * sit);
              p.y += 0.15 * sit;
              p.x -= 0.09 * sit;
            } else p.y *= 1.0 - 0.75 * sit;                    // 뒷다리: 앉으면 접는다
            p.y *= 1.0 - loaf;                                 // 식빵 자세에서는 몸 밑으로 숨긴다
          } else if (aPart > 2.5 && aPart < 3.5) {           // 꼬리: 걸을 때 세우고 살랑, 쉬거나 앉으면 몸 옆으로 감는다
            p.z += sin(uTime * 2.3 + seed) * 0.06 * (p.y - 0.28) * 3.0;
            vec3 tucked = vec3(-0.2 + (p.y - 0.3) * 0.25, 0.04, 0.13 + (p.y - 0.3) * 0.35);
            p = mix(p, tucked, max(loaf, sit * 0.85));
          } else if (aPart < 2.5) {                          // 몸통·머리·귀
            p.y -= loaf * 0.13;
            p.y *= 1.0 + loaf * sin(uTime * 1.6 + seed) * 0.03 * step(aPart, 0.5);
            if (aPart > 0.5) {
              p.x -= loaf * 0.03;
              p.y -= eat * (0.16 + 0.015 * sin(uTime * 8.0 + seed));   // 밥그릇에 고개를 숙인다
              p.x += eat * 0.05;
              vec2 hz = rot(vec2(p.x - 0.18, p.z), aMore.w * sin(uTime * 1.3 + seed) * 0.7);   // 그루밍: 고개를 돌린다
              p.x = hz.x + 0.18; p.z = hz.y;
            }
            // 앉기: 뒤쪽 엉덩이를 축으로 앞을 들어 올린다
            float pitch = sit * 0.55 + play * 0.25;
            p.xy = rot(p.xy - vec2(-0.18, 0.12), pitch) + vec2(-0.18, 0.12);
            n.xy = rot(n.xy, pitch);
          }
          p.y += play * abs(sin(uTime * 3.0 + seed)) * 0.12;   // 놀 때는 통통 뛴다
          vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          float picked = step(abs(float(gl_InstanceID) - uPick), 0.5);
          float s = ${SCALE} * (1.0 + 0.25 * picked);
          p *= s;
          float cs = cos(aInst.z), sn = sin(aInst.z);
          vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y + 0.06, aInst.y + p.x * sn + p.z * cs);
          vN = vec3(n.x * cs - n.z * sn, n.y, n.x * sn + n.z * cs);
          vPart = aPart; vCoat = aMore.x; vPicked = picked; vAlpha = aMore.z;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform vec3 uLand;
        varying vec3 vN; varying vec3 vO; varying float vPart; varying float vCoat; varying float vDist; varying float vPicked; varying float vAlpha;
        void main() {
          if (hash21(gl_FragCoord.xy) > vAlpha) discard;      // 숨을 때 점점 성기게 그려 흐려진다
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
            float muzzle = step(0.5, vPart) * step(vPart, 1.5) * step(0.3, vO.x) * (1.0 - step(0.37, vO.y));
            alb = mix(vec3(0.13, 0.13, 0.15), vec3(0.98, 0.97, 0.95), clamp(chest + paws + muzzle, 0.0, 1.0));
          }
          alb = mix(alb, vec3(0.95, 0.68, 0.68), step(1.5, vPart) * step(vPart, 2.5) * 0.25);
          vec3 col = lit(alb, normalize(vN)) * 1.05 + alb * (0.08 + 0.34 * uNight) + vec3(1.0, 0.9, 0.6) * vPicked * 0.22;
          // 밤에는 눈이 빛난다
          float eye = step(0.5, vPart) * step(vPart, 1.5) * step(0.335, vO.x) * step(0.03, abs(vO.z)) * step(abs(vO.z), 0.075) * step(0.37, vO.y) * step(vO.y, 0.41);
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
  const POSE_W: [number, number, number, number][] = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
    [0, 1, 0, 0],
  ];
  // 자세는 바로 바꾸지 않고 0.4초쯤에 걸쳐 옮겨 간다
  const pose = new Float32Array(cats.length * 4);
  cats.forEach((_, i) => pose.set(POSE_W[0], i * 4));
  return {
    group,
    update(states: CatState[], dt: number) {
      const k = Math.min(1, dt * 4);
      states.forEach((s, i) => {
        const want = POSE_W[s.pose];
        for (let c = 0; c < 4; c++) pose[i * 4 + c] += ((s.walk > 0.5 ? 0 : want[c]) - pose[i * 4 + c]) * k;
        arr.aInst.set([s.x, s.z, s.yaw, s.walk], i * 4);
        arr.aPose.set(pose.subarray(i * 4, i * 4 + 4), i * 4);
        arr.aMore.set([COAT_ID[cats[i].coat], (i * 0.618) % 1, s.alpha, s.pose === 4 ? 1 : 0], i * 4);
      });
      attr.aInst.needsUpdate = true;
      attr.aPose.needsUpdate = true;
      attr.aMore.needsUpdate = true;
    },
    setPicked(i: number) {
      picked.value = i;
    },
  };
}
