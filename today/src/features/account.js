/**
 * Account integration layer (Wave 11.5.9 — openAccModal Dexie + Auth wiring).
 *
 * 책임:
 *  - 로그아웃 — mocks `[data-acc-confirm-logout]` click → `Auth.signOut()` (mocks `alert('구현 예정 (Wave 11.4 Auth)')` 차단)
 *  - 프로필 변경 — mocks `[data-acc-save]` click → `Profile.updateProfile({ display_name })` + sb__user-name 동기화
 *  - 휴지통 — mocks `openAccModal('trash')` 직후 `Queries.listDeletedEntries()` 결과로 trashBody 덮어쓰기 +
 *    `[data-trash-id]` click → `Queries.restoreEntry(id)`
 *
 * Clean Room 정합:
 *  - mocks/today-mac.html L3422-3561 의 acc-modal IIFE 그대로 — overlay 생성 / open / close / esc 등 mocks 유지
 *  - SPA 가 capture phase listener (`stopImmediatePropagation`) 로 mocks 의 `alert` / 더미 PROFILE/TRASH 차단 또는 보강
 */
import { Auth } from '../services/auth.js';
import { Profile } from '../services/profile.js';
import { Queries } from '../db/queries.js';

let _currentUser = null;
let _logoutPatched = false;
let _savePatched = false;
let _uploadPatched = false;
let _trashPatched = false;
let _openModalPatched = false;

const KIND_LABELS = Object.freeze({
  navi: '네비',
  soyoun_navi: '네비',
  fiction: '단편',
  blog: '블로그',
  memo: '메모',
});

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** ISO timestamp → 'M월 D일' (한국어). */
export function formatDeletedDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * Dexie row → 휴지통 row HTML (mocks trashBody L3458-3466 패턴 답습).
 * 차이점: `data-trash-id` 어트리뷰트로 SPA 가 click 위임.
 */
export function rowToTrashHtml(row) {
  const id = escapeHtml(row?.id || '');
  const title = escapeHtml(row?.title || '제목 없음');
  const kindLabel = KIND_LABELS[row?.kind] || '글';
  const date = formatDeletedDate(row?.deleted_at);
  const meta = date ? `${kindLabel} · ${date} 삭제` : kindLabel;
  return `<div class="acc-trash-row"><div class="acc-trash-row__main"><span class="acc-trash-row__title">${title}</span><span class="acc-trash-row__meta">${escapeHtml(meta)}</span></div><button class="acc-trash-row__action" data-trash-id="${id}">복구</button></div>`;
}

/** 로그아웃 wiring — mocks `alert` 차단 + Auth.signOut. */
export function patchLogoutHandler({
  doc = (typeof document !== 'undefined' ? document : null),
  win = (typeof window !== 'undefined' ? window : null),
} = {}) {
  if (!doc) return false;
  if (_logoutPatched) return true;
  _logoutPatched = true;
  doc.addEventListener('click', async (e) => {
    const btn = e.target.closest?.('[data-acc-confirm-logout]');
    if (!btn) return;
    // mocks IIFE 의 alert('로그아웃 — 구현 예정') 차단
    e.stopImmediatePropagation();
    if (win && typeof win.closeAccModal === 'function') {
      win.closeAccModal();
    }
    try {
      await Auth.signOut();
      // main.js 의 onAuthStateChange('SIGNED_OUT') 가 자동으로 showLogin 호출
    } catch (err) {
      console.warn('[account] signOut 실패:', err?.message || err);
    }
  }, true);
  return true;
}

/** 프로필 저장 wiring — mocks PROFILE.name 변수 변경만 → Supabase profiles 업데이트. */
export function patchProfileSaveHandler({
  doc = (typeof document !== 'undefined' ? document : null),
  win = (typeof window !== 'undefined' ? window : null),
} = {}) {
  if (!doc) return false;
  if (_savePatched) return true;
  _savePatched = true;
  doc.addEventListener('click', async (e) => {
    const btn = e.target.closest?.('[data-acc-save]');
    if (!btn) return;
    // mocks IIFE 의 PROFILE.name 변경만 하는 listener 차단 (Supabase 미반영 방지)
    e.stopImmediatePropagation();
    const input = doc.getElementById('accProfileName');
    const newName = (input?.value || '').trim();
    if (!newName) {
      if (win && typeof win.closeAccModal === 'function') win.closeAccModal();
      return;
    }
    try {
      const updated = await Profile.updateProfile({ display_name: newName });
      // Wave 11.5.11 — 성공/실패 무관 sb__user-name 갱신 (사용자 즉시 시각 피드백)
      // updated=null (supabase 미설정 / RLS / 네트워크 실패) 시엔 console.warn — 새로고침 시 손실 가능
      const sbName = doc.querySelector('.sb__user-name');
      if (sbName) sbName.textContent = newName;
      if (!updated) {
        console.warn('[account] updateProfile null — supabase 미설정 또는 RLS/네트워크 실패. UI 만 갱신, 새로고침 시 손실 가능.');
      }
    } catch (err) {
      console.warn('[account] updateProfile 예외:', err?.message || err);
      // 예외 시에도 시각 갱신 (사용자 즉각 피드백)
      const sbName = doc.querySelector('.sb__user-name');
      if (sbName) sbName.textContent = newName;
    } finally {
      if (win && typeof win.closeAccModal === 'function') win.closeAccModal();
    }
  }, true);
  return true;
}

/**
 * Wave 11.10 — avatar 표시 helper. publicUrl 을 사이드바 + acc-modal img 에 반영.
 *   - `.sb__avatar .sb__avatar-img` (사이드바 좌하단)
 *   - `.acc-profile-avatar .acc-profile-avatar-img` (acc-modal 프로필 화면)
 * mocks 마크업은 img 가 hidden 상태 + initial 텍스트 fallback. img.src 설정 + hidden 해제 시
 * absolute 로 부모를 덮어 initial 가림.
 */
export function applyAvatarUrl(url, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return 0;
  if (!url || typeof url !== 'string') return 0;
  const targets = doc.querySelectorAll('.sb__avatar-img, .acc-profile-avatar-img');
  let count = 0;
  targets.forEach((img) => {
    if (!img) return;
    img.src = url;
    if ('hidden' in img) img.hidden = false;
    else img.removeAttribute?.('hidden');
    count++;
  });
  return count;
}

/**
 * Wave 11.10 — 프로필 사진 업로드 wiring.
 * mocks `.acc-profile-upload-link` 의 inline `onclick="alert(...)"` 차단 후
 * 동적 file input → compressImage(square:256) → Profile.uploadAvatar → applyAvatarUrl.
 */
export function patchProfileUploadHandler({
  doc = (typeof document !== 'undefined' ? document : null),
  win = (typeof window !== 'undefined' ? window : null),
  Entries = null,
  Profile: ProfileOverride = null,
  currentUser = null,
} = {}) {
  if (!doc) return false;
  if (_uploadPatched) return true;
  _uploadPatched = true;
  doc.addEventListener('click', async (e) => {
    const link = e.target.closest?.('.acc-profile-upload-link');
    if (!link) return;
    // mocks IIFE 의 alert('이미지 업로드 — 구현 예정') 차단
    e.stopImmediatePropagation();
    if (typeof e.preventDefault === 'function') e.preventDefault();
    const user = currentUser || _currentUser;
    if (!user?.id) {
      console.warn('[account] avatar 업로드 — 인증 없음, 무시');
      return;
    }
    const E = Entries || (win && win.todayEntries) || null;
    const P = ProfileOverride || Profile;
    if (!E || typeof E.compressImage !== 'function') {
      console.warn('[account] compressImage 미노출 (Entries) — avatar 업로드 불가');
      return;
    }
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
    input.style.display = 'none';
    if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(input);
    }
    input.addEventListener('change', async () => {
      try {
        const file = input.files?.[0];
        if (!file) {
          console.warn('[account] avatar 업로드 — file 누락');
          return;
        }
        console.info('[account][avatar] 1/4 file 선택:', file.name, file.type, Math.round(file.size / 1024) + 'KB');
        const compressed = await E.compressImage(file, { square: 256, quality: 0.85 });
        if (!compressed?.ok) {
          console.warn('[account][avatar] 2/4 압축 실패:', compressed?.reason, compressed?.error?.message);
          return;
        }
        console.info('[account][avatar] 2/4 압축 OK:', `${compressed.width}x${compressed.height}`, `dataUrl ${Math.round(compressed.dataUrl.length / 1024)}KB`);
        console.info('[account][avatar] 3/4 uploadAvatar 호출 — user_id:', user.id);
        const result = await P.uploadAvatar(compressed.dataUrl, { user_id: user.id });
        if (!result?.ok) {
          console.warn('[account][avatar] 3/4 업로드 실패 — reason:', result?.reason, '| error:', result?.error?.message || result?.error?.statusCode || result?.error);
          return;
        }
        console.info('[account][avatar] 3/4 업로드 OK:', result.avatar_url);
        const count = applyAvatarUrl(result.avatar_url, doc);
        console.info('[account][avatar] 4/4 applyAvatarUrl 완료 — DOM img 갱신:', count, '개');
      } catch (err) {
        console.warn('[account][avatar] 업로드 예외:', err?.message || err);
      } finally {
        if (input.parentNode && typeof input.parentNode.removeChild === 'function') {
          input.parentNode.removeChild(input);
        }
      }
    });
    if (typeof input.click === 'function') input.click();
  }, true);
  return true;
}

/**
 * 휴지통 복구 wiring — `[data-trash-id]` 가 SPA 가 추가한 button 어트리뷰트.
 * mocks 의 `[data-trash-idx]` (인덱스) 와 다름 — SPA 행은 Dexie id 기반.
 */
export function patchTrashRestoreHandler({
  doc = (typeof document !== 'undefined' ? document : null),
} = {}) {
  if (!doc) return false;
  if (_trashPatched) return true;
  _trashPatched = true;
  doc.addEventListener('click', async (e) => {
    const btn = e.target.closest?.('[data-trash-id]');
    if (!btn) return;
    e.stopImmediatePropagation();
    const id = btn.dataset?.trashId;
    if (!id) return;
    btn.disabled = true;
    btn.textContent = '복구 중…';
    try {
      await Queries.restoreEntry(id);
      const row = btn.closest?.('.acc-trash-row');
      if (row && typeof row.remove === 'function') row.remove();
    } catch (err) {
      console.warn('[account] restoreEntry 실패:', err?.message || err);
      btn.disabled = false;
      btn.textContent = '복구';
    }
  }, true);
  return true;
}

/**
 * mocks `window.openAccModal('trash')` 직후 trashBody 를 Dexie 로 덮어쓰기.
 * profile / logout 은 더미 fixture 위에 SPA listener (위 patch 함수들) 가 capture 로 처리.
 */
export function patchOpenAccModalHandler({
  win = (typeof window !== 'undefined' ? window : null),
  doc = (typeof document !== 'undefined' ? document : null),
} = {}) {
  if (!win || !doc) return false;
  if (_openModalPatched) return true;
  const orig = win.openAccModal;
  if (typeof orig !== 'function') return false;
  _openModalPatched = true;
  win.openAccModal = function patchedOpenAccModal(action) {
    orig.call(this, action);
    if (action === 'profile') {
      // mocks PROFILE.name (IIFE 로컬, "지오" 하드코딩) 으로 채워진 input 을 사이드바 현재값으로 덮어쓰기.
      // 사이드바는 mountAccountView 에서 DB display_name 과 동기화됨.
      setTimeout(() => {
        const input = doc.getElementById?.('accProfileName');
        const sbName = doc.querySelector?.('.sb__user-name');
        const name = sbName?.textContent;
        if (input && name) input.value = name;
      }, 0);
      return;
    }
    if (action !== 'trash') return;
    // mocks 의 overlay 가 동기로 DOM 마운트 → microtask 후 trashBody 교체
    setTimeout(async () => {
      try {
        const rows = await Queries.listDeletedEntries();
        const overlay = doc.getElementById('accModalOverlay');
        if (!overlay) return;
        const body = overlay.querySelector('.acc-modal-body');
        if (!body) return;
        if (!rows.length) {
          body.innerHTML = '<div class="acc-trash-empty">휴지통이 비어 있습니다</div>';
          return;
        }
        body.innerHTML = rows.map(rowToTrashHtml).join('');
      } catch (err) {
        console.warn('[account] listDeletedEntries 실패:', err?.message || err);
      }
    }, 0);
  };
  return true;
}

export async function mountAccountView(user) {
  if (!user?.id) return;
  _currentUser = user;
  if (typeof document === 'undefined') return;
  patchLogoutHandler();
  patchProfileSaveHandler();
  patchProfileUploadHandler();
  patchTrashRestoreHandler();
  patchOpenAccModalHandler();
  // Wave 11.10 — 초기 avatar 표시 (사이드바 + acc-modal). 실패는 silent (avatar 없으면 initial fallback).
  // display_name 도 DB → 사이드바 동기화 (mocks 정적 "지오" 덮어쓰기)
  try {
    const me = await Profile.getMyProfile();
    if (me?.avatar_url) applyAvatarUrl(me.avatar_url);
    if (me?.display_name) {
      const sbName = document.querySelector('.sb__user-name');
      if (sbName) sbName.textContent = me.display_name;
    }
  } catch (err) {
    console.warn('[account] 초기 profile 로드 실패:', err?.message || err);
  }
}

/**
 * Wave 11.5.10 — 커스텀 confirm modal (글 삭제 등 destructive action 용).
 * `window.confirm` 대체 — acc-modal 패턴 답습 (mocks .acc-modal-overlay / .acc-modal-card / .acc-btn--danger 재사용).
 *
 * @param {object} opts
 * @param {string} opts.title — 모달 헤더
 * @param {string} opts.message — 본문 텍스트 (HTML escape 됨)
 * @param {string} [opts.confirmLabel='확인']
 * @param {string} [opts.cancelLabel='취소']
 * @param {boolean} [opts.danger=false] — true 면 confirm 버튼이 acc-btn--danger
 * @returns {Promise<boolean>} 사용자 선택 (true=확인 / false=취소·ESC·외부 클릭)
 */
export function confirmModal(opts = {}, doc = (typeof document !== 'undefined' ? document : null)) {
  return new Promise((resolve) => {
    if (!doc || typeof doc.createElement !== 'function') {
      return resolve(false);
    }
    const {
      title = '확인',
      message = '',
      confirmLabel = '확인',
      cancelLabel = '취소',
      danger = false,
    } = opts;
    const overlay = doc.createElement('div');
    overlay.className = 'acc-modal-overlay';
    overlay.setAttribute('data-confirm-modal', 'true');
    overlay.innerHTML = `
      <div class="acc-modal-card" role="dialog" aria-modal="true" aria-labelledby="confirmModalTitle">
        <div class="acc-modal-header">
          <span class="acc-modal-title" id="confirmModalTitle">${escapeHtml(title)}</span>
        </div>
        <div class="acc-modal-body">
          <p class="acc-confirm-text">${escapeHtml(message)}</p>
        </div>
        <div class="acc-modal-footer">
          <button class="acc-btn" type="button" data-confirm-cancel>${escapeHtml(cancelLabel)}</button>
          <button class="acc-btn ${danger ? 'acc-btn--danger' : 'acc-btn--primary'}" type="button" data-confirm-ok>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    doc.body.appendChild(overlay);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => overlay.classList.add('open'));
    } else {
      overlay.classList.add('open');
    }

    let resolved = false;
    function close(value) {
      if (resolved) return;
      resolved = true;
      overlay.classList.remove('open');
      const REMOVE_DELAY = 150;
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, REMOVE_DELAY);
      doc.removeEventListener('keydown', onKey);
      resolve(value);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        close(false);
        return;
      }
      const ok = e.target.closest?.('[data-confirm-ok]');
      if (ok) {
        close(true);
        return;
      }
      const cancel = e.target.closest?.('[data-confirm-cancel]');
      if (cancel) close(false);
    });
    doc.addEventListener('keydown', onKey);
    // 자동 focus — confirm 버튼
    const confirmBtn = overlay.querySelector('[data-confirm-ok]');
    if (confirmBtn && typeof confirmBtn.focus === 'function') {
      setTimeout(() => confirmBtn.focus(), 50);
    }
  });
}

/** 테스트 전용 — module-level patch state 리셋 (production 사용 X). */
export function __resetPatchState() {
  _logoutPatched = false;
  _savePatched = false;
  _uploadPatched = false;
  _trashPatched = false;
  _openModalPatched = false;
  _currentUser = null;
}

export const Account = {
  mountAccountView,
  patchLogoutHandler,
  patchProfileSaveHandler,
  patchProfileUploadHandler,
  patchTrashRestoreHandler,
  patchOpenAccModalHandler,
  applyAvatarUrl,
  rowToTrashHtml,
  formatDeletedDate,
  escapeHtml,
  // Wave 11.5.10 — 커스텀 confirm modal
  confirmModal,
};

if (typeof window !== 'undefined') {
  window.todayAccount = Account;
}

export default Account;
