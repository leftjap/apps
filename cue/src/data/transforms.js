/* transforms.js — 순수 함수 (데이터 → 표시값). 단위 테스트 대상.
   양(수치) 기반: streak/최장연속/활동률/히트맵 농담/날짜 메타.
   data-l.jsx 의 헬퍼를 ES 모듈 + 테스트 가능 시그니처로 이식. */

export const WD = ["일", "월", "화", "수", "목", "금", "토"];

/** 연속 일수 — 끝(최신)에서부터 수치>0 인 날 카운트, 0 만나면 중단 */
export function runDays(seq) {
  let n = 0;
  for (let i = seq.length - 1; i >= 0; i--) {
    if (seq[i] > 0) n++;
    else break;
  }
  return n;
}

/** 구간 내 최장 연속 */
export function longestRun(seq) {
  let best = 0, cur = 0;
  for (const v of seq) {
    if (v > 0) { cur++; best = Math.max(best, cur); }
    else cur = 0;
  }
  return best;
}

/** 오늘 자정 (날짜 라벨·hist 정렬 기준) */
export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** base 에서 daysAgo 일 전의 {월, 일, 요일} */
export function dayMeta(daysAgo, base) {
  const d = new Date(base);
  d.setDate(d.getDate() - daysAgo);
  return { m: d.getMonth() + 1, d: d.getDate(), wd: WD[d.getDay()] };
}

export const p2 = (n) => String(n).padStart(2, "0");

/* ─── 실데이터 어댑터용 (adapter.js) — TDD ─────────────────────────────── */

/** today 앱 charCount/sheetCount 복제 — 원고지 매수(공백 제외 글자수/200, 0.1 반올림) */
export function sheetsFromHtml(html) {
  const text = String(html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const chars = text.replace(/\s/g, "").length;
  return Math.round((chars / 200) * 10) / 10;
}

/** 로컬 타임존 기준 YYYY-MM-DD (UTC 타임스탬프를 사용자 로컬 날짜로 버킷) */
export function localDayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** 오늘로 끝나는 len 일 키 배열 (oldest→newest, 마지막 = 오늘) */
export function dayKeysEndingToday(len, today) {
  const base = new Date(today); base.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = len - 1; i >= 0; i--) {
    const d = new Date(base); d.setDate(d.getDate() - i);
    out.push(localDayKey(d));
  }
  return out;
}

/** 행 배열 → 일별 합계 윈도우 (index len-1 = 오늘). 윈도우 밖 행 무시. */
export function dailySeries(rows, getKey, getVal, len, today) {
  const keys = dayKeysEndingToday(len, today);
  const idx = new Map(keys.map((k, i) => [k, i]));
  const series = new Array(len).fill(0);
  for (const r of rows || []) {
    const i = idx.get(getKey(r));
    if (i !== undefined) series[i] += Number(getVal(r)) || 0;
  }
  return series;
}

/** 며칠 전 → 한국어 라벨 */
export function relativeDayLabel(daysAgo) {
  if (daysAgo === 0) return "오늘";
  if (daysAgo === 1) return "어제";
  if (daysAgo === 2) return "그제";
  return `${daysAgo}일 전`;
}

/** 오늘(마지막 index) 이전 가장 최근 활동(>0)까지의 일수. 없으면 null. */
export function lastActiveDaysAgo(series) {
  const last = series.length - 1;
  for (let i = last - 1; i >= 0; i--) {
    if (series[i] > 0) return last - i;
  }
  return null;
}

/** 그 주 월요일 00:00 (월=주 시작) */
export function weekStartMonday(date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const back = (d.getDay() + 6) % 7; // 월=0 … 일=6 거슬러갈 일수
  d.setDate(d.getDate() - back);
  return d;
}

/** 이번주(월~오늘) 범위 내 distinct 날짜 키 수 (gym 이번주 회수) */
export function countDaysInCurrentWeek(dateKeys, today) {
  const start = localDayKey(weekStartMonday(today));
  const end = localDayKey(today);
  const set = new Set();
  for (const k of dateKeys || []) {
    if (k >= start && k <= end) set.add(k);
  }
  return set.size;
}

/** 이번주 경과 일수 — 월=1 … 일=7 */
function daysIntoWeek(today) {
  return ((new Date(today).getDay() + 6) % 7) + 1;
}

/** 타임스탬프(ms|ISO) 목록 중 로컬 '오늘' 에 속한 최신 ms (없으면 null) — 오늘 흐름 at */
export function latestTodayTs(tsList, today) {
  const key = localDayKey(today);
  let best = null;
  for (const t of tsList || []) {
    if (t == null) continue;
    const d = new Date(t);
    if (Number.isNaN(d.getTime()) || localDayKey(d) !== key) continue;
    if (best === null || d.getTime() > best) best = d.getTime();
  }
  return best;
}

/** 타임스탬프(ms|ISO) → 로컬 minute-of-day. invalid 면 null (오늘 흐름 atMin) */
export function minuteOfDay(ts) {
  if (ts == null) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

/** 평소 실행 시간대(분) = 실행 시각들의 minute-of-day 중앙값.
    유효 기록 3회 미만이면 fallbackMin (flow 작업지시서 §5) */
export function medianMinuteOfDay(tsList, fallbackMin) {
  const mins = (tsList || []).map(minuteOfDay).filter((m) => m != null).sort((a, b) => a - b);
  if (mins.length < 3) return fallbackMin;
  const mid = Math.floor(mins.length / 2);
  return mins.length % 2 ? mins[mid] : (mins[mid - 1] + mins[mid]) / 2;
}

/* ─── v8 대시보드 (월 캘린더·주간 집계·due 판정) ─────────────────────── */

/** 오늘이 속한 달의 1일~말일 일별 배열 — 오늘로 끝나는 series 에서 추출. 오늘 이후·범위 밖 = 0 */
export function monthSeries(series, today) {
  const d = new Date(today);
  const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const todayDate = d.getDate();
  const last = series.length - 1;
  const out = new Array(dim).fill(0);
  for (let day = 1; day <= todayDate; day++) {
    const i = last - (todayDate - day);
    if (i >= 0) out[day - 1] = series[i] || 0;
  }
  return out;
}

/** monthsBack 달 전 한 달 합 (0=이번 달 1일~오늘). 그 달 시작이 series 밖이면 null */
export function monthSum(series, today, monthsBack) {
  const base = new Date(today); base.setHours(0, 0, 0, 0);
  const first = new Date(base.getFullYear(), base.getMonth() - monthsBack, 1);
  const lastDay = monthsBack === 0
    ? base
    : new Date(base.getFullYear(), base.getMonth() - monthsBack + 1, 0);
  const firstIdx = series.length - 1 - Math.round((base - first) / 86400000);
  const lastIdx = series.length - 1 - Math.round((base - lastDay) / 86400000);
  if (firstIdx < 0) return null;
  let s = 0;
  for (let i = firstIdx; i <= lastIdx; i++) s += series[i] || 0;
  return Math.round(s * 10) / 10;
}

/** 최근 weeks 주 주별 합 (월 시작, 마지막 = 이번주 월~오늘). oldest→newest. 부족분 0 */
export function weeklySums(series, today, weeks = 8) {
  const n = daysIntoWeek(today);
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const start = series.length - (n + (weeks - 1 - w) * 7);
    const len = w === weeks - 1 ? n : 7;
    let s = 0;
    for (let i = 0; i < len; i++) s += series[start + i] || 0;
    out.push(Math.round(s * 10) / 10);
  }
  return out;
}

/** 최근 weeks 주 주별 활동일수 (월 시작, 마지막 = 이번주 부분). oldest→newest */
export function weeklyActiveDayCounts(series, today, weeks) {
  const n = daysIntoWeek(today);
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const start = series.length - (n + (weeks - 1 - w) * 7);
    const len = w === weeks - 1 ? n : 7;
    let c = 0;
    for (let i = 0; i < len; i++) if ((series[start + i] || 0) > 0) c++;
    out.push(c);
  }
  return out;
}

/** 주 4일 연속 — counts(마지막 = 이번주 진행 중) 기준 {cur, best}.
    이번주가 아직 4 미만이어도 연속을 끊지 않는다 (진행 중). ≥4 면 포함. */
export function weeks4Streak(counts, target = 4) {
  if (!counts || counts.length === 0) return { cur: 0, best: 0 };
  let best = 0, run = 0;
  for (const c of counts.slice(0, -1)) {
    run = c >= target ? run + 1 : 0;
    if (run > best) best = run;
  }
  const cur = counts[counts.length - 1] >= target ? run + 1 : run;
  return { cur, best: Math.max(best, cur) };
}

/** v8 작업지시서 §6 due 판정 — 보통 시각이 지난 미완료 중 가장 이른 것 (동시 0~1개) */
export function dueOf(apps, nowMin) {
  const c = (apps || [])
    .filter((a) => !a.done && a.usualMin <= nowMin)
    .sort((a, b) => a.usualMin - b.usualMin);
  return c.length ? c[0].id : null;
}
