/**
 * 통계 — v14 ScrStatsV14 이식. 시드/Dexie 에서 실집계 (거짓 수치 없음).
 *  - 3 숫자(어구록/책/작가) + StreakCard + 월 비교
 *  - 캘린더(일별 어구록, 책 표지) + 책장(top books)
 *  - 작가/출판사/분야 랭킹
 *  - 단어(본문 토큰 빈도 — 크기별 태그)
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { BOOKS, bookOf } from '../data/books.js';
import { el } from '../ui/dom.js';
import { cover } from '../ui/cover.js';
import { screenShell, pageTitle, streakCard, comparisonCard, btn } from '../ui/components.js';

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

// streak (feed.js 와 동일 로직)
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

function tokenize(text) {
  return (text || '').replace(/[^가-힣a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 2);
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
  const user = ctx.user;
  const owners = ownerIdsOf(user);
  let quotes = [];
  try { quotes = await Queries.listAllQuotes(owners); } catch (e) { console.warn('[stats] 로드 실패', e?.message || e); }

  const stats = computeStats(quotes);
  // book/author/pub/category 집계
  const byBook = new Map(); for (const q of quotes) byBook.set(String(q.book_ref), (byBook.get(String(q.book_ref)) || 0) + 1);
  const usedBooks = [...byBook.keys()].map(bookOf).filter(Boolean);
  const distinctBooks = usedBooks.length;
  const distinctAuthors = new Set(usedBooks.map((b) => b.a)).size;
  const topBooks = [...byBook.entries()].map(([ref, c]) => ({ b: bookOf(ref), c })).filter((x) => x.b).sort((a, b) => b.c - a.c).slice(0, 5);
  const byAuthor = new Map(); const byPub = new Map(); const byCat = new Map();
  for (const [ref, c] of byBook) { const b = bookOf(ref); if (!b) continue; byAuthor.set(b.a, (byAuthor.get(b.a) || 0) + c); byPub.set(b.p, (byPub.get(b.p) || 0) + c); byCat.set(topCat(b), (byCat.get(topCat(b)) || 0) + c); }
  const topAuthors = [...byAuthor.entries()].map(([name, q]) => ({ name, q, books: BOOKS.filter((b) => b.a === name && byBook.has(String(b.id))).length, pub: BOOKS.find((b) => b.a === name)?.p })).sort((a, b) => b.q - a.q).slice(0, 6);
  const topPubs = [...byPub.entries()].map(([name, q]) => ({ name, q, books: BOOKS.filter((b) => b.p === name && byBook.has(String(b.id))).length, authors: new Set(BOOKS.filter((b) => b.p === name && byBook.has(String(b.id))).map((b) => b.a)).size })).sort((a, b) => b.q - a.q).slice(0, 6);
  const cats = [...byCat.entries()].map(([n, v]) => ({ n, v })).sort((a, b) => b.v - a.v);
  const catMax = Math.max(1, ...cats.map((c) => c.v));
  // 월 비교
  const months = [...new Set(quotes.map((q) => monthKey(q.created_at)).filter(Boolean))].sort().reverse();
  const curM = months[0]; const prevM = months[1];
  const curN = quotes.filter((q) => monthKey(q.created_at) === curM).length;
  const prevN = prevM ? quotes.filter((q) => monthKey(q.created_at) === prevM).length : 0;
  const curBooks = new Set(quotes.filter((q) => monthKey(q.created_at) === curM).map((q) => q.book_ref)).size;
  const prevBooks = prevM ? new Set(quotes.filter((q) => monthKey(q.created_at) === prevM).map((q) => q.book_ref)).size : 0;
  // 캘린더 (최신 어구록의 달)
  const calMonth = curM ? curM : '2026-05';
  const [cy, cm] = calMonth.split('-').map(Number);
  const dayData = {};
  for (const q of quotes) {
    if (monthKey(q.created_at) !== calMonth) continue;
    const k = dayKey(q.created_at); const b = bookOf(q.book_ref); if (!b) continue;
    if (!dayData[k]) dayData[k] = { books: [], count: 0 };
    dayData[k].count++; if (!dayData[k].books.some((x) => x.id === b.id)) dayData[k].books.push(b);
  }
  // 단어 빈도
  const wordFreq = new Map(); for (const q of quotes) for (const w of tokenize(q.text)) wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
  const topWords = [...wordFreq.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 40);
  const wordMax = Math.max(1, ...topWords.map((w) => w[1]));

  // ── render
  const num = (l, n, u) => el('div', {}, el('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 12, fontWeight: 500 } }, l),
    el('div', { class: 'mono', style: { fontSize: 44, fontWeight: 700, letterSpacing: '-.032em', lineHeight: 1 } }, String(n), el('span', { style: { fontSize: 14, color: 'var(--ink-3)', fontWeight: 500, marginLeft: 6, fontFamily: 'var(--sans)' } }, u)));
  const row1 = el('div', { class: 'stats-row-1', style: { display: 'grid', gridTemplateColumns: '360px minmax(0,1fr)', gap: 24, marginBottom: 28 } },
    streakCard(stats),
    card([
      el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32, paddingBottom: 24, marginBottom: 24, borderBottom: '1px solid var(--line-2)' } },
        num('어구록', stats.total, '개'), num('책', distinctBooks, '권'), num('작가', distinctAuthors, '명')),
      el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 } },
        comparisonCard({ topLabel: '어구록', current: curN, prev: prevN, unit: '개' }),
        comparisonCard({ topLabel: '책', current: curBooks, prev: prevBooks, unit: '권' })),
    ], '28px 32px'));

  const bookshelf = el('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 26, overflowX: 'auto', paddingBottom: 6 } },
    ...topBooks.map((t) => el('div', { onClick: () => ctx.navigate(`/book/${t.b.id}`), style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer', flexShrink: 0 } },
      el('div', { style: { filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.10))' } }, cover(t.b, { scale: 0.6, lift: false })),
      el('div', { style: { textAlign: 'center' } }, el('div', { class: 'mono', style: { fontSize: 13, fontWeight: 700 } }, String(t.c)), el('div', { style: { fontSize: 11, color: 'var(--ink-3)', marginTop: 3, maxWidth: 96, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, t.b.t)))));
  const row2 = el('div', { class: 'stats-row-2', style: { display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 28, marginBottom: 28 } },
    card([panelHead('캘린더', calMonth), calendar(cy, cm, dayData, ctx)]),
    card([panelHead('책', `${distinctBooks}권`, btn({ label: '책 전체', variant: 'ghost', size: 'sm', iconR: 'ar', style: { color: 'var(--ink-3)' }, onClick: () => ctx.navigate('/all/books') })), bookshelf]));

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
  const catBar = (c) => el('div', { style: { display: 'grid', gridTemplateColumns: '54px 1fr 44px', alignItems: 'center', gap: 12, padding: '10px 10px', margin: '0 -10px', borderRadius: 6 } },
    el('span', { style: { fontSize: 13.5, fontWeight: 600 } }, c.n),
    el('div', { style: { position: 'relative', height: 10, background: 'var(--paper)', borderRadius: 99, overflow: 'hidden' } }, el('div', { style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(c.v / catMax) * 100}%`, background: 'var(--ink-1)', borderRadius: 99 } })),
    el('span', { class: 'mono', style: { fontSize: 13, fontWeight: 700, textAlign: 'right' } }, String(c.v)));
  const row3 = el('div', { class: 'stats-row-3', style: { display: 'grid', gridTemplateColumns: '1fr 1.1fr 0.95fr', gap: 28, marginBottom: 28 } },
    card([panelHead('작가', `${distinctAuthors}명`, btn({ label: '작가 전체', variant: 'ghost', size: 'sm', iconR: 'ar', style: { color: 'var(--ink-3)' }, onClick: () => ctx.navigate('/all/authors') })), ...topAuthors.map(authorRow)]),
    card([panelHead('출판사', `${byPub.size}곳`, btn({ label: '출판사 전체', variant: 'ghost', size: 'sm', iconR: 'ar', style: { color: 'var(--ink-3)' }, onClick: () => ctx.navigate('/all/pubs') })), ...topPubs.map(pubRow)]),
    card([panelHead('분야', `${cats.length}개`), ...cats.map(catBar)]));

  const wordTags = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', padding: '8px 0' } },
    ...topWords.map(([w, c]) => el('span', { onClick: () => ctx.navigate(`/word/${encodeURIComponent(w)}`), class: 'book-row', style: { cursor: 'pointer', borderRadius: 8, padding: '2px 8px', fontWeight: c >= wordMax * 0.6 ? 700 : 500, fontSize: 14 + Math.round((c / wordMax) * 22), color: c >= wordMax * 0.6 ? '#c2553a' : 'var(--ink-1)', lineHeight: 1.1 } }, w)));
  const row4 = card([panelHead('단어', `상위 ${topWords.length}`, btn({ label: '단어 전체', variant: 'ghost', size: 'sm', iconR: 'ar', style: { color: 'var(--ink-3)' }, onClick: () => topWords[0] && ctx.navigate(`/word/${encodeURIComponent(topWords[0][0])}`) })), topWords.length ? wordTags : el('div', { style: { color: 'var(--ink-3)', fontSize: 13 } }, '아직 단어가 부족합니다.')], '24px 28px');

  const inner = el('div', { style: { padding: '36px 36px 100px' } },
    pageTitle({ upper: '통계', title: `${cy}년 ${cm}월`, large: true }), row1, row2, row3, row4);
  host.appendChild(screenShell({ tab: 'stats', ctx, children: inner }));
}

registerScreen('stats', render);
export default render;
