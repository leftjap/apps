// 길고양이와 급식소 소품. 걷기·식빵 자세·앉기·밥 먹기·장난치기·그루밍은 버텍스 셰이더에서 자세 비중을 섞어 만들고,
// 털 무늬는 프래그먼트 셰이더에서 만든다. 숨을 때는 화면 점을 성기게 버려 흐려진다.
import * as THREE from 'three';
import type { CatDef, CatState, Coat } from '../sim/cats.ts';
import { material, pal } from './env.ts';
import { sizeGlsl } from './size.ts';
import { instanced, merge, part } from './util.ts';

const COAT_ID: Record<Coat, number> = { cheese: 0, calico: 1, mackerel: 2, tuxedo: 3 };

// 부품: 0 몸통, 1 머리(주둥이 포함), 2 귀, 3 꼬리, 4~7 다리(앞왼·앞오·뒤왼·뒤오), 8 발밑 그늘, 9 목. 앞은 +x.
// 실제 길고양이 크기로 만든다: 코에서 엉덩이까지 약 45cm, 어깨 높이 약 25cm.
// 머리는 둥글고 귀는 크며, 다리와 꼬리는 가늘다. 꼬리는 물음표처럼 끝이 앞으로 살짝 굽는다
function cat(): THREE.BufferGeometry {
  const leg = (x: number, z: number, r: number, id: number) => part(new THREE.CapsuleGeometry(r, 0.13, 2, 5).translate(x, 0.08, z), id);
  const ear = (side: number) => part(new THREE.ConeGeometry(0.024, 0.062, 4).scale(0.5, 1, 1).rotateX(side * 0.3).translate(0.198, 0.315, side * 0.03), 2);
  const tail = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.155, 0.2, 0),
      new THREE.Vector3(-0.205, 0.225, 0),
      new THREE.Vector3(-0.245, 0.29, 0),
      new THREE.Vector3(-0.255, 0.37, 0),
      new THREE.Vector3(-0.235, 0.43, 0),
    ]),
    10,
    0.0115,
    5,
  );
  return merge([
    part(new THREE.SphereGeometry(1, 14, 10).scale(0.17, 0.068, 0.058).translate(0, 0.18, 0), 0),
    part(new THREE.CapsuleGeometry(0.045, 0.08, 2, 6).rotateZ(-0.96).translate(0.15, 0.225, 0), 9),
    part(new THREE.SphereGeometry(0.052, 12, 9).scale(1, 0.92, 1.1).translate(0.205, 0.268, 0), 1),
    part(new THREE.SphereGeometry(0.024, 8, 6).scale(0.9, 0.75, 1.25).translate(0.248, 0.252, 0), 1),
    ear(1),
    ear(-1),
    part(tail, 3),
    leg(0.115, 0.032, 0.0145, 4),
    leg(0.115, -0.032, 0.0145, 5),
    leg(-0.11, 0.032, 0.017, 6),
    leg(-0.11, -0.032, 0.017, 7),
    part(new THREE.CircleGeometry(0.12, 12).rotateX(-Math.PI / 2).scale(1.75, 1, 1).translate(0, 0.01, 0), 8),
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

/** 고양이·급식소가 함께 쓰는 배율: 사람·차와 같은 크기 기준이라 사람과의 크기 비율이 늘 실제와 같다 */
const SCALE = sizeGlsl('mover');

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
        varying vec3 vN; varying vec3 vO; varying float vPart; varying float vCoat; varying float vDist; varying float vPicked; varying float vAlpha; varying float vSeed;
        vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
        void main() {
          int id = int(aPart + 0.5);
          float walk = aInst.w;
          float loaf = aPose.x, sit = aPose.y, eat = aPose.z, play = aPose.w;
          float seed = aMore.y * 40.0;
          vec3 p = position;
          vec3 n = normal;
          vO = position;
          float ph = uTime * 7.0 + seed;
          if (id >= 4 && id <= 7) {                          // 다리: 몸 속 윗끝을 축으로 대각선 짝끼리 앞뒤로
            float diag = (id == 4 || id == 7) ? 1.0 : -1.0;
            p.y -= 0.155; p.xy = rot(p.xy, diag * sin(ph) * 0.5 * walk); p.y += 0.155;
            if (id <= 5) {                                   // 앞다리: 놀 때 번갈아 앞발을 들고, 앉으면 들린 가슴을 받치려 길어진다
              float paw = play * max(0.0, sin(uTime * 6.0 + seed + (id == 4 ? 0.0 : 3.1)));
              p.y -= 0.155; p.xy = rot(p.xy, paw * 1.3); p.y += 0.155;
              p.y *= 1.0 + 0.48 * sit;
              p.x -= 0.114 * sit;
            } else {                                         // 뒷다리: 앉으면 접어 발을 앞으로 내놓고 엉덩이 옆에 붙인다
              p.y -= 0.155; p.xy = rot(p.xy, 1.4 * sit); p.y += 0.155 - 0.11 * sit;
            }
            p.y *= 1.0 - loaf;                               // 식빵 자세에서는 몸 밑으로 숨긴다
          } else if (id == 3) {                              // 꼬리: 걸을 때 세우고 살랑, 쉬거나 앉으면 몸 옆 바닥으로 감는다
            p.z += sin(uTime * 2.3 + seed) * 0.3 * max(p.y - 0.2, 0.0);
            vec3 r = p - vec3(-0.155, 0.2, 0.0), m = n;
            r.xy = rot(r.xy, 1.45); m.xy = rot(m.xy, 1.45);
            r.xz = rot(r.xz, -1.99); m.xz = rot(m.xz, -1.99);
            float k = max(loaf, sit * 0.9);
            p = mix(p, vec3(-0.16, 0.035, 0.0) + r, k);
            n = mix(n, m, k);
          } else if (id <= 2 || id == 9) {                   // 몸통·머리·귀·목
            // 머리의 움직임: 목은 머리에 가까운 쪽일수록 따라간다
            float hw = id == 0 ? 0.0 : id == 9 ? smoothstep(0.1, 0.2, position.x) : 1.0;
            p.x -= loaf * 0.02 * hw;
            p.y -= eat * (0.1 + 0.008 * sin(uTime * 8.0 + seed)) * hw;   // 밥그릇에 고개를 숙인다
            p.x += eat * 0.03 * hw;
            vec2 hz = rot(vec2(p.x - 0.13, p.z), aMore.w * sin(uTime * 1.3 + seed) * 0.7 * hw);   // 그루밍: 고개를 돌린다
            p.x = hz.x + 0.13; p.z = hz.y;
            // 앉기: 엉덩이 아래를 축으로 앞을 들어 올리고 엉덩이를 바닥에 붙인다. 머리는 도로 숙여 앞을 본다
            float pitch = sit * 0.85 + play * 0.2;
            p.xy = rot(p.xy - vec2(0.205, 0.268), -pitch * 0.85 * hw) + vec2(0.205, 0.268);
            n.xy = rot(n.xy, -pitch * 0.85 * hw);
            p.xy = rot(p.xy - vec2(-0.12, 0.11), pitch) + vec2(-0.12, 0.11);
            n.xy = rot(n.xy, pitch);
            p.y -= loaf * 0.09 + sit * (0.08 + 0.04 * hw);
            p.x += sit * 0.03 * hw;
            if (id == 0) p.y *= 1.0 + loaf * sin(uTime * 1.6 + seed) * 0.03;   // 식빵 자세로 숨쉬기
          }
          p.y += play * abs(sin(uTime * 3.0 + seed)) * 0.05;   // 놀 때는 통통 뛴다
          vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          float picked = step(abs(float(gl_InstanceID) - uPick), 0.5);
          float s = ${SCALE} * (1.0 + 0.25 * picked);
          p *= s;
          float cs = cos(aInst.z), sn = sin(aInst.z);
          vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y + 0.06, aInst.y + p.x * sn + p.z * cs);
          vN = vec3(n.x * cs - n.z * sn, n.y, n.x * sn + n.z * cs);
          vPart = aPart; vCoat = aMore.x; vPicked = picked; vAlpha = aMore.z; vSeed = aMore.y;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform vec3 uLand;
        varying vec3 vN; varying vec3 vO; varying float vPart; varying float vCoat; varying float vDist; varying float vPicked; varying float vAlpha; varying float vSeed;
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          if (hash21(gl_FragCoord.xy) > vAlpha) discard;      // 숨을 때 점점 성기게 그려 흐려진다
          int id = int(vPart + 0.5);
          if (id == 8) {
            gl_FragColor = vec4(fogged(lit(uLand * 0.66, vec3(0.0, 1.0, 0.0)), vDist), 1.0);
            return;
          }
          bool body = id == 0 || id == 9;
          bool leg = id >= 4 && id <= 7;
          // 줄무늬: 몸·머리는 등에서 옆구리로 곧게 내려오는 세로 줄, 다리·꼬리는 가로 고리. 3.5cm 간격의 가는 줄이고,
          // 화면에서 한 픽셀보다 촘촘해지면 평균 색으로 바꿔 깜박이지 않게 한다
          float q = ((leg || id == 3) ? vO.y : vO.x + 0.08 * vO.y + 0.005 * sin(vO.z * 90.0 + vO.y * 40.0)) * 180.0 + vSeed * 6.0;
          float stripe = mix(smoothstep(0.72, 0.96, 0.5 + 0.5 * sin(q)), 0.13, smoothstep(0.8, 2.0, fwidth(q)));
          stripe *= id == 3 ? 1.0 : leg ? 0.6 * smoothstep(0.02, 0.05, vO.y) : id == 1 ? smoothstep(0.268, 0.29, vO.y) : body ? smoothstep(0.15, 0.2, vO.y) : 0.0;
          stripe = max(stripe, body ? 0.5 * smoothstep(0.232, 0.246, vO.y) : 0.0);   // 등줄기는 조금 진하다
          // 밝은 부분: 배, 가슴, 주둥이와 턱
          float light = body ? max(1.0 - smoothstep(0.125, 0.155, vO.y), step(0.09, vO.x) * (1.0 - smoothstep(0.17, 0.2, vO.y)))
                      : id == 1 ? step(0.232, vO.x) * (1.0 - step(0.264, vO.y)) : 0.0;
          vec3 white = vec3(0.97, 0.96, 0.93);
          vec3 alb;
          if (vCoat < 0.5) {                                  // 치즈: 연한 주황 바탕에 조금 진한 가는 줄, 배·주둥이는 크림색
            alb = mix(vec3(0.94, 0.68, 0.40), vec3(0.85, 0.55, 0.29), stripe);
            alb = mix(alb, vec3(0.99, 0.92, 0.79), light * 0.9);
          } else if (vCoat < 1.5) {                           // 삼색: 흰 바탕에 등·머리·꼬리만 둥근 주황·검정 얼룩
            vec2 u = vec2(vO.x, vO.y * 0.7 + vO.z) * 16.0 + vSeed * 31.0;
            float top = leg ? 0.0 : body ? smoothstep(0.16, 0.2, vO.y) : 1.0 - light;
            float o = smoothstep(0.56, 0.6, vnoise(u)) * top;
            float b = smoothstep(0.6, 0.64, vnoise(u * 1.15 + 17.0)) * top;
            alb = mix(mix(white, vec3(0.93, 0.6, 0.28), o), vec3(0.17, 0.15, 0.14), b * (1.0 - 0.5 * o));
          } else if (vCoat < 2.5) {                           // 고등어: 회갈색 바탕에 짙은 가는 줄, 배는 밝다
            alb = mix(vec3(0.62, 0.6, 0.55), vec3(0.38, 0.37, 0.34), stripe);
            alb = mix(alb, vec3(0.87, 0.85, 0.8), light * 0.8);
          } else {                                            // 턱시도: 검정에 가슴·배·발·주둥이만 흰색
            float paws = leg ? 1.0 - step(0.035, vO.y) : 0.0;
            alb = mix(vec3(0.12, 0.12, 0.14), white, clamp(light + paws, 0.0, 1.0));
          }
          if (id == 2) alb = mix(alb, vec3(0.95, 0.68, 0.68), 0.25);   // 귀 속은 분홍빛
          vec3 col = lit(alb, normalize(vN)) * 1.05 + alb * (0.08 + 0.1 * uNight) + vec3(1.0, 0.9, 0.6) * vPicked * 0.22;
          // 눈: 낮에는 작고 어둡고, 밤에는 빛난다
          vec2 e = vec2(vO.y - 0.277, abs(vO.z) - 0.023);
          float er = 0.0095 + 0.003 * uNight;
          if (id == 1 && vO.x > 0.235 && dot(e, e) < er * er) col = mix(vec3(0.16, 0.17, 0.08), vec3(0.75, 1.0, 0.45) * 1.5, uNight);
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
