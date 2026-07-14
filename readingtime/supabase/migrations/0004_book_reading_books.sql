-- ═══════════════════════════════════════════════════════════════════════════
-- readingtime — 0004_book_reading_books.sql
-- 밀리(전자책) 일별×책별 히스토리. millie-book-sync.sh 가 밀리 맥앱 로컬 DB
-- (history_drift⋈book)에서 최근 30일을 upsert. 시간(초)은 book_reading_seconds
-- (스크린타임)가 담당 — 여기는 '그날 무슨 책'만. 리딩타임 통계가 일별 시간을
-- 그날 책 제목에 귀속해 표시 (히스토리 없는 날은 직전 책 폴백).
-- RLS: owner-only (0001 패턴 미러). 비파괴: 신규 테이블만 추가.
-- 적용: 2026-07-14 `supabase db query --linked`
-- ═══════════════════════════════════════════════════════════════════════════

create table book_reading_books (
  owner_id   uuid not null references auth.users on delete cascade,
  day        date not null,
  title      text not null,
  cover_url  text,
  updated_at timestamptz not null default now(),
  primary key (owner_id, day, title)
);

create index book_reading_books_owner_day
  on book_reading_books (owner_id, day desc);

alter table book_reading_books enable row level security;

create policy book_reading_books_select on book_reading_books for select using (
  owner_id = auth.uid()
);

create policy book_reading_books_write on book_reading_books for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
