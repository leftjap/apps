-- 리더 앱 접근 계층 (2026-07-11): 허용 이메일 읽기 + 사용자별 저장·읽음 상태
-- 허용 이메일 = study ALLOWED_EMAILS 와 동일 (기존 앱 패턴)

create policy "best_posts_read_allowed" on best_posts
  for select to authenticated
  using ((auth.jwt() ->> 'email') in ('leftjap@gmail.com', 'soyoun312@gmail.com'));

-- 푸터 "오늘 HH:MM 수집" 표시용 — 수집 시각(시분)은 로그의 created_at 에서
alter table best_ingest_log add column created_at timestamptz not null default now();

create policy "best_ingest_log_read_allowed" on best_ingest_log
  for select to authenticated
  using ((auth.jwt() ->> 'email') in ('leftjap@gmail.com', 'soyoun312@gmail.com'));

-- 사용자별 저장(북마크)·읽음 상태. 계정 동기화 (작업지시서 §3·§9)
create table best_user_state (
  user_id  uuid not null references auth.users(id) on delete cascade,
  post_id  bigint not null references best_posts(id) on delete cascade,
  saved    boolean not null default false,
  saved_at timestamptz,
  read_at  timestamptz,
  primary key (user_id, post_id)
);

alter table best_user_state enable row level security;

create policy "best_user_state_owner" on best_user_state
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
