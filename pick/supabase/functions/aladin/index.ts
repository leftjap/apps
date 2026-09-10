// 알라딘 OpenAPI 프록시 — dev vite proxy(/api/aladin)의 prod 대응. ttbkey 는 secret 으로 서버측 주입.
// 클라이언트: src/db/aladin.js BASE=`${SUPA}/functions/v1/aladin` (인증 헤더 없음 → config.toml verify_jwt=false).
// 알라딘은 CORS 미지원이라 직접 호출 불가 → 이 프록시가 CORS 헤더를 달아 중계.
// Origin 게이트: 브라우저 cross-origin fetch 는 Origin 을 항상 부착 → Pages origin 만 허용해
// 무인증 직접 호출(TTB 일일쿼터 소진 DoS)을 차단. 헤더 위조 직접호출까지 막지는 못함(저위험 수용).
// 상류 시간 제한 8초 + 카카오 페일오버(2026-09-11, readingtime/README.md "알라딘 장애 대처" ①):
//   시간 초과·연결 실패·5xx·JSON 아님 → KAKAO_REST_API_KEY 가 있으면 카카오 책 검색으로 재조회해 알라딘 응답 모양(+source:"kakao")으로 200,
//   카카오도 실패 → 504 {"error":"upstream unavailable"}. 키가 없으면 종전 계약: 시간 초과 504 {"error":"aladin upstream timeout"},
//   연결 실패 502 {"error":"aladin upstream unreachable"}, 알라딘이 준 응답(503 "서비스를 사용할 수 없습니다." 포함)은 상태·본문 그대로.
//   알라딘이 준 4xx 는 키와 무관하게 그대로 전달(잘못된 요청은 알라딘 몫). ALADIN_FORCE_FAIL=1 이면 상류를 건너뛴다(페일오버 검증용 임시 env).
// 단위 테스트: index_test.ts (deno test --allow-env; vitest 의 *.test.* 패턴을 피하는 이름)
const ALLOW = /^Item(Search|LookUp)\.aspx$/;
// 상류(알라딘) 무응답 실측 40~90초 (2026-09-10, lessons/aladin-proxy-upstream-hang.md). 리딩타임 클라이언트 제한이 20초라
// 알라딘 8초 + 카카오 8초 안에 답을 낸다.
const UPSTREAM_TIMEOUT_MS = 8_000;
const KAKAO_BOOK = 'https://dapi.kakao.com/v3/search/book';
const ORIGIN = 'https://leftjap.github.io';
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const isJson = (text: string) => { try { JSON.parse(text); return true; } catch { return false; } };

type KakaoDoc = { title?: string; authors?: string[]; publisher?: string; datetime?: string; thumbnail?: string; isbn?: string };
type KakaoBooks = { documents?: KakaoDoc[]; meta?: { total_count?: number } };

// 카카오 documents[] → 알라딘 item[] 모양. itemId 는 생략 — 클라이언트 정규화(book/src/db/aladin.js·BookSearch.swift normalize)가
// isbn13 → isbn → itemId 순으로 폴백한다. 카카오 isbn 은 "10자리 13자리" 공백 구분(979 도서는 10자리 칸이 비어 있음).
function toAladin(data: KakaoBooks, query: string, startIndex: number, itemsPerPage: number) {
  const item = (data.documents ?? []).map((d) => {
    const isbns = (d.isbn ?? '').split(/\s+/).filter(Boolean);
    return {
      title: d.title ?? '',
      author: (d.authors ?? []).join(', '),
      publisher: d.publisher ?? '',
      pubDate: (d.datetime ?? '').slice(0, 10),
      cover: d.thumbnail ?? '',
      isbn: isbns.find((s) => s.length !== 13) ?? '',
      isbn13: isbns.find((s) => s.length === 13) ?? '',
      categoryName: '',
      subInfo: { subTitle: '' },
    };
  });
  return { version: '20131101', totalResults: data.meta?.total_count ?? item.length, startIndex, itemsPerPage, query, source: 'kakao', item };
}

// 알라딘 ItemSearch(Query·MaxResults·start) / ItemLookUp(ItemId) 파라미터로 카카오 책 검색. 실패(비 2xx·예외·JSON 아님)는 null.
async function kakao(path: string, p: URLSearchParams, kakaoKey: string) {
  const isLookup = path === 'ItemLookUp.aspx';
  const query = (isLookup ? p.get('ItemId') : p.get('Query')) ?? '';
  const size = Number(p.get('MaxResults')) || 10;
  const page = Number(p.get('start')) || 1;
  const target = new URL(KAKAO_BOOK);
  target.searchParams.set('query', query);
  if (isLookup) target.searchParams.set('target', 'isbn');
  else { target.searchParams.set('size', String(size)); target.searchParams.set('page', String(page)); }
  try {
    const res = await fetch(target, { headers: { Authorization: `KakaoAK ${kakaoKey}` }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    const text = await res.text();
    if (!res.ok) { console.error('kakao failed:', res.status, text.slice(0, 200)); return null; }
    return toAladin(JSON.parse(text), query, page, size);
  } catch (e) {
    console.error('kakao failed:', String(e));
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.headers.get('origin') !== ORIGIN) return json(403, { error: 'forbidden origin' });
  const url = new URL(req.url);
  const path = url.pathname.match(/\/aladin\/([^/]+)$/)?.[1] ?? '';
  if (req.method !== 'GET' || !ALLOW.test(path)) return json(404, { error: 'not found' });
  const key = Deno.env.get('ALADIN_TTB_KEY') ?? '';
  if (!key) return json(500, { error: 'ALADIN_TTB_KEY secret 미설정' });
  const kakaoKey = Deno.env.get('KAKAO_REST_API_KEY') ?? '';
  const target = new URL(`https://www.aladin.co.kr/ttb/api/${path}`);
  url.searchParams.forEach((v, k) => { if (k.toLowerCase() !== 'ttbkey') target.searchParams.set(k, v); });
  target.searchParams.set('ttbkey', key);
  // 알라딘이 준 응답(status·body) 또는 프록시가 만든 실패 응답(시간 초과 504·연결 실패 502)
  let up: { status: number; body: string } | { error: Response };
  if (Deno.env.get('ALADIN_FORCE_FAIL') === '1') {
    up = { error: json(504, { error: 'aladin upstream timeout' }) };
  } else {
    try {
      // 본문 스트림이 멈춘 경우도 같은 신호로 끊기므로 text() 까지 try 안에 둔다
      const res = await fetch(target, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
      up = { status: res.status, body: await res.text() };
    } catch (e) {
      // fetch 예외 메시지는 대상 URL(ttbkey 포함)을 담을 수 있다 → 클라이언트엔 고정 문구만, 로그는 키를 가린다
      console.error('aladin upstream failed:', String(e).replaceAll(key, '<ttbkey>'));
      const timedOut = (e as { name?: string } | null)?.name === 'TimeoutError';
      up = { error: timedOut ? json(504, { error: 'aladin upstream timeout' }) : json(502, { error: 'aladin upstream unreachable' }) };
    }
  }
  if ('status' in up) {
    // 2xx JSON 은 정상. 4xx 는 알라딘이 준 오류(잘못된 요청 등)라 페일오버 대상이 아니다 → 그대로 전달
    const usable = up.status < 500 && (up.status >= 400 || isJson(up.body));
    if (usable || !kakaoKey) return new Response(up.body, { status: up.status, headers: JSON_HEADERS });
  } else if (!kakaoKey) {
    return up.error;
  }
  console.warn('aladin unusable, failover to kakao:', 'status' in up ? up.status : up.error.status);
  const fallback = await kakao(path, url.searchParams, kakaoKey);
  return fallback ? json(200, fallback) : json(504, { error: 'upstream unavailable' });
});
