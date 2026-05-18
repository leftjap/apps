/**
 * seed.test.js — Wave 11.71 v8 콘텐츠 갈아엎기 + OBSOLETE 자동 정리.
 *
 * 검증 범위:
 *  - 첫 시드: SEED_VERSION 미존재 → re1~re7 + rj1~rj7 (총 14건) + te1~te3 + tj1~tj3 (총 6건) add
 *  - 마이그레이션 (v7 → v8): OBSOLETE 잔존 (r1, jr1 등) bulkDelete + 신규 re/rj/te/tj 카드 add
 *  - 일본어 카드 explanation = ja 4필드 + meta 5 (whenToUse/grammar/pronPoints/similar + stage/newElements/knownElements/frequency/category)
 *  - 영어 카드 explanation = 8필드 (key/situation/grammar 배열/chunks/phonemes/mistake/similar)
 *  - 동일 버전 재진입: skip (멱등성)
 *  - sessionLogs/dailyStats 는 마이그레이션 시 push 안 함 (사용자 학습 기록 보존)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { seedIfNeeded } from './seed.js';

function createMockStore(pkField = 'id') {
  const data = new Map();
  return {
    _data: data,
    _pkField: pkField,
    async get(key) {
      return data.get(key);
    },
    async put(rec) {
      const key = rec[pkField];
      data.set(key, { ...rec });
      return key;
    },
    async update(key, patch) {
      const cur = data.get(key);
      if (!cur) return 0;
      data.set(key, { ...cur, ...patch });
      return 1;
    },
    async bulkGet(keys) {
      return keys.map((k) => data.get(k));
    },
    async bulkAdd(records) {
      for (const r of records) {
        const key = r[pkField];
        if (data.has(key)) throw new Error(`bulkAdd: key 충돌 ${key}`);
        data.set(key, { ...r });
      }
    },
    async bulkPut(records) {
      for (const r of records) {
        const key = r[pkField];
        data.set(key, { ...r });
      }
    },
    async bulkDelete(keys) {
      for (const k of keys) data.delete(k);
    },
  };
}

function createMockDB() {
  const db = {
    meta: createMockStore('key'),
    reviewQueue: createMockStore('id'),
    todayLessons: createMockStore('id'),
    sessionLogs: createMockStore('id'),
    dailyStats: createMockStore('date'),
    pronunciationLog: createMockStore('id'),
    async transaction(_mode, ..._stores) {
      const cb = arguments[arguments.length - 1];
      return cb();
    },
  };
  return db;
}

describe('seedIfNeeded — Wave 11.71 v8 갈아엎기', () => {
  describe('첫 시드 (marker 미존재)', () => {
    let db;
    let result;
    beforeEach(async () => {
      db = createMockDB();
      result = await seedIfNeeded(db);
    });

    it('skipped=false, isFirstSeed=true, version=v13', () => {
      expect(result.skipped).toBe(false);
      expect(result.isFirstSeed).toBe(true);
      expect(result.version).toBe('v13');
    });

    it('reviewQueue 에 rj1~rj7 (일본어 7건만 — v13 영어 데모 제거)', () => {
      expect(db.reviewQueue._data.size).toBe(7);
      for (const id of ['rj1','rj2','rj3','rj4','rj5','rj6','rj7']) {
        expect(db.reviewQueue._data.has(id), `ja ${id}`).toBe(true);
      }
    });

    it('todayLessons 에 tj1~tj3 (일본어 3건만 — v13 영어 데모 제거)', () => {
      expect(db.todayLessons._data.size).toBe(3);
      for (const id of ['tj1','tj2','tj3']) {
        expect(db.todayLessons._data.has(id), id).toBe(true);
      }
    });

    it('영어 시드 0건 / 일본어 10건 (review 7 + today 3) — v13 영어 트랙 Supabase 단독', async () => {
      const enReview = [...db.reviewQueue._data.values()].filter(c => c.lang === 'en');
      const jaReview = [...db.reviewQueue._data.values()].filter(c => c.lang === 'ja');
      const enLessons = [...db.todayLessons._data.values()].filter(c => c.lang === 'en');
      const jaLessons = [...db.todayLessons._data.values()].filter(c => c.lang === 'ja');
      expect(enReview.length).toBe(0);
      expect(jaReview.length).toBe(7);
      expect(enLessons.length).toBe(0);
      expect(jaLessons.length).toBe(3);
    });

    it('sessionLogs / dailyStats 첫 시드 시 push', () => {
      expect(db.sessionLogs._data.size).toBeGreaterThan(0);
      expect(db.dailyStats._data.size).toBeGreaterThan(0);
    });

    it('meta.seeded marker 가 v13 으로 저장', async () => {
      const marker = await db.meta.get('seeded');
      expect(marker.value).toBe('v13');
    });

    it('일본어 카드 (rj1) — ja 4필드 + meta 5필드 형식', async () => {
      const rj1 = await db.reviewQueue.get('rj1');
      expect(rj1.explanation.whenToUse).toBeTruthy();
      expect(rj1.explanation.grammar).toBeTypeOf('string');
      expect(rj1.explanation.pronPoints).toBeTruthy();
      expect(rj1.explanation.similar).toBeTruthy();
      expect(rj1.explanation.stage).toBe(1);
      expect(Array.isArray(rj1.explanation.newElements)).toBe(true);
      expect(rj1.explanation.newElements.length).toBe(1);
      expect(rj1.explanation.frequency).toBeGreaterThan(0);
      expect(rj1.explanation.category).toBeTruthy();
      expect(rj1.explanation.key).toBeUndefined();
      expect(rj1.explanation.chunks).toBeUndefined();
    });

    it('일본어 today (tj1) — ja 4필드 + meta 5', async () => {
      const tj1 = await db.todayLessons.get('tj1');
      expect(tj1.explanation.whenToUse).toContain('감탄');
      expect(tj1.explanation.grammar).toBeTypeOf('string');
      expect(tj1.explanation.pronPoints).toBeTruthy();
      expect(tj1.explanation.stage).toBe(1);
      expect(tj1.explanation.newElements).toEqual(['すごい']);
      expect(tj1.explanation.knownElements).toEqual([]);
    });

    it('일본어 카드 모두 newElements length=1 (i+1 1T 원칙)', async () => {
      const jaIds = ['rj1','rj2','rj3','rj4','rj5','rj6','rj7','tj1','tj2','tj3'];
      for (const id of jaIds) {
        const card = (await db.reviewQueue.get(id)) || (await db.todayLessons.get(id));
        expect(card.explanation.newElements.length, `${id} newElements`).toBe(1);
      }
    });

    it('phoneticKr 모든 카드 존재 (일본어 — v13 영어 데모 제거)', () => {
      const allCards = [
        ...[...db.reviewQueue._data.values()],
        ...[...db.todayLessons._data.values()],
      ];
      expect(allCards.length).toBe(10);
      for (const c of allCards) {
        expect(c.phoneticKr, `${c.id} phoneticKr`).toBeTruthy();
      }
    });
  });

  describe('마이그레이션 (v7 → v8) — OBSOLETE 자동 정리', () => {
    let db;
    beforeEach(async () => {
      db = createMockDB();
      await db.meta.put({ key: 'seeded', value: 'v7', at: '2026-04-15T00:00:00Z' });
      // v7 시점 OBSOLETE 카드 (r1, jr1 등) 잔존 시뮬레이션 — 학습 진도까지.
      await db.reviewQueue.put({
        id: 'r1', lang: 'en', sentence: 'old', meaning: 'old', reading: null,
        explanation: { key:'old', situation:'', grammar:[], chunks:[], phonemes:[], mistake:'', similar:'' },
        interval: 30, nextReview: '2026-05-15', consecutivePass: 5, lastResult: 'O', category: 'old',
      });
      await db.reviewQueue.put({
        id: 'jr1', lang: 'ja', sentence: 'ありがとうございます', meaning: 'old',
        explanation: { whenToUse:'old', grammar:'old', pronPoints:'old', similar:'old',
          stage:1, newElements:['old'], knownElements:[], frequency:10, category:'old' },
        interval: 7, nextReview: '2026-05-01', consecutivePass: 2, lastResult: 'O',
      });
      await db.todayLessons.put({
        id: 'jn1', lang: 'ja', date: '2026-04-15', sentence: 'old', meaning: 'old',
        completed: true, orderIndex: 1,
        explanation: { whenToUse:'old', grammar:'old', pronPoints:'old', similar:'old',
          stage:1, newElements:['old'], knownElements:[], frequency:10, category:'old' },
      });
    });

    it('OBSOLETE (r1/jr1/jn1) 모두 삭제됨', async () => {
      await seedIfNeeded(db);
      expect(await db.reviewQueue.get('r1')).toBeUndefined();
      expect(await db.reviewQueue.get('jr1')).toBeUndefined();
      expect(await db.todayLessons.get('jn1')).toBeUndefined();
    });

    it('신규 rj1~rj7 추가, todayLessons tj1~tj3 추가 (v13 — 영어 데모 제거)', async () => {
      const result = await seedIfNeeded(db);
      expect(result.isFirstSeed).toBe(false);
      expect(db.reviewQueue._data.size).toBe(7);
      expect(db.todayLessons._data.size).toBe(3);
      const rj1 = await db.reviewQueue.get('rj1');
      expect(rj1.sentence).toBe('はい');
      expect(rj1.explanation.whenToUse).toContain('긍정');
    });

    it('counts.obsoleteDeleted >= 3 (r1 + jr1 + jn1)', async () => {
      const result = await seedIfNeeded(db);
      expect(result.counts.obsoleteDeleted).toBeGreaterThanOrEqual(3);
    });

    it('sessionLogs / dailyStats 마이그레이션 시 push 안 함', async () => {
      const result = await seedIfNeeded(db);
      expect(db.sessionLogs._data.size).toBe(0);
      expect(db.dailyStats._data.size).toBe(0);
      expect(result.counts.sessionLogs).toBe(0);
      expect(result.counts.dailyStats).toBe(0);
    });

    it('marker 가 v13 으로 갱신', async () => {
      await seedIfNeeded(db);
      const marker = await db.meta.get('seeded');
      expect(marker.value).toBe('v13');
    });
  });

  describe('동일 버전 재진입 (멱등성)', () => {
    it('marker.value === SEED_VERSION 이면 skip', async () => {
      const db = createMockDB();
      await db.meta.put({ key: 'seeded', value: 'v13', at: '2026-05-04T00:00:00Z' });
      const result = await seedIfNeeded(db);
      expect(result.skipped).toBe(true);
      expect(db.reviewQueue._data.size).toBe(0);
      expect(db.todayLessons._data.size).toBe(0);
    });
  });

  describe('가드', () => {
    it('db 인자 누락 시 throw', async () => {
      await expect(seedIfNeeded(null)).rejects.toThrow(/db 인자 누락/);
      await expect(seedIfNeeded(undefined)).rejects.toThrow(/db 인자 누락/);
    });
  });
});
