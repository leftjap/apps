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
