/**
 * Gym 운동 마스터 데이터 (spec §11).
 *
 * BUILTIN_EXERCISES — 약 40종 기본 운동. 사용자 환경에서 마이그레이션 없이 코드 배포만으로
 * 갱신되는 정적 카탈로그. 사용자 추가 운동은 customExercises 스토어 (queries.js).
 *
 * 부위(part): chest / back / shoulder / legs / arms / cardio
 * 장비(equipment): barbell / dumbbell / machine / cable / bodyweight / cardio
 *
 * 중량 증감: equipment 로 결정 (INCREMENT[equipment])
 *   - barbell·machine·cable: 5kg
 *   - dumbbell: 2kg (편측 → 양손 합산 4kg)
 *   - bodyweight·cardio: 0 (중량 입력 없음)
 *
 * MET (Metabolic Equivalent of Task) — 칼로리 추정 (spec §7-3):
 *   total_kcal = MET × 체중(kg) × 시간(시) × 1.05
 */

export const PARTS = Object.freeze({
  chest: '가슴',
  back: '등',
  shoulder: '어깨',
  legs: '하체',
  arms: '팔',
  cardio: '맨몸', // 표시명만 변경 (key 'cardio' 는 DB tags 저장값이라 유지 — 사용자 결정 2026-06-10)
});

export const PART_IDS = Object.freeze(Object.keys(PARTS));

export const INCREMENT = Object.freeze({
  barbell: 5,
  dumbbell: 2,
  machine: 5,
  cable: 5,
  bodyweight: 0,
  cardio: 0,
});

/**
 * 기본 운동 카탈로그. id 는 영문 snake_case (안정적 PK), name 은 한국어 표시명.
 * defaultSets·Reps·Weight 는 §6-3-3 프리셋 우선순위의 최후 fallback.
 * met 는 ACSM/Compendium 근거 근사값 (정확도 < 5% 오차).
 */
export const BUILTIN_EXERCISES = Object.freeze([
  // chest (6)
  { id: 'bench_press',     name: '벤치프레스',       part: 'chest',    equipment: 'barbell',   defaultSets: 5, defaultReps: 10, defaultWeight: 60, met: 5.0 },
  { id: 'incline_bench',   name: '인클라인 벤치',     part: 'chest',    equipment: 'barbell',   defaultSets: 4, defaultReps: 10, defaultWeight: 45, met: 5.0 },
  { id: 'decline_bench',   name: '디클라인 벤치',     part: 'chest',    equipment: 'barbell',   defaultSets: 4, defaultReps: 10, defaultWeight: 50, met: 5.0 },
  { id: 'dumbbell_fly',    name: '덤벨 플라이',       part: 'chest',    equipment: 'dumbbell',  defaultSets: 3, defaultReps: 12, defaultWeight: 18, met: 4.5 },
  { id: 'cable_crossover', name: '케이블 크로스오버',  part: 'chest',    equipment: 'cable',     defaultSets: 3, defaultReps: 12, defaultWeight: 20, met: 4.0 },
  { id: 'push_up',         name: '푸시업',           part: 'chest',    equipment: 'bodyweight', defaultSets: 3, defaultReps: 15, defaultWeight: 0,  met: 3.8 },

  // back (10)
  { id: 'deadlift',          name: '데드리프트',     part: 'back',     equipment: 'barbell',   defaultSets: 4, defaultReps: 8,  defaultWeight: 90, met: 6.0 },
  { id: 'romanian_deadlift', name: '루마니안 데드리프트', part: 'back',  equipment: 'barbell',   defaultSets: 4, defaultReps: 10, defaultWeight: 70, met: 6.0 },
  { id: 'barbell_row',       name: '바벨 로우',     part: 'back',     equipment: 'barbell',   defaultSets: 5, defaultReps: 10, defaultWeight: 55, met: 5.0 },
  { id: 'dumbbell_row',      name: '덤벨 로우',     part: 'back',     equipment: 'dumbbell',  defaultSets: 4, defaultReps: 10, defaultWeight: 22, met: 4.5 },
  { id: 'seated_row',        name: '시티드 로우',   part: 'back',     equipment: 'machine',   defaultSets: 4, defaultReps: 10, defaultWeight: 50, met: 4.5 },
  { id: 'cable_row',         name: '케이블 로우',   part: 'back',     equipment: 'cable',     defaultSets: 4, defaultReps: 10, defaultWeight: 45, met: 4.5 },
  { id: 't_bar_row',         name: '티바 로우',     part: 'back',     equipment: 'barbell',   defaultSets: 4, defaultReps: 10, defaultWeight: 40, met: 5.0 },
  { id: 'pull_up',           name: '풀업',         part: 'back',     equipment: 'bodyweight', defaultSets: 3, defaultReps: 8,  defaultWeight: 0,  met: 6.0 },
  { id: 'chin_up',           name: '친업',         part: 'back',     equipment: 'bodyweight', defaultSets: 3, defaultReps: 8,  defaultWeight: 0,  met: 6.0 },
  { id: 'lat_pulldown',      name: '랫 풀다운',     part: 'back',     equipment: 'cable',     defaultSets: 4, defaultReps: 10, defaultWeight: 50, met: 4.5 },

  // shoulder (5)
  { id: 'shoulder_press',  name: '숄더 프레스',    part: 'shoulder', equipment: 'barbell',   defaultSets: 4, defaultReps: 10, defaultWeight: 30, met: 4.5 },
  { id: 'military_press',  name: '밀리터리 프레스', part: 'shoulder', equipment: 'barbell',   defaultSets: 4, defaultReps: 8,  defaultWeight: 35, met: 4.5 },
  { id: 'side_lateral',    name: '사이드 레터럴',  part: 'shoulder', equipment: 'dumbbell',  defaultSets: 3, defaultReps: 12, defaultWeight: 8,  met: 3.5 },
  { id: 'front_raise',     name: '프론트 레이즈',  part: 'shoulder', equipment: 'dumbbell',  defaultSets: 3, defaultReps: 12, defaultWeight: 8,  met: 3.5 },
  { id: 'rear_lateral',    name: '리어 레터럴',    part: 'shoulder', equipment: 'dumbbell',  defaultSets: 3, defaultReps: 12, defaultWeight: 8,  met: 3.5 },

  // legs (8)
  { id: 'squat',           name: '스쿼트',         part: 'legs',     equipment: 'barbell',   defaultSets: 5, defaultReps: 10, defaultWeight: 70, met: 5.5 },
  { id: 'lunge',           name: '런지',           part: 'legs',     equipment: 'dumbbell',  defaultSets: 3, defaultReps: 12, defaultWeight: 14, met: 5.0 },
  { id: 'leg_press',       name: '레그 프레스',    part: 'legs',     equipment: 'machine',   defaultSets: 4, defaultReps: 10, defaultWeight: 100, met: 5.0 },
  { id: 'hip_thrust',      name: '힙 쓰러스트',    part: 'legs',     equipment: 'barbell',   defaultSets: 4, defaultReps: 10, defaultWeight: 60, met: 5.0 },
  { id: 'leg_extension',   name: '레그 익스텐션',  part: 'legs',     equipment: 'machine',   defaultSets: 3, defaultReps: 12, defaultWeight: 35, met: 4.0 },
  { id: 'leg_curl',        name: '레그 컬',       part: 'legs',     equipment: 'machine',   defaultSets: 3, defaultReps: 12, defaultWeight: 30, met: 4.0 },
  { id: 'calf_raise',      name: '카프 레이즈',    part: 'legs',     equipment: 'machine',   defaultSets: 4, defaultReps: 15, defaultWeight: 50, met: 3.5 },

  // arms (8)
  { id: 'bicep_curl',       name: '바벨 컬',         part: 'arms',     equipment: 'barbell',   defaultSets: 4, defaultReps: 10, defaultWeight: 25, met: 3.5 },
  { id: 'hammer_curl',      name: '해머 컬',         part: 'arms',     equipment: 'dumbbell',  defaultSets: 3, defaultReps: 12, defaultWeight: 14, met: 3.5 },
  { id: 'dumbbell_curl',    name: '덤벨 컬',         part: 'arms',     equipment: 'dumbbell',  defaultSets: 4, defaultReps: 10, defaultWeight: 16, met: 3.5 },
  { id: 'cable_curl',       name: '케이블 컬',       part: 'arms',     equipment: 'cable',     defaultSets: 3, defaultReps: 12, defaultWeight: 25, met: 3.5 },
  { id: 'tricep_extension', name: '트라이셉 익스텐션', part: 'arms',     equipment: 'dumbbell',  defaultSets: 3, defaultReps: 12, defaultWeight: 12, met: 3.5 },
  { id: 'tricep_pushdown',  name: '트라이셉 푸시다운', part: 'arms',     equipment: 'cable',     defaultSets: 4, defaultReps: 12, defaultWeight: 25, met: 3.5 },
  { id: 'dips',             name: '딥스',            part: 'arms',     equipment: 'bodyweight', defaultSets: 3, defaultReps: 10, defaultWeight: 0,  met: 5.0 },
  { id: 'wrist_curl',       name: '리스트 컬',       part: 'arms',     equipment: 'dumbbell',  defaultSets: 3, defaultReps: 15, defaultWeight: 5,  met: 3.0 },

  // cardio (5) — 사이클 머신·맨몸 코어 운동 (사용자 분류 결정 — abs part 미정의로 cardio 묶음)
  { id: 'treadmill',           name: '트레드밀',         part: 'cardio',   equipment: 'cardio',    defaultSets: 1, defaultReps: 0,  defaultWeight: 0, met: 7.0 },
  { id: 'cycle',               name: '사이클',           part: 'cardio',   equipment: 'cardio',    defaultSets: 1, defaultReps: 0,  defaultWeight: 0, met: 6.5 },
  { id: 'elliptical',          name: '엘립티컬',         part: 'cardio',   equipment: 'cardio',    defaultSets: 1, defaultReps: 0,  defaultWeight: 0, met: 5.0 },
  { id: 'hanging_leg_raise',   name: '행잉 레그 레이즈', part: 'cardio',   equipment: 'bodyweight', defaultSets: 3, defaultReps: 12, defaultWeight: 0, met: 4.0 },
  { id: 'decline_situp',       name: '디클라인 싯업',    part: 'cardio',   equipment: 'bodyweight', defaultSets: 3, defaultReps: 15, defaultWeight: 0, met: 4.0 },
]);

/** equipment 별 weightIncrement 자동 부여 (spec §11) */
export function getIncrementForEquipment(equipment) {
  return INCREMENT[equipment] ?? 0;
}

/** 빌트인 운동 id → 객체 (weightIncrement 자동 합성) */
export function getBuiltinExercise(id) {
  const ex = BUILTIN_EXERCISES.find(e => e.id === id);
  if (!ex) return null;
  return { ...ex, weightIncrement: getIncrementForEquipment(ex.equipment) };
}

/** 빌트인 운동 부위별 필터 (정의 순서 유지) */
export function listBuiltinByPart(part) {
  return BUILTIN_EXERCISES
    .filter(e => e.part === part)
    .map(e => ({ ...e, weightIncrement: getIncrementForEquipment(e.equipment) }));
}

/** 모든 빌트인 운동 (weightIncrement 합성) */
export function listAllBuiltin() {
  return BUILTIN_EXERCISES.map(e => ({
    ...e,
    weightIncrement: getIncrementForEquipment(e.equipment),
  }));
}

/* ───────── 커스텀 운동 이름 캐시 (동기 resolveExerciseName 용) ─────────
 * 렌더 경로(session/home/summary/stats)는 block.exerciseId 만 들고 있고 이름은
 * 동기로 풀어야 하는데, 커스텀 운동(cust_*)은 Dexie(비동기) customExercises 에만 있어
 * 빌트인 카탈로그만으론 못 푼다 → id(cust_...)가 그대로 화면에 노출되던 버그.
 * 각 view mount 에서 primeCustomExerciseCache(await listCustomExercises()) 로 채워 해소. */
const _customExerciseCache = new Map();

/** 커스텀 운동 목록으로 동기 lookup 캐시 갱신 (mount 시 호출). */
export function primeCustomExerciseCache(list) {
  _customExerciseCache.clear();
  for (const ex of (Array.isArray(list) ? list : [])) {
    if (ex && ex.id) _customExerciseCache.set(ex.id, ex);
  }
}

/** 캐시된 커스텀 운동 객체 (없으면 null) — equipment 등 부가정보 동기 조회용. */
export function getCachedCustomExercise(id) {
  return id ? (_customExerciseCache.get(id) || null) : null;
}

/** 운동 id → 표시명. builtin → 커스텀 캐시 → id fallback. 동기. */
export function resolveExerciseName(id) {
  if (!id) return '';
  const builtin = getBuiltinExercise(id);
  if (builtin?.name) return builtin.name;
  const custom = _customExerciseCache.get(id);
  if (custom?.name) return custom.name;
  return id;
}

/* mocks 허브 inline script 접근용 — Wave 11.6 의 window.gymQueries 패턴 답습 */
if (typeof window !== 'undefined') {
  window.gymExercises = {
    PARTS,
    PART_IDS,
    INCREMENT,
    BUILTIN_EXERCISES,
    getIncrementForEquipment,
    getBuiltinExercise,
    listBuiltinByPart,
    listAllBuiltin,
    primeCustomExerciseCache,
    getCachedCustomExercise,
    resolveExerciseName,
  };
}
