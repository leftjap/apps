import { describe, it, expect } from 'vitest';
import { starFill, isPan, ratingLabel } from './rating.js';

describe('starFill (별 i의 채움 0~100%)', () => {
  it('4.5 → 별4 100%, 별5 50%', () => { expect(starFill(4.5, 4)).toBe(100); expect(starFill(4.5, 5)).toBe(50); });
  it('0.5 → 별1 50%, 별2 0%', () => { expect(starFill(0.5, 1)).toBe(50); expect(starFill(0.5, 2)).toBe(0); });
  it('3.0 → 별3 100%, 별4 0%', () => { expect(starFill(3.0, 3)).toBe(100); expect(starFill(3.0, 4)).toBe(0); });
  it('0 → 전부 0', () => { for (let i = 1; i <= 5; i++) expect(starFill(0, i)).toBe(0); });
});

describe('isPan (0.5★=비추)', () => {
  it('0.5만 비추', () => { expect(isPan(0.5)).toBe(true); expect(isPan(1)).toBe(false); expect(isPan(0)).toBe(false); });
});

describe('ratingLabel (보조 — UI 미표시, aria/유틸용. spec D2 앵커)', () => {
  it('앵커 라벨 매핑', () => {
    expect(ratingLabel(0.5)).toBe('비추');
    for (const v of [1.0, 1.5, 2.0]) expect(ratingLabel(v)).toBe('별로');
    for (const v of [2.5, 3.0]) expect(ratingLabel(v)).toBe('보통');
    for (const v of [3.5, 4.0]) expect(ratingLabel(v)).toBe('추천');
    for (const v of [4.5, 5.0]) expect(ratingLabel(v)).toBe('최애');
    expect(ratingLabel(null)).toBe('');
  });
});
