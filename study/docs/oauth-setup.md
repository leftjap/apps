# Study Auth 셋업 가이드 (Wave 11.12)

> 적용 대상: 처음 Supabase Auth 를 연동하는 환경. 이미 다른 앱에서 Supabase 프로젝트를 사용 중이면 1·2·5 단계만.

---

## 1. 환경변수 (`.env.local`)

`.env.local` 파일을 `~/apps/study/` 에 직접 생성 (PreToolUse hook 으로 Claude 가 못 만듦, 사용자 수동):

```dotenv
# Supabase Dashboard → Project Settings → API
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key-here
```

- `anon public` 키만 사용 (RLS 가 보호). `service_role` 키는 절대 번들 금지.
- `.gitignore` 에 이미 `.env.local` 등록됨.

---

## 2. SQL 마이그레이션 적용

1. Supabase Dashboard → 좌측 **SQL Editor** → **New query**
2. `~/apps/study/supabase/migrations/0001_study_init.sql` 전체 내용 paste
3. **Run** (Cmd+Enter)
4. 검증 쿼리:
   ```sql
   select tablename, rowsecurity
   from pg_tables
   where schemaname = 'public' and tablename like 'study_%'
   order by tablename;
   ```
   → `study_*` 6개 row, `rowsecurity = true` 모두 확인.

---

## 3. Google OAuth 2.0 Client 생성 (Google Cloud Console)

1. https://console.cloud.google.com/ 접속 → 프로젝트 선택 (없으면 새로 생성)
2. **APIs & Services** → **OAuth consent screen**
   - User Type: **External**
   - App name: `Study` (또는 원하는 이름)
   - User support email: 본인 이메일
   - Developer contact: 본인 이메일
   - **Save** → 다음 화면 모두 default → **Back to Dashboard**
   - **Test users** 섹션에 `leftjap@gmail.com`, `soyoun312@gmail.com` 추가 (External + 미게시 상태에선 test user 만 로그인 가능)
3. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: `Supabase Study`
   - **Authorized redirect URIs**:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
     (`<your-project-ref>` 는 Supabase Dashboard URL 의 서브도메인)
   - **Create**
4. 발급된 **Client ID** 와 **Client secret** 복사 (다음 단계에서 사용)

---

## 4. Supabase Google Provider 활성화

1. Supabase Dashboard → **Authentication** → **Providers** → **Google**
2. **Enable Sign in with Google** ON
3. **Client ID (for OAuth)** · **Client Secret (for OAuth)** 에 3-4 단계에서 복사한 값 paste
4. **Skip nonce check** 는 OFF (default) 유지
5. **Save**

---

## 5. 앱 검증

```sh
cd ~/apps/study
pnpm install                  # supabase-js 설치 확인
pnpm dev                      # http://localhost:5173/ 접속
```

흐름:
1. 자동으로 `#/login` 라우트
2. **Google로 계속하기** 버튼 → Google 로그인 화면 → 허용 이메일 (`leftjap@`/`soyoun312@`) 선택
3. Supabase callback → 앱 복귀 → `#/home` 자동 이동
4. DevTools → **Application** → **IndexedDB** 에서 `study_<12자hex>` DB 생성 확인
5. **Settings** → 로그아웃 → confirm → `#/login` 복귀 + DB 인스턴스 close

비허용 이메일 시뮬:
- 다른 Google 계정으로 로그인 → Supabase 는 토큰 발급하지만 앱이 즉시 sign-out + login 화면에 빨간 banner ("허용되지 않은 계정입니다")

---

## 6. PWA 빌드 검증

```sh
pnpm build && pnpm preview    # http://localhost:4174/
```

iPhone Safari 실기 (사용자 수동):
1. Safari 로 https://leftjap.github.io/study/ (배포 후) 또는 동일 LAN preview URL 접속
2. **공유 → 홈 화면에 추가** → standalone 모드 진입
3. 로그인 → OAuth redirect → standalone 컨텍스트 유지되는지 확인 (Safari 17.4+ 안정)

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| 콘솔 `[supabase] VITE_SUPABASE_* 미설정` | `.env.local` 없음 / 잘못된 키 | 1단계 재확인, 빌드/dev 서버 재시작 |
| Google 로그인 후 `redirect_uri_mismatch` | OAuth client redirect URI 불일치 | 3-3 단계 URI 정확히 paste, 호스트 일치 확인 |
| 로그인 성공했는데 `#/login` 에서 안 넘어감 | allowlist 위반 | `auth.js` `ALLOWED_EMAILS` 확인. test user 등록 여부 확인 |
| IndexedDB 에 `study_*` 안 생김 | seed 실패 / DB 권한 | 콘솔 `[seed] failed` 로그 확인, DevTools → Application → Storage 권한 |
| iOS standalone 에서 OAuth 후 Safari 새 탭 열림 | iOS 16.x 이전 standalone 제약 | 17.4+ 업데이트 권장 |

---

## 다음 Wave

- **11.13**: Dexie ↔ Supabase 양방향 동기화 (`src/db/sync.js` 신규, spec §4 끝)
- **11.14**: Azure Speech 어댑터 교체 (`src/services/speech.js` analyze/speak — Edge Function 토큰, spec §9·§12-1)
