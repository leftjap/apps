-- ═══════════════════════════════════════════════════════════════════════════
-- Today Wave 11.3 — 검증 쿼리 (마이그레이션 적용 후 실행)
-- spec §17 Acceptance Checklist 정합용
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. 테이블 6개 + RLS 활성화 확인
select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
   and tablename like 'today_%'
 order by tablename;
-- 기대: 6 행 (today_comments / today_entries / today_expenses /
--             today_merchant_rules / today_notifications / today_profiles)
--       모두 rowsecurity = true

-- 2. enum 3종 확인
select typname
  from pg_type
 where typname like 'today_%'
 order by typname;
-- 기대: today_entry_kind / today_expense_source / today_notif_kind

-- 3. RLS 정책 수 확인
select tablename, count(*) as policies
  from pg_policies
 where schemaname = 'public'
   and tablename like 'today_%'
 group by tablename
 order by tablename;
-- 기대:
--   today_comments         4 (select/insert/edit/delete)
--   today_entries          2 (select/all)
--   today_expenses         1 (all)
--   today_merchant_rules   2 (select/all)
--   today_notifications    1 (all)
--   today_profiles         3 (select/insert/update)

-- 4. 트리거 3종 확인
select trigger_name, event_object_table, event_manipulation
  from information_schema.triggers
 where event_object_table like 'today_%'
 order by trigger_name;
-- 기대:
--   today_notify_new_comment_insert  today_comments  INSERT
--   today_notify_new_post_insert     today_entries   INSERT
--   today_notify_new_post_update     today_entries   UPDATE

-- 5. 인덱스 확인
select indexname
  from pg_indexes
 where schemaname = 'public'
   and tablename like 'today_%'
   and indexname not like '%_pkey'
 order by indexname;
-- 기대 (5+):
--   today_comments_entry
--   today_entries_owner_kind_updated
--   today_entries_shared_feed
--   today_expenses_owner_spent
--   today_expenses_sms_unique
--   today_merchant_rules_match
--   today_notifications_recipient_unread
