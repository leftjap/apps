import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createTasteDB } from './schema.js';
import { createRating, updateRating, softDeleteRating, getRating, listRatings } from './queries.js';

describe('rating queries', () => {
  beforeEach(() => { globalThis.tasteDB = createTasteDB('taste_test_' + Math.random()); });

  it('createRating: owner_id 필수, id/ts 자동, pending_sync=1', async () => {
    const r = await createRating({ owner_id: 'u1', media_type: 'book', title: '데미안', year: 1919, rating: 4.5, source: 'app' });
    expect(r.id).toBeTruthy();
    expect(r.created_at).toBeTruthy();
    expect(r.pending_sync).toBe(1);
    expect(await listRatings('u1')).toHaveLength(1);
  });

  it('createRating: owner_id 누락 시 throw', async () => {
    await expect(createRating({ media_type: 'book', title: 'x', rating: 3, source: 'app' })).rejects.toThrow();
  });

  it('updateRating: rating 변경', async () => {
    const r = await createRating({ owner_id: 'u1', media_type: 'book', title: 'a', rating: 3, source: 'app' });
    expect((await updateRating(r.id, { rating: 5 })).rating).toBe(5);
  });

  it('softDeleteRating: listRatings 제외', async () => {
    const r = await createRating({ owner_id: 'u1', media_type: 'book', title: 'a', rating: 3, source: 'app' });
    await softDeleteRating(r.id);
    expect(await listRatings('u1')).toHaveLength(0);
  });

  it('getRating: 평가됨 매칭 (없으면 null) — 상세 ratebox create/update 분기용', async () => {
    await createRating({ owner_id: 'u1', media_type: 'book', title: '데미안', year: 1919, rating: 4.5, source: 'app' });
    expect((await getRating('u1', 'book', '데미안', 1919))?.rating).toBe(4.5);
    expect(await getRating('u1', 'book', '없는책', 2000)).toBeNull();
  });

  it('listRatings(mediaType): 종류 필터', async () => {
    await createRating({ owner_id: 'u1', media_type: 'book', title: 'b', rating: 3, source: 'app' });
    await createRating({ owner_id: 'u1', media_type: 'movie', title: 'm', rating: 4, source: 'watcha' });
    expect(await listRatings('u1', 'movie')).toHaveLength(1);
    expect((await listRatings('u1', 'movie'))[0].media_type).toBe('movie');
  });
});
