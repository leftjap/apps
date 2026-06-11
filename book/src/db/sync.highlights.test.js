/**
 * pushHighlight — 형광펜 서버 동기화 (book_quote_highlights, 본인 행만).
 * 마이그레이션 적용 전에도 안전해야 한다: 테이블 부재(42P01)는 pending 유지(추후 flush 복구),
 * RLS 영구 거부(42501)는 outbox 제거, 비UUID(dev·verify 시드)는 로컬 전용.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

const calls = [];
const state = { nextError: null };
vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: (table) => ({
      upsert: (payload, opts) => { calls.push({ op: 'upsert', table, payload, opts }); return Promise.resolve({ error: state.nextError }); },
      delete: () => ({ match: (m) => { calls.push({ op: 'delete', table, match: m }); return Promise.resolve({ error: state.nextError }); } }),
    }),
  },
  isSupabaseConfigured: true,
}));

import { createBookDB } from './schema.js';
import { pushHighlight } from './sync.js';

const Q_UUID = '11111111-2222-4333-8444-555555555555';
const ME = '7bae5645-61c6-4476-9ff2-4c30a72812ff';

beforeEach(() => {
  calls.length = 0;
  state.nextError = null;
  globalThis.bookDB = createBookDB('book_test_' + Math.random().toString(36).slice(2, 10));
});

const putHl = (quote_id, marks, extra = {}) =>
  globalThis.bookDB.quote_highlights.put({ quote_id, marks, owner_id: ME, updated_at: '2026-06-12T00:00:00.000Z', pending_sync: 1, ...extra });

describe('pushHighlight 가드', () => {
  it('비UUID quote_id(verify 시드) → 로컬 전용 skip + pending 0', async () => {
    await putHl('verify-3', [{ s: 0, e: 3, c: 'y' }]);
    const r = await pushHighlight('verify-3');
    expect(r).toMatchObject({ status: 'skipped', reason: 'non_uuid_local_only' });
    expect(calls.length).toBe(0);
    expect((await globalThis.bookDB.quote_highlights.get('verify-3')).pending_sync).toBe(0);
  });

  it('비UUID + 빈 marks(톰스톤) → 로컬 행 삭제로 구동작 복원', async () => {
    await putHl('verify-3', []);
    const r = await pushHighlight('verify-3');
    expect(r).toMatchObject({ status: 'skipped', reason: 'non_uuid_local_only' });
    expect(await globalThis.bookDB.quote_highlights.get('verify-3')).toBeUndefined();
  });
});

describe('pushHighlight 서버 왕복', () => {
  it('marks 있음 → upsert(quote_id+owner_id 충돌키) + pending 0', async () => {
    await putHl(Q_UUID, [{ s: 1, e: 4, c: 'p' }]);
    const r = await pushHighlight(Q_UUID);
    expect(r).toMatchObject({ status: 'ok' });
    expect(calls[0]).toMatchObject({
      op: 'upsert', table: 'book_quote_highlights',
      payload: { quote_id: Q_UUID, owner_id: ME, marks: [{ s: 1, e: 4, c: 'p' }] },
      opts: { onConflict: 'quote_id,owner_id' },
    });
    expect((await globalThis.bookDB.quote_highlights.get(Q_UUID)).pending_sync).toBe(0);
  });

  it('owner_id 없는 구버전 행 → quotes 행 owner 로 폴백', async () => {
    await globalThis.bookDB.quotes.put({ id: Q_UUID, owner_id: ME, book_ref: 'b', text: 't', pinned: 0, created_at: 'x', updated_at: 'x', deleted_at: null, pending_sync: 0 });
    await putHl(Q_UUID, [{ s: 0, e: 2, c: 'y' }], { owner_id: undefined });
    const r = await pushHighlight(Q_UUID);
    expect(r).toMatchObject({ status: 'ok' });
    expect(calls[0].payload.owner_id).toBe(ME);
  });

  it('빈 marks(톰스톤) → 서버 delete 후 로컬 행 제거', async () => {
    await putHl(Q_UUID, []);
    const r = await pushHighlight(Q_UUID);
    expect(r).toMatchObject({ status: 'ok', op: 'delete' });
    expect(calls[0]).toMatchObject({ op: 'delete', table: 'book_quote_highlights', match: { quote_id: Q_UUID, owner_id: ME } });
    expect(await globalThis.bookDB.quote_highlights.get(Q_UUID)).toBeUndefined();
  });

  it('42P01(테이블 미적용) → pending 1 유지 (마이그 적용 후 flush 복구)', async () => {
    state.nextError = { message: 'relation "book_quote_highlights" does not exist', code: '42P01' };
    await putHl(Q_UUID, [{ s: 0, e: 2, c: 'y' }]);
    const r = await pushHighlight(Q_UUID);
    expect(r).toMatchObject({ status: 'error', reason: 'table_missing' });
    expect((await globalThis.bookDB.quote_highlights.get(Q_UUID)).pending_sync).toBe(1);
  });

  it('42501(RLS 영구 거부) → outbox 제거 (pending 0)', async () => {
    state.nextError = { message: 'rls', code: '42501' };
    await putHl(Q_UUID, [{ s: 0, e: 2, c: 'y' }]);
    const r = await pushHighlight(Q_UUID);
    expect(r).toMatchObject({ status: 'error', reason: 'rls_denied' });
    expect((await globalThis.bookDB.quote_highlights.get(Q_UUID)).pending_sync).toBe(0);
  });
});
