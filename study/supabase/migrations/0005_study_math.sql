-- Wave: 수학 사고력 세션 — Supabase 스키마 (0001 패턴 미러)
--
-- 적용: Supabase Dashboard → SQL Editor 에 전체 paste → Run (en/ja 와 동일 관례, CLI 미사용).
-- 전제: RLS 활성, auth.uid() = user_id. set_updated_at() 함수는 0001 에서 이미 생성됨.
--
-- 테이블 2개:
--   study_math_problems — 일일 생성 문제 (en/ja 의 study_today_lessons 대응)
--   study_math_queue    — 간격복습 큐 (en/ja 의 study_review_queue 대응)

-- ============================================================
-- 1. study_math_problems — 오늘의 수학 문제 (배치 생성)
-- ============================================================
create table if not exists public.study_math_problems (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  module text,
  tag text,
  lesson text,
  prompt text not null,
  figure jsonb,
  answer text not null,
  accept jsonb,
  solution jsonb not null,
  order_index integer,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_study_math_problems_user_date
  on public.study_math_problems (user_id, date);

alter table public.study_math_problems enable row level security;
drop policy if exists "study_math_problems_owner" on public.study_math_problems;
create policy "study_math_problems_owner"
  on public.study_math_problems
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 2. study_math_queue — 간격복습 큐 (SRS)
-- ============================================================
create table if not exists public.study_math_queue (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  module text,
  tag text,
  prompt text not null,
  figure jsonb,
  answer text not null,
  accept jsonb,
  solution jsonb,
  interval integer not null default 1,
  next_review date not null,
  last_result text check (last_result in ('got', 'hmm', 'no')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_study_math_queue_user_next
  on public.study_math_queue (user_id, next_review);

drop trigger if exists trg_study_math_queue_updated on public.study_math_queue;
create trigger trg_study_math_queue_updated
  before update on public.study_math_queue
  for each row execute function public.set_updated_at();

alter table public.study_math_queue enable row level security;
drop policy if exists "study_math_queue_owner" on public.study_math_queue;
create policy "study_math_queue_owner"
  on public.study_math_queue
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 검증: select tablename from pg_tables where tablename like 'study_math%';  → 2 row
