/**
 * 통계 — v14 ScrStatsV14 이식. 시드/Dexie 에서 실집계 (거짓 수치 없음).
 *  - PeriodSeg(이번 달/올해/전체) 토글 → 기간 필터 + 재렌더 (stats-v14.jsx:49-62,182)
 *  - 3 숫자(어구록/책/작가) + StreakCard(전체 기준) + 월/연 비교
 *  - 캘린더(최신 달 일별 어구록·표지) + 책장(top books)
 *  - 작가/출판사/분야(+증감 ↑↓) 랭킹 — stats-v14.jsx:83-122
 *  - 단어(WordCloud packing, 불용어 필터)
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { BOOKS, bookOf } from '../data/books.js';
import { el, clear } from '../ui/dom.js';
import { cover } from '../ui/cover.js';
import { screenShell, pageTitle, streakCard, comparisonCard, btn } from '../ui/components.js';
import { wordCloud } from '../ui/charts.js';
import { tokenize } from '../ui/text.js';
import { supabase } from '../services/supabase.js';

function ownerIdsOf(user) {
  return [user?.id, Profile.getPartnerUserIdForEmail(user?.email)].filter(Boolean);
}
const dayKey = (iso) => (iso || '').slice(0, 10);
const monthKey = (iso) => (iso || '').slice(0, 7);
const topCat = (b) => (b?.c ? b.c.split('·')[0].trim() : '기타');

const card = (children, padding = '24px 26px') => el('div', { style: { background: '#fff', borderRadius: 14, padding, border: '1px solid var(--line-2)', boxShadow: '0 1px 2px rgba(20,18,14,0.03), 0 8px 24px -10px rgba(20,18,14,0.07)' } }, ...(Array.isArray(children) ? children : [children]));
const panelHead = (title, sub, right) => el('div', { style: { display: 'flex', alignItems: 'baseline', marginBottom: 20 } },
  el('h3', { style: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, title),
  sub != null ? el('span', { class: 'mono', style: { fontSize: 12, color: 'var(--ink-4)', marginLeft: 10 } }, String(sub)) : null,
  el('div', { style: { flex: 1 } }), right || null);

// PeriodSeg (stats-v14.jsx:49-62) — 이번 달/올해/전체
const periodSeg = (active, onPick) => el('div', { style: { display: 'inline-flex', background: 'var(--paper)', borderRadius: 99, padding: 3 } },
  ...['이번 달', '올해', '전체'].map((n) => el('button', {
    onClick: () => onPick(n),
    style: { padding: '8px 16px', borderRadius: 99, fontSize: 13, fontWeight: n === active ? 700 : 500, color: n === active ? 'var(--ink-1)' : 'var(--ink-3)', background: n === active ? '#fff' : 'transparent', boxShadow: n === active ? '0 1px 2px rgba(20,18,14,.06)' : 'none', border: 0, cursor: 'pointer' },
  }, n)));

// streak (feed.js 와 동일 로직) — 전체 기준
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

// 캘린더 (특정 연/월) — 일별 어구록 수 + 대표 표지
function calendar(year, month, dayData, ctx) {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const dows = ['일', '월', '화', '수', '목', '금', '토'];
  const head = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 } },
    ...dows.map((d, i) => el('div', { style: { height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: i === 0 ? '#c2553a' : 'var(--ink-3)' } }, d)));
  const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '76px' } });
  cells.forEach((d, i) => {
    if (d == null) { grid.appendChild(el('div', {})); return; }
    const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const data = dayData[key];
    const dow = i % 7;
    const cell = el('div', {
      class: data ? 'cal-cell-active' : '', onClick: data ? () => ctx.navigate(`/day/${key}`) : undefined,
      style: { position: 'relative', cursor: data ? 'pointer' : 'default', borderRadius: 8, transition: 'background .12s' },
    },
      el('div', { style: { position: 'absolute', top: 6, left: 8, fontSize: 10.5, fontFamily: 'var(--mono)', color: dow === 0 ? '#c2553a' : data ? 'var(--ink-2)' : 'var(--ink-4)', fontWeight: 500, opacity: data ? 1 : 0.55, zIndex: 5 } }, String(d)),
      data && data.count > 1 ? el('div', { style: { position: 'absolute', top: 5, right: 6, minWidth: 16, height: 16, padding: '0 5px', background: '#fff', border: '1px solid var(--line)', borderRadius: 99, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', zIndex: 6 } }, String(data.count)) : null,
      data ? el('div', { style: { position: 'absolute', left: '50%', bottom: 8, transform: 'translateX(-50%)' } }, cover(data.books[0], { scale: 0.2, lift: false })) : null,
    );
    grid.appendChild(cell);
  });
  return el('div', {}, head, grid);
}

async function render(host, params, ctx) {
  const owners = ownerIdsOf(ctx.user);
  let quotes = [];
  try { quotes = await Queries.listAllQuotes(owners); } catch (e) { console.warn('[stats] 로드 실패', e?.message || e); }

  // 밀리 독서시간 (book_reading_seconds — millie-sync 가 적재, RLS 본인+파트너)
  const reading = { today: 0, week: 0, month: 0 };
  try {
    if (supabase && owners.length) {
      const { data } = await supabase
        .from('book_reading_seconds')
        .select('day,seconds')
        .in('owner_id', owners);
      const now = new Date();
      const lk = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const todayK = lk(now);
      const wkAgo = new Date(now); wkAgo.setDate(now.getDate() - 6);
      const wkStart = lk(wkAgo);
      const moK = todayK.slice(0, 7);
      for (const r of data || []) {
        if (r.day === todayK) reading.today += r.seconds;
        if (r.day >= wkStart && r.day <= todayK) reading.week += r.seconds;
        if (r.day.slice(0, 7) === moK) reading.month += r.seconds;
      }
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

  const container = el('div', { class: 'page', style: { padding: '36px 36px 100px' } });
  // 데이터에 실 독서일이 없어 어구록이 단일 날짜에 몰려 있음 → 기본 '전체'로 991건 전부 노출.
  let active = '전체';

  function renderBody() {
    clear(container);
    const { sub, prev, title, pLabel } = periodData(active);

    const byBook = new Map(); for (const q of sub) byBook.set(String(q.book_ref), (byBook.get(String(q.book_ref)) || 0) + 1);
    const usedBooks = [...byBook.keys()].map(bookOf).filter(Boolean);
    const distinctBooks = usedBooks.length;
    const distinctAuthors = new Set(usedBooks.map((b) => b.a)).size;
    const topBooks = [...byBook.entries()].map(([ref, c]) => ({ b: bookOf(ref), c })).filter((x) => x.b).sort((a, b) => b.c - a.c).slice(0, 5);
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
    const curBooks = distinctBooks; const prevBooks = new Set(prev.map((q) => q.book_ref)).size;
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

    const num = (l, n, u) => el('div', {}, el('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 12, fontWeight: 500 } }, l),
      el('div', { class: 'mono', style: { fontSize: 44, fontWeight: 700, letterSpacing: '-.032em', lineHeight: 1 } }, String(n), el('span', { style: { fontSize: 14, color: 'var(--ink-3)', fontWeight: 500, marginLeft: 6, fontFamily: 'var(--sans)' } }, u)));
    const fmtDur = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}시간 ${m}분` : `${m}분`; };
    const readingCard = card([
      panelHead('밀리 독서시간', '오늘 · 이번주 · 이번달'),
      el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 } },
        num('오늘', fmtDur(reading.today), ''),
        num('이번주', fmtDur(reading.week), ''),
        num('이번달', fmtDur(reading.month), '')),
    ], '28px 32px');
    const row1 = el('div', { class: 'stats-row-1', style: { display: 'grid', gridTemplateColumns: '360px minmax(0,1fr)', gap: 24, marginBottom: 28 } },
      streakCard(streak),
      card([
        el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32, paddingBottom: 24, marginBottom: 24, borderBottom: '1px solid var(--line-2)' } },
          num('어구록', curN, '개'), num('책', distinctBooks, '권'), num('작가', distinctAuthors, '명')),
        el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 } },
          comparisonCard({ topLabel: '어구록', current: curN, prev: prevN, unit: '개', period: pLabel }),
          comparisonCard({ topLabel: '책', current: curBooks, prev: prevBooks, unit: '권', period: pLabel })),
      ], '28px 32px'));

    const bookshelf = el('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 26, overflowX: 'auto', paddingBottom: 6 } },
      ...topBooks.map((t) => el('div', { onClick: () => ctx.navigate(`/book/${t.b.id}`), style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer', flexShrink: 0 } },
        el('div', { style: { filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.10))' } }, cover(t.b, { scale: 0.6, lift: false })),
        el('div', { style: { textAlign: 'center' } }, el('div', { class: 'mono', style: { fontSize: 13, fontWeight: 700 } }, String(t.c)), el('div', { style: { fontSize: 11, color: 'var(--ink-3)', marginTop: 3, maxWidth: 96, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, t.b.t)))));
    const row2 = el('div', { class: 'stats-row-2', style: { display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 28, marginBottom: 28 } },
      card([panelHead('캘린더', curM), calendar(calY, calMo, dayData, ctx)]),
      card([panelHead('책', `${distinctBooks}권`, btn({ label: '책 전체', variant: 'ghost', size: 'sm', iconR: 'ar', style: { color: 'var(--ink-3)' }, onClick: () => ctx.navigate('/all/books') })), topBooks.length ? bookshelf : el('div', { style: { color: 'var(--ink-3)', fontSize: 13 } }, '책이 없습니다.')]));

    const authorRow = (a, i) => el('div', { class: 'book-row', onClick: () => ctx.navigate(`/author/${encodeURIComponent(a.name)}`), style: { display: 'grid', gridTemplateColumns: '24px 1fr auto auto', alignItems: 'baseline', gap: 12, padding: '11px 10px', margin: '0 -10px', borderRadius: 8, cursor: 'pointer' } },
      el('span', { class: 'mono', style: { fontSize: 11, color: 'var(--ink-4)' } }, String(i + 1).padStart(2, '0')),
      el('div', {}, el('div', { style: { fontSize: 14, fontWeight: 600 } }, a.name), el('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 3 } }, a.pub)),
      el('span', { class: 'mono', style: { fontSize: 12, color: 'var(--ink-3)' } }, `${a.books}권`),
      el('span', { class: 'mono', style: { fontSize: 13.5, color: 'var(--ink-1)', fontWeight: 700, minWidth: 36, textAlign: 'right' } }, String(a.q)));
    const pubRow = (p, i) => el('div', { class: 'book-row', style: { display: 'grid', gridTemplateColumns: '24px 1fr auto auto auto', alignItems: 'baseline', gap: 10, padding: '11px 10px', margin: '0 -10px', borderRadius: 8 } },
      el('span', { class: 'mono', style: { fontSize: 11, color: 'var(--ink-4)' } }, String(i + 1).padStart(2, '0')),
      el('span', { style: { fontSize: 14, fontWeight: 600 } }, p.name),
      el('span', { class: 'mono', style: { fontSize: 11.5, color: 'var(--ink-3)' } }, `${p.authors}명`),
      el('span', { class: 'mono', style: { fontSize: 11.5, color: 'var(--ink-3)' } }, `${p.books}권`),
      el('span', { class: 'mono', style: { fontSize: 13.5, color: 'var(--ink-1)', fontWeight: 700, minWidth: 36, textAlign: 'right' } }, String(p.q)));
    // 분야 bar — v14 stats-v14.jsx:98-117 (rank/bar/count/diff)
    const catBar = (c) => el('div', { class: 'book-row', style: { display: 'grid', gridTemplateColumns: '54px 1fr 44px 32px', alignItems: 'center', gap: 12, padding: '10px 10px', margin: '0 -10px', borderRadius: 6, cursor: 'pointer' } },
      el('span', { style: { fontSize: 13.5, fontWeight: 600 } }, c.n),
      el('div', { style: { position: 'relative', height: 10, background: 'var(--paper)', borderRadius: 99, overflow: 'hidden' } }, el('div', { style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(c.v / catMax) * 100}%`, background: 'var(--ink-1)', borderRadius: 99 } })),
      el('span', { class: 'mono', style: { fontSize: 13, fontWeight: 700, textAlign: 'right' } }, String(c.v)),
      el('span', { style: { fontSize: 11, color: c.diff > 0 ? '#c2553a' : c.diff < 0 ? 'var(--ink-3)' : 'var(--ink-4)', textAlign: 'right', fontFamily: 'var(--mono)' } }, c.diff > 0 ? `↑${c.diff}` : c.diff < 0 ? `↓${-c.diff}` : '·'));
    const row3 = el('div', { class: 'stats-row-3', style: { display: 'grid', gridTemplateColumns: '1fr 1.1fr 0.95fr', gap: 28, marginBottom: 28 } },
      card([panelHead('작가', `${distinctAuthors}명`, btn({ label: '작가 전체', variant: 'ghost', size: 'sm', iconR: 'ar', style: { color: 'var(--ink-3)' }, onClick: () => ctx.navigate('/all/authors') })), ...(topAuthors.length ? topAuthors.map(authorRow) : [el('div', { style: { color: 'var(--ink-3)', fontSize: 13 } }, '작가가 없습니다.')])]),
      card([panelHead('출판사', `${byPub.size}곳`, btn({ label: '출판사 전체', variant: 'ghost', size: 'sm', iconR: 'ar', style: { color: 'var(--ink-3)' }, onClick: () => ctx.navigate('/all/pubs') })), ...(topPubs.length ? topPubs.map(pubRow) : [el('div', { style: { color: 'var(--ink-3)', fontSize: 13 } }, '출판사가 없습니다.')])]),
      card([panelHead('분야', `${cats.length}개`), ...(cats.length ? cats.map(catBar) : [el('div', { style: { color: 'var(--ink-3)', fontSize: 13 } }, '분야가 없습니다.')])]));

    const wordCloudEl = el('div', { style: { display: 'flex', justifyContent: 'center' } },
      wordCloud({ words: topWords, W: 1180, H: 260, scale: 0.74, onWord: (w) => ctx.navigate(`/word/${encodeURIComponent(w)}`) }));
    const row4 = card([panelHead('단어', `상위 ${topWords.length}`, btn({ label: '단어 전체', variant: 'ghost', size: 'sm', iconR: 'ar', style: { color: 'var(--ink-3)' }, onClick: () => topWords[0] && ctx.navigate(`/word/${encodeURIComponent(topWords[0][0])}`) })), topWords.length ? wordCloudEl : el('div', { style: { color: 'var(--ink-3)', fontSize: 13 } }, '아직 단어가 부족합니다.')], '24px 28px');

    container.append(
      pageTitle({ upper: '통계', title, large: true, right: periodSeg(active, onPeriod) }),
      readingCard,
      row1, row2, row3, row4,
    );
  }

  function onPeriod(p) { if (p !== active) { active = p; renderBody(); } }
  renderBody();
  host.appendChild(screenShell({ tab: 'stats', ctx, children: container }));
}

registerScreen('stats', render);
export default render;
