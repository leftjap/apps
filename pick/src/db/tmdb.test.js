// TMDB 클라이언트 정규화·검색 — 실측 응답 shape(2026-06: search/tv 참교육 id276161 · search/movie 기생충 id496243) 기반.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchMovies, searchTv } from './tmdb.js';

const TV_RES = {
  results: [
    { id: 276161, name: '참교육', original_name: '참교육', first_air_date: '2026-06-05',
      poster_path: '/36BnxmIvWvOsMmlQfbI0ilTfuvh.jpg', overview: '줄거리 텍스트', adult: false },
  ],
};
const MOVIE_RES = {
  results: [
    { id: 496243, title: '기생충', original_title: '기생충', release_date: '2019-05-30',
      poster_path: '/jjHccoFjbqlfr4VGLVLT7yek0Xn.jpg', overview: '줄거리 텍스트', adult: false, video: false },
  ],
};

let lastUrl;
function mockFetch(data) {
  global.fetch = vi.fn(async (url) => { lastUrl = url; return { ok: true, json: async () => data }; });
}
beforeEach(() => { lastUrl = undefined; });

describe('searchTv', () => {
  it('참교육 → 드라마 정규화 (name·first_air_date·poster, isTv=true)', async () => {
    mockFetch(TV_RES);
    expect(await searchTv('참교육')).toEqual([{
      tmdbId: '276161', title: '참교육', year: 2026,
      posterUrl: 'https://image.tmdb.org/t/p/w185/36BnxmIvWvOsMmlQfbI0ilTfuvh.jpg',
      overview: '줄거리 텍스트', isTv: true,
    }]);
  });

  it('search/tv 엔드포인트 + query·language=ko-KR 로 호출', async () => {
    mockFetch(TV_RES);
    await searchTv('참교육');
    const u = new URL(lastUrl, 'http://x');
    expect(u.pathname).toContain('search/tv');
    expect(u.searchParams.get('query')).toBe('참교육');
    expect(u.searchParams.get('language')).toBe('ko-KR');
  });

  it('name 비면 original_name 폴백, poster_path 없으면 빈 문자열', async () => {
    mockFetch({ results: [{ id: 1, name: '', original_name: 'Original', first_air_date: '2020-01-01', poster_path: null, adult: false }] });
    const r = await searchTv('x');
    expect(r[0].title).toBe('Original');
    expect(r[0].posterUrl).toBe('');
  });

  it('adult 항목 제외', async () => {
    mockFetch({ results: [{ id: 9, name: 'X', first_air_date: '2020-01-01', adult: true }] });
    expect(await searchTv('x')).toEqual([]);
  });
});

describe('searchMovies', () => {
  it('기생충 → 영화 정규화 (title·release_date, isTv=false)', async () => {
    mockFetch(MOVIE_RES);
    expect((await searchMovies('기생충'))[0]).toEqual({
      tmdbId: '496243', title: '기생충', year: 2019,
      posterUrl: 'https://image.tmdb.org/t/p/w185/jjHccoFjbqlfr4VGLVLT7yek0Xn.jpg',
      overview: '줄거리 텍스트', isTv: false,
    });
  });

  it('video=true(예고편류) 제외', async () => {
    mockFetch({ results: [{ id: 5, title: 'Trailer', release_date: '2020-01-01', adult: false, video: true }] });
    expect(await searchMovies('x')).toEqual([]);
  });
});

describe('빈 쿼리', () => {
  it('빈/공백 쿼리는 fetch 없이 [] 반환', async () => {
    mockFetch(TV_RES);
    expect(await searchTv('   ')).toEqual([]);
    expect(await searchMovies('')).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
