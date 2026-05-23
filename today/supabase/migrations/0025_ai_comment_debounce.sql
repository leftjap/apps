-- 0025 — 자동 댓글 디바운스 단축: cron 매시간→3분, settle 1h→10min.
--
-- 배경: 글은 자동저장(INSERT 후 매 수정 UPDATE)이라 즉시 댓글 = 초안에 댓글.
--   → "마지막 저장 후 N분 무변동(settle)" 후에만 댓글. 0024 의 1시간은 너무 길어 단축.
-- 비싼 LLM(Routine)은 today_ai_has_pending()=true 일 때만 발사. 빈 체크는 인덱스 SELECT(사실상 무료).
-- 변경점 vs 0024: settle 1h→10min, cron 0 * * * *→*/3, (a) 절에 is_shared=true 추가(비공유 글 제외).
--
-- prerequisites (0024 와 동일): pg_cron/pg_net 활성 + Vault 시크릿(routine_fire_url, routine_trigger_token).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 탐지 함수 재정의 (settle 10분 + is_shared 필터).
create or replace function today_ai_has_pending()
returns boolean
language sql
security definer
set search_path = public
as $$
  with claude as (select 'f74a3d8a-f449-4c25-82d1-509dc70a9988'::uuid as id)
  select
    -- (a) 신규: 공유 navi 글 · 본문 有 · 최근(now-3d) · settle(now-10min) · 클로드 댓글 없음
    exists (
      select 1 from today_entries e, claude
      where e.kind in ('navi','soyoun_navi')
        and e.deleted_at is null
        and e.is_shared = true
        and coalesce(e.content,'') <> ''
        and e.created_at >= now() - interval '3 days'
        and e.updated_at < now() - interval '10 minutes'
        and not exists (
          select 1 from today_comments c
          where c.entry_id = e.id and c.author_id = claude.id and c.deleted_at is null
        )
    )
    or
    -- (b) 대댓글: 클로드 댓글 있고, 가장 최근 댓글이 사람(=클로드 차례)
    exists (
      select 1 from today_entries e, claude
      where e.kind in ('navi','soyoun_navi') and e.deleted_at is null and e.is_shared = true
        and exists (
          select 1 from today_comments c
          where c.entry_id = e.id and c.author_id = claude.id and c.deleted_at is null
        )
        and (
          select c2.author_id from today_comments c2
          where c2.entry_id = e.id and c2.deleted_at is null
          order by c2.created_at desc limit 1
        ) <> claude.id
    );
$$;

-- 기존 매시간 잡 제거(없으면 무시) 후 3분 잡 재등록.
do $$
begin
  perform cron.unschedule('ai-navi-comment-hourly');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('ai-navi-comment-debounce');
exception when others then null;
end $$;

select cron.schedule(
  'ai-navi-comment-debounce',
  '*/3 * * * *',
  $cron$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'routine_fire_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'routine_trigger_token'),
        'anthropic-version', '2023-06-01',
        'anthropic-beta', 'experimental-cc-routine-2026-04-01'
      ),
      body    := jsonb_build_object('text', '정기 스캔: 오늘의 네비 클로드 자동 댓글')
    )
    where today_ai_has_pending();
  $cron$
);

-- 롤백: select cron.unschedule('ai-navi-comment-debounce'); (필요 시 0024 재적용)
