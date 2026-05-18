-- 0004_add_speaker_column.sql
-- 화자별 voice 매핑을 위한 speaker 컬럼 추가.
-- en 가이드 §6.2 라쿤+빅맨 페어. SPEAKER_VOICES (src/services/speech.js) lookup key.
-- non-destructive: 신규 컬럼, default NULL.

alter table public.study_today_lessons add column if not exists speaker text;
alter table public.study_review_queue add column if not exists speaker text;
