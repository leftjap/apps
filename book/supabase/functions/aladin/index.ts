/**
 * 알라딘 OpenAPI 프록시 (Edge Function).
 *  - 목적: 정적 배포(GitHub Pages)엔 dev 의 vite proxy(/api/aladin)가 없어 알라딘 검색이 404.
 *    알라딘은 CORS 미지원 → 서버측 프록시로 ttbkey 주입 + CORS 헤더 부여.
 *  - 요청: /functions/v1/aladin/ItemSearch.aspx?Query=...  → 알라딘 /ttb/api/ItemSearch.aspx?...&ttbkey
 *  - 키: ALADIN_TTB_KEY (Supabase secret, 서버측만). 클라 번들 미노출.
 *  - 배포: supabase functions deploy aladin --no-verify-jwt (공개 검색 — 무인증, 알라딘 읽기 전용).
 */
const TTB = Deno.env.get('ALADIN_TTB_KEY') ?? '';
const ORIGIN = 'https://www.aladin.co.kr/ttb/api';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const u = new URL(req.url);
  // 함수명(/aladin) 뒤 하위 경로만 알라딘으로 전달. 기본은 ItemSearch.
  const sub = u.pathname.replace(/^\/aladin/, '') || '/ItemSearch.aspx';
  if (!TTB) {
    return new Response(JSON.stringify({ errorCode: 'NO_KEY', errorMessage: 'ALADIN_TTB_KEY 미설정(secret)' }),
      { status: 500, headers: { ...cors, 'content-type': 'application/json' } });
  }
  const target = `${ORIGIN}${sub}?${u.searchParams.toString()}&ttbkey=${encodeURIComponent(TTB)}`;
  try {
    const r = await fetch(target);
    const text = await r.text();
    return new Response(text, { status: r.status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' } });
  } catch (e) {
    return new Response(JSON.stringify({ errorCode: 'PROXY_FAIL', errorMessage: String((e as Error)?.message || e) }),
      { status: 502, headers: { ...cors, 'content-type': 'application/json' } });
  }
});
