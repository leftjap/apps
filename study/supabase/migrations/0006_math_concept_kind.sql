-- Wave: 수학 루틴 일일생성 — study_math_problems 에 concept_id · kind 추가
--
-- 목적: 루틴이 매일 생성·시드하는 응용 문제를 번들 개념(conceptId)에 연결해
--   session-math 의 nextNewGroup(개념-우선) · 복습 recap · 부모 개념 value 노출이 동작하게 함.
--   (기존 스키마엔 concept_id/kind 가 없어 시드 응용이 conceptId 없이 떠 NEW/REVIEW 에 노출 안 됐음.)
--
-- 비파괴: ADD COLUMN (nullable / default) — 기존 행 보존. kind 기본 'apply'.
-- 적용: cd ~/apps/study && supabase db query --linked --yes --file supabase/migrations/0006_math_concept_kind.sql

alter table public.study_math_problems
  add column if not exists concept_id text,
  add column if not exists kind text not null default 'apply';

-- 검증: select column_name from information_schema.columns
--   where table_name='study_math_problems' and column_name in ('concept_id','kind');  → 2 row
