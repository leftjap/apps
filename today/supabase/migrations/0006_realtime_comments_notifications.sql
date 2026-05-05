-- ═══════════════════════════════════════════════════════════════════════════
-- Today Wave 11.7.2 — 0006_realtime_comments_notifications.sql
-- comments / notifications 테이블 Realtime publication 추가.
-- ═══════════════════════════════════════════════════════════════════════════

alter publication supabase_realtime add table today_comments;
alter publication supabase_realtime add table today_notifications;

-- 검증: today_* 4 테이블 모두 publication 에 포함
select schemaname, tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
   and tablename like 'today_%'
 order by tablename;
