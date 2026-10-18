import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

const state = vi.hoisted(() => ({ row: null, readError: null, race: false }));
vi.mock('../services/supabase.js', () => ({
  supabase: { from: () => {
    let mode, payload, expected;
    const q = {
      select: () => q,
      eq: (key, value) => { if (key === 'meta') expected = value; return q; },
      maybeSingle: async () => ({ data: structuredClone(state.row), error: state.readError }),
      upsert: async (value) => { state.row = structuredClone(value); return { error: null }; },
      insert: async (value) => { state.row = structuredClone(value); return { error: null }; },
      update: (value) => { mode = 'update'; payload = value; return q; },
      then: (resolve) => {
        if (state.race) {
          state.race = false;
          state.row.meta = { ...state.row.meta, ingest_gap_alert: { slot: 'new-week', state: 'sent' } };
        }
        const before = typeof expected === 'string' ? JSON.parse(expected) : expected;
        if (mode === 'update' && JSON.stringify(before) === JSON.stringify(state.row.meta)) {
          state.row = structuredClone(payload);
          resolve({ data: [{ id: payload.id }], error: null });
        } else resolve({ data: [], error: null });
      },
    };
    return q;
  } },
}));
const { pushExpense } = await import('./sync.js');
const id = '11111111-1111-4111-8111-111111111111';

describe('expense edits preserve server ingest metadata', () => {
  let local;
  beforeEach(() => {
    state.readError = null;
    state.race = false;
    state.row = { id, owner_id: 'owner', memo: 'before', meta: { ingest_channel: 'backfill', ingest_gap_alert: { slot: 'week', state: 'sent' } } };
    local = { id, owner_id: 'owner', memo: 'edited offline', meta: {}, pending_sync: 1 };
    globalThis.todayDB = { expenses: { get: async () => local, put: async (value) => { local = value; } } };
  });
  afterEach(() => { delete globalThis.todayDB; });

  it('uploads the user edit without erasing private-alert or backfill evidence', async () => {
    const result = await pushExpense(id);
    expect(result.status).toBe('ok');
    expect(state.row.memo).toBe('edited offline');
    expect(state.row.meta.ingest_gap_alert).toEqual({ slot: 'week', state: 'sent' });
    expect(state.row.meta.ingest_channel).toBe('backfill');
    expect(local.meta).toEqual(state.row.meta);
  });

  it('retries if the monitor claims an alert between the read and the edit', async () => {
    state.race = true;
    const result = await pushExpense(id);
    expect(result.status).toBe('ok');
    expect(state.row.memo).toBe('edited offline');
    expect(state.row.meta.ingest_gap_alert).toEqual({ slot: 'new-week', state: 'sent' });
  });

  it('keeps the local edit pending when server metadata cannot be read', async () => {
    state.readError = { message: 'offline' };
    const result = await pushExpense(id);
    expect(result.status).toBe('error');
    expect(state.row.memo).toBe('before');
    expect(local.pending_sync).toBe(1);
  });
});
