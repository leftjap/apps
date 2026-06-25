import { describe, it, expect } from 'vitest';
import {
  SCREENTIME_DATA, screenTimeRows, stackedTrend, screenTimeView,
  fmtDur, deltaLabel, appName, rankRows, buildScreenTimeData, TOOL_APP, TOOL_SITE,
} from './screentime.js';

describe('fmtDur — 초 → 시간 라벨', () => {
  it('포맷 규칙', () => {
    expect(fmtDur(0)).toBe('0분');
    expect(fmtDur(2460)).toBe('41분');        // 41분
    expect(fmtDur(6720)).toBe('1시간 52분');   // 112분
    expect(fmtDur(14400)).toBe('4시간');       // 240분 정각
    expect(fmtDur(32400)).toBe('9시간');       // 540분 정각
  });
});

describe('deltaLabel — 증감 (▲/▼ + 접두)', () => {
  it('감소·증가·접두', () => {
    expect(deltaLabel(2460, 3780, '어제보다')).toBe('어제보다 ▼22분'); // 41-63
    expect(deltaLabel(2460, 1500, '')).toBe('▲16분');                  // 41-25
    expect(deltaLabel(2460, 0, '')).toBe('▲41분');                     // prev 0 → 현재값만큼 증가
  });
  it('초 차이를 먼저 구해 1회 반올림 (각 항 따로 반올림한 ±1분 과대 방지)', () => {
    // (90-29)/60 = 1.02 → ▲1분. 각각 반올림하면 round(1.5)-round(0.48)=2-0=2분으로 과대.
    expect(deltaLabel(90, 29, '')).toBe('▲1분');
  });
});

describe('appName — 번들 ID → 표시 이름', () => {
  it('알려진 앱·도구·폴백', () => {
    expect(appName('com.google.Chrome')).toBe('Chrome');
    expect(appName('kr.co.millie.MillieShelf')).toBe('밀리의 서재');
    expect(appName('com.apple.finder')).toBe('Finder');     // 폴백: 마지막 세그먼트
    expect(appName('xyz.foo.bar')).toBe('Bar');
  });
});

describe('rankRows — 상위 N + 기타 병합 + 도구 보장', () => {
  it('도구는 topN 밖이어도 표시·올리브, 나머지는 기타', () => {
    const agg = { 'com.google.Chrome': 6000, 'com.blizzard.Starcraft': 3000, 'md.obsidian': 1000, 'x.y.z': 500, 'kr.co.millie.MillieShelf': 60 };
    const rows = rankRows(agg, (n) => n === TOOL_APP, appName, 3);
    expect(rows[0]).toMatchObject({ n: 'Chrome', v: 100 });
    const tool = rows.find((r) => r.tool);
    expect(tool).toMatchObject({ n: '밀리의 서재', v: 1, tool: true }); // topN(3) 밖이지만 포함
    const etc = rows.find((r) => r.other);
    expect(etc).toMatchObject({ n: '기타', other: true });
  });
});

describe('buildScreenTimeData — screentime_daily → 뷰 shape (실데이터 경로)', () => {
  const today = new Date(2026, 5, 24); // 2026-06-24
  const rows = [
    { date: '2026-06-24', kind: 'app', name: 'com.google.Chrome', seconds: 6000 },          // 100분
    { date: '2026-06-24', kind: 'app', name: 'kr.co.millie.MillieShelf', seconds: 1200 },    // 20분 (도구)
    { date: '2026-06-24', kind: 'site', name: 'leftjap.github.io', seconds: 900 },           // 15분 (도구)
    { date: '2026-06-24', kind: 'site', name: 'youtube.com', seconds: 1800 },                // 30분
    { date: '2026-06-23', kind: 'app', name: 'com.google.Chrome', seconds: 12000 },          // 200분
    { date: '2026-06-23', kind: 'app', name: 'kr.co.millie.MillieShelf', seconds: 600 },     // 10분
  ];
  const d = buildScreenTimeData(rows, today).day;

  it('total = 앱 합(사이트는 브라우저 내부 분해라 중복 제외)', () => {
    expect(d.total).toBe('2시간');           // 6000+1200=7200s=120분
  });
  it('내 도구 = 밀리(앱)+leftjap(사이트), 그 외 = total−도구', () => {
    expect(d.toolTotal).toBe('35분');        // 1200+900=2100s=35분
    expect(d.otherTotal).toBe('1시간 25분');  // 7200-2100=5100s=85분
    expect(d.toolShare).toBe('29%');         // round(2100/7200*100)
    expect(d.bkRead).toBe('20분');           // 밀리 앱
    expect(d.bkWeb).toBe('15분');            // leftjap 사이트
  });
  it('어제 대비 증감', () => {
    expect(d.totalDelta).toBe('어제보다 ▼1시간 30분'); // 120 - 210 = -90분
  });
  it('앱·사이트 랭킹 + 도구 플래그', () => {
    expect(d.apps[0]).toMatchObject({ n: 'Chrome', t: '1시간 40분', v: 100 });
    expect(d.apps.find((a) => a.tool)).toMatchObject({ n: '밀리의 서재', v: 20, tool: true });
    expect(d.sites.find((s) => s.tool)).toMatchObject({ n: 'leftjap.github.io', v: 15, tool: true });
  });
  it('추세 7일 (오늘=120, 어제=210)', () => {
    expect(d.trendTotals).toHaveLength(7);
    expect(d.trendTotals[6]).toBe(120);
    expect(d.trendTotals[5]).toBe(210);
  });

  it('주 증감 — 같은 경과 구간끼리 (이번주 월~수 vs 지난주 월~수, 부분vs전체 왜곡 방지)', () => {
    const wed = new Date(2026, 5, 24); // 수요일, 이번주 월=06-22
    const r = [
      { date: '2026-06-22', kind: 'app', name: 'com.google.Chrome', seconds: 600 }, // 이번주 월
      { date: '2026-06-24', kind: 'app', name: 'com.google.Chrome', seconds: 600 }, // 이번주 수 → 합 20분
      { date: '2026-06-15', kind: 'app', name: 'com.google.Chrome', seconds: 300 }, // 지난주 월 (비교 포함)
      { date: '2026-06-17', kind: 'app', name: 'com.google.Chrome', seconds: 300 }, // 지난주 수 (비교 포함) → 10분
      { date: '2026-06-20', kind: 'app', name: 'com.google.Chrome', seconds: 9000 }, // 지난주 토 (경과 구간 밖 → 제외)
    ];
    const w = buildScreenTimeData(r, wed).week;
    expect(w.totalDelta).toBe('지난주보다 ▲10분'); // 06-20(토) 150분은 비교에서 제외돼야 정상
  });

  it('월 증감 — 지난달 같은 날짜까지 데이터 없으면 미표시 (오해성 거대 증감 방지)', () => {
    const r = [{ date: '2026-06-10', kind: 'app', name: 'com.google.Chrome', seconds: 6000 }];
    const m = buildScreenTimeData(r, new Date(2026, 5, 24)).month; // 5월 1~24 데이터 없음
    expect(m.totalDelta).toBe('');
  });

  it('내 도구(밀리앱+leftjap사이트)가 앱합을 초과해도 비중≤100%·toolTotal≤total·otherTotal≥0 (incoherent 데이터 방어)', () => {
    // 사이트는 앱-분모에 안 들어가므로 leftjap 사이트>Chrome앱이면 비중이 100% 초과·other 음수가 됨 → 클램프.
    const r = [
      { date: '2026-06-25', kind: 'app', name: 'com.google.Chrome', seconds: 1800 },   // 30분 (앱합)
      { date: '2026-06-25', kind: 'site', name: 'leftjap.github.io', seconds: 4800 },   // 80분 (도구·사이트>앱)
    ];
    const d = buildScreenTimeData(r, new Date(2026, 5, 25)).day;
    expect(d.total).toBe('30분');
    expect(d.toolShare).toBe('100%');   // 클램프 (raw 267%)
    expect(d.toolTotal).toBe('30분');   // 클램프 to total (raw 1시간 20분)
    expect(d.otherTotal).toBe('0분');
  });

  it('주==월 — 데이터가 전부 이번 주 안이면 week.total===month.total (정상, 버그 아님: 누적되면 분기)', () => {
    const r = [
      { date: '2026-06-22', kind: 'app', name: 'com.google.Chrome', seconds: 3600 },
      { date: '2026-06-24', kind: 'app', name: 'com.google.Chrome', seconds: 1800 },
    ];
    const v = buildScreenTimeData(r, new Date(2026, 5, 25)); // 06-22(월)~06-25 전부 이번 주·이번 달
    expect(v.week.total).toBe(v.month.total);
  });

  it('월 증감 — 지난달이 더 짧으면 prev 윈도우가 지난달 말일로 클램프 (3/31→2/1~2/28, 3월 초가 prev로 누출 안 됨)', () => {
    const r = [
      { date: '2026-03-31', kind: 'app', name: 'com.google.Chrome', seconds: 600 },    // 이번달
      { date: '2026-03-03', kind: 'app', name: 'com.google.Chrome', seconds: 9000 },   // 이번달 초 (prev 아님)
      { date: '2026-02-28', kind: 'app', name: 'com.google.Chrome', seconds: 300 },    // 지난달 말일 (prev 포함)
    ];
    const m = buildScreenTimeData(r, new Date(2026, 2, 31)).month; // 3/31
    // cur(3월)=9600s=160분, prev(2/1~2/28)=300s=5분 → ▲155분. 클램프 깨지면 3/3이 prev로 새 ▲5분.
    expect(m.totalDelta).toBe('지난달보다 ▲2시간 35분');
  });
});

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
