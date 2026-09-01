-- ═══════════════════════════════════════════════════════════════════════════
-- readingtime — 0006_book_millie_books.sql
-- 밀리 책 단위 메타 카탈로그. millie-book-sync.sh 의 로컬 카탈로그(book-catalog.db)를
-- 그대로 미러 — 서재 편입·알라딘 ISBN 매칭(제목+저자+출판사)의 재료다.
--
-- 배경(2026-09-01 실측): 밀리 로컬 DB 에 ISBN 이 없다(book 테이블 55컬럼 무,
-- episode.isbn 은 컬럼만 있고 0행). 대신 제목·저자·출판사·출간일·표지가 있어
-- 알라딘 검색으로 ISBN 을 매칭한다. 기존 book_reading_books 는 일×책 히스토리라
-- 책 단위 메타를 반복 저장하게 되므로 별도 테이블로 둔다.
--
-- published_at 은 원천 문자열 그대로(text) — 밀리가 비정형 값을 넣어도 배치 업로드가
-- 통째로 죽지 않게 한다. 밀리 book 테이블은 최근 3권 롤링 캐시라 과거 책은
-- 저자까지만 있고(로컬 카탈로그 보관분) 출판사·출간일은 신규 수집분부터 찬다.
--
-- RLS: owner-only (0004 book_reading_books 패턴 미러). 비파괴: 신규 테이블만 추가.
-- ═══════════════════════════════════════════════════════════════════════════

create table book_millie_books (
  owner_id     uuid not null references auth.users on delete cascade,
  book_id      text not null,          -- 밀리 로컬 DB book.book_id (안정 키)
  title        text not null,
  author       text,
  publisher    text,                   -- 신규 수집분부터 (구 카탈로그 행은 NULL)
  published_at text,                   -- 원천 "YYYY-MM-DD" 그대로
  cover_url    text,
  updated_at   timestamptz not null default now(),
  primary key (owner_id, book_id)
);

create index book_millie_books_owner
  on book_millie_books (owner_id);

alter table book_millie_books enable row level security;

create policy book_millie_books_select on book_millie_books for select using (
  owner_id = auth.uid()
);

create policy book_millie_books_write on book_millie_books for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
