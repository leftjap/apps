-- ═══════════════════════════════════════════════════════════════════════════
-- Today — 0013_notify_preview_update.sql
-- 회귀 4 fix: today_notify_new_post() 가 INSERT 시 빈 content 로 발화 → preview="" 영구.
-- 해결: UPDATE trigger 가 content 변화 시 기존 알림 row 의 preview UPDATE.
--   - INSERT 시 (is_shared=true) → 기존처럼 새 알림 INSERT (preview 빈 값 가능)
--   - UPDATE 시 (is_shared 유지 + content 변화) → 가장 최근 new_post 알림 row 의 preview 만 갱신
--   - UPDATE 시 (false→true) → 기존 분기 그대로 (새 알림 INSERT)
-- ═══════════════════════════════════════════════════════════════════════════

-- new_post UPDATE preview sync — content 가 갱신되면 가장 최근 new_post 알림의 preview 도 갱신
create or replace function today_sync_post_preview()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- is_shared=true 유지 + content 변화만 처리 (false→true 는 기존 today_notify_new_post 가 처리)
  if new.is_shared = true
     and old.is_shared = true
     and coalesce(old.content, '') is distinct from coalesce(new.content, '')
     and new.deleted_at is null
  then
    update today_notifications
       set preview = left(coalesce(new.content, new.title, ''), 50)
     where entry_id = new.id
       and kind = 'new_post';
  end if;
  return new;
end;
$$;

drop trigger if exists today_sync_post_preview_update on today_entries;
create trigger today_sync_post_preview_update
  after update on today_entries
  for each row
  execute function today_sync_post_preview();

-- 기존 빈 preview 백필 — content 가 있는 entry 에 대해
update today_notifications n
   set preview = left(coalesce(e.content, e.title, ''), 50)
  from today_entries e
 where n.kind = 'new_post'
   and n.entry_id = e.id
   and (n.preview is null or n.preview = '')
   and coalesce(e.content, e.title, '') <> '';
