import { describe, it, expect } from 'vitest';
import { nextSrsState, todayPlusDays, SRS_INTERVALS, applySrsUpdate } from './srs.js';

const TODAY = '2026-05-08';

describe('todayPlusDays', () => {
  it('+1', () => expect(todayPlusDays('2026-05-08', 1)).toBe('2026-05-09'));
  it('+3', () => expect(todayPlusDays('2026-05-08', 3)).toBe('2026-05-11'));
  it('월 경계 (+30 from 04-15)', () => expect(todayPlusDays('2026-04-15', 30)).toBe('2026-05-15'));
  it('연 경계 (+30 from 12-15)', () => expect(todayPlusDays('2026-12-15', 30)).toBe('2027-01-14'));
});

describe('nextSrsState — no (다시)', () => {
  it.each(SRS_INTERVALS)('current=%i 에서 no → interval=1', (cur) => {
    expect(nextSrsState(cur, 'no', TODAY)).toEqual({
      interval: 1, nextReview: '2026-05-09', graduate: false,
    });
  });
});

describe('nextSrsState — got (완료)', () => {
  it('1 → 3', () => expect(nextSrsState(1, 'got', TODAY)).toEqual({ interval: 3, nextReview: '2026-05-11', graduate: false }));
  it('3 → 7', () => expect(nextSrsState(3, 'got', TODAY)).toEqual({ interval: 7, nextReview: '2026-05-15', graduate: false }));
  it('7 → 21', () => expect(nextSrsState(7, 'got', TODAY)).toEqual({ interval: 21, nextReview: '2026-05-29', graduate: false }));
  it('21 → 60', () => expect(nextSrsState(21, 'got', TODAY)).toEqual({ interval: 60, nextReview: '2026-07-07', graduate: false }));
  it('60 → graduate', () => expect(nextSrsState(60, 'got', TODAY)).toEqual({ graduate: true }));
});

describe('nextSrsState — hmm (애매)', () => {
  it('1 → ceil((1+3)/2)=2', () => expect(nextSrsState(1, 'hmm', TODAY)).toMatchObject({ interval: 2, nextReview: '2026-05-10', graduate: false }));
  it('3 → ceil((3+7)/2)=5', () => expect(nextSrsState(3, 'hmm', TODAY)).toMatchObject({ interval: 5, nextReview: '2026-05-13' }));
  it('7 → ceil((7+21)/2)=14', () => expect(nextSrsState(7, 'hmm', TODAY)).toMatchObject({ interval: 14, nextReview: '2026-05-22' }));
  it('21 → ceil((21+60)/2)=41', () => expect(nextSrsState(21, 'hmm', TODAY)).toMatchObject({ interval: 41, nextReview: '2026-06-18' }));
  it('60 (마지막) → 60 유지 (졸업 아님)', () => expect(nextSrsState(60, 'hmm', TODAY)).toMatchObject({ interval: 60, graduate: false }));
});

describe('nextSrsState — 안전성', () => {
  it('알 수 없는 interval → 1 로 폴백', () => {
    expect(nextSrsState(99, 'got', TODAY)).toEqual({ interval: 3, nextReview: '2026-05-11', graduate: false });
  });
  it('null interval + got → 1 폴백 → 3', () => {
    expect(nextSrsState(null, 'got', TODAY)).toEqual({ interval: 3, nextReview: '2026-05-11', graduate: false });
  });
  it('알 수 없는 kind → 현 간격 유지', () => {
    expect(nextSrsState(7, 'xyz', TODAY)).toMatchObject({ interval: 7, graduate: false });
  });
});

/* 2026-07-18 사용자 보고: 기록 화면(캘린더 상세·문장 목록)에 복습 난이도가 전혀 반영 안 됨.
 * 원인: applySrsUpdate 가 interval/nextReview 만 저장하고 판정 결과(lastResult)를 저장하지 않았다.
 * → stats.js:220 의 `r2s[c.lastResult] || 80` 이 항상 폴백 80(통과색)으로 굳어 모든 문장이 같은 색.
 * reviewQueue 의 lastResult 정본 형식은 'O'/'△'/'X' (seed.js 시드값, sync.js:404 의 'X'=실패 판정,
 * stats.js:216 의 r2s 매핑이 모두 이 형식을 기대). SRS 판정 kind(got/hmm/no)를 이 형식으로 저장한다. */
describe('applySrsUpdate — 판정 결과(lastResult) 저장', () => {
  const mkDb = () => {
    const updates = []; const deletes = [];
    return { updates, deletes, reviewQueue: {
      update: async (id, patch) => { updates.push({ id, patch }); },
      delete: async (id) => { deletes.push(id); },
    } };
  };

  it('got → lastResult "O" + interval/nextReview 함께 저장', async () => {
    const db = mkDb();
    await applySrsUpdate(db, { id: 'c1', interval: 1 }, 'got', TODAY);
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]).toMatchObject({ id: 'c1', patch: { lastResult: 'O', interval: 3, nextReview: '2026-05-11' } });
  });

  it('hmm → lastResult "△"', async () => {
    const db = mkDb();
    await applySrsUpdate(db, { id: 'c2', interval: 3 }, 'hmm', TODAY);
    expect(db.updates[0].patch).toMatchObject({ lastResult: '△', interval: 5 });
  });

  it('no → lastResult "X" (sync 의 실패 판정 기준과 일치)', async () => {
    const db = mkDb();
    await applySrsUpdate(db, { id: 'c3', interval: 7 }, 'no', TODAY);
    expect(db.updates[0].patch).toMatchObject({ lastResult: 'X', interval: 1 });
  });

  it('졸업(60→got)은 큐에서 삭제 — update 호출 없음', async () => {
    const db = mkDb();
    await applySrsUpdate(db, { id: 'c4', interval: 60 }, 'got', TODAY);
    expect(db.deletes).toEqual(['c4']);
    expect(db.updates).toHaveLength(0);
  });
});

/* 2026-08-23 실 DB 감사: study_review_queue 124장 전부 consecutive_pass=0.
 * 원인: applySrsUpdate 가 consecutivePass 를 갱신하지 않아 스키마·sync 매핑(sync.js:47/65)·
 * userMeta 의 익힘 판정(userMeta.js:35 PASS_THRESHOLD=2) 이 전부 죽은 값 위에서 돈다.
 * 정의: '연속 통과' — got 만 +1, hmm/no 는 연속이 끊겼으므로 0.
 * (seed.js 시드값 정합: interval 1/3/7/21 ↔ consecutivePass 0/1/2/3) */
describe('applySrsUpdate — 연속 통과 카운터(consecutivePass)', () => {
  const mkDb = () => {
    const updates = []; const deletes = [];
    return { updates, deletes, reviewQueue: {
      update: async (id, patch) => { updates.push({ id, patch }); },
      delete: async (id) => { deletes.push(id); },
    } };
  };

  it('got → 기존값 +1', async () => {
    const db = mkDb();
    await applySrsUpdate(db, { id: 'c1', interval: 3, consecutivePass: 1 }, 'got', TODAY);
    expect(db.updates[0].patch).toMatchObject({ consecutivePass: 2 });
  });

  it('got — consecutivePass 미존재(레거시 행) → 1', async () => {
    const db = mkDb();
    await applySrsUpdate(db, { id: 'c2', interval: 1 }, 'got', TODAY);
    expect(db.updates[0].patch).toMatchObject({ consecutivePass: 1 });
  });

  it('hmm → 0 (연속 끊김)', async () => {
    const db = mkDb();
    await applySrsUpdate(db, { id: 'c3', interval: 7, consecutivePass: 2 }, 'hmm', TODAY);
    expect(db.updates[0].patch).toMatchObject({ consecutivePass: 0 });
  });

  it('no → 0', async () => {
    const db = mkDb();
    await applySrsUpdate(db, { id: 'c4', interval: 21, consecutivePass: 3 }, 'no', TODAY);
    expect(db.updates[0].patch).toMatchObject({ consecutivePass: 0 });
  });

  it('알 수 없는 kind → consecutivePass 미변경 (기존 값 보존)', async () => {
    const db = mkDb();
    await applySrsUpdate(db, { id: 'c5', interval: 7, consecutivePass: 2 }, 'xyz', TODAY);
    expect(db.updates[0].patch).not.toHaveProperty('consecutivePass');
  });
});

/* 판정 이력 누적 (2026-09-03, 문장 모아보기 v12 — 작업지시서 §5). reviewQueue 엔 lastResult 단일값뿐이라
 * 회차별 '떠올림/복습' 분수와 결과 막대를 만들 수 없었다. 로컬 전용 필드 resultHistory 에
 * { date, result:'O'|'△'|'X', source:'review'|'sentences' } 를 덧붙인다. 복습 세션의 자기평가는 전부 이 함수를 지난다. */
describe('applySrsUpdate — 판정 이력(resultHistory) 누적', () => {
  const mkDb = () => {
    const updates = [];
    return { updates, reviewQueue: { update: async (id, patch) => { updates.push({ id, patch }); }, delete: async () => {} } };
  };

  it('판정마다 {date, result, source:"review"} 를 기존 이력 뒤에 덧붙인다', async () => {
    const db = mkDb();
    const prev = [{ date: '2026-05-01', result: 'X', source: 'sentences' }];
    await applySrsUpdate(db, { id: 'c1', interval: 1, resultHistory: prev }, 'got', TODAY);
    expect(db.updates[0].patch.resultHistory).toEqual([...prev, { date: TODAY, result: 'O', source: 'review' }]);
    expect(prev).toHaveLength(1); // 원본 배열은 건드리지 않는다
  });

  it('이력 필드가 없던 카드는 새 배열로 시작한다 (마이그레이션 없음)', async () => {
    const db = mkDb();
    await applySrsUpdate(db, { id: 'c2', interval: 3 }, 'hmm', TODAY);
    expect(db.updates[0].patch.resultHistory).toEqual([{ date: TODAY, result: '△', source: 'review' }]);
  });

  it('알 수 없는 kind 는 lastResult 와 마찬가지로 이력에도 남기지 않는다', async () => {
    const db = mkDb();
    await applySrsUpdate(db, { id: 'c3', interval: 3 }, 'xyz', TODAY);
    expect(db.updates[0].patch.resultHistory).toBeUndefined();
  });
});
