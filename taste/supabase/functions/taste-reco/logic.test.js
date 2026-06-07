// taste 추천 엔진 순수 로직 단위 테스트 (Node vitest). edge fn 과 공용인 logic.js 검증.
import { describe, it, expect } from 'vitest';
import { constantTimeEqual, ratedKey, pendingOwners, toOwnerContext } from './logic.js';

describe('constantTimeEqual', () => {
  it('동일 문자열 → true', () => expect(constantTimeEqual('s3cr3t', 's3cr3t')).toBe(true));
  it('다른 문자열 → false', () => expect(constantTimeEqual('s3cr3t', 's3cr3T')).toBe(false));
  it('길이 불일치 → false', () => expect(constantTimeEqual('abc', 'ab')).toBe(false));
  it('비문자열 → false', () => {
    expect(constantTimeEqual(null, 'abc')).toBe(false);
    expect(constantTimeEqual(undefined, 'abc')).toBe(false);
  });
});

describe('ratedKey', () => {
  it('media_type|title(소문자·trim)|year 정규화', () => {
    expect(ratedKey('movie', '  Inception ', 2010)).toBe('movie|inception|2010');
  });
  it('year 없으면 빈값', () => {
    expect(ratedKey('book', '데미안', null)).toBe('book|데미안|');
  });
});

describe('pendingOwners (settle 디바운스)', () => {
  const now = Date.parse('2026-06-07T00:00:00Z');
  const settle = 15 * 60 * 1000;

  it('추천 없는 owner(콜드스타트) + settle 경과 → pending', () => {
    const ratings = [{ owner_id: 'u1', updated_at: '2026-06-06T00:00:00Z' }];
    expect(pendingOwners(ratings, [], settle, now)).toEqual(['u1']);
  });
  it('최신 평가 > 최신 추천 + settle 경과 → pending', () => {
    const ratings = [{ owner_id: 'u1', updated_at: '2026-06-06T23:00:00Z' }];
    const recos = [{ owner_id: 'u1', generated_at: '2026-06-05T00:00:00Z' }];
    expect(pendingOwners(ratings, recos, settle, now)).toEqual(['u1']);
  });
  it('추천이 평가보다 최신 → 제외', () => {
    const ratings = [{ owner_id: 'u1', updated_at: '2026-06-05T00:00:00Z' }];
    const recos = [{ owner_id: 'u1', generated_at: '2026-06-06T00:00:00Z' }];
    expect(pendingOwners(ratings, recos, settle, now)).toEqual([]);
  });
  it('settle 미경과(방금 평가) → 제외', () => {
    const ratings = [{ owner_id: 'u1', updated_at: '2026-06-06T23:59:00Z' }]; // 1분 전
    expect(pendingOwners(ratings, [], settle, now)).toEqual([]);
  });
  it('deleted 평가는 무시', () => {
    const ratings = [{ owner_id: 'u1', updated_at: '2026-06-06T23:00:00Z', deleted_at: '2026-06-06T23:30:00Z' }];
    expect(pendingOwners(ratings, [], settle, now)).toEqual([]);
  });
  it('여러 owner — pending 것만', () => {
    const ratings = [
      { owner_id: 'u1', updated_at: '2026-06-06T00:00:00Z' },          // cold → pending
      { owner_id: 'u2', updated_at: '2026-06-06T00:00:00Z' },          // reco 최신 → 제외
    ];
    const recos = [{ owner_id: 'u2', generated_at: '2026-06-06T12:00:00Z' }];
    expect(pendingOwners(ratings, recos, settle, now)).toEqual(['u1']);
  });
});

describe('toOwnerContext', () => {
  it('compact 평가 + rated_keys + subtype, deleted 제외', () => {
    const ratings = [
      { media_type: 'movie', title: 'Inception', year: 2010, rating: 4.5, meta: { subtype: null } },
      { media_type: 'movie', title: '나의 아저씨', year: 2018, rating: 5.0, meta: { subtype: 'tv' } },
      { media_type: 'book', title: '데미안', year: 1919, rating: 4.0, meta: {}, deleted_at: '2026-01-01T00:00:00Z' },
    ];
    const ctx = toOwnerContext('u1', ratings);
    expect(ctx.owner_id).toBe('u1');
    expect(ctx.count).toBe(2); // deleted 제외
    expect(ctx.ratings[1].subtype).toBe('tv');
    expect(ctx.ratings[0]).toEqual({ media_type: 'movie', title: 'Inception', year: 2010, rating: 4.5, subtype: null });
    expect(ctx.rated_keys).toContain('movie|inception|2010');
    expect(ctx.rated_keys).toContain('movie|나의 아저씨|2018');
  });
});
