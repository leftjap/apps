-- 0027 — 이모지 리액션: 공유 게시물(entry)·댓글(comment)에 👍 ❤️ 😄 등 긍정 리액션 (토글).
--
-- 설계:
--   - entry_id / comment_id 이중 타겟(둘 중 정확히 하나) — today_notifications 패턴 답습.
--   - 토글 유니크: 사용자당 (타겟, 이모지) 1개. nullable 타겟이라 부분 유니크 인덱스 2개.
--   - RLS: 가시성은 today_comments_select 와 동일하게 미러(본인 + 파트너 공유글). 삭제는 본인 리액션만.
--   - realtime: 상대 리액션 실시간 반영 (today_comments 와 동일 채널).

create table today_reactions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references today_entries on delete cascade,
  comment_id uuid references today_comments on delete cascade,
  author_id uuid not null references auth.users on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  -- entry_id / comment_id 정확히 하나만 non-null
  constraint today_reactions_one_target check (num_nonnulls(entry_id, comment_id) = 1)
);

-- 토글 유니크 (부분 인덱스) — 같은 사용자·타겟·이모지 중복 방지.
create unique index today_reactions_entry_uniq
  on today_reactions (author_id, entry_id, emoji) where entry_id is not null;
create unique index today_reactions_comment_uniq
  on today_reactions (author_id, comment_id, emoji) where comment_id is not null;

-- 조회 인덱스 (타겟별 리액션 집계).
create index today_reactions_entry on today_reactions (entry_id) where entry_id is not null;
create index today_reactions_comment on today_reactions (comment_id) where comment_id is not null;

alter table today_reactions enable row level security;

-- select — 타겟(entry 직접 또는 comment 의 entry)이 본인/파트너공유면 리액션도 보임.
create policy today_reactions_select on today_reactions for select using (
  (entry_id is not null and exists (
    select 1 from today_entries e where e.id = entry_id
      and (e.owner_id = auth.uid()
           or (e.is_shared = true and e.deleted_at is null and e.owner_id = today_partner_id()))
  ))
  or
  (comment_id is not null and exists (
    select 1 from today_comments c join today_entries e on e.id = c.entry_id
    where c.id = comment_id
      and (e.owner_id = auth.uid()
           or (e.is_shared = true and e.deleted_at is null and e.owner_id = today_partner_id()))
  ))
);

-- insert — 본인 리액션 + 타겟 가시 (select 와 동일 가시성).
create policy today_reactions_insert on today_reactions for insert with check (
  author_id = auth.uid()
  and (
    (entry_id is not null and exists (
      select 1 from today_entries e where e.id = entry_id
        and (e.owner_id = auth.uid()
             or (e.is_shared = true and e.deleted_at is null and e.owner_id = today_partner_id()))
    ))
    or
    (comment_id is not null and exists (
      select 1 from today_comments c join today_entries e on e.id = c.entry_id
      where c.id = comment_id
        and (e.owner_id = auth.uid()
             or (e.is_shared = true and e.deleted_at is null and e.owner_id = today_partner_id()))
    ))
  )
);

-- delete — 본인 리액션만 제거 (토글 오프).
create policy today_reactions_delete on today_reactions for delete using (
  author_id = auth.uid()
);

-- realtime publication (today_comments 와 동일).
alter publication supabase_realtime add table today_reactions;

-- 롤백: drop table today_reactions cascade; (publication 은 테이블 drop 시 자동 제거)
