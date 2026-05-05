import { describe, it, expect } from 'vitest';
import { backfill20260504, BACKFILL_KEY, BACKFILL_DATE } from './backfill20260504.js';

function createMockStore(pkField = 'id') {
  const data = new Map();
  return {
    _data: data,
    async get(key) { return data.get(key); },
    async put(rec) { data.set(rec[pkField], { ...rec }); return rec[pkField]; },
    async update(key, patch) {
      const cur = data.get(key);
      if (!cur) return 0;
      data.set(key, { ...cur, ...patch });
      return 1;
    },
    async bulkPut(records) { for (const r of records) data.set(r[pkField], { ...r }); },
    where(criteria) {
      if (typeof criteria === 'string') {
        return {
          equals(val) {
            return { async toArray() { return [...data.values()].filter((r) => r[criteria] === val); } };
          },
        };
      }
      return {
        async toArray() {
          return [...data.values()].filter((r) =>
            Object.entries(criteria).every(([k, v]) => r[k] === v),
          );
        },
      };
    },
  };
}

function createMockDB() {
  return {
    meta: createMockStore('key'),
    sessionLogs: createMockStore('id'),
    todayLessons: createMockStore('id'),
  };
}

describe('backfill20260504', () => {
  it('marker=done 이면 skip', async () => {
    const db = createMockDB();
    await db.meta.put({ key: BACKFILL_KEY, value: 'done' });
    await db.sessionLogs.bulkPut([
      { id: 's1', lang: 'en', date: BACKFILL_DATE, newSentenceIds: [] },
    ]);
    const r = await backfill20260504(db);
    expect(r).toEqual({ skipped: true, reason: 'done' });
    const log = await db.sessionLogs.get('s1');
    expect(log.newSentenceIds).toEqual([]);
  });

  it('5/4 sessionLog 부재 → marker set + skip', async () => {
    const db = createMockDB();
    const r = await backfill20260504(db);
    expect(r).toEqual({ skipped: true, reason: 'no-log', patched: 0 });
    expect((await db.meta.get(BACKFILL_KEY))?.value).toBe('done');
  });

  it('빈 newSentenceIds → todayLessons lang 매칭 ID 로 patch + marker set', async () => {
    const db = createMockDB();
    await db.sessionLogs.bulkPut([
      { id: 's1', lang: 'en', date: BACKFILL_DATE, newSentenceIds: [] },
      { id: 's2', lang: 'ja', date: BACKFILL_DATE },
    ]);
    await db.todayLessons.bulkPut([
      { id: 'en-2026-05-04-1', lang: 'en', date: BACKFILL_DATE },
      { id: 'en-2026-05-04-2', lang: 'en', date: BACKFILL_DATE },
      { id: 'ja-2026-05-04-1', lang: 'ja', date: BACKFILL_DATE },
    ]);
    const r = await backfill20260504(db);
    expect(r).toMatchObject({ skipped: false, ok: true, patched: 2 });
    expect((await db.sessionLogs.get('s1')).newSentenceIds).toEqual(['en-2026-05-04-1', 'en-2026-05-04-2']);
    expect((await db.sessionLogs.get('s2')).newSentenceIds).toEqual(['ja-2026-05-04-1']);
    expect((await db.meta.get(BACKFILL_KEY))?.value).toBe('done');
  });

  it('이미 newSentenceIds 채워진 row 는 보호 (덮어쓰기 안 함)', async () => {
    const db = createMockDB();
    await db.sessionLogs.bulkPut([
      { id: 's1', lang: 'en', date: BACKFILL_DATE, newSentenceIds: ['existing-1'] },
    ]);
    await db.todayLessons.bulkPut([
      { id: 'en-2026-05-04-1', lang: 'en', date: BACKFILL_DATE },
    ]);
    const r = await backfill20260504(db);
    expect(r).toMatchObject({ skipped: false, patched: 0 });
    expect((await db.sessionLogs.get('s1')).newSentenceIds).toEqual(['existing-1']);
  });
});
