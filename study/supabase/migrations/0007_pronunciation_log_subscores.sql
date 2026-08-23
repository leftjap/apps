-- ============================================================
-- 0007_pronunciation_log_subscores.sql — 발음 세부 점수 동기화 누수 수리
-- ============================================================
-- 문제 (2026-08-23 실 DB 감사):
--   speech.js:1143 이 Azure 로부터 FluencyScore/ProsodyScore/AccuracyScore/CompletenessScore 를
--   받고, pronunciationLog.js:27 이 Dexie 행에 저장하는데, study_pronunciation_log 에 컬럼이 없어
--   sync.js 의 pronunciationLogDexieToSupabase 가 통째로 버리고 있었다.
--   → 세부 점수가 기기 로컬에만 존재. 기기 교체·IndexedDB eviction 시 영구 소실.
--   → 발화 유창성 추이(문장이 달라도 비교 가능한 척도)를 산출할 데이터가 클라우드에 0건.
--
-- 비파괴: ADD COLUMN IF NOT EXISTS (전부 nullable, default 없음) — 기존 385행 보존.
--   과거 행은 null 로 남는다 (Azure 원본이 없어 소급 불가). 신규 행부터 채워진다.
--
-- 적용: cd ~/apps/study && supabase db query --linked --yes --file supabase/migrations/0007_pronunciation_log_subscores.sql
-- ============================================================

alter table public.study_pronunciation_log
  add column if not exists pron_score real,
  add column if not exists fluency_score real,
  add column if not exists completeness_score real,
  add column if not exists prosody_score real,
  add column if not exists capture_rms real;

comment on column public.study_pronunciation_log.pron_score is 'Azure AccuracyScore — 음소 정확도';
comment on column public.study_pronunciation_log.fluency_score is 'Azure FluencyScore — 유창성(속도·휴지)';
comment on column public.study_pronunciation_log.completeness_score is 'Azure CompletenessScore — 문장 완성도';
comment on column public.study_pronunciation_log.prosody_score is 'Azure ProsodyScore — 운율';
comment on column public.study_pronunciation_log.capture_rms is '캡처 레벨(rms) — 저점 원인이 발음인지 마이크인지 구분';
