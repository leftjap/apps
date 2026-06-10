// pushRating 23505 reconcile — 서버 unique(owner,media,title,year) 충돌 시 서버 행 채택(LWW).
// 재현: 평가 해제(소프트삭제 동기화됨) 후 재평가 → 신규 로컬 행 upsert 가 409(23505) 영구 재시도 루프.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createTasteDB } from './schema.js';

// supabase 모듈 모킹 — 테스트별 핸들러 주입.
const h = { upsert: null, select: null, update: null };
vi.mock('../services/supabase.js', () => {
  const builder = (table) => {
    const ctx = { table, filters: [], patch: null, mode: null };
    const b = {
      upsert: (row, opts) => { ctx.mode = 'upsert'; ctx.row = row; ctx.opts = opts; return b; },
      select: () => { ctx.mode = ctx.mode === 'upsert' ? ctx.mode : 'select'; return b; },
      update: (patch) => { ctx.mode = 'update'; ctx.patch = patch; return b; },
      eq: (k, v) => { ctx.filters.push([k, v]); return b; },
      is: (k, v) => { ctx.filters.push([k, v]); return b; },
      range: () => b,
      then: (resolve) => resolve(h[ctx.mode] ? h[ctx.mode](ctx) : { data: null, error: null }),
    };
    return b;
  };
  return { supabase: { from: (t) => builder(t) } };
});

const { queueUpload, flushPending } = await import('./sync.js');
const { Queries } = await import('./queries.js');

const SRV = {
  id: 'srv-row-id-000', owner_id: 'u1', media_type: 'movie', title: '그대들', year: 2023,
  rating: 4, source: 'app', rated_at: '2026-06-08T04:00:00.000Z', meta: {},
  created_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-06-08T04:10:29.462+00:00',
  deleted_at: '2026-06-08T04:10:29.46+00:00',
};

describe('pushRating 23505 reconcile', () => {
  beforeEach(() => {
    globalThis.tasteDB = createTasteDB('taste_sync_test_' + Math.random());
    h.upsert = null; h.select = null; h.update = null;
  });

  it('upsert 23505 → 서버 행 채택: 로컬 dup 삭제 + (로컬 최신) 서버 update + pending 해제', async () => {
    const db = globalThis.tasteDB;
    // 로컬: 재평가로 만들어진 신규 행 (서버 soft-deleted 행과 키 충돌)
    const local = {
      id: '06807f50-05b4-4175-89d2-1ef3a049382d', owner_id: 'u1', media_type: 'movie', title: '그대들', year: 2023,
      rating: 3.5, source: 'app', rated_at: '2026-06-08T04:10:30.133Z', meta: {},
      created_at: '2026-06-08T04:10:30.133Z', updated_at: '2026-06-08T04:10:30.133Z', deleted_at: null, pending_sync: 1,
    };
    await db.ratings.add(local);

    const updateCalls = [];
    h.upsert = () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
    h.select = () => ({ data: [SRV], error: null });
    h.update = (ctx) => { updateCalls.push(ctx); return { data: null, error: null }; };

    await flushPending();

    // 서버: 로컬이 최신(LWW) → 서버 행을 로컬 값으로 갱신 (부활 포함)
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch.rating).toBe(3.5);
    expect(updateCalls[0].patch.deleted_at).toBeNull();
    expect(updateCalls[0].filters).toContainEqual(['id', SRV.id]);
    // 로컬: dup 행 제거, 서버 행 id 로 채택, pending 해제
    expect(await db.ratings.get(local.id)).toBeUndefined();
    const adopted = await db.ratings.get(SRV.id);
    expect(adopted).toBeTruthy();
    expect(adopted.rating).toBe(3.5);
    expect(adopted.deleted_at).toBeNull();
    expect(adopted.pending_sync).toBe(0);
    // 영구 재시도 루프 종료
    expect(await Queries.listPendingRatings()).toHaveLength(0);
  });

  it('upsert 23505 + 서버가 더 최신 → 서버 값 채택(update 미호출)', async () => {
    const db = globalThis.tasteDB;
    const local = {
      id: 'bbbbbbbb-0000-0000-0000-000000000002', owner_id: 'u1', media_type: 'movie', title: '그대들', year: 2023,
      rating: 2, source: 'app', rated_at: '2026-06-07T00:00:00.000Z', meta: {},
      created_at: '2026-06-07T00:00:00.000Z', updated_at: '2026-06-07T00:00:00.000Z', deleted_at: null, pending_sync: 1,
    };
    await db.ratings.add(local);
    const updateCalls = [];
    h.upsert = () => ({ data: null, error: { code: '23505', message: 'dup' } });
    h.select = () => ({ data: [{ ...SRV, deleted_at: null }], error: null });
    h.update = (ctx) => { updateCalls.push(ctx); return { data: null, error: null }; };

    await flushPending();

    expect(updateCalls).toHaveLength(0);
    expect(await db.ratings.get(local.id)).toBeUndefined();
    expect((await db.ratings.get(SRV.id)).rating).toBe(4);
    expect(await Queries.listPendingRatings()).toHaveLength(0);
  });

  it('upsert 일반 오류 → pending 유지 (기존 동작 회귀 없음)', async () => {
    const db = globalThis.tasteDB;
    await db.ratings.add({
      id: 'aaaaaaaa-0000-0000-0000-000000000001', owner_id: 'u1', media_type: 'book', title: 'b', year: 2020,
      rating: 3, source: 'app', rated_at: null, meta: {}, created_at: 'x', updated_at: 'x', deleted_at: null, pending_sync: 1,
    });
    h.upsert = () => ({ data: null, error: { code: '57014', message: 'timeout' } });
    await flushPending();
    expect(await Queries.listPendingRatings()).toHaveLength(1);
  });
});
