// Wave 11.22 — Azure Speech 단기 토큰 발급 Edge Function (spec §12-1).
//
// Flow (spec §9-1):
//   [브라우저] → POST /functions/v1/azure-token (Authorization: Bearer <supabase_session_token>)
//   → 본 함수가 Supabase Auth 검증 + Azure issueToken endpoint 호출 → 단기 JWT 반환
//   [브라우저] → Azure Speech SDK (직접 통신, JWT 사용, DB 미경유)
//
// Azure 키는 절대 클라이언트 노출 X — Edge Function 환경변수로만 보관.
// 응답 토큰은 10분 만료 (Azure spec). 본 응답에선 expiresAt = Date.now() + 9분 (만료 1분 전 갱신 권장).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.104.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // 1) Supabase Auth 검증 (요청자 본인 확인)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Supabase env not configured' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Invalid auth', detail: userError?.message ?? null }, 401);
  }

  // 2) Azure issueToken 호출
  const azureKey = Deno.env.get('AZURE_SPEECH_KEY');
  const azureRegion = Deno.env.get('AZURE_SPEECH_REGION') || 'eastus';

  if (!azureKey) {
    return jsonResponse({ error: 'AZURE_SPEECH_KEY not configured' }, 500);
  }

  const azureRes = await fetch(
    `https://${azureRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': azureKey,
        'Content-Length': '0',
      },
    },
  );

  if (!azureRes.ok) {
    const errorText = await azureRes.text().catch(() => '');
    return jsonResponse(
      {
        error: 'Azure issueToken failed',
        status: azureRes.status,
        detail: errorText.slice(0, 500),
      },
      502,
    );
  }

  const azureToken = await azureRes.text();
  // Azure 토큰은 10분 만료. 만료 1분 전 갱신 권장 → expiresAt = now + 9분.
  const expiresAt = Date.now() + 9 * 60 * 1000;

  return jsonResponse({
    token: azureToken,
    region: azureRegion,
    expiresAt,
  });
});
