/**
 * Edge Function: request-ai-comment
 *
 * "클로드 댓글 받기" 버튼 → 해당 네비 글에 대해 Routine(클라우드 Claude)을 즉시 1회 발사.
 * 댓글 생성·insert 는 Routine 이 수행. 이 함수는 트리거만 한다. (Anthropic API 키 불필요)
 *
 * Request (verify_jwt=true → 게이트웨이가 유효 JWT 강제):
 *   Headers: Authorization: Bearer <user JWT>
 *   Body:    { entry_id: string }
 * Response: 200 { status:'ok' } | 400 | 403(소유자 아님) | 502(routine 발사 실패)
 *
 * Secrets (Anthropic API 키 아님 — claude.ai/code/routines 의 "API 트리거" 설정에서 발급):
 *   ROUTINE_ID             routine UUID
 *   ROUTINE_TRIGGER_TOKEN  per-routine bearer token
 * (routines-fire 는 research preview — experimental-cc-routine-2026-04-01 beta 헤더 사용)
 */

// @ts-ignore — Deno std
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// @ts-ignore — Deno globals
declare const Deno: { env: { get(k: string): string | undefined }; serve: (h: (req: Request) => Response | Promise<Response>) => void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ROUTINE_ID = Deno.env.get('ROUTINE_ID');
const ROUTINE_TRIGGER_TOKEN = Deno.env.get('ROUTINE_TRIGGER_TOKEN');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { status: 'error', message: 'Method not allowed' });

  let body: { entry_id?: string };
  try { body = await req.json(); } catch { return json(400, { status: 'error', message: 'Invalid JSON' }); }
  const entry_id = body?.entry_id;
  if (!entry_id) return json(400, { status: 'error', message: 'Missing entry_id' });

  // 인증 사용자 확인 (게이트웨이가 JWT 유효성은 이미 검증).
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return json(401, { status: 'error', message: 'Unauthorized' });

  // 소유자만 자기 글에 대해 요청 가능 (service role 로 owner 조회).
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: entry, error } = await sb
    .from('today_entries')
    .select('owner_id, kind, deleted_at')
    .eq('id', entry_id)
    .maybeSingle();
  if (error) return json(500, { status: 'error', message: error.message });
  if (!entry || entry.deleted_at) return json(404, { status: 'error', message: 'Entry not found' });
  if (entry.owner_id !== userId) return json(403, { status: 'error', message: 'Not your entry' });
  if (entry.kind !== 'navi' && entry.kind !== 'soyoun_navi') return json(400, { status: 'error', message: 'Not a navi entry' });

  if (!ROUTINE_ID || !ROUTINE_TRIGGER_TOKEN) {
    return json(503, { status: 'error', message: 'Routine trigger not configured' });
  }

  // Routine 즉시 발사 — 문서화된 /fire 형식 (experimental-cc-routine-2026-04-01).
  // entry_id 를 text 로 전달 → 에이전트가 `ai-navi-comment.mjs fetch --entry <id>` 처리.
  try {
    const res = await fetch(`https://api.anthropic.com/v1/claude_code/routines/${ROUTINE_ID}/fire`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ROUTINE_TRIGGER_TOKEN}`,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'experimental-cc-routine-2026-04-01',
      },
      body: JSON.stringify({ text: `오늘의 네비 즉시 댓글 요청: entry_id=${entry_id}` }),
    });
    if (!res.ok) return json(502, { status: 'error', message: `Routine fire ${res.status}` });
  } catch (e) {
    return json(502, { status: 'error', message: `Routine fire failed: ${(e as Error).message}` });
  }

  return json(200, { status: 'ok', entry_id });
});
