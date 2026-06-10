import { describe, it, expect } from 'vitest';
import { beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createGymDB } from '../db/schema.js';
import {
  compareDelta,
  formatDelta,
  summarizeVolumes,
  parseMonthLabel,
  applyTodayToCalendar,
  sessionToWorkoutEntry,
  mergeWorkoutEntries,
  deleteSessionByDay,
  shiftMonth,
  renderCalendarGrid,
} from './stats.js';

const NOW_THU = new Date('2026-04-30T10:00:00').getTime(); // 목요일

describe('compareDelta', () => {
  it('previous=0, current=0 → flat 0', () => {
    expect(compareDelta(0, 0)).toEqual({ delta: 0, sign: 'flat' });
  });

  it('previous=0, current>0 → 신규 (delta=null, sign=up)', () => {
    expect(compareDelta(100, 0)).toEqual({ delta: null, sign: 'up' });
  });

  it('current>previous → up + 양수', () => {
    expect(compareDelta(120, 100)).toEqual({ delta: 20, sign: 'up' });
  });

  it('current<previous → down + 음수', () => {
    expect(compareDelta(80, 100)).toEqual({ delta: -20, sign: 'down' });
  });

  it('current===previous → flat 0', () => {
    expect(compareDelta(100, 100)).toEqual({ delta: 0, sign: 'flat' });
  });

  it('falsy/NaN → 0 처리', () => {
    expect(compareDelta(undefined, undefined)).toEqual({ delta: 0, sign: 'flat' });
    expect(compareDelta(NaN, 100)).toEqual({ delta: -100, sign: 'down' });
  });

  it('정수 반올림', () => {
    expect(compareDelta(108, 100).delta).toBe(8);
    expect(compareDelta(107, 100).delta).toBe(7);
    expect(compareDelta(105, 100).delta).toBe(5);
    expect(compareDelta(104, 100).delta).toBe(4);
  });
});

describe('formatDelta', () => {
  it('up → "+N%"', () => {
    expect(formatDelta({ delta: 8, sign: 'up' })).toBe('+8%');
  });

  it('down → "-N%" (이미 음수)', () => {
    expect(formatDelta({ delta: -3, sign: 'down' })).toBe('-3%');
  });

  it('flat → "±0%"', () => {
    expect(formatDelta({ delta: 0, sign: 'flat' })).toBe('±0%');
  });

  it('null delta → "신규"', () => {
    expect(formatDelta({ delta: null, sign: 'up' })).toBe('신규');
  });
});

describe('summarizeVolumes', () => {
  it('빈 sessions → 모두 0 + flat', () => {
    const r = summarizeVolumes([], NOW_THU);
    expect(r.week).toEqual({ current: 0, previous: 0, delta: 0, sign: 'flat' });
    expect(r.month).toEqual({ current: 0, previous: 0, delta: 0, sign: 'flat' });
  });

  it('이번 주 (4/27~5/3) — 한 건 합산', () => {
    const sessions = [
      { date: '2026-04-27', totalVolume: 1000, status: 'completed' },
      { date: '2026-04-29', totalVolume: 500, status: 'completed' },
    ];
    const r = summarizeVolumes(sessions, NOW_THU);
    expect(r.week.current).toBe(1500);
    expect(r.week.previous).toBe(0);
    expect(r.week.delta).toBeNull(); // 신규
    expect(r.week.sign).toBe('up');
  });

  it('지난 주 (4/20~4/26) 와 이번 주 비교', () => {
    const sessions = [
      { date: '2026-04-20', totalVolume: 800, status: 'completed' }, // 지난 주
      { date: '2026-04-22', totalVolume: 1200, status: 'completed' }, // 지난 주
      { date: '2026-04-27', totalVolume: 1500, status: 'completed' }, // 이번 주
      { date: '2026-04-29', totalVolume: 800, status: 'completed' },  // 이번 주
    ];
    const r = summarizeVolumes(sessions, NOW_THU);
    expect(r.week.current).toBe(2300); // 1500+800
    expect(r.week.previous).toBe(2000); // 800+1200
    expect(r.week.delta).toBe(15);
    expect(r.week.sign).toBe('up');
  });

  it('이번 달 (4/1~4/30) — 모든 날짜 합산', () => {
    const sessions = [
      { date: '2026-04-01', totalVolume: 1000, status: 'completed' },
      { date: '2026-04-15', totalVolume: 2000, status: 'completed' },
      { date: '2026-04-30', totalVolume: 1500, status: 'completed' },
    ];
    const r = summarizeVolumes(sessions, NOW_THU);
    expect(r.month.current).toBe(4500);
  });

  it('지난 달 (3월) 비교', () => {
    const sessions = [
      { date: '2026-03-15', totalVolume: 3000, status: 'completed' },
      { date: '2026-03-25', totalVolume: 2000, status: 'completed' },
      { date: '2026-04-15', totalVolume: 5500, status: 'completed' },
    ];
    const r = summarizeVolumes(sessions, NOW_THU);
    expect(r.month.current).toBe(5500);
    expect(r.month.previous).toBe(5000);
    expect(r.month.delta).toBe(10);
    expect(r.month.sign).toBe('up');
  });

  it('범위 외 sessions (3개월 전 등) 무시', () => {
    const sessions = [
      { date: '2026-01-15', totalVolume: 99999, status: 'completed' },
      { date: '2026-04-15', totalVolume: 100, status: 'completed' },
    ];
    const r = summarizeVolumes(sessions, NOW_THU);
    expect(r.month.current).toBe(100);
    expect(r.month.previous).toBe(0); // 3월 0건
  });

  it('1월 → 12월 작년 비교 (year 경계)', () => {
    const NOW_JAN = new Date('2026-01-15T10:00:00').getTime();
    const sessions = [
      { date: '2025-12-20', totalVolume: 2000, status: 'completed' },
      { date: '2026-01-10', totalVolume: 1000, status: 'completed' },
    ];
    const r = summarizeVolumes(sessions, NOW_JAN);
    expect(r.month.current).toBe(1000);
    expect(r.month.previous).toBe(2000);
    expect(r.month.sign).toBe('down');
    expect(r.month.delta).toBe(-50);
  });
});

describe('sessionToWorkoutEntry', () => {
  it('null/undefined → 빈 entry', () => {
    expect(sessionToWorkoutEntry(null)).toEqual({
      tag: '', vol: 0, min: 0, pr: 0, level: 'low', ex: [], sessionId: null,
    });
  });

  it('spec §12 형식 — 영문→한국어 매핑 + 합계 + tag 약어', () => {
    const session = {
      id: 'session_1',
      tags: ['chest', 'arms'],
      totalVolume: 4500,
      durationMin: 45,
      blocks: [
        {
          type: 'single',
          exerciseId: 'bench_press',
          sets: [
            { weight: 60, reps: 10, done: true, pr: false },
            { weight: 65, reps: 8, done: true, pr: true },
          ],
        },
      ],
    };
    const r = sessionToWorkoutEntry(session);
    expect(r.tag).toBe('가'); // chest → 가
    expect(r.vol).toBe(4500);
    expect(r.level).toBe('med'); // 3000~6000
    expect(r.min).toBe(45);
    expect(r.pr).toBe(1);
    expect(r.ex).toHaveLength(1);
    expect(r.ex[0]).toMatchObject({ n: '벤치프레스', s: '2세트 · 1,120kg', kind: 'weight' });
    expect(r.sessionId).toBe('session_1');
  });

  it('vol 기반 level — low / med / high', () => {
    const make = (vol) => ({ totalVolume: vol, blocks: [] });
    expect(sessionToWorkoutEntry(make(0)).level).toBe('low');
    expect(sessionToWorkoutEntry(make(2999)).level).toBe('low');
    expect(sessionToWorkoutEntry(make(3000)).level).toBe('med');
    expect(sessionToWorkoutEntry(make(5999)).level).toBe('med');
    expect(sessionToWorkoutEntry(make(6000)).level).toBe('high');
    expect(sessionToWorkoutEntry(make(99999)).level).toBe('high');
  });

  it('mocks Wave 11.6D 형식 fallback (b.exercises)', () => {
    const session = {
      tags: ['back'],
      totalVolume: 1340,
      durationMin: 60,
      blocks: [{
        type: 'single',
        exercises: [{
          exerciseId: '벤치프레스',
          exerciseName: '벤치프레스',
          sets: [
            { weight: 60, reps: 12, done: true },
            { weight: 65, reps: 10, done: true },
          ],
        }],
      }],
    };
    const r = sessionToWorkoutEntry(session);
    expect(r.tag).toBe('등'); // back → 등
    expect(r.ex).toHaveLength(1);
    expect(r.ex[0]).toMatchObject({ n: '벤치프레스', s: '2세트 · 1,370kg', kind: 'weight' });
  });

  it('cardio (duration) — 분/km 표시', () => {
    const session = {
      tags: ['cardio'],
      totalVolume: 0,
      durationMin: 30,
      blocks: [{
        type: 'single',
        exerciseId: 'treadmill',
        sets: [{ duration: 1800, distance: 5, done: true, pr: false }],
      }],
    };
    const r = sessionToWorkoutEntry(session);
    expect(r.tag).toBe('맨'); // 카테고리 표시명 유산소→맨몸 (2026-06-10)
    expect(r.ex).toHaveLength(1);
    expect(r.ex[0]).toMatchObject({ n: '트레드밀', s: '30분 · 5km', kind: 'cardio' });
  });

  it('done:false 세트 무시 (preset 만 있는 운동) → ex 에서 제외', () => {
    const session = {
      tags: ['chest'],
      totalVolume: 0,
      blocks: [{
        type: 'single',
        exerciseId: 'bench_press',
        sets: [{ weight: 60, reps: 10, done: false, preset: true, pr: false }],
      }],
    };
    const r = sessionToWorkoutEntry(session);
    expect(r.ex).toEqual([]);
  });

  it('circuit 블록 — 본 wave 범위 외, ex 에서 제외', () => {
    const session = {
      tags: ['arms'],
      totalVolume: 0,
      blocks: [{
        type: 'circuit',
        rounds: [[{ exerciseId: 'pushup', reps: 10, done: true }]],
      }],
    };
    const r = sessionToWorkoutEntry(session);
    expect(r.ex).toEqual([]);
  });

  it('multi-운동 — PR 합산', () => {
    const session = {
      tags: ['chest'],
      totalVolume: 1700,
      blocks: [
        {
          type: 'single',
          exerciseId: 'bench_press',
          sets: [
            { weight: 60, reps: 10, done: true, pr: true },
          ],
        },
        {
          type: 'single',
          exerciseId: 'incline_bench',
          sets: [
            { weight: 50, reps: 10, done: true, pr: true },
            { weight: 50, reps: 8, done: true, pr: false },
          ],
        },
      ],
    };
    const r = sessionToWorkoutEntry(session);
    expect(r.pr).toBe(2);
    expect(r.ex.length).toBe(2);
  });

  it('미매핑 exerciseId — 영문 그대로', () => {
    const session = {
      tags: ['chest'],
      blocks: [{
        type: 'single',
        exerciseId: 'cust_xx',
        sets: [{ weight: 40, reps: 12, done: true, pr: false }],
      }],
    };
    const r = sessionToWorkoutEntry(session);
    expect(r.ex[0].n).toBe('cust_xx');
  });
});

describe('mergeWorkoutEntries', () => {
  it('빈 입력 → defaultEntry', () => {
    expect(mergeWorkoutEntries([])).toEqual({ tag: '', vol: 0, min: 0, pr: 0, level: 'low', ex: [], sessionId: null });
  });

  it('단일 entry → 그대로 반환', () => {
    const e = { tag: '가', vol: 100, min: 10, pr: 0, level: 'low', ex: [], sessionId: 's1' };
    expect(mergeWorkoutEntries([e])).toBe(e);
  });

  it('같은 종목 weight 두 세션 → setCount/vol 합산, 표시 재포맷', () => {
    const e1 = { tag: '가', vol: 600, min: 30, pr: 0, level: 'low', sessionId: 's1', ex: [{ n: '벤치프레스', s: '5세트 · 600kg', key: 'bench_press', kind: 'weight', setCount: 5, vol: 600 }] };
    const e2 = { tag: '가', vol: 400, min: 20, pr: 1, level: 'low', sessionId: 's2', ex: [{ n: '벤치프레스', s: '3세트 · 400kg', key: 'bench_press', kind: 'weight', setCount: 3, vol: 400 }] };
    const r = mergeWorkoutEntries([e1, e2]);
    expect(r.vol).toBe(1000);
    expect(r.min).toBe(50);
    expect(r.pr).toBe(1);
    expect(r.sessionId).toBe('s2');
    expect(r.ex).toHaveLength(1);
    expect(r.ex[0]).toMatchObject({ n: '벤치프레스', setCount: 8, vol: 1000, s: '8세트 · 1,000kg' });
  });

  it('다른 종목은 별도 row 로 누적', () => {
    const e1 = { tag: '가', vol: 600, min: 30, pr: 0, level: 'low', sessionId: 's1', ex: [{ n: '벤치프레스', s: '5세트 · 600kg', key: 'bench_press', kind: 'weight', setCount: 5, vol: 600 }] };
    const e2 = { tag: '등', vol: 720, min: 25, pr: 0, level: 'low', sessionId: 's2', ex: [{ n: '데드리프트', s: '4세트 · 720kg', key: 'deadlift', kind: 'weight', setCount: 4, vol: 720 }] };
    const r = mergeWorkoutEntries([e1, e2]);
    expect(r.ex).toHaveLength(2);
    expect(r.ex[0].n).toBe('벤치프레스');
    expect(r.ex[1].n).toBe('데드리프트');
  });

  it('cardio 합산 — durSec/distKm 합산', () => {
    const e1 = { tag: '유', vol: 0, min: 30, pr: 0, level: 'low', sessionId: 's1', ex: [{ n: '트레드밀', s: '30분 · 5km', key: 'treadmill', kind: 'cardio', durSec: 1800, distKm: 5 }] };
    const e2 = { tag: '유', vol: 0, min: 20, pr: 0, level: 'low', sessionId: 's2', ex: [{ n: '트레드밀', s: '20분 · 3km', key: 'treadmill', kind: 'cardio', durSec: 1200, distKm: 3 }] };
    const r = mergeWorkoutEntries([e1, e2]);
    expect(r.ex).toHaveLength(1);
    expect(r.ex[0]).toMatchObject({ durSec: 3000, distKm: 8, s: '50분 · 8km' });
  });

  it('vol 합산 후 level 재계산 (low+high → high)', () => {
    const e1 = { tag: '가', vol: 2000, min: 30, pr: 0, level: 'low', sessionId: 's1', ex: [] };
    const e2 = { tag: '가', vol: 5000, min: 30, pr: 0, level: 'med', sessionId: 's2', ex: [] };
    expect(mergeWorkoutEntries([e1, e2]).level).toBe('high');
  });
});

describe('deleteSessionByDay', () => {
  let db;

  beforeEach(async () => {
    db = createGymDB(`test-stats-del-${Math.random().toString(36).slice(2, 10)}`);
    await db.open();
    globalThis.window = globalThis.window || {};
    globalThis.window.gymDB = db;
  });

  afterEach(async () => {
    await db.delete();
    delete globalThis.window.gymDB;
  });

  it('sessionId 우선 — 즉시 삭제', async () => {
    await db.sessions.put({
      id: 'session_x', date: '2026-04-30',
      startTime: 0, endTime: 0,
      blocks: [], tags: [], totalVolume: 0, totalCalories: 0, durationMin: 0,
      status: 'completed',
    });
    const r = await deleteSessionByDay(30, 'session_x');
    expect(r.ok).toBe(true);
    expect(r.deletedId).toBe('session_x');
    expect(await db.sessions.toArray()).toEqual([]);
  });

  it('sessionId 없음 → monthLabel 파싱 + getSessionByDate', async () => {
    await db.sessions.put({
      id: 'session_y', date: '2026-04-15',
      startTime: 0, endTime: 0,
      blocks: [], tags: [], totalVolume: 0, totalCalories: 0, durationMin: 0,
      status: 'completed',
    });
    const fakeDoc = {
      getElementById: (id) => id === 'monthLabel' ? { textContent: '2026년 4월' } : null,
    };
    const r = await deleteSessionByDay(15, null, fakeDoc);
    expect(r.ok).toBe(true);
    expect(r.deletedId).toBe('session_y');
    expect(r.iso).toBe('2026-04-15');
    expect(await db.sessions.toArray()).toEqual([]);
  });

  it('monthLabel 없음 → no_month_context', async () => {
    const fakeDoc = { getElementById: () => null };
    const r = await deleteSessionByDay(15, null, fakeDoc);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_month_context');
  });

  it('해당 date 의 completed session 없음 → no_session', async () => {
    const fakeDoc = {
      getElementById: (id) => id === 'monthLabel' ? { textContent: '2026년 4월' } : null,
    };
    const r = await deleteSessionByDay(20, null, fakeDoc);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_session');
    expect(r.iso).toBe('2026-04-20');
  });

  it('day/sessionId 모두 누락 → invalid_input', async () => {
    const r = await deleteSessionByDay(null, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_input');
  });

  it('active session 은 getSessionByDate 가 안 잡음 → no_session', async () => {
    await db.sessions.put({
      id: 'session_active', date: '2026-04-15',
      startTime: 0, endTime: null,
      blocks: [], tags: [], totalVolume: 0, totalCalories: 0, durationMin: 0,
      status: 'active',
    });
    const fakeDoc = {
      getElementById: (id) => id === 'monthLabel' ? { textContent: '2026년 4월' } : null,
    };
    const r = await deleteSessionByDay(15, null, fakeDoc);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_session');
    // active 보존 (삭제 안 됨)
    expect(await db.sessions.toArray()).toHaveLength(1);
  });
});

describe('parseMonthLabel', () => {
  it('정상 — "2026년 4월"', () => {
    expect(parseMonthLabel('2026년 4월')).toEqual({ year: 2026, month: 4 });
  });

  it('v2 다크 시안 형식 — "2026 · 5월"', () => {
    expect(parseMonthLabel('2026 · 5월')).toEqual({ year: 2026, month: 5 });
    expect(parseMonthLabel('2026·12월')).toEqual({ year: 2026, month: 12 });
  });

  it('한 자리 월 — 1자리/2자리 모두', () => {
    expect(parseMonthLabel('2026년 1월')).toEqual({ year: 2026, month: 1 });
    expect(parseMonthLabel('2026년 12월')).toEqual({ year: 2026, month: 12 });
  });

  it('잘못된 형식 → null', () => {
    expect(parseMonthLabel('')).toBeNull();
    expect(parseMonthLabel(null)).toBeNull();
    expect(parseMonthLabel('Hello')).toBeNull();
    expect(parseMonthLabel('2026-04')).toBeNull();
  });
});

// applyTodayToCalendar 는 DOM 의존이라 단위에선 mock document 사용
function makeMockGrid({ days, todayCells = [], monthLabel = '2026년 4월' } = {}) {
  // jsdom 미설치 환경에서도 동작하는 단순 fake document
  const cells = [];
  for (let d = 1; d <= days; d++) {
    cells.push({
      classList: {
        _set: new Set(todayCells.includes(d) ? ['cal-cell', 'today'] : ['cal-cell']),
        contains(c) { return this._set.has(c); },
        add(c) { this._set.add(c); },
        remove(c) { this._set.delete(c); },
      },
      _day: d,
    });
  }
  const grid = {
    querySelectorAll: (sel) => {
      if (sel === '.cal-cell.today') return cells.filter((c) => c.classList.contains('today'));
      return [];
    },
    querySelector: (sel) => {
      const m = sel.match(/\[data-day="(\d+)"\]/);
      if (!m) return null;
      const day = parseInt(m[1], 10);
      return cells.find((c) => c._day === day) || null;
    },
  };
  const label = { textContent: monthLabel };
  return {
    getElementById: (id) => {
      if (id === 'calGrid') return grid;
      if (id === 'monthLabel') return label;
      return null;
    },
    _cells: cells,
  };
}

describe('applyTodayToCalendar', () => {
  it('표시 월 = today 월 → today 클래스 부여', () => {
    const doc = makeMockGrid({ days: 30, monthLabel: '2026년 4월' });
    const NOW = new Date('2026-04-30T10:00:00').getTime();
    const r = applyTodayToCalendar(NOW, doc);
    expect(r.applied).toBe(true);
    expect(r.day).toBe(30);
    expect(doc._cells[29].classList.contains('today')).toBe(true);
  });

  it('표시 월 ≠ today 월 → today 모두 제거 (잔존 방지)', () => {
    const doc = makeMockGrid({ days: 31, todayCells: [22], monthLabel: '2026년 5월' });
    const NOW = new Date('2026-04-30T10:00:00').getTime();
    const r = applyTodayToCalendar(NOW, doc);
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('different_month');
    expect(doc._cells[21].classList.contains('today')).toBe(false);
  });

  it('잔존 today 클래스 제거 후 새 today 부여', () => {
    const doc = makeMockGrid({ days: 30, todayCells: [22], monthLabel: '2026년 4월' });
    const NOW = new Date('2026-04-30T10:00:00').getTime();
    const r = applyTodayToCalendar(NOW, doc);
    expect(r.applied).toBe(true);
    expect(doc._cells[21].classList.contains('today')).toBe(false); // 22 일 제거됨
    expect(doc._cells[29].classList.contains('today')).toBe(true);  // 30 일 부여
  });

  it('document 없음 → skipped no-document', () => {
    const r = applyTodayToCalendar(Date.now(), null);
    // 두번째 인자에 null 넘기면 document fallback. 그러나 vitest node 에 document 없음 → skip
    // 안전하게 fake doc 미공급 시 오류 안 나야
    expect(['no-document', 'no-mounts'].includes(r.skipped) || r.applied !== undefined).toBe(true);
  });

  it('grid 또는 label 없음 → skipped no-mounts', () => {
    const fakeDoc = { getElementById: () => null };
    const r = applyTodayToCalendar(Date.now(), fakeDoc);
    expect(r.skipped).toBe('no-mounts');
  });

  it('parseMonthLabel 실패 → different_month', () => {
    const doc = makeMockGrid({ days: 30, monthLabel: 'invalid' });
    const NOW = new Date('2026-04-30T10:00:00').getTime();
    const r = applyTodayToCalendar(NOW, doc);
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('different_month');
  });
});

describe('sessionToWorkoutEntry — 값 미입력 done 세트 (라이브 2026-06-10 발견)', () => {
  it('weight/duration 전부 null 인 done 세트 → "N세트" (0kg 표기 생략)', () => {
    const r = sessionToWorkoutEntry({
      id: 's-x', date: '2026-06-09', status: 'completed', totalVolume: 0,
      blocks: [{ type: 'single', exerciseId: 'treadmill', sets: [{ done: true, weight: null, reps: null }] }],
    });
    expect(r.ex[0].s).toBe('1세트');
  });
});

// P7 — 캘린더 월 동적 렌더 + 월 네비 (mock 정적 "2026 · 5월" 고정 버그 수정)
describe('shiftMonth', () => {
  it('+1 → 다음 달', () => {
    expect(shiftMonth({ year: 2026, month: 6 }, 1)).toEqual({ year: 2026, month: 7 });
  });

  it('-1 → 이전 달', () => {
    expect(shiftMonth({ year: 2026, month: 6 }, -1)).toEqual({ year: 2026, month: 5 });
  });

  it('12월 +1 → 다음해 1월', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });

  it('1월 -1 → 전해 12월', () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe('renderCalendarGrid', () => {
  function makeRenderDoc({ monthLabel = '2026 · 5월' } = {}) {
    const grid = { innerHTML: 'stale-fixture' };
    const label = { textContent: monthLabel };
    return {
      getElementById: (id) => (id === 'calGrid' ? grid : id === 'monthLabel' ? label : null),
      _grid: grid,
      _label: label,
    };
  }

  it('2026년 6월 → 라벨 갱신 + 30개 cal-cell + 선행 empty 0 (6/1 월요일)', () => {
    const doc = makeRenderDoc();
    const r = renderCalendarGrid(2026, 6, doc);
    expect(r.rendered).toBe(true);
    expect(doc._label.textContent).toBe('2026 · 6월');
    const html = doc._grid.innerHTML;
    expect((html.match(/cal-cell/g) || []).length).toBe(30);
    expect(html.startsWith('<div class="cal-cell"')).toBe(true);
    expect(html).toContain('data-day="30"');
    expect(html).not.toContain('data-day="31"');
  });

  it('2026년 5월 → 31개 cal-cell + 선행 empty 4 (5/1 금요일)', () => {
    const doc = makeRenderDoc();
    renderCalendarGrid(2026, 5, doc);
    const html = doc._grid.innerHTML;
    expect((html.match(/cal-cell/g) || []).length).toBe(31);
    expect(html.startsWith('<div></div><div></div><div></div><div></div><div class="cal-cell"')).toBe(true);
    expect(html).toContain('data-day="31"');
  });

  it('grid/label 없음 → skipped no-mounts', () => {
    const r = renderCalendarGrid(2026, 6, { getElementById: () => null });
    expect(r.skipped).toBe('no-mounts');
  });
});

describe('applyTrendToDom + applyBodyPartsToDom (W-I)', () => {
  function makeBindDoc(keys) {
    const map = new Map();
    for (const k of keys) map.set(k, { textContent: '', innerHTML: '' });
    return {
      getElementById: () => null, // SVG skip
      querySelector: (sel) => {
        const m = sel.match(/\[data-bind="([^"]+)"\]/);
        return m ? map.get(m[1]) : null;
      },
      _map: map,
    };
  }
  it('renderWeeklyTrendChart 빈 trend → no-op (svg 없음 graceful)', async () => {
    const { renderWeeklyTrendChart } = await import('./stats.js');
    const doc = makeBindDoc([]);
    expect(() => renderWeeklyTrendChart([], doc)).not.toThrow();
    expect(() => renderWeeklyTrendChart([{ weekStart: '2026-05-11', vol: 1000 }], doc)).not.toThrow();
  });
  it('summarizeExerciseFrequency — done 세트만 종목별 누적 + 빈도순', async () => {
    const { summarizeExerciseFrequency } = await import('./stats.js');
    const sessions = [
      { blocks: [
        { type: 'single', exerciseId: 'bench_press', sets: [{ done: true }, { done: true }, { done: false }] },
        { type: 'single', exerciseId: 'squat', sets: [{ done: true }] },
      ]},
      { blocks: [
        { type: 'single', exerciseId: 'bench_press', sets: [{ done: true }] },
        { type: 'single', exerciseId: 'deadlift', sets: [{ done: true }, { done: true }] },
      ]},
    ];
    const rows = summarizeExerciseFrequency(sessions);
    expect(rows.length).toBe(3);
    expect(rows[0]).toMatchObject({ exerciseId: 'bench_press', setCount: 3 });
    expect(rows[1]).toMatchObject({ exerciseId: 'deadlift', setCount: 2 });
    expect(rows[2]).toMatchObject({ exerciseId: 'squat', setCount: 1 });
  });
  it('applyExerciseFrequencyToDom 빈 rows → empty 표시', async () => {
    const { applyExerciseFrequencyToDom } = await import('./stats.js');
    const empty = { style: { display: 'none' } };
    const totalEl = { textContent: '' };
    const treemapEl = { children: [empty], insertAdjacentHTML: () => {} };
    const doc = {
      querySelector: (sel) => {
        if (sel.includes('exercise-total')) return totalEl;
        if (sel.includes('exercise-treemap')) return treemapEl;
        if (sel.includes('exercise-empty')) return empty;
        return null;
      },
    };
    applyExerciseFrequencyToDom([], doc);
    expect(totalEl.textContent).toBe('0');
    expect(empty.style.display).toBe('');
  });
  it('applyBodyPartsToDom 빈 parts → "기록 없음"', async () => {
    const { applyBodyPartsToDom } = await import('./stats.js');
    const doc = makeBindDoc(['body-total', 'body-stack', 'body-list']);
    applyBodyPartsToDom([], doc);
    expect(doc._map.get('body-total').textContent).toBe('0');
    expect(doc._map.get('body-stack').innerHTML).toBe('');
    expect(doc._map.get('body-list').innerHTML).toContain('기록 없음');
  });
  it('applyBodyPartsToDom 3부위 → 합계 + 행 생성', async () => {
    const { applyBodyPartsToDom } = await import('./stats.js');
    const doc = makeBindDoc(['body-total', 'body-stack', 'body-list']);
    applyBodyPartsToDom([
      { key: 'chest', name: '가슴', count: 5, color: '#d97757' },
      { key: 'back', name: '등', count: 3, color: '#788c5d' },
      { key: 'legs', name: '하체', count: 2, color: '#b85a3e' },
    ], doc);
    expect(doc._map.get('body-total').textContent).toBe('10');
    expect(doc._map.get('body-stack').innerHTML).toContain('width:50.0%');
    expect(doc._map.get('body-list').innerHTML).toContain('가슴');
    expect(doc._map.get('body-list').innerHTML).toContain('50%');
  });
});

describe('summarizeMuscles (v3)', () => {
  const fakeGetBuiltin = (id) => ({ id });

  it('빈 sessions → 빈 배열', async () => {
    const { summarizeMuscles } = await import('./stats.js');
    expect(summarizeMuscles([], fakeGetBuiltin)).toEqual([]);
    expect(summarizeMuscles(null, fakeGetBuiltin)).toEqual([]);
  });

  it('벤치프레스 1세트 → chest 1.0 / triceps 0.4 / deltoid_front 0.4', async () => {
    const { summarizeMuscles } = await import('./stats.js');
    const r = summarizeMuscles(
      [{ blocks: [{ type: 'single', exerciseId: 'bench_press', sets: [{ done: true }] }] }],
      fakeGetBuiltin,
    );
    const m = Object.fromEntries(r.map((x) => [x.muscleKey, x.score]));
    expect(m.chest).toBe(1.0);
    expect(m.triceps).toBeCloseTo(0.4, 5);
    expect(m.deltoid_front).toBeCloseTo(0.4, 5);
  });

  it('스쿼트 2세트 → quads/glutes 2.0, hamstrings/lower_back 0.8', async () => {
    const { summarizeMuscles } = await import('./stats.js');
    const r = summarizeMuscles(
      [{ blocks: [{ type: 'single', exerciseId: 'squat', sets: [{ done: true }, { done: true }] }] }],
      fakeGetBuiltin,
    );
    const m = Object.fromEntries(r.map((x) => [x.muscleKey, x.score]));
    expect(m.quads).toBe(2.0);
    expect(m.glutes).toBe(2.0);
    expect(m.hamstrings).toBeCloseTo(0.8, 5);
    expect(m.lower_back).toBeCloseTo(0.8, 5);
  });

  it('done=false 세트 무시 / cardio + custom skip / score 내림차순 정렬', async () => {
    const { summarizeMuscles } = await import('./stats.js');
    const r = summarizeMuscles(
      [{ blocks: [
        { type: 'single', exerciseId: 'bench_press', sets: [{ done: false }, { done: true }, { done: true }, { done: true }] },
        { type: 'single', exerciseId: 'treadmill', sets: [{ done: true }] },
        { type: 'single', exerciseId: 'bicep_curl', sets: [{ done: true }] },
      ] }],
      fakeGetBuiltin,
    );
    expect(r[0].muscleKey).toBe('chest');
    expect(r[0].score).toBe(3.0);
    expect(summarizeMuscles([{ blocks: [{ type: 'single', exerciseId: 'x', sets: [{ done: true }] }] }], () => null)).toEqual([]);
  });
});

describe('applyMusclesToSilhouette', () => {
  function makeSilhouetteDoc(muscleKeys) {
    const paths = muscleKeys.map((k) => ({
      _attrs: {}, style: {},
      setAttribute(name, v) { this._attrs[name] = v; },
      getAttribute(name) { return name === 'data-muscle' ? k : this._attrs[name]; },
    }));
    return { querySelectorAll: () => paths, querySelector: () => null, _paths: paths };
  }

  it('max=5: chest ratio=1 alpha 0.90, biceps ratio=0.4 alpha 0.63, score 0 은 BASE 톤', async () => {
    const { applyMusclesToSilhouette } = await import('./stats.js');
    const doc = makeSilhouetteDoc(['chest', 'biceps', 'lats']);
    applyMusclesToSilhouette([{ muscleKey: 'chest', score: 5 }, { muscleKey: 'biceps', score: 2 }], doc);
    expect(doc._paths[0]._attrs.fill).toBe('rgba(217,119,87,0.90)');
    expect(doc._paths[1]._attrs.fill).toBe('rgba(217,119,87,0.63)');
    expect(doc._paths[2]._attrs.fill).toBe('rgba(212,165,154,0.22)');
  });
});
