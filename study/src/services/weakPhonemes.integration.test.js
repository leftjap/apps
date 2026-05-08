/**
 * weakPhonemes.integration.test.js — 실 Dexie + fake-indexeddb.
 * applyWeakPhonemesUpdate 가 meta 의 weakPhonemes_${lang} key 에 정확히 누적되는지.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStudyDB } from '../db/schema.js';
import { applyWeakPhonemesUpdate } from './weakPhonemes.js';

describe('applyWeakPhonemesUpdate (real Dexie)', () => {
  let db;
  beforeEach(() => { db = createStudyDB(`wp_test_${Date.now()}_${Math.random()}`); });
  afterEach(async () => { await db.delete(); });

  it('첫 호출 — 새 row 생성 (key=weakPhonemes_en)', async () => {
    const out = await applyWeakPhonemesUpdate(db, 'en', ['θ', 'ɹ']);
    expect(out).toEqual({ θ: 1, ɹ: 1 });
    const stored = await db.meta.get('weakPhonemes_en');
    expect(stored.value).toEqual({ θ: 1, ɹ: 1 });
    expect(typeof stored.at).toBe('number');
  });

  it('두 번째 호출 — 기존 카운터에 누적', async () => {
    await applyWeakPhonemesUpdate(db, 'en', ['θ']);
    await applyWeakPhonemesUpdate(db, 'en', ['θ', 'ɛ']);
    const stored = await db.meta.get('weakPhonemes_en');
    expect(stored.value).toEqual({ θ: 2, ɛ: 1 });
  });

  it('lang 별 분리 — en / ja 독립 row', async () => {
    await applyWeakPhonemesUpdate(db, 'en', ['θ']);
    await applyWeakPhonemesUpdate(db, 'ja', ['ら']);
    expect((await db.meta.get('weakPhonemes_en')).value).toEqual({ θ: 1 });
    expect((await db.meta.get('weakPhonemes_ja')).value).toEqual({ ら: 1 });
  });

  it('빈 배열 → DB 변동 없음 + null 반환', async () => {
    expect(await applyWeakPhonemesUpdate(db, 'en', [])).toBeNull();
    expect(await db.meta.get('weakPhonemes_en')).toBeUndefined();
  });

  it('db / lang 누락 → null', async () => {
    expect(await applyWeakPhonemesUpdate(null, 'en', ['θ'])).toBeNull();
    expect(await applyWeakPhonemesUpdate(db, '', ['θ'])).toBeNull();
  });
});
