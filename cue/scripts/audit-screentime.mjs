/* audit-screentime.mjs — 화면시간(screentime_daily)이 cue 에 충실히 반영되는지 전수 대조 (로컬 전용).
   buildScreenTimeData 출력 vs raw 행에서 '독립 재계산'한 값을 1:1 비교(PASS/FAIL).
   기존 audit-faithfulness.mjs 는 4활동만 감사하고 화면시간은 누락 — 이 스크립트가 그 공백을 메움.

   두 층으로 나눔:
   ① 충실성(FAITHFULNESS) — 어댑터가 raw 를 그대로 반영하는가. PASS/FAIL 게이트(exit code).
      헤드라인 스칼라 + 증감(같은-경과-구간) + 추세 버킷 + 앱/사이트 랭킹을 전부 독립 재계산해 대조.
   ② 코히어런스(COHERENCE) — 데이터 자체의 물리적 정합(사이트합 ≤ Chrome앱, 도구 ≤ 전체).
      이건 어댑터가 아니라 수집 데몬/소스의 문제라 경고(WARN)로만 출력 — exit code 에 반영 안 함
      (과거 pre-§6 데몬 시기 데이터는 소급 교정 불가하므로 어댑터 게이트를 깨면 안 됨).

   실행 (cue/ 에서):
     set -a; . ~/.config/study/.env; set +a
     export USER_ID_LEFTJAP=$(grep -o 'USER_ID_LEFTJAP=[0-9a-f-]*' ../today/.env.local | cut -d= -f2)
     node scripts/audit-screentime.mjs */
import { createClient } from '@supabase/supabase-js';
import { buildScreenTimeData, fmtDur, deltaLabel, appName, TOOL_APP, TOOL_SITE } from '../src/data/screentime.js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const uid = process.env.USER_ID_LEFTJAP || process.env.CUE_USER_ID;
if (!url || !key || !uid) { console.error('env 누락: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · USER_ID_LEFTJAP'); process.exit(1); }
const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const p2 = (n) => String(n).padStart(2, '0');
const K = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const addDays = (base, n) => { const x = new Date(base); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + n); return x; };
const weekMon = (base) => { const x = new Date(base); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const today = new Date(); today.setHours(0, 0, 0, 0);
const tk = K(today);
const CHROME = 'com.google.Chrome';

const { data: rows, error } = await c.from('screentime_daily')
  .select('date, kind, name, seconds').eq('owner_id', uid).order('date', { ascending: true });
if (error) { console.error(error.message); process.exit(1); }
const view = buildScreenTimeData(rows, today);

// ── 독립 재계산 헬퍼 (어댑터 내부 함수 미경유) ──
const sumApp = (s, e) => rows.filter((r) => r.kind === 'app' && r.date >= s && r.date <= e).reduce((a, r) => a + r.seconds, 0);
const sumOne = (kind, name, s, e) => rows.filter((r) => r.kind === kind && r.name === name && r.date >= s && r.date <= e).reduce((a, r) => a + r.seconds, 0);
const rawTool = (s, e) => sumOne('app', TOOL_APP, s, e) + sumOne('site', TOOL_SITE, s, e);
const toolShown = (s, e) => Math.min(rawTool(s, e), sumApp(s, e)); // 어댑터 클램프와 동일 (도구 ≤ 전체)
const aggKind = (kind, s, e) => {
  const a = {};
  for (const r of rows) if (r.kind === kind && r.date >= s && r.date <= e) a[r.name] = (a[r.name] || 0) + r.seconds;
  return a;
};
// rankRows 독립 재현 — 어댑터가 올바른 윈도우/집계를 먹였는지 교차검증
const rankIndep = (agg, isTool, disp, topN) => {
  const items = Object.entries(agg).map(([name, sec]) => ({ name, sec })).filter((x) => x.sec > 0).sort((a, b) => b.sec - a.sec);
  const named = [], rest = [];
  for (const x of items) { if (named.length < topN || isTool(x.name)) named.push(x); else rest.push(x); }
  const out = named.map((x) => ({ n: disp(x.name), v: Math.round(x.sec / 60) }));
  const restSec = rest.reduce((a, x) => a + x.sec, 0);
  if (restSec > 0) out.push({ n: '기타', v: Math.round(restSec / 60) });
  return out;
};

let pass = 0, fail = 0, warn = 0;
const cmp = (label, raw, got) => {
  const ok = String(raw) === String(got);
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? '✅' : '❌'} ${label}: raw=${raw} | adapter=${got}`);
};
const cmpJSON = (label, raw, got) => cmp(label, JSON.stringify(raw), JSON.stringify(got));
const warnIf = (bad, msg) => { if (bad) { warn++; console.log(`  ⚠️  ${msg}`); } else { console.log(`  ✅ ${msg}`); } };

// ── 기간 정의 (어댑터 buildPeriod 와 같은 사양을 독립 구현) ──
const monStart = `${today.getFullYear()}-${p2(today.getMonth() + 1)}-01`;
const mon = weekMon(today);
const elapsed = Math.round((today - mon) / 86400000);
const dom = today.getDate();
const pFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
const pLastDom = new Date(today.getFullYear(), today.getMonth(), 0).getDate();

const PERIODS = {
  day: {
    cur: [tk, tk], prev: [K(addDays(today, -1)), K(addDays(today, -1))], prefix: '어제보다',
    buckets: Array.from({ length: 7 }, (_, i) => { const k = K(addDays(today, i - 6)); return [k, k]; }),
  },
  week: {
    cur: [K(mon), tk], prev: [K(addDays(mon, -7)), K(addDays(mon, -7 + elapsed))], prefix: '지난주보다',
    buckets: Array.from({ length: 8 }, (_, i) => { const m = addDays(mon, (i - 7) * 7); return [K(m), i === 7 ? tk : K(addDays(m, 6))]; }),
  },
  month: {
    cur: [monStart, tk],
    prev: [K(pFirst), K(new Date(pFirst.getFullYear(), pFirst.getMonth(), Math.min(dom, pLastDom)))], prefix: '지난달보다',
    buckets: Array.from({ length: 6 }, (_, i) => {
      const mf = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1);
      return [K(mf), i === 5 ? tk : K(new Date(mf.getFullYear(), mf.getMonth() + 1, 0))];
    }),
  },
};

console.log(`### 화면시간 충실성+코히어런스 감사 — 오늘 ${tk} (user ${uid.slice(0, 8)}…) ###`);

// ── ① 충실성 ──
for (const [p, def] of Object.entries(PERIODS)) {
  const [s, e] = def.cur, [ps, pe] = def.prev;
  console.log(`\n■ [충실성] ${p} (cur ${s}…${e} / prev ${ps}…${pe})`);
  const tot = sumApp(s, e), tsec = toolShown(s, e), ptot = sumApp(ps, pe);
  cmp('total', fmtDur(tot), view[p].total);
  cmp('toolTotal', fmtDur(tsec), view[p].toolTotal);
  cmp('otherTotal', fmtDur(Math.max(tot - tsec, 0)), view[p].otherTotal);
  const tm = Math.round(tot / 60), tlm = Math.round(tsec / 60);
  cmp('toolShare', (tm > 0 ? `${Math.min(Math.round(tlm / tm * 100), 100)}%` : '0%'), view[p].toolShare);
  cmp('bkRead', fmtDur(sumOne('app', TOOL_APP, s, e)), view[p].bkRead);
  cmp('bkWeb', fmtDur(sumOne('site', TOOL_SITE, s, e)), view[p].bkWeb);
  // 증감 — 같은-경과-구간(prev 데이터 없으면 미표시)
  cmp('totalDelta', ptot > 0 ? deltaLabel(tot, ptot, def.prefix) : '', view[p].totalDelta);
  cmp('toolDelta', ptot > 0 ? deltaLabel(tsec, Math.min(rawTool(ps, pe), ptot), '') : '', view[p].toolDelta);
  // 추세 (어댑터 trend 는 toolMin 비클램프 raw — 동일하게 raw 로 대조)
  cmpJSON('trendTotals', def.buckets.map(([bs, be]) => Math.round(sumApp(bs, be) / 60)), view[p].trendTotals);
  cmpJSON('trendTool', def.buckets.map(([bs, be]) => Math.round(rawTool(bs, be) / 60)), view[p].trendTool);
  // 랭킹 (앱/사이트 — 독립 rankRows)
  cmpJSON('apps랭킹', rankIndep(aggKind('app', s, e), (n) => n === TOOL_APP, appName, 6), view[p].apps.map((r) => ({ n: r.n, v: r.v })));
  cmpJSON('sites랭킹', rankIndep(aggKind('site', s, e), (n) => n === TOOL_SITE, (n) => n, 6), view[p].sites.map((r) => ({ n: r.n, v: r.v })));
}

// ── ② 코히어런스 (데이터 물리성 — 경고만, exit code 비반영) ──
console.log('\n■ [코히어런스·경고] 사이트합 ≤ Chrome앱(사이트는 Chrome 내부) · 도구 ≤ 전체');
const dates = [...new Set(rows.map((r) => r.date))].sort();
for (const d of dates) {
  const chrome = sumOne('app', CHROME, d, d);
  const siteSum = rows.filter((r) => r.kind === 'site' && r.date === d).reduce((a, r) => a + r.seconds, 0);
  warnIf(siteSum > chrome + 30, `${d}: 사이트합 ${(siteSum / 60).toFixed(0)}m ${siteSum > chrome + 30 ? '>' : '≤'} Chrome앱 ${(chrome / 60).toFixed(0)}m`);
}
for (const [p, def] of Object.entries(PERIODS)) {
  const [s, e] = def.cur;
  warnIf(rawTool(s, e) > sumApp(s, e), `${p} 내도구(raw) ${(rawTool(s, e) / 60).toFixed(0)}m vs 전체앱 ${(sumApp(s, e) / 60).toFixed(0)}m`);
}

console.log(`\n### 충실성: ${pass} PASS · ${fail} FAIL  |  코히어런스 경고: ${warn} ###`);
console.log(warn ? '※ 코히어런스 경고는 수집 데몬/소스 정합 이슈(어댑터 충실성과 무관). §6 단일폴 통합으로 구조적 해소.' : '');
process.exit(fail ? 1 : 0);
