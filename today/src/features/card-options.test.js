/**
 * card-options.js 단위 테스트 — cardLabelFromValue (raw card value → 친화 label).
 * 버그: 타임라인 등 표시에서 raw 값('삼성1337')이 그대로 노출. label 매핑 필요.
 */
import { describe, it, expect } from 'vitest';
import { cardLabelFromValue, getCardOptionsForEmail, getDefaultCardForEmail } from './card-options.js';

describe('cardLabelFromValue', () => {
  it('leftjap 삼성1337 → 풀네임 label', () => {
    expect(cardLabelFromValue('삼성1337', 'leftjap@gmail.com')).toBe('삼성카드 MILEAGE PLATINUM (스카이패스)');
  });

  it('leftjap KB국민카드7007 → label', () => {
    expect(cardLabelFromValue('KB국민카드7007', 'leftjap@gmail.com')).toBe('KB국민카드 7007');
  });

  it('soyoun 신한카드 Air → 신한카드 Air One', () => {
    expect(cardLabelFromValue('신한카드 Air', 'soyoun312@gmail.com')).toBe('신한카드 Air One');
  });

  it('soyoun 이미 친화명인 value 는 동일 label', () => {
    expect(cardLabelFromValue('K-패스 신한카드 체크', 'soyoun312@gmail.com')).toBe('K-패스 신한카드 체크');
  });

  it('미등록 value → raw 그대로 (graceful, 예: 소연 옛 import "신한카드")', () => {
    expect(cardLabelFromValue('신한카드', 'soyoun312@gmail.com')).toBe('신한카드');
  });

  it('email 없으면 raw 그대로 (테스트/비로그인 컨텍스트 하위호환)', () => {
    expect(cardLabelFromValue('삼성1337', null)).toBe('삼성1337');
    expect(cardLabelFromValue('삼성1337', undefined)).toBe('삼성1337');
  });

  it('미등록 email → raw 그대로', () => {
    expect(cardLabelFromValue('삼성1337', 'nobody@example.com')).toBe('삼성1337');
  });

  it('null/빈 value → 빈 문자열', () => {
    expect(cardLabelFromValue(null, 'leftjap@gmail.com')).toBe('');
    expect(cardLabelFromValue('', 'leftjap@gmail.com')).toBe('');
  });

  it('다른 사용자 옵션은 격리 (leftjap email 로 소연 카드 조회 시 raw)', () => {
    expect(cardLabelFromValue('신한카드 Air', 'leftjap@gmail.com')).toBe('신한카드 Air');
  });
});

describe('getCardOptionsForEmail / getDefaultCardForEmail (회귀 가드)', () => {
  it('leftjap 첫 옵션 = 삼성1337 (기본카드)', () => {
    expect(getDefaultCardForEmail('leftjap@gmail.com')?.value).toBe('삼성1337');
  });
  it('미등록 email → 현금 fallback', () => {
    const opts = getCardOptionsForEmail('nobody@example.com');
    expect(opts.some((o) => o.value === '현금')).toBe(true);
  });
});
