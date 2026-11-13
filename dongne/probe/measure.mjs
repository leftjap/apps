// 서울 동네별 글 양 측정. 사용법은 docs/design.md 의 "측정" 절.
//   node probe/measure.mjs                    전체 동네
//   node probe/measure.mjs --only 연남동,홍은동  일부만
//   node probe/measure.mjs --limit 20           앞에서 20곳만
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { localKeywords, stripJosa, tokenize } from './lib.mjs';
import { collectKakao, collectNaver } from './collect.mjs';

export const ENV_FILE = `${homedir()}/.config/dongne/.env`;
const FOCUS = ['연남동', '성수동', '홍은동', '상계동'];
const SOURCE_LABEL = {
  kakao_blog: '카카오 블로그(24시간)', kakao_cafe: '카카오 카페(24시간)',
  naver_blog: '네이버 블로그(어제 하루)', naver_news: '네이버 뉴스(24시간)',
};

function loadKeys() {
  for (const f of [ENV_FILE, fileURLToPath(new URL('../.env', import.meta.url))]) if (existsSync(f)) process.loadEnvFile(f);
  const { KAKAO_REST_API_KEY: kakao, NAVER_API_HUB_KEY_ID: id, NAVER_API_HUB_KEY: secret } = process.env;
  return { kakao, naver: id && secret ? { id, secret } : null };
}

function parseArgs(argv) {
  const opts = { only: null, limit: Infinity, maxPages: 10 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') opts.only = argv[++i].split(',');
    else if (argv[i] === '--limit') opts.limit = Number(argv[++i]);
    else if (argv[i] === '--max-pages') opts.maxPages = Number(argv[++i]);
  }
  return opts;
}

export async function measure(entries, keys, now, { maxPages, onProgress = () => {} }) {
  const jobs = [];
  if (keys.kakao) {
    jobs.push(['kakao_blog', (q) => collectKakao('blog', q, { key: keys.kakao, now, maxPages })]);
    jobs.push(['kakao_cafe', (q) => collectKakao('cafe', q, { key: keys.kakao, now, maxPages })]);
  }
  if (keys.naver) {
    jobs.push(['naver_blog', (q) => collectNaver('blog', q, { ...keys.naver, now, maxPages })]);
    jobs.push(['naver_news', (q) => collectNaver('news', q, { ...keys.naver, now, maxPages })]);
  }
  const results = [];
  for (const [i, entry] of entries.entries()) {
    const sources = {};
    for (const [name, run] of jobs) {
      try {
        sources[name] = await run(entry.query);
      } catch (err) {
        if (/HTTP 40[13]/.test(err.message)) throw err; // 키 문제는 바로 멈춘다
        sources[name] = { error: err.message };
      }
    }
    results.push({ entry, sources });
    onProgress(i + 1, entries.length);
  }
  return results;
}

const quantiles = (xs) => {
  const a = [...xs].sort((x, y) => x - y);
  const q = (p) => a[Math.floor(p * (a.length - 1))];
  return { min: a[0], p25: q(0.25), median: q(0.5), p75: q(0.75), p90: q(0.9), max: a.at(-1) };
};

export function analyze(results) {
  const perDong = new Map();
  for (const { entry, sources } of results) {
    const places = [entry.query, ...entry.hjd, entry.gu, '서울시', '서울특별시'];
    const docs = Object.values(sources).flatMap((s) => s.docs ?? []).map((d) => tokenize(d.text, places));
    perDong.set(`${entry.gu} ${entry.query}`, stripJosa(docs));
  }
  const maxSpread = Math.max(3, Math.ceil(results.length * 0.02));
  const keywords = localKeywords(perDong, { minDf: 2, maxSpread });
  const rows = results.map(({ entry, sources }) => {
    const ok = Object.values(sources).filter((s) => !s.error);
    const total = ok.reduce((n, s) => n + s.count, 0);
    const ads = ok.reduce((n, s) => n + s.ads, 0);
    const words = keywords.get(`${entry.gu} ${entry.query}`);
    return {
      gu: entry.gu, query: entry.query, kind: entry.kind,
      shared: entry.sharedInSeoul || entry.sharedOutsideSeoul,
      total, ads, clean: total - ads,
      saturated: ok.some((s) => s.saturated),
      errors: Object.entries(sources).filter(([, s]) => s.error).map(([k, s]) => `${k}: ${s.error}`),
      bySource: Object.fromEntries(Object.entries(sources).map(([k, s]) => [k, s.error ? null : s.count - s.ads])),
      keywordCount: words.length,
      keywords: words.slice(0, 8).map((w) => `${w.word}(${w.df})`),
    };
  });
  const hourly = Array(24).fill(0);
  for (const { sources } of results) for (const s of Object.values(sources)) s.hourly?.forEach((n, h) => { hourly[h] += n; });
  const calls = results.reduce((n, r) => n + Object.values(r.sources).reduce((m, s) => m + (s.calls ?? 0), 0), 0);
  return { rows, hourly, calls, maxSpread };
}

export function printReport({ rows, hourly, calls, maxSpread }, { now, sources }) {
  const dongs = rows.filter((r) => r.kind === 'dong');
  const line = (s = '') => console.log(s);
  line(`측정 시각 ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · 동네 ${dongs.length}곳 + 생활권 ${rows.length - dongs.length}곳 · API 호출 ${calls}회`);
  line(`출처: ${sources.map((s) => SOURCE_LABEL[s]).join(', ')}`);
  line('\n[행정동 기반 동네별 글 수, 광고 제외]');
  const table = {};
  for (const s of sources) table[SOURCE_LABEL[s]] = quantiles(dongs.map((r) => r.bySource[s] ?? 0));
  table['합계'] = quantiles(dongs.map((r) => r.clean));
  console.table(table);
  const count = (f) => dongs.filter(f).length;
  line(`합계 0건 ${count((r) => r.clean === 0)}곳 · 24건 이상(1시간에 1건) ${count((r) => r.clean >= 24)}곳 · 144건 이상(10분에 1건) ${count((r) => r.clean >= 144)}곳 · 페이지 한도에 걸려 덜 센 곳 ${count((r) => r.saturated)}곳`);
  line(`광고로 거른 비율: ${Math.round((100 * dongs.reduce((n, r) => n + r.ads, 0)) / Math.max(1, dongs.reduce((n, r) => n + r.total, 0)))}%`);
  line(`\n[살아남은 단어 수] 한 동네에서 글 2개 이상에 나오고, 서울 전체에서 ${maxSpread}곳 이하에만 나오는 단어`);
  console.table({ 단어수: quantiles(dongs.map((r) => r.keywordCount)) });
  line(`0개 ${count((r) => r.keywordCount === 0)}곳 · 5개 이상 ${count((r) => r.keywordCount >= 5)}곳 · 10개 이상 ${count((r) => r.keywordCount >= 10)}곳`);
  if (hourly.some((n) => n)) {
    line('\n[시간대별 글 수, 작성 시각이 있는 출처 합계]');
    const top = Math.max(...hourly);
    hourly.forEach((n, h) => line(`${String(h).padStart(2, '0')}시 ${'█'.repeat(Math.round((30 * n) / top)).padEnd(30)} ${n}`));
  }
  const show = (list) => console.table(list.map((r) => ({ 구: r.gu, 동네: r.query, 글: r.clean, 광고: r.ads, 단어: r.keywordCount, 예시: r.keywords.slice(0, 5).join(' '), 겹침: r.shared ? '이름 겹침' : '' })));
  const sorted = [...dongs].sort((a, b) => b.clean - a.clean);
  line('\n[글이 많은 동네 15곳]'); show(sorted.slice(0, 15));
  line('\n[글이 적은 동네 10곳]'); show(sorted.slice(-10));
  line('\n[생활권 이름]'); show(rows.filter((r) => r.kind === 'area').sort((a, b) => b.clean - a.clean));
  line('\n[관심 동네]'); show(rows.filter((r) => FOCUS.includes(r.query)));
  const errors = rows.filter((r) => r.errors.length);
  if (errors.length) line(`\n오류 ${errors.length}곳: ${errors.slice(0, 5).map((r) => `${r.query} ${r.errors[0]}`).join(' / ')}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const keys = loadKeys();
  if (!keys.kakao && !keys.naver) {
    console.error(`검색 API 키가 없습니다. ${ENV_FILE} 에 아래 중 하나 이상을 넣어 주세요 (chmod 600).`);
    console.error('  KAKAO_REST_API_KEY=...        카카오 디벨로퍼스 > 앱 > 플랫폼 키 > REST API 키');
    console.error('  NAVER_API_HUB_KEY_ID=...      네이버 클라우드 NAVER API HUB > Application 인증 정보');
    console.error('  NAVER_API_HUB_KEY=...');
    process.exit(2);
  }
  const { entries: all } = JSON.parse(readFileSync(new URL('./seoul-dongs.json', import.meta.url), 'utf8'));
  const entries = all.filter((e) => !opts.only || opts.only.includes(e.query)).slice(0, opts.limit);
  const now = new Date();
  const sources = [...(keys.kakao ? ['kakao_blog', 'kakao_cafe'] : []), ...(keys.naver ? ['naver_blog', 'naver_news'] : [])];
  console.error(`${entries.length}곳 측정 시작 (${sources.join(', ')})`);
  const results = await measure(entries, keys, now, {
    maxPages: opts.maxPages,
    onProgress: (i, n) => { if (i % 20 === 0 || i === n) console.error(`  ${i}/${n}`); },
  });
  const analysis = analyze(results);
  printReport(analysis, { now, sources });
  const outDir = new URL('./out/', import.meta.url);
  mkdirSync(outDir, { recursive: true });
  const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, '');
  const outFile = new URL(`measure-${stamp}.json`, outDir);
  writeFileSync(outFile, JSON.stringify({ measuredAt: now.toISOString(), sources, ...analysis }, null, 1));
  console.log(`\n결과 파일: ${fileURLToPath(outFile)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
