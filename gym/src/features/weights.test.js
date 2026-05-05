/**
 * weights.js 단위 테스트 — DB 무관 순수 함수 (Wave 11.7.2a).
 */
import { describe, it, expect } from 'vitest';
import {
  sma7,
  isWeightPR,
  calculateRemainingLoss,
  estimateGoalDate,
  parseWeightInput,
} from './weights.js';

describe('sma7 (7일 이동평균)', () => {
  it('빈 배열 → 빈 배열', () => {
    expect(sma7([])).toEqual([]);
  });

  it('1건 → 자기 자신', () => {
    const out = sma7([{ date: '2026-04-01', weight: 70 }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ date: '2026-04-01', sma: 70 });
  });

  it('7건 미만은 partial 평균 (앞 6일 미만 데이터로 평균)', () => {
    const ws = [
      { date: '2026-04-01', weight: 70 },
      { date: '2026-04-02', weight: 72 },
      { date: '2026-04-03', weight: 68 },
    ];
    const out = sma7(ws);
    expect(out[0].sma).toBe(70);
    expect(out[1].sma).toBe(71);
    expect(out[2].sma).toBeCloseTo(70, 5);
  });

  it('7건 이상은 정확히 7일 윈도우', () => {
    const ws = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      weight: 70 + i,
    }));
    const out = sma7(ws);
    // i=6 일 때 [70,71,72,73,74,75,76] avg = 73
    expect(out[6].sma).toBe(73);
    // i=9 일 때 [73,74,75,76,77,78,79] avg = 76
    expect(out[9].sma).toBe(76);
  });

  it('date 보존', () => {
    const ws = [{ date: '2026-04-01', weight: 70 }, { date: '2026-04-02', weight: 71 }];
    const out = sma7(ws);
    expect(out[0].date).toBe('2026-04-01');
    expect(out[1].date).toBe('2026-04-02');
  });
});

describe('isWeightPR (신기록 판정)', () => {
  it('비어있는 prevWeights → false (첫 입력은 비교 대상 없음)', () => {
    expect(isWeightPR(70, [])).toBe(false);
  });

  it('이전 최저보다 낮으면 true', () => {
    const prev = [{ weight: 73 }, { weight: 72 }, { weight: 74 }];
    expect(isWeightPR(71.5, prev)).toBe(true);
  });

  it('이전 최저와 같으면 false (엄격 미만)', () => {
    const prev = [{ weight: 72 }, { weight: 73 }];
    expect(isWeightPR(72, prev)).toBe(false);
  });

  it('이전 최저보다 높으면 false', () => {
    const prev = [{ weight: 70 }];
    expect(isWeightPR(71, prev)).toBe(false);
  });

  it('newWeight 비숫자 → false', () => {
    expect(isWeightPR(NaN, [{ weight: 70 }])).toBe(false);
    expect(isWeightPR(undefined, [{ weight: 70 }])).toBe(false);
  });
});

describe('calculateRemainingLoss', () => {
  it('현재 > 목표 → 차이 (소수점 1자리)', () => {
    expect(calculateRemainingLoss(73.4, 69)).toBe(4.4);
  });

  it('현재 <= 목표 → 0', () => {
    expect(calculateRemainingLoss(69, 69)).toBe(0);
    expect(calculateRemainingLoss(67, 69)).toBe(0);
  });

  it('소수점 반올림', () => {
    expect(calculateRemainingLoss(73.45, 69)).toBeCloseTo(4.5, 5);
  });
});

describe('estimateGoalDate', () => {
  it('이미 달성 → 오늘 ISO', () => {
    const fixed = new Date('2026-04-30T12:00:00');
    expect(estimateGoalDate(68, 69, 1.5, fixed)).toBe('2026-04-30');
  });

  it('월 1.5kg 페이스 — 정확한 day 계산', () => {
    // remaining=3kg → 3/1.5 * 30.44 = 60.88 → ceil 61일
    const fixed = new Date('2026-04-01T00:00:00');
    const result = estimateGoalDate(72, 69, 1.5, fixed);
    // 4월 1일 + 61일 = 6월 1일
    expect(result).toBe('2026-06-01');
  });

  it('비숫자 입력 → null', () => {
    expect(estimateGoalDate(NaN, 69)).toBeNull();
    expect(estimateGoalDate(72, undefined)).toBeNull();
  });

  it('monthlyLossKg <= 0 → null', () => {
    expect(estimateGoalDate(72, 69, 0)).toBeNull();
    expect(estimateGoalDate(72, 69, -1)).toBeNull();
  });
});

describe('parseWeightInput', () => {
  it('정상 number / string', () => {
    expect(parseWeightInput(73)).toBe(73);
    expect(parseWeightInput('73.4')).toBe(73.4);
    expect(parseWeightInput('  73.45 ')).toBe(73.5); // 소수점 1자리 반올림
  });
  it('comma 를 dot 으로 정규화', () => {
    expect(parseWeightInput('73,4')).toBe(73.4);
  });
  it('빈 문자열·null·undefined → null', () => {
    expect(parseWeightInput('')).toBeNull();
    expect(parseWeightInput(null)).toBeNull();
    expect(parseWeightInput(undefined)).toBeNull();
  });
  it('잘못된 문자열 → null', () => {
    expect(parseWeightInput('abc')).toBeNull();
    expect(parseWeightInput('--')).toBeNull();
  });
  it('0·음수 → null', () => {
    expect(parseWeightInput(0)).toBeNull();
    expect(parseWeightInput(-1)).toBeNull();
  });
});
