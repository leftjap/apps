// 보행자. 머리(피부)·머리카락·목·상의(허리 아래는 하의)·팔·다리를 나눈 2.7등신쯤의 귀여운 캐릭터(큰 머리, 둥근 몸통, 짧은 팔다리, 큰 눈과 볼 홍조)를
// 인스턴싱으로 그리고, 걸음은 버텍스 셰이더에서 만든다.
// 걸을 때 팔은 다리와 반대로 흔든다. 어깨는 팔 윗부분이 둥글게 덮고, 손은 팔 끝을 피부색으로 칠한다.
// 나이대(실시간 도시데이터의 나이대 비율로 정한다)에 따라 모양이 다르다: 아이는 작고 머리가 크며 밝은 옷,
// 10·20대는 선명한 옷, 30~50대는 차분한 옷, 60대 이상은 흰머리에 허리를 조금 굽힌다.
// 옷차림은 계절(나무 색과 같은 계절)을 따른다: 겨울은 대부분 코트·패딩·재킷에 목도리·털모자, 봄·가을은 재킷이 섞이고, 여름은 반팔(일부 반바지).
// 머리 모양(짧은·긴·묶은·올린 머리, 60대 이상 여성의 파마)과 모자(털모자·야구모자), 가방(백팩·숄더백·쇼핑백)도 사람마다 정한다(wearOf).
// 윤곽은 림 라이트로 배경과 떼어 보이게 하고, 서 있는 사람은 몸을 살짝 흔들며 둘러본다.
// 고양이를 구경하며 멈춰 선 사람은 오른손으로 휴대폰을 들고, 가끔 플래시가 반짝인다.
// 비가 오면 비가 셀수록 많은 사람이 왼손으로 우산을 쓴다(약한 비는 일부, 센 비는 거의 모두). 대부분 투명 비닐우산이고 일부는 검정·남색이다.
// 휴대폰을 드는 동안에는 우산을 접는다.
import * as THREE from 'three';
import type { Season } from '../sim/season.ts';
import { BODY_SCALE, type Walkers } from '../sim/people/index.ts';
import { env, material, pal } from './env.ts';
import { sizeAt, sizeGlsl } from './size.ts';
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
/** 코트 자락 끝 높이 */
const COAT_HEM = 0.26;
/** 패딩 끝 높이(엉덩이를 덮는다) */
const PAD_HEM = 0.42;
/** 우산 천의 아래 가장자리 높이(우산 자기 좌표, 손잡이가 원점) */
const RIM = 0.4 + 0.6 * Math.cos(1.0);
/** 오른손에 든 휴대폰의 자리(몸 좌표, 셰이더의 hand(1, 든 자세)와 같은 값). 플래시를 여기에 띄운다 */
const PHONE: [number, number, number] = [0.18, 0.74, 0.11];

// 부품: 0 몸통(허리 아래는 하의), 1 머리, 2·3 다리(오른쪽 +z·왼쪽), 4 휴대폰, 5 발밑 그늘, 6 머리카락, 7 긴 머리,
// 8·9 팔(오른쪽·왼쪽), 10 목(목도리를 하면 부풀려 목도리로 칠한다), 11 우산 천, 12 우산 대, 13 코트 자락, 14 묶은·올린 머리,
// 15 야구모자 챙, 16 가방(단위 상자를 셰이더가 종류별 크기·자리로 옮긴다). 앞은 +x, 오른쪽은 +z.
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
    // 긴 머리: 얼굴 폭만큼 넓게 뒤로 늘어져 앞에서 보면 얼굴 양옆을 감싼다
    part(new THREE.CapsuleGeometry(0.15, 0.24, 2, 6).scale(0.55, 1, 1.85).translate(-0.13, HEAD[1] - 0.2, 0), 7),
    arm(ARM_Z, 8),
    arm(-ARM_Z, 9),
    part(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 6, 1, true).translate(0, NECK - 0.01, 0), 10),
    part(new THREE.SphereGeometry(0.6, 8, 3, 0, Math.PI * 2, 0, 1.0).translate(0, 0.4, 0), 11),
    part(new THREE.CylinderGeometry(0.011, 0.011, 0.96, 4, 1, true).translate(0, 0.47, 0), 12),
    part(new THREE.LatheGeometry([new THREE.Vector2(0.205, COAT_HEM), new THREE.Vector2(0.214, 0.53)], 10).scale(0.8, 1, 1), 13),
    part(new THREE.SphereGeometry(0.1, 6, 4), 14),
    part(new THREE.BoxGeometry(0.15, 0.016, 0.28).rotateZ(-0.12).translate(HEAD_R + 0.005, HEAD[1] + 0.075, 0), 15),
    part(new THREE.BoxGeometry(1, 1, 1), 16),
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
 *  e 는 투영 × 시점 행렬 원소, projK 는 화면 높이 / (2·tan(화각/2)). 확대 배율은 셰이더와 같은 크기 기준(size.ts)이다 */
export function walkerLod(e: ArrayLike<number>, projK: number, x: number, z: number): number {
  const cw = e[3] * x + e[7] * 0.8 + e[11] * z + e[15];
  if (cw <= 0.5) return 0;
  const k = Math.max(BODY_SCALE, sizeAt('mover', cw));
  const px = (1.47 * k * projK) / cw;
  // 사람 키만큼(화면 좌표로) 여유를 두고 화면 밖이면 뺀다
  const m = px / (projK * Math.tan((16 * Math.PI) / 180)) + 0.05;
  const cx = (e[0] * x + e[4] * 0.8 + e[8] * z + e[12]) / cw;
  const cy = (e[1] * x + e[5] * 0.8 + e[9] * z + e[13]) / cw;
  if (cx < -1 - m || cx > 1 + m || cy < -1 - m || cy > 1 + m) return 0;
  return px >= NEAR_PX ? 1 : 2;
}

/** 계절의 온기(0 겨울 ~ 1 여름). 옷차림을 정한다 */
export const WARM: Record<Season, number> = { winter: 0, autumn: 0.35, blossom: 0.6, green: 1 };

/** 색 값 t(0~1)에서 k 번째 난수(0~1) */
const rnd = (t: number, k: number) => {
  const v = Math.sin(t * (127.1 + k * 31.7) + k * 7.13) * 43758.5453;
  return v - Math.floor(v);
};

/** 한 사람의 옷차림. 색 값 t, 나이대(0 아이 ~ 3 60대 이상), 여성(1), 계절 온기 warm.
 *  [겉옷(0 없음·1 재킷·2 코트·3 패딩), 머리 모양(0 짧은·1 긴·2 묶은·3 올린·4 파마), 모자(0 없음·1 털모자·2 야구모자) + 4·목도리, 가방(0 없음·1 백팩·2 숄더백·3 쇼핑백) + 4·짧은 옷(1 반팔, 2 반팔·반바지)] */
export function wearOf(t: number, age: number, female: number, warm: number): [number, number, number, number] {
  const r = (k: number) => rnd(t, k);
  // 겉옷: 추울수록 많이, 두꺼운 옷일수록 추울 때. 아이는 긴 코트 대신 패딩
  let outer = 0;
  if (warm < 0.9 && r(1) < Math.min(0.95, 1 - 0.75 * warm)) {
    const pad = 0.45 * (1 - warm) ** 2;
    const coat = 0.4 - 0.25 * warm;
    outer = r(2) < pad ? 3 : r(2) < pad + coat ? 2 : 1;
    if (age === 0 && outer === 2) outer = 3;
  }
  // 머리 모양: 남성은 짧은 머리. 여성은 나이대에 따라
  let hair = 0;
  if (female) {
    const u = r(3);
    if (age === 3) hair = u < 0.65 ? 4 : u < 0.8 ? 3 : 0;
    else if (age === 0) hair = u < 0.3 ? 1 : u < 0.7 ? 2 : 0;
    else hair = u < 0.25 ? 0 : u < 0.65 ? 1 : u < 0.85 ? 2 : 3;
  }
  // 모자: 털모자는 추울 때, 야구모자는 따뜻할수록 조금 더. 올린 머리는 모자를 쓰지 않는다
  const v = r(4);
  let hat = warm < 0.5 && v < 0.15 * (1 - warm * 1.6) ? 1 : v > 0.93 - 0.06 * warm && age < 3 ? 2 : 0;
  if (hair === 3) hat = 0;
  const scarf = warm < 0.5 && outer > 0 && r(5) < 0.5 * (1 - warm * 2) ? 1 : 0;
  // 가방: 백팩(60대 이상은 쇼핑백으로), 숄더백(여성이 더 많이), 쇼핑백
  const b = r(6);
  let bag = b < 0.13 ? 1 : b < 0.18 + 0.1 * female ? 2 : b < 0.36 ? 3 : 0;
  if (age === 3 && bag === 1) bag = 3;
  const short = warm >= 0.9 ? (age < 3 && r(7) < 0.45 ? 2 : 1) : 0;
  return [outer, hair, hat + 4 * scarf, bag + 4 * short];
}

const SCALE = sizeGlsl('mover');
/** 셰이더에 넣을 실수 표기 */
const num = (v: number) => v.toFixed(4);

export function makeWalkerMesh(max: number) {
  const attrs = { aInst: 4, aMore: 3, aLook: 3, aWear: 4 };
  const near = instanced(NEAR_FIG, max, attrs);
  const far = instanced(FAR_FIG, max, attrs);
  const mat = material({
      uniforms: { uLand: { value: pal.land } },
      vertex: /* glsl */ `
        attribute vec4 aInst;      // x, z, 방향, 걸음 위상
        attribute vec3 aMore;      // 나타남, 색 값, 휴대폰 든 정도
        attribute vec3 aLook;      // 나이대(0~3), 여성, 걷는 중
        attribute vec4 aWear;      // 옷차림(wearOf)
        attribute float aPart;
        varying vec3 vN; varying vec3 vO; varying float vPart; varying float vTint; varying float vDist; varying float vFlash; varying vec2 vLook;
        varying vec4 vWear; varying vec3 vView;
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
          float idle = 1.0 - aLook.z;                        // 서 있는 사람
          float sw = sin(aInst.w) * move;
          float outer = floor(aWear.x + 0.5);
          float hs = floor(aWear.y + 0.5);
          float hat = mod(floor(aWear.z + 0.5), 4.0);
          float scarf = floor((aWear.z + 0.5) / 4.0);
          float bag = mod(floor(aWear.w + 0.5), 4.0);
          // 우산: 비가 셀수록 많은 사람이 쓴다(약한 비 일부, 센 비 거의 모두). 휴대폰을 드는 동안은 접는다
          float umb = step(fract(aMore.y * 17.13 + 0.37), 0.95 * smoothstep(0.03, 0.6, uRain)) * move;
          vec3 hc = vec3(${num(HEAD[0])}, ${num(HEAD[1])}, 0.0);
          bool head = id == 1 || id == 6 || id == 7 || id == 14 || id == 15;
          if (id == 6) {
            // 머리카락: 털모자·야구모자는 조금 부풀려 모자로 칠하고(털모자는 이마까지 내린다), 파마는 크게 부풀린다
            p = (p - hc) * (hat > 1.5 ? 1.04 : hat > 0.5 ? 1.08 : hs > 3.5 ? 1.13 : 1.0) + hc;
            if (hat > 0.5 && hat < 1.5) p.y -= 0.03;
          }
          if (id == 7) p *= step(0.5, hs) * step(hs, 1.5);
          if (id == 14) {
            if (hs > 1.5 && hs < 2.5) {
              // 묶은 머리: 뒤통수에 매달려 걸음에 따라 흔들린다
              p = p * vec3(0.75, 1.8, 0.75) + vec3(0.0, -0.16, 0.0);
              p.xy = rot(p.xy, sw * 0.25); n.xy = rot(n.xy, sw * 0.25);
              p += vec3(-0.27, 1.27, 0.0);
            } else if (hs > 2.5 && hs < 3.5) p = p * 1.1 + vec3(-0.1, 1.44, 0.0);   // 올린 머리
            else p *= 0.0;
          }
          if (id == 15) p *= step(1.5, hat);
          if (id == 13) p *= step(1.5, outer) * step(outer, 2.5);
          if (id == 10 && scarf > 0.5) p = (p - vec3(0.0, ${num(NECK - 0.01)}, 0.0)) * vec3(1.9, 1.6, 1.9) + vec3(0.0, ${num(NECK - 0.01)}, 0.0);
          // 패딩은 몸통과 소매가 통통하다
          if (id == 0 || id == 13) p.xz *= outer > 2.5 ? 1.12 : outer > 1.5 ? 1.04 : 1.0;
          // 아이: 머리가 더 크다
          if (age < 0.5 && head) p = (p - hc) * 1.1 + hc;
          if (id == 2 || id == 3) {
            // 다리: 엉덩이를 축으로 번갈아 앞뒤로
            float side = id == 2 ? 1.0 : -1.0;
            p.xy = rot(p.xy - vec2(0.0, ${num(HIP)}), side * sw * 0.45) + vec2(0.0, ${num(HIP)});
          } else if (id == 8 || id == 9) {
            // 팔: 같은 쪽 다리와 반대로 흔든다. 오른팔은 휴대폰을, 왼팔은 우산을 든다
            float side = id == 8 ? 1.0 : -1.0;
            vec3 sh = vec3(0.0, ${num(SHOULDER)}, side * ${num(ARM_Z)});
            vec3 r = p - sh;
            if (r.y > ${num(HAND + 0.07 - SHOULDER)}) r.xz *= outer > 2.5 ? 1.25 : outer > 0.5 ? 1.08 : 1.0;
            arm(r, n, side, armPose(side, id == 8 ? photo : umb, sw));
            p = sh + r;
          } else if (id == 4) {
            p = hand(1.0, armPose(1.0, photo, sw)) + p * photo;     // 휴대폰은 사진 찍을 때만
          } else if (id == 16) {
            // 가방: 백팩은 등에, 숄더백은 왼쪽 앞 엉덩이에, 쇼핑백은 오른손에(휴대폰을 드는 동안은 내려놓는다)
            if (bag > 2.5) p = photo > 0.5 ? vec3(0.0) : p * vec3(0.16, 0.2, 0.05) + hand(1.0, armPose(1.0, photo, sw)) + vec3(0.0, -0.1, 0.03);
            else if (bag > 1.5) p = p * vec3(0.05, 0.13, 0.16) + vec3(0.19, 0.47, -0.1);
            else if (bag > 0.5) p = p * vec3(0.13, 0.26, 0.28) + vec3(-0.225, 0.68, 0.0);
            else p *= 0.0;
          } else if (id == 11 || id == 12) {
            // 우산: 머리 위를 덮도록 대를 조금 뒤·안쪽으로 기울이고, 걸을 때 살짝 흔들린다
            p *= umb;
            float tilt = 0.25 + sw * 0.06;
            p.xy = rot(p.xy, tilt); n.xy = rot(n.xy, tilt);
            p.yz = rot(p.yz, 0.13); n.yz = rot(n.yz, 0.13);
            p += hand(-1.0, armPose(-1.0, umb, sw));
          }
          if (head) {
            p.xy = rot(p.xy - vec2(0.0, ${num(NECK)}), photo * -0.3) + vec2(0.0, ${num(NECK)}); // 화면을 내려다본다
            // 서 있는 사람은 가끔 고개를 돌려 둘러본다
            float look = idle * move * 0.35 * sin(uTime * 0.4 + aMore.y * 40.0);
            p.xz = rot(p.xz, look); n.xz = rot(n.xz, look);
          }
          if (id != 2 && id != 3 && id != 5) {
            // 60대 이상은 허리를 조금 굽히고, 걷는 사람은 살짝 앞으로 기운다. 걸을 때 몸이 좌우로 흔들리고 위아래로 통통,
            // 서 있는 사람은 천천히 몸무게를 옮기듯 좌우로 흔들린다
            p.xy = rot(p.xy - vec2(0.0, ${num(HIP)}), (age > 2.5 ? -0.16 : 0.0) - 0.05 * aLook.z * move) + vec2(0.0, ${num(HIP)});
            p.yz = rot(p.yz, sw * 0.04 + idle * 0.03 * sin(uTime * 1.2 + aMore.y * 50.0));
            p.y += abs(cos(aInst.w)) * 0.035 * move * aLook.z;
          }
          vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          // 사람은 실제보다 BODY_SCALE 배로 그린다(지오 지시 1.5배). 멀리서 키우는 배율이 그보다 크면 그 배율을 쓴다
          float s = max(${BODY_SCALE.toFixed(2)}, ${SCALE}) * aMore.x * (age < 0.5 ? 0.72 : 1.0);
          p *= s;
          float cs = cos(aInst.z), sn = sin(aInst.z);
          vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y + 0.05, aInst.y + p.x * sn + p.z * cs);
          vN = vec3(n.x * cs - n.z * sn, n.y, n.x * sn + n.z * cs);
          vO = position; vPart = aPart; vTint = aMore.y; vLook = aLook.xy; vWear = aWear;
          vView = cameraPosition - w;
          // 휴대폰 화면이 가끔 번쩍인다(사진 찍는 순간)
          vFlash = photo * step(0.9, fract(uTime * 0.55 + aMore.y * 13.0));
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform vec3 uLand;
        varying vec3 vN; varying vec3 vO; varying float vPart; varying float vTint; varying float vDist; varying float vFlash; varying vec2 vLook;
        varying vec4 vWear; varying vec3 vView;
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
        // 겉옷 색: 1 재킷, 2 코트, 3 패딩. 아이는 밝은 패딩, 60대 이상은 보라·자주·밤색 패딩이 많다
        vec3 outerCol(float o, float age, float t) {
          if (age < 0.5) return t < 0.25 ? hex(255.,200.,60.) : t < 0.5 ? hex(244.,130.,160.) : t < 0.75 ? hex(110.,180.,235.) : hex(220.,70.,70.);
          if (o > 2.5) {
            if (age > 2.5) return t < 0.3 ? hex(118.,78.,140.) : t < 0.55 ? hex(120.,40.,60.) : t < 0.8 ? hex(100.,74.,58.) : hex(30.,30.,34.);
            return t < 0.4 ? hex(26.,26.,29.) : t < 0.55 ? hex(236.,232.,222.) : t < 0.7 ? hex(31.,42.,68.) : t < 0.85 ? hex(118.,116.,88.) : hex(150.,152.,158.);
          }
          if (o > 1.5) return t < 0.25 ? hex(193.,154.,107.) : t < 0.5 ? hex(30.,30.,32.) : t < 0.65 ? hex(64.,65.,72.) : t < 0.8 ? hex(34.,44.,72.) : t < 0.9 ? hex(214.,196.,170.) : hex(110.,80.,60.);
          return t < 0.3 ? hex(72.,102.,140.) : t < 0.5 ? hex(32.,32.,34.) : t < 0.7 ? hex(150.,138.,104.) : t < 0.85 ? hex(92.,98.,70.) : hex(120.,124.,130.);
        }
        vec3 hair(float age, float t, float hs) {
          if (hs > 3.5 && fract(t * 3.3) < 0.55) return hex(70.,44.,34.);    // 갈색으로 물들인 파마
          if (age > 2.5) return mix(hex(190.,190.,190.), hex(240.,240.,240.), t);
          if (age > 0.5 && age < 1.5 && t > 0.8) return hex(164.,112.,58.);   // 물들인 갈색
          return t < 0.6 ? hex(29.,26.,25.) : hex(58.,42.,34.);
        }
        // 모자: 털모자(빨강·겨자·회색·검정·크림), 야구모자(검정·남색·흰색·베이지)
        vec3 hatCol(float hat, float t) {
          if (hat < 1.5) return t < 0.2 ? hex(190.,50.,50.) : t < 0.4 ? hex(210.,160.,60.) : t < 0.6 ? hex(140.,140.,145.) : t < 0.8 ? hex(30.,30.,34.) : hex(232.,226.,212.);
          return t < 0.35 ? hex(28.,28.,30.) : t < 0.6 ? hex(34.,44.,72.) : t < 0.8 ? hex(240.,240.,240.) : hex(200.,184.,150.);
        }
        vec3 scarfCol(float t) { return t < 0.3 ? hex(180.,40.,45.) : t < 0.5 ? hex(150.,150.,155.) : t < 0.7 ? hex(236.,228.,210.) : t < 0.85 ? hex(196.,150.,100.) : hex(40.,60.,100.); }
        vec3 bagCol(float bag, float t) {
          if (bag < 1.5) return t < 0.5 ? hex(28.,28.,30.) : t < 0.75 ? hex(40.,52.,84.) : hex(120.,124.,130.);
          if (bag < 2.5) return t < 0.4 ? hex(110.,70.,45.) : t < 0.7 ? hex(30.,28.,28.) : hex(214.,196.,170.);
          return t < 0.4 ? hex(245.,245.,240.) : t < 0.75 ? hex(196.,160.,112.) : hex(30.,30.,32.);
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
          float outer = floor(vWear.x + 0.5);
          float hs = floor(vWear.y + 0.5);
          float hat = mod(floor(vWear.z + 0.5), 4.0);
          float scarf = floor((vWear.z + 0.5) / 4.0);
          float bag = mod(floor(vWear.w + 0.5), 4.0);
          float shortw = floor((vWear.w + 0.5) / 4.0);
          vec3 skin = mix(hex(243.,207.,177.), hex(214.,166.,128.), fract(vTint * 13.0));
          vec3 tc = top(age, vTint);
          vec3 oc = outerCol(outer, age, fract(vTint * 19.7));
          vec3 hc = hair(age, fract(vTint * 5.3), hs);
          vec3 strap = bagCol(bag, fract(vTint * 23.3)) * 0.8;
          // 패딩은 가로 누빔 줄이 진하다
          float quilt = outer > 2.5 ? 1.0 - 0.2 * smoothstep(0.7, 1.0, fract(vO.y * 11.0)) : 1.0;
          vec3 alb;
          if (id == 0 || id == 13) {
            float hem = outer > 2.5 ? ${num(PAD_HEM)} : outer > 1.5 ? ${num(COAT_HEM)} : ${num(WAIST)};
            if (vO.y < hem) alb = pants(age, fract(vTint * 7.0));
            else if (outer > 0.5) {
              alb = oc * quilt;
              if (outer < 1.5 && vO.x > 0.0 && abs(vO.z) < 0.035 && vO.y > ${num(WAIST)}) alb = tc;   // 재킷 앞섶 사이로 상의
              if (outer > 1.5 && vO.x > 0.0 && abs(vO.z) < 0.008) alb *= 0.6;                      // 코트·패딩 여밈선
            } else alb = tc;
            if (id == 0) {
              // 목도리 끝자락, 가방끈(백팩은 앞 어깨끈 둘, 숄더백은 어깨에서 반대쪽 허리로)
              if (scarf > 0.5 && vO.x > 0.08 && vO.z > 0.02 && vO.z < 0.085 && vO.y > 0.6) alb = scarfCol(fract(vTint * 31.1));
              if (bag > 0.5 && bag < 1.5 && vO.x > 0.02 && abs(abs(vO.z) - 0.11) < 0.022 && vO.y > 0.6) alb = strap;
              if (bag > 1.5 && bag < 2.5 && abs(vO.y - 0.55 - (vO.z + 0.2) * 0.886) < 0.02 && vO.y > 0.5) alb = strap;
            }
          }
          else if (id == 8 || id == 9) {                     // 소매와 손(반팔이면 팔꿈치 위까지 맨살)
            if (shortw > 0.5) alb = vO.y < 0.73 ? skin : tc;
            else alb = vO.y < ${num(HAND + 0.07)} ? skin : outer > 0.5 ? oc * quilt : tc;
          }
          else if (id == 1 || id == 10) {
            alb = skin;
            if (id == 10 && scarf > 0.5) {
              float t = fract(vTint * 31.1);
              alb = scarfCol(t) * (t < 0.15 ? 0.75 + 0.25 * step(0.5, fract(vO.y * 60.0)) : 1.0);
            }
            if (id == 1 && vO.y > ${num(HEAD[1] + 0.05)}) alb = hat > 0.5 ? hatCol(hat, fract(vTint * 11.9)) : hc;   // 단순한 모형의 머리 위쪽(자세한 모형은 머리카락이 덮는다)
            // 큰 눈(위쪽에 작은 흰 빛)과 볼 홍조
            vec2 e = vec2(vO.y - ${num(HEAD[1] - 0.01)}, abs(vO.z) - 0.1);
            vec2 g = vec2(vO.y - ${num(HEAD[1] + 0.01)}, abs(vO.z) - 0.09);
            vec2 c = vec2(vO.y - ${num(HEAD[1] - 0.085)}, abs(vO.z) - 0.165);
            if (id == 1 && vO.x > 0.12) {
              if (dot(c, c) < 0.04 * 0.04) alb = mix(alb, hex(240.,128.,128.), 0.55);
              if (e.x * e.x + e.y * e.y * 1.6 < 0.034 * 0.034) alb = dot(g, g) < 0.011 * 0.011 ? vec3(0.95) : hex(40.,30.,28.);
            }
          }
          else if (id == 2 || id == 3) {
            // 다리: 신발은 어둡거나 흰 운동화, 반바지면 무릎 아래 맨살
            vec3 shoe = fract(vTint * 3.1) < 0.35 ? hex(232.,232.,228.) : hex(40.,38.,38.);
            alb = shortw > 1.5 && vO.y < 0.27 ? skin : pants(age, fract(vTint * 7.0));
            alb = mix(shoe, alb, smoothstep(0.09, 0.105, vO.y));
          }
          else if (id == 15) alb = hatCol(hat, fract(vTint * 11.9));
          else if (id == 16) alb = bagCol(bag, fract(vTint * 23.3));
          else if (id == 11 || id == 12) {
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
          else if (id == 6 && hat > 0.5) {
            // 털모자는 세로 골이 진다
            alb = hatCol(hat, fract(vTint * 11.9));
            if (hat < 1.5) alb *= 0.85 + 0.15 * step(0.5, fract(atan(vO.z, vO.x) * 5.0));
          }
          else {
            alb = hc;
            if (hs > 3.5) alb *= 0.8 + 0.2 * step(0.0, sin(vO.x * 90.0) * sin(vO.y * 90.0) * sin(vO.z * 90.0));   // 파마 곱슬
          }
          vec3 col = lit(alb, n) * 1.06 + alb * (0.10 + 0.1 * uNight);
          // 림 라이트: 윤곽을 밝혀 어두운 옷·밤에도 바닥과 떨어져 보이게 한다
          float rim = pow(1.0 - clamp(dot(n, normalize(vView)), 0.0, 1.0), 2.5);
          col += rim * mix(vec3(0.10, 0.10, 0.09), vec3(0.3, 0.34, 0.48), uNight);
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
  function update(w: Walkers, cam: THREE.Camera, season: Season = 'green') {
    const warm = WARM[season];
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
      arr.aLook[q * 3] = w.age[i];
      arr.aLook[q * 3 + 1] = w.female[i];
      arr.aLook[q * 3 + 2] = w.moving[i];
      arr.aWear.set(wearOf(w.tint[i], w.age[i], w.female[i], warm), q * 4);
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
      for (const a of [m.attr.aInst, m.attr.aMore, m.attr.aLook, m.attr.aWear]) {
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
