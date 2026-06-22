/**
 * 작가 상세 — v14 ScrAuthorV14 (details-v14.jsx:478-599) 이식, 실데이터.
 *  - hero(4스탯) + 이 작가를 옮긴 흐름(월 막대) + 책 + 이 작가의 단어(WordCloud) + 어구록
 *  - 최근순 버튼은 v14 그대로 inert.
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { BOOKS, bookOf } from '../data/books.js';
import { el } from '../ui/dom.js';
import { cover } from '../ui/cover.js';
import { screenShell, crumb, btn } from '../ui/components.js';
import { barChart, wordCloud } from '../ui/charts.js';
import { tokenize } from '../ui/text.js';
import { fmtDate, fmtDateTime } from '../ui/format.js';
import { renderQuoteBody } from '../ui/quote-md.js';

const owners = (u) => [u?.id].filter(Boolean);
const monthKey = (iso) => (iso || '').slice(0, 7);

async function render(host, params, ctx) {
  const name = params.name || '';
  const books = BOOKS.filter((b) => b.a === name);
  const bookIds = new Set(books.map((b) => String(b.id)));
  let all = [];
  try { all = await Queries.listAllQuotes(owners(ctx.user)); } catch (e) { console.warn('[author] 로드 실패', e?.message || e); }
  const list = all.filter((q) => bookIds.has(String(q.book_ref))).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const dates = list.map((q) => q.created_at).filter(Boolean).sort();

  // 이 작가를 옮긴 흐름 — 최근 12개월 (최신 데이터 달 기준)
  const latestMonth = all.map((q) => monthKey(q.created_at)).filter(Boolean).sort().reverse()[0] || monthKey(new Date().toISOString());
  const [ly, lm] = latestMonth.split('-').map(Number);
  const months = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(Date.UTC(ly, (lm - 1) - i, 1)); months.push({ key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, label: `${d.getUTCMonth() + 1}월` }); }
  const monthly = months.map((m) => list.filter((q) => monthKey(q.created_at) === m.key).length);

  // 이 작가의 단어 (불용어 제외)
  const wf = new Map(); for (const q of list) for (const w of tokenize(q.text)) wf.set(w, (wf.get(w) || 0) + 1);
  const authorWords = [...wf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

  const stat = (n, l) => el('div', {}, el('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 } }, l),
    el('div', { style: { fontSize: 24, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-.022em', lineHeight: 1 } }, n));
  const hero = el('section', { style: { marginBottom: 40 } },
    el('span', { class: 'upper' }, '작가'),
    el('h1', { style: { margin: '12px 0 0', fontSize: 64, fontWeight: 800, letterSpacing: '-.038em', lineHeight: 1.05, fontFamily: 'var(--serif)' } }, name),
    el('div', { style: { marginTop: 16, fontSize: 14, color: 'var(--ink-3)', display: 'flex', gap: 10, alignItems: 'baseline' } },
      el('span', { style: { color: 'var(--ink-2)', fontWeight: 500 } }, books[0]?.p || ''), books[0]?.c ? el('span', {}, '·') : null, el('span', {}, books[0]?.c || '')),
    el('div', { style: { marginTop: 26, display: 'flex', gap: 40, alignItems: 'baseline' } },
      stat(String(books.length), '권'), stat(String(list.length), '어구록'),
      stat(dates[0] ? fmtDate(dates[0]) : '—', '첫 만남'), stat(dates.length ? fmtDate(dates[dates.length - 1]) : '—', '가장 최근')),
  );

  const trendSec = el('section', { style: { marginBottom: 44 } },
    el('h3', { style: { margin: '0 0 14px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, '이 작가를 옮긴 흐름'),
    barChart({ data: monthly, labels: months.map((m) => m.label), height: 60, highlightIndex: 11 }));

  const booksSec = el('section', { style: { marginBottom: 44 } },
    el('h3', { style: { margin: '0 0 16px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, `책 · ${books.length}`),
    el('div', { style: { display: 'flex', gap: 28, alignItems: 'flex-end', flexWrap: 'wrap' } },
      ...books.map((b) => el('div', { onClick: () => ctx.navigate(`/book/${b.id}`), style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer' } },
        el('div', { style: { filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.10))' } }, cover(b, { scale: 0.95, lift: false })),
        el('div', { style: { textAlign: 'center' } },
          el('div', { style: { fontSize: 14, fontWeight: 700, letterSpacing: '-.012em' } }, b.t),
          el('div', { class: 'mono', style: { fontSize: 11.5, color: '#c2553a', marginTop: 6, fontWeight: 600 } }, `어구록 ${list.filter((q) => String(q.book_ref) === String(b.id)).length}`))))));

  const wordsSec = authorWords.length ? el('section', { style: { marginBottom: 44 } },
    el('div', { style: { display: 'flex', alignItems: 'baseline', marginBottom: 14 } },
      el('h3', { style: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, '이 작가의 단어'),
      el('span', { class: 'mono', style: { fontSize: 12, color: 'var(--ink-4)', marginLeft: 10 } }, `상위 ${authorWords.length}`)),
    el('div', { style: { padding: '24px 28px', background: '#fafaf7', borderRadius: 14 } },
      wordCloud({ words: authorWords, W: 960, H: 200, scale: 0.68, onWord: (w) => ctx.navigate(`/word/${encodeURIComponent(w)}`) }))) : null;

  const quotesSec = el('section', {},
    el('div', { style: { display: 'flex', alignItems: 'baseline', marginBottom: 14 } },
      el('h3', { style: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, '어구록'),
      el('span', { class: 'mono', style: { fontSize: 12, color: 'var(--ink-4)', marginLeft: 10 } }, String(list.length)),
      el('div', { style: { flex: 1 } }),
      btn({ label: '최근순', variant: 'ghost', size: 'sm', iconR: 'chevD' })),
    ...list.map((q) => el('article', { class: 'book-row', onClick: () => ctx.navigate(`/thread/${q.book_ref}/${q.id}`), style: { padding: '16px 12px', margin: '0 -12px', borderRadius: 10, cursor: 'pointer' } },
      el('div', { class: 'q-body', style: { fontSize: 16.5, lineHeight: 1.65, fontWeight: q.pinned ? 600 : 500 } },
        ...renderQuoteBody(q.text)),
      el('div', { class: 'mono', style: { marginTop: 8, fontSize: 12, color: 'var(--ink-4)' } }, fmtDateTime(q.created_at)))),
  );

  const inner = el('div', { class: 'page', style: { maxWidth: 1080, padding: '40px 44px 100px' } }, hero,
    list.length ? trendSec : null, booksSec, wordsSec,
    list.length ? quotesSec : el('div', { style: { color: 'var(--ink-3)' } }, '이 작가의 어구록이 없습니다.'));
  const crumbEl = crumb({ ctx, path: [{ label: '피드', back: true, onBack: () => ctx.navigate('/') }, { label: '작가' }, { label: name, last: true }] });
  host.appendChild(screenShell({ tab: 'excerpt', ctx, crumbEl, children: inner }));
}

registerScreen('author', render);
export default render;
