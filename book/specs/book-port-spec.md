# book — 실제 스택 이식 작업 명세서 (v14 디자인 목 → 운영 PWA)

> 대상: 다음 세션 Claude (로컬)
> 출발점: `book/` — v14 디자인 목 (React + Babel inline, 시각 검증 완료, `main` `d75d563`)
> 타깃: `today`/`study`/`gym` 와 **동일 스택** (아래 §0 검증 결과 기준)
> 작성일: 2026.05.22 · 작성 근거: today 실제 소스 직접 확인 (추측 아님)

> **⚠ 2026-06-19 업데이트 — 부부/파트너 모델 제거.** book 은 단일 사용자(본인) 앱으로 전환됨(소연 어구록 0행 DB 확인). 아래 D3·D4, §3.1–3.2(`partner_user_id`·`book_partner_id()`·partner RLS), §3.4, §6 W1, §7 RLS 의 *부부/파트너/소연* 서술은 **이식 당시 히스토리**이며 현재 코드가 아님. 현재: `owners=[본인]`, RLS 는 `owner_id = auth.uid()` 만. (코드·테스트·문서 = Phase 1 적용 완료. DB DDL[컬럼·함수·RLS drop]은 별도 마이그 `0005`로 예정 — 미적용.)

---

## 0. 스택 확정 (실측 — 착오 방지)

다음은 `today/`·`study/` 실제 파일을 읽고 확인한 사실입니다. **추정 아님.**

- **프레임워크: 바닐라 JS (ES Modules). React 아님.** (today/study/gym `package.json` 모두 react/react-dom 없음 — gym deps=supabase+dexie 확인, src 에 react import 0건)
- 빌드: **Vite 6** + **vite-plugin-pwa** (autoUpdate, NetworkFirst navigation, workbox skipWaiting)
- 데이터: **@supabase/supabase-js** (Supabase) ↔ **Dexie** (IndexedDB 오프라인 캐시)
- 테스트: **Vitest** (co-located `*.test.js` + fake-indexeddb) + **Playwright** (e2e)
- UI 렌더: **DOM 직접** — `innerHTML` 템플릿 문자열(today 173곳) + `createElement`(53곳) + `escapeHtml`. JSX·템플릿리터럴 라이브러리 없음.
- 라우팅: **hash 기반** (`location.hash`, `hashchange`), `#/route`, deep link `#/kind/N`. app.js 커스텀 라우터.
- 인증: **Supabase Auth Google OAuth** (+ dev용 password), ALLOWED_EMAILS 게이트, PKCE, IndexedDB 세션 저장. 계정은 Supabase Dashboard 사전 생성.
- 두 사용자 모델: `today_profiles.partner_user_id` (커플 페어링). RLS = 본인 데이터 + 파트너의 shared 데이터.
- 스키마: 번호 SQL 마이그레이션 (`supabase/migrations/0001_init.sql ...`). 공유 Supabase 프로젝트 **geo-apps** (Gym/Study/Today 공용) → 테이블 **prefix 로 충돌 회피** (`today_*`).
- 배포: GitHub Pages, base `/apps/<app>/` (`GH_PAGES=1` 시), `.github/workflows/deploy-pages.yml`.
- env: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (`.env.local`, gitignore). 누락 시 graceful 비활성.

**결론: v14 React 컴포넌트를 그대로 옮길 수 없음. UI 를 바닐라 DOM 렌더로 재작성한다. 디자인(CSS/시각)은 v14 그대로 이식, 로직만 신규 구현.**

---

## 1. 확정 결정 (Decided — 다음 세션은 그대로 실행. 재논의·위임 없음)

today/study/gym 관례 + book v14 데이터 실측에 근거해 **확정**한다. 사용자 재확인 불필요.

- **D1 — 책 카탈로그 = 클라이언트 상수.** `data.jsx` BOOKS(16) → `src/data/books.js` 상수 모듈(w/h/d/bg/fg/ax/deco 보존). DB 는 어구록·댓글만. (근거: v14 데이터에 사용자별 책 추가 개념 없음, 책 메타는 외부 소스. 다중 사용자 임의 책 추가는 후행 wave 에서 알라딘 API + `book_books` 도입.)
- **D2 — 1차 범위 = 어구록 CRUD · 피드 · 스레드 · 책상세 · 핀 · 댓글만 실데이터.** 분석 4화면(통계·단어·날짜·작가)은 1차에 정리된 더미로 렌더(스텁), 실집계는 W7. (근거: v14 분석 수치는 전부 mock, 집계 쿼리/뷰는 별도 설계 필요 — 핵심 가치 먼저.)
- **D3 — geo-apps Supabase 재사용 + 테이블 prefix `book_`.** `book/src/services/auth.js` 의 `ALLOWED_EMAILS = [지오, 소연]` (today auth.js:20 패턴). (근거: gym/study/today 모두 geo-apps 공유.)
- **D4 — `book_profiles` 신규(today_profiles 동일 스키마).** `partner_user_id` 로 지오↔소연 페어링 + `book_partner_id()` SQL 헬퍼 신설(today_partner_id() 미러). (근거: 앱 독립 — 타 앱 profiles 변경 영향 차단.)
- **D5 — 배포 `/apps/book/`** (GitHub Pages). deploy-pages.yml 에 book 빌드 step 추가 — 정확 절차 §9.
- **D6 — dev `5176` / preview `4176`** (strictPort). ⚠ 결정이 아니라 **W0 선행 액션**: geo-apps OAuth 클라이언트 redirect URI 에 `http://localhost:5176` 등록(미등록 시 redirect_uri_mismatch — today 5175 교훈).

---

## 2. 타깃 아키텍처 (today 구조 답습 — 검증된 패턴)

### 2.1 디렉토리 (today 미러)
```
book/
  index.html            # Vite entry. <div id="app"> + <div id="loadingScreen">, <script type="module" src="/src/main.js">
  vite.config.js        # PWA + base /apps/book/ (GH_PAGES), strictPort dev/preview
  package.json          # deps: @supabase/supabase-js, dexie / dev: vite, vite-plugin-pwa, vitest, @playwright/test, fake-indexeddb
  .env.local            # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (gitignore)
  public/               # icons/*.png, favicon, manifest(필요 시)
  src/
    main.js             # 부트스트랩: onAuthStateChange subscribe-first → ensureProfile → showAuthenticated / showLogin
    app.js              # hash 라우터 + 화면 mount/unmount, setRouterUser
    services/           # supabase.js, auth.js, auth-storage.js, auth-session-guard.js, profile.js
    db/                 # schema.js(Dexie), queries.js, sync.js, devSeed.js
    features/           # feed.js, thread.js, book-detail.js, add-edit.js, pins.js, stats.js, word.js, day.js, author.js, lists.js, search.js
    ui/                 # cover.js(Cv), quote-text.js, components.js(TopBar/BookRow/QuoteRow/Btn/Modal/Count...), icons.js
    data/               # books.js (D1=b 시 BOOKS 상수), groupQuotes 유틸
    styles/             # book.css (v14 :root 토큰 + 컴포넌트 CSS)
  supabase/
    config.toml, migrations/0001_book_init.sql ...
  specs/                # book-app-spec.md, book-port-spec.md(이 문서)
  e2e/                  # playwright
```

### 2.2 렌더 패턴 (바닐라)
- 컴포넌트 = 순수 함수 `(props) => string | HTMLElement`. 정적은 `innerHTML` 템플릿, 이벤트/동적은 `createElement` + `addEventListener`.
- **모든 사용자 텍스트는 `escapeHtml`** (today/features/comments.js 의 escapeHtml 재사용). XSS 방지.
- v14 의 인라인 React style 객체 → `src/styles/book.css` 클래스로 이전 (또는 동등 인라인 string). 시각은 v14 정합 유지.

### 2.3 데이터 흐름
- `db/queries.js` (Dexie read/write) ← `db/sync.js` (Supabase pull/push + Realtime + `pending_sync` 오프라인 큐).
- `features/*` 는 queries 호출 → DOM 렌더. 데이터 변경 시 재렌더(또는 부분 패치). Realtime echo dedup (pending id Set, today comments.js 패턴).

---

## 3. 데이터 모델

### 3.1 Supabase 테이블 (prefix `book_`, geo-apps) — `0001_book_init.sql`
today `0001_init.sql` 패턴 그대로, prefix 치환.

- **book_profiles**: `user_id uuid pk → auth.users`, `display_name text`, `partner_user_id uuid → auth.users`, `updated_at timestamptz`. (D4)
- **book_books** (D1=a 선택 시만): `id uuid pk`, `isbn text unique`, `title`, `subtitle`, `author`, `publisher`, `year int`, `category text`, `cover jsonb`(`{d,w,h,bg,fg,ax,deco}`), `created_at`. (D1=b → 생략, `src/data/books.js` 상수)
- **book_quotes**: `id uuid pk default gen_random_uuid()`, `owner_id uuid not null → auth.users`, `book_ref text not null`(D1=상수 → BOOKS id/isbn 문자열), `text text not null`, `pinned bool default false`, `created_at`, `updated_at`, `deleted_at`. 인덱스: `(owner_id, updated_at desc) where deleted_at is null`, 부부 피드 `(updated_at desc) where deleted_at is null`.
  - ⚠ **`is_shared` 없음 (착오 정정).** book v14 `data.jsx` 어구록에 공유/비공개 토글 필드가 없음(grep 0건). book 은 **부부 공용 저널** = 두 사람 어구록이 전부 공유 피드에 노출(소연=`who:'y'`). today 의 is_shared 개인/공유 모델을 도입하지 않는다.
- **book_comments**: `id uuid pk`, `quote_id uuid not null → book_quotes on delete cascade`, `author_id uuid not null → auth.users`, `body text not null`, `created_at`, `updated_at`, `deleted_at`. 인덱스 `(quote_id, created_at)`.
- 분석(통계/단어 등)은 집계 쿼리 또는 view — D2 따라 후행.

### 3.2 RLS (부부 전부 공유 — is_shared 조건 제거)
모든 테이블 `enable row level security`. `book_partner_id()` 헬퍼 신설 = today_partner_id() 미러(호출자 book_profiles.partner_user_id 반환). today_entries_select 식에서 **`is_shared` 조건만 제거**한 형태.
- **quotes select**: `owner_id = auth.uid() OR (owner_id = book_partner_id() AND deleted_at is null)`.
- **quotes write (for all)**: `using (owner_id = auth.uid()) with check (owner_id = auth.uid())`.
- **comments select**: 볼 수 있는 quote(본인 또는 파트너 소유)의 댓글 — `exists(select 1 from book_quotes q where q.id = quote_id and (q.owner_id = auth.uid() or q.owner_id = book_partner_id()))`.
- **comments insert with check**: `author_id = auth.uid()` + 위 select 와 동일한 quote 가시성 조건. (today 의 `is_shared=true` 게이트 없음 — 전부 공유.)
- **comments update/delete**: `using (author_id = auth.uid())`.
- ⚠ service_role key 절대 클라 번들 금지. anon key 만 `VITE_` 허용 (RLS 격리).

### 3.3 Dexie 오프라인 캐시 (today `db/schema.js` 팩토리 패턴)
```js
export function createBookDB(name = 'book') {
  const db = new Dexie(name);
  db.version(1).stores({
    quotes:   '&id, owner_id, book_ref, updated_at, deleted_at, pinned, [book_ref+updated_at], pending_sync',
    comments: '&id, quote_id, author_id, created_at, deleted_at, pending_sync',
  });
  return db;
}
```
- 사용자별 DB 이름 격리. `pending_sync` 오프라인 큐. sync.js 가 Supabase 와 reconcile (pull 최신 + push pending, today/db/sync.js 참고).

### 3.4 시드 (v14 목 데이터 → 마이그레이션/dev)
- `data.jsx` BOOKS(16) → `src/data/books.js` 상수 (D1=b) 또는 book_books seed SQL (D1=a). **w/h(mm)·d(디자인)·bg/fg/ax/deco 필드 보존** (표지 렌더 필수).
- `data.jsx` QUOTES(15)+comments → `db/devSeed.js` (today 패턴) 로컬/스테이징 시드. `who:'me'` → 지오 owner, `who:'y'` → 소연 owner. pin/comments 매핑.

---

## 4. 화면/컴포넌트 이식 매핑 (v14 → 바닐라)

원본은 모두 `book/*.jsx` (검증 완료). 시각·레이아웃은 그대로, 로직만 재작성.

| v14 원본 | → 타깃 모듈 | 데이터 소스 | 비고 |
|---|---|---|---|
| `core.jsx` Cv | `ui/cover.js` | books 상수/테이블 | w/h·d·bg/fg/ax/deco → DOM. scale·lift 인자 유지 |
| `core.jsx` QuoteText·Ic | `ui/quote-text.js`·`ui/icons.js` | — | 곡선따옴표 serif, SVG 아이콘 맵 |
| `core-v9.jsx` Btn·HoverActions | `ui/components.js` | — | variant/size, 호버 액션 |
| `core-v14.jsx` TopBar·BookRow·QuoteRow·StreakCard·PageTitle·Modal·Count·CountPill | `ui/components.js` | 집계/props | TopBar 탭·검색·새 어구록 |
| `core-v10/v12.jsx` Comparison·Calendar·BookStack·HoverActionsV12 | `ui/components.js` | 집계 | 캘린더는 stats 에서 |
| `feed-v14.jsx` ScrFeedV14 + Rail* | `features/feed.js` | `queries.listFeed` + 집계 | groupQuotes 유지, 사이드(streak/pins/comparison/retro) |
| `details-v14.jsx` ScrThreadV14 + ThreadComments | `features/thread.js` | quotes by book + comments | 앵커·점선 댓글·인라인 입력 |
| `details-v14.jsx` ScrBookV14 | `features/book-detail.js` | book + quotes | hero + 어구록 목록 |
| `details-v14.jsx` ScrWordV14·ScrDayV14·ScrAuthorV14 | `features/word.js·day.js·author.js` | 집계(D2: 1차 mock 스텁) | hero + 차트 + 리스트 |
| `stats-v14.jsx` ScrStatsV14 + CategoryBars·Bookshelf14·AuthorRow·PubRow | `features/stats.js` | 집계(D2) | streak·3숫자·캘린더·분야바 |
| `list-v14.jsx` All{Books,Authors,Pubs,Pins} | `features/lists.js` | 집계/쿼리 | 모두보기 4종 |
| `actions-v14.jsx` Add·Edit·Delete·Pin·Comment | `features/add-edit.js` | queries CRUD | Modal + 핀 토글/댓글 인라인 |

### 4.1 라우팅 (v14 작업지시서 §4.1 → hash, app.js)
```
#/                      → feed
#/stats                 → stats
#/book/:ref             → book-detail
#/thread/:ref/:quoteId? → thread
#/word/:w               → word
#/day/:d                → day
#/author/:name          → author
#/all/books|authors|pubs|pins → lists
#/add  #/edit/:id  #/delete/:id → add-edit (modal: 라우트 또는 오버레이 상태)
#/login                 → 로그인 (auth 게이트)
```
- v14 의 전역 `go/back` 임시 라우터(`book/app.jsx`)는 폐기 → app.js hash 라우터로. 클릭 핸들러는 `location.hash = ...`.
- 모달(add/edit/delete)은 라우트화 또는 오버레이 상태 중 택1 (today 는 editor 오버레이 패턴 — `features/editor.js` 참고).

---

## 5. CSS 이식
- `book/index.html` 의 `<style>` (v14 `:root` 토큰 + `.bk`/`.book-row`/`.quote-row`/`.hov-actions`/스크롤바 숨김/반응형 미디어쿼리) → `src/styles/book.css` 로 이동, `main.js` 에서 import (또는 index.html link).
- 폰트 link 유지: Pretendard, Noto Serif KR, JetBrains Mono.
- v14 컴포넌트의 인라인 style 객체는 클래스로 정리하되 **시각 결과는 v14 와 동일**해야 함(검증된 디자인). 디자인 회귀 금지(작업지시서 §5 폐기 항목: kbd·탭바·토스트·세로선·dot·sphere glow 재도입 금지).
- 반응형(.feed-grid/.day-grid/.stats-row-*/.topbar 등) + 스크롤바 숨김 규칙 그대로.

---

## 6. 작업 순서 (Wave) — 각 Wave 끝 검증 + Conventional Commit

- **W0 — scaffold**: today 복제 → book 화. package.json·vite.config.js·index.html·.env.local. supabase.js·auth·로그인 화면. `pnpm dev` 동작 + 로그인 게이트.
- **W1 — DB**: `0001_book_init.sql`(테이블 + `book_partner_id()` 헬퍼 + RLS[is_shared 없는 owner-or-partner] + 인덱스) 적용. Dexie `schema.js`·`queries.js`·`sync.js`(기본 pull/push). devSeed(`who:'me'`→지오, `who:'y'`→소연).
- **W2 — UI 토대**: `styles/book.css` 이식, `ui/`(cover·components·icons·quote-text), TopBar + app.js hash 라우터 셸.
- **W3 — 피드**: `feed.js` + groupQuotes + 사이드(streak/pins/comparison/retro; 집계 또는 D2 스텁).
- **W4 — 스레드/댓글**: `thread.js` + comments CRUD + Realtime + 인라인 댓글/핀 토글(토스트 없이 NEW).
- **W5 — 추가/수정/삭제**: `add-edit.js` modal + quotes CRUD + 핀 토글 인라인 + 붙여넣기 감지(선택).
- **W6 — 책상세 + 모두보기**: book-detail + lists(책/작가/출판사/핀).
- **W7 — 분석**: stats·word·day·author — D2 결정대로 실집계 or 정리된 mock.
- **W8 — PWA/배포/e2e**: manifest·icons, deploy-pages.yml 에 book 추가, GH_PAGES base, playwright e2e.

각 Wave: 가능한 작은 단위(서브웨이브)로 쪼개고 끝마다 검증(아래 §7).

---

## 7. 검증 기준 (각 Wave 필수)
- **단위**: `pnpm vitest run` (⚠ watch 금지 — freeze). co-located `*.test.js`, fake-indexeddb. queries/sync/feature 로직 커버.
- **시각/통합**: `pnpm dev`(또는 preview) + preview MCP 스크린샷. 작업지시서 §7 체크리스트(kbd 없음·카운트 통일·앵커 바·날짜 세로선/dot 0·hero 크기 등) 재확인.
- **e2e**: playwright — 로그인 → 어구록 추가 → 댓글 → 핀 핵심 플로우.
- **RLS**: 지오/소연 2계정으로 격리·공유 검증 (소연은 shared 어구록만 보임, 댓글 권한).
- **거짓말 방지**: 검증 안 한 항목은 "미검증" 명시. 단정 시 도구 stdout/파일·라인 인용.

---

## 8. 리스크 / 함정 (today·CLAUDE.md 경험)
- **vitest watch freeze** → 항상 `pnpm vitest run`.
- **pnpm 10 onlyBuiltDependencies** → `["esbuild"]` 누락 시 postinstall 차단.
- **OAuth redirect_uri_mismatch** → 신규 dev/preview 포트를 geo-apps OAuth 클라이언트 redirect URI 에 사전 등록 (D6).
- **공유 Supabase 프로젝트** → 테이블 prefix `book_` 필수 (today_/study_/gym_ 와 충돌 회피).
- **secret** → anon key 만 `VITE_` 번들 허용(RLS 격리), service_role 절대 금지. `import.meta.env` 는 빌드타임 인라인(런타임 변경 불가).
- **iOS Safari PWA 세션 풀림** → main.js subscribe-first 패턴 답습(getSession race #1560).
- **Realtime echo 중복** → pending id Set dedup (today comments.js `_pendingCommentIds`).
- **React→바닐라 재작성 비용** → v14 의 React 상태/이펙트(useMemo 워드클라우드 등)는 순수 함수+1회 계산으로. 워드클라우드 패킹 알고리즘(`wordcloud.jsx packCloud`)은 로직 그대로 JS 이식 가능.

---

## 9. 참조 (실제 코드 — 복제/이식 출발점, 직접 확인함)
- **스택·스캐폴드**: `today/package.json`, `today/vite.config.js`, `today/index.html`, `today/src/main.js`, `today/src/app.js`
- **Supabase/인증**: `today/src/services/supabase.js`, `auth.js`, `auth-storage.js`, `auth-session-guard.js`, `profile.js`
- **DB**: `today/src/db/schema.js`, `queries.js`, `sync.js`, `devSeed.js`
- **2인 댓글 패턴**(book 댓글 직접 모델): `today/src/features/comments.js`(+`.test.js`)
- **마이그레이션/RLS**: `today/supabase/migrations/0001_init.sql` → `book_` prefix 치환
- **배포**: `.github/workflows/deploy-pages.yml` (실측 — gym→study→today 각 빌드 후 `_site/<app>/` 결합, 루트 index 에 앱 링크, `cp index.html 404.html` SPA fallback, repo secrets 로 VITE env 주입, pnpm10/node22). **book 추가 4단계**: ① `cache-dependency-path` 에 `book/pnpm-lock.yaml` ② `Build book` step(`cd book && pnpm install --frozen-lockfile && pnpm build && cp dist/index.html dist/404.html`, env `GH_PAGES=1`+`VITE_SUPABASE_*`) ③ Combine 에 `[ -d book/dist ] && cp -r book/dist _site/book` ④ 루트 index 에 `<a href="book/">📖 Book</a>`. (secrets `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY` 이미 존재)
- **디자인 원본(스펙)**: `book/*.jsx` + `book/index.html` (v14, 시각 검증 완료 `d75d563`)
- **앱 spec 포맷**: `study/specs/study-app-spec.md`, `gym/specs/gym-app-spec.md`

---

## 10. 다음 세션 시작 절차
1. 이 문서 + §9 참조 파일들 Read.
2. §1 결정(D1~D6)은 **확정됨** — 재논의 없이 그대로 적용. (D6 의 OAuth redirect URI 등록만 W0 선행 액션.)
3. `today/` 를 출발점으로 W0 scaffold 착수.
4. Wave 단위 진행 + 각 끝 §7 검증 + 커밋.





