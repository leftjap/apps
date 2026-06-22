/* 기록(통계) — 데스크톱 C 파이널 v2 (작업지시서 §7)
 * 캘린더 탭(발화량 강도 셀 + 일별 차트 + 그날 상세) + 문장 목록 탭(정렬3종·날짜그룹·점수3단색·요약레일).
 * 어디서든 복습 세션으로 전환(studyReviewQueue/studyReturnTo). 정본 시안: v-stats.jsx (StatsCalV2/StatsListV2)
 *
 * 실데이터: window.studyDB(sessionLogs/reviewQueue). mock(?무인증)은 데모 폴백.
 */
import { h } from '../components/d1/dom.js';
import { V_VARS, VI, vIcon, vEq, v2Style, ensureV2Fonts } from '../components/v2/atoms.js';
import { localISODate } from '../utils/today.js';

const TODAY = () => (window.studyDay?.TODAY_ISO || localISODate());
const DOW = ['월', '화', '수', '목', '금', '토', '일'];
const MONTHS_KO = (m) => `${m}월`;

const VT2_CSS = `
.vt2{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;${V_VARS}}
.vt2 *{box-sizing:border-box;margin:0}
.vt2-top{height:60px;border-bottom:1px solid var(--line);display:flex;align-items:center}
.vt2-top-in{width:100%;max-width:1064px;margin:0 auto;padding:0 20px;display:flex;align-items:center;justify-content:space-between}
.vt2-home{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--mut);background:none;border:0;cursor:pointer;font-family:inherit}
.vt2-seg{display:flex;gap:20px}
.vt2-seg button{font:inherit;background:none;border:0;font-size:13.5px;font-weight:600;color:var(--faint);cursor:pointer;padding-bottom:3px}
.vt2-seg button.on{color:var(--teal-deep);border-bottom:2px solid var(--teal)}
.vt2-wrap{width:100%;max-width:1064px;margin:0 auto;padding:26px 20px 48px}
.vt2-hd{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
.vt2-h1{font-family:Outfit;font-size:26px;font-weight:700;letter-spacing:-0.02em}
.vt2-tabs{display:flex;gap:4px;background:#efebde;border-radius:11px;padding:4px}
.vt2-tabs button{border:0;background:transparent;font:inherit;font-size:13px;font-weight:700;color:var(--mut);padding:8px 18px;border-radius:8px;cursor:pointer;white-space:nowrap}
.vt2-tabs button.on{background:var(--card);color:var(--teal-deep);box-shadow:0 2px 6px -3px rgba(25,35,32,.22)}
.vt2-mnav{margin-left:auto;display:flex;align-items:center;gap:16px;white-space:nowrap}
.vt2-mnav .mb{font:inherit;font-size:13px;font-weight:600;color:var(--mut);background:none;border:0;cursor:pointer}
.vt2-mnav .mb.off{color:#cfcab8;cursor:default}
.vt2-mnav .ml{font-family:Outfit;font-size:15.5px;font-weight:700}
.vt2-body{display:grid;grid-template-columns:1fr 332px;gap:26px;margin-top:22px}
.vt2-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.vt2-dow{font-family:Outfit;font-size:11px;font-weight:600;color:var(--faint);text-align:center;padding:4px 0 8px;letter-spacing:.06em}
.vt2-cell{position:relative;aspect-ratio:1.25;border-radius:11px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;background:transparent;border:0;font-family:inherit;animation:v-settle .4s both}
.vt2-cell .dt{font-family:Outfit;font-size:10.5px;color:var(--faint);line-height:1;margin-bottom:4px}
.vt2-cell .vv{font-family:Outfit;line-height:1}
.vt2-cell .vv.i1{font-size:14px;font-weight:600;color:var(--mut)}
.vt2-cell .vv.i2{font-size:19px;font-weight:700;color:var(--ink)}
.vt2-cell .vv.i3{font-size:24px;font-weight:800;color:var(--ink)}
.vt2-cell.t1{background:oklch(44% .062 192/.07)}
.vt2-cell.t2{background:oklch(44% .062 192/.14)}
.vt2-cell.t3{background:oklch(44% .062 192/.23)}
.vt2-cell.future{cursor:default}
.vt2-cell.future .dt{color:#d4cfbe}
.vt2-cell.sel{background:var(--card);box-shadow:0 0 0 1.8px var(--teal),0 8px 18px -12px rgba(25,35,32,.25)}
.vt2-cell.sel .dt{color:var(--teal-deep);font-weight:700}
.vt2-cell.today{animation:v-settle .4s both,vt2-today 2.4s 1s ease-in-out infinite}
@keyframes vt2-today{0%,100%{outline:2.2px solid var(--coral);outline-offset:2px}50%{outline:2.2px solid oklch(58% .115 32/.3);outline-offset:5px}}
.vt2-msum{display:flex;gap:28px;margin-top:18px;font-size:13px;color:var(--mut);flex-wrap:wrap}
.vt2-msum b{font-family:Outfit;font-size:17px;font-weight:700;color:var(--ink);margin-left:6px}
.vt2-msum .ps b{color:var(--teal-deep)}
.vt2-chartlab{font-family:Outfit;font-size:10.5px;letter-spacing:.15em;font-weight:600;color:var(--faint);text-transform:uppercase;margin-top:24px}
.vt2-chart{display:flex;align-items:flex-end;gap:3px;height:72px;margin-top:12px}
.vt2-chart i{flex:1;border-radius:3px 3px 1px 1px;background:oklch(44% .062 192/.3);transform-origin:bottom;animation:v-grow .6s cubic-bezier(.3,.7,.3,1) both;cursor:pointer}
.vt2-chart i.zero{background:#e9e5d7;height:3px !important;cursor:default}
.vt2-chart i.sel{background:var(--teal)}
.vt2-chart i.today{background:var(--coral)}
.vt2-chartx{display:flex;justify-content:space-between;margin-top:6px}
.vt2-chartx span{font-family:Outfit;font-size:10px;color:var(--faint)}
.vt2-day{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px 24px}
.vt2-day .dh{display:flex;align-items:baseline;justify-content:space-between}
.vt2-day .dt2{font-family:Outfit;font-size:15.5px;font-weight:700}
.vt2-day .dd{font-size:11.5px;color:var(--faint)}
.vt2-day .dstats{display:flex;gap:26px;margin-top:16px}
.vt2-day .ds .lb{font-family:Outfit;font-size:10px;letter-spacing:.15em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vt2-day .ds .v{font-family:Outfit;font-size:23px;font-weight:700;margin-top:6px;line-height:1}
.vt2-day .ds .v em{font-style:normal;font-size:13px;color:var(--faint);font-weight:600}
.vt2-day .ds .v .ps{color:var(--teal-deep)}
.vt2-slab{font-family:Outfit;font-size:10px;letter-spacing:.15em;font-weight:600;color:var(--faint);text-transform:uppercase;margin-top:20px}
.vt2-srow{display:flex;align-items:center;gap:11px;padding:12px 0;border-bottom:1px solid var(--line);cursor:pointer}
.vt2-srow:last-of-type{border-bottom:0}
.vt2-srow .en{font-size:14px;font-weight:700;line-height:1.4}
.vt2-srow .ko{font-size:11.5px;color:var(--faint);margin-top:2px}
.vt2-srow .grow{flex:1}
.vt2-sc{font-family:Outfit;font-size:13px;font-weight:700;white-space:nowrap}
.vt2-sc.good{color:var(--teal-deep)}.vt2-sc.mid{color:var(--gold-deep)}.vt2-sc.low{color:var(--coral-deep)}
.vt2-cir{width:30px;height:30px;border-radius:50%;border:1.5px solid var(--line);background:#fff;color:var(--mut);display:grid;place-items:center;cursor:pointer;flex:0 0 auto;padding:0}
.vt2-cir.eqq{border-color:var(--blue-line);color:var(--blue)}
.vt2-cta{width:100%;margin-top:16px;background:var(--teal);color:#fff;border:0;border-radius:12px;padding:14px 0;font:inherit;font-size:14px;font-weight:700;cursor:pointer;animation:v-breathe 2.6s ease-in-out infinite}
.vt2-cap{font-size:11.5px;color:var(--faint);text-align:center;margin-top:9px;line-height:1.5}
.vt2-sort{display:flex;gap:6px;flex-wrap:wrap}
.vt2-sortp{font:inherit;font-size:12.5px;font-weight:700;color:var(--mut);background:none;border:1.5px solid transparent;padding:7px 15px;border-radius:999px;cursor:pointer;white-space:nowrap}
.vt2-sortp.on{color:var(--teal-deep);background:var(--teal-soft);border-color:var(--teal-line)}
.vt2-dhdr{font-family:Outfit;font-size:11.5px;font-weight:600;color:var(--faint);letter-spacing:.06em;margin-top:22px}
.vt2-lrow{display:flex;align-items:center;gap:14px;padding:14px 2px;border-bottom:1px solid var(--line);cursor:pointer}
.vt2-lrow .en{font-size:16px;font-weight:700;line-height:1.4;letter-spacing:-0.01em}
.vt2-lrow .ko{font-size:12.5px;color:var(--faint);margin-top:3px}
.vt2-lrow .meta{display:flex;gap:13px;margin-top:6px;font-size:12px;align-items:baseline}
.vt2-lrow .meta .iv{color:var(--faint)}
.vt2-lrow .meta .rs.mid{color:var(--gold-deep);font-weight:700}
.vt2-lrow .meta .rs.low{color:var(--coral-deep);font-weight:700}
.vt2-lrow .grow{flex:1}
.vt2-rail{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px 24px;align-self:start}
.vt2-rrow{display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px;color:var(--mut)}
.vt2-rrow:last-of-type{border-bottom:0}
.vt2-rrow b{font-family:Outfit;font-size:17px;font-weight:700;color:var(--ink)}
.vt2-rrow b.w{color:var(--gold-deep)}.vt2-rrow b.g{color:var(--teal-deep)}
.vt2-leg{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--mut);margin-top:10px}
.vt2-leg i{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
.vt2-hint{font-size:11.5px;color:var(--faint);margin-top:18px;line-height:1.6}
@media (max-width:880px){.vt2-body{grid-template-columns:1fr}}
@media (max-width:599px){
  .vt2{overflow-x:hidden}
  .vt2-top{height:auto}
  .vt2-top-in{padding:calc(8px + env(safe-area-inset-top)) 20px 8px;max-width:none}
  .vt2-wrap{padding:18px 20px calc(40px + env(safe-area-inset-bottom));max-width:none}
  .vt2-hd{gap:10px 12px}
  .vt2-h1{font-size:24px}
  .vt2-mnav{margin-left:0;width:100%;gap:10px;margin-top:2px}
  .vt2-mnav .ml{font-size:15px;margin:0 auto 0 4px}
  .vt2-body{margin-top:14px;gap:0}
  .vt2-cal{gap:5px}
  .vt2-dow{font-size:10.5px;padding:2px 0 5px}
  .vt2-cell{aspect-ratio:1/1;border-radius:10px}
  .vt2-cell .dt{font-size:9.5px;margin-bottom:3px}
  .vt2-cell .vv.i1{font-size:12px}
  .vt2-cell .vv.i2{font-size:15px}
  .vt2-cell .vv.i3{font-size:18px}
  .vt2-msum{gap:20px;margin-top:16px}
  .vt2-chart{height:60px}
  .vt2-day{padding:18px;margin-top:16px}
  .vt2-rail{padding:18px;margin-top:16px}
  .vt2-lrow{gap:11px;padding:13px 2px}
  .vt2-lrow .en{font-size:15px}
}
`;

// ── 데모 폴백 (studyDB 없을 때) ──
const DEMO_DAYS = { 1: 12, 2: 18, 4: 8, 5: 22, 6: 15, 8: 9, 9: 14, 10: 20, 11: 5, 12: 16, 13: 11 };
// 데모 문장 — 오늘 기준 상대(오늘·오늘·-2일·-2일·-7일)로 생성해 캘린더 선택일과 정합.
const DEMO_SENT_SEED = [
  { off: 0, en: 'Is that a promise?', ko: '약속하는 거예요?', score: 92, interval: 7 },
  { off: 0, en: "It's more than a promise. Count on it.", ko: '약속 그 이상이지. 믿어도 돼.', score: 86, interval: 3 },
  { off: 2, en: 'Take it easy.', ko: '잘 지내 / 진정해.', score: 72, interval: 3 },
  { off: 2, en: 'I have no idea.', ko: '전혀 모르겠어.', score: 58, interval: 1 },
  { off: 7, en: 'Sounds good to me.', ko: '저는 좋아요 / 동의해요.', score: 81, interval: 60 },
];
function demoSents(todayISO) {
  return DEMO_SENT_SEED.map((s, i) => {
    const d = new Date(todayISO + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - s.off);
    const iso = d.toISOString().slice(0, 10);
    return { id: 'd' + i, _iso: iso, date: `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`, en: s.en, ko: s.ko, score: s.score, cls: scoreCls(s.score), interval: s.interval };
  });
}

function getLang() { try { const v = sessionStorage.getItem('studyLang'); return v === 'ja' ? 'ja' : 'en'; } catch { return 'en'; } }
function ttsLangOf(l) { return l === 'ja' ? 'ja-JP' : 'en-US'; }
function tier(v) { if (!v) return 0; if (v < 10) return 1; if (v < 18) return 2; return 3; }
function scoreCls(score) { return score >= 75 ? 'good' : score >= 60 ? 'mid' : 'low'; }

// 복습 큐 진입 (그날 학습 문장 전체를 클릭 문장부터 순차).
function goReview(sent, pool, from) {
  const key = sent._iso || sent.date;
  const same = pool.filter((x) => (x._iso || x.date) === key);
  const idx = Math.max(0, same.findIndex((x) => x.id === sent.id));
  const queue = (same.length ? same : [sent]).slice(idx);
  try {
    sessionStorage.setItem('studyReviewQueue', JSON.stringify(queue));
    sessionStorage.setItem('studyReturnTo', from);
  } catch { /* noop */ }
  window.location.hash = `#/session-review?lang=${getLang()}`;
}
function goReviewAll(pool, dayKey, from) {
  const same = pool.filter((x) => (x._iso || x.date) === dayKey);
  try {
    sessionStorage.setItem('studyReviewQueue', JSON.stringify(same));
    sessionStorage.setItem('studyReturnTo', from);
  } catch { /* noop */ }
  window.location.hash = `#/session-review?lang=${getLang()}`;
}

function speak(en, lang) { if (en && window.studySpeech?.speak) window.studySpeech.speak(en, { lang: ttsLangOf(lang) }); }

export function mountStats(host) {
  ensureV2Fonts();
  const todayISO = TODAY();
  const ty = +todayISO.slice(0, 4), tm = +todayISO.slice(5, 7), td = +todayISO.slice(8, 10);
  const st = {
    lang: getLang(),
    tab: (() => { try { return new URLSearchParams(location.hash.split('?')[1] || '').get('tab') === 'sent' ? 'list' : 'cal'; } catch { return 'cal'; } })(),
    year: ty, month: tm,
    selDay: td,
    sort: 'recent',
    dayMap: {}, sents: [],
  };

  const root = h('div', { class: 'vt2' }, v2Style(VT2_CSS));
  host.appendChild(root);

  const prefix = () => `${st.year}-${String(st.month).padStart(2, '0')}`;
  const daysInMonth = () => new Date(st.year, st.month, 0).getDate();
  const firstDow = () => { const d = new Date(st.year, st.month - 1, 1).getDay(); return (d + 6) % 7; }; // Mon=0
  const isCurMonth = () => st.year === ty && st.month === tm;

  async function loadDayMap() {
    const db = window.studyDB;
    if (!db?.sessionLogs) { const m = {}; if (isCurMonth()) Object.assign(m, DEMO_DAYS); st.dayMap = m; return; }
    try {
      const logs = await db.sessionLogs.where('lang').equals(st.lang).toArray();
      const m = {}; const pf = prefix();
      for (const l of logs) { if (!l.date?.startsWith(pf)) continue; const d = +l.date.slice(8, 10); m[d] = (m[d] || 0) + (Number(l.utteranceCount) || 0); }
      st.dayMap = m;
    } catch (e) { console.error('[stats] dayMap', e); st.dayMap = {}; }
  }
  async function loadSents() {
    const db = window.studyDB;
    if (!db?.reviewQueue) { st.sents = demoSents(todayISO); return; }
    try {
      const logs = await db.sessionLogs.where('lang').equals(st.lang).toArray();
      const lastBy = {};
      for (const l of logs) for (const id of (l.sentenceIds || l.newSentenceIds || [])) { if (!lastBy[id] || l.date > lastBy[id]) lastBy[id] = l.date; }
      const cards = await db.reviewQueue.where('lang').equals(st.lang).toArray();
      const r2s = { O: 85, '△': 65, X: 45 };
      st.sents = cards.map((c) => {
        const iso = lastBy[c.id] || (c.createdAt ? c.createdAt.slice(0, 10) : null);
        if (!iso) return null;
        const score = Number.isFinite(c.lastScore) ? c.lastScore : (r2s[c.lastResult] || 80);
        return { id: c.id, _iso: iso, date: `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`, en: c.sentence, ko: c.meaning || c.ko, score, cls: scoreCls(score), interval: c.interval, result: c.lastResult };
      }).filter(Boolean);
    } catch (e) { console.error('[stats] sents', e); st.sents = []; }
  }
  function dayDetail(day) {
    const key = `${st.month}/${day}`;
    const iso = `${prefix()}-${String(day).padStart(2, '0')}`;
    const sents = st.sents.filter((s) => s._iso === iso || s.date === key);
    const utter = st.dayMap[day] || 0;
    const pass = sents.filter((s) => s.cls === 'good').length;
    return { day, iso, sents, utter, pass };
  }

  async function render() {
    await Promise.all([loadDayMap(), loadSents()]);
    root.querySelectorAll('.vt2-main').forEach((n) => n.remove());
    const top = h('div', {},
      h('div', { class: 'vt2-top' }, h('div', { class: 'vt2-top-in' },
        h('button', { class: 'vt2-home', type: 'button', onClick: () => { window.location.hash = '#/home'; } }, vIcon(VI.HOME, { size: 14 }), '홈으로'),
        h('div', { class: 'vt2-seg' },
          h('button', { class: st.lang === 'en' ? 'on' : '', onClick: () => switchLang('en') }, '영어'),
          h('button', { class: st.lang === 'ja' ? 'on' : '', onClick: () => switchLang('ja') }, '일본어')))),
      h('div', { class: 'vt2-wrap' },
        h('div', { class: 'vt2-hd' },
          h('h1', { class: 'vt2-h1' }, '기록'),
          h('div', { class: 'vt2-tabs' },
            h('button', { class: st.tab === 'cal' ? 'on' : '', onClick: () => { st.tab = 'cal'; render(); } }, '캘린더'),
            h('button', { class: st.tab === 'list' ? 'on' : '', onClick: () => { st.tab = 'list'; render(); } }, '문장 목록')),
          st.tab === 'cal' ? h('div', { class: 'vt2-mnav' },
            h('button', { class: 'mb', onClick: () => moveMonth(-1) }, '← ' + MONTHS_KO(st.month === 1 ? 12 : st.month - 1)),
            h('span', { class: 'ml' }, `${st.year}년 ${MONTHS_KO(st.month)}`),
            h('button', { class: 'mb' + (isCurMonth() ? ' off' : ''), onClick: () => { if (!isCurMonth()) moveMonth(1); } }, MONTHS_KO(st.month === 12 ? 1 : st.month + 1) + ' →')) : null),
        st.tab === 'cal' ? calBody() : listBody(),
      ),
    );
    top.className = 'vt2-main';
    root.appendChild(top);
  }

  function switchLang(l) { if (l === st.lang) return; st.lang = l; try { sessionStorage.setItem('studyLang', l); } catch { /* noop */ } render(); }
  function moveMonth(delta) {
    let m = st.month + delta, y = st.year;
    if (m < 1) { m = 12; y -= 1; } if (m > 12) { m = 1; y += 1; }
    if (y > ty || (y === ty && m > tm)) return; // 미래 금지
    st.month = m; st.year = y; st.selDay = (y === ty && m === tm) ? td : 1; render();
  }

  function calBody() {
    const din = daysInMonth(), fdow = firstDow();
    const cells = [];
    for (let i = 0; i < fdow; i++) cells.push(h('div'));
    for (let d = 1; d <= din; d++) {
      const v = st.dayMap[d] || 0; const t = tier(v);
      const isFuture = isCurMonth() && d > td;
      const cls = ['vt2-cell'];
      if (d === st.selDay) cls.push('sel'); else if (t > 0) cls.push('t' + t);
      if (isCurMonth() && d === td) cls.push('today');
      if (isFuture) cls.push('future');
      cells.push(h('button', { class: cls.join(' '), type: 'button', style: `animation-delay:${d * 12}ms`, onClick: isFuture ? null : () => { st.selDay = d; render(); } },
        h('span', { class: 'dt' }, String(d)),
        v > 0 ? h('span', { class: 'vv i' + t }, String(v)) : null));
    }
    // 월 요약
    const monthDays = Object.values(st.dayMap).filter((x) => x > 0).length;
    const monthUtter = Object.values(st.dayMap).reduce((s, x) => s + x, 0);
    const det = dayDetail(st.selDay);
    // 일별 차트
    const maxV = Math.max(...Object.values(st.dayMap), 1);
    const bars = [];
    for (let d = 1; d <= din; d++) {
      const v = st.dayMap[d] || 0;
      bars.push(h('i', { class: (v === 0 ? 'zero' : '') + (d === st.selDay ? ' sel' : '') + (isCurMonth() && d === td ? ' today' : ''),
        style: `height:${Math.max((v / maxV) * 100, v > 0 ? 8 : 0)}%;animation-delay:${d * 18}ms`,
        onClick: (isCurMonth() && d > td) || v === 0 ? null : () => { st.selDay = d; render(); } }));
    }
    return h('div', { class: 'vt2-body' },
      h('div', {},
        h('div', { class: 'vt2-cal' }, DOW.map((d) => h('div', { class: 'vt2-dow' }, d)), cells),
        h('div', { class: 'vt2-msum' },
          h('span', {}, '활동 일수', h('b', {}, monthDays + '일')),
          h('span', {}, '총 발화', h('b', {}, monthUtter + '회')),
          h('span', { class: 'ps' }, '문장', h('b', {}, st.sents.length + ''))),
        h('div', { class: 'vt2-chartlab' }, '일별 발화 — 막대를 눌러도 날짜가 선택돼요'),
        h('div', { class: 'vt2-chart' }, bars),
        h('div', { class: 'vt2-chartx' }, ['1', '8', '15', '22', String(din)].map((x) => h('span', {}, x)))),
      dayPanel(det),
    );
  }

  function dayPanel(det) {
    const sentRows = det.sents.length ? det.sents.map((s) => h('div', { class: 'vt2-srow', onClick: () => goReview(s, st.sents, 'stats') },
      h('div', {}, h('div', { class: 'en' }, s.en), h('div', { class: 'ko' }, s.ko)),
      h('span', { class: 'grow' }),
      h('span', { class: 'vt2-sc ' + s.cls }, String(s.score)),
      h('button', { class: 'vt2-cir', type: 'button', onClick: (e) => { e.stopPropagation(); speak(s.en, st.lang); } }, vIcon(VI.PLAY, { size: 10, fill: true })),
    )) : [h('div', { style: 'font-size:13px;color:var(--faint);padding:12px 0;' }, '이날은 학습 기록이 없어요.')];
    return h('div', { class: 'vt2-day' },
      h('div', { class: 'dh' }, h('span', { class: 'dt2' }, `${st.month}월 ${det.day}일`), h('span', { class: 'dd' }, '선택한 날')),
      h('div', { class: 'dstats' },
        h('div', { class: 'ds' }, h('div', { class: 'lb' }, '발화'), h('div', { class: 'v' }, String(det.utter), h('em', {}, '회'))),
        h('div', { class: 'ds' }, h('div', { class: 'lb' }, '통과 / 문장'), h('div', { class: 'v' }, h('span', { class: 'ps' }, String(det.pass)), h('em', {}, ' / ' + det.sents.length)))),
      h('div', { class: 'vt2-slab' }, '이날 학습한 문장'),
      h('div', {}, sentRows),
      det.sents.length ? h('button', { class: 'vt2-cta', type: 'button', onClick: () => goReviewAll(st.sents, det.sents[0]._iso || det.sents[0].date, 'stats') }, `이날 문장 ${det.sents.length}개 복습하기 →`) : null,
      det.sents.length ? h('div', { class: 'vt2-cap' }, '문장을 누르면 그 문장부터, 버튼을 누르면 처음부터 복습 큐로 이어져요') : null,
    );
  }

  function listBody() {
    const sorted = st.sents.slice();
    if (st.sort === 'weak') sorted.sort((a, b) => a.score - b.score);
    else if (st.sort === 'grad') sorted.sort((a, b) => (b.interval || 0) - (a.interval || 0));
    else sorted.sort((a, b) => (b._iso || '').localeCompare(a._iso || ''));
    // 날짜 그룹
    const groups = []; let cur = null;
    for (const s of sorted) { const k = s.date; if (!cur || cur.k !== k) { cur = { k, items: [] }; groups.push(cur); } cur.items.push(s); }
    const weak = st.sents.filter((s) => s.score < 75).length;
    const grad = st.sents.filter((s) => (s.interval || 0) >= 30).length;
    const avg = st.sents.length ? Math.round(st.sents.reduce((s, x) => s + x.score, 0) / st.sents.length) : 0;

    const rows = groups.flatMap((g) => [
      h('div', { class: 'vt2-dhdr' }, `${g.k}${g.items[0]._iso === `${st.year}-${String(st.month).padStart(2, '0')}-${String(td).padStart(2, '0')}` ? ' — 오늘' : ''}`),
      ...g.items.map((s) => h('div', { class: 'vt2-lrow', onClick: () => goReview(s, st.sents, 'sentList') },
        h('div', {},
          h('div', { class: 'en' }, s.en), h('div', { class: 'ko' }, s.ko),
          h('div', { class: 'meta' },
            h('span', { class: 'vt2-sc ' + s.cls }, String(s.score)),
            h('span', { class: 'iv' }, (s.interval || 7) + '일 후 복습'),
            s.cls === 'mid' ? h('span', { class: 'rs mid' }, 'Hmm') : s.cls === 'low' ? h('span', { class: 'rs low' }, 'No') : null)),
        h('span', { class: 'grow' }),
        h('button', { class: 'vt2-cir', type: 'button', onClick: (e) => { e.stopPropagation(); speak(s.en, st.lang); } }, vIcon(VI.PLAY, { size: 10, fill: true })),
        h('button', { class: 'vt2-cir', type: 'button', onClick: (e) => { e.stopPropagation(); goReview(s, st.sents, 'sentList'); } }, vIcon(VI.MIC, { size: 12, sw: 2 })),
      )),
    ]);

    return h('div', { class: 'vt2-body' },
      h('div', {},
        h('div', { class: 'vt2-sort' },
          h('button', { class: 'vt2-sortp' + (st.sort === 'recent' ? ' on' : ''), onClick: () => { st.sort = 'recent'; render(); } }, '최신순'),
          h('button', { class: 'vt2-sortp' + (st.sort === 'weak' ? ' on' : ''), onClick: () => { st.sort = 'weak'; render(); } }, '약한 문장'),
          h('button', { class: 'vt2-sortp' + (st.sort === 'grad' ? ' on' : ''), onClick: () => { st.sort = 'grad'; render(); } }, '졸업 임박')),
        rows.length ? h('div', {}, rows) : h('div', { style: 'margin-top:30px;color:var(--faint);font-size:14px;' }, '아직 학습한 문장이 없어요.')),
      h('div', { class: 'vt2-rail' },
        h('div', { class: 'vt2-slab', style: 'margin-top:0;' }, '요약'),
        h('div', { style: 'margin-top:8px;' },
          h('div', { class: 'vt2-rrow' }, h('span', {}, '총 문장'), h('b', {}, String(st.sents.length))),
          h('div', { class: 'vt2-rrow' }, h('span', {}, '약한 문장'), h('b', { class: 'w' }, String(weak))),
          h('div', { class: 'vt2-rrow' }, h('span', {}, '졸업 임박'), h('b', {}, String(grad))),
          h('div', { class: 'vt2-rrow' }, h('span', {}, '평균 점수'), h('b', { class: 'g' }, String(avg)))),
        h('div', { class: 'vt2-slab', style: 'margin-top:22px;' }, '점수 기준'),
        h('div', { class: 'vt2-leg' }, h('i', { style: 'background:var(--teal)' }), '통과 — 75점 이상'),
        h('div', { class: 'vt2-leg' }, h('i', { style: 'background:var(--gold)' }), '애매 — 60–74점'),
        h('div', { class: 'vt2-leg' }, h('i', { style: 'background:var(--coral)' }), '다시 — 60점 미만'),
        h('div', { class: 'vt2-hint' }, '문장을 누르면 그날 학습한 문장들로 복습 세션이 시작돼요.')),
    );
  }

  render();
  return () => { host.innerHTML = ''; };
}
