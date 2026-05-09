/**
 * Wave 11.11 — 통계 화면 §9-2 볼륨 비교 (data layer + DOM hijack).
 *
 * 책임:
 *   - summarizeVolumes(sessions, now) — 이번/지난 주 + 이번/지난 달 볼륨 합산 + 비교 %.
 *   - mountStatsView() — Dexie 60일 lookback + cs-bar-* DOM 갱신.
 *
 * 미처리 (별 wave):
 *   - §9-1 today 동적 표시 (Wave 11.6C 가 4/22 하드코딩 — mocks IIFE 격리)
 *   - 날짜 탭 상세 바텀시트 / 꾹누르기 삭제
 */

import {
  getSessionsByRange,
  getSessionByDate,
  deleteSession,
  weekRangeISO,
  toISODate,
} from '../db/queries.js';
import { partAbbreviation } from './home.js';
import { exerciseIdToName } from './session-summary.js';

/** YYYY-MM-DD 범위 [from, to] 합산 (totalVolume). */
function sumVolumeInRange(sessions, fromISO, toISO) {
  return sessions
    .filter((s) => s && s.date >= fromISO && s.date <= toISO)
    .reduce((sum, s) => sum + (Number(s.totalVolume) || 0), 0);
}

/** 비교 % 계산 — prev=0 (지난 주/달 0kg) 일 때:
 *   - current>0 → "+∞%" (delta=null) — UI 에서 "신규" 처리
 *   - current=0 → "±0%"
 *  prev>0 → ((cur-prev)/prev)*100, 정수 반올림.
 *  반환: { delta: number|null, sign: 'up'|'down'|'flat' }
 */
export function compareDelta(current, previous) {
  if (!Number.isFinite(current)) current = 0;
  if (!Number.isFinite(previous)) previous = 0;
  if (previous === 0) {
    if (current === 0) return { delta: 0, sign: 'flat' };
    return { delta: null, sign: 'up' }; // 신규
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return { delta: pct, sign: 'up' };
  if (pct < 0) return { delta: pct, sign: 'down' };
  return { delta: 0, sign: 'flat' };
}

/**
 * sessions 배열 → 볼륨 비교 객체.
 * 입력: completed sessions (date 정렬 무관), now epoch ms.
 * 반환:
 *   { week: { current, previous, delta, sign },
 *     month: { current, previous, delta, sign } }
 */
export function summarizeVolumes(sessions, now = Date.now()) {
  const list = Array.isArray(sessions) ? sessions : [];
  const today = new Date(now);

  // 이번 주 / 지난 주
  const { from: thisWeekFrom, to: thisWeekTo } = weekRangeISO(today);
  const lastWeekDate = new Date(today);
  lastWeekDate.setDate(today.getDate() - 7);
  const { from: lastWeekFrom, to: lastWeekTo } = weekRangeISO(lastWeekDate);
  const weekCurrent = sumVolumeInRange(list, thisWeekFrom, thisWeekTo);
  const weekPrevious = sumVolumeInRange(list, lastWeekFrom, lastWeekTo);
  const weekDelta = compareDelta(weekCurrent, weekPrevious);

  // 이번 달 / 지난 달 (1일 ~ 말일)
  const y = today.getFullYear();
  const m = today.getMonth() + 1; // 1-based
  const monthFromISO = `${y}-${String(m).padStart(2, '0')}-01`;
  const monthLastDay = new Date(y, m, 0).getDate();
  const monthToISO = `${y}-${String(m).padStart(2, '0')}-${String(monthLastDay).padStart(2, '0')}`;
  const lastM = m === 1 ? 12 : m - 1;
  const lastY = m === 1 ? y - 1 : y;
  const lastMonthFromISO = `${lastY}-${String(lastM).padStart(2, '0')}-01`;
  const lastMonthLastDay = new Date(lastY, lastM, 0).getDate();
  const lastMonthToISO = `${lastY}-${String(lastM).padStart(2, '0')}-${String(lastMonthLastDay).padStart(2, '0')}`;
  const monthCurrent = sumVolumeInRange(list, monthFromISO, monthToISO);
  const monthPrevious = sumVolumeInRange(list, lastMonthFromISO, lastMonthToISO);
  const monthDelta = compareDelta(monthCurrent, monthPrevious);

  return {
    week: { current: weekCurrent, previous: weekPrevious, ...weekDelta },
    month: { current: monthCurrent, previous: monthPrevious, ...monthDelta },
  };
}

/** delta + sign → 표시 문자열 ('+8%' / '-3%' / '±0%' / '신규'). */
export function formatDelta({ delta, sign }) {
  if (delta === null) return '신규';
  if (sign === 'flat') return '±0%';
  if (sign === 'up') return `+${delta}%`;
  return `${delta}%`; // down (이미 음수)
}

/** 볼륨 비교 DOM 갱신 — mocks/stats.html 의 .compare-section 구조 답습. */
export function applyVolumesToDom(volumes, doc) {
  if (!doc) return;
  const groups = doc.querySelectorAll('.cs-group');
  if (!groups || groups.length < 2) return;

  // 첫 번째 group = 주, 두 번째 = 월 (mocks DOM 순서)
  const apply = (group, info) => {
    const rows = group.querySelectorAll('.cs-bar-row');
    if (rows.length < 2) return;
    const [currentRow, previousRow] = rows;
    const max = Math.max(info.current, info.previous, 1);
    setVolumeRow(currentRow, info.current, info.delta, info.sign, info.current / max);
    // 지난 행의 delta 는 계산하지 않음 (mocks 도 임의 — 단순화). 단 scale 만 갱신.
    setVolumeRow(previousRow, info.previous, null, 'flat', info.previous / max);
  };
  apply(groups[0], volumes.week);
  apply(groups[1], volumes.month);
}

function setVolumeRow(row, volume, delta, sign, scale) {
  const volEl = row.querySelector('.cs-bar-volume');
  if (volEl) volEl.textContent = `${(volume || 0).toLocaleString()} kg`;
  const deltaEl = row.querySelector('.cs-bar-delta');
  if (deltaEl) {
    if (delta === null && sign === 'flat') {
      deltaEl.textContent = '';
      deltaEl.classList.remove('down', 'flat');
    } else {
      deltaEl.textContent = formatDelta({ delta, sign });
      deltaEl.classList.remove('down', 'flat');
      if (sign === 'down') deltaEl.classList.add('down');
      if (sign === 'flat') deltaEl.classList.add('flat');
    }
  }
  const fill = row.querySelector('.cs-bar-fill');
  if (fill) {
    const safe = Math.max(0, Math.min(1, scale || 0));
    fill.style.transform = `scaleX(${safe.toFixed(3)})`;
  }
}

/**
 * Wave 11.14 — §9-1 sessions → MONTH.workouts[d] 변환 (mocks sessionToWorkoutEntry 비정합 우회).
 *
 * mocks Wave 11.6C 의 sessionToWorkoutEntry 가 `b.exercises` (Wave 11.6D 형식) 만 처리.
 * Wave 11.9.x 의 spec §12 형식 (`b.exerciseId / b.sets`) 도 처리 + 영문→한국어 매핑.
 *
 * 반환: { tag, vol, min, pr, level, ex:[{n, s}], sessionId } (mocks openDay 와 정합 형식)
 */
export function sessionToWorkoutEntry(session) {
  if (!session) return defaultEntry();
  const blocks = Array.isArray(session.blocks) ? session.blocks : [];
  const ex = [];
  let prCount = 0;
  for (const b of blocks) {
    if (!b) continue;
    if (b.type === 'circuit') continue; // 별 wave
    // spec §12 — { type:'single', exerciseId, sets }
    if (b.exerciseId && Array.isArray(b.sets)) {
      const item = formatExEntrySpec(b);
      if (item) {
        ex.push(item);
        prCount += b.sets.filter((s) => s && s.done && s.pr).length;
      }
      continue;
    }
    // mocks Wave 11.6D — { type:'single', exercises:[{exerciseName, sets}] }
    if (Array.isArray(b.exercises)) {
      for (const x of b.exercises) {
        const item = formatExEntryMocks(x);
        if (item) ex.push(item);
      }
    }
  }

  const vol = Number(session.totalVolume) || 0;
  const level = vol < 3000 ? 'low' : vol < 6000 ? 'med' : 'high';

  // tags 영문 → 단일 글자 한국어 약어 (Wave 11.10.2 partAbbreviation). 첫 tag.
  const tags = Array.isArray(session.tags) ? session.tags : [];
  const tag = tags.length ? partAbbreviation(tags[0]) : '';

  return {
    tag,
    vol,
    min: Number(session.durationMin) || 0,
    pr: prCount,
    level,
    ex,
    sessionId: session.id || null,
  };
}

function formatExEntrySpec(block) {
  const name = exerciseIdToName(block.exerciseId);
  const sets = Array.isArray(block.sets) ? block.sets : [];
  const doneSets = sets.filter((s) => s && s.done);
  if (!doneSets.length) return null;
  const firstSet = doneSets[0];
  if (firstSet && firstSet.duration != null) {
    const min = Math.round(Number(firstSet.duration) / 60);
    const km = firstSet.distance ? ` · ${firstSet.distance}km` : '';
    return { n: name, s: `${min}분${km}` };
  }
  const total = doneSets.reduce(
    (sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0),
    0,
  );
  return { n: name, s: `${doneSets.length}세트 · ${total.toLocaleString()}kg` };
}

function formatExEntryMocks(ex) {
  if (!ex) return null;
  const name = ex.exerciseName || ex.exerciseId || '';
  const sets = Array.isArray(ex.sets) ? ex.sets : [];
  if (!sets.length) return null;
  const firstSet = sets[0];
  if (firstSet && firstSet.duration != null) {
    const min = Math.round(Number(firstSet.duration) / 60);
    const km = firstSet.distance ? ` · ${firstSet.distance}km` : '';
    return { n: name, s: `${min}분${km}` };
  }
  const total = sets.reduce(
    (sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0),
    0,
  );
  return { n: name, s: `${sets.length}세트 · ${total.toLocaleString()}kg` };
}

function defaultEntry() {
  return { tag: '', vol: 0, min: 0, pr: 0, level: 'low', ex: [], sessionId: null };
}

/**
 * Wave 11.13 — §9-1 today 동적 표시.
 *
 * mocks `MONTH.today` (4월=22 / 다른 월=-1) 하드코딩 우회. monthLabel 파싱 → 표시 중 월이
 * 오늘 월과 일치하면 `cal-cell[data-day=N]` 에 .today 클래스 swap. 다른 월이면 모두 제거.
 *
 * 반환:
 *   { applied: true, day } — today 클래스 부여
 *   { applied: false, reason: 'different_month' } — displayed 월 ≠ today 월
 *   { skipped: 'no-document'|'no-mounts' }
 */
export function applyTodayToCalendar(now = Date.now(), doc) {
  doc = doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { skipped: 'no-document' };
  const grid = doc.getElementById('calGrid');
  const label = doc.getElementById('monthLabel');
  if (!grid || !label) return { skipped: 'no-mounts' };

  // 모든 today 클래스 제거 (월 nav 후 잔존 방지)
  grid.querySelectorAll('.cal-cell.today').forEach((el) => el.classList.remove('today'));

  const displayed = parseMonthLabel(label.textContent);
  const today = new Date(now);
  const todayY = today.getFullYear();
  const todayM = today.getMonth() + 1;
  const todayD = today.getDate();

  if (!displayed || displayed.year !== todayY || displayed.month !== todayM) {
    return { applied: false, reason: 'different_month' };
  }
  const cell = grid.querySelector(`.cal-cell[data-day="${todayD}"]`);
  if (!cell) return { applied: false, reason: 'no_cell', day: todayD };
  cell.classList.add('today');
  return { applied: true, day: todayD };
}

export function parseMonthLabel(text) {
  const m = String(text || '').match(/(\d{4})년\s+(\d{1,2})월/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

/**
 * Wave 11.15 — §9-1 꾹누르기 → 세션 삭제.
 *
 * mocks bindCalendarLongPress 가 long-press 시 openDelDaySheet(d) 호출 → 사용자 confirm 시 SPA hook.
 * sessionId 우선 (mocks MONTH.workouts[d].sessionId 가 있으면 해당 row), 없으면 monthLabel 파싱
 * → ISO date → getSessionByDate (completed only) → deleteSession.
 *
 * 반환: { ok, deletedId, iso? } 또는 { ok:false, reason }
 */
export async function deleteSessionByDay(day, sessionId, doc) {
  doc = doc || (typeof document !== 'undefined' ? document : null);
  if (!sessionId && !Number.isFinite(day)) {
    return { ok: false, reason: 'invalid_input' };
  }
  try {
    if (sessionId) {
      await deleteSession(sessionId);
      return { ok: true, deletedId: sessionId };
    }
    // sessionId 없음 → day 기반 검색 (monthLabel 의 year/month 활용)
    const label = doc?.getElementById?.('monthLabel');
    const parsed = label ? parseMonthLabel(label.textContent) : null;
    if (!parsed) return { ok: false, reason: 'no_month_context' };
    const iso = `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const session = await getSessionByDate(iso);
    if (!session) return { ok: false, reason: 'no_session', iso };
    await deleteSession(session.id);
    return { ok: true, deletedId: session.id, iso };
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) {
      return { ok: false, reason: 'no_db' };
    }
    console.error('[gymStats] deleteSessionByDay', e);
    return { ok: false, reason: 'error', error: e?.message };
  }
}

/** mocks/stats.html 진입 시 호출. Dexie 60일 lookback + 볼륨 비교 DOM 갱신 + today 클래스 swap. */
export async function mountStatsView(now = Date.now()) {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return { skipped: 'no-document' };
  if (!doc.querySelector('.compare-section')) return { skipped: 'no-mounts' };
  try {
    const today = new Date(now);
    const lookback = new Date(today);
    lookback.setDate(today.getDate() - 60);
    const sessions = await getSessionsByRange(toISODate(lookback), toISODate(today));
    const volumes = summarizeVolumes(sessions, now);
    applyVolumesToDom(volumes, doc);
    applyTodayToCalendar(now, doc);
    return { applied: true, volumes };
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) {
      return { skipped: 'no-db' };
    }
    console.error('[gymStats] mountStatsView', e);
    return { error: e?.message };
  }
}

/**
 * Wave v2 — 이번 달 부위별 통계 집계.
 *
 * sessions.tags (multiEntry) 빈도 누적. tag 영문 (chest/back/...) 우선,
 * 한국어 1글자 약어 (가/등/...) fallback. 0 회 부위는 결과에서 제외.
 *
 * 반환: [{ key, name, count, color }] (count 내림차순).
 */
const PART_META = [
  { key: 'chest',    name: '가슴', kr: '가', color: '#d97757' },
  { key: 'back',     name: '등',   kr: '등', color: '#788c5d' },
  { key: 'legs',     name: '하체', kr: '하', color: '#b85a3e' },
  { key: 'shoulder', name: '어깨', kr: '어', color: '#c9a96e' },
  { key: 'arms',     name: '팔',   kr: '팔', color: '#6b8a9c' },
  { key: 'cardio',   name: '유산소', kr: '유', color: '#9b8fb0' },
];

export function summarizeBodyParts(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  const counts = new Map();
  for (const s of list) {
    if (!s) continue;
    const tags = Array.isArray(s.tags) ? s.tags : [];
    for (const tag of tags) {
      // 영문 직접 매칭 또는 한국어 1글자 매칭
      let meta = PART_META.find((p) => p.key === tag);
      if (!meta) meta = PART_META.find((p) => p.kr === tag);
      if (!meta) continue;
      counts.set(meta.key, (counts.get(meta.key) || 0) + 1);
    }
  }
  const result = PART_META
    .map((p) => ({ key: p.key, name: p.name, count: counts.get(p.key) || 0, color: p.color }))
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count);
  return result;
}

/**
 * Wave v2 — 최근 N주 주간 볼륨 추이 (v2 StatsB SVG 라인차트용).
 *
 * sessions 의 totalVolume 을 주 단위로 합산. 이번 주는 완성도 무관(현재 누적).
 * 반환: [{ weekStart: 'YYYY-MM-DD', vol: number }] (오래된 → 최신 순, length=weeks).
 */
export function summarizeWeeklyTrend(sessions, weeks = 8, now = Date.now()) {
  const list = Array.isArray(sessions) ? sessions : [];
  const today = new Date(now);
  const result = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const ref = new Date(today);
    ref.setDate(today.getDate() - i * 7);
    const { from, to } = weekRangeISO(ref);
    const vol = list
      .filter((s) => s && s.date >= from && s.date <= to)
      .reduce((sum, s) => sum + (Number(s.totalVolume) || 0), 0);
    result.push({ weekStart: from, vol });
  }
  return result;
}

if (typeof window !== 'undefined') {
  window.gymStats = {
    summarizeVolumes,
    compareDelta,
    formatDelta,
    applyVolumesToDom,
    applyTodayToCalendar,
    parseMonthLabel,
    sessionToWorkoutEntry,
    deleteSessionByDay,
    mountStatsView,
    summarizeBodyParts,
    summarizeWeeklyTrend,
  };
}
