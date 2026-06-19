-- ═══════════════════════════════════════════════════════════════════════════
-- book — 0005_book_single_user.sql
-- 부부/파트너 모델 제거 → 단일 사용자(본인) 앱.
-- 근거: 소연(aeafd9a7) 보유 행 0 (quotes/comments/highlights/reading 전부 0 — DB count 2026-06-19).
--       book_profiles 소연 row(1) 는 콘텐츠 없음(display_name·partner_user_id 만). 데이터 행 미삭제.
-- 순서 필수: ① partner 참조 7개 RLS 정책 drop+recreate(owner-only) → ② book_partner_id() drop
--           → ③ book_profiles.partner_user_id 컬럼 drop. (역순이면 의존성 에러)
-- 적용: ✅ 2026-06-19 Management API 로 적용 완료 (PROJECT_REF tcbooffrdacfatywdzcm).
--       검증: pg_policies partner 참조 0 · book_partner_id() drop · partner_user_id 컬럼 drop ·
--       select 정책 5개(quotes/comments/profiles/reading/highlights) owner-only 확인.
--       (db push 불가 — 공유 geo-apps 프로젝트 히스토리 충돌. lessons/supabase-migration-management-api.md)
-- 비파괴(데이터): 어구록·댓글·하이라이트·독서기록 행 변경 0. RLS 만 owner 한정으로 좁힘 + 미사용 컬럼/함수 제거.
-- ═══════════════════════════════════════════════════════════════════════════

-- ① RLS 재작성 — partner 절 제거 (owner_id = auth.uid() 만)

-- profiles
drop policy if exists book_profiles_select on book_profiles;
create policy book_profiles_select on book_profiles for select using (
  user_id = auth.uid()
);

-- quotes
drop policy if exists book_quotes_select on book_quotes;
create policy book_quotes_select on book_quotes for select using (
  owner_id = auth.uid()
);

-- comments (select + insert)
drop policy if exists book_comments_select on book_comments;
create policy book_comments_select on book_comments for select using (
  exists (
    select 1 from book_quotes q
    where q.id = quote_id
      and q.owner_id = auth.uid()
  )
);
drop policy if exists book_comments_insert on book_comments;
create policy book_comments_insert on book_comments for insert with check (
  author_id = auth.uid()
  and exists (
    select 1 from book_quotes q
    where q.id = quote_id
      and q.owner_id = auth.uid()
  )
);

-- reading_seconds
drop policy if exists book_reading_select on book_reading_seconds;
create policy book_reading_select on book_reading_seconds for select using (
  owner_id = auth.uid()
);

-- quote_highlights (select + insert)
drop policy if exists book_quote_highlights_select on book_quote_highlights;
create policy book_quote_highlights_select on book_quote_highlights for select using (
  owner_id = auth.uid()
);
drop policy if exists book_quote_highlights_insert on book_quote_highlights;
create policy book_quote_highlights_insert on book_quote_highlights for insert with check (
  owner_id = auth.uid()
  and exists (
    select 1 from book_quotes q
    where q.id = quote_id
      and q.owner_id = auth.uid()
  )
);

-- ② 헬퍼 함수 제거 (이제 어떤 정책도 참조 안 함)
drop function if exists book_partner_id();

-- ③ 페어링 컬럼 제거
alter table book_profiles drop column if exists partner_user_id;
