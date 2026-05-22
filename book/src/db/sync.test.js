/**
 * sync.js 단위 테스트 — 순수 헬퍼 + supabase 미설정(null) 시 no-op 경로.
 * (실 Supabase 왕복은 e2e/RLS 검증에서 — 여기선 안전장치만.)
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// supabase 미설정 모드 강제 — no_supabase 경로 검증 + 실 네트워크 격리 (today sync.test.js 패턴).
vi.mock('../services/supabase.js', () => ({ supabase: null, isSupabaseConfigured: false }));

import { createBookDB } from './schema.js';
import {
  isValidUuid, formatError, pushQuote, pushComment, pullAll, isSyncActive,
} from './sync.js';

beforeEach(() => {
  const dbName = 'book_test_' + Math.random().toString(36).slice(2, 10);
  globalThis.bookDB = createBookDB(dbName);
});

describe('isValidUuid', () => {
  it('UUID v4 형식만 true', () => {
    expect(isValidUuid('11111111-2222-4333-8444-555555555555')).toBe(true);
    expect(isValidUuid('quote-seed-1')).toBe(false);
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid(123)).toBe(false);
  });
});

describe('formatError', () => {
  it('PostgrestError → message + code/hint', () => {
    expect(formatError({ message: 'boom', code: '42501', hint: 'rls' })).toContain('boom');
    expect(formatError({ message: 'boom', code: '42501' })).toContain('code=42501');
    expect(formatError('plain')).toBe('plain');
    expect(formatError(null)).toBe('(no error)');
  });
});

describe('supabase 미설정 시 no-op', () => {
  it('pushQuote/pushComment 는 skipped no_supabase 반환', async () => {
    expect(await pushQuote('x')).toMatchObject({ status: 'skipped', reason: 'no_supabase' });
    expect(await pushComment('x')).toMatchObject({ status: 'skipped', reason: 'no_supabase' });
  });

  it('pullAll 은 no_supabase', async () => {
    const r = await pullAll(globalThis.bookDB, 'user-1');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_supabase');
  });

  it('초기 syncActive=false', () => {
    expect(isSyncActive()).toBe(false);
  });
});
