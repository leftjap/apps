-- ═══════════════════════════════════════════════════════════════════════════
-- book — 0004_book_quote_highlights.sql
-- 드래그 형광펜 동기화: 어구록 본문 부분 하이라이트 marks=[{s,e,c}] (jsonb).
-- 클라: Dexie quote_highlights ↔ 이 테이블. 본인 행만 push/pull (부부 겹쳐보기는
--       후속 — 로컬 모델이 quote 당 1행이라 표시 통합 시 확장 필요).
-- RLS: 0001 quotes 패턴 — select 본인+파트너(미래 공유 표시 대비), 쓰기 본인만.
--      insert 는 보이는 어구(본인·파트너)에만 허용 (comments insert 패턴 미러).
-- 비파괴: 신규 테이블만 추가. 기존 테이블 영향 없음.
-- 적용: ✅ 2026-06-12 Management API 로 적용 완료 (lessons/supabase-migration-management-api.md
--       — db push 는 공유 프로젝트 히스토리 충돌로 불가하나 API 경로는 동작).
--       스키마·RLS 4정책·rowsecurity·실왕복(insert/select/delete)·anon 차단(42501) 검증됨.
--       클라는 적용 전에도 안전했음: push/pull 이 42P01 을 'table_missing' 으로 무해
--       처리(pending 유지), 적용 후 앱 시작 시 pending 하이라이트가 flush 로 자동 업로드.
-- ═══════════════════════════════════════════════════════════════════════════

create table book_quote_highlights (
  quote_id   uuid not null references book_quotes on delete cascade,
  owner_id   uuid not null references auth.users on delete cascade,
  marks      jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (quote_id, owner_id)
);

create index book_quote_highlights_owner
  on book_quote_highlights (owner_id, updated_at desc);

-- ───────────────────────────────────────────────────────────────────────────
-- RLS (0001 book_quotes 패턴 미러 — book_partner_id() 재사용)
-- ───────────────────────────────────────────────────────────────────────────

alter table book_quote_highlights enable row level security;

-- 본인 전체 + 파트너 읽기
create policy book_quote_highlights_select on book_quote_highlights for select using (
  owner_id = auth.uid()
  or owner_id = book_partner_id()
);

-- 쓰기 본인만 + 보이는 어구(본인·파트너 소유)에만 칠하기 허용
create policy book_quote_highlights_insert on book_quote_highlights for insert with check (
  owner_id = auth.uid()
  and exists (
    select 1 from book_quotes q
    where q.id = quote_id
      and (q.owner_id = auth.uid() or q.owner_id = book_partner_id())
  )
);

create policy book_quote_highlights_update on book_quote_highlights for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy book_quote_highlights_delete on book_quote_highlights for delete
  using (owner_id = auth.uid());
