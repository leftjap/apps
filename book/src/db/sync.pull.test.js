/**
 * pullTable — 로컬 미동기 변경(pending_sync=1) 보호.
 * 버그: pull 의 bulkPut 이 pending 행을 서버 옛값으로 덮어쓰면, 아직 push 안 된
 * 삭제(빈 톰스톤)·수정이 유실된다. (형광펜 삭제가 새로고침/재로그인 후 부활하는 원인.)
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = { serverRows: [] };
vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: () => {
      const q = {
        _eq: null,
        select() { return q; },
        eq(col, val) { q._eq = { col, val }; return q; },
        range(from, to) {
          let rows = state.serverRows;
          if (q._eq) rows = rows.filter((r) => r[q._eq.col] === q._eq.val);
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return q;
    },
  },
  isSupabaseConfigured: true,
}));

import { createBookDB } from './schema.js';
import { pullTable } from './sync.js';

const HL = { dexie: 'quote_highlights', supabase: 'book_quote_highlights', filterColumn: 'owner_id' };
const ME = '7bae5645-61c6-4476-9ff2-4c30a72812ff';
const Q = '11111111-2222-4333-8444-555555555555';

beforeEach(() => {
  state.serverRows = [];
  globalThis.bookDB = createBookDB('book_pull_test_' + Math.random().toString(36).slice(2, 10));
});

describe('pullTable — pending_sync 보호', () => {
  it('pending=1 톰스톤(삭제 의도)을 서버 옛값으로 덮어쓰지 않는다', async () => {
    // 로컬: 형광펜 삭제 톰스톤 (빈 marks, 아직 서버 미반영)
    await globalThis.bookDB.quote_highlights.put({ quote_id: Q, marks: [], owner_id: ME, updated_at: '2026-06-13T00:00:00.000Z', pending_sync: 1 });
    // 서버: 아직 옛 형광펜 보유 (삭제 push 가 안 닿음)
    state.serverRows = [{ quote_id: Q, marks: [{ s: 0, e: 5, c: 'y' }], owner_id: ME, updated_at: '2026-06-12T00:00:00.000Z' }];

    await pullTable(HL, globalThis.bookDB, ME);

    const row = await globalThis.bookDB.quote_highlights.get(Q);
    expect(row.marks.length).toBe(0);     // 톰스톤 보존 (부활 X)
    expect(row.pending_sync).toBe(1);     // flush 대상 유지 → 이후 서버 delete
  });

  it('pending=0 행은 서버값으로 정상 갱신(회귀 방지)', async () => {
    await globalThis.bookDB.quote_highlights.put({ quote_id: Q, marks: [{ s: 0, e: 1, c: 'y' }], owner_id: ME, updated_at: 'x', pending_sync: 0 });
    state.serverRows = [{ quote_id: Q, marks: [{ s: 0, e: 9, c: 'p' }], owner_id: ME, updated_at: 'new' }];

    await pullTable(HL, globalThis.bookDB, ME);

    const row = await globalThis.bookDB.quote_highlights.get(Q);
    expect(row.marks).toEqual([{ s: 0, e: 9, c: 'p' }]);   // 서버값 반영됨
  });
});
