#!/usr/bin/env node
/**
 * generate-review-prompt.mjs — 클로드 음성모드(Haiku 4.5) 영어 복습 프롬프트 생성기.
 *
 * 스터디앱 세션의 학습 표현 → "영어 몰입 음성 대화" 복습 프롬프트를 stdout 출력.
 *  - --mode new    : 가장 최근 세션(study_today_lessons)의 표현 → 직후 말하기 워밍업
 *  - --mode review : 복습 큐(study_review_queue)의 due 표현 → 인앱 SRS 와 동일 선정(2026-06-29 정합).
 *                    졸업 카드는 큐에서 빠지므로 영구 재출력 안 됨.
 *
 * 프롬프트 본문 = 인앱 summary 와 동일한 연구 기반 템플릿(src/services/voicePrompt.js buildVoicePrompt).
 * 설계 근거 = 2026-06-30 voice-practice-research(SLA + AI 튜터 실증) — voicePrompt.js 주석 참조.
 *
 * 사용: node scripts/generate-review-prompt.mjs --user-id <uuid> [--mode new|review] [--lang en] [--date YYYY-MM-DD]
 * env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { fileURLToPath } from 'node:url';
import { argv, env, exit } from 'node:process';
import { buildVoicePrompt } from '../src/services/voicePrompt.js';

function parseArgs(a) {
  const o = { mode: 'new', lang: 'en' };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--user-id') o.userId = a[++i];
    else if (k === '--mode') o.mode = a[++i];
    else if (k === '--lang') o.lang = a[++i];
    else if (k === '--date') o.date = a[++i];
  }
  return o;
}

async function rest(url, key, path) {
  const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

/** 표현 카드 → 학습 대상 청크 (key 의 '=' 앞부분 = 타깃 표현). */
export function targetExpr(card) {
  const k = card.explanation?.key || '';
  const left = k.split('=')[0].trim();
  return left || card.sentence || card.id;
}

/** 새 세션: study_today_lessons 행들 → 가장 최근(또는 dateArg) date 의 표현 카드(order_index>0, scene 제외). */
export function pickNewExprs(rows, dateArg) {
  const exprCards = (rows || []).filter((r) => (r.order_index ?? 0) > 0);
  if (!exprCards.length) return [];
  const latest = dateArg || exprCards.map((r) => r.date).filter(Boolean).sort().slice(-1)[0];
  return exprCards.filter((r) => r.date === latest);
}

/**
 * 복습: reviewQueue 행들 → due(nextReview<=today 또는 미정) 우선, 기한 오래된 순(미정 최우선), 상한 limit.
 * due 0건이면 다가오는 것이라도 오래된 순 폴백(항상 연습거리 제공). 인앱 loadReviewCards 와 동일 정책.
 */
export function pickReviewExprs(queueRows, todayISO, limit = 8) {
  const asc = (a, b) => {
    const av = a.nextReview ?? '';
    const bv = b.nextReview ?? '';
    return av < bv ? -1 : av > bv ? 1 : 0;
  };
  const rows = queueRows || [];
  const due = rows.filter((r) => !r.nextReview || r.nextReview <= todayISO);
  const pool = due.length ? due : rows;
  return pool.slice().sort(asc).slice(0, Math.max(0, limit));
}

async function main() {
  const args = parseArgs(argv.slice(2));
  if (!args.userId) { console.error('usage: --user-id <uuid> [--mode new|review] [--lang en]'); exit(1); }
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); exit(1); }

  let picked;
  if (args.mode === 'review') {
    // 복습 = 인앱 SRS 와 동일하게 reviewQueue 의 due 표현 (졸업 카드는 큐에서 제거돼 제외됨).
    const rows = await rest(url, key,
      `/study_review_queue?user_id=eq.${args.userId}&lang=eq.${args.lang}&select=id,sentence,explanation,next_review`);
    const mapped = rows.map((r) => ({ id: r.id, sentence: r.sentence, explanation: r.explanation, nextReview: r.next_review }));
    const today = args.date || new Date().toISOString().slice(0, 10);
    picked = pickReviewExprs(mapped, today);
    if (picked.length === 0) { console.error('복습 큐 비어 있음 (이관된 표현 없음)'); exit(1); }
  } else {
    const rows = await rest(url, key,
      `/study_today_lessons?user_id=eq.${args.userId}&lang=eq.${args.lang}&select=id,date,order_index,sentence,explanation,completed&order=date.desc,order_index.asc`);
    picked = pickNewExprs(rows, args.date);
    if (picked.length === 0) { console.error('표현 카드 없음 (시드된 세션 없음)'); exit(1); }
  }
  const exprs = [...new Set(picked.map(targetExpr))];
  console.log(buildVoicePrompt(exprs)); // 인앱 summary 와 동일한 연구 기반 템플릿 (src/services/voicePrompt.js)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error('FAILED:', e.message); exit(1); });
