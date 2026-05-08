import { describe, it, expect } from 'vitest';
import { nextSrsState, todayPlusDays, SRS_INTERVALS } from './srs.js';

const TODAY = '2026-05-08';

describe('todayPlusDays', () => {
  it('+1', () => expect(todayPlusDays('2026-05-08', 1)).toBe('2026-05-09'));
  it('+3', () => expect(todayPlusDays('2026-05-08', 3)).toBe('2026-05-11'));
  it('월 경계 (+30 from 04-15)', () => expect(todayPlusDays('2026-04-15', 30)).toBe('2026-05-15'));
  it('연 경계 (+30 from 12-15)', () => expect(todayPlusDays('2026-12-15', 30)).toBe('2027-01-14'));
});

describe('nextSrsState — no (다시)', () => {
  it.each(SRS_INTERVALS)('current=%i 에서 no → interval=1', (cur) => {
    expect(nextSrsState(cur, 'no', TODAY)).toEqual({
      interval: 1, nextReview: '2026-05-09', graduate: false,
    });
  });
});

describe('nextSrsState — got (완료)', () => {
  it('1 → 3', () => expect(nextSrsState(1, 'got', TODAY)).toEqual({ interval: 3, nextReview: '2026-05-11', graduate: false }));
  it('3 → 7', () => expect(nextSrsState(3, 'got', TODAY)).toEqual({ interval: 7, nextReview: '2026-05-15', graduate: false }));
  it('7 → 21', () => expect(nextSrsState(7, 'got', TODAY)).toEqual({ interval: 21, nextReview: '2026-05-29', graduate: false }));
  it('21 → 60', () => expect(nextSrsState(21, 'got', TODAY)).toEqual({ interval: 60, nextReview: '2026-07-07', graduate: false }));
  it('60 → graduate', () => expect(nextSrsState(60, 'got', TODAY)).toEqual({ graduate: true }));
});

describe('nextSrsState — hmm (애매)', () => {
  it('1 → ceil((1+3)/2)=2', () => expect(nextSrsState(1, 'hmm', TODAY)).toMatchObject({ interval: 2, nextReview: '2026-05-10', graduate: false }));
  it('3 → ceil((3+7)/2)=5', () => expect(nextSrsState(3, 'hmm', TODAY)).toMatchObject({ interval: 5, nextReview: '2026-05-13' }));
  it('7 → ceil((7+21)/2)=14', () => expect(nextSrsState(7, 'hmm', TODAY)).toMatchObject({ interval: 14, nextReview: '2026-05-22' }));
  it('21 → ceil((21+60)/2)=41', () => expect(nextSrsState(21, 'hmm', TODAY)).toMatchObject({ interval: 41, nextReview: '2026-06-18' }));
  it('60 (마지막) → 60 유지 (졸업 아님)', () => expect(nextSrsState(60, 'hmm', TODAY)).toMatchObject({ interval: 60, graduate: false }));
});

describe('nextSrsState — 안전성', () => {
  it('알 수 없는 interval → 1 로 폴백', () => {
    expect(nextSrsState(99, 'got', TODAY)).toEqual({ interval: 3, nextReview: '2026-05-11', graduate: false });
  });
  it('null interval + got → 1 폴백 → 3', () => {
    expect(nextSrsState(null, 'got', TODAY)).toEqual({ interval: 3, nextReview: '2026-05-11', graduate: false });
  });
  it('알 수 없는 kind → 현 간격 유지', () => {
    expect(nextSrsState(7, 'xyz', TODAY)).toMatchObject({ interval: 7, graduate: false });
  });
});
