-- ═══════════════════════════════════════════════════════════════════════════
-- Today — 0014_notify_entry_unshared.sql
-- 회귀 (b) fix: partner 가 is_shared=true→false 로 바꾸면 그 row 는 partner 권한 외
-- → Supabase Realtime postgres_changes 도 partner 측에 push 안 함 (RLS 적용).
-- → partner 측 사이드바·Dexie 가 stale 상태 유지.
-- 해결: is_shared OFF 시 partner 측 today_notifications 에 'entry_unshared' INSERT.
--   클라이언트 listener (notifications.js) 가 이 알림 받으면 Dexie entries row 갱신 + 사이드바 refresh.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function today_notify_entry_unshared()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner uuid;
begin
  select partner_user_id into v_partner
    from today_profiles
   where user_id = new.owner_id;

  if v_partner is null then
    return new;
  end if;

  insert into today_notifications (recipient_id, kind, entry_id, preview)
  values (v_partner, 'entry_unshared', new.id, '');

  return new;
end;
$$;

drop trigger if exists today_notify_entry_unshared_update on today_entries;
create trigger today_notify_entry_unshared_update
  after update on today_entries
  for each row
  when (old.is_shared = true and new.is_shared = false and new.deleted_at is null)
  execute function today_notify_entry_unshared();
