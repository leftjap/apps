import { describe, it, expect } from 'vitest';
import { hoursLabel, lastNote, iGa, beatStreak, buildRead, buildWrite, buildLang, buildGym } from './copy.js';

const today = new Date(2026, 5, 12);

describe('헬퍼', () => {
  it('hoursLabel — 1시간 이상은 시간, 미만은 분', () => {
    expect(hoursLabel(2280)).toBe('38시간');
    expect(hoursLabel(45)).toBe('45분');
  });
  it('lastNote 조사 — 오늘/어제/그제는 "는", 그 외 "엔"', () => {
    expect(lastNote(1, '9분')).toBe('어제는 9분');
    expect(lastNote(3, '12분')).toBe('3일 전엔 12분');
  });
  it('iGa — 받침 유무 이/가', () => {
    expect(iGa('6월 에세이')).toBe('가');
    expect(iGa('구덩이 약속')).toBe('이');
  });
});

describe('beatStreak — §9 패턴 "오늘 X면 Y예요 — 기준 기록"', () => {
  it('미완료 — 시안 문구 일치', () => {
    expect(beatStreak('오늘 읽으면', false, 2, 11)).toBe('오늘 읽으면 3일 연속이에요 — 최장 기록은 11일');
  });
  it('미완료 1일째', () => {
    expect(beatStreak('오늘 10분이면', false, 0, 14)).toBe('오늘 10분이면 1일째예요 — 최장 기록은 14일');
  });
  it('미완료 — 기록 경신 직전', () => {
    expect(beatStreak('오늘 읽으면', false, 11, 11)).toBe('오늘 읽으면 12일 연속 — 최장 기록 11일을 넘어서요');
  });
  it('첫 기록', () => {
    expect(beatStreak('오늘 읽으면', false, 0, 0)).toBe('오늘 읽으면 1일째예요 — 첫 기록이 시작돼요');
  });
  it('완료 — 진행 중', () => {
    expect(beatStreak('오늘 읽으면', true, 3, 11)).toBe('오늘로 3일 연속이에요 — 최장 기록은 11일');
  });
  it('완료 — 최장 갱신', () => {
    expect(beatStreak('오늘 읽으면', true, 12, 12)).toBe('오늘로 12일 연속 — 최장 기록이에요');
  });
});

describe('buildRead', () => {
  const base = { done: false, todayMin: 0, lastVal: 9, lastDaysAgo: 1, streak: 2, best: 11, dayBest: 52, yearMin: 2280, yearDays: 41, today };
  it('미완료 hook/sub/records/total', () => {
    const r = buildRead(base);
    expect(r.hook).toEqual({ title: '어제', strong: '9분', tail: ' 읽었어요' });
    expect(r.sub).toBe('2일 연속이에요');
    expect(r.records[0]).toEqual({ lb: '최장 연속', v: '11일', note: '지금 2일째예요' });
    expect(r.records[1]).toEqual({ lb: '하루 최고', v: '52분', note: '어제는 9분' });
    expect(r.records[2]).toEqual({ lb: '올해 누적', v: '38시간', note: '41일 읽었어요' });
    expect(r.total).toBe('올해 38시간');
    expect(r.cta).toBe('이어 읽기');
  });
  it('기록 전무', () => {
    const r = buildRead({ ...base, lastVal: null, lastDaysAgo: null, streak: 0, best: 0, dayBest: 0, yearMin: 0, yearDays: 0 });
    expect(r.hook.title).toBe('아직 기록이 없어요');
    expect(r.sub).toBe('오늘 10분이면 시작할 수 있어요');
    expect(r.records[1].note).toBeUndefined();
  });
  it('완료', () => {
    const r = buildRead({ ...base, done: true, todayMin: 23, streak: 3, lastDaysAgo: 0, lastVal: 23 });
    expect(r.hookDone).toEqual({ title: '오늘', strong: '23분', tail: ' 읽었어요' });
    expect(r.records[1].note).toBe('오늘은 23분');
    expect(r.sub).toBe('3일 연속이에요');
  });
});

describe('buildWrite', () => {
  const base = { done: false, todaySheets: 0, doc: { title: '6월 에세이', sheets: 9.2 }, lastDaysAgo: 8,
    dayBest: 6.8, lastSheets: 3.6, monthSheets: 9.2, prevMonthSheets: 38.4, prevMonthName: 5,
    yearSheets: 412, yearDays: 18, today };
  it('미완료 — 시안 일치', () => {
    const r = buildWrite(base);
    expect(r.hook).toEqual({ title: '「6월 에세이」 —', strong: '9.2매', tail: '까지 썼어요' });
    expect(r.sub).toBe('마지막으로 쓴 날은 6월 4일이에요');
    expect(r.beat).toBe('오늘 한 매만 보태도 「6월 에세이」가 다시 자라요');
    expect(r.records[1]).toEqual({ lb: '이번 달', v: '9.2매', note: '5월엔 38.4매' });
    expect(r.cta).toBe('이어 쓰기');
  });
  it('완료 — 하루 최고 비교', () => {
    const r = buildWrite({ ...base, done: true, todaySheets: 2.4 });
    expect(r.sub).toBe('오늘 2.4매 썼어요');
    expect(r.beat).toBe('오늘 2.4매 — 하루 최고는 6.8매예요');
    expect(r.records[0].note).toBe('오늘은 2.4매');
  });
  it('완료 — 하루 최고 경신', () => {
    const r = buildWrite({ ...base, done: true, todaySheets: 7 });
    expect(r.beat).toBe('오늘 7매 — 하루 최고 기록이에요');
  });
  it('글 전무', () => {
    const r = buildWrite({ ...base, doc: null, lastDaysAgo: null, lastSheets: null, monthSheets: 0, prevMonthSheets: null });
    expect(r.hook.title).toBe('아직 글이 없어요');
    expect(r.beat).toBe('오늘 한 매면 첫 글이 시작돼요');
    expect(r.records[1].note).toBeUndefined();
  });
});

describe('buildLang', () => {
  const base = { done: false, todayMin: 0, scene: { title: '공원 설문 — 미끄럼틀 소동', m: 6, d: 11 },
    lastDaysAgo: 1, streak: 0, best: 14, dayBest: 65, lastVal: 65, yearMin: 1260, yearDays: 9, today };
  it('미완료 — sceneTitle hook', () => {
    const r = buildLang(base);
    expect(r.hook).toEqual({ title: '「공원 설문 — 미끄럼틀 소동」 ·', strong: '6월 11일', tail: '이 마지막이에요' });
    expect(r.sub).toBe('오늘 10분이면 다시 시작할 수 있어요');
    expect(r.cta).toBe('오늘 분량 시작');
  });
  it('scene 없음 — 날짜 폴백', () => {
    const r = buildLang({ ...base, scene: null });
    expect(r.hook).toEqual({ title: '마지막 학습은', strong: '6월 11일', tail: '이에요' });
  });
  it('완료 — 오늘 장면이면 제목 포함', () => {
    const r = buildLang({ ...base, done: true, todayMin: 65, streak: 1, scene: { title: '구덩이 약속', m: 6, d: 12 } });
    expect(r.hookDone).toEqual({ title: '오늘 「구덩이 약속」', strong: '65분', tail: ' 했어요' });
  });
  it('완료 — 장면이 오늘 게 아니면 제목 생략', () => {
    const r = buildLang({ ...base, done: true, todayMin: 12, streak: 1 });
    expect(r.hookDone).toEqual({ title: '오늘', strong: '12분', tail: ' 했어요' });
  });
});

describe('buildGym', () => {
  const base = { done: false, todayMin: 0, atLabel: null, tag: null, weekCount: 2,
    w4: { cur: 3, best: 5 }, dayBest: 71, lastVal: 41, lastDaysAgo: 2,
    yearCount: 86, yearMin: 3840, today };
  it('미완료 — 시안 일치', () => {
    const r = buildGym(base);
    expect(r.hook).toEqual({ title: '이번 주', strong: '2회', tail: ' 했어요 — 목표는 주 4일' });
    expect(r.sub).toBe('3주 연속으로 주 4일을 지켰어요');
    expect(r.beat).toBe('이번 주 2번 더 하면 4주 연속이에요 — 최고 기록은 5주');
    expect(r.records[0]).toEqual({ lb: '주 4일 연속', v: '3주', note: '최고 기록은 5주' });
    expect(r.records[2]).toEqual({ lb: '올해 운동', v: '86회', note: '모두 64시간' });
    expect(r.total).toBe('올해 86회 · 64시간');
  });
  it('완료 — 부위·시각', () => {
    const r = buildGym({ ...base, done: true, todayMin: 41, atLabel: '07:12', tag: '상체', weekCount: 3 });
    expect(r.hookDone).toEqual({ title: '오늘 07:12 · 상체', strong: '41분', tail: '' });
    expect(r.sub).toBe('이번 주 3회 — 목표는 주 4일이에요');
    expect(r.ctaDone).toBe('오늘 기록 보기');
  });
  it('완료 — 부위 없으면 시각만', () => {
    const r = buildGym({ ...base, done: true, todayMin: 41, atLabel: '07:12', weekCount: 3 });
    expect(r.hookDone.title).toBe('오늘 07:12');
  });
  it('주 4일 달성', () => {
    const r = buildGym({ ...base, weekCount: 4, w4: { cur: 4, best: 5 } });
    expect(r.beat).toBe('이번 주 4일을 채웠어요 — 4주 연속이에요');
  });
  it('기록 경신 직전', () => {
    const r = buildGym({ ...base, weekCount: 3, w4: { cur: 5, best: 5 } });
    expect(r.beat).toBe('이번 주 1번 더 하면 6주 연속 — 최고 기록 5주를 넘어서요');
  });
  it('이번 주 0회', () => {
    const r = buildGym({ ...base, weekCount: 0, w4: { cur: 0, best: 5 } });
    expect(r.hook).toEqual({ title: '이번 주 첫 운동 전이에요 —', strong: '목표는 주 4일', tail: '' });
    expect(r.sub).toBe('마지막 운동은 그제예요');
  });
});
