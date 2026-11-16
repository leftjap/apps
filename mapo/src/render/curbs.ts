// 연석과 점자블록(재작업 W14). 연석은 그린 찻길 면 전체의 경계(public/data/curbs.json, tools/bake.ts)를 따라 폭 0.2m·높이 0.15m 의 화강석 띠로,
// 점자블록은 횡단보도 양 끝 보도 쪽에 노란 점형 블록 띠(깊이 0.6m, 횡단보도 폭)로 세운다.
// 기준: 서울시 「보도공사 설계·시공 매뉴얼」(2021 ver2.0)의 횡단보도 진입부 점자블록, 보도 블록 무늬는 areas.ts 의 보도 재질.
import * as THREE from 'three';
import type { Curbs } from '../data/surface.ts';
import { material, pal } from './env.ts';

const H = 0.15;
const W = 0.2;

export function makeCurbs(c: Curbs): THREE.Group {
  const pos: number[] = [];
  const nrm: number[] = [];
  const tone: number[] = [];
  const quad = (a: number[], b: number[], cc: number[], d: number[], n: number[], t: number) => {
    for (const v of [a, b, cc, a, cc, d]) pos.push(v[0], v[1], v[2]), nrm.push(...n), tone.push(t);
  };
  for (const P of c.lines) {
    const n = P.length / 3;
    for (let i = 0; i + 1 < n; i++) {
      const [ax, az, bx, bz] = [P[i * 3], P[i * 3 + 2], P[i * 3 + 3], P[i * 3 + 5]];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-3) continue;
      // 옆 방향(왼쪽)으로 반폭
      const [lx, lz] = [(-(bz - az) / L) * (W / 2), ((bx - ax) / L) * (W / 2)];
      // 윗면
      quad([ax + lx, H, az + lz], [bx + lx, H, bz + lz], [bx - lx, H, bz - lz], [ax - lx, H, az - lz], [0, 1, 0], 0);
      // 양 옆면(찻길 쪽·보도 쪽)
      for (const s of [1, -1]) {
        const nx = (lx / (W / 2)) * s;
        const nz = (lz / (W / 2)) * s;
        quad([ax + lx * s, 0, az + lz * s], [bx + lx * s, 0, bz + lz * s], [bx + lx * s, H, bz + lz * s], [ax + lx * s, H, az + lz * s], [nx, 0, nz], 0);
      }
    }
  }
  for (const t of c.tactile) {
    // 바깥 방향 (ux, uz), 옆 (−uz, ux). 깊이 0.6m, 폭 w
    const [px, pz] = [-t.uz * (t.w / 2), t.ux * (t.w / 2)];
    const [fx, fz] = [t.ux * 0.3, t.uz * 0.3];
    const y = 0.17;
    quad([t.x - fx + px, y, t.z - fz + pz], [t.x + fx + px, y, t.z + fz + pz], [t.x + fx - px, y, t.z + fz - pz], [t.x - fx - px, y, t.z - fz - pz], [0, 1, 0], 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aTone', new THREE.Float32BufferAttribute(tone, 1));
  const mesh = new THREE.Mesh(
    g,
    material({
      doubleSide: true,
      offset: 3,
      uniforms: { uCurb: { value: pal.curb } },
      vertex: /* glsl */ `attribute float aTone; varying float vTone; varying vec3 vN; varying vec3 vW; varying float vDist;
        void main() { vTone = aTone; vN = normal; vW = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragment: /* glsl */ `uniform vec3 uCurb; varying float vTone; varying vec3 vN; varying vec3 vW; varying float vDist;
        void main() {
          vec3 alb = uCurb;
          if (vTone > 0.5) {
            // 점형 블록: 노랑 바탕에 0.3m 칸마다 돌기 점
            vec2 q = fract(vW.xz / 0.075) - 0.5;
            alb = vec3(0.93, 0.76, 0.18) * (1.0 - 0.18 * step(length(q), 0.28));
          }
          vec3 col = lit(alb, normalize(vN));
          gl_FragColor = vec4(fogged(col, vDist), 1.0);
        }`,
    }),
  );
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}
