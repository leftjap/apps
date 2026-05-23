/**
 * 검색 — 어구록 본문 + 책(제목·저자). 'search' 라우트.
 * v14 는 검색을 topbar indicator 로만 뒀으나(core-v14), 사용자 요청으로 실제 검색 기능으로 확장.
 *  - autofocus 입력 + 디바운스(200ms) 라이브 결과 (로컬 allQuotes + BOOKS 클라 필터)
 *  - 책 group(→/book) + 어구록 group(→/thread). 빈 입력/무결과 안내.
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { BOOKS, bookOf } from '../data/books.js';
import { el } from '../ui/dom.js';
import { screenShell, crumb, bookRow } from '../ui/components.js';
import { quoteText } from '../ui/quote-text.js';
import { fmtDateTime } from '../ui/format.js';

function ownerIdsOf(user) {
  return [user?.id, Profile.getPartnerUserIdForEmail(user?.email)].filter(Boolean);
}
const hint = (txt) => el('div', { style: { padding: '24px 2px', color: 'var(--ink-3)', fontSize: 14 } }, txt);

async function render(host, params, ctx) {
  const owners = ownerIdsOf(ctx.user);
  let allQuotes = [];
  try { allQuotes = await Queries.listAllQuotes(owners); } catch (e) { console.warn('[search] 로드 실패', e?.message || e); }
  const countMap = new Map();
  for (const q of allQuotes) { const k = String(q.book_ref); countMap.set(k, (countMap.get(k) || 0) + 1); }

  const results = el('div', {});
  const input = el('input', {
    placeholder: '책 · 작가 · 어구록 검색',
    style: { width: '100%', height: 48, padding: '0 18px', fontSize: 16, border: '1px solid var(--line)', borderRadius: 12, outline: 'none', fontFamily: 'var(--sans)', boxSizing: 'border-box' },
  });

  const run = (raw) => {
    const q = (raw || '').trim().toLowerCase();
    results.replaceChildren();
    if (!q) { results.appendChild(hint('책 제목·저자나 어구록 내용을 검색하세요.')); return; }
    const books = BOOKS.filter((b) => (b.t || '').toLowerCase().includes(q) || (b.a || '').toLowerCase().includes(q));
    const quotes = allQuotes.filter((r) => (r.text || '').toLowerCase().includes(q));
    if (!books.length && !quotes.length) { results.appendChild(hint(`'${raw.trim()}' 검색 결과가 없습니다.`)); return; }
    if (books.length) {
      results.appendChild(el('div', { class: 'upper', style: { margin: '18px 0 6px' } }, `책 ${books.length}`));
      for (const b of books) results.appendChild(bookRow({ b, count: countMap.get(String(b.id)) || 0, onClick: () => ctx.navigate(`/book/${b.id}`) }));
    }
    if (quotes.length) {
      results.appendChild(el('div', { class: 'upper', style: { margin: '24px 0 6px' } }, `어구록 ${quotes.length}`));
      for (const qq of quotes) {
        const b = bookOf(qq.book_ref);
        results.appendChild(el('div', {
          class: 'book-row', onClick: () => ctx.navigate(`/thread/${qq.book_ref}/${qq.id}`),
          style: { padding: '14px 12px', margin: '0 -12px', borderRadius: 10, cursor: 'pointer' },
        },
          quoteText({ text: qq.text, fontSize: 16, lineHeight: 1.65, variant: 'inline', serif: true }),
          el('div', { class: 'mono', style: { fontSize: 11.5, color: 'var(--ink-4)', marginTop: 8 } }, `${b ? b.t + ' · ' : ''}${fmtDateTime(qq.created_at)}`),
        ));
      }
    }
  };

  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => run(input.value), 200); });
  run('');

  const inner = el('div', { style: { maxWidth: 780, padding: '40px 44px 100px' } }, input, results);
  const crumbEl = crumb({ ctx, path: [{ label: '피드', back: true, onBack: () => ctx.navigate('/') }, { label: '검색', last: true }] });
  host.appendChild(screenShell({ tab: 'excerpt', ctx, crumbEl, children: inner }));
  setTimeout(() => input.focus(), 40);
}

registerScreen('search', render);
export default render;
