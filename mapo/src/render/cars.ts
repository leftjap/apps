// 차. 승용차·택시와 버스를 인스턴싱으로 그린다. 전조등과 브레이크등은 스스로 빛나고, 밤에는 길 위에 빛 번짐을 덧그린다.
import * as THREE from 'three';
import type { Cars } from '../sim/cars.ts';
import { material } from './env.ts';
import { instanced, merge, part } from './util.ts';

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// 부품: 0 차체, 1 유리, 2 전조등, 3 후미등
const sedan = () =>
  merge([
    part(box(4.4, 0.95, 1.8, 0, 0.72, 0), 0),
    part(box(2.3, 0.62, 1.55, -0.25, 1.5, 0), 1),
    part(box(0.12, 0.26, 0.42, 2.2, 0.82, 0.58), 2),
    part(box(0.12, 0.26, 0.42, 2.2, 0.82, -0.58), 2),
    part(box(0.12, 0.24, 0.5, -2.2, 0.86, 0.56), 3),
    part(box(0.12, 0.24, 0.5, -2.2, 0.86, -0.56), 3),
  ]);
const bus = () =>
  merge([
    part(box(10.6, 2.5, 2.5, 0, 1.65, 0), 0),
    part(box(9.6, 0.85, 2.54, 0.1, 2.15, 0), 1),
    part(box(0.12, 0.3, 0.5, 5.3, 0.9, 0.85), 2),
    part(box(0.12, 0.3, 0.5, 5.3, 0.9, -0.85), 2),
    part(box(0.12, 0.3, 0.55, -5.3, 1.0, 0.85), 3),
    part(box(0.12, 0.3, 0.55, -5.3, 1.0, -0.85), 3),
  ]);

const VERT = /* glsl */ `
  attribute vec4 aInst; attribute vec4 aMore;   // aMore = (브레이크, 색 값, 나타남, 버스·택시 여부)
  attribute float aPart;
  varying vec3 vN; varying float vPart; varying vec4 vMore; varying float vDist;
  void main() {
    vec4 cv = viewMatrix * vec4(aInst.xyz, 1.0);
    float s = zoomScale(-cv.z, 4.5, 9.0, 1.3, 4.2) * aMore.z;
    vec3 p = position * s;
    float cs = cos(aInst.w), sn = sin(aInst.w);
    vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, aInst.y + p.y + 0.12, aInst.z + p.x * sn + p.z * cs);
    vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
    vPart = aPart; vMore = aMore;
    vec4 mv = viewMatrix * vec4(w, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */ `
  varying vec3 vN; varying float vPart; varying vec4 vMore; varying float vDist;
  vec3 paint(float t, float kind) {
    if (kind > 1.5) return t < 0.6 ? vec3(0.95, 0.60, 0.16) : vec3(0.86, 0.87, 0.88);        // 택시: 주황 또는 은색
    if (kind > 0.5) return t < 0.45 ? vec3(0.22, 0.38, 0.74) : t < 0.8 ? vec3(0.36, 0.68, 0.22) : t < 0.92 ? vec3(0.86, 0.18, 0.16) : vec3(0.95, 0.76, 0.18); // 버스: 파랑·초록·빨강·노랑
    if (t < 0.34) return vec3(0.95, 0.95, 0.94);
    if (t < 0.56) return vec3(0.72, 0.74, 0.77);
    if (t < 0.74) return vec3(0.16, 0.17, 0.19);
    if (t < 0.86) return vec3(0.42, 0.45, 0.50);
    if (t < 0.93) return vec3(0.20, 0.30, 0.52);
    return vec3(0.72, 0.20, 0.18);
  }
  void main() {
    vec3 n = normalize(vN);
    vec3 alb = paint(vMore.y, vMore.w);
    alb = mix(alb, vec3(0.16, 0.20, 0.26), step(0.5, vPart) * step(vPart, 1.5) * step(n.y, 0.5));   // 유리는 옆면만, 지붕은 차체 색
    vec3 col = lit(alb, n);
    col = mix(col, col * 0.55 + vec3(0.02, 0.03, 0.06), uNight * 0.55 * step(vPart, 1.5));
    float head = step(1.5, vPart) * step(vPart, 2.5);
    float rear = step(2.5, vPart);
    col = mix(col, vec3(1.0, 0.96, 0.82) * (0.75 + 0.5 * uNight), head);
    col = mix(col, vec3(1.0, 0.10, 0.06) * (0.42 + 0.3 * uNight + 0.75 * vMore.x), rear);
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
  const mat = material({ vertex: VERT, fragment: FRAG });
  const glowMat = material({ vertex: GLOW_VERT, fragment: GLOW_FRAG, transparent: true, additive: true, depthWrite: false, doubleSide: true });
  const kinds = [
    { base: sedan(), glow: glowGeometry(2.2, -2.2) },
    { base: bus(), glow: glowGeometry(5.3, -5.3) },
  ].map(({ base, glow }) => {
    const inst = instanced(base, max, { aInst: 4, aMore: 4 });
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
    return { ...inst, g2 };
  });

  function update(c: Cars) {
    const n = [0, 0];
    for (let i = 0; i < c.n; i++) {
      const k = c.kind[i] === 1 ? 1 : 0;
      const j = n[k]++ * 4;
      const { arr } = kinds[k];
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
