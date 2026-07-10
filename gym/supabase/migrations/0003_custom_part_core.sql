-- 0003 — gym_custom_exercises.part CHECK 에 'core' 추가.
--
-- 배경: PWA PART_IDS 는 7종 (chest/back/legs/shoulder/arms/core/cardio, src/db/exercises.js PARTS)
-- 인데 0002 의 CHECK 는 core 를 빠뜨림 → 코어 부위 커스텀 운동이 서버 push 에서 거부되는 잠복 버그
-- (네이티브 정합화 세션 2026-07-10 발견, handoff §2).
--
-- 적용: Supabase Dashboard SQL Editor 에서 실행 (데이터 변경 없음 — 제약 교체만).

alter table public.gym_custom_exercises
  drop constraint if exists gym_custom_exercises_part_check;

alter table public.gym_custom_exercises
  add constraint gym_custom_exercises_part_check
  check (part in ('chest', 'back', 'legs', 'shoulder', 'arms', 'core', 'cardio'));

-- ============================================================
-- 적용 후 검증 쿼리 (따로 실행)
-- ============================================================
-- select pg_get_constraintdef(oid)
-- from pg_constraint
-- where conname = 'gym_custom_exercises_part_check';
-- 결과에 'core' 포함이어야 정상.
