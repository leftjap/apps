/**
 * 통합 검색 모달 (커맨드 팔레트) — 작업지시서 §4 시안 이식 (바닐라, keep 컨벤션).
 *
 *  - openSearchModal(ctx): 현재 화면 위에 뜨는 오버레이(별 라우트 없음). ⌘K/Ctrl+K·탑바 검색 클릭으로 열기.
 *  - 빈 입력 → 둘러보기(최근 검색·책으로 둘러보기·주제·단어·많이 모은 작가).
 *  - 입력 → 결과(필터 칩 전체/책/어구록 + 책 그룹·어구록 그룹). 분야/작가 그룹은 두지 않음(§3 결정).
 *  - 닫기: Esc·스크림·×. 결과 클릭 → 모달 닫고 해당 화면(/book·/thread)으로 이동.
 *  - 데이터 소스 = keep 기존 스토어(Queries.listAllQuotes + books 카탈로그). 추가 모델 없음.
 *  - 표지: cover.js(coverUrl 실표지 or 대표색 플레이스홀더). 하이라이트: <mark> = --highlight.
 */
import { Queries } from '../db/queries.js';
import { bookOf } from '../data/books.js';
import { CURATION } from '../data/curation.js';
import { el, clear } from './dom.js';
import { iconEl } from './icons.js';
import { cover } from './cover.js';
import { renderSnippet, quotePlainText } from './quote-md.js';
import { tokenizeQuery, quoteMatches, bookMatches, contentTerm } from './search-match.js';

const coverAt = (b, width, opts = {}) => cover(b, { scale: width / (b?.w || 130), lift: false, ...opts });
function ownerIdsOf(user) {
  return [user?.id].filter(Boolean);
}

// ─── 최근 검색 (localStorage, 기기 로컬 — 서버 동기화 없음) ────────────────────
const RECENT_KEY = 'book.recentSearch';
function loadRecent() {
  try {
    return (JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') || [])
      .filter((t) => typeof t === 'string' && t.trim()).slice(0, 6);
  } catch { return []; }
}
function pushRecent(term) {
  const t = (term || '').trim();
  if (t.length < 2) return;
  const arr = [t, ...loadRecent().filter((x) => x !== t)].slice(0, 6);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr)); } catch { /* noop */ }
}
function removeRecent(term) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(loadRecent().filter((x) => x !== term))); } catch { /* noop */ }
}

// ─── 모듈 상태 — 단일 인스턴스 + 핫키 바인딩 ────────────────────────────────
let _ctx = null;
let _open = false;
let _hotkeyBound = false;

/** 탑바가 매 렌더 호출 — 현재 ctx 갱신 + ⌘K/Ctrl+K 전역 리스너 1회 바인딩. */
export function bindSearchHotkey(ctx) {
  if (ctx) _ctx = ctx;
  if (_hotkeyBound) return;
  _hotkeyBound = true;
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      openSearchModal(_ctx);
    }
  });
}

/** 검색 모달 열기 (현재 화면 위 오버레이). */
export function openSearchModal(ctx) {
  if (ctx) _ctx = ctx;
  if (_open) return;
  _open = true;

  const owners = ownerIdsOf(_ctx?.user);
  let quotes = null;        // lazy: listAllQuotes
  let query = '';
  let filter = '전체';      // 전체 | 책 | 어구록
  let curIdx = -1;          // 키보드 내비

  // ── 셸 ──
  const back = el('div', { class: 'bookv4 sx-back', onClick: (e) => { if (e.target === back) close(); } });
  const input = el('input', {
    class: 'sxm-input', type: 'text', autocomplete: 'off', spellcheck: 'false',
    'aria-label': '검색', placeholder: '책 · 작가 · 분야 · 단어 · 어구록 검색',
  });
  const clearBtn = el('button', {
    class: 'sxm-clr', 'aria-label': '지우기',
    onClick: () => { input.value = ''; query = ''; input.focus(); rerender(); },
  }, iconEl('close', { sz: 16 }));
  const field = el('div', { class: 'sxm-field' },
    iconEl('search', { sz: 20, st: 1.7, cls: 'ic' }),
    input, clearBtn,
    el('span', { class: 'sxm-esc' }, 'esc'),
  );
  const filters = el('div', { class: 'sxm-filters' });
  const head = el('div', { class: 'sxm-head' }, field, filters);
  const body = el('div', { class: 'sxm-body' });
  const modal = el('div', {
    class: 'sxm', role: 'dialog', 'aria-modal': 'true', 'aria-label': '검색',
    onClick: (e) => e.stopPropagation(),
  }, head, body);
  back.appendChild(modal);
  document.body.appendChild(back);

  function close() {
    if (!_open) return;
    _open = false;
    document.removeEventListener('keydown', onKey, true);
    back.remove();
  }

  // ── 동작 ──
  function runQuery(term) { input.value = term; query = term; input.focus(); rerender(); }
  function navTo(route) { pushRecent(query); close(); (_ctx?.navigate || (() => {}))(route); }

  async function ensureLoaded() {
    if (quotes != null) return;
    try { quotes = await Queries.listAllQuotes(owners); }
    catch (e) { quotes = []; console.warn('[search] 어구록 로드 실패', e?.message || e); }
  }

  function rerender() {
    back.classList.toggle('has-query', !!query.trim());
    if (query.trim()) renderResults(); else renderZero();
  }

  // 책별 어구 수 + 보유 책(어구록 있는 책) — BOOKS 카탈로그 + 알라딘 등록 포함.
  function ownedModel(all) {
    const countByRef = new Map();
    for (const q of all) countByRef.set(String(q.book_ref), (countByRef.get(String(q.book_ref)) || 0) + 1);
    const books = [...countByRef.keys()].map(bookOf).filter(Boolean);
    return { countByRef, books };
  }

  function sxSec(title, bodyEl, right) {
    const r = right
      ? el('span', { class: 'r' + (right.onClick ? ' act' : ''), onClick: right.onClick || undefined },
        right.label, right.onClick ? iconEl('chev', { sz: 12 }) : null)
      : null;
    return el('section', { class: 'sxm-sec' },
      el('div', { class: 'sxm-sec-head' }, el('h2', {}, title), r), bodyEl);
  }
  function sxGroup(title, count, bodyEl, more) {
    return el('section', { class: 'sx-group' },
      el('div', { class: 'sx-group-head' },
        el('h3', {}, title), el('span', { class: 'gct' }, String(count)),
        el('span', { class: 'sp' }),
        more ? el('span', { class: 'more', onClick: more.onClick }, more.label, iconEl('chev', { sz: 12 })) : null),
      bodyEl);
  }

  // ── 둘러보기 (검색어 없음) ──
  async function renderZero() {
    await ensureLoaded();
    if (!_open) return;
    filters.replaceChildren();
    clear(body);
    const all = quotes || [];
    const { countByRef, books } = ownedModel(all);

    if (!books.length && !loadRecent().length) {
      body.appendChild(el('div', { class: 'sx-empty' },
        el('b', {}, '아직 어구록이 없습니다'), '새 어구록을 추가하면 여기에서 바로 찾을 수 있어요.'));
      curIdx = -1;
      return;
    }

    // ① 최근 검색 — 칩 + 개별 ×
    const recents = loadRecent();
    if (recents.length) {
      const chips = el('div', { class: 'sx-chips' });
      for (const term of recents) {
        const x = el('span', {
          class: 'x', 'aria-label': '삭제',
          onClick: (e) => { e.stopPropagation(); removeRecent(term); renderZero(); },
        }, iconEl('close', { sz: 11 }));
        chips.appendChild(el('button', { class: 'sx-chip sx-item', onClick: () => runQuery(term) }, term, x));
      }
      body.appendChild(sxSec('최근 검색', chips));
    }

    // ② 책으로 둘러보기 — 표지 가로 스트립 + 우측 › 이동
    if (books.length) {
      const sorted = [...books].sort(
        (a, b) => (countByRef.get(String(b.id)) || 0) - (countByRef.get(String(a.id)) || 0));
      const shelf = el('div', { class: 'sx-shelf' });
      for (const b of sorted.slice(0, 16)) {
        shelf.appendChild(el('button', { class: 'sx-book sx-item', onClick: () => navTo(`/book/${b.id}`) },
          el('div', { class: 'cv' }, coverAt(b, 68, { lift: true })),
          el('div', { class: 'tt' }, b.t),
          el('div', { class: 'n' }, iconEl('quote', { sz: 11 }), String(countByRef.get(String(b.id)) || 0))));
      }
      const nav = el('button', {
        class: 'sx-shelf-nav', 'aria-label': '더 보기',
        onClick: () => shelf.scrollBy({ left: 260, behavior: 'smooth' }),
      }, iconEl('chev', { sz: 16 }));
      body.appendChild(sxSec('책으로 둘러보기', el('div', { class: 'sx-shelfwrap' }, shelf, nav),
        { label: `서재 ${books.length}권` }));
    }

    // ③ 주제·단어로 찾기 — 큐레이션 클러스터 빈도(주간 LLM). 없으면 생략(§3.3 MVP).
    const topics = (CURATION?.clusters || []).map((c) => ({ w: c.word, n: c.count })).filter((t) => t.w);
    if (topics.length) {
      const maxN = Math.max(...topics.map((t) => t.n || 1));
      const wrap = el('div', { class: 'sx-topics' });
      for (const o of topics) {
        const t = (o.n || 1) / maxN;
        wrap.appendChild(el('button', {
          class: 'sx-topic sx-item', style: { fontSize: `${(13.5 + t * 6).toFixed(1)}px` },
          onClick: () => runQuery(o.w),
        }, el('span', { class: 'h' }, '#'), o.w, o.n != null ? el('span', { class: 'n' }, String(o.n)) : null));
      }
      body.appendChild(sxSec('주제·단어로 찾기', wrap));
    }

    // ④ 많이 모은 작가 — 상위 5
    const authorCount = new Map();
    for (const b of books) authorCount.set(b.a, (authorCount.get(b.a) || 0) + (countByRef.get(String(b.id)) || 0));
    const authors = [...authorCount.entries()].filter(([a]) => a).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (authors.length) {
      const list = el('div', { class: 'sx-list' });
      authors.forEach(([name, n], i) => list.appendChild(el('button', {
        class: 'sx-arow sx-item', onClick: () => navTo(`/author/${encodeURIComponent(name)}`),
      },
        el('span', { class: 'rk' }, String(i + 1).padStart(2, '0')),
        el('span', { class: 'rico' }, iconEl('user', { sz: 14 })),
        el('span', { class: 'nm' }, name),
        el('span', { class: 'ct' }, `${n}개`))));
      body.appendChild(sxSec('많이 모은 작가', list, { label: '전체', onClick: () => navTo('/all/authors') }));
    }

    curIdx = -1;
  }

  // ── 결과 (검색어 있음) ──
  async function renderResults() {
    await ensureLoaded();
    if (!_open) return;
    const all = quotes || [];
    const raw = query.trim();
    const tokens = tokenizeQuery(raw);
    const { countByRef, books } = ownedModel(all);

    // 멀티 토큰 결합 — 각 토큰이 (제목/저자/출판사) 또는 (본문/제목/저자)에 걸리고 전체 AND.
    const matchedBooks = books.filter((b) => bookMatches(b, tokens));
    const matchedQuotes = all.filter((q) => quoteMatches(q.text, bookOf(q.book_ref), tokens));
    const counts = {
      전체: matchedBooks.length + matchedQuotes.length,
      책: matchedBooks.length,
      어구록: matchedQuotes.length,
    };

    // 필터 칩 (전체/책/어구록)
    filters.replaceChildren();
    for (const k of ['전체', '책', '어구록']) {
      filters.appendChild(el('button', {
        class: 'sxm-chip' + (filter === k ? ' on' : ''),
        onClick: () => { filter = k; renderResults(); },
      }, el('span', { class: 'lb' }, k), el('span', { class: 'ct' }, String(counts[k]))));
    }

    clear(body);
    const showBooks = (filter === '전체' || filter === '책') && matchedBooks.length;
    const showQuotes = (filter === '전체' || filter === '어구록') && matchedQuotes.length;

    // 책 그룹
    if (showBooks) {
      const cards = el('div', { class: 'sx-bookcards' });
      for (const b of matchedBooks.slice(0, filter === '책' ? 60 : 6)) {
        cards.appendChild(el('button', { class: 'sx-bookcard sx-item', onClick: () => navTo(`/book/${b.id}`) },
          el('div', { class: 'cv' }, coverAt(b, 46, { lift: true })),
          el('div', { class: 'meta' },
            el('div', { class: 'tt' }, b.t),
            el('div', { class: 'by' }, [b.a, b.p].filter(Boolean).join(' · ')),
            el('div', { class: 'cnt' }, iconEl('quote', { sz: 12 }), `어구록 ${countByRef.get(String(b.id)) || 0}`))));
      }
      body.appendChild(sxGroup('책', matchedBooks.length, cards));
    }

    // 어구록 그룹
    if (showQuotes) {
      const limit = filter === '어구록' ? 60 : 6;
      const list = el('div', { class: 'sx-qlist' });
      for (const q of matchedQuotes.slice(0, limit)) {
        const b = bookOf(q.book_ref);
        const cvw = el('div', { class: 'cvw' },
          b ? coverAt(b, 34, { lift: true }) : el('div', { class: 'cv-ph' }),
          q.pinned ? el('span', { class: 'pinbadge' }, iconEl('star-fill', { sz: 9 })) : null);
        const plain = quotePlainText(q.text);
        const col = el('div', { class: 'body' },
          // KWIC 맥락 스니펫 — 매치어 중심 ~3줄. 멀티 토큰이면 본문에 걸린 토큰 기준.
          el('div', { class: 'q snip' }, ...renderSnippet(plain, contentTerm(plain, tokens))),
          el('div', { class: 'src' },
            b ? el('strong', {}, b.t) : el('span', {}, '(책 미상)'),
            b ? el('span', { class: 'dot' }) : null,
            b ? el('span', {}, b.a) : null));
        // 스니펫 클릭 → 책 상세의 해당 어구로 (전문은 거기서 맥락 속에 읽음).
        list.appendChild(el('button', { class: 'sx-qrow sx-item', onClick: () => navTo(`/book/${q.book_ref}/${q.id}`) }, cvw, col));
      }
      const more = (filter === '전체' && matchedQuotes.length > limit)
        ? { label: '모두 보기', onClick: () => { filter = '어구록'; renderResults(); } } : null;
      body.appendChild(sxGroup('어구록', matchedQuotes.length, list, more));
    }

    if (!showBooks && !showQuotes) {
      body.appendChild(el('div', { class: 'sx-empty' },
        el('b', {}, `'${raw}'에 대한 결과가 없어요`), '다른 단어로 찾아보거나, 주제 칩을 눌러보세요.'));
    }
    curIdx = -1;
  }

  // ── 키보드 내비 (↑/↓/Enter) + Esc ──
  function moveSel(dir) {
    const items = [...body.querySelectorAll('.sx-item')];
    if (!items.length) return;
    if (curIdx >= 0 && items[curIdx]) items[curIdx].classList.remove('sx-cur');
    curIdx = Math.max(0, Math.min(curIdx + dir, items.length - 1));
    const cur = items[curIdx];
    if (cur) { cur.classList.add('sx-cur'); cur.scrollIntoView({ block: 'nearest' }); }
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
    else if (e.key === 'Enter') {
      const cur = body.querySelector('.sx-item.sx-cur');
      if (cur) { e.preventDefault(); cur.click(); }
    }
  }

  // ── 입력 (디바운스 140ms) ──
  let deb = null;
  input.addEventListener('input', () => {
    query = input.value;
    clearTimeout(deb);
    deb = setTimeout(rerender, 140);
  });
  document.addEventListener('keydown', onKey, true);

  // 초기 렌더 + 포커스
  body.appendChild(el('div', { class: 'sx-loading' }, '불러오는 중…'));
  rerender();
  requestAnimationFrame(() => { back.classList.add('show'); input.focus(); });

  return { close };
}

export default { openSearchModal, bindSearchHotkey };
