import { describe, it, expect } from 'vitest';
import { __test__ } from './weight-keypad-sheet.js';

const { updateBuf, formatWkRef } = __test__;

describe('updateBuf', () => {
  it('숫자 누적 + 5자 제한', () => {
    expect(updateBuf('', '7')).toBe('7');
    expect(updateBuf('123.4', '5')).toBe('123.4'); // 5자 초과 무시
  });

  it('del — 마지막 제거', () => {
    expect(updateBuf('73.5', 'del')).toBe('73.');
  });

  it('. 중복 금지 + 빈 buf 는 0. 으로', () => {
    expect(updateBuf('', '.')).toBe('0.');
    expect(updateBuf('73.', '.')).toBe('73.');
  });
});

// P13 — 참조줄 (직전 · 7일 평균). mock fixture 정적값(69.4/69.7) 하드코딩 버그 수정:
// 실 weights rows 기반 동적 계산.
describe('formatWkRef', () => {
  const mk = (date, weight) => ({ date, weight });

  it('기록 없음 → 오늘 첫 기록', () => {
    expect(formatWkRef([])).toBe('오늘 첫 기록');
    expect(formatWkRef(null)).toBe('오늘 첫 기록');
  });

  it('7건 — 직전 = 최신값, 평균 = 7건 평균 (소수1)', () => {
    const rows = [
      mk('2026-06-03', 70.1), mk('2026-06-04', 69.9), mk('2026-06-05', 69.8),
      mk('2026-06-06', 70.0), mk('2026-06-07', 69.6), mk('2026-06-08', 69.5),
      mk('2026-06-09', 69.4),
    ];
    // 평균 488.3/7 = 69.757 → 기존 P12 통계(formatWeight)와 동일한 반올림·소수1 표기 = 69.8
    expect(formatWkRef(rows)).toBe('직전 <b>69.4kg</b> · 7일 평균 <b>69.8kg</b>');
  });

  it('8건+ — 평균은 최근 7건만', () => {
    const rows = [
      mk('2026-06-01', 100), // 7건 밖 — 평균에서 제외돼야
      mk('2026-06-03', 70.1), mk('2026-06-04', 69.9), mk('2026-06-05', 69.8),
      mk('2026-06-06', 70.0), mk('2026-06-07', 69.6), mk('2026-06-08', 69.5),
      mk('2026-06-09', 69.4),
    ];
    // 평균 488.3/7 = 69.757 → 기존 P12 통계(formatWeight)와 동일한 반올림·소수1 표기 = 69.8
    expect(formatWkRef(rows)).toBe('직전 <b>69.4kg</b> · 7일 평균 <b>69.8kg</b>');
  });

  it('1건 — 직전·평균 동일값', () => {
    expect(formatWkRef([mk('2026-06-10', 73.5)])).toBe('직전 <b>73.5kg</b> · 7일 평균 <b>73.5kg</b>');
  });
});
