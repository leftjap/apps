/**
 * auth.js 단위 테스트 (Wave 11.12).
 * 환경: vitest 디폴트 (node). Web Crypto / TextEncoder 는 Node 18+ 글로벌 사용.
 *
 * 범위:
 *   - ALLOWED_EMAILS 상수 (spec §3 정합)
 *   - isAllowedEmail: 대소문자·공백 정규화
 *   - userHash: deterministic, 12자 hex, 다른 user → 다른 hash
 *
 * 비대상 (별 wave / 통합 테스트):
 *   - signInWithGoogle / signOut — supabase 모킹 필요
 *   - ensureUserDB / closeUserDB — fake-indexeddb 필요
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Auth, ALLOWED_EMAILS } from './auth.js';

describe('ALLOWED_EMAILS (spec §3)', () => {
  it('허용 이메일 목록을 포함한다', () => {
    expect(ALLOWED_EMAILS).toEqual([
      'leftjap@gmail.com',
      'soyoun312@gmail.com',
    ]);
  });

  it('frozen 이다 (런타임 변조 방지)', () => {
    expect(Object.isFrozen(ALLOWED_EMAILS)).toBe(true);
  });
});

/* 로컬 검증 전용 허용 (2026-09-04): 봇 계정을 소스 수정 없이 허용한다. .env.local(gitignored) 의
 * VITE_DEV_ALLOWED_EMAILS 를 **development 모드에서만** 읽고, 배포 번들(production)·테스트(test)에서는 무시한다.
 * 배경: auth.js 를 임시로 고쳐 검증하다가 Stop 훅 WIP 스냅샷이 그 줄을 담은 채 푸시된 사고(46d46dd). */
describe('isAllowedEmail — 개발 전용 허용 목록 (VITE_DEV_ALLOWED_EMAILS)', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it('development 모드 + 환경변수가 있으면 그 이메일도 허용한다 (ALLOWED_EMAILS 상수는 불변)', async () => {
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('VITE_DEV_ALLOWED_EMAILS', 'claude-bot@today.local, Other@Example.com');
    vi.resetModules();
    const mod = await import('./auth.js');
    expect(mod.Auth.isAllowedEmail('claude-bot@today.local')).toBe(true);
    expect(mod.Auth.isAllowedEmail('other@example.com')).toBe(true);
    expect(mod.ALLOWED_EMAILS).toEqual(['leftjap@gmail.com', 'soyoun312@gmail.com']);
  });

  it('development 모드가 아니면 환경변수가 있어도 무시한다', async () => {
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_DEV_ALLOWED_EMAILS', 'claude-bot@today.local');
    vi.resetModules();
    const mod = await import('./auth.js');
    expect(mod.Auth.isAllowedEmail('claude-bot@today.local')).toBe(false);
  });
});

describe('isAllowedEmail', () => {
  it('정확히 일치하면 true', () => {
    expect(Auth.isAllowedEmail('leftjap@gmail.com')).toBe(true);
    expect(Auth.isAllowedEmail('soyoun312@gmail.com')).toBe(true);
  });

  it('대소문자·공백 정규화', () => {
    expect(Auth.isAllowedEmail('  Leftjap@Gmail.com  ')).toBe(true);
    expect(Auth.isAllowedEmail('SOYOUN312@GMAIL.COM')).toBe(true);
  });

  it('비허용 이메일은 false', () => {
    expect(Auth.isAllowedEmail('attacker@gmail.com')).toBe(false);
    expect(Auth.isAllowedEmail('leftjap@example.com')).toBe(false);
  });

  it('falsy 입력은 false', () => {
    expect(Auth.isAllowedEmail('')).toBe(false);
    expect(Auth.isAllowedEmail(null)).toBe(false);
    expect(Auth.isAllowedEmail(undefined)).toBe(false);
  });
});

describe('userHash', () => {
  const u1 = { id: '11111111-2222-3333-4444-555555555555' };
  const u2 = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' };

  it('12자 hex 문자열을 반환한다', async () => {
    const h = await Auth.userHash(u1);
    expect(h).toMatch(/^[0-9a-f]{12}$/);
  });

  it('동일 user.id → 동일 hash (deterministic)', async () => {
    const a = await Auth.userHash(u1);
    const b = await Auth.userHash({ id: u1.id });
    expect(a).toBe(b);
  });

  it('다른 user.id → 다른 hash', async () => {
    const a = await Auth.userHash(u1);
    const b = await Auth.userHash(u2);
    expect(a).not.toBe(b);
  });

  it('user.id 누락 시 throw', async () => {
    await expect(Auth.userHash({})).rejects.toThrow(/user\.id/);
    await expect(Auth.userHash(null)).rejects.toThrow();
  });
});

describe('Auth 어댑터 노출 인터페이스', () => {
  it('필수 메서드를 모두 노출한다', () => {
    const expected = [
      'ALLOWED_EMAILS', 'AUTH_ERROR_KEY', 'isSupabaseConfigured',
      'getSession', 'getCurrentUser', 'onAuthStateChange',
      'signInWithGoogle', 'signOut', 'registerOnSignOut',
      'isAllowedEmail', 'userHash',
      'ensureUserDB', 'closeUserDB',
    ];
    for (const k of expected) {
      expect(Auth, `Auth.${k} 누락`).toHaveProperty(k);
    }
  });
});
