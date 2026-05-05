/**
 * pullTable pagination 회귀 테스트.
 * Supabase REST default 1000-row truncation 회피 검증
 * (lesson `~/apps/lessons/supabase-select-default-1000-limit.md`).
 *
 * 회귀 트리거: soyoun 1586 expenses 가 sync 후 Dexie 에 1000건만 들어가는 결함.
 */
import { describe, it, expect, vi } from 'vitest';

// supabase 클라이언트 모킹 — chain query builder 흉내. range(from, to) 호출 시 페이지 슬라이스.
const TOTAL_ROWS = 1586;
const ALL_ROWS = Array.from({ length: TOTAL_ROWS }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  owner_id: 'u1',
  is_shared: false,
  pinned: false,
  amount_krw: i,
}));

let lastFilter = null;

function mockClient() {
  function builder() {
    const state = { from: 0, to: 999 };
    const obj = {
      select() { return obj; },
      eq(col, val) { lastFilter = { col, val }; return obj; },
      range(from, to) { state.from = from; state.to = to; return obj; },
      then(resolve) {
        const slice = ALL_ROWS.slice(state.from, state.to + 1);
        resolve({ data: slice, error: null });
      },
    };
    return obj;
  }
  return { from: () => builder() };
}

vi.mock('../services/supabase.js', () => ({
  supabase: mockClient(),
  isSupabaseConfigured: true,
}));

const { pullTable, TABLE_MAP } = await import('./sync.js');

describe('pullTable pagination — 1000-row truncation 회피', () => {
  it('1586 rows 전부 다운로드 (2 페이지)', async () => {
    const puts = [];
    const fakeDb = {
      expenses: {
        bulkPut: async (rows) => { puts.push(...rows); return rows.length; },
      },
    };
    const expensesMapping = TABLE_MAP.find((m) => m.dexie === 'expenses');
    const result = await pullTable(expensesMapping, fakeDb, 'u1');
    expect(result.status).toBe('ok');
    expect(result.count).toBe(TOTAL_ROWS);
    expect(puts.length).toBe(TOTAL_ROWS);
    // owner_id 필터 적용 검증
    expect(lastFilter).toEqual({ col: 'owner_id', val: 'u1' });
  });
});
