#!/usr/bin/env node
/**
 * 작품별 갈래 백필 — ★threshold+ 평가작 중 아직 갈래 없는 작품에 branch 요청을 큐잉.
 * 데몬(taste-reco-daemon)이 직렬로 1개씩 생성한다(작품당 ~3분). idempotent:
 * 이미 갈래 있는 작품은 건너뜀 → 데몬 재시작으로 큐가 비어도 다시 실행하면 남은 것만 이어감.
 *
 * 사용:  node scripts/backfill-branches.mjs [threshold] [limit]
 *   threshold  최소 별점 (기본 4.5 = 최애). 예: 3.0 = 전체.
 *   limit      이번에 큐잉할 최대 작품 수 (기본 무제한).
 * env: ~/.config/study/.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
 *
 * ⚠ 비용/시간: 작품당 ~3분 직렬. ★4.5(211개)≈12시간, ★3.0(771개)≈45시간 + 구독 rate limit.
 *   부담되면 threshold 를 높게(최애부터) 또는 limit 로 나눠 실행 권장.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OWNER = process.env.TASTE_OWNER_ID || '7bae5645-61c6-4476-9ff2-4c30a72812ff';
const THRESHOLD = Number(process.argv[2]) || 4.5;
const LIMIT = process.argv[3] ? Number(process.argv[3]) : Infinity;

function loadEnv(p) {
  const e = {};
  if (!fs.existsSync(p)) return e;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return e;
}
const env = loadEnv(path.join(os.homedir(), '.config/study/.env'));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const key = (t, y) => `${t}|${y ?? ''}`;

async function readAll(table, cols, filt) {
  let from = 0; const all = [];
  for (;;) {
    let q = sb.from(table).select(cols).range(from, from + 999);
    if (filt) q = filt(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return all;
}

const ratings = await readAll('taste_ratings', 'title,year,rating,deleted_at', (q) => q.eq('owner_id', OWNER));
const recos = await readAll('taste_recommendations', 'kind,source_work', (q) => q.eq('owner_id', OWNER).eq('kind', 'branch'));
const pendingReq = await readAll('taste_reco_requests', 'kind,source_work', (q) => q.eq('owner_id', OWNER).eq('kind', 'branch'));

const haveBranch = new Set(recos.map((r) => r.source_work));
const queued = new Set(pendingReq.map((r) => r.source_work));
const targets = ratings
  .filter((r) => !r.deleted_at && Number(r.rating) >= THRESHOLD)
  .map((r) => key(r.title, r.year))
  .filter((k, i, a) => a.indexOf(k) === i)        // distinct
  .filter((k) => !haveBranch.has(k) && !queued.has(k));

const todo = Number.isFinite(LIMIT) ? targets.slice(0, LIMIT) : targets;
console.log(`★${THRESHOLD}+ 갈래 없는 작품: ${targets.length}개. 이번에 큐잉: ${todo.length}개 (작품당 ~3분 직렬).`);
if (!todo.length) { console.log('큐잉할 것 없음 — 모두 생성됨/대기중.'); process.exit(0); }

const rows = todo.map((sw) => ({ owner_id: OWNER, source: 'backfill', kind: 'branch', source_work: sw }));
for (let i = 0; i < rows.length; i += 200) {
  const { error } = await sb.from('taste_reco_requests').insert(rows.slice(i, i + 200));
  if (error) { console.error('insert err:', error.message); process.exit(1); }
}
console.log(`큐잉 완료: ${rows.length}개. 데몬이 순차 생성. 진행: tail -f ~/.local/state/taste-reco-daemon/stdout.log`);
console.log('재시작으로 큐 유실 시 이 스크립트 재실행하면 남은 것만 이어감(idempotent).');
