/* transforms.js — 순수 함수 (데이터 → 표시값). 단위 테스트 대상.
   양(수치) 기반: streak/최장연속/활동률/히트맵 농담/날짜 메타.
   data-l.jsx 의 헬퍼를 ES 모듈 + 테스트 가능 시그니처로 이식. */

export const WD = ["일", "월", "화", "수", "목", "금", "토"];

/** 27일 hist + 오늘 = 28일 일별 수치 배열 */
export function fullSeq(hist, todayVal) {
  return (hist || []).concat([todayVal || 0]);
}

/** 양 → 웜그레이 농담 단계 (해당 습관 max 기준). 0 이하면 "" (안 함) */
export function level(v, max) {
  if (v <= 0) return "";
  const r = v / max;
  return r < 0.34 ? "g1" : r < 0.7 ? "g2" : "g3";
}

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

/** 최근 n일 중 활동(수치>0)한 일수 */
export function activeDays(seq, n) {
  return seq.slice(-n).filter((v) => v > 0).length;
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

/** 날짜 기반 결정론적 문장 인덱스 (연중 일수 % 문장수) */
export function sentenceOfDay(count, now) {
  now = now || new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000) % count;
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

/** 일별 series(weeks*7) → 주별 활동일 비율 배열 (각 = 그 주 활동일수/7). 마지막 원소 = 현재 주.
   전체통계 모달의 12주 추세 막대(실데이터) + 주평균 활동일 산출용. */
export function weeklyActivityRatios(series, weeks) {
  const out = [];
  for (let w = 0; w < weeks; w++) {
    let active = 0;
    for (let d = 0; d < 7; d++) {
      if ((series[w * 7 + d] || 0) > 0) active++;
    }
    out.push(active / 7);
  }
  return out;
}

/** active/paused 세션이 잔재인지 — 시작 후 12시간 경과(또는 start_time 부재) 시 true.
   운동이 12시간을 넘을 수 없으므로, 종료 처리가 안 된 행이 "운동 중"으로 무한 표시되는 것 방지. */
const STALE_ACTIVE_MS = 12 * 3600 * 1000;
export function isStaleActiveSession(startTime, now) {
  const t = Number(startTime);
  if (!t) return true;
  return now - t >= STALE_ACTIVE_MS;
}

/** 이번주 경과 일수 — 월=1 … 일=7 */
function daysIntoWeek(today) {
  return ((new Date(today).getDay() + 6) % 7) + 1;
}

/** 오늘로 끝나는 series 의 이번주(월~오늘) 합 */
export function sumCurrentWeek(seq, today) {
  return (seq || []).slice(-daysIntoWeek(today)).reduce((a, b) => a + (+b || 0), 0);
}

/** 오늘로 끝나는 series 들의 이번주(월~오늘) 중 하나라도 >0 인 날 수 */
export function activeDaysInCurrentWeek(seqs, today) {
  const n = daysIntoWeek(today);
  let cnt = 0;
  for (let i = 1; i <= n; i++) {
    if ((seqs || []).some((s) => (s[s.length - i] || 0) > 0)) cnt++;
  }
  return cnt;
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

/** 직전 세션 시각(Date) → "N일 전 HH:MM" (오늘 흐름 "마지막" 라벨). 날짜 없으면 null. */
export function lastSessionLabel(date, today) {
  if (!date) return null;
  const d = new Date(date);
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const b = new Date(today); b.setHours(0, 0, 0, 0);
  const daysAgo = Math.round((b - a) / 86400000);
  return `${relativeDayLabel(daysAgo)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
