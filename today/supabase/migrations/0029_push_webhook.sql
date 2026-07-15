-- 0029 — 댓글 알림 Web Push 웹훅: today_notifications INSERT → send-push Edge Function.
--
-- 설계:
--   - today_notify_new_comment 이 넣는 kind='new_comment' row 에만 발동 → pg_net 으로 send-push POST.
--   - 인증: X-Push-Secret 헤더. 값은 Supabase Vault('push_webhook_secret')에서 읽는다 —
--     이 파일에 secret 을 넣지 않는다(공개 repo 안전). Vault 값은 배포 시 별도 주입.
--   - send-push 는 --no-verify-jwt 로 배포됨(웹훅은 Supabase JWT 미전송) → 이 헤더가 유일 관문.

create or replace function today_push_new_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'push_webhook_secret';

  if v_secret is null then
    raise warning 'push_webhook_secret 미설정 — send-push 호출 스킵';
    return new;
  end if;

  perform net.http_post(
    url := 'https://tcbooffrdacfatywdzcm.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Push-Secret', v_secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'today_notifications',
      'record', to_jsonb(new)
    )
  );
  return new;
end;
$$;

drop trigger if exists today_push_new_comment_insert on today_notifications;
create trigger today_push_new_comment_insert
  after insert on today_notifications
  for each row
  when (new.kind = 'new_comment')
  execute function today_push_new_comment();
