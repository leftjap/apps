// 차. 승용차·택시와 버스(일반·마을)를 인스턴싱으로 그린다. 차체와 유리 캐빈이 나뉘고 바퀴가 달린 장난감 모양이다.
// 버스는 서울 버스 도색(간선 파랑, 지선 초록, 광역 빨강, 마을 연두)으로 칠한다. 전조등과 브레이크등은 스스로 빛나고, 밤에는 길 위에 빛 번짐을 덧그린다.
import * as THREE from 'three';
import type { Cars } from '../sim/cars.ts';
import { material } from './env.ts';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BUS_KINDS } from '../sim/buses.ts';
import { instanced, merge, part } from './util.ts';

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
/** 모서리가 둥근 상자(장난감처럼 보이게) */
const rbox = (w: number, h: number, d: number, x: number, y: number, z: number, r: number) => new RoundedBoxGeometry(w, h, d, 1, r).translate(x, y, z);
/** 윗면을 안쪽으로 좁힌 상자(유리 캐빈) */
function cabin(w: number, h: number, d: number, x: number, y: number, z: number, k: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * (0.5 + k / 2));
  g.computeVertexNormals();
  return g.translate(x, y, z);
}
/** 바퀴 한 쌍씩: 차축 x 위치 목록 */
const wheels = (xs: number[], r: number, half: number) =>
  xs.flatMap((x) => [1, -1].map((side) => part(new THREE.CylinderGeometry(r, r, 0.3, 8, 1, true).rotateX(Math.PI / 2).translate(x, r, side * half), 4)));

// 부품: 0 차체, 1 유리 캐빈, 2 전조등, 3 후미등, 4 바퀴, 5 택시 지붕 표시등, 6 버스 창 띠
const sedan = () =>
  merge([
    part(rbox(4.3, 0.95, 1.84, 0, 0.82, 0, 0.3), 0),
    part(cabin(2.3, 0.72, 1.6, -0.2, 1.62, 0, 0.78), 1),
    part(box(0.12, 0.24, 0.4, 2.13, 0.92, 0.58), 2),
    part(box(0.12, 0.24, 0.4, 2.13, 0.92, -0.58), 2),
    part(box(0.12, 0.22, 0.48, -2.13, 0.95, 0.56), 3),
    part(box(0.12, 0.22, 0.48, -2.13, 0.95, -0.56), 3),
    part(box(0.5, 0.2, 0.3, -0.25, 2.07, 0), 5),
    ...wheels([1.35, -1.35], 0.38, 0.86),
  ]);
const bus = () =>
  merge([
    part(rbox(11.4, 2.55, 2.5, 0, 1.7, 0, 0.35), 0),
    part(box(10.4, 0.95, 2.54, 0.15, 2.2, 0), 6),
    part(box(0.1, 1.2, 2.2, 5.69, 2.0, 0), 6),
    part(rbox(3.2, 0.32, 1.7, -1.5, 3.08, 0, 0.12), 0),
    part(box(0.12, 0.3, 0.5, 5.7, 0.9, 0.85), 2),
    part(box(0.12, 0.3, 0.5, 5.7, 0.9, -0.85), 2),
    part(box(0.12, 0.3, 0.55, -5.7, 1.0, 0.85), 3),
    part(box(0.12, 0.3, 0.55, -5.7, 1.0, -0.85), 3),
    ...wheels([3.6, -3.4], 0.52, 1.2),
  ]);
/** 마을버스: 짧고 통통하다 */
const minibus = () =>
  merge([
    part(rbox(7.4, 2.6, 2.32, 0, 1.68, 0, 0.55), 0),
    part(box(6.4, 0.95, 2.36, 0.1, 2.22, 0), 6),
    part(box(0.1, 1.15, 2.0, 3.69, 2.05, 0), 6),
    part(box(0.12, 0.3, 0.46, 3.7, 0.92, 0.75), 2),
    part(box(0.12, 0.3, 0.46, 3.7, 0.92, -0.75), 2),
    part(box(0.12, 0.3, 0.5, -3.7, 1.0, 0.75), 3),
    part(box(0.12, 0.3, 0.5, -3.7, 1.0, -0.75), 3),
    ...wheels([2.3, -2.2], 0.5, 1.12),
  ]);

const VERT = /* glsl */ `
  attribute vec4 aInst; attribute vec4 aMore;   // aMore = (브레이크, 색 값 또는 버스 종류, 나타남, 0 승용차·1 버스·2 택시)
  attribute float aPart;
  uniform float uPick;
  varying vec3 vN; varying float vPart; varying vec4 vMore; varying float vDist; varying vec3 vO; varying float vPicked;
  void main() {
    vec4 cv = viewMatrix * vec4(aInst.xyz, 1.0);
    float picked = step(abs(float(gl_InstanceID) - uPick), 0.5);
    float s = zoomScale(-cv.z, 4.5, 9.0, 1.3, 4.2) * aMore.z * (1.0 + 0.15 * picked);
    vec3 p = position * s;
    if (aPart > 4.5 && aPart < 5.5 && aMore.w < 1.5) p *= 0.0;          // 지붕 표시등은 택시만
    float cs = cos(aInst.w), sn = sin(aInst.w);
    vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, aInst.y + p.y + 0.05, aInst.z + p.x * sn + p.z * cs);
    vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
    vPart = aPart; vMore = aMore; vO = position; vPicked = picked;
    vec4 mv = viewMatrix * vec4(w, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */ `
  uniform vec3 uBus[4];
  varying vec3 vN; varying float vPart; varying vec4 vMore; varying float vDist; varying vec3 vO; varying float vPicked;
  vec3 paint(float t, float kind) {
    if (kind > 1.5) return t < 0.6 ? vec3(0.96, 0.58, 0.14) : vec3(0.9, 0.9, 0.91);        // 택시: 주황 또는 흰색
    if (kind > 0.5) return uBus[int(t + 0.5)];
    if (t < 0.34) return vec3(0.95, 0.95, 0.94);
    if (t < 0.56) return vec3(0.72, 0.74, 0.77);
    if (t < 0.74) return vec3(0.16, 0.17, 0.19);
    if (t < 0.86) return vec3(0.42, 0.45, 0.50);
    if (t < 0.93) return vec3(0.20, 0.30, 0.52);
    return vec3(0.72, 0.20, 0.18);
  }
  void main() {
    vec3 n = normalize(vN);
    vec3 body = paint(vMore.y, vMore.w);
    vec3 alb = body;
    float glass = 0.0;
    if (vPart > 0.5 && vPart < 1.5) glass = step(n.y, 0.6);                 // 캐빈: 옆·앞뒤는 유리, 지붕은 차체 색
    if (vPart > 5.5) glass = 1.0;                                            // 버스 창 띠
    if (vMore.w > 0.5 && vMore.w < 1.5 && vPart < 0.5) alb = mix(body, vec3(0.97), step(vO.y, 0.75) * 0.7); // 버스 아랫단은 밝게
    alb = mix(alb, vec3(0.15, 0.19, 0.25), glass);
    if (vPart > 3.5 && vPart < 4.5) alb = vec3(0.12, 0.12, 0.13);           // 바퀴
    if (vPart > 4.5 && vPart < 5.5) alb = vec3(1.0, 0.85, 0.35);            // 택시 표시등
    vec3 col = lit(alb, n);
    col = mix(col, col * 0.55 + vec3(0.02, 0.03, 0.06), uNight * 0.55 * step(vPart, 1.5));
    col += vec3(1.0, 0.86, 0.55) * glass * uNight * 0.35 * step(0.5, vMore.w) * step(vMore.w, 1.5); // 밤에는 버스 창에 불이 켜진다
    float head = step(1.5, vPart) * step(vPart, 2.5);
    float rear = step(2.5, vPart) * step(vPart, 3.5);
    col = mix(col, vec3(1.0, 0.96, 0.82) * (0.75 + 0.5 * uNight), head);
    col = mix(col, vec3(1.0, 0.10, 0.06) * (0.42 + 0.3 * uNight + 0.75 * vMore.x), rear);
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
  // 0 승용차·택시, 1 버스, 2 마을버스
  const kinds = [
    { base: sedan(), glow: glowGeometry(2.2, -2.2), max },
    { base: bus(), glow: glowGeometry(5.7, -5.7), max: 400 },
    { base: minibus(), glow: glowGeometry(3.7, -3.7), max: 200 },
  ].map(({ base, glow, max }) => {
    const inst = instanced(base, max, { aInst: 4, aMore: 4 });
    const mat = material({ vertex: VERT, fragment: FRAG, uniforms: { uBus: { value: busCols }, uPick: { value: -1 } } });
    const mesh = new THREE.Mesh(inst.geo, mat);
    mesh.frustumCulled = false;
    // 빛 번짐은 같은 인스턴스 값을 함께 쓴다
    const g2 = new THREE.InstancedBufferGeometry();
    for (const k in glow.attributes) g2.setAttribute(k, glow.attributes[k]);
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
    const n = [0, 0, 0];
    for (const kd of kinds) kd.pick.value = -1;
    for (let i = 0; i < c.n; i++) {
      const k = c.kind[i] !== 1 ? 0 : c.tint[i] === 3 ? 2 : 1;
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
