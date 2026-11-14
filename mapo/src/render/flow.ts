// 교통 흐름. 큰길(차 구간 가운데 골목이 아닌 길)마다 진행 방향 차로 위에 얇은 띠를 깔고,
// 자료 공급자가 주는 도로 속도 비율로 색을 칠한다(원활 초록, 서행 노랑, 정체 빨강).
// 2단계에서 공급자가 실제 도로 속도를 주면 같은 띠에 그대로 실린다. 멀리서도 보이도록 화면에서 최소 굵기를 지킨다.
import * as THREE from 'three';
import type { Now } from '../sim/clock.ts';
import { LANE, type Edge } from '../sim/graph.ts';
import type { DataProvider } from '../sim/provider.ts';
import { material } from './env.ts';

/** [이름, 색] 원활·서행·정체 */
export const FLOW_LEVELS = [
  ['원활', '#5fd08a'],
  ['서행', '#f0cf5a'],
  ['정체', '#f0605d'],
] as const;

export function makeFlow(edges: Edge[]) {
  const used = edges.filter((e) => e.cls <= 3);
  const pos: number[] = [];
  const side: number[] = [];
  const norm: number[] = [];
  const idx: number[] = [];
  const start: number[] = [];
  for (const e of used) {
    start.push(pos.length / 3);
    const off = e.off0 + ((e.lanes - 1) / 2) * LANE;
    const n = e.p.length / 3;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1) * 3;
      const b = Math.min(n - 1, i + 1) * 3;
      let dx = e.p[b] - e.p[a];
      let dz = e.p[b + 2] - e.p[a + 2];
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      // 진행 방향 오른쪽 (-dz, dx) 으로 차로 가운데까지 옮긴다
      const x = e.p[i * 3] - dz * off;
      const z = e.p[i * 3 + 2] + dx * off;
      const y = e.p[i * 3 + 1] + 0.4;
      const q = pos.length / 3;
      pos.push(x, y, z, x, y, z);
      side.push(-1, 1);
      norm.push(-dz, dx, -dz, dx);
      if (i > 0) idx.push(q - 2, q - 1, q, q - 1, q + 1, q);
    }
  }
  start.push(pos.length / 3);
  const mid = used.map((e) => Math.min(e.p.length / 3 - 2, Math.floor(e.p.length / 6))); // 구간 가운데 조각의 시작 점 번호(도로 속도를 그 자리와 방향으로 묻는다)
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  geo.setAttribute('aNorm', new THREE.Float32BufferAttribute(norm, 2));
  const speed = new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(1), 1);
  geo.setAttribute('aSpeed', speed);
  geo.setIndex(idx);
  const [g, y, r] = FLOW_LEVELS.map(([, c]) => new THREE.Color(c));
  const mesh = new THREE.Mesh(
    geo,
    material({
      transparent: true,
      depthWrite: false,
      offset: 4,
      doubleSide: true,
      uniforms: { uGreen: { value: g }, uYellow: { value: y }, uRed: { value: r } },
      vertex: /* glsl */ `
        attribute float aSide; attribute vec2 aNorm; attribute float aSpeed;
        varying float vSpeed; varying float vDist;
        void main() {
          vec4 cv = viewMatrix * vec4(position, 1.0);
          // 띠 폭 1.2m, 화면에서는 2.5px 보다 가늘어지지 않게
          float w = 0.6 * zoomScale(-cv.z, 1.2, 2.5, 1.0, 14.0);
          vec3 p = position + vec3(aNorm.x, 0.0, aNorm.y) * aSide * w;
          vSpeed = aSpeed;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform vec3 uGreen, uYellow, uRed;
        varying float vSpeed; varying float vDist;
        void main() {
          vec3 c = vSpeed >= 0.6 ? uGreen : vSpeed >= 0.35 ? uYellow : uRed;
          // 가까이 다가가면 차가 잘 보이도록 옅게
          float a = mix(0.3, 0.85, smoothstep(120.0, 600.0, vDist));
          gl_FragColor = vec4(c * (0.85 + 0.25 * uNight), a);
        }`,
    }),
  );
  mesh.renderOrder = -3;
  mesh.frustumCulled = false;

  /** 공급자의 지금 속도 비율로 색을 다시 칠한다(몇 초에 한 번이면 충분하다) */
  function update(provider: DataProvider, now: Now) {
    const a = speed.array as Float32Array;
    used.forEach((e, k) => {
      const m = mid[k] * 3;
      const h = Math.atan2(e.p[m + 5] - e.p[m + 2], e.p[m + 3] - e.p[m]);
      a.fill(provider.roadSpeed(now, e.cls, e.key, e.p[m], e.p[m + 2], h), start[k], start[k + 1]);
    });
    speed.needsUpdate = true;
  }
  return { mesh, update };
}
