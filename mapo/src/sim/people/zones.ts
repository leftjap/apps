// 사람 수 모형(재작업 W21에서 옛 walkers.ts 에서 옮김): 구역마다 지금 밖에 나와 걷는 실제 인원과, 구역 밖 명소 둘레의 인원.
// 생성·이동 규칙(index.ts)과 따로 둔다. 구역 범위·밖에 나온 몫·비에 남는 몫은 W13·W16 에서 정한 값 그대로다.
import type { Now } from '../clock.ts';
import { clamp01, commute, daytime, nightlife } from '../curves.ts';
import type { Road } from '../../data/board.ts';
import type { DataProvider } from '../provider.ts';
import { PLACES, placeLevel, placeMask } from '../places.ts';

/** 구역 id → 판 위의 중심과 반지름(m). 실시간 도시데이터 장소의 대략적인 범위. 겹치는 곳은 작은 구역이 먼저다 */
export const ZONES: Record<string, [number, number, number]> = {
  'hongik-stn': [573, -643, 260],
  hapjeong: [-470, 240, 300],
  mangwon: [-1560, 120, 300],
  yeonnam: [300, -1050, 420],
  hongdae: [350, -250, 520],
};
export const ZONE_IDS = Object.keys(ZONES);
/** 칸: 구역들(0~4), 구역 밖 출구·정류장(5), 구역 밖 명소 둘레(6) */
export const OUT_Z = ZONE_IDS.length;
export const PLACE_Z = ZONE_IDS.length + 1;

/** 하루 가운데 밖에 나와 다니는 정도(0~1). 새벽에는 대부분 실내에 있다 */
export const outdoors = (now: Now) => clamp01(0.05 + 0.95 * Math.max(daytime(now.tod), nightlife(now.tod), 0.8 * commute(now.tod)));
/** 구역 인구 가운데 가장 붐비는 시각(outdoors = 1)에 밖에 나와 걷는 사람 비율. 한국인 시간활동 조사(약 1만9천 명, 평일 하루 평균)에서
 *  실외 5.2%·이동 7.3% 였다(한국실내환경학회지, koreascience JAKO201813639173491). 이동 시간의 40% 를 걷기·기다리기로 보면 하루 평균
 *  밖에 있는 몫은 0.052 + 0.4 × 0.073 ≈ 0.081 이고, outdoors 의 하루 평균이 0.60 이므로 가장 붐비는 시각의 몫은 0.081 / 0.60 ≈ 0.135 다.
 *  공원은 대부분 밖에 있다(가정한 값) */
const OUT_SHARE: Record<string, number> = { mangwon: 0.3 };
export const OUT_BASE = 0.135;
/** 비(0~1)가 올 때 밖에 남는 비율: 거리는 우산을 쓰고 다니는 사람이 남지만, 한강공원은 거의 비운다(가정한 값) */
const RAIN_KEEP: Record<string, number> = { mangwon: 0.15 };
const rainKeep = (id: string, rain: number) => 1 - (1 - (RAIN_KEEP[id] ?? 0.6)) * clamp01(rain);

/** 홍대 둘레 명소(늘 붐벼 보이게 바닥을 두는 곳, 지오 지시 2026-11-17 '명소는 늘 붐벼 보이게') */
export const HOT_PLACES = new Set(['club', 'redroad', 'playground', 'samgeori', 'yeontral', 'forest-wau']);
/** 홍대 둘레 명소의 붐빔 바닥(0~1): 새벽·평일에도 이만큼은 붐빈다고 친다 */
export const HOT_FLOOR = 0.4;
/** 바닥 붐빔을 채울 때 명소 넓이(꺾은선 길이 × 2r) 몇 ㎡ 에 한 명을 두는가(바닥 몫 = 넓이 / 80 × (바닥 − 지금 붐빔)) */
const FLOOR_AREA = 80;
/** 명소 p 의 지금 붐빔: 홍대 둘레 명소는 바닥 HOT_FLOOR 아래로 내려가지 않는다 */
export function placeNow(k: number, now: Now): number {
  const p = PLACES[k];
  const v = placeLevel(p, now);
  return HOT_PLACES.has(p.id) ? Math.max(v, HOT_FLOOR) : v;
}
const placeArea = PLACES.map((p) => {
  let L = 0;
  for (let k = 2; k < p.pts.length; k += 2) L += Math.hypot(p.pts[k] - p.pts[k - 2], p.pts[k + 1] - p.pts[k - 1]);
  return L * 2 * p.r + Math.PI * p.r * p.r;
});

/** 구역마다 지금 밖에 나와 걷는 실제 사람 수. 그다음 칸은 구역 밖 출구·정류장 둘레의 사람(구역 인원의 12%),
 *  마지막 칸은 구역 원 밖 명소 둘레의 사람(명소마다 늘어난 인원 × 지금 붐빔 × 밖에 나온 몫)과 홍대 둘레 명소의 바닥 몫 */
export function outside(provider: DataProvider, now: Now, rain = 0): number[] {
  const act = outdoors(now);
  const pop: Record<string, number> = {};
  for (const a of provider.areas(now)) pop[a.id] = (a.pplMin + a.pplMax) / 2;
  const t = ZONE_IDS.map((id) => (pop[id] ?? 0) * (OUT_SHARE[id] ?? OUT_BASE) * act * rainKeep(id, rain));
  t.push(t.reduce((a, b) => a + b, 0) * 0.12);
  let extra = PLACES.reduce((a, p) => a + p.rest * placeLevel(p, now), 0) * OUT_BASE;
  PLACES.forEach((p, k) => {
    if (HOT_PLACES.has(p.id)) extra += (placeArea[k] / FLOOR_AREA) * Math.max(0, HOT_FLOOR - placeLevel(p, now));
  });
  t.push(extra * rainKeep('', rain));
  return t;
}
/** 이 자리 건물에 사람이 드나드는 문을 두는가: 망원한강공원 밖 구역 원 안이나 명소 둘레(20m) */
export function doorWanted(x: number, z: number): boolean {
  return Object.entries(ZONES).some(([id, [cx, cz, r]]) => id !== 'mangwon' && Math.hypot(x - cx, z - cz) < r) || placeMask(x, z, 20) !== 0;
}
/** (x, z)가 든 칸(구역 번호, 구역 밖이면 OUT_Z) */
export function zoneOf(x: number, z: number): number {
  const k = ZONE_IDS.findIndex((id) => Math.hypot(x - ZONES[id][0], z - ZONES[id][1]) < ZONES[id][2]);
  return k < 0 ? OUT_Z : k;
}
/** 화면 1명이 실제 몇 명인가(보는 곳 없이 판 전체를 같은 배율로 줄일 때). 상한 안이면 1 */
export function walkerScale(provider: DataProvider, now: Now, max: number, rain = 0): number {
  return Math.max(1, outside(provider, now, rain).reduce((a, b) => a + b, 0) / max);
}
/** 칸마다 판 전체를 같은 배율로 줄였을 때 화면에 있어야 할 사람 수 */
export function zoneTargets(provider: DataProvider, now: Now, max: number, rain = 0): number[] {
  const k = walkerScale(provider, now, max, rain);
  return outside(provider, now, rain).map((v) => v / k);
}
/** 지금 화면에 있어야 할 보행자 수(판 전체 같은 배율) */
export function walkerTarget(provider: DataProvider, now: Now, max: number, rain = 0): number {
  return Math.min(max, Math.round(zoneTargets(provider, now, max, rain).reduce((a, b) => a + b, 0)));
}

/** 걷는 길(골목·보행로)이 자동차 전용도로 밑을 같은 높이로 지나는 곳: 한강공원 나들목. (x, z) 반지름 r 안에서 찾는다 */
export function underpasses(roads: Road[], x: number, z: number, r: number): [number, number][] {
  const near = (p: Float32Array) => {
    for (let i = 0; i < p.length; i += 3) if (Math.hypot(p[i] - x, p[i + 2] - z) < r) return true;
    return false;
  };
  const motor = roads.filter((m) => m.cls <= 1 && near(m.p));
  const out: [number, number][] = [];
  for (const w of roads) {
    if (w.cls < 4 || w.bridge || !near(w.p)) continue;
    for (let i = 0; i + 5 < w.p.length; i += 3)
      for (const m of motor)
        for (let k = 0; k + 5 < m.p.length; k += 3) {
          const [ax, ay, az, bx, , bz] = [w.p[i], w.p[i + 1], w.p[i + 2], w.p[i + 3], w.p[i + 4], w.p[i + 5]];
          const [cx, cy, cz, dx, , dz] = [m.p[k], m.p[k + 1], m.p[k + 2], m.p[k + 3], m.p[k + 4], m.p[k + 5]];
          const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
          if (Math.abs(den) < 1e-9) continue;
          const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
          const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1 || Math.abs(ay - cy) > 2 || ay > 2) continue;
          const px = ax + t * (bx - ax);
          const pz = az + t * (bz - az);
          if (Math.hypot(px - x, pz - z) < r && !out.some(([qx, qz]) => Math.hypot(qx - px, qz - pz) < 25)) out.push([px, pz]);
        }
  }
  return out;
}
