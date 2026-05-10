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
} from './exercises.js';

describe('PARTS / PART_IDS', () => {
  it('정확히 6 부위', () => {
    expect(PART_IDS).toEqual(['chest', 'back', 'shoulder', 'legs', 'arms', 'cardio']);
    expect(Object.keys(PARTS)).toHaveLength(6);
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
  it('cardio 부위는 equipment=cardio 만 사용', () => {
    BUILTIN_EXERCISES
      .filter(e => e.part === 'cardio')
      .forEach(e => expect(e.equipment).toBe('cardio'));
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
  it('cardio 운동 → weightIncrement 0', () => {
    const ex = getBuiltinExercise('treadmill');
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
