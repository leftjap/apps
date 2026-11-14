// 도로. 땅 위의 길은 깊이를 쓰지 않는 띠 하나로 겹쳐 그리고(작은 길 먼저), 교량은 띄운 띠와 교각으로 따로 그린다.
// 큰길은 서울시 차선 자료로 읽은 실제 중앙선 자리·방향별 차로 수·차로 폭으로 띠와 차선을 그린다(차가 달리는 차로와 같은 값).
// 교차로 안(차의 교차로 상자, 신호 정지선 앞)에는 차선을 긋지 않고, 길 모퉁이는 둥글게 깎고, 한 방향씩 나뉜 큰길 사이에는 분리대·중앙버스차로를 그린다.
import * as THREE from 'three';
import { roadHalf, type Road } from '../data/board.ts';
import { BOARD_R } from '../geo.ts';
import { cumLen, pointAt } from '../poly.ts';
import { material, pal } from './env.ts';
import { addRibbon, merge, ribbon, ribbonGeometry } from './util.ts';

/** 찻길 폭(m) */
export function roadWidth(r: Road): number {
  const [hr, hl] = roadHalf(r);
  return hr + hl;
}

const NO_MARKS = 4;
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
// vEx1 = (중앙선 종류, 표시, 차선을 긋기 시작하는 거리, 끝나는 거리)
const FRAG = /* glsl */ `
  uniform vec3 uMajor, uMinor, uWalk; uniform float uDeck;
  uniform vec3 uLmCol[6]; uniform float uLmGlow[6];
  varying vec2 vUV; varying vec4 vInfo; varying vec4 vEx0; varying vec4 vEx1; varying float vDist; varying vec2 vXZ;
  /** 중심이 c, 굵기 w 인 선(한 픽셀보다 가늘면 옅게) */
  float stripe(float x, float c, float w) {
    float aa = max(fwidth(x), 1e-4);
    return (1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, abs(x - c))) * min(1.0, w / aa);
  }
  void main() {
    float cls = vInfo.x; float width = vInfo.y;
    float major = step(cls, 3.5);
    float walk = step(5.5, cls) * step(cls, 8.5);
    float side = step(8.5, cls);
    float flags = vEx1.y;
    float median = step(7.5, mod(flags, 16.0));
    float medBus = step(15.5, mod(flags, 32.0));
    vec3 alb = mix(mix(uMinor, uMajor, max(major, step(0.5, vEx0.y + vEx0.z) * step(cls, 4.5))), uWalk, walk);
    alb *= 1.0 - 0.10 * major * (1.0 - median) * smoothstep(0.84, 1.0, abs(vUV.x));          // 가장자리 턱
    float lat = vEx0.x + vUV.x * width * 0.5;                                                  // 중심선에서 오른쪽으로(m)
    float along = vUV.y;
    float marks = step(vEx1.z, along) * step(along, vEx1.w) * (1.0 - step(3.5, mod(flags, 8.0)));
    float dash = step(fract(along / 8.0), 0.375);                                              // 3m 긋고 5m 띈다
    vec3 yellow = vec3(0.95, 0.76, 0.26);
    vec3 white = vec3(0.95, 0.95, 0.93);
    vec3 blue = vec3(0.24, 0.45, 0.95);
    float dim = 1.0 - 0.5 * uNight;
    float lw = max(vEx0.w, 2.0);
    if (median > 0.5) {
      // 분리대: 반대 방향 길과의 사이를 반씩 그린다. 띠 오른쪽(+1)이 이 길 쪽이다
      float u = (vUV.x + 1.0) * 0.5;
      float gw = width;
      if (medBus > 0.5) {
        // 중앙버스전용차로: 이 길 쪽 가장자리에 청색 실선
        alb = mix(alb, blue, stripe((u - 1.0) * gw, -0.2, 0.2) * marks * dim);
      } else if (gw < 0.8) {
        alb = mix(alb, yellow, stripe((u - 1.0) * gw, -0.15, 0.18) * marks * dim);           // 칠한 분리(황색 복선의 한 줄)
      } else {
        // 솟은 분리대: 연석과 화단
        float curb = smoothstep(0.0, 0.05, u * gw - 0.05) * marks;
        alb = mix(alb, vec3(0.72, 0.72, 0.7), curb);
        alb = mix(alb, vec3(0.42, 0.55, 0.36), curb * step(1.3, gw) * step(0.35, u * gw) * step(0.35, (1.0 - u) * gw));
      }
    } else if (side < 0.5 && walk < 0.5) {
      float lf = vEx0.y; float lb = vEx0.z;
      float ct = vEx1.x;
      float oneway = vInfo.z;
      vec3 paint = vec3(0.0); float a = 0.0;
      if (oneway < 0.5 && ct > 0.5) {
        // 중앙선: 1 실선, 2 점선, 3 복선, 4 실선·점선
        float single = stripe(lat, 0.0, 0.22) * (ct < 1.5 ? 1.0 : ct < 2.5 ? dash : 0.0);
        float dbl = (stripe(lat, -0.2, 0.2) + stripe(lat, 0.2, 0.2) * (ct > 3.5 ? dash : 1.0)) * step(2.5, ct);
        float c = max(single, dbl);
        paint = mix(paint, yellow, c); a = max(a, c);
      }
      // 차선: 양방향 길은 중앙선에서, 한 방향 길은 왼쪽 가장자리에서 차로 폭마다
      float base = oneway > 0.5 ? -lf * lw * 0.5 : 0.0;
      float q = (lat - base) / lw;
      float k = floor(q + 0.5);
      float inRange = oneway > 0.5 ? step(0.5, k) * step(k, lf - 0.5) : (step(0.5, k) * step(k, lf - 0.5) + step(k, -0.5) * step(-lb + 0.5, k));
      float ln = stripe(lat, base + k * lw, 0.2) * inRange * dash;
      float busLine = step(0.5, mod(flags, 2.0)) * step(lf - 1.5, k) * step(k, lf - 0.5) + step(1.5, mod(flags, 4.0)) * step(-lb + 0.5, k) * step(k, -lb + 1.5);
      paint = mix(paint, mix(white, blue, busLine), ln); a = max(a, ln);
      float px = fwidth(lat);
      float near = clamp(1.0 - px / 1.2, 0.0, 1.0);                                              // 가까울 때만 차선을 그린다
      alb = mix(alb, paint, min(1.0, a) * marks * near * 0.9 * dim);
    }
    vec3 col = lit(alb, vec3(0.0, 1.0, 0.0));
    col = mix(col, col * 0.62, side);

    // 비: 길이 젖어 어두워지고 물웅덩이에 하늘빛이 비친다
    float wet = uRain * (1.0 - side);
    vec2 q2 = vec2(vUV.x * 1.6 + 7.0, vUV.y / 7.0);
    vec2 qi = floor(q2), qf = fract(q2);
    qf = qf * qf * (3.0 - 2.0 * qf);
    float nz = mix(mix(hash21(qi), hash21(qi + vec2(1.0, 0.0)), qf.x), mix(hash21(qi + vec2(0.0, 1.0)), hash21(qi + vec2(1.0, 1.0)), qf.x), qf.y);
    float puddle = smoothstep(0.5, 0.8, nz);
    col = mix(col, col * 0.6, wet);
    col += uFogCol * 0.18 * wet * puddle;

    // 밤: 큰길은 양쪽 가장자리, 골목은 가운데에 가로등 빛. 젖은 길에서는 빛이 길 방향으로 길게 번진다
    float al = abs(fract(vUV.y / 34.0) - 0.5) * 34.0;
    float edge = (1.0 - abs(vUV.x)) * width * 0.5;
    float lamp = exp(-(al * al / (1.0 + 2.0 * wet) + edge * edge) / 70.0) * major * (1.0 - median);
    float al2 = abs(fract(vUV.y / 26.0 + 0.37) - 0.5) * 26.0;
    float lamp2 = exp(-(al2 * al2) / (42.0 * (1.0 + 1.5 * wet))) * (1.0 - major) * (1.0 - side) * step(cls, 6.5) * 0.55;
    col += vec3(1.0, 0.70, 0.36) * (lamp * 0.62 + lamp2 * 0.42 + major * 0.05) * uNight * (1.0 + 0.5 * wet * (0.3 + puddle));

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

const nodeKey = (x: number, z: number) => `${Math.round(x * 10)},${Math.round(z * 10)}`;

/**
 * clears(i): 길 조각 i 의 시작·끝에서 차선을 긋지 않을 거리(교차로 상자, 신호 정지선). 없으면 0
 */
export function makeRoads(roads: Road[], lmColors: string[], clears: (i: number) => [number, number] = () => [0, 0]) {
  const lm = { uLmCol: { value: lmColors.map((c) => new THREE.Color(c)) }, uLmGlow: { value: lmColors.map(() => 0) } };
  const uniforms = { uMajor: { value: pal.roadMajor }, uMinor: { value: pal.roadMinor }, uWalk: { value: pal.walk }, ...lm };

  const flat = ribbon();
  const deck = ribbon();
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
    const [cs, ce] = clears(ri);
    const lanesShown = r.cls <= 3 || r.measured;
    const ex = [c0, lanesShown ? r.lf : 0, lanesShown && !r.oneway ? r.lb : 0, r.lw, lanesShown ? r.ctype : 0, (r.busR ? 1 : 0) | (r.busL ? 2 : 0), cs, len - ce];
    let top = 0;
    for (let i = 1; i < r.p.length; i += 3) top = Math.max(top, r.p[i]);
    const last = r.p.length - 3;
    const atRim = Math.hypot(r.p[0], r.p[2]) > BOARD_R - 12 || Math.hypot(r.p[last], r.p[last + 2]) > BOARD_R - 12;
    if (top < 0.3) {
      addRibbon(flat, shift(r.p, c0), w, info, 0, atRim ? 0 : w * 0.45, ex);
      // 분리대: 한 방향 큰길 왼쪽, 반대 방향 길까지의 절반. 10m 넘게 떨어진 길 사이는 분리대가 아니라 따로 난 길이다
      if (r.oneway && r.gap > 0.15 && r.gap <= 10 && r.cls <= 3) {
        const gw = r.gap / 2;
        addRibbon(flat, shift(r.p, -hl - gw / 2), gw, [r.cls, gw, 1, 0], 0, 0, [0, 0, 0, r.lw, 0, MEDIAN | (r.medBus ? MED_BUS : 0), cs, len - ce]);
      }
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
        deck.pos.push(x, y, z, x, Math.max(0, y - 1.8), z);
        deck.uv.push(0, 0, 0, 0);
        deck.info.push(9, w, 0, r.lm, 9, w, 0, r.lm);
        deck.ex.push(0, 0, 0, 3.3, 0, NO_MARKS, 0, 0, 0, 0, 0, 3.3, 0, NO_MARKS, 0, 0);
        if (i > 0) {
          const q = base + i * 2;
          deck.idx.push(q - 2, q - 1, q, q - 1, q + 1, q);
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
  addCorners(flat, roads);

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

/**
 * 길 모퉁이를 둥글게 깎는다: 땅 위 길 조각이 둘 넘게 만나는 노드에서 각도 순으로 이웃한 두 갈래의 찻길 가장자리 선이 만나는 점(보도 모서리)을
 * 반지름 R(큰길끼리 6m, 큰길과 골목 4m, 골목끼리 2.5m)의 호로 깎아, 그 사이를 길 바닥으로 칠한다. 분리대 쪽 모서리는 깎지 않는다.
 */
function addCorners(o: ReturnType<typeof ribbon>, roads: Road[]) {
  interface Arm {
    ux: number;
    uz: number;
    /** 노드에서 멀어지는 방향 기준 오른쪽·왼쪽 찻길 가장자리 */
    hr: number;
    hl: number;
    cls: number;
    len: number;
    /** 왼쪽·오른쪽이 분리대인가 */
    medL: boolean;
    medR: boolean;
  }
  const arms = new Map<string, { x: number; z: number; list: Arm[] }>();
  roads.forEach((r) => {
    if (r.cls > 5 || r.p.length < 6) return;
    for (let i = 1; i < r.p.length; i += 3) if (r.p[i] > 0.3) return;
    const L = cumLen(r.p);
    const len = L[L.length - 1];
    const [hr, hl] = roadHalf(r);
    const med = r.oneway && r.gap > 0.15 && r.gap <= 10;
    for (const end of [0, 1]) {
      const n = r.p.length;
      const [x, z, nx, nz] = end ? [r.p[n - 3], r.p[n - 1], r.p[n - 6], r.p[n - 4]] : [r.p[0], r.p[2], r.p[3], r.p[5]];
      const d = Math.hypot(nx - x, nz - z) || 1;
      const k = nodeKey(x, z);
      const a = arms.get(k) ?? arms.set(k, { x, z, list: [] }).get(k)!;
      // 끝 노드에서 멀어지는 방향은 길 진행 방향의 반대라 오른쪽·왼쪽이 바뀐다
      a.list.push({ ux: (nx - x) / d, uz: (nz - z) / d, hr: end ? hl : hr, hl: end ? hr : hl, cls: r.cls, len, medL: med && !end, medR: med && !!end });
    }
  });
  for (const { x, z, list } of arms.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => Math.atan2(a.uz, a.ux) - Math.atan2(b.uz, b.ux));
    for (let k = 0; k < sorted.length; k++) {
      const a = sorted[k];
      const b = sorted[(k + 1) % sorted.length];
      let th = Math.atan2(b.uz, b.ux) - Math.atan2(a.uz, a.ux);
      if (th <= 0) th += Math.PI * 2;
      if (th > Math.PI - 0.25 || th < 0.35 || a.medR || b.medL) continue;
      // a 의 오른쪽 가장자리(+ 각도 쪽)와 b 의 왼쪽 가장자리
      const ax = x - a.uz * a.hr;
      const az = z + a.ux * a.hr;
      const bx = x + b.uz * b.hl;
      const bz = z - b.ux * b.hl;
      const den = a.ux * b.uz - a.uz * b.ux;
      if (Math.abs(den) < 1e-3) continue;
      const t = ((bx - ax) * b.uz - (bz - az) * b.ux) / den;
      const kx = ax + a.ux * t;
      const kz = az + a.uz * t;
      const R = a.cls <= 3 && b.cls <= 3 ? 6 : a.cls <= 3 || b.cls <= 3 ? 4 : 2.5;
      const dt = Math.min(R / Math.tan(th / 2), a.len * 0.45, b.len * 0.45);
      if (dt < 0.3 || t + dt < 0) continue;
      const r = dt * Math.tan(th / 2);
      const t1x = kx + a.ux * dt;
      const t1z = kz + a.uz * dt;
      const t2x = kx + b.ux * dt;
      const t2z = kz + b.uz * dt;
      // 호의 가운데: 두 접점에서 각 가장자리에 직각으로 r 만큼 보도 쪽
      const cx = t1x - a.uz * r;
      const cz = t1z + a.ux * r;
      const a0 = Math.atan2(t1z - cz, t1x - cx);
      let a1 = Math.atan2(t2z - cz, t2x - cx);
      while (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
      while (a0 - a1 > Math.PI) a1 += Math.PI * 2;
      const cls = Math.min(a.cls, b.cls);
      const base = o.pos.length / 3;
      o.pos.push(kx, 0, kz);
      const steps = 8;
      for (let s = 0; s <= steps; s++) {
        const ang = a0 + ((a1 - a0) * s) / steps;
        o.pos.push(cx + Math.cos(ang) * r, 0, cz + Math.sin(ang) * r);
      }
      for (let s = 0; s <= steps + 1; s++) {
        o.uv.push(0, 0);
        o.info.push(cls, 10, 0, 0);
        o.ex.push(0, 0, 0, 3.3, 0, NO_MARKS, 0, 0);
      }
      for (let s = 0; s < steps; s++) o.idx.push(base, base + 1 + s, base + 2 + s);
    }
  }
}
