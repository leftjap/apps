/**
 * sessionFinish.flush.test.js — 세션 완료 시 즉시 동기화 (spec §4 line 223).
 *
 * 배경: spec 은 "디바운스 저장 (3초 배치)" 를 "세션 완료 시 즉시 동기화" 와 한 쌍으로 설계했는데,
 * 구현은 debounce 만 하고 즉시 flush 를 빠뜨렸다 (sync.js 주석은 그렇게 주장하나 호출자 부재).
 * → 세션의 가장 큰 산출물(sessionLog + dailyStats + 카드 이관)이 3초 무활동 창에 그대로 노출.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStudyDB } from '../db/schema.js';

const flushSpy = vi.fn(() => Promise.resolve({ ok: true, results: [], failed: 0 }));
vi.mock('../db/sync.js', () => ({
  flushPendingUploads: (...args) => flushSpy(...args),
}));

describe('finishSession — 세션 완료 시 즉시 flush', () => {
  let db;
  beforeEach(async () => {
    flushSpy.mockClear();
    db = createStudyDB(`finish_flush_${Date.now()}_${Math.random()}`);
    await db.todayLessons.bulkPut([
      { id: 'n1', lang: 'en', date: '2026-07-14', completed: false, order_index: 1, sentence: 'A', meaning: 'a' },
    ]);
  });
  afterEach(async () => { await db.delete(); });

  it('finishSession 완료 후 flushPendingUploads 호출 (3초 debounce 창 노출 제거)', async () => {
    const { finishSession } = await import('./sessionFinish.js');
    const completedNew = await db.todayLessons.toArray();
    await finishSession(db, {
      mode: 'new', lang: 'en', date: '2026-07-14',
      durationSec: 180, tried: 8, passed: 6, completedNewCards: completedNew,
    });
    expect(flushSpy).toHaveBeenCalled();
  });

  it('flush 실패해도 finishSession 은 성공 (로컬 저장이 정본 — 아웃박스가 재시도)', async () => {
    flushSpy.mockRejectedValueOnce(new Error('network'));
    const { finishSession } = await import('./sessionFinish.js');
    const log = await finishSession(db, {
      mode: 'review', lang: 'en', date: '2026-07-14',
      durationSec: 60, tried: 3, passed: 3,
    });
    expect(log.date).toBe('2026-07-14');
    const saved = await db.sessionLogs.toArray();
    expect(saved).toHaveLength(1);
  });
});
