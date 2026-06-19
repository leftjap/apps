/**
 * queries.js 단위 테스트 — vitest (node) + fake-indexeddb.
 * 범위: quotes CRUD/feed/book/pin/search + comments CRUD/list/count + pending 큐.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createBookDB } from './schema.js';
import {
  listFeed, listByBook, getQuote, listPinned, listAllQuotes, searchQuotes,
  createQuote, updateQuote, softDeleteQuote, restoreQuote, togglePinQuote,
  listPendingQuotes, setQuotePendingSync,
  createComment, softDeleteComment,
  listCommentsByQuote, countCommentsByQuote, countCommentsForQuotes,
  listPendingComments, setCommentPendingSync,
} from './queries.js';

const ME = '11111111-2222-3333-4444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeEach(() => {
  const dbName = 'book_test_' + Math.random().toString(36).slice(2, 10);
  globalThis.bookDB = createBookDB(dbName);
});

describe('quotes — create/get/validation', () => {
  it('createQuote 생성 후 getQuote 조회', async () => {
    const q = await createQuote({ owner_id: ME, book_ref: '1', text: '문장 A' });
    expect(q.id).toBeTruthy();
    expect(q.pinned).toBe(0);
    expect(q.deleted_at).toBeNull();
    const got = await getQuote(q.id);
    expect(got.text).toBe('문장 A');
    expect(got.book_ref).toBe('1');
  });

  it('필수 필드 누락 시 throw', async () => {
    await expect(createQuote({ book_ref: '1', text: 'x' })).rejects.toThrow(/owner_id/);
    await expect(createQuote({ owner_id: ME, text: 'x' })).rejects.toThrow(/book_ref/);
    await expect(createQuote({ owner_id: ME, book_ref: '1' })).rejects.toThrow(/text/);
  });

  it('book_ref 문자열 정규화', async () => {
    const q = await createQuote({ owner_id: ME, book_ref: 3, text: '숫자 ref' });
    expect(q.book_ref).toBe('3');
  });
});

describe('quotes — listFeed (owner 집합 필터)', () => {
  it('여러 owner 합집합, deleted 제외, updated_at desc', async () => {
    await createQuote({ owner_id: ME, book_ref: '1', text: 'me 오래', updated_at: '2026-05-01T00:00:00.000Z' });
    await createQuote({ owner_id: OTHER, book_ref: '3', text: 'other 최신', updated_at: '2026-05-10T00:00:00.000Z' });
    const del = await createQuote({ owner_id: ME, book_ref: '1', text: '삭제됨' });
    await softDeleteQuote(del.id);
    await createQuote({ owner_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', book_ref: '2', text: '외부인' });

    const feed = await listFeed([ME, OTHER]);
    expect(feed.map((q) => q.text)).toEqual(['other 최신', 'me 오래']);
  });

  it('단일 owner 문자열 허용', async () => {
    await createQuote({ owner_id: ME, book_ref: '1', text: '단독' });
    expect(await listFeed(ME)).toHaveLength(1);
  });
});

describe('quotes — listByBook', () => {
  it('book_ref 필터 + updated_at desc', async () => {
    await createQuote({ owner_id: ME, book_ref: '1', text: 'b1-old', updated_at: '2026-05-01T00:00:00.000Z' });
    await createQuote({ owner_id: ME, book_ref: '1', text: 'b1-new', updated_at: '2026-05-05T00:00:00.000Z' });
    await createQuote({ owner_id: ME, book_ref: '2', text: 'b2' });
    const rows = await listByBook('1');
    expect(rows.map((r) => r.text)).toEqual(['b1-new', 'b1-old']);
  });
});

describe('quotes — pin / softDelete / update', () => {
  it('togglePin 후 listPinned 노출, 재토글 시 제거', async () => {
    const q = await createQuote({ owner_id: ME, book_ref: '1', text: '핀 대상' });
    await togglePinQuote(q.id);
    expect(await listPinned([ME])).toHaveLength(1);
    await togglePinQuote(q.id);
    expect(await listPinned([ME])).toHaveLength(0);
  });

  it('softDelete 후 feed 제외, restore 후 복귀', async () => {
    const q = await createQuote({ owner_id: ME, book_ref: '1', text: 'temp' });
    await softDeleteQuote(q.id);
    expect(await listFeed([ME])).toHaveLength(0);
    await restoreQuote(q.id);
    expect(await listFeed([ME])).toHaveLength(1);
  });

  it('updateQuote 가 updated_at 갱신', async () => {
    const q = await createQuote({ owner_id: ME, book_ref: '1', text: 'orig', updated_at: '2026-01-01T00:00:00.000Z' });
    const next = await updateQuote(q.id, { text: '수정' });
    expect(next.text).toBe('수정');
    expect(next.updated_at).not.toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('quotes — search / all / pending', () => {
  it('searchQuotes 본문 부분 일치', async () => {
    await createQuote({ owner_id: ME, book_ref: '1', text: '걷기는 사유다' });
    await createQuote({ owner_id: ME, book_ref: '2', text: '돈은 행동이다' });
    const r = await searchQuotes('걷기', [ME]);
    expect(r).toHaveLength(1);
    expect(r[0].text).toContain('걷기');
  });

  it('listAllQuotes owner 필터', async () => {
    await createQuote({ owner_id: ME, book_ref: '1', text: 'mine' });
    await createQuote({ owner_id: OTHER, book_ref: '1', text: 'theirs' });
    expect(await listAllQuotes([ME])).toHaveLength(1);
    expect(await listAllQuotes([ME, OTHER])).toHaveLength(2);
  });

  it('setQuotePendingSync + listPendingQuotes', async () => {
    const q = await createQuote({ owner_id: ME, book_ref: '1', text: 'p' });
    await setQuotePendingSync(q.id, 1);
    expect((await listPendingQuotes()).map((p) => p.id)).toContain(q.id);
    await setQuotePendingSync(q.id, 0);
    expect(await listPendingQuotes()).toHaveLength(0);
  });
});

describe('comments', () => {
  it('createComment → listCommentsByQuote (created_at asc) + count', async () => {
    const q = await createQuote({ owner_id: ME, book_ref: '1', text: 'q' });
    await createComment({ quote_id: q.id, author_id: ME, body: '첫', created_at: '2026-05-01T00:00:00.000Z' });
    await createComment({ quote_id: q.id, author_id: OTHER, body: '둘', created_at: '2026-05-02T00:00:00.000Z' });
    const list = await listCommentsByQuote(q.id);
    expect(list.map((c) => c.body)).toEqual(['첫', '둘']);
    expect(await countCommentsByQuote(q.id)).toBe(2);
  });

  it('softDeleteComment 후 카운트 제외', async () => {
    const q = await createQuote({ owner_id: ME, book_ref: '1', text: 'q' });
    const c = await createComment({ quote_id: q.id, author_id: ME, body: 'x' });
    await softDeleteComment(c.id);
    expect(await countCommentsByQuote(q.id)).toBe(0);
  });

  it('countCommentsForQuotes 맵', async () => {
    const q1 = await createQuote({ owner_id: ME, book_ref: '1', text: 'q1' });
    const q2 = await createQuote({ owner_id: ME, book_ref: '1', text: 'q2' });
    await createComment({ quote_id: q1.id, author_id: ME, body: 'a' });
    await createComment({ quote_id: q1.id, author_id: ME, body: 'b' });
    const map = await countCommentsForQuotes([q1.id, q2.id]);
    expect(map[q1.id]).toBe(2);
    expect(map[q2.id]).toBe(0);
  });

  it('comment 필수 필드 누락 시 throw', async () => {
    await expect(createComment({ author_id: ME, body: 'x' })).rejects.toThrow(/quote_id/);
    await expect(createComment({ quote_id: 'q', body: 'x' })).rejects.toThrow(/author_id/);
    await expect(createComment({ quote_id: 'q', author_id: ME })).rejects.toThrow(/body/);
  });

  it('comment pending 큐', async () => {
    const q = await createQuote({ owner_id: ME, book_ref: '1', text: 'q' });
    const c = await createComment({ quote_id: q.id, author_id: ME, body: 'x' });
    await setCommentPendingSync(c.id, 1);
    expect((await listPendingComments()).map((p) => p.id)).toContain(c.id);
  });
});
