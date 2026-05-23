/**
 * 단어 상세 — v14 ScrWordV14 (details-v14.jsx:151-331) 이식, 실데이터 집계.
 *  - hero: 거대 serif 단어 + 4스탯(등장/책/작가/분야) + 처음 만난 곳
 *  - 등장 추이(최근 12개월 막대) · 함께 자주 등장(관련어 칩) · 옮긴 작가
 *  - 등장하는 책(책장) · 어구록(하이라이트). 최근순 버튼은 v14 그대로 inert.
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { bookOf } from '../data/books.js';
import { el } from '../ui/dom.js';
import { cover } from '../ui/cover.js';
import { screenShell, crumb, btn } from '../ui/components.js';
import { barChart } from '../ui/charts.js';
import { tokenize } from '../ui/text.js';
import { fmtDate, fmtDateTime } from '../ui/format.js';

const owners = (u) => [u?.id, Profile.getPartnerUserIdForEmail(u?.email)].filter(Boolean);
const topCat = (b) => (b?.c ? b.c.split('·')[0].trim() : '기타');
const monthKey = (iso) => (iso || '').slice(0, 7);
const occ = (text, word) => (text && word ? text.split(word).length - 1 : 0);

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
  const occurrences = matches.reduce((s, q) => s + occ(q.text, word), 0);
  const bookRefs = [...new Set(matches.map((q) => String(q.book_ref)))];
  const booksRanked = bookRefs.map((ref) => ({ b: bookOf(ref), c: matches.filter((q) => String(q.book_ref) === ref).reduce((s, q) => s + occ(q.text, word), 0) })).filter((x) => x.b).sort((a, b) => b.c - a.c);
  const usedBooks = booksRanked.map((x) => x.b);
  const distinctAuthors = new Set(usedBooks.map((b) => b.a)).size;
  const distinctCats = new Set(usedBooks.map((b) => topCat(b))).size;

  // 처음 만난 곳 — 가장 오래된 등장
  const earliest = [...matches].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))[0];
  const firstBook = earliest ? bookOf(earliest.book_ref) : null;

  // 등장 추이 — 최근 12개월 (최신 데이터 달 기준)
  const latestMonth = all.map((q) => monthKey(q.created_at)).filter(Boolean).sort().reverse()[0] || monthKey(new Date().toISOString());
  const [ly, lm] = latestMonth.split('-').map(Number);
  const months = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(Date.UTC(ly, (lm - 1) - i, 1)); months.push({ key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, label: `${d.getUTCMonth() + 1}월` }); }
  const monthly = months.map((m) => matches.filter((q) => monthKey(q.created_at) === m.key).reduce((s, q) => s + occ(q.text, word), 0));
  const trendTotal = monthly.reduce((a, b) => a + b, 0);
  const trendActive = monthly.filter((v) => v > 0).length;
  const trendAvg = trendActive ? Math.round((trendTotal / trendActive) * 10) / 10 : 0;

  // 함께 자주 등장 — 같은 어구록 내 다른 단어
  const coFreq = new Map();
  for (const q of matches) for (const w of tokenize(q.text)) { if (w === word || w.includes(word) || word.includes(w)) continue; coFreq.set(w, (coFreq.get(w) || 0) + 1); }
  const related = [...coFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  // 옮긴 작가 — 등장 책의 저자별 등장 횟수
  const authFreq = new Map();
  for (const q of matches) { const b = bookOf(q.book_ref); if (!b) continue; authFreq.set(b.a, (authFreq.get(b.a) || 0) + occ(q.text, word)); }
  const authorsRanked = [...authFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  // ── hero
  const stat = (l, n, u) => el('div', {}, el('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 } }, l),
    el('div', { class: 'mono', style: { fontSize: 30, fontWeight: 700, letterSpacing: '-.028em', lineHeight: 1 } }, String(n), el('span', { style: { fontSize: 12, color: 'var(--ink-3)', fontWeight: 500, fontFamily: 'var(--sans)', marginLeft: 4 } }, u)));
  const firstMet = firstBook ? el('div', { style: { padding: '16px 20px', background: '#fafaf7', borderRadius: 10, border: '1px solid var(--line-2)' } },
    el('div', { class: 'upper', style: { marginBottom: 8 } }, '처음 만난 곳'),
    el('div', { style: { fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6 } },
      el('span', { class: 'mono', style: { color: '#c2553a', fontWeight: 600 } }, fmtDate(earliest.created_at)),
      el('span', { style: { margin: '0 8px', color: 'var(--ink-4)' } }, '·'),
      el('span', { style: { fontWeight: 600, color: 'var(--ink-1)' } }, firstBook.a),
      el('span', { style: { color: 'var(--ink-3)', marginLeft: 6 } }, `《${firstBook.t}》`))) : null;
  const hero = el('section', { class: 'word-hero', style: { display: 'flex', gap: 64, alignItems: 'flex-start', marginBottom: 40 } },
    el('h1', { style: { margin: 0, fontSize: 140, fontWeight: 800, letterSpacing: '-.045em', lineHeight: 0.92, fontFamily: 'var(--serif)' } }, word),
    el('div', { style: { paddingTop: 20, flex: 1 } },
      el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginBottom: firstMet ? 28 : 0 } },
        stat('등장', occurrences, '회'), stat('책', booksRanked.length, '권'), stat('작가', distinctAuthors, '명'), stat('분야', distinctCats, '개')),
      firstMet));

  // ── 등장 추이
  const trendSec = el('section', { style: { marginBottom: 44 } },
    el('div', { style: { display: 'flex', alignItems: 'baseline', marginBottom: 18 } },
      el('h3', { style: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, '등장 추이'),
      el('span', { class: 'mono', style: { fontSize: 12, color: 'var(--ink-4)', marginLeft: 10 } }, '최근 12개월'),
      el('div', { style: { flex: 1 } }),
      el('span', { style: { fontSize: 12, color: 'var(--ink-3)' } }, '총 ', el('b', { class: 'mono', style: { color: 'var(--ink-1)' } }, String(trendTotal)), '회 · 평균 ', el('b', { class: 'mono', style: { color: 'var(--ink-1)' } }, String(trendAvg)), '/월')),
    barChart({ data: monthly, labels: months.map((m) => m.label), height: 120, highlightIndex: 11 }));

  // ── 함께 자주 등장 + 옮긴 작가
  const relatedSec = el('section', {},
    el('h3', { style: { margin: '0 0 16px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, '함께 자주 등장'),
    related.length ? el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
      ...related.map(([w, c]) => el('span', { class: 'book-row', onClick: () => ctx.navigate(`/word/${encodeURIComponent(w)}`), style: { display: 'inline-flex', alignItems: 'baseline', gap: 6, padding: '8px 14px', background: 'var(--paper)', borderRadius: 99, fontSize: 13.5, fontWeight: 600, color: 'var(--ink-1)', cursor: 'pointer' } }, w, el('span', { class: 'mono', style: { fontSize: 11, fontWeight: 500, color: 'var(--ink-3)' } }, String(c)))))
      : el('div', { style: { color: 'var(--ink-3)', fontSize: 13 } }, '함께 등장한 단어가 없습니다.'));
  const authorsSec = el('section', {},
    el('h3', { style: { margin: '0 0 16px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, '옮긴 작가'),
    ...(authorsRanked.length ? authorsRanked.map(([name, c]) => el('div', { class: 'book-row', onClick: () => ctx.navigate(`/author/${encodeURIComponent(name)}`), style: { display: 'flex', alignItems: 'baseline', padding: '8px 10px', margin: '0 -10px', borderRadius: 6, fontSize: 13.5, cursor: 'pointer' } },
      el('span', { style: { fontWeight: 500 } }, name), el('div', { style: { flex: 1 } }), el('span', { class: 'mono', style: { fontSize: 12, color: 'var(--ink-2)', fontWeight: 600 } }, String(c)))) : [el('div', { style: { color: 'var(--ink-3)', fontSize: 13 } }, '작가 정보가 없습니다.')]));
  const cols = el('div', { class: 'word-cols', style: { display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 52, marginBottom: 44 } }, relatedSec, authorsSec);

  // ── 등장하는 책
  const booksSec = el('section', { style: { marginBottom: 44 } },
    el('h3', { style: { margin: '0 0 16px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, `등장하는 책 · ${booksRanked.length}`),
    el('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 28, paddingBottom: 6, overflowX: 'auto' } },
      ...booksRanked.map((t) => el('div', { onClick: () => ctx.navigate(`/book/${t.b.id}`), style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer', flexShrink: 0 } },
        el('div', { style: { filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.08))' } }, cover(t.b, { scale: 0.52, lift: false })),
        el('div', { style: { textAlign: 'center' } }, el('span', { class: 'mono', style: { fontSize: 13, fontWeight: 700, color: t.c >= 3 ? '#c2553a' : 'var(--ink-1)' } }, String(t.c)), el('span', { style: { fontSize: 11, color: 'var(--ink-3)', marginLeft: 3 } }, '회'))))));

  // ── 어구록
  const quotesSec = el('section', {},
    el('div', { style: { display: 'flex', alignItems: 'baseline', marginBottom: 16 } },
      el('h3', { style: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, '어구록'),
      el('span', { class: 'mono', style: { fontSize: 12, color: 'var(--ink-4)', marginLeft: 10 } }, String(matches.length)),
      el('div', { style: { flex: 1 } }),
      btn({ label: '최근순', variant: 'ghost', size: 'sm', iconR: 'chevD' })),
    ...matches.map((q) => { const b = bookOf(q.book_ref); return el('div', { class: 'book-row', onClick: () => ctx.navigate(`/thread/${q.book_ref}/${q.id}`), style: { padding: '14px 12px', margin: '0 -12px', borderRadius: 10, display: 'flex', gap: 18, alignItems: 'flex-start', cursor: 'pointer' } },
      b ? el('div', { style: { filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.07))', flexShrink: 0 } }, cover(b, { scale: 0.26, lift: false })) : null,
      el('div', { style: { flex: 1, minWidth: 0 } },
        el('div', { style: { fontSize: 16, lineHeight: 1.65, fontWeight: 500 } }, el('span', { style: { color: 'var(--ink-4)', fontFamily: 'var(--serif)' } }, '“'), ...highlight(q.text, word), el('span', { style: { color: 'var(--ink-4)', fontFamily: 'var(--serif)' } }, '”')),
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 12, color: 'var(--ink-4)' } }, el('span', { style: { color: 'var(--ink-2)', fontWeight: 600 } }, b?.t || ''), el('span', {}, '·'), el('span', { class: 'mono' }, fmtDateTime(q.created_at))))); }));

  const inner = el('div', { style: { maxWidth: 1080, padding: '40px 44px 100px' } }, hero,
    matches.length ? trendSec : null,
    matches.length ? cols : null,
    booksRanked.length ? booksSec : null,
    matches.length ? quotesSec : el('div', { style: { color: 'var(--ink-3)' } }, `"${word}" 가 등장한 어구록이 없습니다.`));
  const crumbEl = crumb({ ctx, path: [{ label: '통계', back: true, onBack: () => ctx.navigate('/stats') }, { label: '단어' }, { label: word, last: true }] });
  host.appendChild(screenShell({ tab: 'stats', ctx, crumbEl, children: inner }));
}

registerScreen('word', render);
export default render;
