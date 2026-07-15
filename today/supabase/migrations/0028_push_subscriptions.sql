-- 0028 — Web Push 구독 저장 (댓글 알림용).
--
-- 설계:
--   - 클라이언트가 pushManager.subscribe() 결과(endpoint + p256dh/auth 키)를 endpoint 기준 upsert.
--   - 사용자당 여러 기기(구독) 허용 → endpoint 유니크, user_id 인덱스로 수신자별 조회.
--   - RLS: owner-only (본인 구독만). send-push Edge Function 은 service_role 로 RLS 우회해 수신자 구독 조회.
--   - realtime 불필요(구독 데이터는 실시간 반영 대상 아님).

create table today_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index today_push_subscriptions_user on today_push_subscriptions (user_id);

alter table today_push_subscriptions enable row level security;

-- owner-only 4 정책 (auth.uid() = user_id).
create policy today_push_subscriptions_select on today_push_subscriptions
  for select using (user_id = auth.uid());
create policy today_push_subscriptions_insert on today_push_subscriptions
  for insert with check (user_id = auth.uid());
create policy today_push_subscriptions_update on today_push_subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy today_push_subscriptions_delete on today_push_subscriptions
  for delete using (user_id = auth.uid());
