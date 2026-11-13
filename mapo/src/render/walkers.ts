// 보행자. 머리와 몸통이 둥근 흰 캐릭터를 인스턴싱으로 그리고, 뒤뚱거리는 걸음은 버텍스 셰이더에서 만든다.
import * as THREE from 'three';
import type { Walkers } from '../sim/walkers.ts';
import { material, pal } from './env.ts';
import { instanced, merge, part } from './util.ts';

// 부품: 0 몸통, 1 머리, 2·3 다리, 4·5 팔, 6 발밑 그늘. 앞은 +x
function figure(): THREE.BufferGeometry {
  return merge([
    part(new THREE.CapsuleGeometry(0.27, 0.46, 2, 8).translate(0, 0.86, 0), 0),
    part(new THREE.SphereGeometry(0.255, 8, 6).translate(0.02, 1.47, 0), 1),
    part(new THREE.CapsuleGeometry(0.105, 0.3, 1, 5).translate(0, 0.27, 0.14), 2),
    part(new THREE.CapsuleGeometry(0.105, 0.3, 1, 5).translate(0, 0.27, -0.14), 3),
    part(new THREE.CapsuleGeometry(0.082, 0.3, 1, 5).translate(0, 0.9, 0.36), 4),
    part(new THREE.CapsuleGeometry(0.082, 0.3, 1, 5).translate(0, 0.9, -0.36), 5),
    part(new THREE.CircleGeometry(0.4, 8).rotateX(-Math.PI / 2).translate(0, 0.03, 0), 6),
  ]);
}

export function makeWalkerMesh(max: number) {
  const { geo, arr, attr } = instanced(figure(), max, { aInst: 4, aMore: 2 });
  const mesh = new THREE.Mesh(
    geo,
    material({
      uniforms: { uFigure: { value: pal.figure }, uLand: { value: pal.land } },
      vertex: /* glsl */ `
        attribute vec4 aInst;      // x, z, 방향, 걸음 위상
        attribute vec2 aMore;      // 나타남, 색 값
        attribute float aPart;
        varying vec3 vN; varying float vPart; varying float vTint; varying float vDist; varying float vH;
        vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
        void main() {
          vec3 p = position;
          float sw = sin(aInst.w);
          if (aPart > 1.5 && aPart < 3.5) {                 // 다리: 엉덩이를 축으로 앞뒤로
            p.y -= 0.5; p.xy = rot(p.xy, (aPart < 2.5 ? 1.0 : -1.0) * sw * 0.75); p.y += 0.5;
          } else if (aPart > 3.5 && aPart < 5.5) {          // 팔: 다리와 반대로
            p.y -= 1.12; p.xy = rot(p.xy, (aPart < 4.5 ? -1.0 : 1.0) * sw * 0.6); p.y += 1.12;
          }
          if (aPart < 5.5) {                                // 몸 전체: 좌우로 뒤뚱, 위아래로 통통
            p.yz = rot(p.yz, sw * 0.13);
            p.y += abs(cos(aInst.w)) * 0.07;
          }
          vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          float s = zoomScale(-cv.z, 1.75, 8.0, 1.6, 6.5) * aMore.x;
          p *= s;
          float cs = cos(aInst.z), sn = sin(aInst.z);
          vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y + 0.05, aInst.y + p.x * sn + p.z * cs);
          vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
          vPart = aPart; vTint = aMore.y; vH = position.y;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform vec3 uFigure, uLand;
        varying vec3 vN; varying float vPart; varying float vTint; varying float vDist; varying float vH;
        vec3 pastel(float t) {
          if (t < 0.70) return vec3(1.0);
          if (t < 0.76) return vec3(1.0, 0.80, 0.84);
          if (t < 0.82) return vec3(0.78, 0.93, 0.86);
          if (t < 0.88) return vec3(0.78, 0.88, 1.0);
          if (t < 0.94) return vec3(1.0, 0.93, 0.72);
          return vec3(0.88, 0.82, 0.98);
        }
        void main() {
          if (vPart > 5.5) {                                 // 발밑 그늘
            gl_FragColor = vec4(fogged(lit(uLand * 0.66, vec3(0.0, 1.0, 0.0)), vDist), 1.0);
            return;
          }
          vec3 n = normalize(vN);
          vec3 alb = uFigure * pastel(vTint) * mix(0.86, 1.0, smoothstep(0.0, 0.9, vH));
          vec3 col = lit(alb, n) * 1.06 + alb * (0.10 + 0.50 * uNight);
          gl_FragColor = vec4(fogged(col, vDist), 1.0);
        }`,
    }),
  );
  mesh.frustumCulled = false;
  function update(w: Walkers) {
    for (let i = 0; i < w.n; i++) {
      const j = i * 4;
      arr.aInst[j] = w.x[i];
      arr.aInst[j + 1] = w.z[i];
      arr.aInst[j + 2] = w.yaw[i];
      arr.aInst[j + 3] = w.phase[i];
      arr.aMore[i * 2] = w.fade[i];
      arr.aMore[i * 2 + 1] = w.tint[i];
    }
    geo.instanceCount = w.n;
    attr.aInst.needsUpdate = true;
    attr.aMore.needsUpdate = true;
  }
  return { mesh, update };
}
