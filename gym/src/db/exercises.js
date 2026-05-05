/**
 * Gym 운동 마스터 데이터 (spec §11 + §1 Clawd 포즈 매핑).
 *
 * BUILTIN_EXERCISES — 약 40종 기본 운동. 사용자 환경에서 마이그레이션 없이 코드 배포만으로
 * 갱신되는 정적 카탈로그. 사용자 추가 운동은 customExercises 스토어 (queries.js).
 *
 * 부위(part): chest / back / shoulder / legs / arms / cardio
 * 장비(equipment): barbell / dumbbell / machine / cable / bodyweight / cardio
 * 포즈(pose): idle / happy / rest / lift / press / curl / squat / row / pull / run
 *   - lift / press / curl / squat / row / pull / run 7종이 운동 매핑 대상
 *   - idle / happy / rest 3종은 상태 (운동 매핑 없음)
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
  cardio: '유산소',
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

export const POSES = Object.freeze([
  'idle', 'happy', 'rest',
  'lift', 'press', 'curl', 'squat', 'row', 'pull', 'run',
]);

/**
 * 운동 id → Clawd 포즈. spec §1 Clawd 포즈 체계의 동작 7종 (lift·press·curl·squat·row·pull·run) 만 사용.
 * 누락된 운동은 기본 'idle' fallback (getPoseForExercise).
 */
export const EXERCISE_POSE = Object.freeze({
  // press
  bench_press: 'press',
  incline_bench: 'press',
  decline_bench: 'press',
  dumbbell_fly: 'press',
  cable_crossover: 'press',
  push_up: 'press',
  shoulder_press: 'press',
  military_press: 'press',
  side_lateral: 'press',
  front_raise: 'press',
  rear_lateral: 'press',
  tricep_extension: 'press',
  tricep_pushdown: 'press',
  dips: 'press',
  // curl
  bicep_curl: 'curl',
  hammer_curl: 'curl',
  dumbbell_curl: 'curl',
  cable_curl: 'curl',
  wrist_curl: 'curl',
  // squat
  squat: 'squat',
  lunge: 'squat',
  leg_press: 'squat',
  hip_thrust: 'squat',
  leg_extension: 'squat',
  leg_curl: 'squat',
  calf_raise: 'squat',
  // row
  barbell_row: 'row',
  dumbbell_row: 'row',
  seated_row: 'row',
  cable_row: 'row',
  t_bar_row: 'row',
  // pull
  pull_up: 'pull',
  chin_up: 'pull',
  lat_pulldown: 'pull',
  // lift
  deadlift: 'lift',
  romanian_deadlift: 'lift',
  good_morning: 'lift',
  // run (cardio)
  treadmill: 'run',
  cycle: 'run',
  rowing_machine: 'run',
  elliptical: 'run',
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
  { id: 'good_morning',    name: '굿모닝',        part: 'legs',     equipment: 'barbell',   defaultSets: 3, defaultReps: 10, defaultWeight: 40, met: 5.0 },

  // arms (8)
  { id: 'bicep_curl',       name: '바벨 컬',         part: 'arms',     equipment: 'barbell',   defaultSets: 4, defaultReps: 10, defaultWeight: 25, met: 3.5 },
  { id: 'hammer_curl',      name: '해머 컬',         part: 'arms',     equipment: 'dumbbell',  defaultSets: 3, defaultReps: 12, defaultWeight: 14, met: 3.5 },
  { id: 'dumbbell_curl',    name: '덤벨 컬',         part: 'arms',     equipment: 'dumbbell',  defaultSets: 4, defaultReps: 10, defaultWeight: 16, met: 3.5 },
  { id: 'cable_curl',       name: '케이블 컬',       part: 'arms',     equipment: 'cable',     defaultSets: 3, defaultReps: 12, defaultWeight: 25, met: 3.5 },
  { id: 'tricep_extension', name: '트라이셉 익스텐션', part: 'arms',     equipment: 'dumbbell',  defaultSets: 3, defaultReps: 12, defaultWeight: 12, met: 3.5 },
  { id: 'tricep_pushdown',  name: '트라이셉 푸시다운', part: 'arms',     equipment: 'cable',     defaultSets: 4, defaultReps: 12, defaultWeight: 25, met: 3.5 },
  { id: 'dips',             name: '딥스',            part: 'arms',     equipment: 'bodyweight', defaultSets: 3, defaultReps: 10, defaultWeight: 0,  met: 5.0 },
  { id: 'wrist_curl',       name: '리스트 컬',       part: 'arms',     equipment: 'dumbbell',  defaultSets: 3, defaultReps: 15, defaultWeight: 5,  met: 3.0 },

  // cardio (3) — 로잉 머신 삭제 (Wave D 사용자 결정)
  { id: 'treadmill',       name: '트레드밀',       part: 'cardio',   equipment: 'cardio',    defaultSets: 1, defaultReps: 0,  defaultWeight: 0, met: 7.0 },
  { id: 'cycle',           name: '사이클',         part: 'cardio',   equipment: 'cardio',    defaultSets: 1, defaultReps: 0,  defaultWeight: 0, met: 6.5 },
  { id: 'elliptical',      name: '엘립티컬',       part: 'cardio',   equipment: 'cardio',    defaultSets: 1, defaultReps: 0,  defaultWeight: 0, met: 5.0 },
]);

/** equipment 별 weightIncrement 자동 부여 (spec §11) */
export function getIncrementForEquipment(equipment) {
  return INCREMENT[equipment] ?? 0;
}

/** 운동 id → Clawd 포즈. 매핑 없으면 'idle' fallback */
export function getPoseForExercise(id) {
  return EXERCISE_POSE[id] ?? 'idle';
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

/* mocks 허브 inline script 접근용 — Wave 11.6 의 window.gymQueries 패턴 답습 */
if (typeof window !== 'undefined') {
  window.gymExercises = {
    PARTS,
    PART_IDS,
    INCREMENT,
    POSES,
    EXERCISE_POSE,
    BUILTIN_EXERCISES,
    getIncrementForEquipment,
    getPoseForExercise,
    getBuiltinExercise,
    listBuiltinByPart,
    listAllBuiltin,
  };
}
