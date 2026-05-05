-- ═══════════════════════════════════════════════════════════════════════════
-- Today Wave 11.6.2 — 0005_realtime_expenses.sql
-- today_expenses 테이블 Realtime publication 추가.
-- expenses 는 RLS 가 own only — 본인 변경만 자기 클라이언트에 도달 (다중 디바이스 동기화).
-- ═══════════════════════════════════════════════════════════════════════════

alter publication supabase_realtime add table today_expenses;

-- 검증: today_entries + today_expenses 모두 publication 에 포함
select schemaname, tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
   and tablename like 'today_%'
 order by tablename;
