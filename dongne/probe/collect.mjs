// 검색 API 를 페이지 단위로 불러 최근 글을 모은다. fetch 는 테스트에서 바꿔 끼운다.
import { cleanText, isAd, summarizeDated, countNaverBlogDay, kstYmd } from './lib.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, headers, fetchImpl, delayMs) {
  for (let attempt = 0; ; attempt++) {
    if (delayMs) await sleep(delayMs);
    const res = await fetchImpl(url, { headers });
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === 3) {
      throw new Error(`HTTP ${res.status} ${new URL(url).host}: ${(await res.text()).slice(0, 200)}`);
    }
    await sleep(1000 * 2 ** attempt);
  }
}

function keep(text, list) {
  const ad = isAd(text);
  if (!ad) list.push({ text });
  return ad;
}

// kind: blog | cafe. 응답에 작성 시각(datetime)이 있다. 한 페이지 50건, 최대 50페이지.
export async function collectKakao(kind, query, { key, now, maxPages = 10, fetchImpl = fetch, delayMs = 60 }) {
  const seen = new Set();
  const raw = [];
  let calls = 0;
  let saturated = false;
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://dapi.kakao.com/v2/search/${kind}?query=${encodeURIComponent(query)}&sort=recency&size=50&page=${page}`;
    const body = await getJson(url, { Authorization: `KakaoAK ${key}` }, fetchImpl, delayMs);
    calls++;
    const fresh = body.documents.filter((d) => !seen.has(d.url) && seen.add(d.url));
    raw.push(...fresh);
    if (summarizeDated(fresh, now).reachedOlder || body.meta.is_end) break;
    if (page === maxPages) saturated = true;
  }
  const { last24h, hourly } = summarizeDated(raw, now);
  const from = now.getTime() - 24 * 3_600_000;
  const docs = [];
  let ads = 0;
  for (const d of raw) {
    const t = new Date(d.datetime).getTime();
    if (t > from && t <= now.getTime() && keep(cleanText(`${d.title} ${d.contents}`), docs)) ads++;
  }
  return { count: last24h, ads, saturated, hourly, docs, calls };
}

// kind: blog | news (NAVER API HUB). 블로그는 날짜만 있어 어제 하루치를, 뉴스는 최근 24시간을 센다.
// 카페(cafearticle)는 작성 시각이 없어 여기서 세지 않는다.
export async function collectNaver(kind, query, { id, secret, now, maxPages = 10, fetchImpl = fetch, delayMs = 60, pageSize = 100 }) {
  const headers = { 'X-NCP-APIGW-API-KEY-ID': id, 'X-NCP-APIGW-API-KEY': secret };
  const yesterday = kstYmd(new Date(now.getTime() - 24 * 3_600_000));
  const seen = new Set();
  const raw = [];
  let calls = 0;
  let saturated = false;
  for (let page = 1; page <= maxPages; page++) {
    const start = 1 + (page - 1) * pageSize;
    const url = `https://naverapihub.apigw.ntruss.com/search/v1/${kind}?query=${encodeURIComponent(query)}&display=${pageSize}&start=${start}&sort=date&format=json`;
    const body = await getJson(url, headers, fetchImpl, delayMs);
    calls++;
    const items = body.items ?? [];
    const fresh = items.filter((i) => !seen.has(i.link) && seen.add(i.link));
    raw.push(...fresh);
    const passed = kind === 'blog'
      ? countNaverBlogDay(fresh, yesterday).complete
      : summarizeDated(fresh.map((i) => ({ datetime: i.pubDate })), now).reachedOlder;
    if (passed || items.length < pageSize) break;
    if (page === maxPages) saturated = true;
  }
  const docs = [];
  let ads = 0;
  if (kind === 'blog') {
    const day = raw.filter((i) => i.postdate === yesterday);
    for (const i of day) if (keep(cleanText(`${i.title} ${i.description}`), docs)) ads++;
    return { count: day.length, ads, saturated, hourly: null, docs, calls };
  }
  const dated = raw.map((i) => ({ ...i, datetime: i.pubDate }));
  const { last24h, hourly } = summarizeDated(dated, now);
  const from = now.getTime() - 24 * 3_600_000;
  for (const i of dated) {
    const t = new Date(i.datetime).getTime();
    if (t > from && t <= now.getTime() && keep(cleanText(`${i.title} ${i.description}`), docs)) ads++;
  }
  return { count: last24h, ads, saturated, hourly, docs, calls };
}
