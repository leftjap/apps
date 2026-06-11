/**
 * quote_highlights 저장 왕복 — Dexie v3 로컬 전용 테이블 (드래그 형광펜).
 * 서버 동기화 없음: pushQuote/denormalizeRow 경로와 무관(별도 테이블)을 전제로 한다.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createBookDB } from './schema.js';
import { setHighlights, getHighlightsFor } from './queries.js';

beforeEach(() => {
  globalThis.bookDB = createBookDB('book_test_' + Math.random().toString(36).slice(2, 10));
});

describe('quote_highlights 왕복', () => {
  it('set → getFor 맵 조회', async () => {
    await setHighlights('q1', [{ s: 0, e: 3, c: 'y' }]);
    await setHighlights('q2', [{ s: 1, e: 2, c: 'p' }]);
    const map = await getHighlightsFor(['q1', 'q2', 'q3']);
    expect(map.q1).toEqual([{ s: 0, e: 3, c: 'y' }]);
    expect(map.q2).toEqual([{ s: 1, e: 2, c: 'p' }]);
    expect(map.q3).toBeUndefined();
  });

  it('빈 배열 set → 행 삭제', async () => {
    await setHighlights('q1', [{ s: 0, e: 3, c: 'y' }]);
    await setHighlights('q1', []);
    const map = await getHighlightsFor(['q1']);
    expect(map.q1).toBeUndefined();
    expect(await globalThis.bookDB.quote_highlights.count()).toBe(0);
  });
});
