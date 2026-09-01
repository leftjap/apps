/**
 * sidebarCal.js 단위 테스트 — 사이드바 "최근 4주" 기록 캘린더 (작업지시서 §2~§7·§11).
 *
 * 범위 (순수 로직만 — DOM 렌더는 dev 서버 화면 검증):
 *   - computeWindow: rolling 4주 창 (마지막 행 = 오늘 포함 주, 월요일 시작, 28칸 고정)
 *   - alphaOf: 농도 수식 α = min(0.72, 0.14 + 0.58 × chars / FULL_CHARS) — §11 검증값
 *   - aggregateEntriesByDay: created_at 로컬 날짜 귀속 + 하루 여러 편 합산 + 파트너 제외 (§10-3)
 *   - computeSummary: 총 매수(글자수 합산 후 나눔) + 하루 평균(현재 창 경과일 / 과거 창 28)
 *   - buildCellModel: 셀 상태 판정 순서 ①~⑤ + 월 1일 `M/1` 표기 + 툴팁 문구
 *   - buildPagingModel: 범위 라벨 · ‹ title · › 비활성
 */
import { describe, it, expect } from 'vitest';
import {
  FULL_CHARS,
  localDayKey,
  computeWindow,
  alphaOf,
  aggregateEntriesByDay,
  fmtRange,
  buildCellModel,
  computeSummary,
  buildPagingModel,
} from './sidebarCal.js';

// 시안 v4 픽스처 — 오늘 = 2026-04-23(목), 창 3.30 ~ 4.26 (작업지시서 동봉 시안 스크립트와 동일)
const SIAN_TODAY = new Date(2026, 3, 23, 14, 30);
const SIAN_CHARS = {
  '3-30': 380, '4-1': 520, '4-3': 240, '4-5': 610, '4-6': 450, '4-7': 300,
  '4-9': 680, '4-10': 410, '4-12': 560, '4-14': 240, '4-16': 520, '4-17': 380,
  '4-19': 640, '4-20': 430, '4-21': 720, '4-22': 380, '4-23': 340,
};

function sianAggMap() {
  const m = new Map();
  for (const [k, chars] of Object.entries(SIAN_CHARS)) {
    const [mo, d] = k.split('-').map(Number);
    m.set(localDayKey(new Date(2026, mo - 1, d)), { chars, rows: [] });
  }
  return m;
}

describe('computeWindow — rolling 4주 창 (§5)', () => {
  it('오늘 2026-04-23(목) → 3.30(월) ~ 4.26(일), 정확히 28칸', () => {
    const { start, end, days } = computeWindow(SIAN_TODAY, 0);
    expect(days.length).toBe(28);
    expect(localDayKey(start)).toBe('2026-3-30');
    expect(localDayKey(end)).toBe('2026-4-26');
    expect(days[0].getDay()).toBe(1); // 월요일 시작
    expect(days[27].getDay()).toBe(0); // 일요일 끝
  });

  it('offset -1 → 지난 창 3.2 ~ 3.29', () => {
    const { start, end } = computeWindow(SIAN_TODAY, -1);
    expect(localDayKey(start)).toBe('2026-3-2');
    expect(localDayKey(end)).toBe('2026-3-29');
  });

  it('월초(오늘 = 2026-05-02)에도 창이 끊기지 않고 4/6 ~ 5/3 으로 월을 걸친다 (§11)', () => {
    const { start, end, days } = computeWindow(new Date(2026, 4, 2), 0);
    expect(localDayKey(start)).toBe('2026-4-6');
    expect(localDayKey(end)).toBe('2026-5-3');
    expect(days.some((d) => d.getMonth() === 4 && d.getDate() === 1)).toBe(true);
  });

  it('오늘이 월요일이면 마지막 행 첫 칸이 오늘', () => {
    const today = new Date(2026, 3, 20); // 2026-04-20 월
    const { days } = computeWindow(today, 0);
    expect(localDayKey(days[21])).toBe('2026-4-20');
  });
});

describe('alphaOf — 농도 수식 (§5·§11)', () => {
  it('시안 검증값: 240→0.314, 380→0.416, 520→0.517, 720→0.662 (±0.001)', () => {
    expect(alphaOf(240)).toBeCloseTo(0.314, 3);
    expect(alphaOf(380)).toBeCloseTo(0.416, 2);
    expect(Math.abs(alphaOf(380) - 0.416)).toBeLessThanOrEqual(0.001);
    expect(alphaOf(520)).toBeCloseTo(0.517, 3);
    expect(alphaOf(720)).toBeCloseTo(0.662, 3);
  });

  it('1,000자 → 0.72 상한 캡, 0자 → 0.14 바닥', () => {
    expect(alphaOf(1000)).toBe(0.72);
    expect(alphaOf(0)).toBeCloseTo(0.14, 3);
  });

  it('FULL_CHARS 기본 800 (§10-4 설정 상수)', () => {
    expect(FULL_CHARS).toBe(800);
  });
});

describe('aggregateEntriesByDay — 일 단위 귀속 (§7)', () => {
  const ME = 'user-me';
  it('created_at 로컬 날짜로 귀속하고 하루 여러 편은 글자수를 합산한다', () => {
    const rows = [
      { owner_id: ME, kind: 'navi', created_at: '2026-04-16T09:00:00', content: '<p>가나다 라마</p>' }, // 5자
      { owner_id: ME, kind: 'memo', created_at: '2026-04-16T22:10:00', content: '<b>바사</b>' }, // 2자
      { owner_id: ME, kind: 'blog', created_at: '2026-04-17T01:00:00', content: '아 자' }, // 2자
    ];
    const agg = aggregateEntriesByDay(rows, ME);
    expect(agg.get('2026-4-16').chars).toBe(7);
    expect(agg.get('2026-4-16').rows.length).toBe(2);
    expect(agg.get('2026-4-17').chars).toBe(2);
  });

  it('파트너 소유 행은 제외한다 (§10-3)', () => {
    const rows = [
      { owner_id: 'partner', kind: 'navi', created_at: '2026-04-16T09:00:00', content: '가나다', is_shared: 1 },
      { owner_id: ME, kind: 'navi', created_at: '2026-04-16T10:00:00', content: '라' },
    ];
    const agg = aggregateEntriesByDay(rows, ME);
    expect(agg.get('2026-4-16').chars).toBe(1);
    expect(agg.get('2026-4-16').rows.length).toBe(1);
  });

  it('하루 내 rows 는 created_at 오름차순 정렬', () => {
    const rows = [
      { owner_id: ME, kind: 'navi', created_at: '2026-04-16T22:00:00', content: '나' },
      { owner_id: ME, kind: 'navi', created_at: '2026-04-16T09:00:00', content: '가' },
    ];
    const agg = aggregateEntriesByDay(rows, ME);
    expect(agg.get('2026-4-16').rows.map((r) => r.content)).toEqual(['가', '나']);
  });
});

describe('computeSummary — 합계 행 (§6·§11)', () => {
  it('시안 픽스처: 총 7,800자 → "39" (정수는 소수점 생략), 분모 25일 → 평균 "1.6"', () => {
    const { days } = computeWindow(SIAN_TODAY, 0);
    const { totalText, avgText } = computeSummary(sianAggMap(), days, SIAN_TODAY);
    expect(totalText).toBe('39');
    expect(avgText).toBe('1.6');
  });

  it('글자수를 합산한 뒤 나눈다 — 일별 반올림 합산 아님 (§11)', () => {
    // 두 날 각 110자 → 일별 round1(0.6)+round1(0.6)=1.2 (오답) / 합산 220/200 = 1.1 (정답)
    const today = SIAN_TODAY;
    const { days } = computeWindow(today, 0);
    const agg = new Map([
      [localDayKey(new Date(2026, 3, 20)), { chars: 110, rows: [] }],
      [localDayKey(new Date(2026, 3, 21)), { chars: 110, rows: [] }],
    ]);
    const { totalText } = computeSummary(agg, days, today);
    expect(totalText).toBe('1.1');
  });

  it('과거 창은 분모 28 고정 (§6)', () => {
    const { days } = computeWindow(SIAN_TODAY, -1); // 3.2~3.29 — 오늘 미포함
    const agg = new Map([[localDayKey(new Date(2026, 2, 10)), { chars: 7800, rows: [] }]]);
    const { totalText, avgText } = computeSummary(agg, days, SIAN_TODAY);
    expect(totalText).toBe('39');
    expect(avgText).toBe('1.4'); // 39/28 = 1.392… → 1.4
  });

  it('창 밖 날짜의 글자수는 합계에 포함하지 않는다', () => {
    const { days } = computeWindow(SIAN_TODAY, 0);
    const agg = new Map([[localDayKey(new Date(2026, 2, 1)), { chars: 9999, rows: [] }]]);
    const { totalText } = computeSummary(agg, days, SIAN_TODAY);
    expect(totalText).toBe('0');
  });
});

describe('buildCellModel — 셀 상태 판정 (§5, 순서 고정)', () => {
  const agg = sianAggMap();
  it('① 오늘·썼음 → is-today, 툴팁 "오늘 · 340자"', () => {
    const m = buildCellModel(new Date(2026, 3, 23), SIAN_TODAY, agg);
    expect(m.state).toBe('today');
    expect(m.title).toBe('오늘 · 340자');
    expect(m.label).toBe('23');
  });

  it('② 오늘·안 씀 → is-today-off (링), 툴팁 "오늘 · 0자"', () => {
    const m = buildCellModel(new Date(2026, 3, 23), SIAN_TODAY, new Map());
    expect(m.state).toBe('today-off');
    expect(m.title).toBe('오늘 · 0자');
  });

  it('③ 과거·썼음 → is-on + α, 툴팁 "4월 16일 · 520자"', () => {
    const m = buildCellModel(new Date(2026, 3, 16), SIAN_TODAY, agg);
    expect(m.state).toBe('on');
    expect(m.alpha).toBeCloseTo(0.517, 3);
    expect(m.title).toBe('4월 16일 · 520자');
  });

  it('④ 과거·안 씀 → is-off, 툴팁 "4월 18일 · 기록 없음"', () => {
    const m = buildCellModel(new Date(2026, 3, 18), SIAN_TODAY, agg);
    expect(m.state).toBe('off');
    expect(m.title).toBe('4월 18일 · 기록 없음');
  });

  it('⑤ 미래 → is-future, 툴팁 없음', () => {
    const m = buildCellModel(new Date(2026, 3, 25), SIAN_TODAY, agg);
    expect(m.state).toBe('future');
    expect(m.title).toBeUndefined();
  });

  it('매월 1일 셀만 "M/1" 표기 + m1 플래그 (§5)', () => {
    const m = buildCellModel(new Date(2026, 3, 1), SIAN_TODAY, agg);
    expect(m.label).toBe('4/1');
    expect(m.m1).toBe(true);
    expect(buildCellModel(new Date(2026, 3, 2), SIAN_TODAY, agg).m1).toBe(false);
  });

  it('1일이 오늘인 경우 today 스타일 우선 + "5/1" 표기 유지 (§11)', () => {
    const today = new Date(2026, 4, 1);
    const agg51 = new Map([[localDayKey(today), { chars: 200, rows: [] }]]);
    const m = buildCellModel(new Date(2026, 4, 1), today, agg51);
    expect(m.state).toBe('today');
    expect(m.label).toBe('5/1');
    expect(m.m1).toBe(true);
  });
});

describe('fmtRange · buildPagingModel — 헤더 (§3)', () => {
  it('범위 표기 "3.30 – 4.26" (공백 포함 en dash)', () => {
    const { start, end } = computeWindow(SIAN_TODAY, 0);
    expect(fmtRange(start, end)).toBe('3.30 – 4.26');
  });

  it('현재 창: › 비활성, ‹ title "지난 4주 (3.2 – 3.29)" (§11)', () => {
    const p = buildPagingModel(SIAN_TODAY, 0);
    expect(p.rangeText).toBe('3.30 – 4.26');
    expect(p.nextDisabled).toBe(true);
    expect(p.prevTitle).toBe('지난 4주 (3.2 – 3.29)');
    expect(p.nextTitle).toBe('다음 4주');
  });

  it('과거 창: › 활성, 범위 라벨이 해당 창으로 갱신 (§11)', () => {
    const p = buildPagingModel(SIAN_TODAY, -1);
    expect(p.rangeText).toBe('3.2 – 3.29');
    expect(p.nextDisabled).toBe(false);
    expect(p.prevTitle).toBe('지난 4주 (2.2 – 3.1)');
  });
});
