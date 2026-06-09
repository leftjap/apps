import { describe, it, expect } from 'vitest';
import { summarizeSession, exerciseIdToName } from './session-summary.js';

describe('exerciseIdToName', () => {
  it('BUILTIN id → 한국어 name', () => {
    expect(exerciseIdToName('bench_press')).toBe('벤치프레스');
    expect(exerciseIdToName('squat')).toBe('스쿼트');
    expect(exerciseIdToName('lat_pulldown')).toBe('랫 풀다운');
  });

  it('미매핑 id → fallback 영문 그대로', () => {
    expect(exerciseIdToName('cust_xyz')).toBe('cust_xyz');
    expect(exerciseIdToName('unknown')).toBe('unknown');
  });

  it('falsy → 빈 문자열', () => {
    expect(exerciseIdToName(null)).toBe('');
    expect(exerciseIdToName(undefined)).toBe('');
    expect(exerciseIdToName('')).toBe('');
  });
});

describe('summarizeSession — spec §12 형식', () => {
  it('정상 — 영문→한국어 매핑 + 합계 + PR 카운트', () => {
    const session = {
      id: 'session_1',
      date: '2026-04-30',
      startTime: 1714492800000,
      endTime: 1714494600000,
      totalVolume: 1120,
      totalCalories: 165,
      durationMin: 30,
      blocks: [{
        type: 'single',
        exerciseId: 'bench_press',
        sets: [
          { weight: 60, reps: 10, done: true, preset: false, pr: false },
          { weight: 65, reps: 8, done: true, preset: false, pr: true },
        ],
      }],
      tags: ['chest'],
      status: 'completed',
    };
    const v = summarizeSession(session);
    expect(v.label).toBe('운동 완료');
    expect(v.title).toBe('잘 끝냈다');
    expect(v.subtitle).toBe('2026-04-30 · 목요일');
    expect(v.volume).toBe('1,120');
    expect(v.time).toBe(30);
    expect(v.kcal).toBe(165);
    expect(v.pr).toBe(1);
    expect(v.exercises).toEqual([
      { name: '벤치프레스', sets: '2세트 · 1,120kg', setCount: 2, volume: '1,120kg', pr: true },
    ]);
  });

  it('multi-운동 — 운동별 1 entry + 합계 분리', () => {
    const session = {
      date: '2026-04-30',
      totalVolume: 1620,
      durationMin: 45,
      totalCalories: 247,
      blocks: [
        {
          type: 'single',
          exerciseId: 'bench_press',
          sets: [{ weight: 60, reps: 10, done: true, pr: false }],
        },
        {
          type: 'single',
          exerciseId: 'squat',
          sets: [
            { weight: 100, reps: 5, done: true, pr: false },
            { weight: 90, reps: 6, done: true, pr: false },
          ],
        },
      ],
      status: 'completed',
    };
    const v = summarizeSession(session);
    expect(v.exercises.length).toBe(2);
    expect(v.exercises[0]).toEqual({ name: '벤치프레스', sets: '1세트 · 600kg', setCount: 1, volume: '600kg', pr: false });
    expect(v.exercises[1]).toEqual({ name: '스쿼트', sets: '2세트 · 1,040kg', setCount: 2, volume: '1,040kg', pr: false });
  });

  it('done:false 세트는 출력 제외', () => {
    const session = {
      date: '2026-04-30', totalVolume: 600, durationMin: 10, totalCalories: 55,
      blocks: [{
        type: 'single',
        exerciseId: 'bench_press',
        sets: [
          { weight: 60, reps: 10, done: true, pr: false },
          { weight: 60, reps: 10, done: false, preset: true, pr: false }, // preset 무시
          { weight: 60, reps: 10, done: false, preset: true, pr: false },
        ],
      }],
    };
    const v = summarizeSession(session);
    expect(v.exercises[0].sets).toBe('1세트 · 600kg');
  });

  it('완료 세트 0건 운동 → exercises 에서 제외', () => {
    const session = {
      date: '2026-04-30', totalVolume: 0, durationMin: 1, totalCalories: 6,
      blocks: [{
        type: 'single',
        exerciseId: 'bench_press',
        sets: [
          { weight: 60, reps: 10, done: false, preset: true, pr: false },
        ],
      }],
    };
    const v = summarizeSession(session);
    expect(v.exercises).toEqual([]);
  });

  it('cardio (duration) — 분/km 표시', () => {
    const session = {
      date: '2026-04-30', totalVolume: 0, durationMin: 30, totalCalories: 165,
      blocks: [{
        type: 'single',
        exerciseId: 'treadmill',
        sets: [{ duration: 1800, distance: 5, done: true, pr: false }],
      }],
    };
    const v = summarizeSession(session);
    expect(v.exercises[0]).toEqual({ name: '트레드밀', sets: '30분 · 5km', setCount: 1, volume: '30분 · 5km', pr: false });
  });

  it('미매핑 exerciseId — 영문 그대로', () => {
    const session = {
      date: '2026-04-30', totalVolume: 480, durationMin: 5, totalCalories: 28,
      blocks: [{
        type: 'single',
        exerciseId: 'cust_machine_x',
        sets: [{ weight: 40, reps: 12, done: true, pr: false }],
      }],
    };
    const v = summarizeSession(session);
    expect(v.exercises[0].name).toBe('cust_machine_x');
  });

  it('circuit 블록 — 본 wave 범위 외, exercises 에서 제외', () => {
    const session = {
      date: '2026-04-30', totalVolume: 0, durationMin: 5, totalCalories: 28,
      blocks: [{
        type: 'circuit',
        rounds: [[{ exerciseId: 'pushup', reps: 10, done: true }]],
      }],
    };
    const v = summarizeSession(session);
    expect(v.exercises).toEqual([]);
  });
});

describe('summarizeSession — mocks Wave 11.6D 형식 fallback', () => {
  it('blocks[0].exercises 형식 처리', () => {
    const session = {
      date: '2026-04-30', totalVolume: 1340, durationMin: 60, totalCalories: 330,
      blocks: [{
        type: 'single',
        exercises: [
          {
            exerciseId: '벤치프레스',
            exerciseName: '벤치프레스',
            sets: [
              { weight: 60, reps: 12, done: true },
              { weight: 65, reps: 10, done: true },
            ],
          },
        ],
      }],
    };
    const v = summarizeSession(session);
    expect(v.exercises[0]).toEqual({ name: '벤치프레스', sets: '2세트 · 1,370kg', setCount: 2, volume: '1,370kg', pr: false });
  });
});

describe('summarizeSession — edge cases', () => {
  it('null session → 기본 빈 variant', () => {
    const v = summarizeSession(null);
    expect(v).toEqual({
      label: '운동 완료', title: '잘 끝냈다', subtitle: '',
      volume: '0', time: 0, pr: 0, kcal: 0, exercises: [],
    });
  });

  it('blocks 누락 → exercises 빈', () => {
    const v = summarizeSession({ date: '2026-04-30', totalVolume: 100, durationMin: 5 });
    expect(v.exercises).toEqual([]);
    expect(v.volume).toBe('100');
  });

  it('잘못된 date 형식 → 그대로 반환', () => {
    const v = summarizeSession({ date: 'invalid', blocks: [] });
    expect(v.subtitle).toBe('invalid');
  });

  it('date 누락 → 빈 subtitle', () => {
    const v = summarizeSession({ blocks: [] });
    expect(v.subtitle).toBe('');
  });
});
