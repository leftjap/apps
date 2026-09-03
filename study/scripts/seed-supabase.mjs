#!/usr/bin/env node
/**
 * seed-supabase.mjs — study_today_lessons Supabase 직접 INSERT (자동화 진입점).
 *
 * 호출 경로:
 *  1. GitHub Actions workflow (seed-supabase.yml) — 권장. SUPABASE_SERVICE_ROLE_KEY 시크릿 보관
 *  2. 로컬 (개발 검증) — .env.local 의 SUPABASE_SERVICE_ROLE_KEY 직접 export 후 실행
 *
 * 사용:
 *   node scripts/seed-supabase.mjs --payload seeds/ja-2026-05-04.json --user-id <uuid> [--dry-run]
 *
 * 필수 env:
 *   SUPABASE_URL                     — VITE_SUPABASE_URL 동일 값 (예: https://xxx.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY        — service_role 키 (RLS 우회). GitHub Secrets 보관
 *
 * Payload JSON 형식:
 *   {
 *     "lang": "ja" | "en",
 *     "date": "2026-05-04",
 *     "cards": [
 *       {
 *         "id": "ja-2026-05-04-1",
 *         "sentence": "...", "meaning": "...", "reading": "...",
 *         "phonetic_kr": "...", "explanation": { ... }, "order_index": 1
 *       }, ...
 *     ]
 *   }
 *
 * 안전장치:
 *   - --dry-run: SELECT 카운트만, INSERT 안 함
 *   - cards.length > 50 차단 (대량 실수 방지)
 *   - lang ∉ {en, ja} 차단
 *   - 동일 id 중복 → upsert (id PK)
 *   - 완료(completed=true)된 id 는 날짜와 무관하게 재INSERT 차단 (2026-09-03)
 *   - INSERT 후 SELECT count 일치 검증
 *
 * 의존성: 0개 (Node 22 fetch 내장 사용 — 추가 패키지 install 안 함).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { argv, env, exit } from 'node:process';
import {
  validateSeedContent,
  evaluateServerGuards,
  parseSpeakerVoiceNames,
  loadExistingSeeds,
  loadSourceEnLines,
} from './validate-seed.mjs';
import { validateJaPayload } from './validate-ja-core100.mjs';

function parseArgs(args) {
  const out = { dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--payload') out.payload = args[++i];
    else if (a === '--user-id') out.userId = args[++i];
    else if (a === '--dry-run') out.dryRun = true;
  }
  if (!out.payload || !out.userId) {
    console.error('Usage: seed-supabase.mjs --payload <file.json> --user-id <uuid> [--dry-run]');
    exit(1);
  }
  return out;
}

function validatePayload(p) {
  if (!p || typeof p !== 'object') throw new Error('payload not object');
  if (!['en', 'ja'].includes(p.lang)) throw new Error(`lang must be en|ja, got: ${p.lang}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) throw new Error(`date must be YYYY-MM-DD, got: ${p.date}`);
  if (!Array.isArray(p.cards)) throw new Error('cards not array');
  if (p.cards.length === 0) throw new Error('cards empty');
  if (p.cards.length > 50) throw new Error(`cards count ${p.cards.length} > 50 (safety cap)`);
  for (const c of p.cards) {
    if (!c.id || !c.sentence || !c.meaning || !c.explanation) {
      throw new Error(`card missing required field: ${JSON.stringify(c).slice(0, 100)}`);
    }
  }
  const ids = new Set(p.cards.map((c) => c.id));
  if (ids.size !== p.cards.length) throw new Error('duplicate card ids');
}

async function rest(supabaseUrl, serviceKey, path, opts = {}) {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1${path}`;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...(opts.headers ?? {}),
  };
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${opts.method ?? 'GET'} ${path} → ${res.status} ${res.statusText}: ${text}`);
  }
  return { status: res.status, text, headers: res.headers };
}

async function selectCount(supabaseUrl, serviceKey, userId, lang, date) {
  const path = `/study_today_lessons?select=id&user_id=eq.${userId}&lang=eq.${lang}&date=eq.${date}`;
  const { headers } = await rest(supabaseUrl, serviceKey, path, {
    method: 'GET',
    headers: { Prefer: 'count=exact', Range: '0-0' },
  });
  const range = headers.get('content-range') ?? '0';
  const total = parseInt(range.split('/')[1] ?? '0', 10);
  return Number.isFinite(total) ? total : 0;
}

// 같은 (user, lang, date) 의 { id, completed } 행 — validate-seed 서버 게이트 입력
async function selectRows(supabaseUrl, serviceKey, userId, lang, date) {
  const path = `/study_today_lessons?select=id,completed&user_id=eq.${userId}&lang=eq.${lang}&date=eq.${date}`;
  const { text } = await rest(supabaseUrl, serviceKey, path, { method: 'GET' });
  return JSON.parse(text);
}

/* payload 의 id 로도 서버 행을 찾는다 (2026-09-03): completed 게이트가 같은 날짜 행만 보면, 날짜가 바뀐
 * 재적재(08-26 파일 vs 서버 08-31 행)는 검사를 건너뛰고 upsert 가 completed=false 로 학습 기록을 되돌린다.
 * id 기준 행을 합쳐 넘겨, 완료된 카드는 날짜와 무관하게 차단한다. */
async function selectRowsByIds(supabaseUrl, serviceKey, userId, ids) {
  const inList = `(${ids.map((s) => `"${s}"`).join(',')})`;
  const path = `/study_today_lessons?select=id,completed&user_id=eq.${userId}&id=in.${inList}`;
  const { text } = await rest(supabaseUrl, serviceKey, path, { method: 'GET' });
  return JSON.parse(text);
}

/** 서버 게이트 입력 행 (2026-09-03): 같은 (lang, date) 행 + payload id 로 찾은 행(날짜 무관)을 id 로 합친다.
 *  회귀 테스트 = seed-supabase.test.mjs (fetch 스텁). */
export async function fetchGuardRows(supabaseUrl, serviceKey, userId, payload) {
  const preRows = await selectRows(supabaseUrl, serviceKey, userId, payload.lang, payload.date);
  const idRows = await selectRowsByIds(supabaseUrl, serviceKey, userId, payload.cards.map((c) => c.id));
  const seen = new Set(preRows.map((r) => r.id));
  return { preRows, idRows, guardRows: [...preRows, ...idRows.filter((r) => !seen.has(r.id))] };
}

async function upsertRows(supabaseUrl, serviceKey, rows) {
  const path = '/study_today_lessons?on_conflict=id';
  const { text } = await rest(supabaseUrl, serviceKey, path, {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });
  return JSON.parse(text);
}

async function main() {
  const args = parseArgs(argv.slice(2));
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    exit(1);
  }

  const payload = JSON.parse(readFileSync(args.payload, 'utf8'));
  validatePayload(payload);

  // 콘텐츠 게이트 (validate-seed.mjs — guide §6.3 체크리스트 기계화: 구조·발음 정합·
  // 다이얼로그 매칭 계약·drills·ID/_source 겹침·화자 TTS 등록). 실패 시 INSERT 차단.
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const existingSeeds = loadExistingSeeds(join(rootDir, 'seeds'), basename(args.payload));
  const speechSrc = readFileSync(join(rootDir, 'src', 'services', 'speech.js'), 'utf8');
  const content = validateSeedContent(payload, {
    existingSeeds,
    speakerNames: parseSpeakerVoiceNames(speechSrc),
    sourceEnLines: loadSourceEnLines(join(rootDir, 'seeds'), payload._source),
  });
  for (const w of content.warnings) console.warn(`[seed] WARN: ${w}`);
  if (!content.ok) {
    for (const e of content.errors) console.error(`[seed] BLOCKED: ${e}`);
    throw new Error(`content validation failed (${content.errors.length} errors)`);
  }

  /* ja-core100 전용 게이트 (2026-08-28) — validate-seed 는 lang==='en' 에서만 상세 검사를 돌아
   * ja 는 구조 검증만으로 통과한다. 초보 학습자용이라 reading·음차·drills 4필드가 빠지면
   * 카드가 통째로 못 읽히는 물건이 되므로 guide-ja §14-5 를 여기서 강제한다. */
  if (payload.track === 'ja-core100') {
    const jaErrors = validateJaPayload(payload);
    if (jaErrors.length) {
      for (const e of jaErrors) console.error(`[seed] BLOCKED(ja-core100): ${e}`);
      throw new Error(`ja-core100 validation failed (${jaErrors.length} errors)`);
    }
    console.log('[seed] ja-core100 게이트 통과');
  }

  console.log(`[seed] lang=${payload.lang} date=${payload.date} count=${payload.cards.length} user=${args.userId} dryRun=${args.dryRun}`);

  const { preRows, idRows, guardRows } = await fetchGuardRows(supabaseUrl, serviceKey, args.userId, payload);
  console.log(`[seed] existing rows for (user, lang, date): ${preRows.length}`);
  console.log(`[seed] existing rows by id (any date): ${idRows.length}`);

  // 서버 게이트: 1일 1장면 (같은 날 다른 그룹 차단) + completed 게이트 (학습 시작 후 재INSERT 차단, 날짜 무관)
  const guards = evaluateServerGuards({
    serverRows: guardRows,
    payloadIds: new Set(payload.cards.map((c) => c.id)),
  });
  if (!guards.ok) {
    for (const e of guards.errors) console.error(`[seed] BLOCKED: ${e}`);
    throw new Error(`server guard failed (${guards.errors.length} errors)`);
  }

  if (args.dryRun) {
    console.log('[seed] dry-run — INSERT skipped');
    return;
  }

  /* 자동 방치 삭제 폐지 (2026-09-03): 예전엔 INSERT 전 payload.lang 의 14일+ 방치 미완료를 여기서 강제
   * 삭제했다(2026-07-01 hold 데드락 수정). 그 hold 게이트는 이미 없고, 일괄 적재한 커리큘럼(코어100)은
   * 방치가 아니라 대기라 이 삭제가 미리 넣은 묶음을 지웠다(2026-08-28 ja 12장 실사고). 정리는 사람이
   * expire-stale-lessons.mjs 를 직접 돌릴 때만 한다. */

  const rows = payload.cards.map((c) => ({
    id: c.id,
    user_id: args.userId,
    lang: payload.lang,
    date: payload.date,
    sentence: c.sentence,
    meaning: c.meaning,
    reading: c.reading ?? null,
    phonetic_kr: c.phonetic_kr ?? null,
    explanation: c.explanation,
    completed: false,
    order_index: c.order_index ?? null,
    speaker: c.speaker ?? null,
  }));

  const upserted = await upsertRows(supabaseUrl, serviceKey, rows);
  console.log(`[seed] upserted ${upserted.length} rows`);

  const postCount = await selectCount(supabaseUrl, serviceKey, args.userId, payload.lang, payload.date);
  console.log(`[seed] post-check rows: ${postCount}`);

  if (postCount < payload.cards.length) {
    throw new Error(`post-check mismatch: expected >=${payload.cards.length}, got ${postCount}`);
  }
  console.log('[seed] OK');
}

// import 안전 (2026-09-03): 테스트가 fetchGuardRows 를 가져올 수 있게 CLI 직접 실행일 때만 main 을 돈다.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((e) => {
    console.error(`[seed] FAILED: ${e.message}`);
    exit(1);
  });
}
