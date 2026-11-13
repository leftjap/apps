// 노선과 열차. 지하 구간은 지표 아래(UNDER_Y)에 얇은 노선색 선으로, 지상 구간(당산철교)은 띄운 선로와 교각으로 그린다.
// 지하 선과 지하 열차는 땅과 도로 위에만 비쳐 보이고, 나무·사람·고양이·건물은 그 위를 덮는다.
// 지하 열차는 윗면이 밝고 옆면이 진한 입체 막대, 지상 열차는 입체 차량이다.
import * as THREE from 'three';
import type { Line } from '../data/board.ts';
import { headingAt, pointAt } from '../poly.ts';
import type { TrainPos } from '../sim/trains.ts';
import { material, pal, UNDER_Y } from './env.ts';
import { addRibbon, instanced, merge, ribbon, ribbonGeometry } from './util.ts';

const VERT = /* glsl */ `
  attribute vec2 aUV; attribute vec4 aInfo;
  varying vec2 vUV; varying vec4 vInfo; varying float vDist;
  void main() {
    vUV = aUV; vInfo = aInfo;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const MAX_CARS = 260;

export interface TrainSpot {
  key: number;
  line: string;
  dir: 0 | 1;
  x: number;
  y: number;
  z: number;
  under: boolean;
}
const CAR_GAP = 20;

export function makeRails(lines: Line[]) {
  const glow = ribbon();
  const deck = ribbon();
  const piers: THREE.BufferGeometry[] = [];
  const tmp = [0, 0, 0];
  for (const l of lines) {
    const c = new THREE.Color(l.color);
    const info: [number, number, number, number] = [c.r, c.g, c.b, 0];
    // 지하(y < -1)와 지상 구간으로 나눠 띠를 만든다. 이웃 구간과 한 점씩 겹치게 한다
    const n = l.p.length / 3;
    let start = 0;
    const under = (i: number) => l.p[i * 3 + 1] < -1;
    for (let i = 1; i <= n; i++) {
      if (i < n && under(i) === under(start)) continue;
      const end = Math.min(n, i + 1);
      const seg = l.p.slice(start * 3, end * 3);
      if (under(start)) {
        for (let k = 1; k < seg.length; k += 3) seg[k] = UNDER_Y;
        addRibbon(glow, seg, 9, info);
      } else {
        for (let k = 1; k < seg.length; k += 3) seg[k] = Math.max(0.3, seg[k]);
        addRibbon(deck, seg, 9, info);
      }
      start = i;
    }
    for (let s = 30; s < l.cum[l.cum.length - 1]; s += 60) {
      const seg = pointAt(l.p, l.cum, s, tmp);
      if (tmp[1] < 4) continue;
      const g = new THREE.BoxGeometry(2.6, tmp[1], 6.5);
      g.rotateY(-headingAt(l.p, seg));
      g.translate(tmp[0], tmp[1] / 2 - 0.3, tmp[2]);
      piers.push(g);
    }
  }
  const group = new THREE.Group();

  const glowMesh = new THREE.Mesh(
    ribbonGeometry(glow),
    material({
      vertex: VERT,
      under: true,
      doubleSide: true,
      fragment: /* glsl */ `
        varying vec2 vUV; varying vec4 vInfo; varying float vDist;
        void main() {
          float x = abs(vUV.x);
          float core = 1.0 - smoothstep(0.26, 0.36, x);                  // 가운데 약 3m 의 선명한 선
          float halo = (1.0 - x) * (1.0 - x);
          float flow = 0.85 + 0.15 * sin(vUV.y * 0.06 - uTime * 2.2);
          vec3 col = mix(vInfo.rgb * 0.92, mix(vInfo.rgb, vec3(1.0), 0.35), uNight) * flow;
          float a = core * (0.88 + 0.1 * uNight) + halo * (0.10 + 0.14 * uNight);
          gl_FragColor = vec4(fogged(col, vDist), a);
        }`,
    }),
  );
  glowMesh.renderOrder = -4.4;
  glowMesh.frustumCulled = false;
  group.add(glowMesh);

  const deckMesh = new THREE.Mesh(
    ribbonGeometry(deck),
    material({
      vertex: VERT,
      doubleSide: true,
      uniforms: { uMajor: { value: pal.roadMajor } },
      fragment: /* glsl */ `
        uniform vec3 uMajor;
        varying vec2 vUV; varying vec4 vInfo; varying float vDist;
        void main() {
          float rail = step(0.25, abs(vUV.x)) * step(abs(vUV.x), 0.36) + step(0.62, abs(vUV.x)) * step(abs(vUV.x), 0.73);
          float tie = step(0.5, fract(vUV.y / 2.4)) * step(abs(vUV.x), 0.86);
          vec3 alb = uMajor * (0.8 - 0.08 * tie);
          alb = mix(alb, uMajor * 0.5, rail);
          alb = mix(alb, vInfo.rgb, step(0.9, abs(vUV.x)));
          vec3 col = lit(alb, vec3(0.0, 1.0, 0.0)) + vInfo.rgb * step(0.9, abs(vUV.x)) * uNight * 0.6;
          gl_FragColor = vec4(fogged(col, vDist), 1.0);
        }`,
    }),
  );
  deckMesh.frustumCulled = false;
  group.add(deckMesh);
  if (piers.length) {
    const pier = new THREE.Mesh(
      merge(piers),
      material({
        uniforms: { uMajor: { value: pal.roadMajor } },
        vertex: /* glsl */ `varying vec3 vN; varying float vDist;
          void main() { vN = normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragment: /* glsl */ `uniform vec3 uMajor; varying vec3 vN; varying float vDist;
          void main() { gl_FragColor = vec4(fogged(lit(uMajor * 0.8, normalize(vN)), vDist), 1.0); }`,
      }),
    );
    pier.frustumCulled = false;
    group.add(pier);
  }

  // ── 열차 ──
  const { geo, arr, attr } = instanced(new THREE.BoxGeometry(19.2, 3.5, 3.0).translate(0, 1.75, 0), MAX_CARS, { aInst: 4, aCol: 4 });
  const trainMesh = new THREE.Mesh(
    geo,
    material({
      vertex: /* glsl */ `
        attribute vec4 aInst; attribute vec4 aCol;
        varying vec3 vN; varying vec3 vO; varying vec4 vCol; varying float vDist;
        void main() {
          vec3 c = aInst.xyz;
          vec4 cv = viewMatrix * vec4(c, 1.0);
          float s = zoomScale(-cv.z, 3.2, 5.0, 1.5, 4.5);
          vec3 p = position;
          p.yz *= s;
          float cs = cos(aInst.w), sn = sin(aInst.w);
          vec3 w = vec3(c.x + p.x * cs - p.z * sn, c.y + 0.9 + p.y, c.z + p.x * sn + p.z * cs);
          vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
          vO = position; vCol = aCol;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        varying vec3 vN; varying vec3 vO; varying vec4 vCol; varying float vDist;
        void main() {
          vec3 n = normalize(vN);
          float sideF = step(abs(n.y), 0.5) * step(1.2, abs(vO.z));
          float band = step(0.5, vO.y) * step(vO.y, 1.15);
          float win = step(1.75, vO.y) * step(vO.y, 2.7) * step(0.12, fract(vO.x / 3.2 + 0.5)) * step(abs(vO.x), 9.0) * sideF;
          vec3 alb = mix(vec3(0.93, 0.94, 0.95), vCol.rgb, band * sideF);
          alb = mix(alb, vec3(0.22, 0.27, 0.34), win);
          alb = mix(alb, vCol.rgb, step(0.5, n.y) * 0.35);
          vec3 col = lit(alb, n) + vec3(1.0, 0.9, 0.68) * win * uNight * 0.95;
          gl_FragColor = vec4(fogged(col, vDist), 1.0);
        }`,
    }),
  );
  trainMesh.frustumCulled = false;
  group.add(trainMesh);

  // 지하 열차: 넓게 볼 때도 보이도록 굵기를 키우고, 윗면은 밝게·옆면은 진하게 칠해 입체로 보이게 한다
  const sub = instanced(new THREE.BoxGeometry(19.6, 2.4, 3.2).translate(0, 1.2, 0), MAX_CARS, { aInst: 4, aCol: 4 });
  const subMesh = new THREE.Mesh(
    sub.geo,
    material({
      under: true,
      vertex: /* glsl */ `
        attribute vec4 aInst; attribute vec4 aCol;
        varying vec3 vN; varying vec4 vCol; varying float vDist; varying vec3 vO;
        void main() {
          vec3 c = vec3(aInst.x, ${UNDER_Y.toFixed(1)}, aInst.z);
          vec4 cv = viewMatrix * vec4(c, 1.0);
          float s = zoomScale(-cv.z, 3.2, 7.0, 1.4, 5.5);
          vec3 p = position;
          p.yz *= s;
          float cs = cos(aInst.w), sn = sin(aInst.w);
          vec3 w = vec3(c.x + p.x * cs - p.z * sn, c.y + p.y, c.z + p.x * sn + p.z * cs);
          vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
          vCol = aCol; vO = position;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        varying vec3 vN; varying vec4 vCol; varying float vDist; varying vec3 vO;
        void main() {
          vec3 n = normalize(vN);
          float top = step(0.5, n.y);
          float ends = step(9.5, abs(vO.x));                               // 앞뒤 끝은 흰 띠
          vec3 col = mix(vCol.rgb * 0.5, mix(vCol.rgb, vec3(1.0), 0.6), top);
          col = mix(col, vec3(1.0, 0.98, 0.9), ends * 0.8);
          col *= 1.0 + 0.35 * uNight;
          gl_FragColor = vec4(fogged(col, vDist), 1.0);
        }`,
    }),
  );
  subMesh.renderOrder = -4.2;
  subMesh.frustumCulled = false;
  group.add(subMesh);

  const byId = new Map(lines.map((l) => [l.id, { l, c: new THREE.Color(l.color) }]));
  /** 열차를 놓고, 고르기·따라가기에 쓸 열차별 가운데 칸 위치를 돌려준다 */
  function update(trains: TrainPos[]): TrainSpot[] {
    let n = 0;
    let m = 0;
    const spots: TrainSpot[] = [];
    for (const t of trains) {
      const { l, c } = byId.get(t.line)!;
      const len = l.cum[l.cum.length - 1];
      const back = t.dir ? 1 : -1; // 뒤 칸이 놓이는 방향
      const mid = Math.floor(l.cars / 2);
      for (let k = 0; k < l.cars; k++) {
        const s = t.s + back * (k * CAR_GAP + CAR_GAP / 2);
        if (s < 0 || s > len) continue;
        const seg = pointAt(l.p, l.cum, s, tmp);
        const yaw = headingAt(l.p, seg);
        const off = t.dir ? -2.3 : 2.3; // 방향별 선로
        const x = tmp[0] - Math.sin(yaw) * off;
        const z = tmp[2] + Math.cos(yaw) * off;
        const under = tmp[1] < -1;
        if (k === mid || (k === 0 && l.cars === 1)) spots.push({ key: t.key, line: t.line, dir: t.dir, x, y: under ? UNDER_Y : tmp[1], z, under });
        if (under && m < MAX_CARS) {
          sub.arr.aInst.set([x, 0, z, yaw], m * 4);
          sub.arr.aCol.set([c.r, c.g, c.b, 1], m * 4);
          m++;
        } else if (!under && n < MAX_CARS) {
          arr.aInst.set([x, tmp[1], z, yaw], n * 4);
          arr.aCol.set([c.r, c.g, c.b, 0], n * 4);
          n++;
        }
      }
    }
    geo.instanceCount = n;
    sub.geo.instanceCount = m;
    attr.aInst.needsUpdate = true;
    attr.aCol.needsUpdate = true;
    sub.attr.aInst.needsUpdate = true;
    sub.attr.aCol.needsUpdate = true;
    return spots;
  }
  /** 지하 선·지하 열차만 감추거나 보인다(지상 선로는 그대로 둔다) */
  function setUnderVisible(on: boolean) {
    glowMesh.visible = on;
    subMesh.visible = on;
    trainMesh.visible = on;
  }
  return { group, update, setUnderVisible };
}
