import { describe, it, expect } from 'vitest';
import { buildSummaryData } from './summaryData.js';

describe('buildSummaryData', () => {
  it('mode=new — newCount = completedNewCount, total = newCount, judged 0/0/0', () => {
    const out = buildSummaryData({
      mode: 'new', state: { tried: 5, passed: 3, pronScores: [80, 90], weakInSession: {} },
      durationSec: 240, completedNewCount: 2,
    });
    expect(out).toMatchObject({
      mode: 'new', durationSec: 240, newCount: 2, total: 2,
      judged: { got: 0, hmm: 0, no: 0 }, tryCount: 5, passCount: 3, pronAvg: 85,
      weakTop3: [], returnTo: 'home',
    });
  });

  it('exprs — state.cards 의 표현(scene 제외) key 청크 추출 (음성복습 프롬프트용)', () => {
    const out = buildSummaryData({
      mode: 'new',
      state: { cards: [
        { id: 's', explanation: { dialogue: [{}] } },
        { id: 'a', sentence: 'My house is really close by.', explanation: { key: 'close by = 가까이.' } },
        { id: 'b', sentence: 'X', explanation: { key: 'take a break = 쉬다.' } },
      ], pronScores: [] },
      durationSec: 10, completedNewCount: 2,
    });
    expect(out.exprs).toEqual(['close by', 'take a break']);
  });

  it('exprs — cards 없으면 빈 배열', () => {
    expect(buildSummaryData({ mode: 'review', state: { pronScores: [] } }).exprs).toEqual([]);
  });

  it('mode=review — newCount=0, total=completedReviewCount, judged 반영', () => {
    const out = buildSummaryData({
      mode: 'review', state: { tried: 4, passed: 2, judged: { got: 2, hmm: 1, no: 1 }, pronScores: [70, 80, 90, 75], weakInSession: {} },
      durationSec: 180, completedReviewCount: 4,
    });
    expect(out).toMatchObject({
      mode: 'review', durationSec: 180, newCount: 0, total: 4,
      judged: { got: 2, hmm: 1, no: 1 }, tryCount: 4, passCount: 2, pronAvg: 79,
    });
  });

  it('weakInSession Top 3 — count 내림차순', () => {
    const out = buildSummaryData({
      mode: 'new', state: { weakInSession: { θ: 5, ɹ: 2, ɛ: 7, ʌ: 1, ð: 3 }, pronScores: [] },
      durationSec: 0, completedNewCount: 0,
    });
    expect(out.weakTop3).toEqual(['ɛ', 'θ', 'ð']);
  });

  it('pronScores 빈 배열 → pronAvg = undefined', () => {
    const out = buildSummaryData({
      mode: 'new', state: { pronScores: [], weakInSession: {} },
      durationSec: 0, completedNewCount: 0,
    });
    expect(out.pronAvg).toBeUndefined();
  });

  it('state 누락 / 비정상 값 → 0/빈 폴백', () => {
    const out = buildSummaryData({ mode: 'review', durationSec: 60, completedReviewCount: 1 });
    expect(out).toMatchObject({
      tryCount: 0, passCount: 0, judged: { got: 0, hmm: 0, no: 0 },
      pronAvg: undefined, weakTop3: [],
    });
  });

  it('pronScores 에 NaN/Infinity 섞임 — 필터링', () => {
    const out = buildSummaryData({
      mode: 'new', state: { pronScores: [80, NaN, 90, Infinity, 70], weakInSession: {} },
      durationSec: 0, completedNewCount: 0,
    });
    expect(out.pronAvg).toBe(80);
  });

  it('returnTo override', () => {
    const out = buildSummaryData({ mode: 'new', state: {}, durationSec: 0, completedNewCount: 0, returnTo: 'stats' });
    expect(out.returnTo).toBe('stats');
  });
});
