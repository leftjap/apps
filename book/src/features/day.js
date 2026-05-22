/**
 * 날짜 상세 — v14 ScrDayV14 (실데이터, lean). 특정 날짜의 어구록 타임라인.
 *  - 세로선/dot marker 없음 (v14 폐기 항목). 시간+책+텍스트 단순 카드.
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { bookOf } from '../data/books.js';
import { el } from '../ui/dom.js';
import { cover } from '../ui/cover.js';
import { screenShell, crumb } from '../ui/components.js';

const owners = (u) => [u?.id, Profile.getPartnerUserIdForEmail(u?.email)].filter(Boolean);
const DOW = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

async function render(host, params, ctx) {
  const d = params.d || '';
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    host.appendChild(screenShell({ tab: 'stats', ctx, children: el('div', { style: { padding: 40, color: 'var(--ink-3)' } }, `잘못된 날짜: ${d}`) }));
    return;
  }
  const [, y, mo, da] = m;
  let all = [];
  try { all = await Queries.listAllQuotes(owners(ctx.user)); } catch (e) { console.warn('[day] 로드 실패', e?.message || e); }
  const list = all.filter((q) => (q.created_at || '').slice(0, 10) === d).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  const weekday = DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
  const hhmm = (iso) => { const t = new Date(iso); return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`; };

  // 그 날 읽은 책 (distinct + count)
  const byBook = new Map(); for (const q of list) byBook.set(String(q.book_ref), (byBook.get(String(q.book_ref)) || 0) + 1);

  const hero = el('section', { style: { display: 'flex', alignItems: 'flex-end', gap: 36, marginBottom: 32 } },
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: 14 } },
      el('span', { style: { fontFamily: 'var(--mono)', fontSize: 120, fontWeight: 700, letterSpacing: '-.045em', lineHeight: 0.85 } }, String(Number(da))),
      el('div', { style: { paddingBottom: 12 } },
        el('div', { style: { fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--ink-3)', letterSpacing: '.04em' } }, `${y}.${mo}`),
        el('div', { style: { fontSize: 22, fontWeight: 700, letterSpacing: '-.025em', marginTop: 6 } }, weekday))));

  const timeline = el('section', {},
    el('h3', { style: { margin: '0 0 18px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, `어구록 ${list.length}개`),
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      ...list.map((q) => {
        const b = bookOf(q.book_ref);
        return el('div', { class: 'book-row', onClick: () => ctx.navigate(`/thread/${q.book_ref}/${q.id}`), style: { padding: '16px 18px', borderRadius: 12, cursor: 'pointer', background: '#fff', border: '1px solid var(--line-2)', boxShadow: '0 1px 2px rgba(20,18,14,0.03), 0 8px 24px -12px rgba(20,18,14,0.06)', display: 'grid', gridTemplateColumns: '64px auto 1fr', gap: 18, alignItems: 'flex-start' } },
          el('span', { class: 'mono', style: { fontSize: 16, fontWeight: 700, color: '#c2553a', paddingTop: 2 } }, hhmm(q.created_at)),
          b ? el('div', { style: { filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.08))' } }, cover(b, { scale: 0.24, lift: false })) : el('div', {}),
          el('div', { style: { minWidth: 0, paddingTop: 1 } },
            el('div', { style: { fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 6 } }, b?.t || q.book_ref),
            el('div', { style: { fontSize: 15, lineHeight: 1.6, fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } },
              el('span', { style: { color: 'var(--ink-4)', fontFamily: 'var(--serif)' } }, '“'), q.text, el('span', { style: { color: 'var(--ink-4)', fontFamily: 'var(--serif)' } }, '”'))));
      })));

  const aside = el('aside', { style: { display: 'flex', flexDirection: 'column', gap: 32, paddingTop: 26 } },
    el('section', {},
      el('h3', { style: { margin: '0 0 14px', fontSize: 14, fontWeight: 700, letterSpacing: '-.012em' } }, `읽은 책 · ${byBook.size}`),
      ...[...byBook.entries()].map(([ref, c]) => { const b = bookOf(ref); if (!b) return null; return el('div', { class: 'book-row', onClick: () => ctx.navigate(`/book/${ref}`), style: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px', margin: '0 -8px', borderRadius: 8, cursor: 'pointer' } },
        cover(b, { scale: 0.2 }),
        el('div', { style: { flex: 1, minWidth: 0 } }, el('div', { style: { fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, b.t), el('div', { style: { fontSize: 11, color: 'var(--ink-3)', marginTop: 2 } }, b.a)),
        el('span', { class: 'mono', style: { fontSize: 11.5, color: 'var(--ink-3)' } }, String(c))); }).filter(Boolean)));

  const grid = el('div', { class: 'day-grid', style: { maxWidth: 1080, padding: '40px 44px 100px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 56 } },
    el('div', {}, hero, list.length ? timeline : el('div', { style: { color: 'var(--ink-3)' } }, '이 날의 어구록이 없습니다.')), aside);
  const crumbEl = crumb({ ctx, path: [{ label: '캘린더', back: true, onBack: () => ctx.navigate('/stats') }, { label: `${y}년 ${Number(mo)}월` }, { label: `${Number(mo)}월 ${Number(da)}일`, last: true }] });
  host.appendChild(screenShell({ tab: 'stats', ctx, crumbEl, children: grid }));
}

registerScreen('day', render);
export default render;
