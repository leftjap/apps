/**
 * 공유 UI 컴포넌트 — v14 design-ref(core/core-v9/v12/v14) 이식 (바닐라).
 * 시각은 v14 그대로. 회귀 금지: kbd·탭바·토스트·세로선·dot·sphere glow 재도입 금지.
 */
import { el } from './dom.js';
import { iconEl } from './icons.js';
import { cover } from './cover.js';
import { Queries } from '../db/queries.js';
import { BOOKS, bookOf } from '../data/books.js';
import { Profile } from '../services/profile.js';
import { CURATION } from '../data/curation.js';

// ─── Btn — 3 size × 4 variant (core-v9 Btn) ─────────────────────────────────
const BTN_SIZES = {
  sm: { h: 28, px: 10, fs: 12, gap: 5, br: 6 },
  md: { h: 34, px: 14, fs: 13, gap: 6, br: 8 },
  lg: { h: 40, px: 18, fs: 14, gap: 7, br: 9 },
};
const BTN_VARIANTS = {
  pri: { bg: 'var(--ink-1)', col: '#fff', bd: 'var(--ink-1)', hov: '#000' },
  sec: { bg: '#fff', col: 'var(--ink-1)', bd: 'var(--line)', hov: 'var(--hover)' },
  ghost: { bg: 'transparent', col: 'var(--ink-2)', bd: 'transparent', hov: 'var(--hover)' },
  warm: { bg: '#c2553a', col: '#fff', bd: '#c2553a', hov: '#a8442d' },
};
export function btn({ label, variant = 'ghost', size = 'md', icon, iconR, onClick, active, title, style } = {}) {
  const s = BTN_SIZES[size] || BTN_SIZES.md;
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.ghost;
  const isIcon = label == null || label === '';
  const node = el('button', {
    class: 'vbtn', title,
    onClick: onClick ? (e) => { e.stopPropagation(); onClick(e); } : undefined,
    style: {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: s.gap,
      height: s.h, width: isIcon ? s.h : 'auto', padding: isIcon ? 0 : `0 ${s.px}px`,
      fontSize: s.fs, fontWeight: 500, color: v.col,
      background: active ? v.hov : v.bg,
      border: `1px solid ${v.bd === 'transparent' ? 'transparent' : v.bd}`,
      borderRadius: s.br, cursor: 'pointer', transition: 'background .12s, border-color .12s',
      letterSpacing: '-.005em', ...(style || {}),
    },
  });
  if (icon) node.appendChild(iconEl(icon, { sz: s.fs + 2, st: 1.7 }));
  if (!isIcon) node.appendChild(document.createTextNode(label));
  if (iconR) node.appendChild(iconEl(iconR, { sz: s.fs + 1, st: 1.7 }));
  return node;
}

// ─── HoverActions (core-v12 HoverActionsV12) ────────────────────────────────
export function hoverActions({ actions = [], forceShow = false } = {}) {
  const wrap = el('div', { class: forceShow ? 'hov-actions force' : 'hov-actions', style: { display: 'inline-flex', gap: 2, flexShrink: 0 } });
  for (const a of actions) {
    const b = el('button', {
      class: 'ico-btn', title: a.label, 'aria-label': a.label,
      onClick: (e) => { e.stopPropagation(); a.onClick && a.onClick(e); },
      style: {
        width: 26, height: 26, borderRadius: 6, display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', background: 'transparent', border: 0, cursor: 'pointer',
        color: a.active ? '#c2553a' : 'var(--ink-3)',
      },
    });
    b.appendChild(iconEl(a.icon, { sz: a.icon === 'pin' ? 14 : 13 }));
    wrap.appendChild(b);
  }
  return wrap;
}

// ─── Count / CountPill (core-v14) ───────────────────────────────────────────
export function count({ n, label, mono = true } = {}) {
  return el('span', { style: { fontSize: 13, color: 'var(--ink-3)' } },
    el('b', { class: mono ? 'mono' : '', style: { color: 'var(--ink-1)', fontWeight: 700 } }, String(n)),
    label ? el('span', { style: { marginLeft: 4 } }, label) : null,
  );
}
export function countPill({ n } = {}) {
  return el('span', { class: 'mono', style: { padding: '4px 10px', borderRadius: 99, background: 'var(--paper)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 600, letterSpacing: '.02em' } }, String(n));
}

// ─── 소연 marker (core.jsx SoyeonMark) ──────────────────────────────────────
export function soyeonMark({ size = 'sm' } = {}) {
  return el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: size === 'xs' ? 10.5 : 11, color: 'var(--ink-3)', fontWeight: 500, letterSpacing: '-.005em' } },
    el('span', { style: { width: 5, height: 5, borderRadius: 50, background: '#9a9080' } }),
    '소연',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Topbar 인라인 검색 — 제로스테이트 + 실시간 결과
//   디자인: "북앱 검색 제로스테이트"(claude.ai/design) 핸드오프 이식.
//   제로스테이트 = 목적지 단축키(lean-forward). 서프라이즈(오늘의 한 줄·AI의 발견)는
//   피드(lean-back) 소관이라 의도적으로 제외 — 역할 분리.
//   신호는 pinned + 빈도집계 + 큐레이션 스냅샷뿐(열람·검색 이력 0). 추가 쿼리 없이
//   포커스 시 로드된 quotes 에서 전부 파생.
// ═══════════════════════════════════════════════════════════════════════════
function searchOwnerIds(user) {
  return [user?.id, Profile.getPartnerUserIdForEmail(user?.email)].filter(Boolean);
}
const topCatOf = (b) => (b?.c ? b.c.split('·')[0].trim() : '기타');

function zsSecHead(iconName, title, right) {
  return el('div', { class: 'zs-head' },
    el('span', { class: 'zs-title' }, iconEl(iconName, { sz: 14, st: 1.9 }), title),
    right || null,
  );
}
function zsGroupLabel(iconName, title, extra) {
  return el('div', { class: 'zs-group' }, iconEl(iconName, { sz: 13, st: 1.9 }), title, extra || null);
}
/** needle 첫 매치만 <mark>. 사용자 텍스트는 createTextNode 로 안전. (짧은 제목·작가용) */
function markInto(node, text, needle) {
  const t = String(text || '');
  const n = (needle || '').trim();
  if (!n) { node.appendChild(document.createTextNode(t)); return node; }
  const i = t.toLowerCase().indexOf(n.toLowerCase());
  if (i < 0) { node.appendChild(document.createTextNode(t)); return node; }
  node.appendChild(document.createTextNode(t.slice(0, i)));
  node.appendChild(el('mark', {}, t.slice(i, i + n.length)));
  node.appendChild(document.createTextNode(t.slice(i + n.length)));
  return node;
}

/** 긴 본문(어구록)용 — 매치 키워드 주변만 발췌 + <mark>. 키워드가 뒤에 있어도 보이게.
 *  매치 없으면(책·분야 필터 등) 앞부분 발췌. */
function snippetInto(node, text, needle, lead = 26) {
  const t = String(text || '');
  const n = (needle || '').trim();
  const i = n ? t.toLowerCase().indexOf(n.toLowerCase()) : -1;
  if (i < 0) { node.appendChild(document.createTextNode(t.slice(0, 150) + (t.length > 150 ? '…' : ''))); return node; }
  const start = Math.max(0, i - lead);
  if (start > 0) node.appendChild(document.createTextNode('…'));
  node.appendChild(document.createTextNode(t.slice(start, i)));
  node.appendChild(el('mark', {}, t.slice(i, i + n.length)));
  const end = Math.min(t.length, i + n.length + lead * 4);
  node.appendChild(document.createTextNode(t.slice(i + n.length, end)));
  if (end < t.length) node.appendChild(document.createTextNode('…'));
  return node;
}

/** book_ref → 책별 어구록 수 맵. */
function countByBook(quotes) {
  const m = new Map();
  for (const r of quotes) m.set(String(r.book_ref), (m.get(String(r.book_ref)) || 0) + 1);
  return m;
}

// ─── 최근 검색 (localStorage, 기기 로컬 전용 — 서버 동기화 없음) ──────────────
// 검색창 유일의 비중복 신호. 다른 화면(피드·통계·서재)은 모두 사전조직 뷰라
// "사용자가 친 쿼리"는 검색창에만 존재. 원 설계의 "이력 0"은 서버 이력 0 으로 해석.
const RECENT_KEY = 'book.recentSearch';
function loadRecentSearches() {
  try { return (JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') || []).filter((t) => typeof t === 'string' && t.trim()).slice(0, 5); }
  catch { return []; }
}
function pushRecentSearch(term) {
  const t = (term || '').trim();
  if (t.length < 2) return;
  const arr = [t, ...loadRecentSearches().filter((x) => x !== t)].slice(0, 5);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr)); } catch { /* noop */ }
}
function removeRecentSearch(term) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(loadRecentSearches().filter((x) => x !== term))); } catch { /* noop */ }
}

/** 검색 문법 파싱: `책:키워드` · `분야:키워드` · `"정확구절"` · 일반. (데이터상 유효한 필터만) */
function parseQuery(raw) {
  const s = (raw || '').trim();
  let m;
  if ((m = s.match(/^"(.+)"$/))) return { mode: 'exact', term: m[1].trim() };
  if ((m = s.match(/^책\s*[:：]\s*(.+)$/))) return { mode: 'book', term: m[1].trim() };
  if ((m = s.match(/^분야\s*[:：]\s*(.+)$/))) return { mode: 'cat', term: m[1].trim() };
  return { mode: 'all', term: s };
}

// ─── 제로스테이트 (포커스 + 빈 입력) — 최근 검색 + 주제·단어 + 문법 힌트 ──────
// 검색창 비중복 신호만 남김: 최근검색(검색창 유일 고유) + 주제·단어 칩(query suggestion).
// 핀(데이터 0개)·책/작가 점프(통계·서재 복제)·장르 칩(통계·서재 복제)은 제거.
function renderZero(panel, quotes, actions) {
  panel.replaceChildren();
  panel.style.display = 'block';
  const all = quotes || [];
  if (!all.length) {
    panel.appendChild(el('div', { class: 'zs-empty' }, el('b', {}, '아직 어구록이 없습니다'), '새 어구록을 추가하면 여기에서 바로 찾을 수 있어요.'));
    return;
  }

  // ① 최근 검색 — 검색창 유일 고유 신호 (localStorage, 기기 로컬)
  const recents = loadRecentSearches();
  if (recents.length) {
    const chips = el('div', { class: 'zs-chips' });
    for (const term of recents) {
      const x = el('span', {
        class: 'zs-recent-x', 'aria-label': '삭제',
        onClick: (e) => { e.stopPropagation(); removeRecentSearch(term); renderZero(panel, quotes, actions); actions.rebind && actions.rebind(); },
      }, iconEl('close', { sz: 11 }));
      chips.appendChild(el('button', { class: 'zs-chip zs-recent zs-item', onClick: () => actions.runQuery(term) }, term, x));
    }
    panel.appendChild(el('div', { class: 'zs-sec' }, zsSecHead('search', '최근 검색'), chips));
  }

  // ② 주제·단어로 바로 찾기 — 큐레이션 클러스터(주간 LLM 정제). query suggestion 역할.
  const words = (CURATION?.clusters || []).map((c) => ({ w: c.word, n: c.count }));
  if (words.length) {
    const chips = el('div', { class: 'zs-chips' });
    for (const o of words) chips.appendChild(el('button', { class: 'zs-chip zs-item', onClick: () => actions.runQuery(o.w) },
      el('span', { class: 'zs-hash' }, '#'), o.w, o.n != null ? el('span', { class: 'zs-ct' }, String(o.n)) : null));
    panel.appendChild(el('div', { class: 'zs-sec' }, zsSecHead('hash', '주제·단어로 바로 찾기'), chips));
  }

  // ③ 검색 문법 힌트 — 검색창 고유(다른 화면은 검색 불가). 데이터상 유효한 필터만.
  panel.appendChild(el('div', { class: 'zs-syntax' },
    el('span', { class: 'zs-syntax-label' }, '좁혀 찾기'),
    el('code', {}, '책:제목'), el('code', {}, '분야:자기계발'), el('code', {}, '"정확한 구절"')));
}

// ─── 실시간 결과 (입력 중) — 책·작가·분야·어구록 그룹 ───────────────────────
function renderResults(panel, raw, quotes, actions) {
  panel.replaceChildren();
  panel.style.display = 'block';
  if (quotes == null) { panel.appendChild(el('div', { class: 'zs-hint' }, '불러오는 중…')); return; }
  const parsed = parseQuery(raw);
  const q = parsed.term;            // 하이라이트 needle
  const lc = q.toLowerCase();
  const all = quotes || [];
  const used = countByBook(all);
  // 책·작가·분야 검색 소스 = 보유 책(어구록 있는 책). BOOKS 번들 + 알라딘 등록(REGISTRY) 모두 포함.
  // (BOOKS 상수만 쓰면 알라딘 추가 책 — 예: 에고라는 적 — 이 누락됨)
  const ownedBooks = [...used.keys()].map((ref) => bookOf(ref)).filter(Boolean);

  let bookMatches = [], authors = [], cats = [], qsAll = [];
  if (parsed.mode === 'book') {
    // 책:키워드 — 책 제목 매칭 + 그 책들의 어구록
    bookMatches = ownedBooks.filter((b) => (b.t || '').toLowerCase().includes(lc)).slice(0, 8);
    const ids = new Set(bookMatches.map((b) => String(b.id)));
    qsAll = all.filter((r) => ids.has(String(r.book_ref)));
  } else if (parsed.mode === 'cat') {
    // 분야:키워드 — 분야 매칭 + 그 분야 어구록
    cats = [...new Set(ownedBooks.map(topCatOf))].filter((c) => c.toLowerCase().includes(lc)).slice(0, 5);
    const cs = new Set(cats);
    qsAll = all.filter((r) => { const b = bookOf(r.book_ref); return b && cs.has(topCatOf(b)); });
  } else if (parsed.mode === 'exact') {
    // "정확구절" — 본문 정확 포함(대소문자 유지)
    qsAll = all.filter((r) => (r.text || '').includes(q));
  } else {
    // 일반 — 책·작가·분야·어구록 통합
    bookMatches = ownedBooks.filter((b) => (b.t || '').toLowerCase().includes(lc)).slice(0, 4);
    authors = [...new Set(ownedBooks.filter((b) => (b.a || '').toLowerCase().includes(lc)).map((b) => b.a))].slice(0, 3);
    cats = [...new Set(ownedBooks.map(topCatOf))].filter((c) => c.toLowerCase().includes(lc)).slice(0, 3);
    qsAll = all.filter((r) => (r.text || '').toLowerCase().includes(lc));
  }
  const qs = qsAll.slice(0, 6);

  // 책
  if (bookMatches.length) {
    panel.appendChild(zsGroupLabel('book', '책'));
    for (const b of bookMatches) {
      const row = bookRow({ b, count: used.get(String(b.id)) || 0, meta: topCatOf(b), onClick: () => actions.navTo(`/book/${b.id}`) });
      row.classList.add('zs-item');
      panel.appendChild(row);
    }
  }
  // 작가
  if (authors.length) {
    panel.appendChild(zsGroupLabel('user', '작가'));
    for (const a of authors) {
      const n = BOOKS.filter((b) => b.a === a).reduce((s, b) => s + (used.get(String(b.id)) || 0), 0);
      panel.appendChild(el('div', { class: 'zs-res zs-item', onClick: () => actions.navTo(`/author/${encodeURIComponent(a)}`) },
        el('span', { class: 'zs-rico' }, iconEl('user', { sz: 15 })),
        el('div', { class: 'zs-rbody' }, markInto(el('div', { class: 'zs-rtitle' }), a, q), el('div', { class: 'zs-rsub' }, `작가 · ${n}개`))));
    }
  }
  // 분야
  if (cats.length) {
    panel.appendChild(zsGroupLabel('layer', '분야'));
    for (const c of cats) {
      const n = all.filter((r) => { const b = bookOf(r.book_ref); return b && topCatOf(b) === c; }).length;
      panel.appendChild(el('div', { class: 'zs-res zs-item', onClick: () => actions.runQuery(c) },
        el('span', { class: 'zs-rico' }, iconEl('layer', { sz: 15 })),
        el('div', { class: 'zs-rbody' }, markInto(el('div', { class: 'zs-rtitle' }), c, q), el('div', { class: 'zs-rsub' }, `분야 · ${n}개`))));
    }
  }
  // 어구록
  if (qs.length) {
    panel.appendChild(zsGroupLabel('quote', '어구록', el('span', { class: 'zs-grp-ct' }, String(qsAll.length))));
    for (const r of qs) {
      const b = bookOf(r.book_ref);
      panel.appendChild(el('div', { class: 'zs-res zs-item', onClick: () => actions.openQuote(r) },
        el('span', { class: 'zs-rico' }, iconEl(r.pinned ? 'pin' : 'quote', { sz: 15 })),
        el('div', { class: 'zs-rbody' },
          snippetInto(el('div', { class: 'zs-rquote' }), r.text, q),
          el('div', { class: 'zs-rmeta' }, `${b ? b.t + ' · ' + b.a : '(책 미상)'}`))));
    }
  }

  if (!panel.children.length) {
    panel.appendChild(el('div', { class: 'zs-empty' }, el('b', {}, `'${q}'에 대한 결과가 없어요`), '다른 단어로 찾아보거나, 주제 칩을 눌러보세요.'));
    return;
  }
  const total = bookMatches.length + authors.length + cats.length + qsAll.length;
  panel.appendChild(el('div', { class: 'zs-foot' }, el('span', { class: 'zs-enter' }, 'Enter'), ` '${q}' 전체 검색 결과 ${total}건`));
}

export function topbarSearch({ ctx } = {}) {
  const wrap = el('div', { class: 'topbar-search-wrap' });
  const bar = el('div', { class: 'topbar-search' }, iconEl('search', { sz: 16 }));
  const input = el('input', { class: 'ts-input', type: 'text', placeholder: '책 · 작가 · 분야 · 단어 · 어구록', autocomplete: 'off', spellcheck: 'false' });
  const clearBtn = el('button', { class: 'ts-clear', 'aria-label': '지우기' }, iconEl('close', { sz: 14 }));
  bar.append(input, clearBtn);
  const panel = el('div', { class: 'topbar-search-panel' });
  wrap.append(bar, panel);

  let quotes = null; // lazy
  let loading = false;
  let items = [];
  let cur = -1;

  const close = () => { panel.style.display = 'none'; wrap.classList.remove('open'); };
  function bindRows() { items = [...panel.querySelectorAll('.zs-item')]; cur = -1; }
  function setCur(i) {
    if (cur >= 0 && items[cur]) items[cur].classList.remove('zs-cur');
    cur = Math.max(-1, Math.min(i, items.length - 1));
    if (cur >= 0 && items[cur]) { items[cur].classList.add('zs-cur'); items[cur].scrollIntoView({ block: 'nearest' }); }
  }
  const render = () => {
    if (quotes == null) { panel.style.display = 'block'; panel.replaceChildren(el('div', { class: 'zs-hint' }, '불러오는 중…')); return; }
    if (input.value.trim()) renderResults(panel, input.value, quotes, actions);
    else renderZero(panel, quotes, actions);
    bindRows();
  };
  const actions = {
    // 검색 결과에서 항목 클릭 = 유용했던 검색 → 최근 검색에 저장(입력값이 있을 때만).
    navTo: (route) => { pushRecentSearch(input.value); close(); input.blur(); (ctx?.navigate || (() => {}))(route); },
    openQuote: (qr) => { pushRecentSearch(input.value); close(); input.blur(); (ctx?.navigate || (() => {}))(`/thread/${qr.book_ref}/${qr.id}`); },
    runQuery: (text) => { input.value = text; wrap.classList.add('has-text'); render(); input.focus(); },
    rebind: () => bindRows(),
  };

  async function ensureLoaded() {
    if (quotes != null || loading) return;
    loading = true;
    try { quotes = await Queries.listAllQuotes(searchOwnerIds(ctx?.user)); }
    catch (e) { quotes = []; console.warn('[search] 로드 실패', e?.message || e); }
    loading = false;
    if (document.activeElement === input) render();
  }

  input.addEventListener('focus', () => { wrap.classList.add('open'); ensureLoaded(); render(); });
  input.addEventListener('blur', () => { if (input.value.trim().length >= 2) pushRecentSearch(input.value); setTimeout(close, 150); });
  input.addEventListener('input', () => { wrap.classList.toggle('has-text', !!input.value); render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; wrap.classList.remove('has-text'); close(); input.blur(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCur(cur + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur(cur - 1); }
    else if (e.key === 'Enter' && cur >= 0 && items[cur]) { e.preventDefault(); items[cur].click(); }
  });
  clearBtn.addEventListener('mousedown', (e) => { e.preventDefault(); input.value = ''; wrap.classList.remove('has-text'); render(); input.focus(); });
  // 칩/✕ 버튼 클릭이 input 의 focus 를 가져가 blur→setTimeout(close) 를 유발 → 결과가 닫히는 버그 방지.
  // clearBtn 과 동일하게 mousedown 기본동작(focus 이동)만 막는다. 위임이라 재렌더에도 유지. (결과 행은 div→focus 안 가짐, 무관)
  panel.addEventListener('mousedown', (e) => { if (e.target.closest('.zs-chip')) e.preventDefault(); });
  return wrap;
}

// ─── TopBar (core-v14 TopBarV14) — 어구록/통계 탭 + 검색 + 새 어구록 ─────────
export function topBar({ tab = 'excerpt', ctx } = {}) {
  const nav = ctx?.navigate || (() => {});
  const brand = el('div', { style: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }, onClick: () => nav('/') },
    el('div', { style: { width: 28, height: 28, borderRadius: 8, background: 'var(--ink-1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, letterSpacing: '-.04em' } }, 'b'),
    el('span', { style: { fontSize: 15.5, fontWeight: 700, letterSpacing: '-.022em' } }, 'book'),
  );
  const tabEl = (name, key, route) => el('span', {
    onClick: () => nav(route),
    style: { padding: '8px 14px', borderRadius: 7, fontSize: 14, fontWeight: tab === key ? 700 : 500, color: tab === key ? 'var(--ink-1)' : 'var(--ink-3)', cursor: 'pointer', background: tab === key ? 'var(--hover)' : 'transparent' },
  }, name);
  const navEl = el('nav', { style: { display: 'flex', gap: 4, marginLeft: 8 } }, tabEl('피드', 'feed', '/'), tabEl('어구록', 'library', '/library'), tabEl('통계', 'stats', '/stats'));
  const search = topbarSearch({ ctx });
  return el('header', {
    class: 'topbar',
    // 콘텐츠와 동일 1240 프레임에 맞춰 내부 정렬 — full-width bg/border 유지하되 항목만 중앙(자식 구조 보존 → 모바일 규칙 유지).
    style: { padding: '16px max(36px, calc((100% - 1240px) / 2 + 36px))', display: 'flex', alignItems: 'center', gap: 22, background: '#fff', borderBottom: '1px solid var(--line-2)', position: 'sticky', top: 0, zIndex: 5 },
  }, brand, navEl, search, btn({ label: '새 어구록', variant: 'pri', size: 'md', icon: 'plus', onClick: () => (ctx?.openAdd ? ctx.openAdd() : nav('/add')) }));
}

// ─── BookRow (core-v14 BookRowV14) ──────────────────────────────────────────
export function bookRow({ b, count: cnt, soyeon, meta, onClick } = {}) {
  const metaRow = el('div', { style: { fontSize: 13, color: 'var(--ink-3)', marginTop: 5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10 } },
    el('span', {}, b.a),
    meta ? el('span', { style: { color: 'var(--ink-4)' } }, '·') : null,
    meta ? el('span', {}, meta) : null,
    soyeon ? soyeonMark({ size: 'xs' }) : null,
  );
  return el('div', {
    class: 'book-row', onClick,
    style: { display: 'flex', alignItems: 'center', gap: 18, padding: '8px 12px', margin: '0 -12px', borderRadius: 10, cursor: onClick ? 'pointer' : 'default' },
  },
    cover(b, { scale: 0.46 }),
    el('div', { style: { flex: 1, minWidth: 0 } },
      el('div', { style: { fontSize: 16, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.3, color: 'var(--ink-1)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, b.t),
      metaRow,
    ),
    cnt != null ? countPill({ n: cnt }) : null,
  );
}

// ─── QuoteRow (core-v14 QuoteRowV14) — 3줄 clamp + 메타 + 호버 액션 ──────────
// q: { text, pinned, timeLabel, commentCount }
export function quoteRow({ q, fontSize = 16, onClick, onPin, onEdit, onMore, demoActions = false } = {}) {
  const cN = q.commentCount || 0;
  const body = el('div', {
    style: { fontSize, lineHeight: 1.65, fontWeight: q.pinned ? 600 : 500, letterSpacing: '-.012em', color: 'var(--ink-1)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontFamily: 'var(--sans)' },
  },
    el('span', { style: { fontFamily: 'var(--serif)', color: 'var(--ink-4)', marginRight: '.1em' } }, '“'),
    q.text,
    el('span', { style: { fontFamily: 'var(--serif)', color: 'var(--ink-4)', marginLeft: '.04em' } }, '”'),
  );
  const meta = el('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 7 } },
    q.pinned ? el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#c2553a', fontWeight: 600 } }, iconEl('pin', { sz: 11.5, st: 1.8 }), '핀') : null,
    el('span', { class: 'mono', style: { fontSize: 11.5, color: 'var(--ink-4)', letterSpacing: '.02em' } }, q.timeLabel || ''),
    cN > 0 ? el('span', { style: { color: 'var(--ink-4)' } }, '·') : null,
    cN > 0 ? el('span', { style: { fontSize: 12, color: 'var(--ink-3)' } }, `댓글 ${cN}`) : null,
    el('div', { style: { flex: 1 } }),
    hoverActions({
      forceShow: demoActions,
      actions: [
        { icon: 'pin', label: '핀', active: q.pinned, onClick: onPin },
        { icon: 'edit', label: '수정', onClick: onEdit },
        { icon: 'dots-v', label: '더보기', onClick: onMore },
      ],
    }),
  );
  return el('div', { class: 'quote-row', onClick, style: { padding: '12px 12px 14px', margin: '0 -12px', borderRadius: 8, cursor: onClick ? 'pointer' : 'default' } }, body, meta);
}

// ─── StreakCard (core-v14 StreakCardV14) — warm wash + 주간 strip ───────────
export function streakCard({ days = 0, longest = 0, dailyAvg = 0, lastEntry = '—', weekHits = [0, 0, 0, 0, 0, 0, 0], todayDow = 4 } = {}) {
  const strip = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 8 } },
    ...weekHits.map((hit, i) => el('div', { style: { height: 4, borderRadius: 99, background: hit ? '#c2553a' : 'var(--paper-2)', opacity: hit ? (i === todayDow ? 1 : 0.85) : 1 } })));
  const dows = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 } },
    ...['월', '화', '수', '목', '금', '토', '일'].map((d, i) => el('span', { class: 'mono', style: { fontSize: 10.5, textAlign: 'center', color: i === todayDow ? 'var(--ink-1)' : 'var(--ink-3)', fontWeight: i === todayDow ? 700 : 500 } }, d)));
  const stats = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 14, paddingTop: 14, borderTop: '1px solid var(--line-2)' } },
    ...[['최장', `${longest}일`], ['평균', `${dailyAvg}/일`], ['마지막', lastEntry]].map(([l, v]) => el('div', {},
      el('div', { style: { fontSize: 10, color: 'var(--ink-3)', marginBottom: 5, fontFamily: 'var(--mono)', letterSpacing: '.06em', textTransform: 'uppercase' } }, l),
      el('div', { style: { fontSize: 14, fontWeight: 600, fontFamily: 'var(--mono)' } }, v),
    )));
  return el('div', { style: { position: 'relative', background: '#fff', borderRadius: 14, padding: '24px 26px 22px', overflow: 'hidden', border: '1px solid rgba(217,119,87,0.07)', boxShadow: '0 1px 2px rgba(20,18,14,0.03), 0 8px 24px -10px rgba(20,18,14,0.08)' } },
    el('div', { style: { position: 'absolute', inset: 0, background: 'radial-gradient(circle 260px at 25% 20%, rgba(217,119,87,0.10) 0%, rgba(217,119,87,0.025) 35%, rgba(217,119,87,0) 70%)', pointerEvents: 'none' } }),
    el('div', { style: { position: 'relative' } },
      el('div', { class: 'upper', style: { marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 } }, '연속', el('span', { style: { width: 5, height: 5, borderRadius: 50, background: '#c2553a' } })),
      el('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 24 } },
        el('span', { style: { fontSize: 60, fontWeight: 700, letterSpacing: '-.035em', lineHeight: 1, fontFamily: 'var(--mono)', color: 'var(--ink-1)' } }, String(days)),
        el('span', { style: { fontSize: 15, color: 'var(--ink-2)', fontWeight: 500 } }, '일째'),
      ),
      el('div', { style: { marginBottom: 22 } }, strip, dows),
      stats,
    ),
  );
}

// ─── ComparisonCard (v14 = core-v10.jsx:283-311) — ↑/↓ 증감·라벨 이번/지난·period·bar h14
export function comparisonCard({ current = 0, prev = 0, unit = '개', topLabel = '어구록', period } = {}) {
  const max = Math.max(current, prev, 1);
  const diff = current - prev;
  const barRow = (lab, val, barColor, valColor, strong) => [
    el('span', { style: { fontSize: 11.5, color: strong ? 'var(--ink-2)' : 'var(--ink-3)', fontWeight: strong ? 600 : 500 } }, lab),
    el('div', { style: { height: 14, borderRadius: 4, background: 'var(--paper)', position: 'relative', overflow: 'hidden' } },
      el('div', { style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(val / max) * 100}%`, background: barColor } })),
    el('span', { class: 'mono', style: { fontSize: 12, fontWeight: strong ? 700 : 400, color: valColor, textAlign: 'right' } }, String(val), el('span', { style: { color: 'var(--ink-3)', fontWeight: 500 } }, unit)),
  ];
  return el('div', {},
    el('div', { style: { display: 'flex', alignItems: 'baseline', marginBottom: 12 } },
      el('span', { class: 'upper' }, topLabel),
      period != null ? el('span', { class: 'mono', style: { fontSize: 10.5, color: 'var(--ink-4)', marginLeft: 8, letterSpacing: '.04em' } }, String(period)) : null,
      el('div', { style: { flex: 1 } }),
      el('span', { style: { fontSize: 11, color: diff > 0 ? '#c2553a' : 'var(--ink-3)', fontFamily: 'var(--mono)', fontWeight: 600 } }, `${diff > 0 ? '↑' : diff < 0 ? '↓' : ''}${Math.abs(diff)}${unit}`),
    ),
    el('div', { style: { display: 'grid', gridTemplateColumns: '40px 1fr 40px', gap: 10, alignItems: 'center', rowGap: 8 } },
      ...barRow('이번', current, 'var(--ink-1)', 'var(--ink-1)', true),
      ...barRow('지난', prev, 'var(--ink-4)', 'var(--ink-3)', false),
    ),
  );
}

// ─── PageTitle / PanelHead (core-v14) ───────────────────────────────────────
export function pageTitle({ upper, title, right, large = false } = {}) {
  return el('div', { class: 'page-title-wrap', style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 36 } },
    el('div', {},
      upper ? el('span', { class: 'upper', style: { fontSize: 11 } }, upper) : null,
      el('h1', { style: { margin: upper ? '10px 0 0' : 0, fontSize: large ? 44 : 36, fontWeight: 700, letterSpacing: '-.032em', lineHeight: 1.05 } }, title),
    ),
    right || null,
  );
}
export function panelHead({ title, sub, right } = {}) {
  return el('div', { style: { display: 'flex', alignItems: 'baseline', marginBottom: 18 } },
    el('h3', { style: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-.018em' } }, title),
    sub != null ? el('span', { class: 'mono', style: { fontSize: 11.5, color: 'var(--ink-4)', marginLeft: 10 } }, String(sub)) : null,
    el('div', { style: { flex: 1 } }),
    right || null,
  );
}

// ─── Crumb (details-v12) — 브레드크럼 ───────────────────────────────────────
// path: [{ label, back, onBack }, { label }, { label }] — 마지막은 강조, back 은 ← 버튼.
export function crumb({ path = [], ctx } = {}) {
  const wrap = el('div', { style: { padding: '10px 36px', display: 'flex', alignItems: 'center', gap: 8, background: '#fff', fontSize: 12.5 } });
  path.forEach((p, i) => {
    if (i > 0) wrap.appendChild(iconEl('chev', { sz: 11, style: 'color:var(--ink-4)' }));
    if (p.back) {
      wrap.appendChild(btn({ label: p.label, variant: 'ghost', size: 'sm', icon: 'arL', onClick: p.onBack || (() => (ctx?.navigate ? ctx.navigate('/') : history.back())) }));
    } else if (i === path.length - 1) {
      wrap.appendChild(el('span', { style: { fontWeight: 600, color: 'var(--ink-1)' } }, p.label));
    } else {
      wrap.appendChild(el('span', { style: { color: 'var(--ink-3)' } }, p.label));
    }
  });
  return wrap;
}

// ─── Modal (core-v14 ModalV14) ──────────────────────────────────────────────
export function modal({ title, subtitle, onClose, children, footer, width = 620 } = {}) {
  const overlay = el('div', {
    style: { position: 'fixed', inset: 0, background: 'rgba(20,18,14,.36)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30 },
    onClick: (e) => { if (e.target === overlay && onClose) onClose(); },
  },
    el('div', { style: { width, maxHeight: '88%', background: '#fff', borderRadius: 16, boxShadow: '0 4px 12px -2px rgba(20,18,14,.10), 0 24px 60px -16px rgba(20,18,14,.32)', display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
      el('div', { style: { padding: '22px 26px 18px', display: 'flex', alignItems: 'flex-start', borderBottom: '1px solid var(--line-2)' } },
        el('div', { style: { flex: 1, minWidth: 0 } },
          el('h2', { style: { margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-.018em' } }, title),
          subtitle ? el('div', { style: { fontSize: 12.5, color: 'var(--ink-3)', marginTop: 5 } }, subtitle) : null,
        ),
        btn({ icon: 'close', variant: 'ghost', size: 'sm', onClick: onClose, title: '닫기', style: { color: 'var(--ink-3)' } }),
      ),
      el('div', { style: { flex: 1, overflow: 'auto' } }, ...(Array.isArray(children) ? children : [children])),
      footer ? el('div', { style: { padding: '14px 26px', borderTop: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', gap: 10, background: '#fafaf7' } }, ...(Array.isArray(footer) ? footer : [footer])) : null,
    ),
  );
  return overlay;
}

// ─── screenShell — .bk > TopBar + main (각 화면 공통 셸) ─────────────────────
export function screenShell({ tab = 'excerpt', ctx, mainStyle, crumbEl, children } = {}) {
  const kids = Array.isArray(children) ? children : [children];
  const main = el('main', { style: mainStyle || {} }, ...kids);
  const parts = [topBar({ tab, ctx })];
  if (crumbEl) parts.push(crumbEl);
  parts.push(main);
  return el('div', { class: 'bk' }, ...parts);
}

export default {
  btn, hoverActions, count, countPill, soyeonMark, topBar, bookRow, quoteRow,
  streakCard, comparisonCard, pageTitle, panelHead, crumb, modal, screenShell,
};
