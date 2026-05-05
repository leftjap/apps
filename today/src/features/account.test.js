/**
 * account.js 단위 테스트 (Wave 11.5.9 — openAccModal Dexie + Auth wiring).
 *
 * 범위:
 *   - rowToTrashHtml / formatDeletedDate — pure 직렬화
 *   - patchLogoutHandler — capture click → win.closeAccModal + Auth.signOut 흐름
 *   - patchProfileSaveHandler — capture click → updateProfile (supabase null → null) + closeAccModal
 *   - patchTrashRestoreHandler — capture click → Queries.restoreEntry + row.remove
 *   - patchOpenAccModalHandler — orig 호출 + trash 분기 setTimeout 동작
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Account,
  rowToTrashHtml,
  formatDeletedDate,
  escapeHtml,
  patchLogoutHandler,
  patchProfileSaveHandler,
  patchProfileUploadHandler,
  patchTrashRestoreHandler,
  patchOpenAccModalHandler,
  applyAvatarUrl,
  mountAccountView,
  __resetPatchState,
  confirmModal,
} from './account.js';
import { createTodayDB } from '../db/schema.js';

const OWNER = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
  __resetPatchState();
});

describe('Account 인터페이스 노출', () => {
  it('필수 멤버 노출', () => {
    const required = [
      'mountAccountView',
      'patchLogoutHandler',
      'patchProfileSaveHandler',
      'patchProfileUploadHandler',
      'patchTrashRestoreHandler',
      'patchOpenAccModalHandler',
      'applyAvatarUrl',
      'rowToTrashHtml',
      'formatDeletedDate',
      'escapeHtml',
      'confirmModal',
    ];
    for (const k of required) {
      expect(typeof Account[k]).toBe('function');
    }
  });
});

describe('confirmModal — Wave 11.5.10', () => {
  it('doc=null → false 반환 (즉시)', async () => {
    const r = await confirmModal({ message: '삭제?' }, null);
    expect(r).toBe(false);
  });

  it('createElement 미정의 → false', async () => {
    const r = await confirmModal({ message: '삭제?' }, {});
    expect(r).toBe(false);
  });

  it('옵션 default 처리 (danger=false)', async () => {
    // doc=null 분기로 실제 modal 마운트 안 하지만 옵션 검증 — confirmModal 호출 자체 실패하지 않음
    const r = await confirmModal({}, null);
    expect(r).toBe(false);
  });

  it('fake doc 에 overlay append + 사용자 click 시뮬레이션 → 확인=true', async () => {
    // 최소 fake doc — element 객체 chain
    const events = new Map();
    const removedKeydownHandlers = [];
    const fakeOverlay = {
      _classList: new Set(),
      classList: {
        add(c) { fakeOverlay._classList.add(c); },
        remove(c) { fakeOverlay._classList.delete(c); },
      },
      attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      _children: [],
      innerHTML: '',
      addEventListener: (type, h) => events.set('overlay:' + type, h),
      removeEventListener: () => {},
      _listeners: {},
      querySelector: () => null,
      parentNode: null,
    };
    let lastQuery = null;
    fakeOverlay.querySelector = (sel) => {
      lastQuery = sel;
      if (sel === '[data-confirm-ok]') return { focus: vi.fn() };
      return null;
    };
    const fakeDoc = {
      createElement: () => fakeOverlay,
      body: {
        appendChild: (el) => {
          fakeOverlay.parentNode = fakeDoc.body;
          fakeOverlay._appended = true;
        },
        removeChild: () => {
          fakeOverlay.parentNode = null;
        },
      },
      addEventListener: (type, h) => events.set('doc:' + type, h),
      removeEventListener: (type) => {
        removedKeydownHandlers.push(type);
      },
    };
    const promise = confirmModal({ title: '삭제', message: '확실?', danger: true }, fakeDoc);
    // overlay click 시뮬레이션 — confirm-ok 매치
    expect(fakeOverlay._appended).toBe(true);
    expect(fakeOverlay.innerHTML).toContain('삭제');
    expect(fakeOverlay.innerHTML).toContain('확실?');
    expect(fakeOverlay.innerHTML).toContain('acc-btn--danger');
    const overlayClick = events.get('overlay:click');
    overlayClick({
      target: { closest: (sel) => (sel === '[data-confirm-ok]' ? {} : null) },
    });
    const r = await promise;
    expect(r).toBe(true);
  });

  it('Escape key → false', async () => {
    const events = new Map();
    const fakeOverlay = {
      classList: { add: vi.fn(), remove: vi.fn() },
      setAttribute: vi.fn(),
      innerHTML: '',
      addEventListener: (t, h) => events.set('overlay:' + t, h),
      removeEventListener: () => {},
      querySelector: () => null,
      parentNode: null,
    };
    const fakeDoc = {
      createElement: () => fakeOverlay,
      body: { appendChild: () => { fakeOverlay.parentNode = fakeDoc.body; }, removeChild: () => {} },
      addEventListener: (t, h) => events.set('doc:' + t, h),
      removeEventListener: () => {},
    };
    const promise = confirmModal({ message: 'x' }, fakeDoc);
    const onKey = events.get('doc:keydown');
    onKey({ key: 'Escape' });
    const r = await promise;
    expect(r).toBe(false);
  });

  it('Enter key → true', async () => {
    const events = new Map();
    const fakeOverlay = {
      classList: { add: vi.fn(), remove: vi.fn() },
      setAttribute: vi.fn(),
      innerHTML: '',
      addEventListener: (t, h) => events.set('overlay:' + t, h),
      removeEventListener: () => {},
      querySelector: () => null,
      parentNode: null,
    };
    const fakeDoc = {
      createElement: () => fakeOverlay,
      body: { appendChild: () => { fakeOverlay.parentNode = fakeDoc.body; }, removeChild: () => {} },
      addEventListener: (t, h) => events.set('doc:' + t, h),
      removeEventListener: () => {},
    };
    const promise = confirmModal({ message: 'x' }, fakeDoc);
    const onKey = events.get('doc:keydown');
    onKey({ key: 'Enter' });
    const r = await promise;
    expect(r).toBe(true);
  });

  it('XSS escape (message + title)', async () => {
    const captured = { html: null };
    const fakeOverlay = {
      classList: { add: () => {}, remove: () => {} },
      setAttribute: () => {},
      set innerHTML(v) { captured.html = v; },
      get innerHTML() { return captured.html || ''; },
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => null,
      parentNode: null,
    };
    const fakeDoc = {
      createElement: () => fakeOverlay,
      body: { appendChild: () => { fakeOverlay.parentNode = fakeDoc.body; }, removeChild: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const promise = confirmModal({
      title: '<x>제목</x>',
      message: '<script>alert(1)</script>',
    }, fakeDoc);
    expect(captured.html).not.toContain('<script>');
    expect(captured.html).toContain('&lt;script&gt;');
    expect(captured.html).toContain('&lt;x&gt;제목');
    // Promise 정리 — Escape simulated 없으므로 close 호출 안 됨 → 외부에서 cancel
    // 메모리 누수 방지: 직접 promise 결과 무시 (테스트 종료 시 가비지 콜렉션)
  });
});

describe('formatDeletedDate', () => {
  it('ISO → "M월 D일"', () => {
    expect(formatDeletedDate('2026-04-18T10:00:00Z')).toBe('4월 18일');
  });
  it('null/undefined → ""', () => {
    expect(formatDeletedDate(null)).toBe('');
    expect(formatDeletedDate(undefined)).toBe('');
    expect(formatDeletedDate('')).toBe('');
  });
  it('잘못된 ISO → ""', () => {
    expect(formatDeletedDate('not-a-date')).toBe('');
  });
});

describe('rowToTrashHtml', () => {
  it('필수 필드 직렬화 + kind 라벨 + 삭제일', () => {
    const html = rowToTrashHtml({
      id: 'abc-1',
      title: '여름의 잔상',
      kind: 'fiction',
      deleted_at: '2026-04-18T10:00:00Z',
    });
    expect(html).toContain('data-trash-id="abc-1"');
    expect(html).toContain('여름의 잔상');
    expect(html).toContain('단편 · 4월 18일 삭제');
    expect(html).toContain('class="acc-trash-row__action"');
    expect(html).toContain('복구</button>');
  });

  it('XSS escape (title)', () => {
    const html = rowToTrashHtml({
      id: 'x',
      title: '<script>alert(1)</script>',
      kind: 'navi',
      deleted_at: null,
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('soyoun_navi → 네비 라벨 (본인 navi 와 동일)', () => {
    const html = rowToTrashHtml({
      id: 'p',
      title: '소연 글',
      kind: 'soyoun_navi',
      deleted_at: '2026-04-15T00:00:00Z',
    });
    expect(html).toContain('네비');
  });

  it('알 수 없는 kind → "글" 폴백', () => {
    const html = rowToTrashHtml({ id: 'u', title: 'X', kind: 'unknown' });
    expect(html).toContain('글');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// patch handler — fake doc/win 으로 listener 등록 후 직접 호출
// ───────────────────────────────────────────────────────────────────────────

function makeFakeDoc({ getElementById = () => null, querySelector = () => null } = {}) {
  const listeners = new Map();
  return {
    addEventListener: (type, handler) => {
      listeners.set(type, handler);
    },
    getElementById,
    querySelector,
    listeners,
  };
}

function makeFakeEvent({ target }) {
  return {
    target,
    stopImmediatePropagation: vi.fn(),
  };
}

describe('patchLogoutHandler', () => {
  it('[data-acc-confirm-logout] click → closeAccModal + signOut', async () => {
    const closeAccModal = vi.fn();
    const fakeWin = { closeAccModal };
    const doc = makeFakeDoc();
    const ok = patchLogoutHandler({ doc, win: fakeWin });
    expect(ok).toBe(true);
    const handler = doc.listeners.get('click');
    expect(typeof handler).toBe('function');
    const btn = { dataset: { accConfirmLogout: '' } };
    const event = makeFakeEvent({
      target: { closest: (sel) => (sel === '[data-acc-confirm-logout]' ? btn : null) },
    });
    await handler(event);
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    expect(closeAccModal).toHaveBeenCalled();
    // Auth.signOut 은 supabase 미설정 → console.warn (콜백만 호출). 여기선 throw 없으면 통과.
  });

  it('관련 없는 click → no-op (stopImmediatePropagation 미호출)', async () => {
    const doc = makeFakeDoc();
    patchLogoutHandler({ doc, win: { closeAccModal: vi.fn() } });
    const handler = doc.listeners.get('click');
    const event = makeFakeEvent({ target: { closest: () => null } });
    await handler(event);
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
  });
});

describe('patchProfileSaveHandler', () => {
  it('[data-acc-save] click + 입력값 → closeAccModal (supabase 미설정 — updateProfile null)', async () => {
    const closeAccModal = vi.fn();
    const fakeWin = { closeAccModal };
    const sbName = { textContent: '기존' };
    const input = { value: '  새 이름  ' };
    const doc = makeFakeDoc({
      getElementById: (id) => (id === 'accProfileName' ? input : null),
      querySelector: (sel) => (sel === '.sb__user-name' ? sbName : null),
    });
    patchProfileSaveHandler({ doc, win: fakeWin });
    const handler = doc.listeners.get('click');
    const btn = { dataset: { accSave: '' } };
    const event = makeFakeEvent({
      target: { closest: (sel) => (sel === '[data-acc-save]' ? btn : null) },
    });
    await handler(event);
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    expect(closeAccModal).toHaveBeenCalled();
    // Wave 11.5.11 — supabase 미설정이어도 sb__user-name 즉시 갱신 (시각 피드백 우선)
    expect(sbName.textContent).toBe('새 이름');
  });

  it('빈 입력 → updateProfile 호출 없이 닫기만', async () => {
    const closeAccModal = vi.fn();
    const input = { value: '   ' };
    const doc = makeFakeDoc({
      getElementById: () => input,
      querySelector: () => null,
    });
    patchProfileSaveHandler({ doc, win: { closeAccModal } });
    const handler = doc.listeners.get('click');
    const event = makeFakeEvent({
      target: { closest: (sel) => (sel === '[data-acc-save]' ? {} : null) },
    });
    await handler(event);
    expect(closeAccModal).toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.10 — 프로필 사진 업로드 + avatar 표시
// ───────────────────────────────────────────────────────────────────────────

describe('applyAvatarUrl — DOM img.src 설정 + hidden 해제 (Wave 11.10)', () => {
  function makeFakeImg() {
    const attrs = {};
    return {
      src: '',
      hidden: true,
      removeAttribute(k) { delete attrs[k]; },
    };
  }

  it('img 0개 → 0 반환 (no-op)', () => {
    const doc = { querySelectorAll: vi.fn(() => []) };
    const r = applyAvatarUrl('https://x', doc);
    expect(r).toBe(0);
  });

  it('img 1개 → src 설정 + hidden 해제, 1 반환', () => {
    const img = makeFakeImg();
    const doc = { querySelectorAll: vi.fn(() => [img]) };
    const r = applyAvatarUrl('https://x/avatar.jpg', doc);
    expect(r).toBe(1);
    expect(img.src).toBe('https://x/avatar.jpg');
    expect(img.hidden).toBe(false);
    expect(doc.querySelectorAll).toHaveBeenCalledWith('.sb__avatar-img, .acc-profile-avatar-img');
  });

  it('img 2개 (사이드바 + acc-modal) → 둘 다 갱신', () => {
    const img1 = makeFakeImg();
    const img2 = makeFakeImg();
    const doc = { querySelectorAll: vi.fn(() => [img1, img2]) };
    const r = applyAvatarUrl('https://x', doc);
    expect(r).toBe(2);
    expect(img1.hidden).toBe(false);
    expect(img2.hidden).toBe(false);
  });

  it('url 빈 문자열 → 0 반환 (no-op)', () => {
    const img = makeFakeImg();
    const doc = { querySelectorAll: vi.fn(() => [img]) };
    expect(applyAvatarUrl('', doc)).toBe(0);
    expect(applyAvatarUrl(null, doc)).toBe(0);
    expect(img.hidden).toBe(true);
  });

  it('doc null → 0 반환', () => {
    expect(applyAvatarUrl('https://x', null)).toBe(0);
  });
});

describe('patchProfileUploadHandler — file input + uploadAvatar wiring (Wave 11.10)', () => {
  function makeFakeImg() {
    return { src: '', hidden: true, removeAttribute() {} };
  }

  function makeFakeInput() {
    const listeners = new Map();
    return {
      type: '',
      accept: '',
      style: {},
      files: [],
      addEventListener(type, h) { listeners.set(type, h); },
      click: vi.fn(),
      _listeners: listeners,
      parentNode: null,
    };
  }

  function makeFakeDocWithUpload({ input, body, querySelectorAllResult = [] } = {}) {
    const listeners = new Map();
    return {
      addEventListener: (type, handler) => { listeners.set(type, handler); },
      createElement: vi.fn(() => input),
      body: body ?? { appendChild: vi.fn((n) => { if (input) input.parentNode = body; return n; }) },
      querySelectorAll: vi.fn(() => querySelectorAllResult),
      listeners,
    };
  }

  it('listener 등록 + idempotent (두 번째 호출 true)', () => {
    const doc = makeFakeDocWithUpload();
    expect(patchProfileUploadHandler({ doc })).toBe(true);
    expect(patchProfileUploadHandler({ doc })).toBe(true);
    expect(doc.listeners.size).toBe(1);
  });

  it('click event — currentUser 없으면 file input 생성 안 함', async () => {
    const doc = makeFakeDocWithUpload();
    patchProfileUploadHandler({ doc });
    const handler = doc.listeners.get('click');
    const event = makeFakeEvent({ target: { closest: (sel) => (sel === '.acc-profile-upload-link' ? {} : null) } });
    event.preventDefault = vi.fn();
    await handler(event);
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    expect(doc.createElement).not.toHaveBeenCalled();
  });

  it('click event — currentUser 있으면 file input 생성 + click 호출', async () => {
    const input = makeFakeInput();
    const doc = makeFakeDocWithUpload({ input });
    const Entries = { compressImage: vi.fn() };
    const Profile = { uploadAvatar: vi.fn() };
    const user = { id: '00000000-0000-0000-0000-000000000099' };
    patchProfileUploadHandler({ doc, Entries, Profile, currentUser: user });
    const handler = doc.listeners.get('click');
    const event = makeFakeEvent({ target: { closest: (sel) => (sel === '.acc-profile-upload-link' ? {} : null) } });
    event.preventDefault = vi.fn();
    await handler(event);
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    expect(doc.createElement).toHaveBeenCalledWith('input');
    expect(input.type).toBe('file');
    expect(input.accept).toContain('image/jpeg');
    expect(input.click).toHaveBeenCalledTimes(1);
  });

  it('file change 흐름 — compressImage(square:256) → uploadAvatar → applyAvatarUrl', async () => {
    const input = makeFakeInput();
    const img = makeFakeImg();
    const doc = makeFakeDocWithUpload({ input, querySelectorAllResult: [img] });
    const fakeFile = { name: 'a.jpg', type: 'image/jpeg' };
    input.files = [fakeFile];
    const compressed = { ok: true, dataUrl: 'data:image/jpeg;base64,XXX' };
    const Entries = { compressImage: vi.fn(async () => compressed) };
    const uploadResult = { ok: true, avatar_url: 'https://stub/today-avatars/u/avatar.jpeg?t=1' };
    const Profile = { uploadAvatar: vi.fn(async () => uploadResult) };
    const user = { id: '00000000-0000-0000-0000-000000000099' };
    patchProfileUploadHandler({ doc, Entries, Profile, currentUser: user });
    const handler = doc.listeners.get('click');
    const event = makeFakeEvent({ target: { closest: (sel) => (sel === '.acc-profile-upload-link' ? {} : null) } });
    event.preventDefault = vi.fn();
    await handler(event);
    // file change 핸들러 직접 트리거
    const changeHandler = input._listeners.get('change');
    expect(typeof changeHandler).toBe('function');
    await changeHandler();
    expect(Entries.compressImage).toHaveBeenCalledWith(fakeFile, { square: 256, quality: 0.85 });
    expect(Profile.uploadAvatar).toHaveBeenCalledWith(compressed.dataUrl, { user_id: user.id });
    expect(img.src).toBe(uploadResult.avatar_url);
    expect(img.hidden).toBe(false);
  });

  it('file change — compressImage 실패 시 uploadAvatar 미호출', async () => {
    const input = makeFakeInput();
    const doc = makeFakeDocWithUpload({ input });
    input.files = [{ name: 'x.jpg', type: 'image/jpeg' }];
    const Entries = { compressImage: vi.fn(async () => ({ ok: false, reason: 'unsupported_format' })) };
    const Profile = { uploadAvatar: vi.fn() };
    patchProfileUploadHandler({ doc, Entries, Profile, currentUser: { id: 'u' } });
    const handler = doc.listeners.get('click');
    await handler(makeFakeEvent({ target: { closest: () => ({}) } }));
    await input._listeners.get('change')();
    expect(Profile.uploadAvatar).not.toHaveBeenCalled();
  });

  it('file change — uploadAvatar 실패 시 applyAvatarUrl 미호출', async () => {
    const input = makeFakeInput();
    const img = makeFakeImg();
    const doc = makeFakeDocWithUpload({ input, querySelectorAllResult: [img] });
    input.files = [{ name: 'x.jpg', type: 'image/jpeg' }];
    const Entries = { compressImage: vi.fn(async () => ({ ok: true, dataUrl: 'data:image/jpeg;base64,X' })) };
    const Profile = { uploadAvatar: vi.fn(async () => ({ ok: false, reason: 'upload_failed' })) };
    patchProfileUploadHandler({ doc, Entries, Profile, currentUser: { id: 'u' } });
    const handler = doc.listeners.get('click');
    await handler(makeFakeEvent({ target: { closest: () => ({}) } }));
    await input._listeners.get('change')();
    expect(img.src).toBe('');
    expect(img.hidden).toBe(true);
  });

  it('Entries.compressImage 미노출 시 file input 생성 안 함', async () => {
    const doc = makeFakeDocWithUpload();
    patchProfileUploadHandler({ doc, Entries: {}, currentUser: { id: 'u' } });
    const handler = doc.listeners.get('click');
    const event = makeFakeEvent({ target: { closest: () => ({}) } });
    event.preventDefault = vi.fn();
    await handler(event);
    expect(doc.createElement).not.toHaveBeenCalled();
  });
});

describe('patchTrashRestoreHandler', () => {
  beforeEach(async () => {
    const dbName = 'today_test_' + Math.random().toString(36).slice(2, 10);
    globalThis.todayDB = createTodayDB(dbName);
  });

  afterEach(async () => {
    if (globalThis.todayDB) {
      await globalThis.todayDB.delete();
      globalThis.todayDB = null;
    }
  });

  it('[data-trash-id] click → restoreEntry + row.remove', async () => {
    const { Queries } = await import('../db/queries.js');
    const e = await Queries.createEntry({ owner_id: OWNER, kind: 'navi', title: '복원 대상' });
    await Queries.softDeleteEntry(e.id);
    const removed = vi.fn();
    const row = { remove: removed };
    const btn = {
      dataset: { trashId: e.id },
      closest: (sel) => (sel === '.acc-trash-row' ? row : null),
      disabled: false,
      textContent: '복구',
    };
    const doc = makeFakeDoc();
    patchTrashRestoreHandler({ doc });
    const handler = doc.listeners.get('click');
    const event = makeFakeEvent({
      target: { closest: (sel) => (sel === '[data-trash-id]' ? btn : null) },
    });
    await handler(event);
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    const restored = await Queries.getEntry(e.id);
    expect(restored.deleted_at).toBeNull();
    expect(removed).toHaveBeenCalled();
  });

  it('id 없는 button → no-op', async () => {
    const { Queries } = await import('../db/queries.js');
    const restoreSpy = vi.spyOn(Queries, 'restoreEntry');
    const doc = makeFakeDoc();
    patchTrashRestoreHandler({ doc });
    const handler = doc.listeners.get('click');
    const btn = { dataset: {}, closest: () => null };
    const event = makeFakeEvent({
      target: { closest: (sel) => (sel === '[data-trash-id]' ? btn : null) },
    });
    await handler(event);
    expect(restoreSpy).not.toHaveBeenCalled();
    restoreSpy.mockRestore();
  });
});

describe('patchOpenAccModalHandler', () => {
  beforeEach(async () => {
    const dbName = 'today_test_' + Math.random().toString(36).slice(2, 10);
    globalThis.todayDB = createTodayDB(dbName);
  });

  afterEach(async () => {
    if (globalThis.todayDB) {
      await globalThis.todayDB.delete();
      globalThis.todayDB = null;
    }
  });

  it('orig 호출 + trash 분기 — Dexie listDeletedEntries → trashBody 덮어쓰기', async () => {
    const { Queries } = await import('../db/queries.js');
    const e = await Queries.createEntry({ owner_id: OWNER, kind: 'fiction', title: '휴지통 글' });
    await Queries.softDeleteEntry(e.id);

    const origCalls = [];
    const fakeBody = { innerHTML: '' };
    const fakeOverlay = { querySelector: (sel) => (sel === '.acc-modal-body' ? fakeBody : null) };
    const fakeDoc = {
      getElementById: (id) => (id === 'accModalOverlay' ? fakeOverlay : null),
    };
    const fakeWin = {
      openAccModal: function origOpenAccModal(action) { origCalls.push(action); },
    };
    const ok = patchOpenAccModalHandler({ win: fakeWin, doc: fakeDoc });
    expect(ok).toBe(true);
    fakeWin.openAccModal('trash');
    // setTimeout 0 후 trashBody 가 갱신됨
    await new Promise((r) => setTimeout(r, 50));
    expect(origCalls).toEqual(['trash']);
    expect(fakeBody.innerHTML).toContain('data-trash-id="' + e.id + '"');
    expect(fakeBody.innerHTML).toContain('휴지통 글');
  });

  it('trash 분기 + 빈 휴지통 → "휴지통이 비어 있습니다"', async () => {
    const fakeBody = { innerHTML: '' };
    const fakeOverlay = { querySelector: () => fakeBody };
    const fakeDoc = { getElementById: () => fakeOverlay };
    const fakeWin = { openAccModal: () => {} };
    patchOpenAccModalHandler({ win: fakeWin, doc: fakeDoc });
    fakeWin.openAccModal('trash');
    await new Promise((r) => setTimeout(r, 50));
    expect(fakeBody.innerHTML).toContain('휴지통이 비어 있습니다');
  });

  it('action !== "trash" → trashBody 갱신 안 함', async () => {
    const fakeBody = { innerHTML: '원본' };
    const fakeOverlay = { querySelector: () => fakeBody };
    const fakeDoc = { getElementById: () => fakeOverlay };
    const fakeWin = { openAccModal: () => {} };
    patchOpenAccModalHandler({ win: fakeWin, doc: fakeDoc });
    fakeWin.openAccModal('profile');
    await new Promise((r) => setTimeout(r, 50));
    expect(fakeBody.innerHTML).toBe('원본');
  });
});

describe('mountAccountView', () => {
  it('user 없음 → no-op', async () => {
    await expect(mountAccountView(null)).resolves.toBeUndefined();
    await expect(mountAccountView({})).resolves.toBeUndefined();
  });
});
