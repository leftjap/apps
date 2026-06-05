-- ═══════════════════════════════════════════════════════════════════════════
-- book — 0003_book_reading.sql
-- 밀리의서재 일별 독서시간(초). millie-tracker(로컬 frontmost 누적) → millie-sync upsert.
-- RLS: 0001 quotes 패턴 동일 — 본인 전체 + 파트너 읽기 (부부 공용 통계).
-- 비파괴: 신규 테이블만 추가. 기존 테이블 영향 없음.
-- ═══════════════════════════════════════════════════════════════════════════

create table book_reading_seconds (
  owner_id   uuid not null references auth.users on delete cascade,
  day        date not null,
  seconds    integer not null default 0,
  source     text not null default 'millie',
  updated_at timestamptz not null default now(),
  primary key (owner_id, day)
);

create index book_reading_seconds_owner_day
  on book_reading_seconds (owner_id, day desc);

-- ───────────────────────────────────────────────────────────────────────────
-- RLS (0001 book_quotes 패턴 미러 — book_partner_id() 재사용)
-- ───────────────────────────────────────────────────────────────────────────

alter table book_reading_seconds enable row level security;

-- 본인 전체 + 파트너 읽기
create policy book_reading_select on book_reading_seconds for select using (
  owner_id = auth.uid()
  or owner_id = book_partner_id()
);

-- 본인 것만 쓰기 (insert/update/delete)
create policy book_reading_write on book_reading_seconds for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
