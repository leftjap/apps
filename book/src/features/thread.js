/**
 * 스레드 화면 — v14 ScrThreadV14 + ThreadCommentsV14 이식.
 *  - 한 책의 어구록을 시간순으로. 진입 quoteId 가 앵커(지금 본 어구록, warm 바 + 배지).
 *  - 핀 어구록은 flank serif 강조. 각 어구록에 댓글 스레드(아바타+이름+시각+본문).
 *  - 앵커 어구록에 인라인 댓글 입력. 댓글 추가 시 즉시 재렌더. Realtime 변경 시 재렌더(토스트 없음).
 *  - 핀 토글 인라인.
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Sync } from '../db/sync.js';
import { bookOf } from '../data/books.js';
import { el, clear } from '../ui/dom.js';
import { iconEl } from '../ui/icons.js';
import { cover } from '../ui/cover.js';
import { screenShell, crumb, count as countEl } from '../ui/components.js';
import { renderQuoteBody } from '../ui/quote-md.js';
import { fmtDateTime, fmtMonthDay } from '../ui/format.js';

function ownerIdsOf(user) {
  return [user?.id].filter(Boolean);
}

// ─── 댓글 블록 ───────────────────────────────────────────────────────────────
function renderComments({ quoteId, comments, allowInput, meId, onChanged }) {
  const wrap = el('div', { style: { marginTop: 18 } });
  comments.forEach((c, i) => {
    const isLast = i === comments.length - 1 && !allowInput;
    const avatarCol = el('div', { style: { position: 'relative', width: 24, flexShrink: 0 } },
      !isLast ? el('div', { style: { position: 'absolute', left: 11, top: 22, bottom: -8, width: 1, background: 'var(--line)' } }) : null,
      el('div', { style: { width: 22, height: 22, borderRadius: 50, background: 'var(--ink-1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, marginTop: 1 } }, '나'),
    );
    const body = el('div', { style: { flex: 1, minWidth: 0, paddingBottom: i === comments.length - 1 ? 0 : 16 } },
      el('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 } },
        el('span', { style: { fontSize: 12.5, fontWeight: 700, color: 'var(--ink-1)' } }, '나'),
        el('span', { class: 'mono', style: { fontSize: 11, color: 'var(--ink-4)' } }, fmtMonthDay(c.created_at)),
      ),
      el('div', { style: { fontSize: 14, lineHeight: 1.65, color: 'var(--ink-2)' } }, c.body),
    );
    wrap.appendChild(el('div', { style: { display: 'flex', gap: 12 } }, avatarCol, body));
  });

  if (allowInput) {
    const input = el('input', {
      placeholder: '댓글 쓰기',
      style: { flex: 1, border: 0, outline: 0, background: 'transparent', fontSize: 14, fontFamily: 'inherit' },
      onKeydown: async (e) => {
        if (e.key === 'Enter' && e.target.value.trim()) {
          const body = e.target.value.trim();
          e.target.value = '';
          try {
            await Queries.createComment({ quote_id: quoteId, author_id: meId, body });
            onChanged && onChanged();
          } catch (err) { console.warn('[thread] 댓글 추가 실패', err?.message || err); }
        }
      },
    });
    wrap.appendChild(el('div', { style: { display: 'flex', gap: 12, marginTop: 4 } },
      el('div', { style: { width: 24, flexShrink: 0 } }, el('div', { style: { width: 22, height: 22, borderRadius: 50, border: '1.5px dashed var(--line)' } })),
      el('div', { style: { flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--paper)', borderRadius: 8 } }, input),
    ));
  }
  return wrap;
}

async function build(host, params, ctx) {
  const user = ctx.user;
  const meId = user?.id;
  const owners = ownerIdsOf(user);
  const ref = String(params.ref || '');
  const anchorId = params.quoteId || null;
  const book = bookOf(ref);

  clear(host);
  if (!book) {
    host.appendChild(screenShell({ tab: 'excerpt', ctx, children: el('div', { style: { padding: 40, color: 'var(--ink-3)' } }, `책을 찾을 수 없습니다: ${ref}`) }));
    return;
  }

  let quotes = [];
  let commentsByQuote = {};
  try {
    quotes = (await Queries.listByBook(ref, owners)).slice().sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    for (const q of quotes) commentsByQuote[q.id] = await Queries.listCommentsByQuote(q.id);
  } catch (e) { console.warn('[thread] 로드 실패', e?.message || e); }

  const totalComments = Object.values(commentsByQuote).reduce((s, arr) => s + arr.length, 0);
  const pinnedCount = quotes.filter((q) => q.pinned).length;
  const rerender = () => build(host, params, ctx);

  // book band
  const band = el('div', {
    class: 'book-row', onClick: () => ctx.navigate(`/book/${ref}`),
    style: { display: 'flex', alignItems: 'center', gap: 18, padding: '10px 12px', margin: '0 -12px 20px', borderRadius: 10, cursor: 'pointer' },
  },
    cover(book, { scale: 0.34 }),
    el('div', { style: { flex: 1, minWidth: 0 } },
      el('div', { style: { fontSize: 16, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.3 } }, book.t),
      el('div', { style: { fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 } }, `${book.a} · ${book.p}`),
    ),
    el('div', { style: { display: 'flex', gap: 22, fontSize: 12 } },
      countEl({ n: quotes.length, label: '어구록' }), countEl({ n: totalComments, label: '댓글' }), countEl({ n: pinnedCount, label: '핀' })),
  );

  // thread items
  const items = el('div', {});
  for (const q of quotes) {
    const isAnchor = anchorId != null && String(q.id) === String(anchorId);
    const cmts = commentsByQuote[q.id] || [];
    const article = el('article', { style: { position: 'relative', padding: isAnchor ? '22px 0 24px 24px' : '20px 0', marginLeft: isAnchor ? -24 : 0 } });
    if (isAnchor) {
      article.appendChild(el('div', { style: { position: 'absolute', left: 0, top: 26, bottom: 26, width: 3, background: '#c2553a', borderRadius: 2 } }));
      article.appendChild(el('span', { style: { position: 'absolute', top: -2, left: 24, padding: '3px 10px', background: '#c2553a', color: '#fff', borderRadius: 99, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' } }, '지금 본 어구록'));
    }
    if (q.pinned) {
      article.appendChild(el('div', { class: 'q-body', style: { padding: '8px 16px 8px', fontSize: 20, lineHeight: 1.7, fontWeight: 500, color: 'var(--ink-1)', fontFamily: 'var(--serif)', maxWidth: 580, margin: '0 auto', textAlign: 'center' } },
        ...renderQuoteBody(q.text)));
    } else {
      article.appendChild(el('div', { class: 'q-body', style: { fontSize: 18, lineHeight: 1.7, fontWeight: 500, letterSpacing: '-.012em', color: 'var(--ink-1)', fontFamily: 'var(--sans)' } },
        ...renderQuoteBody(q.text)));
    }
    const pinToggle = el('span', {
      onClick: async (e) => { e.stopPropagation(); try { await Queries.togglePinQuote(q.id); rerender(); } catch (err) { console.warn('[thread] 핀 토글 실패', err?.message || err); } },
      style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: q.pinned ? '#c2553a' : 'var(--ink-4)', fontWeight: q.pinned ? 600 : 500, cursor: 'pointer' },
    }, iconEl('pin', { sz: 12, st: 1.8 }), q.pinned ? '핀' : '핀 추가');
    article.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, fontSize: 12, color: 'var(--ink-4)', justifyContent: q.pinned ? 'center' : 'flex-start' } },
      pinToggle,
      el('span', { class: 'mono' }, fmtDateTime(q.created_at)),
      cmts.length > 0 ? el('span', {}, '·') : null,
      cmts.length > 0 ? el('span', { style: { color: 'var(--ink-3)' } }, `댓글 ${cmts.length}`) : null,
    ));
    if (cmts.length > 0 || isAnchor) {
      article.appendChild(renderComments({ quoteId: q.id, comments: cmts, allowInput: isAnchor, meId, onChanged: rerender }));
    }
    items.appendChild(article);
  }

  const addBtn = el('button', {
    onClick: () => (ctx.openAdd ? ctx.openAdd({ bookRef: ref }) : ctx.navigate('/add')),
    style: { marginTop: 32, width: '100%', padding: '14px', background: 'transparent', border: '1px dashed var(--line)', borderRadius: 10, color: 'var(--ink-3)', fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  }, iconEl('plus', { sz: 14 }), '이 책에 어구록 추가');

  const inner = el('div', { class: 'page', style: { maxWidth: 780, padding: '32px 44px 100px' } }, band, items, addBtn);
  const crumbEl = crumb({ ctx, path: [{ label: '피드', back: true, onBack: () => ctx.navigate('/') }, { label: book.t, last: true }] });
  host.appendChild(screenShell({ tab: 'excerpt', ctx, crumbEl, children: inner }));
}

function render(host, params, ctx) {
  build(host, params, ctx);
  // realtime 변경 시 재렌더. 화면을 떠날 때 라우터(ctx.onCleanup)가 구독을 해제 →
  // thread 리스너가 살아남아 다른 화면(library 등)을 덮어쓰던 누수를 차단.
  const unsub = Sync.onRealtimeChange((payload) => {
    const t = payload?.table;
    if (t === 'book_comments' || t === 'book_quotes') build(host, params, ctx);
  });
  ctx.onCleanup?.(unsub);
}

registerScreen('thread', render);

export default render;
