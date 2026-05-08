import { describe, it, expect } from 'vitest';
import { mergeLangMeta } from './langMeta.js';

describe('mergeLangMeta', () => {
  it('첫 세션 (prev 빈) → totalDays=1, streak=1, totalTime=duration', () => {
    const out = mergeLangMeta({}, { date: '2026-05-08', durationSec: 240 });
    expect(out).toEqual({
      totalTime: 240, totalDays: 1, streak: 1, lastStudyDate: '2026-05-08',
    });
  });

  it('같은 날 추가 세션 → totalDays/streak 유지, totalTime 누적', () => {
    const prev = { totalTime: 100, totalDays: 1, streak: 1, lastStudyDate: '2026-05-08' };
    const out = mergeLangMeta(prev, { date: '2026-05-08', durationSec: 60 });
    expect(out).toEqual({
      totalTime: 160, totalDays: 1, streak: 1, lastStudyDate: '2026-05-08',
    });
  });

  it('다음 날 세션 → totalDays +1, streak +1', () => {
    const prev = { totalTime: 200, totalDays: 1, streak: 1, lastStudyDate: '2026-05-08' };
    const out = mergeLangMeta(prev, { date: '2026-05-09', durationSec: 100 });
    expect(out).toEqual({
      totalTime: 300, totalDays: 2, streak: 2, lastStudyDate: '2026-05-09',
    });
  });

  it('2일 갭 → totalDays +1, streak 리셋 1', () => {
    const prev = { totalTime: 500, totalDays: 5, streak: 5, lastStudyDate: '2026-05-08' };
    const out = mergeLangMeta(prev, { date: '2026-05-10', durationSec: 60 });
    expect(out).toEqual({
      totalTime: 560, totalDays: 6, streak: 1, lastStudyDate: '2026-05-10',
    });
  });

  it('월 경계 다음날 (2026-04-30 → 2026-05-01)', () => {
    const prev = { totalDays: 3, streak: 3, lastStudyDate: '2026-04-30', totalTime: 0 };
    const out = mergeLangMeta(prev, { date: '2026-05-01', durationSec: 0 });
    expect(out.totalDays).toBe(4);
    expect(out.streak).toBe(4);
  });

  it('연 경계 다음날 (2026-12-31 → 2027-01-01)', () => {
    const prev = { totalDays: 10, streak: 7, lastStudyDate: '2026-12-31', totalTime: 0 };
    const out = mergeLangMeta(prev, { date: '2027-01-01', durationSec: 0 });
    expect(out.totalDays).toBe(11);
    expect(out.streak).toBe(8);
  });

  it('기존 currentStage / userKnown / goal 보존 (spread)', () => {
    const prev = {
      totalDays: 1, streak: 1, lastStudyDate: '2026-05-08', totalTime: 100,
      currentStage: 2, userKnown: [{ type: 'word', value: 'hi' }], goal: 'JLPT N3', currentCategory: 'travel',
    };
    const out = mergeLangMeta(prev, { date: '2026-05-09', durationSec: 60 });
    expect(out.currentStage).toBe(2);
    expect(out.userKnown).toEqual([{ type: 'word', value: 'hi' }]);
    expect(out.goal).toBe('JLPT N3');
    expect(out.currentCategory).toBe('travel');
    expect(out.streak).toBe(2);
  });

  it('log.date 누락 → totalTime 만 누적, 일자 변동 없음', () => {
    const prev = { totalDays: 3, streak: 3, lastStudyDate: '2026-05-08', totalTime: 100 };
    const out = mergeLangMeta(prev, { durationSec: 50 });
    expect(out.totalTime).toBe(150);
    expect(out.totalDays).toBe(3);
    expect(out.streak).toBe(3);
    expect(out.lastStudyDate).toBe('2026-05-08');
  });

  it('prev null 안전', () => {
    const out = mergeLangMeta(null, { date: '2026-05-08', durationSec: 60 });
    expect(out).toMatchObject({ totalDays: 1, streak: 1, totalTime: 60 });
  });

  it('prev array (잘못된 타입) → 빈 base 시작', () => {
    const out = mergeLangMeta([], { date: '2026-05-08', durationSec: 60 });
    expect(out).toMatchObject({ totalDays: 1, streak: 1, totalTime: 60 });
  });
});
