import { describe, it, expect } from 'vitest';
import { isExpired, restoreFromSnapshot } from './activeSession.js';

describe('isExpired (TTL=1시간)', () => {
  it('savedAt = now → 미만료', () => {
    const now = 1_700_000_000_000;
    expect(isExpired(now, now)).toBe(false);
  });

  it('savedAt = now - 59분 → 미만료', () => {
    const now = 1_700_000_000_000;
    expect(isExpired(now - 59 * 60 * 1000, now)).toBe(false);
  });

  it('savedAt = now - 60분 → 미만료 (정확히 경계, > 만 만료)', () => {
    const now = 1_700_000_000_000;
    expect(isExpired(now - 60 * 60 * 1000, now)).toBe(false);
  });

  it('savedAt = now - 61분 → 만료', () => {
    const now = 1_700_000_000_000;
    expect(isExpired(now - 61 * 60 * 1000, now)).toBe(true);
  });

  it('savedAt 누락 / 0 → 만료 (now > 0)', () => {
    expect(isExpired(0, 1_700_000_000_000)).toBe(true);
    expect(isExpired(undefined, 1_700_000_000_000)).toBe(true);
  });
});

describe('restoreFromSnapshot', () => {
  const snap = {
    mode: 'new', step: 2, tried: 3, passed: 2, lastScore: 88,
    pronScores: [80, 90, 88], weakInSession: { θ: 2 },
    judged: { got: 1, hmm: 0, no: 0 }, cardIds: ['a', 'b', 'c'], startTime: 1_700_000_000_000,
  };
  const cards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('정확 매치 → patch 반환', () => {
    const out = restoreFromSnapshot(snap, cards, 'new');
    expect(out).toMatchObject({
      step: 2, tried: 3, passed: 2, lastScore: 88,
      pronScores: [80, 90, 88], weakInSession: { θ: 2 },
      judged: { got: 1, hmm: 0, no: 0 }, startTime: 1_700_000_000_000,
    });
  });

  it('mode 불일치 → null', () => {
    expect(restoreFromSnapshot(snap, cards, 'review')).toBeNull();
  });

  it('cardIds 길이 불일치 → null', () => {
    expect(restoreFromSnapshot(snap, [{ id: 'a' }, { id: 'b' }], 'new')).toBeNull();
    expect(restoreFromSnapshot(snap, [...cards, { id: 'd' }], 'new')).toBeNull();
  });

  it('cardIds 순서 불일치 → null', () => {
    expect(restoreFromSnapshot(snap, [{ id: 'a' }, { id: 'c' }, { id: 'b' }], 'new')).toBeNull();
  });

  it('snapshot null → null', () => {
    expect(restoreFromSnapshot(null, cards, 'new')).toBeNull();
  });

  it('judged 누락 → 0/0/0 폴백', () => {
    const noJudge = { ...snap, judged: undefined };
    expect(restoreFromSnapshot(noJudge, cards, 'new').judged).toEqual({ got: 0, hmm: 0, no: 0 });
  });

  it('startTime 누락 → Date.now() 폴백 (현재 시간 기반)', () => {
    const before = Date.now();
    const out = restoreFromSnapshot({ ...snap, startTime: undefined }, cards, 'new');
    expect(out.startTime).toBeGreaterThanOrEqual(before);
  });
});

describe('restoreFromSnapshot — recLog (2026-06-10 녹음 진행 복원)', () => {
  it('snapshot.recLog 를 복사 복원, 없으면 빈 객체', () => {
    const cards = [{ id: 'a' }, { id: 'b' }];
    const base = { mode: 'new', cardIds: ['a', 'b'], step: 2 };
    const withLog = restoreFromSnapshot({ ...base, recLog: { a: { count: 2, best: 90 } } }, cards, 'new');
    expect(withLog.recLog).toEqual({ a: { count: 2, best: 90 } });
    const noLog = restoreFromSnapshot(base, cards, 'new');
    expect(noLog.recLog).toEqual({});
  });
});

describe('restoreFromSnapshot — activeSec (방치 폭주 차단)', () => {
  it('snapshot.activeSec 복원, 없으면 0 — 복원 세션이 옛 startTime 벽시계를 승계하지 않음', () => {
    const cards = [{ id: 'a' }, { id: 'b' }];
    const base = { mode: 'new', cardIds: ['a', 'b'], step: 2 };
    expect(restoreFromSnapshot({ ...base, activeSec: 77 }, cards, 'new').activeSec).toBe(77);
    expect(restoreFromSnapshot(base, cards, 'new').activeSec).toBe(0);
    expect(restoreFromSnapshot({ ...base, activeSec: NaN }, cards, 'new').activeSec).toBe(0);
  });
});
