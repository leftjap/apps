// 알라딘 OpenAPI 프록시 — dev vite proxy(/api/aladin)의 prod 대응. ttbkey 는 secret 으로 서버측 주입.
// 클라이언트: src/db/aladin.js BASE=`${SUPA}/functions/v1/aladin` (인증 헤더 없음 → config.toml verify_jwt=false).
// 알라딘은 CORS 미지원이라 직접 호출 불가 → 이 프록시가 CORS 헤더를 달아 중계.
const ALLOW = /^Item(Search|LookUp)\.aspx$/;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.match(/\/aladin\/([^/]+)$/)?.[1] ?? '';
  if (req.method !== 'GET' || !ALLOW.test(path)) return json(404, { error: 'not found' });
  const key = Deno.env.get('ALADIN_TTB_KEY') ?? '';
  if (!key) return json(500, { error: 'ALADIN_TTB_KEY secret 미설정' });
  const target = new URL(`https://www.aladin.co.kr/ttb/api/${path}`);
  url.searchParams.forEach((v, k) => { if (k.toLowerCase() !== 'ttbkey') target.searchParams.set(k, v); });
  target.searchParams.set('ttbkey', key);
  const res = await fetch(target);
  const body = await res.text();
  return new Response(body, { status: res.status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
});
