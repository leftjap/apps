/**
 * 추가/수정/삭제 모달 — v14 ScrAddV14/ScrEditV14/ScrDeleteV14 이식 (오버레이 상태, today editor 패턴).
 *  - openAdd(ctx, {bookRef?}) : 책 선택 + 어구록 입력 + 첫 댓글(선택) + 핀 토글 → createQuote
 *  - openEdit(ctx, id)        : 본문 수정 → updateQuote, 삭제 진입
 *  - openDelete(ctx, id)      : 확인 다이얼로그 → softDeleteQuote(+댓글)
 *  - 저장/삭제 후 ctx.refresh() 로 현재 화면 재렌더.
 */
import { setActions } from '../app.js';
import { Queries } from '../db/queries.js';
import { BOOKS, bookOf, registerBookInMemory } from '../data/books.js';
import { Aladin } from '../db/aladin.js';
import { el, clear } from '../ui/dom.js';
import { iconEl } from '../ui/icons.js';
import { cover } from '../ui/cover.js';
import { modal, btn } from '../ui/components.js';
import { quotePreview } from '../ui/quote-md.js';

function mountOverlay(node) {
  const app = document.querySelector('#app');
  app.appendChild(node);
  const onKey = (e) => { if (e.key === 'Escape') remove(); };
  document.addEventListener('keydown', onKey);
  function remove() {
    document.removeEventListener('keydown', onKey);
    try { node.remove(); } catch (_) {}
  }
  return remove;
}

const upper = (t) => el('div', { class: 'upper', style: { marginBottom: 10 } }, t);
const upperTop = (t) => el('div', { class: 'upper', style: { marginTop: 24, marginBottom: 10 } }, t);

function editorTextarea(value = '') {
  return el('textarea', {
    value,
    placeholder: '책에서 옮길 문장을 적어주세요.',
    style: {
      width: '100%', border: '1.5px solid var(--ink-1)', borderRadius: 12,
      padding: '18px 20px', minHeight: 160, fontSize: 16.5, lineHeight: 1.7,
      fontWeight: 500, letterSpacing: '-.012em', outline: 'none', resize: 'vertical',
      fontFamily: 'var(--sans)', color: 'var(--ink-1)', boxSizing: 'border-box',
    },
  });
}

// 책 선택기 — 현재 책 row + 변경 시 BOOKS 목록 패널
function bookSelector(initialRef, { editable = true } = {}) {
  let ref = initialRef ? String(initialRef) : null;
  let panelOpen = false;
  const container = el('div', {});
  const rowHost = el('div', {});
  const panelHost = el('div', {});
  container.append(rowHost, panelHost);

  function renderRow() {
    clear(rowHost);
    const b = bookOf(ref);
    if (b) {
      rowHost.appendChild(el('div', { class: 'book-row', style: { display: 'flex', alignItems: 'center', gap: 16, padding: '10px 12px', margin: '0 -12px', borderRadius: 10 } },
        cover(b, { scale: 0.32 }),
        el('div', { style: { flex: 1, minWidth: 0 } },
          el('div', { style: { fontSize: 15, fontWeight: 700, letterSpacing: '-.018em' } }, b.t),
          el('div', { style: { fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 } }, b.a)),
        editable ? btn({ label: '변경', variant: 'ghost', size: 'sm', iconR: 'chev', onClick: togglePanel, style: { color: 'var(--ink-3)' } }) : null,
      ));
    } else {
      rowHost.appendChild(el('div', { class: 'book-row', onClick: togglePanel, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 12px', margin: '0 -12px', borderRadius: 10, cursor: 'pointer', color: 'var(--ink-3)', border: '1px dashed var(--line)' } },
        iconEl('book', { sz: 18 }), el('span', {}, '책 선택')));
    }
  }
  function togglePanel() { panelOpen = !panelOpen; renderPanel(); }
  function pick(r) { ref = r; panelOpen = false; renderRow(); renderPanel(); }
  function bookRowItem(b, onPick, sub) {
    return el('div', { class: 'book-row', onClick: onPick, style: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, cursor: 'pointer' } },
      cover(b, { scale: 0.2 }),
      el('div', { style: { flex: 1, minWidth: 0 } },
        el('div', { style: { fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, b.t),
        el('div', { style: { fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, sub || b.a)));
  }
  function renderPanel() {
    clear(panelHost);
    if (!panelOpen) return;
    const search = el('input', { placeholder: '알라딘에서 책 검색 (제목·저자·ISBN)', style: { width: '100%', height: 38, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--sans)' } });
    const results = el('div', { style: { maxHeight: 280, overflowY: 'auto', marginTop: 8 } });
    panelHost.appendChild(el('div', { style: { marginTop: 8, border: '1px solid var(--line)', borderRadius: 10, padding: 8 } }, search, results));
    const showLibrary = () => { clear(results); results.appendChild(el('div', { class: 'upper', style: { margin: '4px 4px 6px' } }, '내 서재')); for (const b of BOOKS) results.appendChild(bookRowItem(b, () => pick(String(b.id)))); };
    const runSearch = async (q) => {
      clear(results); results.appendChild(el('div', { style: { padding: 12, color: 'var(--ink-3)', fontSize: 13 } }, '검색 중…'));
      let list;
      try { list = await Aladin.searchBooks(q, { max: 10 }); } catch (e) { clear(results); results.appendChild(el('div', { style: { padding: 12, color: '#c2553a', fontSize: 13 } }, '알라딘 검색 실패: ' + (e?.message || e))); return; }
      clear(results);
      if (!list.length) { results.appendChild(el('div', { style: { padding: 12, color: 'var(--ink-3)', fontSize: 13 } }, '검색 결과 없음')); return; }
      results.appendChild(el('div', { class: 'upper', style: { margin: '4px 4px 6px' } }, '알라딘 검색결과'));
      for (const n of list) {
        const ab = Aladin.toAppBook(n);
        if (!ab) continue;
        results.appendChild(bookRowItem(ab, async () => { try { await Queries.upsertBook(ab); registerBookInMemory(ab); } catch (e) { console.warn('[add] 책 등록 실패', e?.message || e); } pick(String(ab.id)); }, `${ab.a} · ${ab.p}${ab.y ? ' · ' + ab.y : ''}`));
      }
    };
    let t;
    search.addEventListener('input', () => { const q = search.value.trim(); clearTimeout(t); if (!q) { showLibrary(); return; } t = setTimeout(() => runSearch(q), 350); });
    showLibrary();
    setTimeout(() => search.focus(), 30);
  }
  renderRow();
  return { el: container, getRef: () => ref };
}

function pinToggleLabel(initial, onChange) {
  let on = !!initial;
  const box = el('span', { style: { width: 16, height: 16, borderRadius: 4, border: '1.5px solid var(--ink-4)', background: on ? 'var(--ink-1)' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' } });
  if (on) box.appendChild(iconEl('check', { sz: 11, st: 2, style: 'color:#fff' }));
  const label = el('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }, onClick: () => { on = !on; clear(box); box.style.background = on ? 'var(--ink-1)' : '#fff'; if (on) box.appendChild(iconEl('check', { sz: 11, st: 2, style: 'color:#fff' })); onChange(on); } },
    box, el('span', { style: { color: 'var(--ink-2)' } }, '핀으로 두기'));
  return label;
}

// ─── 추가 ────────────────────────────────────────────────────────────────────
function openAdd(ctx, opts = {}) {
  const meId = ctx?.user?.id;
  if (!meId) return;
  let pinned = false;
  const selector = bookSelector(opts.bookRef);
  const textarea = editorTextarea('');
  const charCount = el('div', { class: 'mono', style: { marginTop: 8, fontSize: 12, color: 'var(--ink-3)' } }, '0자');
  textarea.addEventListener('input', () => { charCount.textContent = `${textarea.value.length}자`; });
  const firstComment = el('textarea', { placeholder: '이 어구록에 대한 내 생각을 함께 남겨두세요.', style: { width: '100%', padding: '14px 16px', background: '#fafaf7', border: '1px solid var(--line-2)', borderRadius: 8, fontSize: 14, lineHeight: 1.6, minHeight: 56, resize: 'vertical', outline: 'none', fontFamily: 'var(--sans)', boxSizing: 'border-box' } });
  const errLine = el('div', { style: { fontSize: 12, color: '#c2553a', minHeight: 16, marginTop: 6 } });

  const body = el('div', { style: { padding: '22px 26px 26px' } },
    upper('책'), selector.el,
    upperTop('어구록'), textarea, charCount,
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 24, marginBottom: 10 } }, el('span', { class: 'upper' }, '첫 댓글'), el('span', { style: { fontSize: 11.5, color: 'var(--ink-4)' } }, '(선택)')),
    firstComment, errLine,
  );

  let close;
  const save = async () => {
    const text = textarea.value.trim();
    const ref = selector.getRef();
    if (!ref) { errLine.textContent = '책을 선택하세요.'; return; }
    if (!text) { errLine.textContent = '어구록 내용을 입력하세요.'; textarea.focus(); return; }
    try {
      const q = await Queries.createQuote({ owner_id: meId, book_ref: ref, text, pinned });
      const fc = firstComment.value.trim();
      if (fc) await Queries.createComment({ quote_id: q.id, author_id: meId, body: fc });
      close();
      ctx.refresh && ctx.refresh();
    } catch (e) { console.warn('[add] 저장 실패', e?.message || e); errLine.textContent = '저장 실패: ' + (e?.message || e); }
  };

  const m = modal({
    title: '새 어구록', width: 640, onClose: () => close(), children: body,
    footer: [pinToggleLabel(false, (v) => { pinned = v; }), el('div', { style: { flex: 1 } }), btn({ label: '취소', variant: 'ghost', size: 'md', onClick: () => close() }), btn({ label: '저장', variant: 'pri', size: 'md', onClick: save })],
  });
  close = mountOverlay(m);
  setTimeout(() => textarea.focus(), 30);
}

// ─── 수정 ────────────────────────────────────────────────────────────────────
async function openEdit(ctx, id) {
  const meId = ctx?.user?.id;
  const quote = await Queries.getQuote(id);
  if (!quote) return;
  const book = bookOf(quote.book_ref);
  const cmtCount = await Queries.countCommentsByQuote(id);
  const selector = bookSelector(quote.book_ref, { editable: false });
  const textarea = editorTextarea(quote.text);
  const charCount = el('span', { class: 'mono', style: { fontSize: 12, color: 'var(--ink-3)' } }, `${quote.text.length}자`);
  textarea.addEventListener('input', () => { charCount.textContent = `${textarea.value.length}자`; });
  const errLine = el('div', { style: { fontSize: 12, color: '#c2553a', minHeight: 16, marginTop: 6 } });

  const body = el('div', { style: { padding: '22px 26px 26px' } },
    upper('책'), selector.el,
    upperTop('어구록'), textarea,
    el('div', { style: { display: 'flex', alignItems: 'center', marginTop: 8 } }, charCount, el('div', { style: { flex: 1 } }), el('span', { style: { fontSize: 12, color: 'var(--ink-3)' } }, `${cmtCount}개의 댓글 보존`)),
    errLine,
  );

  let close;
  const save = async () => {
    const text = textarea.value.trim();
    if (!text) { errLine.textContent = '어구록 내용을 입력하세요.'; return; }
    try { await Queries.updateQuote(id, { text }); close(); ctx.refresh && ctx.refresh(); }
    catch (e) { errLine.textContent = '저장 실패: ' + (e?.message || e); }
  };

  const m = modal({
    title: '어구록 수정', width: 640, onClose: () => close(), children: body,
    footer: [
      btn({ label: '삭제', variant: 'ghost', size: 'sm', icon: 'trash', style: { color: '#c2553a' }, onClick: () => { close(); openDelete(ctx, id); } }),
      el('div', { style: { flex: 1 } }),
      btn({ label: '취소', variant: 'ghost', size: 'md', onClick: () => close() }),
      btn({ label: '저장', variant: 'pri', size: 'md', onClick: save }),
    ],
  });
  close = mountOverlay(m);
}

// ─── 삭제 확인 ────────────────────────────────────────────────────────────────
async function openDelete(ctx, id) {
  const quote = await Queries.getQuote(id);
  if (!quote) return;
  const cmtCount = await Queries.countCommentsByQuote(id);
  let close;
  const doDelete = async () => {
    try {
      const cmts = await Queries.listCommentsByQuote(id);
      for (const c of cmts) await Queries.softDeleteComment(c.id);
      await Queries.softDeleteQuote(id);
      close();
      // 스레드(삭제된 책)에 있으면 피드로, 아니면 현재 화면 재렌더.
      const cur = ctx.parseHash ? ctx.parseHash() : null;
      if (cur && cur.name === 'thread') ctx.navigate('/');
      else ctx.refresh && ctx.refresh();
    } catch (e) { console.warn('[delete] 실패', e?.message || e); }
  };
  const dialog = el('div', { style: { width: 440, background: '#fff', borderRadius: 14, boxShadow: '0 4px 12px -2px rgba(20,18,14,.10), 0 24px 60px -16px rgba(20,18,14,.32)', padding: '26px 28px' } },
    el('div', { style: { width: 40, height: 40, borderRadius: 50, background: 'rgba(194,85,58,0.10)', color: '#c2553a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 } }, iconEl('trash', { sz: 20, st: 1.8 })),
    el('h3', { style: { margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' } }, '어구록을 삭제하시겠어요?'),
    el('p', { style: { margin: '8px 0 20px', fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.65 } },
      cmtCount > 0 ? `이 어구록과 함께 댓글 ${cmtCount}개도 삭제됩니다. 되돌릴 수 없습니다.` : '이 어구록을 삭제합니다. 되돌릴 수 없습니다.'),
    el('div', { style: { padding: '14px 16px', background: 'var(--paper)', borderRadius: 8, marginBottom: 24 } },
      el('div', { style: { fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } },
        el('span', { style: { color: 'var(--ink-4)', fontFamily: 'var(--serif)' } }, '“'), quotePreview(quote.text), el('span', { style: { color: 'var(--ink-4)', fontFamily: 'var(--serif)' } }, '”'))),
    el('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
      btn({ label: '취소', variant: 'sec', size: 'md', onClick: () => close() }),
      btn({ label: '삭제', variant: 'warm', size: 'md', onClick: doDelete })),
  );
  const overlay = el('div', { style: { position: 'fixed', inset: 0, background: 'rgba(20,18,14,.36)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 31 }, onClick: (e) => { if (e.target === overlay) close(); } }, dialog);
  close = mountOverlay(overlay);
}

// ─── 책 삭제 확인 (책의 어구록 일괄 soft-delete) ──────────────────────────────
async function openDeleteBook(ctx, ref, quoteIds = []) {
  const b = bookOf(ref);
  if (!b) return;
  let close;
  const doDelete = async () => {
    try {
      for (const id of quoteIds) await Queries.softDeleteQuote(id);
      close();
      ctx.refresh && ctx.refresh();
    } catch (e) { console.warn('[deleteBook] 실패', e?.message || e); }
  };
  const dialog = el('div', { style: { width: 440, background: '#fff', borderRadius: 14, boxShadow: '0 4px 12px -2px rgba(20,18,14,.10), 0 24px 60px -16px rgba(20,18,14,.32)', padding: '26px 28px' } },
    el('div', { style: { width: 40, height: 40, borderRadius: 50, background: 'rgba(194,85,58,0.10)', color: '#c2553a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 } }, iconEl('trash', { sz: 20, st: 1.8 })),
    el('h3', { style: { margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' } }, '책을 삭제하시겠어요?'),
    el('p', { style: { margin: '8px 0 20px', fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.65 } },
      `‘${b.t}’ 의 어구록 ${quoteIds.length}개를 모두 삭제합니다. 어구록이 0개가 되면 서재에서 사라집니다.`),
    el('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
      btn({ label: '취소', variant: 'sec', size: 'md', onClick: () => close() }),
      btn({ label: '삭제', variant: 'warm', size: 'md', onClick: doDelete })),
  );
  const overlay = el('div', { style: { position: 'fixed', inset: 0, background: 'rgba(20,18,14,.36)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 31 }, onClick: (e) => { if (e.target === overlay) close(); } }, dialog);
  close = mountOverlay(overlay);
}

setActions({ openAdd, openEdit, openDelete, openDeleteBook });

export { openAdd, openEdit, openDelete, openDeleteBook };
export default { openAdd, openEdit, openDelete, openDeleteBook };
