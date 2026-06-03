/**
 * Comments integration layer (Wave 11.7.1 — 댓글 CRUD + composer + Realtime).
 *
 * 책임:
 *  - mocks `.bottombar .composer` Enter key → `Queries.createComment`
 *  - article 마운트 시 `Queries.listCommentsByEntry` → `<section class="doc__comments">` 렌더
 *  - Sync.onRealtimeChange → `today_comments` 변경 시 dedup + append/remove
 *  - 자기 댓글 삭제 — `[data-comment-id][data-mine="1"]` 의 '삭제' click → `softDeleteComment`
 *  - is_shared=false entry → composer 비활성 (spec §11 RLS L297 — is_shared=true 만 댓글 작성 가능)
 *
 * Clean Room 정합:
 *  - mocks/today-mac.html L3357-3367 의 bottombar composer DOM 그대로
 *  - 댓글 영역 (`.doc__comments`) UI 는 mocks 미정 — 본 wave 는 단순 패널 + 별 wave 에서 디자인
 */
import { Queries } from '../db/queries.js';
import { Sync } from '../db/sync.js';
import { USER_ID_TO_DISPLAY_NAME, CLAUDE_USER_ID, getCurrentKind, scheduleRecentsRefresh } from './entries.js';
import { supabase } from '../services/supabase.js';

let _currentUser = null;
let _composerInstalled = false;
let _articleObserverInstalled = false;
let _commentDeleteInstalled = false;
let _realtimeUnregister = null;
let _articleObserver = null;
let _stylesInjected = false;
// author_id → 사용자가 설정한 프로필 사진 URL. today_profiles 에서 로드 (RLS: 본인+파트너 row 만 노출).
let _avatarUrlById = {};
// Wave 11.6.8a — 댓글 입력 직후 즉시 UI append 한 id 추적. Realtime echo 가 같은 id 로 도달 시 skip (race 방어)
const _pendingCommentIds = new Set();
// Wave 11.6.10 — composer 처리 중 (in-flight) flag. 빠른 Enter 두 번 시 createComment 재호출 차단.
let _composerSubmitting = false;
function markPendingComment(id) {
  if (!id) return;
  _pendingCommentIds.add(id);
  setTimeout(() => _pendingCommentIds.delete(id), 5000);
}

/** 새 댓글 버블 등장 애니메이션 1회 (prefers-reduced-motion 시 CSS가 무효화). */
function animateCommentEnter(rowEl) {
  if (!rowEl || !rowEl.classList) return;
  rowEl.classList.add('comment-row--enter');
  rowEl.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  const done = () => rowEl.classList?.remove('comment-row--enter');
  rowEl.addEventListener?.('animationend', done, { once: true });
  setTimeout(done, 700);
}

const TIME_FORMATTER_OPTS = { hour: '2-digit', minute: '2-digit', hour12: false };

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** ISO timestamp → 'HH:MM' (오늘) 또는 'M월 D일' (다른 날). */
export function formatCommentTime(iso, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (d.toDateString() === now.toDateString()) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 클로드(AI) 아바타 — Anthropic 마크를 단순화한 스파크(asterisk) 인라인 SVG (픽셀-정확 공식 로고 아님).
const CLAUDE_LOGO_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="6.3" y1="6.3" x2="17.7" y2="17.7"/><line x1="6.3" y1="17.7" x2="17.7" y2="6.3"/></svg>';
// 사용자별 아바타 배경색.
const AVATAR_COLORS = Object.freeze({
  '7bae5645-61c6-4476-9ff2-4c30a72812ff': '#7a8b6f', // 지오
  'aeafd9a7-4094-4e7c-a621-188d6b2e336d': '#c98aa6', // 소연
});
const CLAUDE_CLAY = '#d97757';

/**
 * author_id 기준 아바타 1개.
 *  - 클로드(AI): 프로필 사진 없음 → 스파크 SVG 유지.
 *  - 사람 + 사용자가 설정한 사진(avatarUrl) 있음 → 사진 이미지.
 *  - 사람 + 사진 없음 → 이니셜 + 색 폴백.
 */
function avatarHtml(authorId, name, avatarUrl) {
  if (authorId === CLAUDE_USER_ID) {
    return `<span class="comment-row__avatar comment-row__avatar--claude" style="background:${CLAUDE_CLAY}">${CLAUDE_LOGO_SVG}</span>`;
  }
  if (avatarUrl) {
    return `<span class="comment-row__avatar comment-row__avatar--photo"><img src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
  }
  const color = AVATAR_COLORS[authorId] || 'var(--cloudy-base, #6a9bcc)';
  const initial = escapeHtml(String(name || '?').charAt(0));
  return `<span class="comment-row__avatar" style="background:${color}">${initial}</span>`;
}

/**
 * Dexie comment row → HTML row. mine = author_id === currentUser.id.
 * Wave 11.6.9 — 카카오톡/iMessage 스타일 메시지 버블. mine 우측 / 그 외 좌측.
 * 사용자별 아바타: 라벨·아바타를 author_id 기준 결정 (지오/소연/클로드). 전원 아바타 노출.
 */
export function commentToHtml(comment, opts = {}) {
  const id = escapeHtml(comment?.id || '');
  const body = escapeHtml(comment?.body || '');
  const time = escapeHtml(formatCommentTime(comment?.created_at));
  const authorId = comment?.author_id || '';
  const mine = opts.mine === true || authorId === opts.currentUserId;
  const name = USER_ID_TO_DISPLAY_NAME[authorId] || opts.partnerName || '소연';
  const authorLabel = mine ? '나' : name;
  const deleteBtn = mine
    ? `<button class="comment-row__delete" data-comment-id="${id}" aria-label="댓글 삭제">삭제</button>`
    : '';
  const avatarMap = opts.avatarUrlById || _avatarUrlById;
  const avatarUrl = authorId ? avatarMap[authorId] : null;
  const avatar = avatarHtml(authorId, name, avatarUrl);
  return `<div class="comment-row" data-comment-id="${id}" data-mine="${mine ? '1' : '0'}">${avatar}<div class="comment-row__col"><div class="comment-row__meta"><span class="comment-row__author">${escapeHtml(authorLabel)}</span><span class="comment-row__time">${time}</span>${deleteBtn}</div><div class="comment-row__bubble">${body}</div></div></div>`;
}

/** 댓글 영역 자체 HTML (rows 반복 호출). Wave 11.6.8a — comments=0 시 빈 string (영역 자체 미렌더). */
export function commentsToSectionHtml(comments, opts = {}) {
  const list = (comments || []).map((c) => commentToHtml(c, opts)).join('');
  if (!list) return '';
  const count = (comments || []).length;
  return `<section class="doc__comments"><div class="doc__comments-header">댓글 <span class="doc__comments-count">${count}</span></div><div class="doc__comments-list">${list}</div></section>`;
}

/** 댓글 영역 CSS (mocks 미정 영역 — SPA 가 1회 주입). */
function injectCommentStyles(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return;
  if (_stylesInjected) return;
  if (doc.getElementById('today-comments-styles')) {
    _stylesInjected = true;
    return;
  }
  const style = doc.createElement('style');
  style.id = 'today-comments-styles';
  style.textContent = `
    /* Wave 11.6.9 — 카카오톡/iMessage 스타일 메시지 버블. mine 우측 갈색 / partner 좌측 흰. */
    .doc__comments {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid var(--line, oklch(92% 0.006 60));
    }
    .doc__comments-header {
      font-size: 15px;
      font-weight: 600;
      color: var(--ink-2, oklch(38% 0.008 60));
      margin-bottom: 16px;
      letter-spacing: -0.01em;
    }
    .doc__comments-count {
      font-family: var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
      font-size: 12px;
      font-weight: 500;
      color: var(--ink-3, oklch(56% 0.008 60));
      margin-left: 4px;
    }
    .doc__comments-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .comment-row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }
    .comment-row[data-mine="1"] {
      flex-direction: row-reverse;
    }
    .comment-row__avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      flex-shrink: 0;
      letter-spacing: -0.02em;
      background: var(--cloudy-base, #6a9bcc);
    }
    .comment-row__col {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 70%;
    }
    .comment-row__meta {
      display: flex;
      gap: 6px;
      align-items: center;
      font-size: 11px;
      color: var(--ink-4, oklch(72% 0.006 60));
    }
    .comment-row[data-mine="1"] .comment-row__meta {
      flex-direction: row-reverse;
    }
    .comment-row__author {
      font-weight: 600;
      color: var(--ink-3, oklch(56% 0.008 60));
    }
    .comment-row__time {
      font-family: var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
      font-variant-numeric: tabular-nums;
    }
    .comment-row__delete {
      background: transparent;
      border: 0;
      padding: 0;
      font-size: 11px;
      color: var(--ink-4, oklch(72% 0.006 60));
      cursor: pointer;
      opacity: 0;
      transition: opacity .12s ease;
    }
    .comment-row:hover .comment-row__delete,
    .comment-row:focus-within .comment-row__delete {
      opacity: 1;
    }
    .comment-row__delete:hover { color: var(--ink-1, oklch(22% 0.008 60)); }
    .comment-row__bubble {
      padding: 10px 14px;
      font-size: 15px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
    /* Wave 11.6.11b → 보강(세션3 화면검증). 배경은 페이지(--shell 253) 대비로 판단해야 함:
       mine = --hover-bg (243) → Δ10 보임. partner = --sidebar (255) → Δ2 "흰 위 흰" 안 보임.
       이전 "12/255 확장"은 mine↔partner 버블끼리 비교라 오류였음 (버블↔페이지가 핵심).
       partner 는 1px --line 테두리로 가시화 (카카오톡 수신 버블). 모노톤 유지. */
    .comment-row[data-mine="1"] .comment-row__bubble {
      background: var(--hover-bg);
      color: var(--ink-1, oklch(22% 0.008 60));
      border-radius: 16px 16px 4px 16px;
    }
    .comment-row[data-mine="0"] .comment-row__bubble {
      background: var(--sidebar);
      color: var(--ink-1, oklch(22% 0.008 60));
      border: 1px solid var(--line, oklch(92% 0.006 60));
      border-radius: 16px 16px 16px 4px;
    }
    .composer input[disabled] { opacity: 0.5; }
    .comment-row__avatar--claude svg { display: block; }
    /* 사용자 설정 프로필 사진 — 원형 clip. */
    .comment-row__avatar--photo { padding: 0; overflow: hidden; background: var(--hover-bg); }
    .comment-row__avatar--photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    /* 엔터 후 피드백 — 새 버블 슬라이드+페이드+살짝 over-bounce 등장 (~400ms). */
    @keyframes comment-row-enter {
      from { opacity: 0; transform: translateY(16px) scale(0.92); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    .comment-row--enter { animation: comment-row-enter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
    @media (prefers-reduced-motion: reduce) {
      .comment-row--enter { animation: none; }
    }
    /* 모바일 (≤720px) — 카톡 말풍선 → 노트(일기) 스타일 (사용자 결정 2026-05-28, 디자이너 시안 D1) */
    @media (max-width: 720px) {
      .doc__comments {
        margin-left: -16px;
        margin-right: -16px;
        padding-left: 16px;
        padding-right: 16px;
      }
      .doc__comments-list {
        gap: 0;
      }
      .comment-row,
      .comment-row[data-mine="1"] {
        flex-direction: row;
        gap: 10px;
        padding: 14px 0;
        border-bottom: 1px solid var(--line-soft, oklch(94.5% 0.006 60));
        align-items: flex-start;
      }
      .comment-row:last-child { border-bottom: 0; }
      .comment-row__col {
        max-width: none;
        flex: 1;
        min-width: 0;
        gap: 6px;
      }
      .comment-row[data-mine="1"] .comment-row__meta {
        flex-direction: row;
      }
      .comment-row__meta {
        gap: 8px;
      }
      .comment-row__bubble,
      .comment-row[data-mine="1"] .comment-row__bubble,
      .comment-row[data-mine="0"] .comment-row__bubble {
        background: transparent;
        border: 0;
        border-radius: 0;
        padding: 0;
        font-size: 17px;
        line-height: 1.55;
        word-break: keep-all;
        text-wrap: pretty;
        color: var(--ink-1, oklch(22% 0.008 60));
      }
      .comment-row__delete { opacity: 1; }
    }
  `;
  doc.head.appendChild(style);
  _stylesInjected = true;
}

/** article.dataset.entryId 기반 댓글 영역 mount. is_shared=false 는 댓글 영역 미마운트 + composer 비활성. */
export async function mountForArticle(article, opts = {}) {
  if (!article) return { ok: false, reason: 'no_article' };
  const id = article.dataset?.entryId;
  if (!id || id.startsWith('new-')) {
    // 새글 미저장 — 댓글 영역 정리 (이전 article 잔재 차단)
    const existing = article.querySelector?.('.doc__comments');
    if (existing) existing.remove();
    syncComposerState(false, opts.doc);
    return { ok: false, reason: 'unsaved' };
  }
  const userId = opts.currentUserId || _currentUser?.id || null;
  let row;
  try {
    row = await Queries.getEntry(id);
  } catch (e) {
    console.warn('[comments] getEntry 실패:', e?.message || e);
    return { ok: false, reason: 'getEntry_error' };
  }
  if (!row) return { ok: false, reason: 'not_found' };
  // 사용자 요청 2026-05-13: 본인 글이면 is_shared 무관 댓글 가능 (메모·추가내용 용도).
  // 파트너 글은 is_shared=true 일 때만 댓글 가능 (옛 정책 유지).
  const isOwner = !!(userId && row.owner_id === userId);
  const canComment = userId !== null && (isOwner || !!row.is_shared);
  syncComposerState(canComment, opts.doc);
  // 본인 글 또는 공유 글이면 댓글 영역 mount. 파트너 비공유 글만 미마운트.
  const existing = article.querySelector?.('.doc__comments');
  if (existing) existing.remove();
  if (!canComment) {
    return { ok: true, count: 0, canComment, mounted: false };
  }
  // 댓글 목록 로드
  let comments = [];
  try {
    comments = await Queries.listCommentsByEntry(id);
  } catch (e) {
    console.warn('[comments] listCommentsByEntry 실패:', e?.message || e);
  }
  // Wave 11.6.8a — 댓글 0건 시 영역 자체 미마운트 (commentsToSectionHtml 가 빈 string 반환)
  if (comments.length === 0) {
    return { ok: true, count: 0, canComment, mounted: false };
  }
  article.insertAdjacentHTML(
    'beforeend',
    commentsToSectionHtml(comments, { currentUserId: userId, partnerName: opts.partnerName }),
  );
  return { ok: true, count: comments.length, canComment, mounted: true };
}

/** composer 활성/비활성 + placeholder. */
export function syncComposerState(canComment, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return;
  const input = doc.querySelector?.('.bottombar .composer input');
  if (!input) return;
  if (canComment) {
    input.removeAttribute('disabled');
    input.setAttribute('placeholder', '댓글을 남겨보세요');
  } else {
    input.setAttribute('disabled', 'true');
    input.setAttribute('placeholder', '공유된 글에만 댓글을 달 수 있습니다');
    input.value = '';
  }
}

/**
 * composer Enter key wiring — capture phase.
 * (mocks IIFE 가 composer 에 listener 미등록 — capture 불필요 하지만 일관성)
 */
function installComposerHandler() {
  if (_composerInstalled) return;
  if (typeof document === 'undefined') return;
  _composerInstalled = true;
  // Wave 11.6.7 — disabled composer click 시 share 토글 안내 (visual hint)
  document.addEventListener('click', (e) => {
    const input = e.target?.closest?.('.bottombar .composer input');
    if (!input || !input.disabled) return;
    pulseShareToggle(document);
    console.info('[comments] 댓글 작성 불가 — 공유 토글 ON 후 가능 (is_shared=true 필요)');
  }, true);
  document.addEventListener('keydown', async (e) => {
    // Wave 11.6.10 — 한국어 IME 마무리 Enter (isComposing=true) skip. 빠른 Enter 두 번 시 in-flight flag 가 차단.
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    const input = e.target;
    if (!input || input.tagName !== 'INPUT') return;
    if (!input.matches?.('.bottombar .composer input')) return;
    const body = (input.value || '').trim();
    if (!body) return;
    if (input.disabled) {
      console.info('[comments] composer disabled — 공유된 글에만 댓글 작성 가능');
      pulseShareToggle(document);
      return;
    }
    e.preventDefault();
    // Wave 11.6.10 — in-flight flag (await 동안 추가 Enter 차단). createComment 재호출 방지.
    if (_composerSubmitting) return;
    const article = document.querySelector('#mainView article.doc');
    if (!article) {
      console.warn('[comments] article 미존재 — 댓글 작성 불가');
      return;
    }
    const entryId = article.dataset?.entryId;
    if (!entryId || entryId.startsWith('new-')) {
      console.info('[comments] entry 미저장 — 첫 글 입력 후 다시 시도');
      return;
    }
    if (!_currentUser?.id) {
      console.warn('[comments] _currentUser 미설정');
      return;
    }
    _composerSubmitting = true;
    // Wave 11.6.10 — client UUID 사전 생성 + markPendingComment 사전 등록 (Realtime echo race 차단).
    const tempId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null;
    if (tempId) markPendingComment(tempId);
    // 즉시 input.value 비우기 (사용자 빠른 Enter 두 번 시 두 번째 Enter 가 빈 body 로 차단)
    input.value = '';
    try {
      const row = await Queries.createComment({
        ...(tempId ? { id: tempId } : {}),
        entry_id: entryId,
        author_id: _currentUser.id,
        body,
      });
      // 댓글 영역이 아직 미마운트 (0건 상태) 면 mountForArticle 재호출로 영역 + 1건 마운트
      let list = article.querySelector('.doc__comments-list');
      if (!list) {
        await mountForArticle(article, { currentUserId: _currentUser.id });
        list = article.querySelector('.doc__comments-list');
      } else if (!list.querySelector(`[data-comment-id="${row.id}"]`)) {
        list.insertAdjacentHTML(
          'beforeend',
          commentToHtml(row, { currentUserId: _currentUser.id }),
        );
        updateCommentsHeaderCount(article);
      }
      notifyRecentsCountChange();
      // 엔터 피드백 — 새 버블 등장 애니메이션 + 가벼운 햅틱.
      const rowEl = list?.querySelector?.(`[data-comment-id="${row.id}"]`);
      if (rowEl) animateCommentEnter(rowEl);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate(10); } catch (_) {}
      }
    } catch (err) {
      console.warn('[comments] createComment 실패:', err?.message || err);
    } finally {
      _composerSubmitting = false;
    }
  }, true);
}

// Wave 11.6.7 — disabled composer 클릭 시 share 토글 시각 강조 (1.5s pulse)
function pulseShareToggle(doc) {
  if (!doc) return;
  const share = doc.querySelector('.share');
  if (!share) return;
  share.classList.add('share--pulse');
  setTimeout(() => share.classList.remove('share--pulse'), 1500);
}

/** 자기 댓글 삭제 button click → softDeleteComment + row.remove. */
function installCommentDeleteHandler() {
  if (_commentDeleteInstalled) return;
  if (typeof document === 'undefined') return;
  _commentDeleteInstalled = true;
  document.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('.comment-row__delete[data-comment-id]');
    if (!btn) return;
    e.stopImmediatePropagation();
    const id = btn.dataset?.commentId;
    if (!id) return;
    btn.disabled = true;
    try {
      await Queries.softDeleteComment(id);
      const row = btn.closest?.('.comment-row');
      const article = document.querySelector('#mainView article.doc');
      if (row && typeof row.remove === 'function') row.remove();
      // Wave 11.6.8a — 0건 시 영역 자체 제거 + 헤더 카운트 갱신
      if (article) {
        const list = article.querySelector?.('.doc__comments-list');
        if (list && list.querySelectorAll?.('.comment-row').length === 0) {
          const section = article.querySelector?.('.doc__comments');
          if (section) section.remove();
        } else {
          updateCommentsHeaderCount(article);
        }
      }
      notifyRecentsCountChange();
    } catch (err) {
      console.warn('[comments] softDeleteComment 실패:', err?.message || err);
      btn.disabled = false;
    }
  }, true);
}

/**
 * #mainView 의 article.doc 변경 감지 — entryId 가 바뀌면 댓글 영역 다시 mount.
 * mocks IIFE / SPA renderDocFromRow 양쪽이 article 을 다시 그리므로 MutationObserver.
 */
function installArticleObserver() {
  if (_articleObserverInstalled) return;
  if (typeof document === 'undefined') return;
  _articleObserverInstalled = true;
  const view = document.getElementById('mainView');
  if (!view) return;
  let lastEntryId = null;
  const handle = () => {
    const article = view.querySelector('article.doc');
    if (!article) {
      lastEntryId = null;
      return;
    }
    const id = article.dataset?.entryId;
    if (!id || id === lastEntryId) return;
    lastEntryId = id;
    mountForArticle(article).catch((e) =>
      console.warn('[comments] mountForArticle 실패:', e?.message || e),
    );
  };
  _articleObserver = new MutationObserver(handle);
  _articleObserver.observe(view, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-entry-id'] });
  // 초기 1회
  handle();
}

/**
 * Realtime payload 처리 — today_comments 변경 시 dedup + append/remove.
 */
export async function handleRealtimeCommentChange(payload, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!payload || payload.table !== 'today_comments') return { applied: false, reason: 'table_mismatch' };
  if (!doc) return { applied: false, reason: 'no_doc' };
  const eventType = payload.eventType;
  const newRow = payload.new;
  const oldRow = payload.old;
  const id = (newRow && newRow.id) || (oldRow && oldRow.id);
  if (!id) return { applied: false, reason: 'no_id' };
  const article = doc.querySelector?.('#mainView article.doc');
  if (!article) return { applied: false, reason: 'no_article' };
  const entryId = article.dataset?.entryId;
  if (!entryId) return { applied: false, reason: 'no_entry_id' };
  let list = article.querySelector?.('.doc__comments-list');
  // 회귀 5 fix — 빈 영역 미마운트 정책 + Realtime listener 가 영역 생성 안 함 → 첫 댓글 도달 시 mountForArticle 재호출
  if (!list && newRow && !newRow.deleted_at) {
    try {
      await mountForArticle(article, { doc, currentUserId: _currentUser?.id });
    } catch (e) {
      console.warn('[comments] realtime mount 실패:', e?.message || e);
      return { applied: false, reason: 'mount_failed' };
    }
    list = article.querySelector?.('.doc__comments-list');
    if (list) {
      // mountForArticle 이 listCommentsByEntry 결과 전체 렌더 — 추가 append 불필요
      notifyRecentsCountChange();
      return { applied: true, reason: 'mount_full', id };
    }
  }
  if (!list) return { applied: false, reason: 'no_list' };

  // DELETE / soft delete (deleted_at 채워짐)
  if (eventType === 'DELETE' || (newRow && newRow.deleted_at)) {
    const row = list.querySelector?.(`[data-comment-id="${id}"]`);
    if (row && typeof row.remove === 'function') row.remove();
    // 0건이 되면 영역 자체 제거 (사용자 정책 — 빈 영역 미렌더)
    if (list.querySelectorAll?.('.comment-row').length === 0) {
      const section = article.querySelector?.('.doc__comments');
      if (section) section.remove();
    } else {
      updateCommentsHeaderCount(article);
    }
    notifyRecentsCountChange();
    return { applied: true, reason: 'removed', id };
  }

  // INSERT / UPDATE (살아있는 row)
  if (!newRow) return { applied: false, reason: 'no_new_row' };
  if (newRow.entry_id !== entryId) return { applied: false, reason: 'entry_mismatch' };
  // Wave 11.6.10 — self-author skip (자기 댓글은 client 가 즉시 UI append 하므로 echo 불필요).
  // _pendingCommentIds Set 만 의존 시 race condition 위험 → author_id 기반 skip 이 더 robust.
  if (_currentUser?.id && newRow.author_id === _currentUser.id) {
    return { applied: true, reason: 'self_author_dedup', id };
  }
  // Wave 11.6.8a — pending Set dedup (즉시 UI append 한 id 의 echo skip)
  if (_pendingCommentIds.has(id)) return { applied: true, reason: 'pending_dedup', id };
  // DOM dedup
  if (list.querySelector?.(`[data-comment-id="${id}"]`)) return { applied: true, reason: 'dedup', id };
  list.insertAdjacentHTML(
    'beforeend',
    commentToHtml(newRow, { currentUserId: _currentUser?.id }),
  );
  updateCommentsHeaderCount(article);
  notifyRecentsCountChange();
  const enteredRow = list.querySelector?.(`[data-comment-id="${id}"]`);
  if (enteredRow) animateCommentEnter(enteredRow);
  return { applied: true, reason: 'appended', id };
}

/** 헤더 카운트 갱신 — `.doc__comments-list .comment-row` 개수. */
function updateCommentsHeaderCount(article) {
  if (!article) return;
  const list = article.querySelector?.('.doc__comments-list');
  const countEl = article.querySelector?.('.doc__comments-count');
  if (!list || !countEl) return;
  const n = list.querySelectorAll?.('.comment-row').length || 0;
  countEl.textContent = String(n);
}

/** 댓글 CUD/Realtime 직후 리센츠 댓글 카운트 자동 재반영 (Entries 200ms debounce 재사용).
 *  typeof document 가드 — vitest node 환경 등 document 없는 곳에서 no-op. */
function notifyRecentsCountChange() {
  if (typeof document === 'undefined') return;
  try {
    const k = getCurrentKind(document);
    if (k) scheduleRecentsRefresh(k, document);
  } catch (_) {
    /* 활성 카테고리 없거나 sidebar 미마운트 — 무시 */
  }
}

/** today_profiles 에서 본인+파트너 avatar_url 맵 로드 (RLS 로 두 row 만 노출). 클로드는 프로필 없음. */
async function loadAvatarMap() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('today_profiles').select('user_id, avatar_url');
    if (error) {
      console.warn('[comments] avatar 맵 로드 실패:', error.message);
      return;
    }
    const map = {};
    for (const p of data || []) {
      if (p?.user_id && p.avatar_url) map[p.user_id] = p.avatar_url;
    }
    _avatarUrlById = map;
  } catch (e) {
    console.warn('[comments] avatar 맵 로드 예외:', e?.message || e);
  }
}

export async function mountCommentsView(user) {
  if (!user?.id) return;
  _currentUser = user;
  if (typeof document === 'undefined') return;
  injectCommentStyles();
  await loadAvatarMap();
  installComposerHandler();
  installCommentDeleteHandler();
  installArticleObserver();
  if (_realtimeUnregister) _realtimeUnregister();
  _realtimeUnregister = Sync.onRealtimeChange((payload) => {
    handleRealtimeCommentChange(payload).catch((e) =>
      console.warn('[comments] realtime handler 실패:', e?.message || e),
    );
  });
}

/** 테스트 전용 — module-level state 리셋. */
export function __resetCommentsState() {
  _composerInstalled = false;
  _articleObserverInstalled = false;
  _commentDeleteInstalled = false;
  _stylesInjected = false;
  _composerSubmitting = false;
  _avatarUrlById = {};
  _pendingCommentIds.clear();
  if (_articleObserver) {
    try { _articleObserver.disconnect(); } catch (_) {}
    _articleObserver = null;
  }
  if (_realtimeUnregister) {
    try { _realtimeUnregister(); } catch (_) {}
    _realtimeUnregister = null;
  }
  _currentUser = null;
}

/** 회귀 5 fix — pullAll 완료 후 main.js .then() 호출. 현재 article 댓글 영역 재마운트. */
export async function refreshArticleComments(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return { ok: false, reason: 'no_doc' };
  const article = doc.querySelector?.('#mainView article.doc');
  if (!article) return { ok: false, reason: 'no_article' };
  return await mountForArticle(article, { doc, currentUserId: _currentUser?.id });
}

export const Comments = {
  mountCommentsView,
  mountForArticle,
  refreshArticleComments,
  syncComposerState,
  handleRealtimeCommentChange,
  commentToHtml,
  commentsToSectionHtml,
  formatCommentTime,
  escapeHtml,
};

if (typeof window !== 'undefined') {
  window.todayComments = Comments;
}

export default Comments;
