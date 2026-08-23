import { describe, it, expect } from 'vitest';
import {
  CARDIO_METRICS, metricMeta, nextMetric, prevMetric, steppedValue,
  formatMetric, cardioDayTotals, cardioMetricWeek,
  cardioLayout, gestureTranslate, gestureCommit,
} from './session-cardio.js';

// 네이티브 GymCore/CardioMetricWeek.swift 의 1:1 포팅.
// 두 구현이 갈라지지 않도록 GymCoreTests/CardioMetricWeekTests.swift 와 같은 픽스처·기대값을 쓴다.
// (작업지시서 specs/2026-08-18-cardio-input-design.md §4·§5·§6-1)

const run = (date, ex, min, km, kcal) => ({
  id: `${date}-${ex}`, date, status: 'completed',
  blocks: [{ type: 'single', exerciseId: ex, sets: [{
    done: true,
    duration: min == null ? null : min * 60,
    distance: km ?? null,
    calories: kcal ?? null,
  }] }],
});

// 2026-08-21(금). 이번 주 월 08-17 ~ 일 08-23, 지난주 월 08-10 ~ 일 08-16.
const NOW = new Date(2026, 7, 21).getTime();
const HISTORY = [
  run('2026-08-17', 'treadmill', 15, 1.5, 96),
  run('2026-08-19', 'treadmill', 20, 2.0, 128),
  run('2026-08-20', 'treadmill', 15, 1.4, 85),
  run('2026-08-15', 'treadmill', 20, 2.2, 122),   // 지난주 토
];
const TODAY_SETS = [{ duration: 1920, distance: 3.4 }];   // 32분 3.4km, 칼로리 미입력

const week = (metric, todaySets = TODAY_SETS, sessions = HISTORY) =>
  cardioMetricWeek({ sessions, todaySets, exerciseId: 'treadmill', metric, now: NOW });

describe('cardioMetricWeek — 확정 시안 7a 재현', () => {
  it('시간 지표 — 15·20·15·오늘32 = 82분 4일', () => {
    const w = week('duration');
    expect(w.days.map((d) => d.text)).toEqual(['15', null, '20', '15', '32', '20', null]);
    expect(w.days.map((d) => d.style))
      .toEqual(['filled', 'ring', 'filled', 'filled', 'filled', 'ring', 'ringFaint']);
    expect(w.days.map((d) => d.isToday)).toEqual([false, false, false, false, true, false, false]);
    expect([w.total, w.unit, w.dayCount]).toEqual(['82', '분', 4]);
  });

  it('칼로리 지표 — 오늘 미입력이면 직전 러닝을 참조 스타일로, 합계에서 제외', () => {
    const w = week('calories');
    expect(w.days.map((d) => d.text)).toEqual(['96', null, '128', '85', '85', '122', null]);
    expect(w.days[4].style).toBe('todayRef');
    expect([w.total, w.unit, w.dayCount]).toEqual(['309', 'kcal', 3]);
  });

  it('거리 지표 — 소수 1자리 고정', () => {
    const w = week('distance');
    expect(w.days.map((d) => d.text)).toEqual(['1.5', null, '2.0', '1.4', '3.4', '2.2', null]);
    expect([w.total, w.unit, w.dayCount]).toEqual(['8.3', 'km', 4]);
  });

  // 지난·미래 요일의 원 형태는 지표와 무관 (오늘 칸만 예외 — 위 칼로리 테스트가 그 예외를 덮는다).
  it('오늘 외 원 스타일은 지표를 바꿔도 같다', () => {
    const styles = CARDIO_METRICS.map((m) =>
      JSON.stringify(week(m).days.filter((d) => !d.isToday).map((d) => d.style)));
    expect(new Set(styles).size).toBe(1);
  });

  it('시간은 있고 그 지표 기록이 없는 과거 요일 → "—" (0·역산 아님)', () => {
    const w = week('calories', TODAY_SETS, [run('2026-08-17', 'treadmill', 15, null, null)]);
    expect(w.days[0].text).toBe('—');
    expect(w.days[0].style).toBe('filled');
    // 일수는 **뛴 날 수** — 그 지표를 적은 날 수가 아니다 (실기기 2026-08-19 불일치의 한 축).
    // 오늘 칸만 지표 기준으로 남는다 — 확정 시안 7a 가 "시간 4일 / 칼로리 3일" 로 못 박았다.
    expect([w.total, w.dayCount]).toEqual(['0', 1]);
  });

  it('다른 유산소 종목은 섞이지 않는다 (종목 단위 집계)', () => {
    const w = week('duration', TODAY_SETS, [
      ...HISTORY,
      run('2026-08-18', 'cycle', 40, null, 300),
      run('2026-08-19', 'elliptical', 30, null, 200),
    ]);
    expect(w.days[1].text).toBeNull();
    expect([w.total, w.dayCount]).toEqual(['82', 4]);
  });

  it('오늘 입력됨 → 채움 + 합계 포함', () => {
    const w = week('calories', [{ duration: 1920, calories: 200 }]);
    expect([w.days[4].style, w.days[4].text]).toEqual(['filled', '200']);
    expect([w.total, w.dayCount]).toEqual(['509', 4]);
  });

  it('구데이터 다중 세트 — 오늘 원은 그날 합', () => {
    expect(week('duration', [{ duration: 600 }, { duration: 900 }]).days[4].text).toBe('25');
  });

  it('기록 없음 — 전부 빈 원, 합계 0', () => {
    const w = week('duration', [], []);
    expect(w.days.every((d) => d.text === null)).toBe(true);
    expect([w.total, w.dayCount]).toEqual(['0', 0]);
  });
});

describe('지표 메타·로테이션·증감', () => {
  it('라벨·단위·증분', () => {
    expect(CARDIO_METRICS.map((m) => metricMeta(m).label)).toEqual(['시간', '거리', '칼로리']);
    expect(CARDIO_METRICS.map((m) => metricMeta(m).unit)).toEqual(['분', 'km', 'kcal']);
    expect(CARDIO_METRICS.map((m) => metricMeta(m).step)).toEqual([1, 0.1, 10]);
  });
  it('로테이션은 순환하지 않는다', () => {
    expect(nextMetric('duration')).toBe('distance');
    expect(nextMetric('calories')).toBeNull();
    expect(prevMetric('duration')).toBeNull();
    expect(prevMetric('calories')).toBe('distance');
  });
  it('증감 — 하한 0, 거리만 0.1 단위', () => {
    expect(steppedValue('duration', 32, 1)).toBe(33);
    expect(steppedValue('distance', 3.4, -1)).toBe(3.3);
    expect(steppedValue('calories', 5, -1)).toBe(0);
    expect(steppedValue('distance', 0, -1)).toBe(0);
  });
  it('표기 — 거리 1자리, 나머지 정수', () => {
    expect(formatMetric('distance', 3.44)).toBe('3.4');
    expect(formatMetric('duration', 31.6)).toBe('32');
  });
});

describe('제스처 — 끝단 저항 0.28 · 임계 커밋 · 순환 없음', () => {
  it('저항은 끝단에서만', () => {
    expect(gestureTranslate(100, 'duration')).toBeCloseTo(28, 9);
    expect(gestureTranslate(-100, 'duration')).toBe(-100);
    expect(gestureTranslate(-100, 'calories')).toBeCloseTo(-28, 9);
    expect(gestureTranslate(100, 'distance')).toBe(100);
  });
  it('임계 이상만 커밋', () => {
    expect(gestureCommit(-56, 'duration', 56)).toBe('distance');
    expect(gestureCommit(-55, 'duration', 56)).toBe('duration');
    expect(gestureCommit(56, 'distance', 56)).toBe('duration');
  });
  it('순환 없음', () => {
    expect(gestureCommit(999, 'duration', 56)).toBe('duration');
    expect(gestureCommit(-999, 'calories', 56)).toBe('calories');
  });
});

describe('치수 — 기기 폭에서 유도 (§6-1)', () => {
  it('시안 목업 360 재현', () => {
    const l = cardioLayout(360);
    expect(l.contentWidth).toBe(316);
    expect(l.tapZone).toBeCloseTo(104.28, 2);
    expect(l.swipeThreshold).toBeCloseTo(56.88, 2);
    expect(l.circleDiameter).toBe(37);
    expect([0, 1, 2].map(l.trackOffset)).toEqual([0, -316, -632]);
  });
  it('오프셋은 폭에서 유도 (316 리터럴 고정 금지)', () => {
    expect(cardioLayout(375).trackOffset(1)).toBe(-331);
    expect(cardioLayout(430).trackOffset(1)).toBe(-386);
  });
  it('탭 영역 하한 44', () => { expect(cardioLayout(160).tapZone).toBe(44); });
  it('간격 4 미만인 좁은 폭에서만 원 32', () => {
    expect(cardioLayout(375).circleDiameter).toBe(37);
    expect(cardioLayout(430).circleDiameter).toBe(37);
    expect(cardioLayout(320).circleDiameter).toBe(32);
  });
});

// 실기기 보고 2026-08-19 — 홈 "32분 6일" vs 세션 "24분 4일". 네이티브와 같은 결함이라 같이 고친다.
//  ① 세션이 오늘 이미 완료된 기록을 무시(진행 중 세트만 봄)  ② 0분·무기록 날 판정 불일치
describe('홈/세션 일수 불일치 회귀 (실기기 2026-08-19)', () => {
  const WED = new Date(2026, 7, 19).getTime();
  const r = (date, min) => ({ id: `r-${date}`, date, status: 'completed',
    blocks: [{ type: 'single', exerciseId: 'treadmill',
      sets: [{ done: true, duration: min == null ? null : min * 60 }] }] });
  const wk = (sessions, todaySets, now = WED) => cardioMetricWeek({
    sessions, todaySets, exerciseId: 'treadmill', metric: 'duration', now });

  it('오늘 이미 완료한 기록이 있으면 새 세션에서도 기록으로 본다', () => {
    const w = wk([r('2026-08-19', 8)], [{ duration: null }]);
    expect(w.days[2].style).toBe('filled');
    expect(w.days[2].text).toBe('8');
    expect([w.total, w.dayCount]).toEqual(['8', 1]);
  });

  it('오늘 완료분 + 진행 중 입력은 그날 합계', () => {
    const w = wk([r('2026-08-19', 8)], [{ duration: 300 }]);
    expect(w.days[2].text).toBe('13');
    expect([w.total, w.dayCount]).toEqual(['13', 1]);
  });

  it('0분 유산소도 뛴 날 (홈과 같은 술어)', () => {
    const w = wk([r('2026-08-17', 0)], []);
    expect(w.days[0].style).toBe('filled');
    expect(w.dayCount).toBe(1);
  });

  it('duration 없는 done 세트도 뛴 날 — 숫자만 "—"', () => {
    const w = wk([r('2026-08-17', null)], []);
    expect(w.days[0].style).toBe('filled');
    expect(w.days[0].text).toBe('—');
    expect(w.dayCount).toBe(1);
  });
});
