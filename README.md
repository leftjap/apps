# ~/apps — PWA 리빌드 허브

Board(Electron, git 미업로드) + PWA 3앱 (Study/Gym/Today) 단일 트리. 메타 (`CLAUDE.md`/`memory.md`/`DESIGN.md`/`lessons/`/`scripts/`/`.claude/`) 와 코드·앱별 spec 모두 여기.

## 앱 목록

| 앱 | 경로 | 상태 | dev port | preview port |
|---|---|---|---|---|
| Study | `~/apps/study/` | Wave 11.13 진행 중 | 5174 | 4174 |
| Gym | `~/apps/gym/` | Wave 11.7 진행 중 | 5173 | 4173 |
| Today | `~/apps/today/` | Wave 11.7.2 진행 중 | **5175** | **4175** |

신규 앱 추가 시 dev/preview port 는 위 목록과 충돌 없게 할당 (gym 5173 → study 5174 → today 5175 → 다음 5176/4176 ...).

---

## geo-apps 통합 인프라 (Supabase + Google OAuth 공유)

`~/apps/` 의 모든 PWA 앱은 **단일 geo-apps Supabase 프로젝트** 와 **단일 geo-apps Google OAuth 클라이언트** 를 공유한다. 각 앱이 별 프로젝트·클라이언트 만들지 않는다.

### Supabase 프로젝트

- **URL**: `https://tcbooffrdacfatywdzcm.supabase.co`
- **Org**: leftjap's Org (Free)
- **Project**: geo-apps / branch main
- **테이블 prefix 로 앱 경계 분리**: `gym_*` · `study_*` · `today_*`
- 각 앱의 `.env.local`:
  ```
  VITE_SUPABASE_URL=https://tcbooffrdacfatywdzcm.supabase.co
  VITE_SUPABASE_ANON_KEY=<sb_publishable_...>
  ```

### Google OAuth Client

- **이름**: `geo-apps web`
- **Client ID**: `326910268868-v4dee1dn9pbpogifnvf8j9tibcf43mmf.apps.googleusercontent.com`
- **Authorized JavaScript origins**:
  - `http://localhost:5173` (Gym)
  - `http://localhost:5174` (Study)
  - `http://localhost:5175` (Today)
  - GitHub Pages 프로덕션 origin (배포 시 추가)
- **Authorized redirect URIs**:
  - `https://tcbooffrdacfatywdzcm.supabase.co/auth/v1/callback` (단일 — Supabase 가 모든 앱 공통 처리)
- **Client Secret**: 다중 활성 (rotate 정책상 새 시크릿 발급 후 기존 시크릿도 일정 기간 유효)
- **Supabase Auth → Providers → Google**: 활성 + 위 Client ID/Secret 등록 완료

### 신규 앱 추가 시 OAuth 체크리스트

1. dev port 결정 (5176/4176 등 충돌 없게)
2. Google Cloud Console → `geo-apps web` 클라이언트 → **Authorized JavaScript origins** 에 `http://localhost:<dev port>` 추가
3. (배포 시) GitHub Pages origin 도 추가
4. Authorized redirect URI 는 추가 작업 없음 (Supabase callback URL 단일 공유)
5. Supabase 측은 추가 작업 없음 (이미 활성)
6. 앱의 `vite.config.js` 에 `strictPort: true` 강제 — fallback 으로 5175 → 5176 가면 `redirect_uri_mismatch` 에러 발생

### vite 포트 강제 (필수)

```js
// vite.config.js
export default defineConfig({
  server: {
    port: <앱 dev port>,
    strictPort: true,  // 충돌 시 fallback 금지 — redirect_uri_mismatch 사전 차단
  },
  preview: {
    port: <앱 preview port>,
    strictPort: true,
  },
});
```

`strictPort: true` 없으면 vite 가 5175 점유 시 5176/5177 로 fallback → OAuth 등록 안 된 origin → redirect_uri_mismatch 에러.

### 허용 사용자 (앱 공통 allowlist)

```
leftjap@gmail.com
soyoun312@gmail.com
```

각 앱의 `src/services/auth.js` 에 `ALLOWED_EMAILS` 로 hardcoded. 클라이언트 측 1차 가드 + Supabase RLS 가 2차 (테이블 별 owner_id = auth.uid()).

---

## 작업 시 주의

- **이 인프라는 추가 설정 작업 없이 재사용한다.** 새 앱 만들 때 OAuth 활성화 절차 다시 안내 금지 — 위 체크리스트만 따른다.
- 사용자가 새 앱을 만들면서 `.env.local` 작성 시점에 위 URL/key 그대로 복사해서 사용.
- Supabase 대시보드에서 `Settings → API Keys` 의 Publishable key 가 변경되면 모든 앱의 `.env.local` 갱신 필요.
- 마이그레이션 SQL 은 모든 앱에서 prefix 로 충돌 회피되므로 자유롭게 추가 가능.

---

## 메타 파일 위치

`CLAUDE.md` / `memory.md` / `DESIGN.md` 는 `~/apps/` 루트. 앱별 spec 은 `~/apps/<app>/specs/`. 변경 이력은 git log (STATUS 체계 폐기).
