/**
 * 모두 보기 — v14 ScrAllBooks/Authors/Pubs/Pins 이식. 'all' 라우트, params.kind 로 분기.
 *  - books : 표지 그리드 (어구록 수)
 *  - authors / pubs : 랭킹 테이블 (BOOKS 메타 + 어구록 집계)
 *  - pins : 핀 어구록 (책별 그룹)
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { BOOKS, bookOf, groupQuotes } from '../data/books.js';
import { el } from '../ui/dom.js';
import { iconEl } from '../ui/icons.js';
import { cover } from '../ui/cover.js';
import { screenShell, crumb, pageTitle, bookRow } from '../ui/components.js';
import { quoteText } from '../ui/quote-text.js';
import { fmtDateTime } from '../ui/format.js';

function ownerIdsOf(user) {
  return [user?.id, Profile.getPartnerUserIdForEmail(user?.email)].filter(Boolean);
}

function countByBookRef(quotes) {
  const m = new Map();
  for (const q of quotes) { const k = String(q.book_ref); m.set(k, (m.get(k) || 0) + 1); }
  return m;
}

// ─── books grid ──────────────────────────────────────────────────────────────
function viewBooks(ctx, countMap) {
  const items = BOOKS.map((b) => ({ b, c: countMap.get(String(b.id)) || 0 })).sort((a, b) => b.c - a.c);
  const grid = el('div', { class: 'allbooks-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '36px 28px' } });
  for (const it of items) {
    grid.appendChild(el('div', {
      class: 'book-row', onClick: () => ctx.navigate(`/book/${it.b.id}`),
      style: { padding: '10px 10px', borderRadius: 10, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 },
    },
      el('div', { style: { filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.10))' } }, cover(it.b, { scale: 0.72, lift: false })),
      el('div', { style: { textAlign: 'center', width: '100%' } },
        el('div', { style: { fontSize: 13.5, fontWeight: 700, letterSpacing: '-.012em', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, it.b.t),
        el('div', { style: { fontSize: 11.5, color: 'var(--ink-3)', marginTop: 5 } }, it.b.a),
        el('div', { class: 'mono', style: { fontSize: 11.5, marginTop: 8, color: it.c > 0 ? '#c2553a' : 'var(--ink-4)', fontWeight: 600 } }, it.c > 0 ? `${it.c} 어구록` : '없음'),
      ),
    ));
  }
  return { tab: 'stats', back: '/stats', backLabel: '통계', crumbLast: '책',
    inner: el('div', { class: 'page', style: { padding: '40px 44px 100px' } }, pageTitle({ upper: '책', title: `${BOOKS.length}권`, large: true }), grid) };
}

// ─── authors table ───────────────────────────────────────────────────────────
function viewAuthors(ctx, countMap) {
  const seen = new Set();
  const authors = BOOKS.filter((b) => !seen.has(b.a) && (seen.add(b.a), true)).map((b) => {
    const books = BOOKS.filter((x) => x.a === b.a);
    const quotes = books.reduce((s, bk) => s + (countMap.get(String(bk.id)) || 0), 0);
    return { name: b.a, books: books.length, quotes, mainPub: b.p, repBook: books[0]?.t };
  }).sort((a, b) => b.quotes - a.quotes);
  const cols = '32px minmax(0, 1.6fr) 1fr 100px 100px';
  const headerRow = el('div', { style: { display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '0 14px 10px', fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', letterSpacing: '.04em' } },
    el('span', {}), el('span', {}, '이름'), el('span', {}, '대표 출판사'), el('span', { style: { textAlign: 'right' } }, '책'), el('span', { style: { textAlign: 'right' } }, '어구록'));
  const rows = authors.map((a, i) => el('div', {
    class: 'book-row', onClick: () => ctx.navigate(`/author/${encodeURIComponent(a.name)}`),
    style: { display: 'grid', gridTemplateColumns: cols, gap: 14, alignItems: 'baseline', padding: '14px 14px', cursor: 'pointer', opacity: a.quotes === 0 ? 0.55 : 1 },
  },
    el('span', { class: 'mono', style: { fontSize: 11.5, color: 'var(--ink-4)', letterSpacing: '.04em' } }, String(i + 1).padStart(2, '0')),
    el('div', {}, el('div', { style: { fontSize: 15, fontWeight: 700, letterSpacing: '-.018em' } }, a.name), el('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 4 } }, a.repBook)),
    el('span', { style: { fontSize: 13.5, color: 'var(--ink-2)' } }, a.mainPub),
    el('span', { class: 'mono', style: { fontSize: 13.5, color: 'var(--ink-2)', textAlign: 'right' } }, `${a.books}권`),
    el('span', { class: 'mono', style: { fontSize: 14, color: a.quotes > 0 ? 'var(--ink-1)' : 'var(--ink-4)', fontWeight: 700, textAlign: 'right' } }, a.quotes || '—'),
  ));
  return { tab: 'stats', back: '/stats', backLabel: '통계', crumbLast: '작가',
    inner: el('div', { class: 'page', style: { padding: '40px 44px 100px', maxWidth: 1080 } }, pageTitle({ upper: '작가', title: `${authors.length}명`, large: true }), headerRow, ...rows) };
}

// ─── pubs table ──────────────────────────────────────────────────────────────
function viewPubs(ctx, countMap) {
  const seen = new Set();
  const pubs = BOOKS.filter((b) => !seen.has(b.p) && (seen.add(b.p), true)).map((b) => {
    const books = BOOKS.filter((x) => x.p === b.p);
    const authors = new Set(books.map((x) => x.a)).size;
    const quotes = books.reduce((s, bk) => s + (countMap.get(String(bk.id)) || 0), 0);
    return { name: b.p, books: books.length, authors, quotes };
  }).sort((a, b) => b.quotes - a.quotes);
  const cols = '32px minmax(0, 1.4fr) 80px 80px 100px';
  const headerRow = el('div', { style: { display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '0 14px 10px', fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', letterSpacing: '.04em' } },
    el('span', {}), el('span', {}, '이름'), el('span', { style: { textAlign: 'right' } }, '작가'), el('span', { style: { textAlign: 'right' } }, '책'), el('span', { style: { textAlign: 'right' } }, '어구록'));
  const rows = pubs.map((p, i) => el('div', {
    class: 'book-row', style: { display: 'grid', gridTemplateColumns: cols, gap: 14, alignItems: 'baseline', padding: '14px 14px', opacity: p.quotes === 0 ? 0.55 : 1 },
  },
    el('span', { class: 'mono', style: { fontSize: 11.5, color: 'var(--ink-4)', letterSpacing: '.04em' } }, String(i + 1).padStart(2, '0')),
    el('span', { style: { fontSize: 15, fontWeight: 700, letterSpacing: '-.018em' } }, p.name),
    el('span', { class: 'mono', style: { fontSize: 13.5, color: 'var(--ink-2)', textAlign: 'right' } }, `${p.authors}명`),
    el('span', { class: 'mono', style: { fontSize: 13.5, color: 'var(--ink-2)', textAlign: 'right' } }, `${p.books}권`),
    el('span', { class: 'mono', style: { fontSize: 14, color: p.quotes > 0 ? 'var(--ink-1)' : 'var(--ink-4)', fontWeight: 700, textAlign: 'right' } }, p.quotes || '—'),
  ));
  return { tab: 'stats', back: '/stats', backLabel: '통계', crumbLast: '출판사',
    inner: el('div', { class: 'page', style: { padding: '40px 44px 100px', maxWidth: 1000 } }, pageTitle({ upper: '출판사', title: `${pubs.length}곳`, large: true }), headerRow, ...rows) };
}

// ─── pins ────────────────────────────────────────────────────────────────────
function viewPins(ctx, pinned, meId) {
  const views = pinned.map((q) => ({ ...q, who: q.owner_id === meId ? 'me' : 'y', book_ref: String(q.book_ref) }));
  const groups = groupQuotes(views);
  const header = el('div', { style: { display: 'flex', alignItems: 'baseline', marginBottom: 36 } },
    iconEl('pin', { sz: 22, st: 1.8, style: 'color:#c2553a' }),
    el('h1', { style: { margin: '0 0 0 12px', fontSize: 32, fontWeight: 700, letterSpacing: '-.028em' } }, '핀'),
    el('span', { class: 'mono', style: { fontSize: 14, color: 'var(--ink-3)', marginLeft: 12 } }, String(pinned.length)));
  const sections = groups.map((g) => {
    const b = bookOf(g.book_ref);
    if (!b) return null;
    const sec = el('section', { style: { margin: '0 0 36px' } }, bookRow({ b, count: g.q.length, soyeon: g.who === 'y', onClick: () => ctx.navigate(`/book/${g.book_ref}`) }));
    for (const q of g.q) {
      sec.appendChild(el('div', {
        class: 'book-row', onClick: () => ctx.navigate(`/thread/${g.book_ref}/${q.id}`),
        style: { padding: '16px 12px', margin: '12px -12px 0 74px', borderRadius: 10, cursor: 'pointer' },
      },
        quoteText({ text: q.text, fontSize: 18, lineHeight: 1.7, variant: 'inline', serif: true }),
        el('div', { class: 'mono', style: { fontSize: 11.5, color: 'var(--ink-4)', marginTop: 10 } }, fmtDateTime(q.created_at)),
      ));
    }
    return sec;
  }).filter(Boolean);
  return { tab: 'excerpt', back: '/', backLabel: '피드', crumbLast: '핀',
    inner: el('div', { class: 'page', style: { maxWidth: 780, padding: '40px 44px 100px' } }, header, ...sections,
      pinned.length === 0 ? el('div', { style: { color: 'var(--ink-3)' } }, '핀한 어구록이 없습니다.') : null) };
}

async function render(host, params, ctx) {
  const user = ctx.user;
  const owners = ownerIdsOf(user);
  const kind = params.kind || 'books';
  let allQuotes = [];
  let pinned = [];
  try {
    allQuotes = await Queries.listAllQuotes(owners);
    if (kind === 'pins') pinned = await Queries.listPinned(owners);
  } catch (e) { console.warn('[lists] 로드 실패', e?.message || e); }
  const countMap = countByBookRef(allQuotes);

  let v;
  if (kind === 'authors') v = viewAuthors(ctx, countMap);
  else if (kind === 'pubs') v = viewPubs(ctx, countMap);
  else if (kind === 'pins') v = viewPins(ctx, pinned, user?.id);
  else v = viewBooks(ctx, countMap);

  const crumbEl = crumb({ ctx, path: [{ label: v.backLabel, back: true, onBack: () => ctx.navigate(v.back) }, { label: v.crumbLast, last: true }] });
  host.appendChild(screenShell({ tab: v.tab, ctx, crumbEl, children: v.inner }));
}

registerScreen('all', render);
export default render;
