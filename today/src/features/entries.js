/**
 * Entries integration layer (Wave 11.5.2b — DOM 실 데이터 패치).
 *
 * 책임:
 *  - mocks 의 카테고리 active 변경 감지 (MutationObserver)
 *  - 변경 시 listEntries(kind) 호출 + #recentsList / #mainView 덮어쓰기
 *  - 800ms debounce util (자동저장용 — Wave 11.5.2b 본격 사용 — Step 3)
 *  - mocks IIFE 접근용 `window.todayEntries` 노출
 *
 * Clean Room 정합:
 *  - mocks/today-mac.html 은 불변. SPA layer 가 mocks 출력 (#recentsList, #mainView) 을 덮어씀.
 *  - rows.length === 0 시엔 mocks FIXTURE 그대로 보존 (placeholder 유지).
 */
import { Queries } from '../db/queries.js';
import { Sync } from '../db/sync.js';
import { supabase } from '../services/supabase.js';

let _categoryObserver = null;
let _onCategoryChange = null;
let _currentUser = null;
/** mount 직후 deep link 글 로드가 진행 중인 동안만 true — handleCategoryActive 의 첫 글 자동 표시 차단 위해. */
let _deepLinkInProgress = false;
let _realtimeUnregister = null;
const _dirtyArticles = new WeakSet();
// Wave 11.X — IME composition 추적 (한글 조합 중 외부 reload/DOM 재패치 차단).
// mainView 는 단일 article 만 노출하므로 모듈 레벨 단일 변수로 충분.
let _composingArticle = null;
// Wave 11.X-2 — 자기 push 의 Realtime self-echo 무시 (composition 끝난 후 dirty 해제 micro-window 의 caret 점프 회귀 차단).
// saveArticle 직후 row.updated_at 기록 → handleRealtimeEntryChange 에서 동일 timestamp echo skip.
const _selfPushTimestamps = new Map();
// 자기 save 진행 중 표시 — await 전에 마킹해 REST 응답보다 빠른 echo 도 차단 (timestamp 필터의 race window 보완).
const _selfSaveInflight = new Map(); // id → count

// ───────────────────────────────────────────────────────────────────────────
// debounce util — 800ms (spec §3 line 65-66 + §8 line 329)
// ───────────────────────────────────────────────────────────────────────────

export function debounce(fn, ms = 800) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 어댑터 — Dexie row → mocks doc 형식 (#recentsList HTML 패턴 정합)
// mocks renderRecents L3778-3783 / renderDoc L3808-3823
// ───────────────────────────────────────────────────────────────────────────

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function countWords(html) {
  if (!html) return 0;
  const text = String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

/**
 * ISO timestamp → "방금 저장됨" / "N분 전 저장됨" / "HH:MM 자동 저장됨" / "M월 D일 자동 저장됨"
 * mocks FIXTURE 의 meta 패턴 답습 (예: '14:22 자동 저장됨', '4월 21일 자동 저장됨').
 */
export function formatSavedTime(iso, now = new Date()) {
  if (!iso) return '저장 대기';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '저장 대기';
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return '방금 저장됨';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전 저장됨`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm} 자동 저장됨`;
  }
  return `${d.getMonth() + 1}월 ${d.getDate()}일 자동 저장됨`;
}

/**
 * Dexie row → meta HTML (단어수 + 원고지 매수).
 * 자동저장 시각 라벨은 행 단순화 위해 제거 (사용자 요청 2026-05-12). 저장 동작 자체는 유지.
 */
export function buildMockMeta(row) {
  const wc = countWords(row?.content);
  const sheets = sheetCount(row?.content);
  return `${wc}단어<span class="sep">·</span>원고지 ${sheets}매`;
}

/**
 * 카테고리별 본인 글 누적 번호 (사용자 요청 2026-05-12).
 *  - navi/soyoun_navi 그룹: kind === 'navi' && owner_id === userId (소연 글 제외)
 *  - 그 외 kind: kind 일치 + owner_id === userId
 *  - 정렬: created_at asc (옛 글 #1, 최신 글 #N)
 *  - allRows 에 없는 row (새 글 작성 중 아직 add 전) → max + 1
 *  - 삭제 시 번호 변동 허용 (동적 계산, DB 컬럼 없음)
 */
export function computeEntryNumber(rowId, kind, allRows, userId) {
  if (!userId || !Array.isArray(allRows)) return null;
  // 1차: DB 영구 일련번호 (0023 마이그). 안정 → deep link `#/navi/79` 가 영원히 같은 글.
  const row = allRows.find((r) => r.id === rowId);
  if (row && row.kind_number != null) return row.kind_number;
  // 2차 (fallback): 옛 row 가 kind_number 없는 경우 (sync 전 등) — 동적 계산.
  const isNaviGroup = kind === 'navi' || kind === 'soyoun_navi';
  const filtered = allRows.filter((r) => {
    if (r.deleted_at) return false;
    if (r.owner_id !== userId) return false;
    return isNaviGroup ? r.kind === 'navi' : r.kind === kind;
  });
  const sorted = filtered.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  const idx = sorted.findIndex((r) => r.id === rowId);
  if (idx === -1) return sorted.length + 1;
  return idx + 1;
}

/** Dexie row → mocks doc 형식 (id / title / meta). share / number / body 는 향후 wave. */
export function rowToMockDoc(row, now = new Date()) {
  return {
    id: row.id,
    title: row.title || '제목 없음',
    meta: buildMockMeta(row, now),
    updated_at: row.updated_at,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// DOM 패치 — Recents 사이드바
// ───────────────────────────────────────────────────────────────────────────

/**
 * #recentsList 를 Dexie rows 로 재구성. rows.length === 0 시 no-op (mocks fixture 보존).
 * mocks renderRecents (today-mac.html L3778-3783) 의 HTML 패턴 답습.
 */
// 리센츠 인라인 댓글 카운트 아이콘 — 시안 HTML 직접 인용 (Lucide message-circle, 11×11 fill).
// 시안 src: shared.jsx:1084 `<svg width=11 height=11 viewBox=0 0 24 24 fill=currentColor>`.
const CHAT_BUBBLE_SVG = '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" stroke="none" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.3A8 8 0 1 1 21 12z"/></svg>';

export async function renderRecentsFromRows(kind, rows, doc = document) {
  const list = doc.getElementById('recentsList');
  if (!list) return false;
  if (!rows || !rows.length) return false;
  const userId = _currentUser?.id || null;
  const visible = rows.slice(0, 30);
  // 댓글 수 batch 조회 — Dexie 1회 (N+1 회피).
  let countMap = new Map();
  try {
    countMap = await Queries.countCommentsByEntries(visible.map((r) => r.id));
  } catch (_) {
    /* Dexie 미초기화 등 — 카운트 생략하고 렌더 계속 */
  }
  const docsHtml = visible.map((r) => {
    const id = escapeHtml(r.id);
    const title = escapeHtml(r.title || '제목 없음');
    const isPartner = r.owner_id && userId && r.owner_id !== userId;
    const shareLabel = isPartner ? USER_ID_TO_DISPLAY_NAME[r.owner_id] || '' : '';
    const labelHtml = shareLabel ? `<span class="recent-share">${escapeHtml(shareLabel)}</span>` : '';
    const n = countMap.get(r.id) || 0;
    const countHtml = n > 0
      ? `<span class="recent-comment-count">${CHAT_BUBBLE_SVG}${n}</span>`
      : '';
    return `<div class="sb__item sb__item--recent" data-doc-id="${id}"><span class="sb__item__group"><span class="sb__item__title">${title}</span>${countHtml}</span>${labelHtml}</div>`;
  }).join('');
  list.innerHTML = docsHtml;
  ensureRecentsMore(kind, doc);
  return true;
}

// spec §3.3.1 — 리센츠 30건 직하단 "전체 보기 →" 진입점 (글쓰기 4종 한정).
// 클릭 동작은 §5.0 전체 목록 뷰 wiring 단계에서 추가.
const WRITING_KINDS_FOR_LIST = Object.freeze(['navi', 'fiction', 'blog', 'memo']);

export function ensureRecentsMore(kind, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return false;
  const list = doc.getElementById('recentsList');
  if (!list) return false;
  const group = list.parentElement;
  if (!group) return false;
  const existing = group.querySelector(':scope > .sb__recents-more');
  const shouldShow = WRITING_KINDS_FOR_LIST.includes(kind) && list.children.length > 0;
  if (!shouldShow) {
    if (existing) existing.remove();
    return false;
  }
  if (existing) return true;
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'sb__recents-more';
  btn.dataset.action = 'show-all-list';
  btn.textContent = '전체 보기 →';
  list.insertAdjacentElement('afterend', btn);
  return true;
}

export function removeRecentsMore(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || typeof doc.querySelector !== 'function') return false;
  const btn = doc.querySelector('.sb__group--recents > .sb__recents-more');
  if (!btn) return false;
  btn.remove();
  return true;
}

/**
 * #mainView 를 Dexie row 로 재구성 — `<article class="doc">` 패턴 (mocks renderDoc L3816-3822 답습).
 * 차이: title h1 / body 모두 contenteditable + `data-entry-id` 어트리뷰트 (자동저장 wiring 식별자).
 */
export function isReadOnlyRow(row, userId = _currentUser?.id) {
  if (!row || !userId) return false;
  return !!(row.owner_id && row.owner_id !== userId);
}

export function renderDocFromRow(row, doc = document) {
  const view = doc.getElementById('mainView');
  if (!view || !row) return false;
  const titleText = row.title || '';
  const readOnly = isReadOnlyRow(row);
  const partnerName = readOnly ? (USER_ID_TO_DISPLAY_NAME[row.owner_id] || '소연') : '';
  const meta = readOnly
    ? `${escapeHtml(partnerName)}<span class="sep">·</span>${buildMockMeta(row)}`
    : buildMockMeta(row);
  // Wave 11.6.6 — placeholder 는 CSS `:empty::before` (injectEditorStyles) 로만 표시.
  // 본문 텍스트로 inject 시 typing 시 placeholder 가 사용자 입력과 섞여 partial 저장 → 텍스트 흐름 손상.
  const bodyInner = row.content && row.content.length ? row.content : '';
  // 회귀 5 진짜 원인 fix — 동일 entry rerender 시 article 통째 교체 대신 in-place patch.
  // 통째 innerHTML 교체 시 .doc__comments 같은 자식 노드 모두 제거 → 댓글 영역 사라짐.
  // dirty 상태 (사용자 입력 중) 시 h1/body 갱신 skip — 사용자 입력 보존.
  const existing = view.querySelector?.('article.doc');
  if (existing && existing.dataset?.entryId === row.id) {
    // Wave 11.X — IME composition 중에도 외부 reload 시 body 재패치 차단 (caret 보존).
    const locked = isEditorDirty(existing) || isComposing(existing);
    const h1 = existing.querySelector?.('.doc__h1');
    const metaEl = existing.querySelector?.('.doc__meta');
    const body = existing.querySelector?.('.doc__body');
    if (h1 && !locked) {
      // Wave 11.X-3 — 같은 텍스트 시 textContent set skip (textNode 교체 차단 → caret 보존).
      if (h1.textContent !== titleText) h1.textContent = titleText;
      if (readOnly) h1.removeAttribute?.('contenteditable');
      else h1.setAttribute?.('contenteditable', '');
    }
    if (metaEl && metaEl.innerHTML !== meta) metaEl.innerHTML = meta;
    if (body && !locked) {
      // Wave 11.X-3 — 같은 content 면 set skip (self-echo 등 동일 reload caret 점프 차단).
      // 다른 content 면 caret offset save → set → restore (WebKit textNode 교체 시 caret 보존).
      if (body.innerHTML !== bodyInner) {
        const win = body.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
        const savedOffset = win ? getCaretOffset(body, win) : null;
        body.innerHTML = bodyInner;
        if (savedOffset != null && win) setCaretOffset(body, savedOffset, win);
      }
      if (readOnly) body.removeAttribute?.('contenteditable');
      else body.setAttribute?.('contenteditable', '');
    }
    if (existing.dataset.readOnly !== (readOnly ? '1' : '')) {
      existing.dataset.readOnly = readOnly ? '1' : '';
    }
  } else {
    const editableAttr = readOnly ? '' : 'contenteditable';
    view.innerHTML = `
      <article class="doc" data-entry-id="${escapeHtml(row.id)}" data-read-only="${readOnly ? '1' : ''}">
        <h1 class="doc__h1" ${editableAttr} spellcheck="false" data-empty-title="제목 없음">${escapeHtml(titleText)}</h1>
        <div class="doc__meta">${meta}</div>
        <div class="doc__body" ${editableAttr} spellcheck="false">${bodyInner}</div>
      </article>
    `;
  }
  syncShareToggleFromRow(row, doc);
  // 파트너 공유 글 — ⋯ 메뉴 wrap (article 외부, top-actions 영역) 도 readOnly 동기화
  const moreWrap = doc.querySelector?.('.doc-more-wrap');
  if (moreWrap) moreWrap.dataset.readOnly = readOnly ? '1' : '';
  updateCrumbEntryNumber(row, doc);
  updateDeepLinkUrl(row);
  return true;
}

/** 본인 글 열림 시 URL 을 `#/kind/kind_number` 로 갱신 (history.replaceState — back stack 오염 없이).
 *  - partner 글: URL 변경 안 함 (현재 hash 유지). 본인 카운트 대상 아님 → deep link 시퀀스 부재.
 *  - kind_number 없는 row (sync 전 등): skip.
 *  - kind 외 (admin/expense 등): skip.
 */
function updateDeepLinkUrl(row) {
  if (typeof window === 'undefined' || !row) return;
  const userId = _currentUser?.id;
  if (!userId) return;
  const kind = row.kind === 'soyoun_navi' ? 'navi' : row.kind;
  if (!['navi', 'fiction', 'blog', 'memo'].includes(kind)) return;
  const num = row.kind_number;
  if (num == null) return;
  let target;
  if (row.owner_id === userId) {
    target = `#/${kind}/${num}`;
  } else {
    // partner 글 — owner slug 추가. 모르는 owner 면 URL 변경 안 함.
    const slug = USER_ID_TO_SLUG[row.owner_id];
    if (!slug) return;
    target = `#/${kind}/${slug}/${num}`;
  }
  if (location.hash !== target) history.replaceState(null, '', target);
}

/** crumb 의 `#NNNN` 을 본인 카테고리 누적 번호로 동적 갱신 (fire-and-forget).
 *  파트너 글 (owner !== leftjap) 은 본인 카운트 대상 아님 → `.crumb__num` 자체 hide. */
function updateCrumbEntryNumber(row, doc) {
  const numEl = doc.querySelector?.('.crumb__num-val');
  const numContainer = doc.querySelector?.('.crumb__num');
  if (!numEl || !numContainer) return;
  const userId = _currentUser?.id;
  if (isReadOnlyRow(row, userId)) {
    numContainer.classList.add('is-empty');
    return;
  }
  numContainer.classList.remove('is-empty');
  const db = globalThis.todayDB;
  if (!userId || !db?.entries) return;
  db.entries.toArray().then((all) => {
    const n = computeEntryNumber(row.id, row.kind, all, userId);
    if (n != null) numEl.textContent = String(n);
  }).catch(() => {});
}

/**
 * mocks 의 `.share` 토글 (top-actions__navi 안, today-mac.html L3226) 클래스 동기화.
 * row.is_shared truthy → `.share` (default ON). falsy → `.share--off` 추가.
 * spec L405-415 의 is_shared insert/update trigger 와 정합 — 토글 시 Realtime 으로 파트너에게 알림.
 */
export function syncShareToggleFromRow(row, doc = document) {
  const el = doc.querySelector?.('.share');
  if (!el) return false;
  el.classList.toggle('share--off', !row?.is_shared);
  // 파트너 글은 작성자만 공유 결정 가능 → 토글 숨김.
  el.classList.toggle('share--readonly', isReadOnlyRow(row));
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// 카테고리 active 감지
// ───────────────────────────────────────────────────────────────────────────

function observeCategoryChange(cb) {
  _onCategoryChange = cb;
  if (_categoryObserver) _categoryObserver.disconnect();
  const items = document.querySelectorAll('.sb__item[data-category]');
  if (!items.length) return;
  _categoryObserver = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
      const el = m.target;
      if (el.classList.contains('sb__item--active')) {
        cb(el.dataset.category);
      }
    }
  });
  items.forEach((el) => _categoryObserver.observe(el, { attributes: true }));
  const initial = document.querySelector('.sb__item[data-category].sb__item--active');
  if (initial) cb(initial.dataset.category);
}

/** 카테고리 진입 후 entries 로드 + DOM 덮어쓰기. expense 는 Wave 11.6 별 처리. */
// ───────────────────────────────────────────────────────────────────────────
// 카테고리 active — navi 탭은 본인 navi + 파트너 navi(is_shared) 합집합.
// spec §4 L131 — 세그먼트 UI 폐기, recents 합집합 + 라벨로 작성자 구분.
// 본인 owned navi kind = 이메일 매핑 (leftjap='navi', soyoun='soyoun_navi').
// 파트너 = 본인의 반대편 kind 중 is_shared=true.
// ───────────────────────────────────────────────────────────────────────────

const OWNED_NAVI_BY_EMAIL = Object.freeze({
  'leftjap@gmail.com': 'navi',
  'causencompany@gmail.com': 'navi',
  'soyoun312@gmail.com': 'soyoun_navi',
});

export const KIND_LABEL_PARTNER = Object.freeze({
  navi: '지오',
  soyoun_navi: '소연',
});

// 클로드 봇 — AI 자동 댓글 작성자 (auth.users: claude-bot@today.local).
export const CLAUDE_USER_ID = 'f74a3d8a-f449-4c25-82d1-509dc70a9988';

// 2026-05-05 — owner_id 기반 라벨 (kind 무관). 옛 Keep partner-sync 잔흔 정확 라벨.
export const USER_ID_TO_DISPLAY_NAME = Object.freeze({
  '7bae5645-61c6-4476-9ff2-4c30a72812ff': '지오',
  '9f0408c0-008b-440c-a938-2effd9cb3bfd': '지오',
  'aeafd9a7-4094-4e7c-a621-188d6b2e336d': '소연',
  [CLAUDE_USER_ID]: '클로드',
});

// partner 글 deep link URL slug (ASCII). 본인 글은 slug 없이 `#/navi/5`,
// partner 글은 `#/navi/soyoun/5` 형식 — 누가 보든 같은 글 가리킴 (절대 식별).
export const USER_ID_TO_SLUG = Object.freeze({
  '7bae5645-61c6-4476-9ff2-4c30a72812ff': 'gio',
  '9f0408c0-008b-440c-a938-2effd9cb3bfd': 'gio',
  'aeafd9a7-4094-4e7c-a621-188d6b2e336d': 'soyoun',
});
// slug → canonical owner_id (역방향. gio 는 production leftjap UUID 로 정규화).
export const SLUG_TO_USER_ID = Object.freeze({
  gio: '7bae5645-61c6-4476-9ff2-4c30a72812ff',
  soyoun: 'aeafd9a7-4094-4e7c-a621-188d6b2e336d',
});

export function getOwnNaviKind(email) {
  if (!email) return 'navi';
  return OWNED_NAVI_BY_EMAIL[email] || 'navi';
}

// 단위 테스트 전용 — production 코드는 mountEntriesView 만 _currentUser set.
export function __setCurrentUserForTest(user) {
  _currentUser = user || null;
}

async function fetchEntriesForCategory(kind) {
  if (kind === 'navi' || kind === 'soyoun_navi') {
    // 2026-05-05 — owner_id 기반 분류 (kind 무관). spec L278-282 RLS 와 동일 의미.
    // 옛 Keep partner-sync 잔흔 (예: owner=소연 + kind='navi') 도 partner 글로 정상 분류.
    // 정렬: created_at desc — 백필 SQL 의 updated_at=now() 동시 갱신 부작용 회피 + 발행 시점 자연 통합.
    const userId = _currentUser?.id || null;
    const all = [
      ...(await Queries.listEntries('navi')),
      ...(await Queries.listEntries('soyoun_navi')),
    ];
    const filtered = all.filter((r) => r.owner_id === userId || r.is_shared);
    return filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }
  return await Queries.listEntries(kind);
}

/**
 * Wave 11.5.11 — fixture recents/mainView 비우기 (사용자 인증 후 데이터 0건 시).
 * mocks fixture 가 사용자 데모용이므로 본인 데이터 0건일 때 시각적으로 노출 안 함.
 */
export function clearRecentsList(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return false;
  const list = doc.getElementById('recentsList');
  if (!list) return false;
  list.innerHTML = '';
  removeRecentsMore(doc);
  return true;
}

export function clearMainViewEmpty(label, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return false;
  const view = doc.getElementById('mainView');
  if (!view) return false;
  view.innerHTML = `<div class="empty-state"><h2 class="empty-state__heading">${escapeHtml(label || '글쓰기')}을(를) 시작하세요</h2></div>`;
  return true;
}

const KIND_LABEL_KO = Object.freeze({
  navi: '오늘의 네비',
  soyoun_navi: '오늘의 네비',
  fiction: '단편',
  blog: '블로그',
  memo: '메모',
});

async function handleCategoryActive(kind) {
  // spec §5.0.4 — 카테고리 전환 시 list 모드 자동 'article' 복귀
  if (_activeMainView === 'list') exitListView();
  if (kind === 'expense') {
    removeRecentsMore();
    return;
  }
  if (!Queries.ENTRY_KINDS.includes(kind)) return;
  try {
    const list = await fetchEntriesForCategory(kind);
    console.info(`[entries] kind=${kind} count=${list.length}`);
    if (list.length > 0) {
      await renderRecentsFromRows(kind, list);
      // mount 직후 deep link 로드 진행 중이면 첫 글 자동 표시 skip — 라우터가 deep link 글 로드 담당.
      // _deepLinkInProgress 가 false (사용자 카테고리 click 등) 면 항상 첫 글 표시.
      if (!_deepLinkInProgress) renderDocFromRow(list[0]);
    } else {
      // Wave 11.5.11 — fixture 데이터 노출 차단 (인증 후 본인 데이터만)
      clearRecentsList();
      clearMainViewEmpty(KIND_LABEL_KO[kind] || kind);
    }
  } catch (e) {
    console.warn('[entries] listEntries 실패', e.message);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Recents 클릭 위임 — data-doc-id 매치 시 Dexie getEntry → renderDocFromRow.
// mocks IIFE 의 위임 (L4706 FIXTURE.docs.find) 과 공존: Dexie row 의 id 는 UUID,
// FIXTURE id 는 'navi-1' 류 — 충돌 0. 양쪽 listener 는 자기 도메인만 처리.
// ───────────────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────
// 에디터 placeholder CSS 주입 (Wave 11.5.2b hotfix)
// mocks 의 .doc__h1 은 `:empty::before` 패턴 보유 (today-mac.html L510-516).
// .doc__body 는 SPA 가 추가한 클래스 — mocks 정의 없음. 빈 contenteditable 시 hint 부재.
// ───────────────────────────────────────────────────────────────────────────

function injectEditorStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('today-editor-styles')) return;
  const style = document.createElement('style');
  style.id = 'today-editor-styles';
  style.textContent = `
    .doc__body[contenteditable]:empty::before {
      content: '본문을 입력하세요…';
      color: var(--ink-4, #b5ad9e);
      pointer-events: none;
    }
    .doc__h1[contenteditable]:focus,
    .doc__body[contenteditable]:focus {
      outline: none;
    }
    /* Wave 11.7.1 — 본문 삽입 이미지 max-width: 100% (잘림 차단) + 비율 유지 + 시각 마진.
       iOS 롱프레스 callout/preview 차단해 커스텀 컨텍스트 메뉴 timer 살림. */
    .doc .doc__body img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 16px 0;
      border-radius: 8px;
      cursor: default;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
    }
    /* Wave 11.7.2 — 클릭으로 range selectNode 시 selection 시각 (브라우저 default 외 명시 outline) */
    .doc .doc__body img:focus,
    .doc .doc__body img.is-selected {
      outline: 2px solid var(--crail-base, #d97757);
      outline-offset: 2px;
    }
    /* 이미지 컨텍스트 메뉴 — DESIGN.md popover 토큰 */
    .doc-img-ctxmenu {
      position: fixed;
      display: none;
      z-index: 200;
      background: var(--sidebar, #fff);
      border: 1px solid var(--line, #e8e4dc);
      border-radius: var(--r-md, 12px);
      box-shadow: var(--shadow-pop,
        0 1px 0 rgba(20,18,14,0.03),
        0 8px 16px -10px rgba(20,18,14,0.18),
        0 24px 48px -24px rgba(20,18,14,0.24));
      padding: var(--sp-1, 4px);
      min-width: 140px;
      font-family: var(--font-sans, 'Pretendard', -apple-system, sans-serif);
    }
    .doc-img-ctxmenu.open { display: flex; flex-direction: column; }
    .doc-img-ctxmenu button {
      appearance: none;
      background: transparent;
      border: 0;
      text-align: left;
      padding: var(--sp-2, 8px) var(--sp-3, 12px);
      font-size: 15px;
      font-weight: 500;
      color: var(--ink-2, #38392c);
      border-radius: var(--r-sm, 8px);
      cursor: pointer;
      font-family: inherit;
    }
    .doc-img-ctxmenu button:hover { background: var(--hover-bg, #f3f3f3); }
    .doc-img-ctxmenu button[data-act="delete"] { color: var(--danger, #c5544a); }
    .doc-img-ctxmenu button[data-act="delete"]:hover { background: rgba(197, 84, 74, 0.08); }
    .server-update-badge {
      display: inline-block;
      margin-left: 8px;
      padding: 2px 6px;
      background: var(--accent, #d97757);
      color: #fff;
      font-size: 10px;
      border-radius: 6px;
      font-weight: 500;
      vertical-align: middle;
    }
    .server-update-badge[hidden] { display: none; }
    /* Wave 11.6.7 — disabled composer 클릭 시 share 토글 1.5s pulse (사용자 안내) */
    .share.share--pulse {
      animation: today-share-pulse 1.5s ease;
    }
    @keyframes today-share-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(217, 119, 87, 0); }
      30%, 70% { box-shadow: 0 0 0 4px rgba(217, 119, 87, 0.45); }
    }
    /* spec §3.3.1 — 리센츠 전체 보기 진입점.
       DESIGN.md 준수: ghost ink-3 톤 (액센트 점 단위 원칙 — 사이드바 액센트 이미 3곳 사용 중).
       sticky 폐기: recents 리스트 마지막 항목 다음 inline 배치 (스크롤로 자연 도달). */
    .sb__recents-more {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      width: 100%;
      margin: 0;
      padding: 10px 8px;
      background: transparent;
      border: 0;
      font-family: var(--font-sans, 'Pretendard', sans-serif);
      font-size: 12px;
      font-weight: 500;
      line-height: 1.5;
      color: var(--ink-3);
      cursor: pointer;
      border-radius: 8px;
      transition: background 0.12s ease, color 0.12s ease;
    }
    .sb__recents-more:hover {
      background: var(--hover-bg);
      color: var(--ink-1);
    }
    /* 파트너 글 read-only — 작성자만 공유 결정 가능 + 본문 수정 불가.
       시각: top-actions 의 share 토글 숨김. 메타에 "{이름} 작성 · 읽기 전용" 라벨 노출. */
    .share.share--readonly { display: none; }
    .doc[data-read-only="1"] .doc__h1,
    .doc[data-read-only="1"] .doc__body { caret-color: transparent; }
  `;
  document.head.appendChild(style);
}

// ───────────────────────────────────────────────────────────────────────────
// 자동저장 — 800ms debounce → createEntry/updateEntry → .save 갱신
// spec §3 line 65-66 + §8 line 327-332
// ───────────────────────────────────────────────────────────────────────────

const _saveDebounced = new WeakMap();

export function getCurrentKind(doc = document) {
  const active = doc.querySelector?.('.sb__item[data-category].sb__item--active');
  return active?.dataset?.category || null;
}

export function setSaveStatus(article, text) {
  const save = article?.querySelector?.('.doc__meta .save');
  if (save) save.textContent = text;
}

/** article 의 h1 / body 에서 데이터 추출 + Dexie create/update. */
export async function saveArticle(article, user, kind) {
  if (!article || !user?.id) return null;
  if (!Queries.ENTRY_KINDS.includes(kind)) return null;
  // 파트너 글 read-only 보호 — UI 차단 우회 시(devtools 등) 저장 자체 막기.
  if (article.dataset?.readOnly === '1') return null;
  const h1 = article.querySelector('.doc__h1');
  const body = article.querySelector('.doc__body');
  const title = (h1?.textContent || '').trim() || null;
  const content = body?.innerHTML || '';
  const id = article.dataset.entryId;
  setSaveStatus(article, '저장 중…');
  // race 차단 — await 전에 inflight 마킹. 신규 글은 row.id 확정 후 재배정.
  const inflightKey = id || '__new__';
  _selfSaveInflight.set(inflightKey, (_selfSaveInflight.get(inflightKey) || 0) + 1);
  try {
    let row;
    if (!id || id.startsWith('new-')) {
      row = await Queries.createEntry({ owner_id: user.id, kind, title, content });
      article.dataset.entryId = row.id;
      if (row?.id) {
        _selfSaveInflight.set(row.id, (_selfSaveInflight.get(row.id) || 0) + 1);
      }
      // Wave 11.5.11 — 새 글 첫 저장 후 recents 만 재로드 (mainView article 은 유지 — 사용자 입력 중 보존)
      try {
        const list = await fetchEntriesForCategory(kind);
        if (list.length > 0) await renderRecentsFromRows(kind, list);
      } catch (_) {
        /* recents 갱신 실패는 저장 자체 실패 아님 — 무시 */
      }
    } else {
      row = await Queries.updateEntry(id, { title, content });
      // Wave 11.6.6 — 제목/본문 update 시에도 Recents 즉시 갱신 (정렬·제목 텍스트 반영)
      try {
        const list = await fetchEntriesForCategory(kind);
        if (list.length > 0) await renderRecentsFromRows(kind, list);
      } catch (_) {
        /* recents 갱신 실패는 저장 자체 실패 아님 — 무시 */
      }
    }
    setSaveStatus(article, formatSavedTime(row.updated_at));
    // Wave 11.5.3.3 — 저장 성공 = dirty 해제 + 서버 배지 숨김 (자기 push 의 메아리 reload 방지)
    _dirtyArticles.delete(article);
    hideServerUpdateBadge(article);
    // Wave 11.X-2 — 자기 push echo 무시용 timestamp 기록 (caret 점프 회귀 차단).
    if (row?.id && row?.updated_at) {
      _selfPushTimestamps.set(row.id, row.updated_at);
    }
    return row;
  } catch (e) {
    setSaveStatus(article, '저장 실패');
    console.warn('[entries] save 실패', e.message);
    return null;
  } finally {
    // inflight 카운터 감소 — Slow 4G/3G 환경에서 broadcast latency 가 더 길 수 있어
    // 3000ms 유예. handleRealtimeEntryChange 가 자기 echo 확인 시 즉시 감소 (early cleanup).
    const finalId = article.dataset.entryId || inflightKey;
    setTimeout(() => {
      decrementInflight(inflightKey);
      if (finalId !== inflightKey) decrementInflight(finalId);
    }, _SELF_INFLIGHT_TIMEOUT_MS);
  }
}

const _SELF_INFLIGHT_TIMEOUT_MS = 3000;

function decrementInflight(key) {
  if (!key) return;
  const n = _selfSaveInflight.get(key) || 0;
  if (n <= 1) _selfSaveInflight.delete(key);
  else _selfSaveInflight.set(key, n - 1);
}

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.5.3.3 — Realtime 충돌 해결 (편집 중 문서 isEditorDirty 처리)
// spec §8 L343 — "편집 중 문서이면 서버에 새 버전 있음 배지만 표시, 강제 reload X"
// ───────────────────────────────────────────────────────────────────────────

export function isEditorDirty(article) {
  if (!article) return false;
  return _dirtyArticles.has(article);
}

export function markArticleDirty(article) {
  if (article) _dirtyArticles.add(article);
}

export function clearArticleDirty(article) {
  if (article) _dirtyArticles.delete(article);
}

// Wave 11.X — IME composition 추적 (한글 조합 중 외부 reload 가드).
// article 인자 없으면 "어떤 article 이든 composing 중인지" 반환.
export function isComposing(article) {
  if (!article) return _composingArticle != null;
  return _composingArticle === article;
}

// JSDOM 의 composition event 시뮬레이션 한계 우회 — 테스트 전용 진입점.
export function _setComposingForTest(article) { _composingArticle = article; }
export function _clearComposingForTest() { _composingArticle = null; }

// Wave 11.X-2 — _selfPushTimestamps 테스트 전용 진입점.
export function _recordSelfPushForTest(id, ts) { _selfPushTimestamps.set(id, ts); }
export function _clearSelfPushForTest() { _selfPushTimestamps.clear(); }

// _selfSaveInflight 테스트 전용 진입점.
export function _setSelfInflightForTest(id, n = 1) { _selfSaveInflight.set(id, n); }
export function _clearSelfInflightForTest() { _selfSaveInflight.clear(); }

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.X-3 — caret save/restore (contenteditable + WebKit textNode 교체 시 caret 보존).
// 검색 근거: codegenes.net "Caret Position Reverting to Start in Contenteditable Span on Re-render".
// "If React replaces a text node, the original selection range becomes invalid → caret reset".
// 우리 케이스도 동일 — body.innerHTML 재설정 시 textNode 교체로 selection invalid → caret 점프.
// 표준 해결: character offset 으로 save → DOM 변경 → 같은 offset 으로 restore.
// ───────────────────────────────────────────────────────────────────────────

/**
 * body 시작부터 현재 caret 위치까지의 절대 character offset 반환.
 * caret 이 body 안에 없거나 selection 없으면 null.
 */
export function getCaretOffset(body, win = (typeof window !== 'undefined' ? window : null)) {
  if (!body || !win?.getSelection) return null;
  const sel = win.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!body.contains(range.startContainer)) return null;
  const pre = body.ownerDocument.createRange();
  pre.selectNodeContents(body);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

/**
 * body 안에서 character offset 위치에 caret 설정.
 * TreeWalker 로 textNode 순회하며 누적 길이로 위치 찾음.
 * offset 이 텍스트 총 길이를 초과하면 끝에 두기.
 * offset 이 null/undefined 면 no-op.
 */
export function setCaretOffset(body, offset, win = (typeof window !== 'undefined' ? window : null)) {
  if (!body || offset == null || !win?.getSelection || !body.ownerDocument) return false;
  const doc = body.ownerDocument;
  if (!doc.createTreeWalker || !doc.createRange) return false;
  const sel = win.getSelection();
  if (!sel) return false;
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
  let pos = 0;
  let node;
  while ((node = walker.nextNode())) {
    const len = node.nodeValue?.length ?? 0;
    if (pos + len >= offset) {
      const range = doc.createRange();
      range.setStart(node, offset - pos);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }
    pos += len;
  }
  // 길이 초과 — body 끝에 두기
  const range = doc.createRange();
  range.selectNodeContents(body);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

/** article 안 .server-update-badge 표시. element 없으면 doc__meta 에 inline 추가. */
export function showServerUpdateBadge(article, doc = document) {
  if (!article) return false;
  let badge = article.querySelector('.server-update-badge');
  if (!badge) {
    const meta = article.querySelector('.doc__meta');
    if (!meta) return false;
    badge = doc.createElement('span');
    badge.className = 'server-update-badge';
    badge.textContent = '서버에 새 버전 있음';
    meta.appendChild(badge);
  } else {
    badge.hidden = false;
    badge.textContent = '서버에 새 버전 있음';
  }
  return true;
}

export function hideServerUpdateBadge(article) {
  const badge = article?.querySelector?.('.server-update-badge');
  if (badge) badge.hidden = true;
}

/**
 * Realtime payload 처리 — 매치되는 article 이 mainView 에 있는지 확인 + dirty 분기.
 * Sync 가 이미 Dexie put 처리. 이 listener 는 UI 갱신만.
 */
export async function handleRealtimeEntryChange(payload, doc = document) {
  if (!payload || payload.table !== 'today_entries') return { applied: false, reason: 'table_mismatch' };
  const eventType = payload.eventType;
  const newRow = payload.new;
  const oldRow = payload.old;
  const id = (newRow && newRow.id) || (oldRow && oldRow.id);
  if (!id) return { applied: false, reason: 'no_id' };

  const article = doc.querySelector?.('#mainView article.doc');
  const matches = article && article.dataset.entryId === id;

  // DELETE — 매치되는 article 이면 mainView clear (mocks 의 empty state 로 fallback 자동 안 됨)
  if (eventType === 'DELETE') {
    if (matches) {
      // 단순 처리 — article 비움. 사용자가 카테고리 다시 클릭하면 mocks renderEmpty 노출
      article.remove();
    }
    return { applied: true, reason: 'delete', matched: matches };
  }

  // INSERT / UPDATE
  if (!newRow) return { applied: false, reason: 'no_new_row' };

  // sidebar refresh — kind 매치 시 매치 여부 무관하게 호출 (회귀 1 매치 분기 미커버 fix).
  // 제목 변경·토글 OFF 시 sidebar list 재 fetch 되도록.
  const currentKind = getCurrentKind(doc);
  const kindMatchesCurrent = !!currentKind && (
    ((currentKind === 'navi' || currentKind === 'soyoun_navi') &&
      (newRow.kind === 'navi' || newRow.kind === 'soyoun_navi'))
    || currentKind === newRow.kind
  );
  if (kindMatchesCurrent) {
    scheduleRecentsRefresh(currentKind, doc);
  }

  if (matches) {
    // inflight skip — await 전에 마킹된 카운터로 REST 응답보다 먼저 도착하는 echo 차단.
    // timestamp 필터(_selfPushTimestamps)의 race window 보완.
    if ((_selfSaveInflight.get(id) || 0) > 0) {
      // early cleanup — timestamp 매치 확인되면 카운터 즉시 감소.
      // setTimeout 3000ms 보다 빨리 외부 변경에 반응할 수 있게 함.
      const lastSelf = _selfPushTimestamps.get(id);
      if (lastSelf && newRow?.updated_at === lastSelf) {
        decrementInflight(id);
      }
      return { applied: true, reason: 'self_inflight_skip', matched: true };
    }
    // Wave 11.X-2 — 자기 push echo skip (saveArticle 가 기록한 updated_at 과 동일하면 무시).
    // composition 끝난 후 dirty 해제 micro-window 의 self-echo 로 인한 caret 점프 회귀 차단.
    const lastSelf = _selfPushTimestamps.get(id);
    if (lastSelf && newRow?.updated_at === lastSelf) {
      return { applied: true, reason: 'self_echo_skip', matched: true };
    }
    // Wave 11.X — IME composition 중에도 dirty 와 동일 처리 (caret 점프 방지).
    const composing = isComposing(article);
    if (isEditorDirty(article) || composing) {
      showServerUpdateBadge(article, doc);
      return {
        applied: true,
        reason: composing ? 'composing_badge' : 'dirty_badge',
        matched: true,
      };
    }
    // not dirty / not composing — mainView 재패치 (in-place patch — 회귀 5 fix)
    renderDocFromRow(newRow, doc);
    return { applied: true, reason: 'reloaded', matched: true };
  }
  return {
    applied: true,
    reason: kindMatchesCurrent ? 'recents_scheduled' : 'no_match',
    matched: false,
  };
}

let _recentsRefreshTimer = null;
export function scheduleRecentsRefresh(kind, doc = document) {
  if (_recentsRefreshTimer) clearTimeout(_recentsRefreshTimer);
  _recentsRefreshTimer = setTimeout(async () => {
    _recentsRefreshTimer = null;
    try {
      const list = await fetchEntriesForCategory(kind);
      await renderRecentsFromRows(kind, list, doc);
    } catch (e) {
      console.warn('[entries] recents refresh 실패:', e?.message || e);
    }
  }, 200);
}

function getDebouncedSaver(article) {
  if (_saveDebounced.has(article)) return _saveDebounced.get(article);
  const fn = debounce(() => {
    const kind = getCurrentKind();
    if (!kind) return;
    saveArticle(article, _currentUser, kind);
  }, 800);
  _saveDebounced.set(article, fn);
  return fn;
}

let _editorInputInstalled = false;
function installEditorInput() {
  if (_editorInputInstalled) return;
  if (typeof document === 'undefined') return;
  document.addEventListener('input', (e) => {
    const target = e.target;
    if (!target || !target.closest) return;
    const article = target.closest('article.doc');
    if (!article) return;
    if (!target.closest('.doc__h1') && !target.closest('.doc__body')) return;
    // Wave 11.5.3.3 — 사용자 입력 시점부터 dirty (saveArticle 성공 시 해제)
    markArticleDirty(article);
    // Wave 11.X — IME composition 중 (한글 음절 조립) debounce skip.
    // compositionend 가 와서 한 번에 발사하므로 데이터 손실 없음 (최대 800ms + 조립 시간 지연).
    // 이유: 조립 중 saveArticle → Supabase Realtime echo → renderDocFromRow → body.innerHTML 재설정 → caret 점프.
    if (isComposing(article) || e.isComposing || e.inputType === 'insertCompositionText') return;
    setSaveStatus(article, '저장 중…');
    getDebouncedSaver(article)();
  });
  // Wave 11.X — composition 이벤트 추적 (compositionstart 시 _composingArticle set, compositionend 시 clear).
  document.addEventListener('compositionstart', (e) => {
    const target = e.target;
    if (!target || !target.closest) return;
    const article = target.closest('article.doc');
    if (!article) return;
    if (!target.closest('.doc__h1') && !target.closest('.doc__body')) return;
    _composingArticle = article;
    markArticleDirty(article);
  });
  document.addEventListener('compositionend', (e) => {
    const target = e.target;
    const article = target?.closest?.('article.doc');
    _composingArticle = null;
    // composition 종료 시 한 번 더 저장 트리거 (조립 완료된 글자 반영).
    if (article && (target.closest('.doc__h1') || target.closest('.doc__body'))) {
      setSaveStatus(article, '저장 중…');
      getDebouncedSaver(article)();
    }
  });
  _editorInputInstalled = true;
}

// Wave 11.6.6 — paste 시 외부 스타일 제거 (plaintext 강제). 사용자 의도: 우리 폰트/줄높이/자간 일관 유지.
// Wave 11.7.1 — image clipboard 분기 추가 (스크린샷 / 사진 복붙 → compressImage → execCommand insertImage).
let _pasteHandlerInstalled = false;
function installPasteHandler() {
  if (_pasteHandlerInstalled) return;
  if (typeof document === 'undefined') return;
  document.addEventListener('paste', async (e) => {
    const target = e.target;
    if (!target || !target.closest) return;
    if (!target.closest('.doc__h1') && !target.closest('.doc__body')) return;
    const cd = e.clipboardData || (typeof window !== 'undefined' && window.clipboardData);
    if (!cd) return;
    // Wave 11.7.1 — image 우선 처리 (h1 은 텍스트만 허용 — image skip)
    const isBody = !!target.closest('.doc__body');
    if (isBody && cd.items) {
      for (const item of cd.items) {
        if (item.type && item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile?.();
          if (!file) return;
          const result = await compressImage(file);
          if (!result?.ok) {
            console.warn('[entries] paste 이미지 압축 실패:', result?.reason || 'unknown');
            return;
          }
          let imgSrc = result.dataUrl;
          try {
            const upload = await uploadImage(result.dataUrl, { user_id: _currentUser?.id });
            if (upload?.ok && upload.url) imgSrc = upload.url;
            else console.warn('[entries] paste Storage 업로드 실패, dataUrl fallback:', upload?.reason);
          } catch (err) {
            console.warn('[entries] paste uploadImage 예외:', err?.message || err);
          }
          try {
            document.execCommand('insertImage', false, imgSrc);
          } catch (err) {
            console.warn('[entries] paste insertImage 실패:', err?.message || err);
          }
          return;
        }
      }
    }
    // text 처리 — plaintext 강제 (이미지 URL paste 시 자동 <img> 변환)
    e.preventDefault();
    const text = cd.getData('text/plain') || cd.getData('text') || '';
    if (!text) return;
    if (isBody) {
      const trimmed = text.trim();
      if (
        /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(trimmed) ||
        /^https?:\/\/(images\.unsplash\.com|drive\.google\.com\/thumbnail)/i.test(trimmed)
      ) {
        try {
          document.execCommand('insertImage', false, trimmed);
          return;
        } catch (err) {
          console.warn('[entries] paste 이미지 URL insertImage 실패:', err?.message || err);
        }
      }
    }
    try {
      document.execCommand('insertText', false, text);
    } catch (_) {
      // execCommand 실패 폴백 — selection range 직접 삽입
      const sel = window.getSelection?.();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
    }
  }, true);
  _pasteHandlerInstalled = true;
}

// Wave 12 — drop 핸들러: 외부 drag-drop 우회 차단. paste 핸들러와 동일 plaintext/image 강제.
//   dragover preventDefault 없이는 drop 이벤트 발화 안 함 (브라우저 기본 동작 막기 위해).
let _dropHandlerInstalled = false;
function installDropHandler() {
  if (_dropHandlerInstalled) return;
  if (typeof document === 'undefined') return;
  document.addEventListener('dragover', (e) => {
    const target = e.target;
    if (!target || !target.closest) return;
    if (!target.closest('.doc__h1') && !target.closest('.doc__body')) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }, true);
  document.addEventListener('drop', async (e) => {
    const target = e.target;
    if (!target || !target.closest) return;
    if (!target.closest('.doc__h1') && !target.closest('.doc__body')) return;
    const dt = e.dataTransfer;
    if (!dt) return;
    const isBody = !!target.closest('.doc__body');
    if (isBody && dt.files && dt.files.length > 0) {
      for (const file of dt.files) {
        if (file.type && file.type.startsWith('image/')) {
          e.preventDefault();
          const result = await compressImage(file);
          if (!result?.ok) {
            console.warn('[entries] drop 이미지 압축 실패:', result?.reason || 'unknown');
            return;
          }
          let imgSrc = result.dataUrl;
          try {
            const upload = await uploadImage(result.dataUrl, { user_id: _currentUser?.id });
            if (upload?.ok && upload.url) imgSrc = upload.url;
            else console.warn('[entries] drop Storage 업로드 실패, dataUrl fallback:', upload?.reason);
          } catch (err) {
            console.warn('[entries] drop uploadImage 예외:', err?.message || err);
          }
          try {
            document.execCommand('insertImage', false, imgSrc);
          } catch (err) {
            console.warn('[entries] drop insertImage 실패:', err?.message || err);
          }
          return;
        }
      }
    }
    e.preventDefault();
    const text = dt.getData('text/plain') || dt.getData('text') || '';
    if (!text) return;
    if (isBody) {
      const trimmed = text.trim();
      if (
        /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(trimmed) ||
        /^https?:\/\/(images\.unsplash\.com|drive\.google\.com\/thumbnail)/i.test(trimmed)
      ) {
        try {
          document.execCommand('insertImage', false, trimmed);
          return;
        } catch (err) {
          console.warn('[entries] drop 이미지 URL insertImage 실패:', err?.message || err);
        }
      }
    }
    try {
      document.execCommand('insertText', false, text);
    } catch (_) {
      const sel = window.getSelection?.();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
    }
  }, true);
  _dropHandlerInstalled = true;
}

let _newDocHandlerInstalled = false;
function installNewDocHandler() {
  if (_newDocHandlerInstalled) return;
  if (typeof document === 'undefined') return;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('#newDocBtn, [data-action="new-doc"]');
    if (!btn) return;
    // spec §5.0.4 — 새 글 시 list 모드 자동 'article' 복귀
    if (_activeMainView === 'list') exitListView();
    // mocks 가 sync 로 article 그림 → microtask 후 SPA 가 contenteditable wrap.
    setTimeout(() => wrapNewArticle(), 0);
  });
  _newDocHandlerInstalled = true;
}

/**
 * mocks newDoc (L4669-4691) 가 그린 article 의 본문 `<p class="doc__p">` 영역을
 * contenteditable `<div class="doc__body">` 로 wrap. 이미 wrap 됐으면 no-op.
 * 임시 entryId `new-<ts>` 마킹 — saveArticle 의 createEntry 분기 트리거.
 */
export function wrapNewArticle(doc = document) {
  const view = doc.getElementById('mainView');
  if (!view) return false;
  const article = view.querySelector('article.doc');
  if (!article) return false;
  if (article.querySelector('.doc__body')) return false;
  const meta = article.querySelector('.doc__meta');
  if (!meta) return false;
  const body = doc.createElement('div');
  body.className = 'doc__body';
  body.setAttribute('contenteditable', 'true');
  body.setAttribute('spellcheck', 'false');
  let next = meta.nextElementSibling;
  while (next) {
    const after = next.nextElementSibling;
    next.remove();
    next = after;
  }
  body.innerHTML = '';
  article.appendChild(body);
  if (!article.dataset.entryId) {
    article.dataset.entryId = 'new-' + Date.now();
  }
  // 새 글 default 시각 — navi/soyoun_navi 는 공유 ON (사용자 결정 2026-05-04), 그 외는 OFF.
  // 사용자 요청 2026-05-13: 이전 article 이 파트너 글이었을 때 share 에 share--readonly 가 박혀 있어
  // 새 글에서도 공유 토글이 숨겨지는 버그 fix — readonly 클래스 강제 제거.
  const shareEl = doc.querySelector?.('.share');
  if (shareEl) {
    const kind = getCurrentKind(doc);
    const sharedDefault = kind === 'navi' || kind === 'soyoun_navi';
    shareEl.classList.toggle('share--off', !sharedDefault);
    shareEl.classList.remove('share--readonly');
  }
  // 더보기 메뉴 wrap 의 readonly 마커도 정리 (이전 파트너 글 잔재).
  const moreWrap = doc.querySelector?.('.doc-more-wrap');
  if (moreWrap) moreWrap.dataset.readOnly = '';
  // 새 글 placeholder + crumb #N — 본인 카테고리 다음 번호 동적 계산 (사용자 요청 2026-05-12).
  // mocks fixture totalCount stub (#1337) 대신 computeEntryNumber 사용.
  const h1 = article.querySelector?.('.doc__h1');
  const numEl = doc.querySelector?.('.crumb__num-val');
  const numContainer = doc.querySelector?.('.crumb__num');
  const userId = _currentUser?.id;
  const db = globalThis.todayDB;
  const kindForNum = getCurrentKind(doc);
  if (userId && db?.entries && kindForNum) {
    db.entries.toArray().then((all) => {
      const next = computeEntryNumber('__new__', kindForNum, all, userId);
      if (next != null) {
        if (h1) h1.dataset.emptyTitle = `#${next} 제목 없음`;
        if (numEl) numEl.textContent = String(next);
        numContainer?.classList?.remove('is-empty');
      }
    }).catch(() => {});
  }
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// .share 토글 (is_shared) — mocks `.share` element click → Dexie updateEntry.
// 별 wave hotfix — Wave 11.7.3 피드 화면 이전 단계로 토글 wiring 만 추가.
// spec §11 L405-415 — is_shared false→true 시 Realtime trigger 가 파트너에게 알림.
// ───────────────────────────────────────────────────────────────────────────

let _shareToggleInstalled = false;

function installShareToggleHandler() {
  if (_shareToggleInstalled) return;
  if (typeof document === 'undefined') return;
  _shareToggleInstalled = true;
  document.addEventListener('click', async (e) => {
    const share = e.target.closest?.('.share');
    if (!share) return;
    const article = document.querySelector('#mainView article.doc');
    if (!article) return;
    // 파트너 글은 share 토글 불가 (작성자만 공유 결정)
    if (article.dataset?.readOnly === '1') return;
    let id = article.dataset.entryId;
    if (!_currentUser?.id) return;
    try {
      // Wave 11.6.6 — 새글 미저장 시: createEntry 강제 실행 후 is_shared=1 update.
      // 사용자 의도: 글 작성 직후 토글 1회 클릭으로 즉시 공유.
      if (!id || id.startsWith('new-')) {
        const kind = getCurrentKind();
        if (!kind) return;
        const created = await saveArticle(article, _currentUser, kind);
        if (!created) return;
        id = created.id;
      }
      const current = await Queries.getEntry(id);
      if (!current) return;
      const next = current.is_shared ? 0 : 1;
      await Queries.updateEntry(id, { is_shared: next });
      share.classList.toggle('share--off', !next);
      // 댓글 영역 재마운트 — is_shared 변경에 따라 mount/unmount 자동 동기화 (mountForArticle 가 분기 처리)
      try {
        if (typeof window !== 'undefined') {
          await window.todayComments?.mountForArticle?.(article);
        }
      } catch (_) {
        /* comments 재마운트 실패는 toggle 자체 실패 아님 — 무시 */
      }
    } catch (err) {
      console.warn('[entries] is_shared toggle 실패:', err?.message || err);
    }
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.5.8 — 에디터 ⋯ 메뉴 (사본 / 내보내기 / 글 삭제) Dexie wiring
// mocks today-mac.html L3563-3601 의 doc-more-menu IIFE 가 [data-doc-action] 클릭에
// `alert('구현 예정')` 만 호출. SPA 가 capture phase listener 로 가로채서 실 Dexie 처리.
// ───────────────────────────────────────────────────────────────────────────

const DOC_MORE_ACTIONS = Object.freeze(['delete', 'duplicate', 'export']);

function closeDocMoreMenu(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return;
  const menu = doc.getElementById('docMoreMenu');
  if (menu) {
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
  }
  const btn = doc.getElementById('docMoreBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function safeFilename(s) {
  return String(s ?? 'untitled').replace(/[^\p{L}\p{N}\-_]/gu, '_').slice(0, 60) || 'untitled';
}

/** 글 삭제 — softDeleteEntry + mainView article remove + 카테고리 재로드. */
export async function handleDeleteAction(article, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!article) return { ok: false, reason: 'no_article' };
  if (article.dataset?.readOnly === '1') return { ok: false, reason: 'read_only' };
  const id = article.dataset?.entryId;
  if (!id || id.startsWith('new-')) return { ok: false, reason: 'unsaved' };
  try {
    await Queries.softDeleteEntry(id);
    article.remove();
    if (doc) {
      const kind = getCurrentKind(doc);
      if (kind) await handleCategoryActive(kind);
    }
    return { ok: true, id };
  } catch (err) {
    console.warn('[entries] softDeleteEntry 실패:', err?.message || err);
    return { ok: false, reason: 'error', error: err };
  }
}

/** 사본 만들기 — getEntry → createEntry (kind 유지, is_shared=0) → renderDocFromRow + 카테고리 재로드. */
export async function handleDuplicateAction(article, user, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!article) return { ok: false, reason: 'no_article' };
  if (!user?.id) return { ok: false, reason: 'no_user' };
  const id = article.dataset?.entryId;
  if (!id || id.startsWith('new-')) return { ok: false, reason: 'unsaved' };
  try {
    const orig = await Queries.getEntry(id);
    if (!orig) return { ok: false, reason: 'not_found' };
    const copy = await Queries.createEntry({
      owner_id: user.id,
      kind: orig.kind,
      title: (orig.title || '제목 없음') + ' (사본)',
      content: orig.content || '',
    });
    if (doc) renderDocFromRow(copy, doc);
    if (doc) {
      const kind = getCurrentKind(doc);
      if (kind) await handleCategoryActive(kind);
    }
    return { ok: true, id: copy.id, copy };
  } catch (err) {
    console.warn('[entries] duplicate 실패:', err?.message || err);
    return { ok: false, reason: 'error', error: err };
  }
}

/** Dexie row → JSON 직렬화 (export payload). */
export function entryToExportJson(row) {
  return JSON.stringify({
    id: row?.id || '',
    kind: row?.kind || '',
    title: row?.title || '',
    content: row?.content || '',
    created_at: row?.created_at || null,
    updated_at: row?.updated_at || null,
  }, null, 2);
}

/** 내보내기 — getEntry → JSON Blob → URL.createObjectURL + <a download> 트릭 (iPhone Safari 정합). */
export async function handleExportAction(article, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!article) return { ok: false, reason: 'no_article' };
  if (!doc) return { ok: false, reason: 'no_doc' };
  const id = article.dataset?.entryId;
  if (!id || id.startsWith('new-')) return { ok: false, reason: 'unsaved' };
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return { ok: false, reason: 'no_blob_url' };
  }
  try {
    const orig = await Queries.getEntry(id);
    if (!orig) return { ok: false, reason: 'not_found' };
    const json = entryToExportJson(orig);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url;
    const idShort = (orig.id || '').slice(0, 8) || 'id';
    a.download = `${safeFilename(orig.title || 'untitled')}-${idShort}.json`;
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { ok: true, id: orig.id, filename: a.download };
  } catch (err) {
    console.warn('[entries] export 실패:', err?.message || err);
    return { ok: false, reason: 'error', error: err };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// edit-toolbar wiring — Wave 별 wave A (B/I/U/S) + Wave 11.6.7 (인용/리스트)
// SPA 가 data-format 어트리뷰트 부여 + click listener 로 document.execCommand 호출.
// 링크/인라인 코드/사진업로드는 사용자 명시 보류 또는 별 wave (Supabase Storage 정책 결정 후).
// ───────────────────────────────────────────────────────────────────────────

const EDIT_TOOLBAR_MAP = Object.freeze([
  Object.freeze({ selector: '.et-btn--bold', format: 'bold' }),
  Object.freeze({ selector: '.et-btn--italic', format: 'italic' }),
  Object.freeze({ selector: '.et-btn--underline', format: 'underline' }),
  Object.freeze({ selector: '[title="취소선"]', format: 'strikeThrough' }),
  // Wave 11.6.7 — 인용 (blockquote) + 불릿 리스트 + 순서 리스트
  Object.freeze({ selector: '[title="인용"]', format: 'formatBlock', arg: 'blockquote' }),
  Object.freeze({ selector: '[title="글뮤리표"]', format: 'insertUnorderedList' }),
  Object.freeze({ selector: '[title="순서 목록"]', format: 'insertOrderedList' }),
]);

const EDIT_TOOLBAR_FORMATS = Object.freeze(new Set([
  'bold', 'italic', 'underline', 'strikeThrough',
  'formatBlock', 'insertUnorderedList', 'insertOrderedList',
]));

/** mocks editToolbar button 에 data-format / data-format-arg / tabindex 부여 (idempotent). */
export function annotateEditToolbar(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return 0;
  const tb = doc.getElementById('editToolbar');
  if (!tb) return 0;
  let count = 0;
  for (const { selector, format, arg } of EDIT_TOOLBAR_MAP) {
    const btn = tb.querySelector(selector);
    if (btn && !btn.dataset?.format) {
      btn.dataset.format = format;
      if (arg) btn.dataset.formatArg = arg;
      // Wave 11.6.10 — tabindex=-1 로 button focus 차단 (contenteditable selection 보존)
      if (typeof btn.setAttribute === 'function') btn.setAttribute('tabindex', '-1');
      count += 1;
    }
  }
  return count;
}

// Wave 11.5.11 — selection 보존 (toolbar click 시 contenteditable selection 손실 방지)
let _savedRange = null;
function saveSelection() {
  if (typeof window === 'undefined' || typeof window.getSelection !== 'function') return;
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    _savedRange = sel.getRangeAt(0).cloneRange();
  }
}
function restoreSelection() {
  if (!_savedRange) return;
  if (typeof window === 'undefined' || typeof window.getSelection !== 'function') return;
  const sel = window.getSelection();
  if (!sel) return;
  try {
    sel.removeAllRanges();
    sel.addRange(_savedRange);
  } catch (_) {
    /* range 가 detached 됐을 수 있음 — 무시 */
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 이미지 삽입 (Wave 11.7) — 클라이언트 prototype.
// canvas 압축 (max 1920 장변, JPEG q=0.85) + execCommand('insertImage', dataUrl).
// Supabase Storage 업로드는 phase 2. iPhone Safari HEIC 는 phase 2 (heic2any).
// ───────────────────────────────────────────────────────────────────────────

/** 압축 후 dimensions 계산 (순수 함수 — 테스트 가능). 장변 maxDim 초과 시 비율 유지 축소. */
export function calcCompressionDimensions(w, h, maxDim = 1600) {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { tw: 0, th: 0, scale: 0 };
  const scale = Math.min(1, maxDim / Math.max(w, h));
  return { tw: Math.round(w * scale), th: Math.round(h * scale), scale };
}

/**
 * Wave 11.10 — 원본 (w,h) 의 정사각 center crop source rect 계산 (순수 함수).
 * 가로가 길면 좌우 잘림, 세로가 길면 상하 잘림. 정사각 입력은 변경 없음.
 * 반환: { sx, sy, sw, sh } — drawImage 의 source rect.
 */
export function calcSquareCropRect(w, h) {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { sx: 0, sy: 0, sw: 0, sh: 0 };
  }
  if (w >= h) {
    const sw = h;
    const sh = h;
    return { sx: Math.round((w - sw) / 2), sy: 0, sw, sh };
  }
  const sw = w;
  const sh = w;
  return { sx: 0, sy: Math.round((h - sh) / 2), sw, sh };
}

// Wave 11.9 — iPhone HEIC 호환 (heic2any 동적 import).
// 일반 JPEG/PNG 첨부 시엔 heic2any chunk 미로드 (initial bundle 영향 0).

/** HEIC/HEIF 파일 검출 (순수 함수). file.type 우선, 빈 type 시 확장자 fallback. */
export function isHeicFile(file) {
  if (!file) return false;
  const t = (file.type || '').toLowerCase();
  if (t === 'image/heic' || t === 'image/heif') return true;
  const name = (file.name || '').toLowerCase();
  return /\.hei[cf]$/.test(name);
}

/**
 * HEIC/HEIF Blob → JPEG Blob 변환 (heic2any 동적 import wrapper).
 * 실패 시 throw (caller 가 reason 결정).
 * opts.heic2any — 테스트용 mock 주입 (default = 동적 import).
 */
export async function convertHeicToJpeg(file, opts = {}) {
  if (!file) throw new Error('no_file');
  const quality = typeof opts.quality === 'number' ? opts.quality : 0.85;
  let h2a = opts.heic2any;
  if (!h2a) {
    const mod = await import('heic2any');
    h2a = mod.default || mod;
  }
  const out = await h2a({ blob: file, toType: 'image/jpeg', quality });
  // heic2any 는 단일 Blob 또는 Blob[] 반환 (다중 페이지 HEIF). 첫 항목 사용.
  return Array.isArray(out) ? out[0] : out;
}

/**
 * file → canvas 압축 → JPEG data URL.
 * Wave 11.7.1 — Supabase Storage 1GB 무료 한도 감안 default 강화: 1920→1600, q 0.85→0.8
 * (일반 사진 ≈ 150KB → 6700장 / 1GB 적정).
 * Wave 11.10 — opts.square (number) 분기: 정사각 center crop (avatar 용).
 *   square 사용 시 maxDim 무시, output = square × square.
 * 반환: { ok: true, dataUrl, width, height, originalWidth, originalHeight }
 *      또는 { ok: false, reason } (HEIC 등 미지원).
 */
export async function compressImage(file, opts = {}) {
  const maxDim = opts.maxDim || 1600;
  const quality = typeof opts.quality === 'number' ? opts.quality : 0.8;
  const useSquare = typeof opts.square === 'number' && opts.square > 0;
  if (!file || typeof window === 'undefined' || typeof document === 'undefined') {
    return { ok: false, reason: 'no_env' };
  }
  // Wave 11.9 — HEIC 사전 변환 (iPhone Safari). 일반 파일은 분기 skip.
  let fileForBitmap = file;
  if (isHeicFile(file)) {
    try {
      fileForBitmap = await convertHeicToJpeg(file, opts);
    } catch (err) {
      return { ok: false, reason: 'heic_convert_failed', error: err };
    }
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(fileForBitmap);
  } catch (err) {
    return { ok: false, reason: 'unsupported_format', error: err };
  }
  // Wave 11.9.2 — bitmap.close() 후 width/height 가 0 반환 → close 전 캐시 (회귀 fix).
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  let tw;
  let th;
  if (useSquare) {
    tw = opts.square;
    th = opts.square;
  } else {
    ({ tw, th } = calcCompressionDimensions(originalWidth, originalHeight, maxDim));
  }
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return { ok: false, reason: 'no_canvas_ctx' };
  }
  if (useSquare) {
    const { sx, sy, sw, sh } = calcSquareCropRect(originalWidth, originalHeight);
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, tw, th);
  } else {
    ctx.drawImage(bitmap, 0, 0, tw, th);
  }
  bitmap.close?.();
  let dataUrl;
  try {
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  } catch (err) {
    return { ok: false, reason: 'toDataURL_failed', error: err };
  }
  return {
    ok: true,
    dataUrl,
    width: tw,
    height: th,
    originalWidth,
    originalHeight,
  };
}

// Wave 11.8 — Supabase Storage 업로드 helper (phase 2).
// dataUrl → Blob → supabase.storage.upload → public URL.
// 실패 시 caller 가 dataUrl fallback 가능하게 reason + dataUrl 동반.
// bucket 기본 'today-entries' (사용자 사전 결정). path 규칙 `{user_id}/{uuid}.{ext}`.
export async function uploadImage(dataUrl, opts = {}) {
  const userId = opts.user_id;
  const bucket = opts.bucket || 'today-entries';
  // 명시적 null 도 의도 (테스트가 supabase 미설정 케이스 강제) → 'supabase' in opts 로 분기.
  const client = 'supabase' in opts ? opts.supabase : supabase;
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return { ok: false, reason: 'invalid_dataurl', dataUrl };
  }
  if (!userId) return { ok: false, reason: 'no_user', dataUrl };
  if (!client || !client.storage) return { ok: false, reason: 'no_supabase', dataUrl };
  let blob;
  try {
    blob = await fetch(dataUrl).then((r) => r.blob());
  } catch (err) {
    return { ok: false, reason: 'blob_failed', dataUrl, error: err };
  }
  const mime = blob?.type || 'image/jpeg';
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpeg';
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${userId}/${uuid}.${ext}`;
  try {
    const { error } = await client.storage.from(bucket).upload(path, blob, {
      contentType: mime,
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) return { ok: false, reason: 'upload_failed', dataUrl, error };
    const { data } = client.storage.from(bucket).getPublicUrl(path);
    const url = data?.publicUrl;
    if (!url) return { ok: false, reason: 'no_public_url', dataUrl };
    return { ok: true, url, path };
  } catch (err) {
    return { ok: false, reason: 'upload_exception', dataUrl, error: err };
  }
}

// Wave 11.7.2 — 본문 image 클릭 → class-based selection (drag 시각 X) + keyboard handler.
// range selectNode 는 text drag 처럼 보이는 selection 만들어 사용자 의도와 다름. 명시적 `is-selected` class 채택.
let _selectedImg = null;
function _deselectImage() {
  if (_selectedImg) {
    _selectedImg.classList?.remove?.('is-selected');
    _selectedImg = null;
  }
}
function _selectImage(img) {
  if (_selectedImg && _selectedImg !== img) _selectedImg.classList?.remove?.('is-selected');
  img.classList?.add?.('is-selected');
  _selectedImg = img;
  // 텍스트 drag selection 차단 — 기존 range 비우기
  if (typeof window !== 'undefined' && typeof window.getSelection === 'function') {
    window.getSelection()?.removeAllRanges?.();
  }
}

let _imageClickInstalled = false;
function installImageClickHandler() {
  if (_imageClickInstalled) return;
  if (typeof document === 'undefined') return;
  _imageClickInstalled = true;
  // mousedown capture — text drag selection 시작 차단 (preventDefault)
  document.addEventListener('mousedown', (e) => {
    const img = e.target?.closest?.('article.doc .doc__body img');
    if (!img) return;
    e.preventDefault();
  }, true);
  document.addEventListener('click', (e) => {
    const img = e.target?.closest?.('article.doc .doc__body img');
    if (!img) {
      _deselectImage();
      return;
    }
    e.preventDefault();
    _selectImage(img);
  });
  document.addEventListener('keydown', async (e) => {
    if (!_selectedImg || !document.body.contains(_selectedImg)) return;
    const key = e.key;
    // Backspace / Delete → selected image 제거
    if (key === 'Backspace' || key === 'Delete') {
      e.preventDefault();
      const img = _selectedImg;
      _deselectImage();
      img.remove();
      // saveArticle 트리거 (input event)
      const body = document.querySelector('article.doc .doc__body[contenteditable]');
      body?.dispatchEvent?.(new Event('input', { bubbles: true }));
      return;
    }
    // Cmd+C / Ctrl+C / Cmd+X / Ctrl+X
    const isCopy = (e.metaKey || e.ctrlKey) && key === 'c';
    const isCut = (e.metaKey || e.ctrlKey) && key === 'x';
    if (!isCopy && !isCut) return;
    e.preventDefault();
    const img = _selectedImg;
    const src = img.getAttribute('src') || '';
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.write && src.startsWith('data:image/')) {
        // dataUrl → blob → ClipboardItem image (image 자체 카피)
        const blob = await fetch(src).then((r) => r.blob());
        const ci = new ClipboardItem({ [blob.type]: blob });
        await navigator.clipboard.write([ci]);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        // fallback — http(s) URL 또는 ClipboardItem 미지원 시 text src 카피
        await navigator.clipboard.writeText(src);
      }
      if (isCut) {
        _deselectImage();
        img.remove();
        const body = document.querySelector('article.doc .doc__body[contenteditable]');
        body?.dispatchEvent?.(new Event('input', { bubbles: true }));
      }
    } catch (err) {
      console.warn('[entries] image clipboard 실패:', err?.message || err);
    }
  });
}

// ─── 이미지 컨텍스트 메뉴 (keep 패턴 참조) — 모바일 롱프레스·우클릭·클릭 진입점.
//     기존 키보드 핸들러 (Backspace/Delete/Cmd+C/Cmd+X) 와 동등 액션을 메뉴로 노출.
let _imgCtxMenu = null;
let _imgCtxTarget = null;
let _imgLpTimer = null;
let _imgLpStartX = 0;
let _imgLpStartY = 0;
let _imgCtxInstalled = false;

function _ensureImgCtxMenu() {
  if (_imgCtxMenu) return _imgCtxMenu;
  _imgCtxMenu = document.createElement('div');
  _imgCtxMenu.className = 'doc-img-ctxmenu';
  _imgCtxMenu.setAttribute('role', 'menu');
  _imgCtxMenu.innerHTML = `
    <button type="button" data-act="copy" role="menuitem">복사</button>
    <button type="button" data-act="delete" role="menuitem">삭제</button>
  `;
  document.body.appendChild(_imgCtxMenu);
  _imgCtxMenu.addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.target?.closest?.('[data-act]');
    if (!btn) return;
    await _imgCtxAction(btn.dataset.act);
    _hideImgCtxMenu();
  });
  return _imgCtxMenu;
}

function _showImgCtxMenu(x, y) {
  const menu = _ensureImgCtxMenu();
  menu.classList.add('open');
  // measure → 화면 안 클램핑
  const rect = menu.getBoundingClientRect();
  let left = Math.min(x, window.innerWidth - rect.width - 8);
  let top = Math.min(y, window.innerHeight - rect.height - 8);
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}

function _hideImgCtxMenu() {
  if (_imgCtxMenu) _imgCtxMenu.classList.remove('open');
}

async function _imgCtxAction(action) {
  if (!_imgCtxTarget) return;
  const img = _imgCtxTarget;
  if (action === 'delete') {
    if (_selectedImg === img) _deselectImage();
    img.remove();
    _imgCtxTarget = null;
    const body = document.querySelector('article.doc .doc__body[contenteditable]');
    body?.dispatchEvent?.(new Event('input', { bubbles: true }));
    return;
  }
  if (action === 'copy') {
    const src = img.getAttribute('src') || '';
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.write) {
        const blob = await fetch(src).then((r) => r.blob());
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(src);
      }
    } catch (err) {
      try {
        await navigator.clipboard?.writeText?.(src);
      } catch (_) {
        console.warn('[entries] image ctx copy 실패:', err?.message || err);
      }
    }
    return;
  }
}

function installImageContextMenu() {
  if (_imgCtxInstalled) return;
  if (typeof document === 'undefined') return;
  _imgCtxInstalled = true;

  // 클릭 → select + 메뉴 (기존 installImageClickHandler 의 click 도 _selectImage 호출 — 여기는 메뉴 노출만)
  document.addEventListener('click', (e) => {
    const img = e.target?.closest?.('article.doc .doc__body img');
    if (!img) return;
    _imgCtxTarget = img;
    const r = img.getBoundingClientRect();
    let x = r.left + r.width / 2;
    let y = r.bottom + 8;
    if (y + 100 > window.innerHeight) y = Math.max(8, r.top - 88);
    _showImgCtxMenu(x, y);
  });

  // 우클릭 (데스크톱)
  document.addEventListener('contextmenu', (e) => {
    const img = e.target?.closest?.('article.doc .doc__body img');
    if (!img) return;
    e.preventDefault();
    _imgCtxTarget = img;
    _selectImage(img);
    _showImgCtxMenu(e.clientX, e.clientY);
  });

  // 모바일 롱프레스 — touchstart 500ms, 8px 이내 이동만
  document.addEventListener('touchstart', (e) => {
    const img = e.target?.closest?.('article.doc .doc__body img');
    if (!img) return;
    const t = e.touches?.[0];
    if (!t) return;
    _imgLpStartX = t.clientX;
    _imgLpStartY = t.clientY;
    clearTimeout(_imgLpTimer);
    _imgLpTimer = setTimeout(() => {
      _imgCtxTarget = img;
      _selectImage(img);
      try { navigator.vibrate?.(15); } catch (_) {}
      _showImgCtxMenu(_imgLpStartX, _imgLpStartY);
    }, 500);
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    const t = e.touches?.[0];
    if (!t || !_imgLpTimer) return;
    if (Math.abs(t.clientX - _imgLpStartX) > 8 || Math.abs(t.clientY - _imgLpStartY) > 8) {
      clearTimeout(_imgLpTimer);
      _imgLpTimer = null;
    }
  }, { passive: true });
  document.addEventListener('touchend', () => {
    clearTimeout(_imgLpTimer);
    _imgLpTimer = null;
  }, { passive: true });

  // 외부 클릭/터치 → 닫기 (capture 단계, 메뉴/이미지 외)
  const outsideHandler = (e) => {
    if (!_imgCtxMenu?.classList.contains('open')) return;
    if (e.target?.closest?.('.doc-img-ctxmenu')) return;
    if (e.target?.closest?.('article.doc .doc__body img')) return;
    _hideImgCtxMenu();
  };
  document.addEventListener('mousedown', outsideHandler, true);
  document.addEventListener('touchstart', outsideHandler, { capture: true, passive: true });

  // Esc / 스크롤 → 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _hideImgCtxMenu();
  });
  window.addEventListener('scroll', _hideImgCtxMenu, true);
}

// ─── recents 우클릭(데스크톱) / 롱프레스(모바일·태블릿) → popover 메뉴 ("삭제") → 즉시 softDelete.
//     모달 confirm 생략 — softDelete 는 휴지통 복구 가능 (위험도 낮음).
//     스타일은 .doc-img-ctxmenu 와 공유 (DESIGN.md popover 토큰).
let _recentsDelInstalled = false;
let _recentsLpTimer = null;
let _recentsLpStartX = 0;
let _recentsLpStartY = 0;
let _recentsSuppressNextClick = false;
let _recentsCtxMenu = null;
let _recentsCtxTargetId = null;

function _ensureRecentsCtxMenu() {
  if (_recentsCtxMenu) return _recentsCtxMenu;
  _recentsCtxMenu = document.createElement('div');
  _recentsCtxMenu.className = 'doc-img-ctxmenu recents-ctxmenu';
  _recentsCtxMenu.setAttribute('role', 'menu');
  _recentsCtxMenu.innerHTML = `<button type="button" data-act="delete" role="menuitem">삭제</button>`;
  document.body.appendChild(_recentsCtxMenu);
  _recentsCtxMenu.addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.target?.closest?.('[data-act]');
    if (!btn) return;
    const id = _recentsCtxTargetId;
    _hideRecentsCtxMenu();
    if (!id) return;
    try {
      await Queries.softDeleteEntry(id);
      const article = document.querySelector(`article.doc[data-entry-id="${id}"]`);
      if (article) article.remove();
      const kind = getCurrentKind(document);
      if (kind) await handleCategoryActive(kind);
    } catch (err) {
      console.warn('[entries] recents 삭제 실패:', err?.message || err);
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert('삭제에 실패했습니다.');
      }
    }
  });
  return _recentsCtxMenu;
}

function _showRecentsCtxMenu(id, x, y) {
  const menu = _ensureRecentsCtxMenu();
  _recentsCtxTargetId = id;
  menu.classList.add('open');
  const rect = menu.getBoundingClientRect();
  let left = Math.min(x, window.innerWidth - rect.width - 8);
  let top = Math.min(y, window.innerHeight - rect.height - 8);
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}

function _hideRecentsCtxMenu() {
  if (_recentsCtxMenu) _recentsCtxMenu.classList.remove('open');
  _recentsCtxTargetId = null;
}

function installRecentsDeleteHandler() {
  if (_recentsDelInstalled) return;
  if (typeof document === 'undefined') return;
  _recentsDelInstalled = true;

  // 데스크톱 우클릭 → 마우스 위치 popover
  document.addEventListener('contextmenu', (e) => {
    const item = e.target?.closest?.('.sb__item--recent[data-doc-id]');
    if (!item) return;
    // 파트너 공유 글 (recent-share span 보유) 은 우클릭 메뉴 차단 — 삭제 진입점 가드
    if (item.querySelector('.recent-share')) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const id = item.dataset.docId;
    if (id) _showRecentsCtxMenu(id, e.clientX, e.clientY);
  });

  // 롱프레스 후 합성 click 1회 차단 (기존 recents click 핸들러 회귀 방지)
  document.addEventListener('click', (e) => {
    if (!_recentsSuppressNextClick) return;
    if (!e.target?.closest?.('.sb__item--recent[data-doc-id]')) return;
    e.stopPropagation();
    e.preventDefault();
    _recentsSuppressNextClick = false;
  }, true);

  // 모바일/태블릿 롱프레스 — 500ms, 8px 이내. 터치 위치 popover.
  document.addEventListener('touchstart', (e) => {
    const item = e.target?.closest?.('.sb__item--recent[data-doc-id]');
    if (!item) return;
    // 파트너 공유 글 (recent-share span 보유) 은 롱프레스 메뉴 차단
    if (item.querySelector('.recent-share')) return;
    const t = e.touches?.[0];
    if (!t) return;
    _recentsLpStartX = t.clientX;
    _recentsLpStartY = t.clientY;
    clearTimeout(_recentsLpTimer);
    _recentsLpTimer = setTimeout(() => {
      try { navigator.vibrate?.(15); } catch (_) {}
      _recentsSuppressNextClick = true;
      setTimeout(() => { _recentsSuppressNextClick = false; }, 1000);
      const id = item.dataset.docId;
      if (id) _showRecentsCtxMenu(id, _recentsLpStartX, _recentsLpStartY);
    }, 500);
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    const t = e.touches?.[0];
    if (!t || !_recentsLpTimer) return;
    if (Math.abs(t.clientX - _recentsLpStartX) > 8 || Math.abs(t.clientY - _recentsLpStartY) > 8) {
      clearTimeout(_recentsLpTimer);
      _recentsLpTimer = null;
    }
  }, { passive: true });
  document.addEventListener('touchend', () => {
    clearTimeout(_recentsLpTimer);
    _recentsLpTimer = null;
  }, { passive: true });

  // 외부 클릭/터치/Esc/scroll 시 메뉴 닫기
  const outsideClose = (e) => {
    if (!_recentsCtxMenu?.classList.contains('open')) return;
    if (e.target?.closest?.('.recents-ctxmenu')) return;
    _hideRecentsCtxMenu();
  };
  document.addEventListener('mousedown', outsideClose, true);
  document.addEventListener('touchstart', outsideClose, { capture: true, passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _hideRecentsCtxMenu();
  });
  window.addEventListener('scroll', _hideRecentsCtxMenu, true);
}

let _imageInsertInstalled = false;
let _imageInputEl = null;
function installImageInsertHandler() {
  if (_imageInsertInstalled) return;
  if (typeof document === 'undefined') return;
  _imageInsertInstalled = true;
  // hidden file input 1회 생성 (재사용)
  _imageInputEl = document.createElement('input');
  _imageInputEl.type = 'file';
  _imageInputEl.accept = 'image/*';
  _imageInputEl.style.display = 'none';
  document.body.appendChild(_imageInputEl);
  // mousedown capture — button focus 차단 + selection 저장
  document.addEventListener('mousedown', (e) => {
    const btn = e.target?.closest?.('.edit-toolbar [title="이미지 삽입"]');
    if (!btn) return;
    e.preventDefault();
    saveSelection();
  }, true);
  // click capture — file picker open
  document.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('.edit-toolbar [title="이미지 삽입"]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    _imageInputEl.value = ''; // 같은 파일 재선택 가능
    _imageInputEl.click();
  }, true);
  // file change → compress + insertImage
  _imageInputEl.addEventListener('change', async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    const result = await compressImage(file);
    if (!result?.ok) {
      console.warn('[entries] 이미지 압축 실패:', result?.reason || 'unknown');
      if (typeof window.alert === 'function') {
        if (result?.reason === 'heic_convert_failed') {
          window.alert('HEIC 파일 변환에 실패했습니다. JPEG/PNG 로 변환 후 다시 시도해주세요.');
        } else if (result?.reason === 'unsupported_format') {
          window.alert('이미지 형식을 인식할 수 없습니다. JPEG/PNG/WebP/HEIC 지원.');
        }
      }
      return;
    }
    restoreSelection();
    if (typeof window !== 'undefined' && typeof window.getSelection === 'function') {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        const body = document.querySelector('article.doc .doc__body[contenteditable]');
        if (body) {
          body.focus();
          try {
            const range = document.createRange();
            range.selectNodeContents(body);
            range.collapse(false);
            sel?.removeAllRanges?.();
            sel?.addRange?.(range);
          } catch (_) {}
        }
      }
    }
    let imgSrc = result.dataUrl;
    try {
      const upload = await uploadImage(result.dataUrl, { user_id: _currentUser?.id });
      if (upload?.ok && upload.url) imgSrc = upload.url;
      else console.warn('[entries] Storage 업로드 실패, dataUrl fallback:', upload?.reason);
    } catch (err) {
      console.warn('[entries] uploadImage 예외:', err?.message || err);
    }
    try {
      document.execCommand('insertImage', false, imgSrc);
    } catch (err) {
      console.warn('[entries] insertImage 실패:', err?.message || err);
    }
  });
}

let _toolbarInstalled = false;
function installEditToolbarHandler() {
  if (_toolbarInstalled) return;
  if (typeof document === 'undefined') return;
  _toolbarInstalled = true;
  // capture phase mousedown — button focus 방지 + 현재 selection 저장
  document.addEventListener('mousedown', (e) => {
    const btn = e.target?.closest?.('.edit-toolbar [data-format]');
    if (!btn) return;
    e.preventDefault();
    saveSelection();
  }, true);
  // Wave 11.6.10 — click 도 capture phase 로 변경 (mocks IIFE 등 다른 listener 보다 먼저 실행).
  document.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('.edit-toolbar [data-format]');
    if (!btn) return;
    const format = btn.dataset?.format;
    if (!EDIT_TOOLBAR_FORMATS.has(format)) return;
    const arg = btn.dataset?.formatArg || null;
    e.preventDefault();
    e.stopPropagation();
    // 저장된 selection 복원 — button click 으로 contenteditable focus 손실 시 회피
    restoreSelection();
    // Wave 11.6.10 — selection 없을 시 .doc__body 강제 focus + cursor end (사용자가 toolbar 먼저 클릭한 경우)
    if (typeof window !== 'undefined' && typeof window.getSelection === 'function') {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        const body = document.querySelector('article.doc .doc__body[contenteditable]');
        if (body) {
          body.focus();
          try {
            const range = document.createRange();
            range.selectNodeContents(body);
            range.collapse(false);
            sel?.removeAllRanges?.();
            sel?.addRange?.(range);
          } catch (_) { /* range 설정 실패 무시 */ }
        }
      }
    }
    try {
      const ok = document.execCommand(format, false, arg);
      if (!ok) console.warn('[entries] execCommand returned false:', format, arg);
    } catch (err) {
      console.warn('[entries] execCommand 실패:', err?.message || err);
    }
  }, true);
}

let _docMoreInstalled = false;
function installDocMoreActionHandler() {
  if (_docMoreInstalled) return;
  if (typeof document === 'undefined') return;
  _docMoreInstalled = true;
  document.addEventListener('click', async (e) => {
    const item = e.target.closest?.('[data-doc-action]');
    if (!item) return;
    const action = item.dataset?.docAction;
    if (!DOC_MORE_ACTIONS.includes(action)) return;
    // mocks IIFE 의 alert('구현 예정') bubble listener 차단
    e.stopImmediatePropagation();
    closeDocMoreMenu();
    const article = document.querySelector('#mainView article.doc');
    if (!article) return;
    const id = article.dataset?.entryId;
    if (!id || id.startsWith('new-')) {
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert('아직 저장되지 않은 글입니다. 첫 입력 후 다시 시도해주세요.');
      }
      return;
    }
    if (action === 'delete') {
      if (article.dataset?.readOnly === '1') {
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert('파트너가 공유한 글은 삭제할 수 없습니다.');
        }
        return;
      }
      // Wave 11.5.10 — 커스텀 confirm modal (window.confirm fallback)
      let confirmed = true;
      const customConfirm = (typeof window !== 'undefined' && window.todayAccount?.confirmModal) || null;
      if (customConfirm) {
        confirmed = await customConfirm({
          title: '글 삭제',
          message: '이 글을 삭제하시겠어요? 휴지통에서 복구할 수 있습니다.',
          confirmLabel: '삭제',
          cancelLabel: '취소',
          danger: true,
        });
      } else if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        confirmed = window.confirm('이 글을 삭제하시겠어요? 휴지통에서 복구할 수 있습니다.');
      }
      if (!confirmed) return;
      const r = await handleDeleteAction(article);
      if (!r.ok && typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert('삭제에 실패했습니다.');
      }
    } else if (action === 'duplicate') {
      const r = await handleDuplicateAction(article, _currentUser);
      if (!r.ok && typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert('사본 만들기에 실패했습니다.');
      }
    } else if (action === 'export') {
      const r = await handleExportAction(article);
      if (!r.ok && typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert('내보내기에 실패했습니다.');
      }
    }
  }, true); // capture=true — mocks IIFE bubble listener 보다 먼저 발동
}

let _clickHandlerInstalled = false;

function installRecentsClickHandler() {
  if (_clickHandlerInstalled) return;
  if (typeof document === 'undefined') return;
  document.addEventListener('click', async (e) => {
    const recent = e.target.closest?.('.sb__item--recent[data-doc-id]');
    if (!recent) return;
    const id = recent.dataset.docId;
    if (!id) return;
    try {
      const row = await Queries.getEntry(id);
      if (row) renderDocFromRow(row);
    } catch (err) {
      // FIXTURE id 거나 미인증 — mocks 측 위임이 fallback 처리
    }
  });
  _clickHandlerInstalled = true;
}

// ───────────────────────────────────────────────────────────────────────────
// 카테고리 클릭 위임 — mocks IIFE setCategory 가 항상 FIXTURE 재렌더하므로
// SPA 가 클릭마다 (같은 카테고리 재클릭 포함) 진짜 데이터로 덮어씀.
// MutationObserver 는 active class 변경 시에만 발화 → 이미 active 인 카테고리
// 재클릭 시 미발화. 본 핸들러가 그 race 를 메움.
// ───────────────────────────────────────────────────────────────────────────

let _categoryClickInstalled = false;

function installCategoryClickHandler() {
  if (_categoryClickInstalled) return;
  if (typeof document === 'undefined') return;
  document.addEventListener('click', (e) => {
    const item = e.target.closest?.('.sb__item[data-category]');
    if (!item) return;
    const kind = item.dataset?.category;
    if (!kind) return;
    // 사용자 click 만 URL 카테고리로 복귀 (글 닫음). programmatic click (syncFromHash 의 sbTarget.click()) 시
    // isTrusted=false → hash 변경 skip — deep link URL 보존.
    if (e.isTrusted) {
      const target = `#/${kind}`;
      if (location.hash !== target) location.hash = target;
    }
    // mocks IIFE setCategory 가 동기로 FIXTURE 그림 → 다음 task 에서 SPA 가 진짜 데이터로 덮어씀.
    setTimeout(() => {
      handleCategoryActive(kind).catch((err) =>
        console.warn('[entries] category click reload 실패:', err?.message || err),
      );
    }, 0);
  });
  _categoryClickInstalled = true;
}

// ───────────────────────────────────────────────────────────────────────────
// spec §5.0 — 전체 목록 뷰 (편집 ↔ 리스트 모드 전환).
// ───────────────────────────────────────────────────────────────────────────

let _activeMainView = 'article';
let _listViewKind = null;
let _listViewFilter = 'all';
let _listViewRows = null;

export function getActiveMainView() {
  return _activeMainView;
}

function htmlToText(html) {
  return String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function charCount(html) {
  return htmlToText(html).replace(/\s/g, '').length;
}

function sheetCount(html) {
  return Math.round((charCount(html) / 200) * 10) / 10;
}

function makeExcerpt(html, max = 80) {
  const t = htmlToText(html);
  if (t.length <= max) return t;
  return t.slice(0, max) + '…';
}

function isPartnerRow(row, userId) {
  return !!(row?.owner_id && userId && row.owner_id !== userId);
}

export function computeListStats(rows, userId, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  let total = 0, thisYear = 0, thisMonth = 0, words = 0, sheets = 0;
  let shared = 0, sharedSoyeon = 0;
  for (const r of rows || []) {
    total++;
    const c = r.created_at ? new Date(r.created_at) : null;
    if (c && !Number.isNaN(c.getTime())) {
      if (c.getFullYear() === y) thisYear++;
      if (c.getFullYear() === y && c.getMonth() + 1 === m) thisMonth++;
    }
    words += countWords(r.content);
    sheets += sheetCount(r.content);
    if (r.is_shared && !isPartnerRow(r, userId)) shared++;
    if (isPartnerRow(r, userId) && r.is_shared) sharedSoyeon++;
  }
  return {
    total, thisYear, thisMonth,
    words,
    sheets: Math.round(sheets * 10) / 10,
    shared, sharedSoyeon,
  };
}

export function filterListRows(rows, filterId, userId) {
  if (filterId === 'shared') return (rows || []).filter((r) => r.is_shared && !isPartnerRow(r, userId));
  if (filterId === 'soyeon') return (rows || []).filter((r) => isPartnerRow(r, userId) && r.is_shared);
  return rows || [];
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}.${mm}.${dd}`;
}

function buildListBreadcrumbExtra(doc) {
  const top = doc.querySelector?.('.main__top .crumb');
  if (!top) return;
  if (top.querySelector?.('.crumb__sep--list')) return;
  const sep = doc.createElement('span');
  sep.className = 'crumb__sep crumb__sep--list';
  sep.textContent = '/';
  const active = doc.createElement('span');
  active.className = 'crumb__cat crumb__cat--list';
  active.textContent = '전체 보기';
  const numEl = top.querySelector?.('#crumbNum');
  if (numEl) {
    top.insertBefore(sep, numEl);
    top.insertBefore(active, numEl);
  } else {
    top.appendChild(sep);
    top.appendChild(active);
  }
  numEl?.classList?.add('is-empty');
}

function removeListBreadcrumbExtra(doc) {
  const top = doc.querySelector?.('.main__top .crumb');
  if (!top) return;
  top.querySelectorAll?.('.crumb__sep--list, .crumb__cat--list').forEach((el) => el.remove());
  top.querySelector?.('#crumbNum')?.classList?.remove('is-empty');
}

export function renderListView(kind, rows, doc = document, opts = {}) {
  const view = doc.getElementById('mainView');
  if (!view) return false;
  const userId = _currentUser?.id || null;
  const stats = computeListStats(rows, userId);
  const filterId = opts.filter || _listViewFilter || 'all';
  const filtered = filterListRows(rows, filterId, userId);
  const chip = (id, label, count, dotColor) => `
    <button type="button" class="doc-list__chip ${id === filterId ? 'is-active' : ''}" data-list-filter="${id}">
      ${dotColor ? `<span class="doc-list__chip-dot" style="background:${dotColor}"></span>` : ''}
      ${escapeHtml(label)}
      <span class="doc-list__chip-count">${count}</span>
    </button>`;
  const rowsHtml = filtered.map((r) => {
    const num = (r.id || '').toString().slice(0, 4).toUpperCase();
    const partnerShared = isPartnerRow(r, userId) && r.is_shared;
    const meta = `${fmtDate(r.created_at)} <span class="sep">·</span> ${countWords(r.content)}단어 <span class="sep">·</span> ${sheetCount(r.content)}매`;
    return `
      <div class="doc-list__row" data-doc-id="${escapeHtml(r.id)}">
        <span class="doc-list__no">#${escapeHtml(num)}</span>
        <div class="doc-list__main">
          <div class="doc-list__line1">
            <span class="doc-list__title">${escapeHtml(r.title || '제목 없음')}</span>
            ${partnerShared ? `<span class="doc-list__share">${escapeHtml(USER_ID_TO_DISPLAY_NAME[r.owner_id] || '소연')}</span>` : ''}
          </div>
          <div class="doc-list__excerpt">${escapeHtml(makeExcerpt(r.content))}</div>
        </div>
        <span class="doc-list__meta">${meta}</span>
      </div>`;
  }).join('');
  view.innerHTML = `
    <div class="doc-list" data-list-kind="${escapeHtml(kind)}">
      <div class="doc-list__stats">
        <div><div class="doc-list__stat-lab">총</div><div class="doc-list__stat-val">${stats.total}<span class="doc-list__stat-suf">편</span></div></div>
        <div><div class="doc-list__stat-lab">올해</div><div class="doc-list__stat-val">${stats.thisYear}<span class="doc-list__stat-suf">편</span></div></div>
        <div><div class="doc-list__stat-lab">이번달</div><div class="doc-list__stat-val">${stats.thisMonth}<span class="doc-list__stat-suf">편</span></div></div>
        <div><div class="doc-list__stat-lab">단어</div><div class="doc-list__stat-val">${stats.words.toLocaleString()}</div></div>
        <div><div class="doc-list__stat-lab">원고지</div><div class="doc-list__stat-val">${stats.sheets}<span class="doc-list__stat-suf">매</span></div></div>
      </div>
      ${(kind === 'navi' || kind === 'soyoun_navi') ? `
      <div class="doc-list__chips">
        ${chip('all', '전체', stats.total, null)}
        ${chip('shared', '내가 공유한 글', stats.shared, 'var(--crail-base)')}
        ${chip('soyeon', '소연이 공유한 글', stats.sharedSoyeon, 'var(--ink-2)')}
      </div>` : ''}
      <div class="doc-list__head">
        <span class="doc-list__head-no">NO.</span>
        <span class="doc-list__head-title">TITLE</span>
        <span class="doc-list__head-meta">DATE · WORDS · 원고지</span>
      </div>
      <div class="doc-list__body">${rowsHtml}</div>
    </div>`;
  return true;
}

export async function enterListView(kind, doc = document) {
  if (!WRITING_KINDS_FOR_LIST.includes(kind)) return false;
  try {
    const rows = await fetchEntriesForCategory(kind);
    _listViewKind = kind;
    _listViewRows = rows;
    _listViewFilter = 'all';
    _activeMainView = 'list';
    renderListView(kind, rows, doc);
    buildListBreadcrumbExtra(doc);
    {
      const composer = doc.querySelector?.('.bottombar .composer');
      if (composer) composer.style.display = 'none';
    }
    return true;
  } catch (e) {
    console.warn('[entries] enterListView 실패:', e?.message || e);
    return false;
  }
}

export function exitListView(doc = document) {
  _activeMainView = 'article';
  _listViewKind = null;
  _listViewRows = null;
  removeListBreadcrumbExtra(doc);
  {
    const composer = doc.querySelector?.('.bottombar .composer');
    if (composer) composer.style.display = '';
  }
}

let _listViewClickInstalled = false;
function installListViewClickHandler() {
  if (_listViewClickInstalled) return;
  if (typeof document === 'undefined') return;
  _listViewClickInstalled = true;
  document.addEventListener('click', async (e) => {
    const showAll = e.target.closest?.('[data-action="show-all-list"]');
    if (showAll) {
      const kind = getCurrentKind();
      if (kind && WRITING_KINDS_FOR_LIST.includes(kind)) await enterListView(kind);
      return;
    }
    const chipBtn = e.target.closest?.('.doc-list__chip[data-list-filter]');
    if (chipBtn && _activeMainView === 'list' && _listViewRows) {
      _listViewFilter = chipBtn.dataset.listFilter || 'all';
      renderListView(_listViewKind, _listViewRows, document, { filter: _listViewFilter });
      return;
    }
    const row = e.target.closest?.('.doc-list__row[data-doc-id]');
    if (row && _activeMainView === 'list') {
      const id = row.dataset.docId;
      if (!id) return;
      try {
        const entry = await Queries.getEntry(id);
        if (entry) {
          exitListView();
          renderDocFromRow(entry);
        }
      } catch (err) {
        console.warn('[entries] list row click 실패:', err?.message || err);
      }
      return;
    }
    const crumbCat = e.target.closest?.('.main__top #crumbCat');
    if (crumbCat && _activeMainView === 'list') {
      const kind = getCurrentKind();
      exitListView();
      if (kind) await handleCategoryActive(kind);
    }
  });
  document.addEventListener('keydown', async (e) => {
    if (e.key !== 'Escape') return;
    if (_activeMainView !== 'list') return;
    const kind = getCurrentKind();
    exitListView();
    if (kind) await handleCategoryActive(kind);
  });
}

// ───────────────────────────────────────────────────────────────────────────
// public API (main.js 가 호출)
// ───────────────────────────────────────────────────────────────────────────

export function mountEntriesView(user) {
  if (!user?.id) return;
  _currentUser = user;
  // 2026-05-04 — mocks IIFE setCategory('navi') 가 FIXTURE 재렌더하는 race 차단.
  // handleCategoryActive 의 비동기 fetch 가 끝나기 전까지 빈 사이드바 (수십 ms) — 더미보다 UX 우월.
  clearRecentsList();
  injectEditorStyles();
  installRecentsClickHandler();
  // Wave 11.X — 재마운트 시 IME 추적 reset (article 교체 race 방어).
  _composingArticle = null;
  installCategoryClickHandler();
  installListViewClickHandler();
  installNewDocHandler();
  installEditorInput();
  installPasteHandler();
  installDropHandler();
  installShareToggleHandler();
  installDocMoreActionHandler();
  annotateEditToolbar();
  installEditToolbarHandler();
  installImageInsertHandler();
  installImageClickHandler();
  installImageContextMenu();
  installRecentsDeleteHandler();
  observeCategoryChange(handleCategoryActive);
  // Wave 11.5.3.3 — Realtime listener 등록 (재마운트 시 unregister 후 재등록)
  if (_realtimeUnregister) _realtimeUnregister();
  _realtimeUnregister = Sync.onRealtimeChange((payload) => {
    handleRealtimeEntryChange(payload).catch((e) =>
      console.warn('[entries] realtime handler 실패:', e?.message || e),
    );
  });
  // deep link URL (`#/kind/N`) 이면 마운트 직후 해당 글 로드 — 새로고침/직접 입력 후 글 복원 보장.
  loadEntryFromDeepLink(user).catch((e) =>
    console.warn('[entries] deep link 글 로드 실패', e?.message || e),
  );
}

/** mountEntriesView 직후 URL hash 에 entry number 가 있으면 해당 글 자동 로드.
 *  - `#/kind/num` → 본인 글
 *  - `#/kind/slug/num` → partner (slug owner) 글
 */
async function loadEntryFromDeepLink(user) {
  if (typeof location === 'undefined') return;
  const parsed = parseEntryDeepLink(location.hash, user.id);
  if (!parsed) return;
  const { kind, ownerId, num } = parsed;
  _deepLinkInProgress = true;
  try {
    const row = await Queries.getEntryByKindNumber(ownerId, kind, num);
    if (row) {
      renderDocFromRow(row);
    } else {
      // 잘못된 번호 — URL 만 카테고리로 정정 + 첫 글 자동 표시 허용
      history.replaceState(null, '', `#/${kind}`);
      _deepLinkInProgress = false;
      await handleCategoryActive(kind);
    }
  } finally {
    setTimeout(() => { _deepLinkInProgress = false; }, 500);
  }
}

/** deep link hash 파싱 → { kind, ownerId, num } 또는 null.
 *  `#/kind/num` (본인) / `#/kind/slug/num` (partner). currentUserId = 본인 fallback owner. */
export function parseEntryDeepLink(hash, currentUserId) {
  const raw = String(hash || '').replace(/^#\//, '');
  const parts = raw.split('/');
  const kind = parts[0];
  if (!['navi', 'fiction', 'blog', 'memo'].includes(kind)) return null;
  if (parts.length === 2 && /^\d+$/.test(parts[1])) {
    // 본인 글
    return { kind, ownerId: currentUserId, num: parseInt(parts[1], 10) };
  }
  if (parts.length === 3 && /^\d+$/.test(parts[2])) {
    // partner 글 — slug
    const ownerId = SLUG_TO_USER_ID[parts[1]];
    if (!ownerId) return null;
    return { kind, ownerId, num: parseInt(parts[2], 10) };
  }
  return null;
}

export function rebindCategoryObserver() {
  if (_onCategoryChange) observeCategoryChange(_onCategoryChange);
}

export const Entries = {
  ENTRY_KINDS: Queries.ENTRY_KINDS,
  mountEntriesView,
  rebindCategoryObserver,
  // spec §5.0 — 전체 목록 뷰
  computeListStats,
  filterListRows,
  renderListView,
  enterListView,
  exitListView,
  getActiveMainView,
  // 파트너 글 read-only
  isReadOnlyRow,
  debounce,
  // Wave 11.5.2b — 어댑터 + DOM 패치
  rowToMockDoc,
  buildMockMeta,
  formatSavedTime,
  countWords,
  escapeHtml,
  renderRecentsFromRows,
  ensureRecentsMore,
  removeRecentsMore,
  renderDocFromRow,
  parseEntryDeepLink,
  // Wave 11.5.2b — 자동저장
  getCurrentKind,
  setSaveStatus,
  saveArticle,
  wrapNewArticle,
  // 사용자 요청 2026-05-13 — 카테고리별 본인 글 누적 카운트
  computeEntryNumber,
  // Wave 11.5.2b hotfix — placeholder CSS
  injectEditorStyles,
  // 별 wave hotfix — is_shared 토글
  syncShareToggleFromRow,
  // Wave 11.5.3.3 — Realtime 충돌 해결
  isEditorDirty,
  markArticleDirty,
  clearArticleDirty,
  // Wave 11.X — IME composition 가드 (한글 입력 중 caret 점프 방지)
  isComposing,
  _setComposingForTest,
  _clearComposingForTest,
  // Wave 11.X-2 — 자기 push echo skip (caret 점프 잔존 회귀 차단)
  _recordSelfPushForTest,
  _clearSelfPushForTest,
  // self save inflight skip — realtime broadcast 가 REST 응답보다 빨리 도착하는 race 차단.
  _setSelfInflightForTest,
  _clearSelfInflightForTest,
  // Wave 11.X-3 — caret save/restore (WebKit textNode 교체 시 caret 보존)
  getCaretOffset,
  setCaretOffset,
  showServerUpdateBadge,
  hideServerUpdateBadge,
  handleRealtimeEntryChange,
  // 회귀 (b) fix — notifications.js 가 entry_unshared 받으면 호출
  scheduleRecentsRefresh,
  // Wave 11.7.3 — navi 합집합 fetch
  fetchEntriesForCategory,
  // Wave 11.5.8 — 에디터 ⋯ 메뉴 (사본 / 내보내기 / 글 삭제) Dexie wiring
  handleDeleteAction,
  handleDuplicateAction,
  handleExportAction,
  entryToExportJson,
  // 별 wave A — edit-toolbar B/I/U/S
  annotateEditToolbar,
  // Wave 11.7 — 이미지 삽입 (canvas 압축 + execCommand)
  calcCompressionDimensions,
  compressImage,
  // Wave 11.10 — 정사각 center crop (avatar 압축)
  calcSquareCropRect,
  // Wave 11.8 — Supabase Storage 업로드 (phase 2)
  uploadImage,
  // Wave 11.9 — HEIC 변환 (iPhone Safari)
  isHeicFile,
  convertHeicToJpeg,
  // Wave 11.5.11 — fixture clear
  clearRecentsList,
  clearMainViewEmpty,
};

if (typeof window !== 'undefined') {
  window.todayEntries = Entries;
}

export default Entries;
