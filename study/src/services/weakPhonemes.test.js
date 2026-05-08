import { describe, it, expect } from 'vitest';
import { accumulateWeakPhonemes } from './weakPhonemes.js';

describe('accumulateWeakPhonemes', () => {
  it('prev null + 신규 배열 → 빈 카운터에서 누적', () => {
    expect(accumulateWeakPhonemes(null, ['θ', 'ɹ'])).toEqual({ θ: 1, ɹ: 1 });
  });

  it('prev 있음 + 동일 phoneme → 카운트 증가', () => {
    expect(accumulateWeakPhonemes({ θ: 3 }, ['θ'])).toEqual({ θ: 4 });
  });

  it('prev 있음 + 다른 phoneme → 추가 + 기존 보존', () => {
    expect(accumulateWeakPhonemes({ θ: 3 }, ['ɹ'])).toEqual({ θ: 3, ɹ: 1 });
  });

  it('한 배열에 동일 phoneme 중복 → 각각 +1', () => {
    expect(accumulateWeakPhonemes({}, ['ɛ', 'ɛ', 'θ'])).toEqual({ ɛ: 2, θ: 1 });
  });

  it('빈 배열 → 변경 없이 prev 복사', () => {
    expect(accumulateWeakPhonemes({ θ: 5 }, [])).toEqual({ θ: 5 });
  });

  it('non-array → prev 복사', () => {
    expect(accumulateWeakPhonemes({ θ: 5 }, null)).toEqual({ θ: 5 });
    expect(accumulateWeakPhonemes({ θ: 5 }, undefined)).toEqual({ θ: 5 });
  });

  it('non-string / 빈 문자열 항목은 무시', () => {
    expect(accumulateWeakPhonemes({}, ['θ', '', null, 42, undefined, 'ɹ'])).toEqual({ θ: 1, ɹ: 1 });
  });

  it('prev 가 array (잘못된 타입) → 빈 카운터에서 시작', () => {
    expect(accumulateWeakPhonemes(['x'], ['θ'])).toEqual({ θ: 1 });
  });

  it('prev 가 number value 가진 항목 — Number() 폴백', () => {
    expect(accumulateWeakPhonemes({ θ: '7' }, ['θ'])).toEqual({ θ: 8 });
  });
});
