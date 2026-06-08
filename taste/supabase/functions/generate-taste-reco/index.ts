/**
 * Edge Function: generate-taste-reco
 *
 * "다시 추천" 버튼 → 이 함수가 그 자리에서 즉시 수행: 평가 읽기 → Claude API(Messages)로 추천 생성
 * → 실재검증·포스터 보강 → owner 추천 교체. Routine·/fire·스케줄 없음 (on-demand 동기 생성).
 *
 * 인증(둘 중 하나):
 *   - 유저 JWT (버튼): Authorization: Bearer <user JWT> → owner = 그 사용자
 *   - x-taste-reco-token (cron/수동): + body.owner_id → owner = body.owner_id
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (자동),
 *          ANTHROPIC_API_KEY (필수), TASTE_RECO_TOKEN (cron/수동 경로용)
 * 옵션 env: ANTHROPIC_MODEL (기본 claude-opus-4-8 — haiku/sonnet 으로 비용 조절 가능)
 */

// @ts-ignore — Deno std
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// @ts-ignore — Deno globals
declare const Deno: { env: { get(k: string): string | undefined }; serve: (h: (req: Request) => Response | Promise<Response>) => void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const TASTE_RECO_TOKEN = Deno.env.get('TASTE_RECO_TOKEN');
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-opus-4-8';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-taste-reco-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// 상수시간 토큰 비교 (logic.js 와 동일 — 자가포함 위해 inline).
function constantTimeEqual(a: string | null, b: string): boolean {
  if (typeof a !== 'string') return false;
  const ea = new TextEncoder().encode(a); const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let d = 0; for (let i = 0; i < ea.length; i++) d |= ea[i] ^ eb[i];
  return d === 0;
}
const ratedKey = (mt: string, title: string, year: number | null) =>
  `${mt}|${String(title || '').trim().toLowerCase()}|${year ?? ''}`;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type Rating = { media_type: string; title: string; year: number | null; rating: number; meta: Record<string, unknown>; deleted_at: string | null };

const PAGE = 1000;
async function readRatings(owner: string): Promise<Rating[]> {
  let from = 0; const all: Rating[] = [];
  for (;;) {
    const { data, error } = await sb.from('taste_ratings')
      .select('media_type,title,year,rating,meta,deleted_at').eq('owner_id', owner).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of (data || [])) all.push(r as Rating);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all.filter((r) => !r.deleted_at);
}

type Cand = { media_type: string; title: string; year: number; reason: string; title_en?: string };

async function generate(favorites: string[], avoid: string[]): Promise<Cand[]> {
  const system = '너는 taste 앱의 개인 취향 추천 엔진이다. 사용자의 영화·드라마·책 별점(0.5~5.0)을 보고 다음에 볼·읽을 작품을 고른다.\n'
    + '규칙: ① ★3.5+ = 좋아한 신호, ★2.0↓·특히 0.5(비추) = 회피 신호. ② 실제 존재하는 작품만(환각 금지). '
    + '③ 이유(reason)는 사용자의 최애를 근거로 한 한국어 한 문장. ④ 영화·책 교차 추천 가능. '
    + '⑤ 드라마는 media_type=movie 로 하고 reason 끝에 "(드라마)" 표기. ⑥ 영화·드라마는 title_en(영문 원제)도 채운다.';
  const user = `최애(높은 별점):\n${favorites.join('\n')}\n\n비추/저별점(회피):\n${avoid.join('\n') || '(없음)'}\n\n`
    + '위 취향에 맞춰 추천 후보를 만들어라: 영화/드라마 14편 + 책 8권. 이미 봤을 법한 작품도 후보로 내라(중복 제거는 시스템이 함).';
  const schema = {
    type: 'object',
    properties: {
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            media_type: { type: 'string', enum: ['movie', 'book'] },
            title: { type: 'string' },
            year: { type: 'integer' },
            reason: { type: 'string' },
            title_en: { type: 'string' },
          },
          required: ['media_type', 'title', 'year', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['recommendations'],
    additionalProperties: false,
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system, messages: [{ role: 'user', content: user }], output_config: { format: { type: 'json_schema', schema } } }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = (data.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
  const parsed = JSON.parse(text);
  return (parsed.recommendations || []) as Cand[];
}

async function aladinBook(title: string): Promise<{ cover: string | null; isbn: string | null; year: number | null }> {
  try {
    const qs = new URLSearchParams({ Query: title, QueryType: 'Keyword', MaxResults: '1', start: '1', SearchTarget: 'Book', output: 'js', Version: '20131101', Cover: 'Big' });
    const r = await fetch(`${SUPABASE_URL}/functions/v1/aladin/ItemSearch.aspx?${qs}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
    if (!r.ok) return { cover: null, isbn: null, year: null };
    const d = await r.json();
    const it = (d.item || [])[0];
    if (!it) return { cover: null, isbn: null, year: null };
    const y = (it.pubDate || '').slice(0, 4);
    return { cover: it.cover || null, isbn: it.isbn13 || null, year: /^\d{4}$/.test(y) ? Number(y) : null };
  } catch { return { cover: null, isbn: null, year: null }; }
}

async function wikiThumb(lang: string, title: string): Promise<string | null> {
  try {
    const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: { accept: 'application/json', 'user-agent': 'taste-reco/1.0 (https://leftjap.github.io/apps/taste)' } });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.thumbnail?.source || null;
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { status: 'error', message: 'Method not allowed' });
  if (!ANTHROPIC_API_KEY) return json(503, { status: 'error', message: 'ANTHROPIC_API_KEY not configured' });

  let body: { owner_id?: string } = {};
  try { body = await req.json(); } catch { /* empty ok */ }

  // 인증 — 토큰(cron/수동) 또는 유저 JWT(버튼).
  let owner_id: string | null = null;
  const token = req.headers.get('x-taste-reco-token');
  if (TASTE_RECO_TOKEN && token && constantTimeEqual(token, TASTE_RECO_TOKEN) && body.owner_id) {
    owner_id = body.owner_id;
  } else {
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data } = await createClient(SUPABASE_URL, ANON_KEY).auth.getUser(jwt);
    owner_id = data?.user?.id || null;
  }
  if (!owner_id) return json(401, { status: 'error', message: 'Unauthorized' });

  try {
    const ratings = await readRatings(owner_id);
    if (!ratings.length) return json(200, { status: 'noop', message: '평가가 없어 추천을 만들 수 없어요.' });

    const fav = ratings.filter((r) => r.rating >= 3.5).sort((a, b) => b.rating - a.rating).slice(0, 80)
      .map((r) => `${r.media_type === 'book' ? '책' : (r.meta?.subtype === 'tv' ? '드라마' : '영화')} · ${r.title} (${r.year ?? '?'}) ★${r.rating}`);
    const avoid = ratings.filter((r) => r.rating <= 2.0).slice(0, 40).map((r) => `${r.title} (${r.year ?? '?'}) ★${r.rating}`);
    const ratedSet = new Set(ratings.map((r) => ratedKey(r.media_type, r.title, r.year)));

    const cands = await generate(fav, avoid);
    const fresh = cands.filter((c) => c && c.title && !ratedSet.has(ratedKey(c.media_type, c.title, c.year)));

    const batch_id = new Date().toISOString().slice(0, 16);
    const now = new Date().toISOString();
    const rows = await Promise.all(fresh.map(async (c) => {
      let poster: string | null = null; let ext: string | null = null; let year = c.year ?? null;
      if (c.media_type === 'book') {
        const b = await aladinBook(c.title);
        poster = b.cover; ext = b.isbn; if (b.year) year = b.year;
      } else {
        poster = await wikiThumb('ko', c.title) || (c.title_en ? await wikiThumb('en', c.title_en) : null);
      }
      return { owner_id, media_type: c.media_type === 'book' ? 'book' : 'movie', title: c.title, year, external_id: ext, reason: c.reason || '', poster_url: poster, batch_id, generated_at: now };
    }));
    if (!rows.length) return json(200, { status: 'noop', message: '새 추천 후보가 모두 이미 평가한 작품이었어요.' });

    const { error: delErr } = await sb.from('taste_recommendations').delete().eq('owner_id', owner_id);
    if (delErr) return json(500, { status: 'error', message: `delete: ${delErr.message}` });
    const { error: insErr } = await sb.from('taste_recommendations').insert(rows);
    if (insErr) return json(500, { status: 'error', message: `insert: ${insErr.message}` });

    return json(200, { status: 'ok', owner_id, count: rows.length });
  } catch (e) {
    return json(500, { status: 'error', message: (e as Error).message });
  }
});
