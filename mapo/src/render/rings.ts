// 역 출구의 바닥 링과 바닥 글씨. 핀 대신 땅에 그린 빛과 글자로 위치를 알린다.
import * as THREE from 'three';
import type { Exit } from '../data/board.ts';
import { material } from './env.ts';
import { instanced } from './util.ts';

/** 링이 한 번 퍼지고 사라지는 시간(초) */
const RING_SECONDS = 4;

/** 출구 바닥 링. 평소에는 그리지 않고(출구는 3D 출구 모형으로 보인다), 역을 고르면 그 역 출구들에서 몇 초 동안만 퍼진다 */
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
          float a = (wave * 0.75 + dot * 0.55) * step(r, 1.0) * smoothstep(0.0, 0.25, vSeed.y);
          vec3 col = mix(vec3(0.10, 0.62, 0.62), vec3(0.62, 1.0, 0.95), uNight);
          gl_FragColor = vec4(col, a * (0.7 + 0.3 * uNight));
        }`,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -3;
  mesh.visible = false;
  const flash = new Map(stations.map((s) => [s, 0]));
  return {
    mesh,
    /** 그 역 출구들에서 링을 몇 초 동안 퍼뜨린다(역을 골랐을 때) */
    flash(station: string) {
      if (flash.has(station)) flash.set(station, 1);
    },
    update(dt: number) {
      let any = false;
      for (const [s, v] of flash) {
        flash.set(s, Math.max(0, v - dt / RING_SECONDS));
        any ||= v > 0;
      }
      mesh.visible = any;
      if (!any) return;
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
  /**
   * 화면에서 글자 높이가 이 범위(px) 안일 때만 보인다. 동 이름은 크게 써서 넓게 볼 때, 거리 이름은 작게 써서 가까이 볼 때 읽히고,
   * 둘이 한꺼번에 보이지 않는다. 없으면 늘 보인다
   */
  fade?: [number, number];
}

/** 바닥에 눕힌 글씨. 글자들을 캔버스 한 장에 모아 그린다. overlay 면 건물에 가려지지 않는 워터마크로 그린다(동네 이름) */
export function makeGroundLabels(labels: GroundLabel[], overlay = false): THREE.Mesh {
  const ROW = 72;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `700 52px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  // 지명은 건물·나무 위에 겹쳐 보이므로 글자 둘레에 밝은 테두리를 두른다. 테두리는 빨강, 글자는 흰색으로 칠해 셰이더가 초록 값으로 둘을 가른다
  const HALO = overlay ? 12 : 0;
  ctx.strokeStyle = '#f00';
  ctx.lineWidth = HALO;
  ctx.lineJoin = 'round';
  const pos: number[] = [];
  const uv: number[] = [];
  const mid: number[] = [];
  const fade: number[] = [];
  const idx: number[] = [];
  let cx = 4;
  let cy = 0;
  labels.forEach((l, i) => {
    const text = l.text.split('').join(' ');
    const w = Math.ceil(ctx.measureText(text).width) + 8 + HALO;
    if (cx + w > canvas.width) (cx = 4), (cy += ROW);
    if (HALO) ctx.strokeText(text, cx + 4 + HALO / 2, cy + ROW / 2);
    ctx.fillText(text, cx + 4 + HALO / 2, cy + ROW / 2);
    const hw = (l.size * w) / ROW / 2;
    const hh = l.size / 2;
    const c = Math.cos(l.turn ?? 0);
    const s = Math.sin(l.turn ?? 0);
    // 네 모서리: 글줄 방향이 +x, 글자 위쪽이 북쪽(-z)
    for (const [dx, dz, u, v] of [[-hw, hh, 0, 1], [hw, hh, 1, 1], [hw, -hh, 1, 0], [-hw, -hh, 0, 0]] as const) {
      pos.push(l.x + dx * c - dz * s, 0.4, l.z + dx * s + dz * c);
      uv.push((cx + u * w) / canvas.width, (cy + v * ROW) / canvas.height);
      mid.push(l.x, l.z, l.size);
      fade.push(...(l.fade ?? [0, 1e6]));
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
  g.setAttribute('aMid', new THREE.Float32BufferAttribute(mid, 3));
  g.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 2));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(
    g,
    material({
      transparent: true,
      depthWrite: false,
      offset: 6,
      doubleSide: true,
      uniforms: { uMap: { value: tex }, uOverlay: { value: overlay ? 1 : 0 } },
      vertex: /* glsl */ `attribute vec3 aMid; attribute vec2 aFade; varying vec2 vUv; varying float vShow;
        void main() {
          vUv = uv;
          // 글 가운데 자리의 깊이로 화면 글자 높이(px)를 셈해, 글 한 줄이 통째로 나타나고 사라지게 한다
          vec4 cv = viewMatrix * vec4(aMid.x, 0.0, aMid.y, 1.0);
          float px = aMid.z * uProjK / max(1.0, -cv.z);
          vShow = smoothstep(aFade.x * 0.8, aFade.x, px) * (1.0 - smoothstep(aFade.y, aFade.y * 1.25, px));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragment: /* glsl */ `uniform sampler2D uMap; uniform float uOverlay; varying vec2 vUv; varying float vShow;
        void main() {
          vec4 t = texture2D(uMap, vUv);
          float a = t.a * vShow;
          if (a < 0.003) discard;
          vec3 ink = mix(mix(vec3(0.30, 0.36, 0.44), vec3(0.20, 0.25, 0.33), uOverlay), vec3(0.80, 0.87, 1.0), uNight);
          vec3 halo = mix(vec3(0.98, 0.97, 0.94), vec3(0.05, 0.07, 0.11), uNight);
          // t.g: 글자 1, 테두리만 0
          float k = mix(mix(0.5, 0.62, uNight), mix(0.45, 0.85, t.g), uOverlay);
          gl_FragColor = vec4(mix(halo, ink, t.g), a * k);
        }`,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = overlay ? 8 : -2;
  if (overlay) (mesh.material as THREE.ShaderMaterial).depthTest = false;
  return mesh;
}

/** 고른 대상(고양이·버스·열차) 발밑의 고리. 건물에 가려져도 보이도록 깊이를 보지 않고 맨 나중에 그린다 */
export function makeMarker() {
  const uniforms = { uPos: { value: new THREE.Vector3() }, uCol: { value: new THREE.Color('#ffffff') }, uOn: { value: 0 } };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
    material({
      transparent: true,
      depthWrite: false,
      doubleSide: true,
      uniforms,
      vertex: /* glsl */ `
        uniform vec3 uPos;
        varying vec2 vP;
        void main() {
          vec4 cv = viewMatrix * vec4(uPos, 1.0);
          float r = 30.0 * -cv.z / uProjK;                 // 화면에서 반지름 30px
          vP = position.xz;
          gl_Position = projectionMatrix * viewMatrix * vec4(uPos + vec3(position.x * r, 0.6, position.z * r), 1.0);
        }`,
      fragment: /* glsl */ `
        uniform vec3 uCol; uniform float uOn;
        varying vec2 vP;
        void main() {
          float r = length(vP);
          float ring = smoothstep(0.1, 0.0, abs(r - 0.78));
          float t = fract(uTime * 0.6);
          float wave = smoothstep(0.07, 0.0, abs(r - t)) * (1.0 - t) * 0.6;
          gl_FragColor = vec4(mix(uCol, vec3(1.0), 0.35), (ring * 0.85 + wave) * uOn * step(r, 1.0));
        }`,
    }),
  );
  (mesh.material as THREE.ShaderMaterial).depthTest = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return {
    mesh,
    /** pos 가 null 이면 감춘다 */
    set(pos: { x: number; y: number; z: number } | null, color = '#ffffff') {
      uniforms.uOn.value = pos ? 1 : 0;
      if (pos) uniforms.uPos.value.set(pos.x, pos.y, pos.z);
      uniforms.uCol.value.set(color);
    },
  };
}
