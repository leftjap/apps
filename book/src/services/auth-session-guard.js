/**
 * 세션 가드 — iOS PWA 백그라운드 복귀·SIGNED_OUT 처리 보강 (today 패턴 답습).
 *
 * 책임:
 *  - visibilitychange / focus / pageshow 시 supabase.auth.refreshSession() 선제 호출 (5분 cooldown).
 *  - onAuthStateChange 의 SIGNED_OUT 이벤트를 silent retry 로 감싸 1회 refresh 시도 후 실패 시에만 redirect.
 *  - 사용자/allowlist 명시 logout 직후엔 retry 우회 (markExplicitSignOut sentinel).
 */
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
const SIGNED_OUT_RETRY_COOLDOWN_MS = 60 * 1000;
const EXPLICIT_SIGNOUT_WINDOW_MS = 5 * 1000;

let _lastRefreshAt = 0;
let _refreshing = false;
let _lastSignedOutRetryAt = 0;
let _explicitSignOutAt = 0;

export function markExplicitSignOut() {
  _explicitSignOutAt = Date.now();
}

async function safeRefresh(supabase) {
  if (_refreshing) return { skipped: 'in-flight' };
  if (Date.now() - _lastRefreshAt < REFRESH_COOLDOWN_MS) return { skipped: 'cooldown' };
  _refreshing = true;
  try {
    // 세션 없으면 refresh 시도 자체 무의미 (콘솔 noise + 만료 토큰 401 회피).
    const cur = await supabase.auth.getSession().catch(() => null);
    if (!cur?.data?.session) return { skipped: 'no-session' };
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data?.session) {
      _lastRefreshAt = Date.now();
      return { ok: true };
    }
    return { ok: false, error };
  } catch (e) {
    return { ok: false, error: e };
  } finally {
    _refreshing = false;
  }
}

export function installAuthSessionGuard(supabase) {
  if (!supabase) return null;
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        safeRefresh(supabase).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);
  }

  return {
    markExplicitSignOut,
    safeRefresh: () => safeRefresh(supabase),
    async handleSignedOutWithRetry(onForceSignOut) {
      const now = Date.now();
      if (now - _explicitSignOutAt < EXPLICIT_SIGNOUT_WINDOW_MS) {
        onForceSignOut();
        return { retried: false, reason: 'explicit' };
      }
      if (now - _lastSignedOutRetryAt < SIGNED_OUT_RETRY_COOLDOWN_MS) {
        onForceSignOut();
        return { retried: false, reason: 'cooldown' };
      }
      _lastSignedOutRetryAt = now;
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (!error && data?.session) {
          return { retried: true, recovered: true };
        }
      } catch {}
      onForceSignOut();
      return { retried: true, recovered: false };
    },
  };
}

export const __testHelpers__ = {
  reset() {
    _lastRefreshAt = 0;
    _refreshing = false;
    _lastSignedOutRetryAt = 0;
    _explicitSignOutAt = 0;
  },
  getState() {
    return {
      lastRefreshAt: _lastRefreshAt,
      refreshing: _refreshing,
      lastSignedOutRetryAt: _lastSignedOutRetryAt,
      explicitSignOutAt: _explicitSignOutAt,
    };
  },
};
