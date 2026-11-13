// 시각 → 해의 위치와 사람·차가 몰리는 정도.
import { ORIGIN } from '../geo.ts';

const RAD = Math.PI / 180;
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** 해의 고도와 방위(도). 방위는 북 0, 동 90. */
export function sunAngles(tod: number, doy: number): { elev: number; azim: number } {
  const decl = -23.44 * Math.cos((2 * Math.PI * (doy + 10)) / 365) * RAD;
  const b = (2 * Math.PI * (doy - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b); // 균시차(분)
  const solarHours = tod / 3600 - (135 - ORIGIN.lon) / 15 + eot / 60; // 표준 자오선 135도와의 차이
  const h = (solarHours - 12) * 15 * RAD;
  const lat = ORIGIN.lat * RAD;
  const sinE = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(h);
  const elev = Math.asin(sinE);
  const azim = Math.atan2(-Math.sin(h) * Math.cos(decl), Math.cos(lat) * Math.sin(decl) - Math.sin(lat) * Math.cos(decl) * Math.cos(h));
  return { elev: elev / RAD, azim: ((azim / RAD) + 360) % 360 };
}

/** 낮 1 ~ 밤 0. 해가 지평선 ±6도를 지나는 동안 부드럽게 바뀐다. */
export const daylight = (elev: number) => smooth(-6, 6, elev);

/** 해가 지평선 근처일 때만 솟는 노을 값 */
export const duskiness = (elev: number) => clamp01(1 - Math.abs(elev) / 9);

const bump = (tod: number, centerH: number, widthH: number) => {
  let d = Math.abs(tod / 3600 - centerH);
  if (d > 12) d = 24 - d;
  return Math.exp(-0.5 * (d / widthH) ** 2);
};

/** 출퇴근 봉우리 0~1 */
export const commute = (tod: number) => Math.min(1, bump(tod, 8.3, 0.9) + bump(tod, 18.6, 1.1));

/** 저녁~심야 봉우리 0~1. 21시 반에 가장 높고 자정 넘어 서서히 준다. */
export const nightlife = (tod: number) => {
  const h = tod / 3600;
  return h < 12 ? bump(tod, 21.5, 2.4) : Math.max(bump(tod, 21.5, 1.9), h > 21.5 ? bump(tod, 21.5, 2.4) : 0);
};

/** 점심·오후 나들이 봉우리 0~1 */
export const daytime = (tod: number) => Math.min(1, bump(tod, 12.6, 1.0) * 0.8 + bump(tod, 15.5, 2.2));

/** 열차 운행 시간(05:30 ~ 다음 날 00:40)인가 */
export const inService = (tod: number) => tod >= 5.5 * 3600 || tod < 40 * 60;
