// 도로. 땅 위 찻길은 굽기가 정한 바닥(public/data/surface.json)대로 길 조각 띠와 교차로 면을 겹치지 않게 깔고, 교량은 띄운 띠와 교각으로 따로 그린다.
// 띠는 교차로 면 앞(횡단보도 바깥 변·모퉁이 호 끝)에서 끝나고, 교차로 면은 모퉁이를 둥글게 깎은 한 장이다(src/data/surface.ts).
// 큰길은 서울시 차선 자료로 읽은 실제 중앙선 자리·방향별 차로 수·차로 폭으로 띠와 차선을 그린다(차가 달리는 차로와 같은 값).
// 바닥 색·물웅덩이·밤 가로등 빛은 판 좌표로 칠해 띠와 면의 이음매가 보이지 않는다. 한 방향씩 나뉜 큰길 사이에는 분리대·중앙버스차로를 그린다.
import * as THREE from 'three';
import { curbAt, roadHalf, type Road } from '../data/board.ts';
import type { Band } from '../data/laneGround.ts';
import { carriageSections, isGroundRoad, roadJoints, tunnelDepth, tunnelReach, type Section, type Surface } from '../data/surface.ts';
import { BOARD_R } from '../geo.ts';
import { cumLen, pointAt } from '../poly.ts';
import { material, pal } from './env.ts';
import { addRibbon, merge, ribbon, ribbonGeometry, type Ribbon } from './util.ts';

/** 찻길 폭(m) */
export function roadWidth(r: Road): number {
  const [hr, hl] = roadHalf(r);
  return hr + hl;
}

const MEDIAN = 8;
const MED_BUS = 16;

const VERT = /* glsl */ `
  attribute vec2 aUV; attribute vec4 aInfo; attribute vec4 aEx0; attribute vec4 aEx1;
  varying vec2 vUV; varying vec4 vInfo; varying vec4 vEx0; varying vec4 vEx1; varying float vDist; varying vec2 vXZ;
  void main() {
    vUV = aUV; vInfo = aInfo; vEx0 = aEx0; vEx1 = aEx1; vXZ = position.xz;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

// vInfo = (등급, 띠 폭, 일방통행, 랜드마크 번호). 등급 9 = 교량 옆면
// vEx0 = (띠 가운데가 중심선에서 오른쪽으로 떨어진 거리, 진행 방향 차로, 반대 방향 차로, 차로 폭)
// vEx1 = (쓰지 않음, 표시: 8 분리대·16 중앙버스차로, 쓰지 않음, 쓰지 않음). 차선·중앙선·정지선은 노면 표시(src/render/marks.ts)가 서울시 선 그대로 긋는다
const FRAG = /* glsl */ `
  uniform vec3 uMajor, uMinor, uWalk; uniform float uDeck; uniform sampler2D uLamps;
  uniform vec3 uLmCol[6]; uniform float uLmGlow[6];
  varying vec2 vUV; varying vec4 vInfo; varying vec4 vEx0; varying vec4 vEx1; varying float vDist; varying vec2 vXZ;
  void main() {
    float cls = vInfo.x; float width = vInfo.y;
    float major = step(cls, 3.5);
    float walk = step(5.5, cls) * step(cls, 8.5);
    float side = step(8.5, cls);
    float parapet = step(9.5, cls);
    float flags = vEx1.y;
    float median = step(7.5, mod(flags, 16.0));
    float medBus = step(15.5, mod(flags, 32.0));
    vec3 alb = mix(mix(uMinor, uMajor, max(major, step(0.5, vEx0.y + vEx0.z) * step(cls, 4.5))), uWalk, walk);
    if (median > 0.5 && medBus < 0.5 && width >= 0.8) {
      // 솟은 분리대: 반대 방향 길과의 사이를 반씩 그린다. 띠 오른쪽(+1)이 이 길 쪽이다. 연석과 화단
      float u = (vUV.x + 1.0) * 0.5;
      float gw = width;
      float curb = smoothstep(0.0, 0.05, u * gw - 0.05);
      alb = mix(alb, vec3(0.72, 0.72, 0.7), curb);
      alb = mix(alb, vec3(0.42, 0.55, 0.36), curb * step(1.3, gw) * step(0.35, u * gw) * step(0.35, (1.0 - u) * gw));
    }
    alb = mix(alb, vec3(0.78, 0.77, 0.74), parapet);                                            // 다리·둑길 난간(콘크리트)
    vec3 col = lit(alb, vec3(0.0, 1.0, 0.0));
    col = mix(col, col * 0.62, side * (1.0 - parapet));

    // 비: 길이 젖어 어두워지고 물웅덩이에 하늘빛이 비친다
    float wet = uRain * (1.0 - side);
    vec2 q2 = vXZ / vec2(4.0, 7.0) + 7.0;                                                       // 판 좌표: 띠와 면의 이음매가 없다
    vec2 qi = floor(q2), qf = fract(q2);
    qf = qf * qf * (3.0 - 2.0 * qf);
    float nz = mix(mix(hash21(qi), hash21(qi + vec2(1.0, 0.0)), qf.x), mix(hash21(qi + vec2(0.0, 1.0)), hash21(qi + vec2(1.0, 1.0)), qf.x), qf.y);
    float puddle = smoothstep(0.5, 0.8, nz);
    col = mix(col, col * 0.6, wet);
    col += uFogCol * 0.18 * wet * puddle;

    // 밤: 가로등 빛(큰길은 양쪽 가장자리, 골목은 가운데에 선 가로등. 판 좌표 빛 지도 lampMap). 젖은 길에서는 더 번진다.
    // 빛은 바닥 색에 곱해 더한다: 어두운 아스팔트는 가로등 밑에서도 밝은 보도 블록보다 어둡게 남는다(재작업 W14)
    float lamp = texture2D(uLamps, (vXZ + ${BOARD_R.toFixed(1)}) / ${(2 * BOARD_R).toFixed(1)}).r * (1.0 - median) * (1.0 - side) * step(cls, 6.5);
    col += (alb * vec3(1.0, 0.78, 0.5) * 1.6 + vec3(1.0, 0.70, 0.36) * 0.06) * lamp * uNight * (1.0 + 0.5 * wet * (0.3 + puddle));

    // 랜드마크 다리: 고유 색을 입히고 밤에는 난간에 불을 켠다
    int lm = int(vInfo.w + 0.5);
    float isLm = step(0.5, vInfo.w);
    float glow = uLmGlow[lm];
    col = mix(col, col * uLmCol[lm] * 1.15, isLm * (0.55 + 0.3 * glow) * (1.0 - side * 0.5));
    float rail = smoothstep(0.86, 0.97, abs(vUV.x)) * isLm * uDeck;
    float beads = 0.55 + 0.45 * step(0.5, fract(vUV.y / 9.0));
    col += uLmCol[lm] * rail * beads * (0.25 + uNight * 0.9 + glow * 0.8);
    col += uLmCol[lm] * isLm * glow * 0.16;
    col = mix(col, mix(vec3(0.37, 0.42, 0.49), col * 0.3 + vec3(0.012, 0.02, 0.035), uNight), focusIn(vXZ) * 0.85 * (1.0 - uDeck));
    gl_FragColor = vec4(fogged(col, vDist), 1.0);
  }`;

/** 중심선 p 를 오른쪽으로 o 만큼 옮긴 선 */
function shift(p: Float32Array, o: number): Float32Array {
  if (Math.abs(o) < 1e-3) return p;
  const n = p.length / 3;
  const out = new Float32Array(p.length);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1) * 3;
    const b = Math.min(n - 1, i + 1) * 3;
    const dx = p[b] - p[a];
    const dz = p[b + 2] - p[a + 2];
    const L = Math.hypot(dx, dz) || 1;
    out[i * 3] = p[i * 3] - (dz / L) * o;
    out[i * 3 + 1] = p[i * 3 + 1];
    out[i * 3 + 2] = p[i * 3 + 2] + (dx / L) * o;
  }
  return out;
}

/** 띠 단면들(carriageSections)로 찻길 띠를 덧붙인다. 띠 가운데(ex0.x)와 폭(info.y)을 단면마다 바꿔 차선 자리는 그대로 둔다 */
function addSections(o: Ribbon, secs: ReturnType<typeof carriageSections>, info: [number, number, number, number], ex: number[]) {
  const base = o.pos.length / 3;
  secs.forEach((c, i) => {
    o.pos.push(c.lx, c.y, c.lz, c.rx, c.y, c.rz);
    o.uv.push(-1, c.s, 1, c.s);
    const inf = [info[0], c.er + c.el, info[2], info[3]];
    o.info.push(...inf, ...inf);
    const e = [(c.er - c.el) / 2, ...ex.slice(1)];
    o.ex.push(...e, ...e);
    if (i > 0) {
      const q = base + i * 2;
      o.idx.push(q - 2, q - 1, q, q - 1, q + 1, q);
    }
  });
}

/** 교차로 면(구멍 = 교통섬)을 삼각형으로 나눠 덧붙인다. 차선은 긋지 않는다 */
function addFace(o: Ribbon, f: Surface['faces'][number]) {
  const toV = (r: Float32Array) => {
    const v: THREE.Vector2[] = [];
    for (let k = 0; k < r.length; k += 2) v.push(new THREE.Vector2(r[k], r[k + 1]));
    return v;
  };
  const outer = toV(f.outer);
  const holes = f.holes.map(toV);
  const base = o.pos.length / 3;
  for (const p of [outer, ...holes].flat()) {
    o.pos.push(p.x, 0, p.y);
    o.uv.push(0, 0);
    o.info.push(f.cls, 10, 0, 0);
    o.ex.push(0, 0, 0, 3.3, 0, 0, 0, 0);
  }
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(outer, holes)) o.idx.push(base + a, base + b, base + c);
}

/** 길 조각 중심선 p 의 s0~s1 부분 */
function subLine(p: Float32Array, s0: number, s1: number): Float32Array {
  const L = cumLen(p);
  const n = L.length;
  s1 = Math.min(s1, L[n - 1]);
  if (s0 <= 0 && s1 >= L[n - 1]) return p;
  const tmp = [0, 0, 0];
  const out: number[] = [];
  pointAt(p, L, s0, tmp);
  out.push(...tmp);
  for (let i = 1; i < n - 1; i++) if (L[i] > s0 && L[i] < s1) out.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  pointAt(p, L, s1, tmp);
  out.push(...tmp);
  return Float32Array.from(out);
}

/**
 * 밤 가로등 빛 지도(판 좌표, 2m 한 칸): 큰길은 양쪽 가장자리를 따라 34m 마다, 골목은 가운데를 따라 26m 마다 가로등을 두고
 * 그 둘레를 가우스 빛으로 칠한다. 빛은 더하지 않고 가장 밝은 가로등 하나만 친다(W1 전 띠마다 가까운 가로등 하나만 비추던 세기와 같다.
 * 더하면 여러 길이 모이는 교차로 가운데가 하얗게 포화된다). 띠와 교차로 면이 같은 지도를 읽어 이음매가 없다
 */
export function lampMap(roads: Road[]): THREE.DataTexture {
  const N = 2048;
  const px = (2 * BOARD_R) / N;
  const acc = new Float32Array(N * N);
  const splat = (x: number, z: number, amp: number, sig2: number) => {
    const r = Math.ceil(Math.sqrt(sig2 * 9) / px);
    const ci = Math.floor((x + BOARD_R) / px);
    const cj = Math.floor((z + BOARD_R) / px);
    for (let j = Math.max(0, cj - r); j <= Math.min(N - 1, cj + r); j++)
      for (let i = Math.max(0, ci - r); i <= Math.min(N - 1, ci + r); i++) {
        const dx = (i + 0.5) * px - BOARD_R - x;
        const dz = (j + 0.5) * px - BOARD_R - z;
        acc[j * N + i] = Math.max(acc[j * N + i], amp * Math.exp(-(dx * dx + dz * dz) / sig2));
      }
  };
  const tmp = [0, 0, 0];
  for (const r of roads) {
    if (r.cls > 6) continue;
    let top = 0;
    for (let i = 1; i < r.p.length; i += 3) top = Math.max(top, r.p[i]);
    if (top >= 0.3) continue;
    const L = cumLen(r.p);
    const len = L[L.length - 1];
    const major = r.cls <= 3;
    const step = major ? 34 : 26;
    for (let s = major ? step / 2 : step * 0.37; s < len; s += step) {
      const seg = pointAt(r.p, L, s, tmp);
      const dx = r.p[seg * 3 + 3] - r.p[seg * 3];
      const dz = r.p[seg * 3 + 5] - r.p[seg * 3 + 2];
      const d = Math.hypot(dx, dz) || 1;
      if (major)
        for (const side of [1, -1]) {
          const e = curbAt(r, s, side) * side;
          splat(tmp[0] - (dz / d) * e, tmp[2] + (dx / d) * e, 0.4, 70);
        }
      else splat(tmp[0], tmp[2], 0.32 * 0.55, 42);
    }
  }
  const data = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) data[i] = Math.min(255, Math.round(acc[i] * 255));
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** 터널 입구 터파기: 바닥이 이 깊이(m)보다 얕은 동안 위가 열려 있고, 이 깊이에서 입구 벽(지붕 시작)을 세운다 */
const PORTAL = 5.2;
/** 터널 안 높이(바닥에서 입구 벽 아래 끝까지) */
const CLEAR = 4.5;
/** 옹벽·난간이 땅(또는 데크) 위로 올라온 높이와 옹벽 두께 */
const PARAPET = 0.9;
const WALL_T = 0.4;

/** 면(사각형)을 모으는 도구: 꼭짓점과 색 번호 */
class Quads {
  pos: number[] = [];
  tone: number[] = [];
  quad(a: number[], b: number[], c: number[], d: number[], t: number) {
    for (const v of [a, b, c, a, c, d]) this.pos.push(v[0], v[1], v[2]), this.tone.push(t);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aTone', new THREE.Float32BufferAttribute(this.tone, 1));
    return g;
  }
}

/**
 * 찻길 터널 조각의 입구 경사(재작업 W14): 띠 구간 s0~s1 가운데 바닥 깊이(차 그래프와 같은 tunnelDepth)가 PORTAL 보다 얕은 곳만
 * 내려가는 바닥 띠(floor), 양쪽 옹벽·난간(walls), 땅을 뚫을 자리(hole, 깊이만 쓴다)로 그리고, PORTAL 깊이에서 입구 벽을 세운다.
 * 그보다 깊은 터널 속은 그리지 않는다(땅이 덮는다)
 */
function addTrench(
  r: Road,
  s0: number,
  s1: number,
  reach: [number, number],
  covered: (x: number, z: number) => boolean,
  floor: Ribbon,
  walls: Quads,
  hole: Quads,
  info: [number, number, number, number],
  ex: number[],
) {
  const len = cumLen(r.p)[r.p.length / 3 - 1];
  s1 = Math.min(s1, len);
  if (s1 - s0 < 0.5) return;
  const depth = (s: number) => tunnelDepth(reach, s, len);
  // 2m 마다, 그리고 PORTAL 깊이를 지나는 자리
  const S: number[] = [];
  const n = Math.max(1, Math.ceil((s1 - s0) / 2));
  for (let k = 0; k <= n; k++) S.push(s0 + ((s1 - s0) * k) / n);
  const at: number[] = [];
  for (let k = 0; k < S.length; k++) {
    at.push(S[k]);
    if (k + 1 < S.length && (depth(S[k]) - PORTAL) * (depth(S[k + 1]) - PORTAL) < 0) {
      let a = S[k];
      let b = S[k + 1];
      for (let it = 0; it < 30; it++) {
        const m = (a + b) / 2;
        if ((depth(a) - PORTAL) * (depth(m) - PORTAL) <= 0) b = m;
        else a = m;
      }
      at.push((a + b) / 2);
    }
  }
  const sec = (s: number): Section & { d: number } => {
    const c = carriageSections(r, Math.max(0, s - 0.01), Math.min(len, s + 0.01))[0] ?? carriageSections(r, s - 0.02, s)[0];
    return { ...c, s, d: depth(s) };
  };
  // 위를 다른 찻길이 지나는 곳(짧은 지하차도가 큰길 밑을 지나는 자리)은 지붕 밑이라 열지 않는다. 열린 곳과 덮인 곳 사이에 입구 벽을 세운다
  const secs0 = at.map(sec);
  const secs: (Section & { d: number; cov: boolean })[] = [];
  /** 단면 가운데 앞뒤 0.6m 가 모두 덮였는가(교차로 면 테두리에 걸친 띠 끝 단면은 덮이지 않은 것으로) */
  const coveredAt = (c: Section) => {
    const w = Math.hypot(c.rx - c.lx, c.rz - c.lz) || 1;
    const fx = ((c.rz - c.lz) / w) * 0.6;
    const fz = (-(c.rx - c.lx) / w) * 0.6;
    return covered(c.x + fx, c.z + fz) && covered(c.x - fx, c.z - fz);
  };
  secs0.forEach((c, k) => {
    const cov = coveredAt(c);
    const prev = secs[secs.length - 1];
    if (prev && prev.cov !== cov) {
      // 덮인 곳의 끝을 0.25m 안으로 찾아 그 자리에 단면을 넣는다
      let a = secs0[k - 1].s;
      let b = c.s;
      for (let it = 0; it < 12; it++) {
        const m = (a + b) / 2;
        const q = sec(m);
        if (coveredAt(q) === prev.cov) a = m;
        else b = m;
      }
      const e = sec(prev.cov ? b : a);
      secs.push({ ...e, cov: prev.cov }, { ...e, cov });
    }
    secs.push({ ...c, cov });
  });
  const open = (c: { d: number; cov: boolean }) => c.d <= PORTAL + 1e-3 && !c.cov;
  for (let k = 0; k + 1 < secs.length; k++) {
    const [a, b] = [secs[k], secs[k + 1]];
    if (!open(a) || !open(b)) continue;
    // 바닥 띠
    const base = floor.pos.length / 3;
    for (const c of [a, b]) {
      floor.pos.push(c.lx, -c.d + 0.02, c.lz, c.rx, -c.d + 0.02, c.rz);
      floor.uv.push(-1, c.s, 1, c.s);
      const inf = [info[0], c.er + c.el, info[2], info[3]];
      floor.info.push(...inf, ...inf);
      const e = [(c.er - c.el) / 2, ...ex.slice(1)];
      floor.ex.push(...e, ...e);
    }
    floor.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    // 옹벽(안쪽 면 → 윗면 → 바깥 면)과 뚫을 자리
    const out = (c: Section, side: number, extra: number): [number, number] => {
      const [ex2, ez2] = side > 0 ? [c.rx - c.x, c.rz - c.z] : [c.lx - c.x, c.lz - c.z];
      const w = Math.hypot(ex2, ez2) || 1;
      return [c.x + ex2 * (1 + extra / w), c.z + ez2 * (1 + extra / w)];
    };
    for (const side of [1, -1]) {
      const [ax, az] = out(a, side, 0);
      const [bx, bz] = out(b, side, 0);
      const [ax2, az2] = out(a, side, WALL_T);
      const [bx2, bz2] = out(b, side, WALL_T);
      walls.quad([ax, -a.d, az], [bx, -b.d, bz], [bx, PARAPET, bz], [ax, PARAPET, az], 0);
      walls.quad([ax, PARAPET, az], [bx, PARAPET, bz], [bx2, PARAPET, bz2], [ax2, PARAPET, az2], 1);
      walls.quad([ax2, 0, az2], [bx2, 0, bz2], [bx2, PARAPET, bz2], [ax2, PARAPET, az2], 0);
    }
    const [lax, laz] = out(a, -1, WALL_T);
    const [lbx, lbz] = out(b, -1, WALL_T);
    const [rax, raz] = out(a, 1, WALL_T);
    const [rbx, rbz] = out(b, 1, WALL_T);
    hole.quad([lax, 0.06, laz], [rax, 0.06, raz], [rbx, 0.06, rbz], [lbx, 0.06, lbz], 0);
  }
  // 입구 벽: PORTAL 깊이 자리마다, 길을 가로질러 지붕 두께만큼. 그 아래는 어두운 터널 속
  for (let k = 0; k < secs.length; k++) {
    const c = secs[k];
    const next = secs[k + 1];
    const prev = secs[k - 1];
    // 열린 곳에서 덮인 곳(깊이 PORTAL 을 넘거나 위에 찻길)으로 넘어가는 자리
    let nb = 0; // 터널 속 쪽
    if (Math.abs(c.d - PORTAL) < 1e-2 && open(c)) nb = next && next.d > c.d ? 1 : -1;
    else if (next && open(c) && !open(next) && next.cov && Math.abs(next.s - c.s) < 1e-3) nb = 1;
    else if (prev && open(c) && !open(prev) && prev.cov && Math.abs(prev.s - c.s) < 1e-3) nb = -1;
    if (!nb) continue;
    const fx = (c.rz - c.lz) / (Math.hypot(c.rx - c.lx, c.rz - c.lz) || 1);
    const fz = -(c.rx - c.lx) / (Math.hypot(c.rx - c.lx, c.rz - c.lz) || 1);
    // (fx, fz): 진행 방향(오른쪽 가장자리 쪽 벡터를 왼쪽으로 돌림). 터널 속 쪽으로 nb
    const w = Math.hypot(c.rx - c.lx, c.rz - c.lz) || 1;
    const lx = (c.lx - c.rx) / w;
    const lz = (c.lz - c.rz) / w;
    const L = c.el + WALL_T;
    const R = c.er + WALL_T;
    const v = (lat: number, y: number, fwd: number) => [c.x + lx * lat + fx * nb * fwd, y, c.z + lz * lat + fz * nb * fwd];
    const y0 = Math.min(0, -c.d + CLEAR);
    const yt = PARAPET + 0.3;
    for (const f of [0, 0.8]) walls.quad(v(-R, y0, f), v(L, y0, f), v(L, yt, f), v(-R, yt, f), 2);
    walls.quad(v(-R, yt, 0), v(L, yt, 0), v(L, yt, 0.8), v(-R, yt, 0.8), 1);
    walls.quad(v(-R, y0, 0), v(L, y0, 0), v(L, y0, 0.8), v(-R, y0, 0.8), 2);
    walls.quad(v(-R + WALL_T, -c.d, 0.5), v(L - WALL_T, -c.d, 0.5), v(L - WALL_T, y0, 0.5), v(-R + WALL_T, y0, 0.5), 3);
  }
}

/** 터널 조각 ri 둘레에서 (x, z)를 터널이 아닌 땅 위 찻길 띠·교차로 면이 덮는가 */
function coveredNear(roads: Road[], ri: number, surface: Surface, joints: Float32Array, reach: ([number, number] | null)[]): (x: number, z: number) => boolean {
  const P = roads[ri].p;
  let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k < P.length; k += 3) (x0 = Math.min(x0, P[k])), (x1 = Math.max(x1, P[k])), (z0 = Math.min(z0, P[k + 2])), (z1 = Math.max(z1, P[k + 2]));
  [x0, z0, x1, z1] = [x0 - 40, z0 - 40, x1 + 40, z1 + 40];
  const near = (r: ArrayLike<number>, step: number, off: number) => {
    for (let k = off; k < r.length; k += step) if (r[k] > x0 && r[k] < x1 && r[k + (step === 3 ? 2 : 1)] > z0 && r[k + (step === 3 ? 2 : 1)] < z1) return true;
    return false;
  };
  const polys: number[][] = [];
  roads.forEach((r, i) => {
    if (reach[i] || !isGroundRoad(r) || !near(r.p, 3, 0)) return;
    const q = carriageSections(r, surface.cut[i * 2], surface.cut[i * 2 + 1], joints.subarray(i * 4, i * 4 + 4));
    // 분리대를 그리는 한 방향 큰길은 왼쪽으로 분리대 몫(반대 방향 길까지의 절반)도 덮는다
    const med = r.oneway && r.gap > 0.15 && r.gap <= 10 ? r.gap / 2 + 0.3 : 0;
    const L = (c: Section): [number, number] => [c.lx + ((c.lx - c.x) / (c.el || 1)) * med, c.lz + ((c.lz - c.z) / (c.el || 1)) * med];
    for (let k = 0; k + 1 < q.length; k++) polys.push([...L(q[k]), q[k].rx, q[k].rz, q[k + 1].rx, q[k + 1].rz, ...L(q[k + 1])]);
  });
  const faces = surface.faces.filter((f) => near(f.outer, 2, 0));
  const inside = (r: ArrayLike<number>, x: number, z: number) => {
    let c = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c;
    return c;
  };
  return (x, z) => polys.some((q) => inside(q, x, z)) || faces.some((f) => inside(f.outer, x, z) && !f.holes.some((h) => inside(h, x, z)));
}

/** surface: 굽기가 정한 띠 구간과 교차로 면(public/data/surface.json) */
export function makeRoads(roads: Road[], surface: Surface, lmColors: string[], bands: Band[] = []) {
  const lm = { uLmCol: { value: lmColors.map((c) => new THREE.Color(c)) }, uLmGlow: { value: lmColors.map(() => 0) } };
  const uniforms = { uMajor: { value: pal.tarmac }, uMinor: { value: pal.tarmacMinor }, uWalk: { value: pal.paving }, uLamps: { value: lampMap(roads) }, ...lm };
  const joints = roadJoints(roads);
  const reach = tunnelReach(roads);

  const flat = ribbon();
  const deck = ribbon();
  const ramp = ribbon();
  const trench = new Quads();
  const hole = new Quads();
  const piers: THREE.BufferGeometry[] = [];
  const order = roads.map((_, i) => i).sort((a, b) => roads[b].cls - roads[a].cls);
  const tmp = [0, 0, 0];
  for (const ri of order) {
    const r = roads[ri];
    const [hr, hl] = roadHalf(r);
    const w = hr + hl;
    const c0 = (hr - hl) / 2;
    const info: [number, number, number, number] = [r.cls, w, r.oneway ? 1 : 0, r.lm];
    const L = cumLen(r.p);
    const len = L[L.length - 1];
    const lanesShown = r.cls <= 3 || r.measured;
    const ex = [c0, lanesShown ? r.lf : 0, lanesShown && !r.oneway ? r.lb : 0, r.lw, 0, 0, 0, len];
    let top = 0;
    for (let i = 1; i < r.p.length; i += 3) top = Math.max(top, r.p[i]);
    const last = r.p.length - 3;
    const atRim = Math.hypot(r.p[0], r.p[2]) > BOARD_R - 12 || Math.hypot(r.p[last], r.p[last + 2]) > BOARD_R - 12;
    if (top < 0.3) {
      if (isGroundRoad(r)) {
        // 찻길: 굽기가 정한 구간만(교차로 면 앞에서 끝난다)
        const s0 = surface.cut[ri * 2];
        const s1 = surface.cut[ri * 2 + 1];
        const tun = reach[ri];
        if (tun) {
          // 찻길 터널: 입구 경사만 땅을 뚫어 그린다
          addTrench(r, s0, s1, tun, coveredNear(roads, ri, surface, joints, reach), ramp, trench, hole, info, ex);
          continue;
        }
        addSections(flat, carriageSections(r, s0, s1, joints.subarray(ri * 4, ri * 4 + 4)), info, ex);
        // 분리대: 한 방향 큰길 왼쪽, 반대 방향 길까지의 절반. 10m 넘게 떨어진 길 사이는 분리대가 아니라 따로 난 길이다
        if (r.oneway && r.gap > 0.15 && r.gap <= 10 && r.cls <= 3 && s1 - s0 > 0.5) {
          const gw = r.gap / 2;
          addRibbon(flat, shift(subLine(r.p, s0, s1), -hl - gw / 2), gw, [r.cls, gw, 1, 0], 0, 0, [0, 0, 0, r.lw, 0, MEDIAN | (r.medBus ? MED_BUS : 0), 0, len]);
        }
      } else addRibbon(flat, shift(r.p, c0), w, info, 0, atRim ? 0 : w * 0.45, ex); // 보행로·광장 길
      continue;
    }
    const dp = shift(r.p, c0);
    addRibbon(deck, dp, w, info, 0.25, 0, ex);
    // 옆면: 양 가장자리를 따라 아래로 1.8m
    const n = r.p.length / 3;
    for (const sgn of [-1, 1]) {
      const base = deck.pos.length / 3;
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1) * 3;
        const b = Math.min(n - 1, i + 1) * 3;
        const dx = dp[b] - dp[a];
        const dz = dp[b + 2] - dp[a + 2];
        const ln = Math.hypot(dx, dz) || 1;
        const x = dp[i * 3] + ((sgn * dz) / ln) * w * 0.5;
        const z = dp[i * 3 + 2] - ((sgn * dx) / ln) * w * 0.5;
        const y = dp[i * 3 + 1] + 0.25;
        // 교량은 상판 두께만, 다리 앞뒤로 올린 둑길(교량 아님)은 땅까지 옹벽
        deck.pos.push(x, y, z, x, r.bridge ? Math.max(0, y - 1.8) : 0, z);
        deck.uv.push(0, 0, 0, 0);
        deck.info.push(9, w, 0, r.lm, 9, w, 0, r.lm);
        deck.ex.push(0, 0, 0, 3.3, 0, 0, 0, 0, 0, 0, 0, 3.3, 0, 0, 0, 0);
        if (i > 0) {
          const q = base + i * 2;
          deck.idx.push(q - 2, q - 1, q, q - 1, q + 1, q);
        }
      }
      // 난간: 상판 가장자리에서 0.8m(땅 높이에 붙은 끝은 낮게). 높이가 보이게 밝은 콘크리트로
      if (r.cls <= 5 && r.lm === 0) {
        const base2 = deck.pos.length / 3;
        for (let i = 0; i < n; i++) {
          const a = Math.max(0, i - 1) * 3;
          const b = Math.min(n - 1, i + 1) * 3;
          const dx = dp[b] - dp[a];
          const dz = dp[b + 2] - dp[a + 2];
          const ln = Math.hypot(dx, dz) || 1;
          const x = dp[i * 3] + ((sgn * dz) / ln) * w * 0.5;
          const z = dp[i * 3 + 2] - ((sgn * dx) / ln) * w * 0.5;
          const y = dp[i * 3 + 1] + 0.25;
          deck.pos.push(x, y, z, x, y + 0.8 * Math.min(1, dp[i * 3 + 1] / 2), z);
          deck.uv.push(0, 0, 0, 0);
          deck.info.push(10, w, 0, 0, 10, w, 0, 0);
          deck.ex.push(0, 0, 0, 3.3, 0, 0, 0, 0, 0, 0, 0, 3.3, 0, 0, 0, 0);
          if (i > 0) {
            const q = base2 + i * 2;
            deck.idx.push(q - 2, q - 1, q, q - 1, q + 1, q);
          }
        }
      }
    }
    // 교각: 큰 다리에만 55m마다
    if (r.cls <= 3) {
      const cum = cumLen(r.p);
      for (let s = 20; s < cum[cum.length - 1]; s += 55) {
        const seg = pointAt(r.p, cum, s, tmp);
        if (tmp[1] < 4) continue;
        const yaw = Math.atan2(r.p[seg * 3 + 5] - r.p[seg * 3 + 2], r.p[seg * 3 + 3] - r.p[seg * 3]);
        const g = new THREE.BoxGeometry(2.4, tmp[1], w * 0.5);
        g.rotateY(-yaw);
        g.translate(tmp[0], tmp[1] / 2 - 0.2, tmp[2]);
        piers.push(g);
      }
    }
  }
  for (const f of surface.faces) addFace(flat, f);
  // 그리기 전용 찻길 면: 횡단보도가 OSM 길 밖에 걸친 자리(차는 다니지 않는다)
  for (const f of surface.draw) addFace(flat, f);
  // 길 정본 차로 띠(src/data/laneGround.ts, 재작업 W44): 찻길 띠·교차로 면이 덮지 못한 차로 자리도 찻길로 칠한다. 차선은 긋지 않는다
  for (const { cls, sec: b } of bands) {
    const base = flat.pos.length / 3;
    const n = b.length / 4;
    for (let k = 0; k < n; k++) {
      flat.pos.push(b[k * 4], 0, b[k * 4 + 1], b[k * 4 + 2], 0, b[k * 4 + 3]);
      flat.uv.push(0, 0, 0, 0);
      flat.info.push(cls, 10, 0, 0, cls, 10, 0, 0);
      flat.ex.push(0, 0, 0, 3.3, 0, 0, 0, 0, 0, 0, 0, 3.3, 0, 0, 0, 0);
      if (k > 0) flat.idx.push(base + k * 2 - 2, base + k * 2 - 1, base + k * 2, base + k * 2 - 1, base + k * 2 + 1, base + k * 2);
    }
  }

  const ground = new THREE.Mesh(
    ribbonGeometry(flat),
    material({ vertex: VERT, fragment: FRAG, uniforms: { ...uniforms, uDeck: { value: 0 } }, depthWrite: false, offset: 2, doubleSide: true }),
  );
  ground.renderOrder = -5;
  ground.frustumCulled = false;
  const decks = new THREE.Mesh(
    ribbonGeometry(deck),
    material({ vertex: VERT, fragment: FRAG, uniforms: { ...uniforms, uDeck: { value: 1 } }, doubleSide: true }),
  );
  decks.frustumCulled = false;
  const group = new THREE.Group();
  group.add(ground, decks);
  if (trench.pos.length) {
    // 터널 입구: 옹벽·바닥을 땅보다 먼저 그리고, 그 위 땅높이에 깊이만 쓰는 판을 놓아 땅·도로가 그 자리를 덮지 못하게 한다(rails.ts 터파기와 같은 방법)
    const floor = new THREE.Mesh(ribbonGeometry(ramp), material({ vertex: VERT, fragment: FRAG, uniforms: { ...uniforms, uDeck: { value: 0 } }, doubleSide: true }));
    const wall = new THREE.Mesh(
      trench.geometry(),
      material({
        doubleSide: true,
        vertex: /* glsl */ `attribute float aTone; varying vec3 vW; varying float vTone; varying float vDist;
          void main() { vW = position; vTone = aTone; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragment: /* glsl */ `varying vec3 vW; varying float vTone; varying float vDist;
          void main() {
            vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
            if (n.y < 0.0 && abs(n.y) > 0.5) n = -n;
            vec3 alb = vTone < 0.5 ? vec3(0.70, 0.69, 0.66) : vTone < 1.5 ? vec3(0.84, 0.83, 0.80) : vTone < 2.5 ? vec3(0.64, 0.63, 0.60) : vec3(0.02, 0.022, 0.026);
            alb *= 1.0 - 0.08 * step(0.5, fract(vW.y / 1.2)) * step(vTone, 0.5);   // 옹벽 거푸집 줄
            vec3 col = vTone > 2.5 ? alb : lit(alb, abs(n.y) > 0.5 ? vec3(0.0, 1.0, 0.0) : n);
            gl_FragColor = vec4(fogged(col, vDist), 1.0);
          }`,
      }),
    );
    const cutout = new THREE.Mesh(hole.geometry(), new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
    floor.renderOrder = -12;
    wall.renderOrder = -12;
    cutout.renderOrder = -11;
    for (const m of [floor, wall, cutout]) m.frustumCulled = false;
    group.add(floor, wall, cutout);
  }
  if (piers.length) {
    const pier = new THREE.Mesh(
      merge(piers),
      material({
        uniforms: { uMajor: { value: pal.roadMajor } },
        vertex: /* glsl */ `varying vec3 vN; varying float vDist;
          void main() { vN = normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragment: /* glsl */ `uniform vec3 uMajor; varying vec3 vN; varying float vDist;
          void main() { gl_FragColor = vec4(fogged(lit(uMajor * 0.82, normalize(vN)), vDist), 1.0); }`,
      }),
    );
    pier.frustumCulled = false;
    group.add(pier);
  }
  return { group, glow: lm.uLmGlow.value as number[] };
}
