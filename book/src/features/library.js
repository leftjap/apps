/**
 * 어구록(서재) 탭 — v4 LibraryTab 이식 (바닐라).
 *  - 사이드바: 플랫 책 리스트(카드 아님) + 「핀만 보기」 토글 + 장르 칩. hover 그레이, 선택 시 좌측 검정 바.
 *  - 메인: 선택 책의 어구록 읽기뷰. 인덱스 번호 + 큰 타이포, 구분선만. 표지·인용부호·태그·날짜 비노출.
 *  - 어구록 클릭 → QuoteModal(공용 ui/quote-modal.js). ⋮ → 핀/복사/수정/삭제.
 * 데이터: BOOKS 상수 + Queries.listAllQuotes(owners) 1회 → 책별 집계/필터. cover() 는 scale=px/mm.
 * D2: 부부 양쪽 표시 + 소연 문장 작은 라벨.
 */
import { registerScreen } from '../app.js';
import { Queries } from '../db/queries.js';
import { Profile } from '../services/profile.js';
import { BOOKS, bookOf } from '../data/books.js';
import { el, clear } from '../ui/dom.js';
import { iconEl } from '../ui/icons.js';
import { cover } from '../ui/cover.js';
import { topBar } from '../ui/components.js';
import { openQuoteModal, rowMenuButton } from '../ui/quote-modal.js';

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

  // 핀 토글 등 변경 후 — 그룹 핀수 갱신 + 재렌더 (전체 remount 회피).
  function onQuoteChange(q) {
    if (q && q.book_ref != null) {
      const g = byBook.get(String(q.book_ref));
      if (g) g.pinned = g.quotes.filter((x) => x.pinned).length;
    }
    renderAside();
    renderMain();
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
        onClick: () => openQuoteModal(q, ctx, { commentCount: commentCounts[q.id] || 0, container: root }),
      },
        el('div', { class: 'idx' }, String(i + 1).padStart(2, '0')),
        el('p', { class: 'body' }, q.text, q.owner_id !== meId ? el('span', { class: 'soyeon' }, '— 소연') : null),
        rowMenuButton(q, ctx, { onChange: onQuoteChange }),
      ));
    });
    mainCol.appendChild(stream);
  }

  renderAside();
  renderMain();
}

registerScreen('library', render);
export default render;
