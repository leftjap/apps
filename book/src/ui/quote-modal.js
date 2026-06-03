/**
 * 공용 QuoteModal + ⋮ menu-pop — 어구록·피드 화면 공용 (v4, 작업지시서 §6).
 *  - openQuoteModal(q, ctx, opts): 어구록 상세 모달 (본문 + 출처 + ⋮ + 닫기).
 *  - rowMenuButton(q, ctx, opts): 리스트 행용 ⋮ 버튼 (호버 노출, 클릭 시 menu-pop).
 *  - menu-pop 액션: 핀 추가/해제 · 복사 · 수정 · 삭제. (핀=실 CRUD, 수정/삭제=기존 add-edit 플로우)
 * opts: { commentCount, container, onChange }
 *   - container: 모달/팝오버를 붙일 노드(보통 .bookv4 루트). 모달 back 자체에 .bookv4 부여라 토큰은 자급.
 *   - onChange(q): 핀 토글 등 변경 후 호출 — 호출 화면이 부분 재렌더.
 */
import { Queries } from '../db/queries.js';
import { bookOf } from '../data/books.js';
import { el } from './dom.js';
import { iconEl } from './icons.js';
import { cover } from './cover.js';
import { fmtDateTime } from './format.js';

const coverAt = (b, width, opts = {}) => cover(b, { scale: width / (b?.w || 130), lift: false, ...opts });

export function relTime(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

// ─── menu-pop (행·모달 공용) ───
let _openPop = null;
export function closePop() {
  if (_openPop) { _openPop.remove(); _openPop = null; document.removeEventListener('click', onDocClick, true); }
}
function onDocClick(e) {
  if (_openPop && !_openPop.contains(e.target) && !e.target.closest('.menu-btn') && !e.target.closest('.modal-menu-btn')) closePop();
}
function copyText(t) { try { navigator.clipboard?.writeText(t); } catch { /* noop */ } }
async function togglePin(q, ctx, onChange) {
  try {
    await Queries.togglePinQuote(q.id);
    q.pinned = q.pinned ? 0 : 1;
    onChange?.(q);
  } catch (e) { console.warn('[quote] 핀 토글 실패', e?.message || e); }
}

/**
 * ⋮ 메뉴 팝오버 엘리먼트. afterAction(act): edit/delete 시 호출(모달 닫기 등).
 * 소유권: 핀/수정/삭제는 본인 소유 어구록(owner_id===me)만 노출 — 상대 글은 RLS write 거부라
 * 로컬만 바뀌고 서버 미반영(reload 시 복원)되므로 메뉴 자체를 숨긴다. 복사는 누구나 가능.
 */
export function buildMenuPop(q, ctx, { onChange, afterAction } = {}) {
  const meId = ctx?.user?.id;
  const isMine = !meId || q.owner_id === meId; // me 미상이면(로컬/미로그인) 일단 허용
  return el('div', { class: 'menu-pop', onClick: (e) => e.stopPropagation() },
    isMine ? el('button', { onClick: () => { closePop(); togglePin(q, ctx, onChange); } },
      iconEl(q.pinned ? 'star-fill' : 'star', { sz: 14 }), q.pinned ? '핀 해제' : '핀 추가') : null,
    el('button', { onClick: () => { closePop(); copyText(q.text); } }, iconEl('copy', { sz: 14 }), '복사'),
    isMine ? el('button', { onClick: () => { closePop(); afterAction?.('edit'); (ctx.openEdit ? ctx.openEdit(q.id) : ctx.navigate(`/edit/${q.id}`)); } },
      iconEl('edit', { sz: 14 }), '수정') : null,
    isMine ? el('hr', {}) : null,
    isMine ? el('button', { class: 'danger', onClick: () => { closePop(); afterAction?.('delete'); (ctx.openDelete ? ctx.openDelete(q.id) : ctx.navigate(`/delete/${q.id}`)); } },
      iconEl('trash', { sz: 14 }), '삭제') : null,
  );
}

/** 리스트 행용 ⋮ 버튼 (부모는 position:relative 행이어야 함). */
export function rowMenuButton(q, ctx, opts = {}) {
  const btn = el('button', {
    class: 'menu-btn', 'aria-label': '더보기',
    onClick: (e) => {
      e.stopPropagation();
      if (_openPop) { closePop(); return; }
      const pop = buildMenuPop(q, ctx, opts);
      btn.parentElement.appendChild(pop);
      _openPop = pop;
      setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
    },
  }, iconEl('dots-v', { sz: 16 }));
  return btn;
}

/** 우클릭(contextmenu)+롱프레스(모바일 ~500ms)로 menu-pop 띄우기. popFactory: ()=>menu-pop el. rowEl 은 position:relative 권장. */
export function attachContextMenu(rowEl, popFactory) {
  const openAt = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    closePop();
    const pop = popFactory();
    rowEl.appendChild(pop);
    _openPop = pop;
    setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
  };
  rowEl.addEventListener('contextmenu', openAt);
  let t = null;
  rowEl.addEventListener('touchstart', () => { t = setTimeout(() => openAt(null), 500); }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => rowEl.addEventListener(ev, () => clearTimeout(t)));
}

// ─── QuoteModal ───
export function openQuoteModal(q, ctx, { commentCount = 0, container } = {}) {
  const root = container || document.body;
  const b = bookOf(q.book_ref);
  let esc = null;
  const back = el('div', { class: 'bookv4 bookv4-modal-back', onClick: (e) => { if (e.target === back) close(); } });
  function close() { closePop(); if (back.isConnected) back.remove(); if (esc) { document.removeEventListener('keydown', esc); esc = null; } }

  const modal = el('div', { class: 'modal', onClick: (e) => e.stopPropagation() });
  const tools = el('div', { class: 'modal-tools' },
    el('button', {
      class: 'modal-menu-btn', 'aria-label': '더보기',
      onClick: (e) => {
        e.stopPropagation();
        if (_openPop) { closePop(); return; }
        const pop = buildMenuPop(q, ctx, { afterAction: (act) => { if (act === 'edit' || act === 'delete') close(); } });
        pop.style.top = '44px'; pop.style.right = '44px';
        modal.appendChild(pop);
        _openPop = pop;
        setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
      },
    }, iconEl('dots-v', { sz: 18 })),
    el('button', { class: 'modal-close', 'aria-label': '닫기', onClick: close }, iconEl('close', { sz: 16 })),
  );
  const meta = el('div', { class: 'meta' },
    el('span', {}, fmtDateTime(q.created_at)),
    el('span', {}, '·'),
    el('span', {}, `${relTime(q.created_at)} 저장`),
    commentCount > 0 ? el('span', {}, '·') : null,
    commentCount > 0 ? el('span', { class: 'clink', onClick: () => { close(); ctx.navigate(`/thread/${q.book_ref}/${q.id}`); } }, `댓글 ${commentCount}`) : null,
    q.pinned ? el('span', { class: 'pin' }, '★ 핀') : null,
  );
  modal.append(
    tools,
    el('div', { class: 'modal-quote' }, q.text),
    el('div', { class: 'modal-source' },
      el('div', { class: 'cover-slot' }, coverAt(b, 60)),
      el('div', {},
        el('div', { class: 'book-name' }, b ? b.t : ''),
        el('div', { class: 'by' }, b ? `${b.a} · ${b.p}` : ''),
        meta,
      ),
    ),
  );
  back.appendChild(modal);
  root.appendChild(back);
  esc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  return { close };
}

export default { openQuoteModal, rowMenuButton, buildMenuPop, relTime };
