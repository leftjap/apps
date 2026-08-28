import { describe, it, expect } from 'vitest';
import { isExpired, restoreFromSnapshot, touchActiveSession } from './activeSession.js';

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

  /* 카드별 연습 진행(응용 행 점수·생산 연습·체이닝) — 스냅샷에 없어 재마운트/새로고침이면
   * 소실됐다 (2026-08-21 사용자 보고: "응용 5번까지 발화 후 복귀했더니 점수가 전부 사라짐"). */
  it('exLog(카드별 연습 진행) 복원', () => {
    const exLog = { b: { drills: { 0: 92, 2: 75 }, prod: { picks: [1, 3], rows: { 0: true } }, chain: { cur: 2 } } };
    expect(restoreFromSnapshot({ ...snap, exLog }, cards, 'new').exLog).toEqual(exLog);
  });

  it('exLog 없는 구 스냅샷 → 빈 객체 (하위호환)', () => {
    expect(restoreFromSnapshot(snap, cards, 'new').exLog).toEqual({});
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

/* 2026-08-28 사용자 보고 — 한 카드를 오래 공부하면 진행이 통째로 사라졌다. 재현: savedAt 을 61분
 * 전으로 두고 새로고침 → 점수 원 0 · 응용 0/8 · 세션 로그 0건.
 * 만료 시계가 '마지막 저장'(= 마지막 녹음) 기준이라, 듣고·생각하고·해설 읽는 시간은 활동으로
 * 안 쳐졌다. 실제 조작이 있으면 시계를 되짚어 이탈로 오판하지 않게 한다. */
describe('touchActiveSession — 활동으로 만료 시계 갱신', () => {
  const mkDb = (value) => {
    const store = value ? { key: 'activeSession', value, at: 1 } : null;
    return {
      _get: () => store,
      meta: {
        async get() { return store; },
        async put(rec) { Object.assign(store, rec); return rec.key; },
      },
    };
  };

  it('savedAt 을 현재로 올리고 나머지 값은 보존한다', async () => {
    const old = Date.now() - 50 * 60 * 1000;
    const db = mkDb({ mode: 'new', step: 1, tried: 6, exLog: { c1: { utter: [57] } }, savedAt: old });
    expect(await touchActiveSession(db)).toBe(true);
    const v = db._get().value;
    expect(v.savedAt).toBeGreaterThan(old);
    expect(v.tried).toBe(6);
    expect(v.exLog).toEqual({ c1: { utter: [57] } });
  });

  it('스냅샷이 없으면 아무것도 만들지 않는다', async () => {
    expect(await touchActiveSession(mkDb(null))).toBe(false);
    expect(await touchActiveSession({})).toBe(false);
  });
});
