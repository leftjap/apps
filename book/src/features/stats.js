/**
 * 통계 — st-* 리디자인 (시안 stats.js + styles-stats.css 이식, SCREEN 03).
 * 실집계 유지(거짓 수치 없음 — 시드/Dexie 집계):
 *  - PeriodSeg(이번 달/올해/전체) 토글 → 기간 필터 + 재렌더
 *  - 밀리 독서시간(book_reading_seconds) + 최근 7일 스파크라인(시안 추가분, 실데이터)
 *  - 연속(streak, 전체 기준) · 숫자3(어구록/책/작가) + 기간 비교(이번/지난)
 *  - 캘린더(최신 달 일별 어구록·표지, 일 클릭 → /day) + 책장(top books → /book)
 *  - 작가/출판사/분야(+증감 ↑↓) 랭킹 · 단어 클라우드(불용어 필터, 단어 → /word)
 *  - 카운트업: 핵심 숫자만, prefers-reduced-motion 존중 (시안 countUp)
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { BOOKS, bookOf } from '../data/books.js';
import { el, clear } from '../ui/dom.js';
import { iconEl } from '../ui/icons.js';
import { cover } from '../ui/cover.js';
import { screenShell } from '../ui/components.js';
import { wordCloud } from '../ui/charts.js';
import { tokenize } from '../ui/text.js';
import { supabase } from '../services/supabase.js';

function ownerIdsOf(user) {
  return [user?.id, Profile.getPartnerUserIdForEmail(user?.email)].filter(Boolean);
}
const dayKey = (iso) => (iso || '').slice(0, 10);
const monthKey = (iso) => (iso || '').slice(0, 7);
const topCat = (b) => (b?.c ? b.c.split('·')[0].trim() : '기타');
const coverAt = (b, width, opts = {}) => cover(b, { scale: width / (b?.w || 130), lift: false, ...opts });
const fmtDur = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}시간 ${m}분` : `${m}분`; };

/* ── 카드/헤더 헬퍼 (st-*) ── */
const card = (children, cls = '') => el('div', { class: ('st-card ' + cls).trim() }, ...(Array.isArray(children) ? children : [children]));
const panelHead = (title, sub, right) => el('div', { class: 'st-panelhead' },
  el('h3', {}, title), sub != null ? el('span', { class: 'sub' }, String(sub)) : null,
  el('span', { class: 'sp' }), right || null);
const moreBtn = (label, onClick) => el('button', { class: 'st-more', onClick }, label, iconEl('ar', { sz: 13 }));
const stEmpty = (msg) => el('div', { class: 'st-empty' }, msg);
function num(l, n, u, count) {
  const v = el('div', { class: 'v' }, String(n), u ? el('span', { class: 'u' }, u) : null);
  if (count && /^\d+$/.test(String(n))) v.dataset.count = String(n);
  return el('div', { class: 'st-num' }, el('div', { class: 'l' }, l), v);
}

/* ── 카운트업 — 핵심 숫자만. reduced-motion 존중, 최종값 보장 (시안 countUp) ── */
function countUp(root) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-count]').forEach((elm) => {
    const target = parseFloat(elm.dataset.count);
    if (isNaN(target)) return;
    const dur = 650, t0 = performance.now();
    const setText = (v) => {
      if (elm.firstChild && elm.firstChild.nodeType === 3) elm.firstChild.textContent = String(v);
      else elm.insertBefore(document.createTextNode(String(v)), elm.firstChild);
    };
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      setText(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step); else setText(target);
    };
    setText(0); requestAnimationFrame(step);
  });
}

/* ── 페이지 타이틀 + 기간 토글 ── */
const pageTitle = (upper, title, right) => el('div', { class: 'st-pagetitle' },
  el('div', {}, el('div', { class: 'upper' }, upper), el('h1', {}, title)), right);
const periodSeg = (active, onPick) => el('div', { class: 'st-seg' },
  ...['이번 달', '올해', '전체'].map((n) => el('button', { class: n === active ? 'on' : '', onClick: () => onPick(n) }, n)));

/* ── streak (전체 기준 — feed 구버전과 동일 로직 유지) ── */
function computeStats(quotes) {
  const total = quotes.length;
  if (!total) return { total: 0, days: 0, longest: 0, dailyAvg: 0, lastEntry: '—', weekHits: [0, 0, 0, 0, 0, 0, 0], todayDow: 4 };
  const days = [...new Set(quotes.map((q) => dayKey(q.created_at || q.updated_at)).filter(Boolean))].sort().reverse();
  const dayMs = 86400000;
  const diff = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / dayMs);
  let current = 1; for (let i = 1; i < days.length; i++) { if (diff(days[i - 1], days[i]) === 1) current++; else break; }
  let longest = 1, run = 1; for (let i = 1; i < days.length; i++) { if (diff(days[i - 1], days[i]) === 1) { run++; longest = Math.max(longest, run); } else run = 1; }
  const latestIso = quotes.map((q) => q.created_at || q.updated_at).filter(Boolean).sort().reverse()[0];
  const latest = new Date(latestIso);
  const dow = (latest.getUTCDay() + 6) % 7;
  const monday = new Date(latest); monday.setUTCDate(latest.getUTCDate() - dow);
  const weekHits = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setUTCDate(monday.getUTCDate() + i); return days.includes(d.toISOString().slice(0, 10)) ? 1 : 0; });
  const lastEntry = `${String(latest.getUTCMonth() + 1).padStart(2, '0')}.${String(latest.getUTCDate()).padStart(2, '0')} ${String(latest.getUTCHours()).padStart(2, '0')}:${String(latest.getUTCMinutes()).padStart(2, '0')}`;
  return { total, days: current, longest, dailyAvg: Math.round((total / days.length) * 10) / 10, lastEntry, weekHits, todayDow: dow };
}

function streakCard(s) {
  const strip = el('div', { class: 'sc-strip' }, ...s.weekHits.map((h, i) => el('span', { class: h ? (i === s.todayDow ? 'on now' : 'on') : '' })));
  const dows = el('div', { class: 'sc-dows' }, ...['월', '화', '수', '목', '금', '토', '일'].map((d, i) => el('span', { class: i === s.todayDow ? 'cur' : '' }, d)));
  const stats = el('div', { class: 'sc-stats' },
    ...[['최장', `${s.longest}일`], ['평균', `${s.dailyAvg}/일`], ['마지막', s.lastEntry]].map(([l, v]) => el('div', { class: 'sc-st' }, el('div', { class: 'l' }, l), el('div', { class: 'v' }, v))));
  return el('div', { class: 'st-streak' },
    el('div', { class: 'glow' }),
    el('div', { class: 'inner' },
      el('div', { class: 'upper' }, '연속', el('span', { class: 'dot' })),
      el('div', { class: 'big' }, el('span', { class: 'n', dataset: { count: String(s.days) } }, String(s.days)), el('span', { class: 'u' }, '일째')),
      el('div', { class: 'week' }, strip, dows), stats));
}

function comparisonCard(topLabel, current, prev, unit, period) {
  const max = Math.max(current, prev, 1); const diff = current - prev;
  const barRow = (lab, val, strong) => el('div', { class: 'cmp-row' },
    el('span', { class: 'lab' + (strong ? ' s' : '') }, lab),
    el('div', { class: 'track' }, el('div', { class: 'fill' + (strong ? ' s' : ''), style: { width: `${(val / max) * 100}%` } })),
    el('span', { class: 'val' + (strong ? ' s' : '') }, String(val), el('span', { class: 'u' }, unit)));
  return el('div', { class: 'st-cmp' },
    el('div', { class: 'cmp-head' }, el('span', { class: 'upper' }, topLabel),
      period != null ? el('span', { class: 'period' }, String(period)) : null,
      el('span', { class: 'sp' }),
      el('span', { class: 'diff' + (diff > 0 ? ' up' : '') }, `${diff > 0 ? '↑' : diff < 0 ? '↓' : ''}${Math.abs(diff)}${unit}`)),
    barRow('이번', current, true), barRow('지난', prev, false));
}

/* ── 캘린더 (특정 연/월) — 일별 어구록 수 + 대표 표지, 일 클릭 → /day ── */
function calendar(year, month, dayData, ctx) {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const head = el('div', { class: 'cal-head' }, ...['일', '월', '화', '수', '목', '금', '토'].map((d, i) => el('span', { class: i === 0 ? 'sun' : '' }, d)));
  const grid = el('div', { class: 'cal-grid' });
  cells.forEach((d, i) => {
    if (d == null) { grid.appendChild(el('div', {})); return; }
    const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const data = dayData[key];
    const dow = i % 7;
    const cell = el('div', {
      class: data ? 'cal-cell on' : 'cal-cell',
      onClick: data ? () => ctx.navigate(`/day/${key}`) : undefined,
    },
      el('span', { class: 'dn' + (dow === 0 ? ' sun' : '') }, String(d)),
      data && data.count > 1 ? el('span', { class: 'ct' }, String(data.count)) : null,
      data ? el('span', { class: 'cv' }, coverAt(data.books[0], 24)) : null);
    grid.appendChild(cell);
  });
  return el('div', { class: 'st-cal' }, head, grid);
}

async function render(host, params, ctx) {
  const owners = ownerIdsOf(ctx.user);
  let quotes = [];
  try { quotes = await Queries.listAllQuotes(owners); } catch (e) { console.warn('[stats] 로드 실패', e?.message || e); }

  // 밀리 독서시간 (book_reading_seconds — millie-sync 적재, RLS 본인+파트너) + 최근 7일 스파크
  const reading = { today: 0, week: 0, month: 0 };
  const week7 = []; // [{ label, min, today }]
  try {
    const now = new Date();
    const lk = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const byDay = new Map();
    if (supabase && owners.length) {
      const { data } = await supabase
        .from('book_reading_seconds')
        .select('day,seconds')
        .in('owner_id', owners);
      for (const r of data || []) byDay.set(r.day, (byDay.get(r.day) || 0) + r.seconds);
    }
    const todayK = lk(now);
    const wkAgo = new Date(now); wkAgo.setDate(now.getDate() - 6);
    const wkStart = lk(wkAgo);
    const moK = todayK.slice(0, 7);
    for (const [day, sec] of byDay) {
      if (day === todayK) reading.today += sec;
      if (day >= wkStart && day <= todayK) reading.week += sec;
      if (day.slice(0, 7) === moK) reading.month += sec;
    }
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      week7.push({ label: ['일', '월', '화', '수', '목', '금', '토'][d.getDay()], min: Math.round((byDay.get(lk(d)) || 0) / 60), today: i === 0 });
    }
  } catch (e) { console.warn('[stats] 독서시간 로드 실패', e?.message || e); }

  const streak = computeStats(quotes); // 연속 — 전체 기준 (기간 토글 무관)
  const allMonths = [...new Set(quotes.map((q) => monthKey(q.created_at)).filter(Boolean))].sort().reverse();
  const curM = allMonths[0] || '2026-05';
  const prevM = allMonths[1];
  const curY = curM.slice(0, 4);
  const years = [...new Set(quotes.map((q) => (q.created_at || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const prevY = years[1];
  const [calY, calMo] = curM.split('-').map(Number);
  const catCounts = (subset) => { const m = new Map(); for (const q of subset) { const b = bookOf(q.book_ref); if (b) m.set(topCat(b), (m.get(topCat(b)) || 0) + 1); } return m; };

  function periodData(period) {
    if (period === '올해') return { sub: quotes.filter((q) => (q.created_at || '').slice(0, 4) === curY), prev: prevY ? quotes.filter((q) => (q.created_at || '').slice(0, 4) === prevY) : [], title: `${curY}년`, pLabel: curY };
    if (period === '전체') return { sub: quotes, prev: [], title: '전체', pLabel: '전체' };
    return { sub: quotes.filter((q) => monthKey(q.created_at) === curM), prev: prevM ? quotes.filter((q) => monthKey(q.created_at) === prevM) : [], title: `${calY}년 ${calMo}월`, pLabel: `${calMo}월` };
  }

  const container = el('div', { class: 'st-page' });
  // 데이터에 실 독서일이 없어 어구록이 단일 날짜에 몰려 있음 → 기본 '전체'로 전부 노출.
  let active = '전체';

  /* 밀리 독서시간 카드 (+ 주간 스파크라인 — 시안 추가분) */
  function readingCard() {
    const max = Math.max(...week7.map((w) => w.min), 1);
    const spark = el('div', { class: 'st-spark' },
      ...week7.map((w) => el('div', { class: w.today ? 'sp-col today' : 'sp-col' },
        el('div', { class: 'sp-bar-track' }, el('div', { class: 'sp-bar', style: { height: `${Math.round((w.min / max) * 100)}%` } })),
        el('span', { class: 'sp-d' }, w.label))));
    return card([
      panelHead('밀리 독서시간', '오늘 · 이번주 · 이번달'),
      el('div', { class: 'st-reading' },
        el('div', { class: 'rd-nums' },
          num('오늘', fmtDur(reading.today)), num('이번주', fmtDur(reading.week)), num('이번달', fmtDur(reading.month))),
        el('div', { class: 'rd-spark' }, el('div', { class: 'rd-spark-lab' }, '최근 7일'), spark)),
    ], 'pad-lg');
  }

  function renderBody() {
    clear(container);
    const { sub, prev, title, pLabel } = periodData(active);

    const byBook = new Map(); for (const q of sub) byBook.set(String(q.book_ref), (byBook.get(String(q.book_ref)) || 0) + 1);
    const usedBooks = [...byBook.keys()].map(bookOf).filter(Boolean);
    const distinctBooks = usedBooks.length;
    const distinctAuthors = new Set(usedBooks.map((b) => b.a)).size;
    const topBooks = [...byBook.entries()].map(([ref, c]) => ({ ref, b: bookOf(ref), c })).filter((x) => x.b).sort((a, b) => b.c - a.c).slice(0, 6);
    const byAuthor = new Map(); const byPub = new Map();
    for (const [ref, c] of byBook) { const b = bookOf(ref); if (!b) continue; byAuthor.set(b.a, (byAuthor.get(b.a) || 0) + c); byPub.set(b.p, (byPub.get(b.p) || 0) + c); }
    const topAuthors = [...byAuthor.entries()].map(([name, q]) => ({ name, q, books: BOOKS.filter((b) => b.a === name && byBook.has(String(b.id))).length, pub: BOOKS.find((b) => b.a === name)?.p })).sort((a, b) => b.q - a.q).slice(0, 6);
    const topPubs = [...byPub.entries()].map(([name, q]) => ({ name, q, books: BOOKS.filter((b) => b.p === name && byBook.has(String(b.id))).length, authors: new Set(BOOKS.filter((b) => b.p === name && byBook.has(String(b.id))).map((b) => b.a)).size })).sort((a, b) => b.q - a.q).slice(0, 6);
    // 분야 + 직전 기간 대비 증감
    const curCat = catCounts(sub); const prevCat = catCounts(prev);
    const cats = [...curCat.entries()].map(([n, v]) => ({ n, v, diff: v - (prevCat.get(n) || 0) })).sort((a, b) => b.v - a.v);
    const catMax = Math.max(1, ...cats.map((c) => c.v));
    // 비교 (선택 기간 vs 직전 동일 기간)
    const curN = sub.length; const prevN = prev.length;
    const prevBooks = new Set(prev.map((q) => q.book_ref)).size;
    // 캘린더 — 항상 최신 달 (이번 달 활동 뷰)
    const dayData = {};
    for (const q of quotes) {
      if (monthKey(q.created_at) !== curM) continue;
      const k = dayKey(q.created_at); const b = bookOf(q.book_ref); if (!b) continue;
      if (!dayData[k]) dayData[k] = { books: [], count: 0 };
      dayData[k].count++; if (!dayData[k].books.some((x) => x.id === b.id)) dayData[k].books.push(b);
    }
    // 단어 빈도 (불용어 제외)
    const wordFreq = new Map(); for (const q of sub) for (const w of tokenize(q.text)) wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
    const topWords = [...wordFreq.entries()].filter(([, c]) => c >= 1).sort((a, b) => b[1] - a[1]).slice(0, 50);

    /* row1: 연속 + 숫자3 + 비교 */
    const hasPrev = prevN > 0 || active !== '전체';
    const row1 = el('div', { class: 'st-row1' },
      streakCard(streak),
      card([
        el('div', { class: hasPrev ? 'st-nums3' : 'st-nums3 solo' },
          num('어구록', curN, '개', true), num('책', distinctBooks, '권', true), num('작가', distinctAuthors, '명', true)),
        hasPrev ? el('div', { class: 'st-compares' },
          comparisonCard('어구록', curN, prevN, '개', pLabel),
          comparisonCard('책', distinctBooks, prevBooks, '권', pLabel)) : null,
      ], 'pad-lg'));

    /* row2: 캘린더 + 책장 */
    const shelf = el('div', { class: 'st-shelf' }, ...topBooks.map((t) => el('div', {
      class: 'sh-book', onClick: () => ctx.navigate(`/book/${t.ref}`),
    },
      coverAt(t.b, 58, { lift: true }),
      el('div', { class: 'meta' }, el('div', { class: 'c' }, String(t.c)), el('div', { class: 'tt' }, t.b.t)))));
    const row2 = el('div', { class: 'st-row2' },
      card([panelHead('캘린더', `${calY}년 ${calMo}월`), calendar(calY, calMo, dayData, ctx)]),
      card([panelHead('책', `${distinctBooks}권`, moreBtn('책 전체', () => ctx.navigate('/all/books'))),
        topBooks.length ? shelf : stEmpty('책이 없습니다.')]));

    /* row3: 작가 / 출판사 / 분야 */
    const authorRow = (a, i) => el('div', { class: 'rk-row', onClick: () => ctx.navigate(`/author/${encodeURIComponent(a.name)}`) },
      el('span', { class: 'rk' }, String(i + 1).padStart(2, '0')),
      el('div', { class: 'main' }, el('div', { class: 'nm' }, a.name), el('div', { class: 'sub' }, a.pub)),
      el('span', { class: 'b' }, `${a.books}권`), el('span', { class: 'q' }, String(a.q)));
    const pubRow = (p, i) => el('div', { class: 'rk-row pub' },
      el('span', { class: 'rk' }, String(i + 1).padStart(2, '0')),
      el('span', { class: 'nm1' }, p.name),
      el('span', { class: 'b' }, `${p.authors}명`), el('span', { class: 'b' }, `${p.books}권`), el('span', { class: 'q' }, String(p.q)));
    const catBar = (c) => el('div', { class: 'cat-row' },
      el('span', { class: 'nm' }, c.n),
      el('div', { class: 'track' }, el('div', { class: 'fill', style: { width: `${(c.v / catMax) * 100}%` } })),
      el('span', { class: 'q' }, String(c.v)),
      el('span', { class: 'diff' + (c.diff > 0 ? ' up' : '') }, c.diff > 0 ? `↑${c.diff}` : c.diff < 0 ? `↓${-c.diff}` : '·'));
    const row3 = el('div', { class: 'st-row3' },
      card([panelHead('작가', `${distinctAuthors}명`, moreBtn('작가 전체', () => ctx.navigate('/all/authors'))), ...(topAuthors.length ? topAuthors.map(authorRow) : [stEmpty('작가가 없습니다.')])]),
      card([panelHead('출판사', `${byPub.size}곳`, moreBtn('출판사 전체', () => ctx.navigate('/all/pubs'))), ...(topPubs.length ? topPubs.map(pubRow) : [stEmpty('출판사가 없습니다.')])]),
      card([panelHead('분야', `${cats.length}개`), ...(cats.length ? cats.map(catBar) : [stEmpty('분야가 없습니다.')])]));

    /* row4: 단어 클라우드 */
    const cloud = el('div', { class: 'st-cloud' },
      wordCloud({ words: topWords, W: 1100, H: 270, scale: 0.74, onWord: (w) => ctx.navigate(`/word/${encodeURIComponent(w)}`) }));
    const row4 = card([panelHead('단어', `상위 ${topWords.length}`, moreBtn('단어 전체', () => topWords[0] && ctx.navigate(`/word/${encodeURIComponent(topWords[0][0])}`))),
      topWords.length ? cloud : stEmpty('아직 단어가 부족합니다.')], 'pad-md');

    container.append(
      pageTitle('통계', title, periodSeg(active, onPeriod)),
      readingCard(),
      row1, row2, row3, row4,
    );
    // 좁은 화면에서 클라우드가 가로 스크롤일 때 초기 위치를 중앙(단어 군집)으로
    setTimeout(() => { cloud.scrollLeft = (cloud.scrollWidth - cloud.clientWidth) / 2; }, 0);
  }

  function onPeriod(p) { if (p !== active) { active = p; renderBody(); requestAnimationFrame(() => countUp(container)); } }
  renderBody();
  requestAnimationFrame(() => countUp(container));
  host.appendChild(screenShell({ tab: 'stats', ctx, children: el('div', { class: 'bookv4' }, container) }));
}

registerScreen('stats', render);
export default render;
