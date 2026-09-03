-- ============================================================
-- 0008_pronunciation_log_timing.sql — 발화 채점 지연 계측 (2026-09-03)
-- ============================================================
-- 문제 (2026-09-03 사용자 보고): 발화 뒤 점수가 한참 있다 뜨거나, 다음 발화를 하면 두 점수가
--   한꺼번에 뜬다. 서버 기록에서 같은 밀리초 저장 4건(24초·60초 공백 뒤)이 확인됐지만,
--   녹음 종료→토큰→Azure 채점→화면 반영 중 어느 구간이 느렸는지는 클라이언트가 아무 시각도
--   남기지 않아 판별할 수 없었다.
-- 해법: 발음 기록 행에 구간별 소요 시간을 jsonb 로 저장한다 (speech.js analyzeWavRest·
--   sessionAnalyze.js _stopAndAnalyze 가 채우고 pronunciationLog.js 가 실어 sync 로 올린다).
--   { stopAt, blobMs, specUsed, tokenMs, tokenRefetched, sttMs, sttAttempts, altMs, totalMs,
--     hidden, online, sinceStopMs }
-- 비파괴: ADD COLUMN IF NOT EXISTS, nullable, default 없음 — 기존 행 보존, 과거 행은 null.
-- 적용: Management API (lessons/supabase-migration-management-api.md) — 히스토리 미기록이므로
--   이 파일이 정본. 적용 여부는 information_schema.columns 로 판별.
-- ============================================================

alter table public.study_pronunciation_log
  add column if not exists timing jsonb;

comment on column public.study_pronunciation_log.timing is '채점 지연 계측 — 녹음 종료→토큰→STT→반영 구간별 ms (2026-09-03)';
