import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/sim/walkers.ts';
import { LEVELS, makeSimProvider } from '../src/sim/provider.ts';

const p = makeSimProvider();
const at = (h: number, dow: number) => ({ tod: h * 3600, dow, doy: 317 });
const area = (id: string, h: number, dow: number) => p.areas(at(h, dow)).find((a) => a.id === id)!;

describe('시뮬레이션 자료', () => {
  it('판 안의 다섯 곳', () => {
    const names = p.areas(at(12, 2)).map((a) => a.name);
    expect(names).toEqual(['홍대 관광특구', '홍대입구역(2호선)', '연남동', '합정역', '망원한강공원']);
  });
  it('홍대는 금요일 21시가 화요일 10시보다 붐빈다', () => {
    expect(area('hongdae', 21, 5).pplMin).toBeGreaterThan(area('hongdae', 10, 2).pplMin * 1.5);
    expect(area('hongdae', 21, 5).level).toBeGreaterThan(area('hongdae', 10, 2).level);
  });
  it('한강공원은 토요일 낮이 화요일 새벽보다 붐빈다', () =>
    expect(area('mangwon', 15, 6).pplMin).toBeGreaterThan(area('mangwon', 4, 2).pplMin * 3));
  it('나이대 비율(0~9세부터 70대 이상까지 8칸)과 여성 비율을 실시간 도시데이터와 같은 모양으로 준다', () => {
    for (const a of p.areas(at(19, 5))) {
      expect(a.ages).toHaveLength(8);
      expect(a.ages.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 0);
      expect(a.female).toBeGreaterThan(30);
      expect(a.female).toBeLessThan(70);
    }
    // 금요일 밤 홍대는 20대가 가장 많고, 토요일 낮 한강공원은 어린이 비율이 평일 밤 홍대보다 높다
    const h = area('hongdae', 22, 5).ages;
    expect(h.indexOf(Math.max(...h))).toBe(2);
    expect(area('mangwon', 14, 6).ages[0]).toBeGreaterThan(h[0] * 2);
  });
  it('단계 라벨과 인구 범위', () => {
    for (const a of p.areas(at(19, 5))) {
      expect(a.label).toBe(LEVELS[a.level]);
      expect(a.pplMax).toBeGreaterThan(a.pplMin);
    }
    expect(LEVELS).toEqual(['여유', '보통', '약간 붐빔', '붐빔']);
  });
  it('큰길은 출근 시간이 새벽보다 느리다', () => {
    expect(p.roadSpeed(at(8.5, 2), 1, 7)).toBeLessThan(p.roadSpeed(at(3, 2), 1, 7) - 0.2);
    expect(p.roadSpeed(at(8.5, 2), 1, 7)).toBeGreaterThanOrEqual(0.15);
    expect(p.roadSpeed(at(3, 2), 1, 7)).toBeLessThanOrEqual(1);
  });
  it('사람이 붐비는 장소 둘레 길은 같은 길이라도 차가 느리고, 장소에서 멀면 그대로다', () => {
    const sat = { tod: 17 * 3600 + 300, dow: 6, doy: 318 };
    const [hx, hz] = ZONES.yeonnam;
    let near = 0;
    let far = 0;
    for (let k = 0; k < 40; k++) {
      near += p.roadSpeed(sat, 3, k, hx, hz);
      far += p.roadSpeed(sat, 3, k, -1700, -1700);
    }
    expect(near / 40).toBeLessThan(far / 40 - 0.2);
    expect(p.roadSpeed(sat, 3, 7, -1700, -1700)).toBe(p.roadSpeed(sat, 3, 7));
  });
  it('하차 인원: 퇴근 시간 홍대입구가 한낮보다 많고 운행 시간 밖은 0', () => {
    expect(p.alighting(at(18.5, 2), '홍대입구')).toBeGreaterThan(p.alighting(at(14, 2), '홍대입구'));
    expect(p.alighting(at(3, 2), '홍대입구')).toBe(0);
  });
});
