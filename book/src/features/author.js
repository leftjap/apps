/**
 * 작가 상세 — v14 ScrAuthorV14 (실데이터, lean). 작가의 책 + 어구록 집계.
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { BOOKS, bookOf } from '../data/books.js';
import { el } from '../ui/dom.js';
import { cover } from '../ui/cover.js';
import { screenShell, crumb, btn } from '../ui/components.js';
import { fmtDate, fmtDateTime } from '../ui/format.js';

const owners = (u) => [u?.id, Profile.getPartnerUserIdForEmail(u?.email)].filter(Boolean);

async function render(host, params, ctx) {
  const name = params.name || '';
  const books = BOOKS.filter((b) => b.a === name);
  const bookIds = new Set(books.map((b) => String(b.id)));
  let all = [];
  try { all = await Queries.listAllQuotes(owners(ctx.user)); } catch (e) { console.warn('[author] 로드 실패', e?.message || e); }
  const list = all.filter((q) => bookIds.has(String(q.book_ref))).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const dates = list.map((q) => q.created_at).filter(Boolean).sort();

  const stat = (n, l) => el('div', {}, el('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 } }, l),
    el('div', { style: { fontSize: 24, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-.022em', lineHeight: 1 } }, n));
  const hero = el('section', { style: { marginBottom: 40 } },
    el('span', { class: 'upper' }, '작가'),
    el('h1', { style: { margin: '12px 0 0', fontSize: 64, fontWeight: 800, letterSpacing: '-.038em', lineHeight: 1.05, fontFamily: 'var(--serif)' } }, name),
    el('div', { style: { marginTop: 16, fontSize: 14, color: 'var(--ink-3)', display: 'flex', gap: 10, alignItems: 'baseline' } },
      el('span', { style: { color: 'var(--ink-2)', fontWeight: 500 } }, books[0]?.p || ''), books[0]?.c ? el('span', {}, '·') : null, el('span', {}, books[0]?.c || '')),
    el('div', { style: { marginTop: 26, display: 'flex', gap: 40, alignItems: 'baseline' } },
      stat(String(books.length), '권'), stat(String(list.length), '어구록'),
      stat(dates[0] ? fmtDate(dates[0]) : '—', '첫 만남'), stat(dates.length ? fmtDate(dates[dates.length - 1]) : '—', '최근')),
  );

  const booksSec = el('section', { style: { marginBottom: 44 } },
    el('h3', { style: { margin: '0 0 16px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, `책 · ${books.length}`),
    el('div', { style: { display: 'flex', gap: 28, alignItems: 'flex-end', flexWrap: 'wrap' } },
      ...books.map((b) => el('div', { onClick: () => ctx.navigate(`/book/${b.id}`), style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer' } },
        el('div', { style: { filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.10))' } }, cover(b, { scale: 0.95, lift: false })),
        el('div', { style: { textAlign: 'center' } },
          el('div', { style: { fontSize: 14, fontWeight: 700, letterSpacing: '-.012em' } }, b.t),
          el('div', { class: 'mono', style: { fontSize: 11.5, color: '#c2553a', marginTop: 6, fontWeight: 600 } }, `어구록 ${list.filter((q) => String(q.book_ref) === String(b.id)).length}`))))));

  const quotesSec = el('section', {},
    el('div', { style: { display: 'flex', alignItems: 'baseline', marginBottom: 14 } },
      el('h3', { style: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, '어구록'),
      el('span', { class: 'mono', style: { fontSize: 12, color: 'var(--ink-4)', marginLeft: 10 } }, String(list.length))),
    ...list.map((q) => el('article', { class: 'book-row', onClick: () => ctx.navigate(`/thread/${q.book_ref}/${q.id}`), style: { padding: '16px 12px', margin: '0 -12px', borderRadius: 10, cursor: 'pointer' } },
      el('div', { style: { fontSize: 16.5, lineHeight: 1.65, fontWeight: q.pinned ? 600 : 500 } },
        el('span', { style: { color: 'var(--ink-4)', fontFamily: 'var(--serif)' } }, '“'), q.text, el('span', { style: { color: 'var(--ink-4)', fontFamily: 'var(--serif)' } }, '”')),
      el('div', { class: 'mono', style: { marginTop: 8, fontSize: 12, color: 'var(--ink-4)' } }, fmtDateTime(q.created_at)))),
  );

  const inner = el('div', { style: { maxWidth: 1080, padding: '40px 44px 100px' } }, hero, booksSec, list.length ? quotesSec : el('div', { style: { color: 'var(--ink-3)' } }, '이 작가의 어구록이 없습니다.'));
  const crumbEl = crumb({ ctx, path: [{ label: '피드', back: true, onBack: () => ctx.navigate('/') }, { label: '작가' }, { label: name, last: true }] });
  host.appendChild(screenShell({ tab: 'excerpt', ctx, crumbEl, children: inner }));
}

registerScreen('author', render);
export default render;
