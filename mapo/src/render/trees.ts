// 나무. 녹지에 뿌려 둔 점마다 둥근 수관과 줄기를 인스턴싱으로 그린다.
// 잎 색은 계절을 따르고(설정에서 바꿀 수 있다), 벚꽃 철에는 절반쯤이 분홍 꽃나무가 되며 겨울에는 수관이 작아진다.
import * as THREE from 'three';
import type { Season } from '../sim/season.ts';
import { material } from './env.ts';
import { instanced, merge, part } from './util.ts';

/** 계절 → [잎 색 A, 잎 색 B, A·B 를 나무마다 딱 갈라 쓰는가(0 섞기, 1 가르기), 수관 크기] */
const LOOK: Record<Season, [string, string, number, number]> = {
  blossom: ['#f8c3d4', '#b9db92', 1, 1],
  green: ['#a9cf86', '#6fa86a', 0, 1],
  autumn: ['#ecb24a', '#cc5e36', 0, 1],
  winter: ['#a79a86', '#8a8272', 0, 0.62],
};

export function makeTrees(xz: Float32Array, season: Season) {
  const base = merge([
    part(new THREE.IcosahedronGeometry(1, 0).scale(3.0, 3.3, 3.0).translate(0, 5.0, 0), 1),
    part(new THREE.CylinderGeometry(0.28, 0.4, 2.8, 5).translate(0, 1.4, 0), 0),
  ]);
  const n = xz.length / 2;
  const { geo, arr } = instanced(base, n, { aInst: 4 });
  for (let i = 0; i < n; i++) {
    const s = Math.abs(Math.sin(xz[i * 2] * 12.9898 + xz[i * 2 + 1] * 78.233) * 43758.5453) % 1;
    arr.aInst.set([xz[i * 2], xz[i * 2 + 1], 0.75 + s * 0.7, s], i * 4);
  }
  geo.instanceCount = n;
  const uniforms = { uLeafA: { value: new THREE.Color() }, uLeafB: { value: new THREE.Color() }, uSplit: { value: 0 }, uCrown: { value: 1 } };
  const mesh = new THREE.Mesh(
    geo,
    material({
      uniforms,
      vertex: /* glsl */ `
        attribute vec4 aInst; attribute float aPart;
        uniform float uCrown;
        varying vec3 vN; varying float vPart; varying float vSeed; varying float vDist; varying float vH; varying vec2 vXZ;
        void main() {
          vec4 c = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          float s = aInst.z * zoomScale(-c.z, 8.0, 9.0, 1.0, 2.6);
          vec3 p = position;
          if (aPart > 0.5) p = vec3(p.x * uCrown, 2.8 + (p.y - 2.8) * mix(1.0, uCrown, 0.8), p.z * uCrown);   // 겨울: 가지만 남은 작은 수관
          p *= s;
          p.x += sin(uTime * 0.9 + aInst.w * 40.0) * 0.06 * position.y * aPart;   // 바람
          vN = normal; vPart = aPart; vSeed = aInst.w; vH = position.y; vXZ = aInst.xy;
          vec4 mv = viewMatrix * vec4(p + vec3(aInst.x, 0.0, aInst.y), 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform vec3 uLeafA, uLeafB; uniform float uSplit;
        varying vec3 vN; varying float vPart; varying float vSeed; varying float vDist; varying float vH; varying vec2 vXZ;
        void main() {
          if (dither(gl_FragCoord.xy) < focusIn(vXZ) * 0.82) discard;      // 지하 들여다보기
          float k = fract(vSeed * 5.3);
          k = mix(k, step(0.45, k), uSplit);
          vec3 leaf = mix(uLeafB, uLeafA, k) * mix(0.82, 1.08, smoothstep(2.5, 8.0, vH));
          vec3 alb = mix(vec3(0.42, 0.33, 0.27), leaf, vPart);
          alb = mix(alb, alb * vec3(0.30, 0.36, 0.46), uNight * 0.82);
          gl_FragColor = vec4(fogged(lit(alb, normalize(vN)), vDist), 1.0);
        }`,
    }),
  );
  mesh.frustumCulled = false;
  function setSeason(s: Season) {
    const [a, b, split, crown] = LOOK[s];
    uniforms.uLeafA.value.set(a);
    uniforms.uLeafB.value.set(b);
    uniforms.uSplit.value = split;
    uniforms.uCrown.value = crown;
  }
  setSeason(season);
  return { mesh, setSeason };
}
