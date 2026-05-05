-- ============================================================
-- 0003_session_logs_new_sentence_ids.sql — Wave 11.75
-- ============================================================
-- 캘린더 바텀시트 "그날 신규 학습한 문장만" 정확 표시 위해 study_session_logs 에
-- new_sentence_ids text[] 컬럼 추가. sentenceIds (그날 학습한 카드 전체) 는 유지.
--
-- 작성 시점: mocks/session.html finish() 가 state.newCompleted.map(c => c.id) 로 채움.
-- 조회 시점: src/services/dayLessons.js fetchDayLessonsForDay 가 우선 사용 + 미존재 시
--           sentenceIds 폴백 (구 row 호환).
--
-- 정합:
--   - 0001_study_init.sql 의 study_session_logs 와 같은 RLS / 컬럼 패턴.
--   - sync.js sessionLogsDexieToSupabase / sessionLogsSupabaseToDexie 양방향 매핑 동반.
-- ============================================================

alter table public.study_session_logs
  add column if not exists new_sentence_ids text[];

-- ============================================================
-- 적용 후 검증
-- ============================================================
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'study_session_logs'
--   and column_name = 'new_sentence_ids';
--
-- 결과: 1 row, data_type = 'ARRAY' 이어야 정상.
