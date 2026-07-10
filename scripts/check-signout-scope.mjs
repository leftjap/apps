#!/usr/bin/env node
/**
 * signOut scope 게이트 (2026-07-11).
 *
 * 왜: Supabase `auth.signOut()` 의 기본 scope 는 **global** 이다.
 *     한 기기에서 로그아웃하면 그 계정의 refresh token 이 서버에서 전부 삭제되고,
 *     같은 프로젝트를 쓰는 다른 기기·다른 앱(폰의 study·today 등)이 통째로 로그아웃된다.
 *     개인용 앱이므로 로그아웃은 그 기기에만 적용되어야 한다 → `{ scope: 'local' }` 필수.
 *
 * 무엇을: 각 앱의 auth 어댑터에서 Supabase AuthClient 의 signOut 호출이
 *         scope: 'local' 을 넘기는지 검사한다. (앱 코드가 부르는 래퍼 signOut() 은 검사 대상 아님)
 *
 * 실행: node scripts/check-signout-scope.mjs [--self-test]
 * CI:   deploy-pages.yml 이 배포 전에 실행 — 실패 시 배포 차단.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Supabase AuthClient 를 직접 잡고 있는 파일들 (앱별 auth 어댑터)
export const AUTH_ADAPTERS = [
  'study/src/services/auth.js',
  'today/src/services/auth.js',
  'gym/src/services/auth.js',
  'book/src/services/auth.js',
  'pick/src/services/auth.js',
  'cue/src/services/auth.js',
  'best/src/web/auth.js',
]

/** 소스에서 scope 없는 signOut 호출을 찾는다. 반환: [{line, text}] */
export function findBadSignOut(source) {
  const bad = []
  source.split('\n').forEach((text, i) => {
    if (!/\.signOut\s*\(/.test(text)) return
    if (/export\s+(async\s+)?function\s+signOut/.test(text)) return // 래퍼 정의
    if (/scope:\s*['"]local['"]/.test(text)) return
    bad.push({ line: i + 1, text: text.trim() })
  })
  return bad
}

function selfTest() {
  const cases = [
    ["  const { error } = await supabase.auth.signOut();", 1, 'scope 없는 global signOut 은 위반'],
    ["  const { error } = await supabase.auth.signOut({ scope: 'local' });", 0, 'scope local 은 통과'],
    ['  await auth.signOut()', 1, 'AuthClient 직접 호출도 위반'],
    ["  return auth.signOut({ scope: 'local' })", 0, 'AuthClient + scope local 통과'],
    ['export async function signOut() {', 0, '래퍼 정의는 검사 대상 아님'],
    ['export function signOut() {', 0, '동기 래퍼 정의도 제외'],
    ['  // signOut() 은 global 이 기본이다', 0, '주석은 호출이 아니다'],
  ]
  let ok = true
  for (const [src, want, why] of cases) {
    const got = findBadSignOut(src).length
    const pass = got === want
    if (!pass) ok = false
    console.log(`  ${pass ? 'PASS' : 'FAIL'} (${got}/${want}) ${why}`)
  }
  console.log(ok ? '\n[self-test] PASS' : '\n[self-test] FAIL')
  process.exit(ok ? 0 : 1)
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest()

  let violations = 0
  for (const rel of AUTH_ADAPTERS) {
    const path = join(ROOT, rel)
    if (!existsSync(path)) {
      console.log(`  SKIP ${rel} (없음)`)
      continue
    }
    const bad = findBadSignOut(readFileSync(path, 'utf8'))
    if (bad.length === 0) {
      console.log(`  OK   ${rel}`)
      continue
    }
    violations += bad.length
    for (const b of bad) console.error(`  FAIL ${rel}:${b.line}  ${b.text}`)
  }

  if (violations) {
    console.error(
      `\n[signout-scope] 위반 ${violations}건.\n` +
        `Supabase signOut() 의 기본 scope 는 global 이라 그 계정의 모든 기기 세션이 삭제된다.\n` +
        `개인 앱은 반드시 supabase.auth.signOut({ scope: 'local' }) 로 호출할 것.`,
    )
    process.exit(1)
  }
  console.log(`\n[signout-scope] PASS — 어댑터 ${AUTH_ADAPTERS.length}개 전부 scope: 'local'`)
}

main()
