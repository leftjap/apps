# Gym Auth 셋업 가이드 (Wave 11.7)

> 적용 대상: Study 와 같은 Supabase 프로젝트를 공유하는 환경. **Study 셋업이 끝났다면 §1·§2 만 추가 작업, OAuth client / Supabase Provider 는 재사용.**

---

## 1. 환경변수 (`.env.local`)

`.env.local` 파일을 `~/apps/gym/` 에 직접 생성 (PreToolUse hook 으로 Edit/Write 막힘, Bash heredoc 또는 사용자 수동):

```dotenv
# Supabase Dashboard → Project Settings → API
# Study 와 같은 프로젝트면 Study .env.local 의 두 값 그대로 복사 가능.
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxx
```

- **Key 형식**: legacy JWT (`eyJ...`) 또는 신규 publishable (`sb_publishable_...`) 둘 다 동작. 클라이언트 번들엔 둘 다 안전 (RLS 보호).
- **금지**: `sb_secret_*` 또는 service_role 키는 절대 클라이언트 번들 금지.
- `.gitignore` 에 이미 `.env.local` 등록됨.

빠른 경로 (Study 공유 프로젝트):

```sh
cd ~/apps/gym
cp ~/apps/study/.env.local ./.env.local    # Bash 는 hook 미적용
```

---

## 2. SQL 마이그레이션 적용

1. Supabase Dashboard → 좌측 **SQL Editor** → **New query**
2. `~/apps/gym/supabase/migrations/0001_gym_init.sql` 전체 내용 paste
   - 빠른 복사: `pnpm sql:copy` (클립보드 자동, macOS pbcopy)
3. **Run** (Cmd+Enter)
4. 검증 쿼리:
   ```sql
   select tablename, rowsecurity
   from pg_tables
   where schemaname = 'public' and tablename like 'gym_%'
   order by tablename;
   ```
   → `gym_*` 4 row, `rowsecurity = true` 모두 확인.

---

## 3. Google OAuth 2.0 Client (Study 공유 시 재사용)

**Study 셋업이 끝났다면 이 단계 스킵.** Supabase 프로젝트가 같으면 callback URL 도 같으므로 OAuth client 한 개로 두 앱 모두 동작.

신규 셋업이 필요한 경우만:

1. https://console.cloud.google.com/ → 프로젝트 선택
2. **APIs & Services** → **OAuth consent screen** → External + Test users (`leftjap@gmail.com`, `soyoun312@gmail.com`)
3. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID** → Web application
4. **Authorized redirect URIs**:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
5. 발급된 Client ID / Secret 을 Supabase Dashboard → **Authentication** → **Providers** → **Google** 에 입력 + Enable

---

## 4. 앱 검증

```sh
cd ~/apps/gym
pnpm install                  # supabase-js 설치 확인
pnpm bootstrap                # .env.local + URL/key + 4 테이블 + RLS 자동 진단
pnpm dev                      # http://localhost:5173/ 접속
```

흐름:
1. 자동으로 `#/login` 라우트
2. **Google로 계속하기** 버튼 → Google 로그인 → 허용 이메일 선택
3. Supabase callback → 앱 복귀 → `#/home` 자동 이동
4. DevTools → **Application** → **IndexedDB** 에서 `gym_<12자hex>` DB 생성 확인
5. **admin** → 프로필 섹션 → 로그아웃 → confirm → `#/login` 복귀 + DB 인스턴스 close

비허용 이메일 시뮬:
- 다른 Google 계정으로 로그인 → Supabase 는 토큰 발급하지만 앱이 즉시 sign-out + login 화면에 빨간 banner ("허용되지 않은 계정입니다")

---

## 5. PWA 빌드 검증

```sh
pnpm build && pnpm preview    # http://localhost:4173/
```

iPhone Safari 실기 (사용자 수동):
1. Safari 로 배포 URL 접속 (배포 Wave 후)
2. **공유 → 홈 화면에 추가** → standalone 모드
3. 로그인 → OAuth redirect → standalone 컨텍스트 유지 (Safari 17.4+)

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| 콘솔 `[supabase] VITE_SUPABASE_* 미설정` | `.env.local` 없음 / 잘못된 키 | §1 재확인, dev 서버 재시작 |
| Google 로그인 후 `redirect_uri_mismatch` | OAuth client redirect URI 불일치 | §3-4 URI 정확히 확인. Study 와 공유 프로젝트면 이미 등록돼 있음 |
| 로그인 성공했는데 `#/login` 에서 안 넘어감 | allowlist 위반 | `auth.js` `ALLOWED_EMAILS` 확인. Google Cloud Console Test users 등록 여부 |
| IndexedDB 에 `gym_*` 안 생김 | seed/createGymDB 실패 | 콘솔 `[seed] failed` 또는 `[auth]` 로그 확인 |
| iOS standalone 에서 OAuth 후 Safari 새 탭 열림 | iOS 16.x 이전 standalone 제약 | 17.4+ 업데이트 권장 |
| `key 형식 의심` (check:supabase) | 신규 publishable 키 형식 처음 도입 | scripts/check-supabase.mjs 의 정규식 `(eyJ|sb_publishable_)` 둘 다 허용 — Wave 11.7 수정 |

---

## 다음 Wave

- **11.8**: `src/db/sync.js` 양방향 동기화 (gym_sessions + gym_prs + gym_weights + gym_user_settings)
- **11.7 잔여**: PR 계산 UI / 체중·관리 화면
