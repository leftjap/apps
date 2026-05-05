-- ============================================================
-- 0002_study_pr_records.sql — Wave 11.68-a
-- ============================================================
-- spec §11-5 PR 정의 (4종 동시 추적):
--   - daily_utterance: 단일 일자 최대 utteranceCount (sessionLogs 합산)
--   - daily_study_time: 단일 일자 최대 studyTimeSec
--   - weekly_utterance: 7일 sliding window 최대 utteranceCount 합
--   - weekly_pass: 7일 sliding window 최대 passCount 합
--
-- 데이터 형식 (JSONB):
--   daily_utterance / daily_study_time:
--     { value: int, achieved_at: 'YYYY-MM-DD', lang: 'en'|'ja'|'both' }
--   weekly_utterance / weekly_pass:
--     { value: int, week_start: 'YYYY-MM-DD' (월요일), lang }
--   history (직전 5건):
--     [{ type: 'daily_utterance'|..., value, achieved_at, lang }]
--
-- 정합:
--   - 0001_study_init.sql 의 6 테이블 (review_queue / today_lessons / session_logs /
--     daily_stats / pronunciation_log / user_meta) 와 같은 RLS / set_updated_at 패턴.
--   - sync.js TABLE_MAP 5번째 (Wave 11.68-a 추가) — 또는 user_meta 와 같은
--     1↔N 매핑 (1 row / user, key-value 5 컬럼)
-- ============================================================

create table if not exists public.study_pr_records (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_utterance jsonb,
  daily_study_time jsonb,
  weekly_utterance jsonb,
  weekly_pass jsonb,
  history jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_study_pr_records_updated on public.study_pr_records;
create trigger trg_study_pr_records_updated
  before update on public.study_pr_records
  for each row execute function public.set_updated_at();

alter table public.study_pr_records enable row level security;
drop policy if exists "study_pr_records_owner" on public.study_pr_records;
create policy "study_pr_records_owner"
  on public.study_pr_records
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 적용 후 검증
-- ============================================================
-- select tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public' and tablename = 'study_pr_records';
--
-- 결과: 1 row, rowsecurity = true 이어야 정상.
