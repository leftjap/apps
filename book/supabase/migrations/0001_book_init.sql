-- ═══════════════════════════════════════════════════════════════════════════
-- book W1 — 0001_book_init.sql
-- Source: book-port-spec.md §3.1 (테이블) + §3.2 (RLS)
-- Project: geo-apps (Gym/Study/Today 와 공유). 테이블 prefix `book_` 로 충돌 회피.
--
-- 모델: 부부 공용 저널. is_shared 없음 — 두 사람 어구록이 전부 공유 피드에 노출.
-- 페어링: profile.js 가 insert 시 partner_user_id 자동 매핑 (EMAIL_TO_PARTNER_USER_ID)
--         + 기존 row NULL 이면 self-heal. 별도 pairing SQL 불필요.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- profiles — 사용자 메타 (커플 페어링)
-- ───────────────────────────────────────────────────────────────────────────

create table book_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  partner_user_id uuid references auth.users,
  updated_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- quotes — 어구록 (책에서 옮긴 문장)
-- book_ref = 클라이언트 books.js 상수의 책 id 문자열 (D1=b). DB 에 책 메타 없음.
-- is_shared 없음 — 부부 전부 공유 (spec §3.1 착오 정정).
-- ───────────────────────────────────────────────────────────────────────────

create table book_quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  book_ref text not null,
  text text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index book_quotes_owner_updated
  on book_quotes (owner_id, updated_at desc)
  where deleted_at is null;

create index book_quotes_feed
  on book_quotes (updated_at desc)
  where deleted_at is null;

create index book_quotes_book
  on book_quotes (book_ref, updated_at desc)
  where deleted_at is null;

-- ───────────────────────────────────────────────────────────────────────────
-- comments — 어구록 스레드 댓글
-- ───────────────────────────────────────────────────────────────────────────

create table book_comments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references book_quotes on delete cascade,
  author_id uuid not null references auth.users on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index book_comments_quote
  on book_comments (quote_id, created_at)
  where deleted_at is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- partner_user_id 헬퍼 (RLS 자기참조 재귀 차단). today_partner_id() 미러 (D4).
-- security definer + search_path 로 RLS 우회.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function book_partner_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select partner_user_id from book_profiles where user_id = auth.uid() limit 1
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security (spec §3.2 — 부부 전부 공유, is_shared 조건 없음)
-- ═══════════════════════════════════════════════════════════════════════════

alter table book_profiles enable row level security;
alter table book_quotes   enable row level security;
alter table book_comments enable row level security;

-- profiles — 본인 + 파트너 읽기 (display_name 필요)
create policy book_profiles_select on book_profiles for select using (
  user_id = auth.uid()
  or user_id = book_partner_id()
);
create policy book_profiles_insert on book_profiles for insert
  with check (user_id = auth.uid());
create policy book_profiles_update on book_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- quotes — 본인 전체 + 파트너 (deleted_at null). is_shared 게이트 없음.
create policy book_quotes_select on book_quotes for select using (
  owner_id = auth.uid()
  or (owner_id = book_partner_id() and deleted_at is null)
);
create policy book_quotes_write on book_quotes for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- comments — 볼 수 있는 quote(본인 또는 파트너 소유)의 댓글
create policy book_comments_select on book_comments for select using (
  exists (
    select 1 from book_quotes q
    where q.id = quote_id
      and (q.owner_id = auth.uid() or q.owner_id = book_partner_id())
  )
);
create policy book_comments_insert on book_comments for insert with check (
  author_id = auth.uid()
  and exists (
    select 1 from book_quotes q
    where q.id = quote_id
      and (q.owner_id = auth.uid() or q.owner_id = book_partner_id())
  )
);
create policy book_comments_update on book_comments for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());
create policy book_comments_delete on book_comments for delete
  using (author_id = auth.uid());
