/**
 * 검색 — TopBar 검색바 진입점(#/search). 어구록 본문 + 책(제목/작가/분야) 매칭.
 * searchQuotes(queries.js, 단위테스트됨) 재사용. 입력 즉시 결과.
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { BOOKS, bookOf } from '../data/books.js';
import { el, clear } from '../ui/dom.js';
import { iconEl } from '../ui/icons.js';
import { cover } from '../ui/cover.js';
import { screenShell, crumb, bookRow } from '../ui/components.js';
import { fmtDateTime } from '../ui/format.js';

const owners = (u) => [u?.id, Profile.getPartnerUserIdForEmail(u?.email)].filter(Boolean);

async function render(host, params, ctx) {
  const o = owners(ctx.user);
  const results = el('div', { style: { marginTop: 24 } });
  const input = el('input', {
    placeholder: '책 · 작가 · 분야 · 단어 · 어구록',
    style: { width: '100%', height: 48, padding: '0 18px', fontSize: 16, border: '1.5px solid var(--ink-1)', borderRadius: 12, outline: 'none', fontFamily: 'var(--sans)', boxSizing: 'border-box' },
  });

  async function run(q) {
    clear(results);
    const query = (q || '').trim();
    if (!query) { results.appendChild(el('div', { style: { color: 'var(--ink-3)', padding: '40px 0', fontSize: 14 } }, '책·작가·단어·어구록을 검색하세요.')); return; }
    const lower = query.toLowerCase();
    const quotes = await Queries.searchQuotes(query, o);
    const books = BOOKS.filter((b) => (b.t + b.a + b.c + b.p).toLowerCase().includes(lower));

    if (!quotes.length && !books.length) {
      results.appendChild(el('div', { style: { color: 'var(--ink-3)', padding: '40px 0', fontSize: 14 } }, `"${query}" 검색 결과가 없습니다.`));
      return;
    }
    if (books.length) {
      results.appendChild(el('h3', { style: { margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--ink-3)' } }, `책 ${books.length}`));
      for (const b of books) results.appendChild(bookRow({ b, onClick: () => ctx.navigate(`/book/${b.id}`) }));
    }
    if (quotes.length) {
      results.appendChild(el('h3', { style: { margin: books.length ? '28px 0 12px' : '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--ink-3)' } }, `어구록 ${quotes.length}`));
      for (const qq of quotes) {
        const b = bookOf(qq.book_ref);
        results.appendChild(el('div', { class: 'book-row', onClick: () => ctx.navigate(`/thread/${qq.book_ref}/${qq.id}`), style: { padding: '14px 12px', margin: '0 -12px', borderRadius: 10, display: 'flex', gap: 16, alignItems: 'flex-start', cursor: 'pointer' } },
          b ? cover(b, { scale: 0.22 }) : null,
          el('div', { style: { flex: 1, minWidth: 0 } },
            el('div', { style: { fontSize: 15.5, lineHeight: 1.6, fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } },
              el('span', { style: { color: 'var(--ink-4)', fontFamily: 'var(--serif)' } }, '“'), qq.text, el('span', { style: { color: 'var(--ink-4)', fontFamily: 'var(--serif)' } }, '”')),
            el('div', { class: 'mono', style: { marginTop: 6, fontSize: 11.5, color: 'var(--ink-4)' } }, `${b ? b.t + ' · ' : ''}${fmtDateTime(qq.created_at)}`)),
        ));
      }
    }
  }

  input.addEventListener('input', () => run(input.value));

  const inner = el('div', { style: { maxWidth: 780, padding: '36px 44px 100px' } },
    el('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 } }, iconEl('search', { sz: 22, st: 1.8 }), el('h1', { style: { margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: '-.028em' } }, '검색')),
    input, results);
  const crumbEl = crumb({ ctx, path: [{ label: '피드', back: true, onBack: () => ctx.navigate('/') }, { label: '검색', last: true }] });
  host.appendChild(screenShell({ tab: 'excerpt', ctx, crumbEl, children: inner }));
  setTimeout(() => input.focus(), 30);
  run('');
}

registerScreen('search', render);
export default render;
