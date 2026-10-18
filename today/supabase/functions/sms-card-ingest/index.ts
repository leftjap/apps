/**
 * Edge Function: sms-card-ingest
 *
 * iOS 단축어 → 카드사 SMS 본문 POST → today_expenses 자동 INSERT.
 *
 * Request:
 *   Headers:  X-Ingest-Token: <per-device hex>
 *             Content-Type:    application/json
 *   Body:     { text: string, received_at: string (original ISO8601), ingest_channel?: 'live' | 'backfill' | 'paste' }
 *
 * Response (200):
 *   ok        | duplicate                      → { status, expense_id, amount_krw, merchant, category, kind }
 *   rejected                                    → { status: 'rejected', reason }
 *   unparsed | review                           → { status, expense_id, reason? }
 *   Review rows retain sms_raw with a null amount; no balance adjustment is invented.
 * Response (401): 토큰 무효 / 만료
 * Response (400): body invalid
 * Response (500): 내부 오류
 */

// @ts-ignore — Deno std (Supabase 환경)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { parseCardSms } from '../_shared/cardSmsParser.js';
import { planSmsIngest, validateIngestBody } from './ingest.js';
import {
  cleanMerchantName,
  autoMatchCategoryByKeyword,
} from '../_shared/expense-classifier.js';
// 2026-05-12 Wave 11.8 — getBrandByMerchant / getCategoryByBrand 코드 freeze 참조 제거.
// 사용자별 today_user_merchant_aliases / today_user_brand_categories DB 쿼리로 전환.

// @ts-ignore — Deno globals
declare const Deno: { env: { get(k: string): string | undefined }; serve: (h: (req: Request) => Response | Promise<Response>) => void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { status: 'error', message: 'Method not allowed' });

  const token = req.headers.get('X-Ingest-Token');
  if (!token) return json(401, { status: 'error', message: 'Missing X-Ingest-Token' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { status: 'error', message: 'Invalid JSON body' });
  }
  const input = validateIngestBody(body);
  if (!input.ok) return json(400, { status: 'error', message: input.reason });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  try {
    const { data: tokenRow, error: tokenErr } = await sb
      .from('today_sms_ingest_tokens')
      .select('owner_id')
      .eq('token', token)
      .maybeSingle();
    if (tokenErr) return json(500, { status: 'error', message: 'Token lookup failed' });
    if (!tokenRow) return json(401, { status: 'error', message: 'Invalid token' });

    // 과거 복구·붙여넣기는 폰 자동화 정상 작동의 증거가 아니다.
    if (input.ingest_channel === 'live') {
      try {
        await sb.from('today_sms_ingest_tokens').update({ last_used_at: new Date().toISOString() }).eq('token', token);
      } catch (_) { /* health timestamp failure must not discard a payment */ }
    }
    return await handleIngest(sb, tokenRow.owner_id, input);
  } catch (_) {
    // Database errors may contain row contents. Return only an actionable generic error.
    return json(500, { status: 'error', message: 'Ingest failed; retry safely' });
  }
});

// Include tombstones and manually changed rows. The existing schema has no normalized
// SMS index, so legacy matching must read the owner's rows, in bounded pages.
async function loadExisting(sb: any, owner_id: string) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await sb.from('today_expenses')
      .select('id,owner_id,spent_at,received_at,created_at,deleted_at,source,sms_raw,amount_krw,merchant_raw,merchant,brand,category,card,currency,foreign_amount,meta')
      .eq('owner_id', owner_id).order('id').range(offset, offset + pageSize - 1);
    if (error || !Array.isArray(data)) throw new Error('Expense lookup failed');
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

function decisionBody(decision: any) {
  if (!decision.row) return decision;
  const row = decision.row;
  return {
    status: decision.status, reason: decision.reason, expense_id: row.id,
    matched_expense_id: decision.matched_expense_id,
    amount_krw: row.amount_krw, merchant: row.merchant, category: row.category, kind: row.meta.sms_kind,
  };
}

async function handleIngest(sb: any, owner_id: string, input: any) {
  const options = { owner_id, ...input };
  const initial = await planSmsIngest(options);
  if (initial.status === 'rejected') return json(200, decisionBody(initial));
  const existing = await loadExisting(sb, owner_id);
  const decision = await planSmsIngest({ ...options, existing });
  if (!('row' in decision) || !decision.row) return json(200, decisionBody(decision));

  const row = decision.row;
  // A matched cancellation inherits the original's user-edited labels.
  if (decision.status === 'ok' && row.meta.sms_kind !== 'cancellation') {
    const enriched = await enrichByKind(sb, owner_id, parseCardSms(input.text));
    Object.assign(row, enriched);
  }
  const { error } = await sb.from('today_expenses').insert(row).select('id').single();
  if (error) {
    if (error.code === '23505') {
      // Resolve a concurrent deterministic-ID or legacy unique-key conflict by
      // reading the stored row, never by overwriting it with an upsert.
      const refreshed = await loadExisting(sb, owner_id);
      const raced = await planSmsIngest({ ...options, existing: refreshed });
      if (raced.status === 'duplicate') return json(200, decisionBody(raced));
    }
    return json(500, { status: 'error', message: 'Expense insert failed; retry safely' });
  }
  return json(200, decisionBody(decision));
}

// ─── kind 별 merchant/brand/category 결정 ───
async function enrichByKind(sb: any, owner_id: string, parsed: any) {
  // scheduled_hipass / transit — 강제 매핑
  if (parsed.kind === 'scheduled_hipass') {
    return { merchant: '하이패스', brand: null, category: 'transport' };
  }
  if (parsed.kind === 'transit') {
    return { merchant: '후불교통', brand: null, category: 'transport' };
  }

  // 그 외 (domestic / installment / overseas / auto): classifier 통과
  const cleaned = cleanMerchantName(parsed.merchant_raw) || parsed.merchant_raw || null;

  // 1) 사용자 룰 우선 (today_merchant_rules where scope='user' and user_id=owner_id)
  let brand: string | null = null;
  let category: string | null = null;
  if (cleaned) {
    const { data: rules } = await sb
      .from('today_merchant_rules')
      .select('pattern, brand, category, priority')
      .eq('scope', 'user')
      .eq('user_id', owner_id)
      .order('priority', { ascending: false });
    if (rules && rules.length) {
      for (const rule of rules) {
        if (rule.pattern && cleaned.includes(rule.pattern)) {
          brand = rule.brand ?? null;
          category = rule.category ?? null;
          break;
        }
      }
    }
  }

  // 2) 사용자별 DB 폴백 — today_user_merchant_aliases (merchant→brand) +
  //    today_user_brand_categories (brand→category). 2026-05-12 Wave 11.8.
  //    코드 freeze (BRAND_CATEGORY_MAP / MERCHANT_TO_BRAND) 참조 제거.
  if (!brand && cleaned) {
    const { data: aliases } = await sb
      .from('today_user_merchant_aliases')
      .select('merchant_pattern, brand')
      .eq('user_id', owner_id);
    if (aliases && aliases.length) {
      // cleaned 가 merchant_pattern 포함하면 매칭 (가장 긴 pattern 우선)
      const sorted = [...aliases].sort((a, b) => b.merchant_pattern.length - a.merchant_pattern.length);
      const hit = sorted.find((a) => cleaned.includes(a.merchant_pattern));
      if (hit) brand = hit.brand;
    }
  }
  if (!category && brand) {
    const { data: bc } = await sb
      .from('today_user_brand_categories')
      .select('category_id')
      .eq('user_id', owner_id)
      .eq('brand', brand)
      .maybeSingle();
    if (bc?.category_id) category = bc.category_id;
  }

  // 3) 키워드 매칭 폴백 (autoMatchCategoryByKeyword) — '주식회사우아' 같은 brand 미매핑 가맹점
  //    keep 의 동작과 동일. 'etc' 반환 시 null 로 정규화 (UI 에서 직접 etc 보단 빈값이 명확).
  if (!category && cleaned) {
    const auto = autoMatchCategoryByKeyword(cleaned);
    if (auto && auto !== 'etc') category = auto;
  }

  return { merchant: cleaned, brand, category };
}
