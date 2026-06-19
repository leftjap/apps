/**
 * 책 상세 — v14 ScrBookV14 이식.
 *  - hero: 큰 표지 + 분야 + 제목 + 부제 + 저자·출판사·연도 + 카운트 + 어구록 추가
 *  - 어구록 시간순 목록 (핀 마커 + 시각 + 댓글 수) → 스레드
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { bookOf } from '../data/books.js';
import { el } from '../ui/dom.js';
import { iconEl } from '../ui/icons.js';
import { cover } from '../ui/cover.js';
import { screenShell, crumb, btn } from '../ui/components.js';
import { fmtDateTime } from '../ui/format.js';

function ownerIdsOf(user) {
  return [user?.id].filter(Boolean);
}

function relAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return '오늘';
  if (days < 7) return `${days}일`;
  if (days < 28) return `${Math.round(days / 7)}주`;
  if (days < 365) return `${Math.round(days / 30)}개월`;
  return `${Math.round(days / 365)}년`;
}

async function render(host, params, ctx) {
  const user = ctx.user;
  const owners = ownerIdsOf(user);
  const ref = String(params.ref || '');
  const b = bookOf(ref);
  if (!b) {
    host.appendChild(screenShell({ tab: 'excerpt', ctx, children: el('div', { style: { padding: 40, color: 'var(--ink-3)' } }, `책을 찾을 수 없습니다: ${ref}`) }));
    return;
  }

  let list = [];
  let totalComments = 0;
  try {
    list = (await Queries.listByBook(ref, owners)).slice().sort((a, c) => (c.created_at || '').localeCompare(a.created_at || ''));
    const counts = await Queries.countCommentsForQuotes(list.map((q) => q.id));
    totalComments = Object.values(counts).reduce((s, n) => s + n, 0);
  } catch (e) { console.warn('[book-detail] 로드 실패', e?.message || e); }
  const pinnedCount = list.filter((q) => q.pinned).length;
  const earliest = list.map((q) => q.created_at).filter(Boolean).sort()[0];

  // hero
  const stat = (n, l) => el('div', {},
    el('span', { style: { fontSize: 30, fontWeight: 700, letterSpacing: '-.025em', lineHeight: 1, fontFamily: 'var(--mono)' } }, String(n)),
    el('span', { style: { fontSize: 13, color: 'var(--ink-3)', marginLeft: 6 } }, l));
  const hero = el('section', { style: { display: 'flex', gap: 48, alignItems: 'flex-start', marginBottom: 40 } },
    el('div', { style: { filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.14)) drop-shadow(0 2px 6px rgba(0,0,0,0.06))' } }, cover(b, { scale: 1.2, lift: false })),
    el('div', { style: { flex: 1, paddingTop: 8 } },
      el('div', { class: 'upper', style: { marginBottom: 14 } }, b.c),
      el('h1', { style: { margin: 0, fontSize: 40, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.15 } }, b.t),
      el('div', { style: { fontSize: 15, color: 'var(--ink-3)', marginTop: 10, fontWeight: 500 } }, b.sub),
      el('div', { style: { fontSize: 13.5, color: 'var(--ink-2)', marginTop: 20, display: 'flex', gap: 12 } },
        el('span', { style: { fontWeight: 600 } }, b.a), el('span', { style: { color: 'var(--ink-4)' } }, '·'),
        el('span', {}, b.p), el('span', { style: { color: 'var(--ink-4)' } }, '·'), el('span', {}, String(b.y))),
      el('div', { style: { marginTop: 28, display: 'flex', gap: 40, alignItems: 'baseline' } },
        stat(list.length, '어구록'), stat(totalComments, '댓글'), stat(pinnedCount, '핀'), stat(relAgo(earliest), '처음'),
        el('div', { style: { flex: 1 } }),
        btn({ label: '어구록', variant: 'pri', size: 'md', icon: 'plus', onClick: () => (ctx.openAdd ? ctx.openAdd({ bookRef: ref }) : ctx.navigate('/add')) }),
      ),
    ),
  );

  const listWrap = el('div', {});
  listWrap.appendChild(el('h3', { style: { margin: '0 0 14px', fontSize: 16, fontWeight: 700, letterSpacing: '-.015em' } }, '어구록 · 시간순'));
  if (!list.length) listWrap.appendChild(el('div', { style: { padding: '40px 0', color: 'var(--ink-3)' } }, '아직 어구록이 없습니다.'));
  for (const q of list) {
    listWrap.appendChild(el('article', {
      class: 'book-row', onClick: () => ctx.navigate(`/thread/${ref}/${q.id}`),
      style: { padding: '16px 12px', margin: '0 -12px', borderRadius: 10, cursor: 'pointer' },
    },
      q.pinned ? el('div', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#c2553a', fontWeight: 600, marginBottom: 5 } }, iconEl('pin', { sz: 11, st: 1.8 }), '핀') : null,
      el('div', { style: { fontSize: 16, lineHeight: 1.65, fontWeight: q.pinned ? 600 : 500, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } },
        el('span', { style: { color: 'var(--ink-4)', fontFamily: 'var(--serif)' } }, '“'), q.text, el('span', { style: { color: 'var(--ink-4)', fontFamily: 'var(--serif)' } }, '”')),
      el('div', { style: { marginTop: 8, fontSize: 12, color: 'var(--ink-4)', display: 'flex', alignItems: 'center', gap: 10 } },
        el('span', { class: 'mono' }, fmtDateTime(q.created_at))),
    ));
  }

  const inner = el('div', { class: 'page', style: { maxWidth: 1000, padding: '40px 44px 100px' } }, hero, listWrap);
  const crumbEl = crumb({ ctx, path: [{ label: '피드', back: true, onBack: () => ctx.navigate('/') }, { label: '책' }, { label: b.t, last: true }] });
  host.appendChild(screenShell({ tab: 'excerpt', ctx, crumbEl, children: inner }));
}

registerScreen('book', render);
export default render;
