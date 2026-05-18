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

    it('skipped=false, isFirstSeed=true, version=v12', () => {
      expect(result.skipped).toBe(false);
      expect(result.isFirstSeed).toBe(true);
      expect(result.version).toBe('v12');
    });

    it('reviewQueue 에 re1~re7 + rj1~rj7 (총 14건)', () => {
      expect(db.reviewQueue._data.size).toBe(14);
      for (const id of ['re1','re2','re3','re4','re5','re6','re7']) {
        expect(db.reviewQueue._data.has(id), `en ${id}`).toBe(true);
      }
      for (const id of ['rj1','rj2','rj3','rj4','rj5','rj6','rj7']) {
        expect(db.reviewQueue._data.has(id), `ja ${id}`).toBe(true);
      }
    });

    it('todayLessons 에 te1~te3 + tj1~tj3 (총 6건)', () => {
      expect(db.todayLessons._data.size).toBe(6);
      for (const id of ['te1','te2','te3','tj1','tj2','tj3']) {
        expect(db.todayLessons._data.has(id), id).toBe(true);
      }
    });

    it('영어 10건 (review 7 + today 3) / 일본어 10건 (review 7 + today 3)', async () => {
      const enReview = [...db.reviewQueue._data.values()].filter(c => c.lang === 'en');
      const jaReview = [...db.reviewQueue._data.values()].filter(c => c.lang === 'ja');
      const enLessons = [...db.todayLessons._data.values()].filter(c => c.lang === 'en');
      const jaLessons = [...db.todayLessons._data.values()].filter(c => c.lang === 'ja');
      expect(enReview.length).toBe(7);
      expect(jaReview.length).toBe(7);
      expect(enLessons.length).toBe(3);
      expect(jaLessons.length).toBe(3);
      expect(enReview.length + enLessons.length).toBe(10);
      expect(jaReview.length + jaLessons.length).toBe(10);
    });

    it('sessionLogs / dailyStats 첫 시드 시 push', () => {
      expect(db.sessionLogs._data.size).toBeGreaterThan(0);
      expect(db.dailyStats._data.size).toBeGreaterThan(0);
    });

    it('meta.seeded marker 가 v12 으로 저장', async () => {
      const marker = await db.meta.get('seeded');
      expect(marker.value).toBe('v12');
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

    it('영어 카드 (re2) — 8필드 형식 (key/situation/grammar 배열/chunks/phonemes)', async () => {
      const re2 = await db.reviewQueue.get('re2');
      expect(re2.explanation.key).toBeTruthy();
      expect(re2.explanation.situation).toBeTruthy();
      expect(Array.isArray(re2.explanation.grammar)).toBe(true);
      expect(re2.explanation.grammar.length).toBeGreaterThan(0);
      expect(Array.isArray(re2.explanation.chunks)).toBe(true);
      expect(Array.isArray(re2.explanation.phonemes)).toBe(true);
      expect(re2.explanation.mistake).toBeTruthy();
      expect(re2.explanation.similar).toBeTruthy();
      expect(re2.explanation.whenToUse).toBeUndefined();
    });

    it('영어 today (te1) — varData 변형 연습 3타입', async () => {
      const te1 = await db.todayLessons.get('te1');
      expect(te1.explanation.varData).toBeDefined();
      expect(te1.explanation.varData.exercises.length).toBe(3);
      const types = te1.explanation.varData.exercises.map(e => e.type);
      expect(types).toContain('주어 변형');
      expect(types).toContain('시제 변형');
      expect(types).toContain('표현 변형');
    });

    it('phoneticKr 모든 카드 존재 (영어 + 일본어)', async () => {
      const allCards = [
        ...[...db.reviewQueue._data.values()],
        ...[...db.todayLessons._data.values()],
      ];
      expect(allCards.length).toBe(20);
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

    it('신규 re1~re7 + rj1~rj7 추가, todayLessons te1~te3 + tj1~tj3 추가', async () => {
      const result = await seedIfNeeded(db);
      expect(result.isFirstSeed).toBe(false);
      expect(db.reviewQueue._data.size).toBe(14);
      expect(db.todayLessons._data.size).toBe(6);
      const re1 = await db.reviewQueue.get('re1');
      expect(re1.sentence).toBe('Got it.');
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

    it('marker 가 v12 으로 갱신', async () => {
      await seedIfNeeded(db);
      const marker = await db.meta.get('seeded');
      expect(marker.value).toBe('v12');
    });
  });

  describe('동일 버전 재진입 (멱등성)', () => {
    it('marker.value === SEED_VERSION 이면 skip', async () => {
      const db = createMockDB();
      await db.meta.put({ key: 'seeded', value: 'v12', at: '2026-05-04T00:00:00Z' });
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
