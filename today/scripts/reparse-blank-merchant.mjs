/**
 * source='sms' 인데 merchant 가 NULL 로 들어간 행을, 보강된 파서로 재파싱 + 재분류해서 UPDATE.
 *
 * 배경: 현대백화점카드 멀티라인 포맷을 구 파서가 못 읽어 merchant·card·category 가 NULL 로 저장됨.
 *       파서 수정(cardSmsParser.js) 후, 이미 저장된 행은 sms_raw 를 다시 돌려 채운다.
 *
 * 분류는 _analyze-uncategorized.mjs 와 동일 경로:
 *   cleanMerchantName → getBrandByMerchant → getCategoryByBrand → (폴백) autoMatchCategoryByKeyword
 *
 * usage:
 *   node scripts/reparse-blank-merchant.mjs           # dry-run (변경 미적용, 미리보기)
 *   node scripts/reparse-blank-merchant.mjs --apply   # 실제 UPDATE
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCardSms } from '../supabase/functions/_shared/cardSmsParser.js';
import Classifier from '../supabase/functions/_shared/expense-classifier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#') || !s.includes('=')) continue;
    const i = s.indexOf('=');
    env[s.slice(0, i).trim()] = s.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv(join(__dirname, '..', '.env.local'));
const URL = env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락 — today/.env.local 확인');

const APPLY = process.argv.includes('--apply');
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

/** merchant_raw → { merchant, brand, category } (enrich/분석 스크립트와 동일 로직). */
function classify(merchantRaw) {
  const cleaned = Classifier.cleanMerchantName(merchantRaw) || merchantRaw || null;
  const brand = cleaned ? Classifier.getBrandByMerchant(cleaned) : null;
  let category = brand ? Classifier.getCategoryByBrand(brand) : null;
  if (!category && cleaned) {
    const auto = Classifier.autoMatchCategoryByKeyword(cleaned);
    if (auto && auto !== 'etc') category = auto;
  }
  return { merchant: cleaned, brand, category };
}

const q = 'source=eq.sms&merchant=is.null&amount_krw=not.is.null'
  + '&select=id,spent_at,amount_krw,sms_raw,card,merchant,brand,category';
const rows = await (await fetch(`${URL}/rest/v1/today_expenses?${q}`, { headers })).json();

console.log(`대상 ${rows.length}건  (mode: ${APPLY ? 'APPLY' : 'DRY-RUN'})\n`);

let updated = 0;
let skipped = 0;
for (const row of rows) {
  const parsed = parseCardSms(row.sms_raw || '');
  if (!parsed || !parsed.merchant_raw) {
    console.log(`SKIP  ${row.id}  — 재파싱 merchant 없음 (sms_raw: ${(row.sms_raw || '').replace(/\s+/g, ' ').slice(0, 50)})`);
    skipped += 1;
    continue;
  }
  const { merchant, brand, category } = classify(parsed.merchant_raw);
  const patch = {
    merchant,
    merchant_raw: parsed.merchant_raw,
    card: parsed.card ?? row.card,
    brand,
    category,
  };
  console.log(`${(row.spent_at || '').slice(0, 16)}  ${row.amount_krw}원  [${row.id}]`);
  console.log(`  before: card=${row.card} / merchant=${row.merchant} / brand=${row.brand} / cat=${row.category}`);
  console.log(`  after : card=${patch.card} / merchant=${patch.merchant} / brand=${patch.brand} / cat=${patch.category}`);
  if (APPLY) {
    const res = await fetch(`${URL}/rest/v1/today_expenses?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
    if (res.ok) { console.log('  → UPDATED'); updated += 1; }
    else { console.log(`  → FAIL ${res.status} ${await res.text()}`); }
  }
  console.log('');
}

console.log(`\n요약: 대상 ${rows.length} / ${APPLY ? `적용 ${updated}` : '미적용(dry-run)'} / skip ${skipped}`);
if (!APPLY) console.log('적용하려면: node scripts/reparse-blank-merchant.mjs --apply');
