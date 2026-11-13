// 역 출구의 바닥 링과 바닥 글씨. 핀 대신 땅에 그린 빛과 글자로 위치를 알린다.
import * as THREE from 'three';
import type { Exit } from '../sim/walkers.ts';
import { material } from './env.ts';
import { instanced } from './util.ts';

export function makeRings(exits: Exit[]) {
  const stations = [...new Set(exits.map((e) => e.st))];
  const base = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const { geo, arr, attr } = instanced(base, exits.length, { aInst: 4 });
  exits.forEach((e, i) => arr.aInst.set([e.x, e.z, (i * 0.37) % 1, 0], i * 4));
  geo.instanceCount = exits.length;
  const mesh = new THREE.Mesh(
    geo,
    material({
      transparent: true,
      depthWrite: false,
      offset: 5,
      vertex: /* glsl */ `
        attribute vec4 aInst;      // x, z, 씨앗, 번쩍임
        varying vec2 vP; varying vec2 vSeed; varying float vDist;
        void main() {
          vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          float size = 24.0 * zoomScale(-cv.z, 24.0, 20.0, 1.0, 3.2) * (1.0 + aInst.w * 0.35);
          vec3 w = vec3(aInst.x + position.x * size, 0.45, aInst.y + position.z * size);
          vP = uv * 2.0 - 1.0; vSeed = aInst.zw;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        varying vec2 vP; varying vec2 vSeed; varying float vDist;
        void main() {
          float r = length(vP);
          float t = fract(uTime * 0.32 + vSeed.x);
          float wave = smoothstep(0.09, 0.0, abs(r - t * 0.92)) * (1.0 - t);
          float t2 = fract(uTime * 0.32 + vSeed.x + 0.5);
          wave += smoothstep(0.07, 0.0, abs(r - t2 * 0.92)) * (1.0 - t2) * 0.6;
          float dot = smoothstep(0.2, 0.1, r);
          float a = (wave * 0.75 + dot * 0.55 + vSeed.y * smoothstep(1.0, 0.2, r) * 0.6) * step(r, 1.0);
          vec3 col = mix(vec3(0.10, 0.62, 0.62), vec3(0.62, 1.0, 0.95), uNight) + vec3(vSeed.y * 0.4);
          gl_FragColor = vec4(col, a * (0.7 + 0.3 * uNight));
        }`,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -3;
  const flash = new Map(stations.map((s) => [s, 0]));
  return {
    mesh,
    /** 열차가 도착해 사람들이 나올 때 그 역의 링을 번쩍인다 */
    flash(station: string) {
      if (flash.has(station)) flash.set(station, 1);
    },
    update(dt: number) {
      for (const [s, v] of flash) flash.set(s, Math.max(0, v - dt * 0.7));
      exits.forEach((e, i) => (arr.aInst[i * 4 + 3] = flash.get(e.st)!));
      attr.aInst.needsUpdate = true;
    },
  };
}

export interface GroundLabel {
  text: string;
  x: number;
  z: number;
  /** 글자 높이(m) */
  size: number;
  /** 글줄 방향(라디안). 0이면 동쪽으로 읽는다 */
  turn?: number;
}

/** 바닥에 눕힌 글씨. 글자들을 캔버스 한 장에 모아 그린다. */
export function makeGroundLabels(labels: GroundLabel[]): THREE.Mesh {
  const ROW = 72;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `700 52px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let cx = 4;
  let cy = 0;
  labels.forEach((l, i) => {
    const text = l.text.split('').join(' ');
    const w = Math.ceil(ctx.measureText(text).width) + 8;
    if (cx + w > canvas.width) (cx = 4), (cy += ROW);
    ctx.fillText(text, cx + 4, cy + ROW / 2);
    const hw = (l.size * w) / ROW / 2;
    const hh = l.size / 2;
    const c = Math.cos(l.turn ?? 0);
    const s = Math.sin(l.turn ?? 0);
    // 네 모서리: 글줄 방향이 +x, 글자 위쪽이 북쪽(-z)
    for (const [dx, dz, u, v] of [[-hw, hh, 0, 1], [hw, hh, 1, 1], [hw, -hh, 1, 0], [-hw, -hh, 0, 0]] as const) {
      pos.push(l.x + dx * c - dz * s, 0.4, l.z + dx * s + dz * c);
      uv.push((cx + u * w) / canvas.width, (cy + v * ROW) / canvas.height);
    }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    cx += w + 8;
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.anisotropy = 8;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(
    g,
    material({
      transparent: true,
      depthWrite: false,
      offset: 6,
      doubleSide: true,
      uniforms: { uMap: { value: tex } },
      vertex: /* glsl */ `varying vec2 vUv; varying float vDist;
        void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragment: /* glsl */ `uniform sampler2D uMap; varying vec2 vUv; varying float vDist;
        void main() {
          float a = texture2D(uMap, vUv).a;
          vec3 col = mix(vec3(0.30, 0.36, 0.44), vec3(0.80, 0.87, 1.0), uNight);
          gl_FragColor = vec4(col, a * mix(0.5, 0.62, uNight));
        }`,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  return mesh;
}
