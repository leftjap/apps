/**
 * cardLoader.integration.test.js — 실 Dexie + fake-indexeddb 통합 테스트.
 *
 * Wave A.1 보강: cardLoader.test.js 의 mock 은 Dexie API 시그니처만 흉내낸 shim.
 * 본 파일은 실제 createStudyDB() 인스턴스에 데이터 put → loadNewCards/loadReviewCards
 * 호출 → Dexie 의 실제 where().equals().toArray() 동작 결과 검증.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStudyDB } from '../db/schema.js';
import { loadNewCards, loadReviewCards } from './cardLoader.js';

describe('cardLoader 통합 (real Dexie + fake-indexeddb)', () => {
  let db;
  beforeEach(() => {
    db = createStudyDB(`test_${Date.now()}_${Math.random()}`);
  });
  afterEach(async () => {
    await db.delete();
  });

  it('loadNewCards: 실 Dexie 에서 carry-forward (lang 매칭 + completed 제외 + 오래된 date 먼저)', async () => {
    await db.todayLessons.bulkPut([
      { id: 'a', lang: 'en', date: '2026-05-08', completed: false, order_index: 2, sentence: 'A' },
      { id: 'b', lang: 'en', date: '2026-05-08', completed: false, order_index: 1, sentence: 'B' },
      { id: 'c', lang: 'en', date: '2026-05-08', completed: true,  order_index: 0, sentence: 'C' },
      { id: 'd', lang: 'en', date: '2026-05-07', completed: false, order_index: 0, sentence: 'D' },
      { id: 'e', lang: 'ja', date: '2026-05-08', completed: false, order_index: 0, sentence: 'E' },
    ]);
    const out = await loadNewCards(db, 'en', '2026-05-08');
    // 미완료: a(2026-05-08, oi 2), b(2026-05-08, oi 1), d(2026-05-07, oi 0).
    // FIFO: d (2026-05-07) 먼저 → b (2026-05-08, oi 1) → a (2026-05-08, oi 2).
    expect(out.map((r) => r.id)).toEqual(['d', 'b', 'a']);
    expect(out[0].sentence).toBe('D');
  });

  it('loadReviewCards: 실 Dexie 에서 due 필터 + 미정 nextReview 도 due + overdue 우선', async () => {
    await db.reviewQueue.bulkPut([
      { id: 'r1', lang: 'en', nextReview: '2026-05-07' },
      { id: 'r2', lang: 'en', nextReview: '2026-05-08' },
      { id: 'r3', lang: 'en', nextReview: '2026-05-09' },
      { id: 'r4', lang: 'en' },
      { id: 'r5', lang: 'ja', nextReview: '2026-05-01' },
    ]);
    const out = await loadReviewCards(db, 'en', '2026-05-08');
    expect(out.map((r) => r.id)).toEqual(['r4', 'r1', 'r2']);
  });

  it('빈 DB 에서 빈 배열 반환', async () => {
    expect(await loadNewCards(db, 'en', '2026-05-08')).toEqual([]);
    expect(await loadReviewCards(db, 'en', '2026-05-08')).toEqual([]);
  });
});
