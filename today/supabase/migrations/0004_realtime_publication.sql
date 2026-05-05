-- ═══════════════════════════════════════════════════════════════════════════
-- Today Wave 11.5.4 — 0004_realtime_publication.sql
-- Source: (deleted spec: today-app-spec.md) §8 (line 339-344)
-- today_entries 테이블 Realtime 구독 활성화.
-- RLS 가 자동 필터 — 클라이언트는 own + partner.is_shared=true 만 수신.
-- ═══════════════════════════════════════════════════════════════════════════

alter publication supabase_realtime add table today_entries;

-- 검증: today_entries 가 publication 에 포함됐는지
select schemaname, tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
   and tablename like 'today_%'
 order by tablename;
