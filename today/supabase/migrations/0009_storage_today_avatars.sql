-- ═══════════════════════════════════════════════════════════════════════════
-- Today Wave 11.10 — 0009_storage_today_avatars.sql
-- Purpose: 사용자 카드 프로필 사진 업로드.
--   1) today_profiles.avatar_url text 컬럼 추가
--   2) Storage bucket 'today-avatars' (public read, owner-only write/delete)
--   3) RLS 4 정책 (insert/select/delete/update — 0008 today-entries 패턴 답습)
-- Path 규칙: {user_id}/avatar.{jpeg|png|webp} (고정명, upsert:true 로 덮어쓰기)
-- 클라이언트: src/services/profile.js Profile.uploadAvatar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) today_profiles.avatar_url 컬럼 추가
-- 본인+파트너 select 는 0007 의 today_profiles_select 가 자동 처리.
-- 본인 update 는 0001 의 today_profiles_update (with check user_id = auth.uid()) 가 처리.
-- ───────────────────────────────────────────────────────────────────────────

alter table today_profiles
  add column if not exists avatar_url text;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) bucket 생성 (public read, 1MB limit — 256x256 JPEG ≈ 30~80KB)
-- ───────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'today-avatars',
  'today-avatars',
  true,
  1048576,  -- 1MB per file (정사각 256px JPEG q=0.85 ≈ 30~80KB, 여유)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) RLS 정책 — INSERT (본인 폴더만)
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists today_avatars_insert on storage.objects;
create policy today_avatars_insert on storage.objects
  for insert
  with check (
    bucket_id = 'today-avatars'
    and auth.role() = 'authenticated'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 4) RLS 정책 — SELECT (public read — bucket public=true)
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists today_avatars_select on storage.objects;
create policy today_avatars_select on storage.objects
  for select
  using (bucket_id = 'today-avatars');

-- ───────────────────────────────────────────────────────────────────────────
-- 5) RLS 정책 — DELETE (본인 폴더만)
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists today_avatars_delete on storage.objects;
create policy today_avatars_delete on storage.objects
  for delete
  using (
    bucket_id = 'today-avatars'
    and auth.role() = 'authenticated'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 6) RLS 정책 — UPDATE (본인 폴더만, upsert:true 시 덮어쓰기 경로)
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists today_avatars_update on storage.objects;
create policy today_avatars_update on storage.objects
  for update
  using (
    bucket_id = 'today-avatars'
    and auth.role() = 'authenticated'
    and (auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'today-avatars'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 검증 쿼리 (수동)
--
-- 1) 컬럼 확인:
--    \d today_profiles
--    또는: select column_name from information_schema.columns
--          where table_name = 'today_profiles' and column_name = 'avatar_url';
--
-- 2) bucket 확인:
--    select id, public, file_size_limit, allowed_mime_types
--    from storage.buckets where id = 'today-avatars';
--
-- 3) 정책 확인 (4건):
--    select policyname, cmd from pg_policies
--    where tablename = 'objects' and policyname like 'today_avatars%';
--
-- 4) 클라이언트 검증 (Network 탭):
--    POST https://*.supabase.co/storage/v1/object/today-avatars/{user_id}/avatar.jpeg
--    → 200 OK (RLS 통과)
--    UPDATE https://*.supabase.co/rest/v1/today_profiles?user_id=eq.{uid}
--    body: { "avatar_url": "https://*.supabase.co/storage/v1/object/public/today-avatars/{user_id}/avatar.jpeg" }
--    → 200 OK
-- ═══════════════════════════════════════════════════════════════════════════
