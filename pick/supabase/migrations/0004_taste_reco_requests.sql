-- taste 0004 — 추천 재생성 요청 큐 (로컬 데몬 트리거).
-- "다시 추천" 버튼·새 평가가 여기 1줄 insert → 로컬 데몬이 realtime 으로 즉시 감지 → claude -p 로 재생성.
-- (Today navi-realtime-daemon 패턴 미러. 클라우드 루틴·Anthropic API 불필요 — 데몬이 구독 claude 로 생성.)
-- additive·비파괴. 재실행 안전(IF NOT EXISTS / 예외 무시).

create table if not exists taste_reco_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  source text not null default 'button' check (source in ('button','rating')),
  created_at timestamptz not null default now()
);
create index if not exists taste_reco_requests_owner_created on taste_reco_requests (owner_id, created_at);

alter table taste_reco_requests enable row level security;
-- 본인만 자기 요청 insert/조회 (데몬은 service role 로 RLS 우회해 전건 구독).
create policy taste_reco_requests_own on taste_reco_requests
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 데몬이 INSERT 를 즉시 감지하도록 realtime publication 추가. 이미 있으면 무시.
do $$
begin
  alter publication supabase_realtime add table taste_reco_requests;
exception when others then null;
end $$;
