/**
 * pronunciationLog.integration.test.js — 실 Dexie + fake-indexeddb.
 * savePronunciationLog 가 pronunciationLog 스토어에 row 를 정확히 put 하는지.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStudyDB } from '../db/schema.js';
import { savePronunciationLog } from './pronunciationLog.js';

describe('savePronunciationLog (real Dexie)', () => {
  let db;
  beforeEach(() => { db = createStudyDB(`pl_test_${Date.now()}_${Math.random()}`); });
  afterEach(async () => { await db.delete(); });

  it('정상 result → row put + bulkGet 으로 회수 가능', async () => {
    const log = await savePronunciationLog(db, {
      result: {
        score: 92,
        phonemeScores: [{ symbol: 'θ', word: 'think', score: 60 }],
        weakPhonemes: ['θ'],
        recognizedText: 'I think it is fine',
      },
      sentenceId: 'card_42', lang: 'en', date: '2026-05-08',
    });
    expect(log).not.toBeNull();
    const fetched = await db.pronunciationLog.get(log.id);
    expect(fetched).toMatchObject({
      lang: 'en', date: '2026-05-08', sentenceId: 'card_42',
      overallScore: 92, weakPhonemes: ['θ'], recognizedText: 'I think it is fine',
    });
    expect(fetched.phonemeScores).toEqual([{ symbol: 'θ', word: 'think', score: 60 }]);
  });

  it('mockFallback 결과 → null + DB 변동 없음', async () => {
    const log = await savePronunciationLog(db, {
      result: { score: 70, mockFallback: true, phonemeScores: [], weakPhonemes: [] },
      sentenceId: 'x', lang: 'en', date: '2026-05-08',
    });
    expect(log).toBeNull();
    expect(await db.pronunciationLog.toArray()).toEqual([]);
  });

  it('db/result 누락 → null', async () => {
    expect(await savePronunciationLog(null, { result: { score: 88 }, lang: 'en', date: '2026-05-08' })).toBeNull();
    expect(await savePronunciationLog(db, { result: null, lang: 'en', date: '2026-05-08' })).toBeNull();
  });

  it('date 인덱스로 조회 — 동일 date 의 여러 attempt 회수', async () => {
    await savePronunciationLog(db, { result: { score: 70 }, sentenceId: 'a', lang: 'en', date: '2026-05-08' });
    await savePronunciationLog(db, { result: { score: 80 }, sentenceId: 'a', lang: 'en', date: '2026-05-08' });
    await savePronunciationLog(db, { result: { score: 85 }, sentenceId: 'b', lang: 'en', date: '2026-05-09' });
    const today = await db.pronunciationLog.where('date').equals('2026-05-08').toArray();
    expect(today).toHaveLength(2);
  });
});
