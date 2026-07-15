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

// TMDB 검색은 한글 띄어쓰기에 민감(2026-07 실측): 질의를 공백으로 토큰화해 제목 토큰과 prefix 정렬 매칭.
// "세븐 킹덤의 기사"(3토큰)는 제목 "세븐킹덤의 기사"(2토큰)와 정렬 실패 → 0건. 공백 하나만 지운
// "세븐킹덤의 기사"는 매칭 ✓. 공백을 전부 지운 "세븐킹덤의기사"는 첫 토큰을 초과해 오히려 0건.
// → 공백 포함 CJK 질의는 원본 + 인접 토큰 병합 변형(공백 1개씩 제거)을 병렬 검색해 id 합집합(원본 우선).
// Aladin(책) 검색엔 없는 TMDB 한정 약점이라 클라이언트에서 보정.
const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/;

function spaceVariants(q) {
  if (!CJK.test(q) || !/\s/.test(q)) return [q];
  const tokens = q.split(/\s+/).filter(Boolean);
  const out = [q];
  for (let i = 0; i < tokens.length - 1; i++) {
    const merged = tokens.slice();
    merged.splice(i, 2, tokens[i] + tokens[i + 1]); // i번째 공백만 제거(인접 토큰 병합)
    out.push(merged.join(' '));
  }
  return out;
}

async function searchVariant(path, q, norm) {
  const data = await call(path, { query: q, language: 'ko-KR', include_adult: 'false' });
  return (data.results || []).map(norm).filter(Boolean);
}

async function search(path, query, norm, max) {
  const q = (query || '').trim();
  if (!q) return [];
  const [primary, ...rest] = spaceVariants(q);
  const lists = await Promise.all([
    searchVariant(path, primary, norm),                              // 원본: 기존 throw 계약 유지
    ...rest.map((v) => searchVariant(path, v, norm).catch(() => [])), // 병합 변형: best-effort
  ]);
  const seen = new Set();
  const merged = [];
  for (const list of lists) for (const item of list) {
    if (seen.has(item.tmdbId)) continue;
    seen.add(item.tmdbId);
    merged.push(item);
  }
  return merged.slice(0, max);
}

/** 영화 키워드 검색 → 정규화 배열. */
export async function searchMovies(query, { max = 8 } = {}) {
  return search('search/movie', query, normMovie, max);
}

/** 드라마(TV) 키워드 검색 → 정규화 배열. */
export async function searchTv(query, { max = 8 } = {}) {
  return search('search/tv', query, normTv, max);
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
