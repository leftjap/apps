/**
 * activeSession.integration.test.js — 실 Dexie + fake-indexeddb.
 * save → load 라운드트립 + 만료 자동 clear 검증.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStudyDB } from '../db/schema.js';
import { saveActiveSession, loadActiveSession, clearActiveSession, finalizeStaleSnapshot } from './activeSession.js';

describe('activeSession (real Dexie)', () => {
  let db;
  beforeEach(() => { db = createStudyDB(`as_test_${Date.now()}_${Math.random()}`); });
  afterEach(async () => { await db.delete(); });

  it('save → load 라운드트립 — 모든 필드 보존 + savedAt 부착', async () => {
    const snapshot = {
      mode: 'new', lang: 'en', todayISO: '2026-05-08', startTime: 1_700_000_000_000,
      step: 2, tried: 5, passed: 3, lastScore: 88,
      pronScores: [80, 90, 88, 75, 88], weakInSession: { θ: 2, ɛ: 1 },
      judged: { got: 0, hmm: 0, no: 0 }, cardIds: ['c1', 'c2', 'c3'],
    };
    const saved = await saveActiveSession(db, snapshot);
    expect(saved.savedAt).toBeGreaterThan(0);
    const loaded = await loadActiveSession(db);
    expect(loaded).toMatchObject(snapshot);
    expect(loaded.savedAt).toBe(saved.savedAt);
  });

  it('TTL 초과 (savedAt 가 1시간+1초 전) → load null + 자동 clear', async () => {
    await db.meta.put({ key: 'activeSession', value: {
      mode: 'new', step: 1, savedAt: Date.now() - (60 * 60 * 1000 + 1000),
    }, at: Date.now() });
    const loaded = await loadActiveSession(db);
    expect(loaded).toBeNull();
    expect(await db.meta.get('activeSession')).toBeUndefined();
  });

  it('clear — meta row 제거', async () => {
    await saveActiveSession(db, { mode: 'review', step: 1 });
    await clearActiveSession(db);
    expect(await db.meta.get('activeSession')).toBeUndefined();
  });

  it('빈/누락 입력 안전', async () => {
    expect(await saveActiveSession(null, { mode: 'new' })).toBeNull();
    expect(await saveActiveSession(db, null)).toBeNull();
    expect(await loadActiveSession(null)).toBeNull();
    expect(await loadActiveSession(db)).toBeNull(); // meta 비어있음
  });

  it('value.savedAt 누락 row → 만료 처리 + clear', async () => {
    await db.meta.put({ key: 'activeSession', value: { mode: 'new', step: 1 }, at: Date.now() });
    expect(await loadActiveSession(db)).toBeNull();
    expect(await db.meta.get('activeSession')).toBeUndefined();
  });

  describe('finalizeStaleSnapshot — 만료 시 부분 학습 영속화', () => {
    it('new 모드 + 3카드 학습 (step=4) → sessionLog 1건 + 3카드 reviewQueue promote + todayLessons completed', async () => {
      // 카드 5개 todayLessons seed
      const cards = Array.from({ length: 5 }, (_, i) => ({
        id: `n${i + 1}`, lang: 'en', date: '2026-05-08', completed: false,
        sentence: `s${i + 1}`, meaning: `m${i + 1}`, explanation: {}, order_index: i + 1,
      }));
      await db.todayLessons.bulkPut(cards);
      const snapshot = {
        mode: 'new', lang: 'en', todayISO: '2026-05-08',
        startTime: 1_700_000_000_000, savedAt: 1_700_000_180_000, // +3분
        step: 4, tried: 12, passed: 9, // 3카드 완료, 4번째 진행 중
        cardIds: ['n1', 'n2', 'n3', 'n4', 'n5'],
      };
      const result = await finalizeStaleSnapshot(db, snapshot);
      expect(result).not.toBeNull();
      expect(result.utteranceCount).toBe(12);
      expect(result.passCount).toBe(9);
      expect(result.durationSec).toBe(180);
      expect(result.newSentenceIds).toEqual(['n1', 'n2', 'n3']);
      // sessionLog 저장
      const logs = await db.sessionLogs.toArray();
      expect(logs.length).toBe(1);
      // reviewQueue 3건 promote
      const rq = await db.reviewQueue.toArray();
      expect(rq.map((r) => r.id).sort()).toEqual(['n1', 'n2', 'n3']);
      // todayLessons 3건 completed=true
      const t1 = await db.todayLessons.get('n1');
      const t4 = await db.todayLessons.get('n4');
      expect(t1.completed).toBe(true);
      expect(t4.completed).toBe(false);
      // dailyStats 누적
      const ds = await db.dailyStats.get('2026-05-08');
      expect(ds.utteranceCount).toBe(12);
      expect(ds.newSentences).toBe(3);
    });

    it('step=1 (학습 0) → null (영속화 skip)', async () => {
      const result = await finalizeStaleSnapshot(db, {
        mode: 'new', lang: 'en', todayISO: '2026-05-08',
        startTime: 1_700_000_000_000, savedAt: 1_700_000_060_000,
        step: 1, tried: 0, passed: 0, cardIds: ['n1'],
      });
      expect(result).toBeNull();
      expect((await db.sessionLogs.toArray()).length).toBe(0);
    });

    it('review 모드 + step=3 → completedReviewCount=2 sessionLog', async () => {
      const result = await finalizeStaleSnapshot(db, {
        mode: 'review', lang: 'ja', todayISO: '2026-05-08',
        startTime: 1_700_000_000_000, savedAt: 1_700_000_120_000, // +2분
        step: 3, tried: 6, passed: 4, cardIds: ['r1', 'r2', 'r3'],
      });
      expect(result).not.toBeNull();
      expect(result.completedReviewCount).toBe(2);
      expect(result.utteranceCount).toBe(6);
      const logs = await db.sessionLogs.toArray();
      expect(logs.length).toBe(1);
      expect(logs[0].lang).toBe('ja');
    });

    it('loadActiveSession 만료 분기 → finalize 자동 호출 + clear', async () => {
      const cards = [
        { id: 'a', lang: 'en', date: '2026-05-08', completed: false, sentence: 'A', meaning: 'a', explanation: {}, order_index: 1 },
      ];
      await db.todayLessons.bulkPut(cards);
      const expiredSnap = {
        mode: 'new', lang: 'en', todayISO: '2026-05-08',
        startTime: Date.now() - 3 * 60 * 60 * 1000,
        savedAt: Date.now() - 2 * 60 * 60 * 1000, // 2시간 전 (TTL=1시간 초과)
        step: 2, tried: 4, passed: 3, cardIds: ['a'],
      };
      await db.meta.put({ key: 'activeSession', value: expiredSnap, at: Date.now() });
      const loaded = await loadActiveSession(db);
      expect(loaded).toBeNull(); // expire → null
      // 자동 finalize 결과 — sessionLog + reviewQueue
      expect((await db.sessionLogs.toArray()).length).toBe(1);
      expect((await db.reviewQueue.toArray()).length).toBe(1);
      // 스냅샷 자체는 clear
      expect(await db.meta.get('activeSession')).toBeUndefined();
    });
  });
});
