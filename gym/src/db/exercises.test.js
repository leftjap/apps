/**
 * exercises.js 단위 테스트 — 마스터 데이터 정합 + 헬퍼 동작.
 * spec §11 (운동 데이터).
 */
import { describe, it, expect } from 'vitest';
import {
  PARTS,
  PART_IDS,
  INCREMENT,
  BUILTIN_EXERCISES,
  getIncrementForEquipment,
  getBuiltinExercise,
  listBuiltinByPart,
  listAllBuiltin,
  nextStackWeight,
} from './exercises.js';

describe('PARTS / PART_IDS', () => {
  it('정확히 7 부위 (작업지시서(3) 확정 [3] — 코어·유산소 분리)', () => {
    expect(PART_IDS).toEqual(['chest', 'back', 'legs', 'shoulder', 'arms', 'core', 'cardio']);
    expect(Object.keys(PARTS)).toHaveLength(7);
  });
  it('모든 라벨이 한국어 1~3자', () => {
    Object.values(PARTS).forEach(label => {
      expect(label.length).toBeGreaterThanOrEqual(1);
      expect(label.length).toBeLessThanOrEqual(3);
    });
  });
  it('frozen — 런타임 변조 방지', () => {
    expect(Object.isFrozen(PARTS)).toBe(true);
    expect(Object.isFrozen(PART_IDS)).toBe(true);
  });
});

describe('INCREMENT (장비별 중량 증감, spec §11)', () => {
  it('barbell·machine·cable 5kg / dumbbell 2kg / bodyweight·cardio 0', () => {
    expect(INCREMENT.barbell).toBe(5);
    expect(INCREMENT.machine).toBe(5);
    expect(INCREMENT.cable).toBe(5);
    expect(INCREMENT.dumbbell).toBe(2);
    expect(INCREMENT.bodyweight).toBe(0);
    expect(INCREMENT.cardio).toBe(0);
  });
  it('frozen', () => {
    expect(Object.isFrozen(INCREMENT)).toBe(true);
  });
});

describe('BUILTIN_EXERCISES 카탈로그', () => {
  it('약 40종 (스펙 §11)', () => {
    expect(BUILTIN_EXERCISES.length).toBeGreaterThanOrEqual(35);
    expect(BUILTIN_EXERCISES.length).toBeLessThanOrEqual(45);
  });
  it('모든 id 가 unique', () => {
    const ids = BUILTIN_EXERCISES.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('모든 id 가 영문 snake_case', () => {
    BUILTIN_EXERCISES.forEach(e => {
      expect(e.id).toMatch(/^[a-z][a-z0-9_]*$/);
    });
  });
  it('모든 part 가 PART_IDS 안에 있음', () => {
    BUILTIN_EXERCISES.forEach(e => {
      expect(PART_IDS).toContain(e.part);
    });
  });
  it('모든 equipment 가 INCREMENT 키 안에 있음', () => {
    BUILTIN_EXERCISES.forEach(e => {
      expect(Object.keys(INCREMENT)).toContain(e.equipment);
    });
  });
  it('cardio 부위는 equipment=cardio 또는 bodyweight (코어 운동 묶음)', () => {
    BUILTIN_EXERCISES
      .filter(e => e.part === 'cardio')
      .forEach(e => expect(['cardio', 'bodyweight']).toContain(e.equipment));
  });
  it('각 6 부위에 최소 1종 존재', () => {
    PART_IDS.forEach(part => {
      const list = BUILTIN_EXERCISES.filter(e => e.part === part);
      expect(list.length).toBeGreaterThan(0);
    });
  });
  it('frozen', () => {
    expect(Object.isFrozen(BUILTIN_EXERCISES)).toBe(true);
  });
  it('필수 필드 모두 존재 (id·name·part·equipment·defaultSets·defaultReps·defaultWeight·met)', () => {
    BUILTIN_EXERCISES.forEach(e => {
      expect(e).toHaveProperty('id');
      expect(e).toHaveProperty('name');
      expect(e).toHaveProperty('part');
      expect(e).toHaveProperty('equipment');
      expect(typeof e.defaultSets).toBe('number');
      expect(typeof e.defaultReps).toBe('number');
      expect(typeof e.defaultWeight).toBe('number');
      expect(typeof e.met).toBe('number');
    });
  });
});

describe('getIncrementForEquipment', () => {
  it('barbell → 5', () => expect(getIncrementForEquipment('barbell')).toBe(5));
  it('dumbbell → 2', () => expect(getIncrementForEquipment('dumbbell')).toBe(2));
  it('bodyweight → 0', () => expect(getIncrementForEquipment('bodyweight')).toBe(0));
  it('알 수 없는 장비 → 0 fallback', () => expect(getIncrementForEquipment('xxx')).toBe(0));
});

describe('getBuiltinExercise', () => {
  it('존재하는 id → weightIncrement 합성 객체', () => {
    const ex = getBuiltinExercise('bench_press');
    expect(ex.id).toBe('bench_press');
    expect(ex.weightIncrement).toBe(5);
  });
  it('dumbbell 운동 → weightIncrement 2', () => {
    const ex = getBuiltinExercise('dumbbell_curl');
    expect(ex.weightIncrement).toBe(2);
  });
  it('리스트 컬(wrist_curl) — 명시 weightIncrement 5 가 덤벨 기본(2) override (사용자 요청)', () => {
    const ex = getBuiltinExercise('wrist_curl');
    expect(ex.equipment).toBe('dumbbell');
    expect(ex.weightIncrement).toBe(5);
  });
  it('cardio 운동 → weightIncrement 0', () => {
    const ex = getBuiltinExercise('treadmill');
    expect(ex.weightIncrement).toBe(0);
  });
  it('좌식 자전거는 기존 사이클과 별도인 유산소 종목', () => {
    const ex = getBuiltinExercise('recumbent_bike');
    expect(ex.name).toBe('좌식 자전거');
    expect(ex.part).toBe('cardio');
    expect(ex.equipment).toBe('cardio');
    expect(ex.defaultSets).toBe(1);
    expect(ex.defaultReps).toBe(0);
    expect(ex.defaultWeight).toBe(0);
    expect(ex.weightIncrement).toBe(0);
    expect(getBuiltinExercise('cycle').name).toBe('사이클');
    expect(listBuiltinByPart('cardio').map(e => e.id)).toEqual([
      'treadmill', 'cycle', 'recumbent_bike', 'elliptical', 'stair_climber',
    ]);
  });
  it.each([
    ['hip_adduction', '내전근(힙 어덕션)'],
    ['hip_abduction', '외전근(힙 어브덕션)'],
  ])('%s는 하체 머신이며 사진의 스택 중량 순서로 증감', (id, name) => {
    const ex = getBuiltinExercise(id);
    expect(ex.name).toBe(name);
    expect(ex.part).toBe('legs');
    expect(ex.equipment).toBe('machine');
    expect(ex.defaultSets).toBe(3);
    expect(ex.defaultReps).toBe(12);
    expect(ex.defaultWeight).toBe(20);
    const labels = [5, 10, 15, 20, 25, 32, 40, 47, 55, 62, 70, 78, 85, 92, 100];
    expect(ex.weightSteps).toEqual(labels);
    labels.forEach((weight, index) => {
      expect(nextStackWeight(ex, weight, 1)).toBe(labels[Math.min(index + 1, labels.length - 1)]);
      expect(nextStackWeight(ex, weight, -1)).toBe(labels[Math.max(index - 1, 0)]);
    });
    expect(nextStackWeight(ex, 27, 1)).toBe(32);
    expect(nextStackWeight(ex, 27, -1)).toBe(25);
    expect(nextStackWeight(ex, 2, 1)).toBe(5);
    expect(nextStackWeight(ex, 2, -1)).toBe(2);
    expect(nextStackWeight(ex, 120, 1)).toBe(120);
    expect(nextStackWeight(ex, 120, -1)).toBe(100);
    expect(nextStackWeight(ex, 25, 0)).toBe(25);
    expect(Object.isFrozen(ex.weightSteps)).toBe(true);
    expect(nextStackWeight(getBuiltinExercise('leg_curl'), 25, 1)).toBeNull();
    expect(getBuiltinExercise('dumbbell_curl').weightIncrement).toBe(2);
    expect(BUILTIN_EXERCISES.find(e => e.id === 'leg_curl').weightIncrement).toBeUndefined();
  });
  it('천국의계단은 트레드밀과 같은 단일 유산소 기록', () => {
    const ex = getBuiltinExercise('stair_climber');
    expect(ex.name).toBe('천국의계단');
    expect(ex.part).toBe('cardio');
    expect(ex.equipment).toBe('cardio');
    expect(ex.defaultSets).toBe(1);
    expect(ex.defaultReps).toBe(0);
    expect(ex.defaultWeight).toBe(0);
    expect(ex.weightIncrement).toBe(0);
  });
  it('없는 id → null', () => {
    expect(getBuiltinExercise('does_not_exist')).toBeNull();
  });
});

describe('listBuiltinByPart', () => {
  it('chest 부위만 반환', () => {
    const list = listBuiltinByPart('chest');
    expect(list.length).toBeGreaterThan(0);
    list.forEach(e => expect(e.part).toBe('chest'));
  });
  it('weightIncrement 합성됨', () => {
    const list = listBuiltinByPart('chest');
    list.forEach(e => {
      expect(e.weightIncrement).toBe(INCREMENT[e.equipment]);
    });
  });
  it('알 수 없는 부위 → 빈 배열', () => {
    expect(listBuiltinByPart('xxx')).toEqual([]);
  });
});

describe('listAllBuiltin', () => {
  it('전체 운동 + weightIncrement 합성', () => {
    const list = listAllBuiltin();
    expect(list.length).toBe(BUILTIN_EXERCISES.length);
    list.forEach(e => {
      expect(typeof e.weightIncrement).toBe('number');
    });
  });
});
