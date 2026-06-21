import { describe, it, expect } from 'vitest';
import { hoursLabel, buildRead, buildWrite, buildLang, buildGym } from './copy.js';

// 시안 스냅샷 기준일 (2026-06-13 토). mdLabel/relativeDayLabel 계산 일치용.
const today = new Date(2026, 5, 13);

describe('헬퍼', () => {
  it('hoursLabel — 1시간 이상은 시간, 미만은 분', () => {
    expect(hoursLabel(2280)).toBe('38시간');
    expect(hoursLabel(45)).toBe('45분');
  });
});

/* ───────── 독서 (실데이터: book_reading_seconds — 제목·진도% 없음) ───────── */
describe('buildRead — 직전/이번 주/이번 달 통일 구조', () => {
  const base = {
    done: false, todayMin: 0, lastVal: 18, lastDaysAgo: 1,
    weekDays: 3, lastWeekDays: 4, monthMin: 600, prevMonthMin: 1800,
    streak: 2, best: 11, dayBest: 52, yearMin: 2280, yearDays: 41, paceAvg: 3.9, today,
  };
  it('미완료 — hook=직전 읽은 시점, sub=연속, 슬롯 3종', () => {
    const r = buildRead(base);
    expect(r.name).toBe('독서');
    expect(r.cta).toBe('이어 읽기');
    expect(r.hook).toEqual({ title: '어제', strong: '18분', tail: ' 읽었어요' });
    expect(r.sub).toBe('2일 연속이에요');
    expect(r.records[0]).toEqual({ lb: '직전 읽기', v: '18분', note: '어제' });
    expect(r.records[1]).toEqual({ lb: '이번 주', goal: { cur: 3, max: 5, unit: '일', proposed: true }, note: '지난주 4일' });
    expect(r.records[2]).toEqual({ lb: '이번 달', v: '10시간', note: '지난달 30시간' });
    expect(r.beat).toEqual(['오늘 10분이면 ', '이번 주 4일째', ' — 지난주는 4일이었어요']);
    expect(r.total).toBe('올해 38시간 · 41일');
    expect(r.pace).toEqual({ now: '올해 평균 주 3.9일', goal: '제안 주 5일', proposed: true });
    expect(r.statRecords).toEqual([
      { lb: '최장 연속', v: '11일' }, { lb: '하루 최고', v: '52분' }, { lb: '올해 읽은 날', v: '41일' },
    ]);
  });
  it('공백(끊김) — gap 사실 sub', () => {
    const r = buildRead({ ...base, streak: 0 });
    expect(r.sub).toBe('마지막으로 읽은 날은 6월 12일이에요');
    expect(r.subGap).toBe(true);
  });
  it('완료 — hookDone, slot1=오늘', () => {
    const r = buildRead({ ...base, done: true, todayMin: 22, lastVal: 22, lastDaysAgo: 0, streak: 3 });
    expect(r.hookDone).toEqual({ title: '오늘', strong: '22분', tail: ' 읽었어요' });
    expect(r.records[0]).toEqual({ lb: '직전 읽기', v: '22분', note: '오늘' });
    expect(r.sub).toBe('3일 연속이에요');
  });
  it('기록 전무 — 빈 슬롯·시작 문턱', () => {
    const r = buildRead({ ...base, lastVal: null, lastDaysAgo: null, streak: 0, best: 0, dayBest: 0, monthMin: 0, prevMonthMin: null, yearMin: 0, yearDays: 0 });
    expect(r.hook.title).toBe('아직 기록이 없어요');
    expect(r.sub).toBe('오늘 10분이면 다시 시작할 수 있어요');
    expect(r.records[0]).toEqual({ lb: '직전 읽기', v: '—', note: '' });
    expect(r.records[2].note).toBe('');
  });
});

/* ───────── 글쓰기 ───────── */
describe('buildWrite — kind 라벨 hook · 편수 목표 · 매수 추세', () => {
  const base = {
    done: false, todaySheets: 0, doc: { title: '정치는 인물', sheets: 6.5, kindLabel: '오늘의 네비' },
    lastDaysAgo: 9, weekEntries: 0, lastWeekEntries: 2, monthSheets: 12, prevMonthSheets: 38.4, prevMonthName: 5,
    dayBest: 6.8, lastSheets: 6.5, yearSheets: 495, yearEntries: 85, paceAvg: 1.9, today,
  };
  it('미완료 — 시안 일치', () => {
    const r = buildWrite(base);
    expect(r.cta).toBe('이어 쓰기');
    expect(r.hook).toEqual({ title: '오늘의 네비 「정치는 인물」', strong: '6.5매', tail: '까지 썼어요' });
    expect(r.sub).toBe('마지막으로 쓴 날은 6월 4일이에요');
    expect(r.subGap).toBe(true);
    expect(r.records[0]).toEqual({ lb: '직전 글', v: '6.5매', note: '오늘의 네비 · 6월 4일' });
    expect(r.records[1]).toEqual({ lb: '이번 주', goal: { cur: 0, max: 3, unit: '편', proposed: true }, note: '지난주 2편' });
    expect(r.records[2]).toEqual({ lb: '이번 달', v: '12매', note: '지난달 38.4매' });
    expect(r.beat).toEqual(['오늘 1매면 ', '이번 달 13매째', ' — 지난달은 38매였어요']);
    expect(r.total).toBe('올해 85편 · 495매');
    expect(r.pace).toEqual({ now: '올해 평균 주 1.9편', goal: '제안 주 3편', proposed: true });
    expect(r.statRecords).toEqual([
      { lb: '올해 편수', v: '85편' }, { lb: '올해 매수', v: '495매' }, { lb: '편당 평균', v: '5.8매' },
    ]);
  });
  it('완료 — 오늘 쓴 사실 sub', () => {
    const r = buildWrite({ ...base, done: true, todaySheets: 2.4 });
    expect(r.sub).toBe('오늘 2.4매 썼어요');
    expect(r.records[0].note).toBe('오늘의 네비 · 오늘');
  });
  it('글 전무', () => {
    const r = buildWrite({ ...base, doc: null, lastDaysAgo: null, monthSheets: 0, prevMonthSheets: null, yearSheets: 0, yearEntries: 0 });
    expect(r.hook.title).toBe('아직 글이 없어요');
    expect(r.records[0]).toEqual({ lb: '직전 글', v: '—', note: '' });
    expect(r.beat).toEqual(['오늘 1매면 ', '첫 글', '이 시작돼요']);
    expect(r.statRecords[2].v).toBe('0매'); // 편당 평균 0
  });
});

/* ───────── 어학 (SRS 복습 대기) ───────── */
describe('buildLang — sceneTitle hook · 복습 대기 sub · 익힘 델타', () => {
  const base = {
    done: false, todayMin: 0, scene: { title: '구덩이 약속', m: 5, d: 18 }, lastDaysAgo: 26,
    lastUtter: 9, lastNew: 6, weekDays: 3, lastWeekDays: 2, monthNew: 48, prevMonthNew: 32,
    reviewDue: 12, streak: 0, best: 14, dayBest: 35, yearMin: 1260, yearUtter: 1240, collected: 2860, paceAvg: 2.7, today,
  };
  it('미완료 — 복습 대기가 sub (subStrong)', () => {
    const r = buildLang(base);
    expect(r.cta).toBe('오늘 분량 시작');
    expect(r.hook).toEqual({ title: '「구덩이 약속」', strong: '5월 18일', tail: '이 마지막이에요' });
    expect(r.sub).toBe('복습할 문장 12개가 오늘 만료돼요');
    expect(r.subStrong).toBe(true);
    expect(r.records[0]).toEqual({ lb: '직전 발화', v: '9문장', note: '5월 18일 · 신규 6' });
    expect(r.records[1]).toEqual({ lb: '이번 주', goal: { cur: 3, max: 4, unit: '일', proposed: true }, note: '지난주 2일' });
    expect(r.records[2]).toEqual({ lb: '이번 달 익힘', v: '+48문장', note: '지난달 +32' });
    expect(r.beat).toEqual(['오늘 5문장이면 ', '이번 주 4일째', ' — 복습 12개도 기다려요']);
    expect(r.total).toBe('올해 21시간 · 발화 1,240문장');
    expect(r.pace).toEqual({ now: '올해 평균 주 2.7일', goal: '제안 주 4일', proposed: true });
    expect(r.statRecords).toEqual([
      { lb: '올해 발화', v: '1,240문장' }, { lb: '익힌 문장', v: '2,860개' }, { lb: '최장 연속', v: '14일' },
    ]);
  });
  it('복습 0 — 문턱 sub', () => {
    const r = buildLang({ ...base, reviewDue: 0 });
    expect(r.sub).toBe('오늘 5문장이면 다시 시작할 수 있어요');
    expect(r.subStrong).toBeFalsy();
  });
  it('이번 주 발화 0일 — beat 첫 발화', () => {
    const r = buildLang({ ...base, weekDays: 0 });
    expect(r.beat).toEqual(['오늘 5문장이면 ', '이번 주 첫 발화', ' — 복습 12개도 기다려요']);
  });
  it('scene 없음 — 날짜 폴백 hook', () => {
    const r = buildLang({ ...base, scene: null });
    expect(r.hook).toEqual({ title: '마지막 학습은', strong: '5월 18일', tail: '이에요' });
  });
  it('scene 날짜 ≠ 마지막 학습일 — 실제 학습일로 폴백 (hook·직전발화 모순 제거)', () => {
    // 마지막 제목 레슨=5/11 이지만 그 뒤로도 학습(마지막 학습일=5/18)한 경우:
    // hook 이 5/11(장면)을 '마지막'으로 찍으면 직전 발화(5/18)와 충돌 → 실제 학습일로 폴백
    const r = buildLang({ ...base, scene: { title: '공원 설문', m: 5, d: 11 }, lastDaysAgo: 26 });
    expect(r.hook).toEqual({ title: '마지막 학습은', strong: '5월 18일', tail: '이에요' });
  });
  it('완료 — 오늘 장면이면 hookDone 에 제목', () => {
    const r = buildLang({ ...base, done: true, todayMin: 40, lastDaysAgo: 0, streak: 1, scene: { title: '구덩이 약속', m: 6, d: 13 } });
    expect(r.hookDone).toEqual({ title: '오늘 「구덩이 약속」', strong: '40분', tail: ' 했어요' });
  });
});

/* ───────── 운동 (부위·PR·실제 목표) ───────── */
describe('buildGym — 부위 2개 + PR · 실제 주 4일 목표', () => {
  const base = {
    done: true, todayMin: 48, atLabel: '07:40', parts: ['가슴', '어깨'], prCount: 1, todayVolume: 6200,
    weekCount: 4, lastDaysAgo: 0, w4: { cur: 3, best: 5 }, monthCount: 14, prevMonthCount: 12,
    dayBest: 71, yearCount: 86, yearMin: 3840, paceAvg: 3.2, today,
  };
  it('완료 — 시안 일치 (부위·신기록·실제 목표)', () => {
    const r = buildGym(base);
    expect(r.cta).toBe('운동 기록 열기');
    expect(r.ctaDone).toBe('오늘 기록 보기');
    expect(r.hookDone).toEqual({ title: '오늘 07:40 · 가슴·어깨', strong: '48분', tail: '' });
    expect(r.sub).toBe('이번 주 4회 · 주 4일 목표를 채웠어요');
    expect(r.records[0]).toEqual({ lb: '오늘 한 운동', v: '가슴 · 어깨', pr: 1, note: '48분 · 볼륨 6,200kg' });
    expect(r.records[1]).toEqual({ lb: '이번 주', goal: { cur: 4, max: 4, unit: '회', proposed: false }, note: '3주 연속' });
    expect(r.records[2]).toEqual({ lb: '이번 달', v: '14회', note: '지난달 12회' });
    expect(r.beat).toEqual(['이번 주 4일을 채웠어요', '', ' — 3주 연속이에요']);
    expect(r.total).toBe('올해 86회 · 64시간');
    expect(r.pace).toEqual({ now: '올해 평균 주 3.2회', goal: '주 4일 목표', proposed: false });
    expect(r.statRecords).toEqual([
      { lb: '올해 횟수', v: '86회' }, { lb: '최고 주 연속', v: '5주' }, { lb: '하루 최고', v: '71분' },
    ]);
  });
  it('미완료 — 이번 주 진행 hook, 직전 운동 slot1', () => {
    const r = buildGym({ ...base, done: false, weekCount: 2, lastDaysAgo: 2, lastMin: 44 });
    expect(r.hook).toEqual({ title: '이번 주', strong: '2회', tail: ' 했어요 — 목표는 주 4일' });
    expect(r.records[0]).toEqual({ lb: '직전 운동', v: '가슴 · 어깨', pr: 1, note: '그제 · 44분' });
    expect(r.records[1].goal.cur).toBe(2);
    expect(r.beat).toEqual(['이번 주 ', '2번 더 하면 주 4일', ' — 최고 5주 연속이에요']);
  });
  it('오늘 운동(active 포함) — done 이면 카운트/목표 달성 우선 (nudge 아님)', () => {
    const r = buildGym({ ...base, done: true, weekCount: 4, pending: { daysAgo: 0 } });
    expect(r.sub).toBe('이번 주 4회 · 주 4일 목표를 채웠어요');
    expect(r.subStrong).toBeFalsy();
  });
  it('오늘 운동 전 + 미저장(active) 세션 — 마무리 nudge subStrong', () => {
    const r = buildGym({ ...base, done: false, weekCount: 2, lastDaysAgo: 2, lastMin: 44, pending: { daysAgo: 1 } });
    expect(r.sub).toBe('어제 운동이 저장 전이에요 — 마무리하면 기록돼요');
    expect(r.subStrong).toBe(true);
    // hook/records 는 completed 기준 불변 (active 는 횟수에 미포함)
    expect(r.hook).toEqual({ title: '이번 주', strong: '2회', tail: ' 했어요 — 목표는 주 4일' });
    expect(r.records[1].goal.cur).toBe(2);
  });
  it('미완료 0회 — 첫 운동 전 hook', () => {
    const r = buildGym({ ...base, done: false, weekCount: 0, w4: { cur: 0, best: 0 }, parts: [], prCount: 0, lastDaysAgo: null });
    expect(r.hook).toEqual({ title: '이번 주 첫 운동 전이에요 —', strong: '목표는 주 4일', tail: '' });
    expect(r.records[0]).toEqual({ lb: '직전 운동', v: '—', pr: 0, note: '' });
    expect(r.beat).toEqual(['이번 주 ', '4번 더 하면 주 4일 첫 달성', '이에요']);
  });
});
