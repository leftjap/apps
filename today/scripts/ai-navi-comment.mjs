#!/usr/bin/env node
/**
 * 오늘의 네비 AI 자동 댓글 — 워커 (의존성 없음, Node 18+ global fetch).
 *
 * 댓글 텍스트는 이 스크립트가 만들지 않는다. Routine 에이전트(Claude)가 fetch 결과를 읽고
 * 직접 작성한 뒤 insert 를 호출한다. (API 키 불필요 — 에이전트 자신이 LLM)
 *
 * 사용:
 *   node ai-navi-comment.mjs fetch [--entry <id>]     → 댓글 대상 글 JSON (stdout)
 *   node ai-navi-comment.mjs insert --entry <id> --body "<text>"   → today_comments insert
 *
 * 환경 (Routine env 또는 today/.env.local):
 *   SUPABASE_URL (또는 VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY  (RLS 우회)
 *   CLAUDE_USER_ID         (기본: claude-bot 계정 UUID)
 *   AI_COMMENT_SINCE       (옵션 ISO. 신규 댓글 대상 created_at 하한. 기본: now-3d — 백로그 폭주 방지)
 *   AI_MAX_TARGETS         (옵션. 스캔 실행당 최대 대상 수. 기본 10)
 *
 * 탐지 (인자 없는 fetch):
 *   (a) 신규: navi/soyoun_navi · content 有 · created_at>=since · updated_at<now-1h · 클로드 댓글 없음
 *   (b) 대댓글: 클로드 댓글이 이미 있고, 가장 최근 댓글이 사람(=클로드가 답할 차례)
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
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLAUDE_USER_ID = process.env.CLAUDE_USER_ID || 'f74a3d8a-f449-4c25-82d1-509dc70a9988';
const MAX_TARGETS = Number(process.env.AI_MAX_TARGETS || 10);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('환경변수 누락: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local 확인)');
  process.exit(1);
}

// owner_id → 표시 이름 (에이전트 컨텍스트용). entries.js 매핑과 동일.
const NAME_BY_ID = {
  '7bae5645-61c6-4476-9ff2-4c30a72812ff': '지오',
  '9f0408c0-008b-440c-a938-2effd9cb3bfd': '지오',
  'aeafd9a7-4094-4e7c-a621-188d6b2e336d': '소연',
  [CLAUDE_USER_ID]: '클로드',
};
const HUMAN_IDS = Object.keys(NAME_BY_ID).filter((id) => id !== CLAUDE_USER_ID);
const nameFor = (id) => NAME_BY_ID[id] || '알수없음';

async function rest(pathQuery, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathQuery}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PostgREST ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function commentsOf(entryId) {
  return await rest(
    `today_comments?select=author_id,body,created_at&entry_id=eq.${entryId}&deleted_at=is.null&order=created_at.asc`,
  );
}

/** 한 entry 가 댓글 대상인지 판정. mode: 'initial' | 'reply' | null. */
function decide(entry, comments, { ignoreSettle } = {}) {
  const hasClaude = comments.some((c) => c.author_id === CLAUDE_USER_ID);
  const last = comments[comments.length - 1] || null;
  const settled = Date.now() - new Date(entry.updated_at).getTime() >= 3600 * 1000;
  if (!hasClaude) {
    if (!(entry.content && htmlToText(entry.content))) return null;
    return ignoreSettle || settled ? 'initial' : null;
  }
  // 클로드 댓글 있음 → 마지막이 사람이면 답할 차례
  if (last && last.author_id !== CLAUDE_USER_ID) return 'reply';
  return null;
}

function toContext(entry, comments, mode) {
  return {
    entry_id: entry.id,
    kind: entry.kind,
    mode,
    author: nameFor(entry.owner_id),
    title: entry.title || '(제목 없음)',
    content: htmlToText(entry.content),
    comments: comments.map((c) => ({ author: nameFor(c.author_id), body: c.body, created_at: c.created_at })),
  };
}

async function runFetch(entryId) {
  // 단일 글 (버튼 즉시 모드) — settle 무시.
  if (entryId) {
    const rows = await rest(`today_entries?select=id,owner_id,kind,title,content,updated_at&id=eq.${entryId}&deleted_at=is.null`);
    const entry = rows && rows[0];
    if (!entry) return [];
    const comments = await commentsOf(entry.id);
    const mode = decide(entry, comments, { ignoreSettle: true });
    return mode ? [toContext(entry, comments, mode)] : [];
  }

  const since = process.env.AI_COMMENT_SINCE || new Date(Date.now() - 3 * 86400 * 1000).toISOString();
  const targets = [];
  const seen = new Set();

  // (a) 신규: 최근 글만 (백로그 폭주 방지).
  const fresh = await rest(
    `today_entries?select=id,owner_id,kind,title,content,updated_at&kind=in.(navi,soyoun_navi)` +
      `&deleted_at=is.null&content=not.is.null&created_at=gte.${since}&order=created_at.desc&limit=50`,
  );
  for (const entry of fresh || []) {
    if (targets.length >= MAX_TARGETS) break;
    const comments = await commentsOf(entry.id);
    const mode = decide(entry, comments);
    if (mode && !seen.has(entry.id)) { seen.add(entry.id); targets.push(toContext(entry, comments, mode)); }
  }

  // (b) 대댓글: 최근 사람 댓글이 달린 글.
  const recent = await rest(
    `today_comments?select=entry_id&author_id=in.(${HUMAN_IDS.join(',')})&deleted_at=is.null&order=created_at.desc&limit=100`,
  );
  const recentEntryIds = [...new Set((recent || []).map((c) => c.entry_id))];
  for (const eid of recentEntryIds) {
    if (targets.length >= MAX_TARGETS || seen.has(eid)) continue;
    const rows = await rest(`today_entries?select=id,owner_id,kind,title,content,updated_at&id=eq.${eid}&deleted_at=is.null`);
    const entry = rows && rows[0];
    if (!entry) continue;
    const comments = await commentsOf(eid);
    const mode = decide(entry, comments);
    if (mode === 'reply') { seen.add(eid); targets.push(toContext(entry, comments, mode)); }
  }

  return targets;
}

async function runInsert(entryId, body) {
  if (!entryId || !body) { console.error('insert: --entry <id> --body <text> 필수'); process.exit(1); }
  const created = await rest('today_comments', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ entry_id: entryId, author_id: CLAUDE_USER_ID, body }]),
  });
  return created && created[0];
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const cmd = process.argv[2];
try {
  if (cmd === 'fetch') {
    const out = await runFetch(arg('--entry'));
    console.log(JSON.stringify(out, null, 2));
  } else if (cmd === 'insert') {
    const row = await runInsert(arg('--entry'), arg('--body'));
    console.log(JSON.stringify({ ok: true, id: row?.id }, null, 2));
  } else {
    console.error('사용: ai-navi-comment.mjs fetch [--entry <id>] | insert --entry <id> --body <text>');
    process.exit(1);
  }
} catch (e) {
  console.error('실패:', e.message);
  process.exit(1);
}
