/**
 * Edge Function: pick-reco
 *
 * 클라우드 Routine(클로드)이 호출하는 DB 게이트웨이. service role 키는 이 함수 안에만 있고
 * 루틴엔 저권한 토큰(PICK_RECO_TOKEN)만 둔다 → 토큰 누출돼도 피해는 "추천 스냅샷 교체"로 한정.
 * (Today ai-comment 미러. pick 는 owner별 개인 추천 — spec D4 격리.)
 *
 * 인증: 헤더 `x-pick-reco-token` == secret PICK_RECO_TOKEN (상수시간 비교). user JWT 불필요.
 * 액션 (?action= 또는 body.action):
 *   context → 추천 생성 컨텍스트. body.owner_id 주면 그 owner 만(평가 없으면 []),
 *             없으면 재생성 필요한 owner 전체(pendingOwners) 배열.
 *   submit  → body {owner_id, batch_id, recommendations[]} 를 그 owner 추천으로 교체.
 *
 * 순수 로직(constantTimeEqual/pendingOwners/toOwnerContext)은 ./logic.js (vitest 공용).
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Supabase 자동 주입), PICK_RECO_TOKEN
 * 옵션 env: PICK_SETTLE_MINUTES(기본 15)
 */

// @ts-ignore — Deno std
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
// @ts-ignore — 로컬 순수 로직 (Deno 가 .js 임포트)
import { constantTimeEqual, pendingOwners, toOwnerContext, ratedKey, excludeRatedRecs } from './logic.js';

// @ts-ignore — Deno globals
declare const Deno: { env: { get(k: string): string | undefined }; serve: (h: (req: Request) => Response | Promise<Response>) => void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PICK_RECO_TOKEN = Deno.env.get('PICK_RECO_TOKEN');
const SETTLE_MS = Number(Deno.env.get('PICK_SETTLE_MINUTES') || 15) * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-pick-reco-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type Rating = { owner_id: string; media_type: string; title: string; year: number | null; rating: number; meta: Record<string, unknown>; updated_at: string; deleted_at: string | null };
type Reco = { owner_id: string; generated_at: string };

const PAGE = 1000;
// PostgREST 기본 1000행 상한 → range 페이지네이션으로 전량 로드.
async function readAll<T>(table: string, cols: string, eq?: [string, string]): Promise<T[]> {
  let from = 0; const all: T[] = [];
  for (;;) {
    let q = sb.from(table).select(cols).range(from, from + PAGE - 1);
    if (eq) q = q.eq(eq[0], eq[1]);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const r of (data || [])) all.push(r as T);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function runContext(owner_id?: string) {
  if (owner_id) {
    const ratings = await readAll<Rating>('pick_ratings', 'owner_id,media_type,title,year,rating,meta,updated_at,deleted_at', ['owner_id', owner_id]);
    const live = ratings.filter((r) => !r.deleted_at);
    if (!live.length) return [];
    return [toOwnerContext(owner_id, live)];
  }
  const ratings = await readAll<Rating>('pick_ratings', 'owner_id,media_type,title,year,rating,meta,updated_at,deleted_at');
  const recos = await readAll<Reco>('pick_recommendations', 'owner_id,generated_at');
  const owners = pendingOwners(ratings, recos, SETTLE_MS, Date.now());
  return owners.map((oid) => toOwnerContext(oid, ratings.filter((r) => r.owner_id === oid && !r.deleted_at)));
}

type Replace = { kind?: string; source_work?: string };
async function runSubmit(owner_id: string, batch_id: string, recommendations: Array<Record<string, unknown>>, replace?: Replace) {
  const now = new Date().toISOString();
  // 생성 단계 결정적 제외 — 이미 평가한 작품은 추천(홈·갈래)에 넣지 않는다.
  // 에이전트(LLM)에 rated_keys 제외를 지시하지만 소프트라 누락 가능 + 평가가 생성 이후일 수도 있음 → 여기서 강제.
  const ratings = await readAll<Rating>('pick_ratings', 'media_type,title,year,deleted_at', ['owner_id', owner_id]);
  const ratedKeys = new Set(ratings.filter((r) => !r.deleted_at).map((r) => ratedKey(r.media_type, r.title, r.year)));
  const fresh = excludeRatedRecs(recommendations, ratedKeys);
  const dropped = recommendations.length - fresh.length;
  const rows = fresh.map((r) => ({
    owner_id,
    media_type: r.media_type,
    title: r.title,
    year: (r.year as number) ?? null,
    external_id: (r.external_id as string) ?? null,
    reason: (r.reason as string) || '',
    poster_url: (r.poster_url as string) ?? null,
    kind: r.kind === 'branch' ? 'branch' : 'home',
    source_work: (r.source_work as string) ?? null,
    basis: r.basis ?? [],
    batch_id,
    generated_at: now,
  }));
  // 교체 범위 — replace 없으면 owner 전량(backward compat); {kind:'home'}=홈만(갈래 보존);
  // {kind:'branch',source_work}=그 작품 갈래만(홈·타 작품 갈래 보존).
  let del = sb.from('pick_recommendations').delete().eq('owner_id', owner_id);
  if (replace?.kind === 'home') del = del.eq('kind', 'home');
  else if (replace?.kind === 'branch') del = del.eq('kind', 'branch').eq('source_work', replace.source_work ?? '');
  const { error: delErr } = await del;
  if (delErr) return json(500, { status: 'error', message: `delete: ${delErr.message}` });
  if (rows.length) {
    const { error: insErr } = await sb.from('pick_recommendations').insert(rows);
    if (insErr) return json(500, { status: 'error', message: `insert: ${insErr.message}` });
  }
  return json(200, { status: 'ok', owner_id, inserted: rows.length, dropped, scope: replace?.kind ?? 'all' });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { status: 'error', message: 'Method not allowed' });

  if (!PICK_RECO_TOKEN) return json(503, { status: 'error', message: 'PICK_RECO_TOKEN not configured' });
  if (!constantTimeEqual(req.headers.get('x-pick-reco-token'), PICK_RECO_TOKEN)) {
    return json(401, { status: 'error', message: 'Unauthorized' });
  }

  let body: { action?: string; owner_id?: string; batch_id?: string; recommendations?: Array<Record<string, unknown>>; replace?: Replace } = {};
  try { body = await req.json(); } catch { /* empty body allowed for context */ }
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || body.action || 'context';

  try {
    if (action === 'context') {
      return json(200, await runContext(body.owner_id));
    }
    if (action === 'submit') {
      if (!body.owner_id || !body.batch_id || !Array.isArray(body.recommendations) || !body.recommendations.length) {
        return json(400, { status: 'error', message: 'Missing owner_id, batch_id, or recommendations' });
      }
      return await runSubmit(body.owner_id, body.batch_id, body.recommendations, body.replace);
    }
    return json(400, { status: 'error', message: `Unknown action: ${action}` });
  } catch (e) {
    return json(500, { status: 'error', message: (e as Error).message });
  }
});
