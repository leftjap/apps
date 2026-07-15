// TMDB 클라이언트 정규화·검색 — 실측 응답 shape(2026-06: search/tv 참교육 id276161 · search/movie 기생충 id496243) 기반.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchMovies, searchTv, detailMovie, detailTv } from './tmdb.js';

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
// query 값에 따라 다른 응답 — TMDB 한글 띄어쓰기 민감성 재현용.
function mockFetchByQuery(mapFn) {
  global.fetch = vi.fn(async (url) => {
    const u = new URL(url, 'http://x');
    lastUrl = url;
    return { ok: true, json: async () => mapFn(u.searchParams.get('query'), u.pathname) };
  });
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

// 상세 보강 — 실측 shape(2026-06: /movie/496243+credits, /tv/276161+credits) 기반.
const MOVIE_DETAIL = {
  id: 496243, overview: '기택 가족은 모두 백수다…', runtime: 131,
  genres: [{ id: 35, name: '코미디' }, { id: 53, name: '스릴러' }, { id: 18, name: '드라마' }],
  production_countries: [{ iso_3166_1: 'KR', name: 'South Korea' }],
  credits: {
    cast: [{ name: '송강호' }, { name: '이선균' }, { name: '조여정' }, { name: '최우식' }],
    crew: [{ name: '봉준호', job: 'Director' }, { name: '한진원', job: 'Writer' }],
  },
};
const TV_DETAIL = {
  id: 276161, overview: '참교육 줄거리…', episode_run_time: [60],
  genres: [{ id: 10759, name: 'Action & Adventure' }, { id: 18, name: '드라마' }],
  production_countries: [{ iso_3166_1: 'KR', name: 'South Korea' }], origin_country: ['KR'],
  created_by: [{ name: '홍종찬' }, { name: '이남규' }],
  credits: { cast: [{ name: '김무열' }, { name: '이성민' }, { name: '진기주' }, { name: '엑스트라' }] },
};

describe('detailMovie', () => {
  it('감독·배우top3·제작국·장르·러닝타임·줄거리 정규화', async () => {
    mockFetch(MOVIE_DETAIL);
    expect(await detailMovie('496243')).toEqual({
      summary: '기택 가족은 모두 백수다…', runtime: 131, director: '봉준호',
      cast: ['송강호', '이선균', '조여정'], country: 'South Korea',
      genres: ['코미디', '스릴러', '드라마'],
    });
  });
  it('movie/{id} + append_to_response=credits + ko-KR 로 호출', async () => {
    mockFetch(MOVIE_DETAIL);
    await detailMovie('496243');
    const u = new URL(lastUrl, 'http://x');
    expect(u.pathname).toContain('movie/496243');
    expect(u.searchParams.get('append_to_response')).toBe('credits');
    expect(u.searchParams.get('language')).toBe('ko-KR');
  });
});

describe('detailTv', () => {
  it('연출(created_by)·배우top3·제작국·장르 정규화 (단일 감독 없음)', async () => {
    mockFetch(TV_DETAIL);
    expect(await detailTv('276161')).toEqual({
      summary: '참교육 줄거리…', runtime: 60, director: '홍종찬, 이남규',
      cast: ['김무열', '이성민', '진기주'], country: 'South Korea',
      genres: ['Action & Adventure', '드라마'],
    });
  });
});

// TMDB 검색은 한글 띄어쓰기에 민감(2026-07 실측): "세븐 킹덤의 기사"(공백)는 0건,
// "세븐킹덤의 기사"(공백제거)는 매칭. 반대로 "어벤져스 엔드게임"(공백)은 맞고 공백제거는 0건.
// → 공백 포함 CJK 질의는 원본 + 공백제거본 합집합.
describe('한글 띄어쓰기 민감성 (원본·공백제거 합집합)', () => {
  const SHOW = { id: 224372, name: '세븐킹덤의 기사', original_name: 'A Knight of the Seven Kingdoms',
    first_air_date: '2026-01-18', poster_path: '/p.jpg', overview: '', adult: false };

  it('공백 입력이 0건이어도 공백제거 변형으로 찾는다 (세븐 킹덤의 기사 → HBO 드라마)', async () => {
    mockFetchByQuery((q) => (q === '세븐킹덤의 기사' ? { results: [SHOW] } : { results: [] }));
    const r = await searchTv('세븐 킹덤의 기사');
    expect(r.map((x) => x.tmdbId)).toContain('224372');
  });

  it('공백제거 변형이 0건이어도 원본(띄어쓰기) 결과는 유지 (어벤져스 엔드게임)', async () => {
    const AV = { id: 299534, title: '어벤져스: 엔드게임', release_date: '2019-04-24', poster_path: '/a.jpg', overview: '', adult: false, video: false };
    mockFetchByQuery((q) => (q === '어벤져스 엔드게임' ? { results: [AV] } : { results: [] }));
    const r = await searchMovies('어벤져스 엔드게임');
    expect(r.map((x) => x.tmdbId)).toEqual(['299534']);
  });

  it('원본·공백제거 변형이 같은 작품 반환 시 중복 제거', async () => {
    mockFetchByQuery(() => ({ results: [SHOW] }));
    const r = await searchTv('세븐 킹덤의 기사');
    expect(r.filter((x) => x.tmdbId === '224372')).toHaveLength(1);
  });

  it('영문/공백없는 질의는 단일 검색 (변형 미발동)', async () => {
    mockFetch(MOVIE_RES);
    await searchMovies('Parasite Movie');
    expect(global.fetch).toHaveBeenCalledTimes(1);
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
