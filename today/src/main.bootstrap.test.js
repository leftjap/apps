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
import { Sync } from './db/sync.js'; // vi.mock 으로 대체됨 — startSync 호출 횟수 검증용

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
  default: {
    setCurrentEmail: vi.fn(),
    loadUserMappings: vi.fn(async () => {}),
    invalidateUserCache: vi.fn(),
  },
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
    onRealtimeChange: vi.fn(() => () => {}),
  },
}));

vi.mock('./db/devSeed.js', () => ({
  DevSeed: { cleanupDevFixtures: vi.fn(async () => ({ ok: true, entriesRemoved: 0, expensesRemoved: 0 })) },
}));

// auth-session-guard/backup mock — SIGNED_OUT 경로를 네트워크 없이 결정적으로.
// guard.handleSignedOutWithRetry 는 명시 로그아웃처럼 onForceSignOut 콜백을 즉시 호출(→ 리셋 관통 검증).
vi.mock('./services/auth-session-guard.js', () => ({
  installAuthSessionGuard: vi.fn(() => ({
    handleSignedOutWithRetry: vi.fn(async (onForceSignOut) => { onForceSignOut(); }),
    markExplicitSignOut: vi.fn(),
    safeRefresh: vi.fn(async () => ({ skipped: 'test' })),
  })),
  markExplicitSignOut: vi.fn(),
}));

vi.mock('./services/auth-session-backup.js', () => ({
  backupSession: vi.fn(),
  restoreSessionIfMissing: vi.fn(async () => ({ restored: false })),
  clearBackup: vi.fn(),
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

  it('시나리오 3 — 동일 사용자 반복 이벤트(SIGNED_IN→TOKEN_REFRESHED→USER_UPDATED)는 1회만 부팅', async () => {
    // 이중 로딩 방지 — 반복 auth 이벤트가 전체 부팅(뷰 mount + startSync)을 다시 돌리면 안 됨.
    await import('./main.js');
    const session = { user: { id: 'u3', email: 'leftjap@gmail.com' } };

    await capturedAuthStateCallback('SIGNED_IN', session);
    await capturedAuthStateCallback('TOKEN_REFRESHED', session);
    await capturedAuthStateCallback('USER_UPDATED', session);

    expect(mockShowAuthenticated).toHaveBeenCalledTimes(1);
    expect(mockShowLogin).not.toHaveBeenCalled();
  });

  it('회귀 — 콜드부팅 실제 이벤트 순서(SIGNED_IN[_recoverAndRefresh] → INITIAL_SESSION)는 1회만 전체 부팅 (이중 로딩 방지)', async () => {
    // supabase-js 2.105.1 콜드부팅: _recoverAndRefresh 가 먼저 SIGNED_IN(토큰이 만료마진 밖) 또는
    // TOKEN_REFRESHED(만료마진 내)를 발화, 이어서 _emitInitialSession 이 INITIAL_SESSION 발화.
    // 가드 없으면 handleSession 2회 → 뷰 재마운트·startSync 중복 = 화면 두 번 로딩.
    await import('./main.js');
    const session = { user: { id: 'uDup', email: 'leftjap@gmail.com' } };

    await capturedAuthStateCallback('SIGNED_IN', session);
    await capturedAuthStateCallback('INITIAL_SESSION', session);

    expect(mockShowAuthenticated).toHaveBeenCalledTimes(1);
    expect(Sync.startSync).toHaveBeenCalledTimes(1);
  });

  it('회귀 — 로그아웃 후 동일 계정 재로그인은 정상 재부팅 (dedup 가드 리셋 관통 검증)', async () => {
    // 부팅 가드가 SIGNED_OUT 시 리셋되지 않으면 동일 사용자 재로그인이 skip 돼 빈 껍데기가 됨.
    // 명시 로그아웃은 guard.handleSignedOutWithRetry(콜백) 경로 → resetBootAndShowLogin 이
    // 콜백으로 전달돼야 리셋됨. guard mock 이 콜백을 즉시 호출해 이 경로를 결정적으로 검증.
    await import('./main.js');
    const session = { user: { id: 'uRelogin', email: 'leftjap@gmail.com' } };

    await capturedAuthStateCallback('SIGNED_IN', session); // 최초 로그인 → 부팅 1회
    expect(mockShowAuthenticated).toHaveBeenCalledTimes(1);

    await capturedAuthStateCallback('SIGNED_OUT', null);   // 로그아웃 → 가드 리셋
    expect(mockShowLogin).toHaveBeenCalled();

    await capturedAuthStateCallback('SIGNED_IN', session); // 동일 계정 재로그인 → 재부팅 되어야 함
    expect(mockShowAuthenticated).toHaveBeenCalledTimes(2);
  });

  it('사용자 전환(다른 user.id)은 dedup 되지 않고 각각 부팅', async () => {
    await import('./main.js');
    await capturedAuthStateCallback('INITIAL_SESSION', { user: { id: 'userA', email: 'leftjap@gmail.com' } });
    await capturedAuthStateCallback('SIGNED_IN', { user: { id: 'userB', email: 'soyoun312@gmail.com' } });
    expect(mockShowAuthenticated).toHaveBeenCalledTimes(2);
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
