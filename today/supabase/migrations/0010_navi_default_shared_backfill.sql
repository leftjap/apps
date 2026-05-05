-- 0010 — 오늘의 네비 (navi/soyoun_navi) is_shared default 정책 전환 백필.
--
-- 사용자 결정 (2026-05-04): "오늘의 네비의 모든 글은 공유가 기본값".
-- 이전 정책: 모든 글 is_shared default false (DB column default).
-- 신규 정책: navi/soyoun_navi 만 application layer (createEntry / import-keep-data) 가 default true.
-- 다른 kind (fiction / blog / memo) 는 기존대로 default false (column default 그대로).
--
-- 본 migration: 정책 전환 시점 이전에 import 된 row 를 신규 정책으로 정합 (idempotent).
-- production 은 이미 ad-hoc 으로 적용됨 (2026-05-04). 다른 환경 (dev / staging / 신규 셋업) 용 박제.
-- WHERE is_shared=false 절로 idempotent — 재실행 시 0 row update.

UPDATE today_entries
SET is_shared = true,
    updated_at = now()
WHERE kind IN ('navi', 'soyoun_navi')
  AND is_shared = false
  AND deleted_at IS NULL;
