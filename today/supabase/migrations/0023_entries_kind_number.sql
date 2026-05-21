-- 글마다 고유 URL (#/navi/79) 위해 영구 일련번호 컬럼 추가.
-- 기존 동적 calc (computeEntryNumber) 가 삭제 시 번호 밀림 → 깨진 deep link 위험 해소.
--
-- 정책:
--  - owner_id + kind 별 시퀀스 (navi 와 soyoun_navi 별도 — DB 컬럼은 단순 kind 기준)
--  - 글 생성 시 max(kind_number) + 1 부여 (코드 측 createEntry 에서 처리)
--  - 글 삭제 시 번호 보존 (구멍 남음, deep link 안정성 우선)

ALTER TABLE today_entries
  ADD COLUMN IF NOT EXISTS kind_number INTEGER;

-- Backfill: 기존 글 owner_id + kind 별 created_at asc 순서로 1..N 부여 (deleted 포함 모두).
-- computeEntryNumber 가 deleted_at 제외하지만, 영구 번호는 삭제된 글에도 부여해야
-- 같은 번호가 재사용 안 됨 (구멍 보존).
WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY owner_id, kind
      ORDER BY created_at ASC, id ASC
    ) AS n
  FROM today_entries
)
UPDATE today_entries
SET kind_number = numbered.n
FROM numbered
WHERE today_entries.id = numbered.id
  AND today_entries.kind_number IS NULL;

-- lookup 인덱스 — (owner_id, kind, kind_number) deep link 조회용
CREATE INDEX IF NOT EXISTS today_entries_owner_kind_number_idx
  ON today_entries (owner_id, kind, kind_number);
