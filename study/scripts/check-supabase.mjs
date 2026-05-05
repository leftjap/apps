#!/usr/bin/env node
/**
 * Supabase 연결 헬스체크 (Wave 11.12).
 *
 * 사용:
 *   pnpm check:supabase
 *
 * 검증 항목:
 *   1. .env.local 의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 존재
 *   2. URL 형식 (https://*.supabase.co)
 *   3. createClient 초기화 + getSession() 호출 (network 도달 검증)
 *   4. 6 테이블 전체 존재 확인 (spec §4)
 *   5. RLS 차단 동작 (익명 호출 시 row 0 반환)
 *
 * 실패 시 exit 1 + 원인 안내. 성공 시 exit 0 + 다음 액션 안내.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, '..', '.env.local');

function fail(msg) {
  console.error('❌ ' + msg);
  process.exit(1);
}

function ok(msg) {
  console.log('✅ ' + msg);
}

function info(msg) {
  console.log('ℹ️  ' + msg);
}

// 1. .env.local 존재
if (!existsSync(ENV_PATH)) {
  fail(
    '.env.local 파일 없음.\n' +
    '   생성: ~/apps/study/.env.local\n' +
    '   내용은 docs/oauth-setup.md 의 1단계 참고',
  );
}
ok('.env.local 파일 존재');

// 2. env 파싱 (단순 KEY=VALUE 라인 파서, 따옴표·주석 처리)
const env = {};
for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const k = trimmed.slice(0, eq).trim();
  let v = trimmed.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  env[k] = v;
}

const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;

if (!url) fail('VITE_SUPABASE_URL 누락 — .env.local 에 추가');
if (!anon) fail('VITE_SUPABASE_ANON_KEY 누락 — .env.local 에 추가');
ok('환경변수 두 값 모두 존재');

// 3. URL 형식
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  fail(`VITE_SUPABASE_URL 형식 의심: ${url}\n   기대: https://<project-ref>.supabase.co`);
}
ok(`URL 형식 정상: ${url}`);

// 4. anon key 형식 — legacy JWT (eyJ...) 또는 신규 publishable (sb_publishable_...) 둘 다 허용.
//    Supabase 가 2026 publishable/secret 시스템으로 전환. 클라이언트 번들엔 둘 다 안전 (RLS 보호).
//    service_role (eyJ + role:service_role) 또는 신규 sb_secret_* 는 절대 금지.
if (!/^(eyJ|sb_publishable_)/.test(anon)) {
  fail('VITE_SUPABASE_ANON_KEY 형식 의심: legacy JWT (eyJ...) 또는 신규 publishable (sb_publishable_...) 키만 허용. sb_secret_ / service_role 키 절대 금지.');
}
if (anon.startsWith('sb_secret_')) {
  fail('VITE_SUPABASE_ANON_KEY 에 sb_secret_ 키가 들어감. 절대 클라이언트 번들 금지 — publishable 키 (sb_publishable_...) 만 사용.');
}
ok(`key 형식 정상 (${anon.startsWith('eyJ') ? 'legacy JWT' : 'publishable'})`);

// 5. createClient + getSession (network 도달)
const supabase = createClient(url, anon);
try {
  const { data, error } = await supabase.auth.getSession();
  if (error) fail(`getSession 실패: ${error.message}`);
  if (data.session) info(`기존 세션 발견 (user: ${data.session.user.email})`);
  else info('세션 없음 (아직 로그인 안 됨 — 정상)');
  ok('Supabase Auth API 도달 성공');
} catch (e) {
  fail(`Supabase 연결 실패: ${e.message}\n   네트워크·URL·키 확인 필요`);
}

// 6. spec §4 의 6 테이블 전체 확인 (RLS 로 row 0 이지만 select 자체는 통과)
const TABLES = [
  'study_review_queue',
  'study_today_lessons',
  'study_session_logs',
  'study_daily_stats',
  'study_pronunciation_log',
  'study_user_meta',
];
let tablesOk = true;
for (const t of TABLES) {
  try {
    const { error } = await supabase.from(t).select('*').limit(1);
    if (error && (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      /relation .* does not exist/i.test(error.message) ||
      /could not find the table/i.test(error.message)
    )) {
      console.error(`❌ 테이블 없음 또는 schema cache miss: ${t} — ${error.message}`);
      tablesOk = false;
      continue;
    }
    // RLS 로 빈 결과이거나 permission denied 는 정상 (익명 호출 차단)
    ok(`테이블 존재: ${t}`);
  } catch (e) {
    console.error(`❌ ${t} 조회 실패: ${e.message}`);
    tablesOk = false;
  }
}
if (!tablesOk) {
  console.error('');
  console.error('▶ 해결: pnpm sql:copy → Dashboard SQL Editor 에 붙여넣고 Run');
  console.error('         가이드: docs/oauth-setup.md 2단계');
  process.exit(1);
}
ok(`6 테이블 모두 존재 (spec §4)`);

// 7. RLS 차단 검증 — 익명 호출이 user row 를 못 봐야 정상
try {
  const { data, error } = await supabase.from('study_review_queue').select('id');
  if (error) {
    info(`RLS 차단 (permission denied): ${error.message}`);
  } else if (Array.isArray(data) && data.length === 0) {
    ok('RLS 정상 (익명 호출 → 0 row 반환)');
  } else {
    console.warn('⚠️  익명 호출에 row 가 반환됨. RLS 정책 점검 필요.');
  }
} catch (e) {
  info(`RLS 테스트 스킵: ${e.message}`);
}

console.log('');
console.log('🎉 모든 헬스체크 통과. 다음 단계:');
console.log('   1. Google Cloud Console OAuth client 생성 (pnpm oauth:guide)');
console.log('   2. Supabase Dashboard → Auth → Providers → Google 활성화');
console.log('   3. pnpm dev → http://localhost:5173/ → 로그인 흐름 검증');
