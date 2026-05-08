/**
 * activeSession.integration.test.js — 실 Dexie + fake-indexeddb.
 * save → load 라운드트립 + 만료 자동 clear 검증.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStudyDB } from '../db/schema.js';
import { saveActiveSession, loadActiveSession, clearActiveSession } from './activeSession.js';

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
});
