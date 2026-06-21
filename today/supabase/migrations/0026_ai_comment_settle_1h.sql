-- 0026 — 자동 댓글 settle 연장: 10분 → 1시간 (사용자 요청 2026-06-21).
--
-- 배경: 글 작성 후 너무 이르게(10분) 클로드 댓글이 달려, 정착(무변동) 시간을 1시간으로 늘린다.
--   today_ai_has_pending() 의 (a) 신규글 settle 절만 '10 minutes' → '1 hour' 로 교체.
--   (b) 대댓글 절은 settle gate 없음(사람 댓글엔 즉시 응답) — 그대로 유지.
-- 함수 본문은 0025 와 동일, settle 간격만 변경. cron 스케줄(*/3, ai-navi-comment-debounce)은 건드리지 않음.
--
-- 동기화: 로컬 realtime 데몬(scripts/navi-realtime-daemon.mjs)의 SETTLE_MS 도 같은 커밋에서 1시간으로 변경됨.

create or replace function today_ai_has_pending()
returns boolean
language sql
security definer
set search_path = public
as $$
  with claude as (select 'f74a3d8a-f449-4c25-82d1-509dc70a9988'::uuid as id)
  select
    -- (a) 신규: 공유 navi 글 · 본문 有 · 최근(now-3d) · settle(now-1h) · 클로드 댓글 없음
    exists (
      select 1 from today_entries e, claude
      where e.kind in ('navi','soyoun_navi')
        and e.deleted_at is null
        and e.is_shared = true
        and coalesce(e.content,'') <> ''
        and e.created_at >= now() - interval '3 days'
        and e.updated_at < now() - interval '1 hour'
        and not exists (
          select 1 from today_comments c
          where c.entry_id = e.id and c.author_id = claude.id and c.deleted_at is null
        )
    )
    or
    -- (b) 대댓글: 클로드 댓글 있고, 가장 최근 댓글이 사람(=클로드 차례) — settle 무관(즉시 응답)
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

-- 롤백: 0025_ai_comment_debounce.sql 의 함수 정의(settle 10분) 재적용.
