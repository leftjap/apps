import { describe, it, expect } from 'vitest';
import { cleanupDummyDataIfNeeded, CLEANUP_VERSION, SUPABASE_TABLES } from './cleanupDummy.js';

function createMockStore(pkField = 'id') {
  const data = new Map();
  return {
    _data: data,
    async get(key) { return data.get(key); },
    async put(rec) { data.set(rec[pkField], { ...rec }); return rec[pkField]; },
    async delete(key) { data.delete(key); },
    async clear() { data.clear(); },
    async bulkPut(records) { for (const r of records) data.set(r[pkField], { ...r }); },
  };
}

function createMockDB() {
  return {
    meta: createMockStore('key'),
    reviewQueue: createMockStore('id'),
    todayLessons: createMockStore('id'),
    sessionLogs: createMockStore('id'),
    dailyStats: createMockStore('date'),
    pronunciationLog: createMockStore('id'),
    async transaction(_mode, ..._stores) { return arguments[arguments.length - 1](); },
  };
}

function createSupabaseMock({ failTable = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      return { delete: () => ({ eq(col, val) {
        calls.push({ table, col, val });
        return Promise.resolve(failTable === table ? { error: { message: `fail ${table}` } } : { error: null });
      } }) };
    },
  };
}

describe('cleanupDummyDataIfNeeded', () => {
  it('빈 DB → ok + 마커 → 두 번째 호출 skip', async () => {
    const db = createMockDB();
    const sb = createSupabaseMock();
    const r1 = await cleanupDummyDataIfNeeded(db, 'u', sb);
    expect(r1).toEqual({ skipped: false, ok: true, version: CLEANUP_VERSION });
    expect((await db.meta.get('dummyCleanup'))?.value).toBe(CLEANUP_VERSION);
    sb.calls.length = 0;
    const r2 = await cleanupDummyDataIfNeeded(db, 'u', sb);
    expect(r2).toEqual({ skipped: true, reason: 'done' });
    expect(sb.calls).toHaveLength(0);
  });

  it('채워진 DB → 5 store 0건 + meta.seeded 삭제 + studySettings 보존', async () => {
    const db = createMockDB();
    await db.reviewQueue.bulkPut([{ id: 'r1' }, { id: 'r2' }]);
    await db.todayLessons.bulkPut([{ id: 't1' }]);
    await db.sessionLogs.bulkPut([{ id: 's1' }]);
    await db.dailyStats.bulkPut([{ date: '2026-05-04' }]);
    await db.pronunciationLog.bulkPut([{ id: 'p1' }]);
    await db.meta.put({ key: 'seeded', value: 'v11' });
    await db.meta.put({ key: 'studySettings', value: { autoTTS: false } });
    await cleanupDummyDataIfNeeded(db, 'u', createSupabaseMock());
    expect(db.reviewQueue._data.size).toBe(0);
    expect(db.todayLessons._data.size).toBe(0);
    expect(db.sessionLogs._data.size).toBe(0);
    expect(db.dailyStats._data.size).toBe(0);
    expect(db.pronunciationLog._data.size).toBe(0);
    expect(await db.meta.get('seeded')).toBeUndefined();
    expect((await db.meta.get('studySettings'))?.value).toEqual({ autoTTS: false });
  });

  it('Supabase 4 테이블 delete().eq("user_id", userId) 호출', async () => {
    const sb = createSupabaseMock();
    await cleanupDummyDataIfNeeded(createMockDB(), 'user-42', sb);
    expect(sb.calls.map((c) => c.table)).toEqual([...SUPABASE_TABLES]);
    for (const c of sb.calls) { expect(c.col).toBe('user_id'); expect(c.val).toBe('user-42'); }
  });

  it('Supabase 1번째 error → Dexie 미수정 + ok=false + failedTable', async () => {
    const db = createMockDB();
    await db.reviewQueue.bulkPut([{ id: 'r1' }]);
    await db.meta.put({ key: 'seeded', value: 'v11' });
    const sb = createSupabaseMock({ failTable: SUPABASE_TABLES[0] });
    const result = await cleanupDummyDataIfNeeded(db, 'u', sb);
    expect(result).toMatchObject({ skipped: false, ok: false, failedTable: SUPABASE_TABLES[0] });
    expect(db.reviewQueue._data.size).toBe(1);
    expect((await db.meta.get('seeded'))?.value).toBe('v11');
    expect(await db.meta.get('dummyCleanup')).toBeUndefined();
  });
});
