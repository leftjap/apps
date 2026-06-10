# Taste Wave 1 구현 플랜 — 파운데이션 + 디자인 셸 + 평가 루프

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **갱신 2026-06-05**: 디자인 핸드오프(`taste/design-ref/`) 정본 반영. UI는 React 프로토타입을 **바닐라 JS로 포팅**. 추천 피드·갈래는 Wave 2 엔진 → Wave 1은 **빈 상태**로 둔다. (구 플랜의 `#/ratings` 탭·placeholder UI 폐기.)

**Goal:** 지오가 로그인해 — 책은 **알라딘 검색**으로, 영화는 **왓챠 CSV**로 — 작품을 찾아 **작품 상세 허브의 별점(0.5단위, 0.5★=비추)** 으로 평가하고 Supabase에 개인 격리로 저장하는, 디자인 충실한 working PWA. 추천 Featured·트랙·갈래는 **빈 상태**(Wave 2 엔진이 채움).

**Architecture:** `today`의 빌드·인증·Dexie·sync 인프라를 미러하되 partner/공유 로직 제거(`owner_id = auth.uid()` 개인 격리). UI는 `taste/design-ref/source`(taste.html 토큰·CSS + ui/home/detail/main jsx)를 **바닐라 JS(`el` 기반)로 포팅**. 라우팅은 디자인의 view-state(`{name, path[]}`)를 hash(`#/`, `#/w/:id`, `#/import`, `#/library`)에 매핑 + **검색 오버레이(1급, 라우트 아님)**. 알라딘은 `book`에서 재사용.

**Tech Stack:** 바닐라 JS(ES Modules), Vite 6 + vite-plugin-pwa, @supabase/supabase-js, Dexie, Vitest, Playwright. 폰트 3종(Pretendard / Noto Serif KR / JetBrains Mono). 참조 spec: `taste/specs/taste-app-spec.md`. 디자인 정본: `taste/design-ref/`.

---

## 선행조건 (지오 액션 — Task 7 인증 검증 전까지 필요)

- [ ] geo-apps Google OAuth 클라이언트 redirect URI에 `http://localhost:5177` 추가 (Google Cloud Console). 없으면 로그인 시 `redirect_uri_mismatch`.
- [ ] (Wave 2용, 지금 안 해도 됨) TMDB API key 발급 — 인앱 영화 검색·추천 검증용.

알라딘 키(`ALADIN_TTB_KEY=ttbleftjap1352001`)·Supabase Edge Function `aladin`은 book이 이미 쓰는 것을 공유 → 신규 발급 불필요.

---

## File Structure (생성/수정 파일 맵)

```
taste/
  package.json              T1  name=taste, today deps 미러
  vite.config.js            T1  base /apps/taste/, port 5177/4177, PWA, /api/aladin proxy
  playwright.config.js      T1  port 4177
  index.html                T1  #loadingScreen + #app, title Taste, 폰트 3종 link
  .env.local                T1  VITE_SUPABASE_*, ALADIN_TTB_KEY (gitignore)
  .gitignore                T1
  public/manifest.webmanifest, icons/  T1
  src/
    styles/taste.css        T2  ★디자인★ design-ref taste.html <style> 토큰·전역·셸·오버레이·포스터·별점·홈·상세·갈래·반응형 그대로
    ui/dom.js               T2  book 복사 (el/clear/frag/escapeHtml — 순수)
    ui/rating.js            T6  ★디자인★ StarRating (0.5 half-hit, clip-path, isPan 비추) + ratingLabel(보조)
    ui/rating.test.js       T6  ★디자인★ starFill/isPan/ratingLabel TDD
    ui/poster.js            T6  ★디자인★ Poster(oklch stripe + book spine), chip, dot
    services/supabase.js          T3  today 복사 (무변경)
    services/auth-storage.js      T3  today 복사 (무변경)
    services/auth-session-guard.js T3 today 복사 (무변경)
    services/auth.js              T3  today 미러 + prefix 치환
    services/profile.js           T3  최소형 (partner 제거)
    db/schema.js            T4  ★신규★ Dexie: ratings, recommendations
    db/queries.js           T4  ★신규★ rating CRUD (today 골격)
    db/queries.test.js      T4  ★신규★ TDD
    db/aladin.js            T10 book 복사 (무변경)
    db/sync.js              T5  ★신규★ TABLE_MAP 2개, filterColumn owner_id
    app.js                  T7  ★디자인★ view-state {name,path[]} 라우터 + 셸(상단바·계정메뉴) + ⌘K
    ui/login.js             T7  ★신규★ 로그인 카드 (today app.js 축약)
    main.js                 T7  today 부트스트랩 미러 + import './styles/taste.css'
    features/detail.js      T8  ★디자인★ 작품 상세 허브 (rail+줄거리+갈래빈+ratebox)
    features/home.js        T9  ★디자인★ 홈 피드 (인트로+세그먼트+Featured빈+트랙빈+최근)
    features/search.js      T10 ★디자인★ 검색 오버레이 (로컬+알라딘 책) — 셸이 mount
    features/import.js      T11 ★디자인★ 왓챠 CSV import (#/import)
    features/library.js     T12 ★디자인★ 내 서재 전체 평점 목록 (#/library)
    lib/watcha.js           T11 ★신규★ CSV 파서
    lib/watcha.test.js      T11 ★신규★ TDD
  supabase/migrations/0001_taste_init.sql  T3.5 ★신규★ (지오 적용)
```

> **포팅 원칙(전 디자인 Task 공통)**: React 컴포넌트(`design-ref/source/app/*.jsx`)를 `el()`-기반 바닐라로 옮긴다. **CSS 클래스명·DOM 구조·수치는 그대로**(taste.css가 정본). React `useState`는 클로저 지역 상태 + 재렌더 함수로, props는 함수 인자로 치환. `tweaks-panel.jsx`는 시안 전용 → **이식 안 함**(디자인 §12 기본값만 적용).

---

## Task 1: 프로젝트 스캐폴딩

**Files:** `taste/package.json`, `vite.config.js`, `playwright.config.js`, `index.html`, `.env.local`, `.gitignore`, `public/`

- [ ] **Step 1: today 설정 파일 복사 후 치환**

```bash
cd ~/apps
cp today/package.json today/vite.config.js today/playwright.config.js today/index.html taste/
cp -r today/public taste/public   # manifest, icons, cat-loading.jpg
```

- [ ] **Step 2: package.json 치환** — L2 `"name": "today"` → `"name": "taste"`. (deps/devDeps/scripts/`pnpm.onlyBuiltDependencies:["esbuild"]` 그대로.)

- [ ] **Step 3: vite.config.js 치환 + 알라딘 proxy 추가**

`taste/vite.config.js`:
- base: `'/apps/today/'` → `'/apps/taste/'`
- `server.port` 5175 → `5177`, `preview.port` 4175 → `4177`, 포트 주석의 5175 → 5177
- `server` 블록에 알라딘 proxy 추가. **구현 시 `book/vite.config.js`의 정확한 proxy 블록(+`loadEnv`로 `ALADIN_TTB_KEY` 로드)을 Read해 그대로 옮길 것.** 형태:

```js
server: {
  port: 5177, strictPort: true, host: '0.0.0.0',
  proxy: {
    '/api/aladin': {
      target: 'https://www.aladin.co.kr/ttb/api',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/api\/aladin/, ''),
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq) => {
          const url = new URL(proxyReq.path, 'https://www.aladin.co.kr');
          if (!url.searchParams.get('ttbkey')) {
            url.searchParams.set('ttbkey', process.env.ALADIN_TTB_KEY || '');
            proxyReq.path = url.pathname + url.search;
          }
        });
      },
    },
  },
},
```

- [ ] **Step 4: index.html / playwright.config.js / manifest 치환 + 폰트 3종**

- `index.html`: title `"Today"`→`"Taste"`, `<title>Taste</title>`. `#loadingScreen`+`#app` 구조 그대로. `<head>`에 **폰트 3종** link 추가 (design-ref/source/taste.html L9-10 그대로):
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" />
```
- `playwright.config.js`: `baseURL`+`webServer.url` `4175`→`4177`.
- `public/manifest.webmanifest`: name/short_name `"Today"`→`"Taste"`.

- [ ] **Step 5: .env.local + .gitignore** — `taste/.gitignore`(today 복사). `taste/.env.local`(gitignore됨): `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`(book/today/.env.local에서 확인) + `ALADIN_TTB_KEY=ttbleftjap1352001`.

- [ ] **Step 6: 설치 + 빌드** Run: `cd ~/apps/taste && pnpm install && pnpm build` → Expected: `dist/` 생성, 에러 없음.

- [ ] **Step 7: Commit**
```bash
cd ~/apps && git add taste/package.json taste/vite.config.js taste/playwright.config.js taste/index.html taste/.gitignore taste/public && git commit -m "feat(taste): 프로젝트 스캐폴딩 — today 인프라 미러 + 알라딘 proxy + 폰트 3종"
```

---

## Task 2: 디자인 토큰·전역 CSS 이식 + dom 헬퍼

**Files:** `taste/src/styles/taste.css`, `taste/src/ui/dom.js`

- [ ] **Step 1: dom.js 복사 (book, 순수)**
```bash
cd ~/apps && mkdir -p taste/src/ui taste/src/styles
cp book/src/ui/dom.js taste/src/ui/dom.js
```
`el/setStyle/clear/frag/escapeHtml` — book 도메인 의존 0 → 무변경. (icons.js·cover.js는 **복사 안 함** — 디자인은 clip-path 별 + 유니코드 글리프(`⌕`) + oklch Poster를 쓰므로 아이콘폰트·book cover 불요.)

- [ ] **Step 2: taste.css 작성** — `design-ref/source/taste.html`의 `<style>` 블록(L12–L349) **전체를 그대로** `taste/src/styles/taste.css`로 옮긴다. 포함: `:root` 토큰, 전역(`body`/`button`/`a`/`::selection`/`.num`), 밀도(`.dens-*`)·읽는본문(`.read-serif`), 상단바(`.topbar`/`.brand`/`.searchcue`/`.account`/`.avatar`/`.menu`), `.stage`, 검색 오버레이(`.search-scrim`/`.search`/`.sresult`), 포스터(`.poster`/`.poster--book`/`.poster__spine`), 별점(`.stars`/`.star`/`.star__track`/`.star__fill`/`.star__hit`/`.stars__pan`), 칩·점(`.chip`/`.dot`), 스켈레톤(`.sk`/`.pulse`), 홈(`.home`/`.seg`/`.feat`/`.basis`/`.tracks`/`.rec`/`.recent`), 상세(`.detail`/`.trail`/`.rail`/`.info`/`.ratebox`/`.reading`), 갈래(`.branches`/`.branch`), 반응형(`@880`/`@560`/`reduced-motion`).

- [ ] **Step 3: 빌드 확인 + Commit** Run: `cd ~/apps/taste && pnpm build` → 에러 없음.
```bash
cd ~/apps && git add taste/src/styles/taste.css taste/src/ui/dom.js && git commit -m "feat(taste): 디자인 토큰·전역 CSS 이식 + dom 헬퍼"
```

---

## Task 3: 인증 서비스 미러 (today, partner 제거)

**Files:** `taste/src/services/{supabase,auth-storage,auth-session-guard,auth,profile}.js`

- [ ] **Step 1: 무변경 복사 3종**
```bash
cd ~/apps && mkdir -p taste/src/services
cp today/src/services/supabase.js today/src/services/auth-storage.js today/src/services/auth-session-guard.js taste/src/services/
```

- [ ] **Step 2: auth.js 미러 + 치환** — `cp today/src/services/auth.js taste/src/services/auth.js` 후: import `createTodayDB`→`createTasteDB`(`from '../db/schema.js'`); DB명 `'today_'+hash`→`'taste_'+hash`; `AUTH_ERROR_KEY 'todayAuthError'`→`'tasteAuthError'`; `window.todayDB`/`window.todayAuth`→`window.tasteDB`/`window.tasteAuth`; `ALLOWED_EMAILS`(leftjap, soyoun312) 그대로.

- [ ] **Step 3: profile.js 최소형 신규 (partner 전부 제거)**
```js
// taste profiles: 개인 격리. partner_user_id 없음. display_name만.
import { supabase } from './supabase.js';
export async function ensureProfile(user) {
  if (!supabase || !user) return null;
  const { data } = await supabase.from('taste_profiles')
    .select('user_id, display_name').eq('user_id', user.id).maybeSingle();
  if (data) return data;
  const display_name = user.user_metadata?.name || user.email || 'me';
  const { data: created } = await supabase.from('taste_profiles')
    .upsert({ user_id: user.id, display_name }, { onConflict: 'user_id' })
    .select('user_id, display_name').maybeSingle();
  return created || null;
}
export const Profile = { ensureProfile };
if (typeof window !== 'undefined') window.tasteProfile = Profile;
```

- [ ] **Step 4: Commit** (schema.js T4 이후 함께 빌드 검증)
```bash
cd ~/apps && git add taste/src/services && git commit -m "feat(taste): 인증 서비스 미러 — today 복사 + partner 제거 개인 격리"
```

---

## Task 3.5: Supabase 마이그레이션 0001 (지오가 적용)

**Files:** `taste/supabase/migrations/0001_taste_init.sql`

> recommendations 테이블은 Wave 1에선 미사용(추천 엔진은 Wave 2). 0001은 ratings 중심. 갈래(branch) 차원은 **마이그 0002(Wave 2)** 에서 추가.

- [ ] **Step 1: 마이그 작성** (`today_expenses` 개인격리 RLS를 정본으로)
```sql
-- taste 초기 스키마. Project: geo-apps 공유 → prefix taste_. 개인 격리(partner 없음).
create table if not exists taste_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  updated_at timestamptz not null default now()
);
create table if not exists taste_ratings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  media_type text not null check (media_type in ('movie','book')),
  title text not null,
  year int,
  external_id text,                 -- TMDB id(영화) / ISBN13(책)
  rating numeric(2,1) not null check (rating >= 0.5 and rating <= 5.0),
  source text not null check (source in ('watcha','app')),
  rated_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (owner_id, media_type, title, year)
);
create index if not exists taste_ratings_owner_updated on taste_ratings (owner_id, updated_at);
create table if not exists taste_recommendations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  media_type text not null check (media_type in ('movie','book')),
  title text not null,
  year int,
  external_id text,
  reason text not null,
  poster_url text,
  batch_id text not null,
  generated_at timestamptz not null default now()
);
create index if not exists taste_reco_owner_batch on taste_recommendations (owner_id, batch_id);
alter table taste_profiles enable row level security;
alter table taste_ratings enable row level security;
alter table taste_recommendations enable row level security;
create policy taste_profiles_own on taste_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy taste_ratings_own on taste_ratings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy taste_reco_own on taste_recommendations
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
alter publication supabase_realtime add table taste_ratings;
```

- [ ] **Step 2: 지오에게 적용 요청** (DB 마이그는 destructive 사전확인 대상) — Supabase SQL 에디터 실행 또는 `source ~/.config/study/.env` 후 psql. **Claude 자동 적용 금지.** 적용 후 테이블 3·정책 3·realtime 1 확인.

- [ ] **Step 3: Commit**
```bash
cd ~/apps && git add taste/supabase/migrations/0001_taste_init.sql && git commit -m "feat(taste): Supabase 마이그 0001 — ratings/recommendations 개인 격리 RLS"
```

---

## Task 4: Dexie schema + rating 쿼리 (TDD)

**Files:** `taste/src/db/schema.js`, `queries.js`, `queries.test.js`

- [ ] **Step 1: 실패 테스트** `taste/src/db/queries.test.js`
```js
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createTasteDB } from './schema.js';
import { createRating, updateRating, softDeleteRating, listRatings } from './queries.js';

describe('rating queries', () => {
  beforeEach(() => { globalThis.tasteDB = createTasteDB('taste_test_' + Math.random()); });
  it('createRating: owner_id 필수, id/ts 자동, pending_sync=1', async () => {
    const r = await createRating({ owner_id: 'u1', media_type: 'book', title: '데미안', year: 1919, rating: 4.5, source: 'app' });
    expect(r.id).toBeTruthy(); expect(r.created_at).toBeTruthy(); expect(r.pending_sync).toBe(1);
    expect(await listRatings('u1')).toHaveLength(1);
  });
  it('createRating: owner_id 누락 시 throw', async () => {
    await expect(createRating({ media_type: 'book', title: 'x', rating: 3, source: 'app' })).rejects.toThrow();
  });
  it('updateRating: rating 변경', async () => {
    const r = await createRating({ owner_id: 'u1', media_type: 'book', title: 'a', rating: 3, source: 'app' });
    expect((await updateRating(r.id, { rating: 5 })).rating).toBe(5);
  });
  it('softDeleteRating: listRatings 제외', async () => {
    const r = await createRating({ owner_id: 'u1', media_type: 'book', title: 'a', rating: 3, source: 'app' });
    await softDeleteRating(r.id); expect(await listRatings('u1')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 실패 확인** Run: `cd ~/apps/taste && pnpm vitest run src/db/queries.test.js` → FAIL. ⚠ `pnpm vitest run`(watch 금지).

- [ ] **Step 3: schema.js**
```js
import Dexie from 'dexie';
export function createTasteDB(name = 'taste') {
  const db = new Dexie(name);
  db.version(1).stores({
    ratings: '&id, owner_id, media_type, updated_at, deleted_at, [owner_id+media_type], pending_sync',
    recommendations: '&id, owner_id, media_type, batch_id, generated_at, pending_sync',
  });
  return db;
}
export default createTasteDB;
```

- [ ] **Step 4: queries.js** (today queries.js:170-283 골격)
```js
const db = () => { const d = globalThis.tasteDB; if (!d) throw new Error('[tasteQueries] tasteDB 미초기화'); return d; };
const newId = () => (globalThis.crypto?.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));
const nowIso = () => new Date().toISOString();
const enqueue = (id) => { try { globalThis.tasteSync?.queueUpload?.('ratings', id); } catch (e) {} };
export async function createRating(input) {
  if (!input?.owner_id) throw new Error('[tasteQueries] owner_id 누락');
  const row = { id: newId(), owner_id: input.owner_id, media_type: input.media_type,
    title: input.title, year: input.year ?? null, external_id: input.external_id ?? null,
    rating: input.rating, source: input.source, rated_at: input.rated_at ?? null,
    meta: input.meta ?? {}, created_at: nowIso(), updated_at: nowIso(), deleted_at: null, pending_sync: 1 };
  await db().ratings.add(row); enqueue(row.id); return row;
}
export async function updateRating(id, patch) {
  const cur = await db().ratings.get(id); if (!cur) return null;
  const next = { ...cur, ...patch, updated_at: nowIso(), pending_sync: 1 };
  await db().ratings.put(next); enqueue(id); return next;
}
export async function softDeleteRating(id) { return updateRating(id, { deleted_at: nowIso() }); }
export async function getRating(owner_id, media_type, title, year) {
  const rows = await db().ratings.where('[owner_id+media_type]').equals([owner_id, media_type]).toArray();
  return rows.find((r) => !r.deleted_at && r.title === title && (r.year ?? null) === (year ?? null)) || null;
}
export async function listRatings(owner_id, mediaType) {
  const rows = await db().ratings.where('owner_id').equals(owner_id).toArray();
  return rows.filter((r) => !r.deleted_at && (!mediaType || r.media_type === mediaType))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}
export async function listPendingRatings() { return db().ratings.where('pending_sync').equals(1).toArray(); }
export async function setPendingSync(id, v) { const c = await db().ratings.get(id); if (c) await db().ratings.put({ ...c, pending_sync: v }); }
export const Queries = { createRating, updateRating, softDeleteRating, getRating, listRatings, listPendingRatings, setPendingSync };
if (typeof window !== 'undefined') window.tasteQueries = Queries;
```
> `getRating`은 상세 ratebox가 "이미 평가됨?"을 판정해 create/update 분기하는 데 쓴다(T8).

- [ ] **Step 5: 통과 확인** Run: `pnpm vitest run src/db/queries.test.js` → PASS (4).

- [ ] **Step 6: Commit**
```bash
cd ~/apps && git add taste/src/db/schema.js taste/src/db/queries.js taste/src/db/queries.test.js && git commit -m "feat(taste): Dexie schema + rating CRUD (TDD 4/4)"
```

---

## Task 5: sync.js — pending_sync 큐 (owner_id 격리)

**Files:** `taste/src/db/sync.js`

- [ ] **Step 1: sync.js 작성** (today sync.js 패턴 압축, TABLE_MAP 2개 모두 filterColumn `owner_id`)
```js
import { supabase } from '../services/supabase.js';
import { listPendingRatings, setPendingSync } from './queries.js';
export const TABLE_MAP = Object.freeze([
  { dexie: 'ratings', supabase: 'taste_ratings', filterColumn: 'owner_id' },
  { dexie: 'recommendations', supabase: 'taste_recommendations', filterColumn: 'owner_id' },
]);
const PAGE = 1000;
const isUuid = (id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
const stripMeta = (row) => { const o = { ...row }; delete o.pending_sync; return o; };
async function pullTable(m, db, userId) {
  if (!supabase || !db || !userId) return;
  let from = 0, all = [];
  for (;;) {
    const { data, error } = await supabase.from(m.supabase).select('*').eq(m.filterColumn, userId).range(from, from + PAGE - 1);
    if (error) return; all = all.concat(data || []);
    if (!data || data.length < PAGE) break; from += PAGE;
  }
  await db[m.dexie].bulkPut(all.map((r) => ({ ...r, pending_sync: 0 })));
}
export async function pullAll(db, userId) { await Promise.all(TABLE_MAP.map((m) => pullTable(m, db, userId))); }
let _timers = {};
export function queueUpload(store, id) { clearTimeout(_timers[id]); _timers[id] = setTimeout(() => pushRating(id), 800); }
async function pushRating(id) {
  if (!supabase) return;
  const db = globalThis.tasteDB; const row = await db.ratings.get(id); if (!row) return;
  if (!isUuid(id)) { await setPendingSync(id, 0); return; }
  const { error } = await supabase.from('taste_ratings').upsert(stripMeta(row), { onConflict: 'id' });
  await setPendingSync(id, error ? 1 : 0);
}
export async function flushPending() { const p = await listPendingRatings(); for (const r of p) await pushRating(r.id); }
export async function startSync(user) { const db = globalThis.tasteDB; if (!db || !user) return; await pullAll(db, user.id); await flushPending(); }
export const Sync = { TABLE_MAP, pullAll, queueUpload, flushPending, startSync };
if (typeof window !== 'undefined') window.tasteSync = Sync;
```

- [ ] **Step 2: 빌드 + Commit** Run: `pnpm build` → 에러 없음.
```bash
cd ~/apps && git add taste/src/db/sync.js && git commit -m "feat(taste): sync — pending_sync 큐 + owner_id 격리 reconcile"
```

---

## Task 6: 공용 컴포넌트 — StarRating(TDD) + Poster/Chip/Dot

**Files:** `taste/src/ui/rating.js`, `rating.test.js`, `taste/src/ui/poster.js`
**디자인 정본:** `design-ref/source/app/ui.jsx` (Poster L4-29, StarRating L31-92, Chip L94-101, Dot L103-106), CSS는 taste.css.

- [ ] **Step 1: 실패 테스트** `taste/src/ui/rating.test.js` — 포팅의 **순수 로직**(별 채움%·비추 판정·앵커 라벨)을 검증.
```js
import { describe, it, expect } from 'vitest';
import { starFill, isPan, ratingLabel } from './rating.js';

describe('starFill (별 i의 채움 0~100%)', () => {
  it('4.5 → 별4 100%, 별5 50%', () => { expect(starFill(4.5, 4)).toBe(100); expect(starFill(4.5, 5)).toBe(50); });
  it('0.5 → 별1 50%, 별2 0%', () => { expect(starFill(0.5, 1)).toBe(50); expect(starFill(0.5, 2)).toBe(0); });
  it('0 → 전부 0', () => { for (let i = 1; i <= 5; i++) expect(starFill(0, i)).toBe(0); });
});
describe('isPan (0.5★=비추)', () => {
  it('0.5만 비추', () => { expect(isPan(0.5)).toBe(true); expect(isPan(1)).toBe(false); expect(isPan(0)).toBe(false); });
});
describe('ratingLabel (보조 — UI 미표시, aria/유틸용. spec D2 앵커)', () => {
  it('0.5=비추,1~2=별로,2.5~3=보통,3.5~4=추천,4.5~5=최애,null=빈', () => {
    expect(ratingLabel(0.5)).toBe('비추'); expect(ratingLabel(2)).toBe('별로'); expect(ratingLabel(3)).toBe('보통');
    expect(ratingLabel(4)).toBe('추천'); expect(ratingLabel(5)).toBe('최애'); expect(ratingLabel(null)).toBe('');
  });
});
```

- [ ] **Step 2: 실패 확인** Run: `pnpm vitest run src/ui/rating.test.js` → FAIL.

- [ ] **Step 3: rating.js** — ui.jsx StarRating을 바닐라로. 별 위에 `clip-path` 트랙+채움 2겹, `editable`이면 좌/우 절반 히트버튼(`x.5`/`x.0`), `isPan`이면 `stars--pan`+빨강 `비추` 칩.
```js
import { el } from './dom.js';

export const STAR_CLIP = 'polygon(50% 2%, 61% 35%, 97% 35%, 68% 57%, 79% 92%, 50% 71%, 21% 92%, 32% 57%, 3% 35%, 39% 35%)';
export const starFill = (value, i) => Math.max(0, Math.min(1, (value || 0) - (i - 1))) * 100;
export const isPan = (value) => value > 0 && value <= 0.5;            // 비추
export function ratingLabel(v) {                                       // 보조(UI 미표시)
  if (v == null) return '';
  if (v <= 0.5) return '비추'; if (v <= 2.0) return '별로';
  if (v <= 3.0) return '보통'; if (v <= 4.0) return '추천'; return '최애';
}

// design-ref/source/app/ui.jsx StarRating 포팅. value 0~5(0.5단위).
export function starRating({ value = 0, editable = false, onChange, size = 22, showValue = true } = {}) {
  const wrap = el('div', { class: 'stars' });
  let hover = null;
  const draw = () => {
    const shown = hover != null ? hover : value;
    const pan = isPan(shown);
    const fillColor = pan ? 'var(--danger)' : 'var(--gold)';
    wrap.className = 'stars' + (pan ? ' stars--pan' : '');
    wrap.innerHTML = '';
    const row = el('div', { class: 'stars__row' });
    for (let i = 1; i <= 5; i++) {
      const star = el('div', { class: 'star', style: `width:${size}px;height:${size}px` },
        el('div', { class: 'star__track', style: `clip-path:${STAR_CLIP}` }),
        el('div', { class: 'star__fill', style: `clip-path:${STAR_CLIP};width:${starFill(shown, i)}%;background:${fillColor}` }));
      if (editable) {
        const half = el('button', { class: 'star__hit', style: 'left:0', 'aria-label': `${i - 0.5}점` });
        const full = el('button', { class: 'star__hit', style: 'right:0', 'aria-label': `${i}점` });
        half.addEventListener('mouseenter', () => { hover = i - 0.5; draw(); });
        full.addEventListener('mouseenter', () => { hover = i; draw(); });
        half.addEventListener('click', () => onChange && onChange(i - 0.5));
        full.addEventListener('click', () => onChange && onChange(i));
        star.append(half, full);
      }
      row.appendChild(star);
    }
    wrap.appendChild(row);
    if (showValue) {
      const shownV = hover != null ? hover : value;
      const meta = el('div', { class: 'stars__meta' });
      if (shownV > 0) {
        meta.appendChild(el('span', { class: 'stars__val' }, shownV.toFixed(1)));
        if (isPan(shownV)) meta.appendChild(el('span', { class: 'stars__pan' }, '비추'));
      } else meta.appendChild(el('span', { class: 'stars__empty' }, editable ? '평가하기' : '미평가'));
      wrap.appendChild(meta);
    }
  };
  if (editable) wrap.addEventListener('mouseleave', () => { hover = null; draw(); });
  draw();
  return wrap;
}
```
> `onChange(v)` 호출 후 부모(T8 ratebox)가 `value`를 갱신해 `starRating`을 재마운트하거나, 클로저 `value`를 업데이트하고 `draw()`를 다시 부른다. 상세 ratebox는 재마운트 방식 사용.

- [ ] **Step 4: 통과 확인** Run: `pnpm vitest run src/ui/rating.test.js` → PASS.

- [ ] **Step 5: poster.js** — ui.jsx Poster/Chip/Dot 포팅.
```js
import { el } from './dom.js';
// 저채도 줄무늬 플레이스홀더 + 책등(spine). 실이미지는 meta.poster_url 있으면 교체(추후).
export function poster({ type = 'film', title = '', year = '', hue = 40, w = 96, ratio = 1.48, rounded = 10, label = true } = {}) {
  const h = Math.round(w * ratio);
  const bg = `oklch(0.86 0.045 ${hue})`, bg2 = `oklch(0.81 0.05 ${hue})`, ink = `oklch(0.34 0.06 ${hue})`;
  const stripe = `repeating-linear-gradient(135deg, ${bg} 0 11px, ${bg2} 11px 22px)`;
  const p = el('div', { class: 'poster' + (type === 'book' ? ' poster--book' : ''),
    style: `width:${w}px;height:${h}px;border-radius:${rounded}px;background:${stripe};color:${ink}` });
  if (type === 'book') p.appendChild(el('span', { class: 'poster__spine', style: `background:oklch(0.74 0.06 ${hue})` }));
  p.appendChild(el('span', { class: 'poster__kind' }, type === 'film' ? 'FILM' : 'BOOK'));
  if (label) p.appendChild(el('span', { class: 'poster__title' }, title));
  p.appendChild(el('span', { class: 'poster__year' }, String(year || '')));
  return p;
}
export function chip(text, { active = false, onClick } = {}) {
  const c = el(onClick ? 'button' : 'span', { class: 'chip' + (active ? ' chip--on' : '') }, text);
  if (onClick) c.addEventListener('click', onClick);
  return c;
}
export const dot = (size = 6) => el('span', { class: 'dot', style: `width:${size}px;height:${size}px` });
```
> `hue`는 작품마다 결정적이어야 함(실데이터엔 hue 없음) → `hueFromString(title)` 헬퍼로 제목 해시 % 360 사용. poster.js에 추가하고 호출부에서 `hue: hueFromString(r.title)` 전달.

- [ ] **Step 6: Commit**
```bash
cd ~/apps && git add taste/src/ui/rating.js taste/src/ui/rating.test.js taste/src/ui/poster.js && git commit -m "feat(taste): 공용 컴포넌트 — StarRating(0.5/비추 TDD) + Poster/Chip/Dot 이식"
```

---

## Task 7: 앱 셸 + 라우터 + 로그인 게이트

**Files:** `taste/src/app.js`, `taste/src/ui/login.js`, `taste/src/main.js`
**디자인 정본:** `design-ref/source/app/main.jsx` (App 셸 L82-228: 상단바·계정메뉴·view-state·⌘K).

- [ ] **Step 1: app.js — 셸 + view-state 라우터** — main.jsx의 `view={name,path[]}`·`ratings`·`searchOpen`·`menuOpen`을 모듈 상태로. 라우트 mapping: `#/`→home, `#/w/:id`→detail(현재 작품=`path` 끝), `#/import`→import, `#/library`→library. 검색은 오버레이(T10)로 `openSearch()` 노출. `navTo(id)`(새 경로), `branchTo(id)`(path push, 가지치기), `goHome()`, `setRating(id,v)`(Wave 1: Dexie 저장만; analyzing 연출은 Wave 2). 상단바(brand `taste`+코랄점, searchcue `⌘K`, avatar 계정메뉴 — main.jsx L160-189 그대로). ⌘K/`/`/Esc 단축키(main.jsx L109-120).
```js
import { el, clear } from './ui/dom.js';
import { ensureLoginCard, hideLoadingScreen } from './ui/login.js';
import * as Home from './features/home.js';
import * as Detail from './features/detail.js';
import * as ImportView from './features/import.js';
import * as Library from './features/library.js';
import { openSearch } from './features/search.js';

let _userId = null, _bound = false;
export function setRouterUser(id) { _userId = id || null; }

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [seg, id] = h.split('/');
  if (seg === 'w' && id) return { name: 'detail', id };
  if (seg === 'import') return { name: 'import' };
  if (seg === 'library') return { name: 'library' };
  return { name: 'home' };
}
function render() {
  if (document.body.dataset.authState !== 'in') return;
  const v = parseHash();
  const host = document.getElementById('app'); clear(host);
  host.appendChild(shell(v));
  window.scrollTo({ top: 0 });
}
function shell(v) {
  const root = el('div', { class: 'app dens-regular read-sans emph-regular' });
  root.appendChild(topbar());
  const stage = el('main', { class: 'stage' });
  if (v.name === 'home') stage.appendChild(Home.mount({ userId: _userId }));
  else if (v.name === 'detail') stage.appendChild(Detail.mount({ userId: _userId, id: v.id }));
  else if (v.name === 'import') stage.appendChild(ImportView.mount({ userId: _userId }));
  else if (v.name === 'library') stage.appendChild(Library.mount({ userId: _userId }));
  root.appendChild(stage);
  return root;
}
function topbar() {
  const bar = el('header', { class: 'topbar' });
  const inner = el('div', { class: 'topbar__inner' });
  const brand = el('button', { class: 'brand', 'aria-label': 'taste 홈' }, 'taste', el('span', { class: 'brand__dot' }));
  brand.addEventListener('click', () => { location.hash = '#/'; });
  const cue = el('button', { class: 'searchcue' },
    el('span', { class: 'searchcue__icon' }, '⌕'),
    el('span', { class: 'searchcue__label' }, '작품을 검색해 평가하기'),
    el('kbd', { class: 'searchcue__kbd' }, '⌘K'));
  cue.addEventListener('click', () => openSearch({ userId: _userId }));
  inner.append(brand, cue, accountMenu());
  bar.appendChild(inner);
  return bar;
}
// accountMenu(): avatar + 드롭다운(평가 가져오기→#/import, 내 서재→#/library, 로그아웃→Auth.signOut). 바깥클릭/Esc 닫기. main.jsx L170-188 참고.

export function showLogin() {
  document.body.dataset.authState = 'out'; ensureLoginCard();
  if (!location.hash) location.hash = '#/'; hideLoadingScreen();
}
export function showAuthenticated() {
  document.body.dataset.authState = 'in';
  if (!_bound) { window.addEventListener('hashchange', render); _bound = true; }
  bindShortcuts(); render(); hideLoadingScreen();
}
function bindShortcuts() {
  if (window.__tasteKeys) return; window.__tasteKeys = true;
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch({ userId: _userId }); }
    if (e.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); openSearch({ userId: _userId }); }
  });
}
```
> `accountMenu()`는 분량상 본문에서 생략 — `design-ref/source/app/main.jsx` L170-188(avatar+menu+바깥클릭/Esc)을 Read해 그대로 el-포팅. 메뉴 항목: "평가 가져오기"→`location.hash='#/import'`, "내 서재"→`#/library`, "로그아웃"→`Auth.signOut()`.

- [ ] **Step 2: login.js** — `today/src/app.js:166-268`(ensureLoginCard)을 taste용으로 축약: 브랜드 `taste`, Google 버튼→`Auth.signInWithGoogle()`, `hideLoadingScreen`은 `#loadingScreen`에 `.hidden`. 클래스 `#taste-login-card`/`.taste-login__*`.

- [ ] **Step 3: features 스텁** — `home.js`/`detail.js`/`import.js`/`library.js`에 `export function mount(){ return el('div',{},'…'); }`, `search.js`에 `export function openSearch(){}` 최소 스텁(T8~T11에서 채움).

- [ ] **Step 4: main.js — today 부트스트랩 미러** — `cp today/src/main.js taste/src/main.js` 후: 최상단 `import './styles/taste.css';`. today 도메인 feature import 제거. **보존 골격**: storage persist, `installAuthSessionGuard`, subscribe-first `Auth.onAuthStateChange`, `handleSession`(allowedEmail 게이트→`ensureUserDB`→`ensureProfile`→`setRouterUser`→`showAuthenticated`), 백그라운드 `Sync.startSync`. import: `./app.js`의 `showAuthenticated, showLogin, setRouterUser`. (today/src/main.js:51-210 참고.)

- [ ] **Step 5: dev + 로그인 검증 (preview MCP)** Run: `cd ~/apps/taste && pnpm dev`(5177). preview_start `http://localhost:5177` → 로그인 카드 렌더·콘솔 0. (OAuth는 선행조건 후; 미등록이면 카드까지.)

- [ ] **Step 6: Commit**
```bash
cd ~/apps && git add taste/src/app.js taste/src/ui/login.js taste/src/main.js taste/src/features && git commit -m "feat(taste): 앱 셸 + view-state 라우터 + 로그인 게이트 — 디자인 상단바"
```

---

## Task 8: 작품 상세 허브 (★ 최우선) — ratebox 별점 저장

**Files:** `taste/src/features/detail.js`
**디자인 정본:** `design-ref/source/app/detail.jsx` + 디자인 §6. CSS: `.detail__body`(grid 200px/660px), `.rail`, `.info`/`.inforow`, `.ratebox`, `.reading`, `.branches`, `.trail`.

- [ ] **Step 1: detail.js mount** — `mount({ userId, id })`가 2열 그리드를 그린다. 작품 데이터 소스: **내가 평가한 작품**은 Dexie(`getRating`/`listRatings`)에서, **검색으로 막 연 신규 작품**은 메모리 전달(T10이 임시 work 객체를 `window.__tasteOpen`에 넣고 navigate). Wave 1 작품 메타 = ratings.meta(poster_url/author/director/summary 등 가능한 만큼) + 알라딘 응답.
  - **브레드크럼 `.trail`**: 경로(path) 길이>1일 때 `제목 가지 → 제목` (현재 굵게, 이전 링크). 경로는 app.js가 관리(branchTo push).
  - **좌 `.rail`(sticky top:92, w200)**: `poster({...work, w:200})` + `.info` dl(영화: 감독/출연/극본, 책: 저자/옮김/출판 — 있는 키만) + **`.ratebox`**: 라벨 `내 평가` + `starRating({ value: cur?.rating||0, editable:true, size:28, onChange })` + 평가됨이면 `평가 지우기`(클릭→`softDeleteRating`).
  - **우 `.detail__main`**: `.detail__head`(kind `● 영화|책` + measure `138분`/`636쪽` + `.detail__title` + `.detail__sub` 원제·감독/저자·연도 + 태그 칩), `.reading`(라벨 `줄거리` + `.reading__body` summary, **앱 내 소비 — 외부 링크 없음**), `.branches`(헤더 `이 작품에서 이어지는 갈래` + 상태문구). **Wave 1: 갈래 데이터 없음 → 빈 상태** `.branches__status` = `아직 추천을 만들 만큼 평가가 쌓이지 않았어요.`(엔진은 Wave 2). 분석중 연출(스켈레톤/펄스)도 Wave 2.
  - **ratebox onChange(v)**: `const ex = await getRating(userId, work.media_type, work.title, work.year)` → 있으면 `updateRating(ex.id,{rating:v, rated_at:nowIso})`, 없으면 `createRating({owner_id:userId, media_type, title, year, external_id, rating:v, source:'app', meta:{...}})`. 저장 후 ratebox 영역 재마운트(값 반영).
```js
import { el, clear } from '../ui/dom.js';
import { poster, hueFromString } from '../ui/poster.js';
import { starRating } from '../ui/rating.js';
import { Queries } from '../db/queries.js';
// work 해석: window.__tasteOpen[id] (검색서 막 연 신규) ?? Dexie ratings 매칭. 구현 시 둘 다 처리.
export function mount({ userId, id }) {
  const root = el('div', { class: 'detail' });
  // ...trail / rail(poster+info+ratebox) / main(head+reading+branches 빈상태) 구성
  return root;
}
```
> 본 Step의 DOM 세부는 `detail.jsx`를 Read해 클래스 그대로 el-포팅. ratebox만이 Wave 1의 핵심 동작(저장).

- [ ] **Step 2: preview 검증** dev에서 검색→상세 진입(또는 임시 work 주입) → ratebox 별 클릭(4.5) → `tasteDB.ratings.count()` 1 확인(preview_eval) → 0.5 클릭 시 `비추` 빨강 칩 → 콘솔 0. preview_screenshot.

- [ ] **Step 3: Commit**
```bash
cd ~/apps && git add taste/src/features/detail.js taste/src/ui/poster.js && git commit -m "feat(taste): 작품 상세 허브 — 2열 그리드 + ratebox 별점 저장(0.5/비추) + 줄거리 + 갈래 빈상태"
```

---

## Task 9: 홈 피드 (추천 빈 상태 + 최근 평가)

**Files:** `taste/src/features/home.js`
**디자인 정본:** `design-ref/source/app/home.jsx` + 디자인 §5. CSS: `.home`/`.home__intro`/`.seg`/`.feat`/`.tracks`/`.track`/`.rec`/`.recent`.

- [ ] **Step 1: home.js mount** — `mount({ userId })`:
  - **인트로** `.home__intro`: 인사 `다음에 무엇을 볼까요` + 노트 `지금까지 평가한 N편을 취합해 골랐습니다.`(N=`listRatings(userId).length`, mono) + **세그먼트 필터** `전체/영화/책`(`.seg`, 상태 보관).
  - **Featured/트랙**: Wave 1 추천 데이터 없음 → **빈 상태 카드** `아직 추천이 없어요. 작품을 평가하면 다음에 볼·읽을 작품을 이유와 함께 골라드려요.` + (평가 0이면) "검색해 첫 평가 시작" 버튼(→`openSearch`). (디자인 Featured/`.tracks` 마크업은 Wave 2에서 데이터로 채움.)
  - **최근 평가** `.recent`: `listRatings(userId)` 최신 8개 → `.recent__item`(poster 60w + 제목 + `★ 4.5`/비추는 빨강 `비추 0.5`). 세그먼트 필터 반영. 클릭→상세.
- [ ] **Step 2: preview 검증** 평가 0 → 빈 상태+시작 버튼. 평가 1+ → 최근에 표시, 세그먼트 전환 거름. screenshot.
- [ ] **Step 3: Commit**
```bash
cd ~/apps && git add taste/src/features/home.js && git commit -m "feat(taste): 홈 피드 — 인트로+세그먼트+최근평가, 추천 빈 상태(엔진 전)"
```

---

## Task 10: 검색 오버레이 (1급) + 알라딘 책 합류

**Files:** `taste/src/features/search.js`, `taste/src/db/aladin.js`
**디자인 정본:** `design-ref/source/app/main.jsx` SearchOverlay(L10-73) + 디자인 §8. CSS: `.search-scrim`/`.search`/`.search__bar`/`.search__filter`/`.sresult`.

- [ ] **Step 1: aladin.js 복사 (무변경)** `cp book/src/db/aladin.js taste/src/db/aladin.js`. `searchBooks(q,{max})`, `toAppBook(n)`→`{id:isbn,t,a,p,y,c,coverUrl,...}`. dev=`/api/aladin`(T1 proxy), prod=Edge Function(공유).

- [ ] **Step 2: search.js openSearch** — `openSearch({ userId })`가 스크림+모달을 body에 append. 입력(디바운스 300ms) + 타입 세그(전체/영화/책) + `N건`. **결과 합류**:
  - 로컬: `listRatings(userId)` 중 질의 부분일치(제목+meta).
  - 알라딘 책(타입 전체/책): `Aladin.searchBooks(q,{max:10})` → `toAppBook` → sresult. (영화 라이브 검색은 Wave 2 TMDB — Wave 1은 로컬 영화만.)
  - 행 클릭: 신규 작품이면 임시 work 객체(`{id: 'isbn:'+isbn, media_type:'book', title, year, meta:{author, poster_url}}`)를 `window.__tasteOpen[id]=work`에 넣고 `location.hash = '#/w/'+encodeURIComponent(id)` → 상세(T8)에서 평가. 기존 평가작이면 그 id로 이동.
  - 닫기: Esc/스크림 클릭. `⌘K` 재진입(T7 wiring).
```js
import { el } from '../ui/dom.js';
import { poster } from '../ui/poster.js';
import { Aladin } from '../db/aladin.js';
import { Queries } from '../db/queries.js';
let _open = false;
export function openSearch({ userId } = {}) {
  if (_open) return; _open = true;
  // scrim+modal+input(debounce)+seg+results(local+aladin) ... main.jsx SearchOverlay el-포팅
}
```
> SearchOverlay DOM/포커스/키 핸들링은 `main.jsx` L10-73 Read해 포팅. 차이: `window.TASTE.list` 대신 로컬 ratings + 라이브 알라딘.

- [ ] **Step 3: preview 검증** ⌘K → 모달 → "데미안" 입력 → 알라딘 표지 결과 → 클릭 → 상세 진입 → ratebox 평가 → Dexie 저장. 콘솔 0. screenshot.

- [ ] **Step 4: Commit**
```bash
cd ~/apps && git add taste/src/features/search.js taste/src/db/aladin.js && git commit -m "feat(taste): 검색 오버레이(1급, ⌘K) + 알라딘 책 합류 → 상세 진입 평가"
```

---

## Task 11: 왓챠 CSV import (TDD 파서)

**Files:** `taste/src/lib/watcha.js`, `watcha.test.js`, `taste/src/features/import.js`

- [ ] **Step 1: ⚠ 실제 CSV 헤더 확인 (지오)** — [erinyskim/watchapedia-export](https://github.com/erinyskim/watchapedia-export)로 실제 CSV 1개 추출해 헤더·샘플 제공. **파서 컬럼명은 실제 export 확인 후 확정**(추정 금지). 아래 테스트 컬럼명은 확인 후 조정.

- [ ] **Step 2: 실패 테스트** `taste/src/lib/watcha.test.js`
```js
import { describe, it, expect } from 'vitest';
import { parseWatchaCsv } from './watcha.js';
const SAMPLE = `content_id,title,original_title,type,year,director,watched_at,rating,review
1,데미안,Demian,MOVIE,2020,Foo,2024-01-02,4.5,좋음
2,어떤드라마,X,TV,2021,Bar,2024-02-02,5.0,
3,비추영화,Z,MOVIE,2019,Baz,2024-03-02,0.5,별로`;
describe('parseWatchaCsv', () => {
  it('MOVIE만, TV 제외', () => { const r = parseWatchaCsv(SAMPLE); expect(r).toHaveLength(2); expect(r.every((x) => x.media_type === 'movie')).toBe(true); });
  it('제목·연도·평점 + source=watcha', () => { expect(parseWatchaCsv(SAMPLE)[0]).toMatchObject({ title: '데미안', year: 2020, rating: 4.5, source: 'watcha' }); });
  it('최저 0.5 보존(비추)', () => { expect(parseWatchaCsv(SAMPLE)[1].rating).toBe(0.5); });
});
```

- [ ] **Step 3: 실패 확인** Run: `pnpm vitest run src/lib/watcha.test.js` → FAIL.

- [ ] **Step 4: watcha.js** (헤더 인덱스 기반, 따옴표 필드 처리)
```js
function splitCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
  out.push(cur); return out;
}
export function parseWatchaCsv(text) {
  const lines = text.trim().split(/\r?\n/); if (lines.length < 2) return [];
  const head = splitCsvLine(lines[0]).map((h) => h.trim());
  const idx = (n) => head.indexOf(n);
  const iT = idx('title'), iTy = idx('type'), iY = idx('year'), iR = idx('rating'), iW = idx('watched_at');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]); if (c.length < head.length) continue;
    if (String(c[iTy]).toUpperCase() !== 'MOVIE') continue;
    const rating = parseFloat(c[iR]); if (!(rating >= 0.5 && rating <= 5)) continue;
    rows.push({ media_type: 'movie', title: c[iT].trim(), year: c[iY] ? parseInt(c[iY], 10) : null, rating, source: 'watcha', rated_at: c[iW] || null });
  }
  return rows;
}
```

- [ ] **Step 5: 통과 확인** Run: `pnpm vitest run src/lib/watcha.test.js` → PASS (3).

- [ ] **Step 6: import.js mount** — `<input type=file accept=.csv>` → FileReader → `parseWatchaCsv` → 미리보기(건수·샘플 5행) → "저장" → 각 행 `getRating` 후 create/update(이미 있으면 평점 갱신) `meta:{}`. 진행률. 디자인 토큰(`.stage` 내 단순 카드)로 최소 스타일.

- [ ] **Step 7: preview 검증** 샘플 CSV 업로드 → 미리보기 건수 → 저장 → `tasteDB.ratings.where('source').equals('watcha').count()` 확인.

- [ ] **Step 8: Commit**
```bash
cd ~/apps && git add taste/src/lib taste/src/features/import.js && git commit -m "feat(taste): 왓챠 CSV import — 파서(MOVIE만, 0.5★ 보존) TDD 3/3 + 업로드 화면"
```

---

## Task 12: 내 서재 — 전체 평점 목록 (#/library)

**Files:** `taste/src/features/library.js`

- [ ] **Step 1: library.js mount** — 계정 메뉴 "내 서재" 진입. `listRatings(userId)` 전체를 **영화/책 세그먼트**로 구분, 각 행 = poster + 제목 + `starRating({value, editable:false})` 값 표시(비추 빨강). 행 클릭→상세(편집·삭제는 상세 ratebox에서). 다량 CSV 영화 브라우즈용. (디자인에 전용 화면은 없으나 계정 메뉴 항목 존재 → 트랙 레이아웃 재사용.)
- [ ] **Step 2: preview 검증** import+평가 후 목록에 영화·책 표시, 행 클릭→상세→평점 수정→목록 반영.
- [ ] **Step 3: Commit**
```bash
cd ~/apps && git add taste/src/features/library.js && git commit -m "feat(taste): 내 서재 — 전체 평점 목록(영화/책) + 상세 연결"
```

---

## Wave 1 완료 기준 (working app, 디자인 충실)

1. 로그인(선행조건 redirect URI 등록 후) → 디자인 상단바 + 홈(추천 빈 상태 + 시작 유도).
2. `⌘K` 검색 → 알라딘 책 검색 → 클릭 → **작품 상세 허브** → ratebox 별점(0.5단위, 0.5★=비추) 저장.
3. `#/import` 왓챠 CSV 업로드 → 영화 별점 저장.
4. 홈 최근 평가 + `#/library` 내 서재에 평점 표시, 상세에서 수정·삭제.
5. Supabase 개인 격리 동기화(본인 row만).
6. `pnpm vitest run` 전체 통과(queries 4 + rating 로직 + watcha 3), `pnpm build` 성공.
7. 디자인 픽셀 충실도: 토큰·상단바·별점(clip-path/비추)·상세 2열 그리드·포스터(책등) 시안과 일치(preview_screenshot 대조).

**Wave 2 → `taste/specs/taste-wave2-plan.md`**: TMDB 발급 → 마이그 0002(recommendations에 kind/source_work/basis) → `taste-weekly-reco` 루틴(별점 읽기→Claude 추천(홈+갈래)→TMDB/알라딘 실재 검증→교체) → 홈 Featured/트랙 + 상세 갈래 채움 → §7 분석중→도착 연출(실 비동기) → 검색 TMDB 영화 합류 → `deploy-pages.yml` taste step.
