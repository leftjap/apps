/* screentime.js — cue 화면 시간(Screen Time) 영역 데이터·순수 로직.
   작업지시서(design_handoff_screentime) §5 막대색 규칙 · §6 추세 높이 · §8 데이터 계약 이식.

   ⚠️ §8: 아래 SCREENTIME_DATA 는 전부 placeholder(목업)다. 실제 screentime_daily 스키마
   확정 전까지 사실 아님 — 모달 헤더의 "확인 필요 · 목업" 플래그를 유지한다.
   내 도구(tool:true=올리브) = cue 가 정체를 확실히 아는 자기 도구만:
   독서=밀리의 서재(앱), 글쓰기·어학=leftjap.github.io(도메인). 운동은 iPhone 전용 → 데스크톱 화면시간 미포함.
   순수 함수(screenTimeRows·stackedTrend·screenTimeView)는 단위 테스트 대상. */

/** §8.1 목업 데이터 전체 (일/주/월). 모든 숫자 placeholder. */
export const SCREENTIME_DATA = {
  day: {
    total: '4시간', totalDelta: '어제보다 ▼22분',
    toolTotal: '41분', toolDelta: '▲6분', toolShare: '17%', toolPct: '17%',
    otherTotal: '3시간 19분', bkRead: '22분', bkWeb: '19분',
    axisStart: '7일 전', axisEnd: '오늘',
    trendTotals: [300, 265, 320, 240, 280, 250, 240],
    trendTool: [30, 40, 28, 52, 38, 35, 41],
    apps: [
      { n: 'Chrome', t: '1시간 52분', v: 112 },
      { n: '스타크래프트', t: '47분', v: 47 },
      { n: 'Claude', t: '38분', v: 38 },
      { n: '밀리의 서재', t: '22분', v: 22, tool: true },
      { n: 'Slack', t: '12분', v: 12 },
      { n: '기타', t: '9분', v: 9, other: true },
    ],
    sites: [
      { n: 'youtube.com', t: '41분', v: 41 },
      { n: 'claude.ai', t: '26분', v: 26 },
      { n: 'leftjap.github.io', t: '19분', v: 19, tool: true },
      { n: 'notion.so', t: '14분', v: 14 },
      { n: '기타', t: '12분', v: 12, other: true },
    ],
  },
  week: {
    total: '21시간 40분', totalDelta: '지난주보다 ▼2시간',
    toolTotal: '4시간 30분', toolDelta: '▲40분', toolShare: '21%', toolPct: '21%',
    otherTotal: '17시간 10분', bkRead: '2시간 40분', bkWeb: '1시간 50분',
    axisStart: '8주 전', axisEnd: '이번 주',
    trendTotals: [1500, 1440, 1560, 1380, 1410, 1320, 1290, 1300],
    trendTool: [180, 200, 210, 230, 240, 250, 260, 270],
    apps: [
      { n: 'Chrome', t: '9시간 20분', v: 560 },
      { n: '스타크래프트', t: '4시간 20분', v: 260 },
      { n: 'Claude', t: '3시간 5분', v: 185 },
      { n: '밀리의 서재', t: '2시간 40분', v: 160, tool: true },
      { n: 'Slack', t: '1시간', v: 60 },
      { n: '기타', t: '1시간 15분', v: 75, other: true },
    ],
    sites: [
      { n: 'youtube.com', t: '3시간 48분', v: 228 },
      { n: 'claude.ai', t: '2시간 10분', v: 130 },
      { n: 'leftjap.github.io', t: '1시간 50분', v: 110, tool: true },
      { n: 'notion.so', t: '1시간 5분', v: 65 },
      { n: '기타', t: '27분', v: 27, other: true },
    ],
  },
  month: {
    total: '83시간', totalDelta: '지난달보다 ▼12시간',
    toolTotal: '16시간', toolDelta: '▲2시간', toolShare: '19%', toolPct: '19%',
    otherTotal: '67시간', bkRead: '9시간', bkWeb: '7시간',
    axisStart: '1월', axisEnd: '6월',
    trendTotals: [5760, 5520, 5940, 5400, 5280, 4980],
    trendTool: [720, 780, 840, 900, 930, 960],
    apps: [
      { n: 'Chrome', t: '36시간', v: 2160 },
      { n: '스타크래프트', t: '17시간', v: 1020 },
      { n: 'Claude', t: '12시간', v: 720 },
      { n: '밀리의 서재', t: '9시간', v: 540, tool: true },
      { n: 'Slack', t: '4시간', v: 240 },
      { n: '기타', t: '5시간', v: 300, other: true },
    ],
    sites: [
      { n: 'youtube.com', t: '15시간', v: 900 },
      { n: 'claude.ai', t: '8시간', v: 480 },
      { n: 'leftjap.github.io', t: '7시간', v: 420, tool: true },
      { n: 'notion.so', t: '4시간', v: 240 },
      { n: '기타', t: '2시간', v: 120, other: true },
    ],
  },
};

const lerp = (a, b, r) => Math.round(a + (b - a) * r);

/** §5 — 각 랭킹 항목의 막대·텍스트 색을 값 비율 r=v/max 로 보간.
    내 도구=올리브, 일반=뉴트럴(r≥0.58 강조), 기타=가장 흐림. 막대 폭 최소 3%. */
export function screenTimeRows(list) {
  const max = Math.max(...list.map((x) => x.v), 1);
  return list.map((x) => {
    const r = x.v / max;
    const isTool = !!x.tool;
    const isOther = !!x.other;
    const neutral = `rgb(${lerp(214, 176, r)},${lerp(203, 162, r)},${lerp(181, 133, r)})`;
    const olive = `rgb(${lerp(168, 110, r)},${lerp(180, 126, r)},${lerp(136, 79, r)})`;
    const strong = isTool || (!isOther && r >= 0.58);
    const nameColor = isTool ? '#46522F' : isOther ? '#A2967F' : strong ? '#463E30' : '#7C7464';
    return {
      name: x.n, time: x.t,
      pct: Math.max(Math.round(r * 100), 3),
      barColor: isTool ? olive : neutral,
      nameColor, weight: strong ? 700 : 500,
      isTool, isOther,
    };
  });
}

/** §6 — 추세 누적 막대 높이(px). toolH=올리브(아래), otherH=뉴트럴(위). */
export function stackedTrend(totals, tool, height) {
  const tmax = Math.max(...totals, 1);
  return totals.map((v, i) => {
    const H = Math.max((v / tmax) * height, 3);
    const toolH = Math.min(Math.max((tool[i] / v) * H, 2), H);
    return { toolH, otherH: H - toolH };
  });
}

const SPAN_LABEL = { day: '오늘', week: '이번 주', month: '이번 달' };

/** 기간 → 파생 렌더 입력 (§7). period 변경 시 라벨·헤드라인·랭킹·추세 일괄 재계산. */
export function screenTimeView(data, period) {
  const d = data[period];
  const apps = screenTimeRows(d.apps);
  const sites = screenTimeRows(d.sites);
  return {
    toolLabel: `${SPAN_LABEL[period]} 내 도구로 보낸 시간`,
    total: d.total, totalDelta: d.totalDelta,
    toolTotal: d.toolTotal, toolDelta: d.toolDelta, toolShare: d.toolShare, toolPct: d.toolPct,
    otherTotal: d.otherTotal, bkRead: d.bkRead, bkWeb: d.bkWeb,
    axisStart: d.axisStart, axisEnd: d.axisEnd,
    apps, sites,
    railApps: apps.slice(0, 4), railSites: sites.slice(0, 4),
    trend: stackedTrend(d.trendTotals, d.trendTool, 92),
  };
}
