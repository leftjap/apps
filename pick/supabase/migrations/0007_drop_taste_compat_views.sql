-- pick 0007 — 0006 의 taste_* 호환 뷰 제거 (2026-06-10, 0006 과 같은 날 마무리).
-- 적용: Management API database/query 로 라이브 실행 (이 파일은 원장 기록).
--
-- 전제 검증 노트: "모든 기기가 새 번들로 전환"은 원격 검증 불가(logs API 무응답)였으나,
-- 구 번들의 강등 경로가 코드로 확인됨 — pullTable 은 error 시 조용히 스킵(로컬 Dexie 로 동작),
-- pushRating 은 비-23505 에러 시 pending 유지 → 다음 방문 때 SW autoUpdate 로 새 번들 전환 후
-- 자동 재동기화. 데이터 유실 경로 없음 (일시 동기화 정지만 감수).

begin;

drop view if exists public.taste_profiles;
drop view if exists public.taste_ratings;
drop view if exists public.taste_recommendations;
drop view if exists public.taste_reco_requests;

commit;
