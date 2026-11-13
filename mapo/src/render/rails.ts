// 노선과 열차. 지하 구간은 바닥에 비치는 노선색 빛 띠로, 지상 구간(당산철교)은 띄운 선로와 교각으로 그린다.
// 지하 열차는 그 띠 위를 움직이는 밝은 막대, 지상 열차는 입체 차량이다.
import * as THREE from 'three';
import type { Line } from '../data/board.ts';
import { headingAt, pointAt } from '../poly.ts';
import type { TrainPos } from '../sim/trains.ts';
import { material, pal } from './env.ts';
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
        for (let k = 1; k < seg.length; k += 3) seg[k] = 0.3;
        addRibbon(glow, seg, 8, info);
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
      transparent: true,
      depthWrite: false,
      offset: 4,
      doubleSide: true,
      fragment: /* glsl */ `
        varying vec2 vUV; varying vec4 vInfo; varying float vDist;
        void main() {
          float across = 1.0 - vUV.x * vUV.x;
          float core = smoothstep(0.55, 1.0, across);
          float flow = 0.82 + 0.18 * sin(vUV.y * 0.09 - uTime * 2.0);
          vec3 col = vInfo.rgb * (0.95 + 0.45 * uNight) * flow + vec3(0.22) * core * uNight;
          float a = across * (0.40 + 0.12 * uNight) + core * 0.2;
          gl_FragColor = vec4(fogged(col, vDist), a);
        }`,
    }),
  );
  glowMesh.renderOrder = -4;
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
        attribute vec4 aInst; attribute vec4 aCol;   // aCol.a = 1 이면 지하(바닥의 밝은 막대)
        varying vec3 vN; varying vec3 vO; varying vec4 vCol; varying float vDist;
        void main() {
          vec3 c = aInst.xyz;
          float under = aCol.a;
          vec4 cv = viewMatrix * vec4(c.x, max(c.y, 0.0), c.z, 1.0);
          float s = zoomScale(-cv.z, 3.2, 5.0, 1.5, 4.5);
          vec3 p = position;
          p.yz *= s;
          p.y = mix(p.y, 0.5 + p.y * 0.04, under);          // 지하: 바닥에 납작하게
          float cy = mix(c.y + 0.9, 0.0, under);
          float cs = cos(aInst.w), sn = sin(aInst.w);
          vec3 w = vec3(c.x + p.x * cs - p.z * sn, cy + p.y, c.z + p.x * sn + p.z * cs);
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
          // 지하 열차는 스스로 빛나는 막대
          vec3 bar = mix(vCol.rgb, vec3(1.0), 0.45) * (1.05 + 0.5 * uNight);
          col = mix(col, bar, vCol.a);
          gl_FragColor = vec4(fogged(col, vDist), 1.0);
        }`,
    }),
  );
  trainMesh.frustumCulled = false;
  group.add(trainMesh);

  const byId = new Map(lines.map((l) => [l.id, { l, c: new THREE.Color(l.color) }]));
  function update(trains: TrainPos[]) {
    let n = 0;
    for (const t of trains) {
      const { l, c } = byId.get(t.line)!;
      const len = l.cum[l.cum.length - 1];
      const back = t.dir ? 1 : -1; // 뒤 칸이 놓이는 방향
      for (let k = 0; k < l.cars && n < MAX_CARS; k++) {
        const s = t.s + back * (k * CAR_GAP + CAR_GAP / 2);
        if (s < 0 || s > len) continue;
        const seg = pointAt(l.p, l.cum, s, tmp);
        const yaw = headingAt(l.p, seg);
        const off = t.dir ? -2.3 : 2.3; // 방향별 선로
        arr.aInst.set([tmp[0] - Math.sin(yaw) * off, tmp[1], tmp[2] + Math.cos(yaw) * off, yaw], n * 4);
        arr.aCol.set([c.r, c.g, c.b, tmp[1] < -1 ? 1 : 0], n * 4);
        n++;
      }
    }
    geo.instanceCount = n;
    attr.aInst.needsUpdate = true;
    attr.aCol.needsUpdate = true;
  }
  return { group, update };
}
