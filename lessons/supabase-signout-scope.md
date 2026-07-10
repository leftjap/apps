# Supabase `signOut()` 은 기본이 global — 모든 기기가 함께 로그아웃된다

**발견 2026-07-11.** 폰의 study·today 가 동시에 로그인 풀림. 두 앱은 같은 Supabase 프로젝트(`geo-apps`).

## 사실

`@supabase/auth-js` 소스 (`GoTrueClient.js`):

```js
async signOut(options = { scope: 'global' }) { ... }
async _signOut({ scope } = { scope: 'global' }) {
  ...
  const { error } = await this.admin.signOut(accessToken, scope);   // POST /auth/v1/logout?scope=${scope}
}
```

`scope=global` 이면 서버가 **그 계정의 모든 세션·refresh token 을 삭제**한다.
데스크톱에서 로그아웃 버튼 한 번 → 폰의 다른 앱까지 전부 로그아웃.

## 실증 (best 프로젝트, 2026-07-11)

세션 2개(로컬 dev + 프로덕션)를 만들어 두고:

| 호출 | 전송 URL | 결과 |
|---|---|---|
| `signOut({ scope: 'local' })` | `…/logout?scope=local` | 호출한 기기 세션만 삭제 (2개 → 1개) |
| `signOut()` (무인자) | `…/logout?scope=global` | **두 세션 전부 삭제** (2개 → 0개) |

프로젝트 격리도 확인: best(별도 프로젝트)에서 global signOut 을 해도 geo-apps 세션 2개는 그대로.
즉 **같은 Supabase 프로젝트를 공유하는 앱들끼리만** 서로를 죽인다 (geo-apps = study·today·gym·book·pick·cue).

## 규칙

개인용 앱이므로 로그아웃은 **그 기기에서만** 되어야 한다.

```js
await supabase.auth.signOut({ scope: 'local' });   // 필수
```

## 방지 장치

- `scripts/check-signout-scope.mjs` — 앱별 auth 어댑터에서 scope 없는 signOut 호출을 검출.
  `--self-test` 로 판정 로직 자가검증. `deploy-pages.yml` 이 배포 전 실행 → 위반 시 배포 차단.
- 검사 대상은 AuthClient 를 직접 잡는 파일만 (`*/src/services/auth.js`, `best/src/web/auth.js`).
  앱 코드가 부르는 래퍼 `signOut()` 은 대상 아님.

## 이력

`study` `today` `gym` `pick` 은 이미 `scope: 'local'` 이었고, **`book` `cue` 가 빠져 있었다** (2026-07-11 수정).
`best` 는 신규 작성 시 같은 실수를 반복해 함께 수정.
