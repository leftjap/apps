// 노면 표시. 서울시 차선 선(OA-15537)을 긋고(차로를 가르는 선·정지선은 길 정본에서 만든 자리, 재작업 W49. 중앙선·차선·진로변경제한선·정지선·주행유도선·자전거횡단도 등, 색·실선·점선·겹선은 종류대로. 자전거횡단도는 0.5m 흰 네모 줄),
// 안전지대(OA-15533)는 빗금 면, 노면 화살표(OA-15536)는 모양으로 칠한다(src/data/marks.ts).
// 선은 화면에서 한 픽셀보다 가늘어져도 깜박이지 않게 그리는 폭을 화면 크기에 맞춰 넓히고, 칠은 픽셀 단위로 부드럽게 한다. 멀어지면 옅어진다.
import * as THREE from 'three';
import { arrowOnCrossing, arrowShape, lineStyle, type Band, type Marks } from '../data/marks.ts';
import { material } from './env.ts';

const DIM = /* glsl */ `
  // 화면에서 한 픽셀이 1.2m 넘게 덮을 만큼 멀면 옅게 지운다
  float far(float px, float d) { return clamp(1.0 - px / 1.2, 0.0, 1.0) * (1.0 - smoothstep(1200.0, 2200.0, d)); }
  vec3 paint(float c) { return c < 0.5 ? vec3(0.95, 0.95, 0.93) : c < 1.5 ? vec3(0.96, 0.76, 0.24) : vec3(0.27, 0.48, 0.95); }`;

/** bands 는 그리는 횡단보도 줄무늬 면(crossingBands): 그 면에 걸리는 화살표는 그리지 않는다(재작업 W59) */
export function makeMarks(marks: Marks, bands: Band[] = []): THREE.Group {
  const group = new THREE.Group();
  // ── 선 ──
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const sty: number[] = [];
  const hal: number[] = [];
  const idx: number[] = [];
  const addLine = (P: ArrayLike<number>, s: ReturnType<typeof lineStyle>, closed = false, phase = 0) => {
    const n = P.length / 3;
    const at = (i: number) => (closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i)));
    const base = pos.length / 3;
    // 점선 무늬는 이어진 줄의 위상에서 시작한다(재작업 W49: 이음매·자른 자리에서 무늬가 다시 시작하지 않게)
    let along = phase;
    for (let j = 0; j <= (closed ? n : n - 1); j++) {
      const i = at(j);
      const a = at(j - 1);
      const b = at(j + 1);
      let dx = P[b * 3] - P[a * 3];
      let dz = P[b * 3 + 2] - P[a * 3 + 2];
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      let m = 1;
      if (closed || (j > 0 && j < n - 1)) {
        const ux = P[i * 3] - P[a * 3];
        const uz = P[i * 3 + 2] - P[a * 3 + 2];
        m = Math.min(1.7, 1 / Math.max(0.3, (ux * dx + uz * dz) / (Math.hypot(ux, uz) || 1)));
      }
      if (j > 0) along += Math.hypot(P[i * 3] - P[at(j - 1) * 3], P[i * 3 + 2] - P[at(j - 1) * 3 + 2]);
      for (const side of [-1, 1]) {
        pos.push(P[i * 3], P[i * 3 + 1] + 0.35, P[i * 3 + 2]);
        // 진행 방향 오른쪽(−dz, dx) 이 +
        nrm.push(-dz * m, dx * m);
        uv.push(side, along);
        sty.push(s.color, s.w, s.sep, s.dashL * 4 + s.dashR);
        hal.push(s.sep + s.w / 2);
      }
      if (j > 0) {
        const q = base + j * 2;
        idx.push(q - 2, q - 1, q, q - 1, q + 1, q);
      }
    }
  };
  for (const l of marks.lines) addLine(l.p, lineStyle(l.k, l.k2), false, l.d ?? 0);
  // 안전지대 테두리: 실선(중앙선 옆은 황색)
  for (const z of marks.zones) {
    const P: number[] = [];
    for (let k = 0; k < z.ring.length; k += 2) P.push(z.ring[k], 0, z.ring[k + 1]);
    addLine(P, { color: z.yellow ? 1 : 0, w: 0.2, sep: 0, dashL: 0, dashR: 0 }, true);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lg.setAttribute('aNorm', new THREE.Float32BufferAttribute(nrm, 2));
  lg.setAttribute('aUV', new THREE.Float32BufferAttribute(uv, 2));
  lg.setAttribute('aSty', new THREE.Float32BufferAttribute(sty, 4));
  lg.setAttribute('aHalf', new THREE.Float32BufferAttribute(hal, 1));
  lg.setIndex(idx);
  const lineMesh = new THREE.Mesh(
    lg,
    material({
      transparent: true,
      depthWrite: false,
      offset: 5,
      doubleSide: true,
      vertex: /* glsl */ `
        attribute vec2 aNorm; attribute vec2 aUV; attribute vec4 aSty; attribute float aHalf;
        varying float vLat; varying float vAlong; varying vec4 vSty; varying float vDist;
        void main() {
          vec4 cv = viewMatrix * vec4(position, 1.0);
          float px = -cv.z / uProjK;                                  // 이 자리에서 한 픽셀(m)
          float hw = max(aHalf, px * 1.5) + px;                        // 그리는 반폭: 실제 반폭 또는 1.5픽셀, 가장자리 1픽셀 더
          vec3 p = position + vec3(aNorm.x, 0.0, aNorm.y) * aUV.x * hw;
          vLat = aUV.x * hw; vAlong = aUV.y; vSty = aSty;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        varying float vLat; varying float vAlong; varying vec4 vSty; varying float vDist;
        ${DIM}
        float stripe(float x, float c, float w, float aa) {
          return (1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, abs(x - c))) * min(1.0, w / aa);
        }
        float dash(float kind) {
          if (kind < 0.5) return 1.0;
          if (kind < 1.5) return step(fract(vAlong / 8.0), 0.375);      // 3m 칠하고 5m 띄움
          if (kind < 2.5) return step(fract(vAlong / 2.0), 0.5);         // 1m 칠하고 1m 띄움
          return step(fract(vAlong), 0.5);                               // 0.5m 칠하고 0.5m 띄움(자전거횡단도 네모)
        }
        void main() {
          float aa = max(fwidth(vLat), 1e-4);
          float dl = floor(vSty.w / 4.0);
          float dr = mod(vSty.w, 4.0);
          float w = vSty.y; float sep = vSty.z;
          float a = sep > 0.0
            ? max(stripe(vLat, -sep, w, aa) * dash(dl), stripe(vLat, sep, w, aa) * dash(dr))
            : stripe(vLat, 0.0, w, aa) * dash(dl);
          a *= far(aa, vDist);
          if (a < 0.01) discard;
          gl_FragColor = vec4(paint(vSty.x) * (0.8 + 0.25 * (1.0 - uNight)), a * 0.85);
        }`,
    }),
  );
  lineMesh.renderOrder = -2.6;
  lineMesh.frustumCulled = false;
  group.add(lineMesh);

  // ── 안전지대(빗금)와 화살표 ──
  const fp: number[] = [];
  const fk: number[] = [];
  const fi: number[] = [];
  const addPoly = (pts: number[], kind: number) => {
    const v: THREE.Vector2[] = [];
    for (let k = 0; k < pts.length; k += 2) v.push(new THREE.Vector2(pts[k], pts[k + 1]));
    const base = fp.length / 3;
    for (const q of v) fp.push(q.x, 0.36, q.y), fk.push(kind);
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(v, [])) fi.push(base + a, base + b, base + c);
  };
  for (const z of marks.zones) addPoly(Array.from(z.ring), z.yellow ? 2 : 1);
  for (const a of marks.arrows) {
    const shape = arrowShape(a.kind, a.w);
    if (!shape || arrowOnCrossing(a, bands)) continue;
    // 앞 (fx, fz), 왼쪽 (fz, −fx)
    for (const poly of shape) {
      const out: number[] = [];
      for (let k = 0; k < poly.length; k += 2) out.push(a.x + a.fx * poly[k] + a.fz * poly[k + 1], a.z + a.fz * poly[k] - a.fx * poly[k + 1]);
      addPoly(out, 0);
    }
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  fg.setAttribute('aKind', new THREE.Float32BufferAttribute(fk, 1));
  fg.setIndex(fi);
  const fillMesh = new THREE.Mesh(
    fg,
    material({
      transparent: true,
      depthWrite: false,
      offset: 5,
      doubleSide: true,
      vertex: /* glsl */ `
        attribute float aKind; varying float vKind; varying vec2 vXZ; varying float vDist;
        void main() { vKind = aKind; vXZ = position.xz; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragment: /* glsl */ `
        varying float vKind; varying vec2 vXZ; varying float vDist;
        ${DIM}
        void main() {
          float px = max(fwidth(vXZ.x), fwidth(vXZ.y));
          // 안전지대: 45° 빗금(폭 0.45m, 1.5m 마다). 화살표: 채움
          float h = vKind > 0.5 ? 1.0 - smoothstep(0.3 - px, 0.3 + px, fract((vXZ.x + vXZ.y) / 1.5)) : 1.0;
          float a = h * far(px, vDist) * 0.85;
          if (a < 0.01) discard;
          gl_FragColor = vec4(paint(vKind > 1.5 ? 1.0 : 0.0) * (0.8 + 0.25 * (1.0 - uNight)), a);
        }`,
    }),
  );
  fillMesh.renderOrder = -2.6;
  fillMesh.frustumCulled = false;
  group.add(fillMesh);
  return group;
}
