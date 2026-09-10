// 알라딘 프록시 핸들러 단위 테스트 — 네트워크 없이 상류(알라딘) 장애 계약과 카카오 페일오버를 검증한다.
// 배경(2026-09-10 실측, lessons/aladin-proxy-upstream-hang.md): ItemSearch 상류가 40~90초 무응답이면
// 프록시 fetch 에 시간 제한이 없어 Book·Pick·리딩타임 세 앱이 같이 멈췄다. 검색 소스가 알라딘 하나라 장애 중엔
// 결과가 없으므로 카카오 책 검색으로 페일오버한다(readingtime/README.md "알라딘 장애 대처" ①, 2026-09-11).
//   deno test --allow-env pick/supabase/functions/aladin/index_test.ts   (저장소 루트에서. pick/ 안에서 돌리면 package.json 감지로 @types/node 해석 실패)
// index.ts 는 최상위에서 Deno.serve(handler) 를 부르므로 import 전에 Deno.serve 를 가로채 handler 를 얻고,
// fetch·AbortSignal.timeout·console.error·env 는 테스트마다 바꿔 끼운 뒤 원복한다.
import assert from 'node:assert/strict';

type Handler = (req: Request) => Response | Promise<Response>;
let handler: Handler | undefined;
Object.defineProperty(Deno, 'serve', {
  configurable: true,
  writable: true,
  value: (h: Handler) => { handler = h; return undefined as never; },
});
Deno.env.set('ALADIN_TTB_KEY', 'test-ttb-key');
Deno.env.delete('KAKAO_REST_API_KEY');
Deno.env.delete('ALADIN_FORCE_FAIL');
await import('./index.ts');

const ORIGIN = 'https://leftjap.github.io';
const BASE = 'https://tcbooffrdacfatywdzcm.supabase.co/functions/v1/aladin/';
// Book·리딩타임 클라이언트가 실제로 보내는 파라미터 (book/src/db/aladin.js COMMON 포함)
const search = () => new Request(
  `${BASE}ItemSearch.aspx?Query=%EC%84%9C%EC%84%B1%EC%9D%B4%EB%8B%A4&QueryType=Keyword&MaxResults=3&start=1&SearchTarget=Book&output=js&Version=20131101&Cover=Big`,
  { headers: { origin: ORIGIN } },
);
const lookup = () => new Request(
  `${BASE}ItemLookUp.aspx?ItemId=9791167903792&ItemIdType=ISBN13&output=js&Version=20131101&Cover=Big`,
  { headers: { origin: ORIGIN } },
);

type Upstream = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;
// 상류 fetch 를 흉내 내는 동안 핸들러를 실행하고 원복. console.error 출력은 모아서 돌려주고 console.warn 은 숨긴다.
async function withUpstream(impl: Upstream, run: () => Promise<void>): Promise<string[]> {
  const origFetch = globalThis.fetch;
  const origError = console.error;
  const origWarn = console.warn;
  const logs: string[] = [];
  globalThis.fetch = impl as typeof fetch;
  console.error = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  console.warn = () => {};
  try { await run(); } finally { globalThis.fetch = origFetch; console.error = origError; console.warn = origWarn; }
  return logs;
}
// AbortSignal.timeout 을 바꿔 끼운 동안 실행하고 원복
async function withTimeout(impl: (ms: number) => AbortSignal, run: () => Promise<void>) {
  const orig = AbortSignal.timeout;
  AbortSignal.timeout = impl;
  try { await run(); } finally { AbortSignal.timeout = orig; }
}
// env 를 넣고 실행, 끝나면 제거
async function withEnv(vars: Record<string, string>, run: () => Promise<void>) {
  for (const [k, v] of Object.entries(vars)) Deno.env.set(k, v);
  try { await run(); } finally { for (const k of Object.keys(vars)) Deno.env.delete(k); }
}
const urlOf = (input: URL | RequestInfo) => new URL(input instanceof Request ? input.url : String(input));
const timeoutError = () => new DOMException('The operation was aborted due to timeout', 'TimeoutError');
// 알라딘·카카오 호출을 host 로 갈라 흉내 낸다. 호출 횟수·마지막 카카오 호출을 기록.
function route(aladin: Upstream, kakao: Upstream) {
  const seen = { aladin: 0, kakao: 0, kakaoUrl: null as URL | null, kakaoInit: undefined as RequestInit | undefined };
  const impl: Upstream = (input, init) => {
    if (urlOf(input).hostname === 'dapi.kakao.com') { seen.kakao++; seen.kakaoUrl = urlOf(input); seen.kakaoInit = init; return kakao(input, init); }
    seen.aladin++;
    return aladin(input, init);
  };
  return { impl, seen };
}
// 카카오 책 검색 응답 축약. isbn 은 "10자리 13자리" 공백 구분이고 979 도서는 10자리 칸이 비어 있다(실제 모양).
const KAKAO_BODY = {
  documents: [
    { title: '서성이다', contents: '…', url: 'https://search.daum.net/search?w=bookpage&bookId=1', isbn: ' 9791167903792',
      datetime: '2026-08-20T00:00:00.000+09:00', authors: ['장강명'], publisher: '현대문학', translators: [],
      price: 16800, sale_price: 15120, thumbnail: 'https://search1.kakaocdn.net/thumb/R120x174.q85/?fname=a', status: '정상판매' },
    { title: '한국이 싫어서', contents: '…', url: 'https://search.daum.net/search?w=bookpage&bookId=2', isbn: '8937473097 9788937473098',
      datetime: '2015-05-08T00:00:00.000+09:00', authors: ['장강명', '아무개'], publisher: '민음사', translators: [],
      price: 13000, sale_price: 11700, thumbnail: 'https://search1.kakaocdn.net/thumb/R120x174.q85/?fname=b', status: '정상판매' },
  ],
  meta: { is_end: true, pageable_count: 2, total_count: 19 },
};
const kakaoOk: Upstream = async () => new Response(JSON.stringify(KAKAO_BODY), { status: 200, headers: { 'content-type': 'application/json;charset=UTF-8' } });
const aladinItem = (d: typeof KAKAO_BODY.documents[number], isbn: string, isbn13: string) => ({
  title: d.title, author: d.authors.join(', '), publisher: d.publisher, pubDate: d.datetime.slice(0, 10), cover: d.thumbnail,
  isbn, isbn13, categoryName: '', subInfo: { subTitle: '' },
});

Deno.test('상류 fetch 에 AbortSignal.timeout(8초) 를 걸고 정상 응답은 그대로 전달', async () => {
  const origTimeout = AbortSignal.timeout;
  const calls: number[] = [];
  let signal: AbortSignal | null | undefined;
  await withTimeout((ms) => { calls.push(ms); return origTimeout.call(AbortSignal, ms); }, async () => {
    await withUpstream(async (_input, init) => { signal = init?.signal; return new Response('{"item":[]}', { status: 200 }); }, async () => {
      const res = await handler!(search());
      assert.equal(res.status, 200);
      assert.equal(await res.text(), '{"item":[]}');
      assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
    });
  });
  assert.deepEqual(calls, [8_000]);
  assert.ok(signal instanceof AbortSignal, 'fetch init.signal 이 AbortSignal 이어야 한다');
});

Deno.test('카카오 키 없음: 상류 시간 초과(TimeoutError) → 504 JSON + CORS (종전 계약)', async () => {
  await withUpstream(async () => { throw timeoutError(); }, async () => {
    const res = await handler!(search());
    assert.equal(res.status, 504);
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    assert.deepEqual(await res.json(), { error: 'aladin upstream timeout' });
  });
});

Deno.test('헤더만 오고 본문이 멈춘 경우도 같은 시간 제한으로 504', async () => {
  const origTimeout = AbortSignal.timeout;
  // 실제 8초 대신 50ms 시간 제한 신호를 돌려주고, 상류 본문 스트림은 신호가 끊길 때 그 사유로 실패한다
  await withTimeout(() => origTimeout.call(AbortSignal, 50), async () => {
    await withUpstream(async (_input, init) => {
      const signal = init!.signal!;
      const body = new ReadableStream({ start(ctrl) { signal.addEventListener('abort', () => ctrl.error(signal.reason)); } });
      return new Response(body, { status: 200 });
    }, async () => {
      const res = await handler!(search());
      assert.equal(res.status, 504);
      assert.deepEqual(await res.json(), { error: 'aladin upstream timeout' });
    });
  });
});

Deno.test('상류 네트워크 예외(TypeError) → 502 JSON, 응답·로그에 ttbkey 미노출', async () => {
  // Deno fetch 의 TypeError 메시지는 대상 URL(ttbkey 포함)을 담는다 → 클라이언트에 그대로 내보내면 키가 샌다
  const leak = new TypeError('error sending request for url (https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?Query=x&ttbkey=test-ttb-key): connection reset');
  const logs = await withUpstream(async () => { throw leak; }, async () => {
    const res = await handler!(search());
    assert.equal(res.status, 502);
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { error: 'aladin upstream unreachable' });
    assert.ok(!text.includes('test-ttb-key'), `응답에 키가 남으면 안 된다: ${text}`);
  });
  assert.equal(logs.length, 1, '실패 사유를 서버 로그에 한 줄 남긴다');
  assert.ok(!logs[0].includes('test-ttb-key'), `로그에 키가 남으면 안 된다: ${logs[0]}`);
  assert.ok(logs[0].includes('connection reset'), `로그에 사유가 남아야 한다: ${logs[0]}`);
});

Deno.test('카카오 키 없음: 알라딘이 준 503 은 상태·본문 그대로 전달 (프록시가 만든 오류가 아님)', async () => {
  await withUpstream(async () => new Response('서비스를 사용할 수 없습니다.', { status: 503 }), async () => {
    const res = await handler!(search());
    assert.equal(res.status, 503);
    assert.equal(await res.text(), '서비스를 사용할 수 없습니다.');
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  });
});

Deno.test('카카오 키 있음: 상류 시간 초과 → 카카오 책 검색으로 재조회해 알라딘 응답 모양 + source:"kakao"', async () => {
  const { impl, seen } = route(async () => { throw timeoutError(); }, kakaoOk);
  await withEnv({ KAKAO_REST_API_KEY: 'test-kakao-key' }, async () => {
    await withUpstream(impl, async () => {
      const res = await handler!(search());
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
      assert.match(res.headers.get('content-type') ?? '', /application\/json/);
      const body = await res.json();
      assert.deepEqual(body, {
        version: '20131101', totalResults: 19, startIndex: 1, itemsPerPage: 3, query: '서성이다', source: 'kakao',
        item: [
          aladinItem(KAKAO_BODY.documents[0], '', '9791167903792'),
          aladinItem(KAKAO_BODY.documents[1], '8937473097', '9788937473098'),
        ],
      });
      assert.ok(!('itemId' in body.item[0]), 'itemId 는 생략 — 클라이언트 정규화가 isbn13 → isbn → itemId 로 폴백');
    });
  });
  assert.equal(seen.aladin, 1);
  assert.equal(seen.kakao, 1);
  // ItemSearch 파라미터 매핑: Query → query, MaxResults → size, start → page
  assert.equal(`${seen.kakaoUrl!.origin}${seen.kakaoUrl!.pathname}`, 'https://dapi.kakao.com/v3/search/book');
  assert.deepEqual(Object.fromEntries(seen.kakaoUrl!.searchParams), { query: '서성이다', size: '3', page: '1' });
  assert.equal(new Headers(seen.kakaoInit?.headers).get('authorization'), 'KakaoAK test-kakao-key');
  assert.ok(seen.kakaoInit?.signal instanceof AbortSignal, '카카오 호출에도 시간 제한 신호를 건다');
});

Deno.test('카카오 키 있음: 알라딘 5xx·JSON 아닌 200 은 카카오로, 4xx 는 그대로 전달(카카오 미호출)', async () => {
  await withEnv({ KAKAO_REST_API_KEY: 'test-kakao-key' }, async () => {
    const cases: [string, Response, number, boolean][] = [
      ['503', new Response('서비스를 사용할 수 없습니다.', { status: 503 }), 200, true],
      ['200 HTML', new Response('<html><body>504 Gateway Time-out</body></html>', { status: 200 }), 200, true],
      ['400', new Response('{"errorCode":10,"errorMessage":"invalid"}', { status: 400 }), 400, false],
    ];
    for (const [name, upstream, status, viaKakao] of cases) {
      const { impl, seen } = route(async () => upstream, kakaoOk);
      await withUpstream(impl, async () => {
        const res = await handler!(search());
        assert.equal(res.status, status, name);
        assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN, name);
        const body = await res.json();
        assert.equal(body.source === 'kakao', viaKakao, `${name}: source`);
        if (!viaKakao) assert.deepEqual(body, { errorCode: 10, errorMessage: 'invalid' }, name);
      });
      assert.equal(seen.kakao, viaKakao ? 1 : 0, `${name}: 카카오 호출 횟수`);
    }
  });
});

Deno.test('ItemLookUp.aspx?ItemId=<isbn13> → 카카오 target=isbn&query=<isbn13>', async () => {
  const { impl, seen } = route(async () => { throw timeoutError(); }, kakaoOk);
  await withEnv({ KAKAO_REST_API_KEY: 'test-kakao-key' }, async () => {
    await withUpstream(impl, async () => {
      const res = await handler!(lookup());
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.source, 'kakao');
      assert.equal(body.query, '9791167903792');
      assert.equal(body.item[0].isbn13, '9791167903792');
    });
  });
  assert.deepEqual(Object.fromEntries(seen.kakaoUrl!.searchParams), { query: '9791167903792', target: 'isbn' });
});

Deno.test('카카오도 실패(401·예외) → 504 {"error":"upstream unavailable"} + CORS', async () => {
  const failures: Upstream[] = [
    async () => new Response('{"errorType":"AccessDeniedError","message":"wrong appKey"}', { status: 401 }),
    async () => { throw new TypeError('error sending request for url (https://dapi.kakao.com/v3/search/book?query=x): connection reset'); },
    async () => { throw timeoutError(); },
  ];
  await withEnv({ KAKAO_REST_API_KEY: 'test-kakao-key' }, async () => {
    for (const kakao of failures) {
      const { impl } = route(async () => new Response('서비스를 사용할 수 없습니다.', { status: 503 }), kakao);
      await withUpstream(impl, async () => {
        const res = await handler!(search());
        assert.equal(res.status, 504);
        assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
        assert.match(res.headers.get('content-type') ?? '', /application\/json/);
        assert.deepEqual(await res.json(), { error: 'upstream unavailable' });
      });
    }
  });
});

Deno.test('ALADIN_FORCE_FAIL=1(페일오버 검증용) → 알라딘을 부르지 않고 카카오로, 키 없으면 종전 504', async () => {
  const { impl, seen } = route(async () => new Response('{"item":[]}', { status: 200 }), kakaoOk);
  await withEnv({ ALADIN_FORCE_FAIL: '1', KAKAO_REST_API_KEY: 'test-kakao-key' }, async () => {
    await withUpstream(impl, async () => {
      const res = await handler!(search());
      assert.equal(res.status, 200);
      assert.equal((await res.json()).source, 'kakao');
    });
  });
  assert.equal(seen.aladin, 0, '강제 실패 중엔 알라딘을 부르지 않는다');
  assert.equal(seen.kakao, 1);
  await withEnv({ ALADIN_FORCE_FAIL: '1' }, async () => {
    await withUpstream(impl, async () => {
      const res = await handler!(search());
      assert.equal(res.status, 504);
      assert.deepEqual(await res.json(), { error: 'aladin upstream timeout' });
    });
  });
  assert.equal(seen.aladin, 0);
});
