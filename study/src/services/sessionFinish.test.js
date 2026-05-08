import { describe, it, expect } from 'vitest';
import { buildSessionLog, mergeDailyStats } from './sessionFinish.js';

describe('buildSessionLog', () => {
  it('필드 매핑 + sessionType=normal 고정', () => {
    const log = buildSessionLog({
      mode: 'new', lang: 'en', date: '2026-05-08',
      durationSec: 240, tried: 12, passed: 9, newSentenceIds: ['a', 'b', 'c'],
    });
    expect(log.lang).toBe('en');
    expect(log.date).toBe('2026-05-08');
    expect(log.sessionType).toBe('normal');
    expect(log.mode).toBe('new');
    expect(log.utteranceCount).toBe(12);
    expect(log.passCount).toBe(9);
    expect(log.durationSec).toBe(240);
    expect(log.newSentenceIds).toEqual(['a', 'b', 'c']);
    expect(typeof log.id).toBe('string');
    expect(log.id.length).toBeGreaterThan(0);
    expect(typeof log.createdAt).toBe('string');
  });

  it('newSentenceIds 미전달 시 빈 배열', () => {
    const log = buildSessionLog({ mode: 'review', lang: 'en', date: '2026-05-08', durationSec: 0, tried: 0, passed: 0 });
    expect(log.newSentenceIds).toEqual([]);
  });

  it('숫자 폴백 (NaN/undefined → 0)', () => {
    const log = buildSessionLog({ mode: 'new', lang: 'en', date: '2026-05-08' });
    expect(log.utteranceCount).toBe(0);
    expect(log.passCount).toBe(0);
    expect(log.durationSec).toBe(0);
  });

  it('Wave A.14 — mode="free" → sessionType="free_review"', () => {
    const log = buildSessionLog({ mode: 'free', lang: 'en', date: '2026-05-08', durationSec: 60, tried: 5, passed: 3 });
    expect(log.sessionType).toBe('free_review');
    expect(log.mode).toBe('free');
  });

  it('mode="review" / "new" → sessionType="normal" 보존', () => {
    expect(buildSessionLog({ mode: 'review', lang: 'en', date: '2026-05-08' }).sessionType).toBe('normal');
    expect(buildSessionLog({ mode: 'new', lang: 'en', date: '2026-05-08' }).sessionType).toBe('normal');
  });
});

describe('mergeDailyStats', () => {
  const baseLog = {
    date: '2026-05-08', lang: 'en', utteranceCount: 5, durationSec: 120,
    newSentenceIds: ['a', 'b'], mode: 'new', completedReviewCount: 0,
  };

  it('prev 없음 → 신규 row 생성 (new 세션 = newSentences 증가)', () => {
    const out = mergeDailyStats(null, baseLog);
    expect(out).toEqual({
      date: '2026-05-08', lang: 'en',
      utteranceCount: 5, studyTimeSec: 120, newSentences: 2, reviewCount: 0,
    });
  });

  it('prev 있음 → 누적', () => {
    const prev = { date: '2026-05-08', lang: 'en', utteranceCount: 10, studyTimeSec: 300, newSentences: 1, reviewCount: 4 };
    const out = mergeDailyStats(prev, baseLog);
    expect(out).toEqual({
      date: '2026-05-08', lang: 'en',
      utteranceCount: 15, studyTimeSec: 420, newSentences: 3, reviewCount: 4,
    });
  });

  it('review 세션 → reviewCount 만 증가, newSentences 변화 없음', () => {
    const reviewLog = { ...baseLog, mode: 'review', newSentenceIds: [], completedReviewCount: 3 };
    const out = mergeDailyStats(null, reviewLog);
    expect(out.newSentences).toBe(0);
    expect(out.reviewCount).toBe(3);
  });

  it('Wave A.14 — free 세션도 reviewCount 누적 (실제 SRS 영향 spec §8-4)', () => {
    const freeLog = { ...baseLog, mode: 'free', newSentenceIds: [], completedReviewCount: 5 };
    const out = mergeDailyStats(null, freeLog);
    expect(out.newSentences).toBe(0);
    expect(out.reviewCount).toBe(5);
  });
});
