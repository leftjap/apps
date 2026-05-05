-- ═══════════════════════════════════════════════════════════════════════════
-- Today Wave 11.8 — 0008_storage_today_entries.sql
-- Purpose: 본문 사진 첨부 phase 2 — Supabase Storage bucket + RLS 정책.
-- Bucket: 'today-entries' (public read, owner-only write/delete).
-- Path 규칙: {user_id}/{uuid}.{jpeg|png|webp}
-- 클라이언트: src/features/entries.js uploadImage helper.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) bucket 생성 (public read)
-- ───────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'today-entries',
  'today-entries',
  true,
  10485760,  -- 10MB per file (1600px JPEG q=0.8 일반 ≈ 150KB, 여유 충분)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) RLS 정책 — INSERT (본인 폴더만)
-- path 첫 segment = auth.uid() 인 경우만 업로드 허용
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists today_entries_insert on storage.objects;
create policy today_entries_insert on storage.objects
  for insert
  with check (
    bucket_id = 'today-entries'
    and auth.role() = 'authenticated'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 3) RLS 정책 — SELECT (public read)
-- bucket public=true 이므로 anon 도 읽기 가능. 명시적 정책으로 박제.
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists today_entries_select on storage.objects;
create policy today_entries_select on storage.objects
  for select
  using (bucket_id = 'today-entries');

-- ───────────────────────────────────────────────────────────────────────────
-- 4) RLS 정책 — DELETE (본인 폴더만)
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists today_entries_delete on storage.objects;
create policy today_entries_delete on storage.objects
  for delete
  using (
    bucket_id = 'today-entries'
    and auth.role() = 'authenticated'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 5) RLS 정책 — UPDATE (본인 폴더만, 메타데이터 변경 케이스)
-- 클라이언트는 upsert:false 로 호출하므로 일반 흐름엔 미사용. 안전 박제.
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists today_entries_update on storage.objects;
create policy today_entries_update on storage.objects
  for update
  using (
    bucket_id = 'today-entries'
    and auth.role() = 'authenticated'
    and (auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'today-entries'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 검증 쿼리 (수동)
--
-- 1) bucket 확인:
--    select id, public, file_size_limit, allowed_mime_types
--    from storage.buckets where id = 'today-entries';
--
-- 2) 정책 확인:
--    select policyname, cmd from pg_policies
--    where tablename = 'objects' and policyname like 'today_entries%';
--
-- 3) 클라이언트 검증 (Network 탭):
--    POST https://*.supabase.co/storage/v1/object/today-entries/{user_id}/{uuid}.jpeg
--    → 200 OK (RLS 통과)
-- ═══════════════════════════════════════════════════════════════════════════
