import { describe, it, expect } from 'vitest';
import { loadExpenseEvidence, checkIngestHealth } from './check-ingest-gap.mjs';
import { detectIngestGaps, planIngestGapAlert } from '../src/services/expense-ingest-health.js';

// Supabase boundary double applies the actual filters and page bounds emitted by
// loadExpenseEvidence, so losing a deleted marker changes the observable result.
function evidenceStore(rows) {
  return { from() {
    let filtered = rows;
    let patch = null;
    const query = {
      select() { return query; },
      eq(key, value) { filtered = filtered.filter((row) => key === 'meta' ? JSON.stringify(row.meta) === value : row[key] === value); return query; },
      update(value) { patch = value; return query; },
      is(key, value) { filtered = filtered.filter((row) => (row[key] ?? null) === value); return query; },
      order() { filtered = [...filtered].sort((a, b) => a.id.localeCompare(b.id)); return query; },
      async range(from, to) { return { data: structuredClone(filtered.slice(from, to + 1)), error: null }; },
      then(resolve, reject) {
        for (const row of filtered) Object.assign(row, structuredClone(patch));
        return Promise.resolve({ data: filtered.map((row) => ({ id: row.id })), error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
}

const now = new Date('2026-10-18T00:00:00.000Z');
const payment = (id) => ({ id, owner_id: 'owner', card: '삼성1595', amount_krw: 1000, source: 'sms', sms_raw: 'synthetic', spent_at: '2026-10-01T00:00:00.000Z', created_at: '2026-10-01T00:00:00.000Z', meta: {}, deleted_at: null });

describe('monitor evidence includes deletion history for private alert throttling', () => {
  it('deleting the alert evidence cannot cause a repeated warning in the same week', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => payment(`active-${i}`));
    rows.push({ ...payment('deleted-alert'), spent_at: '2026-10-17T00:00:00.000Z', created_at: '2026-10-17T00:00:00.000Z', deleted_at: '2026-10-17T12:00:00.000Z', meta: { ingest_gap_alert: { week: '2026-10-12', state: 'sent' } } });
    const loaded = await loadExpenseEvidence(evidenceStore(rows), 'owner');
    const gaps = detectIngestGaps(loaded, now);
    expect(gaps).toMatchObject([{ lastAutoAt: '2026-10-01T00:00:00.000Z' }]);
    expect(planIngestGapAlert(loaded, gaps, now)).toEqual({ status: 'throttled' });
  });

  it('reads tombstone markers after the first server page without including another owner', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => payment(`a-${String(i).padStart(4, '0')}`));
    rows.push({ ...payment('z-alert'), deleted_at: '2026-10-17T12:00:00.000Z', meta: { ingest_gap_alert: { week: '2026-10-12', state: 'sent' } } });
    rows.push({ ...payment('z-other-owner'), owner_id: 'another' });
    const loaded = await loadExpenseEvidence(evidenceStore(rows), 'owner');
    expect(loaded).toHaveLength(1001);
    expect(loaded.some((row) => row.id === 'z-alert')).toBe(true);
  });

  it('finalizes a partly delivered warning if its evidence was deleted during transport', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => payment(`active-${i}`));
    const sb = evidenceStore(rows);
    sb.auth = { admin: { listUsers: async () => ({ data: { users: [
      { id: 'owner', email: 'leftjap@gmail.com' }, { id: 'empty', email: 'soyoun312@gmail.com' },
    ] }, error: null }) } };
    const result = await checkIngestHealth({ sb, url: 'https://example.test', serviceKey: 'synthetic-key', notify: true, now,
      fetcher: async () => {
        rows[0].deleted_at = '2026-10-18T00:00:01.000Z';
        return { ok: true, json: async () => ({ status: 'partial', sent: 1, failed: 1 }) };
      },
    });
    expect(result.notifications).toEqual({ partial: 1 });
    expect(rows[0].deleted_at).toBe('2026-10-18T00:00:01.000Z');
    expect(rows[0].meta.ingest_gap_alert.state).toBe('sent');
    const next = await loadExpenseEvidence(sb, 'owner');
    expect(planIngestGapAlert(next, detectIngestGaps(next, now), now)).toEqual({ status: 'throttled' });
  });

});
