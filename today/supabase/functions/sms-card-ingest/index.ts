/**
 * Edge Function: sms-card-ingest
 *
 * iOS 단축어 → 카드사 SMS 본문 POST → today_expenses 자동 INSERT.
 *
 * Request:
 *   Headers:  X-Ingest-Token: <per-device hex>
 *             Content-Type:    application/json
 *   Body:     { text: string, received_at: string (ISO8601) }
 *
 * Response (200):
 *   ok        | duplicate                      → { status, expense_id, amount_krw, merchant, category, kind }
 *   rejected                                    → { status: 'rejected', reason }
 *   unparsed                                    → { status: 'unparsed', expense_id }
 * Response (401): 토큰 무효 / 만료
 * Response (400): body invalid
 * Response (500): 내부 오류
 */

// @ts-ignore — Deno std (Supabase 환경)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { parseCardSms } from '../_shared/cardSmsParser.js';
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

  let body: { text?: string; received_at?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { status: 'error', message: 'Invalid JSON body' });
  }
  const { text, received_at } = body;
  if (!text || typeof text !== 'string') return json(400, { status: 'error', message: 'Missing text' });
  if (!received_at) return json(400, { status: 'error', message: 'Missing received_at' });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // 토큰 → owner_id
  const { data: tokenRow, error: tokenErr } = await sb
    .from('today_sms_ingest_tokens')
    .select('owner_id')
    .eq('token', token)
    .maybeSingle();
  if (tokenErr) return json(500, { status: 'error', message: tokenErr.message });
  if (!tokenRow) return json(401, { status: 'error', message: 'Invalid token' });
  const owner_id: string = tokenRow.owner_id;

  // last_used_at 갱신 — await로 변경 (2026-05-26 v2): fire-and-forget이 Deno serverless
  // process 종료로 abort 되어 항상 NULL 유지되던 spec §154 문제 해소. 자동화 발화 시점 추적 가능.
  try {
    await sb.from('today_sms_ingest_tokens').update({ last_used_at: new Date().toISOString() }).eq('token', token);
  } catch (_) { /* 실패해도 ingest 자체는 진행 */ }

  return await handleIngest(sb, owner_id, text, received_at);
});

// ─── 메인 처리 ───
async function handleIngest(sb: any, owner_id: string, text: string, received_at: string) {
  const parsed: any = parseCardSms(text);

  // 거절/취소/명세서/일반 결제예정 → 저장 안 함
  if (parsed === null && isRejectPattern(text)) {
    return json(200, { status: 'rejected', reason: '거절/취소/명세서/결제예정' });
  }

  // unparsed: 진짜 미지원 패턴 — sms_raw 만 보존, amount_krw NULL
  if (parsed === null) {
    const { data, error } = await sb
      .from('today_expenses')
      .insert({
        owner_id,
        spent_at: received_at,
        received_at,
        source: 'sms',
        sms_raw: text,
        amount_krw: null,
        meta: { sms_kind: 'unparsed' },
      })
      .select('id')
      .single();
    if (error) {
      // unique conflict (동일 sms_raw 이미 unparsed 로 저장됨)
      if (error.code === '23505') return json(200, { status: 'duplicate' });
      return json(500, { status: 'error', message: error.message });
    }
    return json(200, { status: 'unparsed', expense_id: data.id });
  }

  // 정상 파싱 — kind별 후처리
  const enriched = await enrichByKind(sb, owner_id, parsed);

  const insertRow = {
    owner_id,
    spent_at: received_at,
    received_at,
    source: 'sms',
    sms_raw: text,
    amount_krw: parsed.amount_krw,
    merchant_raw: parsed.merchant_raw ?? null,
    merchant: enriched.merchant,
    brand: enriched.brand,
    category: enriched.category,
    card: parsed.card ?? null,
    currency: parsed.currency ?? null,
    foreign_amount: parsed.foreign_amount ?? null,
    installment_months: parsed.installment_months ?? null,
    meta: { sms_kind: parsed.kind },
  };

  const { data, error } = await sb.from('today_expenses').insert(insertRow).select('id').single();

  if (error) {
    // unique (owner_id, sms_raw, spent_at) — 이미 처리됨
    if (error.code === '23505') {
      const { data: existing } = await sb
        .from('today_expenses')
        .select('id, amount_krw, merchant, category')
        .eq('owner_id', owner_id)
        .eq('sms_raw', text)
        .eq('spent_at', received_at)
        .maybeSingle();
      return json(200, {
        status: 'duplicate',
        expense_id: existing?.id ?? null,
        amount_krw: existing?.amount_krw ?? parsed.amount_krw,
        merchant: existing?.merchant ?? enriched.merchant,
        category: existing?.category ?? enriched.category,
        kind: parsed.kind,
      });
    }
    return json(500, { status: 'error', message: error.message });
  }

  return json(200, {
    status: 'ok',
    expense_id: data.id,
    amount_krw: parsed.amount_krw,
    merchant: enriched.merchant,
    category: enriched.category,
    kind: parsed.kind,
  });
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

// reject 패턴 — parser 가 null 반환한 게 거절/취소/명세서/결제예정 때문인지 판별 (저장 안 함)
function isRejectPattern(text: string): boolean {
  if (/거절|취소/.test(text)) return true;
  if (/문자명세서/.test(text)) return true;
  // 후불하이패스 결제예정은 parser 가 처리 → 여기 도달하면 일반 결제예정
  if (/결제예정/.test(text) && !/후불하이패스/.test(text)) return true;
  // 카드사 비결제 안내·광고 (parser 의 reject 분기와 동기)
  if (/\(광고\)/.test(text)) return true;
  if (/,\s*[^\]\n]*안내\]/.test(text)) return true;
  if (/차단\s*(신청|서비스)/.test(text)) return true;
  if (/비밀번호\s*변경/.test(text)) return true;
  if (/카드(발급|교부)/.test(text)) return true;
  // 0원 외화 결제 — 사전승인/취소 케이스. parser 와 동기.
  if (/(USD|EUR|GBP|JPY|CNY|THB|VND|PHP|HUF|KHR|SGD|KRW|MYR|INR|CAD|AUD|AED|TWD|HKD)\s+0(?:\.0+)?\b/.test(text)) return true;
  if (/\b0(?:\.0+)?\s*\((?:US\$?|[A-Z]{3})\)/.test(text)) return true;
  return false;
}
