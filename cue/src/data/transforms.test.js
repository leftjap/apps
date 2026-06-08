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
} from './transforms.js';

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
