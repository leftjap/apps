import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createGymDB } from '../db/schema.js';
import {
  summarizeActiveSession,
  summarizeStreak,
  partAbbreviation,
  buildWeekCalendar,
  wireHomeShortcuts,
} from './home.js';

const NOW = 1714492800000; // 2026-04-30 00:00:00 (anchor for elapsed)

describe('summarizeActiveSession', () => {
  it('null/undefined → null', () => {
    expect(summarizeActiveSession(null, NOW)).toBeNull();
    expect(summarizeActiveSession(undefined, NOW)).toBeNull();
  });

  it('status!=active (completed) → null', () => {
    const r = summarizeActiveSession({
      status: 'completed', startTime: NOW - 1000, blocks: [],
    }, NOW);
    expect(r).toBeNull();
  });

  it('정상 — 28:42 경과 + 2/4 종목 + tags 한국어 매핑', () => {
    const session = {
      status: 'active',
      startTime: NOW - (28 * 60 + 42) * 1000,
      tags: ['chest', 'shoulder'],
      blocks: [
        // 완료 1
        { type: 'single', exerciseId: 'bench_press', sets: [
          { weight: 60, reps: 10, done: true, preset: false, pr: false },
          { weight: 65, reps: 8, done: true, preset: false, pr: false },
        ]},
        // 완료 1
        { type: 'single', exerciseId: 'incline_bench', sets: [
          { weight: 50, reps: 10, done: true, preset: false, pr: false },
        ]},
        // 진행 중 (1건만 done)
        { type: 'single', exerciseId: 'shoulder_press', sets: [
          { weight: 30, reps: 10, done: true, preset: false, pr: false },
          { weight: 30, reps: 10, done: false, preset: true, pr: false },
        ]},
        // 미시작 (전부 preset)
        { type: 'single', exerciseId: 'side_lateral', sets: [
          { weight: 8, reps: 12, done: false, preset: true, pr: false },
        ]},
      ],
    };
    const r = summarizeActiveSession(session, NOW);
    expect(r).toEqual({
      label: '진행 중',
      num: '28:42',
      unit: '경과',
      part: '가슴 · 어깨',
      sub: '2 / 4 종목',
      cta: '이어가기',
      sessionNumSize: 40,
    });
  });

  it('startTime null → num=00:00', () => {
    const r = summarizeActiveSession({
      status: 'active', startTime: null, blocks: [],
    }, NOW);
    expect(r.num).toBe('00:00');
  });

  it('blocks 비어있음 → 0/0 종목', () => {
    const r = summarizeActiveSession({
      status: 'active', startTime: NOW - 60_000, blocks: [],
    }, NOW);
    expect(r.sub).toBe('0 / 0 종목');
    expect(r.num).toBe('01:00');
  });

  it('tags 누락 → part 빈 문자열', () => {
    const r = summarizeActiveSession({
      status: 'active', startTime: NOW - 60_000,
      blocks: [{ type: 'single', exerciseId: 'bench_press', sets: [] }],
    }, NOW);
    expect(r.part).toBe('');
  });

  it('미매핑 tag → 그대로 fallback', () => {
    const r = summarizeActiveSession({
      status: 'active', startTime: NOW,
      tags: ['chest', 'unknown_part'], blocks: [],
    }, NOW);
    expect(r.part).toBe('가슴 · unknown_part');
  });

  it('circuit 블록 — singles 카운트에서 제외', () => {
    const session = {
      status: 'active', startTime: NOW,
      blocks: [
        { type: 'single', exerciseId: 'bench_press', sets: [
          { weight: 60, reps: 10, done: true, preset: false, pr: false },
        ]},
        { type: 'circuit', rounds: [[{ exerciseId: 'pushup', reps: 10, done: true }]] },
      ],
    };
    const r = summarizeActiveSession(session, NOW);
    expect(r.sub).toBe('1 / 1 종목');
  });

  it('빈 sets 종목 — completed 에서 제외 (length 0 면 not done)', () => {
    const session = {
      status: 'active', startTime: NOW,
      blocks: [
        { type: 'single', exerciseId: 'bench_press', sets: [] },
      ],
    };
    const r = summarizeActiveSession(session, NOW);
    expect(r.sub).toBe('0 / 1 종목');
  });

  it('99분 초과 → mm 부분이 100+ (자릿수 늘어남)', () => {
    const r = summarizeActiveSession({
      status: 'active', startTime: NOW - 7200 * 1000, blocks: [],
    }, NOW);
    expect(r.num).toBe('120:00'); // 2시간
  });
});

describe('summarizeStreak', () => {
  const NOW_THU = new Date('2026-04-30T10:00:00').getTime(); // 목요일

  it('빈 sessions → empty state (시안 부재 → 임의 fill)', () => {
    const r = summarizeStreak([], NOW_THU);
    expect(r.state).toBe('empty');
    expect(r.label).toBe('마지막 운동');
    expect(r.num).toBe('—');
    expect(r.unit).toBe('');
    expect(r.part).toBe('');
    expect(r.sub).toBe('0');
    expect(r.subUnit).toBe('/4회');
  });

  it('null 입력 → empty', () => {
    expect(summarizeStreak(null, NOW_THU).state).toBe('empty');
  });

  it('오늘 운동 → 0일 ("오늘") + active', () => {
    const sessions = [{ date: '2026-04-30', tags: ['chest'], status: 'completed' }];
    const r = summarizeStreak(sessions, NOW_THU);
    expect(r.state).toBe('active');
    expect(r.num).toBe('오늘');
    expect(r.unit).toBe('');
    expect(r.label).toBe('마지막 운동');
    expect(r.part).toBe('가슴');
  });

  it('1~2일 → active', () => {
    const sessions = [{ date: '2026-04-29', tags: ['chest'], status: 'completed' }];
    const r = summarizeStreak(sessions, NOW_THU);
    expect(r.state).toBe('active');
    expect(r.num).toBe('1');
    expect(r.unit).toBe('일 전');
  });

  it('3~4일 → gap', () => {
    const sessions = [{ date: '2026-04-26', tags: ['back'], status: 'completed' }];
    const r = summarizeStreak(sessions, NOW_THU);
    expect(r.state).toBe('gap');
    expect(r.num).toBe('4');
  });

  it('5+일 → rest', () => {
    const sessions = [{ date: '2026-04-23', tags: ['legs'], status: 'completed' }];
    const r = summarizeStreak(sessions, NOW_THU);
    expect(r.state).toBe('rest');
    expect(r.num).toBe('7');
  });

  it('이번 주 카운트 — 4/27(월)~5/3(일) 안 sessions → sub=count, subUnit=/Ngoal회', () => {
    const sessions = [
      { date: '2026-04-27', tags: ['chest'], status: 'completed' }, // 이번 주
      { date: '2026-04-29', tags: ['back'], status: 'completed' },  // 이번 주
      { date: '2026-04-25', tags: ['chest'], status: 'completed' }, // 지난 주
    ];
    const r = summarizeStreak(sessions, NOW_THU);
    expect(r.sub).toBe('2');
    expect(r.subUnit).toBe('/4회');
  });

  it('weeklyGoal 인자 반영 → subUnit /N회', () => {
    const sessions = [{ date: '2026-04-29', tags: ['chest'], status: 'completed' }];
    expect(summarizeStreak(sessions, NOW_THU, 5).subUnit).toBe('/5회');
    expect(summarizeStreak(sessions, NOW_THU, 7).subUnit).toBe('/7회');
    // 범위 밖 입력 → 기본 4 fallback
    expect(summarizeStreak(sessions, NOW_THU, 0).subUnit).toBe('/4회');
    expect(summarizeStreak(sessions, NOW_THU, 8).subUnit).toBe('/4회');
    expect(summarizeStreak(sessions, NOW_THU, undefined).subUnit).toBe('/4회');
  });

  it('multi-tag → " · " join (한국어)', () => {
    const sessions = [{ date: '2026-04-30', tags: ['chest', 'arms'], status: 'completed' }];
    const r = summarizeStreak(sessions, NOW_THU);
    expect(r.part).toBe('가슴 · 팔');
  });

  it('가장 최근 1건만 사용 (date desc 정렬)', () => {
    const sessions = [
      { date: '2026-04-25', tags: ['legs'], status: 'completed' },
      { date: '2026-04-29', tags: ['chest'], status: 'completed' }, // 가장 최근
      { date: '2026-04-20', tags: ['arms'], status: 'completed' },
    ];
    const r = summarizeStreak(sessions, NOW_THU);
    expect(r.num).toBe('1');
    expect(r.part).toBe('가슴');
  });
});

describe('partAbbreviation', () => {
  it('영문 부위 → 한국어 약어', () => {
    expect(partAbbreviation('chest')).toBe('가');
    expect(partAbbreviation('back')).toBe('등');
    expect(partAbbreviation('shoulder')).toBe('어');
    expect(partAbbreviation('legs')).toBe('하');
    expect(partAbbreviation('arms')).toBe('팔');
    expect(partAbbreviation('cardio')).toBe('유');
  });

  it('한국어 단일 글자 (mocks Wave 11.6D fallback) → 그대로', () => {
    expect(partAbbreviation('가')).toBe('가');
    expect(partAbbreviation('하')).toBe('하');
  });

  it('한국어 다음절 → 첫 글자', () => {
    expect(partAbbreviation('가슴')).toBe('가');
  });

  it('미매핑/falsy → 안전 fallback', () => {
    expect(partAbbreviation('unknown_xx')).toBe('기타');
    expect(partAbbreviation('')).toBe('');
    expect(partAbbreviation(null)).toBe('');
    expect(partAbbreviation(undefined)).toBe('');
  });
});

describe('buildWeekCalendar', () => {
  let db;
  const NOW_THU = new Date('2026-04-30T10:00:00').getTime(); // 목요일

  beforeEach(async () => {
    db = createGymDB(`test-home-${Math.random().toString(36).slice(2, 10)}`);
    await db.open();
    globalThis.window = globalThis.window || {};
    globalThis.window.gymDB = db;
  });

  afterEach(async () => {
    await db.delete();
    delete globalThis.window.gymDB;
  });

  it('빈 DB → 7개 cell, 부위 빈, today 1건', async () => {
    const cells = await buildWeekCalendar(NOW_THU);
    expect(cells.length).toBe(7);
    expect(cells.map((c) => c.wdLabel)).toEqual(['월','화','수','목','금','토','일']);
    expect(cells.filter((c) => c.isToday).length).toBe(1);
    expect(cells.find((c) => c.isToday).num).toBe(30); // 4/30
    expect(cells.every((c) => c.part === '')).toBe(true);
  });

  it('주간 sessions 시드 → 부위 약어 표시 + worked', async () => {
    // 주: 4/27(월) ~ 5/3(일). 4/27 가슴, 4/29 등.
    await db.sessions.put({
      id: 's_chest', date: '2026-04-27', startTime: 0, endTime: 0,
      blocks: [], tags: ['chest'], totalVolume: 0, totalCalories: 0, durationMin: 0,
      status: 'completed',
    });
    await db.sessions.put({
      id: 's_back', date: '2026-04-29', startTime: 0, endTime: 0,
      blocks: [], tags: ['back'], totalVolume: 0, totalCalories: 0, durationMin: 0,
      status: 'completed',
    });
    const cells = await buildWeekCalendar(NOW_THU);
    expect(cells[0]).toMatchObject({ wdLabel: '월', num: 27, part: '가', isToday: false });
    expect(cells[2]).toMatchObject({ wdLabel: '수', num: 29, part: '등', isToday: false });
    expect(cells[3]).toMatchObject({ wdLabel: '목', num: 30, part: '', isToday: true });
  });

  it('multi-tag → " · " join', async () => {
    await db.sessions.put({
      id: 's_multi', date: '2026-04-30', startTime: 0, endTime: 0,
      blocks: [], tags: ['chest', 'shoulder'], totalVolume: 0, totalCalories: 0, durationMin: 0,
      status: 'completed',
    });
    const cells = await buildWeekCalendar(NOW_THU);
    expect(cells[3].part).toBe('가·어');
  });

  it('Wave D — 같은 날 다중 세션 → tag 합집합 (중복 dedupe + 모든 부위 표시)', async () => {
    await db.sessions.put({
      id: 's_a', date: '2026-04-30', startTime: 1000, endTime: 0,
      blocks: [], tags: ['chest'], totalVolume: 0, totalCalories: 0, durationMin: 0,
      status: 'completed',
    });
    await db.sessions.put({
      id: 's_b', date: '2026-04-30', startTime: 5000, endTime: 0,
      blocks: [], tags: ['back', 'chest'], totalVolume: 0, totalCalories: 0, durationMin: 0,
      status: 'active',
    });
    const cells = await buildWeekCalendar(NOW_THU);
    // 합집합: chest + back (chest 중복 제거). insertion order = chest 가 먼저.
    expect(cells[3].part).toBe('가·등');
    // sessionId 는 startTime 가장 최근 (s_b)
    expect(cells[3].sessionId).toBe('s_b');
  });

  it('주 외 sessions → 무시', async () => {
    await db.sessions.put({
      id: 's_old', date: '2026-04-15', startTime: 0, endTime: 0,
      blocks: [], tags: ['chest'], totalVolume: 0, totalCalories: 0, durationMin: 0,
      status: 'completed',
    });
    const cells = await buildWeekCalendar(NOW_THU);
    expect(cells.every((c) => c.part === '')).toBe(true);
  });
});

/* ───────────────── wireHomeShortcuts (HomeHeader 통계/관리) ───────────────── */

function makeShortcutBtn() {
  const listeners = {};
  return {
    addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    _fire(name) { (listeners[name] || []).forEach((fn) => fn({})); },
  };
}

function makeShortcutDoc({ homeStats = 2, homeManage = 2, navStats = 0, navManage = 0, navHome = 0 } = {}) {
  const homeStatsBtns = Array.from({ length: homeStats }, () => makeShortcutBtn());
  const homeManageBtns = Array.from({ length: homeManage }, () => makeShortcutBtn());
  const navStatsBtns = Array.from({ length: navStats }, () => makeShortcutBtn());
  const navManageBtns = Array.from({ length: navManage }, () => makeShortcutBtn());
  const navHomeBtns = Array.from({ length: navHome }, () => makeShortcutBtn());
  return {
    body: { dataset: {} },
    querySelectorAll(sel) {
      if (sel === '.js-home-stats') return homeStatsBtns;
      if (sel === '.js-home-manage') return homeManageBtns;
      if (sel === '.js-nav-stats') return navStatsBtns;
      if (sel === '.js-nav-manage') return navManageBtns;
      if (sel === '.js-nav-home') return navHomeBtns;
      return [];
    },
    _homeStatsBtns: homeStatsBtns,
    _homeManageBtns: homeManageBtns,
    _navStatsBtns: navStatsBtns,
    _navManageBtns: navManageBtns,
    _navHomeBtns: navHomeBtns,
  };
}

describe('wireHomeShortcuts (페이지 헤더 nav — home/stats/admin 공통)', () => {
  it('doc 부재 → wired 0 (graceful)', () => {
    const r = wireHomeShortcuts(null);
    expect(r.wired).toBe(0);
  });

  it('home (stats/manage 양 phone) + stats 페이지 nav + admin 페이지 nav → wired = 2+2+1+1+1', () => {
    const doc = makeShortcutDoc({ homeStats: 2, homeManage: 2, navStats: 1, navManage: 1, navHome: 1 });
    const r = wireHomeShortcuts(doc);
    expect(r.wired).toBe(7);
    expect(doc.body.dataset.spaHomeShortcuts).toBe('1');
  });

  it('home only — wired = 2 + 2', () => {
    const doc = makeShortcutDoc({ homeStats: 2, homeManage: 2 });
    expect(wireHomeShortcuts(doc).wired).toBe(4);
  });

  it('stats 페이지 only (홈/관리 nav 2건) — wired = 2', () => {
    const doc = makeShortcutDoc({ homeStats: 0, homeManage: 0, navHome: 1, navManage: 1 });
    expect(wireHomeShortcuts(doc).wired).toBe(2);
  });

  it('admin 페이지 only (홈/통계 nav 2건) — wired = 2', () => {
    const doc = makeShortcutDoc({ homeStats: 0, homeManage: 0, navHome: 1, navStats: 1 });
    expect(wireHomeShortcuts(doc).wired).toBe(2);
  });

  it('idempotent — 두 번째 호출 wired 0 (spaHomeShortcuts guard)', () => {
    const doc = makeShortcutDoc({ homeStats: 2, homeManage: 2, navStats: 1, navManage: 1, navHome: 1 });
    expect(wireHomeShortcuts(doc).wired).toBe(7);
    expect(wireHomeShortcuts(doc).wired).toBe(0);
  });

  it('home stats click → window.location.hash = "#/stats"', () => {
    const doc = makeShortcutDoc({ homeStats: 1, homeManage: 0 });
    const origLocation = globalThis.window.location;
    globalThis.window.location = { hash: '' };
    try {
      wireHomeShortcuts(doc);
      doc._homeStatsBtns[0]._fire('click');
      expect(globalThis.window.location.hash).toBe('#/stats');
    } finally {
      if (origLocation) globalThis.window.location = origLocation;
      else delete globalThis.window.location;
    }
  });

  it('home manage click → window.location.hash = "#/admin"', () => {
    const doc = makeShortcutDoc({ homeStats: 0, homeManage: 1 });
    const origLocation = globalThis.window.location;
    globalThis.window.location = { hash: '' };
    try {
      wireHomeShortcuts(doc);
      doc._homeManageBtns[0]._fire('click');
      expect(globalThis.window.location.hash).toBe('#/admin');
    } finally {
      if (origLocation) globalThis.window.location = origLocation;
      else delete globalThis.window.location;
    }
  });

  it('nav-home click → window.location.hash = "#/home" (stats/admin 페이지)', () => {
    const doc = makeShortcutDoc({ homeStats: 0, homeManage: 0, navHome: 1 });
    const origLocation = globalThis.window.location;
    globalThis.window.location = { hash: '' };
    try {
      wireHomeShortcuts(doc);
      doc._navHomeBtns[0]._fire('click');
      expect(globalThis.window.location.hash).toBe('#/home');
    } finally {
      if (origLocation) globalThis.window.location = origLocation;
      else delete globalThis.window.location;
    }
  });

  it('nav-stats click → window.location.hash = "#/stats" (admin 페이지)', () => {
    const doc = makeShortcutDoc({ homeStats: 0, homeManage: 0, navStats: 1 });
    const origLocation = globalThis.window.location;
    globalThis.window.location = { hash: '' };
    try {
      wireHomeShortcuts(doc);
      doc._navStatsBtns[0]._fire('click');
      expect(globalThis.window.location.hash).toBe('#/stats');
    } finally {
      if (origLocation) globalThis.window.location = origLocation;
      else delete globalThis.window.location;
    }
  });

  it('nav-manage click → window.location.hash = "#/admin" (stats 페이지)', () => {
    const doc = makeShortcutDoc({ homeStats: 0, homeManage: 0, navManage: 1 });
    const origLocation = globalThis.window.location;
    globalThis.window.location = { hash: '' };
    try {
      wireHomeShortcuts(doc);
      doc._navManageBtns[0]._fire('click');
      expect(globalThis.window.location.hash).toBe('#/admin');
    } finally {
      if (origLocation) globalThis.window.location = origLocation;
      else delete globalThis.window.location;
    }
  });
});
