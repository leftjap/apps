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
  at: 0,
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
});
