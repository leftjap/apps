import { describe, it, expect } from 'vitest';
import { notifyIngestGap } from './ingest-gap-alert.js';

const now = new Date('2026-10-18T00:00:00Z');
function store({ subscribers = 1, fail = false } = {}) {
  const evidence = { id: 'proof', meta: { sms_kind: 'approval', keep: { x: 1 } } };
  let sent = 0;
  return {
    rows: [evidence], gaps: [{ evidenceId: 'proof' }], now,
    compareAndSwap: async (id, before, after) => {
      if (id !== evidence.id || JSON.stringify(evidence.meta) !== JSON.stringify(before)) return false;
      evidence.meta = structuredClone(after); return true;
    },
    send: async () => { if (fail) throw new Error('sensitive upstream failure'); sent += subscribers; return { status: subscribers ? 'ok' : 'no_subscribers', sent: subscribers }; },
    evidence, count: () => sent,
  };
}
describe('private alert delivery and persisted throttling', () => {
  it('persists a successful weekly warning and does not send again on a repeated run', async () => {
    const io = store();
    expect(await notifyIngestGap(io)).toMatchObject({ status: 'sent', sent: 1 });
    expect(io.evidence.meta).toMatchObject({ sms_kind: 'approval', keep: { x: 1 }, ingest_gap_alert: { state: 'sent', week: '2026-10-12' } });
    expect(await notifyIngestGap(io)).toEqual({ status: 'throttled' });
    expect(io.count()).toBe(1);
  });
  it('does not claim that no subscribers were notified, preserving metadata for a later retry', async () => {
    const io = store({ subscribers: 0 });
    expect(await notifyIngestGap(io)).toEqual({ status: 'no_subscribers', sent: 0 });
    expect(io.evidence.meta).toEqual({ sms_kind: 'approval', keep: { x: 1 } });
  });
  it('releases a failed delivery claim without printing upstream details', async () => {
    const io = store({ fail: true });
    expect(await notifyIngestGap(io)).toEqual({ status: 'delivery_failed', sent: 0 });
    expect(io.evidence.meta.ingest_gap_alert).toBeUndefined();
  });
  it('does not deliver if another runner won the atomic metadata claim', async () => {
    const io = store(); io.compareAndSwap = async () => false;
    expect(await notifyIngestGap(io)).toEqual({ status: 'contended' });
    expect(io.count()).toBe(0);
  });
});
