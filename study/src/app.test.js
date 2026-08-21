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
const newMount = vi.fn(() => newCleanup);
vi.mock('./pages/session-new.js', () => ({ mountSessionNew: (...a) => newMount(...a) }));
vi.mock('./pages/home.js', () => ({ mountHome: () => homeCleanup }));
vi.mock('./pages/session-review.js', () => ({ mountSessionReview: () => () => {} }));
vi.mock('./pages/session-math.js', () => ({ mountSessionMath: () => () => {} }));
vi.mock('./pages/summary.js', () => ({ mountSummary: () => () => {} }));
vi.mock('./pages/login.js', () => ({ mountLogin: () => () => {} }));
vi.mock('./pages/settings.js', () => ({ mountSettings: () => () => {} }));
vi.mock('./pages/stats.js', () => ({ mountStats: () => () => {} }));

const { mount, initApp } = await import('./app.js');

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

/* 탭 복귀 재마운트 회귀 (2026-08-21 실사고).
 * GoTrue 는 탭 hidden→visible 마다 SIGNED_IN 을 재발화한다
 * (auth-js GoTrueClient `_onVisibilityChanged` → `_recoverAndRefresh` → SIGNED_IN, dedup 없음).
 * 그때마다 현재 라우트를 재마운트하면 진행 중이던 세션 화면이 통째로 리셋돼
 * 응용 연습 점수·녹음 카운터(스냅샷 미저장 항목)가 소실된다. */
describe('SPA 라우터 — SIGNED_IN 재발화 시 진행 중 화면 유지', () => {
  const DB_A = { name: 'A' };
  let authCb = null;
  const tick = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(async () => {
    window.scrollTo = () => {};
    window.studyDB = DB_A;
    window.studyAuth = {
      onAuthStateChange: (cb) => { authCb = cb; return () => {}; },
      isAllowedEmail: () => true,
      ensureUserDB: async () => window.studyDB,
    };
    window.location.hash = '#/session-new';
    await tick();          // 직전 테스트가 건 hashchange 리스너 flush
    initApp();             // auth 구독 + 세션 라우트 마운트
    newMount.mockClear();
    newCleanup.mockClear();
  });

  it('같은 DB 로 SIGNED_IN 이 다시 와도 재마운트하지 않는다 (탭 복귀)', async () => {
    await authCb('SIGNED_IN', { user: { id: 'u1', email: 'a@b.c' } });
    expect(newMount).not.toHaveBeenCalled();
    expect(newCleanup).not.toHaveBeenCalled();  // 진행 중 화면 그대로
  });

  it('DB 인스턴스가 교체되면 재마운트한다 (계정 전환·뒤늦은 ensureUserDB)', async () => {
    window.studyAuth.ensureUserDB = async () => { window.studyDB = { name: 'B' }; return window.studyDB; };
    await authCb('SIGNED_IN', { user: { id: 'u2', email: 'a@b.c' } });
    expect(newMount).toHaveBeenCalledTimes(1);
    expect(newCleanup).toHaveBeenCalledTimes(1);
  });
});
