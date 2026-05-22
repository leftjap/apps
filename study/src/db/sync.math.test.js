import { describe, it, expect } from 'vitest';
import {
  mathProblemsDexieToSupabase,
  mathProblemsSupabaseToDexie,
  mathQueueDexieToSupabase,
  mathQueueSupabaseToDexie,
} from './sync.js';

const UID = 'user-1';

describe('sync math transforms', () => {
  it('mathProblems round-trip (camel↔snake, jsonb 보존)', () => {
    const dexie = {
      id: 'm1', date: '2026-05-23', module: '넓이는 변형', tag: '기하 · 삼각형 넓이',
      lesson: 'L', prompt: 'P', figure: { type: 'dots', n: 5 },
      answer: '12', accept: ['12', '12년'], solution: { core: 'c', steps: ['s1'] },
      orderIndex: 1, completed: false,
    };
    const sb = mathProblemsDexieToSupabase(dexie, UID);
    expect(sb.user_id).toBe(UID);
    expect(sb.order_index).toBe(1);
    expect(sb.figure).toEqual({ type: 'dots', n: 5 });
    const back = mathProblemsSupabaseToDexie(sb);
    expect(back.orderIndex).toBe(1);
    expect(back.answer).toBe('12');
    expect(back.accept).toEqual(['12', '12년']);
    expect(back.solution).toEqual({ core: 'c', steps: ['s1'] });
  });

  it('mathProblems null 가드', () => {
    expect(mathProblemsDexieToSupabase(null, UID)).toBeNull();
    expect(mathProblemsDexieToSupabase({ id: 'x' }, null)).toBeNull();
  });

  it('mathQueue round-trip (next_review/last_result)', () => {
    const dexie = {
      id: 'q1', module: '도형의 약속', prompt: 'P', answer: '12',
      accept: ['12'], solution: { core: 'c' },
      interval: 3, nextReview: '2026-05-25', lastResult: 'got',
    };
    const sb = mathQueueDexieToSupabase(dexie, UID);
    expect(sb.next_review).toBe('2026-05-25');
    expect(sb.last_result).toBe('got');
    const back = mathQueueSupabaseToDexie(sb);
    expect(back.nextReview).toBe('2026-05-25');
    expect(back.lastResult).toBe('got');
    expect(back.interval).toBe(3);
  });
});
