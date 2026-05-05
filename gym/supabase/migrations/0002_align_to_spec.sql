-- Wave 11.7.5 — Gym 스키마 spec §4 정합 + Wave 11.7.1 customExercises 반영
--
-- 적용 방식: Supabase Dashboard → SQL Editor 에 전체 paste → Run.
-- 전제: 0001_gym_init.sql 적용된 상태 + 사용자 데이터 적재 0 (sync 미구현).
--
-- 변경 요약:
--   1. gym_prs : value(numeric) 단일 컬럼 → weight/reps/e1rm/session_id 분리 (spec §4·§12).
--   2. gym_weights : weight_kg/note → weight/height 컬럼 (spec §4·§12).
--   3. gym_custom_exercises : 신규 테이블 (Wave 11.7.1 Dexie 추가 정합).
--
-- 모든 ALTER 는 IF NOT EXISTS / IF EXISTS 사용 — 멱등 보장.

-- ============================================================
-- 1. gym_prs — weight/reps/e1rm/session_id 분리
-- ============================================================
alter table public.gym_prs add column if not exists weight numeric;
alter table public.gym_prs add column if not exists reps integer;
alter table public.gym_prs add column if not exists e1rm numeric;
alter table public.gym_prs add column if not exists session_id text;

-- value 컬럼 제거 (sync 미구현 시점이라 데이터 0). 이미 적재 시도된 환경이면 SQL 가 실패할 수 있음 — 그 때는 사용자가 truncate 후 재실행.
alter table public.gym_prs drop column if exists value;

-- type CHECK 는 0001 의 ('e1rm', 'weight', 'reps', 'volume') 그대로 유지 (spec §12 'e1rm' default + 향후 확장).

-- 추가 인덱스 — sync 시 운동·날짜 조회 (이미 있는 idx_gym_prs_user_exercise_type / idx_gym_prs_user_date 그대로).

-- ============================================================
-- 2. gym_weights — weight/height 분리
-- ============================================================
alter table public.gym_weights add column if not exists weight numeric;
alter table public.gym_weights add column if not exists height integer;

alter table public.gym_weights drop column if exists weight_kg;
alter table public.gym_weights drop column if exists note;

-- ============================================================
-- 3. gym_custom_exercises — Wave 11.7.1 customExercises Dexie 정합
-- ============================================================
create table if not exists public.gym_custom_exercises (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  part text not null check (part in ('chest', 'back', 'shoulder', 'legs', 'arms', 'cardio')),
  equipment text not null check (equipment in ('barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'cardio')),
  default_sets integer not null default 3,
  default_reps integer not null default 10,
  default_weight numeric not null default 0,
  met numeric not null default 4.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gym_custom_exercises_user_part
  on public.gym_custom_exercises (user_id, part);

drop trigger if exists trg_gym_custom_exercises_updated on public.gym_custom_exercises;
create trigger trg_gym_custom_exercises_updated
  before update on public.gym_custom_exercises
  for each row execute function public.set_updated_at();

alter table public.gym_custom_exercises enable row level security;
drop policy if exists "gym_custom_exercises_owner" on public.gym_custom_exercises;
create policy "gym_custom_exercises_owner"
  on public.gym_custom_exercises
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
-- 결과: 5 row (gym_sessions / gym_prs / gym_weights / gym_user_settings / gym_custom_exercises),
--       모두 rowsecurity = true.
--
-- gym_prs 컬럼 확인:
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='gym_prs' order by ordinal_position;
-- 결과 포함: id, user_id, exercise_id, type, weight, reps, e1rm, session_id, date, created_at
-- (value 컬럼 없어야 함)
--
-- gym_weights 컬럼 확인:
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='gym_weights' order by ordinal_position;
-- 결과: user_id, date, weight, height, created_at (weight_kg, note 없어야 함)
