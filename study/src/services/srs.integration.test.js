/**
 * srs.integration.test.js — applySrsUpdate × 실 Dexie + fake-indexeddb.
 * reviewQueue.update / delete 가 실제로 반영되는지 검증.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStudyDB } from '../db/schema.js';
import { applySrsUpdate } from './srs.js';

const TODAY = '2026-05-08';

describe('applySrsUpdate (real Dexie)', () => {
  let db;
  beforeEach(async () => {
    db = createStudyDB(`srs_test_${Date.now()}_${Math.random()}`);
    await db.reviewQueue.bulkPut([
      { id: 'c1', lang: 'en', interval: 1, nextReview: '2026-05-08' },
      { id: 'c60', lang: 'en', interval: 60, nextReview: '2026-05-08' },
      { id: 'c7', lang: 'en', interval: 7, nextReview: '2026-05-08' },
    ]);
  });
  afterEach(async () => { await db.delete(); });

  it('got it → interval 다음 단계 (1→3)', async () => {
    await applySrsUpdate(db, await db.reviewQueue.get('c1'), 'got', TODAY);
    const updated = await db.reviewQueue.get('c1');
    expect(updated.interval).toBe(3);
    expect(updated.nextReview).toBe('2026-05-11');
  });

  it('no → interval 1 reset', async () => {
    await applySrsUpdate(db, await db.reviewQueue.get('c7'), 'no', TODAY);
    const updated = await db.reviewQueue.get('c7');
    expect(updated.interval).toBe(1);
    expect(updated.nextReview).toBe('2026-05-09');
  });

  it('hmm 7 → 14 (중간값 올림)', async () => {
    await applySrsUpdate(db, await db.reviewQueue.get('c7'), 'hmm', TODAY);
    const updated = await db.reviewQueue.get('c7');
    expect(updated.interval).toBe(14);
    expect(updated.nextReview).toBe('2026-05-22');
  });

  it('60 + got → 큐에서 제거 (졸업)', async () => {
    const ret = await applySrsUpdate(db, await db.reviewQueue.get('c60'), 'got', TODAY);
    expect(ret).toEqual({ graduate: true });
    expect(await db.reviewQueue.get('c60')).toBeUndefined();
  });

  it('db/card 누락 → null', async () => {
    expect(await applySrsUpdate(null, { id: 'x' }, 'got', TODAY)).toBeNull();
    expect(await applySrsUpdate(db, null, 'got', TODAY)).toBeNull();
    expect(await applySrsUpdate(db, {}, 'got', TODAY)).toBeNull();
  });
});
