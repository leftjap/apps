/**
 * auth-session-guard — handleSignedOutWithRetry + markExplicitSignOut sentinel + cooldown.
 * listener 부착(visibilitychange 등)은 preview MCP integration 검증으로 커버 (node 환경 미보유).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  installAuthSessionGuard,
  markExplicitSignOut,
  __testHelpers__,
} from './auth-session-guard.js';

function makeSupabase({ refreshResult, sessionResult } = {}) {
  return {
    auth: {
      getSession: vi.fn(async () => sessionResult ?? { data: { session: { user: { id: 'u' } } }, error: null }),
      refreshSession: vi.fn(async () => refreshResult ?? { data: { session: null }, error: null }),
    },
  };
}

beforeEach(() => { __testHelpers__.reset(); });

describe('handleSignedOutWithRetry', () => {
  it('refresh 성공 시 redirect 호출 X', async () => {
    const sb = makeSupabase({ refreshResult: { data: { session: { user: { id: 'u' } } }, error: null } });
    const guard = installAuthSessionGuard(sb);
    const force = vi.fn();
    const r = await guard.handleSignedOutWithRetry(force);
    expect(r).toEqual({ retried: true, recovered: true });
    expect(force).not.toHaveBeenCalled();
  });

  it('refresh 실패 시 redirect 호출 O', async () => {
    const sb = makeSupabase({ refreshResult: { data: { session: null }, error: { message: 'fail' } } });
    const guard = installAuthSessionGuard(sb);
    const force = vi.fn();
    const r = await guard.handleSignedOutWithRetry(force);
    expect(r).toEqual({ retried: true, recovered: false });
    expect(force).toHaveBeenCalledOnce();
  });

  it('markExplicitSignOut 직후엔 retry 스킵하고 즉시 redirect', async () => {
    const sb = makeSupabase({ refreshResult: { data: { session: { user: { id: 'u' } } }, error: null } });
    const guard = installAuthSessionGuard(sb);
    const force = vi.fn();
    markExplicitSignOut();
    const r = await guard.handleSignedOutWithRetry(force);
    expect(r.retried).toBe(false);
    expect(r.reason).toBe('explicit');
    expect(force).toHaveBeenCalledOnce();
    expect(sb.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('60초 cooldown — 연속 호출 시 두 번째는 retry 스킵', async () => {
    const sb = makeSupabase({ refreshResult: { data: { session: null }, error: { message: 'fail' } } });
    const guard = installAuthSessionGuard(sb);
    const force = vi.fn();
    await guard.handleSignedOutWithRetry(force);
    await guard.handleSignedOutWithRetry(force);
    expect(sb.auth.refreshSession).toHaveBeenCalledOnce();
    expect(force).toHaveBeenCalledTimes(2);
  });
});

describe('safeRefresh cooldown', () => {
  it('연속 호출 시 5분 cooldown 으로 1회만 실제 호출', async () => {
    const sb = makeSupabase({ refreshResult: { data: { session: { user: { id: 'u' } } }, error: null } });
    const guard = installAuthSessionGuard(sb);
    const r1 = await guard.safeRefresh();
    const r2 = await guard.safeRefresh();
    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ skipped: 'cooldown' });
    expect(sb.auth.refreshSession).toHaveBeenCalledOnce();
  });
});
