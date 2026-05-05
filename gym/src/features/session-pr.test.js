/**
 * session-pr.js 단위 테스트 (Wave 11.7.3b).
 *
 * 환경: vitest + fake-indexeddb + window.gymExercises / gymPR / gymQueries 가 main.js
 *       의 import 부수효과로 자동 노출됨.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGymDB } from '../db/schema.js';
import '../db/exercises.js';
import '../db/queries.js';
import '../services/pr.js';
import {
  mapNameToExerciseId,
  persistSetPR,
  getPrevBestE1RMForName,
} from './session-pr.js';

let testDB;

beforeEach(() => {
  const dbName = `gym_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  testDB = createGymDB(dbName);
  globalThis.window = globalThis.window || {};
  globalThis.window.gymDB = testDB;
});

afterEach(async () => {
  await testDB.delete();
  globalThis.window.gymDB = null;
});

describe('mapNameToExerciseId', () => {
  it('정확 매칭 — 벤치프레스 → bench_press', () => {
    expect(mapNameToExerciseId('벤치프레스')).toBe('bench_press');
  });
  it('공백 포함 매칭 — 바벨 로우 → barbell_row', () => {
    expect(mapNameToExerciseId('바벨 로우')).toBe('barbell_row');
  });
  it('공백 누락 매칭 — 바벨로우 → barbell_row', () => {
    expect(mapNameToExerciseId('바벨로우')).toBe('barbell_row');
  });
  it('trim — 앞뒤 공백 제거', () => {
    expect(mapNameToExerciseId('  스쿼트  ')).toBe('squat');
  });
  it('매칭 없음 → name 그대로 fallback', () => {
    expect(mapNameToExerciseId('알수없는운동')).toBe('알수없는운동');
  });
  it('빈 입력 → null', () => {
    expect(mapNameToExerciseId('')).toBeNull();
    expect(mapNameToExerciseId(null)).toBeNull();
  });
});

describe('persistSetPR', () => {
  it('첫 세트 → PR + DB upsert', async () => {
    const r = await persistSetPR({
      exerciseName: '벤치프레스',
      weight: 60,
      reps: 10,
      sessionId: 'sess-1',
      date: '2026-04-01',
    });
    expect(r.ok).toBe(true);
    expect(r.isPR).toBe(true);
    expect(r.exerciseId).toBe('bench_press');
    const stored = await testDB.prs.get(['bench_press', 'e1rm']);
    expect(stored).toBeTruthy();
    expect(stored.e1rm).toBeCloseTo(80, 5);
  });

  it('두 번째 세트 더 큰 e1RM → PR 갱신', async () => {
    await persistSetPR({ exerciseName: '벤치프레스', weight: 60, reps: 10, sessionId: 's1', date: '2026-04-01' });
    const r = await persistSetPR({ exerciseName: '벤치프레스', weight: 70, reps: 8, sessionId: 's2', date: '2026-04-08' });
    expect(r.isPR).toBe(true);
    const stored = await testDB.prs.get(['bench_press', 'e1rm']);
    expect(stored.weight).toBe(70);
    expect(stored.reps).toBe(8);
  });

  it('이전 PR 미달 → PR 아님 + DB 변화 없음', async () => {
    await persistSetPR({ exerciseName: '벤치프레스', weight: 70, reps: 8, sessionId: 's1', date: '2026-04-01' });
    const r = await persistSetPR({ exerciseName: '벤치프레스', weight: 60, reps: 10, sessionId: 's2', date: '2026-04-08' });
    expect(r.isPR).toBe(false);
    const stored = await testDB.prs.get(['bench_press', 'e1rm']);
    expect(stored.weight).toBe(70);
    expect(stored.reps).toBe(8);
  });

  it('weight·reps 비숫자 → ok=false', async () => {
    const r = await persistSetPR({ exerciseName: '벤치프레스', weight: NaN, reps: 10 });
    expect(r.ok).toBe(false);
  });

  it('DB 미초기화 (window.gymDB null) → ok=false, reason=no-db', async () => {
    const saved = globalThis.window.gymDB;
    globalThis.window.gymDB = null;
    const r = await persistSetPR({ exerciseName: '벤치프레스', weight: 60, reps: 10 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-db');
    globalThis.window.gymDB = saved;
  });
});

describe('getPrevBestE1RMForName', () => {
  it('PR 없음 → 0', async () => {
    expect(await getPrevBestE1RMForName('벤치프레스')).toBe(0);
  });
  it('PR 있으면 e1rm 반환', async () => {
    await persistSetPR({ exerciseName: '벤치프레스', weight: 60, reps: 10, sessionId: 's1', date: '2026-04-01' });
    const e = await getPrevBestE1RMForName('벤치프레스');
    expect(e).toBeCloseTo(80, 5);
  });
  it('운동 매핑 안 되어도 0 (DB 에 없음)', async () => {
    expect(await getPrevBestE1RMForName('알수없는운동')).toBe(0);
  });
});
