-- 0030 — 새 글 Web Push: 클로드 자동댓글(=글 완성 신호) 시점에 파트너에게 발사.
--
-- 설계 (사용자 결정 2026-07-16):
--   - new_post 알림 row 는 글 작성 시작 직후(자동저장 INSERT) 생기므로 그 시점 푸시는 미완성 글 알림.
--   - 대신 "클로드 자동댓글이 달림"(공유 navi 글 · settle 후 · ai-navi cron)을 완성 신호로 사용 —
--     클로드의 **첫** 댓글 INSERT 시 파트너의 기존 new_post 알림 row(0013 이 preview 최신화)를
--     send-push 로 POST. 대댓글(2번째 이후 클로드 댓글)은 재발사하지 않음.
--   - 사람 댓글 푸시는 0029(웹훅, kind=new_comment 즉시)가 담당 — 본 트리거와 무관.
--   - 인증: 0029 와 동일 — Vault('push_webhook_secret') 를 X-Push-Secret 헤더로.

create or replace function today_push_new_post_after_ai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claude constant uuid := 'f74a3d8a-f449-4c25-82d1-509dc70a9988';
  v_secret  text;
  v_entry   today_entries%rowtype;
  v_partner uuid;
  v_notif   today_notifications%rowtype;
begin
  -- 첫 클로드 댓글만 (방금 INSERT 된 자신 포함 1건이어야 함) — 대댓글 재발사 방지.
  if (select count(*) from today_comments
       where entry_id = new.entry_id and author_id = v_claude and deleted_at is null) <> 1 then
    return new;
  end if;

  select * into v_entry from today_entries where id = new.entry_id;
  if not found or v_entry.deleted_at is not null or v_entry.is_shared is not true
     or v_entry.kind not in ('navi', 'soyoun_navi') then
    return new;
  end if;

  select partner_user_id into v_partner from today_profiles where user_id = v_entry.owner_id;
  if v_partner is null then
    return new;
  end if;

  -- 파트너 수신 new_post 알림 (0002 가 INSERT, 0013 이 preview 동기화) — 없으면 보낼 것 없음.
  select * into v_notif from today_notifications
   where entry_id = new.entry_id and kind = 'new_post' and recipient_id = v_partner
   order by created_at desc
   limit 1;
  if not found then
    return new;
  end if;

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
      'record', to_jsonb(v_notif)
    )
  );
  return new;
end;
$$;

drop trigger if exists today_push_new_post_after_ai_insert on today_comments;
create trigger today_push_new_post_after_ai_insert
  after insert on today_comments
  for each row
  when (new.author_id = 'f74a3d8a-f449-4c25-82d1-509dc70a9988')
  execute function today_push_new_post_after_ai();
