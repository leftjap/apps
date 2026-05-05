/**
 * pr.js 단위 테스트 (Wave 11.7.3a).
 * Epley 공식 + PR 판정 + 세션 재계산.
 */
import { describe, it, expect } from 'vitest';
import {
  epley,
  roundE1RM,
  findBestE1RM,
  evaluateSetPR,
  buildPR,
  findBestSetsInSession,
} from './pr.js';

describe('epley', () => {
  it('정상 입력 — 60kg × 10reps = 60 × (1 + 10/30) = 80', () => {
    expect(epley(60, 10)).toBeCloseTo(80, 5);
  });
  it('1RM 입력 — weight × 1.0333... ≈ 추정 1RM', () => {
    expect(epley(100, 1)).toBeCloseTo(100 * (1 + 1 / 30), 5);
  });
  it('weight 0 / 음수 / NaN → 0', () => {
    expect(epley(0, 10)).toBe(0);
    expect(epley(-5, 10)).toBe(0);
    expect(epley(NaN, 10)).toBe(0);
  });
  it('reps 0 / 음수 → 0 (PR 판정에서 무력화)', () => {
    expect(epley(60, 0)).toBe(0);
    expect(epley(60, -2)).toBe(0);
  });
});

describe('roundE1RM', () => {
  it('0.1 단위 반올림', () => {
    expect(roundE1RM(80.349)).toBeCloseTo(80.3, 5);
    expect(roundE1RM(80.55)).toBeCloseTo(80.6, 5);
  });
  it('비숫자 → 0', () => {
    expect(roundE1RM(NaN)).toBe(0);
    expect(roundE1RM(undefined)).toBe(0);
  });
});

describe('findBestE1RM', () => {
  it('빈 배열 → null', () => {
    expect(findBestE1RM([], 'bench_press')).toBeNull();
  });
  it('해당 운동 없음 → null', () => {
    const prs = [{ exerciseId: 'squat', type: 'e1rm', e1rm: 100 }];
    expect(findBestE1RM(prs, 'bench_press')).toBeNull();
  });
  it('type=e1rm 만 후보', () => {
    const prs = [
      { exerciseId: 'bench_press', type: 'weight', e1rm: 200 },
      { exerciseId: 'bench_press', type: 'e1rm', e1rm: 100 },
    ];
    const best = findBestE1RM(prs, 'bench_press');
    expect(best.e1rm).toBe(100);
  });
  it('여러 e1rm row 중 최고', () => {
    const prs = [
      { exerciseId: 'bench_press', type: 'e1rm', e1rm: 100, date: '2026-04-01' },
      { exerciseId: 'bench_press', type: 'e1rm', e1rm: 110, date: '2026-04-08' },
      { exerciseId: 'bench_press', type: 'e1rm', e1rm: 105, date: '2026-04-15' },
    ];
    const best = findBestE1RM(prs, 'bench_press');
    expect(best.e1rm).toBe(110);
    expect(best.date).toBe('2026-04-08');
  });
});

describe('evaluateSetPR', () => {
  it('이전 최고 없음 → 첫 입력은 PR', () => {
    const r = evaluateSetPR({ weight: 60, reps: 10 }, [], 'bench_press');
    expect(r.isPR).toBe(true);
    expect(r.e1rm).toBeCloseTo(80, 5);
    expect(r.prevBest).toBeNull();
  });
  it('이전 최고 초과 → PR', () => {
    const prs = [{ exerciseId: 'bench_press', type: 'e1rm', e1rm: 78 }];
    const r = evaluateSetPR({ weight: 60, reps: 10 }, prs, 'bench_press');
    expect(r.isPR).toBe(true);
    expect(r.e1rm).toBeCloseTo(80, 5);
  });
  it('이전 최고 동률 → PR 아님 (엄격 초과)', () => {
    const prs = [{ exerciseId: 'bench_press', type: 'e1rm', e1rm: 80 }];
    const r = evaluateSetPR({ weight: 60, reps: 10 }, prs, 'bench_press');
    expect(r.isPR).toBe(false);
  });
  it('이전 최고 미만 → PR 아님', () => {
    const prs = [{ exerciseId: 'bench_press', type: 'e1rm', e1rm: 90 }];
    const r = evaluateSetPR({ weight: 60, reps: 10 }, prs, 'bench_press');
    expect(r.isPR).toBe(false);
  });
  it('weight=0 → e1rm=0, PR 아님', () => {
    const r = evaluateSetPR({ weight: 0, reps: 10 }, [], 'bench_press');
    expect(r.isPR).toBe(false);
    expect(r.e1rm).toBe(0);
  });
  it('reps=0 (cardio 케이스) → e1rm=0, PR 아님', () => {
    const r = evaluateSetPR({ weight: 60, reps: 0 }, [], 'bench_press');
    expect(r.isPR).toBe(false);
    expect(r.e1rm).toBe(0);
  });
});

describe('buildPR', () => {
  it('정상 — type=e1rm default, e1rm 자동 계산', () => {
    const pr = buildPR({
      exerciseId: 'bench_press',
      weight: 60,
      reps: 10,
      date: '2026-04-01',
      sessionId: 'sess-1',
    });
    expect(pr.exerciseId).toBe('bench_press');
    expect(pr.type).toBe('e1rm');
    expect(pr.e1rm).toBeCloseTo(80, 5);
    expect(pr.weight).toBe(60);
    expect(pr.reps).toBe(10);
  });
  it('exerciseId 누락 throw', () => {
    expect(() => buildPR({ weight: 60, reps: 10 })).toThrow('exerciseId');
  });
  it('weight·reps 비숫자 throw', () => {
    expect(() => buildPR({ exerciseId: 'a', weight: NaN, reps: 10 })).toThrow();
    expect(() => buildPR({ exerciseId: 'a', weight: 60, reps: 'x' })).toThrow();
  });
});

describe('findBestSetsInSession', () => {
  it('빈 세션 / blocks 누락 → 빈 Map', () => {
    expect(findBestSetsInSession({}).size).toBe(0);
    expect(findBestSetsInSession({ blocks: null }).size).toBe(0);
  });
  it('single block (exercises 안에 sets) — 운동별 최고 e1RM 1건', () => {
    const session = {
      blocks: [{
        type: 'single',
        exercises: [{
          exerciseId: 'bench_press',
          sets: [
            { weight: 60, reps: 10, done: true }, // e1rm=80
            { weight: 65, reps: 8, done: true },  // e1rm=82.3
            { weight: 70, reps: 5, done: false }, // 미완료 — 제외
          ],
        }],
      }],
    };
    const map = findBestSetsInSession(session);
    expect(map.size).toBe(1);
    const best = map.get('bench_press');
    expect(best.weight).toBe(65);
    expect(best.reps).toBe(8);
  });
  it('done=false 세트는 무시', () => {
    const session = {
      blocks: [{
        type: 'single',
        exercises: [{
          exerciseId: 'squat',
          sets: [
            { weight: 100, reps: 5, done: false },
            { weight: 80, reps: 5, done: true },
          ],
        }],
      }],
    };
    const map = findBestSetsInSession(session);
    expect(map.get('squat').weight).toBe(80);
  });
  it('circuit block — rounds 의 모든 운동 후보', () => {
    const session = {
      blocks: [{
        type: 'circuit',
        rounds: [
          [
            { exerciseId: 'a', weight: 10, reps: 12, done: true },
            { exerciseId: 'b', weight: 5, reps: 15, done: true },
          ],
          [
            { exerciseId: 'a', weight: 12, reps: 10, done: true }, // 더 높은 e1rm
            { exerciseId: 'b', weight: 5, reps: 15, done: true },
          ],
        ],
      }],
    };
    const map = findBestSetsInSession(session);
    expect(map.get('a').weight).toBe(12);
    expect(map.get('a').reps).toBe(10);
    expect(map.get('b').weight).toBe(5);
  });
  it('block.exerciseId 직접 (sets top-level) 도 인식', () => {
    const session = {
      blocks: [{
        type: 'single',
        exerciseId: 'deadlift',
        sets: [{ weight: 100, reps: 5, done: true }],
      }],
    };
    const map = findBestSetsInSession(session);
    expect(map.get('deadlift').weight).toBe(100);
  });
});
