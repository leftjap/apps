/**
 * pr.test.js — Wave 11.68-b 단위 테스트.
 *
 * 검증 범위:
 *  - getMondayOf: 요일별 boundary (월~일), 잘못된 입력 가드
 *  - sumWindow: 일자 범위 + lang 필터 (en/ja/both)
 *  - computeWeeklySliding: 7일 합 정확성
 *  - pushHistory: FIFO + max 5 + dedupe
 *  - checkPRUpdate: 4종 PR 갱신 boundary (-1 / 정확 / +1)
 *  - applyPRUpdate: DB 통합 — 최초 PR / 갱신 / 미갱신 / lang 분리
 *
 * Mock 전략: db 인자 직접 mock (seed.test.js / userMeta.test.js 패턴).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getMondayOf,
  sumWindow,
  computeWeeklySliding,
  pushHistory,
  checkPRUpdate,
  applyPRUpdate,
  __test__,
} from './pr.js';

describe('getMondayOf', () => {
  it('월요일 → 그대로', () => {
    expect(getMondayOf('2026-05-04')).toBe('2026-05-04'); // 월
  });
  it('화~토 → 같은 주 월요일', () => {
    expect(getMondayOf('2026-05-05')).toBe('2026-05-04'); // 화
    expect(getMondayOf('2026-05-08')).toBe('2026-05-04'); // 금
    expect(getMondayOf('2026-05-09')).toBe('2026-05-04'); // 토
  });
  it('일요일 → 직전 월요일 (-6일)', () => {
    expect(getMondayOf('2026-05-10')).toBe('2026-05-04'); // 일
  });
  it('월 경계 (5월 첫 주 일요일)', () => {
    expect(getMondayOf('2026-05-03')).toBe('2026-04-27'); // 일 → 4/27 월
  });
  it('잘못된 입력 → null', () => {
    expect(getMondayOf(null)).toBeNull();
    expect(getMondayOf('')).toBeNull();
    expect(getMondayOf('not-a-date')).toBeNull();
  });
});

describe('sumWindow', () => {
  const logs = [
    { date: '2026-05-04', lang: 'en', utteranceCount: 10, passCount: 7 },
    { date: '2026-05-05', lang: 'en', utteranceCount: 15, passCount: 12 },
    { date: '2026-05-05', lang: 'ja', utteranceCount: 5, passCount: 3 },
    { date: '2026-05-06', lang: 'en', utteranceCount: 8, passCount: 6 },
    { date: '2026-05-11', lang: 'en', utteranceCount: 100, passCount: 50 }, // out of range
  ];

  it('범위 + lang=en 필터 — 4건 utterance 합', () => {
    expect(sumWindow(logs, '2026-05-04', '2026-05-10', 'en', 'utteranceCount')).toBe(33);
  });
  it('범위 + lang=ja 필터 — 1건', () => {
    expect(sumWindow(logs, '2026-05-04', '2026-05-10', 'ja', 'utteranceCount')).toBe(5);
  });
  it('lang=both — en + ja 모두 포함', () => {
    expect(sumWindow(logs, '2026-05-04', '2026-05-10', 'both', 'utteranceCount')).toBe(38);
  });
  it('passCount field 동일 동작', () => {
    expect(sumWindow(logs, '2026-05-04', '2026-05-10', 'en', 'passCount')).toBe(25);
  });
  it('범위 밖 entry 제외', () => {
    expect(sumWindow(logs, '2026-05-11', '2026-05-17', 'en', 'utteranceCount')).toBe(100);
  });
  it('빈 배열 / null → 0', () => {
    expect(sumWindow([], '2026-05-04', '2026-05-10', 'en', 'utteranceCount')).toBe(0);
    expect(sumWindow(null, '2026-05-04', '2026-05-10', 'en', 'utteranceCount')).toBe(0);
  });
});

describe('computeWeeklySliding', () => {
  it('7일 (월~일) 합산 — 같은 주', () => {
    const logs = [
      { date: '2026-05-04', lang: 'en', utteranceCount: 10 }, // 월
      { date: '2026-05-08', lang: 'en', utteranceCount: 20 }, // 금
      { date: '2026-05-10', lang: 'en', utteranceCount: 5 },  // 일
    ];
    expect(computeWeeklySliding(logs, '2026-05-04', 'en', 'utteranceCount')).toBe(35);
  });
  it('week_start +7일째 (다음 주 월요일) 제외', () => {
    const logs = [
      { date: '2026-05-04', lang: 'en', utteranceCount: 10 },
      { date: '2026-05-11', lang: 'en', utteranceCount: 99 }, // 다음 주
    ];
    expect(computeWeeklySliding(logs, '2026-05-04', 'en', 'utteranceCount')).toBe(10);
  });
  it('weekStart null → 0', () => {
    expect(computeWeeklySliding([{ utteranceCount: 99 }], null, 'en', 'utteranceCount')).toBe(0);
  });
});

describe('pushHistory', () => {
  it('FIFO push — 신규 entry 가 head', () => {
    const out = pushHistory(
      [{ type: 'daily_utterance', value: 30, achieved_at: '2026-04-30' }],
      { type: 'daily_utterance', value: 50, achieved_at: '2026-05-01' },
    );
    expect(out.length).toBe(2);
    expect(out[0].value).toBe(50);
    expect(out[1].value).toBe(30);
  });
  it('max 5 — 6번째 push 시 가장 오래된 것 drop', () => {
    let h = [];
    for (let i = 1; i <= 6; i++) {
      h = pushHistory(h, { type: 'daily_utterance', value: i, achieved_at: `2026-05-0${i}` });
    }
    expect(h.length).toBe(5);
    expect(h[0].value).toBe(6); // 최신
    expect(h[4].value).toBe(2); // 1 drop
  });
  it('dedupe — 직전 PR 의 type+achieved_at 동일 시 no-op', () => {
    const initial = [{ type: 'daily_utterance', value: 50, achieved_at: '2026-05-01' }];
    const out = pushHistory(initial, { type: 'daily_utterance', value: 50, achieved_at: '2026-05-01' });
    expect(out).toBe(initial);
  });
  it('잘못된 entry 가드 (type/value 누락)', () => {
    const initial = [{ type: 'daily_utterance', value: 50 }];
    expect(pushHistory(initial, { type: 'daily_utterance' })).toBe(initial);
    expect(pushHistory(initial, { value: 50 })).toBe(initial);
    expect(pushHistory(initial, null)).toBe(initial);
  });
  it('history 인자가 배열 아니면 빈 배열에서 시작', () => {
    expect(pushHistory(null, { type: 'daily_utterance', value: 1, achieved_at: '2026-05-01' }).length).toBe(1);
  });
});

describe('checkPRUpdate', () => {
  const baseRecords = {
    daily_utterance: { value: 30, achieved_at: '2026-04-30', lang: 'en' },
    daily_study_time: { value: 1200, achieved_at: '2026-04-30', lang: 'en' },
    weekly_utterance: { value: 100, week_start: '2026-04-27', lang: 'en' },
    weekly_pass: { value: 70, week_start: '2026-04-27', lang: 'en' },
    history: [],
  };

  it('4종 모두 PR 갱신 시 4건 반환', () => {
    const updates = checkPRUpdate(
      baseRecords,
      { date: '2026-05-04', lang: 'en', utteranceCount: 50, studyTimeSec: 1800, passCount: 40 },
      { utterance: 150, pass: 100 },
      'en',
    );
    expect(updates.length).toBe(4);
    expect(updates[0]).toMatchObject({ type: 'daily_utterance', value: 50, achieved_at: '2026-05-04' });
    expect(updates[2]).toMatchObject({ type: 'weekly_utterance', value: 150, week_start: '2026-05-04' });
  });

  it('boundary — 정확 같음 (>): 갱신 안 함', () => {
    const updates = checkPRUpdate(
      baseRecords,
      { date: '2026-05-04', lang: 'en', utteranceCount: 30, studyTimeSec: 1200, passCount: 0 },
      { utterance: 100, pass: 70 },
      'en',
    );
    expect(updates.length).toBe(0);
  });

  it('boundary — +1 만 갱신', () => {
    const updates = checkPRUpdate(
      baseRecords,
      { date: '2026-05-04', lang: 'en', utteranceCount: 31, studyTimeSec: 1200, passCount: 0 },
      { utterance: 100, pass: 70 },
      'en',
    );
    expect(updates.length).toBe(1);
    expect(updates[0].type).toBe('daily_utterance');
    expect(updates[0].value).toBe(31);
  });

  it('PR 미존재 (null) → 0보다 크면 무조건 갱신', () => {
    const updates = checkPRUpdate(
      { history: [] },
      { date: '2026-05-04', lang: 'en', utteranceCount: 1, studyTimeSec: 1, passCount: 1 },
      { utterance: 1, pass: 1 },
      'en',
    );
    expect(updates.length).toBe(4);
  });

  it('todayLog 누락 → 빈 배열', () => {
    expect(checkPRUpdate(baseRecords, null, { utterance: 1000 }, 'en')).toEqual([]);
    expect(checkPRUpdate(baseRecords, {}, { utterance: 1000 }, 'en')).toEqual([]);
  });

  it('weekly PR 에 week_start 포함', () => {
    const updates = checkPRUpdate(
      baseRecords,
      { date: '2026-05-08', lang: 'en', utteranceCount: 0, studyTimeSec: 0, passCount: 0 },
      { utterance: 200, pass: 0 },
      'en',
    );
    expect(updates.length).toBe(1);
    expect(updates[0].week_start).toBe('2026-05-04'); // 5/8 (금) → 같은 주 월=5/4
  });
});

describe('applyPRUpdate (DB 통합)', () => {
  let db;
  beforeEach(() => {
    const meta = new Map();
    const sessionLogs = new Map();
    db = {
      _meta: meta,
      _sessionLogs: sessionLogs,
      meta: {
        async bulkGet(keys) { return keys.map((k) => meta.get(k)); },
        async put(rec) { meta.set(rec.key, { ...rec }); return rec.key; },
      },
      sessionLogs: {
        async toArray() { return Array.from(sessionLogs.values()); },
      },
    };
    // applyPRUpdate 가 today 를 new Date() 로 산출 — 테스트 결정적 위해 vi.useFakeTimers
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-04T09:00:00Z'));
  });

  it('첫 PR — meta 미존재 + 오늘 sessionLog 1건 → 4종 모두 갱신', async () => {
    db._sessionLogs.set('s1', { id: 's1', date: '2026-05-04', lang: 'en', utteranceCount: 50, durationSec: 1800, passCount: 40 });
    const result = await applyPRUpdate(db, 'en');
    expect(result.updated).toBe(true);
    expect(result.newPRs.length).toBe(4);
    expect(db._meta.get('prDailyUtterance').value.value).toBe(50);
    expect(db._meta.get('prDailyStudyTime').value.value).toBe(1800);
    expect(db._meta.get('prWeeklyUtterance').value.value).toBe(50);
    expect(db._meta.get('prWeeklyPass').value.value).toBe(40);
    expect(db._meta.get('prHistory').value).toEqual([]); // 첫 PR — prevPRs 없음
  });

  it('PR 미갱신 — 기존 값보다 작으면 updated=false', async () => {
    db._meta.set('prDailyUtterance', { key: 'prDailyUtterance', value: { value: 100, achieved_at: '2026-04-30', lang: 'en' } });
    db._meta.set('prDailyStudyTime', { key: 'prDailyStudyTime', value: { value: 9999, achieved_at: '2026-04-30', lang: 'en' } });
    db._meta.set('prWeeklyUtterance', { key: 'prWeeklyUtterance', value: { value: 9999, week_start: '2026-04-27', lang: 'en' } });
    db._meta.set('prWeeklyPass', { key: 'prWeeklyPass', value: { value: 9999, week_start: '2026-04-27', lang: 'en' } });
    db._sessionLogs.set('s1', { id: 's1', date: '2026-05-04', lang: 'en', utteranceCount: 50, durationSec: 1800, passCount: 40 });
    const result = await applyPRUpdate(db, 'en');
    expect(result.updated).toBe(false);
    expect(result.newPRs.length).toBe(0);
  });

  it('일부 갱신 + history 에 직전 PR push', async () => {
    db._meta.set('prDailyUtterance', { key: 'prDailyUtterance', value: { value: 30, achieved_at: '2026-04-30', lang: 'en' } });
    db._meta.set('prDailyStudyTime', { key: 'prDailyStudyTime', value: { value: 9999, achieved_at: '2026-04-30', lang: 'en' } });
    db._sessionLogs.set('s1', { id: 's1', date: '2026-05-04', lang: 'en', utteranceCount: 50, durationSec: 1800, passCount: 40 });
    const result = await applyPRUpdate(db, 'en');
    expect(result.updated).toBe(true);
    expect(result.newPRs.length).toBe(3); // daily_utterance + weekly 2 (study_time 미갱신)
    const history = db._meta.get('prHistory').value;
    expect(history.length).toBe(1); // 직전 daily_utterance 만 history (다른 PR 첫 등장)
    expect(history[0].value).toBe(30);
    expect(history[0].type).toBe('daily_utterance');
  });

  it('lang=ja — en sessionLogs 무관', async () => {
    db._sessionLogs.set('s1', { id: 's1', date: '2026-05-04', lang: 'en', utteranceCount: 50, durationSec: 1800, passCount: 40 });
    db._sessionLogs.set('s2', { id: 's2', date: '2026-05-04', lang: 'ja', utteranceCount: 10, durationSec: 600, passCount: 8 });
    const result = await applyPRUpdate(db, 'ja');
    expect(result.updated).toBe(true);
    expect(db._meta.get('prDailyUtterance').value.value).toBe(10); // ja 만
  });

  it('가드 — db / lang 누락 → noop', async () => {
    expect((await applyPRUpdate(null, 'en')).updated).toBe(false);
    expect((await applyPRUpdate(db, '')).updated).toBe(false);
    const noStores = { meta: db.meta }; // sessionLogs 없음
    expect((await applyPRUpdate(noStores, 'en')).updated).toBe(false);
  });

  it('prTypeToDexieKey — 4종 매핑 + 잘못된 type 은 null', () => {
    expect(__test__.prTypeToDexieKey('daily_utterance')).toBe('prDailyUtterance');
    expect(__test__.prTypeToDexieKey('daily_study_time')).toBe('prDailyStudyTime');
    expect(__test__.prTypeToDexieKey('weekly_utterance')).toBe('prWeeklyUtterance');
    expect(__test__.prTypeToDexieKey('weekly_pass')).toBe('prWeeklyPass');
    expect(__test__.prTypeToDexieKey('unknown')).toBeNull();
  });
});
