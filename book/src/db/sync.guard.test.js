/**
 * sync push 가드 — 비UUID owner/author(dev 가짜 유저) 행은 서버로 보내지 않고
 * outbox 에서 제거한다 (22P02 무한 재시도 차단). 회귀 출처: 2026-06-10 dev CRUD 콘솔 루프.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 가드가 서버 도달 전에 끊는지 검증 — from() 호출 자체가 실패해야 함.
vi.mock('../services/supabase.js', () => ({
  supabase: { from: () => { throw new Error('guard 가 서버 도달을 막아야 함'); } },
  isSupabaseConfigured: true,
}));

import { createBookDB } from './schema.js';
import { pushQuote, pushComment } from './sync.js';

const UUID_A = '11111111-2222-4333-8444-555555555555';
const UUID_B = '22222222-3333-4444-8555-666666666666';

beforeEach(() => {
  globalThis.bookDB = createBookDB('book_test_' + Math.random().toString(36).slice(2, 10));
});

describe('비UUID owner/author 로컬 전용 가드', () => {
  it('pushQuote: owner_id 가 dev 가짜 id 면 skipped + pending_sync 0', async () => {
    await globalThis.bookDB.quotes.put({ id: UUID_A, owner_id: 'dev-leftjap@gmail.com', book_ref: 'book_001', text: 't', pinned: 0, created_at: 'x', updated_at: 'x', deleted_at: null, pending_sync: 1 });
    const r = await pushQuote(UUID_A);
    expect(r).toMatchObject({ status: 'skipped', reason: 'non_uuid_local_only' });
    expect((await globalThis.bookDB.quotes.get(UUID_A)).pending_sync).toBe(0);
  });

  it('pushComment: author_id 가 dev 가짜 id 면 skipped + pending_sync 0', async () => {
    await globalThis.bookDB.comments.put({ id: UUID_A, quote_id: UUID_B, author_id: 'dev-leftjap@gmail.com', body: 'b', created_at: 'x', updated_at: 'x', deleted_at: null, pending_sync: 1 });
    const r = await pushComment(UUID_A);
    expect(r).toMatchObject({ status: 'skipped', reason: 'non_uuid_local_only' });
    expect((await globalThis.bookDB.comments.get(UUID_A)).pending_sync).toBe(0);
  });
});
