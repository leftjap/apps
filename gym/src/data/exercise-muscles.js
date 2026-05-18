/**
 * 운동 종목 → 자극 근육 매핑.
 *
 * primary  : 주동근 (가중치 1.0)
 * synergist: 협력근 (가중치 0.4)
 *
 * 부위 키는 silhouette path 의 `data-muscle` 속성과 일치해야 한다.
 *
 * 매핑 출처: 표준 anatomical reference 기반 근사. fine-tune 필요 시 본 표 직접 편집.
 */

export const MUSCLE_KEYS = Object.freeze([
  // front
  'chest', 'abs', 'biceps', 'forearm', 'deltoid_front', 'deltoid_side', 'quads',
  // back
  'traps', 'lats', 'lower_back', 'triceps', 'deltoid_rear',
  'glutes', 'hamstrings', 'calves',
]);

export const WEIGHT_PRIMARY = 1.0;
export const WEIGHT_SYNERGIST = 0.4;

export const EXERCISE_MUSCLES = Object.freeze({
  // chest
  bench_press:     { primary: ['chest'],                    synergist: ['triceps', 'deltoid_front'] },
  incline_bench:   { primary: ['chest', 'deltoid_front'],   synergist: ['triceps'] },
  decline_bench:   { primary: ['chest'],                    synergist: ['triceps'] },
  dumbbell_fly:    { primary: ['chest'],                    synergist: ['deltoid_front'] },
  cable_crossover: { primary: ['chest'],                    synergist: ['deltoid_front'] },
  push_up:         { primary: ['chest'],                    synergist: ['triceps', 'deltoid_front'] },

  // back
  deadlift:          { primary: ['lower_back', 'hamstrings', 'glutes'], synergist: ['traps', 'lats', 'forearm'] },
  romanian_deadlift: { primary: ['hamstrings', 'glutes'],               synergist: ['lower_back', 'forearm'] },
  barbell_row:       { primary: ['lats'],                                synergist: ['biceps', 'deltoid_rear', 'traps'] },
  dumbbell_row:      { primary: ['lats'],                                synergist: ['biceps', 'deltoid_rear'] },
  seated_row:        { primary: ['lats'],                                synergist: ['biceps', 'deltoid_rear'] },
  cable_row:         { primary: ['lats'],                                synergist: ['biceps', 'deltoid_rear'] },
  t_bar_row:         { primary: ['lats'],                                synergist: ['biceps', 'deltoid_rear', 'traps'] },
  pull_up:           { primary: ['lats'],                                synergist: ['biceps', 'deltoid_rear'] },
  chin_up:           { primary: ['lats', 'biceps'],                      synergist: ['deltoid_rear'] },
  lat_pulldown:      { primary: ['lats'],                                synergist: ['biceps', 'deltoid_rear'] },

  // shoulder
  shoulder_press: { primary: ['deltoid_front'],            synergist: ['triceps', 'traps'] },
  military_press: { primary: ['deltoid_front'],            synergist: ['triceps', 'traps'] },
  side_lateral:   { primary: ['deltoid_side'],             synergist: ['traps'] },
  front_raise:    { primary: ['deltoid_front'],            synergist: [] },
  rear_lateral:   { primary: ['deltoid_rear'],             synergist: ['traps'] },

  // legs
  squat:         { primary: ['quads', 'glutes'],   synergist: ['hamstrings', 'lower_back'] },
  lunge:         { primary: ['quads', 'glutes'],   synergist: ['hamstrings'] },
  leg_press:     { primary: ['quads', 'glutes'],   synergist: ['hamstrings'] },
  hip_thrust:    { primary: ['glutes'],            synergist: ['hamstrings', 'lower_back'] },
  leg_extension: { primary: ['quads'],             synergist: [] },
  leg_curl:      { primary: ['hamstrings'],        synergist: [] },
  calf_raise:    { primary: ['calves'],            synergist: [] },

  // arms
  bicep_curl:       { primary: ['biceps'],          synergist: ['forearm'] },
  hammer_curl:      { primary: ['biceps', 'forearm'], synergist: [] },
  dumbbell_curl:    { primary: ['biceps'],          synergist: ['forearm'] },
  cable_curl:       { primary: ['biceps'],          synergist: ['forearm'] },
  tricep_extension: { primary: ['triceps'],         synergist: [] },
  tricep_pushdown:  { primary: ['triceps'],         synergist: [] },
  dips:             { primary: ['triceps', 'chest'], synergist: ['deltoid_front'] },
  wrist_curl:       { primary: ['forearm'],         synergist: [] },

  // cardio / core
  hanging_leg_raise: { primary: ['abs'],     synergist: ['forearm'] },
  decline_situp:     { primary: ['abs'],     synergist: [] },
  // treadmill / cycle / elliptical: 전신 유산소 — silhouette 강조 없음
});

/** exerciseId → { primary, synergist } 조회. 없으면 null. */
export function getExerciseMuscles(exerciseId) {
  return EXERCISE_MUSCLES[exerciseId] || null;
}
