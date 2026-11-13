// 건물. 외곽선을 높이만큼 세운 기둥들을 메시 하나로 합친다.
// 낮에는 면 방향 명암과 바닥 쪽 그늘, 밤에는 창문·가게 불빛을 셰이더에서 만든다.
import * as THREE from 'three';
import type { Building } from '../data/board.ts';
import { material, pal } from './env.ts';

export function prismGeometry(list: Building[]): THREE.BufferGeometry {
  let nv = 0;
  let ni = 0;
  for (const b of list) {
    const n = b.pts.length / 2;
    nv += n * 5;
    ni += n * 6 + (n - 2) * 3;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const wall = new Float32Array(nv * 2);
  const seed = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  let v = 0;
  let k = 0;
  const put = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, w: number, s: number) => {
    pos.set([x, y, z], v * 3);
    nor.set([nx, ny, nz], v * 3);
    wall.set([u, w], v * 2);
    seed[v] = s;
    return v++;
  };
  for (const b of list) {
    const p = b.pts;
    const n = p.length / 2;
    const s = Math.abs(Math.sin(p[0] * 12.9898 + p[1] * 78.233) * 43758.5453) % 1;
    let u = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[i * 2];
      const az = p[i * 2 + 1];
      const bx = p[j * 2];
      const bz = p[j * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (bz - az) / len;
      const nz = -(bx - ax) / len;
      const v0 = put(ax, 0, az, nx, 0, nz, u, 0, s);
      put(bx, 0, bz, nx, 0, nz, u + len, 0, s);
      put(bx, b.h, bz, nx, 0, nz, u + len, b.h, s);
      put(ax, b.h, az, nx, 0, nz, u, b.h, s);
      idx.set([v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3], k);
      k += 6;
      u += len;
    }
    const base = v;
    const contour: THREE.Vector2[] = [];
    for (let i = 0; i < n; i++) {
      contour.push(new THREE.Vector2(p[i * 2], p[i * 2 + 1]));
      put(p[i * 2], b.h, p[i * 2 + 1], 0, 1, 0, -1, b.h, s);
    }
    for (const f of THREE.ShapeUtils.triangulateShape(contour, [])) {
      idx.set([base + f[0], base + f[1], base + f[2]], k);
      k += 3;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aWall', new THREE.BufferAttribute(wall, 2));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setIndex(new THREE.BufferAttribute(idx.subarray(0, k), 1));
  return g;
}

const VERT = /* glsl */ `
  attribute vec2 aWall; attribute float aSeed;
  uniform float uLift;
  varying vec3 vN; varying vec2 vWall; varying float vSeed; varying float vDist; varying vec2 vXZ;
  void main() {
    vec3 p = position;
    p.y += uLift * step(0.01, position.y);
    vN = normal; vWall = aWall; vSeed = aSeed; vXZ = position.xz;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */ `
  uniform vec3 uBld, uRoof, uTint; uniform float uGlow;
  varying vec3 vN; varying vec2 vWall; varying float vSeed; varying float vDist; varying vec2 vXZ;
  void main() {
    // 지하 들여다보기: 원 안의 건물은 성기게 그려 유리처럼 비치게 한다
    float fi = focusIn(vXZ);
    if (fi > 0.01 && dither(gl_FragCoord.xy) < fi * 0.82) discard;
    float roof = step(vWall.x, -0.5);
    float wallF = 1.0 - roof;
    vec3 alb = mix(uBld, uRoof, roof) * (0.93 + 0.13 * fract(vSeed * 7.31));
    alb *= mix(vec3(1.0), vec3(1.03, 0.99, 0.94), fract(vSeed * 3.7)) * uTint;
    alb *= mix(1.0, mix(0.72, 1.0, smoothstep(0.0, 11.0, vWall.y)), wallF);  // 바닥 쪽 그늘

    vec2 g = vWall / vec2(3.4, 3.2);
    vec2 id = floor(g);
    vec2 f = fract(g);
    float aa = clamp(1.0 - max(fwidth(g.x), fwidth(g.y)) * 1.5, 0.0, 1.0);    // 멀어져 격자가 뭉개지면 평균값으로
    float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.26, f.y) * step(f.y, 0.8) * wallF;
    float rnd = hash21(id + vSeed * 91.7);
    float on = step(rnd, uLit);
    float shop = wallF * step(vWall.y, 3.2) * step(fract(vSeed * 13.1), 0.6);  // 1층 가게

    vec3 col = lit(alb, normalize(vN));
    col *= 1.0 - 0.11 * win * aa * (1.0 - uNight);                             // 낮: 유리는 조금 어둡게
    vec3 warm = mix(vec3(1.0, 0.80, 0.52), vec3(0.80, 0.90, 1.0), step(0.82, fract(rnd * 17.0)));
    float e = mix(uLit * 0.30 * wallF, win * on, aa);
    e += shop * min(1.0, uLit * 2.4) * mix(0.5, 0.45 + 0.55 * win, aa);
    col += warm * e * uNight * (0.45 + 0.5 * fract(rnd * 31.0));
    col += uTint * uGlow * (0.10 + 0.28 * uNight + 0.5 * roof * uNight * 0.3);
    col = mix(col, col * 0.7 + vec3(0.04, 0.07, 0.11), fi * 0.5);
    gl_FragColor = vec4(fogged(col, vDist), 1.0);
  }`;

export function buildingMaterial(tint = '#ffffff') {
  return material({
    vertex: VERT,
    fragment: FRAG,
    doubleSide: true,
    uniforms: { uBld: { value: pal.bld }, uRoof: { value: pal.roof }, uTint: { value: new THREE.Color(tint) }, uGlow: { value: 0 }, uLift: { value: 0 } },
  });
}

export function makeBuildings(list: Building[]): THREE.Mesh {
  const mesh = new THREE.Mesh(prismGeometry(list.filter((b) => b.lm === 0)), buildingMaterial());
  mesh.frustumCulled = false;
  return mesh;
}
