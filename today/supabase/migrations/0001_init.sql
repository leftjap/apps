-- ═══════════════════════════════════════════════════════════════════════════
-- Today Wave 11.3 — 0001_init.sql
-- Source: (deleted spec: today-app-spec.md) §6 (line 155-259) + §7 (line 266-319)
-- Project: geo-apps (Gym/Study 와 공유). 테이블 prefix `today_` 로 충돌 회피.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ENUMS
-- ───────────────────────────────────────────────────────────────────────────

create type today_entry_kind as enum (
  'navi','fiction','blog',
  'soyoun_navi','flight_diary','soyoun_blog',
  'memo'
);

create type today_expense_source as enum ('sms','manual','import');

create type today_notif_kind as enum ('new_post','new_comment');

-- ───────────────────────────────────────────────────────────────────────────
-- profiles — 사용자 메타 (커플 페어링·탭 구성·카테고리 커스터마이즈)
-- ───────────────────────────────────────────────────────────────────────────

create table today_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  partner_user_id uuid references auth.users,
  tabs text[] not null default array['navi','fiction','blog','memo','expense']::text[],
  expense_categories jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- entries — 글/메모 통합 (kind 로 구분)
-- ───────────────────────────────────────────────────────────────────────────

create table today_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  kind today_entry_kind not null,
  title text,
  content text,
  meta jsonb not null default '{}'::jsonb,
  is_shared boolean not null default false,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- 오늘의 네비만 공유 가능 (다른 kind 는 is_shared=false 강제)
  constraint today_entries_share_only_navi check (
    is_shared = false or kind in ('navi','soyoun_navi')
  )
);

create index today_entries_owner_kind_updated
  on today_entries (owner_id, kind, updated_at desc)
  where deleted_at is null;

create index today_entries_shared_feed
  on today_entries (updated_at desc)
  where is_shared = true and deleted_at is null;

-- ───────────────────────────────────────────────────────────────────────────
-- expenses — 가계부 (완전 개인, 파트너 열람 불가)
-- ───────────────────────────────────────────────────────────────────────────

create table today_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  spent_at timestamptz not null,
  amount_krw integer not null,
  foreign_amount numeric,
  currency text,
  merchant_raw text,
  merchant text,
  brand text,
  category text,
  card text,
  memo text,
  merchant_url text,
  source today_expense_source not null,
  sms_raw text,
  received_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- SMS 중복 방지 (같은 사용자·같은 sms·같은 시각 = 동일 거래)
  constraint today_expenses_sms_unique unique (owner_id, sms_raw, spent_at)
);

create index today_expenses_owner_spent
  on today_expenses (owner_id, spent_at desc)
  where deleted_at is null;

-- ───────────────────────────────────────────────────────────────────────────
-- merchant_rules — 가맹점 → 브랜드/카테고리 자동 매핑 (global + user 학습)
-- ───────────────────────────────────────────────────────────────────────────

create table today_merchant_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  scope text not null check (scope in ('global','user')),
  pattern text not null,
  brand text,
  category text,
  priority int not null default 0,
  updated_at timestamptz not null default now(),
  constraint today_merchant_rules_scope_user_match check (
    (scope = 'global' and user_id is null)
    or (scope = 'user' and user_id is not null)
  )
);

create index today_merchant_rules_match
  on today_merchant_rules (priority desc, scope);

-- ───────────────────────────────────────────────────────────────────────────
-- comments — 피드 댓글 (is_shared=true entry 에만 작성 가능)
-- ───────────────────────────────────────────────────────────────────────────

create table today_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references today_entries on delete cascade,
  author_id uuid not null references auth.users on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index today_comments_entry
  on today_comments (entry_id, created_at)
  where deleted_at is null;

-- ───────────────────────────────────────────────────────────────────────────
-- notifications — 알림 인박스 (실시간 구독 + 딥링크)
-- ───────────────────────────────────────────────────────────────────────────

create table today_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users on delete cascade,
  kind today_notif_kind not null,
  entry_id uuid references today_entries on delete cascade,
  comment_id uuid references today_comments on delete cascade,
  preview text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index today_notifications_recipient_unread
  on today_notifications (recipient_id, created_at desc)
  where read_at is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- partner_user_id 헬퍼 함수 (RLS 자기참조 재귀 차단용)
-- spec §7 의 partner 가시성을 정책 안의 select 가 아니라 함수로 분리.
-- security definer + search_path 지정으로 RLS 우회.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function today_partner_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select partner_user_id from today_profiles where user_id = auth.uid() limit 1
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security — Day One 박제 (spec §7)
-- ═══════════════════════════════════════════════════════════════════════════

alter table today_profiles         enable row level security;
alter table today_entries          enable row level security;
alter table today_expenses         enable row level security;
alter table today_merchant_rules   enable row level security;
alter table today_comments         enable row level security;
alter table today_notifications    enable row level security;

-- ───────────────────────────────────────────────────────────────────────────
-- profiles — 본인 + 파트너 읽기 (display_name 필요)
-- ───────────────────────────────────────────────────────────────────────────

create policy today_profiles_select on today_profiles for select using (
  user_id = auth.uid()
  or user_id = today_partner_id()
);

create policy today_profiles_insert on today_profiles for insert
  with check (user_id = auth.uid());

create policy today_profiles_update on today_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────
-- entries — 본인 전체 + 파트너의 is_shared=true
-- ───────────────────────────────────────────────────────────────────────────

create policy today_entries_select on today_entries for select using (
  owner_id = auth.uid()
  or (
    is_shared = true
    and deleted_at is null
    and owner_id = today_partner_id()
  )
);

create policy today_entries_write on today_entries for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────
-- expenses — 완전 개인 (파트너 읽기도 불가)
-- ───────────────────────────────────────────────────────────────────────────

create policy today_expenses_own on today_expenses for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────
-- comments — is_shared=true entry 에만 작성, 파트너 읽기 가능
-- ───────────────────────────────────────────────────────────────────────────

create policy today_comments_select on today_comments for select using (
  exists (
    select 1 from today_entries e
    where e.id = entry_id
      and (
        e.owner_id = auth.uid()
        or (
          e.is_shared = true
          and e.owner_id = today_partner_id()
        )
      )
  )
);

create policy today_comments_insert on today_comments for insert with check (
  author_id = auth.uid()
  and exists (
    select 1 from today_entries e
    where e.id = entry_id and e.is_shared = true
  )
);

create policy today_comments_edit on today_comments for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy today_comments_delete on today_comments for delete
  using (author_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────
-- notifications — 본인 것만
-- ───────────────────────────────────────────────────────────────────────────

create policy today_notifications_own on today_notifications for all
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────
-- merchant_rules — global 은 모두 읽기, user scope 는 본인만 쓰기
-- ───────────────────────────────────────────────────────────────────────────

create policy today_merchant_rules_select on today_merchant_rules for select using (
  scope = 'global' or user_id = auth.uid()
);

create policy today_merchant_rules_write on today_merchant_rules for all
  using (scope = 'user' and user_id = auth.uid())
  with check (scope = 'user' and user_id = auth.uid());
