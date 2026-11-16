// 연석과 점자블록(재작업 W14). 연석은 그린 찻길 면 전체의 경계(public/data/curbs.json, tools/bake.ts)를 따라 폭 0.2m·높이 0.15m 의 화강석 띠로,
// 점자블록은 횡단보도 양 끝 보도 쪽에 노란 점형 블록 띠(깊이 0.6m, 횡단보도 폭)로 세운다.
// 기준: 서울시 「보도공사 설계·시공 매뉴얼」(2021 ver2.0)의 횡단보도 진입부 점자블록, 보도 블록 무늬는 areas.ts 의 보도 재질.
import * as THREE from 'three';
import type { Curbs } from '../data/surface.ts';
import { material, pal } from './env.ts';

const H = 0.15;
const W = 0.2;

function dropArray(this: THREE.BufferAttribute) {
  (this as { array: unknown }).array = null;
}

/** 판을 이 크기(m) 칸으로 나눠 칸마다 한 덩어리로 그린다: 화면 밖 칸은 그리지 않는다(W19) */
const TILE = 500;
const EMPTY = new Float32Array(0);

export function makeCurbs(c: Curbs): THREE.Group {
  // 칸마다 꼭짓점(위치·법선·색 구분)과 네모 하나에 삼각형 둘을 잇는 번호. 네모 넷 꼭짓점을 나눠 써서 꼭짓점이 6 → 4 로 준다.
  // 처음 한 번은 칸마다 네모 수만 세고, 두 번째에 그 크기의 배열에 바로 쓴다(수백만 꼭짓점을 숫자 목록에 쌓았다 옮기면 불러올 때 수백 MB 가 버려진다)
  type Tile = { nq: number; k: number; pos: Float32Array; nrm: Float32Array; tone: Float32Array };
  const tiles = new Map<number, Tile>();
  const tileAt = (x: number, z: number) => {
    const key = (Math.floor(x / TILE) + 64) * 128 + (Math.floor(z / TILE) + 64);
    let t = tiles.get(key);
    if (!t) tiles.set(key, (t = { nq: 0, k: 0, pos: EMPTY, nrm: EMPTY, tone: EMPTY }));
    return t;
  };
  let T = tileAt(0, 0);
  let fill = false;
  const quad = (a: number[], b: number[], cc: number[], d: number[], n: number[], t: number) => {
    if (!fill) return void T.nq++;
    for (const v of [a, b, cc, d]) {
      const k = T.k++;
      T.pos.set(v, k * 3);
      T.nrm.set(n, k * 3);
      T.tone[k] = t;
    }
  };
  const each = () => {
    for (const P of c.lines) {
      const n = P.length / 3;
      for (let i = 0; i + 1 < n; i++) {
        const [ax, az, bx, bz] = [P[i * 3], P[i * 3 + 2], P[i * 3 + 3], P[i * 3 + 5]];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 1e-3) continue;
        T = tileAt((ax + bx) / 2, (az + bz) / 2);
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
      T = tileAt(t.x, t.z);
      quad([t.x - fx + px, y, t.z - fz + pz], [t.x + fx + px, y, t.z + fz + pz], [t.x + fx - px, y, t.z + fz - pz], [t.x - fx - px, y, t.z - fz - pz], [0, 1, 0], 1);
    }
  };
  each();
  for (const t of tiles.values()) (t.pos = new Float32Array(t.nq * 12)), (t.nrm = new Float32Array(t.nq * 12)), (t.tone = new Float32Array(t.nq * 4));
  fill = true;
  each();
  const mat = material({
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
  });
  const group = new THREE.Group();
  for (const t of tiles.values()) {
    const nq = t.nq;
    if (!nq) continue;
    const idx = new Uint32Array(nq * 6);
    for (let q = 0; q < nq; q++) idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(t.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(t.nrm, 3));
    g.setAttribute('aTone', new THREE.BufferAttribute(t.tone, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    // 그래픽 카드로 올린 뒤에는 꼭짓점 배열을 놓는다(바뀌지 않고 고르기에도 쓰지 않는다)
    for (const a of [...Object.values(g.attributes), g.index!] as THREE.BufferAttribute[]) a.onUpload(dropArray);
    group.add(new THREE.Mesh(g, mat));
  }
  return group;
}
