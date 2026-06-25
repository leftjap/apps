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

/* ───────── 실데이터 어댑터 (screentime_daily → 뷰 shape) ─────────
   screentime_daily(owner_id·date·kind('app'|'site')·name·seconds) 를 일/주/월 뷰로.
   total = 앱 합(사이트는 브라우저 내부 도메인 분해라 중복 제외, §8.1 정합성).
   내 도구 = 밀리의 서재(앱) + leftjap.github.io(사이트). 그 외 = total − 도구. */

// 내 도구(올리브) — cue 가 정체를 확실히 아는 자기 도구만 (§3·§8)
export const TOOL_APP = 'kr.co.millie.MillieShelf';   // 독서 = 밀리의 서재
export const TOOL_SITE = 'leftjap.github.io';          // 글쓰기·어학

// 앱 번들 ID → 표시 이름 (상위·알려진 앱. 미상은 fallback). 사이트는 도메인 그대로.
const APP_NAMES = {
  'com.google.Chrome': 'Chrome', 'com.blizzard.Starcraft': '스타크래프트',
  'com.anthropic.claudefordesktop': 'Claude', 'md.obsidian': 'Obsidian',
  'kr.co.millie.MillieShelf': '밀리의 서재', 'ru.keepcoder.Telegram': 'Telegram',
  'net.battle.app': 'Battle.net', 'com.apple.MobileSMS': '메시지', 'com.apple.finder': 'Finder',
  'com.tinyspeck.slackmacgap': 'Slack', 'com.kakao.KakaoTalkMac': '카카오톡',
  'com.microsoft.VSCode': 'VS Code', 'com.microsoft.onenote.mac': 'OneNote',
  'com.apple.systempreferences': '시스템 설정', 'com.apple.Preview': '미리보기',
  'com.apple.AppStore': 'App Store', 'com.apple.FaceTime': 'FaceTime', 'net.shinyfrog.bear': 'Bear',
};

/** 번들 ID → 표시 이름. 미상이면 마지막 세그먼트 대문자화. */
export function appName(id) {
  if (APP_NAMES[id]) return APP_NAMES[id];
  const seg = String(id || '').split('.').pop() || '';
  return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : '(알 수 없음)';
}

/** 초 → "N시간 M분" / "N시간" / "M분" (0 → "0분"). 분은 반올림. */
export function fmtDur(sec) {
  const min = Math.round((Number(sec) || 0) / 60);
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/** 증감 라벨 — "▲6분" / "어제보다 ▼22분". prev 0 이면 현재값만큼 증가로 표시.
    초 차이를 먼저 구해 1회만 반올림한다 — 각 항을 따로 분 반올림하면 차이가 최대 ±1분 부풀려짐. */
export function deltaLabel(curSec, prevSec, prefix = '') {
  const diffMin = Math.round(((Number(curSec) || 0) - (Number(prevSec) || 0)) / 60);
  const arrow = diffMin >= 0 ? '▲' : '▼';
  return `${prefix ? prefix + ' ' : ''}${arrow}${fmtDur(Math.abs(diffMin) * 60)}`;
}

/** {name:sec} → 랭킹 행 [{n,t,v,tool?,other?}]. 상위 topN(+도구 보장) + 나머지 기타 병합. */
export function rankRows(agg, isTool, displayFn, topN) {
  const items = Object.entries(agg).map(([name, sec]) => ({ name, sec }))
    .filter((x) => x.sec > 0).sort((a, b) => b.sec - a.sec);
  const named = [], rest = [];
  for (const x of items) {
    if (named.length < topN || isTool(x.name)) named.push(x);
    else rest.push(x);
  }
  const rows = named.map((x) => {
    const r = { n: displayFn(x.name), t: fmtDur(x.sec), v: Math.round(x.sec / 60) };
    if (isTool(x.name)) r.tool = true;
    return r;
  });
  const restSec = rest.reduce((a, x) => a + x.sec, 0);
  if (restSec > 0) rows.push({ n: '기타', t: fmtDur(restSec), v: Math.round(restSec / 60), other: true });
  return rows;
}

const _p2 = (n) => String(n).padStart(2, '0');
const _key = (d) => `${d.getFullYear()}-${_p2(d.getMonth() + 1)}-${_p2(d.getDate())}`;
const _addDays = (base, n) => { const x = new Date(base); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + n); return x; };
const _weekMon = (base) => { const x = new Date(base); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

const _sumApps = (rows, s, e) => rows.reduce((t, r) => (r.kind === 'app' && r.date >= s && r.date <= e ? t + r.seconds : t), 0);
const _sumOne = (rows, s, e, kind, name) => rows.reduce((t, r) => (r.kind === kind && r.name === name && r.date >= s && r.date <= e ? t + r.seconds : t), 0);
const _toolSec = (rows, s, e) => _sumOne(rows, s, e, 'app', TOOL_APP) + _sumOne(rows, s, e, 'site', TOOL_SITE);
function _aggKind(rows, s, e, kind) {
  const a = {};
  for (const r of rows) if (r.kind === kind && r.date >= s && r.date <= e) a[r.name] = (a[r.name] || 0) + r.seconds;
  return a;
}

/** 한 기간(day|week|month) 의 뷰 shape — SCREENTIME_DATA[period] 와 동일 키. */
function buildPeriod(rows, today, period) {
  const base = new Date(today); base.setHours(0, 0, 0, 0);
  const curE = _key(base);
  let curS, prevS, prevE, buckets, axisStart, axisEnd, prefix;
  if (period === 'day') {
    curS = curE;
    prevS = prevE = _key(_addDays(base, -1));
    buckets = Array.from({ length: 7 }, (_, i) => { const k = _key(_addDays(base, i - 6)); return [k, k]; });
    axisStart = '7일 전'; axisEnd = '오늘'; prefix = '어제보다';
  } else if (period === 'week') {
    const mon = _weekMon(base); curS = _key(mon);
    // 증감은 '같은 경과 구간'끼리 — 지난주 월~(이번 주 경과일과 동일)까지 (부분 vs 전체 왜곡 방지)
    const elapsed = Math.round((base - mon) / 86400000); // 이번 주 경과일 (월=0)
    prevS = _key(_addDays(mon, -7)); prevE = _key(_addDays(mon, -7 + elapsed));
    buckets = Array.from({ length: 8 }, (_, i) => { const m = _addDays(mon, (i - 7) * 7); return [_key(m), i === 7 ? curE : _key(_addDays(m, 6))]; });
    axisStart = '8주 전'; axisEnd = '이번 주'; prefix = '지난주보다';
  } else {
    curS = _key(new Date(base.getFullYear(), base.getMonth(), 1));
    // 증감은 지난달 1일~(이번 달과 동일한 날짜)까지 — month-to-date 동일 비교
    const dom = base.getDate();
    const pFirst = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    const pLastDom = new Date(base.getFullYear(), base.getMonth(), 0).getDate();
    prevS = _key(pFirst);
    prevE = _key(new Date(pFirst.getFullYear(), pFirst.getMonth(), Math.min(dom, pLastDom)));
    buckets = Array.from({ length: 6 }, (_, i) => {
      const mf = new Date(base.getFullYear(), base.getMonth() - (5 - i), 1);
      return [_key(mf), i === 5 ? curE : _key(new Date(mf.getFullYear(), mf.getMonth() + 1, 0))];
    });
    axisStart = `${new Date(base.getFullYear(), base.getMonth() - 5, 1).getMonth() + 1}월`;
    axisEnd = `${base.getMonth() + 1}월`; prefix = '지난달보다';
  }
  const total = _sumApps(rows, curS, curE);
  // 내 도구 = 밀리(앱) + leftjap(사이트). 사이트는 앱-합(total)에 안 들어가므로, 측정 불일치로
  // 도구가 total 을 넘으면 비중>100%·otherTotal 음수가 됨. 물리적으로 도구시간 ≤ 전체시간이라
  // total 로 클램프(정상 데이터에선 도구 ≤ Chrome ≤ total 이라 항상 no-op).
  const toolSec = Math.min(_toolSec(rows, curS, curE), total);
  const prevTotal = _sumApps(rows, prevS, prevE);
  const prevToolSec = Math.min(_toolSec(rows, prevS, prevE), prevTotal);
  // 비중은 '표시되는 분' 기준으로 계산해 헤드라인 숫자와 어긋나지 않게 (예: 5분/69분 ↔ 7%)
  const totalMin = Math.round(total / 60), toolMin = Math.round(toolSec / 60);
  const share = totalMin > 0 ? `${Math.min(Math.round((toolMin / totalMin) * 100), 100)}%` : '0%';
  // 이전 기간에 데이터가 전혀 없으면(추적 시작 전) 오해 소지의 증감 미표시
  const hasPrev = prevTotal > 0;
  return {
    total: fmtDur(total),
    totalDelta: hasPrev ? deltaLabel(total, prevTotal, prefix) : '',
    toolTotal: fmtDur(toolSec),
    toolDelta: hasPrev ? deltaLabel(toolSec, prevToolSec, '') : '',
    toolShare: share, toolPct: share,
    otherTotal: fmtDur(Math.max(total - toolSec, 0)),
    bkRead: fmtDur(_sumOne(rows, curS, curE, 'app', TOOL_APP)),
    bkWeb: fmtDur(_sumOne(rows, curS, curE, 'site', TOOL_SITE)),
    axisStart, axisEnd,
    trendTotals: buckets.map(([s, e]) => Math.round(_sumApps(rows, s, e) / 60)),
    trendTool: buckets.map(([s, e]) => Math.round(_toolSec(rows, s, e) / 60)),
    apps: rankRows(_aggKind(rows, curS, curE, 'app'), (n) => n === TOOL_APP, appName, 6),
    sites: rankRows(_aggKind(rows, curS, curE, 'site'), (n) => n === TOOL_SITE, (n) => n, 6),
  };
}

/** screentime_daily 행 배열 → { day, week, month } (screenTimeView 입력). */
export function buildScreenTimeData(rows, today) {
  return {
    day: buildPeriod(rows, today, 'day'),
    week: buildPeriod(rows, today, 'week'),
    month: buildPeriod(rows, today, 'month'),
  };
}

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
