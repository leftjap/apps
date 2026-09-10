// 알라딘 프록시 핸들러 단위 테스트 — 네트워크 없이 상류(알라딘) 장애 계약을 검증한다.
// 배경(2026-09-10 실측, lessons/aladin-proxy-upstream-hang.md): ItemSearch 상류가 40~90초 무응답이면
// 프록시 fetch 에 시간 제한이 없어 Book·Pick·리딩타임 세 앱이 같이 멈췄다.
//   deno test --allow-env pick/supabase/functions/aladin/index_test.ts
// index.ts 는 최상위에서 Deno.serve(handler) 를 부르므로 import 전에 Deno.serve 를 가로채 handler 를 얻고,
// fetch·AbortSignal.timeout·console.error 는 테스트마다 바꿔 끼운 뒤 원복한다.
import assert from 'node:assert/strict';

type Handler = (req: Request) => Response | Promise<Response>;
let handler: Handler | undefined;
Object.defineProperty(Deno, 'serve', {
  configurable: true,
  writable: true,
  value: (h: Handler) => { handler = h; return undefined as never; },
});
Deno.env.set('ALADIN_TTB_KEY', 'test-ttb-key');
await import('./index.ts');

const ORIGIN = 'https://leftjap.github.io';
const search = () => new Request(
  'https://tcbooffrdacfatywdzcm.supabase.co/functions/v1/aladin/ItemSearch.aspx?Query=%EC%84%9C%EC%84%B1%EC%9D%B4%EB%8B%A4&MaxResults=3',
  { headers: { origin: ORIGIN } },
);

type Upstream = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;
// 상류 fetch 를 흉내 내는 동안 핸들러를 실행하고 원복. console.error 출력은 모아서 돌려준다.
async function withUpstream(impl: Upstream, run: () => Promise<void>): Promise<string[]> {
  const origFetch = globalThis.fetch;
  const origError = console.error;
  const logs: string[] = [];
  globalThis.fetch = impl as typeof fetch;
  console.error = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  try { await run(); } finally { globalThis.fetch = origFetch; console.error = origError; }
  return logs;
}
// AbortSignal.timeout 을 바꿔 끼운 동안 실행하고 원복
async function withTimeout(impl: (ms: number) => AbortSignal, run: () => Promise<void>) {
  const orig = AbortSignal.timeout;
  AbortSignal.timeout = impl;
  try { await run(); } finally { AbortSignal.timeout = orig; }
}

Deno.test('상류 fetch 에 AbortSignal.timeout(15초) 를 걸고 정상 응답은 그대로 전달', async () => {
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
  assert.deepEqual(calls, [15_000]);
  assert.ok(signal instanceof AbortSignal, 'fetch init.signal 이 AbortSignal 이어야 한다');
});

Deno.test('상류 시간 초과(TimeoutError) → 504 JSON + CORS', async () => {
  await withUpstream(async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }, async () => {
    const res = await handler!(search());
    assert.equal(res.status, 504);
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    assert.deepEqual(await res.json(), { error: 'aladin upstream timeout' });
  });
});

Deno.test('헤더만 오고 본문이 멈춘 경우도 같은 시간 제한으로 504', async () => {
  const origTimeout = AbortSignal.timeout;
  // 실제 15초 대신 50ms 시간 제한 신호를 돌려주고, 상류 본문 스트림은 신호가 끊길 때 그 사유로 실패한다
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

Deno.test('알라딘이 준 503 은 상태·본문 그대로 전달 (프록시가 만든 오류가 아님)', async () => {
  await withUpstream(async () => new Response('서비스를 사용할 수 없습니다.', { status: 503 }), async () => {
    const res = await handler!(search());
    assert.equal(res.status, 503);
    assert.equal(await res.text(), '서비스를 사용할 수 없습니다.');
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  });
});
