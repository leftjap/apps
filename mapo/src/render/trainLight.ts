// 지하 열차를 땅 위 빛으로 그리는 규칙. 빛은 칸마다 나뉜 띠(칸 사이에 틈)이고 머리 칸이 가장 밝다.
// 열차가 역에 서 있는 동안 승강장 길이만큼 빛이 고이고, 서는 순간(출구에서 사람이 나오는 때) 그 역 출구 지붕이 잠깐 밝아진다.
import { DWELL } from '../sim/trains.ts';

/** 칸 사이 간격(칸 길이 19.5m + 연결부) */
export const CAR_PITCH = 20;
/** 칸 사이 틈: 가까이서는 GAP_M 미터, 멀리서도 화면에서 GAP_PX 픽셀(칸 간격의 GAP_MAX 까지) */
export const GAP_M = 1.5;
export const GAP_PX = 3;
export const GAP_MAX = 0.4;

export interface CarSpan {
  /** 칸 가운데의 거리 값(m) */
  s: number;
  /** 앞에서 몇째 칸(0 이 머리) */
  k: number;
  /** 밝기(머리 1, 꼬리 0.6) */
  light: number;
}

/** 열차 가운데가 s 에 있는 cars 칸. dir 0 은 거리 값이 커지는 쪽으로 달린다 */
export function carSpans(cars: number, s: number, dir: 0 | 1): CarSpan[] {
  const ahead = dir ? -1 : 1;
  return Array.from({ length: cars }, (_, k) => ({ s: s + ahead * ((cars - 1) / 2 - k) * CAR_PITCH, k, light: 1 - (0.4 * k) / Math.max(1, cars - 1) }));
}

/** 한 칸의 빛 길이(m). mPerPx 는 그 자리에서 한 픽셀이 몇 m 인지 */
export const lightLen = (mPerPx: number) => CAR_PITCH - Math.min(GAP_MAX * CAR_PITCH, Math.max(GAP_M, GAP_PX * mPerPx));

/** 역에 고이는 빛의 세기(0~1). at 은 열차가 선 뒤 지난 초(달리는 중이면 음수). 3초에 걸쳐 차오르고 떠나기 4초 전부터 사그라든다 */
export function poolLevel(at: number): number {
  if (at < 0 || at >= DWELL) return 0;
  return Math.min(1, at / 3, (DWELL - at) / 4);
}

/** 출구 지붕 밝기(0~1). age 는 열차가 선 뒤 지난 초. 0.15초 만에 켜지고 1.6초 안에 꺼진다 */
export function exitFlash(age: number): number {
  if (age < 0 || age >= 1.6) return 0;
  if (age < 0.15) return age / 0.15;
  const k = 1 - (age - 0.15) / 1.45;
  return k * k;
}

/** 터널 입구(portals, 노선 거리 값)에서 0, 입구에서 60m 넘게 들어가면 1. 입구에서는 열차 모형이 그대로 보이므로 빛을 천천히 켠다 */
export function portalRamp(s: number, portals: number[], ramp = 60): number {
  let d = Infinity;
  for (const p of portals) d = Math.min(d, Math.abs(s - p));
  if (d >= ramp) return 1;
  const t = d / ramp;
  return t * t * (3 - 2 * t);
}
