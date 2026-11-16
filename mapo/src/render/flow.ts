// 교통 흐름. 멀리 볼 때(카메라에서 1.2~2km 넘게)만 보이는 교통 지도다. 큰길(차 구간 가운데 골목이 아닌 길)마다 진행 방향 차로 위에 얇은 띠를 깔고,
// 자료 공급자가 주는 도로 속도 비율이 느린 구간만 칠한다(서행 주황, 정체 빨강). 원활한 길은 칠하지 않아
// 노면 표시(흰 차선, 노란 중앙선, 파란 버스전용차로)와 섞이지 않고 막히는 곳만 눈에 띈다.
// 2단계에서 공급자가 실제 도로 속도를 주면 같은 띠에 그대로 실린다. 멀리서도 보이도록 화면에서 최소 굵기를 지킨다.
// 띠는 교차로 상자 밖, 그리고 찻길 띠가 그려진 구간(교차로 면 밖, public/data/surface.json 의 cut)에만 깐다(교차로 안은 여러 방향 띠가 겹친다).
import * as THREE from 'three';
import { pointAt } from '../poly.ts';
import type { Now } from '../sim/clock.ts';
import { laneOff, type Edge } from '../sim/graph.ts';
import type { Junctions } from '../sim/junctions.ts';
import type { DataProvider } from '../sim/provider.ts';
import { material } from './env.ts';

/** [이름, 색] 띠로 칠하는 단계: 서행(속도 비율 0.35~0.6)·정체(0.35 미만). 0.6 이상(원활)은 칠하지 않는다 */
export const FLOW_LEVELS = [
  ['서행', '#f59b4b'],
  ['정체', '#f0605d'],
] as const;

/** 구간 e 에서 교차로 상자 밖이고 찻길 띠가 그려진 부분: 점마다 [x,y,z, 구간 위 거리 s]. 없으면 빈 배열. cut 은 길 조각마다 띠 구간(src/data/surface.ts) */
function outsideBoxes(e: Edge, jn: Junctions, cut?: ArrayLike<number>): number[] {
  let s0 = jn.groupOfStart[e.id] >= 0 ? jn.rOut[e.id] : 0;
  let s1 = e.len - (jn.groupOfEnd[e.id] >= 0 ? jn.rIn[e.id] : 0);
  if (cut) {
    // 띠 구간은 길 조각 기준 거리다. 구간은 조각의 그 방향에서 s0 부터 시작하고, 조각을 거슬러 가면 조각의 끝이 그 방향의 시작이다
    const [a, b] = [cut[e.road * 2], Math.min(e.full, cut[e.road * 2 + 1])];
    s0 = Math.max(s0, (e.rev ? e.full - b : a) - e.s0);
    s1 = Math.min(s1, (e.rev ? e.full - a : b) - e.s0);
  }
  if (s1 - s0 < 1) return [];
  const tmp = [0, 0, 0];
  pointAt(e.p, e.cum, s0, tmp);
  const out = [...tmp, s0];
  for (let i = 1; i < e.cum.length; i++) if (e.cum[i] > s0 && e.cum[i] < s1) out.push(e.p[i * 3], e.p[i * 3 + 1], e.p[i * 3 + 2], e.cum[i]);
  pointAt(e.p, e.cum, s1, tmp);
  out.push(...tmp, s1);
  return out;
}

export function makeFlow(edges: Edge[], jn: Junctions, cut?: ArrayLike<number>) {
  const used = edges.filter((e) => e.cls <= 3);
  const pos: number[] = [];
  const side: number[] = [];
  const norm: number[] = [];
  const idx: number[] = [];
  const start: number[] = [];
  for (const e of used) {
    start.push(pos.length / 3);
    const p = outsideBoxes(e, jn, cut);
    const n = p.length / 4;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1) * 4;
      const b = Math.min(n - 1, i + 1) * 4;
      let dx = p[b] - p[a];
      let dz = p[b + 2] - p[a + 2];
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      // 진행 방향 오른쪽 (-dz, dx) 으로 차로들 가운데까지 옮긴다
      const off = (laneOff(e, 0, p[i * 4 + 3]) + laneOff(e, e.lanes - 1, p[i * 4 + 3])) / 2;
      const x = p[i * 4] - dz * off;
      const z = p[i * 4 + 2] + dx * off;
      const y = p[i * 4 + 1] + 0.4;
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
  const [slow, jam] = FLOW_LEVELS.map(([, c]) => new THREE.Color(c));
  const mesh = new THREE.Mesh(
    geo,
    material({
      transparent: true,
      depthWrite: false,
      offset: 4,
      doubleSide: true,
      uniforms: { uSlow: { value: slow }, uJam: { value: jam } },
      vertex: /* glsl */ `
        attribute float aSide; attribute vec2 aNorm; attribute float aSpeed;
        varying float vSpeed; varying float vDist;
        void main() {
          vec4 cv = viewMatrix * vec4(position, 1.0);
          // 띠 폭 1.6m, 화면에서는 4px 보다 가늘어지지 않게
          float w = 0.8 * zoomScale(-cv.z, 1.6, 4.0, 1.0, 14.0);
          vec3 p = position + vec3(aNorm.x, 0.0, aNorm.y) * aSide * w;
          vSpeed = aSpeed;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform vec3 uSlow, uJam;
        varying float vSpeed; varying float vDist;
        void main() {
          if (vSpeed >= 0.6) discard;
          // 멀리 볼 때만 보이는 교통 지도: 1.2km 안에서는 그리지 않는다(가까이서는 차가 막힘을 보여 주고, 띠가 노면 표시·분리대처럼 보인다)
          float a = 0.85 * smoothstep(1200.0, 2000.0, vDist);
          if (a < 0.01) discard;
          vec3 c = (vSpeed >= 0.35 ? uSlow : uJam) * (0.9 + 0.25 * uNight);
          gl_FragColor = vec4(c, a);
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
