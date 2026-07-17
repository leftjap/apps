-- 0031 — 앱 아이콘 배지 카운트 기준점(badge_seen_at) 추가.
--
-- 배경: 배지 = "전체 미읽음 수"는 알림함을 안 비우는 사용 패턴에서 계속 자람
--   (2026-07-17 지오 실측: 어제 26 → 앱 열어 클리어 → 오늘 푸시에 27).
-- 변경: 클라(mountBadgeClear)가 앱 진입·포그라운드 복귀 시 badge_seen_at 을 기록,
--   send-push 는 이 시각 이후 생성된 미읽음만 배지로 센다.
--   NULL(미기록·구버전 클라)이면 기존처럼 전체 미읽음 fallback.
-- 본인 UPDATE 는 0001 의 today_profiles_update 정책(user_id = auth.uid())이 허용.

alter table today_profiles add column if not exists badge_seen_at timestamptz;
