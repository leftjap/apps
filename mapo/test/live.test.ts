import { describe, expect, it } from 'vitest';
import { makeLiveProvider, type LiveData } from '../src/data/live.ts';
import { toLatLon } from '../src/geo.ts';
import { makeSimProvider } from '../src/sim/provider.ts';

const now = { tod: 22 * 3600, dow: 6, doy: 318 };
// 판 좌표 (0,0)→(100,0)(동쪽으로) 도로 구간 하나가 정체, 연남동이 '붐빔'인 실시간 자료(값은 지어낸 것)
const lonlat = (x: number, z: number): [number, number] => {
  const [lat, lon] = toLatLon(x, z);
  return [lon, lat];
};
const data: LiveData = {
  places: [{ name: '연남동', level: '붐빔', min: 30000, max: 32000, ages: [1, 9, 40, 20, 12, 9, 6, 3], female: 60, time: '2026-11-14 21:50' }],
  roads: [{ id: 'L1', idx: '정체', spd: 8, xy: [lonlat(0, 0), lonlat(100, 0)] }],
  roadTime: '2026-11-14 22:20',
  at: Date.now(),
};

describe('실시간 자료 덧씌우기', () => {
  it('실시간 자료가 있는 장소는 그 인구·혼잡 단계·나이대를 쓰고, 없는 장소는 시뮬레이션 그대로다', () => {
    const sim = makeSimProvider();
    const live = makeLiveProvider(sim);
    live.set(data);
    const a = live.provider.areas(now);
    const y = a.find((q) => q.id === 'yeonnam')!;
    expect([y.level, y.label, y.pplMin, y.pplMax, y.female]).toEqual([3, '붐빔', 30000, 32000, 60]);
    expect(y.ages).toEqual([1, 9, 40, 20, 12, 9, 6, 3]);
    expect(a.find((q) => q.id === 'hongdae')).toEqual(sim.areas(now).find((q) => q.id === 'hongdae'));
    expect(live.provider.mode).toBe('live');
  });
  it('실제 도로 구간 위(같은 방향)는 그 구간의 원활·서행·정체를 속도 비율로 쓰고, 반대 방향이나 먼 길은 시뮬레이션 값이다', () => {
    const sim = makeSimProvider();
    const live = makeLiveProvider(sim);
    live.set(data);
    const p = live.provider;
    expect(p.roadSpeed(now, 2, 7, 50, 2, 0)).toBe(0.2);
    expect(p.roadSpeed(now, 2, 7, 50, 2, Math.PI)).toBe(sim.roadSpeed(now, 2, 7, 50, 2, Math.PI));
    expect(p.roadSpeed(now, 2, 7, 50, 300, 0)).toBe(sim.roadSpeed(now, 2, 7, 50, 300, 0));
  });
  it('시험 시각으로 볼 때(실시간을 끄면)는 시뮬레이션만 쓴다', () => {
    const sim = makeSimProvider();
    const live = makeLiveProvider(sim);
    live.set(data);
    live.use(false);
    expect(live.provider.areas(now)).toEqual(sim.areas(now));
    expect(live.provider.roadSpeed(now, 2, 7, 50, 2, 0)).toBe(sim.roadSpeed(now, 2, 7, 50, 2, 0));
    expect(live.provider.mode).toBe('sim');
  });
  it('받은 지 15분이 넘은 자료는 버리고 시뮬레이션으로 돌아간다(중계가 끊겨도 실시간 표시와 값이 남지 않게)', () => {
    const sim = makeSimProvider();
    let wall = Date.parse('2026-11-15T04:00:00+09:00');
    const live = makeLiveProvider(sim, () => wall);
    live.set({ ...data, at: wall });
    wall += 14 * 60_000;
    expect(live.provider.mode).toBe('live');
    wall += 2 * 60_000;
    expect(live.provider.mode).toBe('sim');
    expect(live.provider.areas(now)).toEqual(sim.areas(now));
    expect(live.provider.roadSpeed(now, 2, 7, 50, 2, 0)).toBe(sim.roadSpeed(now, 2, 7, 50, 2, 0));
  });
  it('도시고속도로(등급 0)는 공식 구간 선이 반대 차로 위에 그려져 있어도 같은 방향 80m 안이면 그 구간 속도를 쓴다', () => {
    const sim = makeSimProvider();
    const live = makeLiveProvider(sim);
    live.set(data);
    const p = live.provider;
    expect(p.roadSpeed(now, 0, 7, 50, 60, 0)).toBe(0.2);
    expect(p.roadSpeed(now, 0, 7, 50, 60, Math.PI)).toBe(sim.roadSpeed(now, 0, 7, 50, 60, Math.PI));
    expect(p.roadSpeed(now, 2, 7, 50, 60, 0)).toBe(sim.roadSpeed(now, 2, 7, 50, 60, 0));
    expect(p.roadSpeed(now, 0, 7, 50, 120, 0)).toBe(sim.roadSpeed(now, 0, 7, 50, 120, 0));
  });
  it('비 세기: 강수 형태가 비이면 강수량이 많을수록 세고(0~1), 비가 없거나 눈이면 0, 자료가 없거나 오래되면 null', () => {
    let wall = Date.parse('2026-11-15T04:00:00+09:00');
    const live = makeLiveProvider(makeSimProvider(), () => wall);
    expect(live.rain()).toBeNull();
    const w = (type: string, mm: string) => live.set({ ...data, at: wall, weather: { type, mm, time: '2026-11-15 04:00' } });
    w('없음', '-');
    expect(live.rain()).toBe(0);
    w('눈', '1.0');
    expect(live.rain()).toBe(0);
    w('빗방울', '1mm 미만');
    const drizzle = live.rain()!;
    w('비', '2.0');
    const mid = live.rain()!;
    w('비', '15.0mm');
    const heavy = live.rain()!;
    expect(drizzle).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(drizzle);
    expect(heavy).toBe(1);
    wall += 16 * 60_000;
    expect(live.rain()).toBeNull();
  });
  it('눈 세기: 눈·눈날림이면 0보다 크고(비/눈은 비와 눈 둘 다), 비만 오면 0', () => {
    const wall = Date.parse('2026-11-15T04:00:00+09:00');
    const live = makeLiveProvider(makeSimProvider(), () => wall);
    const w = (type: string, mm: string) => live.set({ ...data, at: wall, weather: { type, mm, time: 'x' } });
    w('눈날림', '-');
    const flurry = live.snow()!;
    w('눈', '3.0');
    const heavy = live.snow()!;
    expect(flurry).toBeGreaterThan(0);
    expect(heavy).toBeGreaterThan(flurry);
    expect(live.rain()).toBe(0);
    w('비/눈', '2.0');
    expect(live.snow()).toBeGreaterThan(0);
    expect(live.rain()).toBeGreaterThan(0);
    w('비', '2.0');
    expect(live.snow()).toBe(0);
  });
  it('미세먼지 탁함(0~1): 미세먼지·초미세먼지 등급 가운데 나쁜 쪽으로, 좋음·보통은 0, 나쁨 0.5, 매우나쁨 1. 자료가 없거나 오래되면 null', () => {
    let wall = Date.parse('2026-11-15T22:50:00+09:00');
    const live = makeLiveProvider(makeSimProvider(), () => wall);
    expect(live.air()).toBeNull();
    const a = (pm10Idx: string, pm25Idx: string) => live.set({ ...data, at: wall, air: { pm10: 74, pm10Idx, pm25: 53, pm25Idx, time: '2026-11-15 22:50' } });
    a('보통', '좋음');
    expect(live.air()!.dust).toBe(0);
    a('보통', '나쁨');
    expect(live.air()!.dust).toBe(0.5);
    expect(live.air()!.text).toBe('미세먼지 보통(74) · 초미세먼지 나쁨(53)');
    a('매우나쁨', '나쁨');
    expect(live.air()!.dust).toBe(1);
    wall += 16 * 60_000;
    expect(live.air()).toBeNull();
  });
});
