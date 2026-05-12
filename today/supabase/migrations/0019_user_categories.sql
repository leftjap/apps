-- ═══════════════════════════════════════════════════════════════════════════
-- Today Wave 11.8 — 0019_user_categories.sql
-- 카테고리 picker / brand→category 매핑 / merchant→brand 정규화 DB 화.
-- 기존 코드 freeze (LEFTJAP_CATEGORIES / BRAND_CATEGORY_MAP / MERCHANT_TO_BRAND) 대체.
-- 사용자별 분기 — RLS 로 user_id 격리.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. today_user_categories — 사용자별 카테고리 picker
-- ───────────────────────────────────────────────────────────────────────────
create table today_user_categories (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,           -- 'dining', 'food' 등
  name text not null,         -- '외식', '마트'
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index today_user_categories_user_order
  on today_user_categories (user_id, display_order);

alter table today_user_categories enable row level security;

create policy "own select" on today_user_categories
  for select using (auth.uid() = user_id);
create policy "own insert" on today_user_categories
  for insert with check (auth.uid() = user_id);
create policy "own update" on today_user_categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own delete" on today_user_categories
  for delete using (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. today_user_brand_categories — 사용자별 brand → category 매핑
-- ───────────────────────────────────────────────────────────────────────────
create table today_user_brand_categories (
  user_id uuid not null references auth.users on delete cascade,
  brand text not null,                -- '쿠팡', 'CU' 등
  category_id text not null,          -- today_user_categories.id 참조 (FK 강제 안 함 — 마이그레이션 호환)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, brand)
);

create index today_user_brand_categories_user
  on today_user_brand_categories (user_id, brand);

alter table today_user_brand_categories enable row level security;

create policy "own select" on today_user_brand_categories
  for select using (auth.uid() = user_id);
create policy "own insert" on today_user_brand_categories
  for insert with check (auth.uid() = user_id);
create policy "own update" on today_user_brand_categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own delete" on today_user_brand_categories
  for delete using (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. today_user_merchant_aliases — 사용자별 merchant → brand 정규화
-- ───────────────────────────────────────────────────────────────────────────
create table today_user_merchant_aliases (
  user_id uuid not null references auth.users on delete cascade,
  merchant_pattern text not null,     -- '연세대학교', '컬리페이_컬리' 등
  brand text not null,                -- '신촌세브란스병원', '컬리' 등
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, merchant_pattern)
);

create index today_user_merchant_aliases_user
  on today_user_merchant_aliases (user_id, merchant_pattern);

alter table today_user_merchant_aliases enable row level security;

create policy "own select" on today_user_merchant_aliases
  for select using (auth.uid() = user_id);
create policy "own insert" on today_user_merchant_aliases
  for insert with check (auth.uid() = user_id);
create policy "own update" on today_user_merchant_aliases
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own delete" on today_user_merchant_aliases
  for delete using (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Realtime publication — 3 테이블 모두 클라이언트 sync 대상
-- ───────────────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table today_user_categories;
alter publication supabase_realtime add table today_user_brand_categories;
alter publication supabase_realtime add table today_user_merchant_aliases;
