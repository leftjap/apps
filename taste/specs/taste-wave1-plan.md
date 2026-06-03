# Taste Wave 1 구현 플랜 — 스캐폴딩 + 인증 + DB + 별점 입력

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지오가 로그인해 왓챠 CSV로 영화 별점을 가져오고 알라딘 검색으로 책에 0.5단위 별점을 매겨, Supabase에 개인 격리로 저장하는 working PWA.

**Architecture:** `today`의 빌드·인증·Dexie·sync 인프라를 미러하되 partner/공유 로직을 전부 제거(`owner_id = auth.uid()` 개인 격리). UI 토대(`dom.js`/`icons.js`/`cover.js`/`aladin.js`)는 `book`에서 재사용. 별점 위젯은 신규(0.5~5.0 + 앵커 라벨). 라우팅은 mocks 없이 features 직접 mount(book 스타일).

**Tech Stack:** 바닐라 JS(ES Modules), Vite 6 + vite-plugin-pwa, @supabase/supabase-js, Dexie, Vitest, Playwright. 참조 spec: `taste/specs/taste-app-spec.md`.

---

## 선행조건 (지오 액션 — Task 6 인증 검증 전까지 필요)

- [ ] geo-apps Google OAuth 클라이언트 redirect URI에 `http://localhost:5177` 추가 (Google Cloud Console). 없으면 로그인 시 `redirect_uri_mismatch`.
- [ ] (Wave 2용, 지금 안 해도 됨) TMDB API key 발급.

알라딘 키(`ALADIN_TTB_KEY=ttbleftjap1352001`)·Supabase Edge Function `aladin`은 book이 이미 쓰는 것을 공유 → 신규 발급 불필요.

---

## File Structure (생성/수정 파일 맵)

```
taste/
  package.json              T1  name=taste, today deps 미러
  vite.config.js            T1  base /apps/taste/, port 5177/4177, PWA, /api/aladin proxy
  playwright.config.js      T1  port 4177
  index.html                T1  #loadingScreen + #app, title Taste
  .env.local                T1  VITE_SUPABASE_*, ALADIN_TTB_KEY (gitignore)
  .gitignore                T1
  public/manifest.webmanifest, icons/  T1
  src/
    ui/dom.js               T2  book 복사 (순수)
    ui/icons.js             T2  book 복사 (star/star-fill 포함)
    ui/cover.js             T2  book 복사 (el 의존만)
    ui/components.js        T2  book에서 btn/modal/bookRow 발췌
    ui/rating.js            T7  ★신규★ 0.5단위 별 + 앵커 라벨
    ui/rating.test.js       T7  ★신규★ ratingLabel TDD
    services/supabase.js          T3  today 복사 (무변경)
    services/auth-storage.js      T3  today 복사 (무변경)
    services/auth-session-guard.js T3 today 복사 (무변경)
    services/auth.js              T3  today 미러 + prefix 치환
    services/profile.js           T3  최소형 (partner 제거)
    db/schema.js            T4  ★신규★ Dexie: ratings, recommendations
    db/queries.js           T4  ★신규★ rating CRUD (today 골격)
    db/queries.test.js      T4  ★신규★ TDD
    db/aladin.js            T8  book 복사 (무변경)
    db/sync.js              T5  ★신규★ TABLE_MAP 2개, filterColumn owner_id
    features/ratings.js     T8,T10 책 별점 + 영화 목록 (#/ratings)
    features/import.js      T9  왓챠 CSV import (#/import)
    lib/watcha.js           T9  ★신규★ CSV 파서
    lib/watcha.test.js      T9  ★신규★ TDD
    app.js                  T6  ★신규★ hash 라우터 (features mount)
    main.js                 T6  today 부트스트랩 미러
  supabase/migrations/0001_taste_init.sql  T3.5 ★신규★
```

---

## Task 1: 프로젝트 스캐폴딩

**Files:** `taste/package.json`, `vite.config.js`, `playwright.config.js`, `index.html`, `.env.local`, `.gitignore`, `public/manifest.webmanifest`

- [ ] **Step 1: today 설정 파일 복사 후 치환**

```bash
cd ~/apps
cp today/package.json today/vite.config.js today/playwright.config.js today/index.html taste/
cp -r today/public taste/public   # manifest, icons, cat-loading.jpg
```

- [ ] **Step 2: package.json 치환**

`taste/package.json` L2 `"name": "today"` → `"name": "taste"`. (deps/devDeps/scripts/`pnpm.onlyBuiltDependencies:["esbuild"]` 그대로.)

- [ ] **Step 3: vite.config.js 치환 + 알라딘 proxy 추가**

`taste/vite.config.js`:
- base: `'/apps/today/'` → `'/apps/taste/'`
- `server.port` 5175 → `5177`, `preview.port` 4175 → `4177`, 포트 주석의 5175 → 5177
- `server` 블록에 알라딘 proxy 추가 (book/vite.config.js:34-43 패턴):

```js
server: {
  port: 5177,
  strictPort: true,
  host: '0.0.0.0',
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

상단에 `loadEnv`로 ALADIN_TTB_KEY 로드 (book/vite.config.js:10-12 미러): `const env = loadEnv(mode, process.cwd(), ''); process.env.ALADIN_TTB_KEY = env.ALADIN_TTB_KEY;`. **구현 시 book/vite.config.js의 정확한 proxy 블록을 Read해 그대로 옮길 것** (위는 형태 참고).

- [ ] **Step 4: index.html / playwright.config.js / manifest 치환**

- `index.html`: L13 title `"Today"`→`"Taste"`, L19 `<title>Taste</title>`. `#loadingScreen`+`#app` 구조·인라인 CSS 그대로.
- `playwright.config.js`: `baseURL`+`webServer.url` `4175`→`4177`.
- `public/manifest.webmanifest`: name/short_name `"Today"`→`"Taste"`.

- [ ] **Step 5: .env.local + .gitignore**

`taste/.gitignore` (today 복사). `taste/.env.local` (gitignore됨) 작성 — 값은 book/today/.env.local에서 확인:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
ALADIN_TTB_KEY=ttbleftjap1352001
```

- [ ] **Step 6: 설치 + 빌드 확인**

Run: `cd ~/apps/taste && pnpm install && pnpm build`
Expected: `dist/` 생성, 에러 없음.

- [ ] **Step 7: Commit**

```bash
cd ~/apps && git add taste/package.json taste/vite.config.js taste/playwright.config.js taste/index.html taste/.gitignore taste/public && git commit -m "feat(taste): 프로젝트 스캐폴딩 — today 인프라 미러 + 알라딘 proxy"
```

---

## Task 2: UI 토대 복사 (book)

**Files:** `taste/src/ui/dom.js`, `icons.js`, `cover.js`, `components.js`

- [ ] **Step 1: 순수 UI 파일 복사**

```bash
cd ~/apps && mkdir -p taste/src/ui
cp book/src/ui/dom.js book/src/ui/icons.js book/src/ui/cover.js taste/src/ui/
```
`dom.js`(el/setStyle/clear/frag/escapeHtml), `icons.js`(star/star-fill 포함), `cover.js`(el만 의존, coverUrl 있으면 img 렌더)는 book 도메인 의존 0 → 무변경.

- [ ] **Step 2: components.js에서 순수 컴포넌트만 발췌**

`book/src/ui/components.js`를 Read하고, book 도메인 import(`Queries/BOOKS/Profile/CURATION`)에 의존하지 **않는** `btn`(L25)·`modal`(L475)만 추려 `taste/src/ui/components.js` 신규 작성 (import은 `./dom.js`, `./icons.js`만). `bookRow`는 BOOKS 의존이므로 발췌하지 말 것 — taste는 cover.js를 직접 써서 행을 구성.

- [ ] **Step 3: 빌드 확인 + Commit**

Run: `cd ~/apps/taste && pnpm build` → Expected: 에러 없음.
```bash
cd ~/apps && git add taste/src/ui && git commit -m "feat(taste): book UI 토대 재사용 — dom/icons/cover + btn/modal 발췌"
```

---

## Task 3: 인증 서비스 미러 (today, partner 제거)

**Files:** `taste/src/services/{supabase,auth-storage,auth-session-guard,auth,profile}.js`

- [ ] **Step 1: 무변경 복사 3종**

```bash
cd ~/apps && mkdir -p taste/src/services
cp today/src/services/supabase.js today/src/services/auth-storage.js today/src/services/auth-session-guard.js taste/src/services/
```
`supabase.js`(storage key는 Supabase 호스트 기반이라 앱 무관), `auth-storage.js`, `auth-session-guard.js`는 범용 → 무변경.

- [ ] **Step 2: auth.js 미러 + 치환**

`cp today/src/services/auth.js taste/src/services/auth.js` 후 치환:
- import `createTodayDB` → `createTasteDB` (`from '../db/schema.js'`)
- DB명 `'today_' + hash` → `'taste_' + hash`
- `AUTH_ERROR_KEY = 'todayAuthError'` → `'tasteAuthError'`
- `window.todayDB`/`window.todayAuth` → `window.tasteDB`/`window.tasteAuth`
- `ALLOWED_EMAILS` (leftjap, soyoun312) 그대로.

- [ ] **Step 3: profile.js 최소형 신규 (partner 전부 제거)**

`taste/src/services/profile.js` 신규 — partner 로직 없이 ensureProfile만:

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

- [ ] **Step 1: 마이그 작성**

`today_expenses` 개인 격리 RLS(`for all using/with check (owner_id = auth.uid())`)를 정본으로:

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
  link text,
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

- [ ] **Step 2: 지오에게 적용 요청 (DB 마이그는 destructive 사전확인 대상)**

지오가 Supabase 대시보드 SQL 에디터에서 실행하거나 `source ~/.config/study/.env` 후 psql 적용. **Claude 자동 적용 금지** (CLAUDE.md: DB 마이그 사전확인). 적용 후 테이블 3·정책 3·realtime 1 확인.

- [ ] **Step 3: Commit**

```bash
cd ~/apps && git add taste/supabase/migrations/0001_taste_init.sql && git commit -m "feat(taste): Supabase 마이그 0001 — ratings/recommendations 개인 격리 RLS"
```

---

## Task 4: Dexie schema + rating 쿼리 (TDD)

**Files:** `taste/src/db/schema.js`, `queries.js`, `queries.test.js`

- [ ] **Step 1: 실패 테스트 작성** `taste/src/db/queries.test.js`

```js
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createTasteDB } from './schema.js';
import { createRating, updateRating, softDeleteRating, listRatings } from './queries.js';

describe('rating queries', () => {
  beforeEach(() => { globalThis.tasteDB = createTasteDB('taste_test_' + Math.random()); });

  it('createRating: owner_id 필수, id/ts 자동, pending_sync=1', async () => {
    const r = await createRating({ owner_id: 'u1', media_type: 'book', title: '데미안', year: 1919, rating: 4.5, source: 'app' });
    expect(r.id).toBeTruthy();
    expect(r.created_at).toBeTruthy();
    expect(r.pending_sync).toBe(1);
    const all = await listRatings('u1');
    expect(all).toHaveLength(1);
  });

  it('createRating: owner_id 누락 시 throw', async () => {
    await expect(createRating({ media_type: 'book', title: 'x', rating: 3, source: 'app' })).rejects.toThrow();
  });

  it('updateRating: rating 변경 + updated_at 갱신', async () => {
    const r = await createRating({ owner_id: 'u1', media_type: 'book', title: 'a', rating: 3, source: 'app' });
    const u = await updateRating(r.id, { rating: 5 });
    expect(u.rating).toBe(5);
  });

  it('softDeleteRating: deleted_at 설정 + listRatings 제외', async () => {
    const r = await createRating({ owner_id: 'u1', media_type: 'book', title: 'a', rating: 3, source: 'app' });
    await softDeleteRating(r.id);
    expect(await listRatings('u1')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 실패 확인** Run: `cd ~/apps/taste && pnpm vitest run src/db/queries.test.js` → Expected: FAIL (schema.js/queries.js 없음). ⚠ `pnpm vitest run` (watch 금지 — CLAUDE.md).

- [ ] **Step 3: schema.js 작성** `taste/src/db/schema.js`

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

- [ ] **Step 4: queries.js 작성** (today queries.js:170-283 골격 미러)

```js
const db = () => { const d = globalThis.tasteDB; if (!d) throw new Error('[tasteQueries] tasteDB 미초기화'); return d; };
const newId = () => (globalThis.crypto?.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));
const nowIso = () => new Date().toISOString();
const enqueue = (id) => { try { globalThis.tasteSync?.queueUpload?.('ratings', id); } catch (e) {} };

export async function createRating(input) {
  if (!input?.owner_id) throw new Error('[tasteQueries] owner_id 누락');
  const row = {
    id: newId(), owner_id: input.owner_id, media_type: input.media_type,
    title: input.title, year: input.year ?? null, external_id: input.external_id ?? null,
    rating: input.rating, source: input.source, rated_at: input.rated_at ?? null,
    meta: input.meta ?? {}, created_at: nowIso(), updated_at: nowIso(), deleted_at: null,
    pending_sync: 1,
  };
  await db().ratings.add(row); enqueue(row.id); return row;
}
export async function updateRating(id, patch) {
  const cur = await db().ratings.get(id); if (!cur) return null;
  const next = { ...cur, ...patch, updated_at: nowIso(), pending_sync: 1 };
  await db().ratings.put(next); enqueue(id); return next;
}
export async function softDeleteRating(id) { return updateRating(id, { deleted_at: nowIso() }); }
export async function listRatings(owner_id, mediaType) {
  let coll = db().ratings.where('owner_id').equals(owner_id);
  const rows = await coll.toArray();
  return rows.filter((r) => !r.deleted_at && (!mediaType || r.media_type === mediaType))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}
export async function listPendingRatings() { return db().ratings.where('pending_sync').equals(1).toArray(); }
export async function setPendingSync(id, v) { const c = await db().ratings.get(id); if (c) await db().ratings.put({ ...c, pending_sync: v }); }
export const Queries = { createRating, updateRating, softDeleteRating, listRatings, listPendingRatings, setPendingSync };
if (typeof window !== 'undefined') window.tasteQueries = Queries;
```

- [ ] **Step 5: 통과 확인** Run: `pnpm vitest run src/db/queries.test.js` → Expected: PASS (4 tests).

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
export function queueUpload(store, id) {
  clearTimeout(_timers[id]);
  _timers[id] = setTimeout(() => pushRating(id), 800);
}
async function pushRating(id) {
  if (!supabase) return;
  const db = globalThis.tasteDB; const row = await db.ratings.get(id); if (!row) return;
  if (!isUuid(id)) { await setPendingSync(id, 0); return; }
  const { error } = await supabase.from('taste_ratings').upsert(stripMeta(row), { onConflict: 'id' });
  await setPendingSync(id, error ? 1 : 0);
}
export async function flushPending() { const p = await listPendingRatings(); for (const r of p) await pushRating(r.id); }

export async function startSync(user) {
  const db = globalThis.tasteDB; if (!db || !user) return;
  await pullAll(db, user.id); await flushPending();
}
export const Sync = { TABLE_MAP, pullAll, queueUpload, flushPending, startSync };
if (typeof window !== 'undefined') window.tasteSync = Sync;
```

- [ ] **Step 2: 빌드 확인** Run: `pnpm build` → Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
cd ~/apps && git add taste/src/db/sync.js && git commit -m "feat(taste): sync — pending_sync 큐 + owner_id 격리 reconcile"
```

---

## Task 6: 부트스트랩 + 라우터 셸 (로그인되는 앱)

**Files:** `taste/src/main.js`, `taste/src/app.js`

- [ ] **Step 1: app.js 신규 — hash 라우터 (mocks 없이 features mount)**

```js
import { ensureLoginCard, hideLoadingScreen } from './ui/login.js';   // Step 2에서 함께 작성
import * as Ratings from './features/ratings.js';
import * as ImportView from './features/import.js';

const ROUTES = { ratings: Ratings, import: ImportView };
const DEFAULT = 'ratings';
let _userId = null, _bound = false;

export function setRouterUser(id) { _userId = id || null; }

export function showLogin() {
  document.body.dataset.authState = 'out';
  ensureLoginCard();
  if (!location.hash) location.hash = '#/login';
  hideLoadingScreen();
}
export function showAuthenticated(user) {
  document.body.dataset.authState = 'in';
  if (!_bound) { window.addEventListener('hashchange', render); _bound = true; }
  const key = (location.hash.replace(/^#\//, '').split('/')[0]) || DEFAULT;
  if (!ROUTES[key]) location.hash = '#/' + DEFAULT; else render();
  hideLoadingScreen();
}
function render() {
  if (document.body.dataset.authState !== 'in') return;
  const key = (location.hash.replace(/^#\//, '').split('/')[0]) || DEFAULT;
  const view = ROUTES[key] || ROUTES[DEFAULT];
  const host = document.getElementById('app');
  host.innerHTML = '';
  host.appendChild(view.mount({ userId: _userId }));
}
```

- [ ] **Step 2: login.js 신규** (today app.js ensureLoginCard 패턴 축약 — 브랜드 `Taste`, Google 버튼 → `Auth.signInWithGoogle()`, `hideLoadingScreen`은 `#loadingScreen`에 `.hidden` 추가). today/src/app.js:166-268을 Read해 taste용으로 축약 작성 (`#taste-login-card`, `.taste-login__*`).

- [ ] **Step 3: features 스텁** — `features/ratings.js`·`features/import.js`에 `export function mount({ userId }) { const el = document.createElement('div'); el.textContent = '...'; return el; }` 최소 스텁 (T8~T10에서 채움).

- [ ] **Step 4: main.js — today 부트스트랩 미러**

`cp today/src/main.js taste/src/main.js` 후, today 도메인 feature import(Entries/Expenses/…)를 제거하고 taste용으로 축약. **보존할 골격**: storage persist 요청, `installAuthSessionGuard`, **subscribe-first** `Auth.onAuthStateChange`, `handleSession`(allowedEmail 게이트 → `ensureUserDB` → `ensureProfile` → `setRouterUser` → `showAuthenticated`), 백그라운드 `Sync.startSync`. import: `./app.js`의 `showAuthenticated, showLogin, setRouterUser`. today/src/main.js:51-210을 Read해 feature mount 블록만 taste(없음/스텁)로 교체.

- [ ] **Step 5: dev 서버 + 로그인 검증 (preview MCP)**

Run: `cd ~/apps/taste && pnpm dev` (포트 5177). preview_start로 `http://localhost:5177` 열고 로그인 카드 렌더·콘솔 에러 0 확인. (실제 Google OAuth는 선행조건 redirect URI 등록 후 — 미등록이면 로그인 카드까지만 검증.)

- [ ] **Step 6: Commit**

```bash
cd ~/apps && git add taste/src/main.js taste/src/app.js taste/src/ui/login.js taste/src/features && git commit -m "feat(taste): 부트스트랩 + hash 라우터 셸 — 로그인 화면까지"
```

---

## Task 7: 별점 위젯 (신규, TDD)

**Files:** `taste/src/ui/rating.js`, `rating.test.js`

- [ ] **Step 1: 실패 테스트** `taste/src/ui/rating.test.js`

```js
import { describe, it, expect } from 'vitest';
import { ratingLabel } from './rating.js';

describe('ratingLabel (spec D2 앵커)', () => {
  it('0.5 = 비추', () => expect(ratingLabel(0.5)).toBe('비추'));
  it('1.0~2.0 = 별로', () => { for (const v of [1.0, 1.5, 2.0]) expect(ratingLabel(v)).toBe('별로'); });
  it('2.5~3.0 = 보통', () => { for (const v of [2.5, 3.0]) expect(ratingLabel(v)).toBe('보통'); });
  it('3.5~4.0 = 추천', () => { for (const v of [3.5, 4.0]) expect(ratingLabel(v)).toBe('추천'); });
  it('4.5~5.0 = 최애', () => { for (const v of [4.5, 5.0]) expect(ratingLabel(v)).toBe('최애'); });
  it('null = 빈 문자열', () => expect(ratingLabel(null)).toBe(''));
});
```

- [ ] **Step 2: 실패 확인** Run: `pnpm vitest run src/ui/rating.test.js` → Expected: FAIL.

- [ ] **Step 3: rating.js 작성**

```js
import { el } from './dom.js';
import { iconEl } from './icons.js';

// spec D2 앵커 라벨. 최저(0.5)=비추.
export function ratingLabel(v) {
  if (v == null) return '';
  if (v <= 0.5) return '비추';
  if (v <= 2.0) return '별로';
  if (v <= 3.0) return '보통';
  if (v <= 4.0) return '추천';
  return '최애';
}

// 5개 별, 각 별 좌/우 절반 클릭 = 0.5 단위. star(윤곽) 위에 star-fill을 CSS width로 채움.
export function starRating(value, onChange) {
  const wrap = el('div', { class: 'rating' });
  const draw = (val) => {
    wrap.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const cls = val >= i ? ' is-full' : val >= i - 0.5 ? ' is-half' : '';
      const star = el('span', { class: 'rating__star' + cls },
        iconEl('star', { sz: 28 }),
        el('span', { class: 'rating__fill' }, iconEl('star-fill', { sz: 28 })));
      star.addEventListener('click', (e) => {
        const r = star.getBoundingClientRect();
        const v = (e.clientX - r.left) < r.width / 2 ? i - 0.5 : i;
        draw(v); onChange?.(v);
      });
      wrap.appendChild(star);
    }
    const lbl = el('span', { class: 'rating__label' }, ratingLabel(val));
    if (val) wrap.appendChild(lbl);
  };
  draw(value || 0);
  return wrap;
}
```

CSS는 `taste/src/styles/taste.css`에 작성하고 `taste/src/main.js` 최상단에 `import './styles/taste.css';` 한 줄을 추가해 번들에 포함:
```css
.rating__star { position: relative; display: inline-block; cursor: pointer; color: #d8d4c8; }
.rating__fill { position: absolute; left: 0; top: 0; overflow: hidden; width: 0; color: #e8b800; }
.is-half .rating__fill { width: 50%; } .is-full .rating__fill { width: 100%; }
.rating__label { margin-left: 8px; font-size: 13px; color: #6b6757; }
```

- [ ] **Step 4: 통과 확인** Run: `pnpm vitest run src/ui/rating.test.js` → Expected: PASS (6).

- [ ] **Step 5: preview 시각 검증** dev 서버에서 별점 위젯을 임시 마운트해 0.5/1.0/…/5.0 클릭 시 반쪽/온전 별 + 라벨(비추/별로/…/최애) 표시 확인 (preview_screenshot).

- [ ] **Step 6: Commit**

```bash
cd ~/apps && git add taste/src/ui/rating.js taste/src/ui/rating.test.js taste/src/styles && git commit -m "feat(taste): 별점 위젯 — 0.5단위 + 앵커 라벨(0.5★=비추) TDD 6/6"
```

---

## Task 8: 알라딘 복사 + 책 별점 화면 (#/ratings 책 탭)

**Files:** `taste/src/db/aladin.js`, `taste/src/features/ratings.js`

- [ ] **Step 1: aladin.js 복사 (무변경)**

```bash
cd ~/apps && cp book/src/db/aladin.js taste/src/db/aladin.js
```
`searchBooks(q,{max})`, `toAppBook(n)`→`{id:isbn, t,a,p,y,c,coverUrl,w,h}`. dev=`/api/aladin`(T1 proxy), prod=Edge Function(공유). 무변경.

- [ ] **Step 2: ratings.js — 책 탭 (검색→별점→저장)**

`features/ratings.js`의 `mount`를 영화/책 탭 셸로 작성. 책 탭: 알라딘 검색 입력(디바운스 350ms, book/features/add-edit.js:79-103 패턴) → 결과 행(`cover(toAppBook(n),{scale:0.4})` + 제목/저자) → 행 클릭 시 `starRating` 모달 → `onChange`에서 `Queries.createRating({ owner_id:userId, media_type:'book', title:n.title, year:n.year, external_id:n.isbn, rating:v, source:'app', meta:{ author:n.author, poster_url:n.coverUrl } })`. 이미 평점 있으면 `updateRating`.

```js
import { el, clear } from '../ui/dom.js';
import { cover } from '../ui/cover.js';
import { starRating } from '../ui/rating.js';
import { Aladin } from '../db/aladin.js';
import { Queries } from '../db/queries.js';

export function mount({ userId }) {
  const root = el('div', { class: 'page' });
  let tab = 'book';
  const tabs = el('div', { class: 'tabs' },
    el('button', { onClick: () => switchTab('movie') }, '영화'),
    el('button', { onClick: () => switchTab('book') }, '책'));
  const body = el('div');
  root.append(tabs, body);
  function switchTab(t) { tab = t; renderTab(); }
  async function renderTab() {
    clear(body);
    if (tab === 'book') body.appendChild(bookSearch(userId));
    else body.appendChild(await movieList(userId));   // T10에서 채움
  }
  renderTab();
  return root;
}

function bookSearch(userId) {
  const box = el('div');
  const input = el('input', { class: 'search', placeholder: '책 제목 검색 (알라딘)' });
  const results = el('div', { class: 'results' });
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim(); if (!q) return clear(results);
      const list = await Aladin.searchBooks(q, { max: 10 });
      clear(results);
      for (const n of list) {
        const ab = Aladin.toAppBook(n);
        const row = el('div', { class: 'result-row' }, cover(ab, { scale: 0.35 }),
          el('div', {}, el('div', { class: 'rt' }, n.title), el('div', { class: 'ra' }, n.author || '')));
        row.addEventListener('click', () => openRating(box, userId, n, ab));
        results.appendChild(row);
      }
    }, 350);
  });
  box.append(input, results);
  return box;
}
function openRating(box, userId, n, ab) {
  const panel = el('div', { class: 'rate-panel' }, cover(ab, { scale: 0.5 }), el('div', { class: 'rt' }, n.title));
  panel.appendChild(starRating(0, async (v) => {
    await Queries.createRating({ owner_id: userId, media_type: 'book', title: n.title, year: n.year,
      external_id: n.isbn, rating: v, source: 'app', meta: { author: n.author, poster_url: n.coverUrl } });
    panel.appendChild(el('div', { class: 'saved' }, '저장됨 ✓'));
  }));
  box.appendChild(panel);
}
```

- [ ] **Step 3: preview 검증** dev에서 책 탭 → "데미안" 검색 → 결과 표지 렌더 → 별점 클릭 → Dexie 저장(preview_eval로 `tasteDB.ratings.count()` 확인) → 콘솔 0.

- [ ] **Step 4: Commit**

```bash
cd ~/apps && git add taste/src/db/aladin.js taste/src/features/ratings.js && git commit -m "feat(taste): 책 별점 — 알라딘 검색 재사용 + 별점 저장"
```

---

## Task 9: 왓챠 CSV 파서 + import 화면 (TDD)

**Files:** `taste/src/lib/watcha.js`, `watcha.test.js`, `taste/src/features/import.js`

- [ ] **Step 1: ⚠ 실제 CSV 헤더 확인 (지오)**

[erinyskim/watchapedia-export](https://github.com/erinyskim/watchapedia-export)로 지오가 실제 CSV를 1개 추출해 헤더·샘플 행을 제공. **파서는 추정이 아니라 실제 헤더로 확정** (CLAUDE.md: 검증 안 한 건 단정 금지). 아래 테스트의 컬럼명은 실제 export 확인 후 조정.

- [ ] **Step 2: 실패 테스트** `taste/src/lib/watcha.test.js` (실제 헤더 반영)

```js
import { describe, it, expect } from 'vitest';
import { parseWatchaCsv } from './watcha.js';

const SAMPLE = `content_id,title,original_title,type,year,director,watched_at,rating,review
1,데미안,Demian,MOVIE,2020,Foo,2024-01-02,4.5,좋음
2,어떤드라마,X,TV,2021,Bar,2024-02-02,5.0,
3,비추영화,Z,MOVIE,2019,Baz,2024-03-02,0.5,별로`;

describe('parseWatchaCsv', () => {
  it('MOVIE만 추출, TV 제외', () => {
    const rows = parseWatchaCsv(SAMPLE);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.media_type === 'movie')).toBe(true);
  });
  it('제목·연도·평점 매핑 + source=watcha', () => {
    const r = parseWatchaCsv(SAMPLE)[0];
    expect(r).toMatchObject({ title: '데미안', year: 2020, rating: 4.5, source: 'watcha' });
  });
  it('최저점 0.5 보존 (비추)', () => {
    expect(parseWatchaCsv(SAMPLE)[1].rating).toBe(0.5);
  });
});
```

- [ ] **Step 3: 실패 확인** Run: `pnpm vitest run src/lib/watcha.test.js` → FAIL.

- [ ] **Step 4: watcha.js 작성** (헤더 인덱스 기반 CSV 파서 — 간단 split, 따옴표 필드 처리 포함)

```js
function splitCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}
export function parseWatchaCsv(text) {
  const lines = text.trim().split(/\r?\n/); if (lines.length < 2) return [];
  const head = splitCsvLine(lines[0]).map((h) => h.trim());
  const idx = (name) => head.indexOf(name);
  const iTitle = idx('title'), iType = idx('type'), iYear = idx('year'), iRating = idx('rating'), iWatched = idx('watched_at');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]); if (c.length < head.length) continue;
    if (String(c[iType]).toUpperCase() !== 'MOVIE') continue;   // TV 제외
    const rating = parseFloat(c[iRating]); if (!(rating >= 0.5 && rating <= 5)) continue;
    rows.push({ media_type: 'movie', title: c[iTitle].trim(), year: c[iYear] ? parseInt(c[iYear], 10) : null,
      rating, source: 'watcha', rated_at: c[iWatched] || null });
  }
  return rows;
}
```

- [ ] **Step 5: 통과 확인** Run: `pnpm vitest run src/lib/watcha.test.js` → PASS (3).

- [ ] **Step 6: import.js — 파일 업로드 → 미리보기 → 저장**

`features/import.js`의 `mount`: `<input type=file accept=.csv>` → FileReader text → `parseWatchaCsv` → 미리보기(건수·샘플 5행) → "저장" 버튼 → 각 행 `Queries.createRating({ owner_id:userId, ...row, meta:{} })` (이미 있으면 unique 충돌 → updateRating). 진행률 표시.

- [ ] **Step 7: preview 검증** 샘플 CSV 업로드 → 미리보기 건수 → 저장 → `tasteDB.ratings.where('source').equals('watcha').count()` 확인.

- [ ] **Step 8: Commit**

```bash
cd ~/apps && git add taste/src/lib taste/src/features/import.js && git commit -m "feat(taste): 왓챠 CSV import — 파서(MOVIE만, 0.5★ 보존) TDD 3/3 + 업로드 화면"
```

---

## Task 10: 내 평점 목록 (영화 탭 + 책 목록)

**Files:** `taste/src/features/ratings.js` (movieList 채움 + 책 목록 표시)

- [ ] **Step 1: movieList 구현** — `listRatings(userId, 'movie')` → 포스터(meta.poster_url 있으면)/제목/연도 + `starRating(r.rating, 업데이트)` 행. 비추(0.5)는 라벨 강조.

- [ ] **Step 2: 책 목록** — 책 탭 검색창 아래 `listRatings(userId, 'book')` 기존 평점 목록(cover + 별점 수정/삭제).

- [ ] **Step 3: preview 검증** 영화/책 탭 전환, import한 영화 + 매긴 책이 별점과 함께 목록 표시. 별점 수정 → Dexie 반영. 삭제 → 목록 제외.

- [ ] **Step 4: Commit**

```bash
cd ~/apps && git add taste/src/features/ratings.js && git commit -m "feat(taste): 내 평점 목록 — 영화/책 탭 + 별점 수정·삭제"
```

---

## Wave 1 완료 기준 (working app)

1. 로그인(선행조건 redirect URI 등록 후) → 빈 평점 화면.
2. `#/import`에서 왓챠 CSV 업로드 → 영화 별점 저장.
3. `#/ratings` 책 탭에서 알라딘 검색 → 별점(0.5단위, 0.5★=비추) 저장.
4. 영화/책 목록에 별점 표시·수정·삭제.
5. Supabase에 동기화(개인 격리 — 본인 row만).
6. `pnpm vitest run` 전체 통과, `pnpm build` 성공.

**Wave 2 (별도 플랜)**: TMDB 발급 → 추천 루틴(`taste-weekly-reco`, 별점 읽기→Claude 추천→TMDB/알라딘 검증→`taste_recommendations`) + 추천 화면(`#/`) + deploy-pages.yml에 taste step 추가.
