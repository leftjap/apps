#!/usr/bin/env node
/**
 * Keep 앱 데이터 (~/Downloads/{gio,soyoun}_app_database.json) → Today 앱 import.
 *
 * 사용:
 *   node scripts/import-keep-data.js <file1.json> [<file2.json>] [--apply]
 *
 * 기본은 dry-run (통계 + 샘플만 출력). --apply 추가 시 실제 Supabase insert.
 *
 * 정책 (스펙 (deleted spec: today-app-spec.md) 기반):
 *
 * 1. import 대상 (스펙 line 1033 — "entries 건수 = keep `docs + memos`"):
 *    - gb_docs   → today_entries
 *    - gb_memos  → today_entries (kind='memo')
 *    - gb_expenses → today_expenses
 *
 * 2. Today 범위 외 (스킵):
 *    - gb_books  → 서재 별 앱 이관 (~/cowork/docs/서재/) (spec line 38, 1020)
 *    - gb_quotes → 어구록 별 앱 이관 (~/cowork/docs/서재/) (spec line 38, 1020)
 *    - gb_chk    → 루틴 기능 전면 삭제 (spec line 28, 1095)
 *    - gb_merchant_icons / gb_brand_icons → today_merchant_rules 매핑은 별 wave
 *
 * 3. user 결정 (옛 파트너 모드 sync 잔흔 처리):
 *    - 양쪽 파일을 함께 처리. 같은 driveId 가 양쪽 파일에 있으면 sync 잔흔.
 *    - **doc 채택 규칙**:
 *        a. driveId 가 다른 파일에 없음 (단독) → 본인 파일 user 의 글 (type 무시)
 *        b. driveId 가 양쪽 파일에 있음 (sync 잔흔) → type prefix 로 결정:
 *           type startsWith 'soyoun_' → soyoun 본체, 아니면 leftjap 본체
 *        c. 본체로 결정된 파일에서만 채택, 잔흔 쪽은 'sync_artifact' 로 skip.
 *
 * 4. 노이즈 필터:
 *    - 명시 테스트 제목 (`test`, `테스트 (지워도 됨)`, `비행일기 테스트 (지워도 됨)` 등) skip
 *    - 제목 + 본문(stripHtml) 합 5자 미만 skip
 *
 * 5. expenses: 사용자 수동 분류 의미 보존 — classifyMerchant 재분류 없이 raw category 그대로.
 *    - LEFTJAP/SOYOUN 상수에 미정의된 category (지오 'food', 소연 'subscribe') 도 raw 보존.
 *
 * 6. UUID: Keep id (epoch ms 문자열) 는 deterministic SHA-256 해시로 v4-shape uuid 변환 (재실행 멱등).
 *
 * --apply 모드 환경변수 (.env.local 에 추가, VITE_ prefix 없음 = 번들 미포함):
 *   VITE_SUPABASE_URL          기존 (anon 용과 동일 URL)
 *   SUPABASE_SERVICE_ROLE_KEY  필수 — RLS 우회. 절대 git/번들 포함 금지.
 *   USER_ID_LEFTJAP            지오의 Supabase auth.users.id (uuid)
 *   USER_ID_SOYOUN             소연의 Supabase auth.users.id (uuid)
 *
 * --apply 동작:
 *   - dry-run 과 동일하게 변환 → owner_id 만 placeholder → 실 uuid 로 치환
 *   - today_entries / today_expenses 에 batch 50건씩 upsert(onConflict='id')
 *   - deterministic UUID 라 재실행 멱등 (동일 keep id → 동일 uuid → upsert 가 update 로 동작)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ─── CLI 파싱 ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = { apply: false, files: [], skipEntries: false, skipExpenses: false };
for (const a of args) {
  if (a === '--apply') flags.apply = true;
  else if (a === '--skip-entries') flags.skipEntries = true;
  else if (a === '--skip-expenses') flags.skipExpenses = true;
  else if (a.startsWith('-')) { console.error(`알 수 없는 플래그: ${a}`); process.exit(1); }
  else flags.files.push(a);
}
if (flags.files.length === 0) {
  console.error('파일 경로가 필요합니다.');
  console.error('사용: node scripts/import-keep-data.js <file.json> [<file2.json>] [--apply] [--skip-entries|--skip-expenses]');
  process.exit(1);
}

// ─── 상수 ─────────────────────────────────────────────────────────────
// today_entry_kind enum (~/apps/today/supabase/migrations/0001_init.sql)
const ENTRY_KIND_ENUM = new Set(['navi', 'fiction', 'blog', 'soyoun_navi', 'flight_diary', 'soyoun_blog', 'memo']);
const EXPENSE_SOURCE_ENUM = new Set(['sms', 'manual', 'import']);

const NOISE_TITLES = new Set([
  'test', 'TEST', '테스트', '테스트 (지워도 됨)', '비행일기 테스트 (지워도 됨)',
]);

// dry-run 시 owner_id placeholder. apply 시 .env 의 USER_ID_LEFTJAP/SOYOUN 으로 교체.
const USER_PLACEHOLDER = {
  leftjap: '00000000-0000-4000-8000-000000000001',
  soyoun: '00000000-0000-4000-8000-000000000002',
};

const BATCH_SIZE = 50;

// ─── 유틸 ─────────────────────────────────────────────────────────────
function deterministicUuid(userKey, keepId) {
  const hash = crypto.createHash('sha256').update(`${userKey}|${keepId}`).digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

function stripHtml(s) {
  if (!s) return '';
  return String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function isNoiseDoc(title, content) {
  const t = (title || '').trim();
  const body = stripHtml(content || '');
  if (NOISE_TITLES.has(t)) return 'noise_title';
  if ((t.length + body.length) < 5) return 'too_short';
  return null;
}

function spentAtFromKeep(date, time) {
  if (!date) return null;
  const tm = time && /^\d{2}:\d{2}$/.test(time) ? time : '00:00';
  return `${date}T${tm}:00+09:00`;
}

function inferUserFromFilename(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base.includes('soyoun')) return 'soyoun';
  if (base.includes('gio') || base.includes('leftjap')) return 'leftjap';
  return null;
}

// ─── 변환 ─────────────────────────────────────────────────────────────
function transformDoc(doc, userKey, sourceKind /* 'docs' | 'memos' */) {
  const id = deterministicUuid(userKey, `${sourceKind}:${doc.id}`);
  // memos 는 항상 kind='memo'. docs 는 doc.type 사용 + enum 매핑.
  let kindRaw, kind;
  if (sourceKind === 'memos') {
    kindRaw = 'memo';
    kind = 'memo';
  } else {
    kindRaw = doc.type || 'navi';
    kind = ENTRY_KIND_ENUM.has(kindRaw) ? kindRaw : 'memo'; // 'daily' 등 미정의 → memo
  }
  const meta = {};
  if (doc.driveId) meta.driveId = doc.driveId;
  if (doc.tags) meta.tags = doc.tags;
  if (doc.location) meta.location = doc.location;
  if (doc.weather) meta.weather = doc.weather;
  if (doc.lat != null) meta.lat = doc.lat;
  if (doc.lng != null) meta.lng = doc.lng;
  meta.keepImportSrc = sourceKind;
  meta.keepImportSrcId = doc.id;
  if (kindRaw !== kind) meta.keepOriginalKind = kindRaw;
  return {
    id,
    owner_id: USER_PLACEHOLDER[userKey],
    kind,
    title: doc.title || null,
    content: doc.content || null,
    meta,
    // 사용자 결정 (2026-05-04): 오늘의 네비 (navi/soyoun_navi) 는 공유가 default.
    is_shared: kind === 'navi' || kind === 'soyoun_navi',
    pinned: !!doc.pinned,
    created_at: doc.created || null,
    updated_at: doc.updated || doc.created || null,
    deleted_at: null,
  };
}

function transformExpense(exp, userKey) {
  const id = deterministicUuid(userKey, `exp:${exp.id}`);
  const source = EXPENSE_SOURCE_ENUM.has(exp.source) ? exp.source : 'import';
  return {
    id,
    owner_id: USER_PLACEHOLDER[userKey],
    spent_at: spentAtFromKeep(exp.date, exp.time),
    amount_krw: Number(exp.amount) || 0,
    foreign_amount: null,
    currency: null,
    merchant_raw: exp.merchant || null,
    merchant: exp.merchant || null,
    brand: exp.brand || null,
    category: exp.category || null,
    card: exp.card || null,
    memo: exp.memo || null,
    merchant_url: null,
    source,
    sms_raw: null,
    received_at: null,
    meta: { keepImportSrcId: exp.id },
    created_at: exp.created || null,
    updated_at: exp.created || null,
    deleted_at: null,
  };
}

// ─── 1차 패스: cross-file driveId 인덱스 + 본체 결정 ──────────────────
function buildDriveIdIndex(filesPayload) {
  const idx = new Map(); // driveId → [{ fileUser, doc }, ...]
  for (const { fileUser, data } of filesPayload) {
    for (const doc of data.gb_docs || []) {
      if (!doc.driveId) continue;
      if (!idx.has(doc.driveId)) idx.set(doc.driveId, []);
      idx.get(doc.driveId).push({ fileUser, doc });
    }
  }
  return idx;
}

/** 양쪽 파일 모두 등장하는 driveId. 본체 결정. */
function decidePrimary(driveId, occurrences) {
  // occurrences: [{ fileUser, doc }, ...]
  if (occurrences.length < 2) return occurrences[0]?.fileUser || null;
  // type prefix 로 본체 결정 (어느 occurrence 의 type 으로 봐도 동일해야 정상)
  const types = new Set(occurrences.map((o) => o.doc.type));
  // type prefix 판정 — 양쪽 occurrence 의 type 이 다를 수 있음 (예: gio 파일엔 navi, soyoun 파일엔 navi 동일)
  // 두 occurrence 모두 type 이 같다면 같은 prefix → 동일 결정
  // 다르다면 (예: 한 쪽 navi, 다른 쪽 soyoun_navi) 가장 구체적인 prefix 우선
  const hasSoyounPrefix = [...types].some((t) => typeof t === 'string' && t.startsWith('soyoun_'));
  const hasNoPrefix = [...types].some((t) => typeof t === 'string' && !t.startsWith('soyoun_'));
  if (hasSoyounPrefix && !hasNoPrefix) return 'soyoun';
  if (!hasSoyounPrefix && hasNoPrefix) return 'leftjap';
  // 충돌 (양쪽 type 이 prefix 양상이 다름) — 보수적으로 type 의 첫 occurrence 우선
  return occurrences[0].doc.type?.startsWith('soyoun_') ? 'soyoun' : 'leftjap';
}

// ─── 파일 처리 ────────────────────────────────────────────────────────
function processAll(filesPayload) {
  const driveIdx = buildDriveIdIndex(filesPayload);

  const allStats = [];
  for (const { filePath, fileUser, data } of filesPayload) {
    const stats = {
      file: path.basename(filePath),
      fileUser,
      docs: {
        total: 0,
        kept: 0,
        skipped: { sync_artifact: 0, noise_title: 0, too_short: 0 },
        kindCounts: {},
        crossFileMatched: 0,
      },
      memos: {
        total: 0,
        kept: 0,
        skipped: { noise_title: 0, too_short: 0 },
      },
      expenses: {
        total: 0,
        byCategory: {},
        dateRange: { min: null, max: null },
        sourceCounts: {},
      },
      outOfScope: { quotes: 0, books: 0, chk: 0, merchant_icons: 0, brand_icons: 0 },
      samples: { docs: [], memos: [], expenses: [] },
      transformed: { entries: [], expenses: [] },
    };

    // ── gb_docs ──
    const docs = Array.isArray(data.gb_docs) ? data.gb_docs : [];
    stats.docs.total = docs.length;
    for (const d of docs) {
      const driveId = d.driveId;
      const occ = driveId ? driveIdx.get(driveId) || [] : [];
      const isCrossFile = occ.length >= 2;
      if (isCrossFile) stats.docs.crossFileMatched++;

      let owner;
      if (isCrossFile) {
        owner = decidePrimary(driveId, occ);
      } else {
        // 단독 — 본인 파일 user 의 글
        owner = fileUser;
      }
      if (owner !== fileUser) {
        stats.docs.skipped.sync_artifact++;
        continue;
      }
      const noise = isNoiseDoc(d.title, d.content);
      if (noise) {
        stats.docs.skipped[noise]++;
        continue;
      }
      const transformed = transformDoc(d, owner, 'docs');
      stats.docs.kept++;
      stats.docs.kindCounts[transformed.kind] = (stats.docs.kindCounts[transformed.kind] || 0) + 1;
      stats.transformed.entries.push(transformed);
      if (stats.samples.docs.length < 3) {
        stats.samples.docs.push({
          keepId: d.id, kind: transformed.kind, title: transformed.title,
          contentPreview: stripHtml(transformed.content || '').slice(0, 80),
          crossFile: isCrossFile,
        });
      }
    }

    // ── gb_memos ──
    const memos = Array.isArray(data.gb_memos) ? data.gb_memos : [];
    stats.memos.total = memos.length;
    for (const m of memos) {
      const noise = isNoiseDoc(m.title, m.content);
      if (noise) {
        stats.memos.skipped[noise]++;
        continue;
      }
      const transformed = transformDoc(m, fileUser, 'memos');
      stats.memos.kept++;
      stats.transformed.entries.push(transformed);
      if (stats.samples.memos.length < 2) {
        stats.samples.memos.push({
          keepId: m.id, title: transformed.title,
          contentPreview: stripHtml(transformed.content || '').slice(0, 80),
        });
      }
    }

    // ── gb_expenses ──
    const expenses = Array.isArray(data.gb_expenses) ? data.gb_expenses : [];
    stats.expenses.total = expenses.length;
    for (const e of expenses) {
      const t = transformExpense(e, fileUser);
      stats.transformed.expenses.push(t);
      const cat = e.category || '(unknown)';
      stats.expenses.byCategory[cat] = (stats.expenses.byCategory[cat] || 0) + 1;
      stats.expenses.sourceCounts[t.source] = (stats.expenses.sourceCounts[t.source] || 0) + 1;
      if (e.date) {
        if (!stats.expenses.dateRange.min || e.date < stats.expenses.dateRange.min) stats.expenses.dateRange.min = e.date;
        if (!stats.expenses.dateRange.max || e.date > stats.expenses.dateRange.max) stats.expenses.dateRange.max = e.date;
      }
      if (stats.samples.expenses.length < 3) {
        stats.samples.expenses.push({
          spent_at: t.spent_at, amount_krw: t.amount_krw, category: t.category, merchant: t.merchant,
        });
      }
    }

    // ── 범위 외 (별 앱 / 기능 제거) ──
    stats.outOfScope.quotes = Array.isArray(data.gb_quotes) ? data.gb_quotes.length : 0;
    stats.outOfScope.books = Array.isArray(data.gb_books) ? data.gb_books.length : 0;
    stats.outOfScope.chk = data.gb_chk && typeof data.gb_chk === 'object' ? Object.keys(data.gb_chk).length : 0;
    stats.outOfScope.merchant_icons = Array.isArray(data.gb_merchant_icons) ? data.gb_merchant_icons.length : 0;
    stats.outOfScope.brand_icons = data.gb_brand_icons && typeof data.gb_brand_icons === 'object' ? Object.keys(data.gb_brand_icons).length : 0;

    allStats.push(stats);
  }
  return allStats;
}

// ─── 출력 ─────────────────────────────────────────────────────────────
function reportFile(stats) {
  console.log('═'.repeat(78));
  console.log(`📁 ${stats.file} (user=${stats.fileUser})`);
  console.log('═'.repeat(78));

  console.log('\n[gb_docs → today_entries]');
  console.log(`  total in file: ${stats.docs.total}  (cross-file driveId 매치: ${stats.docs.crossFileMatched})`);
  console.log(`  kept: ${stats.docs.kept}`);
  console.log(`  skipped:`);
  for (const [k, v] of Object.entries(stats.docs.skipped)) {
    if (v > 0) console.log(`    - ${k}: ${v}`);
  }
  console.log(`  kind 분포 (kept):`);
  for (const [k, v] of Object.entries(stats.docs.kindCounts)) {
    console.log(`    - ${k}: ${v}`);
  }
  if (stats.samples.docs.length > 0) {
    console.log(`  샘플:`);
    for (const s of stats.samples.docs) {
      console.log(`    - kind=${s.kind}${s.crossFile?' (crossFile)':''} title=${JSON.stringify(s.title)} preview=${JSON.stringify(s.contentPreview)}`);
    }
  }

  console.log('\n[gb_memos → today_entries (kind=memo)]');
  console.log(`  total in file: ${stats.memos.total}`);
  console.log(`  kept: ${stats.memos.kept}`);
  for (const [k, v] of Object.entries(stats.memos.skipped)) {
    if (v > 0) console.log(`  skipped ${k}: ${v}`);
  }
  if (stats.samples.memos.length > 0) {
    console.log(`  샘플:`);
    for (const s of stats.samples.memos) {
      console.log(`    - title=${JSON.stringify(s.title)} preview=${JSON.stringify(s.contentPreview)}`);
    }
  }

  console.log('\n[gb_expenses → today_expenses]');
  console.log(`  total: ${stats.expenses.total}`);
  console.log(`  date range: ${stats.expenses.dateRange.min} → ${stats.expenses.dateRange.max}`);
  console.log(`  source: ${JSON.stringify(stats.expenses.sourceCounts)}`);
  console.log(`  category 분포:`);
  const sortedCats = Object.entries(stats.expenses.byCategory).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sortedCats) {
    console.log(`    - ${k}: ${v}`);
  }
  if (stats.samples.expenses.length > 0) {
    console.log(`  샘플:`);
    for (const s of stats.samples.expenses) {
      console.log(`    - ${s.spent_at} ${String(s.amount_krw).padStart(7)}원 [${s.category}] ${s.merchant}`);
    }
  }

  console.log('\n[Today 범위 외 (별 앱 이관 / 기능 제거)]');
  if (stats.outOfScope.quotes) console.log(`  - quotes: ${stats.outOfScope.quotes}건 → 어구록 별 앱 (~/cowork/docs/서재/)`);
  if (stats.outOfScope.books) console.log(`  - books: ${stats.outOfScope.books}건 → 서재 별 앱 (~/cowork/docs/서재/)`);
  if (stats.outOfScope.chk) console.log(`  - chk: ${stats.outOfScope.chk}일 → 루틴 기능 전면 삭제 (spec line 28)`);
  if (stats.outOfScope.merchant_icons) console.log(`  - merchant_icons: ${stats.outOfScope.merchant_icons}건 → today_merchant_rules 매핑은 별 wave`);
  if (stats.outOfScope.brand_icons) console.log(`  - brand_icons: ${stats.outOfScope.brand_icons}건 → today_merchant_rules 매핑은 별 wave`);
}

// ─── 환경변수 + .env.local 로더 (apply 전용) ─────────────────────────
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue; // 기존 export 우선
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    console.error(`\n환경변수 누락: ${name}`);
    console.error('필요한 환경변수 (.env.local):');
    console.error('  VITE_SUPABASE_URL          (.env.local 기존 항목)');
    console.error('  SUPABASE_SERVICE_ROLE_KEY  (.env.local 신규, VITE_ prefix 없음 = 번들 미포함)');
    console.error('  USER_ID_LEFTJAP / USER_ID_SOYOUN  (선택 — 미지정 시 service_role 로 auth.admin.listUsers 자동 조회)');
    process.exit(1);
  }
  return v;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validateUuid(name, val) {
  if (!UUID_RE.test(val)) {
    console.error(`${name} 가 uuid 형식 아님: ${val}`);
    process.exit(1);
  }
}

const EMAIL_TO_USERKEY = Object.freeze({
  'leftjap@gmail.com': 'leftjap',
  'soyoun312@gmail.com': 'soyoun',
});

/** USER_ID_* 환경변수에 없는 키는 service_role 로 auth.admin.listUsers 자동 조회. */
async function resolveUserIds(supabase, env) {
  const map = {
    leftjap: env.USER_ID_LEFTJAP || null,
    soyoun: env.USER_ID_SOYOUN || null,
  };
  if (map.leftjap && map.soyoun) return map;

  console.log('  • USER_ID_* 환경변수 부족 — auth.admin.listUsers 로 자동 조회');
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) {
    console.error('listUsers 실패:', error.message);
    process.exit(1);
  }
  for (const u of data.users || []) {
    const key = EMAIL_TO_USERKEY[u.email];
    if (key && !map[key]) map[key] = u.id;
  }
  for (const [key, val] of Object.entries(map)) {
    if (!val) {
      const email = Object.entries(EMAIL_TO_USERKEY).find(([_, k]) => k === key)?.[0];
      console.error(`${key} 의 uuid 자동 조회 실패 — auth.users 에 ${email} 없음. 가입(Google OAuth) 1회 필요.`);
      process.exit(1);
    }
  }
  console.log(`    leftjap: ${map.leftjap}`);
  console.log(`    soyoun:  ${map.soyoun}`);
  return map;
}

// ─── Supabase apply ───────────────────────────────────────────────────
async function applyAll(allStats, env) {
  // supabase-js 사용 (앱 dependency 에 이미 있음)
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // USER_ID_* 환경변수 → 없으면 listUsers 자동 조회
  const realUserId = await resolveUserIds(supabase, env);

  // placeholder → 실 uuid 치환 + 합치기
  const allEntries = [];
  const allExpenses = [];
  for (const s of allStats) {
    const uid = realUserId[s.fileUser];
    if (!flags.skipEntries) {
      for (const e of s.transformed.entries) allEntries.push({ ...e, owner_id: uid });
    }
    if (!flags.skipExpenses) {
      for (const e of s.transformed.expenses) allExpenses.push({ ...e, owner_id: uid });
    }
  }

  const results = { entries: { ok: 0, fail: 0, errors: [] }, expenses: { ok: 0, fail: 0, errors: [] } };

  async function pushBatch(table, rows, bucket) {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
      if (error) {
        bucket.fail += batch.length;
        bucket.errors.push({ batchStart: i, code: error.code, message: error.message, hint: error.hint });
        console.error(`  ✗ ${table} batch ${i}-${i + batch.length - 1} 실패: ${error.message}${error.code ? ` (${error.code})` : ''}${error.hint ? ` — ${error.hint}` : ''}`);
      } else {
        bucket.ok += batch.length;
        process.stdout.write(`  ✓ ${table} ${i + batch.length}/${rows.length}\r`);
      }
    }
    if (rows.length > 0) console.log('');
  }

  if (allEntries.length > 0) {
    console.log(`\n[upsert today_entries] ${allEntries.length}건...`);
    await pushBatch('today_entries', allEntries, results.entries);
  }
  if (allExpenses.length > 0) {
    console.log(`\n[upsert today_expenses] ${allExpenses.length}건...`);
    await pushBatch('today_expenses', allExpenses, results.expenses);
  }
  return results;
}

// ─── main ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`Today Keep 데이터 import — ${flags.apply ? 'APPLY' : 'DRY-RUN'}\n`);

  // 양쪽 파일 모두 읽어서 cross-file driveId 인덱스 빌드.
  const filesPayload = flags.files.map((filePath) => {
    const fileUser = inferUserFromFilename(filePath);
    if (!fileUser || !USER_PLACEHOLDER[fileUser]) {
      console.error(`user 추론 실패: ${filePath}. 파일명에 'gio'/'leftjap'/'soyoun' 포함되어야 함.`);
      process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { filePath, fileUser, data };
  });

  const allStats = processAll(filesPayload);
  for (const s of allStats) reportFile(s);

  // 합계
  console.log('\n' + '═'.repeat(78));
  console.log('🏁 합계');
  console.log('═'.repeat(78));
  const totalDocsKept = allStats.reduce((a, s) => a + s.docs.kept, 0);
  const totalMemosKept = allStats.reduce((a, s) => a + s.memos.kept, 0);
  const totalEntries = totalDocsKept + totalMemosKept;
  const totalExp = allStats.reduce((a, s) => a + s.expenses.total, 0);
  console.log(`  today_entries: ${totalEntries}건 (docs ${totalDocsKept} + memos ${totalMemosKept})`);
  console.log(`  today_expenses: ${totalExp}건`);
  for (const s of allStats) {
    console.log(`  - ${s.fileUser}: entries ${s.docs.kept + s.memos.kept}, expenses ${s.expenses.total}`);
  }

  if (!flags.apply) {
    console.log(`\nDRY-RUN 완료. 실 insert 는 --apply 추가.`);
    return;
  }

  // ─── apply 진입 ─────────────────────────────────────────────────
  loadEnvLocal();
  const env = {
    VITE_SUPABASE_URL: requireEnv('VITE_SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    USER_ID_LEFTJAP: process.env.USER_ID_LEFTJAP || null,
    USER_ID_SOYOUN: process.env.USER_ID_SOYOUN || null,
  };
  if (env.USER_ID_LEFTJAP) validateUuid('USER_ID_LEFTJAP', env.USER_ID_LEFTJAP);
  if (env.USER_ID_SOYOUN) validateUuid('USER_ID_SOYOUN', env.USER_ID_SOYOUN);

  console.log('\n' + '═'.repeat(78));
  console.log('🚀 APPLY 시작 (Supabase upsert, onConflict=id, 재실행 멱등)');
  console.log('═'.repeat(78));
  console.log(`  URL: ${env.VITE_SUPABASE_URL}`);

  const results = await applyAll(allStats, env);

  console.log('\n' + '═'.repeat(78));
  console.log('🏁 APPLY 완료');
  console.log('═'.repeat(78));
  console.log(`  entries:  ok=${results.entries.ok} fail=${results.entries.fail}`);
  console.log(`  expenses: ok=${results.expenses.ok} fail=${results.expenses.fail}`);
  if (results.entries.fail > 0 || results.expenses.fail > 0) {
    console.log('\n실패 batch 상세:');
    for (const e of results.entries.errors) console.log(`  entries  ${JSON.stringify(e)}`);
    for (const e of results.expenses.errors) console.log(`  expenses ${JSON.stringify(e)}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
