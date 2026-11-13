// 나무. 녹지에 뿌려 둔 점마다 둥근 수관과 줄기를 인스턴싱으로 그린다. 잎 색은 계절을 따른다.
import * as THREE from 'three';
import { material } from './env.ts';
import { instanced, merge, part } from './util.ts';

/** 날짜 번호 → 잎 색 두 가지(밝은 쪽, 어두운 쪽) */
function foliage(doy: number): [string, string] {
  if (doy >= 95 && doy < 115) return ['#f6c6d6', '#bfd9a0']; // 벚꽃 철
  if (doy >= 290 && doy < 335) return ['#e9b04a', '#c9663a']; // 단풍
  if (doy >= 335 || doy < 75) return ['#a79a86', '#8a8272']; // 겨울 가지
  return ['#a9cf86', '#6fa86a'];
}

export function makeTrees(xz: Float32Array, doy: number): THREE.Mesh {
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
  const [c1, c2] = foliage(doy);
  const mesh = new THREE.Mesh(
    geo,
    material({
      uniforms: { uLeafA: { value: new THREE.Color(c1) }, uLeafB: { value: new THREE.Color(c2) } },
      vertex: /* glsl */ `
        attribute vec4 aInst; attribute float aPart;
        varying vec3 vN; varying float vPart; varying float vSeed; varying float vDist; varying float vH;
        void main() {
          vec4 c = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          float s = aInst.z * zoomScale(-c.z, 8.0, 9.0, 1.0, 2.6);
          vec3 p = position * s;
          p.x += sin(uTime * 0.9 + aInst.w * 40.0) * 0.06 * position.y * aPart;   // 바람
          vN = normal; vPart = aPart; vSeed = aInst.w; vH = position.y;
          vec4 mv = viewMatrix * vec4(p + vec3(aInst.x, 0.0, aInst.y), 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform vec3 uLeafA, uLeafB;
        varying vec3 vN; varying float vPart; varying float vSeed; varying float vDist; varying float vH;
        void main() {
          vec3 leaf = mix(uLeafB, uLeafA, fract(vSeed * 5.3)) * mix(0.82, 1.08, smoothstep(2.5, 8.0, vH));
          vec3 alb = mix(vec3(0.42, 0.33, 0.27), leaf, vPart);
          alb = mix(alb, alb * vec3(0.30, 0.36, 0.46), uNight * 0.82);
          gl_FragColor = vec4(fogged(lit(alb, normalize(vN)), vDist), 1.0);
        }`,
    }),
  );
  mesh.frustumCulled = false;
  return mesh;
}
