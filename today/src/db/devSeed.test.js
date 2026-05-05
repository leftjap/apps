/**
 * devSeed.cleanupDevFixtures 단위 테스트 (2026-05-03).
 * 환경: vitest (node) + fake-indexeddb 폴리필.
 *
 * 범위:
 *   - cleanupDevFixtures 멱등성 (반복 호출 안전)
 *   - fixture id 만 hard-delete (사용자 entry/expense 보존)
 *   - DB 미설정 시 graceful return
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTodayDB } from './schema.js';
import { createEntry, createExpense, listEntries, listExpensesByMonth } from './queries.js';
import {
  cleanupDevFixtures,
  ENTRY_FIXTURE_IDS,
  EXPENSE_FIXTURE_IDS,
} from './devSeed.js';

const OWNER = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
  const dbName = 'today_test_' + Math.random().toString(36).slice(2, 10);
  globalThis.todayDB = createTodayDB(dbName);
});

afterEach(async () => {
  if (globalThis.todayDB) {
    await globalThis.todayDB.delete();
    globalThis.todayDB = null;
  }
});

describe('cleanupDevFixtures', () => {
  it('DB 미설정 시 { ok: false }', async () => {
    const prev = globalThis.todayDB;
    globalThis.todayDB = null;
    const r = await cleanupDevFixtures();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_db');
    globalThis.todayDB = prev;
  });

  it('빈 DB 호출 시 0 건 제거 (멱등)', async () => {
    const r = await cleanupDevFixtures();
    expect(r.ok).toBe(true);
    expect(r.entriesRemoved).toBe(0);
    expect(r.expensesRemoved).toBe(0);
  });

  it('fixture id 가 있으면 hard-delete', async () => {
    // entry-fixture-navi-1 + tx-01 한 건씩 직접 삽입
    await globalThis.todayDB.entries.put({
      id: 'entry-fixture-navi-1',
      owner_id: OWNER,
      kind: 'navi',
      title: '시드 더미',
      content: '<p>더미</p>',
      is_shared: 0,
      pinned: 0,
      meta: {},
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
      deleted_at: null,
    });
    await globalThis.todayDB.expenses.put({
      id: 'tx-01',
      owner_id: OWNER,
      spent_at: '2026-05-01T12:00:00.000Z',
      amount_krw: 25000,
      merchant: 'GS25',
      category: '편의점',
      source: 'manual',
      meta: {},
      created_at: '2026-05-01T12:00:00.000Z',
      updated_at: '2026-05-01T12:00:00.000Z',
      deleted_at: null,
    });

    const r = await cleanupDevFixtures();
    expect(r.ok).toBe(true);
    expect(r.entriesRemoved).toBe(1);
    expect(r.expensesRemoved).toBe(1);

    // hard-delete 확인 — get 결과 undefined
    expect(await globalThis.todayDB.entries.get('entry-fixture-navi-1')).toBeUndefined();
    expect(await globalThis.todayDB.expenses.get('tx-01')).toBeUndefined();
  });

  it('두 번째 호출은 노옵 (멱등)', async () => {
    await globalThis.todayDB.entries.put({
      id: 'entry-fixture-memo-1', owner_id: OWNER, kind: 'memo',
      title: 'x', content: 'x', is_shared: 0, pinned: 0, meta: {},
      created_at: '2026-04-01T00:00:00.000Z', updated_at: '2026-04-01T00:00:00.000Z', deleted_at: null,
    });
    const r1 = await cleanupDevFixtures();
    expect(r1.entriesRemoved).toBe(1);
    const r2 = await cleanupDevFixtures();
    expect(r2.entriesRemoved).toBe(0);
    expect(r2.expensesRemoved).toBe(0);
  });

  it('사용자 실 entry/expense 는 절대 건드리지 않는다', async () => {
    const userEntry = await createEntry({
      owner_id: OWNER, kind: 'navi', title: '사용자 글', content: '<p>실 데이터</p>',
    });
    const userExpense = await createExpense({
      owner_id: OWNER, spent_at: '2026-05-02T12:00:00.000Z',
      amount_krw: 16900, merchant: '사용자 가맹점', category: '외식', source: 'manual',
    });

    // fixture row 도 1건 삽입 (cleanup 대상)
    await globalThis.todayDB.entries.put({
      id: 'entry-fixture-blog-1', owner_id: OWNER, kind: 'blog',
      title: '시드', content: '시드', is_shared: 0, pinned: 0, meta: {},
      created_at: '2026-04-01T00:00:00.000Z', updated_at: '2026-04-01T00:00:00.000Z', deleted_at: null,
    });
    await globalThis.todayDB.expenses.put({
      id: 'tx-05', owner_id: OWNER, spent_at: '2026-05-10T12:00:00.000Z',
      amount_krw: 4500, merchant: '지하철', category: '교통', source: 'manual', meta: {},
      created_at: '2026-05-10T12:00:00.000Z', updated_at: '2026-05-10T12:00:00.000Z', deleted_at: null,
    });

    const r = await cleanupDevFixtures();
    expect(r.entriesRemoved).toBe(1);
    expect(r.expensesRemoved).toBe(1);

    // 사용자 데이터 보존 확인
    const remainingEntries = await listEntries('navi');
    expect(remainingEntries.find((e) => e.id === userEntry.id)).toBeDefined();
    const remainingExpenses = await listExpensesByMonth(2026, 5);
    expect(remainingExpenses.find((e) => e.id === userExpense.id)).toBeDefined();
  });

  it('ENTRY_FIXTURE_IDS 와 EXPENSE_FIXTURE_IDS 는 전부 deterministic prefix', () => {
    for (const id of ENTRY_FIXTURE_IDS) {
      expect(id.startsWith('entry-fixture-')).toBe(true);
    }
    for (const id of EXPENSE_FIXTURE_IDS) {
      expect(id.startsWith('tx-')).toBe(true);
    }
    // 카운트 검증 (devSeed 명세 — entries 10 + expenses 23, splits 포함: tx-06a/b/c/d, tx-10a/b/c, tx-16a/b)
    expect(ENTRY_FIXTURE_IDS.length).toBe(10);
    expect(EXPENSE_FIXTURE_IDS.length).toBe(23);
  });
});
