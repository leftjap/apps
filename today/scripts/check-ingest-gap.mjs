#!/usr/bin/env node
/**
 * 카드 자동수집 끊김 점검 (서버/cron 전용) — 소연 화면 배너 대체.
 *
 * service_role 로 지오·소연 양쪽 today_expenses 를 직접 조회(RLS bypass)해
 * "주력 카드인데 자동수집이 끊긴" 카드를 찾는다. 클라이언트 detectIngestGapCards
 * (src/features/expenses.js) 와 동일 판정 — 단 Dexie 대신 Supabase REST.
 *
 * 판정 (expenses.js 와 동기):
 *   - 주력 카드: 최근 LOOKBACK 일 전체 거래 ≥ DOMINANT
 *   - 자동수집 가능: today 자동수집(source='sms' && sms_raw) 이력 ≥ 1 (삼성 카톡 등 오탐 방지)
 *   - 끊김: 자동수집 마지막 spent_at < (now - THRESHOLD_DAYS)
 *
 * 사용:
 *   node scripts/check-ingest-gap.mjs            # 양쪽 점검 → JSON stdout
 *   node scripts/check-ingest-gap.mjs --exit-on-gap   # gap 있으면 exit 2 (CI 분기용)
 *
 * env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   (로컬: .env.local / CI: repo secret)
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const THRESHOLD_DAYS = 7;
const DOMINANT_COUNT = 10;
const LOOKBACK_DAYS = 90;
const TARGET_EMAILS = ['leftjap@gmail.com', 'soyoun312@gmail.com'];

// .env.local 로더 (로컬 실행용 — CI 는 env 주입)
function loadEnvLocal() {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
loadEnvLocal();

const URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_KEY) {
  console.error('env 누락: VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

/** 카드별 집계 → gap 카드 리스트 (expenses.js detectIngestGapCards 와 동일 판정). */
function detectGaps(rows, now) {
  const cutoff = new Date(now.getTime() - THRESHOLD_DAYS * 86400000).toISOString();
  const byCard = new Map();
  for (const r of rows) {
    if (!r.card) continue;
    const e = byCard.get(r.card) || { card: r.card, txCount: 0, autoCount: 0, lastAutoAt: '' };
    e.txCount++;
    if (r.source === 'sms' && r.sms_raw) {
      e.autoCount++;
      if ((r.spent_at || '') > e.lastAutoAt) e.lastAutoAt = r.spent_at;
    }
    byCard.set(r.card, e);
  }
  const gaps = [];
  for (const e of byCard.values()) {
    if (e.txCount >= DOMINANT_COUNT && e.autoCount >= 1 && e.lastAutoAt < cutoff) {
      const days = Math.floor((now.getTime() - new Date(e.lastAutoAt).getTime()) / 86400000);
      gaps.push({ card: e.card, lastAutoAt: e.lastAutoAt, autoCount: e.autoCount, txCount: e.txCount, daysSince: days });
    }
  }
  return gaps;
}

async function main() {
  const now = new Date();
  const lookbackFrom = new Date(now.getTime() - LOOKBACK_DAYS * 86400000).toISOString();

  const { data: list, error: uerr } = await sb.auth.admin.listUsers({ perPage: 200 });
  if (uerr) { console.error('listUsers 실패:', uerr.message); process.exit(1); }
  const targets = (list.users || []).filter((u) => TARGET_EMAILS.includes(u.email));

  const results = {};
  for (const u of targets) {
    const { data: rows, error } = await sb
      .from('today_expenses')
      .select('card,source,sms_raw,spent_at')
      .eq('owner_id', u.id)
      .gte('spent_at', lookbackFrom)
      .is('deleted_at', null)
      .limit(5000);
    if (error) { console.error(`${u.email} 조회 실패:`, error.message); process.exit(1); }
    results[u.email] = detectGaps(rows || [], now);
  }

  console.log(JSON.stringify({ checkedAt: now.toISOString(), results }, null, 2));

  const hasGap = Object.values(results).some((g) => g.length > 0);
  if (process.argv.includes('--exit-on-gap') && hasGap) process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
