// 서재 정렬·분류 — 최신순 = 내가 최근 등록(rated_at)한 순 (작품 출시연도 아님 — 출시순이 담당).
import { describe, it, expect } from 'vitest';
import { CMP, matchCat } from './library.js';

const row = (over) => ({ rated_at: null, created_at: null, year: null, rating: 0, media_type: 'movie', meta: {}, ...over });

describe('library CMP', () => {
  it('recent(최신순): 등록(rated_at) 최신 우선 — 출시연도 무관', async () => {
    const oldMovieRatedToday = row({ title: 'a', year: 1999, rated_at: '2026-06-10T09:00:00Z' });
    const newMovieRatedLastWeek = row({ title: 'b', year: 2026, rated_at: '2026-06-03T09:00:00Z' });
    expect([newMovieRatedLastWeek, oldMovieRatedToday].sort(CMP.recent)[0]).toBe(oldMovieRatedToday);
  });

  it('recent: rated_at 없으면 created_at 폴백', () => {
    const a = row({ created_at: '2026-06-09T00:00:00Z' });
    const b = row({ rated_at: '2026-06-08T00:00:00Z' });
    expect([b, a].sort(CMP.recent)[0]).toBe(a);
  });

  it('released(출시순): 출시연도 신작 우선, 동률은 등록 최신', () => {
    const a = row({ year: 2026, rated_at: '2026-01-01T00:00:00Z' });
    const b = row({ year: 1999, rated_at: '2026-06-10T00:00:00Z' });
    const c = row({ year: 2026, rated_at: '2026-06-09T00:00:00Z' });
    const sorted = [a, b, c].sort(CMP.released);
    expect(sorted[0]).toBe(c);
    expect(sorted[1]).toBe(a);
    expect(sorted[2]).toBe(b);
  });

  it('rating(별점순): 내 별점 높은순', () => {
    const a = row({ rating: 3 });
    const b = row({ rating: 5 });
    expect([a, b].sort(CMP.rating)[0]).toBe(b);
  });
});

describe('library matchCat', () => {
  it('drama: media_type=movie + meta.subtype=tv', () => {
    const drama = row({ media_type: 'movie', meta: { subtype: 'tv' } });
    const film = row({ media_type: 'movie' });
    expect(matchCat(drama, 'drama')).toBe(true);
    expect(matchCat(drama, 'movie')).toBe(false);
    expect(matchCat(film, 'movie')).toBe(true);
    expect(matchCat(film, 'drama')).toBe(false);
  });
});
