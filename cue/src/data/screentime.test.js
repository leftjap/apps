import { describe, it, expect } from 'vitest';
import { SCREENTIME_DATA, screenTimeRows, stackedTrend, screenTimeView } from './screentime.js';

describe('screenTimeRows — §5 막대 색 규칙 (lerp 보간·강조·올리브 도구)', () => {
  const rows = screenTimeRows(SCREENTIME_DATA.day.apps); // max=112

  it('최댓값 항목(Chrome r=1) — 뉴트럴 끝값·강조 700', () => {
    const chrome = rows[0];
    expect(chrome.name).toBe('Chrome');
    expect(chrome.pct).toBe(100);
    expect(chrome.barColor).toBe('rgb(176,162,133)');
    expect(chrome.nameColor).toBe('#463E30');
    expect(chrome.weight).toBe(700);
    expect(chrome.isTool).toBe(false);
  });

  it('내 도구(밀리의 서재 v22) — 올리브 보간·점·700', () => {
    const millie = rows[3];
    expect(millie.name).toBe('밀리의 서재');
    expect(millie.isTool).toBe(true);
    expect(millie.barColor).toBe('rgb(157,169,125)');
    expect(millie.nameColor).toBe('#46522F');
    expect(millie.weight).toBe(700);
    expect(millie.pct).toBe(20);
  });

  it('약한 일반 항목(스타크래프트 r≈0.42<0.58) — 흐림 500', () => {
    const sc = rows[1];
    expect(sc.nameColor).toBe('#7C7464');
    expect(sc.weight).toBe(500);
    expect(sc.pct).toBe(42);
  });

  it('기타(other) — 가장 흐림·강조 제외·점 없음', () => {
    const etc = rows[5];
    expect(etc.isOther).toBe(true);
    expect(etc.isTool).toBe(false);
    expect(etc.nameColor).toBe('#A2967F');
    expect(etc.weight).toBe(500);
    expect(etc.pct).toBe(8);
  });

  it('막대 폭 최소 3% 보장', () => {
    expect(screenTimeRows([{ n: 'x', t: '0분', v: 0 }, { n: 'big', t: '1시간', v: 999 }])[0].pct).toBe(3);
  });
});

describe('stackedTrend — §6 추세 막대 높이 (toolH 아래·otherH 위)', () => {
  const day = stackedTrend(SCREENTIME_DATA.day.trendTotals, SCREENTIME_DATA.day.trendTool, 92);

  it('컬럼 수 = 데이터 포인트 수 (일7·주8·월6)', () => {
    expect(day).toHaveLength(7);
    expect(stackedTrend(SCREENTIME_DATA.week.trendTotals, SCREENTIME_DATA.week.trendTool, 92)).toHaveLength(8);
    expect(stackedTrend(SCREENTIME_DATA.month.trendTotals, SCREENTIME_DATA.month.trendTool, 92)).toHaveLength(6);
  });

  it('i=0: v=300 tool=30 → H=86.25, toolH=8.625, otherH=77.625', () => {
    expect(day[0].toolH).toBeCloseTo(8.625, 3);
    expect(day[0].otherH).toBeCloseTo(77.625, 3);
  });

  it('i=3: v=240 tool=52 → H=69, toolH=14.95, otherH=54.05', () => {
    expect(day[3].toolH).toBeCloseTo(14.95, 2);
    expect(day[3].otherH).toBeCloseTo(54.05, 2);
  });

  it('toolH 하한 2px (tool 비중 매우 작아도)', () => {
    const r = stackedTrend([1000], [1], 92);
    expect(r[0].toolH).toBe(2);
  });
});

describe('screenTimeView — 파생 렌더 입력 (§7)', () => {
  it('toolLabel 이 기간별로 바뀜 (과거 동기 버그 방지)', () => {
    expect(screenTimeView(SCREENTIME_DATA, 'day').toolLabel).toBe('오늘 내 도구로 보낸 시간');
    expect(screenTimeView(SCREENTIME_DATA, 'week').toolLabel).toBe('이번 주 내 도구로 보낸 시간');
    expect(screenTimeView(SCREENTIME_DATA, 'month').toolLabel).toBe('이번 달 내 도구로 보낸 시간');
  });

  it('레일은 상위 4행, 모달은 전체', () => {
    const v = screenTimeView(SCREENTIME_DATA, 'day');
    expect(v.railApps).toHaveLength(4);
    expect(v.railSites).toHaveLength(4);
    expect(v.apps).toHaveLength(6);
    expect(v.sites).toHaveLength(5);
  });

  it('헤드라인 값은 데이터 그대로 전달', () => {
    const v = screenTimeView(SCREENTIME_DATA, 'day');
    expect(v.toolTotal).toBe('41분');
    expect(v.total).toBe('4시간');
    expect(v.toolPct).toBe('17%');
    expect(v.trend).toHaveLength(7);
  });
});
