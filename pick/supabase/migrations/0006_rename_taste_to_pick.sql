-- pick 0006 — 앱명 Pick 정착에 따라 taste_* 테이블을 pick_* 로 리네임 (2026-06-10).
-- 적용: Management API database/query 로 라이브 실행 완료 (이 파일은 원장 기록).
--
-- 구 번들 호환: 배포 전환 윈도우 동안 열린 옛 클라이언트를 위해 taste_* 이름의
-- security_invoker 뷰를 남김 (RLS 는 base 테이블 정책이 호출자 권한으로 적용).
--   - 읽기·insert·update·delete·upsert(ON CONFLICT) 전부 통과 — 실측: 뷰 경유 on_conflict=id
--     upsert 가 INSERT 201·UPDATE 200 (PG 가 auto-updatable 뷰의 ON CONFLICT 를 base 제약으로 해석)
--   - realtime: publication 은 OID 추종이라 pick_* 이름으로 발화 — 옛 채널 필터만 미수신 (수용)
-- 뷰 제거는 모든 기기가 새 번들로 넘어간 뒤 별도 마이그레이션으로.
--
-- 참고: 인덱스·제약 이름은 taste_* prefix 그대로 둠 (기능 무관, 코드는 제약명 미참조 —
-- sync reconcile 은 SQLSTATE 23505 만 사용).

begin;

alter table public.taste_profiles        rename to pick_profiles;
alter table public.taste_ratings         rename to pick_ratings;
alter table public.taste_recommendations rename to pick_recommendations;
alter table public.taste_reco_requests   rename to pick_reco_requests;

create view public.taste_profiles        with (security_invoker=true) as select * from public.pick_profiles;
create view public.taste_ratings         with (security_invoker=true) as select * from public.pick_ratings;
create view public.taste_recommendations with (security_invoker=true) as select * from public.pick_recommendations;
create view public.taste_reco_requests   with (security_invoker=true) as select * from public.pick_reco_requests;

grant select, insert, update, delete
  on public.taste_profiles, public.taste_ratings, public.taste_recommendations, public.taste_reco_requests
  to anon, authenticated;

commit;
