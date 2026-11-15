// 차. 승용차(세단·SUV·경차·승합)·택시와 버스(시내·광역·마을)를 종류마다 인스턴싱으로 그린다.
// 승용차는 옆모습(보닛·앞유리·지붕선)을 따라 둥근 단면을 앞뒤로 이어 붙인 몸통과 위로 좁아지는 유리 캐빈, 버스는 옆모습 다각형을 폭 방향으로
// 밀어내고 앞뒤 모서리를 둥글린 차체로 만들고, 차축 하나에 바퀴 둘을 붙인 원기둥을 단다.
// 전조등·후미등·그릴·창·문은 셰이더가 차 안 좌표로 칠한다. 색은 한국 도로에 많은 흰색·회색·검정 위주, 택시는 흰색·은색과 주황(꽃담황토색)·검정,
// 버스는 서울 버스 도색(간선 파랑, 지선 초록, 광역 빨강, 마을 연두)이다. 전조등과 브레이크등은 스스로 빛나고, 밤에는 길 위에 빛 번짐을 덧그린다.
import * as THREE from 'three';
import type { Cars } from '../sim/cars.ts';
import { material } from './env.ts';
import { BUS_KINDS } from '../sim/buses.ts';
import { instanced, merge, part } from './util.ts';

type Pt = [number, number];

/** 옆모습 다각형(x 앞, y 위)을 폭 방향(z)으로 밀어낸 도형. hw(y, x) 는 반폭(위로 갈수록, 앞뒤 끝으로 갈수록 좁혀 둥글게 보이게 한다) */
function prism(pts: Pt[], hw: (y: number, x: number) => number): THREE.BufferGeometry {
  const ring = THREE.ShapeUtils.isClockWise(pts.map(([x, y]) => new THREE.Vector2(x, y))) ? [...pts].reverse() : pts;
  const P = ([x, y]: Pt, side: number) => [x, y, side * hw(y, x)];
  const pos: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    pos.push(...P(a, 1), ...P(a, -1), ...P(b, -1), ...P(a, 1), ...P(b, -1), ...P(b, 1));
  }
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(ring.map(([x, y]) => new THREE.Vector2(x, y)), [])) {
    const [a, b, c] = [ring[i], ring[j], ring[k]];
    const ccw = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0;
    const [p, q] = ccw ? [b, c] : [c, b];
    pos.push(...P(a, 1), ...P(p, 1), ...P(q, 1), ...P(a, -1), ...P(q, -1), ...P(p, -1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/** 옆모습 다각형을 x 에서 세로로 자른 아래·위 끝 y(없으면 null) */
function span(poly: Pt[], x: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    if ((x < ax && x < bx) || (x > ax && x > bx) || ax === bx) continue;
    const y = ay + ((by - ay) * (x - ax)) / (bx - ax);
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  return hi > lo ? [lo, hi] : null;
}
/** 앞뒤 끝 둥글리기: 반길이 len 인 차의 x 자리에서 반폭에 곱할 값(끝에서 end, 끝에서 r 안쪽부터 1) */
const rounded = (x: number, len: number, end: number, r: number) => {
  const u = Math.max(0, Math.abs(x) - (len - r)) / r;
  return 1 - (1 - end) * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
};
/**
 * 앞뒤(x)로 늘어놓은 단면을 이어 붙인 몸통. sec(x) 는 반쪽 단면 [z, y] 열(옆 아래 → 위 가운데, z 는 0 이 가운데)이고 반대쪽은 거울로 만든다.
 * 단면끼리 꼭짓점을 함께 써서 법선을 매끈하게 구하고, 앞뒤 끝은 단면을 부채꼴로 막는다(평평한 면이라 등·그릴을 칠할 수 있다)
 */
function loft(xs: number[], sec: (x: number) => Pt[]): THREE.BufferGeometry {
  const rings = xs.map((x) => {
    const h = sec(x);
    return [...h.map(([z, y]) => [x, y, z]), ...h.slice(0, -1).reverse().map(([z, y]) => [x, y, -z])];
  });
  const R = rings[0].length;
  const pos = rings.flat(2);
  const idx: number[] = [];
  for (let s = 0; s + 1 < rings.length; s++)
    for (let j = 0; j + 1 < R; j++) {
      const a = s * R + j;
      idx.push(a, a + R, a + R + 1, a, a + R + 1, a + 1);
    }
  const skin = new THREE.BufferGeometry();
  skin.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  skin.setIndex(idx);
  skin.computeVertexNormals();
  const caps: number[] = [];
  for (const [ring, front] of [[rings[0], false], [rings[rings.length - 1], true]] as const) {
    const c = [ring[0][0], ring.reduce((m, p) => m + p[1], 0) / R, 0];
    for (let j = 0; j + 1 < R; j++) caps.push(...c, ...(front ? [...ring[j + 1], ...ring[j]] : [...ring[j], ...ring[j + 1]]));
  }
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(caps, 3));
  cap.computeVertexNormals();
  return merge([skin.toNonIndexed(), cap]);
}
/** 높이 y0 에서 h0, y1 에서 h1 인 반폭 */
const taper = (y0: number, h0: number, y1: number, h1: number) => (y: number) => h0 + (h1 - h0) * Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
/** 차축마다 바퀴 한 쌍: 양 끝 면이 차체 옆에 붙은 바퀴로 보이는 원기둥. aColor 에 차축 위치를 넣어 휠 캡을 칠한다 */
const axles = (xs: number[], r: number, half: number) =>
  xs.map((x) => part(new THREE.CylinderGeometry(r, r, half * 2, 8, 1).rotateX(Math.PI / 2).translate(x, r, 0), 4, [x, r, 0]));
/** 버스 앞 양쪽에 늘어진 사이드미러(팔과 거울) */
const mirrors = (x: number, y: number, hw: number) =>
  [1, -1].flatMap((s) => [
    part(box(0.5, 0.07, 0.07, 0, 0, 0).rotateZ(-0.6).translate(x + 0.12, y + 0.25, s * (hw + 0.05)), 7),
    part(box(0.1, 0.5, 0.24, x + 0.32, y - 0.1, s * (hw + 0.12)), 7),
  ]);

interface Look {
  /** 반길이, 반폭, 바퀴 반지름 */
  len: number;
  hw: number;
  r: number;
  axle: [number, number];
  /** 전조등 y0·y1, 후미등 y0·y1 */
  lamp: [number, number, number, number];
  /** 승용차: 그릴 y0·y1. 버스: 옆창 y0·y1, 앞유리 y0·y1 */
  win: [number, number, number, number];
  /** 버스 오른쪽 문 두 곳 [x0, x1, x0, x1] */
  door?: [number, number, number, number];
}

// 승용차 옆모습(x 앞, y 위, m). 세단은 쏘나타·K5, SUV 는 투싼·쏘렌토, 경차는 모닝·캐스퍼, 승합은 카니발 크기다.
// body 는 바퀴 위 몸통(범퍼·보닛·트렁크 곡선), cabin 은 유리 캐빈(앞유리·지붕·뒷유리 곡선)이다
const CAR_SHAPES = {
  sedan: {
    body: [[-2.42, 0.3], [2.38, 0.3], [2.47, 0.42], [2.46, 0.6], [2.36, 0.72], [1.9, 0.8], [1.15, 0.9], [-1.62, 0.97], [-2.15, 0.96], [-2.38, 0.88], [-2.46, 0.7], [-2.45, 0.45]] as Pt[],
    cabin: [[-1.75, 0.92], [1.22, 0.88], [0.95, 1.02], [0.45, 1.34], [0.1, 1.43], [-0.75, 1.45], [-1.25, 1.36], [-1.75, 1.0]] as Pt[],
    look: { len: 2.47, hw: 0.93, r: 0.33, axle: [1.45, -1.4], lamp: [0.6, 0.74, 0.66, 0.86], win: [0.4, 0.58, 0, 0] } as Look,
    roof: 1.45,
  },
  suv: {
    body: [[-2.3, 0.36], [2.26, 0.36], [2.37, 0.5], [2.37, 0.78], [2.25, 0.94], [1.7, 1.02], [1.3, 1.08], [-2.22, 1.1], [-2.34, 0.96], [-2.37, 0.6]] as Pt[],
    cabin: [[-2.2, 1.05], [1.35, 1.04], [1.05, 1.25], [0.5, 1.6], [0.1, 1.67], [-1.9, 1.68], [-2.18, 1.5], [-2.24, 1.14]] as Pt[],
    look: { len: 2.37, hw: 0.95, r: 0.37, axle: [1.42, -1.35], lamp: [0.78, 0.92, 0.86, 1.02], win: [0.46, 0.74, 0, 0] } as Look,
    roof: 1.68,
  },
  kei: {
    body: [[-1.76, 0.28], [1.72, 0.28], [1.82, 0.42], [1.8, 0.68], [1.6, 0.86], [1.1, 0.92], [-1.7, 0.94], [-1.8, 0.78], [-1.81, 0.45]] as Pt[],
    cabin: [[-1.72, 0.9], [1.12, 0.88], [0.8, 1.15], [0.42, 1.45], [0.1, 1.5], [-1.5, 1.5], [-1.7, 1.3], [-1.74, 0.98]] as Pt[],
    look: { len: 1.82, hw: 0.8, r: 0.29, axle: [1.18, -1.18], lamp: [0.58, 0.72, 0.62, 0.86], win: [0.36, 0.54, 0, 0] } as Look,
    roof: 1.5,
  },
  van: {
    body: [[-2.55, 0.32], [2.5, 0.32], [2.61, 0.48], [2.6, 0.8], [2.4, 0.98], [1.8, 1.08], [-2.48, 1.1], [-2.58, 0.9], [-2.59, 0.52]] as Pt[],
    cabin: [[-2.48, 1.04], [1.85, 1.04], [1.45, 1.3], [0.85, 1.72], [0.4, 1.78], [-2.3, 1.8], [-2.48, 1.6], [-2.52, 1.16]] as Pt[],
    look: { len: 2.61, hw: 1.0, r: 0.36, axle: [1.6, -1.5], lamp: [0.74, 0.9, 0.8, 1.04], win: [0.42, 0.7, 0, 0] } as Look,
    roof: 1.8,
  },
};
/** 승용차 앞뒤 끝의 반폭 비율(위에서 보면 모서리가 둥글다)과 둥글린 길이(m) */
const CAR_END = 0.8;
const CAR_ROUND = 0.6;
/** 몸통 단면 자리(반길이에 대한 비율). 앞뒤 끝 둥근 곳을 촘촘히 */
const BODY_X = [-1, -0.95, -0.83, -0.55, -0.15, 0.25, 0.6, 0.84, 0.95, 1];
type CarShape = (typeof CAR_SHAPES)[keyof typeof CAR_SHAPES];
function car(s: CarShape, taxi = false) {
  const { body, cabin, look, roof } = s;
  const L = look.len;
  const w = (x: number) => look.hw * rounded(x, L, CAR_END, CAR_ROUND);
  // 몸통 단면: 아래는 안으로 들어가고(바퀴 집 아래), 허리가 가장 넓고, 어깨에서 다시 들어가 보닛·트렁크 위로 살짝 볼록하다
  const bodySec = (x: number): Pt[] => {
    const [yb, yt] = span(body, Math.max(-L + 0.03, Math.min(L - 0.03, x))) ?? [0.4, 0.6];
    const hw = w(x);
    return [[hw * 0.93, yb], [hw, yb + (yt - yb) * 0.5], [hw * 0.93, yt], [0, yt + 0.035]];
  };
  // 캐빈 단면: 창 아래(허리선)에서 지붕으로 갈수록 좁아진다
  const [c0, c1] = [Math.min(...cabin.map((p) => p[0])), Math.max(...cabin.map((p) => p[0]))];
  const cabinX = Array.from({ length: 7 }, (_, k) => c0 + 0.02 + ((c1 - c0 - 0.04) * k) / 6);
  const cabinSec = (x: number): Pt[] => {
    const [yb, yt] = span(cabin, x) ?? [0.9, 0.95];
    const hw = w(x);
    return [[hw * 0.88, yb], [hw * 0.64, yt], [0, yt + 0.03]];
  };
  return merge([
    part(loft(BODY_X.map((f) => f * L), bodySec), 0),
    part(loft(cabinX, cabinSec), 1),
    ...axles(look.axle, look.r, look.hw + 0.03),
    // 서울 택시 지붕 표시등
    ...(taxi ? [part(box(0.34, 0.24, 0.62, -0.25, roof + 0.1, 0), 5)] : []),
  ]);
}

// 버스 옆모습. 시내버스는 저상버스(11.4m, 지붕에 가스통·배터리 덮개), 광역은 고상 고속버스형(12m), 마을버스는 중형(7.4m)
const BUS = {
  body: [[-5.7, 0.32], [5.62, 0.32], [5.72, 0.58], [5.74, 1.0], [5.66, 2.95], [5.45, 3.18], [-5.55, 3.18], [-5.7, 3.0], [-5.72, 0.6]] as Pt[],
  look: { len: 5.74, hw: 1.245, r: 0.5, axle: [3.2, -2.7], lamp: [0.5, 0.78, 0.55, 1.25], win: [1.12, 2.7, 0.92, 2.86], door: [4.32, 5.36, -1.6, -0.42] } as Look,
};
const COACH = {
  body: [[-6.0, 0.4], [5.92, 0.4], [6.02, 0.65], [6.04, 1.55], [5.85, 3.15], [5.45, 3.5], [-5.8, 3.5], [-6.0, 3.25], [-6.02, 0.7]] as Pt[],
  look: { len: 6.04, hw: 1.245, r: 0.52, axle: [3.6, -2.4], lamp: [0.6, 0.85, 0.7, 1.3], win: [1.78, 3.12, 1.6, 3.2], door: [4.62, 5.5, 99, 99] } as Look,
};
const MINI = {
  body: [[-3.7, 0.32], [3.62, 0.32], [3.72, 0.58], [3.72, 1.0], [3.52, 2.72], [3.25, 2.92], [-3.6, 2.92], [-3.72, 2.72], [-3.72, 0.6]] as Pt[],
  look: { len: 3.72, hw: 1.1, r: 0.42, axle: [2.15, -2.05], lamp: [0.5, 0.74, 0.55, 1.1], win: [1.12, 2.5, 0.95, 2.6], door: [2.55, 3.36, -0.95, -0.1] } as Look,
};
/** 버스 앞뒤 끝의 반폭 비율 */
const BUS_END = 0.92;
function busShape(b: typeof BUS, top: number, pod: boolean) {
  const { body, look } = b;
  return merge([
    // 위에서 보면 앞뒤 모서리가 둥글다(0.5m 안쪽부터 반폭의 92%까지)
    part(prism(body, (y, x) => taper(top - 0.3, look.hw, top, look.hw - 0.09)(y) * rounded(x, look.len, BUS_END, 0.5)), 0),
    ...(pod ? [part(box(6.0, 0.36, 2.0, 0.9, top + 0.16, 0), 0)] : []),
    ...mirrors(look.len, top - 0.55, look.hw),
    ...axles(look.axle, look.r, look.hw + 0.03),
  ]);
}

/** 종류별 도형. 시험이 꼭짓점 수를 잰다 */
export const SHAPES = {
  sedan: () => car(CAR_SHAPES.sedan),
  suv: () => car(CAR_SHAPES.suv),
  kei: () => car(CAR_SHAPES.kei),
  van: () => car(CAR_SHAPES.van),
  taxi: () => car(CAR_SHAPES.sedan, true),
  bus: () => busShape(BUS, 3.18, true),
  coach: () => busShape(COACH, 3.5, false),
  minibus: () => busShape(MINI, 2.92, false),
};

/** 승용차 차종 비율 [세단, SUV, 경차, 승합(카니발·스타리아)]. 길 위의 차(등록 대수) 기준 어림값 */
export const CAR_MIX = [0.4, 0.38, 0.1, 0.12];
/** 차의 색 값(0~1 균등)과 섞이지 않게 다른 자리 수로 차종을 고른다 */
export function bodyType(t: number): number {
  let u = (t * 7919) % 1;
  for (let k = 0; k < CAR_MIX.length - 1; k++) {
    if (u < CAR_MIX[k]) return k;
    u -= CAR_MIX[k];
  }
  return CAR_MIX.length - 1;
}

/** 승용차 색 [누적 비율 끝, 색]. 흰색(진주색 포함)·회색·검정이 4분의 3쯤이고 은색·파랑·빨강·기타가 나머지다 */
const CAR_COLORS: [number, [number, number, number]][] = [
  [0.33, [0.94, 0.94, 0.93]],
  [0.45, [0.34, 0.36, 0.39]],
  [0.56, [0.56, 0.58, 0.61]],
  [0.73, [0.1, 0.105, 0.115]],
  [0.83, [0.76, 0.78, 0.8]],
  [0.91, [0.16, 0.24, 0.42]],
  [0.95, [0.62, 0.13, 0.12]],
  [0.975, [0.55, 0.47, 0.38]],
  [1.01, [0.2, 0.3, 0.26]],
];
const glslColors = (list: [number, [number, number, number]][]) =>
  list.map(([p, c]) => `if (t < ${p.toFixed(3)}) return vec3(${c.map((v) => v.toFixed(3)).join(', ')});`).join('\n    ');
// 택시: 개인택시는 대개 흰색·은색, 법인택시 일부는 꽃담황토색(주황), 모범택시는 검정
const TAXI_COLORS: [number, [number, number, number]][] = [
  [0.6, [0.95, 0.95, 0.94]],
  [0.75, [0.78, 0.8, 0.82]],
  [0.92, [0.93, 0.56, 0.17]],
  [1.01, [0.09, 0.09, 0.1]],
];

const VERT = /* glsl */ `
  attribute vec4 aInst; attribute vec4 aMore;   // aMore = (브레이크, 색 값 또는 버스 종류, 나타남, 0 승용차·1 버스·2 택시)
  attribute float aPart; attribute vec3 aColor;
  uniform float uPick;
  varying vec3 vN; varying vec3 vNl; varying float vPart; varying vec4 vMore; varying float vDist; varying vec3 vO; varying float vPicked; varying vec3 vAux;
  void main() {
    vec4 cv = viewMatrix * vec4(aInst.xyz, 1.0);
    float picked = step(abs(float(gl_InstanceID) - uPick), 0.5);
    float s = zoomScale(-cv.z, 4.5, 9.0, 1.3, 4.2) * aMore.z * (1.0 + 0.15 * picked);
    vec3 p = position * s;
    float cs = cos(aInst.w), sn = sin(aInst.w);
    vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, aInst.y + p.y + 0.05, aInst.z + p.x * sn + p.z * cs);
    vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
    vNl = normal; vPart = aPart; vMore = aMore; vO = position; vPicked = picked; vAux = aColor;
    vec4 mv = viewMatrix * vec4(w, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */ `
  uniform vec3 uBus[4];
  uniform vec4 uDim;   // 반길이, 반폭, 바퀴 반지름, 버스면 1
  uniform vec4 uAxle;  // 앞·뒤 차축 x
  uniform vec4 uLamp;  // 전조등 y0·y1, 후미등 y0·y1
  uniform vec4 uWin;   // 승용차: 그릴 y0·y1. 버스: 옆창 y0·y1, 앞유리 y0·y1
  uniform vec4 uDoor;  // 버스 오른쪽 문 두 곳
  uniform float uEnd;  // 앞뒤 끝 반폭 비율(위에서 보면 모서리가 둥글어 끝이 좁다)
  varying vec3 vN; varying vec3 vNl; varying float vPart; varying vec4 vMore; varying float vDist; varying vec3 vO; varying float vPicked; varying vec3 vAux;
  vec3 carPaint(float t) {
    ${glslColors(CAR_COLORS)}
    return vec3(0.5);
  }
  vec3 taxiPaint(float t) {
    ${glslColors(TAXI_COLORS)}
    return vec3(0.9);
  }
  float band(float v, float a, float b) { return step(a, v) * step(v, b); }
  void main() {
    vec3 n = normalize(vN);
    vec3 nl = normalize(vNl);
    float kind = vMore.w;
    float bus = uDim.w;
    vec3 body = kind > 1.5 ? taxiPaint(vMore.y) : kind > 0.5 ? uBus[int(vMore.y + 0.5)] : carPaint(vMore.y);
    vec3 alb = body;
    float glass = 0.0;
    float side = step(0.7, abs(nl.z));
    float front = step(0.4, nl.x);
    float back = step(0.4, -nl.x);
    float az = abs(vO.z);
    float hw = uDim.y;
    float hwe = hw * uEnd;   // 앞뒤 끝 면의 반폭
    float head = 0.0;
    float tail = 0.0;
    float dest = 0.0;
    if (vPart < 0.5) {
      head = front * band(vO.y, uLamp.x, uLamp.y) * band(az, hwe - 0.45, hwe - 0.03);
      tail = back * band(vO.y, uLamp.z, uLamp.w) * band(az, hwe - 0.45 + 0.2 * bus, hwe - 0.02);
      if (bus > 0.5) {
        float route = vMore.y;
        // 옆창(1.65m 마다 기둥), 오른쪽 문, 앞유리, 뒷창, 행선지 표시기
        float pil = step(0.06, fract((vO.x + 0.4) / 1.65));
        float win = side * band(vO.y, uWin.x, uWin.y) * step(abs(vO.x), uDim.x - 0.4) * pil;
        float door = side * step(0.0, vO.z) * (band(vO.x, uDoor.x, uDoor.y) + band(vO.x, uDoor.z, uDoor.w)) * band(vO.y, 0.36, uWin.y);
        float seam = door * (1.0 - step(0.03, abs(fract((vO.x - uDoor.x) / (uDoor.y - uDoor.x) + 0.5) - 0.5)));
        float shield = front * band(vO.y, uWin.z, uWin.w) * step(az, hwe - 0.1);
        float rear = back * band(vO.y, uWin.y - 0.75, uWin.y) * step(az, hwe - 0.28);
        dest = front * band(vO.y, uWin.w + 0.03, uWin.w + 0.27) * step(az, hwe - 0.3);
        glass = max(max(win, door), max(shield, rear));
        alb = mix(alb, vec3(0.62, 0.64, 0.66), seam);
        // 광역버스는 지붕이 흰색이고 앞 아랫단이 검다
        float coach = step(1.5, route) * step(route, 2.5);
        alb = mix(alb, vec3(0.95), coach * step(uWin.y + 0.06, vO.y));
        alb = mix(alb, vec3(0.13), coach * front * step(vO.y, uWin.z));
        alb = mix(alb, vec3(0.24, 0.25, 0.27), step(vO.y, 0.5));       // 범퍼·아랫단
        alb = mix(alb, vec3(0.05), dest);
      } else {
        float grille = front * band(vO.y, uWin.x, uWin.y) * step(az, hwe - 0.36);
        alb = mix(alb, vec3(0.08, 0.085, 0.09), grille);
        alb = mix(alb, vec3(0.13, 0.135, 0.14), step(vO.y, 0.38));     // 아래 범퍼·몰딩
      }
      // 바퀴 집
      float arch = min(length(vO.xy - vec2(uAxle.x, uDim.z)), length(vO.xy - vec2(uAxle.y, uDim.z)));
      alb = mix(alb, vec3(0.06), side * step(arch, uDim.z + 0.09));
    }
    if (vPart > 0.5 && vPart < 1.5) glass = step(nl.y, 0.6);                // 캐빈: 옆·앞뒤는 유리, 지붕은 차체 색
    alb = mix(alb, vec3(0.07, 0.085, 0.11), glass);                         // 짙게 선팅한 유리
    if (vPart > 3.5 && vPart < 4.5) {
      float hub = side * step(length(vO.xy - vAux.xy), vAux.y * 0.6);
      alb = mix(vec3(0.1, 0.1, 0.11), vec3(0.6, 0.62, 0.64), hub);          // 타이어와 휠
    }
    if (vPart > 4.5 && vPart < 5.5) alb = vec3(1.0, 0.88, 0.42);            // 택시 표시등
    if (vPart > 6.5) alb = vec3(0.12, 0.12, 0.13);                          // 버스 사이드미러
    vec3 col = lit(alb, n);
    col = mix(col, col * 0.55 + vec3(0.02, 0.03, 0.06), uNight * 0.55 * step(vPart, 1.5));
    col += vec3(1.0, 0.86, 0.55) * glass * uNight * 0.35 * bus;              // 밤에는 버스 창에 불이 켜진다
    col += vec3(1.0, 0.55, 0.12) * dest * (0.55 + 0.4 * uNight) * step(0.4, fract(vO.z * 5.0)); // 행선지 표시기
    col += vec3(1.0, 0.82, 0.4) * step(4.5, vPart) * step(vPart, 5.5) * uNight * 0.6;
    col = mix(col, vec3(1.0, 0.96, 0.82) * (0.75 + 0.5 * uNight), head);
    col = mix(col, vec3(1.0, 0.10, 0.06) * (0.42 + 0.3 * uNight + 0.75 * vMore.x), tail);
    col += vec3(1.0, 0.95, 0.7) * vPicked * 0.25;
    gl_FragColor = vec4(fogged(col, vDist), 1.0);
  }`;

// 빛 번짐: 차 앞의 전조등 웅덩이와 뒤의 붉은 번짐을 납작한 판 두 장으로 덧그린다
const GLOW_VERT = /* glsl */ `
  attribute vec4 aInst; attribute vec4 aMore; attribute float aPart;
  varying vec2 vP; varying float vPart; varying float vBrake; varying float vDist;
  void main() {
    vec4 cv = viewMatrix * vec4(aInst.xyz, 1.0);
    float s = zoomScale(-cv.z, 4.5, 9.0, 1.3, 4.2) * aMore.z;
    vec3 p = position * s;
    float cs = cos(aInst.w), sn = sin(aInst.w);
    vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, aInst.y + 0.2, aInst.z + p.x * sn + p.z * cs);
    vP = uv; vPart = aPart; vBrake = aMore.x;
    vec4 mv = viewMatrix * vec4(w, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const GLOW_FRAG = /* glsl */ `
  varying vec2 vP; varying float vPart; varying float vBrake; varying float vDist;
  void main() {
    vec2 q = vP * 2.0 - 1.0;
    float head = (1.0 - vP.x) * max(0.0, 1.0 - q.y * q.y) * smoothstep(0.0, 0.12, vP.x);
    float rear = max(0.0, 1.0 - dot(q, q));
    vec3 col = vPart < 0.5 ? vec3(1.0, 0.92, 0.72) * head * 0.55 * uNight : vec3(1.0, 0.12, 0.05) * rear * rear * (0.22 * uNight + 0.55 * vBrake * (0.35 + 0.65 * uNight));
    col *= 1.0 + 1.1 * uRain;                                                  // 젖은 길에 더 밝게 비친다
    gl_FragColor = vec4(col * (1.0 - smoothstep(2500.0, 6000.0, vDist) * 0.5), 1.0);
  }`;

function glowGeometry(front: number, rear: number): THREE.BufferGeometry {
  const head = new THREE.PlaneGeometry(13, 4.6).rotateX(-Math.PI / 2).translate(front + 6.5, 0, 0);
  const tail = new THREE.PlaneGeometry(4.5, 4.2).rotateX(-Math.PI / 2).translate(rear - 0.6, 0.5, 0);
  const tag = (g: THREE.BufferGeometry, id: number) => {
    const out = g.toNonIndexed();
    out.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count).fill(id), 1));
    return out;
  };
  return merge([tag(head, 0), tag(tail, 1)]);
}

export function makeCarMeshes(max: number) {
  const group = new THREE.Group();
  const busCols = BUS_KINDS.map((k) => new THREE.Color(k.color));
  const glowMat = material({ vertex: GLOW_VERT, fragment: GLOW_FRAG, transparent: true, additive: true, depthWrite: false, doubleSide: true });
  // 0 세단, 1 SUV, 2 경차, 3 승합, 4 택시, 5 시내버스, 6 광역버스, 7 마을버스
  const kinds = [
    { base: SHAPES.sedan(), look: CAR_SHAPES.sedan.look, max },
    { base: SHAPES.suv(), look: CAR_SHAPES.suv.look, max },
    { base: SHAPES.kei(), look: CAR_SHAPES.kei.look, max },
    { base: SHAPES.van(), look: CAR_SHAPES.van.look, max },
    { base: SHAPES.taxi(), look: CAR_SHAPES.sedan.look, max },
    { base: SHAPES.bus(), look: BUS.look, max: 400 },
    { base: SHAPES.coach(), look: COACH.look, max: 150 },
    { base: SHAPES.minibus(), look: MINI.look, max: 200 },
  ].map(({ base, look, max }, k) => {
    const inst = instanced(base, max, { aInst: 4, aMore: 4 });
    const isBus = k >= 5 ? 1 : 0;
    const mat = material({
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uBus: { value: busCols },
        uPick: { value: -1 },
        uDim: { value: new THREE.Vector4(look.len, look.hw, look.r, isBus) },
        uAxle: { value: new THREE.Vector4(look.axle[0], look.axle[1], 0, 0) },
        uLamp: { value: new THREE.Vector4(...look.lamp) },
        uWin: { value: new THREE.Vector4(...look.win) },
        uDoor: { value: new THREE.Vector4(...(look.door ?? [99, 99, 99, 99])) },
        uEnd: { value: isBus ? BUS_END : CAR_END },
      },
    });
    const mesh = new THREE.Mesh(inst.geo, mat);
    mesh.frustumCulled = false;
    // 빛 번짐은 같은 인스턴스 값을 함께 쓴다
    const glow = glowGeometry(look.len - 0.25, -look.len + 0.25);
    const g2 = new THREE.InstancedBufferGeometry();
    for (const a in glow.attributes) g2.setAttribute(a, glow.attributes[a]);
    g2.setAttribute('aInst', inst.attr.aInst);
    g2.setAttribute('aMore', inst.attr.aMore);
    const glowMesh = new THREE.Mesh(g2, glowMat);
    glowMesh.frustumCulled = false;
    glowMesh.renderOrder = 3;
    group.add(mesh, glowMesh);
    return { ...inst, g2, max, pick: mat.uniforms.uPick };
  });

  /** pickedUid: 고른 버스의 고유 번호(없으면 0) */
  function update(c: Cars, pickedUid = 0) {
    const n = kinds.map(() => 0);
    for (const kd of kinds) kd.pick.value = -1;
    for (let i = 0; i < c.n; i++) {
      const k = c.kind[i] === 1 ? (c.tint[i] === 3 ? 7 : c.tint[i] === 2 ? 6 : 5) : c.kind[i] === 2 ? 4 : bodyType(c.tint[i]);
      const kd = kinds[k];
      if (n[k] >= kd.max) continue;
      if (c.uid[i] === pickedUid) kd.pick.value = n[k];
      const j = n[k]++ * 4;
      const { arr } = kd;
      arr.aInst[j] = c.x[i];
      arr.aInst[j + 1] = c.y[i];
      arr.aInst[j + 2] = c.z[i];
      arr.aInst[j + 3] = c.yaw[i];
      arr.aMore[j] = c.brake[i];
      arr.aMore[j + 1] = c.tint[i];
      arr.aMore[j + 2] = c.fade[i];
      arr.aMore[j + 3] = c.kind[i];
    }
    kinds.forEach((kd, k) => {
      kd.geo.instanceCount = n[k];
      kd.g2.instanceCount = n[k];
      kd.attr.aInst.needsUpdate = true;
      kd.attr.aMore.needsUpdate = true;
    });
  }
  return { group, update };
}
