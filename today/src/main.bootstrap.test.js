/**
 * main.js bootstrap 패턴 검증 — iOS WebKit race (#1560) 회피.
 *
 * 목적: subscribe-first 패턴이 iOS race 시나리오에서 정상 동작하는지 입증.
 * - 시나리오 1: persisted session 있음 → INITIAL_SESSION 으로 받아 인증 진입 (login flicker 없음)
 * - 시나리오 2: persisted session 없음 → INITIAL_SESSION + null → showLogin
 * - 시나리오 3: SIGNED_IN/TOKEN_REFRESHED/USER_UPDATED 도 동일 핸들러 경로
 * - 시나리오 4: SIGNED_OUT → showLogin
 *
 * main.js 는 import 시 bootstrap 자동 실행 → 모든 의존성 mock 후 import.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ───── 모든 main.js 의존성 mock (heavy import 차단 + 콜백 캡처)

let capturedAuthStateCallback = null;
let mockShowLogin;
let mockShowAuthenticated;
let mockEnsureUserDB;
let mockSignOut;
let mockEnsureProfile;
let persistCalled = false;
let persistGranted = true;

vi.mock('./services/auth.js', () => ({
  Auth: {
    AUTH_ERROR_KEY: 'todayAuthError',
    isAllowedEmail: (e) => ['leftjap@gmail.com', 'soyoun312@gmail.com'].includes(e),
    onAuthStateChange: vi.fn((cb) => {
      capturedAuthStateCallback = cb;
      return () => {};
    }),
    ensureUserDB: vi.fn(async () => null),
    signOut: vi.fn(async () => {}),
    registerOnSignOut: vi.fn(() => () => {}),
  },
}));

vi.mock('./services/profile.js', () => ({
  Profile: { ensureProfile: vi.fn(async () => null) },
}));

vi.mock('./features/entries.js', () => ({
  Entries: {
    mountEntriesView: vi.fn(),
    rebindCategoryObserver: vi.fn(),
  },
}));

vi.mock('./features/editor.js', () => ({
  Editor: { mountEditorTools: vi.fn() },
}));

vi.mock('./services/expense-classifier.js', () => ({
  default: { setCurrentEmail: vi.fn(), loadUserMappings: vi.fn(async () => {}) },
}));

vi.mock('./features/expenses.js', () => ({
  Expenses: {
    mountExpensesView: vi.fn(),
    rebindCategoryObserver: vi.fn(),
    refreshSidebarExpenseTotal: vi.fn(),
  },
}));

vi.mock('./features/notifications.js', () => ({
  Notifications: {
    mountNotificationsView: vi.fn(async () => {}),
    refreshAlertBadge: vi.fn(),
  },
}));

vi.mock('./features/spotlight.js', () => ({
  Spotlight: { mountSpotlightView: vi.fn(async () => {}) },
}));

vi.mock('./features/account.js', () => ({
  Account: { mountAccountView: vi.fn(async () => {}) },
}));

vi.mock('./features/comments.js', () => ({
  Comments: {
    mountCommentsView: vi.fn(async () => {}),
    refreshArticleComments: vi.fn(async () => {}),
  },
}));

vi.mock('./db/sync.js', () => ({
  Sync: {
    stopSync: vi.fn(),
    startSync: vi.fn(async () => null),
    flushPendingUploads: vi.fn(),
    flushPendingFromDexie: vi.fn(async () => {}),
    flushPendingExpensesFromDexie: vi.fn(async () => {}),
    onRealtimeChange: vi.fn(),
  },
}));

vi.mock('./db/devSeed.js', () => ({
  DevSeed: { cleanupDevFixtures: vi.fn(async () => ({ ok: true, entriesRemoved: 0, expensesRemoved: 0 })) },
}));

vi.mock('./app.js', () => {
  mockShowLogin = vi.fn();
  mockShowAuthenticated = vi.fn();
  return {
    showLogin: mockShowLogin,
    showAuthenticated: mockShowAuthenticated,
    setRouterUser: vi.fn(),
  };
});

// navigator.storage.persist mock — node env 의 navigator 는 read-only getter 라 vi.stubGlobal 로 교체.
beforeEach(() => {
  persistCalled = false;
  persistGranted = true;
  vi.stubGlobal('navigator', {
    storage: {
      persist: vi.fn(() => {
        persistCalled = true;
        return Promise.resolve(persistGranted);
      }),
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  // capturedAuthStateCallback 은 nuller 안 함 — main.js import 는 ES module 캐시 hit 라
  // 첫 테스트에서만 onAuthStateChange 가 호출되어 콜백이 등록됨. 이후 테스트는 그 콜백 재사용.
});

describe('main.js bootstrap subscribe-first 패턴 (iOS WebKit race fix)', () => {
  it('main import 시 onAuthStateChange 즉시 등록 + navigator.storage.persist() 호출', async () => {
    // 두 검증을 한 테스트에 묶음 — main.js 는 ES module 캐시로 한 번만 실행되므로
    // 첫 import 시점에 두 동작 모두 발생.
    await import('./main.js');
    await Promise.resolve();
    expect(capturedAuthStateCallback).toBeTypeOf('function');
    expect(persistCalled).toBe(true);
  });

  it('시나리오 1 — INITIAL_SESSION + persisted session → showAuthenticated (login flicker 없음)', async () => {
    await import('./main.js');
    expect(capturedAuthStateCallback).toBeTypeOf('function');

    const session = { user: { id: 'u1', email: 'leftjap@gmail.com' } };
    await capturedAuthStateCallback('INITIAL_SESSION', session);

    expect(mockShowAuthenticated).toHaveBeenCalledWith(session.user);
    expect(mockShowLogin).not.toHaveBeenCalled();
  });

  it('시나리오 2 — INITIAL_SESSION + null → showLogin', async () => {
    await import('./main.js');
    await capturedAuthStateCallback('INITIAL_SESSION', null);

    expect(mockShowLogin).toHaveBeenCalled();
    expect(mockShowAuthenticated).not.toHaveBeenCalled();
  });

  it('시나리오 3 — SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED 도 동일 경로', async () => {
    await import('./main.js');
    const session = { user: { id: 'u1', email: 'leftjap@gmail.com' } };

    await capturedAuthStateCallback('SIGNED_IN', session);
    await capturedAuthStateCallback('TOKEN_REFRESHED', session);
    await capturedAuthStateCallback('USER_UPDATED', session);

    expect(mockShowAuthenticated).toHaveBeenCalledTimes(3);
  });

  it('시나리오 4 — SIGNED_OUT → showLogin', async () => {
    await import('./main.js');
    // 먼저 인증 상태 진입
    await capturedAuthStateCallback('INITIAL_SESSION', { user: { id: 'u1', email: 'leftjap@gmail.com' } });
    mockShowLogin.mockClear();

    await capturedAuthStateCallback('SIGNED_OUT', null);

    expect(mockShowLogin).toHaveBeenCalled();
  });

  it('회귀 비교 — 이전 패턴이라면 race 시 login 화면 노출됐을 시나리오: 새 패턴은 INITIAL_SESSION 으로 회복', async () => {
    // 이전 패턴: const s = await getSession() → null (race) → showLogin
    // 새 패턴: subscribe → INITIAL_SESSION 발화 시 실제 session 받음 → showAuthenticated
    // 이 테스트는 새 패턴에서 getSession() 이 호출되지 않음을 입증.
    await import('./main.js');

    // 실 race 재현: INITIAL_SESSION 이 약간 지연 후 도착해도 결국 정상 처리
    await new Promise((r) => setTimeout(r, 5));
    const session = { user: { id: 'u1', email: 'leftjap@gmail.com' } };
    await capturedAuthStateCallback('INITIAL_SESSION', session);

    expect(mockShowAuthenticated).toHaveBeenCalledWith(session.user);
    expect(mockShowLogin).not.toHaveBeenCalled();
  });
});
