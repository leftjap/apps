-- ═══════════════════════════════════════════════════════════════════════════
-- book — 0006_book_current_reading.sql
-- 밀리의서재에서 "현재(최근) 읽는 책" 1권 — 제목·저자·진도. 맥 밀리앱 로컬 DB
-- (~/Library/Application Support/kr.co.millie.MillieShelf/db.sqlite, history_drift⋈book)
-- 에서 millie-book-sync 가 최근 1권을 upsert. cue 독서 카드가 제목·진도 표시.
-- 시간(초)은 기존 book_reading_seconds(스크린타임) 그대로 — 본 테이블은 '무슨 책'만 보강.
-- RLS: 0003 book_reading_seconds 패턴 동일 (본인 전체 + 파트너 읽기).
-- 비파괴: 신규 테이블만 추가. 기존 테이블 영향 없음.
-- ═══════════════════════════════════════════════════════════════════════════

create table book_current_reading (
  owner_id     uuid not null references auth.users on delete cascade,
  title        text not null,
  author       text,
  read_percent integer,
  cover_url    text,
  last_read_at timestamptz,            -- 밀리 history_drift.updated_at (최근 읽은 시각)
  source       text not null default 'millie-local-db',
  updated_at   timestamptz not null default now(),
  primary key (owner_id)               -- 사용자당 현재 책 1행 (upsert)
);

alter table book_current_reading enable row level security;

-- 본인 전체 + 파트너 읽기
create policy book_current_reading_select on book_current_reading for select using (
  owner_id = auth.uid()
  or owner_id = book_partner_id()
);

-- 본인 것만 쓰기 (insert/update/delete)
create policy book_current_reading_write on book_current_reading for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
