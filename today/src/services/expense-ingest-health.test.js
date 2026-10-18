import { describe, it, expect } from 'vitest';
import { detectIngestGaps, liveIngestAt } from './expense-ingest-health.js';

const now = new Date('2026-10-18T00:00:00.000Z');
const row = (card, spent, extra = {}) => ({ id: 'proof', card, amount_krw: 1000, source: 'sms', sms_raw: 'synthetic payment', spent_at: spent, created_at: spent, meta: {}, ...extra });

describe('ingest health provenance and aging', () => {
  it('known regular family remains visible when a 90-day query would lose all evidence', () => {
    const rows = Array.from({ length: 12 }, () => row('삼성1337', '2026-06-01T00:00:00.000Z'));
    expect(detectIngestGaps(rows, now)).toMatchObject([{ family: 'samsung_gio', daysSince: 139 }]);
  });
  it('an occasional card and an unknown retired family are not treated as ongoing automatic channels', () => {
    const rows = [row('신한카드 Air', '2026-06-01T00:00:00.000Z'),
      ...Array.from({ length: 12 }, () => row('사용종료 카드', '2026-06-01T00:00:00.000Z'))];
    expect(detectIngestGaps(rows, now)).toEqual([]);
  });
  it('manual cash and Samsung Soyeon stay excluded even if pasted as sms', () => {
    const rows = ['현금', '삼성카드 iD SIMPLE', 'samsung_soyeon'].flatMap((card) => Array.from({ length: 12 }, () => row(card, '2026-10-01T00:00:00.000Z')));
    expect(detectIngestGaps(rows, now)).toEqual([]);
  });
  it('does not allow missing timestamps, future dates, tombstones, or noise to establish live health', () => {
    expect(liveIngestAt(row('삼성1595', '2026-10-01T00:00:00Z', { created_at: null }))).toBe(null);
    const rows = Array.from({ length: 12 }, () => row('삼성1595', '2026-10-01T00:00:00.000Z', { amount_krw: null, meta: { sms_kind: 'unparsed' } }));
    rows.push(null, {}, row('삼성1595', 'nonsense'), row('삼성1595', '2027-01-01T00:00:00Z'), row('삼성1595', '2026-10-01T00:00:00Z', { deleted_at: '2026-10-02T00:00:00Z' }));
    expect(detectIngestGaps(rows, now)).toEqual([]);
  });
  it('a manual metadata update cannot reset old live health', () => {
    const r = row('삼성1595', '2026-10-01T00:00:00.000Z', { updated_at: '2026-10-18T00:00:00.000Z', meta: { ingest_channel: 'live', ingested_at: '2026-10-01T00:00:00.000Z' } });
    expect(liveIngestAt(r)).toBe('2026-10-01T00:00:00.000Z');
  });
});

import * as health from './expense-ingest-health.js';
describe('weekly alert claim', () => {
  const gaps = [{ evidenceId: 'proof' }];
  it('a successful alert on any family suppresses repeats for the same owner and week', () => {
    expect(health.planIngestGapAlert).toBeTypeOf('function');
    const rows = [row('삼성1595', '2026-10-01T00:00:00Z', { meta: { sms_kind: 'approval', ingest_gap_alert: { week: '2026-10-12', state: 'sent' } } })];
    expect(health.planIngestGapAlert(rows, gaps, now)).toEqual({ status: 'throttled' });
  });
  it('preserves all existing metadata when claiming an alert and permits the next KST week', () => {
    expect(health.planIngestGapAlert).toBeTypeOf('function');
    const r = row('삼성1595', '2026-10-01T00:00:00Z', { meta: { sms_kind: 'approval', other: 'preserve' } });
    const result = health.planIngestGapAlert([r], gaps, now);
    expect(result).toMatchObject({ status: 'claim', id: 'proof', before: { sms_kind: 'approval', other: 'preserve' }, after: { sms_kind: 'approval', other: 'preserve', ingest_gap_alert: { week: '2026-10-12', state: 'pending', claimed_at: '2026-10-18T00:00:00.000Z' } } });
    const sent = { ...r, meta: { ...result.after, ingest_gap_alert: { ...result.after.ingest_gap_alert, state: 'sent' } } };
    expect(health.planIngestGapAlert([sent], gaps, new Date('2026-10-18T15:00:00.000Z')).status).toBe('claim'); // Monday 00:00 KST
  });
  it('an in-flight claim prevents races but a crashed old claim is retryable', () => {
    expect(health.planIngestGapAlert).toBeTypeOf('function');
    const r = row('삼성1595', '2026-10-01T00:00:00Z', { meta: { ingest_gap_alert: { week: '2026-10-12', state: 'pending', claimed_at: '2026-10-17T23:45:00.000Z' } } });
    expect(health.planIngestGapAlert([r], gaps, now).status).toBe('throttled');
    expect(health.planIngestGapAlert([r], gaps, new Date('2026-10-18T02:00:00.000Z')).status).toBe('claim');
    expect(health.planIngestGapAlert([r], [], now).status).toBe('healthy');
  });
});

it('malformed metadata cannot establish live health or be overwritten by an alert marker', () => {
  const r = row('삼성1595', '2026-10-01T00:00:00Z', { meta: ['unexpected'] });
  expect(liveIngestAt(r)).toBe(null);
  expect(health.planIngestGapAlert([r], [{ evidenceId: 'proof' }], now)).toEqual({ status: 'missing_evidence' });
});
