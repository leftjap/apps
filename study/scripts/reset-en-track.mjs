#!/usr/bin/env node
/**
 * reset-en-track.mjs — 영어 트랙 리셋 (2026-09-13 사용자 지시 "기존 세션과 복습 전부 없애고 신규 세션 생성").
 *
 * 1) 백업: 사용자·lang 의 study_today_lessons 전체 + study_review_queue 전체 행을 JSON 으로 저장.
 * 2) review tombstone: study_review_queue 의 해당 행 explanation 에 _deleted=true 를 합쳐 PATCH. 행 삭제는 금지 —
 *    push 가 upsert-only 이고 reconcileTable 이 '서버에 없는 로컬 행'을 되살리므로 2026-07-22 규약대로 tombstone 이 정본이다.
 * 3) lessons 삭제: study_today_lessons 의 해당 행 DELETE (serverOwned — pull 의 staleIdsToDelete 가 기기에서 지운다).
 * 발음 이력·세션 로그·일별 통계·다른 언어는 건드리지 않는다. 사용자가 앱을 열지 않은 상태에서 돌린다.
 *
 * 사용: node scripts/reset-en-track.mjs --user-id <uuid> [--lang en] [--backup <path>] [--dry-run]
 * env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { argv, env, exit } from 'node:process';

export function withTombstone(explanation) {
  const base = (explanation && typeof explanation === 'object' && !Array.isArray(explanation)) ? explanation : {};
  return { ...base, _deleted: true };
}

export function splitTargets(rows, lang) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r && r.lang === lang && !(r.explanation && r.explanation._deleted === true));
}

// 확인(verify) 단계 집계 — 배열이 아니면(조회 실패 등) 던진다. 성공으로 오인해 exit 0 되는 것을 막는다 (리뷰 지적).
export function verifyCounts(left, leftRv, lang) {
  if (!Array.isArray(left) || !Array.isArray(leftRv)) throw new Error('verifyCounts: 배열이 아님 — 확인 조회 실패');
  return { lessons: left.length, activeReviews: splitTargets(leftRv, lang).length };
}

function parseArgs(a) {
  const o = { lang: 'en', dryRun: false, backup: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--user-id') o.userId = a[++i];
    else if (a[i] === '--lang') o.lang = a[++i];
    else if (a[i] === '--backup') o.backup = a[++i];
    else if (a[i] === '--dry-run') o.dryRun = true;
  }
  return o;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = parseArgs(argv.slice(2));
  if (!args.userId) { console.error('usage: --user-id <uuid> [--lang en] [--backup <path>] [--dry-run]'); exit(1); }
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); exit(1); }
  const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const base = `${url.replace(/\/$/, '')}/rest/v1`;
  const q = (table, extra = '') => `${base}/${table}?user_id=eq.${args.userId}&lang=eq.${args.lang}${extra}`;

  const lessons = await (await fetch(q('study_today_lessons', '&select=*'), { headers: H })).json();
  const reviews = await (await fetch(q('study_review_queue', '&select=*'), { headers: H })).json();
  if (!Array.isArray(lessons) || !Array.isArray(reviews)) { console.error('[reset] 조회 실패', lessons, reviews); exit(1); }
  const reviewTargets = splitTargets(reviews, args.lang);
  console.log(`[reset] lessons ${lessons.length}건 삭제 대상 · review ${reviews.length}건 중 tombstone 대상 ${reviewTargets.length}건`);

  const backupPath = args.backup || `${env.HOME}/apps/tmp/reset-backup-${args.lang}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`;
  writeFileSync(backupPath, JSON.stringify({ userId: args.userId, lang: args.lang, at: new Date().toISOString(), lessons, reviews }, null, 2));
  console.log(`[reset] 백업 저장: ${backupPath}`);
  if (args.dryRun) { console.log('[reset] dry-run — 변경 안 함'); exit(0); }

  let patched = 0;
  for (const r of reviewTargets) {
    const res = await fetch(`${base}/study_review_queue?user_id=eq.${args.userId}&id=eq.${encodeURIComponent(r.id)}`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ explanation: withTombstone(r.explanation) }),
    });
    if (!res.ok) { console.error(`[reset] tombstone 실패 ${r.id}: ${res.status} ${await res.text()}`); exit(1); }
    patched += 1;
  }
  console.log(`[reset] review tombstone ${patched}건`);

  const del = await fetch(q('study_today_lessons'), { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } });
  if (!del.ok) { console.error(`[reset] lessons 삭제 실패 ${del.status} ${await del.text()}`); exit(1); }
  const leftRes = await fetch(q('study_today_lessons', '&select=id'), { headers: H });
  if (!leftRes.ok) { console.error(`[reset] 확인 조회 실패 ${leftRes.status} ${await leftRes.text()}`); exit(1); }
  const leftRvRes = await fetch(q('study_review_queue', '&select=id,lang,explanation'), { headers: H });
  if (!leftRvRes.ok) { console.error(`[reset] 확인 조회 실패 ${leftRvRes.status} ${await leftRvRes.text()}`); exit(1); }
  const counts = verifyCounts(await leftRes.json(), await leftRvRes.json(), args.lang);
  console.log(`[reset] 확인: lessons 남은 행 ${counts.lessons} · review 미tombstone ${counts.activeReviews}`);
}
