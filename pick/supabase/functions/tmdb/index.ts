// TMDB API 프록시 — dev vite proxy(/api/tmdb)의 prod 대응. api_key 는 secret 으로 서버측 주입.
// 클라이언트: src/db/tmdb.js BASE=`${SUPA}/functions/v1/tmdb` (인증 헤더 없음 → config.toml verify_jwt=false).
// TMDB 는 CORS 지원하나 키 은닉 위해 프록시 경유. aladin 함수 미러.
// Origin 게이트: Pages origin 만 허용해 무인증 직접 호출(TMDB 쿼터 소진)을 차단(헤더 위조까진 못 막음, 저위험 수용).
const ALLOW = /^(search\/(movie|tv|multi)|(movie|tv)\/\d+)$/;
const ORIGIN = 'https://leftjap.github.io';
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.headers.get('origin') !== ORIGIN) return json(403, { error: 'forbidden origin' });
  const url = new URL(req.url);
  const path = url.pathname.match(/\/tmdb\/(.+)$/)?.[1] ?? '';
  if (req.method !== 'GET' || !ALLOW.test(path)) return json(404, { error: 'not found' });
  const key = Deno.env.get('TMDB_API_KEY') ?? '';
  if (!key) return json(500, { error: 'TMDB_API_KEY secret 미설정' });
  const target = new URL(`https://api.themoviedb.org/3/${path}`);
  url.searchParams.forEach((v, k) => { if (k.toLowerCase() !== 'api_key') target.searchParams.set(k, v); });
  target.searchParams.set('api_key', key);
  const res = await fetch(target);
  const body = await res.text();
  return new Response(body, { status: res.status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
});
