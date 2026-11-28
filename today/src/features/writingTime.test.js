/**
 * writingTime.js 저장 규칙 테스트 (DOM 없이) — 계정이 바뀌면 버리고, 쓰기에 실패하면 되돌린다.
 */
import { describe, it, expect } from 'vitest';
import { createClock, setWriting, advance, drain } from './writingClock.js';
import { saveClock } from './writingTime.js';

const MIN = 60 * 1000;
const T0 = new Date(2026, 10, 29, 14, 0).getTime();

function clockWithTwoMinutes(userId) {
  const c = createClock(userId);
  setWriting(c, true, T0);
  advance(c, T0 + 2 * MIN);
  return c;
}

describe('saveClock', () => {
  it('쌓은 계정과 같으면 날짜별 초를 저장한다', async () => {
    const c = clockWithTwoMinutes('u1');
    const saved = [];
    await saveClock(c, 'u1', async (r) => { saved.push(r); });
    expect(saved).toEqual([{ day: '2026-11-29', seconds: 120 }]);
    expect(drain(c)).toEqual([]);
  });

  it('저장 시점의 계정이 다르면 저장하지 않고 버린다', async () => {
    const c = clockWithTwoMinutes('u1');
    const saved = [];
    await saveClock(c, 'u2', async (r) => { saved.push(r); });
    await saveClock(c, null, async (r) => { saved.push(r); });
    expect(saved).toEqual([]);
    expect(drain(c)).toEqual([]);
  });

  it('쓰기가 실패하면 비운 만큼을 다시 더해 둔다', async () => {
    const c = clockWithTwoMinutes('u1');
    await expect(saveClock(c, 'u1', async () => { throw new Error('dexie'); })).rejects.toThrow('dexie');
    expect(drain(c)).toEqual([{ day: '2026-11-29', seconds: 120 }]);
  });
});
