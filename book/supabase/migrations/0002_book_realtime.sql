-- ═══════════════════════════════════════════════════════════════════════════
-- book W1 — 0002_book_realtime.sql
-- book_quotes / book_comments 를 supabase_realtime publication 에 추가.
-- sync.js 의 postgres_changes 구독 (피드/스레드 실시간 반영) 전제.
-- 멱등: 이미 추가돼 있으면 skip (재실행 안전).
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'book_quotes'
  ) then
    alter publication supabase_realtime add table book_quotes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'book_comments'
  ) then
    alter publication supabase_realtime add table book_comments;
  end if;
end $$;
