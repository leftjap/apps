/**
 * Edge Function: ai-comment
 *
 * 클라우드 Routine(클로드)이 호출하는 DB 게이트웨이. service role 키는 이 함수 안에만 있고
 * 루틴엔 저권한 토큰(AI_COMMENT_TOKEN)만 둔다 → 토큰 누출돼도 피해는 "공유 네비에 가짜 클로드
 * 댓글" 로 한정(데이터 유출·삭제 불가).
 *
 * 인증: 헤더 `x-ai-comment-token` == secret AI_COMMENT_TOKEN (상수시간 비교). user JWT 불필요.
 * 액션 (?action= 또는 body.action):
 *   context  → 댓글 대상 글 스캔 결과(JSON 배열) 반환. body.entry_id 주면 그 글만(버튼 즉시·settle 무시).
 *   submit   → body {entry_id, body} 를 클로드 author 로 insert. 공유 네비 글만 허용.
 *
 * 순수 판정 로직(decide/toContext/htmlToText/토큰비교)은 ./logic.js (vitest 단위테스트 공용).
 *
 * Secrets:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Supabase 자동 주입), AI_COMMENT_TOKEN
 * 옵션 env: CLAUDE_USER_ID, AI_SETTLE_MINUTES(기본 10), AI_COMMENT_SINCE_DAYS(기본 3), AI_MAX_TARGETS(기본 10)
 */

// @ts-ignore — Deno std
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
// @ts-ignore — 로컬 순수 로직 (Deno 가 .js 임포트)
import { decide, toContext, humanIds, constantTimeEqual } from './logic.js';

// @ts-ignore — Deno globals
declare const Deno: { env: { get(k: string): string | undefined }; serve: (h: (req: Request) => Response | Promise<Response>) => void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AI_COMMENT_TOKEN = Deno.env.get('AI_COMMENT_TOKEN');
const CLAUDE_USER_ID = Deno.env.get('CLAUDE_USER_ID') || 'f74a3d8a-f449-4c25-82d1-509dc70a9988';
const SETTLE_MS = Number(Deno.env.get('AI_SETTLE_MINUTES') || 10) * 60 * 1000;
const SINCE_DAYS = Number(Deno.env.get('AI_COMMENT_SINCE_DAYS') || 3);
const MAX_TARGETS = Number(Deno.env.get('AI_MAX_TARGETS') || 10);
const HUMAN_IDS = humanIds(CLAUDE_USER_ID);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ai-comment-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

type Entry = { id: string; owner_id: string; kind: string; title: string | null; content: string | null; updated_at: string; is_shared?: boolean };
type Comment = { author_id: string; body: string; created_at: string };

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function commentsOf(entryId: string): Promise<Comment[]> {
  const { data, error } = await sb
    .from('today_comments')
    .select('author_id,body,created_at')
    .eq('entry_id', entryId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as Comment[];
}

const decideOpts = (ignoreSettle = false) => ({ claudeId: CLAUDE_USER_ID, settleMs: SETTLE_MS, ignoreSettle });

async function runContext(entryId?: string) {
  if (entryId) {
    const { data: rows, error } = await sb
      .from('today_entries')
      .select('id,owner_id,kind,title,content,updated_at,is_shared')
      .eq('id', entryId)
      .is('deleted_at', null);
    if (error) throw new Error(error.message);
    const entry = rows && (rows[0] as Entry);
    if (!entry) return [];
    if (entry.kind !== 'navi' && entry.kind !== 'soyoun_navi') return [];
    if (entry.is_shared === false) return [];
    const comments = await commentsOf(entry.id);
    const mode = decide(entry, comments, decideOpts(true));
    return mode ? [toContext(entry, comments, mode, CLAUDE_USER_ID)] : [];
  }

  const since = new Date(Date.now() - SINCE_DAYS * 86400 * 1000).toISOString();
  const targets: unknown[] = [];
  const seen = new Set<string>();

  // (a) 신규: 최근 공유 네비 글.
  const { data: fresh, error: e1 } = await sb
    .from('today_entries')
    .select('id,owner_id,kind,title,content,updated_at,is_shared')
    .in('kind', ['navi', 'soyoun_navi'])
    .is('deleted_at', null)
    .not('content', 'is', null)
    .eq('is_shared', true)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);
  if (e1) throw new Error(e1.message);
  for (const entry of (fresh || []) as Entry[]) {
    if (targets.length >= MAX_TARGETS) break;
    const comments = await commentsOf(entry.id);
    const mode = decide(entry, comments, decideOpts());
    if (mode && !seen.has(entry.id)) { seen.add(entry.id); targets.push(toContext(entry, comments, mode, CLAUDE_USER_ID)); }
  }

  // (b) 대댓글: 최근 사람 댓글이 달린 글.
  const { data: recent, error: e2 } = await sb
    .from('today_comments')
    .select('entry_id')
    .in('author_id', HUMAN_IDS)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (e2) throw new Error(e2.message);
  const recentEntryIds = [...new Set((recent || []).map((c: { entry_id: string }) => c.entry_id))];
  for (const eid of recentEntryIds) {
    if (targets.length >= MAX_TARGETS || seen.has(eid)) continue;
    const { data: rows } = await sb
      .from('today_entries')
      .select('id,owner_id,kind,title,content,updated_at,is_shared')
      .eq('id', eid)
      .is('deleted_at', null)
      .eq('is_shared', true);
    const entry = rows && (rows[0] as Entry);
    if (!entry) continue;
    if (entry.kind !== 'navi' && entry.kind !== 'soyoun_navi') continue;
    const comments = await commentsOf(eid);
    const mode = decide(entry, comments, decideOpts());
    if (mode === 'reply') { seen.add(eid); targets.push(toContext(entry, comments, mode, CLAUDE_USER_ID)); }
  }

  return targets;
}

async function runSubmit(entry_id: string, body: string) {
  // 공유 네비 글에만 작성 허용 (비공유·삭제·비네비 차단).
  const { data: rows, error: e0 } = await sb
    .from('today_entries')
    .select('id,kind,is_shared,deleted_at')
    .eq('id', entry_id)
    .maybeSingle();
  if (e0) throw new Error(e0.message);
  const entry = rows as { kind: string; is_shared: boolean; deleted_at: string | null } | null;
  if (!entry || entry.deleted_at) return json(404, { status: 'error', message: 'Entry not found' });
  if (entry.kind !== 'navi' && entry.kind !== 'soyoun_navi') return json(400, { status: 'error', message: 'Not a navi entry' });
  if (!entry.is_shared) return json(403, { status: 'error', message: 'Entry not shared' });

  const { data: created, error } = await sb
    .from('today_comments')
    .insert({ entry_id, author_id: CLAUDE_USER_ID, body })
    .select('id')
    .single();
  if (error) return json(500, { status: 'error', message: error.message });
  return json(200, { status: 'ok', id: created?.id });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { status: 'error', message: 'Method not allowed' });

  if (!AI_COMMENT_TOKEN) return json(503, { status: 'error', message: 'AI_COMMENT_TOKEN not configured' });
  if (!constantTimeEqual(req.headers.get('x-ai-comment-token'), AI_COMMENT_TOKEN)) {
    return json(401, { status: 'error', message: 'Unauthorized' });
  }

  let body: { action?: string; entry_id?: string; body?: string } = {};
  try { body = await req.json(); } catch { /* empty body allowed for context */ }
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || body.action || 'context';

  try {
    if (action === 'context') {
      const targets = await runContext(body.entry_id);
      return json(200, targets);
    }
    if (action === 'submit') {
      if (!body.entry_id || !body.body) return json(400, { status: 'error', message: 'Missing entry_id or body' });
      return await runSubmit(body.entry_id, body.body);
    }
    return json(400, { status: 'error', message: `Unknown action: ${action}` });
  } catch (e) {
    return json(500, { status: 'error', message: (e as Error).message });
  }
});
