import { describe, it, expect } from 'vitest';
import {
  sheetsFromHtml,
  localDayKey,
  dayKeysEndingToday,
  dailySeries,
  relativeDayLabel,
  lastActiveDaysAgo,
  weekStartMonday,
  countDaysInCurrentWeek,
  latestTodayTs,
  minuteOfDay,
  medianMinuteOfDay,
  monthSeries,
  monthSum,
  weeklySums,
  weeklyActiveDayCounts,
  weeks4Streak,
  dueOf,
  countRowsInWeek,
  countRowsInMonth,
  countPRs,
  thisYearSlice,
  pickActiveLang,
} from './transforms.js';

describe('pickActiveLang — 활성 학습 언어 (최신 daily_stats lang)', () => {
  it('최신 학습일의 lang 을 고른다', () => {
    expect(pickActiveLang([
      { date: '2026-05-13', lang: 'ja', study_time_sec: 240 },
      { date: '2026-06-23', lang: 'en', study_time_sec: 7200 },
    ])).toBe('en');
  });
  it('같은 날 복수 언어면 study_time 큰 쪽', () => {
    expect(pickActiveLang([
      { date: '2026-06-23', lang: 'ja', study_time_sec: 100 },
      { date: '2026-06-23', lang: 'en', study_time_sec: 7200 },
    ])).toBe('en');
  });
  it('빈 배열·null → fallback en', () => {
    expect(pickActiveLang([])).toBe('en');
    expect(pickActiveLang(null)).toBe('en');
    expect(pickActiveLang(undefined, 'ja')).toBe('ja');
  });
  it('일본어만 학습했으면 ja', () => {
    expect(pickActiveLang([{ date: '2026-06-20', lang: 'ja', study_time_sec: 600 }])).toBe('ja');
  });
});

describe('sheetsFromHtml — 원고지 매수 (today 앱 charCount/sheetCount 공식 복제)', () => {
  it('공백 제외 글자수 / 200, 0.1 단위 반올림', () => {
    expect(sheetsFromHtml('가'.repeat(200))).toBe(1);
    expect(sheetsFromHtml('가'.repeat(210))).toBe(1.1); // 1.05 → 1.1
    expect(sheetsFromHtml('가'.repeat(100))).toBe(0.5);
  });
  it('HTML 태그와 공백은 글자수에서 제외', () => {
    expect(sheetsFromHtml('<p>가 나\n다</p>')).toBe(0); // 3자 → 0.0
    expect(sheetsFromHtml('<div></div>')).toBe(0);
  });
  it('null/undefined/빈 문자열 → 0', () => {
    expect(sheetsFromHtml(null)).toBe(0);
    expect(sheetsFromHtml(undefined)).toBe(0);
    expect(sheetsFromHtml('')).toBe(0);
  });
});

describe('localDayKey — 로컬 YYYY-MM-DD (UTC 타임스탬프를 로컬 날짜로 버킷)', () => {
  it('월/일 zero-pad', () => {
    expect(localDayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(localDayKey(new Date(2026, 5, 8, 23, 30))).toBe('2026-06-08');
  });
});

describe('dayKeysEndingToday', () => {
  it('오늘로 끝나는 len 일 키 배열 (oldest→newest)', () => {
    expect(dayKeysEndingToday(3, new Date(2026, 5, 8))).toEqual([
      '2026-06-06', '2026-06-07', '2026-06-08',
    ]);
  });
});

describe('dailySeries — 행을 일별 합계 윈도우로 (index len-1 = 오늘)', () => {
  it('같은 날 합산 · 빈 날 0 · 윈도우 밖 무시', () => {
    const rows = [
      { k: '2026-06-08', v: 2 },
      { k: '2026-06-08', v: 1 },
      { k: '2026-06-06', v: 5 },
      { k: '2026-05-01', v: 99 }, // 윈도우 밖
    ];
    const series = dailySeries(rows, (r) => r.k, (r) => r.v, 3, new Date(2026, 5, 8));
    expect(series).toEqual([5, 0, 3]); // 06-06=5, 06-07=0, 06-08=3
  });
  it('빈 행 → 전부 0', () => {
    expect(dailySeries([], (r) => r.k, (r) => r.v, 3, new Date(2026, 5, 8))).toEqual([0, 0, 0]);
  });
});

describe('relativeDayLabel', () => {
  it('0/1/2 는 오늘/어제/그제, 그 외 N일 전', () => {
    expect(relativeDayLabel(0)).toBe('오늘');
    expect(relativeDayLabel(1)).toBe('어제');
    expect(relativeDayLabel(2)).toBe('그제');
    expect(relativeDayLabel(3)).toBe('3일 전');
    expect(relativeDayLabel(10)).toBe('10일 전');
  });
});

describe('lastActiveDaysAgo — 오늘 이전 마지막 활동일까지 며칠', () => {
  it('오늘(마지막 index) 제외, 가장 최근 >0 까지의 일수', () => {
    expect(lastActiveDaysAgo([0, 5, 0, 3, 0])).toBe(1); // index3 → 1일 전
    expect(lastActiveDaysAgo([0, 5, 0, 0, 0])).toBe(3); // index1 → 3일 전
  });
  it('이전 활동 없으면 null', () => {
    expect(lastActiveDaysAgo([0, 0, 0, 0, 7])).toBeNull(); // 오늘만
    expect(lastActiveDaysAgo([0, 0, 0, 0, 0])).toBeNull();
  });
});

describe('weekStartMonday — 그 주 월요일 00:00', () => {
  it('월요일이면 그날, 그 외 직전 월요일 (2026-06-08 = 월)', () => {
    expect(localDayKey(weekStartMonday(new Date(2026, 5, 8)))).toBe('2026-06-08'); // 월
    expect(localDayKey(weekStartMonday(new Date(2026, 5, 10)))).toBe('2026-06-08'); // 수
    expect(localDayKey(weekStartMonday(new Date(2026, 5, 7)))).toBe('2026-06-01'); // 일 → 직전 월
  });
});

describe('countDaysInCurrentWeek — 이번주(월~오늘) 활동 distinct 일수 (gym 회수)', () => {
  it('주 시작~오늘 범위 내 distinct 날짜만', () => {
    const today = new Date(2026, 5, 10); // 수
    const keys = ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-10', '2026-06-07'];
    expect(countDaysInCurrentWeek(keys, today)).toBe(3); // 08,09,10 (07=지난주 제외)
  });
  it('오늘 이후·중복 제외', () => {
    const today = new Date(2026, 5, 8); // 월
    const keys = ['2026-06-08', '2026-06-08', '2026-06-09']; // 09=미래 제외
    expect(countDaysInCurrentWeek(keys, today)).toBe(1);
  });
});

describe('latestTodayTs — 로컬 오늘 기록 중 최신 타임스탬프 (오늘 흐름 at)', () => {
  const today = new Date(2026, 5, 10);
  it('오늘 것 중 최신 ms 반환, 다른 날 제외', () => {
    const end = new Date(2026, 5, 10, 20, 37).getTime();
    const ts = [
      new Date(2026, 5, 10, 19, 48).getTime(),
      end,
      new Date(2026, 5, 9, 17, 55).getTime(), // 어제 — 제외
    ];
    expect(latestTodayTs(ts, today)).toBe(end);
  });
  it('ISO 문자열도 로컬 날짜로 버킷', () => {
    const iso = new Date(2026, 5, 10, 11, 5).toISOString();
    expect(latestTodayTs([iso], today)).toBe(new Date(2026, 5, 10, 11, 5).getTime());
  });
  it('오늘 것 없음/빈 배열/null 항목 → null', () => {
    expect(latestTodayTs([new Date(2026, 5, 9).getTime()], today)).toBeNull();
    expect(latestTodayTs([], today)).toBeNull();
    expect(latestTodayTs([null, undefined], today)).toBeNull();
  });
});

describe('minuteOfDay — 타임스탬프 → 로컬 minute-of-day (오늘 흐름 atMin)', () => {
  it('ms·ISO 모두 로컬 시각 기준 분', () => {
    expect(minuteOfDay(new Date(2026, 5, 10, 6, 40).getTime())).toBe(400);
    expect(minuteOfDay(new Date(2026, 5, 10, 20, 25).toISOString())).toBe(1225);
  });
  it('invalid → null', () => {
    expect(minuteOfDay(null)).toBeNull();
    expect(minuteOfDay('not-a-date')).toBeNull();
  });
});

describe('medianMinuteOfDay — 평소 실행 시간대 = 최근 실행 시각 중앙값 (flow 작업지시서 §5)', () => {
  const at = (h, m) => new Date(2026, 5, 10, h, m).getTime();

  it('홀수 개 — 가운데 값', () => {
    expect(medianMinuteOfDay([at(13, 0), at(14, 0), at(13, 50)], 999)).toBe(13 * 60 + 50);
  });
  it('짝수 개 — 가운데 두 값 평균', () => {
    expect(medianMinuteOfDay([at(13, 0), at(13, 10), at(14, 0), at(14, 30)], 999))
      .toBe((13 * 60 + 10 + 14 * 60) / 2);
  });
  it('기록 3회 미만 → fallback (작업지시서 §5)', () => {
    expect(medianMinuteOfDay([at(13, 0), at(14, 0)], 830)).toBe(830);
    expect(medianMinuteOfDay([], 830)).toBe(830);
  });
  it('invalid 타임스탬프는 무시하고 유효분만 집계', () => {
    expect(medianMinuteOfDay([at(13, 0), null, 'bad', at(14, 0), at(13, 50)], 999))
      .toBe(13 * 60 + 50);
  });
});

/* ─── v8 대시보드 (작업지시서 2026-06-12) ─────────────────────────────── */

describe('v8: monthSeries / monthSum', () => {
  // 2026-06-12 (금) — 6월은 30일, 6/1=월
  const today = new Date(2026, 5, 12);
  it('이번 달 1~말일 배열, 오늘 이후 0', () => {
    // series: 오늘로 끝나는 14일 (5/30~6/12)
    const series = [1, 2, /* 6/1 */ 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, /* 오늘 */ 14];
    const m = monthSeries(series, today);
    expect(m).toHaveLength(30);
    expect(m[0]).toBe(3); // 6/1
    expect(m[11]).toBe(14); // 6/12 오늘
    expect(m[12]).toBe(0); // 미래
  });
  it('series 가 달 시작보다 짧으면 앞을 0', () => {
    const m = monthSeries([5, 6], today); // 6/11, 6/12 만
    expect(m[10]).toBe(5);
    expect(m[9]).toBe(0);
  });
  it('monthSum: 지난달 합 / 이번 달 합', () => {
    // 43일: 5/1~6/12 — 5월(31일) 전부 1, 6월 전부 2
    const series = [...Array(31).fill(1), ...Array(12).fill(2)];
    expect(monthSum(series, today, 1)).toBe(31);
    expect(monthSum(series, today, 0)).toBe(24);
  });
  it('monthSum: series 밖이면 null', () => {
    expect(monthSum([1, 2, 3], today, 1)).toBeNull();
  });
});

describe('v8: weeklySums / weeklyActiveDayCounts', () => {
  const today = new Date(2026, 5, 12); // 금 → 이번주 경과 5일 (월~금)
  it('주별 합 — 마지막 = 이번주 부분(월~오늘)', () => {
    const series = [...Array(7).fill(1), ...Array(7).fill(2), ...Array(5).fill(3)];
    expect(weeklySums(series, today, 3)).toEqual([7, 14, 15]);
  });
  it('series 부족 주는 0', () => {
    expect(weeklySums([1, 1, 1, 1, 1], today, 2)).toEqual([0, 5]);
  });
  it('활동일수', () => {
    const series = [...[1, 0, 1, 0, 1, 0, 0], ...[1, 1, 1, 1, 0]];
    expect(weeklyActiveDayCounts(series, today, 2)).toEqual([3, 4]);
  });
});

describe('v8: weeks4Streak', () => {
  it('이번주(마지막) 4 미만이면 연속 안 끊김 — cur = 지난주까지', () => {
    expect(weeks4Streak([4, 4, 4, 2])).toEqual({ cur: 3, best: 3 });
  });
  it('이번주 4 이상이면 포함', () => {
    expect(weeks4Streak([3, 4, 4, 4])).toEqual({ cur: 3, best: 3 });
  });
  it('과거 최장 > 현재', () => {
    expect(weeks4Streak([4, 4, 4, 0, 4, 1])).toEqual({ cur: 1, best: 3 });
  });
  it('빈 배열', () => {
    expect(weeks4Streak([])).toEqual({ cur: 0, best: 0 });
  });
});

describe('v8: dueOf — §6 due 판정 (동시 0~1개)', () => {
  const apps = (over) => [
    { id: 'read', done: false, usualMin: 1350, ...(over && over.read) },
    { id: 'write', done: false, usualMin: 1170, ...(over && over.write) },
    { id: 'lang', done: false, usualMin: 780, ...(over && over.lang) },
    { id: 'gym', done: true, usualMin: 430, ...(over && over.gym) },
  ];
  it('지난 것 중 가장 이른 미완료 1개', () => {
    expect(dueOf(apps(), 1200)).toBe('lang');
  });
  it('완료는 제외', () => {
    expect(dueOf(apps({ lang: { done: true } }), 1200)).toBe('write');
  });
  it('아무 것도 안 지났으면 null', () => {
    expect(dueOf(apps(), 700)).toBeNull();
  });
});

/* ─── v9 정보 재설계 (작업지시서 2026-06 §7) ──────────────────────────── */

describe('v9: countRowsInWeek — 주별 행 수(편/회, 중복 포함). 2026-06-13 토, 이번주 월=06-08', () => {
  const today = new Date(2026, 5, 13);
  const keys = ['2026-06-08', '2026-06-08', '2026-06-10', '2026-06-04', '2026-05-30'];
  it('이번 주(월~오늘) 행 수 — 같은 날 중복도 셈', () => {
    expect(countRowsInWeek(keys, today, 0)).toBe(3); // 08,08,10
  });
  it('지난 주(월~일) 행 수', () => {
    expect(countRowsInWeek(keys, today, 1)).toBe(1); // 06-04 (05-30 은 2주 전)
  });
  it('빈/누락 → 0', () => {
    expect(countRowsInWeek([], today, 0)).toBe(0);
    expect(countRowsInWeek(null, today, 1)).toBe(0);
  });
});

describe('v9: countRowsInMonth — 월별 행 수(횟수). 2026-06-13', () => {
  const today = new Date(2026, 5, 13);
  const keys = ['2026-06-13', '2026-06-02', '2026-06-02', '2026-05-20', '2026-04-30'];
  it('이번 달(1일~오늘) 행 수', () => {
    expect(countRowsInMonth(keys, today, 0)).toBe(3); // 13,02,02
  });
  it('지난 달(1일~말일) 행 수', () => {
    expect(countRowsInMonth(keys, today, 1)).toBe(1); // 05-20
  });
});

describe('v9: countPRs — 직전 세션 blocks 의 신기록 운동 수(set pr 보유 운동)', () => {
  it('pr set 가진 운동만 카운트 (set 다중이어도 운동 1개)', () => {
    const blocks = [
      { type: 'single', exercises: [{ sets: [{ pr: true }, { pr: false }] }, { sets: [{ pr: false }] }] },
      { type: 'circuit', exercises: [{ sets: [{ pr: true }] }] },
    ];
    expect(countPRs(blocks)).toBe(2);
  });
  it('빈 blocks / pr 없음 → 0', () => {
    expect(countPRs([])).toBe(0);
    expect(countPRs(null)).toBe(0);
    expect(countPRs([{ exercises: [{ sets: [{ pr: false }] }] }])).toBe(0);
  });
});

describe('v9: thisYearSlice — 윈도우가 전년으로 넘어가도 올해(1/1~오늘) 구간만 집계', () => {
  it('연초 — 올해 경과일(<윈도우)만큼 뒤에서 자름', () => {
    // 2026-01-10 = 올해 10일째. 63일 윈도우 중 마지막 10개만 올해
    const series = Array.from({ length: 63 }, (_, i) => i); // 0..62
    expect(thisYearSlice(series, new Date(2026, 0, 10))).toEqual(series.slice(53)); // 53..62 (10개)
  });
  it('연중 — 경과일이 윈도우보다 길면 전체', () => {
    expect(thisYearSlice([1, 2, 3, 4, 5], new Date(2026, 5, 13))).toEqual([1, 2, 3, 4, 5]);
  });
  it('1월 1일 — 1개', () => {
    expect(thisYearSlice([7, 8, 9], new Date(2026, 0, 1))).toEqual([9]);
  });
});
