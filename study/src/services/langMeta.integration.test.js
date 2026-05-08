/**
 * langMeta.integration.test.js — 실 Dexie + fake-indexeddb.
 * applyLangMeta 가 meta 'lang_${lang}' 에 정확히 누적 + 기존 필드 보존 검증.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStudyDB } from '../db/schema.js';
import { applyLangMeta } from './langMeta.js';

describe('applyLangMeta (real Dexie)', () => {
  let db;
  beforeEach(() => { db = createStudyDB(`lm_test_${Date.now()}_${Math.random()}`); });
  afterEach(async () => { await db.delete(); });

  it('첫 호출 — lang_en 신규 row 생성', async () => {
    const out = await applyLangMeta(db, 'en', { date: '2026-05-08', durationSec: 120 });
    expect(out).toMatchObject({ totalDays: 1, streak: 1, totalTime: 120, lastStudyDate: '2026-05-08' });
    const stored = await db.meta.get('lang_en');
    expect(stored.value).toMatchObject({ totalDays: 1, streak: 1 });
  });

  it('연속 2일 호출 → streak 누적', async () => {
    await applyLangMeta(db, 'en', { date: '2026-05-08', durationSec: 60 });
    await applyLangMeta(db, 'en', { date: '2026-05-09', durationSec: 60 });
    const stored = await db.meta.get('lang_en');
    expect(stored.value).toMatchObject({ totalDays: 2, streak: 2, totalTime: 120 });
  });

  it('lang 별 분리 (en / ja 독립)', async () => {
    await applyLangMeta(db, 'en', { date: '2026-05-08', durationSec: 60 });
    await applyLangMeta(db, 'ja', { date: '2026-05-08', durationSec: 90 });
    const en = await db.meta.get('lang_en');
    const ja = await db.meta.get('lang_ja');
    expect(en.value.totalTime).toBe(60);
    expect(ja.value.totalTime).toBe(90);
  });

  it('기존 currentStage/userKnown 보존 (다른 모듈이 쓴 필드)', async () => {
    await db.meta.put({ key: 'lang_en', value: {
      currentStage: 3, userKnown: [{ type: 'word', value: 'awesome' }], goal: 'fluency',
    }, at: Date.now() });
    await applyLangMeta(db, 'en', { date: '2026-05-08', durationSec: 100 });
    const stored = await db.meta.get('lang_en');
    expect(stored.value.currentStage).toBe(3);
    expect(stored.value.userKnown).toEqual([{ type: 'word', value: 'awesome' }]);
    expect(stored.value.goal).toBe('fluency');
    expect(stored.value.totalDays).toBe(1);
    expect(stored.value.streak).toBe(1);
  });

  it('db / lang / log 누락 → null', async () => {
    expect(await applyLangMeta(null, 'en', { date: '2026-05-08' })).toBeNull();
    expect(await applyLangMeta(db, '', { date: '2026-05-08' })).toBeNull();
    expect(await applyLangMeta(db, 'en', null)).toBeNull();
  });
});
