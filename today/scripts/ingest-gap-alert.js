import { planIngestGapAlert } from '../src/services/expense-ingest-health.js';

/** Claim before delivery so overlapping runners cannot notify twice. All database
 * writes use full-meta equality and preserve the evidence row's other fields.
 * No raw SMS, card data, subscription keys or upstream errors leave this helper.
 */
export async function notifyIngestGap({ rows, gaps, now, compareAndSwap, send }) {
  const plan = planIngestGapAlert(rows, gaps, now);
  if (plan.status !== 'claim') return { status: plan.status };
  if (!await compareAndSwap(plan.id, plan.before, plan.after)) return { status: 'contended' };
  let result;
  try {
    result = await send();
  } catch {
    result = { status: 'delivery_failed', sent: 0 };
  }
  if (!(result?.sent > 0)) {
    const released = await compareAndSwap(plan.id, plan.after, plan.before);
    return { status: released ? (result?.status === 'no_subscribers' ? 'no_subscribers' : 'delivery_failed') : 'release_conflict', sent: 0 };
  }
  const after = { ...plan.after, ingest_gap_alert: { ...plan.after.ingest_gap_alert, state: 'sent' } };
  const saved = await compareAndSwap(plan.id, plan.after, after);
  // Keep in-memory state consistent for a same-process rerun.
  if (saved) {
    const row = rows.find((row) => row.id === plan.id);
    if (row) row.meta = after;
  }
  return { status: !saved ? 'sent_state_conflict' : result.status === 'partial' ? 'partial' : 'sent', sent: result.sent };
}
