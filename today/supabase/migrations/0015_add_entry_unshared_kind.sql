-- ═══════════════════════════════════════════════════════════════════════════
-- Today — 0015_add_entry_unshared_kind.sql
-- 0014 의 today_notify_entry_unshared() 가 'entry_unshared' kind 로 INSERT 시도하지만
-- today_notif_kind ENUM 에 'entry_unshared' 미등록 → trigger 무음 실패.
-- 해결: ENUM value 추가.
-- 주의: ALTER TYPE ADD VALUE 는 PostgreSQL 12+ 에서 transaction 외 commit 됨.
--       SQL Editor 에서 단독 실행 권장.
-- ═══════════════════════════════════════════════════════════════════════════

alter type today_notif_kind add value if not exists 'entry_unshared';
