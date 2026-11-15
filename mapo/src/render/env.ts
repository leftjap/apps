// 모든 재질이 함께 쓰는 빛·색·시간 값. 시각에 따라 낮·노을·밤 사이를 섞는다.
import * as THREE from 'three';
import type { Now } from '../sim/clock.ts';
import { commute, daylight, duskiness, nightlife, sunAngles } from '../sim/curves.ts';

// 색은 화면에 보일 값 그대로 다룬다. Color 를 하나라도 만들기 전에 꺼야 한다.
THREE.ColorManagement.enabled = false;

type Key3 = [string, string, string]; // [낮, 노을, 밤]

const KEYS: Record<string, Key3> = {
  bgTop: ['#bfdcf0', '#5c6aa6', '#2e3e6e'],
  bgBottom: ['#f4ecdc', '#f7ab7c', '#716f96'],
  fog: ['#eee7da', '#e9a987', '#5a6186'],
  sun: ['#fff0d8', '#ffb07a', '#b8c8f0'],
  ambSky: ['#c3cfdd', '#a99cc0', '#7f95c4'],
  ambGround: ['#a39a8c', '#b08f7e', '#cfb29a'],
  land: ['#ddd6c8', '#cfb7a6', '#999bab'],
  water: ['#8ec3dd', '#7d8fc2', '#4a6592'],
  green: ['#b4d397', '#a9b889', '#5f7868'],
  skirt: ['#b9ad9a', '#8d7468', '#3d4255'],
  bld: ['#f6f3ec', '#ecd6c6', '#b8b6ba'],
  roof: ['#fdfbf7', '#f5dfce', '#acb1c6'],
  roadMajor: ['#bcb7ad', '#b09d93', '#888a98'],
  roadMinor: ['#cbc5b8', '#bfa99b', '#9294a0'],
  walk: ['#f1e7d0', '#e2c8ae', '#b1a69c'],
};
/** [낮, 노을, 밤] 숫자 값 */
const NUMS: Record<string, [number, number, number]> = {
  sunPower: [0.6, 0.55, 0.25],
  ambSkyPower: [0.8, 0.8, 0.95],
  ambGroundPower: [0.62, 0.68, 1.1],
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
  /** 시각(0~24시): 가게마다 불 끄는 시각 */
  uHour: { value: 12 },
  /** 깊이 1m 지점에서 1m가 차지하는 화면 픽셀 수 */
  uProjK: { value: 1000 },
  /** 비(0~1): 길이 젖고 빗줄기가 내린다 */
  uRain: { value: 0 },
  /** 안개(0~1): 먼 곳이 더 흐려진다 */
  uHaze: { value: 0 },
  /** 지하 들여다보기: (x, z, 반지름, 세기). 고른 역·열차 둘레의 땅과 건물을 걷어 내 지하가 보이게 한다 */
  uFocus: { value: new THREE.Vector4(0, 0, 1, 0) },
};

/** 날씨 세기. 전환이 부드럽도록 updateEnv 가 목표값 쪽으로 천천히 옮긴다 */
export const weather = { rain: 0, fog: 0, snow: 0, dust: 0, wantRain: 0, wantFog: 0, wantSnow: 0, wantDust: 0 };
const grey = new THREE.Color('#9aa3ad');
const dustC = new THREE.Color();
const greyNight = new THREE.Color('#4a5062');

const mix3 = (out: THREE.Color, k: THREE.Color[], day: number, dusk: number) => out.copy(k[2]).lerp(k[0], day).lerp(k[1], dusk * 0.85);
const mixN = (k: [number, number, number], day: number, dusk: number) => {
  const v = k[2] + (k[0] - k[2]) * day;
  return v + (k[1] - v) * dusk * 0.85;
};

const moon = new THREE.Vector3(-0.35, 0.72, 0.6).normalize();
const sunV = new THREE.Vector3();

export function updateEnv(now: Now, time: number, sky: HTMLElement, dt = 0): void {
  const { elev, azim } = sunAngles(now.tod, now.doy);
  const day = daylight(elev);
  const dusk = duskiness(elev);
  for (const k in pal) mix3(pal[k], parsed[k], day, dusk);
  const k = 1 - Math.exp(-dt * 0.8);
  weather.rain += (weather.wantRain - weather.rain) * k;
  weather.fog += (weather.wantFog - weather.fog) * k;
  weather.snow += (weather.wantSnow - weather.snow) * k;
  weather.dust += (weather.wantDust - weather.dust) * k;
  // 흐린 날: 하늘·안개 색을 잿빛 쪽으로, 햇빛을 약하게
  const overcast = Math.max(weather.rain * 0.8, weather.fog * 0.7, weather.snow * 0.6);
  const g = grey.clone().lerp(greyNight, 1 - day);
  for (const key of ['bgTop', 'bgBottom', 'fog'] as const) pal[key].lerp(g, overcast * (key === 'fog' ? 1 : 0.75));
  // 미세먼지: 하늘·안개 색의 채도만 누런 잿빛 쪽으로 낮춘다(밝기는 그대로)
  if (weather.dust > 0.001)
    for (const key of ['bgTop', 'bgBottom', 'fog'] as const) {
      const c = pal[key];
      const l = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
      c.lerp(dustC.setRGB(l * 1.06, l, l * 0.86), weather.dust * 0.4);
    }
  env.uRain.value = weather.rain;
  env.uHaze.value = Math.max(weather.fog, weather.dust * 0.12);

  // 빛 방향: 해가 떠 있으면 해, 지면 달(고정 방향)
  const el = (Math.max(elev, 9) * Math.PI) / 180;
  const az = (azim * Math.PI) / 180;
  sunV.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  env.uSunDir.value.copy(moon).lerp(sunV, day).normalize();
  env.uSunCol.value.copy(pal.sun).multiplyScalar(mixN(NUMS.sunPower, day, dusk) * (1 - 0.55 * overcast));
  env.uSkyCol.value.copy(pal.ambSky).multiplyScalar(mixN(NUMS.ambSkyPower, day, dusk));
  env.uGroundCol.value.copy(pal.ambGround).multiplyScalar(mixN(NUMS.ambGroundPower, day, dusk));
  env.uNight.value = 1 - day;
  env.uDusk.value = dusk;
  env.uLit.value = (1 - day) * Math.min(0.42, 0.06 + 0.26 * nightlife(now.tod) + 0.14 * commute(now.tod));
  env.uTime.value = time;
  env.uHour.value = now.tod / 3600;
  sky.style.background = `linear-gradient(#${pal.bgTop.getHexString()}, #${pal.bgBottom.getHexString()})`;
}

/** 지하 층의 높이(m). 지하 들여다보기에서 터널 단면·구내·지하 열차 모형을 이 깊이에 그려 기울여 볼 때 지상과 어긋나 보이게 한다 */
export const UNDER_Y = -8;

/** 모든 셰이더 앞에 붙이는 공통 조각 */
export const GLSL = /* glsl */ `
uniform vec3 uSunDir, uSunCol, uSkyCol, uGroundCol, uFogCol;
uniform float uFogK, uNight, uDusk, uLit, uTime, uHour, uProjK, uRain, uHaze;
uniform vec4 uFocus;
/** 4×4 규칙 무늬 문턱값(0~1). 점을 성기게 버려 반투명처럼 보이게 할 때 잡음 대신 쓴다 */
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float dither(vec2 p) { return bayer2(0.5 * p) * 0.25 + bayer2(p); }
/** 지하 들여다보기 원 안이면 세기(0~1), 가장자리 20%에서 부드럽게 줄어든다 */
float focusIn(vec2 p) {
  return uFocus.w * (1.0 - smoothstep(uFocus.z * 0.8, uFocus.z, length(p - uFocus.xy)));
}
vec3 lit(vec3 albedo, vec3 n) {
  vec3 amb = mix(uGroundCol, uSkyCol, n.y * 0.5 + 0.5);
  return albedo * (amb + uSunCol * max(dot(n, uSunDir), 0.0));
}
vec3 fogged(vec3 c, float dist) {
  float f = dist * uFogK * (1.0 + 2.6 * uHaze + 0.6 * uRain);
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
  /** 지하 층: 깊이를 보지 않고 땅·도로 위에 비쳐 보이게 그린다. 불투명 목록에 두어 지상 물체가 나중에 덮게 한다(renderOrder 로 순서를 정한다) */
  under?: boolean;
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
  if (opts.under) {
    m.depthTest = false;
    m.depthWrite = false;
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.SrcAlphaFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
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
