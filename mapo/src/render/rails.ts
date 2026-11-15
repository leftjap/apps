// 노선과 열차. 지상 구간(당산철교)은 띄운 선로와 교각, 그 위를 달리는 열차 모형으로 그린다.
// 지하 구간은 땅 위에 노선 색 점선(아주 옅게, 늘)으로 자리를 보이고, 터널 안 열차는 그 자리 땅 위에 노선 색 빛으로 그린다:
// 칸마다 나뉜 띠(칸 사이 틈), 머리 칸이 조금 더 밝고, 열차 속도 그대로 움직이며, 역에 서 있는 동안 승강장 길이만큼 빛이 고인다(trainLight.ts).
// 빛은 땅 높이에 깔려 건물·나무·차가 덮고, 덮인 자리는 성긴 점무늬로 약하게 비쳐 보인다. 빛 바로 앞(카메라 거리의 2.5%, 20~150m)에서 덮은 것만 비치므로
// 멀리 앞을 가린 건물 벽에는 얹히지 않는다. 판 전체를 볼 만큼 멀면(FAR) 덮인 자리도 보이는 자리와 같은 세기로 그린다.
// 지상 조각에서 터널 조각으로 바뀌는 곳(합정 남서쪽, 굽기가 OSM 태그로 정한다)에는 옹벽을 세운 터파기와 터널 입구를 만들고, 그 자리만 땅을 깊이로 뚫어 열차 모형이 내려가 입구로 들어간다.
// 빛은 입구에서 60m 에 걸쳐 켜져 모형과 이어진다. 역·지하 열차를 골라 지하 들여다보기를 켜면 그 원 안에서는 빛·점선 대신
// 지표 아래(UNDER_Y)의 터널 단면과 열차 모형을 보인다. 전동차는 노선별 실제 차량(2호선 2000호대, 6호선 6000호대, 경의중앙선 321000호대,
// 공항철도 2000호대)의 색 띠·앞모양·창·출입문(한쪽 4개) 배치를 따른 19.5m 칸이다.
import * as THREE from 'three';
import type { Line } from '../data/board.ts';
import { headingAt, pointAt } from '../poly.ts';
import type { TrainPos } from '../sim/trains.ts';
import { env, material, pal, UNDER_Y } from './env.ts';
import { carSpans, GAP_M, GAP_MAX, GAP_PX, poolLevel, portalRamp } from './trainLight.ts';
import { addRibbon, instanced, merge, part, ribbon, ribbonGeometry } from './util.ts';

const VERT = /* glsl */ `
  attribute vec2 aUV; attribute vec4 aInfo;
  varying vec2 vUV; varying vec4 vInfo; varying float vDist; varying vec2 vXZ;
  void main() {
    vUV = aUV; vInfo = aInfo; vXZ = position.xz;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const MAX_CARS = 260;
/** 빛 조각 수(칸 + 역에 고인 빛) */
const MAX_LIGHTS = 300;
/** 빛을 깔아 두는 땅 위 높이 */
const LIGHT_Y = 0.5;
/** 덮인 빛을 비쳐 보이는 거리: 빛 앞(카메라 쪽) 카메라 거리의 REACH 배(20~150m) 안에 있는 건물·나무·차에 덮인 자리만 비쳐 보인다 */
const REACH = 0.025;
/** 이 카메라 거리(m) 사이에서 덮인 자리 빛이 '가까이 덮은 것만 약하게'에서 '모두 그대로'로 바뀐다(판 전체 보기는 약 6km) */
const FAR = [2500, 4500];
/** 터파기 옹벽이 땅 위로 올라온 높이 */
const PARAPET = 0.9;
/** 터파기 안쪽 반폭 */
const TROUGH_W = 5.2;
const MOUTH_H = 6.2;
const CAR_LEN = 19.5;

export interface TrainSpot {
  key: number;
  line: string;
  dir: 0 | 1;
  x: number;
  y: number;
  z: number;
  under: boolean;
}
/** 노선별 차량 모양: 0 2호선, 1 6호선, 2 코레일(경의중앙선), 3 공항철도 */
const STYLE: Record<string, number> = { '2': 0, '6': 1, K: 2, A: 3 };

/** kind: 꼭짓점 i 와 i+1 사이 조각의 종류(−1 터널, 0 지상, 1 다리). 굽기가 OSM 태그로 정하고, 터널 조각의 꼭짓점은 입구 깊이(−6.5m)보다 깊게 둔다(tools/lib/rail.ts) */
type Track = { p: ArrayLike<number>; cum: ArrayLike<number>; kind: ArrayLike<number> };
const tmpA = [0, 0, 0];
const tmpB = [0, 0, 0];

/** 지상 조각과 터널 조각이 만나는 곳마다 터파기 구간. sP 는 터널 입구(터널 조각이 시작하는 꼭짓점), s0 는 그 앞 지상 조각에서 선로가 땅높이(0)를 지나는 곳 */
export function findPortals(l: Track): { s0: number; sP: number }[] {
  const n = l.cum.length;
  const y = (i: number) => l.p[i * 3 + 1];
  const tunnel = (seg: number) => l.kind[seg] === -1;
  const out: { s0: number; sP: number }[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (tunnel(i - 1) === tunnel(i)) continue;
    // 터널에서 멀어지는 쪽으로 지상 조각을 따라가며 땅높이를 지나는 곳을 찾는다
    const step = tunnel(i) ? -1 : 1;
    let s0 = l.cum[i];
    for (let v = i; ; v += step) {
      const seg = step < 0 ? v - 1 : v;
      if (seg < 0 || seg >= n - 1 || tunnel(seg) || y(v) >= 0) break;
      const w = v + step;
      if (y(w) >= 0) {
        s0 = l.cum[v] + (-y(v) / (y(w) - y(v))) * (l.cum[w] - l.cum[v]);
        break;
      }
      s0 = l.cum[w];
    }
    if (s0 !== l.cum[i]) out.push({ s0, sP: l.cum[i] });
  }
  return out;
}

/** 거리 값 s 에 가운데가 놓인 칸: 앞뒤 끝이 모두 터널 조각 위면 터널 안, 기울기는 앞뒤 끝 높이 차로 정한다 */
export function carPose(l: Track, s: number): { under: boolean; pitch: number; ya: number; yb: number } {
  const len = l.cum[l.cum.length - 1];
  const a = Math.max(0, s - CAR_LEN / 2);
  const b = Math.min(len, s + CAR_LEN / 2);
  const sa = pointAt(l.p, l.cum, a, tmpA);
  const sb = pointAt(l.p, l.cum, b, tmpB);
  return { under: l.kind[sa] === -1 && l.kind[sb] === -1, pitch: Math.atan2(tmpB[1] - tmpA[1], b - a || 1), ya: tmpA[1], yb: tmpB[1] };
}
/** 지상·터파기 선로 바닥 높이 */
const deckY = (y: number) => (y < 0 ? y + 0.3 : Math.max(0.3, y));

/** 단면(z, y)을 x 를 따라 밀어낸 차체. 양 끝 단면의 꼭짓점에는 aEnd(−1 뒤, +1 앞)를 붙여 운전실 앞모양으로 휘게 한다 */
function sweep(ring: [number, number][], xs: number[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const end: number[] = [];
  const cz = ring.reduce((m, q) => m + q[0], 0) / ring.length;
  const cy = ring.reduce((m, q) => m + q[1], 0) / ring.length;
  const tag = (x: number) => (x === xs[0] ? -1 : x === xs[xs.length - 1] ? 1 : 0);
  const put = (...v: [number, number, number][]) => v.forEach((p) => (pos.push(...p), end.push(tag(p[0]))));
  for (let k = 0; k + 1 < xs.length; k++)
    for (let i = 0; i < ring.length; i++) {
      const [z0, y0] = ring[i];
      const [z1, y1] = ring[(i + 1) % ring.length];
      const A: [number, number, number] = [xs[k], y0, z0];
      const B: [number, number, number] = [xs[k + 1], y0, z0];
      const C: [number, number, number] = [xs[k + 1], y1, z1];
      const D: [number, number, number] = [xs[k], y1, z1];
      // 바깥을 보게 감는다: 면 법선 (0, −dz, dy) 이 단면 중심에서 멀어지는 쪽이어야 한다
      const out = -(z1 - z0) * ((y0 + y1) / 2 - cy) + (y1 - y0) * ((z0 + z1) / 2 - cz) > 0;
      if (out) put(A, B, C, A, C, D);
      else put(A, C, B, A, D, C);
    }
  const v2 = ring.map(([z, y]) => new THREE.Vector2(z, y));
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(v2, [])) {
    // 앞(+x) 끝은 +x 를, 뒤 끝은 −x 를 보게 감는다
    const [a, b, c] = [ring[i], ring[j], ring[k]];
    const ccw = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0; // (z, y) 평면에서 반시계 = −x 를 본다
    for (const [x, back] of [[xs[0], true], [xs[xs.length - 1], false]] as const) {
      const [p, q] = ccw === back ? [b, c] : [c, b];
      put([x, a[1], a[0]], [x, p[1], p[0]], [x, q[1], q[0]]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return part(g, 0).setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 1));
}
const tagEnd = (g: THREE.BufferGeometry) => g.setAttribute('aEnd', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count), 1));

/** 전동차 한 칸(길이 19.5m, 폭 3.16m, 레일 위 높이 약 3.7m): 차체, 대차 둘, 바닥 밑 기기, 지붕 냉방기 둘 */
export function trainCar(): THREE.BufferGeometry {
  // 단면: 아래가 조금 안으로 들어간 옆벽과 둥근 지붕 어깨
  const ring: [number, number][] = [
    [1.45, 0.95],
    [1.58, 1.18],
    [1.58, 3.22],
    [1.4, 3.55],
    [0.9, 3.7],
    [-0.9, 3.7],
    [-1.4, 3.55],
    [-1.58, 3.22],
    [-1.58, 1.18],
    [-1.45, 0.95],
  ];
  const h = CAR_LEN / 2;
  const box = (w: number, hh: number, d: number, x: number, y: number, id: number) => tagEnd(part(new THREE.BoxGeometry(w, hh, d).translate(x, y, 0), id));
  return merge([
    box(2.7, 0.8, 2.3, -6.9, 0.45, 3),
    box(2.7, 0.8, 2.3, 6.9, 0.45, 3),
    box(7.5, 0.5, 2.5, 0, 0.78, 3),
    sweep(ring, [-h, -h + 0.55, h - 0.55, h]),
    box(3.3, 0.36, 2.0, -5.2, 3.86, 2),
    box(3.3, 0.36, 2.0, 5.2, 3.86, 2),
  ]);
}

// 칠: 차 안 좌표 o(앞모양으로 휘기 전), 차 안 법선 nl, 노선 색 lc, 모양 st, 운전실 cab(±1 앞 운전실, ±2 뒤 운전실, 부호는 그 끝의 x 방향)
const PAINT = /* glsl */ `
  float bnd(float v, float a, float b) { return step(a, v) * step(v, b); }
  vec3 trainAlbedo(vec3 o, vec3 nl, float part, vec3 lc, float st, float cab, out float glass, out float lit2, out float headL, out float tailL) {
    float ax = abs(o.x), az = abs(o.z), y = o.y;
    glass = 0.0; lit2 = 0.0; headL = 0.0; tailL = 0.0;
    if (part > 2.5) return vec3(0.16, 0.16, 0.17);                    // 대차·바닥 밑 기기
    if (part > 1.5) return vec3(0.84, 0.85, 0.86);                    // 냉방기
    float side = step(0.6, abs(nl.z));
    float roof = step(0.55, nl.y);
    float isCab = step(0.5, abs(cab)) * step(0.0, o.x * cab);
    float nose = isCab * step(9.15, ax);
    float face = nose * step(0.6, abs(nl.x));
    float endFace = (1.0 - isCab) * step(9.6, ax) * step(0.6, abs(nl.x));
    float body2 = st > 1.5 && st < 2.5 ? 1.0 : 0.0;
    vec3 alb = mix(vec3(0.8, 0.82, 0.84), vec3(0.76, 0.78, 0.8), body2);
    alb = mix(alb, vec3(0.72, 0.73, 0.75), roof);
    // 출입문(한쪽 4개, 폭 1.3m)과 문 창, 옆창(문 사이 둘, 끝에 하나)
    float dd = min(abs(ax - 2.3), abs(ax - 6.9));
    float door = side * (1.0 - nose) * step(dd, 0.65) * bnd(y, 1.05, 3.0);
    float dwin = door * bnd(y, 1.72, 2.82) * bnd(dd, 0.07, 0.5);
    float pil = min(ax, abs(ax - 4.6));
    float win = side * (1.0 - nose) * step(0.75, dd) * bnd(y, 1.95, 2.85) * step(ax, 9.05) * step(0.12, pil);
    float gang = endFace * bnd(y, 1.95, 2.85) * step(az, 0.38);
    alb = mix(alb, vec3(0.6, 0.62, 0.65), door * (1.0 - body2));
    alb = mix(alb, vec3(0.3), door * (1.0 - step(0.035, abs(dd - 0.63))));       // 문 테두리
    alb = mix(alb, vec3(0.2), step(y, 1.02));
    vec3 deep = vec3(0.07, 0.08, 0.1);
    float ws = 0.0;                                                   // 앞유리
    float lamp = 0.0;
    if (st < 0.5) {
      // 2호선 2000호대: 은색 차체, 창 아래 초록 띠(문에서 끊김), 앞면은 초록 테두리 안의 검은 판
      alb = mix(alb, lc, side * (1.0 - nose) * step(0.72, dd) * bnd(y, 1.6, 1.8) * step(ax, 9.3));
      alb = mix(alb, lc, nose * (1.0 - face) * bnd(y, 1.2, 3.55));
      alb = mix(alb, lc, face * bnd(y, 1.2, 3.55) * step(az, 1.5));
      alb = mix(alb, deep, face * bnd(y, 1.32, 3.45) * step(az, 1.3));
      ws = face * bnd(y, 2.05, 3.35) * step(az, 1.22);
      lamp = face * bnd(y, 1.48, 1.68) * bnd(az, 0.82, 1.14);
    } else if (st < 1.5) {
      // 6호선 6000호대: 은색 차체, 창 아래 황토색 띠, 앞면 아래 황토색 띠와 큰 앞유리
      alb = mix(alb, lc, side * bnd(y, 1.55, 1.75) * step(ax, 9.3));
      alb = mix(alb, lc * 0.85, side * bnd(y, 1.45, 1.5) * step(ax, 9.3));
      alb = mix(alb, lc, nose * (bnd(y, 1.36, 1.56) + bnd(y, 1.62, 1.67)));
      ws = face * bnd(y, 2.05, 3.42) * step(az, 1.42);
      lamp = face * bnd(y, 1.74, 1.92) * bnd(az, 0.8, 1.2);
    } else if (st < 2.5) {
      // 코레일 321000호대: 연회색 차체, 문마다 위 빨강·아래 파랑, 앞면은 검은 판을 감싼 파랑·빨강 U자
      vec3 blue = vec3(0.13, 0.3, 0.72), red = vec3(0.86, 0.2, 0.26);
      alb = mix(alb, y > 2.05 ? red : blue, door * (1.0 - dwin));
      alb = mix(alb, blue, face * (bnd(az, 1.12, 1.42) * bnd(y, 1.5, 3.42) + bnd(y, 1.3, 1.5) * step(az, 1.42)));
      alb = mix(alb, red, face * bnd(y, 1.5, 1.98) * step(az, 1.12));
      alb = mix(alb, deep, face * bnd(y, 1.98, 3.42) * step(az, 1.12));
      alb = mix(alb, blue, nose * (1.0 - face) * bnd(y, 1.3, 3.42));
      ws = face * bnd(y, 2.1, 3.3) * step(az, 1.05);
      lamp = face * bnd(y, 1.62, 1.82) * bnd(az, 0.88, 1.08);
    } else {
      // 공항철도 2000호대: 은색 차체 아래쪽 남색 가는 줄, 운전실 앞은 통째로 파랑에 흰 줄
      vec3 navy = vec3(0.1, 0.22, 0.5), blue = vec3(0.12, 0.5, 0.86);
      alb = mix(alb, navy, side * (1.0 - nose) * (bnd(y, 1.08, 1.17) + bnd(y, 1.23, 1.28) + bnd(y, 1.33, 1.36)) * step(ax, 9.3));
      alb = mix(alb, blue, nose * step(1.0, y) * (1.0 - roof * 0.6));
      alb = mix(alb, vec3(0.95), face * (bnd(y, 1.5, 1.56) + bnd(y, 1.62, 1.67) + bnd(y, 1.73, 1.77)) * step(az, 1.5));
      ws = face * bnd(y, 2.05, 3.3) * step(az, 1.3);
      lamp = face * bnd(y, 1.84, 2.0) * bnd(az, 0.82, 1.2);
    }
    glass = max(max(win, dwin), max(gang, ws));
    lit2 = max(win, dwin);
    headL = lamp * step(abs(cab), 1.5);
    tailL = lamp * step(1.5, abs(cab));
    return mix(alb, vec3(0.1, 0.12, 0.16), glass);
  }`;

/** 열차 꼭짓점: 운전실 끝을 앞모양으로 휘고, 높이·폭을 배율 s 로 키운 뒤 앞뒤로 기울이고 돌린다 */
const trainVert = (scale: string) => /* glsl */ `
  attribute vec4 aInst; attribute vec4 aCol; attribute vec4 aMore; attribute float aPart; attribute float aEnd;
  varying vec3 vN; varying vec3 vNl; varying vec3 vO; varying vec4 vCol; varying vec4 vMore; varying float vDist; varying vec2 vXZ; varying float vPart;
  void main() {
    vec3 c = aInst.xyz;
    vec4 cv = viewMatrix * vec4(c, 1.0);
    float s = ${scale};
    float cab = aMore.y;
    float isCab = step(0.5, abs(cab)) * step(0.5, aEnd * sign(cab));
    vec3 p = position;
    p.x -= aEnd * isCab * 0.5 * smoothstep(1.9, 3.7, p.y);
    p.z *= 1.0 - 0.08 * isCab * abs(aEnd);
    p.yz *= s;
    float cp = cos(aMore.x), sp = sin(aMore.x);
    p = vec3(p.x * cp - p.y * sp, p.x * sp + p.y * cp, p.z);
    vec3 nn = vec3(normal.x * cp - normal.y * sp, normal.x * sp + normal.y * cp, normal.z);
    float cs = cos(aInst.w), sn = sin(aInst.w);
    vec3 w = vec3(c.x + p.x * cs - p.z * sn, c.y + p.y, c.z + p.x * sn + p.z * cs);
    vN = vec3(nn.x * cs - nn.z * sn, nn.y, nn.x * sn + nn.z * cs);
    vNl = normal; vO = position; vCol = aCol; vMore = aMore; vPart = aPart; vXZ = w.xz;
    vec4 mv = viewMatrix * vec4(w, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
/** 열차 조각: alpha 는 그 자리의 불투명도(지상 열차는 1, 지하 열차는 들여다보기 원 안에서만 보인다) */
const trainFrag = (alpha: string) => /* glsl */ `
  varying vec3 vN; varying vec3 vNl; varying vec3 vO; varying vec4 vCol; varying vec4 vMore; varying float vDist; varying vec2 vXZ; varying float vPart;
  ${PAINT}
  void main() {
    vec3 n = normalize(vN);
    float glass, lit2, headL, tailL;
    vec3 alb = trainAlbedo(vO, normalize(vNl), vPart, vCol.rgb, vCol.w, vMore.y, glass, lit2, headL, tailL);
    vec3 col = lit(alb, n) + vec3(1.0, 0.9, 0.68) * lit2 * uNight * 0.95;
    col = mix(col, vec3(1.0, 0.97, 0.85) * (0.8 + 0.5 * uNight), headL);
    col = mix(col, vec3(1.0, 0.12, 0.08) * (0.6 + 0.4 * uNight), tailL);
    float a = ${alpha};
    if (a < 0.01) discard;
    gl_FragColor = vec4(fogged(col, vDist), a);
  }`;

/** 삼각형 모음(위치와 칠 번호) */
class Mesher {
  pos: number[] = [];
  tone: number[] = [];
  quad(a: number[], b: number[], c: number[], d: number[], t: number) {
    this.pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) this.tone.push(t);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aTone', new THREE.Float32BufferAttribute(this.tone, 1));
    return g;
  }
}
const TONE = { wall: 0, cap: 1, floor: 2, mouth: 3, face: 4 };

/** 터파기(바닥·옹벽)와 터널 입구 벽, 그리고 땅을 뚫을 자리(깊이만 쓰는 판) */
function portals(lines: Line[]) {
  const solid = new Mesher();
  const hole = new Mesher();
  const tmp = [0, 0, 0];
  for (const l of lines)
    for (const { s0, sP } of findPortals(l)) {
      const n = Math.max(2, Math.ceil(Math.abs(sP - s0) / 4));
      const frames = Array.from({ length: n + 1 }, (_, i) => {
        const seg = pointAt(l.p, l.cum, s0 + ((sP - s0) * i) / n, tmp);
        const yaw = headingAt(l.p, seg);
        return { x: tmp[0], y: tmp[1], z: tmp[2], lx: -Math.sin(yaw), lz: Math.cos(yaw), yaw };
      });
      type F = (typeof frames)[number];
      const at = (f: F, lat: number, y: number, fwd = 0) => {
        const d = Math.sign(sP - s0) * fwd;
        return [f.x + f.lx * lat + f.lz * d, y, f.z + f.lz * lat - f.lx * d];
      };
      const W = TROUGH_W;
      const T = 0.5;
      for (let i = 0; i < n; i++) {
        const [a, b] = [frames[i], frames[i + 1]];
        solid.quad(at(a, -W, deckY(a.y) - 0.08), at(a, W, deckY(a.y) - 0.08), at(b, W, deckY(b.y) - 0.08), at(b, -W, deckY(b.y) - 0.08), TONE.floor);
        for (const sd of [-1, 1]) {
          solid.quad(at(a, sd * W, a.y - 0.3), at(b, sd * W, b.y - 0.3), at(b, sd * W, PARAPET), at(a, sd * W, PARAPET), TONE.wall);
          solid.quad(at(a, sd * (W + T), -0.4), at(b, sd * (W + T), -0.4), at(b, sd * (W + T), PARAPET), at(a, sd * (W + T), PARAPET), TONE.wall);
          solid.quad(at(a, sd * W, PARAPET), at(b, sd * W, PARAPET), at(b, sd * (W + T), PARAPET), at(a, sd * (W + T), PARAPET), TONE.cap);
        }
        hole.quad(at(a, -W, 0.06), at(a, W, 0.06), at(b, W, 0.06), at(b, -W, 0.06), 0);
      }
      // 입구 벽: 양쪽 기둥과 위 보, 그 안쪽은 어두운 터널 속
      const f = frames[n];
      const y0 = f.y - 0.3;
      const top = PARAPET + 0.5;
      const cube = (l0: number, l1: number, b0: number, b1: number, f0: number, f1: number, t: number) => {
        const v = (l: number, y: number, d: number) => at(f, l, y, d);
        solid.quad(v(l0, b0, f0), v(l1, b0, f0), v(l1, b1, f0), v(l0, b1, f0), t);
        solid.quad(v(l0, b0, f1), v(l1, b0, f1), v(l1, b1, f1), v(l0, b1, f1), t);
        solid.quad(v(l0, b0, f0), v(l0, b0, f1), v(l0, b1, f1), v(l0, b1, f0), t);
        solid.quad(v(l1, b0, f0), v(l1, b0, f1), v(l1, b1, f1), v(l1, b1, f0), t);
        solid.quad(v(l0, b1, f0), v(l1, b1, f0), v(l1, b1, f1), v(l0, b1, f1), t);
      };
      const mw = W - 0.4;
      cube(mw, W + 1.4, y0, top, -0.3, 1.2, TONE.face);
      cube(-W - 1.4, -mw, y0, top, -0.3, 1.2, TONE.face);
      cube(-mw, mw, f.y + MOUTH_H, top, -0.3, 1.2, TONE.face);
      const v = (l: number, y: number, d: number) => at(f, l, y, d);
      const yt = f.y + MOUTH_H;
      solid.quad(v(-mw, y0, 1.2), v(mw, y0, 1.2), v(mw, yt, 1.2), v(-mw, yt, 1.2), TONE.mouth);
    }
  return { solid: solid.geometry(), hole: hole.geometry(), any: solid.pos.length > 0 };
}

/** 터널 단면: 터널 구간을 따라 바닥과 양쪽 옆벽, 벽 윗면(잘린 지붕 자리). 꼭짓점은 중심선 위에 두고 aSide(옆 방향, 옆 배수, 높이 배수, 칠)로 셰이더가 폭·높이를 열차 배율에 맞춘다 */
function tunnels(lines: Line[]) {
  const pos: number[] = [];
  const side: number[] = [];
  const along: number[] = [];
  for (const l of lines) {
    const n = l.p.length / 3;
    for (let i = 0; i + 1 < n; i++) {
      const y0 = l.p[i * 3 + 1];
      const y1 = l.p[i * 3 + 4];
      if (l.kind[i] !== -1) continue;
      const a = [l.p[i * 3], Math.max(y0, UNDER_Y), l.p[i * 3 + 2]];
      const b = [l.p[i * 3 + 3], Math.max(y1, UNDER_Y), l.p[i * 3 + 5]];
      const yaw = Math.atan2(b[2] - a[2], b[0] - a[0]);
      const lx = -Math.sin(yaw);
      const lz = Math.cos(yaw);
      const quad = (q: [number, number][], kind: number) => {
        // q: 네 꼭짓점의 (옆 배수, 높이 배수), 처음 둘은 a 쪽, 나중 둘은 b 쪽
        const v = [a, a, b, b];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          pos.push(...v[k]);
          side.push(lx, lz, q[k][0], q[k][1] + kind * 10);
          along.push(k < 2 ? l.cum[i] : l.cum[i + 1]);
        }
      };
      quad([[-1, 0], [1, 0], [1, 0], [-1, 0]], 0);
      for (const sd of [-1, 1]) {
        quad([[sd, 0], [sd, 1], [sd, 1], [sd, 0]], 1);
        quad([[sd, 1], [sd * 1.12, 1], [sd * 1.12, 1], [sd, 1]], 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 4));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  return g;
}

/** 지하 노선 자리: 터널 조각을 따라 땅 위(LIGHT_Y)에 깔 점선 띠. 꼭짓점은 가운데선 위에 두고 셰이더가 화면 굵기에 맞춰 옆으로 편다 */
function routeLines(lines: Line[]) {
  const pos: number[] = [];
  const side: number[] = [];
  const norm: number[] = [];
  const info: number[] = [];
  const idx: number[] = [];
  for (const l of lines) {
    const c = new THREE.Color(l.color);
    const n = l.p.length / 3;
    let i = 0;
    while (i < n - 1) {
      if (l.kind[i] !== -1) {
        i++;
        continue;
      }
      let j = i;
      while (j < n - 1 && l.kind[j] === -1) j++;
      // 꼭짓점 i..j 가 한 터널 구간
      for (let v = i; v <= j; v++) {
        const a = Math.max(i, v - 1) * 3;
        const b = Math.min(j, v + 1) * 3;
        const dx = l.p[b] - l.p[a];
        const dz = l.p[b + 2] - l.p[a + 2];
        const len = Math.hypot(dx, dz) || 1;
        const q = pos.length / 3;
        for (const sd of [-1, 1]) {
          pos.push(l.p[v * 3], LIGHT_Y, l.p[v * 3 + 2]);
          side.push(sd);
          norm.push(-dz / len, dx / len);
          info.push(c.r, c.g, c.b, l.cum[v]);
        }
        if (v > i) idx.push(q - 2, q - 1, q, q - 1, q + 1, q);
      }
      i = j;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aNorm', new THREE.Float32BufferAttribute(norm, 2));
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
  g.setIndex(idx);
  return g;
}

/** 지하 열차 빛 조각의 셰이더. 조각은 길이 1·폭 2(가운데 폭 1 이 몸통, 바깥은 번짐)의 판이고, 인스턴스마다
 *  aA(x, z, 방향, 종류 0 칸 1 역에 고인 빛), aB(노선 색, 세기), aC(길이 m, 몸통 폭 m, 머리 칸이면 1, 0) 를 받는다.
 *  through 는 덮인 자리를 비쳐 보이는 판: 깊이를 카메라 쪽으로 카메라 거리의 REACH 배만큼 당겨, 그 안에 있는 것에 덮인 자리만 통과한다 */
const lightMat = (through: boolean) =>
  material({
    transparent: true,
    depthWrite: false,
    offset: 6,
    doubleSide: true,
    vertex: /* glsl */ `
      attribute vec4 aA; attribute vec4 aB; attribute vec4 aC;
      varying vec2 vQ; varying vec4 vB; varying float vKind; varying float vHead; varying float vDist; varying vec2 vXZ; varying float vFar;
      void main() {
        vec4 cv = viewMatrix * vec4(aA.x, ${LIGHT_Y.toFixed(1)}, aA.y, 1.0);
        float mpp = -cv.z / uProjK;                                   // 이 자리에서 한 픽셀(m)
        float pool = aA.w;
        // 칸은 칸 간격에서 틈(${GAP_M}m, 멀리서도 ${GAP_PX}픽셀, 칸 간격의 ${GAP_MAX * 100}% 까지)을 뺀 길이(trainLight.ts lightLen), 몸통 폭은 실제 폭 또는 화면 10픽셀(역에 고인 빛은 16픽셀)
        float len = pool > 0.5 ? aC.x : aC.x - min(${GAP_MAX.toFixed(2)} * aC.x, max(${GAP_M.toFixed(2)}, ${GAP_PX.toFixed(1)} * mpp));
        // 판 전체를 볼 만큼 멀면(FAR) 칸이 몇 픽셀뿐이라 화면 굵기를 1.5배로
        float far = smoothstep(${FAR[0].toFixed(1)}, ${FAR[1].toFixed(1)}, -cv.z);
        float wid = max(aC.y, mpp * (pool > 0.5 ? 16.0 : 10.0) * (1.0 + 0.5 * far));
        vec2 l = vec2(position.x * len, position.z * wid);
        float cs = cos(aA.z), sn = sin(aA.z);
        vec3 w = vec3(aA.x + l.x * cs - l.y * sn, ${LIGHT_Y.toFixed(1)}, aA.y + l.x * sn + l.y * cs);
        vQ = vec2(position.x * 2.0, position.z); vB = aB; vKind = pool; vHead = aC.z; vXZ = w.xz; vFar = far;
        vec4 mv = viewMatrix * vec4(w, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
        ${
          through
            ? `vec4 m2 = mv; m2.z = min(mv.z + mix(clamp(${REACH.toFixed(3)} * -mv.z, 20.0, 150.0), 3000.0, smoothstep(${FAR[0].toFixed(1)}, ${FAR[1].toFixed(1)}, -mv.z)), -21.0);
        vec4 c2 = projectionMatrix * m2;
        gl_Position.z = c2.z / c2.w * gl_Position.w;`
            : ''
        }
      }`,
    fragment: /* glsl */ `
      varying vec2 vQ; varying vec4 vB; varying float vKind; varying float vHead; varying float vDist; varying vec2 vXZ; varying float vFar;
      void main() {
        float lvl = vB.w * (1.0 - focusIn(vXZ));                      // 들여다보기 원 안에서는 열차 모형을 보이므로 끈다
        if (lvl < 0.004) discard;
        float x = abs(vQ.x), y = abs(vQ.y);                           // x: 0 가운데 ~ 1 끝, y: 0 가운데 ~ 1 번짐 바깥
        float pool = step(0.5, vKind);
        float body = (1.0 - smoothstep(mix(0.42, 0.1, pool), 0.5, y)) * (1.0 - smoothstep(mix(0.93, 0.55, pool), 1.0, x));
        float halo = (1.0 - smoothstep(0.5, 0.85, y)) * (1.0 - smoothstep(0.7, 1.0, x)) * (1.0 - body);
        // 몸통 가운데 줄은 흰빛 쪽으로 밝게, 머리 칸은 칸 전체가 조금 더 밝다(칸 세기 vB.w 도 머리 1 → 꼬리 0.6)
        vec3 lc = vB.rgb;
        float hot = (1.0 - smoothstep(0.0, 0.3, y)) * (0.28 - 0.03 * uNight) * (1.0 + 0.6 * vFar) * (1.0 - pool);
        vec3 col = mix(lc, vec3(1.0), hot + 0.12 * vHead);
        col *= 1.0 + 0.3 * uNight;
        float a = (body * mix(0.97, 0.5, pool) + halo * 0.25) * lvl;
        // 덮인 자리: 가까이서는 성긴 점무늬로 약하게(지붕·벽에 칠한 것이 아니라 그 밑이 비쳐 보이는 것으로 읽히게),
        // 판 전체를 볼 만큼 멀면(FAR) 나무·건물이 길을 거의 다 덮고 하나하나가 몇 픽셀이므로 덮은 것과 상관없이 보이는 자리와 같은 세기로
        ${through ? 'if (dither(gl_FragCoord.xy) > mix(0.5, 1.0, vFar)) discard; a *= mix(0.35, 1.0, vFar); col = mix(col, lc, 0.5 * (1.0 - vFar));' : ''}
        gl_FragColor = vec4(fogged(col, vDist), a);
      }`,
  });

export function makeRails(lines: Line[]) {
  const deck = ribbon();
  const piers: THREE.BufferGeometry[] = [];
  const tmp = [0, 0, 0];
  for (const l of lines) {
    const c = new THREE.Color(l.color);
    const info: [number, number, number, number] = [c.r, c.g, c.b, 0];
    // 지상·다리 조각마다 선로 띠를 만든다(터널 조각은 땅 위 점선, routeLines). 이웃 구간과 꼭짓점 하나를 함께 쓴다
    const n = l.p.length / 3;
    let start = 0;
    const under = (seg: number) => l.kind[seg] === -1;
    for (let i = 1; i < n; i++) {
      if (i < n - 1 && under(i) === under(start)) continue;
      if (!under(start)) {
        const seg = l.p.slice(start * 3, (i + 1) * 3);
        for (let k = 1; k < seg.length; k += 3) seg[k] = deckY(seg[k]);
        addRibbon(deck, seg, 9, info);
      }
      start = i;
    }
    for (let s = 30; s < l.cum[l.cum.length - 1]; s += 60) {
      const seg = pointAt(l.p, l.cum, s, tmp);
      if (tmp[1] < 4) continue;
      const g = new THREE.BoxGeometry(2.6, tmp[1], 6.5);
      g.rotateY(-headingAt(l.p, seg));
      g.translate(tmp[0], tmp[1] / 2 - 0.3, tmp[2]);
      piers.push(g);
    }
  }
  const group = new THREE.Group();

  // 지하 노선 자리: 땅 위 아주 옅은 노선 색 점선(12m 칠하고 12m 띄움). 화면에서 1.6픽셀보다 가늘어지지 않고, 가까이 다가갈수록 더 옅어져
  // 차선·횡단보도를 가리지 않는다(노면 표시와 흐름 띠보다 먼저 그려 그 밑에 깔린다). 건물·나무가 덮는다
  const routeMesh = new THREE.Mesh(
    routeLines(lines),
    material({
      transparent: true,
      depthWrite: false,
      offset: 5,
      doubleSide: true,
      vertex: /* glsl */ `
        attribute float aSide; attribute vec2 aNorm; attribute vec4 aInfo;
        varying vec4 vInfo; varying float vDist; varying vec2 vXZ; varying float vSide;
        void main() {
          vec4 cv = viewMatrix * vec4(position, 1.0);
          float hw = max(0.7, 1.0 * -cv.z / uProjK);
          vec3 p = position + vec3(aNorm.x, 0.0, aNorm.y) * aSide * hw;
          vInfo = aInfo; vXZ = p.xz; vSide = aSide;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        varying vec4 vInfo; varying float vDist; varying vec2 vXZ; varying float vSide;
        void main() {
          if (fract(vInfo.w / 24.0) > 0.5) discard;
          float a = (0.3 + 0.1 * uNight) * mix(0.55, 1.0, smoothstep(250.0, 1400.0, vDist)) * (1.0 - focusIn(vXZ));
          a *= 1.0 - smoothstep(0.55, 1.0, abs(vSide));
          gl_FragColor = vec4(fogged(vInfo.rgb * (1.0 + 0.3 * uNight), vDist), a);
        }`,
    }),
  );
  routeMesh.renderOrder = -3.2;
  routeMesh.frustumCulled = false;
  group.add(routeMesh);

  // 지상·터파기 선로. 터파기 안의 선로와 열차가 땅보다 먼저 그려지도록(땅을 뚫은 자리로 보이게) 땅보다 앞 순서에 둔다
  const deckMesh = new THREE.Mesh(
    ribbonGeometry(deck),
    material({
      vertex: VERT,
      doubleSide: true,
      uniforms: { uMajor: { value: pal.roadMajor } },
      fragment: /* glsl */ `
        uniform vec3 uMajor;
        varying vec2 vUV; varying vec4 vInfo; varying float vDist; varying vec2 vXZ;
        void main() {
          float rail = step(0.25, abs(vUV.x)) * step(abs(vUV.x), 0.36) + step(0.62, abs(vUV.x)) * step(abs(vUV.x), 0.73);
          float tie = step(0.5, fract(vUV.y / 2.4)) * step(abs(vUV.x), 0.86);
          vec3 alb = uMajor * (0.8 - 0.08 * tie);
          alb = mix(alb, uMajor * 0.5, rail);
          alb = mix(alb, vInfo.rgb, step(0.9, abs(vUV.x)));
          vec3 col = lit(alb, vec3(0.0, 1.0, 0.0)) + vInfo.rgb * step(0.9, abs(vUV.x)) * uNight * 0.6;
          gl_FragColor = vec4(fogged(col, vDist), 1.0);
        }`,
    }),
  );
  deckMesh.frustumCulled = false;
  deckMesh.renderOrder = -12;
  group.add(deckMesh);
  if (piers.length) {
    const pier = new THREE.Mesh(
      merge(piers),
      material({
        uniforms: { uMajor: { value: pal.roadMajor } },
        vertex: /* glsl */ `varying vec3 vN; varying float vDist;
          void main() { vN = normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragment: /* glsl */ `uniform vec3 uMajor; varying vec3 vN; varying float vDist;
          void main() { gl_FragColor = vec4(fogged(lit(uMajor * 0.8, normalize(vN)), vDist), 1.0); }`,
      }),
    );
    pier.frustumCulled = false;
    group.add(pier);
  }

  // ── 터파기와 터널 입구 ──
  // 옹벽·바닥·입구 벽을 땅보다 먼저 그리고, 그 위 땅높이에 깊이만 쓰는 판을 놓아 땅·도로가 그 자리를 덮지 못하게 한다(땅에 구멍을 낸 효과)
  const pt = portals(lines);
  if (pt.any) {
    const walls = new THREE.Mesh(
      pt.solid,
      material({
        doubleSide: true,
        vertex: /* glsl */ `attribute float aTone; varying vec3 vW; varying float vTone; varying float vDist;
          void main() { vW = position; vTone = aTone; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragment: /* glsl */ `varying vec3 vW; varying float vTone; varying float vDist;
          void main() {
            vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
            vec3 alb = vTone < 0.5 ? vec3(0.7, 0.69, 0.66) : vTone < 1.5 ? vec3(0.84, 0.83, 0.8) : vTone < 2.5 ? vec3(0.42, 0.41, 0.4) : vTone < 3.5 ? vec3(0.02, 0.022, 0.026) : vec3(0.64, 0.63, 0.6);
            alb *= 1.0 - 0.08 * step(0.5, fract(vW.y / 1.2)) * step(vTone, 0.5);   // 옹벽 거푸집 줄
            vec3 col = vTone > 2.5 && vTone < 3.5 ? alb : lit(alb, n);
            gl_FragColor = vec4(fogged(col, vDist), 1.0);
          }`,
      }),
    );
    walls.renderOrder = -12;
    walls.frustumCulled = false;
    const hole = new THREE.Mesh(pt.hole, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
    hole.renderOrder = -11;
    hole.frustumCulled = false;
    group.add(walls, hole);
  }

  // ── 터널 단면(들여다보기 둘레에서만) ──
  const tunnelMesh = new THREE.Mesh(
    tunnels(lines),
    material({
      under: true,
      doubleSide: true,
      vertex: /* glsl */ `
        attribute vec4 aSide; attribute float aAlong;
        varying float vKind; varying vec2 vQ; varying float vDist; varying vec2 vXZ; varying float vAlong;
        void main() {
          vec4 cv = viewMatrix * vec4(position, 1.0);
          float s = zoomScale(-cv.z, 3.2, 7.0, 1.4, 5.5);
          float kind = floor((aSide.w + 0.5) / 10.0);
          float up = aSide.w - kind * 10.0;
          vec3 w = position + vec3(aSide.x, 0.0, aSide.y) * aSide.z * (2.3 + 2.15 * s) + vec3(0.0, up * 4.2 * s, 0.0);
          vKind = kind; vQ = vec2(aSide.z, up); vXZ = w.xz; vAlong = aAlong;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        varying float vKind; varying vec2 vQ; varying float vDist; varying vec2 vXZ; varying float vAlong;
        void main() {
          float fi = focusIn(vXZ);
          if (fi < 0.01) discard;
          vec3 col;
          float a;
          if (vKind < 0.5) {
            // 바닥: 콘크리트 도상과 두 선로
            float x = abs(vQ.x);
            float rail = step(0.18, abs(x - 0.47)) ;
            col = mix(vec3(0.36, 0.37, 0.4), vec3(0.24, 0.25, 0.28), step(abs(x - 0.47), 0.2));
            col = mix(col, vec3(0.62, 0.63, 0.66), (1.0 - rail) * step(0.16, abs(x - 0.47)));
            a = 0.92;
          } else if (vKind < 1.5) {
            // 옆벽: 아래가 어둡고, 벽 위쪽에 10m 마다 조명
            col = mix(vec3(0.42, 0.43, 0.46), vec3(0.66, 0.66, 0.68), vQ.y);
            float lamp = step(0.82, vQ.y) * step(vQ.y, 0.9) * step(fract(vAlong / 10.0), 0.18);
            col = mix(col, vec3(1.0, 0.94, 0.78), lamp);
            a = 0.62 + 0.2 * vQ.y;
          } else {
            col = vec3(0.86, 0.84, 0.8);                                        // 잘린 지붕 자리
            a = 0.95;
          }
          col *= 0.8 + 0.2 * (1.0 - uNight);
          gl_FragColor = vec4(fogged(col, vDist), a * fi);
        }`,
    }),
  );
  tunnelMesh.renderOrder = -4.65;
  tunnelMesh.frustumCulled = false;
  group.add(tunnelMesh);

  // ── 열차 ──
  // 지상·터파기 열차: 깊이를 보며 땅보다 먼저 그린다(터파기 안의 칸은 뚫린 자리로 보이고, 입구를 지난 부분은 땅·입구 벽에 가린다).
  // 멀리서 키워 그릴 때 터파기 안(바닥이 땅보다 낮은 칸)은 키우지 않아 땅 위로 솟지 않게 한다
  const car = trainCar();
  const { geo, arr, attr } = instanced(car, MAX_CARS, { aInst: 4, aCol: 4, aMore: 4 });
  const trainMesh = new THREE.Mesh(
    geo,
    material({
      vertex: trainVert('aInst.y < 0.0 ? 1.5 : zoomScale(-cv.z, 3.2, 5.0, 1.5, 4.5)'),
      fragment: trainFrag('1.0'),
    }),
  );
  trainMesh.frustumCulled = false;
  trainMesh.renderOrder = -12;
  group.add(trainMesh);

  // 터널 안 열차 모형: 지하 들여다보기 원 안에서만 지하 층에 그린다(원 밖은 땅 위 빛으로 그린다)
  const sub = instanced(car, MAX_CARS, { aInst: 4, aCol: 4, aMore: 4 });
  const subMat = material({
    under: true,
    vertex: trainVert('zoomScale(-cv.z, 3.2, 7.0, 1.4, 5.5)'),
    fragment: trainFrag('focusIn(vXZ)'),
  });
  const subMesh = new THREE.Mesh(sub.geo, subMat);
  subMesh.renderOrder = -4.2;
  subMesh.frustumCulled = false;
  group.add(subMesh);
  // 깊이를 보지 않고 그리므로 먼 칸부터 그려야 가까운 칸이 먼 칸의 끝면을 덮는다. 카메라는 그릴 때 받아 두고 다음 놓기에 쓴다
  let cam: THREE.Camera | null = null;
  subMesh.onBeforeRender = (_r, _s, c) => (cam = c);
  const order = Array.from({ length: MAX_CARS }, (_, i) => i);
  const far = new Float32Array(MAX_CARS);
  const tmpSub = { aInst: new Float32Array(MAX_CARS * 4), aCol: new Float32Array(MAX_CARS * 4), aMore: new Float32Array(MAX_CARS * 4) };
  function sortSub(m: number) {
    if (!cam || m < 2) return;
    const { x, y, z } = cam.position;
    const a = sub.arr.aInst;
    for (let i = 0; i < m; i++) far[i] = (a[i * 4] - x) ** 2 + (a[i * 4 + 1] - y) ** 2 + (a[i * 4 + 2] - z) ** 2;
    const idx = order.slice(0, m).sort((p, q) => far[q] - far[p]);
    for (const k of ['aInst', 'aCol', 'aMore'] as const) {
      tmpSub[k].set(sub.arr[k].subarray(0, m * 4));
      idx.forEach((from, to) => sub.arr[k].set(tmpSub[k].subarray(from * 4, from * 4 + 4), to * 4));
    }
  }

  // 지하 열차 빛: 칸 띠와 역에 고인 빛. 보이는 자리는 그대로, 가까이 덮인 자리는 약하게(through) 그린다
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, -1, 0.5, 0, -1, 0.5, 0, 1, -0.5, 0, 1], 3));
  quad.setIndex([0, 2, 1, 0, 3, 2]);
  const light = instanced(quad, MAX_LIGHTS, { aA: 4, aB: 4, aC: 4 });
  // 보이는 자리에 그린 빛은 스텐실에 1 을 남기고, 덮인 자리 판은 1 이 아닌 곳에만 그린다(보이는 빛 위에 점무늬가 겹치지 않게)
  const lightMatMain = lightMat(false);
  Object.assign(lightMatMain, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
  const lightMesh = new THREE.Mesh(light.geo, lightMatMain);
  const throughMat = lightMat(true);
  Object.assign(throughMat, { depthFunc: THREE.LessDepth, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc });
  const throughMesh = new THREE.Mesh(light.geo, throughMat);
  // 노선 점선(−3.2) 다음, 흐름 띠(−3)·노면 표시(−2.6) 앞에 그려 차선·횡단보도가 빛 위에 칠해진 것으로 보이게 한다(빛은 길 밑에서 올라온다)
  lightMesh.renderOrder = -3.1;
  throughMesh.renderOrder = -3.05;
  for (const m of [lightMesh, throughMesh]) (m.frustumCulled = false), group.add(m);

  const byId = new Map(lines.map((l) => [l.id, { l, c: new THREE.Color(l.color), st: STYLE[l.id] ?? 0, portals: findPortals(l).map((p) => p.sP) }]));
  /** 열차를 놓고, 고르기·따라가기에 쓸 열차별 가운데 칸 위치를 돌려준다 */
  function update(trains: TrainPos[]): TrainSpot[] {
    let n = 0;
    let m = 0;
    let q = 0;
    const focus = env.uFocus.value.w > 0.01;
    const spots: TrainSpot[] = [];
    const putLight = (x: number, z: number, yaw: number, pool: number, c: THREE.Color, lvl: number, len: number, wid: number, head: number) => {
      if (q >= MAX_LIGHTS || lvl <= 0) return;
      light.arr.aA.set([x, z, yaw, pool], q * 4);
      light.arr.aB.set([c.r, c.g, c.b, lvl], q * 4);
      light.arr.aC.set([len, wid, head, 0], q * 4);
      q++;
    };
    // 역에 서 있는 지하 열차: 승강장 길이(편성 길이 + 10m)만큼 빛이 고인다. 칸 빛보다 먼저 놓아 그 밑에 깔리게 한다
    for (const t of trains) {
      const lv = poolLevel(t.at);
      if (lv <= 0) continue;
      const { l, c } = byId.get(t.line)!;
      if (!carPose(l, t.s).under) continue;
      const seg = pointAt(l.p, l.cum, t.s, tmp);
      putLight(tmp[0], tmp[2], headingAt(l.p, seg), 1, c, lv * 0.75, l.cars * CAR_LEN + 10, 13, 0);
    }
    for (const t of trains) {
      const { l, c, st, portals } = byId.get(t.line)!;
      const len = l.cum[l.cum.length - 1];
      const mid = Math.floor(l.cars / 2);
      for (const { s, k, light: lit } of carSpans(l.cars, t.s, t.dir)) {
        if (s < 0 || s > len) continue;
        const seg = pointAt(l.p, l.cum, s, tmp);
        const yaw = headingAt(l.p, seg);
        const off = t.dir ? -2.3 : 2.3; // 방향별 선로
        const x = tmp[0] - Math.sin(yaw) * off;
        const z = tmp[2] + Math.cos(yaw) * off;
        const y = tmp[1];
        const pose = carPose(l, s);
        const under = pose.under;
        // 운전실: 맨 앞 칸의 진행 방향 끝(전조등), 맨 뒤 칸의 반대 끝(후미등). 부호는 그 끝이 +x 쪽인지
        const ahead = t.dir ? -1 : 1;
        const cab = k === 0 ? ahead : k === l.cars - 1 ? -2 * ahead : 0;
        if (k === mid || (k === 0 && l.cars === 1)) spots.push({ key: t.key, line: t.line, dir: t.dir, x, y: under ? UNDER_Y : y, z, under });
        if (under) {
          putLight(x, z, yaw, 0, c, lit * portalRamp(s, portals), 20, 3.2, k === 0 ? 1 : 0);
          if (focus && m < MAX_CARS) {
            const pitch = Math.atan2(Math.max(pose.yb, UNDER_Y) - Math.max(pose.ya, UNDER_Y), CAR_LEN);
            sub.arr.aInst.set([x, Math.max(y, UNDER_Y), z, yaw], m * 4);
            sub.arr.aCol.set([c.r, c.g, c.b, st], m * 4);
            sub.arr.aMore.set([pitch, cab, 0, 0], m * 4);
            m++;
          }
        } else if (n < MAX_CARS) {
          arr.aInst.set([x, deckY(y), z, yaw], n * 4);
          arr.aCol.set([c.r, c.g, c.b, st], n * 4);
          arr.aMore.set([pose.pitch, cab, 0, 0], n * 4);
          n++;
        }
      }
    }
    geo.instanceCount = n;
    sub.geo.instanceCount = m;
    light.geo.instanceCount = q;
    sortSub(m);
    for (const a of [attr, sub.attr]) {
      a.aInst.needsUpdate = true;
      a.aCol.needsUpdate = true;
      a.aMore.needsUpdate = true;
    }
    for (const a of Object.values(light.attr)) a.needsUpdate = true;
    return spots;
  }
  /** 지하 노선 점선·빛·터널·열차를 감추거나 보인다(지상 선로와 터널 입구는 그대로 둔다) */
  function setUnderVisible(on: boolean) {
    routeMesh.visible = on;
    lightMesh.visible = on;
    throughMesh.visible = on;
    tunnelMesh.visible = on;
    subMesh.visible = on;
    trainMesh.visible = on;
  }
  return { group, update, setUnderVisible };
}
