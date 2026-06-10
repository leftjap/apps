// 왓챠 import 저장 — 멱등성(재업로드 시 중복 생성 0)과 soft-deleted 부활이 핵심 데이터 불변식.
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createTasteDB } from '../db/schema.js';
import { saveRows } from './import.js';
import { listRatings, softDeleteRating, getRating } from '../db/queries.js';

const PARSED = [
  { title: '기생충', year: 2019, rating: 4.5, rated_at: '2026-01-01T00:00:00.000Z' },
  { title: '괴물', year: 2006, rating: 4.0, rated_at: '2026-01-02T00:00:00.000Z' },
  { title: '버닝', year: 2018, rating: 3.5, rated_at: '2026-01-03T00:00:00.000Z' },
];

describe('import saveRows', () => {
  beforeEach(() => { globalThis.tasteDB = createTasteDB('taste_import_test_' + Math.random()); });

  it('첫 실행: 전부 create', async () => {
    const r = await saveRows('u1', PARSED);
    expect(r).toEqual({ created: 3, updated: 0 });
    expect(await listRatings('u1')).toHaveLength(3);
  });

  it('같은 CSV 재실행: create 0 — 행 수 불변 (멱등)', async () => {
    await saveRows('u1', PARSED);
    const r2 = await saveRows('u1', PARSED);
    expect(r2).toEqual({ created: 0, updated: 3 });
    expect(await globalThis.tasteDB.ratings.where('owner_id').equals('u1').count()).toBe(3);
  });

  it('앱에서 평가 해제한 작품 재import: 부활 재사용 (신규 행 생성 안 함 — 서버 23505 방지)', async () => {
    await saveRows('u1', PARSED);
    const ex = await getRating('u1', 'movie', '기생충', 2019);
    await softDeleteRating(ex.id);
    const r2 = await saveRows('u1', [PARSED[0]]);
    expect(r2).toEqual({ created: 0, updated: 1 });
    const revived = await getRating('u1', 'movie', '기생충', 2019);
    expect(revived?.id).toBe(ex.id);
    expect(await globalThis.tasteDB.ratings.where('owner_id').equals('u1').count()).toBe(3);
  });

  it('onProgress: 마지막에 (done, total) 보고', async () => {
    const calls = [];
    await saveRows('u1', PARSED, (done, total) => calls.push([done, total]));
    expect(calls[calls.length - 1]).toEqual([3, 3]);
  });

  it('isCancelled: 라우트 이탈 시 잔여 행 중단 (처리분은 유지 — 재실행 멱등으로 이어가기)', async () => {
    let n = 0;
    const r = await saveRows('u1', PARSED, null, () => n++ >= 1);   // 1행 처리 후 중단
    expect(r.created).toBe(1);
    expect(await globalThis.tasteDB.ratings.where('owner_id').equals('u1').count()).toBe(1);
  });
});
