/**
 * 글쓰기 시간(writing_time) 저장·동기화 테스트.
 * fake-indexeddb 위 실제 Dexie 스키마 + supabase 클라이언트 모킹.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let remoteRows = [];
const upserts = [];
let duringUpsert = null;

function mockClient() {
  function builder() {
    const obj = {
      select() { return obj; },
      eq() { return obj; },
      range() { return obj; },
      async upsert(payload, opts) {
        upserts.push({ payload, opts });
        if (duringUpsert) await duringUpsert();
        return { error: null };
      },
      then(resolve) { resolve({ data: remoteRows, error: null }); },
    };
    return obj;
  }
  return { from: () => builder() };
}

vi.mock('../services/supabase.js', () => ({
  supabase: mockClient(),
  isSupabaseConfigured: true,
}));

const { createTodayDB } = await import('./schema.js');
const { pullTable, pushWritingTime, TABLE_MAP } = await import('./sync.js');
const { addWritingSeconds, listWritingTime } = await import('./queries.js');

const U = 'u1';
const mapping = TABLE_MAP.find((m) => m.dexie === 'writing_time');
let db;

beforeEach(async () => {
  db = createTodayDB(`wt-${Math.random()}`);
  await db.open();
  globalThis.todayDB = db;
  remoteRows = [];
  upserts.length = 0;
  duringUpsert = null;
});

afterEach(async () => {
  globalThis.todayDB = null;
  await db.delete();
});

describe('schema — 글쓰기 시간 스토어', () => {
  it('새 스키마 버전 9 에 writing_time 스토어 (복합 키 user_id+day+device_id)', () => {
    expect(db.verno).toBe(9);
    const t = db.table('writing_time');
    expect(t.schema.primKey.keyPath).toEqual(['user_id', 'day', 'device_id']);
  });
});

describe('queries — addWritingSeconds', () => {
  it('같은 날·같은 기기 행에 초를 더하고 pending_sync=1 로 표시', async () => {
    await addWritingSeconds(U, 'mac', '2026-11-29', 60);
    await addWritingSeconds(U, 'mac', '2026-11-29', 30);
    await addWritingSeconds(U, 'phone', '2026-11-29', 10);
    const rows = await listWritingTime(U);
    const mac = rows.find((r) => r.device_id === 'mac');
    expect(mac.seconds).toBe(90);
    expect(mac.pending_sync).toBe(1);
    expect(rows).toHaveLength(2);
  });
});

describe('pullTable writing_time — 로컬이 더 크면 로컬 유지', () => {
  it('로컬 값이 더 큰 행은 덮어쓰지 않고, 원격이 더 크거나 새 행이면 받는다', async () => {
    await db.writing_time.put({ user_id: U, day: '2026-11-29', device_id: 'mac', seconds: 500, pending_sync: 1 });
    await db.writing_time.put({ user_id: U, day: '2026-11-28', device_id: 'mac', seconds: 100, pending_sync: 0 });
    remoteRows = [
      { user_id: U, day: '2026-11-29', device_id: 'mac', seconds: 300, updated_at: 'x' },
      { user_id: U, day: '2026-11-28', device_id: 'mac', seconds: 200, updated_at: 'x' },
      { user_id: U, day: '2026-11-29', device_id: 'phone', seconds: 40, updated_at: 'x' },
    ];
    const r = await pullTable(mapping, db, U);
    expect(r.status).toBe('ok');
    const today = await db.writing_time.get([U, '2026-11-29', 'mac']);
    expect(today.seconds).toBe(500);
    expect(today.pending_sync).toBe(1);
    expect((await db.writing_time.get([U, '2026-11-28', 'mac'])).seconds).toBe(200);
    expect((await db.writing_time.get([U, '2026-11-29', 'phone'])).seconds).toBe(40);
  });
});

describe('pushWritingTime', () => {
  it('복합 키로 upsert 하고 성공하면 pending_sync=0', async () => {
    await addWritingSeconds(U, 'mac', '2026-11-29', 75);
    const r = await pushWritingTime([U, '2026-11-29', 'mac']);
    expect(r.status).toBe('ok');
    expect(upserts[0].payload).toEqual({ user_id: U, day: '2026-11-29', device_id: 'mac', seconds: 75 });
    expect(upserts[0].opts).toEqual({ onConflict: 'user_id,day,device_id' });
    expect((await db.writing_time.get([U, '2026-11-29', 'mac'])).pending_sync).toBe(0);
  });

  it('올리는 사이 seconds 가 늘면 pending 을 해제하지 않는다', async () => {
    await addWritingSeconds(U, 'mac', '2026-11-29', 75);
    duringUpsert = () => addWritingSeconds(U, 'mac', '2026-11-29', 15);
    await pushWritingTime([U, '2026-11-29', 'mac']);
    const row = await db.writing_time.get([U, '2026-11-29', 'mac']);
    expect(row.seconds).toBe(90);
    expect(row.pending_sync).toBe(1);
  });
});
