-- 0024 — 오늘의 네비 클로드 자동 댓글: 매시간 무료 탐지(Postgres) → 대상 있을 때만 Routine 발사.
--
-- 비용 설계: LLM(클로드)은 Routine 에서만 실행. 여기(pg_cron)는 "댓글 달 글 있나?"만 판별(무료).
--   대상 0건이면 net.http_post 자체를 호출하지 않음 → Routine 0회.
--
-- 적용 전 prerequisites (수동 — 배선 단계):
--   1) Supabase Dashboard 에서 pg_cron / pg_net 확장 활성 (아래 create extension 이 시도하나 권한에 따라 대시보드 필요).
--   2) Vault 시크릿 2개 등록 (Anthropic API 키 아님 — claude.ai/code/routines API 트리거 설정):
--        select vault.create_secret('https://api.anthropic.com/v1/claude_code/routines/<ROUTINE_ID>/fire', 'routine_fire_url');
--        select vault.create_secret('<per-routine bearer token>', 'routine_trigger_token');
--   3) Routine 생성(매시간/Opus 4.7, today/routines/ai-navi.md 프롬프트) 완료.
--
-- 미검증(research preview): routines-fire 의 정확한 URL/페이로드/인증 헤더는 배선 시 확정.
--   net.http_post body shape 이 다르면 아래 cron.schedule 본문만 조정.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ───────────────────────────────────────────────────────────────────────────
-- 탐지 함수 — 댓글 대상(신규 또는 대댓글)이 1건이라도 있으면 true.
-- (워커 ai-navi-comment.mjs 의 (a)(b) 로직과 동일 의미.)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function today_ai_has_pending()
returns boolean
language sql
security definer
set search_path = public
as $$
  with claude as (select 'f74a3d8a-f449-4c25-82d1-509dc70a9988'::uuid as id)
  select
    -- (a) 신규: navi 글 · 본문 有 · 최근(now-3d) · settled(now-1h) · 클로드 댓글 없음
    exists (
      select 1 from today_entries e, claude
      where e.kind in ('navi','soyoun_navi')
        and e.deleted_at is null
        and coalesce(e.content,'') <> ''
        and e.created_at >= now() - interval '3 days'
        and e.updated_at < now() - interval '1 hour'
        and not exists (
          select 1 from today_comments c
          where c.entry_id = e.id and c.author_id = claude.id and c.deleted_at is null
        )
    )
    or
    -- (b) 대댓글: 클로드 댓글이 이미 있고, 가장 최근 댓글이 사람(=클로드 차례)
    exists (
      select 1 from today_entries e, claude
      where e.kind in ('navi','soyoun_navi') and e.deleted_at is null
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

-- ───────────────────────────────────────────────────────────────────────────
-- 매시간 cron — 대상 있을 때만 routines-fire 발사.
-- ───────────────────────────────────────────────────────────────────────────
select cron.schedule(
  'ai-navi-comment-hourly',
  '0 * * * *',
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

-- 롤백: select cron.unschedule('ai-navi-comment-hourly'); drop function if exists today_ai_has_pending();
