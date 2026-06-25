// @vitest-environment jsdom
// 회귀: SIGNED_IN/INITIAL_SESSION (iOS 비동기 세션복원 경로) 가 window.__syncReady 를 설정해야
// home.js 의 `__syncReady.then(refreshStats)` 가 sync 후 홈을 갱신한다. 미설정 시 서버 데이터가
// 와도(빈 IndexedDB 기기) 홈이 0 으로 굳는 버그(2026-06 멀티기기). main.js boot 가 이미 설정한
// 경우(데스크톱)엔 ??= 로 덮어쓰지 않는다(real-pull promise 보존).
import { vi, describe, it, expect, beforeEach } from 'vitest';

let authCb = null;
vi.mock('./services/supabase.js', () => ({
  supabase: { auth: { onAuthStateChange: (cb) => { authCb = cb; return { data: { subscription: { unsubscribe() {} } } }; } } },
  storageKey: 'test',
}));
vi.mock('./services/auth-session-guard.js', () => ({ installAuthSessionGuard: () => ({}) }));
vi.mock('./services/auth-session-backup.js', () => ({ backupSession: () => {}, restoreSessionIfMissing: async () => null }));
vi.mock('./services/auth-diag.js', () => ({ markLogin: () => {}, mountDiag: async () => {}, unmountDiag: () => {} }));
vi.mock('./pages/home.js', () => ({ mountHome: () => () => {} }));
vi.mock('./pages/session-new.js', () => ({ mountSessionNew: () => () => {} }));
vi.mock('./pages/session-review.js', () => ({ mountSessionReview: () => () => {} }));
vi.mock('./pages/session-math.js', () => ({ mountSessionMath: () => () => {} }));
vi.mock('./pages/summary.js', () => ({ mountSummary: () => () => {} }));
vi.mock('./pages/login.js', () => ({ mountLogin: () => () => {} }));
vi.mock('./pages/settings.js', () => ({ mountSettings: () => () => {} }));
vi.mock('./pages/stats.js', () => ({ mountStats: () => () => {} }));

const { initApp } = await import('./app.js');
const USER = { id: 'u1', email: 'leftjap@gmail.com' };

describe('app — SIGNED_IN 경로가 window.__syncReady 설정 (iOS 홈 sync 후 갱신)', () => {
  beforeEach(() => {
    authCb = null;
    delete window.__syncReady;
    window.studyDB = {};
    window.scrollTo = () => {};
    window.studyAuth = {
      onAuthStateChange: (cb) => { authCb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
      isAllowedEmail: () => true,
      ensureUserDB: vi.fn(async () => {}),
      AUTH_ERROR_KEY: 'studyAuthError',
      signOut: vi.fn(async () => {}),
    };
  });

  it('SIGNED_IN 시 startSync 의 promise 를 window.__syncReady 에 할당한다', async () => {
    const syncPromise = Promise.resolve({ ok: true, results: [] });
    window.studySync = { startSync: vi.fn(() => syncPromise), allowEmptyServerPush: vi.fn() };
    initApp();
    expect(typeof authCb).toBe('function');
    await authCb('SIGNED_IN', { user: USER });
    expect(window.studySync.startSync).toHaveBeenCalledWith(USER);
    expect(window.__syncReady).toBe(syncPromise); // 수정 전: undefined → 실패
  });

  it('INITIAL_SESSION(하드리로드) 경로도 동일하게 설정한다', async () => {
    const syncPromise = Promise.resolve({ ok: true, results: [] });
    window.studySync = { startSync: vi.fn(() => syncPromise), allowEmptyServerPush: vi.fn() };
    initApp();
    await authCb('INITIAL_SESSION', { user: USER });
    expect(window.__syncReady).toBe(syncPromise);
  });

  it('이미 설정된 __syncReady(main.js boot real-pull)는 덮어쓰지 않는다 (??= 라 already_active no-op)', async () => {
    const boot = Promise.resolve({ ok: true, results: [] }); // main.js 의 real-pull promise
    window.__syncReady = boot;
    window.studySync = { startSync: vi.fn(() => Promise.resolve({ ok: true, reason: 'already_active' })), allowEmptyServerPush: vi.fn() };
    initApp();
    await authCb('INITIAL_SESSION', { user: USER });
    expect(window.__syncReady).toBe(boot); // boot 유지
  });
});
