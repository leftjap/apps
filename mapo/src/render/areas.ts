// 바닥 면. 서울 생태현황도(개별비오톱)의 땅 쓰임새·도로 부지·한강 둔치 면을 깔고, 그 위에 OSM 의 공원·광장·주차장·운동장·코트·놀이터 면을 칠한다.
// 도로 부지는 보도 포장 색이라 찻길 띠가 덮지 않은 부분이 보도로 남는다. 경기장은 감싸는 직사각형으로 선을, 주차장은 주차 칸을 긋는다.
// 색은 env.ts 의 pal 값(낮·노을·밤을 따라 바뀐다)을 셰이더에서 섞어 만든다. 물(마스크 빨강) 위에서는 부두 말고는 그리지 않는다.
import * as THREE from 'three';
import { GK, type GroundArea } from '../data/board.ts';
import { BOARD_R } from '../geo.ts';
import { material, pal } from './env.ts';
import { addRibbon, ribbon, ribbonGeometry } from './util.ts';

/** 테두리(연석)를 긋는 종류 */
const EDGED = new Set<number>([GK.PARK, GK.PITCH_DIRT, GK.PITCH_TURF, GK.COURT, GK.TRACK, GK.PLAYGROUND, GK.POOL, GK.ISLAND]);

const K = Object.fromEntries(Object.entries(GK).map(([k, v]) => [k, v.toFixed(1)])) as Record<keyof typeof GK, string>;

const VERT = /* glsl */ `
  attribute vec4 aA; attribute vec2 aB;
  varying vec4 vA; varying vec2 vB; varying vec3 vW; varying float vDist;
  void main() {
    vA = aA; vB = aB; vW = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */ `
  uniform sampler2D uMask; uniform vec3 uLand, uGreen, uWalk, uMinor, uMajor, uWater, uPave;
  varying vec4 vA; varying vec2 vB; varying vec3 vW; varying float vDist;
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  /** x 가 0 에서 굵기 w 인 선(한 픽셀보다 가늘면 옅게) */
  float stripe(float x, float w) {
    float aa = max(fwidth(x), 1e-4);
    return (1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, abs(x))) * min(1.0, w / aa);
  }
  /**
   * 칸 크기 1 의 줄눈(p 는 칸 단위 좌표, w 는 줄눈 굵기). fract 로 접은 값의 미분은 칸 경계에서 튀어 무늬가 어긋나 보이므로
   * 접기 전 좌표로 미분하고, 칸이 화면에서 네 픽셀보다 작아지면 지운다
   */
  float joints(vec2 p, float w) {
    vec2 aa = max(fwidth(p), vec2(1e-4));
    vec2 d = abs(fract(p + 0.5) - 0.5);
    vec2 l = (1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, d)) * min(vec2(1.0), w / aa);
    return max(l.x, l.y) * (1.0 - smoothstep(0.12, 0.25, max(aa.x, aa.y)));
  }
  /** 잔디·흙 얼룩(0~1). 넓게 덮는 시가지 면에서는 부르지 않는다 */
  float mottle(vec2 p) { return vnoise(p * 0.35) * 0.6 + vnoise(p * 1.3) * 0.4; }
  /** 칸 크기 1 의 얼룩이 화면에서 보일 만큼 큰가(0~1) */
  float near(vec2 p) {
    vec2 aa = fwidth(p);
    return 1.0 - smoothstep(0.15, 0.4, max(aa.x, aa.y));
  }
  /** 직사각형 테두리(가장자리에서 안쪽으로 inset) */
  float frame(vec2 q, vec2 h, float w) {
    vec2 d = abs(q) - h;
    float inside = step(max(d.x, d.y), w * 0.5);
    return max(stripe(d.x, w) * step(d.y, 0.0), stripe(d.y, w) * step(d.x, 0.0)) * inside;
  }
  /** 경기장 선. q 는 직사각형 안 좌표(긴 변 방향 u, 짧은 변 방향 v, m), h 는 반 길이·반 폭 */
  float courtLines(float sport, vec2 q, vec2 h) {
    float w = 0.12;
    if (sport < 1.5) {
      // 축구: 가장자리 1m 안쪽 테두리, 가운데 선과 원, 양쪽 벌칙 구역
      vec2 f = max(h - 1.0, vec2(1.0));
      float l = frame(q, f, w) + stripe(q.x, w) * step(abs(q.y), f.y);
      float r = min(9.15, f.y * 0.3);
      l += stripe(length(q) - r, w);
      vec2 box = vec2(min(16.5, f.x * 0.3), min(20.0, f.y * 0.6));
      vec2 pq = vec2(f.x - abs(q.x) - box.x * 0.5, q.y);
      l += frame(pq, vec2(box.x * 0.5, box.y), w) * step(abs(q.x), f.x);
      return min(1.0, l);
    }
    if (sport < 2.5) {
      // 테니스: 코트(23.77 × 10.97m)를 반복해 깐다
      vec2 cell = vec2(36.0, 18.0);
      vec2 n = max(floor(h * 2.0 / cell + 0.5), vec2(1.0));
      vec2 c = h * 2.0 / n;
      vec2 p = mod(q + h, c) - c * 0.5;
      float l = frame(p, vec2(11.885, 5.485), w) + frame(p, vec2(11.885, 4.115), w) * 0.9;
      l += stripe(p.x, w) * step(abs(p.y), 6.0);
      l += stripe(abs(p.x) - 6.4, w) * step(abs(p.y), 4.115) + stripe(p.y, w) * step(abs(p.x), 6.4);
      return min(1.0, l);
    }
    if (sport < 3.5) {
      // 농구: 코트(28 × 15m), 가운데 원, 제한 구역, 3점 선
      vec2 cell = vec2(32.0, 19.0);
      vec2 n = max(floor(h * 2.0 / cell + 0.5), vec2(1.0));
      vec2 c = h * 2.0 / n;
      vec2 p = mod(q + h, c) - c * 0.5;
      vec2 f = min(vec2(14.0, 7.5), c * 0.5 - 0.6);
      float l = frame(p, f, w) + stripe(p.x, w) * step(abs(p.y), f.y) + stripe(length(p) - 1.8, w);
      vec2 kq = vec2(f.x - abs(p.x) - 2.9, p.y);
      l += frame(kq, vec2(2.9, 2.45), w);
      float d3 = length(vec2(f.x - 1.575 - abs(p.x), p.y)) - min(6.75, f.y - 0.6);
      l += stripe(d3, w) * step(abs(p.x), f.x - 1.575);
      return min(1.0, l);
    }
    return frame(q, max(h - 0.8, vec2(0.5)), w);
  }
  /** 주차 칸: 5m 칸 줄 + 6m 통로 + 5m 칸 줄을 짧은 변 방향으로 되풀이하고, 칸 줄 안에 2.5m 마다 선 */
  float stalls(vec2 q, vec2 h) {
    float b = q.y + h.y;
    float m = h.y * 2.0 < 12.0 ? b : mod(b, 16.0);
    float row = h.y * 2.0 < 12.0 ? 1.0 : step(m, 5.0) + step(11.0, m);
    float l = stripe(mod(q.x, 2.5) - 1.25, 0.12) * row;
    l += (stripe(m - 5.0, 0.12) + stripe(m - 11.0, 0.12)) * step(12.0, h.y * 2.0);
    return min(1.0, l) * step(abs(q.x), h.x - 0.5) * step(abs(q.y), h.y - 0.3);
  }
  void main() {
    if (dot(vW.xz, vW.xz) > ${(BOARD_R * BOARD_R).toFixed(1)}) discard;
    vec4 m = texture2D(uMask, (vW.xz + 2048.0) / 4096.0);
    float k = vA.x;
    if (m.r > 0.5 && abs(k - ${K.PIER}) > 0.5) discard;
    float param = vA.y;
    vec2 h = vA.zw;
    vec2 q = vB;
    vec2 p = vW.xz;
    float paved = 0.0;
    float veg = 0.0;
    vec3 white = mix(uWalk, vec3(1.0), 0.6);
    vec3 alb = uLand;
    #define IS(v) (abs(k - (v)) < 0.5)
    // 보도 재질(재작업 W14): 보도·광장·한강 포장·교통섬은 회색 블록 300×300mm 한 재질, 시가지 블록 안 땅(건물 앞 공지)은 같은 색에 줄눈 없이
    if (IS(${K.HOUSE}) || IS(${K.MIXED}) || IS(${K.COMMERCE})) { alb = uPave * 0.97; paved = 1.0; }
    else if (IS(${K.APT}) || IS(${K.PUBLIC})) {
      // 아파트 단지·학교·관공서: 녹지율만큼 잔디밭 조각
      float g = clamp(param / 100.0, 0.0, 0.8);
      float lawn = smoothstep(0.08, -0.08, vnoise(p * 0.07) * 0.75 + vnoise(p * 0.21) * 0.25 - g * 1.1);
      alb = mix(mix(uLand, uWalk, 0.25), uGreen * (0.92 + 0.12 * mottle(p)), lawn);
      veg = lawn;
    }
    else if (IS(${K.RAIL}) || IS(${K.RAILWAY})) alb = mix(uLand, uMajor, 0.5) * vec3(0.96, 0.94, 0.91) * (0.95 + 0.1 * mottle(p));
    else if (IS(${K.ROADSIDE}) || IS(${K.PLAZA}) || IS(${K.RIVER_PAVED}) || IS(${K.ISLAND})) {
      // 보도 블록: 300×300mm 회색 블록과 줄눈
      alb = uPave * (1.0 - 0.08 * joints(p / 0.3, 0.06));
      paved = 1.0;
    }
    else if (IS(${K.UTILITY})) { alb = mix(uLand, uMinor, 0.5); paved = 1.0; }
    else if (IS(${K.BARE})) alb = uLand * vec3(1.02, 0.92, 0.79) * (0.94 + 0.1 * mottle(p));
    else if (IS(${K.FOREST}) || IS(${K.WOOD})) { alb = uGreen * vec3(0.74, 0.85, 0.74) * (0.88 + 0.2 * mottle(p)); veg = 1.0; }
    else if (IS(${K.GREEN}) || IS(${K.RIVER_GREEN})) { alb = uGreen * vec3(0.95, 1.0, 0.95) * (0.92 + 0.14 * mottle(p)); veg = 1.0; }
    else if (IS(${K.PARK})) { alb = uGreen * vec3(1.02, 1.03, 1.0) * (0.93 + 0.12 * mottle(p)); veg = 1.0; }
    else if (IS(${K.FARM})) {
      float rows = mix(0.5, step(0.5, fract(p.x * 0.5 + p.y * 0.2)), near(vec2(p.x * 0.5 + p.y * 0.2)));
      alb = mix(uGreen * 0.9, uLand * vec3(1.0, 0.9, 0.76), 0.35 + 0.3 * rows);
      veg = 1.0;
    }
    else if (IS(${K.REVETMENT})) {
      alb = mix(uMinor, uMajor, 0.5) * 0.9;
      alb *= (0.98 + (hash21(floor(p * 0.8)) - 0.5) * 0.12 * near(p * 0.8)) * (1.0 - 0.1 * joints(p * 0.8, 0.06));
    }
    else if (IS(${K.PARKING})) {
      alb = uMinor * 0.9;
      alb = mix(alb, white, stalls(q, h) * 0.6);
      paved = 1.0;
    }
    else if (IS(${K.PITCH_DIRT})) {
      alb = uLand * vec3(1.03, 0.9, 0.72) * (0.95 + 0.08 * mottle(p));
      alb = mix(alb, white, courtLines(param, q, h) * 0.85);
    }
    else if (IS(${K.PITCH_TURF})) {
      float mow = step(0.5, fract(q.x / 10.0));                              // 잔디 깎은 줄(10m)
      alb = uGreen * vec3(0.72, 0.98, 0.72) * (0.95 + 0.06 * mow);
      alb = mix(alb, white, courtLines(param, q, h) * 0.85);
      veg = 1.0;
    }
    else if (IS(${K.COURT})) {
      // 테니스는 청록, 농구는 파랑, 그 밖은 녹색 포장
      vec3 c = param > 1.5 && param < 2.5 ? mix(uGreen, uWater, 0.55) * vec3(0.78, 0.9, 0.9) : param > 2.5 && param < 3.5 ? mix(uWater, uMinor, 0.25) * vec3(0.78, 0.86, 1.0) : uGreen * vec3(0.7, 0.88, 0.76);
      alb = mix(c, white, courtLines(param, q, h) * 0.9);
      paved = 1.0;
    }
    else if (IS(${K.TRACK})) alb = uLand * vec3(1.0, 0.62, 0.5);
    else if (IS(${K.PLAYGROUND})) alb = uLand * vec3(1.03, 0.82, 0.64) * (0.99 + (hash21(floor(p * 1.5)) - 0.5) * 0.12 * near(p * 1.5));
    else if (IS(${K.BLEACHERS})) alb = uMinor * (1.0 - 0.08 * joints(vec2(p.x + p.y, 0.5), 0.3));
    else if (IS(${K.PIER})) alb = uLand * vec3(0.93, 0.83, 0.68) * (1.0 - 0.1 * joints(vec2(p.x * 3.0, 0.5), 0.1));
    else if (IS(${K.POOL})) alb = uWater * vec3(0.85, 1.1, 1.15);
    // 건물 둘레 그늘(마스크 파랑), 비에 젖은 포장
    alb *= 1.0 - 0.22 * m.b * (1.0 - 0.6 * veg);
    alb *= 1.0 - 0.3 * uRain * paved;
    vec3 col = lit(alb, vec3(0.0, 1.0, 0.0));
    col *= 1.0 + 0.07 * smoothstep(${(BOARD_R - 16).toFixed(1)}, ${(BOARD_R - 9).toFixed(1)}, length(p));
    col = mix(col, mix(vec3(0.40, 0.45, 0.52), col * 0.28 + vec3(0.012, 0.02, 0.035), uNight), focusIn(p) * 0.85);
    gl_FragColor = vec4(fogged(col, vDist), 1.0);
  }`;

export function makeAreas(areas: GroundArea[], mask: THREE.Texture): THREE.Group {
  const pos: number[] = [];
  const a: number[] = [];
  const b: number[] = [];
  const idx: number[] = [];
  const edge = ribbon();
  const v2 = (f: Float32Array) => {
    const out: THREE.Vector2[] = [];
    for (let i = 0; i < f.length; i += 2) out.push(new THREE.Vector2(f[i], f[i + 1]));
    return out;
  };
  for (const ar of areas) {
    const outer = v2(ar.outer);
    const holes = ar.holes.map(v2);
    if (outer.length < 3) continue;
    const base = pos.length / 3;
    const r = ar.rect;
    for (const pt of [outer, ...holes].flat()) {
      pos.push(pt.x, 0, pt.y);
      a.push(ar.kind, ar.param, r ? r.hl : 0, r ? r.hw : 0);
      if (r) {
        const dx = pt.x - r.cx;
        const dz = pt.y - r.cz;
        b.push(dx * r.ux + dz * r.uz, -dx * r.uz + dz * r.ux);
      } else b.push(0, 0);
    }
    for (const f of THREE.ShapeUtils.triangulateShape(outer, holes)) idx.push(base + f[0], base + f[1], base + f[2]);
    if (EDGED.has(ar.kind)) {
      const loop = [...outer, outer[0]].flatMap((pt) => [pt.x, 0, pt.y]);
      addRibbon(edge, loop, 0.35, [ar.kind, 0, 0, 0]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(a, 4));
  g.setAttribute('aB', new THREE.Float32BufferAttribute(b, 2));
  g.setIndex(idx);
  const uniforms = {
    uMask: { value: mask },
    uLand: { value: pal.land },
    uGreen: { value: pal.green },
    uWalk: { value: pal.walk },
    uPave: { value: pal.paving },
    uMinor: { value: pal.roadMinor },
    uMajor: { value: pal.roadMajor },
    uWater: { value: pal.water },
  };
  // 바닥 원판 다음, 도로 앞에 깊이를 쓰지 않고 그린다(겹친 면은 늘어놓은 순서대로 덮는다. 깊이를 쓰면 같은 높이의 면끼리 깜빡인다).
  // 땅높이(y = 0)에 조금만 당겨 두어(offset 1) 철길 터파기 구멍(y = 0.06)과 도로(offset 2)·바닥 표시(offset 3 이상)는 이 위에 그려진다
  const fill = new THREE.Mesh(g, material({ vertex: VERT, fragment: FRAG, uniforms, depthWrite: false, offset: 1, doubleSide: true }));
  fill.renderOrder = -8;
  fill.frustumCulled = false;

  // 연석: 공원·경기장·놀이터 둘레의 밝은 테두리(가까이 볼 때만 보인다)
  const curb = new THREE.Mesh(
    ribbonGeometry(edge),
    material({
      uniforms,
      depthWrite: false,
      offset: 1,
      doubleSide: true,
      vertex: /* glsl */ `varying vec3 vW; varying float vDist;
        void main() { vW = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragment: /* glsl */ `uniform sampler2D uMask; uniform vec3 uWalk, uMinor; varying vec3 vW; varying float vDist;
        void main() {
          if (dot(vW.xz, vW.xz) > ${(BOARD_R * BOARD_R).toFixed(1)}) discard;
          if (texture2D(uMask, (vW.xz + 2048.0) / 4096.0).r > 0.5) discard;
          vec3 col = lit(mix(uWalk, uMinor, 0.35) * 1.04, vec3(0.0, 1.0, 0.0));
          col = mix(col, mix(vec3(0.40, 0.45, 0.52), col * 0.28 + vec3(0.012, 0.02, 0.035), uNight), focusIn(vW.xz) * 0.85);
          gl_FragColor = vec4(fogged(col, vDist), 1.0);
        }`,
    }),
  );
  curb.renderOrder = -7.5;
  curb.frustumCulled = false;
  const group = new THREE.Group();
  group.add(fill, curb);
  return group;
}
