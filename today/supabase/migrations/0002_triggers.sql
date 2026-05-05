-- ═══════════════════════════════════════════════════════════════════════════
-- Today Wave 11.3 — 0002_triggers.sql
-- Source: (deleted spec: today-app-spec.md) §11 (line 404-426)
-- 알림 자동 발행: entry 공유 전환·신규 공유 entry / 댓글 작성
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- notify_new_post() — entry owner 의 partner 에게 알림
-- ───────────────────────────────────────────────────────────────────────────

create or replace function today_notify_new_post()
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
  values (
    v_partner,
    'new_post',
    new.id,
    left(coalesce(new.content, new.title, ''), 50)
  );

  return new;
end;
$$;

create trigger today_notify_new_post_update
  after update on today_entries
  for each row
  when (old.is_shared = false and new.is_shared = true and new.deleted_at is null)
  execute function today_notify_new_post();

create trigger today_notify_new_post_insert
  after insert on today_entries
  for each row
  when (new.is_shared = true and new.deleted_at is null)
  execute function today_notify_new_post();

-- ───────────────────────────────────────────────────────────────────────────
-- notify_new_comment() — entry owner 에게 알림 (자기 댓글 제외)
-- ───────────────────────────────────────────────────────────────────────────

create or replace function today_notify_new_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
    from today_entries
   where id = new.entry_id;

  if v_owner is null or v_owner = new.author_id then
    return new;
  end if;

  insert into today_notifications (recipient_id, kind, entry_id, comment_id, preview)
  values (
    v_owner,
    'new_comment',
    new.entry_id,
    new.id,
    left(new.body, 50)
  );

  return new;
end;
$$;

create trigger today_notify_new_comment_insert
  after insert on today_comments
  for each row
  execute function today_notify_new_comment();
