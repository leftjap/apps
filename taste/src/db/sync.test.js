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
      range: (from, to) => { ctx.range = [from, to]; return b; },
      then: (resolve) => resolve(h[ctx.mode] ? h[ctx.mode](ctx) : { data: null, error: null }),
    };
    return b;
  };
  return { supabase: { from: (t) => builder(t) } };
});

const { queueUpload, flushPending, pullAll, pullRecommendations } = await import('./sync.js');
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

// pull — 1000행 페이지네이션(supabase select 기본 limit 함정)·replace 모드 원자성.
describe('pullTable 페이지네이션·replace', () => {
  const ratingRow = (i) => ({ id: `r-${i}`, owner_id: 'u1', media_type: 'movie', title: `t${i}`, year: 2000, rating: 3, updated_at: 'x', deleted_at: null });
  const recoRow = (id, owner) => ({ id, owner_id: owner, media_type: 'movie', title: id, kind: 'home' });

  beforeEach(() => {
    globalThis.tasteDB = createTasteDB('taste_pull_test_' + Math.random());
    h.upsert = null; h.select = null; h.update = null;
  });

  it('1500행: range 페이지 2회로 전량 적재', async () => {
    const ranges = [];
    h.select = (ctx) => {
      if (ctx.table === 'taste_recommendations') return { data: [], error: null };
      ranges.push(ctx.range);
      const [from] = ctx.range;
      const rows = [];
      for (let i = from; i < Math.min(from + 1000, 1500); i++) rows.push(ratingRow(i));
      return { data: rows, error: null };
    };
    await pullAll(globalThis.tasteDB, 'u1');
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(await globalThis.tasteDB.ratings.count()).toBe(1500);
  });

  it('replace 모드: owner 행만 새 스냅샷으로 교체, 타 owner 행 보존', async () => {
    const db = globalThis.tasteDB;
    await db.recommendations.bulkPut([recoRow('stale-1', 'u1'), recoRow('stale-2', 'u1'), recoRow('other-1', 'u2')]);
    h.select = () => ({ data: [recoRow('fresh-1', 'u1')], error: null });
    await pullRecommendations('u1');
    const all = await db.recommendations.toArray();
    expect(all.map((r) => r.id).sort()).toEqual(['fresh-1', 'other-1']);
  });

  it('select 오류: 기존 행 보존 (replace delete 미실행 — 빈 추천 화면 방지)', async () => {
    const db = globalThis.tasteDB;
    await db.recommendations.bulkPut([recoRow('keep-1', 'u1'), recoRow('keep-2', 'u1')]);
    h.select = () => ({ data: null, error: { message: 'network' } });
    await pullRecommendations('u1');
    expect(await db.recommendations.count()).toBe(2);
  });
});
