-- 0012 — Keep partner-sync 잔흔 kind 정정 (owner ↔ kind 정합).
--
-- 결함 (2026-05-05 chrome-devtools 진단 박제):
--   import-keep-data.js 가 doc.type 그대로 보존 + cross-file dedup 잔흔으로
--   `owner=소연 + kind='navi'` 5건 (Keep 시대 양방향 sync 흔적) 가 production 에 존재.
--   사용자 화면 (지오 로그인) 에서 본인 글 5건 외에 잔흔 5건이 mine 으로 잘못 분류돼
--   라벨 없이 본인 글처럼 표시 (사용자 "삭제했던 글 부활" 보고).
--
-- 코드 fix (entries.js fetchEntriesForCategory + renderRecentsFromRows) 는 owner_id 기반으로
-- 정정해 화면에서는 정상 동작하지만, 데이터 모델 일관성을 위해 kind 도 정정.
--
-- 정정 정책 — owner 기준으로 owned navi kind 매칭:
--   leftjap (지오) / causencompany (지오 alt) → kind='navi'
--   소연 → kind='soyoun_navi'
--
-- production 의 Keep partner-sync 잔흔만 영향. WHERE 조건 idempotent.
-- 다른 dev DB 의 user_id 가 다르면 매칭 0건 (안전).

-- 소연 owner 인데 kind='navi' 인 잔흔 → 'soyoun_navi' 로 정정
UPDATE today_entries
SET kind = 'soyoun_navi'
WHERE owner_id = 'aeafd9a7-4094-4e7c-a621-188d6b2e336d'
  AND kind = 'navi';

-- 지오 / causencompany owner 인데 kind='soyoun_navi' 인 잔흔 → 'navi' 로 정정
UPDATE today_entries
SET kind = 'navi'
WHERE owner_id IN (
  '7bae5645-61c6-4476-9ff2-4c30a72812ff',
  '9f0408c0-008b-440c-a938-2effd9cb3bfd'
)
  AND kind = 'soyoun_navi';
