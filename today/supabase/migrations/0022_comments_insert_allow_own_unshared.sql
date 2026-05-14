-- 본인 글에는 is_shared 무관 댓글 INSERT 허용 (클라이언트 정책과 일치).
-- 배경: src/features/comments.js:230 (2026-05-13 변경) 가 본인 글이면 is_shared 무관
-- 댓글 작성을 허용 → 원래 RLS INSERT 정책 (0001_init.sql:242) 의 entry.is_shared=true
-- 강제와 불일치 → 본인 비공유 글 댓글 작성 시 42501 → outbox 영구 재시도.
-- 추가: deleted_at IS NULL 명시로 삭제된 entry 의 댓글 INSERT 차단.

drop policy if exists today_comments_insert on today_comments;
create policy today_comments_insert on today_comments for insert with check (
  author_id = auth.uid()
  and exists (
    select 1 from today_entries e
    where e.id = entry_id
      and e.deleted_at is null
      and (e.is_shared = true or e.owner_id = auth.uid())
  )
);
