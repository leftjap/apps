/**
 * auth.js 단위 테스트 (Wave 11.4 — Gym 11.7 / Study 11.12 답습).
 * 환경: vitest 디폴트 (node).
 *
 * 범위:
 *   - ALLOWED_EMAILS 상수 (커플 2인 allowlist)
 *   - isAllowedEmail: 대소문자·공백 정규화
 *   - Auth 어댑터 인터페이스 노출
 *   - registerOnSignOut: 등록·해제·다중 콜백 호출 순서
 *
 * 비대상 (별 wave / 통합 테스트):
 *   - signInWithGoogle / signOut — supabase 모킹 필요
 *   - ensureUserDB / userHash — Wave 11.5 도입 후 별 테스트
 */
import { describe, it, expect, vi } from 'vitest';

// supabase 클라이언트 모킹 — 네트워크 호출 차단, isSupabaseConfigured=false 경로 검증.
// Wave 11.5 에서 통합 테스트 (mock supabase) 별도 추가 예정.
vi.mock('./supabase.js', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

const { Auth, ALLOWED_EMAILS, AUTH_ERROR_KEY } = await import('./auth.js');

describe('ALLOWED_EMAILS (Gym/Study 와 동일 allowlist 공유 + 디버깅 1)', () => {
  it('커플 2 + 디버깅 1 이메일을 포함한다', () => {
    expect(ALLOWED_EMAILS).toEqual([
      'leftjap@gmail.com',
      'soyoun312@gmail.com',
      'causencompany@gmail.com',
    ]);
  });

  it('frozen 이다 (런타임 변조 방지)', () => {
    expect(Object.isFrozen(ALLOWED_EMAILS)).toBe(true);
  });
});

describe('AUTH_ERROR_KEY', () => {
  it('today 전용 localStorage 키를 사용한다 (gym/study 와 분리)', () => {
    expect(AUTH_ERROR_KEY).toBe('todayAuthError');
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

describe('Auth 어댑터 인터페이스 노출', () => {
  it('Wave 11.4 + 11.5.1 필수 메서드를 모두 노출한다', () => {
    const expected = [
      // Wave 11.4
      'ALLOWED_EMAILS',
      'AUTH_ERROR_KEY',
      'isSupabaseConfigured',
      'getSession',
      'getCurrentUser',
      'onAuthStateChange',
      'signInWithGoogle',
      'signOut',
      'registerOnSignOut',
      'isAllowedEmail',
      // Wave 11.5.1 — Dexie 격리
      'userHash',
      'ensureUserDB',
      'closeUserDB',
    ];
    for (const k of expected) {
      expect(Auth, `Auth.${k} 누락`).toHaveProperty(k);
    }
  });
});

describe('userHash (Wave 11.5.1 — gym/study 와 동일 알고리즘)', () => {
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

describe('registerOnSignOut', () => {
  it('등록한 콜백은 signOut 시 호출되고, unregister 후엔 호출 안 됨', async () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unreg1 = Auth.registerOnSignOut(cb1);
    Auth.registerOnSignOut(cb2);

    await Auth.signOut(); // supabase null → no-op 이지만 콜백은 호출됨

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);

    cb1.mockClear();
    cb2.mockClear();
    unreg1();

    await Auth.signOut();

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('콜백 throw 시 다음 콜백 계속 호출 (cleanup 흐름 보호)', async () => {
    const cb1 = vi.fn(() => { throw new Error('cb1 fail'); });
    const cb2 = vi.fn();
    Auth.registerOnSignOut(cb1);
    Auth.registerOnSignOut(cb2);

    await Auth.signOut();

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});
