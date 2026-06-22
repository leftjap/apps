create table if not exists screentime_daily (
  owner_id   uuid not null references auth.users on delete cascade,
  date       date not null,
  kind       text not null,            -- 'app' (knowledgeC 번들) | 'site' (크롬 도메인)
  name       text not null,            -- 번들 id 또는 도메인
  seconds    integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (owner_id, date, kind, name)
);
alter table screentime_daily enable row level security;
create policy screentime_select on screentime_daily for select using (owner_id = auth.uid());
create policy screentime_write  on screentime_daily for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
