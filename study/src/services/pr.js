/**
 * pr.js — Wave 11.68-b.
 *
 * spec §11-5 PR (Personal Record) 4종 검사 + history dedupe + 7일 sliding window 산출.
 *
 * PR 4종:
 *  - daily_utterance: 단일 일자 최대 utteranceCount
 *  - daily_study_time: 단일 일자 최대 studyTimeSec
 *  - weekly_utterance: 7일 sliding window 최대 utteranceCount 합
 *  - weekly_pass: 7일 sliding window 최대 passCount 합
 *
 * 데이터 형식 (JSONB):
 *  daily_*: { value, achieved_at: 'YYYY-MM-DD', lang: 'en'|'ja'|'both' }
 *  weekly_*: { value, week_start: 'YYYY-MM-DD' (월요일), lang }
 *  history: [{ type, value, achieved_at, lang }] (직전 5건, FIFO)
 *
 * 순수 함수 (단위 테스트 분리):
 *  - getMondayOf(dateStr) — 주 시작 (월요일 ISO date) 산출
 *  - sumWindow(sessionLogs, fromISO, toISO, field) — 일자 범위 sessionLogs 합산
 *  - computeWeeklySliding(sessionLogs, weekStart, lang, field) — 7일 합 산출
 *  - checkPRUpdate(prRecords, todayLog, weeklyAggregates, lang) — 4종 PR 갱신 체크
 *  - pushHistory(history, newPR) — FIFO push (max 5)
 *
 * DB 통합:
 *  - applyPRUpdate(db, lang, dateISO) — finish() 직후 호출
 */

import { localISODate } from '../utils/today.js';

const HISTORY_MAX = 5;
const WINDOW_DAYS = 7;

/**
 * ISO date string (YYYY-MM-DD) 의 주 월요일 ISO date 반환.
 * Date 객체 내부에서 UTC 사용 (timezone drift 회피).
 */
export function getMondayOf(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const d = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  const day = d.getUTCDay(); // 0=일 ~ 6=토
  const offsetToMonday = day === 0 ? -6 : 1 - day; // 일=−6, 월=0, 화=−1, ...
  d.setUTCDate(d.getUTCDate() + offsetToMonday);
  return d.toISOString().slice(0, 10);
}

/**
 * sessionLogs 배열에서 (fromISO ≤ date ≤ toISO) 인 entry 의 field 합산.
 * lang 일치 + (lang='both' 일 때 모두 포함) 분기.
 */
export function sumWindow(sessionLogs, fromISO, toISO, lang, field) {
  if (!Array.isArray(sessionLogs)) return 0;
  let sum = 0;
  for (const log of sessionLogs) {
    if (!log?.date || log.date < fromISO || log.date > toISO) continue;
    if (lang !== 'both' && log.lang !== lang) continue;
    sum += Number(log[field]) || 0;
  }
  return sum;
}

/**
 * 7일 sliding window 합 산출 (week_start ~ +6일).
 *
 * weekStart: 'YYYY-MM-DD' (월요일 ISO date — getMondayOf 결과)
 */
export function computeWeeklySliding(sessionLogs, weekStart, lang, field) {
  if (!weekStart) return 0;
  const start = new Date(weekStart + 'T00:00:00Z');
  if (isNaN(start.getTime())) return 0;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + WINDOW_DAYS - 1);
  const endISO = end.toISOString().slice(0, 10);
  return sumWindow(sessionLogs, weekStart, endISO, lang, field);
}

/**
 * history 배열에 신규 PR push (FIFO, max HISTORY_MAX).
 * 직전 PR 의 type+achieved_at 동일하면 dedupe (no-op).
 */
export function pushHistory(history, newPR) {
  if (!newPR?.type || newPR?.value == null) return Array.isArray(history) ? history : [];
  const arr = Array.isArray(history) ? history : [];
  const last = arr[0];
  if (last && last.type === newPR.type && last.achieved_at === newPR.achieved_at) {
    return arr; // dedupe
  }
  const next = [newPR, ...arr];
  if (next.length > HISTORY_MAX) next.length = HISTORY_MAX;
  return next;
}

/**
 * PR 4종 갱신 체크. 새 값이 기존 PR 값보다 크면 갱신 후보 반환.
 *
 * @param {object} prRecords 기존 { daily_utterance, daily_study_time, weekly_utterance, weekly_pass, history }
 * @param {object} todayLog { date, lang, utteranceCount, studyTimeSec, passCount }
 * @param {object} weeklyAggregates { utterance, pass } — computeWeeklySliding 결과 (이번 주 누적, 오늘 포함)
 * @param {'en'|'ja'|'both'} lang
 *
 * @returns {Array<{type, value, achieved_at, week_start?, lang}>} 신규 갱신 PR 목록 (0~4건)
 */
export function checkPRUpdate(prRecords, todayLog, weeklyAggregates, lang) {
  const updates = [];
  if (!todayLog?.date) return updates;
  const r = prRecords || {};
  const date = todayLog.date;
  const weekStart = getMondayOf(date);

  const todayUtterance = Number(todayLog.utteranceCount) || 0;
  const todayStudyTime = Number(todayLog.studyTimeSec) || 0;
  const weekUtterance = Number(weeklyAggregates?.utterance) || 0;
  const weekPass = Number(weeklyAggregates?.pass) || 0;

  if (todayUtterance > (r.daily_utterance?.value || 0)) {
    updates.push({ type: 'daily_utterance', value: todayUtterance, achieved_at: date, lang });
  }
  if (todayStudyTime > (r.daily_study_time?.value || 0)) {
    updates.push({ type: 'daily_study_time', value: todayStudyTime, achieved_at: date, lang });
  }
  if (weekUtterance > (r.weekly_utterance?.value || 0)) {
    updates.push({ type: 'weekly_utterance', value: weekUtterance, achieved_at: date, week_start: weekStart, lang });
  }
  if (weekPass > (r.weekly_pass?.value || 0)) {
    updates.push({ type: 'weekly_pass', value: weekPass, achieved_at: date, week_start: weekStart, lang });
  }
  return updates;
}

/**
 * 세션 종료 직후 호출 — sessionLogs 누적 후 PR 4종 검사 + meta 업데이트.
 *
 * 흐름:
 *  1. Dexie meta 의 5 PR keys (prDailyUtterance / ... / prHistory) bulkGet
 *  2. 오늘 sessionLogs 합산 → todayLog (date 단위 utterance/studyTime/pass)
 *  3. 이번 주 sliding window 합산 → weeklyAggregates
 *  4. checkPRUpdate → 신규 PR 목록
 *  5. 각 PR meta key UPSERT + history FIFO push
 *
 * Dexie meta 변경 → sync.js attachHooks 가 'prRecords' 큐로 자동 라우팅 (Wave 11.68-a).
 *
 * @returns {Promise<{updated: boolean, newPRs: Array, prevPRs: Array}>}
 */
export async function applyPRUpdate(db, lang, dateISO) {
  if (!db || !lang) return { updated: false, newPRs: [], prevPRs: [] };
  if (!db.meta || !db.sessionLogs) return { updated: false, newPRs: [], prevPRs: [] };

  // 오늘 sessionLogs 합산
  // dateISO = 방금 쓴 sessionLog 의 date. 자정을 넘긴 세션에서 자체 '오늘'을 다시 구하면
  // 로그 date 와 어긋나 집계가 조용히 0 이 된다. 미전달 시에만 기존 폴백.
  const today = dateISO || (typeof window !== 'undefined' && window.studyDay?.TODAY_ISO) || localISODate();
  const allLogs = await db.sessionLogs.toArray();
  const todayLogs = allLogs.filter((l) => l?.date === today && (lang === 'both' || l.lang === lang));
  const todayLog = {
    date: today,
    lang,
    utteranceCount: todayLogs.reduce((s, l) => s + (Number(l.utteranceCount) || 0), 0),
    studyTimeSec: todayLogs.reduce((s, l) => s + (Number(l.durationSec) || 0), 0),
    passCount: todayLogs.reduce((s, l) => s + (Number(l.passCount) || 0), 0),
  };
  const weekStart = getMondayOf(today);
  const weeklyAggregates = {
    utterance: computeWeeklySliding(allLogs, weekStart, lang, 'utteranceCount'),
    pass: computeWeeklySliding(allLogs, weekStart, lang, 'passCount'),
  };

  // 기존 PR meta bulkGet
  const keys = ['prDailyUtterance', 'prDailyStudyTime', 'prWeeklyUtterance', 'prWeeklyPass', 'prHistory'];
  const got = await db.meta.bulkGet(keys);
  const prRecords = {
    daily_utterance: got[0]?.value || null,
    daily_study_time: got[1]?.value || null,
    weekly_utterance: got[2]?.value || null,
    weekly_pass: got[3]?.value || null,
    history: got[4]?.value || [],
  };

  const newPRs = checkPRUpdate(prRecords, todayLog, weeklyAggregates, lang);
  if (newPRs.length === 0) {
    return { updated: false, newPRs: [], prevPRs: [] };
  }

  // 각 PR UPSERT + history FIFO push
  let history = prRecords.history;
  const prevPRs = [];
  const now = Date.now();
  for (const pr of newPRs) {
    const dexieKey = prTypeToDexieKey(pr.type);
    if (!dexieKey) continue;
    const prevRow = got[keys.indexOf(dexieKey)];
    if (prevRow?.value) prevPRs.push({ ...prevRow.value, type: pr.type });
    const value = pr.type.startsWith('weekly_')
      ? { value: pr.value, week_start: pr.week_start, lang: pr.lang }
      : { value: pr.value, achieved_at: pr.achieved_at, lang: pr.lang };
    await db.meta.put({ key: dexieKey, value, at: now });
    if (prevRow?.value) {
      history = pushHistory(history, { ...prevRow.value, type: pr.type });
    }
  }
  await db.meta.put({ key: 'prHistory', value: history, at: now });

  return { updated: true, newPRs, prevPRs };
}

function prTypeToDexieKey(type) {
  switch (type) {
    case 'daily_utterance': return 'prDailyUtterance';
    case 'daily_study_time': return 'prDailyStudyTime';
    case 'weekly_utterance': return 'prWeeklyUtterance';
    case 'weekly_pass': return 'prWeeklyPass';
    default: return null;
  }
}

export const __test__ = Object.freeze({ HISTORY_MAX, WINDOW_DAYS, prTypeToDexieKey });

export const PR = Object.freeze({
  getMondayOf,
  sumWindow,
  computeWeeklySliding,
  pushHistory,
  checkPRUpdate,
  applyPRUpdate,
});

if (typeof window !== 'undefined') {
  window.studyPR = PR;
}

export default PR;
