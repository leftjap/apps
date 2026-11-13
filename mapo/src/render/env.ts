// 모든 재질이 함께 쓰는 빛·색·시간 값. 시각에 따라 낮·노을·밤 사이를 섞는다.
import * as THREE from 'three';
import type { Now } from '../sim/clock.ts';
import { commute, daylight, duskiness, nightlife, sunAngles } from '../sim/curves.ts';

// 색은 화면에 보일 값 그대로 다룬다. Color 를 하나라도 만들기 전에 꺼야 한다.
THREE.ColorManagement.enabled = false;

type Key3 = [string, string, string]; // [낮, 노을, 밤]

const KEYS: Record<string, Key3> = {
  bgTop: ['#bfdcf0', '#5c6aa6', '#060a15'],
  bgBottom: ['#f4ecdc', '#f7ab7c', '#161d33'],
  fog: ['#eee7da', '#e9a987', '#121829'],
  sun: ['#fff0d8', '#ffb07a', '#7f93c8'],
  ambSky: ['#c3cfdd', '#a99cc0', '#aab4d6'],
  ambGround: ['#a39a8c', '#b08f7e', '#8f96b3'],
  land: ['#ddd6c8', '#cfb7a6', '#1c2130'],
  water: ['#8ec3dd', '#7d8fc2', '#0a1222'],
  green: ['#b4d397', '#a9b889', '#15241d'],
  skirt: ['#b9ad9a', '#8d7468', '#0d1018'],
  bld: ['#f6f3ec', '#ecd6c6', '#3a4257'],
  roof: ['#fdfbf7', '#f5dfce', '#465068'],
  roadMajor: ['#bcb7ad', '#b09d93', '#2e3443'],
  roadMinor: ['#cbc5b8', '#bfa99b', '#242938'],
  walk: ['#f1e7d0', '#e2c8ae', '#2b2a33'],
  figure: ['#ffffff', '#fff1e4', '#eef2ff'],
};
/** [낮, 노을, 밤] 숫자 값 */
const NUMS: Record<string, [number, number, number]> = {
  sunPower: [0.6, 0.55, 0.22],
  ambSkyPower: [0.8, 0.72, 0.8],
  ambGroundPower: [0.62, 0.6, 0.7],
};

const parsed = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, v.map((h) => new THREE.Color(h))]));

/** 지금 시각의 색. 재질들은 이 Color 객체를 그대로 물고 있다가 매 프레임 바뀐 값을 쓴다. */
export const pal = Object.fromEntries(Object.keys(KEYS).map((k) => [k, new THREE.Color()])) as Record<keyof typeof KEYS, THREE.Color>;

export const env = {
  uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.5).normalize() },
  uSunCol: { value: new THREE.Color() },
  uSkyCol: { value: new THREE.Color() },
  uGroundCol: { value: new THREE.Color() },
  uFogCol: { value: pal.fog },
  uFogK: { value: 1 / 15000 },
  uNight: { value: 0 },
  uDusk: { value: 0 },
  /** 창문에 불이 켜진 비율 */
  uLit: { value: 0 },
  uTime: { value: 0 },
  /** 깊이 1m 지점에서 1m가 차지하는 화면 픽셀 수 */
  uProjK: { value: 1000 },
};

const mix3 = (out: THREE.Color, k: THREE.Color[], day: number, dusk: number) => out.copy(k[2]).lerp(k[0], day).lerp(k[1], dusk * 0.85);
const mixN = (k: [number, number, number], day: number, dusk: number) => {
  const v = k[2] + (k[0] - k[2]) * day;
  return v + (k[1] - v) * dusk * 0.85;
};

const moon = new THREE.Vector3(-0.35, 0.72, 0.6).normalize();
const sunV = new THREE.Vector3();

export function updateEnv(now: Now, time: number, sky: HTMLElement): void {
  const { elev, azim } = sunAngles(now.tod, now.doy);
  const day = daylight(elev);
  const dusk = duskiness(elev);
  for (const k in pal) mix3(pal[k], parsed[k], day, dusk);

  // 빛 방향: 해가 떠 있으면 해, 지면 달(고정 방향)
  const el = (Math.max(elev, 9) * Math.PI) / 180;
  const az = (azim * Math.PI) / 180;
  sunV.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  env.uSunDir.value.copy(moon).lerp(sunV, day).normalize();
  env.uSunCol.value.copy(pal.sun).multiplyScalar(mixN(NUMS.sunPower, day, dusk));
  env.uSkyCol.value.copy(pal.ambSky).multiplyScalar(mixN(NUMS.ambSkyPower, day, dusk));
  env.uGroundCol.value.copy(pal.ambGround).multiplyScalar(mixN(NUMS.ambGroundPower, day, dusk));
  env.uNight.value = 1 - day;
  env.uDusk.value = dusk;
  env.uLit.value = (1 - day) * Math.min(0.42, 0.06 + 0.26 * nightlife(now.tod) + 0.14 * commute(now.tod));
  env.uTime.value = time;
  sky.style.background = `linear-gradient(#${pal.bgTop.getHexString()}, #${pal.bgBottom.getHexString()})`;
}

/** 모든 셰이더 앞에 붙이는 공통 조각 */
export const GLSL = /* glsl */ `
uniform vec3 uSunDir, uSunCol, uSkyCol, uGroundCol, uFogCol;
uniform float uFogK, uNight, uDusk, uLit, uTime, uProjK;
vec3 lit(vec3 albedo, vec3 n) {
  vec3 amb = mix(uGroundCol, uSkyCol, n.y * 0.5 + 0.5);
  return albedo * (amb + uSunCol * max(dot(n, uSunDir), 0.0));
}
vec3 fogged(vec3 c, float dist) {
  float f = dist * uFogK;
  return mix(c, uFogCol, 1.0 - exp(-f * f));
}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
/** 카메라에서 멀수록 키우는 배율: 화면에서 px 픽셀은 되도록, lo~hi 사이로 */
float zoomScale(float depth, float baseSize, float px, float lo, float hi) {
  return clamp(px * depth / (uProjK * baseSize), lo, hi);
}
`;

/** env 값과 추가 값을 합친 ShaderMaterial */
export function material(opts: {
  vertex: string;
  fragment: string;
  uniforms?: Record<string, THREE.IUniform>;
  transparent?: boolean;
  additive?: boolean;
  depthWrite?: boolean;
  doubleSide?: boolean;
  offset?: number;
}): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...env, ...opts.uniforms },
    vertexShader: GLSL + opts.vertex,
    fragmentShader: GLSL + opts.fragment,
    transparent: opts.transparent ?? false,
    depthWrite: opts.depthWrite ?? true,
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (opts.additive) {
    // 색만 더하고 알파는 건드리지 않는다. 캔버스가 투명 배경이라, 알파까지 더하면 판 밖으로 나간 빛이 검은 조각으로 보인다
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneFactor;
    m.blendSrcAlpha = THREE.ZeroFactor;
    m.blendDstAlpha = THREE.OneFactor;
  }
  if (opts.offset) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -opts.offset;
    m.polygonOffsetUnits = -opts.offset * 4;
  }
  return m;
}
