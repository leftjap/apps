/**
 * 단어 상세 — v14 ScrWordV14 (실데이터, lean). 단어가 등장한 어구록 + 책 집계 + 하이라이트.
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { bookOf } from '../data/books.js';
import { el } from '../ui/dom.js';
import { cover } from '../ui/cover.js';
import { screenShell, crumb } from '../ui/components.js';
import { fmtDateTime } from '../ui/format.js';

const owners = (u) => [u?.id, Profile.getPartnerUserIdForEmail(u?.email)].filter(Boolean);

function highlight(text, word) {
  if (!word) return [text];
  const out = [];
  const parts = String(text).split(word);
  parts.forEach((p, i) => {
    if (p) out.push(p);
    if (i < parts.length - 1) out.push(el('mark', { style: { background: 'rgba(194,85,58,0.18)', color: 'var(--ink-1)', padding: '0 3px', borderRadius: 3, fontWeight: 700 } }, word));
  });
  return out;
}

async function render(host, params, ctx) {
  const word = params.w || '';
  let all = [];
  try { all = await Queries.listAllQuotes(owners(ctx.user)); } catch (e) { console.warn('[word] 로드 실패', e?.message || e); }
  const matches = all.filter((q) => (q.text || '').includes(word)).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const occurrences = matches.reduce((s, q) => s + (q.text.split(word).length - 1), 0);
  const bookRefs = [...new Set(matches.map((q) => String(q.book_ref)))];
  const booksRanked = bookRefs.map((ref) => ({ b: bookOf(ref), c: matches.filter((q) => String(q.book_ref) === ref).reduce((s, q) => s + (q.text.split(word).length - 1), 0) })).filter((x) => x.b).sort((a, b) => b.c - a.c);

  const stat = (l, n, u) => el('div', {}, el('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 } }, l),
    el('div', { class: 'mono', style: { fontSize: 30, fontWeight: 700, letterSpacing: '-.028em', lineHeight: 1 } }, String(n), el('span', { style: { fontSize: 12, color: 'var(--ink-3)', fontWeight: 500, fontFamily: 'var(--sans)', marginLeft: 4 } }, u)));
  const hero = el('section', { class: 'word-hero', style: { display: 'flex', gap: 64, alignItems: 'flex-start', marginBottom: 40 } },
    el('h1', { style: { margin: 0, fontSize: 140, fontWeight: 800, letterSpacing: '-.045em', lineHeight: 0.92, fontFamily: 'var(--serif)' } }, word),
    el('div', { style: { paddingTop: 20, flex: 1 } },
      el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 } },
        stat('등장', occurrences, '회'), stat('어구록', matches.length, '개'), stat('책', booksRanked.length, '권'))));

  const booksSec = el('section', { style: { marginBottom: 44 } },
    el('h3', { style: { margin: '0 0 16px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, `등장하는 책 · ${booksRanked.length}`),
    el('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 28, paddingBottom: 6, overflowX: 'auto' } },
      ...booksRanked.map((t) => el('div', { onClick: () => ctx.navigate(`/book/${t.b.id}`), style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer', flexShrink: 0 } },
        el('div', { style: { filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.08))' } }, cover(t.b, { scale: 0.52, lift: false })),
        el('div', { style: { textAlign: 'center' } }, el('span', { class: 'mono', style: { fontSize: 13, fontWeight: 700, color: t.c >= 3 ? '#c2553a' : 'var(--ink-1)' } }, String(t.c)), el('span', { style: { fontSize: 11, color: 'var(--ink-3)', marginLeft: 3 } }, '회'))))));

  const quotesSec = el('section', {},
    el('div', { style: { display: 'flex', alignItems: 'baseline', marginBottom: 16 } },
      el('h3', { style: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, '어구록'),
      el('span', { class: 'mono', style: { fontSize: 12, color: 'var(--ink-4)', marginLeft: 10 } }, String(matches.length))),
    ...matches.map((q) => { const b = bookOf(q.book_ref); return el('div', { class: 'book-row', onClick: () => ctx.navigate(`/thread/${q.book_ref}/${q.id}`), style: { padding: '14px 12px', margin: '0 -12px', borderRadius: 10, display: 'flex', gap: 18, alignItems: 'flex-start', cursor: 'pointer' } },
      b ? el('div', { style: { filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.07))', flexShrink: 0 } }, cover(b, { scale: 0.26, lift: false })) : null,
      el('div', { style: { flex: 1, minWidth: 0 } },
        el('div', { style: { fontSize: 16, lineHeight: 1.65, fontWeight: 500 } }, el('span', { style: { color: 'var(--ink-4)', fontFamily: 'var(--serif)' } }, '“'), ...highlight(q.text, word), el('span', { style: { color: 'var(--ink-4)', fontFamily: 'var(--serif)' } }, '”')),
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 12, color: 'var(--ink-4)' } }, el('span', { style: { color: 'var(--ink-2)', fontWeight: 600 } }, b?.t || ''), el('span', {}, '·'), el('span', { class: 'mono' }, fmtDateTime(q.created_at))))); }),
  );

  const inner = el('div', { style: { maxWidth: 1080, padding: '40px 44px 100px' } }, hero, booksRanked.length ? booksSec : null, matches.length ? quotesSec : el('div', { style: { color: 'var(--ink-3)' } }, `"${word}" 가 등장한 어구록이 없습니다.`));
  const crumbEl = crumb({ ctx, path: [{ label: '통계', back: true, onBack: () => ctx.navigate('/stats') }, { label: '단어' }, { label: word, last: true }] });
  host.appendChild(screenShell({ tab: 'stats', ctx, crumbEl, children: inner }));
}

registerScreen('word', render);
export default render;
