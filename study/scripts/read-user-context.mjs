#!/usr/bin/env node
/**
 * read-user-context.mjs — spec §5-0 단계 3-4 SELECT 자동화.
 * Claude 가 workflow 호출 → 4 테이블 SELECT → JSON stdout → i+1 알고리즘 입력.
 * 사용: node scripts/read-user-context.mjs --user-id <uuid> [--lang en|ja|both] [--days 30]
 * env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (workflow secrets).
 */
import { argv, env, exit } from 'node:process';

function parseArgs(args) {
  const out = { lang: 'both', days: 30 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--user-id') out.userId = args[++i];
    else if (a === '--lang') out.lang = args[++i];
    else if (a === '--days') out.days = parseInt(args[++i], 10);
  }
  if (!out.userId) { console.error('Usage: --user-id <uuid> [--lang en|ja|both] [--days 30]'); exit(1); }
  if (!['en', 'ja', 'both'].includes(out.lang)) { console.error(`--lang invalid: ${out.lang}`); exit(1); }
  return out;
}

async function rest(supabaseUrl, serviceKey, path) {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1${path}`;
  const res = await fetch(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : [];
}

function isoNDaysAgo(n) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const args = parseArgs(argv.slice(2));
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required'); exit(1);
  }

  const since = isoNDaysAgo(args.days);
  const lf = args.lang === 'both' ? '' : `&lang=eq.${args.lang}`;

  const [userMeta, todayLessons, sessionLogs, pronLog, reviewQueue] = await Promise.all([
    rest(supabaseUrl, serviceKey, `/study_user_meta?user_id=eq.${args.userId}&select=*`),
    rest(supabaseUrl, serviceKey, `/study_today_lessons?user_id=eq.${args.userId}${lf}&date=gte.${since}&select=id,lang,date,sentence,completed,order_index&order=date.desc`),
    rest(supabaseUrl, serviceKey, `/study_session_logs?user_id=eq.${args.userId}${lf}&date=gte.${since}&select=*&order=date.desc`),
    rest(supabaseUrl, serviceKey, `/study_pronunciation_log?user_id=eq.${args.userId}${lf}&date=gte.${since}&select=lang,date,sentence_id,overall_score,phoneme_scores,weak_phonemes&order=date.desc`),
    rest(supabaseUrl, serviceKey, `/study_review_queue?user_id=eq.${args.userId}${lf}&select=id,lang,sentence,interval,next_review,consecutive_pass,last_result,category&order=next_review.asc`),
  ]);

  const passResults = sessionLogs.flatMap((s) => Array.isArray(s.review_results) ? s.review_results : []);
  const passCount = passResults.filter((r) => r === 'O' || r === 'pass' || r === 'remembered').length;
  const passRate = passResults.length > 0 ? passCount / passResults.length : null;

  const phonemeAgg = new Map();
  for (const p of pronLog) for (const ph of (p.weak_phonemes ?? [])) phonemeAgg.set(ph, (phonemeAgg.get(ph) ?? 0) + 1);
  const topWeak = [...phonemeAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const today = new Date().toISOString().slice(0, 10);
  const dueReviewCount = reviewQueue.filter((r) => r.next_review && r.next_review <= today).length;

  const out = {
    _meta: { user_id: args.userId, lang: args.lang, days: args.days, since, generated_at: new Date().toISOString() },
    user_meta: userMeta[0] ?? null,
    recent_today_lessons: todayLessons,
    recent_session_logs: sessionLogs,
    pronunciation_log: pronLog,
    review_queue: reviewQueue,
    summary: {
      totalLessons: todayLessons.length,
      unfinishedCount: todayLessons.filter((r) => r.completed === false).length,
      sessionCount: sessionLogs.length,
      pronunciationLogCount: pronLog.length,
      reviewQueueCount: reviewQueue.length,
      dueReviewCount,
      passRate,
      topWeakPhonemes: topWeak.map(([ipa, count]) => ({ ipa, count })),
    },
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(`[read-user-context] FAILED: ${e.message}`); exit(1); });
