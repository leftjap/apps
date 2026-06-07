/**
 * Edge Function: request-taste-reco
 *
 * "다시 추천" 버튼 → 호출 사용자(owner) 본인 추천 재생성을 위해 Routine(클라우드 Claude)을 즉시 1회 발사.
 * 추천 생성·기록은 Routine 이 수행. 이 함수는 트리거만 한다. (Anthropic API 키 불필요)
 *
 * Request (verify_jwt=true → 게이트웨이가 유효 JWT 강제):
 *   Headers: Authorization: Bearer <user JWT>
 *   Body:    {} (대상 = 호출자 자신 — taste 추천은 개인 격리)
 * Response: 200 {status:'queued'} | 200 {status:'noop'}(평가 없음) | 401 | 503 | 502
 *
 * Secrets (Anthropic API 키 아님 — claude.ai/code/routines 의 "API 트리거" 에서 발급):
 *   TASTE_ROUTINE_ID            routine UUID  (※ Today 의 ROUTINE_ID 와 충돌 회피 — 공유 프로젝트라 taste 전용 이름)
 *   TASTE_ROUTINE_TRIGGER_TOKEN per-routine bearer token
 *   TASTE_RECO_TOKEN            선조회용 — taste-reco context 호출(평가 0 → 헛발사 방지). 없으면 선조회 생략.
 * (routines-fire 는 research preview — experimental-cc-routine-2026-04-01 beta 헤더 사용)
 */

// @ts-ignore — Deno std
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// @ts-ignore — Deno globals
declare const Deno: { env: { get(k: string): string | undefined }; serve: (h: (req: Request) => Response | Promise<Response>) => void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
// ※ 공유 프로젝트(geo-apps)라 Today 의 ROUTINE_ID/ROUTINE_TRIGGER_TOKEN 과 충돌 회피 — taste 전용 이름.
const ROUTINE_ID = Deno.env.get('TASTE_ROUTINE_ID');
const ROUTINE_TRIGGER_TOKEN = Deno.env.get('TASTE_ROUTINE_TRIGGER_TOKEN');
const TASTE_RECO_TOKEN = Deno.env.get('TASTE_RECO_TOKEN');

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

  // 인증 사용자 확인 (게이트웨이가 JWT 유효성은 이미 검증). getUser 는 토큰을 명시 인자로 받아야 함.
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const userClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: userData } = await userClient.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (!userId) return json(401, { status: 'error', message: 'Unauthorized' });

  // 선조회 — 평가가 0이면 발사 무의미 → noop. taste-reco context(owner_id) 가 [] 면 평가 없음.
  // 선조회 실패는 fail-open(그대로 발사).
  if (TASTE_RECO_TOKEN) {
    try {
      const ctxRes = await fetch(`${SUPABASE_URL}/functions/v1/taste-reco`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-taste-reco-token': TASTE_RECO_TOKEN,
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'context', owner_id: userId }),
      });
      if (ctxRes.ok) {
        const targets = await ctxRes.json();
        if (Array.isArray(targets) && targets.length === 0) {
          return json(200, { status: 'noop', owner_id: userId });
        }
      }
    } catch (_) { /* fail-open */ }
  }

  if (!ROUTINE_ID || !ROUTINE_TRIGGER_TOKEN) {
    return json(503, { status: 'error', message: 'Routine trigger not configured' });
  }

  // Routine 즉시 발사 — 문서화된 /fire 형식 (experimental-cc-routine-2026-04-01).
  // owner_id 를 text 로 전달 → 에이전트가 그 owner 만 재생성.
  try {
    const res = await fetch(`https://api.anthropic.com/v1/claude_code/routines/${ROUTINE_ID}/fire`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ROUTINE_TRIGGER_TOKEN}`,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'experimental-cc-routine-2026-04-01',
      },
      body: JSON.stringify({ text: `taste 추천 재생성 요청: owner_id=${userId}` }),
    });
    if (!res.ok) return json(502, { status: 'error', message: `Routine fire ${res.status}` });
  } catch (e) {
    return json(502, { status: 'error', message: `Routine fire failed: ${(e as Error).message}` });
  }

  return json(200, { status: 'queued', owner_id: userId });
});
