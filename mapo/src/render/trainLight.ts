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

/** 열차가 달리는 선로 한 가닥. 노선 꺾은선의 꼭짓점마다 앞뒤 ROUND m(이웃 구간 절반까지)를 둥글게 이은 곡선을 off m 옆으로 옮긴 것이다.
 *  노선 거리 값 s 를 STEP m 마다 재어 두고(i 번째 점이 s = i·STEP), 그 점까지 선로를 따라 잰 길이(q)를 함께 둔다 */
export interface Track {
  /** 점 좌표 [x,y,z,...] */
  p: Float64Array;
  /** 첫 점에서 그 점까지 선로 길이(m) */
  q: Float64Array;
  /** 노선 전체 길이(m) */
  len: number;
}

/** 꼭짓점을 둥글게 하는 길이(꼭짓점 앞뒤, m). 노선 꼭짓점이 15m 마다 있으므로 이웃 꼭짓점의 곡선과 구간 가운데에서 만난다 */
const ROUND = 7.5;
const STEP = 1;

export function makeTrack(p: ArrayLike<number>, cum: ArrayLike<number>, off: number): Track {
  const n = cum.length;
  const len = cum[n - 1];
  const m = Math.floor(len / STEP) + 2;
  const out = new Float64Array(m * 3);
  const q = new Float64Array(m);
  const at = (s: number, o: number[]) => {
    // s 가 속한 꼭짓점 둘레(둥근 곳)인지 본다
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const v = s - cum[lo] < cum[hi] - s ? lo : hi; // 가까운 꼭짓점
    const r = v > 0 && v < n - 1 ? Math.min(ROUND, (cum[v] - cum[v - 1]) / 2, (cum[v + 1] - cum[v]) / 2) : 0;
    if (r > 0 && Math.abs(s - cum[v]) < r) {
      // 2차 베지에: 꼭짓점 앞 r(A) → 꼭짓점(B) → 꼭짓점 뒤 r(C)
      const t = (s - cum[v] + r) / (2 * r);
      const a = (cum[v] - cum[v - 1] - r) / (cum[v] - cum[v - 1]);
      const c = r / (cum[v + 1] - cum[v]);
      let dx = 0;
      let dz = 0;
      for (let k = 0; k < 3; k++) {
        const A = p[(v - 1) * 3 + k] + (p[v * 3 + k] - p[(v - 1) * 3 + k]) * a;
        const B = p[v * 3 + k];
        const C = B + (p[(v + 1) * 3 + k] - B) * c;
        o[k] = (1 - t) * (1 - t) * A + 2 * (1 - t) * t * B + t * t * C;
        const d = (1 - t) * (B - A) + t * (C - B);
        if (k === 0) dx = d;
        if (k === 2) dz = d;
      }
      o[3] = Math.atan2(dz, dx);
      return;
    }
    const seg = Math.min(lo, n - 2);
    const span = cum[seg + 1] - cum[seg];
    const t = span > 0 ? Math.min(1, Math.max(0, (s - cum[seg]) / span)) : 0;
    for (let k = 0; k < 3; k++) o[k] = p[seg * 3 + k] + (p[seg * 3 + 3 + k] - p[seg * 3 + k]) * t;
    o[3] = Math.atan2(p[seg * 3 + 5] - p[seg * 3 + 2], p[seg * 3 + 3] - p[seg * 3]);
  };
  const o = [0, 0, 0, 0];
  for (let i = 0; i < m; i++) {
    at(Math.min(len, i * STEP), o);
    out[i * 3] = o[0] - Math.sin(o[3]) * off;
    out[i * 3 + 1] = o[1];
    out[i * 3 + 2] = o[2] + Math.cos(o[3]) * off;
    if (i) q[i] = q[i - 1] + Math.hypot(out[i * 3] - out[i * 3 - 3], out[i * 3 + 2] - out[i * 3 - 1]);
  }
  return { p: out, q, len };
}

/** 노선 거리 값 s 에 해당하는 선로 길이 */
export function trackArc(tr: Track, s: number): number {
  const f = Math.min(Math.max(s, 0), tr.len) / STEP;
  const i = Math.min(Math.floor(f), tr.q.length - 2);
  const span = Math.min(tr.len, (i + 1) * STEP) - i * STEP;
  return tr.q[i] + (tr.q[i + 1] - tr.q[i]) * (span > 0 ? (f * STEP - i * STEP) / span : 0);
}

/** 선로 길이 a 의 점을 o[0..2] 에, 그 점의 노선 거리 값을 돌려준다. 선로 끝을 넘으면 끝 조각을 곧게 늘인 자리다(판 가장자리에 걸친 칸도 제 길이로 놓이게) */
function trackPoint(tr: Track, a: number, o: number[]): number {
  const q = tr.q;
  let lo = 0;
  let hi = q.length - 1;
  if (a <= 0) hi = 1;
  else if (a >= q[hi]) lo = hi - 1;
  else
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (q[mid] <= a) lo = mid;
      else hi = mid;
    }
  hi = lo + 1;
  const t = q[hi] > q[lo] ? (a - q[lo]) / (q[hi] - q[lo]) : 0;
  for (let k = 0; k < 3; k++) o[k] = tr.p[lo * 3 + k] + (tr.p[hi * 3 + k] - tr.p[lo * 3 + k]) * t;
  return Math.min(tr.len, Math.max(0, (lo + t) * STEP));
}

export interface CarPose extends CarSpan {
  x: number;
  y: number;
  z: number;
  /** 거리 값이 커지는 쪽을 향한 방향(동쪽 0, 남쪽 π/2) */
  yaw: number;
}

const ea = [0, 0, 0];
const eb = [0, 0, 0];
/** 열차 가운데가 노선 거리 값 s 에 있는 cars 칸의 자리. 칸마다 앞뒤 끝을 선로 위(칸 간격만큼 떨어진 두 점)에 얹고, 몸통은 두 끝을 잇는 곧은 선이다.
 *  이웃 칸은 끝점을 함께 쓰므로 커브에서도 칸 사이가 벌어지거나 겹치지 않는다. 노선 밖으로 나간 칸은 null */
export function carPoses(tr: Track, cars: number, s: number, dir: 0 | 1): (CarPose | null)[] {
  const total = tr.q[tr.q.length - 1];
  return carSpans(cars, trackArc(tr, s), dir).map((c) => {
    if (c.s < 0 || c.s > total) return null;
    const sa = trackPoint(tr, c.s - CAR_PITCH / 2, ea);
    const sb = trackPoint(tr, c.s + CAR_PITCH / 2, eb);
    return { k: c.k, light: c.light, s: (sa + sb) / 2, x: (ea[0] + eb[0]) / 2, y: (ea[1] + eb[1]) / 2, z: (ea[2] + eb[2]) / 2, yaw: Math.atan2(eb[2] - ea[2], eb[0] - ea[0]) };
  });
}
