// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest';

// app.js 가 import 시점에 실행하는 서비스 stub (jsdom 안전)
vi.mock('./services/supabase.js', () => ({
  supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
  storageKey: 'test',
}));
vi.mock('./services/auth-session-guard.js', () => ({ installAuthSessionGuard: () => ({}) }));
vi.mock('./services/auth-session-backup.js', () => ({ backupSession: () => {}, restoreSessionIfMissing: async () => null }));
vi.mock('./services/auth-diag.js', () => ({ markLogin: () => {}, mountDiag: async () => {}, unmountDiag: () => {} }));

// 페이지 mount: home/session-new 는 cleanup spy 반환, 나머지 no-op cleanup
const newCleanup = vi.fn();
const homeCleanup = vi.fn();
vi.mock('./pages/session-new.js', () => ({ mountSessionNew: () => newCleanup }));
vi.mock('./pages/home.js', () => ({ mountHome: () => homeCleanup }));
vi.mock('./pages/session-review.js', () => ({ mountSessionReview: () => () => {} }));
vi.mock('./pages/session-math.js', () => ({ mountSessionMath: () => () => {} }));
vi.mock('./pages/summary.js', () => ({ mountSummary: () => () => {} }));
vi.mock('./pages/login.js', () => ({ mountLogin: () => () => {} }));
vi.mock('./pages/settings.js', () => ({ mountSettings: () => () => {} }));
vi.mock('./pages/stats.js', () => ({ mountStats: () => () => {} }));

const { mount } = await import('./app.js');

describe('SPA 라우터 — 페이지 cleanup 호출 (activeSession 스냅샷 보존)', () => {
  beforeEach(() => {
    window.studyDB = {};          // isAuthorized 통과 (login 외 라우트)
    window.scrollTo = () => {};   // jsdom 미구현 stub
    mount({ name: 'login', params: {} }); // 모듈 상태 currentCleanup 을 중립(login no-op)으로 리셋
    newCleanup.mockClear();
    homeCleanup.mockClear();
  });

  it('다른 라우트로 네비게이션 시 직전 페이지의 cleanup 을 호출한다', () => {
    mount({ name: 'session-new', params: {} });
    expect(newCleanup).not.toHaveBeenCalled();   // 세션 화면 진입 — 아직 cleanup 전
    mount({ name: 'home', params: {} });          // 홈으로 인앱 이탈
    expect(newCleanup).toHaveBeenCalledTimes(1);  // 직전 세션 cleanup 실행돼야 (= saveSnapshot 기회)
  });

  it('연속 네비게이션마다 직전 cleanup 만 한 번씩 호출한다', () => {
    mount({ name: 'session-new', params: {} });
    mount({ name: 'home', params: {} });
    mount({ name: 'session-new', params: {} });
    expect(newCleanup).toHaveBeenCalledTimes(1);  // 첫 세션 cleanup 1회
    expect(homeCleanup).toHaveBeenCalledTimes(1); // 홈 cleanup 1회
  });
});
