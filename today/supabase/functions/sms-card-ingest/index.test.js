import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const state = { handler: null, db: null };
  globalThis.Deno = { env: { get: () => 'test-only' }, serve: (handler) => { state.handler = handler; } };
  return state;
});
vi.mock('https://esm.sh/@supabase/supabase-js@2.39.0', () => ({ createClient: () => state.db }));
import './index.ts';

// This in-memory boundary keeps real handler/planning logic; only remote storage is replaced.
function database(rows = []) {
  const db = { rows: structuredClone(rows), token: { owner_id: 'owner-a', last_used_at: null }, failRead: false, race: false };
  db.from = (table) => {
    const filters = [];
    let inserted, update, range;
    const query = {
      select: () => query,
      eq: (column, value) => { filters.push((row) => row[column] === value); return query; },
      order: () => query,
      range: (from, to) => { range = [from, to]; return query; },
      insert: (row) => { inserted = row; return query; },
      update: (row) => { update = row; return query; },
      maybeSingle: () => run(true),
      single: () => run(true),
      then: (resolve, reject) => run(false).then(resolve, reject),
    };
    async function run(single) {
      if (table === 'today_sms_ingest_tokens') {
        if (update) Object.assign(db.token, update);
        return { data: db.token, error: null };
      }
      if (table !== 'today_expenses') return { data: [], error: null };
      if (inserted) {
        if (db.race) {
          db.race = false;
          db.rows.push(structuredClone(inserted));
          return { data: null, error: { code: '23505' } };
        }
        if (db.rows.some((row) => row.id === inserted.id)) return { data: null, error: { code: '23505' } };
        db.rows.push(structuredClone(inserted));
        return { data: { id: inserted.id }, error: null };
      }
      if (db.failRead) return { data: null, error: { code: 'storage_unavailable', message: 'private database detail' } };
      let found = db.rows.filter((row) => filters.every((filter) => filter(row)));
      if (range) found = found.slice(range[0], range[1] + 1);
      return { data: single ? found[0] || null : found, error: null };
    }
    return query;
  };
  return db;
}

const text = '삼성1595승인 테*트\n8,200원 일시불\n10/01 12:34 테스트상점';
const request = (body) => new Request('https://example.test/sms-card-ingest', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ingest-Token': 'test-token' }, body: JSON.stringify(body) });
const body = { text, received_at: '2026-10-01T03:35:21Z' };
beforeEach(() => { state.db = database(); });

describe('SMS Edge Function boundary', () => {
  it('rejects malformed timestamps before changing health or inserting rows', async () => {
    const response = await state.handler(request({ ...body, received_at: 'tomorrow' }));
    expect(response.status).toBe(400);
    expect(state.db.token.last_used_at).toBeNull();
    expect(state.db.rows).toHaveLength(0);
  });

  it('keeps recovery from updating live phone health and records its channel', async () => {
    const response = await state.handler(request({ ...body, ingest_channel: 'backfill' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
    expect(state.db.token.last_used_at).toBeNull();
    expect(state.db.rows[0]).toMatchObject({ spent_at: '2026-10-01T03:34:00.000Z', meta: { ingest_channel: 'backfill' } });
  });

  it('accepts live shortcuts and deduplicates a later replay with different line endings', async () => {
    const first = await state.handler(request(body));
    const initial = await first.json();
    expect(initial.status).toBe('ok');
    expect(state.db.token.last_used_at).not.toBeNull();
    const second = await state.handler(request({ ...body, text: text.replace(/\n/g, '\r\n'), received_at: '2026-10-03T00:00:00Z' }));
    expect(await second.json()).toMatchObject({ status: 'duplicate', expense_id: initial.expense_id });
    expect(state.db.rows).toHaveLength(1);
  });

  it('preserves a deleted and manually changed legacy payment', async () => {
    const legacy = { id: 'legacy', owner_id: 'owner-a', sms_raw: text, spent_at: body.received_at, received_at: body.received_at, amount_krw: 9000, merchant: '수정된 이름', deleted_at: '2026-10-02T00:00:00Z' };
    state.db = database([legacy]);
    const response = await state.handler(request({ ...body, received_at: '2026-10-03T00:00:00Z' }));
    expect(await response.json()).toMatchObject({ status: 'duplicate', expense_id: 'legacy', deleted: true });
    expect(state.db.rows).toEqual([legacy]);
  });

  it('does not insert when legacy lookup fails and does not expose database details', async () => {
    state.db.failRead = true;
    const response = await state.handler(request(body));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('private database detail');
    expect(state.db.rows).toHaveLength(0);
  });

  it('persists an unmatched cancellation for review without subtracting money', async () => {
    const response = await state.handler(request({ ...body, text: text.replace('승인', '취소') }));
    expect(await response.json()).toMatchObject({ status: 'review', reason: 'original_not_found' });
    expect(state.db.rows[0].amount_krw).toBeNull();
  });

  it('rejects broad-trigger bank account noise without an expense row', async () => {
    const response = await state.handler(request({ ...body, text: '신한은행 입출금알림\n10/14 12:34\n입금 80,000원\n잔액 90,000원' }));
    expect(await response.json()).toMatchObject({ status: 'rejected', reason: 'non_payment' });
    expect(state.db.rows).toHaveLength(0);
  });

  it('finds a tombstone beyond the first storage page', async () => {
    const filler = Array.from({ length: 1000 }, (_, index) => ({ id: `other-${index}`, owner_id: 'owner-a', spent_at: body.received_at, source: 'manual', amount_krw: 100 }));
    const legacy = { id: 'legacy-last-page', owner_id: 'owner-a', sms_raw: text, spent_at: body.received_at, received_at: body.received_at, amount_krw: 8200, deleted_at: body.received_at };
    state.db = database([...filler, legacy]);
    const response = await state.handler(request(body));
    expect(await response.json()).toMatchObject({ status: 'duplicate', expense_id: 'legacy-last-page', deleted: true });
    expect(state.db.rows).toHaveLength(1001);
  });

  it('returns the actual stored ID after a concurrent insert wins', async () => {
    state.db.race = true;
    const response = await state.handler(request(body));
    expect(await response.json()).toMatchObject({ status: 'duplicate', expense_id: state.db.rows[0].id });
    expect(state.db.rows).toHaveLength(1);
  });
});
