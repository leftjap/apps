#!/usr/bin/env node
/**
 * Supabase 실제 row count + 샘플 검증.
 * 사용: SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/verify-import.js
 *
 * pagination 으로 1000-row default truncation 회피 (lesson supabase-select-default-1000-limit).
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.VITE_SUPABASE_URL || (() => {
  const env = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
  return env.match(/VITE_SUPABASE_URL=(\S+)/)?.[1];
})();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) { console.error('SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }

const supa = createClient(url, key, { auth: { persistSession: false } });

async function countByOwner(table) {
  const { data: users } = await supa.auth.admin.listUsers({ perPage: 200 });
  const targetEmails = ['leftjap@gmail.com', 'soyoun312@gmail.com'];
  const owners = (users.users || []).filter(u => targetEmails.includes(u.email));
  const result = {};
  for (const u of owners) {
    let total = 0;
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error, count } = await supa
        .from(table)
        .select('id', { count: 'exact' })
        .eq('owner_id', u.id)
        .is('deleted_at', null)
        .range(from, from + PAGE - 1);
      if (error) { console.error(error); break; }
      total = count;
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    result[u.email] = total;
  }
  return result;
}

async function sampleRows(table, ownerEmail, limit, orderCol) {
  const { data: users } = await supa.auth.admin.listUsers({ perPage: 200 });
  const u = (users.users || []).find(x => x.email === ownerEmail);
  if (!u) return [];
  const { data } = await supa.from(table).select('*').eq('owner_id', u.id)
    .is('deleted_at', null).order(orderCol, { ascending: false }).limit(limit);
  return data || [];
}

async function entryKindBreakdown() {
  const { data: users } = await supa.auth.admin.listUsers({ perPage: 200 });
  const result = {};
  for (const email of ['leftjap@gmail.com', 'soyoun312@gmail.com']) {
    const u = (users.users || []).find(x => x.email === email);
    if (!u) continue;
    const { data } = await supa.from('today_entries').select('kind, meta')
      .eq('owner_id', u.id).is('deleted_at', null);
    const byKind = {};
    let importTagged = 0;
    for (const r of data || []) {
      byKind[r.kind] = (byKind[r.kind] || 0) + 1;
      if (r.meta && (r.meta.keepImportSrc || r.meta.keepImportSrcId)) importTagged++;
    }
    result[email] = { total: data?.length || 0, byKind, importTagged };
  }
  return result;
}

async function expenseMonthSums() {
  const { data: users } = await supa.auth.admin.listUsers({ perPage: 200 });
  const result = {};
  for (const email of ['leftjap@gmail.com', 'soyoun312@gmail.com']) {
    const u = (users.users || []).find(x => x.email === email);
    if (!u) continue;
    const start = '2026-05-01T00:00:00+09:00';
    const end = '2026-06-01T00:00:00+09:00';
    let from = 0; const PAGE = 1000;
    let rows = [];
    while (true) {
      const { data, error } = await supa.from('today_expenses')
        .select('id, spent_at, amount_krw, merchant, category')
        .eq('owner_id', u.id).is('deleted_at', null)
        .gte('spent_at', start).lt('spent_at', end)
        .range(from, from + PAGE - 1);
      if (error) { console.error(error); break; }
      rows = rows.concat(data || []);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    const total = rows.reduce((a, r) => a + (r.amount_krw || 0), 0);
    result[email] = { count: rows.length, totalKrw: total, rows: rows.slice(0, 5) };
  }
  return result;
}

(async () => {
  console.log('=== row count by owner (deleted_at is null) ===');
  console.log('today_entries:', await countByOwner('today_entries'));
  console.log('today_expenses:', await countByOwner('today_expenses'));
  console.log('\n=== entry kind breakdown ===');
  console.log(JSON.stringify(await entryKindBreakdown(), null, 2));
  console.log('\n=== leftjap latest 3 entries ===');
  const e1 = await sampleRows('today_entries', 'leftjap@gmail.com', 3, 'updated_at');
  for (const r of e1) console.log(`  ${r.updated_at} kind=${r.kind} title=${JSON.stringify(r.title)}`);
  console.log('\n=== soyoun latest 3 entries ===');
  const e2 = await sampleRows('today_entries', 'soyoun312@gmail.com', 3, 'updated_at');
  for (const r of e2) console.log(`  ${r.updated_at} kind=${r.kind} title=${JSON.stringify(r.title)}`);
  console.log('\n=== May 2026 expense sums ===');
  console.log(JSON.stringify(await expenseMonthSums(), null, 2));
})();
