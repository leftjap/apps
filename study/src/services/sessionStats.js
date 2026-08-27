/**
 * sessionStats.js — Wave 11.68-d.
 *
 * spec §9-7 세션 내 발화 카운터 + 비교. 학습/복습 화면에서 발화 1건마다 카운트 +1 +
 * 직전 동일 모드 세션 분당 평균 × 현재 경과 분 비교 + 일 발화 PR 까지 잔여 회수.
 *
 * 마스코트 격려 메시지 없음 — 숫자 변화 자체가 동기부여원.
 *
 * 순수 함수 (단위 테스트 분리):
 *  - computeDeltaVsPrevSession(prev, currentSec, currentCount)
 *  - computePRRemaining(dailyPR, todayCount, sessionCount)
 *  - formatSign(n) — '+N' / '-N' / '=' (utility)
 *
 * DB 통합:
 *  - fetchPrevSession(db, lang, mode) — 동일 lang + mode 의 가장 최근 sessionLogs 1건
 */

/**
 * 직전 동일 모드 세션의 분당 평균 × 현재 경과 분 = 비교 기준선.
 * 현재 발화 수 - 기준선 = delta.
 *
 * @param {object} prev sessionLogs row { utteranceCount, durationSec } 또는 null
 * @param {number} currentSec 현재 세션 경과 초
 * @param {number} currentCount 현재 세션 누적 발화 수
 *
 * @returns {{baseline: number, delta: number|null, prevAvgPerMin: number|null}}
 *   delta=null 이면 비교 불가 (직전 세션 없음 또는 utteranceCount=0)
 */
export function computeDeltaVsPrevSession(prev, currentSec, currentCount) {
  if (!prev || !prev.utteranceCount || prev.utteranceCount <= 0) {
    return { baseline: 0, delta: null, prevAvgPerMin: null };
  }
  const prevDurationMin = (Number(prev.durationSec) || 0) / 60;
  if (prevDurationMin <= 0) {
    return { baseline: 0, delta: null, prevAvgPerMin: null };
  }
  const prevAvgPerMin = Number(prev.utteranceCount) / prevDurationMin;
  const currentMin = Math.max(0, Number(currentSec) || 0) / 60;
  const baseline = Math.round(prevAvgPerMin * currentMin);
  const delta = (Number(currentCount) || 0) - baseline;
  return { baseline, delta, prevAvgPerMin };
}

/**
 * 일 발화 PR 까지 잔여 회수.
 *  remaining = dailyPR - (오늘 누적 + 이번 세션 누적)
 *  - dailyPR == 0 → null (PR 미존재, 라벨 hidden)
 *  - remaining ≤ 0 → 0 (PR 달성)
 *
 * @returns {number|null} 잔여 또는 null (라벨 hidden)
 */
export function computePRRemaining(dailyPR, todayCount, sessionCount) {
  const pr = Number(dailyPR) || 0;
  if (pr <= 0) return null;
  const today = Number(todayCount) || 0;
  const session = Number(sessionCount) || 0;
  const remaining = pr - (today + session);
  return Math.max(0, remaining);
}

/** '+N' / '-N' / '=' 부호 라벨. 0 → '='. */
export function formatSign(n) {
  const v = Number(n) || 0;
  if (v === 0) return '=';
  return v > 0 ? `+${v}` : `${v}`;
}

/**
 * 동일 lang + mode 의 가장 최근 sessionLogs 1건 조회.
 * mode = 'review' / 'new' / 'combined' / 'free' (mocks/session.html state.mode 정합).
 * sessionLogs 의 sessionType 필드는 'normal' / 'free_review' 만 가짐 — 모드 매핑:
 *   - 'review' / 'new' / 'combined' → sessionType='normal'
 *   - 'free' → sessionType='free_review'
 *
 * @returns {Promise<object|null>}
 */
export async function fetchPrevSession(db, lang, mode) {
  if (!db?.sessionLogs || !lang) return null;
  const sessionType = mode === 'free' ? 'free_review' : 'normal';
  try {
    const all = await db.sessionLogs.where('lang').equals(lang).toArray();
    const matching = all.filter((l) => l?.sessionType === sessionType);
    if (matching.length === 0) return null;
    matching.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return matching[0];
  } catch (e) {
    console.error('[sessionStats.fetchPrevSession]', e);
    return null;
  }
}

/**
 * 일 발화 PR 값 조회 (Dexie meta `prDailyUtterance`).
 * 미존재 시 0 반환 (computePRRemaining 가 null 반환).
 */
export async function fetchDailyPR(db) {
  if (!db?.meta) return 0;
  try {
    const row = await db.meta.get('prDailyUtterance');
    return Number(row?.value?.value) || 0;
  } catch (e) {
    console.error('[sessionStats.fetchDailyPR]', e);
    return 0;
  }
}

/**
 * 오늘 (이번 세션 제외) 누적 utterance 합산.
 *  Dexie sessionLogs 에서 date=today + lang 필터.
 *  이번 세션은 finish() 후 add 되므로 카운터 갱신 시점엔 미포함 — 그대로 합산하면 OK.
 */
export async function fetchTodayCount(db, lang, todayISO) {
  if (!db?.sessionLogs || !lang) return 0;
  try {
    const all = await db.sessionLogs.where('lang').equals(lang).toArray();
    return all
      .filter((l) => l?.date === todayISO)
      .reduce((s, l) => s + (Number(l.utteranceCount) || 0), 0);
  } catch (e) {
    console.error('[sessionStats.fetchTodayCount]', e);
    return 0;
  }
}

/**
 * 날짜별 발화 합 { 'YYYY-MM-DD': utteranceCount } — 세션 화면의 '오늘 발화' 링 분모와 공부 이력 캘린더용.
 * stats.js loadDayMap 과 같은 집계(월 필터만 없음).
 */
export async function fetchDayUtterMap(db, lang) {
  if (!db?.sessionLogs || !lang) return {};
  try {
    const all = await db.sessionLogs.where('lang').equals(lang).toArray();
    const map = {};
    for (const l of all) {
      if (!l?.date) continue;
      map[l.date] = (map[l.date] || 0) + (Number(l.utteranceCount) || 0);
    }
    return map;
  } catch (e) {
    console.error('[sessionStats.fetchDayUtterMap]', e);
    return {};
  }
}

/**
 * 개인기록(일 발화) 달성일 ISO 목록 — 캘린더의 코랄 칸.
 *
 * meta.prDailyUtterance = 현재 기록, meta.prHistory = 갈아치워진 옛 기록들(당시엔 기록일).
 * 값 형식이 둘이다: pr.js applyPRUpdate 는 { value, achieved_at, lang },
 * saveDailyPRIfRecord(아래)는 { value, date } — 둘 다 읽는다.
 */
export async function fetchPRDays(db, lang) {
  if (!db?.meta) return [];
  try {
    const [cur, hist] = await db.meta.bulkGet(['prDailyUtterance', 'prHistory']);
    const out = new Set();
    const take = (v, type) => {
      if (!v) return;
      if (type && v.type !== type) return;
      if (v.lang && lang && v.lang !== 'both' && v.lang !== lang) return;
      const iso = v.achieved_at || v.date;
      if (typeof iso === 'string' && iso.length >= 10) out.add(iso.slice(0, 10));
    };
    take(cur?.value);
    for (const row of (Array.isArray(hist?.value) ? hist.value : [])) take(row, 'daily_utterance');
    return [...out];
  } catch (e) {
    console.error('[sessionStats.fetchPRDays]', e);
    return [];
  }
}

/**
 * 주 발화 개인기록 — 홈 8열 '주 발화' 바의 분모.
 *
 * 4주 최댓값을 분모로 쓰면 기준이 스스로 움직여 '기록'이 아니게 된다 (클로드디자인 2026-08-27).
 * pr.js 형식: prWeeklyUtterance = { value, week_start: 'YYYY-MM-DD'(월요일), lang } (pr.js:14).
 * week_start 가 없으면 어느 주가 기록 주인지 못 정하므로 null — 없는 주를 지어내지 않는다.
 *
 * @returns {Promise<{value:number, week_start:string}|null>}
 */
export async function fetchWeeklyPR(db, lang) {
  if (!db?.meta) return null;
  try {
    const row = await db.meta.get('prWeeklyUtterance');
    const v = row?.value;
    if (!v || typeof v.week_start !== 'string') return null;
    if (v.lang && lang && v.lang !== 'both' && v.lang !== lang) return null;
    const value = Number(v.value) || 0;
    return value > 0 ? { value, week_start: v.week_start } : null;
  } catch (e) {
    console.error('[sessionStats.fetchWeeklyPR]', e);
    return null;
  }
}

/**
 * 직전 '학습일'(오늘보다 앞선, 발화가 있었던 가장 최근 날) 의 발화 수.
 * 오늘의 기준선은 직전 세션이 아니라 직전 학습일이다 (기록/갱신 설계 §1-1).
 * 0 = 직전 학습일 없음 → 화면은 비교를 주장하지 않는다.
 */
export function prevStudyDayUtterance(dayMap, todayISO) {
  let best = null;
  for (const iso in (dayMap || {})) {
    if (iso >= todayISO || !(Number(dayMap[iso]) > 0)) continue;
    if (best === null || iso > best) best = iso;
  }
  return best ? Number(dayMap[best]) || 0 : 0;
}

/**
 * 일 발화 PR 갱신 — 오늘 누적이 기존 PR 초과 시 meta `prDailyUtterance` put.
 * spec §9-7 정본: PR = 일 발화 최고 기록 (역대). finish() 의 dailyStats upsert 직후 호출.
 *
 * @param {object} db Dexie 인스턴스
 * @param {number} candidateValue 오늘 누적 utterance 합 (todayBaseCount + state.tryCount)
 * @param {string} todayISO 'YYYY-MM-DD'
 * @returns {{skipped: boolean, prev?: number, next?: number, error?: string}}
 */
export async function saveDailyPRIfRecord(db, candidateValue, todayISO) {
  if (!db?.meta || !todayISO) return { skipped: true };
  const value = Number(candidateValue) || 0;
  if (value <= 0) return { skipped: true };
  try {
    const row = await db.meta.get('prDailyUtterance');
    const currentPR = Number(row?.value?.value) || 0;
    if (value <= currentPR) return { skipped: true, prev: currentPR };
    await db.meta.put({ key: 'prDailyUtterance', value: { value, date: todayISO }, at: new Date().toISOString() });
    return { skipped: false, prev: currentPR, next: value };
  } catch (e) {
    console.error('[sessionStats.saveDailyPRIfRecord]', e);
    return { skipped: true, error: e.message };
  }
}

export const SessionStats = Object.freeze({
  fetchDayUtterMap,
  fetchPRDays,
  fetchWeeklyPR,
  prevStudyDayUtterance,
  computeDeltaVsPrevSession,
  computePRRemaining,
  formatSign,
  fetchPrevSession,
  fetchDailyPR,
  fetchTodayCount,
  saveDailyPRIfRecord,
});

if (typeof window !== 'undefined') {
  window.studySessionStats = SessionStats;
}

export default SessionStats;
