-- ═══════════════════════════════════════════════════════════════════════════
-- Today hotfix — 0007_rls_recursion_fix.sql
-- Problem: today_profiles_select 정책이 today_profiles 를 자기참조 select →
--          PostgreSQL RLS 무한 재귀 → 500 에러 (entries/comments 도 연쇄).
-- Fix: today_partner_id() SECURITY DEFINER 함수로 RLS 우회 후 정책 단순화.
-- ═══════════════════════════════════════════════════════════════════════════

-- partner_user_id 조회 헬퍼 — auth.uid() 의 partner 만 반환.
-- security definer + search_path 지정으로 RLS 우회.
create or replace function today_partner_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select partner_user_id from today_profiles where user_id = auth.uid() limit 1
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- today_profiles_select — 자기참조 제거, 함수 사용
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists today_profiles_select on today_profiles;
create policy today_profiles_select on today_profiles for select using (
  user_id = auth.uid()
  or user_id = today_partner_id()
);

-- ───────────────────────────────────────────────────────────────────────────
-- today_entries_select — partner 조회를 함수로 대체
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists today_entries_select on today_entries;
create policy today_entries_select on today_entries for select using (
  owner_id = auth.uid()
  or (
    is_shared = true
    and deleted_at is null
    and owner_id = today_partner_id()
  )
);

-- ───────────────────────────────────────────────────────────────────────────
-- today_comments_select — entries 통한 partner 체크도 함수로 대체
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists today_comments_select on today_comments;
create policy today_comments_select on today_comments for select using (
  exists (
    select 1 from today_entries e
    where e.id = entry_id
      and (
        e.owner_id = auth.uid()
        or (
          e.is_shared = true
          and e.owner_id = today_partner_id()
        )
      )
  )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 검증 — 4개 select 정책이 today_profiles 자기참조 없이 재정의됐는지
-- ═══════════════════════════════════════════════════════════════════════════

select polname, polcmd
  from pg_policy
  join pg_class c on pg_policy.polrelid = c.oid
 where c.relname like 'today_%'
   and polname in (
     'today_profiles_select',
     'today_entries_select',
     'today_comments_select'
   )
 order by polname;
