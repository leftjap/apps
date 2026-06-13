// 갈래에서 이미 평가한 작품 제외 — 버그 재현(2026-06: 참교육 갈래에 평가작 'D.P. 시즌 1' 노출).
// 엔진(pick-reco)의 LLM 제외는 소프트라 누락 가능 + 평가 후 시점 미반영 → 표시 단계 결정적 안전망.
import { describe, it, expect } from 'vitest';
import { excludeRated } from './branches-filter.js';

describe('excludeRated', () => {
  it('평가작(ratedKey 일치)은 external_id 달라도 갈래에서 제외 (D.P. 재현)', () => {
    const branches = [
      { title: 'D.P. 시즌 1', year: 2021, media_type: 'movie', external_id: '110534' },
      { title: 'D.P. 시즌 1', year: 2021, media_type: 'movie', external_id: 'tR726m9' }, // 중복(다른 ext)도 제거
      { title: '소년심판', year: 2022, media_type: 'movie', external_id: 'x' },
      { title: 'D.P. 시즌 2', year: 2023, media_type: 'movie', external_id: 'y' }, // 시즌2는 미평가 → 유지
    ];
    const ratings = [
      { title: 'D.P. 시즌 1', year: 2021, media_type: 'movie', external_id: null }, // CSV평가라 ext null
      { title: '버닝', year: 2018, media_type: 'movie' },
    ];
    expect(excludeRated(branches, ratings).map((b) => `${b.title}|${b.year}`))
      .toEqual(['소년심판|2022', 'D.P. 시즌 2|2023']);
  });

  it('soft-deleted 평가는 제외 기준에서 무시 (갈래 유지)', () => {
    const out = excludeRated(
      [{ title: '소년심판', year: 2022, media_type: 'movie' }],
      [{ title: '소년심판', year: 2022, media_type: 'movie', deleted_at: '2026-01-01' }],
    );
    expect(out).toHaveLength(1);
  });

  it('제목 대소문자·공백 정규화', () => {
    const out = excludeRated(
      [{ title: '  The Bear ', year: 2022, media_type: 'movie' }],
      [{ title: 'the bear', year: 2022, media_type: 'movie' }],
    );
    expect(out).toHaveLength(0);
  });

  it('media_type/year 다르면 제외 안 함 (동명 책 vs 영화)', () => {
    const out = excludeRated(
      [{ title: '버닝', year: 2018, media_type: 'book' }],
      [{ title: '버닝', year: 2018, media_type: 'movie' }],
    );
    expect(out).toHaveLength(1);
  });

  it('빈 입력 안전', () => {
    expect(excludeRated(null, null)).toEqual([]);
    expect(excludeRated([{ title: 'X', year: 1, media_type: 'movie' }], [])).toHaveLength(1);
  });
});
