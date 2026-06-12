/**
 * Comments integration layer — 대화 패널 (Today 리디자인 §4.2).
 *
 * 책임:
 *  - mocks `#convoPanel` (우측 348px 대화 카드 / 모바일 시트) 에 글 전체 단일 타임라인 렌더
 *  - 날짜 구분 (가운데 모노 10px) + 사람 댓글 (아바타 24px) + 클로드 자동 댓글 (sunken 카드 + "자동" 태그 + 2줄 클램프)
 *  - composer (패널 하단 H44) Enter / 전송 버튼 → `Queries.createComment`
 *  - Sync.onRealtimeChange → `today_comments` 변경 시 dedup + append/remove
 *  - 자기 댓글 삭제 — `.cv-msg__del[data-comment-id]` click → `softDeleteComment`
 *  - is_shared=false 파트너 entry → composer 비활성 (spec §11 RLS — is_shared=true 만 댓글 작성 가능)
 *
 * 스크롤은 컨테이너 scrollTop 제어 (scrollIntoView 금지 — 작업지시서 §6).
 */
import { Queries } from '../db/queries.js';
import { Sync } from '../db/sync.js';
import { USER_ID_TO_DISPLAY_NAME } from './entries.js';

/** 클로드 자동 댓글 author UUID (supabase/migrations/0024_ai_comment_cron.sql 과 동일). */
export const CLAUDE_AUTHOR_ID = 'f74a3d8a-f449-4c25-82d1-509dc70a9988';

let _currentUser = null;
let _composerInstalled = false;
let _articleObserverInstalled = false;
let _commentDeleteInstalled = false;
let _moreToggleInstalled = false;
let _realtimeUnregister = null;
let _articleObserver = null;
// Wave 11.6.8a — 댓글 입력 직후 즉시 UI append 한 id 추적. Realtime echo 가 같은 id 로 도달 시 skip (race 방어)
const _pendingCommentIds = new Set();
// Wave 11.6.10 — composer 처리 중 (in-flight) flag. 빠른 Enter 두 번 시 createComment 재호출 차단.
let _composerSubmitting = false;
function markPendingComment(id) {
  if (!id) return;
  _pendingCommentIds.add(id);
  setTimeout(() => _pendingCommentIds.delete(id), 5000);
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** ISO timestamp → 'HH:MM'. 날짜 맥락은 타임라인 날짜 구분(.cv-day)이 담당. */
export function formatCommentTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** ISO timestamp → 날짜 구분 라벨 ('6월 4일'). */
export function formatDayLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** ISO → 로컬 날짜 키 ('2026-06-04') — 날짜 구분 그룹핑용. */
export function dayKeyOf(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 클로드 아바타 — crail 원형 + 흰 8방향 스파크 (✳ 형태, 별 4꼭지 금지 — §4.2)
const AI_SPARK_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8 2.2v11.6M2.2 8h11.6M3.9 3.9l8.2 8.2M12.1 3.9l-8.2 8.2"/></svg>';

/** author_id → 표시 이름. 클로드 / 지오 / 소연 / fallback (mine → '나', partner → partnerName). */
export function authorNameOf(authorId, opts = {}) {
  if (authorId === CLAUDE_AUTHOR_ID) return '클로드';
  const mapped = USER_ID_TO_DISPLAY_NAME[authorId];
  if (mapped) return mapped;
  return opts.mine ? '나' : (opts.partnerName || '소연');
}

/**
 * Dexie comment row → 타임라인 메시지 HTML.
 *  - 사람: 배경 없음, 아바타 24px + 이름/시각 + 본문 13.5px
 *  - 클로드 (author_id === CLAUDE_AUTHOR_ID): sunken 카드 R12 + "자동" 태그 + 2줄 클램프 + 더 보기
 *  - mine 일 때만 삭제 버튼 (hover 노출)
 */
export function commentToHtml(comment, opts = {}) {
  const id = escapeHtml(comment?.id || '');
  const body = escapeHtml(comment?.body || '');
  const time = escapeHtml(formatCommentTime(comment?.created_at));
  const isAi = comment?.author_id === CLAUDE_AUTHOR_ID;
  const mine = !isAi && (opts.mine === true || comment?.author_id === opts.currentUserId);
  const name = escapeHtml(authorNameOf(comment?.author_id, { mine, partnerName: opts.partnerName }));
  const deleteBtn = mine
    ? `<button class="cv-msg__del" data-comment-id="${id}" aria-label="댓글 삭제" type="button">삭제</button>`
    : '';
  if (isAi) {
    return `<div class="cv-msg cv-msg--ai" data-comment-id="${id}" data-mine="0" data-day="${escapeHtml(dayKeyOf(comment?.created_at))}"><span class="cv-msg__avatar cv-msg__avatar--ai">${AI_SPARK_SVG}</span><div class="cv-msg__main"><div class="cv-msg__card"><div class="cv-msg__head"><span class="cv-msg__name">${name}</span><span class="ai-tag">자동</span><span class="cv-msg__time">${time}</span></div><div class="cv-msg__body is-clamped">${body}</div><button class="cv-msg__more" type="button" hidden>더 보기</button></div></div></div>`;
  }
  const avatarClass = mine ? 'cv-msg__avatar--me' : 'cv-msg__avatar--partner';
  const initial = escapeHtml(name.charAt(0));
  return `<div class="cv-msg" data-comment-id="${id}" data-mine="${mine ? '1' : '0'}" data-day="${escapeHtml(dayKeyOf(comment?.created_at))}"><span class="cv-msg__avatar ${avatarClass}">${initial}</span><div class="cv-msg__main"><div class="cv-msg__head"><span class="cv-msg__name">${name}</span>${deleteBtn}<span class="cv-msg__time">${time}</span></div><div class="cv-msg__body">${body}</div></div></div>`;
}

/** 날짜 구분 HTML. */
export function dayDividerHtml(iso) {
  return `<div class="cv-day" data-day="${escapeHtml(dayKeyOf(iso))}">${escapeHtml(formatDayLabel(iso))}</div>`;
}

/** 댓글 배열 → 타임라인 inner HTML (날짜 구분 + 메시지). 빈 배열 → ''. */
export function commentsToSectionHtml(comments, opts = {}) {
  const rows = comments || [];
  if (!rows.length) return '';
  let html = '';
  let lastDay = null;
  for (const c of rows) {
    const day = dayKeyOf(c?.created_at);
    if (day && day !== lastDay) {
      html += dayDividerHtml(c.created_at);
      lastDay = day;
    }
    html += commentToHtml(c, opts);
  }
  return html;
}

// ───────────────────────────────────────────────────────────────────────────
// 패널 DOM 헬퍼
// ───────────────────────────────────────────────────────────────────────────

function panelList(doc = (typeof document !== 'undefined' ? document : null)) {
  return doc?.getElementById?.('convoList') || null;
}

function updateConvoCount(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return;
  const countEl = doc.getElementById?.('convoCount');
  const list = panelList(doc);
  if (!countEl || !list) return;
  const n = (list.querySelectorAll?.('.cv-msg') || []).length;
  countEl.textContent = String(n);
}

/** 타임라인 스크롤 — 컨테이너 scrollTop 제어 (scrollIntoView 금지, 작업지시서 §6).
 *  모바일 시트가 닫힌(peek) 상태면 최신 댓글의 첫 줄부터 보이게 마지막 메시지를 리스트
 *  상단에 정렬 (아이폰 PWA 피드백 3, 2026-06-12). 그 외엔 맨 아래(최신이 하단). */
function scrollListToBottom(doc) {
  const list = panelList(doc);
  if (!list) return;
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const panel = doc.getElementById?.('convoPanel');
  const peekClosed = !!(win?.matchMedia?.('(max-width: 768px)')?.matches
    && panel && !panel.classList?.contains?.('is-open'));
  if (peekClosed) {
    const msgs = list.querySelectorAll?.('.cv-msg') || [];
    const last = msgs[msgs.length - 1];
    if (last && typeof last.offsetTop === 'number') {
      list.scrollTop = Math.max(0, last.offsetTop - 2);
      return;
    }
  }
  list.scrollTop = list.scrollHeight;
}

/** 클로드 댓글 2줄 클램프 측정 — 실제로 넘칠 때만 "더 보기" 노출. jsdom (측정 0) 은 클램프 해제. */
function measureAiClamp(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return;
  const apply = () => {
    const nodes = doc.querySelectorAll?.('.cv-msg--ai .cv-msg__body') || [];
    nodes.forEach((bodyEl) => {
      const moreBtn = bodyEl.parentElement?.querySelector?.('.cv-msg__more');
      bodyEl.classList.add('is-clamped');
      const clamped = (bodyEl.scrollHeight || 0) > (bodyEl.clientHeight || 0) + 1;
      if (!clamped) {
        bodyEl.classList.remove('is-clamped');
        if (moreBtn) moreBtn.hidden = true;
      } else if (moreBtn) {
        moreBtn.hidden = false;
        moreBtn.textContent = '더 보기';
      }
    });
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
  else apply();
}

/** 패널 비우기 — article 부재 (목록/빈 카테고리) 시. */
export function clearPanel(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return false;
  const list = panelList(doc);
  if (list) list.innerHTML = '';
  const countEl = doc.getElementById?.('convoCount');
  if (countEl) countEl.textContent = '';
  syncComposerState(false, doc);
  return true;
}

/** article.dataset.entryId 기반 대화 패널 mount. 파트너 비공유 글은 composer 비활성 + 빈 타임라인. */
export async function mountForArticle(article, opts = {}) {
  const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
  if (!article) return { ok: false, reason: 'no_article' };
  const id = article.dataset?.entryId;
  if (!id || id.startsWith('new-')) {
    // 새글 미저장 — 패널 비움 (이전 article 잔재 차단)
    clearPanel(doc);
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
  syncComposerState(canComment, doc);
  const list = panelList(doc);
  if (!list) return { ok: true, count: 0, canComment, mounted: false };
  if (!canComment) {
    list.innerHTML = '';
    updateConvoCount(doc);
    return { ok: true, count: 0, canComment, mounted: false };
  }
  // 댓글 목록 로드
  let comments = [];
  try {
    comments = await Queries.listCommentsByEntry(id);
  } catch (e) {
    console.warn('[comments] listCommentsByEntry 실패:', e?.message || e);
  }
  list.innerHTML = commentsToSectionHtml(comments, { currentUserId: userId, partnerName: opts.partnerName });
  updateConvoCount(doc);
  scrollListToBottom(doc);
  measureAiClamp(doc);
  return { ok: true, count: comments.length, canComment, mounted: comments.length > 0 };
}

/** composer 활성/비활성 + placeholder. */
export function syncComposerState(canComment, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return;
  const input = doc.querySelector?.('#convoPanel .composer input');
  if (!input) return;
  if (canComment) {
    input.removeAttribute('disabled');
    input.setAttribute('placeholder', '댓글을 남겨보세요…');
  } else {
    input.setAttribute('disabled', 'true');
    input.setAttribute('placeholder', '공유된 글에만 댓글을 달 수 있습니다');
    input.value = '';
  }
}

/** 타임라인에 메시지 1건 append — 날짜 구분 자동 보장 + 카운트/스크롤 갱신. */
function appendCommentToList(row, doc) {
  const list = panelList(doc);
  if (!list) return false;
  const day = dayKeyOf(row?.created_at);
  const lastDivider = [...(list.querySelectorAll?.('.cv-day') || [])].pop();
  if (day && (!lastDivider || lastDivider.getAttribute('data-day') !== day)) {
    list.insertAdjacentHTML('beforeend', dayDividerHtml(row.created_at));
  }
  list.insertAdjacentHTML('beforeend', commentToHtml(row, { currentUserId: _currentUser?.id }));
  updateConvoCount(doc);
  scrollListToBottom(doc);
  measureAiClamp(doc);
  return true;
}

/** composer 제출 — Enter / 전송 버튼 공용. */
async function submitComposer(input) {
  const body = (input.value || '').trim();
  if (!body) return;
  if (input.disabled) {
    console.info('[comments] composer disabled — 공유된 글에만 댓글 작성 가능');
    pulseShareToggle(document);
    return;
  }
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
    const list = panelList(document);
    if (list && !list.querySelector(`[data-comment-id="${row.id}"]`)) {
      appendCommentToList(row, document);
    }
  } catch (err) {
    console.warn('[comments] createComment 실패:', err?.message || err);
  } finally {
    _composerSubmitting = false;
  }
}

/**
 * composer wiring — Enter key (capture) + 전송 버튼 click.
 */
function installComposerHandler() {
  if (_composerInstalled) return;
  if (typeof document === 'undefined') return;
  _composerInstalled = true;
  // Wave 11.6.7 — disabled composer click 시 share 필 안내 (visual hint)
  document.addEventListener('click', (e) => {
    const input = e.target?.closest?.('#convoPanel .composer input');
    if (!input || !input.disabled) return;
    pulseShareToggle(document);
    console.info('[comments] 댓글 작성 불가 — 공유 토글 ON 후 가능 (is_shared=true 필요)');
  }, true);
  // 전송 버튼 click
  document.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('#convoPanel .composer__send');
    if (!btn) return;
    const input = document.querySelector('#convoPanel .composer input');
    if (!input) return;
    e.preventDefault();
    await submitComposer(input);
  }, true);
  document.addEventListener('keydown', async (e) => {
    // Wave 11.6.10 — 한국어 IME 마무리 Enter (isComposing=true) skip. 빠른 Enter 두 번 시 in-flight flag 가 차단.
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    const input = e.target;
    if (!input || input.tagName !== 'INPUT') return;
    if (!input.matches?.('#convoPanel .composer input')) return;
    e.preventDefault();
    await submitComposer(input);
  }, true);
}

// Wave 11.6.7 — disabled composer 클릭 시 share 필 시각 강조 (1.5s pulse)
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
    const btn = e.target?.closest?.('.cv-msg__del[data-comment-id]');
    if (!btn) return;
    e.stopImmediatePropagation();
    const id = btn.dataset?.commentId;
    if (!id) return;
    btn.disabled = true;
    try {
      await Queries.softDeleteComment(id);
      const row = btn.closest?.('.cv-msg');
      removeCommentRow(row, document);
    } catch (err) {
      console.warn('[comments] softDeleteComment 실패:', err?.message || err);
      btn.disabled = false;
    }
  }, true);
}

/** "더 보기 / 접기" — 클로드 자동 댓글 클램프 토글. */
function installMoreToggleHandler() {
  if (_moreToggleInstalled) return;
  if (typeof document === 'undefined') return;
  _moreToggleInstalled = true;
  document.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('.cv-msg__more');
    if (!btn) return;
    const bodyEl = btn.parentElement?.querySelector?.('.cv-msg__body');
    if (!bodyEl) return;
    const expand = bodyEl.classList.contains('is-clamped');
    bodyEl.classList.toggle('is-clamped', !expand);
    btn.textContent = expand ? '접기' : '더 보기';
  }, true);
}

/** 메시지 row 제거 + 날짜 구분 정리 (그 날 마지막 메시지였으면 divider 도 제거). */
function removeCommentRow(row, doc) {
  if (!row || typeof row.remove !== 'function') return;
  const day = row.getAttribute?.('data-day');
  row.remove();
  const list = panelList(doc);
  if (list && day && !list.querySelector?.(`.cv-msg[data-day="${day}"]`)) {
    const divider = list.querySelector?.(`.cv-day[data-day="${day}"]`);
    if (divider) divider.remove();
  }
  updateConvoCount(doc);
}

/**
 * #mainView 의 article.doc 변경 감지 — entryId 가 바뀌면 패널 다시 mount.
 * article 부재 (전체 목록/빈 카테고리) → 패널 비움 + body[data-convo] 해제.
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
    // 패널 노출 여부 — article 존재 시에만 (expense/admin 은 CSS 가 추가 차단)
    document.body.dataset.convo = article ? '1' : '';
    if (!article) {
      lastEntryId = null;
      clearPanel(document);
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
  const list = panelList(doc);
  if (!list) return { applied: false, reason: 'no_list' };

  // DELETE / soft delete (deleted_at 채워짐)
  if (eventType === 'DELETE' || (newRow && newRow.deleted_at)) {
    const row = list.querySelector?.(`[data-comment-id="${id}"]`);
    if (row) removeCommentRow(row, doc);
    return { applied: true, reason: 'removed', id };
  }

  // INSERT / UPDATE (살아있는 row)
  if (!newRow) return { applied: false, reason: 'no_new_row' };
  if (newRow.entry_id !== entryId) return { applied: false, reason: 'entry_mismatch' };
  // Wave 11.6.10 — self-author skip (자기 댓글은 client 가 즉시 UI append 하므로 echo 불필요).
  if (_currentUser?.id && newRow.author_id === _currentUser.id) {
    return { applied: true, reason: 'self_author_dedup', id };
  }
  // Wave 11.6.8a — pending Set dedup (즉시 UI append 한 id 의 echo skip)
  if (_pendingCommentIds.has(id)) return { applied: true, reason: 'pending_dedup', id };
  // DOM dedup
  if (list.querySelector?.(`[data-comment-id="${id}"]`)) return { applied: true, reason: 'dedup', id };
  appendCommentToList(newRow, doc);
  return { applied: true, reason: 'appended', id };
}

export async function mountCommentsView(user) {
  if (!user?.id) return;
  _currentUser = user;
  if (typeof document === 'undefined') return;
  installComposerHandler();
  installCommentDeleteHandler();
  installMoreToggleHandler();
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
  _moreToggleInstalled = false;
  _composerSubmitting = false;
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

/** 회귀 5 fix — pullAll 완료 후 main.js .then() 호출. 현재 article 대화 패널 재마운트. */
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
  formatDayLabel,
  dayKeyOf,
  clearPanel,
  escapeHtml,
  CLAUDE_AUTHOR_ID,
};

if (typeof window !== 'undefined') {
  window.todayComments = Comments;
}

export default Comments;
