#!/usr/bin/env node
/**
 * Wave 11.12 — 종합 셋업 진단 + 가이드.
 *
 * 사용: pnpm bootstrap
 *
 * 로직:
 *   1. .env.local 존재 확인 → 없으면 env-init 안내
 *   2. 값 채움 여부 → 비어있으면 Dashboard 안내 + sql:copy + oauth:guide 힌트
 *   3. check:supabase 자동 실행 → 통과 여부에 따라 다음 단계 안내
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ENV = join(ROOT, '.env.local');

function section(title) {
  console.log('');
  console.log('━'.repeat(60));
  console.log('  ' + title);
  console.log('━'.repeat(60));
}

// 1. .env.local 존재
if (!existsSync(ENV)) {
  section('1/3: .env.local 생성 필요');
  console.log('❌ .env.local 파일이 없습니다.');
  console.log('');
  console.log('▶ 해결: pnpm env:init');
  console.log('   → .env.local placeholder 생성 후 Supabase Dashboard 값 붙여넣기');
  process.exit(1);
}

// 2. 값 채움 확인
const content = readFileSync(ENV, 'utf8');
const urlMatch = content.match(/^VITE_SUPABASE_URL=(.*)$/m);
const keyMatch = content.match(/^VITE_SUPABASE_ANON_KEY=(.*)$/m);
const url = urlMatch?.[1]?.trim() || '';
const key = keyMatch?.[1]?.trim() || '';

if (!url || !key) {
  section('1/3: .env.local 값 채우기 필요');
  console.log('✅ .env.local 파일 존재');
  console.log(`${url ? '✅' : '❌'} VITE_SUPABASE_URL ${url ? '= ' + url : '(비어있음)'}`);
  console.log(`${key ? '✅' : '❌'} VITE_SUPABASE_ANON_KEY ${key ? '= (set)' : '(비어있음)'}`);
  console.log('');
  console.log('▶ 수동 단계:');
  console.log('   1. Supabase Dashboard → Project Settings → API');
  console.log('      https://supabase.com/dashboard/project/_/settings/api');
  console.log('   2. Project URL / anon public key 복사하여 .env.local 에 붙여넣기');
  console.log('   3. pnpm bootstrap 재실행');
  process.exit(1);
}

// 3. check:supabase 실행
section('1/3: .env.local 검증 — PASS');
console.log('✅ URL + anon key 두 값 모두 존재');

section('2/3: Supabase 연결 + 스키마 검증');
const r = spawnSync('pnpm', ['check:supabase'], { cwd: ROOT, stdio: 'inherit' });

if (r.status !== 0) {
  section('2/3 실패 — 남은 수동 단계');
  console.log('▶ SQL 마이그레이션 미실행 가능성:');
  console.log('   pnpm sql:copy');
  console.log('   → Dashboard SQL Editor 에 붙여넣고 Run');
  console.log('');
  console.log('▶ Google OAuth Provider 설정 확인:');
  console.log('   pnpm oauth:guide');
  console.log('');
  console.log('▶ 모든 수동 단계 완료 후 pnpm bootstrap 재실행');
  process.exit(1);
}

section('3/3: 모든 자동 검증 통과');
console.log('🎉 setup 완료. 다음 명령으로 실 OAuth 흐름 검증:');
console.log('');
console.log('   pnpm dev');
console.log('   → http://localhost:5173/ → Google 로그인 → home 도달');
console.log('   → DevTools → Application → IndexedDB → study_<12hex> 확인');
console.log('');
console.log('Google OAuth Provider 가 아직 미설정이면 pnpm oauth:guide 참고.');
