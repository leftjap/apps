// 알라딘 OpenAPI 프록시 — dev vite proxy(/api/aladin)의 prod 대응. ttbkey 는 secret 으로 서버측 주입.
// 클라이언트: src/db/aladin.js BASE=`${SUPA}/functions/v1/aladin` (인증 헤더 없음 → config.toml verify_jwt=false).
// 알라딘은 CORS 미지원이라 직접 호출 불가 → 이 프록시가 CORS 헤더를 달아 중계.
// Origin 게이트: 브라우저 cross-origin fetch 는 Origin 을 항상 부착 → Pages origin 만 허용해
// 무인증 직접 호출(TTB 일일쿼터 소진 DoS)을 차단. 헤더 위조 직접호출까지 막지는 못함(저위험 수용).
// 상류 시간 제한 15초: 초과 시 504 {"error":"aladin upstream timeout"}, 연결 실패 502 {"error":"aladin upstream unreachable"}.
// 알라딘이 준 응답(503 "서비스를 사용할 수 없습니다." 포함)은 상태·본문 그대로 전달. 단위 테스트: index_test.ts (deno test --allow-env; vitest 의 *.test.* 패턴을 피하는 이름)
const ALLOW = /^Item(Search|LookUp)\.aspx$/;
// 상류(알라딘) 무응답 실측 40~90초 (2026-09-10, lessons/aladin-proxy-upstream-hang.md) — 시간 제한 없이 기다리면
// Book·Pick(브라우저 fetch 는 타임아웃 없음)·리딩타임이 같이 멈추므로 15초에 끊는다.
const UPSTREAM_TIMEOUT_MS = 15_000;
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
  const path = url.pathname.match(/\/aladin\/([^/]+)$/)?.[1] ?? '';
  if (req.method !== 'GET' || !ALLOW.test(path)) return json(404, { error: 'not found' });
  const key = Deno.env.get('ALADIN_TTB_KEY') ?? '';
  if (!key) return json(500, { error: 'ALADIN_TTB_KEY secret 미설정' });
  const target = new URL(`https://www.aladin.co.kr/ttb/api/${path}`);
  url.searchParams.forEach((v, k) => { if (k.toLowerCase() !== 'ttbkey') target.searchParams.set(k, v); });
  target.searchParams.set('ttbkey', key);
  let status: number;
  let body: string;
  try {
    // 본문 스트림이 멈춘 경우도 같은 신호로 끊기므로 text() 까지 try 안에 둔다
    const res = await fetch(target, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    status = res.status;
    body = await res.text();
  } catch (e) {
    // fetch 예외 메시지는 대상 URL(ttbkey 포함)을 담을 수 있다 → 클라이언트엔 고정 문구만, 로그는 키를 가린다
    console.error('aladin upstream failed:', String(e).replaceAll(key, '<ttbkey>'));
    const timedOut = (e as { name?: string } | null)?.name === 'TimeoutError';
    return timedOut ? json(504, { error: 'aladin upstream timeout' }) : json(502, { error: 'aladin upstream unreachable' });
  }
  return new Response(body, { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
});
