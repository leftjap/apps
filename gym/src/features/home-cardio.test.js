import { describe, it, expect } from 'vitest';
import {
  cardioDayMinutes, liftDays, cardioWeek, cardioRenewChip,
  recentSma, sparklinePoints,
} from './home-cardio.js';

// 네이티브 GymCore/HomeLogic.swift(cardioDayMinutes·liftDays·cardioWeek·cardioRenewChip)
// + WeightLogic.swift(recentSma·sparklinePoints) 의 1:1 포팅.
// 픽스처·기대값을 GymCoreTests/CardioCardTests.swift, WeightLogicTests.swift 와 맞춘다.

const cardio = (date, durations, done = true) => ({
  id: `c-${date}-${durations.length}`, date, status: 'completed',
  blocks: [{ type: 'single', exerciseId: 'treadmill',
    sets: durations.map((d) => ({ done, duration: d })) }],
});
const lift = (date) => ({
  id: `l-${date}`, date, status: 'completed',
  blocks: [{ type: 'single', exerciseId: 'squat', sets: [{ weight: 100, reps: 5, done: true }] }],
});

describe('cardioDayMinutes — "뛴 날"의 단일 정의', () => {
  it('같은 날 여러 세트 합산, 근력만 한 날은 키 없음', () => {
    const m = cardioDayMinutes([cardio('2026-05-04', [1200, 600]), lift('2026-05-05')]);
    expect(m['2026-05-04']).toBe(30);
    expect(m['2026-05-05']).toBeUndefined();
  });
  it('미완료 세트 제외', () => {
    expect(cardioDayMinutes([cardio('2026-05-04', [1800], false)])['2026-05-04']).toBeUndefined();
  });
  it('duration 미입력 유산소도 날짜 키는 남고 값 0', () => {
    expect(cardioDayMinutes([cardio('2026-05-04', [null])])['2026-05-04']).toBe(0);
  });
  it('날짜별 반올림 (29.5분 → 30)', () => {
    expect(cardioDayMinutes([cardio('2026-05-04', [1770])])['2026-05-04']).toBe(30);
  });
});

describe('liftDays — 유산소만 한 날은 근력일이 아니다', () => {
  it('유산소 전용일 제외', () => {
    expect([...liftDays([cardio('2026-05-04', [1800]), lift('2026-05-05')])]).toEqual(['2026-05-05']);
  });
  it('같은 날 근력+유산소는 둘 다', () => {
    const ss = [cardio('2026-05-04', [1800]), lift('2026-05-04')];
    expect([...liftDays(ss)]).toEqual(['2026-05-04']);
    expect(cardioDayMinutes(ss)['2026-05-04']).toBe(30);
  });
  it('미완료 근력 세트만 있는 날은 제외', () => {
    expect(liftDays([{ id: 'u', date: '2026-05-04', status: 'completed',
      blocks: [{ type: 'single', exerciseId: 'squat', sets: [{ weight: 100, reps: 5 }] }] }]).size).toBe(0);
  });
});

describe('cardioWeek — 월~일 7칸 × 이번주/지난주', () => {
  // 오늘 = 2026-05-05(화). 이번 주 월 05-04 ~ 일 05-10.
  const NOW = new Date(2026, 4, 5).getTime();
  it('지시서 §8 예시 재현', () => {
    const w = cardioWeek([
      cardio('2026-05-04', [30 * 60]), cardio('2026-05-05', [27 * 60]),
      cardio('2026-04-29', [25 * 60]), cardio('2026-05-01', [28 * 60]),
      cardio('2026-05-02', [22 * 60]),
    ], NOW);
    expect(w.thisMin).toEqual([30, 27, null, null, null, null, null]);
    expect(w.prevMin).toEqual([null, null, 25, null, 28, 22, null]);
    expect([w.thisTotal, w.thisDays]).toEqual([57, 2]);
    expect([w.prevTotal, w.prevDays]).toEqual([75, 3]);
    expect(w.todayIndex).toBe(1);
  });
  it('일요일도 그 주 월요일부터가 이번 주', () => {
    const sunday = new Date(2026, 4, 10).getTime();
    const w = cardioWeek([cardio('2026-05-04', [20 * 60]), cardio('2026-05-03', [40 * 60])], sunday);
    expect(w.thisMin[0]).toBe(20);
    expect(w.prevMin[6]).toBe(40);
    expect(w.todayIndex).toBe(6);
  });
  it('2주 전은 어느 행에도 없다', () => {
    const w = cardioWeek([cardio('2026-04-26', [99 * 60])], NOW);
    expect([w.thisTotal, w.prevTotal]).toEqual([0, 0]);
  });
  it('0분 유산소도 뛴 날 — 일수 포함', () => {
    const w = cardioWeek([cardio('2026-05-04', [0])], NOW);
    expect(w.thisMin[0]).toBe(0);
    expect([w.thisDays, w.thisTotal]).toEqual([1, 0]);
  });
});

describe('cardioRenewChip — 3갈래 (동률은 갱신이 아니다)', () => {
  it('부족 → warn', () => {
    expect(cardioRenewChip(57, 75)).toEqual({ value: '18분', label: '더 하면 갱신', isWarn: true });
  });
  it('동률', () => {
    expect(cardioRenewChip(75, 75)).toEqual({ value: null, label: '지난주와 동률', isWarn: false });
  });
  it('초과 → pine', () => {
    expect(cardioRenewChip(87, 75)).toEqual({ value: '+12분', label: '갱신', isWarn: false });
  });
  it('한 번도 안 했으면 숨김', () => { expect(cardioRenewChip(0, 0)).toBeNull(); });
  it('지난주 0 · 이번주 있음 → 갱신', () => {
    expect(cardioRenewChip(20, 0).value).toBe('+20분');
  });
});

describe('체중 스파크라인', () => {
  it('전체에 sma7 적용 후 창 절단 (창 안에서만 내면 첫 점이 실측값)', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-06-${String(i + 1).padStart(2, '0')}`, kg: i === 9 ? 60 : 80 }));
    const out = recentSma(rows, 3, new Date(2026, 5, 10).getTime());
    expect(out).toHaveLength(3);
    expect([out[0], out[1]]).toEqual([80, 80]);
    expect(out[2]).toBeCloseTo(540 / 7, 6);   // 창 안 평균이면 73.33
  });
  it('최대값이 위(pad), 최소값이 아래', () => {
    const pts = sparklinePoints([80, 80, 540 / 7], 132, 38, 3);
    expect(pts.map((p) => p.x)).toEqual([0, 66, 132]);
    expect(pts[0].y).toBeCloseTo(3, 6);
    expect(pts[2].y).toBeCloseTo(35, 6);
  });
  it('전부 같은 값 → 세로 중앙', () => {
    expect(sparklinePoints([70, 70, 70], 132, 38, 3).every((p) => Math.abs(p.y - 19) < 1e-9)).toBe(true);
  });
  it('점 2개 미만이면 빈 배열', () => {
    expect(sparklinePoints([70], 132, 38, 3)).toEqual([]);
    expect(sparklinePoints([], 132, 38, 3)).toEqual([]);
  });
});
