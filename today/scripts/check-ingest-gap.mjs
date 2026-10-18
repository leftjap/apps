#!/usr/bin/env node
/** Private expense-ingest monitor. Default is read-only; --notify uses existing
 * Web Push subscriptions. Stdout/logs contain aggregate counts only because the
 * repository and Actions logs are public. Never emit emails, cards or raw rows.
 *
 * Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local on the Mac).
 * node scripts/check-ingest-gap.mjs [--notify] [--exit-on-gap]
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { detectIngestGaps } from '../src/services/expense-ingest-health.js';
import { notifyIngestGap } from './ingest-gap-alert.js';

const TARGET_EMAILS = ['leftjap@gmail.com', 'soyoun312@gmail.com'];

function loadEnvLocal() {
  const file = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

export async function loadExpenseEvidence(sb, ownerId) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.from('today_expenses')
      .select('id,card,source,sms_raw,spent_at,created_at,amount_krw,meta,deleted_at')
      // Tombstones still carry the owner's weekly alert marker. Health itself
      // excludes deleted payments, but throttling must retain deletion history.
      .eq('owner_id', ownerId)
      .order('id').range(offset, offset + 999);
    if (error) throw new Error('expenses_query_failed');
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

export async function checkIngestHealth({ sb, url, serviceKey, notify = false, now = new Date(), fetcher = fetch }) {
  const targets = [];
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error('users_query_failed');
    const users = data?.users || [];
    targets.push(...users.filter((user) => TARGET_EMAILS.includes(user.email)));
    if (targets.length === TARGET_EMAILS.length || users.length < 200) break;
  }
  if (targets.length !== TARGET_EMAILS.length) throw new Error('target_users_missing');
  const summary = { checkedAt: now.toISOString(), usersChecked: 0, affectedUsers: 0, affectedFamilies: 0, notifications: {} };
  for (const user of targets) {
    const rows = await loadExpenseEvidence(sb, user.id);
    const gaps = detectIngestGaps(rows, now);
    summary.usersChecked++;
    if (gaps.length) { summary.affectedUsers++; summary.affectedFamilies += gaps.length; }
    if (!notify || !gaps.length) continue;
    const result = await notifyIngestGap({
      rows, gaps, now,
      compareAndSwap: async (id, before, after) => {
        const { data, error } = await sb.from('today_expenses').update({ meta: after })
          // A concurrent delete must not prevent recording a delivered alert.
          // Only meta changes here; the row's tombstone remains untouched.
          .eq('id', id).eq('owner_id', user.id)
          .eq('meta', JSON.stringify(before)).select('id');
        if (error) throw new Error('alert_state_failed');
        return data?.length === 1;
      },
      send: async () => {
        const response = await fetcher(`${url.replace(/\/$/, '')}/functions/v1/send-push`, {
          method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'ingest_gap', recipient_id: user.id }),
        });
        if (!response.ok) throw new Error('push_request_failed');
        const result = await response.json();
        return { status: result.status, sent: Number(result.sent) || 0 };
      },
    });
    summary.notifications[result.status] = (summary.notifications[result.status] || 0) + 1;
  }
  return summary;
}

async function main() {
  loadEnvLocal();
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('missing_env');
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const result = await checkIngestHealth({ sb, url, serviceKey, notify: process.argv.includes('--notify') });
  console.log(JSON.stringify(result));
  const failed = Object.keys(result.notifications).some((status) => !['sent', 'throttled', 'contended'].includes(status));
  if (failed) process.exitCode = 1;
  else if (process.argv.includes('--exit-on-gap') && result.affectedUsers) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => { console.error('ingest_health_check_failed'); process.exitCode = 1; });
}
