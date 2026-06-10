-- taste 0003 — 추천 자동 재생성 트리거 (Today 0024/0025 미러).
-- Today 자동 댓글 방식 그대로: ① 버튼 = 즉시(request-taste-reco, 이 파일 무관)
--   ② pg_cron 이 몇 분마다 변경 감지 → 자동 재생성. (주1회 아님 — Today 는 */3분 디바운스.)
-- 비싼 LLM(Routine)은 taste_has_pending_reco()=true 일 때만 발사. 빈 체크는 인덱스 SELECT(사실상 무료).
--
-- prerequisites: pg_cron/pg_net 활성 + Vault 시크릿(routine 생성 후):
--   taste_routine_fire_url      = https://api.anthropic.com/v1/claude_code/routines/<TASTE_ROUTINE_ID>/fire
--   taste_routine_trigger_token = <bearer token>
-- (Today 의 routine_fire_url / routine_trigger_token 과 별도 이름 — 다른 routine 이므로 절대 공유 금지.)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 재생성 필요 owner 가 하나라도 있나? (logic.js pendingOwners 의 SQL 미러: settle 10분.)
create or replace function taste_has_pending_reco()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from (
      select owner_id, max(updated_at) as max_rated
      from taste_ratings
      where deleted_at is null
      group by owner_id
    ) r
    left join (
      select owner_id, max(generated_at) as max_reco
      from taste_recommendations
      group by owner_id
    ) g on g.owner_id = r.owner_id
    where r.max_rated < now() - interval '10 minutes'         -- settle (마지막 평가 후 10분 무변동 = 평가 묶음 끝남)
      and (g.max_reco is null or r.max_rated > g.max_reco)     -- 콜드스타트 또는 평가가 추천보다 최신
  );
$$;

-- 변경감지 자동발화 — 5분마다 스캔, 평가가 추천보다 최신이고 settle 지났으면 Routine 발사.
-- = "별점 매기면 (묶음 끝나고 ~5~15분 내) 자동으로 추천 갱신". 즉시 원하면 '다시 추천' 버튼.
do $$ begin perform cron.unschedule('taste-reco-autodetect'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('taste-weekly-reco'); exception when others then null; end $$;  -- 구 주1회 잡 제거
select cron.schedule(
  'taste-reco-autodetect',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'taste_routine_fire_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'taste_routine_trigger_token'),
        'anthropic-version', '2023-06-01',
        'anthropic-beta', 'experimental-cc-routine-2026-04-01'
      ),
      body    := jsonb_build_object('text', '변경감지: taste 추천 재생성')
    )
    where taste_has_pending_reco();
  $cron$
);

-- 롤백: select cron.unschedule('taste-reco-autodetect');
