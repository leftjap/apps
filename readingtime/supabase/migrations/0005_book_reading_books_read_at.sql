-- ═══════════════════════════════════════════════════════════════════════════
-- readingtime — 0005_book_reading_books_read_at.sql
-- 밀리 일별×책별 히스토리에 '그날 마지막으로 읽은 시각'(read_at) 추가.
-- 배경: 원천(밀리 맥앱 db.sqlite history_drift.updated_at)은 Unix 초 단위 정밀
-- 시각인데, millie-book-sync.sh 가 date(...) 로 날짜만 잘라 올려 소실됐다.
-- book_current_reading(최근 1권)엔 last_read_at 이 이미 있으나 다권 히스토리엔 없어,
-- 홈 캐러셀의 '최근 읽은 순' 정렬이 같은 날 항목을 구분하지 못한다.
-- 비파괴: nullable 컬럼 추가만. 기존 행은 NULL(앱이 day 로 폴백), 다음 동기화가 채운다.
-- 다른 소비자(cue adapter 는 book_reading_seconds 사용) 무영향.
-- 적용: 2026-08-25 `supabase db query --linked`
-- ═══════════════════════════════════════════════════════════════════════════

alter table book_reading_books
  add column if not exists read_at timestamptz;

comment on column book_reading_books.read_at is
  '그날 그 책을 마지막으로 읽은 시각(밀리 로컬 DB history_drift.updated_at). NULL = 구 동기화분';
