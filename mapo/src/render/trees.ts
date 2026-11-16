// 나무. 서울시 가로수 자료의 수종(public/data/trees.json, tools/trees.ts 가 굽는다)마다 모형과 계절을 따로 둔다:
// 은행(좁고 높은 달걀꼴), 양버즘(크고 넓은 타원), 느티(아래가 좁은 부채꼴), 벚(낮고 넓게 퍼진 수관), 소나무류(층진 상록),
// 그 밖 활엽·녹지 나무(둥근 수관). 줄기와 가지가 있어 잎이 진 계절에는 가지만 남는다.
// 화면 밖 나무는 그리지 않고, 화면에서 작게 보이는 나무는 정점 42개짜리 단순한 모형으로 그린다(treeLod).
import * as THREE from 'three';
import type { Season } from '../sim/season.ts';
import { env, material } from './env.ts';
import { sizeAt, sizeGlsl } from './size.ts';
import { instanced, merge, part } from './util.ts';

/** 모형 번호(tools/lib/trees.ts 의 TREE_KINDS): 0 은행, 1 양버즘, 2 느티, 3 벚, 4 소나무류, 5 그 밖 활엽, 6 녹지 나무(5 와 같은 모형) */
const KINDS = 7;
/** 수종별 [수관 지름, 키](m). 가로수 수관 지름 4~7m */
export const TREE_SIZE: [number, number][] = [
  [4.4, 10.5],
  [6.8, 11.5],
  [6.4, 9.5],
  [6.0, 6.5],
  [4.4, 7.5],
  [5.0, 7.5],
  [5.0, 7.5],
];

/** 계절 → 수종별 [잎 색 A, 잎 색 B, 잎 양(0 가지만 ~ 1 무성)] */
export const LOOK: Record<Season, [string, string, number][]> = {
  blossom: [
    ['#b8d98a', '#a6cf7c', 0.6],
    ['#b9d68c', '#a3c97a', 0.6],
    ['#b3d58a', '#9fc876', 0.7],
    ['#f8c6d6', '#f1b2c6', 1],
    ['#5f8a5a', '#557f52', 1],
    ['#b5d68e', '#9cc67a', 0.7],
    ['#a9cf86', '#8fbf75', 0.8],
  ],
  green: [
    ['#93c46e', '#86b965', 1],
    ['#7fb067', '#6fa35f', 1],
    ['#86b86a', '#74a862', 1],
    ['#7aae64', '#6ca15c', 1],
    ['#4e7a4c', '#466f45', 1],
    ['#88bc6e', '#6fa86a', 1],
    ['#a9cf86', '#6fa86a', 1],
  ],
  // 10월 중순~11월: 은행은 노랗고, 양버즘·느티는 누런·붉은 갈색으로 잎이 줄고, 벚은 거의 졌다. 서행 띠 주황과 헷갈리지 않게 채도를 낮춘다
  autumn: [
    ['#e3c04a', '#d4b447', 1],
    ['#b49a68', '#a08658', 0.7],
    ['#b8875a', '#a4754f', 0.65],
    ['#9a6250', '#8a5646', 0.15],
    ['#4e7350', '#46694a', 1],
    ['#b8a466', '#9d8c5a', 0.6],
    ['#a99a66', '#8d8259', 0.7],
  ],
  winter: [
    ['#8f8377', '#8f8377', 0],
    ['#8f8377', '#8f8377', 0],
    ['#8f8377', '#8f8377', 0],
    ['#8f8377', '#8f8377', 0],
    ['#45664a', '#3f5e44', 1],
    ['#8f8377', '#8f8377', 0],
    ['#8f8377', '#8f8377', 0],
  ],
};

/** 수관 옆모습(반지름, 높이)을 키 1·지름 1 기준으로. 회전체로 돌려 수관을 만든다 */
const CROWN: [number, number][][] = [
  [[0, 0.25], [0.38, 0.33], [0.5, 0.55], [0.36, 0.82], [0, 1]],
  [[0, 0.3], [0.44, 0.38], [0.5, 0.62], [0.36, 0.88], [0, 1]],
  [[0, 0.3], [0.3, 0.42], [0.5, 0.72], [0.4, 0.92], [0, 1]],
  [[0, 0.34], [0.46, 0.45], [0.5, 0.68], [0.3, 0.92], [0, 1]],
  [[0, 0.36], [0.5, 0.5], [0.3, 0.62], [0.36, 0.72], [0.16, 0.9], [0, 1]],
  [[0, 0.3], [0.42, 0.4], [0.5, 0.62], [0.34, 0.88], [0, 1]],
];

/** 수종 k 의 자세한 모형: 0 줄기·가지, 1 수관. 지름·키는 셰이더가 곱한다(여기서는 지름 1·키 1) */
function nearTree(k: number): THREE.BufferGeometry {
  const prof = CROWN[Math.min(k, 5)];
  const [d, h] = TREE_SIZE[k];
  const base = prof[0][1];
  const crown = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 6);
  const parts = [
    part(new THREE.CylinderGeometry(0.11 / d, 0.17 / d, base + 0.04, 5, 1, true).translate(0, (base + 0.04) / 2, 0), 0),
    part(crown, 1),
  ];
  // 가지: 줄기 끝에서 위·바깥으로 셋. 잎이 진 계절에 보인다(소나무는 늘 잎이 있어 두지 않는다)
  if (k !== 4)
    for (let i = 0; i < 3; i++) {
      const len = (1 - base) * 0.75;
      const g = new THREE.CylinderGeometry(0.04 / d, 0.08 / d, len, 3, 1, true).translate(0, len / 2, 0);
      g.rotateZ(0.5 * (d / h) * 1.6);
      g.rotateY((i * 2 * Math.PI) / 3 + k);
      parts.push(part(g.translate(0, base - 0.02, 0), 0));
    }
  return merge(parts);
}

/** 단순한 모형: 팔면체 수관과 세모 줄기. 수종별 지름·키·수관 아래 높이는 셰이더가 정한다 */
function farTree(): THREE.BufferGeometry {
  return merge([
    part(new THREE.CylinderGeometry(0.02, 0.03, 0.4, 3, 1, true).translate(0, 0.2, 0), 0),
    part(new THREE.OctahedronGeometry(0.5, 0).scale(1, 0.65, 1).translate(0, 0.675, 0), 1),
  ]);
}

const NEAR_GEO = Array.from({ length: 6 }, (_, k) => nearTree(k));
const FAR_GEO = farTree();
export const NEAR_TREE_VERTS = NEAR_GEO.map((g) => g.attributes.position.count);
export const FAR_TREE_VERTS = FAR_GEO.attributes.position.count;
/** 키가 화면에서 이 픽셀보다 작게 보이면 단순한 모형으로 그린다 */
const NEAR_PX = 36;
const TAN16 = Math.tan((16 * Math.PI) / 180);

/** 나무 하나를 어떻게 그릴까: 0 그리지 않음(화면 밖·카메라 뒤), 1 자세한 모형, 2 단순한 모형. e 는 투영 × 시점 행렬 원소 */
export function treeLod(e: ArrayLike<number>, projK: number, x: number, z: number): number {
  const cw = e[3] * x + e[7] * 4 + e[11] * z + e[15];
  if (cw <= 0.5) return 0;
  const px = (9 * sizeAt('tree', cw) * projK) / cw;
  const m = px / (projK * TAN16) + 0.05;
  const cx = (e[0] * x + e[4] * 4 + e[8] * z + e[12]) / cw;
  const cy = (e[1] * x + e[5] * 4 + e[9] * z + e[13]) / cw;
  if (cx < -1 - m || cx > 1 + m || cy < -1 - m || cy > 1 + m) return 0;
  return px >= NEAR_PX ? 1 : 2;
}

const VERT = (far: boolean) => /* glsl */ `
  attribute vec4 aInst; attribute float aPart;   // aInst = x, z, 수종, 난수
  uniform vec3 uLeafA[${KINDS}], uLeafB[${KINDS}];
  uniform float uLeaf[${KINDS}];
  uniform vec2 uSize[${KINDS}];
  varying vec3 vN; varying float vPart; varying float vDist; varying float vH; varying vec2 vXZ; varying vec3 vLeaf;
  void main() {
    int k = int(aInst.z + 0.5);
    vec4 c = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
    float s = ${sizeGlsl('tree', '-c.z')} * (0.85 + 0.2 * aInst.w);
    float leaf = uLeaf[k];
    vec3 p = position;
    ${
      far
        ? // 단순한 모형: 잎이 지면 잔가지 덩어리로 작게
          `if (aPart > 0.5) p.xz *= mix(0.55, 1.0, leaf);`
        : // 자세한 모형: 잎이 줄면 수관이 줄기 끝 쪽으로 작아지고, 잎이 없으면 가지만 남는다
          `if (aPart > 0.5) { float g = leaf > 0.02 ? mix(0.6, 1.0, leaf) : 0.0; p = vec3(p.x * g, 0.3 + (p.y - 0.3) * g, p.z * g); }`
    }
    p *= vec3(uSize[k].x, uSize[k].y, uSize[k].x) * s;
    p.x += sin(uTime * 0.9 + aInst.w * 40.0) * 0.012 * p.y * aPart;   // 바람
    vN = normal; vPart = aPart; vH = position.y; vXZ = aInst.xy;
    vLeaf = mix(uLeafB[k], uLeafA[k], step(0.5, fract(aInst.w * 5.3)));
    vec4 mv = viewMatrix * vec4(p + vec3(aInst.x, 0.0, aInst.y), 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */ `
  varying vec3 vN; varying float vPart; varying float vDist; varying float vH; varying vec2 vXZ; varying vec3 vLeaf;
  void main() {
    if (dither(gl_FragCoord.xy) < focusIn(vXZ) * 0.82) discard;      // 지하 들여다보기
    vec3 leaf = vLeaf * mix(0.84, 1.06, smoothstep(0.3, 0.95, vH));
    vec3 alb = mix(vec3(0.42, 0.34, 0.28), leaf, vPart);
    alb = mix(alb, alb * vec3(0.62, 0.72, 0.84), uNight * 0.8);         // 밤: 푸른 하늘빛에 잎이 조금 가라앉는다
    gl_FragColor = vec4(fogged(lit(alb, normalize(vN)), vDist), 1.0);
  }`;

export function makeTrees(xz: Float32Array, season: Season) {
  const n = xz.length / 2;
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) seed[i] = Math.abs(Math.sin(xz[i * 2] * 12.9898 + xz[i * 2 + 1] * 78.233) * 43758.5453) % 1;
  // 수종: trees.json 이 오기 전과 로드뷰 기록 나무는 '그 밖 활엽'
  const kind = new Uint8Array(n).fill(5);
  const uniforms = {
    uLeafA: { value: Array.from({ length: KINDS }, () => new THREE.Color()) },
    uLeafB: { value: Array.from({ length: KINDS }, () => new THREE.Color()) },
    uLeaf: { value: new Array(KINDS).fill(1) },
    uSize: { value: TREE_SIZE.map(([d, h]) => new THREE.Vector2(d, h)) },
  };
  const mat = (far: boolean) => material({ uniforms, vertex: VERT(far), fragment: FRAG });
  const group = new THREE.Group();
  const near = NEAR_GEO.map((g) => instanced(g, n, { aInst: 4 }));
  const far = instanced(FAR_GEO, n, { aInst: 4 });
  for (const [i, m] of [...near, far].entries()) {
    const mesh = new THREE.Mesh(m.geo, mat(i === near.length));
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  const pv = new THREE.Matrix4();
  const last = new Float32Array(16);
  let dirty = true;
  /** 화면 안 나무만 모형별 인스턴스로 다시 채운다(카메라가 움직였거나 수종이 바뀌었을 때만) */
  function update(cam: THREE.Camera) {
    pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const e = pv.elements;
    let same = !dirty;
    for (let i = 0; i < 16 && same; i++) same = Math.abs(e[i] - last[i]) < 1e-7;
    if (same) return;
    last.set(e);
    dirty = false;
    const cnt = new Array(near.length + 1).fill(0);
    const projK = env.uProjK.value;
    for (let i = 0; i < n; i++) {
      const lod = treeLod(e, projK, xz[i * 2], xz[i * 2 + 1]);
      if (!lod) continue;
      const k = kind[i];
      const slot = lod === 1 ? Math.min(k, 5) : near.length;
      const q = cnt[slot]++;
      (slot === near.length ? far : near[slot]).arr.aInst.set([xz[i * 2], xz[i * 2 + 1], k, seed[i]], q * 4);
    }
    [...near, far].forEach((m, j) => {
      m.geo.instanceCount = cnt[j];
      m.attr.aInst.needsUpdate = true;
      m.attr.aInst.addUpdateRange(0, cnt[j] * 4);
    });
  }
  /** 그리는 나무 정점 수(측정용) */
  const drawnVerts = () => near.reduce((a, m, k) => a + m.geo.instanceCount * NEAR_TREE_VERTS[k], 0) + far.geo.instanceCount * FAR_TREE_VERTS;
  function setKinds(k: ArrayLike<number>) {
    for (let i = 0; i < Math.min(n, k.length); i++) kind[i] = k[i];
    dirty = true;
  }
  function setSeason(s: Season) {
    LOOK[s].forEach(([a, b, leaf], k) => {
      uniforms.uLeafA.value[k].set(a);
      uniforms.uLeafB.value[k].set(b);
      uniforms.uLeaf.value[k] = leaf;
    });
  }
  setSeason(season);
  return { mesh: group, setSeason, setKinds, update, drawnVerts };
}
