import { describe, expect, it } from 'vitest';
import { makeClock } from '../src/sim/clock.ts';
import { commute, daylight, duskiness, nightlife, sunAngles } from '../src/sim/curves.ts';

const FRI_21 = () => Date.UTC(2026, 10, 13, 12, 0, 0); // KST 2026-11-13(금) 21:00

describe('시계', () => {
  it('매개변수가 없으면 실제 한국 시각', () => {
    const c = makeClock('', FRI_21);
    expect(c.now().tod).toBe(21 * 3600);
    expect(c.now().dow).toBe(5);
    expect(c.now().doy).toBe(317);
    expect(c.live).toBe(true);
  });
  it('?t=08:30', () => {
    const c = makeClock('?t=08:30', FRI_21);
    expect(c.now().tod).toBe(30600);
    expect(c.live).toBe(false);
  });
  it('배속', () => {
    const c = makeClock('?t=08:30&speed=60', FRI_21);
    c.tick(1);
    expect(c.now().tod).toBe(30660);
  });
  it('자정을 넘기면 요일이 바뀐다', () => {
    const c = makeClock('?t=23:59&speed=120', FRI_21);
    c.tick(1);
    expect(c.now().tod).toBe(60);
    expect(c.now().dow).toBe(6);
  });
  it('?dow=2 로 요일 지정', () => expect(makeClock('?t=10:00&dow=2', FRI_21).now().dow).toBe(2));
});

describe('해', () => {
  it('11월 13일 한낮 고도는 34도 안팎', () => {
    const e = sunAngles(12.5 * 3600, 317).elev;
    expect(e).toBeGreaterThan(32);
    expect(e).toBeLessThan(37);
  });
  it('11월 13일 일몰 17:23, 일출 07:09 무렵에 지평선', () => {
    expect(Math.abs(sunAngles(17 * 3600 + 23 * 60, 317).elev)).toBeLessThan(2.5);
    expect(Math.abs(sunAngles(7 * 3600 + 9 * 60, 317).elev)).toBeLessThan(2.5);
  });
  it('하지 한낮은 70도 넘고 새벽 3시는 지평선 아래', () => {
    expect(sunAngles(12.5 * 3600, 172).elev).toBeGreaterThan(70);
    expect(sunAngles(3 * 3600, 172).elev).toBeLessThan(-10);
  });
  it('낮 1, 밤 0, 해 질 녘에만 노을', () => {
    expect(daylight(35)).toBe(1);
    expect(daylight(-20)).toBe(0);
    expect(duskiness(0)).toBeGreaterThan(0.9);
    expect(duskiness(35)).toBe(0);
    expect(duskiness(-20)).toBe(0);
  });
});

describe('시간대 곡선', () => {
  it('출퇴근', () => {
    expect(commute(8.5 * 3600)).toBeGreaterThan(0.8);
    expect(commute(18.5 * 3600)).toBeGreaterThan(0.8);
    expect(commute(3 * 3600)).toBeLessThan(0.1);
    expect(commute(13 * 3600)).toBeLessThan(0.4);
  });
  it('밤 유흥: 21시대가 높고 자정 넘어 이어지며 아침엔 없다', () => {
    expect(nightlife(21.5 * 3600)).toBeGreaterThan(0.8);
    expect(nightlife(0.5 * 3600)).toBeGreaterThan(0.25);
    expect(nightlife(9 * 3600)).toBeLessThan(0.05);
  });
});

describe('시계 조작', () => {
  // 2026-11-14 12:00 KST
  const noon = () => Date.UTC(2026, 10, 14, 3, 0, 0);
  it('시각을 정하면 그 시각부터 흐르고 실시간 표시가 꺼진다', () => {
    const c = makeClock('', noon);
    expect(c.live).toBe(true);
    c.set(20 * 3600);
    expect(c.live).toBe(false);
    expect(c.now().tod).toBe(20 * 3600);
    c.tick(10);
    expect(c.now().tod).toBeCloseTo(20 * 3600 + 10);
    expect(c.now().dow).toBe(6);
  });
  it('실시간으로 돌아가면 실제 시각을 따른다', () => {
    const c = makeClock('?t=08:00', noon);
    expect(c.live).toBe(false);
    c.setLive();
    expect(c.live).toBe(true);
    expect(c.now().tod).toBe(12 * 3600);
  });
});
