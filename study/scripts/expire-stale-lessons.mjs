#!/usr/bin/env node
/**
 * expire-stale-lessons.mjs — 방치된 미완료 신규 레슨 정리 (hold 게이트 데드락 방지).
 *
 * 배경(2026-07-01 진단): 라우틴 en 트랙은 spec §5-0 단계 4 "미완료 5건 초과 시 보류" 게이트를 따른다.
 * carry-forward 로 미완료 카드가 영구 잔존하므로, 완료 불가/방치된 stale 미완료(예: 2026-06-08 결함 배치가
 * 3주 방치)가 쌓이면 미완료>5 가 고정돼 라우틴이 매일 en 을 HOLD → 새 세션이 영영 안 생기는 데드락.
 * → 추출 전 이 스크립트로 **N일(기본 14) 이상 방치된 미완료를 삭제**해 카운트를 풀어준다. (완료분·최근분 보존)
 *
 * 사용: node scripts/expire-stale-lessons.mjs --user-id <uuid> [--lang en] [--days 14] [--today YYYY-MM-DD] [--dry-run]
 * env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { fileURLToPath } from 'node:url';
import { argv, env, exit } from 'node:process';

/** rows({id,date,completed}) → todayISO 기준 maxDays 초과 방치된 미완료 카드 id. 완료·최근분은 제외. */
export function staleIncompleteIds(rows, todayISO, maxDays = 14) {
  const cutoff = new Date(`${todayISO}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - maxDays);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && r.completed !== true && r.date && r.date < cutoffISO)
    .map((r) => r.id);
}

function parseArgs(a) {
  const o = { lang: 'en', days: 14, dryRun: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--user-id') o.userId = a[++i];
    else if (a[i] === '--lang') o.lang = a[++i];
    else if (a[i] === '--days') o.days = Number(a[++i]);
    else if (a[i] === '--today') o.today = a[++i];
    else if (a[i] === '--dry-run') o.dryRun = true;
  }
  return o;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = parseArgs(argv.slice(2));
  if (!args.userId) { console.error('usage: --user-id <uuid> [--lang en] [--days 14] [--dry-run]'); exit(1); }
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); exit(1); }
  const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const today = args.today || new Date().toISOString().slice(0, 10);

  const rows = await (await fetch(`${url}/rest/v1/study_today_lessons?user_id=eq.${args.userId}&lang=eq.${args.lang}&completed=eq.false&select=id,date,sentence`, { headers: H })).json();
  const stale = staleIncompleteIds(rows, today, args.days);
  console.log(`[expire] 미완료 ${rows.length}건 중 stale(${args.days}일+ 방치) = ${stale.length}건`);
  for (const id of stale) console.log(`  - ${id}`);
  if (!stale.length) { console.log('[expire] 정리 대상 없음'); exit(0); }
  if (args.dryRun) { console.log('[expire] dry-run — 삭제 안 함'); exit(0); }

  const inList = `(${stale.map((s) => `"${s}"`).join(',')})`;
  const del = await fetch(`${url}/rest/v1/study_today_lessons?user_id=eq.${args.userId}&id=in.${inList}`, { method: 'DELETE', headers: H });
  if (!del.ok) { console.error(`[expire] 삭제 실패 ${del.status} ${await del.text()}`); exit(1); }
  console.log(`[expire] ${stale.length}건 삭제 완료 (today_lessons). reviewQueue 는 완료분이라 영향 없음.`);
}
