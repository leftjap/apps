#!/usr/bin/env node
/**
 * seed-math.mjs — study_math_problems Supabase upsert ("오늘 수학" 자동화).
 * seed-supabase.mjs 미러. 사용:
 *   node scripts/seed-math.mjs --payload seeds/math-2026-05-22.json --user-id <uuid> [--dry-run]
 * env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (RLS 우회). 의존성 0 (Node 22 fetch).
 * payload: { date, problems:[{id,conceptId?,kind?,module,tag,lesson?,prompt,figure?,answer,accept?,solution,order_index?}] }
 */
import { readFileSync } from 'node:fs';
import { argv, env, exit } from 'node:process';

function parseArgs(args) {
  const out = { dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--payload') out.payload = args[++i];
    else if (a === '--user-id') out.userId = args[++i];
    else if (a === '--dry-run') out.dryRun = true;
  }
  if (!out.payload || !out.userId) { console.error('Usage: --payload <file> --user-id <uuid> [--dry-run]'); exit(1); }
  return out;
}

function validate(p) {
  if (!p || typeof p !== 'object') throw new Error('payload not object');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) throw new Error(`date must be YYYY-MM-DD: ${p.date}`);
  if (!Array.isArray(p.problems) || p.problems.length === 0) throw new Error('problems empty');
  if (p.problems.length > 50) throw new Error(`problems ${p.problems.length} > 50 cap`);
  for (const c of p.problems) {
    if (!c.id || !c.prompt || c.answer == null || !c.solution) {
      throw new Error(`missing field: ${JSON.stringify(c).slice(0, 80)}`);
    }
  }
  if (new Set(p.problems.map((c) => c.id)).size !== p.problems.length) throw new Error('duplicate ids');
}

async function rest(url, key, path, opts = {}) {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1${path}`, {
    ...opts,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${opts.method ?? 'GET'} ${path} → ${res.status}: ${text}`);
  return { text, headers: res.headers };
}

async function count(url, key, userId, date) {
  const { headers } = await rest(url, key, `/study_math_problems?select=id&user_id=eq.${userId}&date=eq.${date}`, {
    headers: { Prefer: 'count=exact', Range: '0-0' },
  });
  return parseInt((headers.get('content-range') ?? '0').split('/')[1] ?? '0', 10) || 0;
}

async function main() {
  const args = parseArgs(argv.slice(2));
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); exit(1); }
  const p = JSON.parse(readFileSync(args.payload, 'utf8'));
  validate(p);
  console.log(`[seed-math] date=${p.date} count=${p.problems.length} user=${args.userId} dryRun=${args.dryRun}`);
  console.log(`[seed-math] existing rows (user,date): ${await count(url, key, args.userId, p.date)}`);
  if (args.dryRun) { console.log('[seed-math] dry-run — INSERT skipped'); return; }
  const rows = p.problems.map((c) => ({
    id: c.id, user_id: args.userId, date: p.date, module: c.module ?? null, tag: c.tag ?? null,
    lesson: c.lesson ?? null, prompt: c.prompt, figure: c.figure ?? null, answer: String(c.answer),
    accept: c.accept ?? null, solution: c.solution,
    concept_id: c.concept_id ?? c.conceptId ?? null, kind: c.kind ?? 'apply',
    order_index: c.order_index ?? null, completed: false,
  }));
  const { text } = await rest(url, key, '/study_math_problems?on_conflict=id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(rows),
  });
  console.log(`[seed-math] upserted ${JSON.parse(text).length} rows`);
  const post = await count(url, key, args.userId, p.date);
  if (post < p.problems.length) throw new Error(`post-check mismatch: expected >=${p.problems.length}, got ${post}`);
  console.log('[seed-math] OK');
}

main().catch((e) => { console.error(`[seed-math] FAILED: ${e.message}`); exit(1); });
