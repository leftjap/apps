-- Wave 11.7 — Gym 앱 초기 스키마 (spec §12 + Dexie schema.js 1:1 매핑)
--
-- 적용 방식: Supabase Dashboard → SQL Editor 에 전체 paste → Run.
-- (Supabase CLI 미사용. CLAUDE.md MCP 스윗스팟 보존)
--
-- 전제:
--   - 단일 Supabase 프로젝트 공유. Study 는 study_*, Gym 은 gym_* 접두사 (CLAUDE.md spec §15)
--   - 모든 테이블 RLS 활성, auth.uid() = user_id 정책
--   - 4 테이블 + 4 RLS 정책 + updated_at 자동 갱신 트리거 2건
--
-- 참고: PWA 클라이언트 (Dexie) 가 주 저장소, Supabase 는 동기화·백업·멀티 디바이스.
--       동기화 로직은 Wave 11.8 (src/db/sync.js) 에서 구현.

-- ============================================================
-- 0. updated_at 자동 갱신 함수 (Study 와 공유, idempotent)
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 1. gym_sessions — 운동 세션 (single + circuit 블록)
--    Dexie: sessions '&id, date, status, startTime, [date+status]'
--    스키마 참고 (seed.js):
--      { id, date, startTime, endTime, blocks, tags,
--        totalVolume, totalCalories, durationMin, status }
-- ============================================================
create table if not exists public.gym_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  status text not null check (status in ('active', 'paused', 'completed')),
  start_time bigint,                                          -- ms epoch
  end_time bigint,
  blocks jsonb not null default '[]'::jsonb,                  -- single/circuit + exercises + sets
  tags text[] not null default '{}',
  total_volume numeric not null default 0,
  total_calories integer not null default 0,
  duration_min integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gym_sessions_user_date
  on public.gym_sessions (user_id, date);
create index if not exists idx_gym_sessions_user_status
  on public.gym_sessions (user_id, status);

drop trigger if exists trg_gym_sessions_updated on public.gym_sessions;
create trigger trg_gym_sessions_updated
  before update on public.gym_sessions
  for each row execute function public.set_updated_at();

alter table public.gym_sessions enable row level security;
drop policy if exists "gym_sessions_owner" on public.gym_sessions;
create policy "gym_sessions_owner"
  on public.gym_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 2. gym_prs — 개인 기록 (e1rm · weight · reps · volume 타입별)
--    Dexie: prs '++id, exerciseId, type, date, [exerciseId+type]'
--    Dexie 자동증분 정수 → Supabase 동기화 시 client uuid 매핑 (Wave 11.8 sync 책임)
-- ============================================================
create table if not exists public.gym_prs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null,
  type text not null check (type in ('e1rm', 'weight', 'reps', 'volume')),
  value numeric not null,
  date date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_gym_prs_user_exercise_type
  on public.gym_prs (user_id, exercise_id, type);
create index if not exists idx_gym_prs_user_date
  on public.gym_prs (user_id, date);

alter table public.gym_prs enable row level security;
drop policy if exists "gym_prs_owner" on public.gym_prs;
create policy "gym_prs_owner"
  on public.gym_prs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 3. gym_weights — 체중 로그 (하루 1건)
--    Dexie: weights '&date'  (date 가 unique)
--    Postgres: (user_id, date) composite PK 로 사용자별 격리 + 하루 1건 강제
-- ============================================================
create table if not exists public.gym_weights (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  weight_kg numeric not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.gym_weights enable row level security;
drop policy if exists "gym_weights_owner" on public.gym_weights;
create policy "gym_weights_owner"
  on public.gym_weights
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 4. gym_user_settings — 사용자 설정 (1 row / user)
--    Dexie: settings '&key' (단일 row · key='userSettings')
--    Postgres: user_id PK + jsonb 단일 컬럼 (key 컬럼 불필요)
-- ============================================================
create table if not exists public.gym_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_gym_user_settings_updated on public.gym_user_settings;
create trigger trg_gym_user_settings_updated
  before update on public.gym_user_settings
  for each row execute function public.set_updated_at();

alter table public.gym_user_settings enable row level security;
drop policy if exists "gym_user_settings_owner" on public.gym_user_settings;
create policy "gym_user_settings_owner"
  on public.gym_user_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 적용 후 검증 쿼리 (Dashboard SQL Editor 에서 따로 실행)
-- ============================================================
-- select tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public' and tablename like 'gym_%'
-- order by tablename;
--
-- 결과: 4 row, 모두 rowsecurity = true 이어야 정상.
