// 다시 그리기 2단계 바닥과 3b 노면 표시(?v=2, docs/redraw-orders/3c-view.md): public/data/v2/split.json·marks.json 을 그린다.
// 예전 도로 그리기 모듈(roads·marks·signals·curbs·areas)은 쓰지 않는다
import * as THREE from 'three';
import { material, pal } from './env.ts';

type Ring = number[]; // [x, z, …] dm
type Poly = Ring[]; // 첫 고리 바깥, 나머지 구멍
export type SplitV2 = { v: number; area: number[]; car: Poly[]; walk: Poly[]; mix: Poly[]; ped: Poly[] };
export type MarksV2 = {
  v: number;
  area: number[];
  center: Ring[];
  lane: Ring[];
  solid: Ring[];
  stop: Ring[];
  cross: { p: Ring; sig: number; mid: number }[];
};

const FACES = ['car', 'walk', 'mix', 'ped'] as const;

/** 자료 형식 확인: 면은 다각형 목록, 선은 [x, z, …] 짝수 길이 */
export function checkSplitV2(j: unknown): SplitV2 {
  const s = j as SplitV2;
  for (const k of FACES) {
    if (!Array.isArray(s?.[k]) || !s[k].every((p) => Array.isArray(p) && p.every((r) => Array.isArray(r) && r.length >= 6 && r.length % 2 === 0)))
      throw new Error(`split.json 형식이 다르다: ${k}`);
  }
  return s;
}

export function checkMarksV2(j: unknown): MarksV2 {
  const m = j as MarksV2;
  for (const k of ['center', 'lane', 'solid', 'stop'] as const) {
    if (!Array.isArray(m?.[k]) || !m[k].every((r) => Array.isArray(r) && r.length >= 4 && r.length % 2 === 0)) throw new Error(`marks.json(v2) 형식이 다르다: ${k}`);
  }
  if (!Array.isArray(m.cross) || !m.cross.every((c) => Array.isArray(c.p) && c.p.length === 8)) throw new Error('marks.json(v2) 형식이 다르다: cross');
  return m;
}

/** dm 정수 → m 점 목록 */
function pts(r: Ring): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let k = 0; k + 1 < r.length; k += 2) out.push(new THREE.Vector2(r[k] / 10, r[k + 1] / 10));
  return out;
}

// ── 바닥 면 ──
function faceMesh(polys: Poly[], color: THREE.Color): THREE.Mesh {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const p of polys) {
    const outer = pts(p[0]);
    const holes = p.slice(1).map(pts);
    const base = pos.length / 3;
    for (const v of [outer, ...holes].flat()) pos.push(v.x, 0, v.y);
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(outer, holes)) idx.push(base + a, base + b, base + c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(
    g,
    material({
      offset: 2,
      doubleSide: true,
      uniforms: { uCol: { value: color } },
      vertex: /* glsl */ `
        varying float vDist;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform vec3 uCol; varying float vDist;
        void main() { gl_FragColor = vec4(fogged(lit(uCol, vec3(0.0, 1.0, 0.0)), vDist), 1.0); }`,
    }),
  );
  mesh.renderOrder = -5;
  mesh.frustumCulled = false;
  return mesh;
}

// ── 노면 표시 ──
const MARK_Y = 0.35; // 예전 노면 표시(src/render/marks.ts)와 같은 높이
const W_LINE = 0.15;
const W_STOP = 0.45;
const DASH = 3;
const GAP = 5;
const STRIPE = 0.45; // 횡단보도 줄무늬: 0.45m 칠하고 0.45m 띄움
const WHITE = 0;
const YELLOW = 1;

/** 점선 조각: 선의 처음부터 선을 따라 3m 칠하고 5m 띄운다 */
function dashes(p: THREE.Vector2[]): THREE.Vector2[][] {
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + p[i].distanceTo(p[i - 1]));
  const at = (t: number) => {
    for (let i = 1; i < p.length; i++)
      if (t <= cum[i] || i === p.length - 1) {
        const f = cum[i] === cum[i - 1] ? 0 : (t - cum[i - 1]) / (cum[i] - cum[i - 1]);
        return p[i - 1].clone().lerp(p[i], f);
      }
    return p[p.length - 1].clone();
  };
  const out: THREE.Vector2[][] = [];
  const total = cum[cum.length - 1];
  for (let t = 0; t < total; t += DASH + GAP) {
    const e = Math.min(t + DASH, total);
    const piece = [at(t)];
    for (let i = 0; i < p.length; i++) if (cum[i] > t && cum[i] < e) piece.push(p[i]);
    piece.push(at(e));
    if (piece.length >= 2) out.push(piece);
  }
  return out;
}

class MarkBuf {
  pos: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  quad(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, d: THREE.Vector2, color: number) {
    const base = this.pos.length / 3;
    for (const v of [a, b, c, d]) {
      this.pos.push(v.x, MARK_Y, v.y);
      this.col.push(color);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** 선분마다 폭 w 의 띠 */
  line(p: THREE.Vector2[], w: number, color: number) {
    for (let i = 1; i < p.length; i++) {
      const d = p[i].clone().sub(p[i - 1]);
      if (d.lengthSq() === 0) continue;
      const n = new THREE.Vector2(-d.y, d.x).normalize().multiplyScalar(w / 2);
      this.quad(p[i - 1].clone().add(n), p[i].clone().add(n), p[i].clone().sub(n), p[i - 1].clone().sub(n), color);
    }
  }
  mesh(alpha: number, order: number): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.col, 1));
    g.setIndex(this.idx);
    const m = new THREE.Mesh(
      g,
      material({
        transparent: true,
        depthWrite: false,
        offset: 5,
        doubleSide: true,
        vertex: /* glsl */ `
          attribute float aCol; varying float vCol;
          void main() { vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        // 색과 밤의 밝기는 예전 차선(src/render/marks.ts paint())과 같다
        fragment: /* glsl */ `
          varying float vCol;
          vec3 paint(float c) { return c < 0.5 ? vec3(0.95, 0.95, 0.93) : vec3(0.96, 0.76, 0.24); }
          void main() { gl_FragColor = vec4(paint(vCol) * (0.8 + 0.25 * (1.0 - uNight)), ${alpha.toFixed(2)}); }`,
      }),
    );
    m.renderOrder = order;
    m.frustumCulled = false;
    return m;
  }
}

export function makeGroundV2(split: SplitV2, marks: MarksV2): THREE.Group {
  const group = new THREE.Group();
  group.add(faceMesh(split.car, pal.tarmac), faceMesh(split.mix, pal.tarmacMinor), faceMesh(split.walk, pal.paving), faceMesh(split.ped, pal.walk));

  // 선과 정지선(renderOrder −2.6, 예전 차선과 같은 투명도 0.85)
  const lines = new MarkBuf();
  for (const r of marks.center) lines.line(pts(r), W_LINE, YELLOW);
  for (const r of marks.solid) lines.line(pts(r), W_LINE, WHITE);
  for (const r of marks.lane) for (const d of dashes(pts(r))) lines.line(d, W_LINE, WHITE);
  for (const r of marks.stop) lines.line(pts(r), W_STOP, WHITE);
  group.add(lines.mesh(0.85, -2.6));

  // 횡단보도 줄무늬(renderOrder −2.5): 꼭짓점 E0+2v, EN+2v, EN+8v, E0+8v. 가까운 변(앞 두 점)을 0.9m 로 나눠 줄 수를 정하고,
  // 줄무늬가 차지하는 폭(n × 0.9 − 0.45)을 뺀 나머지를 양 끝에 고르게 남긴다. 줄은 가까운 변에서 먼 변으로 놓는다
  const cross = new MarkBuf();
  for (const c of marks.cross) {
    const [p0, p1, p2, p3] = pts(c.p);
    const len = p0.distanceTo(p1);
    const n = Math.floor(len / (2 * STRIPE));
    if (n < 1) continue;
    const margin = (len - (n * 2 * STRIPE - STRIPE)) / 2;
    for (let k = 0; k < n; k++) {
      const f0 = (margin + k * 2 * STRIPE) / len;
      const f1 = (margin + k * 2 * STRIPE + STRIPE) / len;
      cross.quad(p0.clone().lerp(p1, f0), p0.clone().lerp(p1, f1), p3.clone().lerp(p2, f1), p3.clone().lerp(p2, f0), WHITE);
    }
  }
  group.add(cross.mesh(1, -2.5));
  return group;
}
