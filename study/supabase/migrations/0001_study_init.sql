-- Wave 11.12 — Study 앱 초기 스키마 (spec §4)
--
-- 적용 방식: Supabase Dashboard → SQL Editor 에 전체 paste → Run.
-- (Supabase CLI 미사용. CLAUDE.md MCP 스윗스팟 보존)
--
-- 전제:
--   - 단일 Supabase 프로젝트 공유, 다른 앱은 다른 접두사 사용 (spec §15)
--   - 모든 테이블 RLS 활성, auth.uid() = user_id 정책
--   - 6 테이블 + 6 RLS 정책 + updated_at 자동 갱신 트리거
--
-- 참고: PWA 클라이언트 (Dexie) 가 주 저장소, Supabase 는 동기화·백업·멀티 디바이스.
--       동기화 로직은 Wave 11.13 (src/db/sync.js) 에서 구현.

-- ============================================================
-- 1. updated_at 자동 갱신 함수 (재사용)
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
-- 2. study_review_queue — SRS 복습 큐
-- ============================================================
create table if not exists public.study_review_queue (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en', 'ja')),
  sentence text not null,
  meaning text not null,
  reading text,
  explanation jsonb,
  interval integer not null default 1,
  next_review date not null,
  consecutive_pass integer not null default 0,
  last_result text check (last_result in ('O', '△', 'X')),
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_study_review_queue_user_lang
  on public.study_review_queue (user_id, lang);
create index if not exists idx_study_review_queue_user_next
  on public.study_review_queue (user_id, next_review);

drop trigger if exists trg_study_review_queue_updated on public.study_review_queue;
create trigger trg_study_review_queue_updated
  before update on public.study_review_queue
  for each row execute function public.set_updated_at();

alter table public.study_review_queue enable row level security;
drop policy if exists "study_review_queue_owner" on public.study_review_queue;
create policy "study_review_queue_owner"
  on public.study_review_queue
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 3. study_today_lessons — 오늘의 레슨 (배치 생성)
-- ============================================================
create table if not exists public.study_today_lessons (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en', 'ja')),
  date date not null,
  sentence text not null,
  meaning text not null,
  reading text,
  explanation jsonb not null,
  phonetic_kr text,
  audio_url text,
  completed boolean not null default false,
  order_index integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_study_today_lessons_user_date
  on public.study_today_lessons (user_id, date);

alter table public.study_today_lessons enable row level security;
drop policy if exists "study_today_lessons_owner" on public.study_today_lessons;
create policy "study_today_lessons_owner"
  on public.study_today_lessons
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 4. study_session_logs — 세션 로그
-- ============================================================
create table if not exists public.study_session_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en', 'ja')),
  date date not null,
  category text,
  duration_sec integer,
  new_count integer not null default 0,
  review_results jsonb,
  utterance_count integer not null default 0,
  pass_count integer not null default 0,
  sentence_ids text[],
  session_type text check (session_type in ('normal', 'free_review')),
  created_at timestamptz not null default now()
);

create index if not exists idx_study_session_logs_user_date
  on public.study_session_logs (user_id, date);

alter table public.study_session_logs enable row level security;
drop policy if exists "study_session_logs_owner" on public.study_session_logs;
create policy "study_session_logs_owner"
  on public.study_session_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 5. study_daily_stats — 일별 통계
-- ============================================================
create table if not exists public.study_daily_stats (
  id text primary key,                    -- '<date>_<lang>_<userId>'
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en', 'ja')),
  date date not null,
  utterance_count integer not null default 0,
  study_time_sec integer not null default 0,
  new_sentences integer not null default 0,
  review_count integer not null default 0
);

create unique index if not exists ux_study_daily_stats_user_date_lang
  on public.study_daily_stats (user_id, date, lang);

alter table public.study_daily_stats enable row level security;
drop policy if exists "study_daily_stats_owner" on public.study_daily_stats;
create policy "study_daily_stats_owner"
  on public.study_daily_stats
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 6. study_pronunciation_log — 발음 분석 로그
-- ============================================================
create table if not exists public.study_pronunciation_log (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en', 'ja')),
  sentence_id text,
  date date not null,
  overall_score real,
  phoneme_scores jsonb,
  weak_phonemes jsonb,
  recognized_text text,
  created_at timestamptz not null default now()
);

create index if not exists idx_study_pronunciation_log_user_date
  on public.study_pronunciation_log (user_id, date);

alter table public.study_pronunciation_log enable row level security;
drop policy if exists "study_pronunciation_log_owner" on public.study_pronunciation_log;
create policy "study_pronunciation_log_owner"
  on public.study_pronunciation_log
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 7. study_user_meta — 사용자 메타 (1 row / user)
-- ============================================================
create table if not exists public.study_user_meta (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lang_en jsonb,
  lang_ja jsonb,
  weak_phonemes_en jsonb,
  weak_phonemes_ja jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_study_user_meta_updated on public.study_user_meta;
create trigger trg_study_user_meta_updated
  before update on public.study_user_meta
  for each row execute function public.set_updated_at();

alter table public.study_user_meta enable row level security;
drop policy if exists "study_user_meta_owner" on public.study_user_meta;
create policy "study_user_meta_owner"
  on public.study_user_meta
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 적용 후 검증 쿼리 (Dashboard SQL Editor 에서 따로 실행)
-- ============================================================
-- select tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public' and tablename like 'study_%'
-- order by tablename;
--
-- 결과: 6 row, 모두 rowsecurity = true 이어야 정상.
