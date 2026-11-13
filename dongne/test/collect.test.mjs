import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectKakao, collectNaver } from '../probe/collect.mjs';

const now = new Date('2026-11-14T12:00:00+09:00');
const at = (h) => new Date(now.getTime() - h * 3_600_000).toISOString();

// 쿼리 문자열의 page / start 값에 따라 정해진 응답을 주는 가짜 fetch
function fakeFetch(pages, log) {
  return async (url, init) => {
    log.push({ url: String(url), headers: init.headers });
    const u = new URL(url);
    const key = u.searchParams.get('page') ?? u.searchParams.get('start');
    const body = pages[key];
    if (!body) return new Response('{}', { status: 400 });
    return new Response(JSON.stringify(body), { status: 200 });
  };
}

test('collectKakao pages until it passes 24 hours and keeps only that window', async () => {
  const log = [];
  const doc = (h, title) => ({ title, contents: '', url: `u${h}`, datetime: at(h) });
  const fetchImpl = fakeFetch({
    1: { meta: { is_end: false }, documents: [doc(1, 'a'), doc(5, '협찬 b')] },
    2: { meta: { is_end: false }, documents: [doc(20, 'c'), doc(30, 'd')] },
    3: { meta: { is_end: false }, documents: [doc(40, 'e')] },
  }, log);
  const r = await collectKakao('cafe', '연남동', { key: 'K', now, maxPages: 10, fetchImpl, delayMs: 0 });
  assert.equal(log.length, 2);
  assert.match(log[0].url, /dapi\.kakao\.com\/v2\/search\/cafe\?.*sort=recency/);
  assert.equal(log[0].headers.Authorization, 'KakaoAK K');
  assert.equal(r.count, 3);
  assert.equal(r.ads, 1);
  assert.equal(r.saturated, false);
  assert.deepEqual(r.docs.map((d) => d.text), ['a', 'c']);
});

test('collectKakao marks saturation when the page limit stops it inside 24 hours', async () => {
  const log = [];
  const fetchImpl = fakeFetch({
    1: { meta: { is_end: false }, documents: [{ title: 'a', contents: '', url: 'u1', datetime: at(1) }] },
  }, log);
  const r = await collectKakao('blog', '성수동', { key: 'K', now, maxPages: 1, fetchImpl, delayMs: 0 });
  assert.equal(r.saturated, true);
  assert.equal(r.count, 1);
});

test('collectNaver counts yesterday for blog with the API HUB headers', async () => {
  const log = [];
  const item = (postdate, title) => ({ title, description: '', link: title, postdate });
  const fetchImpl = fakeFetch({
    1: { items: [item('20261114', 'a'), item('20261113', 'b')] },
    3: { items: [item('20261113', 'c'), item('20261112', 'd')] },
  }, log);
  const r = await collectNaver('blog', '홍은동', { id: 'I', secret: 'S', now, maxPages: 10, fetchImpl, delayMs: 0, pageSize: 2 });
  assert.match(log[0].url, /naverapihub\.apigw\.ntruss\.com\/search\/v1\/blog\?.*sort=date/);
  assert.equal(log[0].headers['X-NCP-APIGW-API-KEY-ID'], 'I');
  assert.equal(log[0].headers['X-NCP-APIGW-API-KEY'], 'S');
  assert.equal(log.length, 2);
  assert.equal(r.count, 2);
  assert.equal(r.saturated, false);
  assert.deepEqual(r.docs.map((d) => d.text), ['b', 'c']);
});

test('collectNaver uses the last 24 hours for news', async () => {
  const log = [];
  const pub = (h) => new Date(now.getTime() - h * 3_600_000).toUTCString();
  const fetchImpl = fakeFetch({
    1: { items: [{ title: 'n1', description: '', link: 'a', pubDate: pub(2) }, { title: 'n2', description: '', link: 'b', pubDate: pub(30) }] },
  }, log);
  const r = await collectNaver('news', '상계동', { id: 'I', secret: 'S', now, maxPages: 10, fetchImpl, delayMs: 0, pageSize: 2 });
  assert.equal(r.count, 1);
  assert.equal(r.hourly.reduce((a, b) => a + b), 1);
});
