-- 0011 — production user partner_user_id 매핑 + display_name 정정.
--
-- 결함: ensureProfile 이 신규 row insert 시 partner_user_id NULL → RLS L278-282 가
--       partner.is_shared 글 차단 → 사이드바 navi 합집합 (spec L127-129) 무력화.
--       추가 결함: 소연 row 의 display_name 이 OAuth user_metadata 추출 잘못으로 '지오' 로 set.
-- production 은 이미 ad-hoc 으로 fix 적용됨 (2026-05-05). 다른 환경 (dev / staging) 용 박제.
--
-- 사용자 매핑 (2026-05-05 박제):
--   leftjap@gmail.com           7bae5645-61c6-4476-9ff2-4c30a72812ff  → partner=소연, '지오'
--   causencompany@gmail.com     9f0408c0-008b-440c-a938-2effd9cb3bfd  → partner=소연, '지오' (alt)
--   soyoun312@gmail.com         aeafd9a7-4094-4e7c-a621-188d6b2e336d  → partner=지오, '소연'
--
-- WHERE 절로 idempotent (이미 set 된 row 건드리지 않음).
-- 다른 dev DB 의 user_id 가 다르면 매칭 0건 → 안전 (application ensureProfile 이 email 기반 자동 처리).

-- 지오 → partner=소연
UPDATE today_profiles
SET partner_user_id = 'aeafd9a7-4094-4e7c-a621-188d6b2e336d'
WHERE user_id = '7bae5645-61c6-4476-9ff2-4c30a72812ff'
  AND partner_user_id IS NULL;

-- 코즈앤컴퍼니 (지오 alt) → partner=소연
UPDATE today_profiles
SET partner_user_id = 'aeafd9a7-4094-4e7c-a621-188d6b2e336d'
WHERE user_id = '9f0408c0-008b-440c-a938-2effd9cb3bfd'
  AND partner_user_id IS NULL;

-- 소연 → partner=지오
UPDATE today_profiles
SET partner_user_id = '7bae5645-61c6-4476-9ff2-4c30a72812ff'
WHERE user_id = 'aeafd9a7-4094-4e7c-a621-188d6b2e336d'
  AND partner_user_id IS NULL;

-- 소연 display_name 정정 ('지오' 잘못 set 된 경우만)
UPDATE today_profiles
SET display_name = '소연'
WHERE user_id = 'aeafd9a7-4094-4e7c-a621-188d6b2e336d'
  AND display_name = '지오';
