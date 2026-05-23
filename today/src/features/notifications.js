/**
 * Notifications integration layer (Wave 11.7.3c-1 + c-2 + c-3).
 *
 * 책임:
 *   - mocks 사이드바 알림 벨 (.sb__icon-btn--has-alert) 의 미읽음 인디케이터 동기화 (c-1)
 *   - 벨 클릭 → 드롭다운 표시 (listNotifications 결과 행 렌더, c-2)
 *   - 외부 클릭 시 자동 닫힘
 *   - "모두 읽음" 액션
 *   - 알림 행 클릭 → 딥링크 (네비 탭 + 우리 글 세그먼트 + scrollIntoView + markRead) (c-3)
 *
 * 비대상 (별 wave):
 *   - Realtime notifications INSERT 자동 갱신 (Wave 11.7.3c-4)
 *   - comment_id 하이라이트 (mocks 댓글 UI 미수행)
 *
 * spec 매핑:
 *   - §11 L424-433 클라이언트 책임 — updateBadge() + 드롭다운 + 딥링크
 *   - §11 L436-443 딥링크 — 네비 탭 + 우리 글 세그먼트 (§4 L131 정합) + scrollIntoView
 */
import { Queries } from '../db/queries.js';
import { Entries } from './entries.js';
import { Sync } from '../db/sync.js';

let _currentUser = null;
let _bellClickInstalled = false;
let _outsideClickHandler = null;
let _realtimeUnregister = null;

/**
 * mocks 사이드바 의 알림 벨 button 식별.
 * mocks today-mac.html L3098: `.sb__icon-btn.sb__icon-btn--has-alert`
 * 단 클래스 토글 시 selector 깨짐 → button 안의 .alert-dot 자식으로 식별 (안정).
 */
export function findAlertBellButton(doc = document) {
  const candidates = doc.querySelectorAll('.sb__top button.sb__icon-btn');
  for (const btn of candidates) {
    if (btn.querySelector('.alert-dot')) return btn;
  }
  return null;
}

/**
 * 미읽음 카운트 → button 클래스 + title 동기화.
 * - count > 0: `sb__icon-btn--has-alert` 클래스 추가, title = `새 알림 N개`
 * - count = 0: 클래스 제거, title = `알림`
 *
 * 반환: { applied: boolean, count: number, found: boolean }
 */
export async function updateAlertBadge(recipientId, doc) {
  if (!recipientId) return { applied: false, count: 0, found: false, reason: 'no_user' };
  if (typeof doc === 'undefined' || doc === null) {
    if (typeof document === 'undefined') return { applied: false, count: 0, found: false, reason: 'no_document' };
    doc = document;
  }
  const btn = findAlertBellButton(doc);
  if (!btn) return { applied: false, count: 0, found: false, reason: 'no_button' };
  let count = 0;
  try {
    count = await Queries.countUnreadNotifications(recipientId);
  } catch (e) {
    console.warn('[notifications] countUnread 실패', e?.message || e);
    return { applied: false, count: 0, found: true, reason: 'query_error' };
  }
  applyBadge(btn, count);
  return { applied: true, count, found: true };
}

/** 직접 button + count → 클래스/title 적용 (단위 테스트 친화). */
export function applyBadge(button, count) {
  if (!button) return false;
  const n = Number(count) || 0;
  if (n > 0) {
    button.classList.add('sb__icon-btn--has-alert');
    button.setAttribute('title', `새 알림 ${n}개`);
  } else {
    button.classList.remove('sb__icon-btn--has-alert');
    button.setAttribute('title', '알림');
  }
  return true;
}

/**
 * 마운트 — 초기 알림 fetch + 배지 갱신 + 드롭다운 lifecycle 등록.
 * Realtime 자동 갱신은 별 wave (sync.js 통합 후 _realtimeListeners 활용).
 */
export async function mountNotificationsView(user) {
  if (!user?.id) return;
  _currentUser = user;
  if (typeof document === 'undefined') return;
  // Wave 11.7.3c-2 — 드롭다운 lifecycle
  injectNotifDropdownStyles();
  injectNotifDropdown();
  installBellClickHandler();
  await updateAlertBadge(user.id);
  // Wave 11.7.3c-4 — Realtime 자동 갱신 (재마운트 시 unregister 후 재등록)
  if (_realtimeUnregister) _realtimeUnregister();
  if (Sync && typeof Sync.onRealtimeChange === 'function') {
    _realtimeUnregister = Sync.onRealtimeChange((payload) => {
      handleRealtimeNotificationChange(payload).catch((e) =>
        console.warn('[notifications] realtime handler 실패', e?.message || e),
      );
    });
  }
}

/**
 * 외부 트리거 — 알림 변경 후 다시 갱신 (mark read / Realtime INSERT 핸들러용).
 * _currentUser 사용 — mountNotificationsView 후에만 동작.
 */
export async function refreshAlertBadge(doc) {
  if (!_currentUser?.id) return { applied: false, reason: 'not_mounted' };
  return await updateAlertBadge(_currentUser.id, doc);
}

/**
 * Wave 11.7.3c-4 — Realtime notifications INSERT/UPDATE → 자동 배지/드롭다운 갱신.
 * sync.js 의 _realtimeListeners 에 등록되어 모든 테이블 변경 payload 수신 → table 필터.
 * 반환: { applied, reason, table } — 단위 테스트 친화.
 */
export async function handleRealtimeNotificationChange(payload, doc) {
  if (typeof doc === 'undefined' || doc === null) {
    if (typeof document === 'undefined') return { applied: false, reason: 'no_document' };
    doc = document;
  }
  if (!payload || payload.table !== 'today_notifications') {
    return { applied: false, reason: 'table_mismatch', table: payload?.table };
  }
  // 본인 recipient 만 처리 (다른 사용자 알림 무시)
  const newRow = payload.new || payload.record;
  if (_currentUser?.id && newRow?.recipient_id && newRow.recipient_id !== _currentUser.id) {
    return { applied: false, reason: 'not_recipient' };
  }
  // 회귀 (b) fix — entry_unshared 는 background sync 신호.
  // partner 가 is_shared OFF 시 RLS 가 entry Realtime push 차단 → 별도 알림 trigger 로 우회.
  // Dexie entry 의 is_shared 0 으로 update + sidebar refresh.
  if (newRow?.kind === 'entry_unshared' && newRow.entry_id) {
    const db = globalThis.todayDB;
    if (db?.entries) {
      try {
        const existing = await db.entries.get(newRow.entry_id);
        if (existing) {
          await db.entries.put({ ...existing, is_shared: 0 });
        }
      } catch (e) {
        console.warn('[notifications] entry_unshared dexie update 실패', e?.message || e);
      }
    }
    // 사이드바 refresh — 현재 카테고리가 navi 면 list 재 fetch
    try {
      const entriesMod = await import('./entries.js');
      const currentKind = doc.querySelector?.('.sb__item[data-category].sb__item--active')?.dataset?.category || null;
      if (currentKind && entriesMod.Entries?.scheduleRecentsRefresh) {
        entriesMod.Entries.scheduleRecentsRefresh(currentKind, doc);
      }
    } catch (e) {
      console.warn('[notifications] entry_unshared sidebar refresh 실패', e?.message || e);
    }
    // 배지는 갱신 (단 entry_unshared 자체는 dropdown 에 안 보임 — listNotifications filter)
    await refreshAlertBadge(doc);
    return { applied: true, reason: 'entry_unshared_synced' };
  }
  // 1. 배지 갱신
  await refreshAlertBadge(doc);
  // 2. 드롭다운 list 재렌더 — 회귀 2 fix: closed 도 재렌더 (다음 click 시 stale UI 방지)
  if (_currentUser?.id) {
    try {
      const notifs = await Queries.listNotifications(_currentUser.id);
      renderNotifDropdown(notifs, doc);
    } catch (e) {
      console.warn('[notifications] realtime listNotifications 실패', e?.message || e);
    }
  }
  return { applied: true, reason: 'refreshed' };
}

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.7.3c-2 — 알림 드롭다운 UI
// 벨 클릭 → 드롭다운 표시 / 외부 클릭 → 자동 닫힘 / "모두 읽음" 액션
// ───────────────────────────────────────────────────────────────────────────

const NOTIF_DROPDOWN_ID = 'notifDropdown';

/** ISO timestamp → 상대 시간 ("방금" / "N분 전" / "N시간 전" / "N일 전" / "MM/DD"). */
export function formatRelativeTime(iso, now = new Date()) {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const diffSec = Math.max(0, Math.floor((now - t) / 1000));
  if (diffSec < 60) return '방금';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  const dd = String(t.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 알림 kind → 행 라벨. entry_unshared 등 background kind 는 라벨 없음(드롭다운 미표시). */
const NOTIF_KIND_LABEL = Object.freeze({ new_comment: '댓글', new_post: '새 글' });

/** notif row → HTML 문자열. kind 라벨 + comment_id(댓글 딥링크용) 포함. */
export function buildNotifRowHtml(notif, now = new Date()) {
  const id = escapeHtml(notif.id);
  const preview = escapeHtml(notif.preview || '(미리보기 없음)');
  const time = formatRelativeTime(notif.created_at, now);
  const isRead = !!notif.read_at;
  const kind = notif.kind || '';
  const commentId = escapeHtml(notif.comment_id || '');
  const labelText = NOTIF_KIND_LABEL[kind] || '';
  const kindLabel = labelText
    ? `<span class="notif-dropdown__kind notif-dropdown__kind--${escapeHtml(kind)}">${labelText}</span>`
    : '';
  return `<div class="notif-dropdown__row" data-notif-id="${id}" data-entry-id="${escapeHtml(notif.entry_id || '')}" data-comment-id="${commentId}" data-kind="${escapeHtml(kind)}"><span class="notif-dropdown__unread-dot${isRead ? ' is-read' : ''}"></span><div class="notif-dropdown__body"><div class="notif-dropdown__preview">${kindLabel}${preview}</div><div class="notif-dropdown__time">${time}</div></div></div>`;
}

/** 드롭다운 CSS 인라인 주입 (idempotent). */
export function injectNotifDropdownStyles(doc = document) {
  if (typeof doc === 'undefined' || !doc?.head) return false;
  if (doc.getElementById('today-notif-dropdown-styles')) return false;
  const style = doc.createElement('style');
  style.id = 'today-notif-dropdown-styles';
  style.textContent = `
    .sb__top { position: relative; }
    .notif-dropdown {
      position: absolute;
      top: 100%;
      right: 12px;
      width: 320px;
      max-height: 400px;
      margin-top: 4px;
      background: var(--surface, #fff);
      border: 1px solid var(--border, #e8e4dc);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      z-index: 100;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .notif-dropdown[hidden] { display: none; }
    .notif-dropdown__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
    }
    .notif-dropdown__title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-strong, #141413);
    }
    .notif-dropdown__action {
      border: 0;
      background: transparent;
      color: var(--text-muted, #8a8475);
      font-size: 11px;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .notif-dropdown__action:hover {
      color: var(--text, #3d3929);
      background: var(--bg-warm, #f5f0ea);
    }
    .notif-dropdown__list { overflow-y: auto; flex: 1; }
    .notif-dropdown__row {
      display: flex;
      gap: 8px;
      padding: 10px 12px;
      cursor: pointer;
      transition: background 120ms;
      align-items: flex-start;
    }
    .notif-dropdown__row:hover { background: var(--bg-warm, #f5f0ea); }
    .notif-dropdown__unread-dot {
      width: 6px; height: 6px;
      background: var(--accent, #d97757);
      border-radius: 50%;
      margin-top: 6px;
      flex-shrink: 0;
    }
    .notif-dropdown__unread-dot.is-read { visibility: hidden; }
    .notif-dropdown__body { flex: 1; min-width: 0; }
    .notif-dropdown__preview {
      font-size: 13px;
      color: var(--text, #3d3929);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .notif-dropdown__time {
      font-size: 11px;
      color: var(--text-muted, #8a8475);
      margin-top: 2px;
    }
    .notif-dropdown__empty {
      padding: 24px 16px;
      text-align: center;
      color: var(--text-muted, #8a8475);
      font-size: 12px;
    }
    /* Wave 11.7.3c-3 — 알림 클릭 딥링크 하이라이트 */
    #recentsList [data-doc-id].notif-highlight {
      background: var(--bg-warm, #f5f0ea);
      transition: background 200ms;
    }
    /* 알림 종류 라벨 (댓글 / 새 글) */
    .notif-dropdown__kind {
      display: inline-block;
      margin-right: 6px;
      padding: 0 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      line-height: 16px;
      vertical-align: 1px;
      color: #fff;
      background: var(--text-muted, #8a8475);
    }
    .notif-dropdown__kind--new_comment { background: var(--accent, #d97757); }
    .notif-dropdown__kind--new_post { background: var(--cloudy-base, #6a9bcc); }
    /* 댓글 알림 클릭 → 해당 댓글 버블 하이라이트 2.4초 */
    #mainView .doc__comments .comment-row.notif-comment-highlight .comment-row__bubble {
      outline: 2px solid var(--accent, #d97757);
      outline-offset: 2px;
      transition: outline 200ms;
    }
  `;
  doc.head.appendChild(style);
  return true;
}

/** 드롭다운 컨테이너 DOM 주입 (idempotent). 위치: sb__top 의 last child. */
export function injectNotifDropdown(doc = document) {
  if (typeof doc === 'undefined') return false;
  if (doc.getElementById(NOTIF_DROPDOWN_ID)) return true;
  const sbTop = doc.querySelector('.sb__top');
  if (!sbTop) return false;
  const wrap = doc.createElement('div');
  wrap.id = NOTIF_DROPDOWN_ID;
  wrap.className = 'notif-dropdown';
  wrap.setAttribute('hidden', '');
  wrap.innerHTML = `<div class="notif-dropdown__header"><span class="notif-dropdown__title">알림</span><button class="notif-dropdown__action" data-action="mark-all-read" type="button">모두 읽음</button></div><div class="notif-dropdown__list" id="notifDropdownList"></div>`;
  sbTop.appendChild(wrap);
  return true;
}

/** 드롭다운 list 영역에 notifs 렌더 (빈 상태 포함). */
export function renderNotifDropdown(notifs, doc = document) {
  const list = doc.getElementById('notifDropdownList');
  if (!list) return false;
  // unread 0 일 때 "모두 읽음" 버튼 hide — 라벨처럼 보여 헷갈리는 UX 해소
  const action = doc.querySelector('.notif-dropdown__action[data-action="mark-all-read"]');
  if (action) {
    const hasUnread = (notifs || []).some((n) => !n.read_at);
    if (hasUnread) action.removeAttribute('hidden');
    else action.setAttribute('hidden', '');
  }
  if (!notifs || !notifs.length) {
    list.innerHTML = '<div class="notif-dropdown__empty">새 알림 없음</div>';
    return true;
  }
  const now = new Date();
  list.innerHTML = notifs.map((n) => buildNotifRowHtml(n, now)).join('');
  return true;
}

/** 드롭다운 열기 — listNotifications fetch + 렌더 + 외부 클릭 listener. */
export async function openNotifDropdown(doc = document) {
  if (!_currentUser?.id) return { ok: false, reason: 'no_user' };
  if (!injectNotifDropdown(doc)) return { ok: false, reason: 'no_sbtop' };
  const dropdown = doc.getElementById(NOTIF_DROPDOWN_ID);
  if (!dropdown) return { ok: false, reason: 'no_dropdown' };
  let notifs = [];
  try {
    notifs = await Queries.listNotifications(_currentUser.id);
  } catch (e) {
    console.warn('[notifications] listNotifications 실패', e?.message || e);
    notifs = [];
  }
  renderNotifDropdown(notifs, doc);
  dropdown.removeAttribute('hidden');
  // Wave 11.6.8c — popover 위치 동적 계산 (button rect 기반, 사이드바 외부 우측 펼침)
  // 사용자 보고: sb__top absolute right:12px 으로 사이드바 안에 그려져 좌측 잘림. fixed + bell button 우측 정렬로 viewport 안.
  if (typeof window !== 'undefined' && typeof dropdown.getBoundingClientRect === 'function') {
    const bell = findAlertBellButton(doc);
    if (bell && typeof bell.getBoundingClientRect === 'function') {
      const rect = bell.getBoundingClientRect();
      const popoverWidth = 320;
      const viewportWidth = window.innerWidth || 1024;
      // 우선 bell 우측 외부로 펼침 — 사이드바 밖 메인 영역에 popover
      let left = rect.right + 8;
      // viewport 우측 잘림 보호
      if (left + popoverWidth + 16 > viewportWidth) {
        left = Math.max(8, viewportWidth - popoverWidth - 16);
      }
      dropdown.style.position = 'fixed';
      dropdown.style.top = `${Math.round(rect.top)}px`;
      dropdown.style.left = `${Math.round(left)}px`;
      dropdown.style.right = 'auto';
    }
  }
  // 외부 클릭 listener — 한 task 후 등록 (현재 click 이 외부 클릭으로 잡히는 race 방지)
  if (_outsideClickHandler) {
    doc.removeEventListener('click', _outsideClickHandler);
  }
  _outsideClickHandler = (e) => {
    if (e.target.closest && e.target.closest(`#${NOTIF_DROPDOWN_ID}`)) return;
    const bell = findAlertBellButton(doc);
    if (bell && e.target.closest && e.target.closest(`button.sb__icon-btn`) === bell) return;
    closeNotifDropdown(doc);
  };
  setTimeout(() => doc.addEventListener('click', _outsideClickHandler), 0);
  return { ok: true, count: notifs.length };
}

/** 드롭다운 닫기 — hide + 외부 클릭 listener 제거. */
export function closeNotifDropdown(doc = document) {
  const dropdown = doc.getElementById(NOTIF_DROPDOWN_ID);
  if (!dropdown) return false;
  dropdown.setAttribute('hidden', '');
  if (_outsideClickHandler) {
    doc.removeEventListener('click', _outsideClickHandler);
    _outsideClickHandler = null;
  }
  return true;
}

/** 드롭다운 토글 — 열려있으면 닫고 / 닫혀있으면 열기. */
export async function toggleNotifDropdown(doc = document) {
  const dropdown = doc.getElementById(NOTIF_DROPDOWN_ID);
  const isOpen = dropdown && !dropdown.hasAttribute('hidden');
  if (isOpen) {
    closeNotifDropdown(doc);
    return { ok: true, opened: false };
  }
  const result = await openNotifDropdown(doc);
  return { ...result, opened: result.ok };
}

/**
 * 알림 행 클릭 → 본문 딥링크 (회귀 fix 2026-05-23).
 *
 * 기존 버그: navi 탭 진입 + 사이드바 항목 scrollIntoView/하이라이트만 수행 →
 *   본문(#mainView)이 알림 대상 글로 열리지 않음 (navi 최신 글이 떠 있을 뿐).
 *   대상이 navi 외 글(fiction/blog/memo)이면 navi recents 에 없어 강조조차 실패.
 *   본문이 안 열리니 그 글의 댓글 영역(installArticleObserver→mountForArticle)도 미발화.
 *
 * 수정: 대상 entry 를 직접 로드해 본문을 그 글로 연다 (kind 무관). 본문이 열리면
 *   comments.js 의 installArticleObserver 가 article data-entry-id 변경을 감지해 댓글 자동 mount.
 *   1. markNotificationRead + 배지 갱신
 *   2. getEntry(entry_id) — 대상 글 로드 (없으면 navi fallback — 미pull/삭제 방어)
 *   3. row.kind 카테고리 탭 전환 (soyoun_navi → navi 합집합 탭)
 *   4. renderDocFromRow(row) — 본문을 대상 글로 (핵심)
 *   5. #recentsList 항목 scrollIntoView + 하이라이트 2초 (보조)
 *   6. 드롭다운 닫기
 *
 * 반환: { ok, opened, scrolled, entry_id, kind, reason }
 */
export async function handleNotifClick(notif, doc) {
  if (!notif?.entry_id) return { ok: false, reason: 'no_entry_id' };
  if (typeof doc === 'undefined' || doc === null) {
    if (typeof document === 'undefined') return { ok: false, reason: 'no_document' };
    doc = document;
  }
  // 1. markRead — 실패해도 진행 (UX 우선)
  if (notif.id && !notif.read_at) {
    try {
      await Queries.markNotificationRead(notif.id);
    } catch (e) {
      console.warn('[notifications] markRead 실패', e?.message || e);
    }
  }
  await refreshAlertBadge();
  // 2. 대상 entry 로드 — 핵심 fix. 사이드바 강조가 아니라 본문을 이 글로 직접 연다.
  let row = null;
  try {
    row = await Queries.getEntry(notif.entry_id);
  } catch (e) {
    console.warn('[notifications] getEntry 실패', e?.message || e);
  }
  // 3. 대상 글 kind 의 카테고리 탭으로 전환 (soyoun_navi → navi 합집합).
  //    row 없으면(미pull/삭제) navi fallback — 기존 동작 보존.
  const tabKind = row && row.kind === 'soyoun_navi'
    ? 'navi'
    : (row && Queries.ENTRY_KINDS.includes(row.kind) ? row.kind : 'navi');
  const tabBtn = doc.querySelector(`.sb__item[data-category="${tabKind}"]`)
    || doc.querySelector('.sb__item[data-category="navi"]');
  const isAlreadyActive = !!tabBtn?.classList?.contains('sb__item--active');
  if (tabBtn && !isAlreadyActive) {
    tabBtn.click();
    // mocks setCategory 가 #recentsList 갈아치움 + handleCategoryActive 가 setTimeout(0) 후 patch
    await new Promise((r) => setTimeout(r, 250));
  } else if (isAlreadyActive) {
    // 이미 해당 탭 active — 직접 fetch + 재패치 (MutationObserver 발화 안 함)
    try {
      const list = await Entries.fetchEntriesForCategory(tabKind);
      if (list.length > 0) {
        Entries.renderRecentsFromRows(tabKind, list, doc);
      }
    } catch (e) {
      console.warn('[notifications] fetchEntries 실패', e?.message || e);
    }
  }
  // 4. 본문(#mainView)을 대상 글로 직접 열기 — 댓글 영역은 comments.js 가 자동 mount.
  let opened = false;
  if (row && typeof Entries.renderDocFromRow === 'function') {
    opened = !!Entries.renderDocFromRow(row, doc);
  }
  // 5. entry_id 매치 row scrollIntoView + 하이라이트 2초 (보조 — 목록 내 위치 강조)
  const target = doc.querySelector(`#recentsList [data-doc-id="${cssEscape(notif.entry_id)}"]`);
  if (target) {
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    target.classList.add('notif-highlight');
    setTimeout(() => target.classList.remove('notif-highlight'), 2000);
  }
  // 6. 댓글 알림(new_comment)이면 해당 댓글로 스크롤 + 하이라이트.
  //    본문 열린 직후 댓글 영역은 comments.js installArticleObserver 가 async mount → 짧게 polling.
  let scrolledToComment = false;
  if (notif.comment_id) {
    scrolledToComment = await scrollToNotifComment(notif.comment_id, doc);
  }
  // 7. 드롭다운 닫기
  closeNotifDropdown(doc);
  return {
    ok: true,
    opened,
    scrolled: !!target,
    scrolledToComment,
    entry_id: notif.entry_id,
    comment_id: notif.comment_id || null,
    kind: row?.kind || null,
  };
}

/**
 * 댓글 딥링크 — comment_id 의 댓글 row 로 scrollIntoView + 하이라이트 2.4초.
 * 본문 전환 후 댓글 영역은 comments.js 가 async mount 하므로 maxWaitMs 까지 polling.
 * data-comment-id 는 .comment-row 와 .comment-row__delete 둘 다 가지므로 .comment-row 로 한정.
 * 반환: 스크롤 성공 여부.
 */
async function scrollToNotifComment(commentId, doc, maxWaitMs = 1500) {
  if (!commentId) return false;
  const sel = `#mainView .doc__comments .comment-row[data-comment-id="${cssEscape(commentId)}"]`;
  const start = Date.now();
  let el = doc.querySelector(sel);
  while (!el && Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 100));
    el = doc.querySelector(sel);
  }
  if (!el) return false;
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  el.classList.add('notif-comment-highlight');
  setTimeout(() => el.classList.remove('notif-comment-highlight'), 2400);
  return true;
}

/** CSS attribute selector 안 안전한 entry_id (UUID 외 특수문자 가드). */
function cssEscape(s) {
  // CSS.escape 폴백 — UUID 만 있으면 그대로
  if (typeof s !== 'string') return '';
  return s.replace(/(["\\\]])/g, '\\$1');
}

/** 모두 읽음 + 드롭다운 + 배지 갱신. */
export async function markAllReadAndRefresh(doc = document) {
  if (!_currentUser?.id) return { ok: false, reason: 'no_user' };
  try {
    const cleared = await Queries.markAllNotificationsRead(_currentUser.id);
    await refreshAlertBadge();
    // 드롭다운 다시 fetch (현재 열려 있으면)
    const dropdown = doc.getElementById(NOTIF_DROPDOWN_ID);
    if (dropdown && !dropdown.hasAttribute('hidden')) {
      const notifs = await Queries.listNotifications(_currentUser.id);
      renderNotifDropdown(notifs, doc);
    }
    return { ok: true, cleared };
  } catch (e) {
    console.warn('[notifications] markAllRead 실패', e?.message || e);
    return { ok: false, reason: 'error', error: e };
  }
}

/** 벨 클릭 + "모두 읽음" + 행 클릭 위임 install. */
export function installBellClickHandler(doc = document) {
  if (_bellClickInstalled) return false;
  doc.addEventListener('click', (e) => {
    const bellBtn = e.target.closest && e.target.closest('.sb__top button.sb__icon-btn');
    const targetIsBell = bellBtn && bellBtn.querySelector('.alert-dot');
    if (targetIsBell) {
      e.preventDefault();
      e.stopPropagation();
      toggleNotifDropdown(doc).catch((err) => console.warn('[notifications] toggle 실패', err?.message || err));
      return;
    }
    // "모두 읽음" 버튼
    const action = e.target.closest && e.target.closest('.notif-dropdown__action[data-action="mark-all-read"]');
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      markAllReadAndRefresh(doc).catch((err) => console.warn('[notifications] markAll 실패', err?.message || err));
      return;
    }
    // Wave 11.7.3c-3 — 알림 행 클릭 → 딥링크
    const row = e.target.closest && e.target.closest('.notif-dropdown__row');
    if (row) {
      e.preventDefault();
      e.stopPropagation();
      const notif = {
        id: row.getAttribute('data-notif-id'),
        entry_id: row.getAttribute('data-entry-id'),
        comment_id: row.getAttribute('data-comment-id') || null,
        kind: row.getAttribute('data-kind') || null,
        // read_at 은 DOM 의 is-read 클래스로 추정
        read_at: row.querySelector('.notif-dropdown__unread-dot')?.classList.contains('is-read') ? 'has-read' : null,
      };
      handleNotifClick(notif, doc).catch((err) =>
        console.warn('[notifications] handleNotifClick 실패', err?.message || err),
      );
      return;
    }
  });
  _bellClickInstalled = true;
  return true;
}

export const Notifications = {
  findAlertBellButton,
  updateAlertBadge,
  applyBadge,
  mountNotificationsView,
  refreshAlertBadge,
  // Wave 11.7.3c-2 — 드롭다운
  formatRelativeTime,
  buildNotifRowHtml,
  injectNotifDropdownStyles,
  injectNotifDropdown,
  renderNotifDropdown,
  openNotifDropdown,
  closeNotifDropdown,
  toggleNotifDropdown,
  markAllReadAndRefresh,
  installBellClickHandler,
  // Wave 11.7.3c-3 — 딥링크
  handleNotifClick,
  // Wave 11.7.3c-4 — Realtime
  handleRealtimeNotificationChange,
};

if (typeof window !== 'undefined') {
  window.todayNotifications = Notifications;
}

export default Notifications;
