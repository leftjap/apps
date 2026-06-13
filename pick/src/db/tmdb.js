/**
 * TMDB API 클라이언트 (영화·드라마 라이브 검색). aladin.js 미러.
 *  - dev: Vite proxy(/api/tmdb)가 api_key 주입 (vite.config.js).
 *  - prod(정적 배포): Supabase Edge Function(tmdb) 경유. 키는 서버측에만(클라 번들 미포함).
 *  - searchMovies(query) → 정규화 영화 배열, searchTv(query) → 정규화 드라마 배열
 *  정규화: { tmdbId, title, year, posterUrl, overview, isTv }
 *  ※ 응답 필드/엔드포인트는 실측 검증(2026-06): search/tv→name·first_air_date, search/movie→title·release_date.
 */

const SUPA = (import.meta.env && import.meta.env.VITE_SUPABASE_URL) || '';
// dev: vite proxy(/api/tmdb)가 api_key 주입. prod(정적): Supabase Edge Function(tmdb) 경유.
const BASE = (import.meta.env && import.meta.env.DEV) ? '/api/tmdb' : `${SUPA}/functions/v1/tmdb`;
const IMG = 'https://image.tmdb.org/t/p/w185'; // /configuration 실측: secure_base_url + poster size w185

function yearOf(date) {
  const m = (date || '').match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}
function posterOf(path) {
  return path ? IMG + path : '';
}

function normMovie(item) {
  if (!item || item.adult || item.video) return null;
  if (!item.id) return null;
  const title = item.title || item.original_title || '';
  if (!title) return null;
  return { tmdbId: String(item.id), title, year: yearOf(item.release_date), posterUrl: posterOf(item.poster_path), overview: item.overview || '', isTv: false };
}
function normTv(item) {
  if (!item || item.adult) return null;
  if (!item.id) return null;
  const title = item.name || item.original_name || '';
  if (!title) return null;
  return { tmdbId: String(item.id), title, year: yearOf(item.first_air_date), posterUrl: posterOf(item.poster_path), overview: item.overview || '', isTv: true };
}

async function call(path, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/${path}?${qs}`);
  if (!res.ok) throw new Error(`TMDB API 응답 ${res.status} (배포 환경이면 프록시 미설정일 수 있음)`);
  return res.json();
}

/** 영화 키워드 검색 → 정규화 배열. */
export async function searchMovies(query, { max = 8 } = {}) {
  const q = (query || '').trim();
  if (!q) return [];
  const data = await call('search/movie', { query: q, language: 'ko-KR', include_adult: 'false' });
  return (data.results || []).map(normMovie).filter(Boolean).slice(0, max);
}

/** 드라마(TV) 키워드 검색 → 정규화 배열. */
export async function searchTv(query, { max = 8 } = {}) {
  const q = (query || '').trim();
  if (!q) return [];
  const data = await call('search/tv', { query: q, language: 'ko-KR', include_adult: 'false' });
  return (data.results || []).map(normTv).filter(Boolean).slice(0, max);
}

function names(arr, n) {
  return (Array.isArray(arr) ? arr : []).slice(0, n).map((x) => x && x.name).filter(Boolean);
}
function countryOf(d) {
  const pc = (d.production_countries || []).map((c) => c.name).filter(Boolean);
  return pc.join(', ');
}

/** 영화 상세 보강 → { summary, runtime, director, cast[], country, genres[] }. */
export async function detailMovie(id) {
  if (!id) return null;
  const d = await call('movie/' + id, { language: 'ko-KR', append_to_response: 'credits' });
  const crew = (d.credits && d.credits.crew) || [];
  return {
    summary: d.overview || '',
    runtime: d.runtime || null,
    director: crew.filter((c) => c.job === 'Director').map((c) => c.name).join(', '),
    cast: names((d.credits && d.credits.cast) || [], 3),
    country: countryOf(d),
    genres: (d.genres || []).map((g) => g.name).filter(Boolean),
  };
}

/** 드라마 상세 보강 → { summary, runtime, director(=연출/created_by), cast[], country, genres[] }. */
export async function detailTv(id) {
  if (!id) return null;
  const d = await call('tv/' + id, { language: 'ko-KR', append_to_response: 'credits' });
  return {
    summary: d.overview || '',
    runtime: (Array.isArray(d.episode_run_time) && d.episode_run_time[0]) || null,
    director: names(d.created_by, 9).join(', '), // TV는 단일 감독 없음 → 크리에이터(연출/제작)
    cast: names((d.credits && d.credits.cast) || [], 3),
    country: countryOf(d),
    genres: (d.genres || []).map((g) => g.name).filter(Boolean),
  };
}

export const Tmdb = { searchMovies, searchTv, detailMovie, detailTv };
