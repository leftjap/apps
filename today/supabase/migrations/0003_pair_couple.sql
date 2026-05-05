-- ═══════════════════════════════════════════════════════════════════════════
-- Today Wave 11.4 — 0003_pair_couple.sql
-- 양쪽 사용자 (leftjap / soyoun312) 가 한 번씩 로그인해 today_profiles row 가
-- 양쪽 다 생성된 후 1회 실행. 양방향 partner_user_id 페어링.
-- 클라이언트에선 RLS 가 다른 사용자의 row 를 막아 페어링 불가 — admin 1회.
-- ═══════════════════════════════════════════════════════════════════════════

update today_profiles
   set partner_user_id = (
     select id from auth.users where lower(email) = 'soyoun312@gmail.com' limit 1
   )
 where user_id = (
   select id from auth.users where lower(email) = 'leftjap@gmail.com' limit 1
 );

update today_profiles
   set partner_user_id = (
     select id from auth.users where lower(email) = 'leftjap@gmail.com' limit 1
   )
 where user_id = (
   select id from auth.users where lower(email) = 'soyoun312@gmail.com' limit 1
 );

-- 검증: 두 행 모두 partner_user_id 채워졌는지
select user_id, display_name, partner_user_id is not null as paired
  from today_profiles
 order by display_name;
