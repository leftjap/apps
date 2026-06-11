/**
 * 어구록(서재) 탭 — v3 리디자인 (시안 library3.js 이식, SCREEN 02).
 *  - 사이드바(lx-aside): 서재 헤드 + 읽은 책 등록 + 장르 칩 + 책 리스트(표지 36px,
 *    선택=액센트 좌측 바, 핀 별+개수). 「핀만 보기」는 북바 도구로 이동.
 *  - 메인(lx-main): 북바(표지 44px + serif 제목 + 저자·출판사 + 어구록 N · 핀 N +
 *    도구[정렬 토글·핀만·검색]) · 빠른 입력(lx-capture, 클릭→추가 모달 textarea 포커스)
 *    · 발췌 노트(lx-x — 인덱스·시간·작성자 비노출, 행 밀도↑) — 시안 SCREEN 02 결정.
 *  - 행 호버 액션: 핀 토글(본인 소유만) + ⋮ 메뉴. 댓글 있는 행은 우상단 말풍선(클릭→스레드).
 *  - 어구록 클릭 → QuoteModal. 우클릭/롱프레스 → 컨텍스트 메뉴 (기존 유지).
 * 데이터: BOOKS/REGISTRY + Queries.listAllQuotes(owners) 1회 → 책별 집계/필터.
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { bookOf } from '../data/books.js';
import { el, clear } from '../ui/dom.js';
import { iconEl } from '../ui/icons.js';
import { cover } from '../ui/cover.js';
import { topBar } from '../ui/components.js';
import { openSearchModal } from '../ui/search-modal.js';
import { segmentText, applyMark, removeRange, coveredColor } from '../ui/highlight.js';
import { rowMenuButton, buildMenuPop, attachContextMenu, closePop } from '../ui/quote-modal.js';

function ownerIdsOf(user) {
  return [user?.id, Profile.getPartnerUserIdForEmail(user?.email)].filter(Boolean);
}
const genreOf = (b) => {
  const c = (b?.c || '').trim();
  if (!c) return '기타';
  // 알라딘 풀패스("국내도서>자기계발>힐링>...") → 대분류(국내도서 다음). BOOKS 짧은 장르("자기계발")는 그대로.
  if (c.includes('>')) { const p = c.split('>').map((s) => s.trim()).filter(Boolean); return p[1] || p[0] || '기타'; }
  return (c.split('·')[0] || '').trim() || '기타';
};
/** width px 표지 — cover() 는 scale=px/mm 이므로 scale = width / b.w. */
const coverAt = (b, width, opts = {}) => cover(b, { scale: width / (b?.w || 130), lift: false, ...opts });

// 선택 팝오버는 전역 1개 — 재마운트 시 이전 mount 의 document 리스너를 정리한다.
let _selpopEl = null;
let _selpopCleanup = null;

async function render(host, params, ctx) {
  const user = ctx.user;
  const owners = ownerIdsOf(user);
  const meId = user?.id;

  const root = el('div', { class: 'bookv4' });
  const shell = el('div', { class: 'bk' }, topBar({ tab: 'library', ctx }), el('main', {}, root));
  host.appendChild(shell);

  if (!owners.length) {
    root.appendChild(el('div', { class: 'empty' }, '로그인이 필요합니다.'));
    return;
  }

  let all = [];
  let commentCounts = {};
  try { all = await Queries.listAllQuotes(owners); }
  catch (e) { console.warn('[library] 로드 실패', e?.message || e); }
  try { commentCounts = await Queries.countCommentsForQuotes(all.map((q) => q.id)); }
  catch (e) { console.warn('[library] 댓글 수 실패', e?.message || e); }
  let hlMap = {}; // quoteId → marks[] (드래그 형광펜, 로컬 전용)
  try { hlMap = await Queries.getHighlightsFor(all.map((q) => q.id)); }
  catch (e) { console.warn('[library] 하이라이트 로드 실패', e?.message || e); }

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
  // 어구록 있는 모든 book_ref (번들 BOOKS + 알라딘 추가 책 REGISTRY) — bookOf 로 메타 조회. 메타 없으면 제외.
  const booksWithQuotes = [...byBook.keys()].map((ref) => bookOf(ref)).filter(Boolean);
  const genres = ['전체', ...Array.from(new Set(booksWithQuotes.map(genreOf)))];

  let genre = '전체';
  let pinnedOnly = false;
  let sort = '최근';
  let selectedId = params.ref && byBook.has(String(params.ref)) ? String(params.ref) : null;

  const asideEl = el('aside', { class: 'lx-aside' });
  const mainCol = el('div', { class: 'lx-main' });
  root.appendChild(el('div', { class: 'lx-shell' }, asideEl, mainCol));

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

  // 핀 토글 등 변경 후 — 그룹 핀수 갱신 + 재렌더 (전체 remount 회피).
  function onQuoteChange(q) {
    if (q && q.book_ref != null) {
      const g = byBook.get(String(q.book_ref));
      if (g) g.pinned = g.quotes.filter((x) => x.pinned).length;
    }
    renderAside();
    renderMain();
  }

  async function togglePin(q) {
    try {
      await Queries.togglePinQuote(q.id);
      q.pinned = q.pinned ? 0 : 1;
      onQuoteChange(q);
    } catch (e) { console.warn('[library] 핀 토글 실패', e?.message || e); }
  }

  // ── 드래그 형광펜 — 본문 드래그 → 선택 팝오버(스와치 4색 + 댓글 + 복사), 시안 lx-selpop ──
  const articleQuote = new WeakMap(); // .lx-x 엘리먼트 → quote
  if (_selpopCleanup) _selpopCleanup();
  const closeSelPop = () => { if (_selpopEl) { _selpopEl.remove(); _selpopEl = null; } };
  const onDocDown = (ev) => { if (_selpopEl && !_selpopEl.contains(ev.target)) closeSelPop(); };
  const onEsc = (ev) => { if (ev.key === 'Escape') closeSelPop(); };
  document.addEventListener('mousedown', onDocDown, true);
  document.addEventListener('keydown', onEsc, true);
  _selpopCleanup = () => {
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onEsc, true);
    closeSelPop();
  };

  // 컨테이너 기준 텍스트 오프셋 — mark 분할과 무관하게 텍스트 노드 길이 누적.
  function textOffsetIn(container, node, nodeOffset) {
    if (node === container) { // 트리플클릭 등: 자식 인덱스 → 텍스트 오프셋
      let total = 0;
      for (let i = 0; i < nodeOffset; i++) total += container.childNodes[i]?.textContent.length || 0;
      return total;
    }
    let total = 0;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (n === node) return total + nodeOffset;
      total += n.textContent.length;
    }
    return null;
  }

  function readSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const elOf = (n) => (n && n.nodeType === 3 ? n.parentElement : n);
    const txtEl = elOf(range.startContainer)?.closest('.lx-x .txt');
    if (!txtEl || elOf(range.endContainer)?.closest('.lx-x .txt') !== txtEl) return null; // 행 경계 드래그 제외
    const s = textOffsetIn(txtEl, range.startContainer, range.startOffset);
    const e = textOffsetIn(txtEl, range.endContainer, range.endOffset);
    if (s == null || e == null || e <= s) return null;
    const article = txtEl.closest('.lx-x');
    const q = articleQuote.get(article);
    if (!q) return null;
    return { article, q, s, e, rect: range.getBoundingClientRect() };
  }

  function openSelPop({ article, q, s, e, rect }) {
    closeSelPop();
    const marks = hlMap[q.id] || [];
    const active = coveredColor(marks, s, e); // 전 구간 단일 색이면 그 색 활성(재클릭=해제)
    const setMarks = async (next) => {
      hlMap[q.id] = next;
      try { await Queries.setHighlights(q.id, next); }
      catch (err) { console.warn('[library] 하이라이트 저장 실패', err?.message || err); }
      // 형광펜=핀 — 칠해진 어구는 핀, 마지막 형광펜을 지우면 핀 해제 (사용자 결정 2026-06-12).
      // 파트너 어구는 제외: 서버가 본인 행만 수정 허용(RLS) — 형광펜(로컬)만 칠해진다.
      if (!meId || q.owner_id === meId) {
        const shouldPin = next.length > 0 ? 1 : 0;
        if ((q.pinned ? 1 : 0) !== shouldPin) {
          try { await Queries.updateQuote(q.id, { pinned: shouldPin }); q.pinned = shouldPin; }
          catch (err) { console.warn('[library] 핀 동기화 실패', err?.message || err); }
        }
      }
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      closeSelPop();
      onQuoteChange(q); // 사이드바 별·개수 + 북바 핀 카운트까지 갱신
    };
    const sw = (c, name, title) => el('button', {
      class: active === c ? `sw ${name} on` : `sw ${name}`, title,
      onClick: () => setMarks(active === c ? removeRange(marks, { s, e }) : applyMark(marks, { s, e, c })),
    });
    const hasOverlap = marks.some((m) => m.s < e && m.e > s);
    const pop = el('div', { class: 'lx-selpop', onClick: (ev) => ev.stopPropagation(), onMousedown: (ev) => ev.stopPropagation() },
      sw('y', 'yellow', '노랑'), sw('p', 'pink', '분홍'), sw('g', 'green', '초록'), sw('b', 'blue', '파랑'),
      el('span', { class: 'div' }),
      // 겹치는 하이라이트가 있을 때만 — 구간 지우기 (mark 클릭이든 드래그 부분 선택이든 동일)
      hasOverlap ? el('button', { title: '하이라이트 지우기', onClick: () => setMarks(removeRange(marks, { s, e })) }, iconEl('trash', { sz: 15 })) : null,
      el('button', { title: '댓글 달기 — 스레드 열기', onClick: () => { closeSelPop(); ctx.navigate(`/thread/${q.book_ref}/${q.id}`); } }, iconEl('comment', { sz: 15 })),
      el('button', {
        title: '선택 복사',
        onClick: () => { try { navigator.clipboard?.writeText(q.text.slice(s, e)); } catch { /* noop */ } closeSelPop(); },
      }, iconEl('copy', { sz: 15 })),
    );
    const aRect = article.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.round(rect.left - aRect.left))}px`;
    pop.style.top = `${Math.round(rect.bottom - aRect.top + 8)}px`; // 선택 아래 — 꼬리는 위(시안)
    article.appendChild(pop);
    _selpopEl = pop;
  }

  mainCol.addEventListener('mouseup', () => {
    // selection 확정 후 판독 (mouseup 직후엔 미확정)
    setTimeout(() => { const cs = readSelection(); if (cs) openSelPop(cs); }, 0);
  });

  function renderAside() {
    clear(asideEl);
    const fb = filteredBooks();
    if (!selectedId || !fb.some((b) => String(b.id) === selectedId)) {
      selectedId = fb.length ? String(fb[0].id) : null;
    }
    const totalInView = fb.reduce((s, b) => s + quotesOf(b.id).length, 0);

    asideEl.appendChild(el('div', { class: 'lx-aside-head' },
      el('h2', {}, '서재'),
      el('span', { class: 'meta' }, `${fb.length}권 · ${totalInView}개`),
    ));
    asideEl.appendChild(el('button', {
      class: 'lx-addbook',
      onClick: () => { ctx.openAdd && ctx.openAdd(); },
    }, iconEl('plus', { sz: 14 }), '읽은 책 등록'));
    const chips = el('div', { class: 'lx-chips' });
    for (const g of genres) {
      chips.appendChild(el('button', {
        class: g === genre ? 'c on' : 'c',
        onClick: () => { genre = g; renderAside(); renderMain(); },
      }, g));
    }
    asideEl.appendChild(chips);

    const list = el('div', { class: 'lx-blist' });
    if (!fb.length) list.appendChild(el('div', { class: 'aside-empty' }, '조건에 맞는 책이 없습니다'));
    for (const b of fb) {
      const ref = String(b.id);
      const g = byBook.get(ref);
      const cnt = pinnedOnly ? (g?.pinned || 0) : (g?.quotes.length || 0);
      const row = el('div', {
        class: ref === selectedId ? 'lx-brow on' : 'lx-brow',
        onClick: () => { selectedId = ref; renderAside(); renderMain(); },
      },
        coverAt(b, 36),
        el('div', { style: { minWidth: 0 } },
          el('div', { class: 'tt' }, b.t),
          el('div', { class: 'by' }, b.a),
        ),
        el('div', { class: 'n' },
          (g?.pinned || 0) > 0 ? el('span', { class: 'pin' }, iconEl('star-fill', { sz: 9 })) : null,
          String(cnt)),
      );
      // 책 삭제는 책의 어구록이 전부 본인 소유일 때만 노출 — 상대 글은 RLS write 거부(로컬만 변경, reload 시 복원).
      attachContextMenu(row, () => {
        const bookQuotes = byBook.get(ref)?.quotes || [];
        const canDelete = bookQuotes.length > 0 && bookQuotes.every((q) => q.owner_id === meId);
        return el('div', { class: 'menu-pop', onClick: (e) => e.stopPropagation() },
          el('button', { onClick: () => { closePop(); ctx.openAdd && ctx.openAdd({ bookRef: ref }); } }, iconEl('plus', { sz: 14 }), '이 책에 어구록 추가'),
          canDelete ? el('hr', {}) : null,
          canDelete ? el('button', { class: 'danger', onClick: () => { closePop(); ctx.openDeleteBook && ctx.openDeleteBook(ref, bookQuotes.map((q) => q.id)); } }, iconEl('trash', { sz: 14 }), '책 삭제') : null,
        );
      });
      list.appendChild(row);
    }
    asideEl.appendChild(list);
  }

  function renderMain() {
    closeSelPop();
    clear(mainCol);
    const b = selectedId ? bookOf(selectedId) : null;
    if (!b) { mainCol.appendChild(el('div', { class: 'empty' }, '왼쪽에서 책을 선택하세요.')); return; }
    const g = byBook.get(selectedId);
    const qs = quotesOf(selectedId);
    const totalN = g?.quotes.length || 0;
    const pins = g?.pinned || 0;

    mainCol.appendChild(el('header', { class: 'lx-bookbar' },
      el('div', { class: 'cv' }, coverAt(b, 44)),
      el('div', { class: 'info' },
        el('div', { class: 'tt' }, b.t),
        el('div', { class: 'by' }, `${b.a} · ${b.p}`,
          el('span', { class: 'ct' }, ` · 어구록 ${totalN}`, pins ? el('span', { class: 'pin' }, ` · 핀 ${pins}`) : null))),
      el('div', { class: 'tools' },
        el('button', {
          title: '정렬 전환',
          onClick: () => { sort = sort === '최근' ? '오래된' : '최근'; renderMain(); },
        }, sort === '최근' ? '최근순' : '오래된순', iconEl('chevD', { sz: 13 })),
        el('button', {
          class: pinnedOnly ? 'ico on' : 'ico', title: '핀만 보기',
          onClick: () => { pinnedOnly = !pinnedOnly; renderAside(); renderMain(); },
        }, iconEl(pinnedOnly ? 'star-fill' : 'star', { sz: 15 })),
        el('button', { class: 'ico', title: '검색 (⌘K)', onClick: () => openSearchModal(ctx) }, iconEl('search', { sz: 15 })),
      ),
    ));

    // 빠른 입력 — 클릭 → 책 프리셋 추가 모달(textarea 자동 포커스). 힌트 줄 없음(시안).
    mainCol.appendChild(el('div', {
      class: 'lx-capture', role: 'button',
      onClick: () => { ctx.openAdd && ctx.openAdd({ bookRef: selectedId }); },
    },
      el('span', { class: 'q' }, iconEl('quote', { sz: 18 })),
      el('div', { class: 'ph' }, el('span', { class: 'caret' }), '어구를 입력하거나 붙여넣으세요'),
      el('button', { class: 'save' }, '저장'),
    ));

    const list = el('div', { class: 'lx-list' });
    if (!qs.length) {
      list.appendChild(el('div', {
        class: 'empty', style: { cursor: 'pointer' },
        onClick: () => { ctx.openAdd && ctx.openAdd({ bookRef: selectedId }); },
      }, '저장된 어구록이 없습니다. 클릭해 추가하세요.'));
    }
    for (const q of qs) {
      const isMine = !meId || q.owner_id === meId;
      const cN = commentCounts[q.id] || 0;
      const article = el('article', {
        // 행 좌클릭 모달 없음 — 본문은 드래그(형광펜)·mark 클릭(편집) 영역. 수정/삭제는 호버 ⋮·우클릭.
        class: q.pinned ? 'lx-x pinned' : 'lx-x',
      },
        el('div', { class: 'txt' },
          ...(() => {
            let cur = 0;
            return segmentText(q.text, hlMap[q.id] || []).map((sg) => {
              const segS = cur;
              cur += sg.text.length;
              if (!sg.c) return sg.text;
              return el('mark', {
                ...(sg.c === 'y' ? {} : { class: { p: 'pink', g: 'green', b: 'blue' }[sg.c] }),
                // 칠해진 형광펜 클릭 → 같은 팝오버로 색 변경/지우기 (드래그 중에는 드래그 팝오버 우선)
                onClick: (ev) => {
                  const sel = window.getSelection();
                  if (sel && !sel.isCollapsed) return;
                  ev.stopPropagation();
                  openSelPop({
                    article: ev.currentTarget.closest('.lx-x'), q,
                    s: segS, e: segS + sg.text.length,
                    rect: ev.currentTarget.getBoundingClientRect(),
                  });
                },
              }, sg.text);
            });
          })()),
        cN > 0 ? el('button', {
          class: 'lx-memoflag', title: `댓글 ${cN} — 스레드 열기`,
          onClick: (e) => { e.stopPropagation(); ctx.navigate(`/thread/${selectedId}/${q.id}`); },
        }, iconEl('comment', { sz: 14 })) : null,
        el('div', { class: 'lx-acts', onClick: (e) => e.stopPropagation() },
          isMine ? el('button', {
            class: q.pinned ? 'on' : '', title: q.pinned ? '핀 해제' : '핀',
            onClick: () => togglePin(q),
          }, iconEl(q.pinned ? 'star-fill' : 'star', { sz: 15 })) : null,
          rowMenuButton(q, ctx, { onChange: onQuoteChange }),
        ),
      );
      attachContextMenu(article, () => buildMenuPop(q, ctx, { onChange: onQuoteChange }));
      articleQuote.set(article, q);
      list.appendChild(article);
    }
    mainCol.appendChild(list);
  }

  renderAside();
  renderMain();
}

registerScreen('library', render);
export default render;
