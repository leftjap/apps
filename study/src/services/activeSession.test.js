import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isExpired, restoreFromSnapshot, touchActiveSession, finalizeStaleSnapshot } from './activeSession.js';
import { finishSession } from './sessionFinish.js';

vi.mock('./sessionFinish.js', async (orig) => ({
  ...(await orig()),
  finishSession: vi.fn(async () => ({ ok: true })),
}));

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

/* 만료 정리가 step=1(첫 카드 진행 중)이면 '학습한 카드 없음'으로 아무것도 남기지 않았다.
 * 그래서 발화 6회·학습시간까지 기록 없이 사라졌다 (2026-08-28 실측: 오늘 세션 로그 0건).
 * 카드를 못 넘겼어도 말한 건 말한 것이다 — 로그는 남긴다. */
describe('finalizeStaleSnapshot — 첫 카드에서 만료돼도 발화는 기록한다', () => {
  const base = {
    mode: 'new', lang: 'en', todayISO: '2026-08-28', step: 1,
    cardIds: ['c1', 'c2'], activeSec: 3600, startTime: 1, savedAt: 2,
  };
  const db = { todayLessons: { bulkGet: vi.fn(async () => []) } };
  beforeEach(() => { finishSession.mockClear(); db.todayLessons.bulkGet.mockClear(); });

  it('완료 0장 + 발화 6회 → 로그를 남긴다 (승급 카드는 없음)', async () => {
    await finalizeStaleSnapshot(db, { ...base, tried: 6, passed: 5 });
    expect(finishSession).toHaveBeenCalledTimes(1);
    const arg = finishSession.mock.calls[0][1];
    expect(arg).toMatchObject({ mode: 'new', tried: 6, passed: 5, completedNewCards: [] });
    expect(arg.durationSec).toBe(3600);          // 활성 시간 보존 (12시간 이하는 미클램프)
    expect(db.todayLessons.bulkGet).not.toHaveBeenCalled(); // 완료 0장 → 조회 자체를 안 한다
  });

  it('완료 0장 + 발화 0회 → 남길 게 없다', async () => {
    expect(await finalizeStaleSnapshot(db, { ...base, tried: 0, passed: 0 })).toBeNull();
    expect(finishSession).not.toHaveBeenCalled();
  });

  it('복습도 같다 — 판정 0건이어도 발화가 있으면 기록', async () => {
    await finalizeStaleSnapshot(db, { ...base, mode: 'review', tried: 4, passed: 2 });
    expect(finishSession).toHaveBeenCalledTimes(1);
    expect(finishSession.mock.calls[0][1]).toMatchObject({ mode: 'review', tried: 4, completedReviewCount: 0 });
  });
});

/* 스냅샷 cards 정본 (2026-08-29 오후 — 실사용 보고 "새로고침하면 점수가 전부 날아간다").
 * 복습은 카드 판정이 즉시 reviewQueue 에 반영되므로, 새로고침 후 로더가 due 필터로 '방금 판정한
 * 카드'를 뺀 목록을 준다. 종전 게이트(현재 목록 완전 일치)는 그 순간 항상 실패해 스냅샷을 파기했다
 * — 복습 중 새로고침 = 진행 전량 소실이 결정론적으로 재현되던 구조 결함 (회귀 아님, 조사 보고 §5①). */
describe('restoreFromSnapshot — 스냅샷 cards 정본', () => {
  const snapCards = [{ id: 'a', sentence: 'A' }, { id: 'b', sentence: 'B' }];
  const base = {
    mode: 'review', cardIds: ['a', 'b'], cards: snapCards,
    step: 2, tried: 3, passed: 2, pronScores: [80, 90], exLog: { a: { utter: [80, 90] } },
  };

  it('복습 판정으로 현재 목록이 줄어도(길이 불일치) 복원된다 — 카드 실물은 스냅샷이 정본', () => {
    const r = restoreFromSnapshot(base, [{ id: 'b' }], 'review');
    expect(r).not.toBe(null);
    expect(r.cards).toEqual(snapCards);
    expect(r.total).toBe(2);
    expect(r.step).toBe(2);
    expect(r.exLog).toEqual({ a: { utter: [80, 90] } });
  });

  it('free 정렬 변동(순서 불일치)에도 복원된다', () => {
    const r = restoreFromSnapshot({ ...base, mode: 'free' }, [{ id: 'b' }, { id: 'a' }], 'free');
    expect(r).not.toBe(null);
    expect(r.cards).toEqual(snapCards);
  });

  it('cards 없는 구형 스냅샷은 종전 규칙 유지 — 목록 불일치면 null, 일치하면 복원(cards 미반환)', () => {
    const legacy = { mode: 'review', cardIds: ['a', 'b'], step: 2 };
    expect(restoreFromSnapshot(legacy, [{ id: 'b' }], 'review')).toBe(null);
    const ok = restoreFromSnapshot(legacy, [{ id: 'a' }, { id: 'b' }], 'review');
    expect(ok).not.toBe(null);
    expect(ok.cards).toBeUndefined();
  });

  it('스냅샷 내부 정합(cards ↔ cardIds)이 깨졌으면 복원하지 않는다', () => {
    expect(restoreFromSnapshot({ ...base, cardIds: ['a', 'x'] }, [], 'review')).toBe(null);
    expect(restoreFromSnapshot({ ...base, cardIds: ['a'] }, [], 'review')).toBe(null);
  });
});

/* 언어 가드 (2026-08-29 오후 2차 감사 확증 — 이번 세션이 만든 회귀).
 * 종전 '현재 목록 완전 일치' 게이트는 로더가 lang 필터를 거치므로 언어 가드를 겸했다 — en 스냅샷은
 * ja 목록과 절대 일치하지 않아 폐기됐다. cards 정본화로 그 암묵 보호가 사라져, 언어 토글 후 진입하면
 * 이전 언어 세션이 되살아나고 sessionLogs·lang_meta 가 새 언어로 오귀속된다. 명시 가드로 복원. */
describe('restoreFromSnapshot — 언어 가드', () => {
  const snapCards = [{ id: 'a', sentence: 'A' }, { id: 'b', sentence: 'B' }];
  const base = { mode: 'review', lang: 'en', cardIds: ['a', 'b'], cards: snapCards, step: 2 };

  it('언어가 다르면 복원하지 않는다', () => {
    expect(restoreFromSnapshot(base, [], 'review', 'ja')).toBe(null);
  });

  it('언어가 같으면 목록 불일치여도 복원 — 언어 가드가 원 수정(cards 정본)을 되돌리지 않는다', () => {
    const r = restoreFromSnapshot(base, [{ id: 'b' }], 'review', 'en');
    expect(r).not.toBe(null);
    expect(r.cards).toEqual(snapCards);
  });

  it('lang 없는 구형 스냅샷·lang 미전달 호출은 언어 비교 없이 종전 규칙', () => {
    const legacy = { mode: 'review', cardIds: ['a', 'b'], cards: snapCards, step: 2 };
    expect(restoreFromSnapshot(legacy, [], 'review', 'en')).not.toBe(null);
    expect(restoreFromSnapshot(base, [], 'review')).not.toBe(null);
  });
});
