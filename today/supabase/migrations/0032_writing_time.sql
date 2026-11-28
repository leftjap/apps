-- ═══════════════════════════════════════════════════════════════════════════
-- Today — 0032_writing_time.sql
-- 글쓰기 시간. 기기마다 하루 한 행(user_id, day, device_id)에 그날 센 초를 누적한다.
-- 화면은 같은 날짜의 모든 기기 행을 더해 보여 준다 (src/features/writingTime.js).
-- 고칠 때 seconds 가 줄지 않게 트리거가 greatest 로 막는다 (오래된 기기 사본이 덮어쓰는 것 방지).
-- ═══════════════════════════════════════════════════════════════════════════

create table today_writing_time (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,                  -- 앱이 쓰는 로컬 날짜
  device_id text not null,            -- 기기마다 한 번 만들어 localStorage 에 둔 무작위 값
  seconds int not null default 0 check (seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day, device_id)
);

alter table today_writing_time enable row level security;

create policy "own select" on today_writing_time
  for select using (auth.uid() = user_id);
create policy "own insert" on today_writing_time
  for insert with check (auth.uid() = user_id);
create policy "own update" on today_writing_time
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own delete" on today_writing_time
  for delete using (auth.uid() = user_id);

create or replace function today_writing_time_keep_max()
returns trigger
language plpgsql
as $$
begin
  new.seconds := greatest(new.seconds, old.seconds);
  new.updated_at := now();
  return new;
end;
$$;

create trigger today_writing_time_keep_max_update
  before update on today_writing_time
  for each row
  execute function today_writing_time_keep_max();

-- realtime publication (다른 기기 시간 반영)
alter publication supabase_realtime add table today_writing_time;

-- 롤백: drop table today_writing_time cascade; drop function today_writing_time_keep_max();
