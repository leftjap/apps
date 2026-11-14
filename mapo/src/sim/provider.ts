// 시뮬레이션에 들어가는 바깥 자료. 1단계는 시간대 곡선으로 만들고, 2단계에서 이 구현만 실데이터로 바꾼다.
import type { Now } from './clock.ts';
import { clamp01, commute, daytime, inService, nightlife } from './curves.ts';
import { ZONES } from './walkers.ts';

export const LEVELS = ['여유', '보통', '약간 붐빔', '붐빔'] as const;

export interface AreaStatus {
  id: string;
  name: string;
  level: 0 | 1 | 2 | 3;
  label: string;
  pplMin: number;
  pplMax: number;
  /** 혼잡 정도: 그 장소의 '붐빔' 기준 인원 대비 지금 인원(0~1.2 남짓). 화면에 보이는 사람 밀도를 정한다 */
  crowd: number;
  /** 나이대 비율(%): 0~9세, 10대, 20대, 30대, 40대, 50대, 60대, 70대 이상. 실시간 도시데이터 PPLTN_RATE_0~70 과 같은 칸 */
  ages: number[];
  /** 여성 비율(%). 실시간 도시데이터 FEMALE_PPLTN_RATE */
  female: number;
}

export interface DataProvider {
  mode: 'sim' | 'live';
  /** 구역별 추정 인구와 혼잡 단계 */
  areas(now: Now): AreaStatus[];
  /** 도로 구간의 속도 비율(자유 속도 대비 0.15~1). cls 는 도로 등급, edgeKey 는 구간마다 다른 정수, (x, z)는 구간 가운데 */
  roadSpeed(now: Now, cls: number, edgeKey: number, x?: number, z?: number): number;
  /** 역의 최근 5분 하차 인원 */
  alighting(now: Now, station: string): number;
}

interface AreaModel {
  id: string;
  name: string;
  base: number;
  commute: number;
  day: number;
  night: number;
  weekend: number; // 주말에 낮·밤 항에 곱하는 값
  full: number; // 이 인원이면 '붐빔'
  ages: number[]; // 평소 나이대 비율(%, 8칸)
  female: number;
  family: number; // 주말 낮에 아이와 부모가 느는 정도
}

/** 서울 실시간 도시데이터의 121장소 가운데 판 안에 있는 다섯 곳 */
const AREAS: AreaModel[] = [
  { id: 'hongdae', name: '홍대 관광특구', base: 14000, commute: 6000, day: 22000, night: 46000, weekend: 1.3, full: 62000, ages: [3, 8, 36, 22, 13, 9, 5, 4], female: 56, family: 0.3 },
  { id: 'hongik-stn', name: '홍대입구역(2호선)', base: 9000, commute: 14000, day: 10000, night: 20000, weekend: 1.2, full: 36000, ages: [3, 7, 30, 24, 15, 11, 6, 4], female: 52, family: 0.3 },
  { id: 'yeonnam', name: '연남동', base: 7000, commute: 2500, day: 12000, night: 11000, weekend: 1.5, full: 26000, ages: [4, 6, 32, 25, 13, 10, 6, 4], female: 58, family: 0.6 },
  { id: 'hapjeong', name: '합정역', base: 6000, commute: 9000, day: 6000, night: 8000, weekend: 1.1, full: 22000, ages: [4, 6, 26, 25, 16, 12, 7, 4], female: 51, family: 0.4 },
  { id: 'mangwon', name: '망원한강공원', base: 300, commute: 300, day: 4200, night: 2600, weekend: 2.6, full: 9000, ages: [9, 8, 20, 22, 16, 12, 8, 5], female: 50, family: 1.5 },
];

const STATIONS: Record<string, number> = { 홍대입구: 1900, 합정: 1100, 신촌: 1300, 상수: 420, 망원: 520, 광흥창: 300, 서강대: 180, 가좌: 220 };

const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
const isWeekend = (dow: number) => dow === 0 || dow === 6;
/** 금·토 밤은 유흥이 더 세다 */
const nightBoost = (dow: number) => (dow === 5 || dow === 6 ? 1.25 : dow === 0 ? 0.8 : 1);

export function areaPopulation(m: AreaModel, now: Now): number {
  const wk = isWeekend(now.dow);
  const k = wk ? m.weekend : 1;
  const wobble = 1 + 0.04 * Math.sin(now.tod / 420 + m.base);
  return (
    (m.base + m.commute * commute(now.tod) * (wk ? 0.3 : 1) + m.day * daytime(now.tod) * k + m.night * nightlife(now.tod) * nightBoost(now.dow) * (wk ? 1 : 0.85)) *
    wobble
  );
}

/** 나이대 비율: 밤에는 20대가 늘고 나이 든 사람이 줄며, 주말 낮에는 아이와 30·40대 부모가 는다 */
export function areaAges(m: AreaModel, now: Now): number[] {
  const night = nightlife(now.tod) * nightBoost(now.dow);
  const fam = daytime(now.tod) * (isWeekend(now.dow) ? 1 : 0.3) * m.family;
  const a = m.ages.map((v, k) => v * (k >= 5 ? 1 - 0.5 * clamp01(night) : 1));
  a[2] += 14 * night;
  a[0] += 7 * fam;
  a[3] += 4 * fam;
  a[4] += 3 * fam;
  const sum = a.reduce((x, y) => x + y, 0);
  return a.map((v) => Math.round((v / sum) * 1000) / 10);
}

export function makeSimProvider(): DataProvider {
  // 같은 시각에는 장소별 혼잡 정도를 한 번만 계산한다(도로 속도는 구간마다 불린다)
  let at = NaN;
  const crowd: Record<string, number> = {};
  /** (x, z) 둘레 장소의 혼잡 정도: 장소 안이면 그대로, 장소 가장자리에서 250m 까지 줄어든다 */
  function crowdNear(now: Now, x: number, z: number) {
    if (now.tod + now.dow * 86400 !== at) {
      at = now.tod + now.dow * 86400;
      for (const m of AREAS) crowd[m.id] = areaPopulation(m, now) / m.full;
    }
    let c = 0;
    for (const id in ZONES) {
      const [cx, cz, r] = ZONES[id];
      const d = Math.hypot(x - cx, z - cz);
      c = Math.max(c, (crowd[id] ?? 0) * (d < r ? 1 : Math.max(0, 1 - (d - r) / 250)));
    }
    return Math.min(1.2, c);
  }
  return {
    mode: 'sim',
    areas(now) {
      return AREAS.map((m) => {
        const ppl = areaPopulation(m, now);
        const r = ppl / m.full;
        const level = (r < 0.35 ? 0 : r < 0.6 ? 1 : r < 0.85 ? 2 : 3) as 0 | 1 | 2 | 3;
        const lo = Math.max(100, Math.round((ppl * 0.96) / 100) * 100);
        return { id: m.id, name: m.name, level, label: LEVELS[level], pplMin: lo, pplMax: lo + Math.max(100, Math.round((ppl * 0.08) / 100) * 100), crowd: r, ages: areaAges(m, now), female: m.female };
      });
    },
    roadSpeed(now, cls, edgeKey, x, z) {
      const weight = cls <= 1 ? 0.6 : cls === 2 ? 0.45 : 0.28;
      const jam = commute(now.tod) * (isWeekend(now.dow) ? 0.45 : 1) + nightlife(now.tod) * 0.25 + daytime(now.tod) * 0.2;
      // 사람이 붐비는 장소 둘레 길은 길을 건너는 사람과 서고 떠나는 차에 막혀 느리다(주말 저녁 홍대·연남)
      const slow = x === undefined || z === undefined ? 0 : 0.45 * crowdNear(now, x, z) * (0.6 + 0.8 * hash(edgeKey + 17));
      return Math.max(0.15, 1 - clamp01(jam) * weight * (0.55 + 0.9 * hash(edgeKey)) - slow);
    },
    alighting(now, station) {
      if (!inService(now.tod)) return 0;
      const base = STATIONS[station] ?? 250;
      const wk = isWeekend(now.dow);
      return Math.round(base * (0.12 + commute(now.tod) * (wk ? 0.3 : 0.9) + nightlife(now.tod) * nightBoost(now.dow) * 0.7 + daytime(now.tod) * (wk ? 0.6 : 0.35)));
    },
  };
}
