-- taste 0003 — 추천 자동 재생성 트리거 (Today 0024/0025 미러).
-- 비싼 LLM(Routine)은 taste_has_pending_reco()=true 일 때만 발사. 빈 체크는 인덱스 SELECT(사실상 무료).
--
-- 트리거 정리:
--   (a) 주1회 정기 cron — 검증된 길에 가장 가까움(시간 기반). 변경 있을 때만 발사.
--   (b) [STAGED] 변경감지 5분 cron — 별점 변경 settle 후 즉시 재생성(§7 완전자동). ① 버튼·수동 검증 후 활성.
--   + 버튼 트리거는 edge fn request-taste-reco (이 파일과 무관, 가장 검증된 경로).
-- ⚠ Today 에서도 pg_cron 자동발화(0025)는 프로덕션 미적용/미검증으로 남았음 → cron 경로는 적용 후 실측 필수.
--
-- prerequisites: pg_cron/pg_net 활성 + Vault 시크릿(geo routine 생성 후 설정):
--   taste_routine_fire_url      = https://api.anthropic.com/v1/claude_code/routines/<TASTE_ROUTINE_ID>/fire
--   taste_routine_trigger_token = <bearer token>
-- (Today 의 routine_fire_url / routine_trigger_token 과 별도 이름 — 다른 routine 이므로 절대 공유 금지.)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 재생성 필요 owner 가 하나라도 있나? (logic.js pendingOwners 의 SQL 미러: settle 15분.)
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
    where r.max_rated < now() - interval '15 minutes'          -- settle (벌크 변경 멎은 뒤)
      and (g.max_reco is null or r.max_rated > g.max_reco)      -- 콜드스타트 또는 평가가 추천보다 최신
  );
$$;

-- (a) 주1회 정기 재생성 — 일요일 01:07 UTC(= 10:07 KST). 변경 있을 때만 발사.
do $$ begin perform cron.unschedule('taste-weekly-reco'); exception when others then null; end $$;
select cron.schedule(
  'taste-weekly-reco',
  '7 1 * * 0',
  $cron$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'taste_routine_fire_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'taste_routine_trigger_token'),
        'anthropic-version', '2023-06-01',
        'anthropic-beta', 'experimental-cc-routine-2026-04-01'
      ),
      body    := jsonb_build_object('text', '정기 스캔: taste 추천 재생성')
    )
    where taste_has_pending_reco();
  $cron$
);

-- (b) [STAGED — ① 버튼/수동 검증 후 아래 주석 해제] 변경감지 5분 cron — 별점 변경 settle 후 즉시 재생성(§7).
-- do $$ begin perform cron.unschedule('taste-reco-debounce'); exception when others then null; end $$;
-- select cron.schedule(
--   'taste-reco-debounce',
--   '*/5 * * * *',
--   $cron$
--     select net.http_post(
--       url     := (select decrypted_secret from vault.decrypted_secrets where name = 'taste_routine_fire_url'),
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'taste_routine_trigger_token'),
--         'anthropic-version', '2023-06-01',
--         'anthropic-beta', 'experimental-cc-routine-2026-04-01'
--       ),
--       body    := jsonb_build_object('text', '변경감지 스캔: taste 추천 재생성')
--     )
--     where taste_has_pending_reco();
--   $cron$
-- );

-- 롤백: select cron.unschedule('taste-weekly-reco');  [+ 'taste-reco-debounce' if activated]
