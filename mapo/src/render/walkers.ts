// 보행자. 머리(피부)·머리카락·목·상의(허리 아래는 하의)·팔·다리를 나눈 2.7등신쯤의 귀여운 캐릭터(큰 머리, 둥근 몸통, 짧은 팔다리, 큰 눈과 볼 홍조)를
// 인스턴싱으로 그리고, 걸음은 버텍스 셰이더에서 만든다.
// 걸을 때 팔은 다리와 반대로 흔든다. 어깨는 팔 윗부분이 둥글게 덮고, 손은 팔 끝을 피부색으로 칠한다.
// 나이대(실시간 도시데이터의 나이대 비율로 정한다)에 따라 모양이 다르다: 아이는 작고 머리가 크며 밝은 옷,
// 10·20대는 선명한 옷, 30~50대는 차분한 옷, 60대 이상은 흰머리에 허리를 조금 굽힌다. 여성 가운데 일부는 긴 머리다.
// 고양이를 구경하며 멈춰 선 사람은 오른손으로 휴대폰을 들고, 가끔 플래시가 반짝인다.
// 비가 오면 비가 셀수록 많은 사람이 왼손으로 우산을 쓴다(약한 비는 일부, 센 비는 거의 모두). 대부분 투명 비닐우산이고 일부는 검정·남색이다.
// 휴대폰을 드는 동안에는 우산을 접는다.
import * as THREE from 'three';
import type { Walkers } from '../sim/walkers.ts';
import { env, material, pal } from './env.ts';
import { instanced, merge, part } from './util.ts';

// 몸의 기준 높이(m). 셰이더도 같은 값을 쓴다
// 키 약 1.47m 에 머리 지름 0.54m(2.7등신). 다리 0.42m, 팔 0.36m
const HIP = 0.42;
const SHOULDER = 0.86;
const ARM_Z = 0.2;
const ELBOW = 0.68;
const HAND = 0.5;
const NECK = 0.92;
const HEAD_R = 0.27;
const HEAD: [number, number] = [0.0, 1.18];
/** 하의와 상의가 갈리는 높이 */
const WAIST = 0.5;
/** 우산 천의 아래 가장자리 높이(우산 자기 좌표, 손잡이가 원점) */
const RIM = 0.4 + 0.6 * Math.cos(1.0);
/** 오른손에 든 휴대폰의 자리(몸 좌표, 셰이더의 hand(1, 든 자세)와 같은 값). 플래시를 여기에 띄운다 */
const PHONE: [number, number, number] = [0.18, 0.74, 0.11];

// 부품: 0 몸통(허리 아래는 하의), 1 머리, 2·3 다리(오른쪽 +z·왼쪽), 4 휴대폰, 5 발밑 그늘, 6 머리카락, 7 긴 머리,
// 8·9 팔(오른쪽·왼쪽), 10 목, 11 우산 천, 12 우산 대. 앞은 +x, 오른쪽은 +z.
// 휴대폰과 우산은 손에 쥐는 점을 원점으로 둔 자기 좌표로 만들고, 셰이더가 손 자리로 옮긴다.
function figure(): THREE.BufferGeometry {
  // 둥근 몸통: 엉덩이에서 배까지 불룩하고 어깨에서 목으로 둥글게 좁아진다
  const torso = new THREE.LatheGeometry(
    [
      [0.13, 0.36],
      [0.185, 0.42],
      [0.205, 0.54],
      [0.195, 0.7],
      [0.165, 0.83],
      [0.105, 0.9],
      [0.04, 0.93],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    10,
  ).scale(0.8, 1, 1);
  const leg = (z: number, id: number) => part(new THREE.CapsuleGeometry(0.082, HIP - 0.164, 2, 6).translate(0, HIP / 2, z), id);
  const arm = (z: number, id: number) => part(new THREE.CapsuleGeometry(0.058, SHOULDER - HAND, 2, 6, 2).translate(0, ELBOW, z), id);
  return merge([
    part(torso, 0),
    part(new THREE.SphereGeometry(HEAD_R, 12, 8).scale(1, 0.94, 1).translate(HEAD[0], HEAD[1], 0), 1),
    leg(0.09, 2),
    leg(-0.09, 3),
    part(new THREE.BoxGeometry(0.13, 0.014, 0.07).rotateZ(0.5).translate(0.04, 0.02, 0), 4),
    part(new THREE.CircleGeometry(0.32, 8).rotateX(-Math.PI / 2).translate(0, 0.03, 0), 5),
    // 머리카락: 머리보다 조금 큰 구면의 일부를 뒤로 기울여, 앞은 이마 위에서 끝나고 뒤는 목덜미까지 덮는다
    part(new THREE.SphereGeometry(HEAD_R + 0.016, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.6).rotateZ(0.7).scale(1, 0.95, 1.02).translate(HEAD[0] - 0.01, HEAD[1] + 0.01, 0), 6),
    part(new THREE.CapsuleGeometry(0.15, 0.22, 2, 6).scale(0.6, 1, 1.4).translate(-0.13, HEAD[1] - 0.17, 0), 7),
    arm(ARM_Z, 8),
    arm(-ARM_Z, 9),
    part(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 6, 1, true).translate(0, NECK - 0.01, 0), 10),
    part(new THREE.SphereGeometry(0.6, 8, 3, 0, Math.PI * 2, 0, 1.0).translate(0, 0.4, 0), 11),
    part(new THREE.CylinderGeometry(0.011, 0.011, 0.96, 4, 1, true).translate(0, 0.47, 0), 12),
  ]);
}

// 멀리서 작게 보이는 사람의 단순한 모형: 몸통(하의·상의를 높이로 칠한 육각기둥), 머리(이십면체, 위쪽은 머리카락 색), 우산(육각 원뿔).
// 팔다리·목·그늘·휴대폰은 없다. 부품 번호는 자세한 모형과 같아 같은 셰이더로 그린다
function figureFar(): THREE.BufferGeometry {
  return merge([
    part(new THREE.CylinderGeometry(0.15, 0.17, 0.88, 6, 1, true).scale(0.8, 1, 1).translate(0, 0.46, 0), 0),
    part(new THREE.IcosahedronGeometry(HEAD_R, 0).translate(HEAD[0], HEAD[1], 0), 1),
    part(new THREE.ConeGeometry(0.5, 0.28, 6, 1, true).translate(0, RIM + 0.14, 0), 11),
  ]);
}
const NEAR_FIG = figure();
const FAR_FIG = figureFar();
export const NEAR_VERTS = NEAR_FIG.attributes.position.count;
export const FAR_VERTS = FAR_FIG.attributes.position.count;
/** 키(1.47m)가 화면에서 이 픽셀보다 작게 보이면 단순한 모형으로 그린다 */
const NEAR_PX = 14;

/** 한 사람을 어떻게 그릴까: 0 그리지 않음(화면 밖·카메라 뒤), 1 자세한 모형, 2 단순한 모형.
 *  e 는 투영 × 시점 행렬 원소, projK 는 화면 높이 / (2·tan(화각/2)). 확대 배율은 셰이더의 zoomScale 과 같은 식이다 */
export function walkerLod(e: ArrayLike<number>, projK: number, x: number, z: number): number {
  const cw = e[3] * x + e[7] * 0.8 + e[11] * z + e[15];
  if (cw <= 0.5) return 0;
  const k = Math.min(6.5, Math.max(1.6, (8 * cw) / (projK * 1.6)));
  const px = (1.47 * k * projK) / cw;
  // 사람 키만큼(화면 좌표로) 여유를 두고 화면 밖이면 뺀다
  const m = px / (projK * Math.tan((16 * Math.PI) / 180)) + 0.05;
  const cx = (e[0] * x + e[4] * 0.8 + e[8] * z + e[12]) / cw;
  const cy = (e[1] * x + e[5] * 0.8 + e[9] * z + e[13]) / cw;
  if (cx < -1 - m || cx > 1 + m || cy < -1 - m || cy > 1 + m) return 0;
  return px >= NEAR_PX ? 1 : 2;
}

const SCALE = 'zoomScale(-cv.z, 1.6, 8.0, 1.6, 6.5)';
/** 셰이더에 넣을 실수 표기 */
const num = (v: number) => v.toFixed(4);

export function makeWalkerMesh(max: number) {
  const near = instanced(NEAR_FIG, max, { aInst: 4, aMore: 3, aLook: 2 });
  const far = instanced(FAR_FIG, max, { aInst: 4, aMore: 3, aLook: 2 });
  const mat = material({
      uniforms: { uLand: { value: pal.land } },
      vertex: /* glsl */ `
        attribute vec4 aInst;      // x, z, 방향, 걸음 위상
        attribute vec3 aMore;      // 나타남, 색 값, 휴대폰 든 정도
        attribute vec2 aLook;      // 나이대(0~3), 여성
        attribute float aPart;
        varying vec3 vN; varying vec3 vO; varying float vPart; varying float vTint; varying float vDist; varying float vFlash; varying vec2 vLook;
        vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
        // 팔 자세 k: x 팔꿈치 굽힘, y 아래팔을 몸 안쪽으로 돌리기, z 어깨에서 앞(+)뒤로 돌리기.
        // hold 가 1이면 오른팔은 휴대폰을 가슴 앞에, 왼팔은 우산을 가슴 앞에 든다. 팔꿈치는 옆구리에 둔다
        vec3 armPose(float side, float hold, float sw) {
          vec3 held = side > 0.0 ? vec3(1.7, 0.6, 0.25) : vec3(1.9, 0.35, 0.15);
          return mix(vec3(0.25, 0.0, -side * sw * 0.38), held, hold);
        }
        // 어깨 기준 r 을 굽힌다. 팔꿈치 고리는 굽힘의 절반만 돌려 꺾인 자리가 갈라지지 않게 한다
        void arm(inout vec3 r, inout vec3 n, float side, vec3 k) {
          float e = ${num(ELBOW - SHOULDER)};
          float w = r.y < e - 0.001 ? 1.0 : r.y < e + 0.001 ? 0.5 : 0.0;
          r.y -= e;
          r.xy = rot(r.xy, k.x * w); n.xy = rot(n.xy, k.x * w);
          r.xz = rot(r.xz, -side * k.y * w); n.xz = rot(n.xz, -side * k.y * w);
          r.y += e;
          r.yz = rot(r.yz, side * -0.05); n.yz = rot(n.yz, side * -0.05);   // 팔을 몸에서 살짝 띄운다
          r.xy = rot(r.xy, k.z); n.xy = rot(n.xy, k.z);
        }
        // 손 끝(쥐는 점)이 놓이는 자리
        vec3 hand(float side, vec3 k) {
          vec3 r = vec3(0.0, ${num(HAND - SHOULDER)}, 0.0), n = vec3(0.0);
          arm(r, n, side, k);
          return vec3(0.0, ${num(SHOULDER)}, side * ${num(ARM_Z)}) + r;
        }
        void main() {
          int id = int(aPart + 0.5);
          vec3 p = position;
          vec3 n = normal;
          float age = aLook.x;
          float photo = aMore.z;
          float move = 1.0 - photo;                          // 사진 찍는 동안은 서 있다
          float sw = sin(aInst.w) * move;
          // 긴 머리: 여성의 일부(60대 이상과 아이는 드물게)
          float longHair = aLook.y * step(fract(aMore.y * 3.7), age > 2.5 || age < 0.5 ? 0.2 : 0.7);
          // 우산: 비가 셀수록 많은 사람이 쓴다(약한 비 일부, 센 비 거의 모두). 휴대폰을 드는 동안은 접는다
          float umb = step(fract(aMore.y * 17.13 + 0.37), 0.95 * smoothstep(0.03, 0.6, uRain)) * move;
          if (id == 7) p *= longHair;
          // 아이: 머리가 더 크다
          if (age < 0.5 && (id == 1 || id == 6 || id == 7)) p = (p - vec3(${num(HEAD[0])}, ${num(HEAD[1])}, 0.0)) * 1.1 + vec3(${num(HEAD[0])}, ${num(HEAD[1])}, 0.0);
          if (id == 2 || id == 3) {
            // 다리: 엉덩이를 축으로 번갈아 앞뒤로
            float side = id == 2 ? 1.0 : -1.0;
            p.xy = rot(p.xy - vec2(0.0, ${num(HIP)}), side * sw * 0.45) + vec2(0.0, ${num(HIP)});
          } else if (id == 8 || id == 9) {
            // 팔: 같은 쪽 다리와 반대로 흔든다. 오른팔은 휴대폰을, 왼팔은 우산을 든다
            float side = id == 8 ? 1.0 : -1.0;
            vec3 sh = vec3(0.0, ${num(SHOULDER)}, side * ${num(ARM_Z)});
            vec3 r = p - sh;
            arm(r, n, side, armPose(side, id == 8 ? photo : umb, sw));
            p = sh + r;
          } else if (id == 4) {
            p = hand(1.0, armPose(1.0, photo, sw)) + p * photo;     // 휴대폰은 사진 찍을 때만
          } else if (id >= 11) {
            // 우산: 머리 위를 덮도록 대를 조금 뒤·안쪽으로 기울이고, 걸을 때 살짝 흔들린다
            p *= umb;
            float tilt = 0.25 + sw * 0.06;
            p.xy = rot(p.xy, tilt); n.xy = rot(n.xy, tilt);
            p.yz = rot(p.yz, 0.13); n.yz = rot(n.yz, 0.13);
            p += hand(-1.0, armPose(-1.0, umb, sw));
          }
          if (id == 1 || id == 6 || id == 7) p.xy = rot(p.xy - vec2(0.0, ${num(NECK)}), photo * -0.3) + vec2(0.0, ${num(NECK)}); // 화면을 내려다본다
          if (id != 2 && id != 3 && id != 5) {
            // 60대 이상은 허리를 조금 굽힌다. 걸을 때 몸이 좌우로 살짝 흔들리고 위아래로 통통
            p.xy = rot(p.xy - vec2(0.0, ${num(HIP)}), age > 2.5 ? -0.16 : 0.0) + vec2(0.0, ${num(HIP)});
            p.yz = rot(p.yz, sw * 0.04);
            p.y += abs(cos(aInst.w)) * 0.035 * move;
          }
          vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          float s = ${SCALE} * aMore.x * (age < 0.5 ? 0.72 : 1.0);
          p *= s;
          float cs = cos(aInst.z), sn = sin(aInst.z);
          vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y + 0.05, aInst.y + p.x * sn + p.z * cs);
          vN = vec3(n.x * cs - n.z * sn, n.y, n.x * sn + n.z * cs);
          vO = position; vPart = aPart; vTint = aMore.y; vLook = aLook;
          // 휴대폰 화면이 가끔 번쩍인다(사진 찍는 순간)
          vFlash = photo * step(0.9, fract(uTime * 0.55 + aMore.y * 13.0));
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform vec3 uLand;
        varying vec3 vN; varying vec3 vO; varying float vPart; varying float vTint; varying float vDist; varying float vFlash; varying vec2 vLook;
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
          int id = int(vPart + 0.5);
          if (id == 5) {                                     // 발밑 그늘
            gl_FragColor = vec4(fogged(lit(uLand * 0.66, vec3(0.0, 1.0, 0.0)), vDist), 1.0);
            return;
          }
          vec3 n = normalize(vN);
          if (id == 4) {                                     // 휴대폰
            gl_FragColor = vec4(mix(vec3(0.12, 0.13, 0.16), vec3(1.0), vFlash), 1.0);
            return;
          }
          float age = vLook.x;
          vec3 skin = mix(hex(243.,207.,177.), hex(214.,166.,128.), fract(vTint * 13.0));
          vec3 alb;
          if (id == 0) alb = vO.y < ${num(WAIST)} ? pants(age, fract(vTint * 7.0)) : top(age, vTint);
          else if (id == 8 || id == 9) alb = vO.y < ${num(HAND + 0.07)} ? skin : top(age, vTint);   // 소매와 손
          else if (id == 1 || id == 10) {
            alb = skin;
            if (id == 1 && vO.y > ${num(HEAD[1] + 0.05)}) alb = hair(age, fract(vTint * 5.3));   // 단순한 모형의 머리 위쪽(자세한 모형은 머리카락이 덮는다)
            // 큰 눈(위쪽에 작은 흰 빛)과 볼 홍조
            vec2 e = vec2(vO.y - ${num(HEAD[1] - 0.01)}, abs(vO.z) - 0.1);
            vec2 g = vec2(vO.y - ${num(HEAD[1] + 0.01)}, abs(vO.z) - 0.09);
            vec2 c = vec2(vO.y - ${num(HEAD[1] - 0.085)}, abs(vO.z) - 0.165);
            if (id == 1 && vO.x > 0.12) {
              if (dot(c, c) < 0.04 * 0.04) alb = mix(alb, hex(240.,128.,128.), 0.55);
              if (e.x * e.x + e.y * e.y * 1.6 < 0.034 * 0.034) alb = dot(g, g) < 0.011 * 0.011 ? vec3(0.95) : hex(40.,30.,28.);
            }
          }
          else if (id == 2 || id == 3) alb = pants(age, fract(vTint * 7.0)) * mix(0.55, 1.0, smoothstep(0.08, 0.16, vO.y));   // 신발은 어둡게
          else if (id >= 11) {
            // 우산: 대부분 투명 비닐(살과 테만 또렷하고 천은 점을 성기게 버려 비쳐 보인다), 일부는 검정·남색
            float kind = fract(vTint * 29.3);
            vec3 cloth = kind < 0.86 ? hex(24.,24.,28.) : hex(30.,40.,78.);
            bool clear = kind < 0.72;
            if (id == 12) alb = clear ? vec3(0.72, 0.74, 0.76) : cloth;
            else {
              float a = atan(vO.z, vO.x) * ${num(8 / (2 * Math.PI))};
              float rib = 1.0 - smoothstep(0.03, 0.07, abs(fract(a + 0.5) - 0.5));
              float frame = max(rib, 1.0 - smoothstep(0.012, 0.03, vO.y - ${num(RIM)}));
              if (clear && frame < 0.5 && dither(gl_FragCoord.xy) > 0.45) discard;
              alb = clear ? mix(vec3(0.93, 0.96, 0.98), vec3(0.6, 0.62, 0.65), frame) : cloth * mix(1.0, 0.6, rib);
            }
          }
          else alb = hair(age, fract(vTint * 5.3));
          vec3 col = lit(alb, n) * 1.06 + alb * (0.10 + 0.1 * uNight);
          gl_FragColor = vec4(fogged(col, vDist), 1.0);
        }`,
  });
  // 가까운 사람은 자세한 모형, 먼 사람은 단순한 모형. 화면 밖 사람은 어느 쪽에도 넣지 않는다
  const mesh = new THREE.Group();
  for (const g of [near.geo, far.geo]) {
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    mesh.add(m);
  }

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
  const pv = new THREE.Matrix4();
  function update(w: Walkers, cam: THREE.Camera) {
    let f = 0;
    const n = [0, 0];
    pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    for (let i = 0; i < w.n; i++) {
      const lod = walkerLod(pv.elements, env.uProjK.value, w.x[i], w.z[i]);
      if (!lod) continue;
      const { arr } = lod === 1 ? near : far;
      const q = n[lod - 1]++;
      const j = q * 4;
      arr.aInst[j] = w.x[i];
      arr.aInst[j + 1] = w.z[i];
      arr.aInst[j + 2] = w.yaw[i];
      arr.aInst[j + 3] = w.phase[i];
      arr.aMore[q * 3] = w.fade[i];
      arr.aMore[q * 3 + 1] = w.tint[i];
      arr.aMore[q * 3 + 2] = w.photo[i];
      arr.aLook[q * 2] = w.age[i];
      arr.aLook[q * 2 + 1] = w.female[i];
      if (w.photo[i] > 0.9 && f < FLASH_MAX) {
        // 휴대폰이 있는 자리(PHONE)에 과장 배율을 곱한다
        tmpS.set(w.x[i], 0, w.z[i]).applyMatrix4(cam.matrixWorldInverse);
        const k = Math.min(6.5, Math.max(1.6, (8 * -tmpS.z) / (env.uProjK.value * 1.6))) * w.fade[i];
        const c = Math.cos(w.yaw[i]);
        const s = Math.sin(w.yaw[i]);
        fl.arr.aInst.set([w.x[i] + (PHONE[0] * c - PHONE[2] * s) * k, PHONE[1] * k, w.z[i] + (PHONE[0] * s + PHONE[2] * c) * k, w.tint[i]], f * 4);
        f++;
      }
    }
    [near, far].forEach((m, k) => {
      m.geo.instanceCount = n[k];
      for (const a of [m.attr.aInst, m.attr.aMore, m.attr.aLook]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, n[k] * a.itemSize);
        a.needsUpdate = true;
      }
    });
    fl.geo.instanceCount = f;
    fl.attr.aInst.needsUpdate = true;
  }
  return { mesh, flash, update };
}
