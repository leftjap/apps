import { describe, it, expect } from 'vitest';
import { targetExpr, pickNewExprs, pickReviewExprs } from './generate-review-prompt.mjs';

describe('targetExpr — 표현 카드 → 타깃 청크', () => {
  it("key 의 '=' 앞부분을 타깃 표현으로", () => {
    expect(targetExpr({ explanation: { key: 'close by = 가까이. 위치.' } })).toBe('close by');
  });
  it('key 없으면 sentence 폴백', () => {
    expect(targetExpr({ sentence: 'take a break' })).toBe('take a break');
  });
});

describe('pickNewExprs — 새 세션: 최신 date 의 표현 카드(scene 제외)', () => {
  const rows = [
    { id: 's2', date: '2026-07-01', order_index: 0, explanation: { dialogue: [] } },
    { id: 'a', date: '2026-07-01', order_index: 1, explanation: { key: 'close by = .' } },
    { id: 'b', date: '2026-07-01', order_index: 2, explanation: { key: 'take a break = .' } },
    { id: 's1', date: '2026-06-30', order_index: 0, explanation: { dialogue: [] } },
    { id: 'old', date: '2026-06-30', order_index: 1, explanation: { key: 'wrap it up = .' } },
  ];
  it('최신 date 의 표현(order_index>0)만, scene 제외', () => {
    const exprs = pickNewExprs(rows).map(targetExpr);
    expect(exprs).toEqual(['close by', 'take a break']);
  });
  it('dateArg 지정 시 그 date 의 표현', () => {
    const exprs = pickNewExprs(rows, '2026-06-30').map(targetExpr);
    expect(exprs).toEqual(['wrap it up']);
  });
});

describe('pickReviewExprs — 복습: reviewQueue due 우선(인앱 SRS 정합)', () => {
  const today = '2026-06-29';
  const queue = [
    { id: 'd1', nextReview: '2026-06-26', explanation: { key: 'fire away = .' } },
    { id: 'd2', nextReview: '2026-06-28', explanation: { key: 'from scratch = .' } },
    { id: 'future', nextReview: '2026-06-30', explanation: { key: 'close by = .' } },
    { id: 'nodate', nextReview: null, explanation: { key: 'handle = .' } },
  ];
  it('due(nextReview<=today 또는 미정)만, 미래분 제외', () => {
    const ids = pickReviewExprs(queue, today).map((c) => c.id);
    expect(ids).not.toContain('future');
    expect(ids).toEqual(expect.arrayContaining(['d1', 'd2', 'nodate']));
  });
  it('기한 오래된 순(nextReview ASC, 미정 최우선)', () => {
    const ids = pickReviewExprs(queue, today).map((c) => c.id);
    expect(ids).toEqual(['nodate', 'd1', 'd2']);
  });
  it('limit 으로 상한', () => {
    expect(pickReviewExprs(queue, today, 2)).toHaveLength(2);
  });
  it('due 0건이면 다가오는 것이라도 오래된 순으로 폴백', () => {
    const allFuture = [{ id: 'f1', nextReview: '2026-07-05', explanation: { key: 'a = .' } }];
    expect(pickReviewExprs(allFuture, today).map((c) => c.id)).toEqual(['f1']);
  });
});
