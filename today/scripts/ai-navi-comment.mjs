#!/usr/bin/env node
/**
 * 오늘의 네비 AI 자동 댓글 — 워커 (의존성 없음, Node 18+ global fetch).
 *
 * 댓글 텍스트는 이 스크립트가 만들지 않는다. Routine 에이전트(Claude)가 fetch 결과를 읽고
 * 직접 작성한 뒤 insert 를 호출한다. (API 키 불필요 — 에이전트 자신이 LLM)
 *
 * 키 안전: 이 워커는 service role 키를 쓰지 않는다. 저권한 토큰(AI_COMMENT_TOKEN)으로
 *   edge fn `ai-comment` 를 호출하고, service role 은 그 함수 안에만 있다.
 *   → 루틴 env(평문)에 토큰이 노출돼도 피해는 "공유 네비 가짜 클로드 댓글" 로 한정.
 *
 * 사용:
 *   node ai-navi-comment.mjs fetch [--entry <id>]                 → 댓글 대상 글 JSON (stdout)
 *   node ai-navi-comment.mjs insert --entry <id> --body "<text>"  → today_comments insert
 *
 * 환경 (Routine env 또는 today/.env.local):
 *   SUPABASE_URL (또는 VITE_SUPABASE_URL)
 *   AI_COMMENT_TOKEN                              edge fn 인증 토큰(저권한)
 *   SUPABASE_ANON_KEY (또는 VITE_SUPABASE_ANON_KEY)  옵션 — 게이트웨이용 공개 키(있으면 전송)
 */

import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');

function loadEnvLocal() {
  const envPath = path.join(PROJECT_ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const AI_COMMENT_TOKEN = process.env.AI_COMMENT_TOKEN;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !AI_COMMENT_TOKEN) {
  console.error('환경변수 누락: SUPABASE_URL / AI_COMMENT_TOKEN (.env.local 또는 Routine env 확인)');
  process.exit(1);
}

const FN_URL = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/ai-comment`;

async function callFn(payload) {
  const headers = {
    'Content-Type': 'application/json',
    'x-ai-comment-token': AI_COMMENT_TOKEN,
  };
  // anon 키는 공개 키 — 게이트웨이가 요구할 경우 대비(인증은 x-ai-comment-token 이 담당).
  if (ANON_KEY) { headers.apikey = ANON_KEY; headers.Authorization = `Bearer ${ANON_KEY}`; }
  const res = await fetch(FN_URL, { method: 'POST', headers, body: JSON.stringify(payload) });
  const text = await res.text();
  if (!res.ok) throw new Error(`ai-comment ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const cmd = process.argv[2];
try {
  if (cmd === 'fetch') {
    const entryId = arg('--entry');
    const out = await callFn({ action: 'context', ...(entryId ? { entry_id: entryId } : {}) });
    console.log(JSON.stringify(out, null, 2));
  } else if (cmd === 'insert') {
    const entryId = arg('--entry');
    const body = arg('--body');
    if (!entryId || !body) { console.error('insert: --entry <id> --body <text> 필수'); process.exit(1); }
    const row = await callFn({ action: 'submit', entry_id: entryId, body });
    console.log(JSON.stringify({ ok: true, id: row?.id }, null, 2));
  } else {
    console.error('사용: ai-navi-comment.mjs fetch [--entry <id>] | insert --entry <id> --body <text>');
    process.exit(1);
  }
} catch (e) {
  console.error('실패:', e.message);
  process.exit(1);
}
