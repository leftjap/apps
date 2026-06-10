import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPickDB } from './schema.js';
import { createRating, updateRating, softDeleteRating, getRating, getRatingAny, listRatings } from './queries.js';

describe('rating queries', () => {
  beforeEach(() => { globalThis.pickDB = createPickDB('pick_test_' + Math.random()); });

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

  // 평가 해제(소프트삭제) 후 재평가 시 신규 행 생성은 서버 unique(owner,media,title,year) 와 23505 충돌
  // → soft-deleted 행을 찾아 부활 재사용해야 함 (detail ratebox / import 의 create 분기 전 조회용).
  it('getRatingAny: soft-deleted 행도 반환 (재평가 부활 재사용용)', async () => {
    const r = await createRating({ owner_id: 'u1', media_type: 'movie', title: '그대들', year: 2023, rating: 4, source: 'app' });
    await softDeleteRating(r.id);
    expect(await getRating('u1', 'movie', '그대들', 2023)).toBeNull();
    const any = await getRatingAny('u1', 'movie', '그대들', 2023);
    expect(any?.id).toBe(r.id);
    expect(any?.deleted_at).toBeTruthy();
  });

  it('getRatingAny: alive 행이 있으면 alive 우선', async () => {
    const dead = await createRating({ owner_id: 'u1', media_type: 'movie', title: 'x', year: 2020, rating: 3, source: 'app' });
    await softDeleteRating(dead.id);
    const alive = await createRating({ owner_id: 'u1', media_type: 'movie', title: 'x', year: 2020, rating: 5, source: 'app' });
    expect((await getRatingAny('u1', 'movie', 'x', 2020))?.id).toBe(alive.id);
  });

  // 홈 '최근 평가'·검색 기본 목록의 기준 — 메타 백필 등으로 updated_at 만 바뀌어도 순서가 흔들리면 안 됨.
  it('listRatings: rated_at(등록) 최신순 — updated_at 갱신에 영향받지 않음', async () => {
    const tick = () => new Promise((r) => setTimeout(r, 3));   // updated_at(ms) 동률 방지 — 동률이면 정렬이 uuid 순서에 좌우돼 flaky
    const a = await createRating({ owner_id: 'u1', media_type: 'movie', title: '어제 평가', rating: 3, source: 'app', rated_at: '2026-06-09T00:00:00.000Z' });
    await tick();
    await createRating({ owner_id: 'u1', media_type: 'movie', title: '오늘 평가', rating: 4, source: 'app', rated_at: '2026-06-10T00:00:00.000Z' });
    await tick();
    await updateRating(a.id, { meta: { poster_url: 'x' } });   // 백필성 갱신 — updated_at 만 변경
    const rows = await listRatings('u1');
    expect(rows.map((r) => r.title)).toEqual(['오늘 평가', '어제 평가']);
  });

  // 평가 해제→재평가 왕복이 행을 늘리지 않는다 (서버 unique 23505 의 로컬 전제 조건).
  it('해제→재평가 왕복: 단일 행 유지 (부활 재사용)', async () => {
    const r = await createRating({ owner_id: 'u1', media_type: 'movie', title: '왕복', year: 2024, rating: 4, source: 'app' });
    await softDeleteRating(r.id);
    const revived = await getRatingAny('u1', 'movie', '왕복', 2024);
    await updateRating(revived.id, { rating: 3.5, deleted_at: null });
    expect((await listRatings('u1')).filter((x) => x.title === '왕복')).toHaveLength(1);
    expect(await globalThis.pickDB.ratings.where('owner_id').equals('u1').count()).toBe(1);
    expect((await getRating('u1', 'movie', '왕복', 2024)).rating).toBe(3.5);
  });
});
