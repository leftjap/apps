// 도로. 땅 위의 길은 깊이를 쓰지 않는 띠 하나로 겹쳐 그리고(작은 길 먼저), 교량은 띄운 띠와 교각으로 따로 그린다.
import * as THREE from 'three';
import type { Road } from '../data/board.ts';
import { BOARD_R } from '../geo.ts';
import { cumLen, pointAt } from '../poly.ts';
import { material, pal } from './env.ts';
import { addRibbon, merge, ribbon, ribbonGeometry } from './util.ts';

export function roadWidth(r: Road): number {
  if (r.cls <= 3) return Math.max(7, r.lanes * 3.3 + 1);
  return r.cls === 4 ? 5.6 : r.cls === 5 ? 3.6 : r.cls === 6 ? 6.5 : 2.6;
}

const VERT = /* glsl */ `
  attribute vec2 aUV; attribute vec4 aInfo;
  varying vec2 vUV; varying vec4 vInfo; varying float vDist;
  void main() {
    vUV = aUV; vInfo = aInfo;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

// vInfo = (등급, 폭, 일방통행, 랜드마크 번호). 등급 9 = 교량 옆면
const FRAG = /* glsl */ `
  uniform vec3 uMajor, uMinor, uWalk; uniform float uDeck;
  uniform vec3 uLmCol[6]; uniform float uLmGlow[6];
  varying vec2 vUV; varying vec4 vInfo; varying float vDist;
  void main() {
    float cls = vInfo.x; float width = vInfo.y;
    float major = step(cls, 3.5);
    float walk = step(5.5, cls) * step(cls, 8.5);
    float side = step(8.5, cls);
    vec3 alb = mix(mix(uMinor, uMajor, major), uWalk, walk);
    alb *= 1.0 - 0.10 * major * smoothstep(0.84, 1.0, abs(vUV.x));          // 가장자리 턱
    float px = fwidth(vUV.x) * width * 0.5;                                    // 화면 한 픽셀이 덮는 길 폭(m)
    float near = clamp(1.0 - px / 1.6, 0.0, 1.0);                              // 가까울 때만 차선을 그린다
    float du = abs(vUV.x) * width * 0.5;
    float centre = (1.0 - smoothstep(0.12, 0.3, du)) * step(cls, 3.5) * (1.0 - vInfo.z);
    alb = mix(alb, vec3(0.93, 0.76, 0.32), centre * near * 0.7 * (1.0 - 0.6 * uNight));
    vec3 col = lit(alb, vec3(0.0, 1.0, 0.0));
    col = mix(col, col * 0.62, side);

    // 비: 길이 젖어 어두워지고 물웅덩이에 하늘빛이 비친다
    float wet = uRain * (1.0 - side);
    vec2 q = vec2(vUV.x * 1.6 + 7.0, vUV.y / 7.0);
    vec2 qi = floor(q), qf = fract(q);
    qf = qf * qf * (3.0 - 2.0 * qf);
    float nz = mix(mix(hash21(qi), hash21(qi + vec2(1.0, 0.0)), qf.x), mix(hash21(qi + vec2(0.0, 1.0)), hash21(qi + vec2(1.0, 1.0)), qf.x), qf.y);
    float puddle = smoothstep(0.5, 0.8, nz);
    col = mix(col, col * 0.6, wet);
    col += uFogCol * 0.18 * wet * puddle;

    // 밤: 큰길은 양쪽 가장자리, 골목은 가운데에 가로등 빛. 젖은 길에서는 빛이 길 방향으로 길게 번진다
    float along = abs(fract(vUV.y / 34.0) - 0.5) * 34.0;
    float edge = (1.0 - abs(vUV.x)) * width * 0.5;
    float lamp = exp(-(along * along / (1.0 + 2.0 * wet) + edge * edge) / 70.0) * major;
    float along2 = abs(fract(vUV.y / 26.0 + 0.37) - 0.5) * 26.0;
    float lamp2 = exp(-(along2 * along2) / (42.0 * (1.0 + 1.5 * wet))) * (1.0 - major) * (1.0 - side) * step(cls, 6.5) * 0.55;
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
    gl_FragColor = vec4(fogged(col, vDist), 1.0);
  }`;

export function makeRoads(roads: Road[], lmColors: string[]) {
  const lm = { uLmCol: { value: lmColors.map((c) => new THREE.Color(c)) }, uLmGlow: { value: lmColors.map(() => 0) } };
  const uniforms = { uMajor: { value: pal.roadMajor }, uMinor: { value: pal.roadMinor }, uWalk: { value: pal.walk }, ...lm };

  const flat = ribbon();
  const deck = ribbon();
  const piers: THREE.BufferGeometry[] = [];
  const sorted = [...roads].sort((a, b) => b.cls - a.cls);
  const tmp = [0, 0, 0];
  for (const r of sorted) {
    const w = roadWidth(r);
    const info: [number, number, number, number] = [r.cls, w, r.oneway ? 1 : 0, r.lm];
    let top = 0;
    for (let i = 1; i < r.p.length; i += 3) top = Math.max(top, r.p[i]);
    const last = r.p.length - 3;
    const atRim = Math.hypot(r.p[0], r.p[2]) > BOARD_R - 12 || Math.hypot(r.p[last], r.p[last + 2]) > BOARD_R - 12;
    if (top < 0.3) {
      addRibbon(flat, r.p, w, info, 0, atRim ? 0 : w * 0.45);
      continue;
    }
    addRibbon(deck, r.p, w, info, 0.25, 0);
    // 옆면: 양 가장자리를 따라 아래로 1.8m
    const n = r.p.length / 3;
    for (const sgn of [-1, 1]) {
      const base = deck.pos.length / 3;
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1) * 3;
        const b = Math.min(n - 1, i + 1) * 3;
        const dx = r.p[b] - r.p[a];
        const dz = r.p[b + 2] - r.p[a + 2];
        const len = Math.hypot(dx, dz) || 1;
        const x = r.p[i * 3] + ((sgn * dz) / len) * w * 0.5;
        const z = r.p[i * 3 + 2] - ((sgn * dx) / len) * w * 0.5;
        const y = r.p[i * 3 + 1] + 0.25;
        deck.pos.push(x, y, z, x, Math.max(0, y - 1.8), z);
        deck.uv.push(0, 0, 0, 0);
        deck.info.push(9, w, 0, r.lm, 9, w, 0, r.lm);
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
