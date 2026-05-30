/**
 * 어구록(서재) 탭 — v4 LibraryTab 이식 (바닐라).
 *  - 사이드바: 플랫 책 리스트(카드 아님) + 「핀만 보기」 토글 + 장르 칩. hover 그레이, 선택 시 좌측 검정 바.
 *  - 메인: 선택 책의 어구록 읽기뷰. 인덱스 번호 + 큰 타이포, 구분선만. 표지·인용부호·태그·날짜 비노출.
 *  - 어구록 클릭 → QuoteModal(본문 + 출처 + ⋮ menu-pop: 핀/복사/수정/삭제, 댓글 진입).
 * 데이터: BOOKS 상수 + Queries.listAllQuotes(owners) 1회 → 책별 집계/필터. cover() 는 scale=px/mm.
 * D2: 부부 양쪽 표시 + 소연 문장 작은 라벨. D7: 댓글 기능 유지(모달 → 스레드).
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { BOOKS, bookOf } from '../data/books.js';
import { el, clear } from '../ui/dom.js';
import { iconEl } from '../ui/icons.js';
import { cover } from '../ui/cover.js';
import { topBar } from '../ui/components.js';
import { fmtDateTime } from '../ui/format.js';

function ownerIdsOf(user) {
  return [user?.id, Profile.getPartnerUserIdForEmail(user?.email)].filter(Boolean);
}
const genreOf = (b) => (((b?.c || '').split('·')[0]) || '').trim() || '기타';
/** width px 표지 — cover() 는 scale=px/mm 이므로 scale = width / b.w. */
const coverAt = (b, width, opts = {}) => cover(b, { scale: width / (b?.w || 130), lift: false, ...opts });

function relTime(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

async function render(host, params, ctx) {
  const user = ctx.user;
  const owners = ownerIdsOf(user);
  const meId = user?.id;

  // 셸: topBar + .bookv4 main
  const root = el('div', { class: 'bookv4' });
  const shell = el('div', { class: 'bk' }, topBar({ tab: 'library', ctx }), el('main', {}, root));
  host.appendChild(shell);

  if (!owners.length) {
    root.appendChild(el('div', { class: 'empty' }, '로그인이 필요합니다.'));
    return;
  }

  // 전체 어구록 1회 로드 → 책별 그룹 + 댓글 수
  let all = [];
  let commentCounts = {};
  try { all = await Queries.listAllQuotes(owners); }
  catch (e) { console.warn('[library] 로드 실패', e?.message || e); }
  try { commentCounts = await Queries.countCommentsForQuotes(all.map((q) => q.id)); }
  catch (e) { console.warn('[library] 댓글 수 실패', e?.message || e); }

  const byBook = new Map(); // ref → { quotes, pinned, last }
  for (const q of all) {
    const ref = String(q.book_ref);
    let g = byBook.get(ref);
    if (!g) { g = { quotes: [], pinned: 0, last: '' }; byBook.set(ref, g); }
    g.quotes.push(q);
    if (q.pinned) g.pinned++;
    const t = q.created_at || q.updated_at || '';
    if (t > g.last) g.last = t;
  }
  const booksWithQuotes = BOOKS.filter((b) => byBook.has(String(b.id)));
  const genres = ['전체', ...Array.from(new Set(booksWithQuotes.map(genreOf)))];

  // 상태
  let genre = '전체';
  let pinnedOnly = false;
  let sort = '최근';
  let selectedId = params.ref && byBook.has(String(params.ref)) ? String(params.ref) : null;

  const asideEl = el('aside', { class: 'library-aside' });
  const mainCol = el('div', { class: 'library-main' });
  root.appendChild(el('div', { class: 'library' }, asideEl, mainCol));

  function filteredBooks() {
    let bs = genre === '전체' ? booksWithQuotes : booksWithQuotes.filter((b) => genreOf(b) === genre);
    if (pinnedOnly) bs = bs.filter((b) => (byBook.get(String(b.id))?.pinned || 0) > 0);
    return bs.slice().sort((a, b) =>
      (byBook.get(String(b.id))?.last || '').localeCompare(byBook.get(String(a.id))?.last || ''));
  }

  function quotesOf(ref) {
    let qs = (byBook.get(String(ref))?.quotes || []).slice();
    if (pinnedOnly) qs = qs.filter((q) => q.pinned);
    qs.sort((a, b) => {
      const cmp = (b.created_at || '').localeCompare(a.created_at || '');
      return sort === '최근' ? cmp : -cmp;
    });
    return qs;
  }

  function renderAside() {
    clear(asideEl);
    const fb = filteredBooks();
    if (!selectedId || !fb.some((b) => String(b.id) === selectedId)) {
      selectedId = fb.length ? String(fb[0].id) : null;
    }
    const totalInView = fb.reduce((s, b) => s + quotesOf(b.id).length, 0);

    asideEl.appendChild(el('div', { class: 'aside-head' },
      el('h2', {}, '서재'),
      el('span', { class: 'meta' }, `${fb.length}권 · ${totalInView}개`),
    ));
    asideEl.appendChild(el('div', { class: 'aside-controls' },
      el('button', {
        class: pinnedOnly ? 'filter-pin active' : 'filter-pin',
        onClick: () => { pinnedOnly = !pinnedOnly; renderAside(); renderMain(); },
      },
        el('span', { class: 'star' }, iconEl(pinnedOnly ? 'star-fill' : 'star', { sz: 12 })),
        el('span', {}, '핀만 보기'),
      ),
    ));
    const chips = el('div', { class: 'aside-chips' });
    for (const g of genres) {
      chips.appendChild(el('button', {
        class: g === genre ? 'chip active' : 'chip',
        onClick: () => { genre = g; renderAside(); renderMain(); },
      }, g));
    }
    asideEl.appendChild(chips);

    const list = el('div', { class: 'book-list' });
    if (!fb.length) list.appendChild(el('div', { class: 'aside-empty' }, '조건에 맞는 책이 없습니다'));
    for (const b of fb) {
      const ref = String(b.id);
      const cnt = pinnedOnly ? (byBook.get(ref)?.pinned || 0) : (byBook.get(ref)?.quotes.length || 0);
      list.appendChild(el('div', {
        class: ref === selectedId ? 'book-row selected' : 'book-row',
        onClick: () => { selectedId = ref; renderAside(); renderMain(); },
      },
        el('div', { class: 'cover-slot' }, coverAt(b, 44)),
        el('div', { class: 'book-row-info' },
          el('div', { class: 'book-row-title' }, b.t),
          el('div', { class: 'book-row-byline' }, `${b.a} · ${b.p}`),
        ),
        el('div', { class: 'book-row-count' }, String(cnt)),
      ));
    }
    asideEl.appendChild(list);
  }

  function renderMain() {
    clear(mainCol);
    const b = selectedId ? bookOf(selectedId) : null;
    if (!b) { mainCol.appendChild(el('div', { class: 'empty' }, '왼쪽에서 책을 선택하세요.')); return; }
    const qs = quotesOf(selectedId);

    mainCol.appendChild(el('header', { class: 'library-main-head' },
      el('div', {},
        el('div', { class: 'book-name' }, b.t),
        el('div', { class: 'book-by' }, `${b.a} · ${b.p}`, el('span', { class: 'count' }, `${qs.length}개`)),
      ),
      el('div', { class: 'sort-seg' },
        el('button', { class: sort === '최근' ? 'active' : '', onClick: () => { sort = '최근'; renderMain(); } }, '최근순'),
        el('button', { class: sort === '오래된' ? 'active' : '', onClick: () => { sort = '오래된'; renderMain(); } }, '오래된순'),
      ),
    ));

    const stream = el('div', { class: 'quote-stream' });
    if (!qs.length) stream.appendChild(el('div', { class: 'empty' }, '저장된 어구록이 없습니다.'));
    qs.forEach((q, i) => {
      stream.appendChild(el('article', {
        class: q.pinned ? 'quote-row is-pinned' : 'quote-row',
        onClick: () => openQuoteModal(q),
      },
        el('div', { class: 'idx' }, String(i + 1).padStart(2, '0')),
        el('p', { class: 'body' }, q.text, q.owner_id !== meId ? el('span', { class: 'soyeon' }, '— 소연') : null),
        rowMenuBtn(q),
      ));
    });
    mainCol.appendChild(stream);
  }

  // ─── ⋮ 메뉴 (행 + 모달 공용) ───
  let openPop = null;
  function closePop() {
    if (openPop) { openPop.remove(); openPop = null; document.removeEventListener('click', onDocClick, true); }
  }
  function onDocClick(e) {
    if (openPop && !openPop.contains(e.target) && !e.target.closest('.menu-btn') && !e.target.closest('.modal-menu-btn')) closePop();
  }
  function buildMenuPop(q, onAction) {
    return el('div', { class: 'menu-pop', onClick: (e) => e.stopPropagation() },
      el('button', { onClick: () => { closePop(); onAction?.('pin'); togglePin(q); } },
        iconEl(q.pinned ? 'star-fill' : 'star', { sz: 14 }), q.pinned ? '핀 해제' : '핀 추가'),
      el('button', { onClick: () => { closePop(); copyText(q.text); } }, iconEl('copy', { sz: 14 }), '복사'),
      el('button', { onClick: () => { closePop(); onAction?.('edit'); (ctx.openEdit ? ctx.openEdit(q.id) : ctx.navigate(`/edit/${q.id}`)); } },
        iconEl('edit', { sz: 14 }), '수정'),
      el('hr', {}),
      el('button', { class: 'danger', onClick: () => { closePop(); onAction?.('delete'); (ctx.openDelete ? ctx.openDelete(q.id) : ctx.navigate(`/delete/${q.id}`)); } },
        iconEl('trash', { sz: 14 }), '삭제'),
    );
  }
  function rowMenuBtn(q) {
    const btn = el('button', {
      class: 'menu-btn', 'aria-label': '더보기',
      onClick: (e) => {
        e.stopPropagation();
        if (openPop) { closePop(); return; }
        const pop = buildMenuPop(q);
        btn.parentElement.appendChild(pop); // quote-row(position:relative) 기준
        openPop = pop;
        setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
      },
    }, iconEl('dots-v', { sz: 16 }));
    return btn;
  }

  async function togglePin(q) {
    try {
      await Queries.togglePinQuote(q.id);
      q.pinned = q.pinned ? 0 : 1; // 로컬 미러 → 즉시 반영(전체 remount 회피)
      const g = byBook.get(String(q.book_ref));
      if (g) g.pinned = g.quotes.filter((x) => x.pinned).length;
      renderAside(); renderMain();
    } catch (e) { console.warn('[library] 핀 토글 실패', e?.message || e); }
  }
  function copyText(t) { try { navigator.clipboard?.writeText(t); } catch { /* noop */ } }

  // ─── QuoteModal ───
  let escHandler = null;
  function closeModal(back) {
    closePop();
    if (back && back.isConnected) back.remove();
    if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
  }
  function openQuoteModal(q) {
    const b = bookOf(q.book_ref);
    const cc = commentCounts[q.id] || 0;
    const back = el('div', { class: 'bookv4 bookv4-modal-back', onClick: (e) => { if (e.target === back) closeModal(back); } });

    const tools = el('div', { class: 'modal-tools' },
      el('button', {
        class: 'modal-menu-btn', 'aria-label': '더보기',
        onClick: (e) => {
          e.stopPropagation();
          if (openPop) { closePop(); return; }
          const pop = buildMenuPop(q, (act) => { if (act === 'edit' || act === 'delete') closeModal(back); });
          pop.style.top = '44px'; pop.style.right = '44px';
          modal.appendChild(pop);
          openPop = pop;
          setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
        },
      }, iconEl('dots-v', { sz: 18 })),
      el('button', { class: 'modal-close', 'aria-label': '닫기', onClick: () => closeModal(back) }, iconEl('close', { sz: 16 })),
    );

    const meta = el('div', { class: 'meta' },
      el('span', {}, fmtDateTime(q.created_at)),
      el('span', {}, '·'),
      el('span', {}, `${relTime(q.created_at)} 저장`),
      cc > 0 ? el('span', {}, '·') : null,
      cc > 0 ? el('span', { class: 'clink', onClick: () => { closeModal(back); ctx.navigate(`/thread/${q.book_ref}/${q.id}`); } }, `댓글 ${cc}`) : null,
      q.pinned ? el('span', { class: 'pin' }, '★ 핀') : null,
    );

    const modal = el('div', { class: 'modal', onClick: (e) => e.stopPropagation() },
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
    escHandler = (e) => { if (e.key === 'Escape') closeModal(back); };
    document.addEventListener('keydown', escHandler);
  }

  renderAside();
  renderMain();
}

registerScreen('library', render);
export default render;
