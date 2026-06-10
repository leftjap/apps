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
  listCustomExercises,
} from '../db/queries.js';
import { partAbbreviation, wireHomeShortcuts } from './home.js';
import { exerciseIdToName } from './session-summary.js';
import { getBuiltinExercise, primeCustomExerciseCache } from '../db/exercises.js';
import { EXERCISE_MUSCLES, WEIGHT_PRIMARY, WEIGHT_SYNERGIST } from '../data/exercise-muscles.js';

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

  // 캘린더 하단 주간 요약 박스 hydrate (data-bind="cal-week-*").
  // 이전 mock 정적 더미 (12,450 / +8% / 11,520) 회귀 fix.
  const calCurEl = doc.querySelector('[data-bind="cal-week-current"]');
  const calDeltaEl = doc.querySelector('[data-bind="cal-week-delta"]');
  const calPrevEl = doc.querySelector('[data-bind="cal-week-previous"]');
  if (calCurEl) calCurEl.textContent = (volumes.week.current || 0).toLocaleString();
  if (calPrevEl) calPrevEl.textContent = (volumes.week.previous || 0).toLocaleString();
  if (calDeltaEl) {
    calDeltaEl.textContent = formatDelta({ delta: volumes.week.delta, sign: volumes.week.sign });
    // 라이트: 증가/신규 = 크레일, 감소 = 중립 회색 잉크.
    calDeltaEl.style.color = volumes.week.sign === 'down' ? 'var(--ink-3)' : 'var(--crail-deep)';
  }

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
    const durSec = Number(firstSet.duration) || 0;
    const distKm = Number(firstSet.distance) || 0;
    const km = distKm ? ` · ${distKm}km` : '';
    return { n: name, s: `${Math.round(durSec / 60)}분${km}`, key: block.exerciseId, kind: 'cardio', durSec, distKm };
  }
  const total = doneSets.reduce((sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
  // 값 미입력 done 세트(구 기록 — duration/weight 없이 완료만)는 "0kg" 표기 생략 (라이브 2026-06-10 발견).
  const label = total > 0 ? `${doneSets.length}세트 · ${total.toLocaleString()}kg` : `${doneSets.length}세트`;
  return { n: name, s: label, key: block.exerciseId, kind: 'weight', setCount: doneSets.length, vol: total };
}

function formatExEntryMocks(ex) {
  if (!ex) return null;
  const name = ex.exerciseName || ex.exerciseId || '';
  const sets = Array.isArray(ex.sets) ? ex.sets : [];
  if (!sets.length) return null;
  const firstSet = sets[0];
  if (firstSet && firstSet.duration != null) {
    const durSec = Number(firstSet.duration) || 0;
    const distKm = Number(firstSet.distance) || 0;
    const km = distKm ? ` · ${distKm}km` : '';
    return { n: name, s: `${Math.round(durSec / 60)}분${km}`, key: ex.exerciseId || name, kind: 'cardio', durSec, distKm };
  }
  const total = sets.reduce((sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
  const label = total > 0 ? `${sets.length}세트 · ${total.toLocaleString()}kg` : `${sets.length}세트`;
  return { n: name, s: label, key: ex.exerciseId || name, kind: 'weight', setCount: sets.length, vol: total };
}

function defaultEntry() {
  return { tag: '', vol: 0, min: 0, pr: 0, level: 'low', ex: [], sessionId: null };
}

export function mergeWorkoutEntries(entries) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!list.length) return defaultEntry();
  if (list.length === 1) return list[0];
  let vol = 0, min = 0, pr = 0, tag = '', sessionId = null;
  const byKey = new Map();
  const order = [];
  for (const entry of list) {
    vol += Number(entry.vol) || 0;
    min += Number(entry.min) || 0;
    pr += Number(entry.pr) || 0;
    if (!tag && entry.tag) tag = entry.tag;
    if (entry.sessionId) sessionId = entry.sessionId;
    for (const item of Array.isArray(entry.ex) ? entry.ex : []) {
      if (!item) continue;
      const k = (item.key || item.n) + '::' + (item.kind || 'weight');
      const existing = byKey.get(k);
      if (!existing) {
        byKey.set(k, { ...item });
        order.push(k);
        continue;
      }
      if (item.kind === 'cardio') {
        existing.durSec = (existing.durSec || 0) + (item.durSec || 0);
        existing.distKm = (existing.distKm || 0) + (item.distKm || 0);
        const km = existing.distKm ? ` · ${existing.distKm}km` : '';
        existing.s = `${Math.round(existing.durSec / 60)}분${km}`;
      } else {
        existing.setCount = (existing.setCount || 0) + (item.setCount || 0);
        existing.vol = (existing.vol || 0) + (item.vol || 0);
        existing.s = `${existing.setCount}세트 · ${existing.vol.toLocaleString()}kg`;
      }
    }
  }
  const level = vol < 3000 ? 'low' : vol < 6000 ? 'med' : 'high';
  return { tag, vol, min, pr, level, ex: order.map((k) => byKey.get(k)), sessionId };
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
/**
 * 사용자 보고 — "통계 월 캘린더는 운동한 날짜만 활성화되어야 함".
 * mocks/stats.html IIFE 의 worked = { 1:1, 4:2, ... } fixture 를 sessions 기반 실 데이터로 갈아끼움.
 * 표시 중 월 (monthLabel) 기준 sessions 의 date 일자 추출 → 해당 cal-cell 에 .worked class 부착.
 * mountStatsView 가 호출 (applyVolumesToDom + applyTodayToCalendar 와 같은 sessions 으로 합산).
 */
export function applyWorkedToCalendar(sessions, doc) {
  doc = doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { skipped: 'no-document' };
  const grid = doc.getElementById('calGrid');
  const label = doc.getElementById('monthLabel');
  if (!grid || !label) return { skipped: 'no-mounts' };

  // 모든 cell reset — mocks IIFE 의 fixture 히트맵 inline style 무효화.
  // 비-worked = 라이트 기본값 (작은 회색 글자, 배경 없음). today 셀의 크레일 링(boxShadow)은 보존.
  grid.querySelectorAll('.cal-cell').forEach((el) => {
    el.classList.remove('worked');
    if (el.style) {
      el.style.background = '';
      if (!el.classList.contains('today') && 'boxShadow' in el.style) el.style.boxShadow = '';
    }
    const num = el.querySelector('.num');
    if (num) {
      num.style.color = 'var(--ink-4)';
      num.style.fontWeight = '500';
      num.style.fontSize = '13px';
    }
  });

  const displayed = parseMonthLabel(label.textContent);
  if (!displayed) return { applied: false, reason: 'no_displayed_month' };

  // 표시 중 월의 일별 총 볼륨 합산 (완료 세션의 single 블록 done 세트 weight*reps).
  const volByDay = new Map();
  for (const s of (sessions || [])) {
    if (!s?.date) continue;
    if (s.status && s.status !== 'completed') continue;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.date);
    if (!m) continue;
    if (parseInt(m[1], 10) !== displayed.year || parseInt(m[2], 10) !== displayed.month) continue;
    const d = parseInt(m[3], 10);
    let dayVol = 0;
    for (const b of (Array.isArray(s.blocks) ? s.blocks : [])) {
      if (!b || b.type !== 'single') continue;
      for (const st of (Array.isArray(b.sets) ? b.sets : [])) {
        if (st && st.done) dayVol += (Number(st.weight) || 0) * (Number(st.reps) || 0);
      }
    }
    volByDay.set(d, (volByDay.get(d) || 0) + dayVol);
  }

  const maxVol = Math.max(0, ...volByDay.values());
  let applied = 0;
  for (const [d, dayVol] of volByDay) {
    const cell = grid.querySelector(`.cal-cell[data-day="${d}"]`);
    if (!cell) continue;
    cell.classList.add('worked');
    // 볼륨 비율을 연속 농도(alpha)로. 0kg 운동일(전부 done=false 등)도 worked 로 잡되 최소 농도.
    const a = maxVol > 0 ? 0.14 + 0.82 * (dayVol / maxVol) : 0.14;
    if (cell.style) {
      cell.style.background = `rgba(193,99,63,${a.toFixed(2)})`;
      cell.style.borderRadius = '8px';
    }
    const num = cell.querySelector('.num');
    if (num) {
      num.style.color = a > 0.52 ? '#fff' : 'var(--crail-deep)';
      num.style.fontWeight = a > 0.4 ? 600 : 500;
    }
    applied += 1;
  }
  return { applied, count: volByDay.size };
}

export function applyTodayToCalendar(now = Date.now(), doc) {
  doc = doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { skipped: 'no-document' };
  const grid = doc.getElementById('calGrid');
  const label = doc.getElementById('monthLabel');
  if (!grid || !label) return { skipped: 'no-mounts' };

  // 기존 today 클래스 제거 (월 nav 후 잔존 방지)
  grid.querySelectorAll('.cal-cell.today').forEach((el) => el.classList.remove('today'));
  // mocks IIFE 의 fixture accent 밑줄 element 제거 (today=6 fixture 정적 painting → 실 today 와 불일치).
  // production DOM 만 처리 — test mock 환경은 querySelectorAll('.cal-cell') / element.querySelectorAll 미지원.
  try {
    const allCells = grid.querySelectorAll('.cal-cell') || [];
    for (const el of allCells) {
      if (typeof el.querySelectorAll !== 'function') continue;
      el.querySelectorAll('div').forEach((d) => {
        const s = (typeof d.getAttribute === 'function' ? d.getAttribute('style') : '') || '';
        if (/background\s*:\s*var\(--accent\)/.test(s) && typeof d.remove === 'function') d.remove();
      });
    }
  } catch (_) { /* mock 환경 graceful */ }

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
  // today cell 에 크레일 링 (라이트 재디자인 — 밑줄 div 폐기, inset box-shadow 로 교체).
  if (cell.style) cell.style.boxShadow = 'inset 0 0 0 1.5px var(--crail-deep)';
  return { applied: true, day: todayD };
}

export function parseMonthLabel(text) {
  const m = String(text || '').match(/(\d{4})\s*[·년]\s*(\d{1,2})월/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

/** P7 — 표시월 ±delta (연 경계 처리). month 1-based. */
export function shiftMonth({ year, month }, delta) {
  const d = new Date(year, (month - 1) + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * P7 — monthLabel + calGrid 를 지정 월로 재렌더.
 *
 * mocks IIFE 의 5월 fixture (정적 "2026 · 5월" + 31일 고정) 를 실제 월 레이아웃으로 교체.
 * 셀은 기본(비-worked) 상태만 — 히트맵/오늘 링은 직후 applyWorkedToCalendar/applyTodayToCalendar 가 입힘.
 * 그리드 헤더가 월~일 이므로 선행 빈칸 = (1일 요일 + 6) % 7.
 */
export function renderCalendarGrid(year, month, doc) {
  doc = doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { skipped: 'no-document' };
  const grid = doc.getElementById('calGrid');
  const label = doc.getElementById('monthLabel');
  if (!grid || !label) return { skipped: 'no-mounts' };

  label.textContent = `${year} · ${month}월`;

  const leading = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const days = new Date(year, month, 0).getDate();
  let html = '';
  for (let i = 0; i < leading; i++) html += '<div></div>';
  for (let d = 1; d <= days; d++) {
    html += '<div class="cal-cell" data-day="' + d + '" style="aspect-ratio:1;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-direction:column;position:relative;">'
      + '<span class="num" style="font-size:13px;font-weight:500;color:var(--ink-4);">' + d + '</span>'
      + '</div>';
  }
  grid.innerHTML = html;
  return { rendered: true, year, month, days, leading };
}

/**
 * P7 — 지정 월로 캘린더 전체 갱신 (그리드 + 해당 월 세션 히트맵 + 오늘 링).
 * 월 네비는 60일 lookback 밖으로 나갈 수 있어 표시월 범위로 별도 조회.
 */
export async function refreshCalendarMonth(year, month, doc, now = Date.now()) {
  doc = doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { skipped: 'no-document' };
  const r = renderCalendarGrid(year, month, doc);
  if (r.skipped) return r;
  let sessions = [];
  try {
    const mm = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    sessions = await getSessionsByRange(`${year}-${mm}-01`, `${year}-${mm}-${String(lastDay).padStart(2, '0')}`);
  } catch (_) { /* db 없음 — 그리드·라벨만 갱신 */ }
  // 연속 네비 race 가드 — 조회 중 다른 네비가 표시월을 바꿨으면 이 응답은 stale (히트맵 reset 방지).
  const cur = parseMonthLabel(doc.getElementById('monthLabel')?.textContent);
  if (!cur || cur.year !== year || cur.month !== month) return { skipped: 'stale' };
  applyWorkedToCalendar(sessions, doc);
  applyTodayToCalendar(now, doc);
  return { applied: true, year, month };
}

/** P7 — 월 네비 화살표 (#calPrev/#calNext) 클릭 → 표시월 ±1. idempotent. */
export function wireMonthNav(doc) {
  doc = doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { wired: 0 };
  const prev = doc.getElementById('calPrev');
  const next = doc.getElementById('calNext');
  const label = doc.getElementById('monthLabel');
  if (!prev || !next || !label) return { wired: 0 };
  if (prev.dataset.spaMonthNav === '1') return { wired: 0 };
  prev.dataset.spaMonthNav = '1';
  next.dataset.spaMonthNav = '1';
  const go = (delta) => {
    const cur = parseMonthLabel(label.textContent);
    if (!cur) return;
    const t = shiftMonth(cur, delta);
    refreshCalendarMonth(t.year, t.month, doc).catch((e) => console.error('[gymStats] monthNav', e));
  };
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  return { wired: 1 };
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
/**
 * §9-1 — 월 캘린더 셀에 tap/long-press 위임.
 *  - data-day(1~31) + monthLabel(YYYY · M월) → ISO 변환
 *  - .worked 셀만 활성 (운동 없는 날은 무시)
 */
export function wireMonthCalendarTaps(doc) {
  doc = doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { wired: 0 };
  const grid = doc.getElementById('calGrid');
  const label = doc.getElementById('monthLabel');
  const tap = typeof window !== 'undefined' ? window.gymDayDetail?.attachCalendarTapHandlers : null;
  if (!grid || !label || typeof tap !== 'function') return { wired: 0 };
  tap(grid, {
    cellSelector: '.cal-cell.worked',
    isoExtractor: (el) => {
      const day = parseInt(el?.dataset?.day, 10);
      if (!Number.isFinite(day)) return null;
      const parsed = parseMonthLabel(label.textContent);
      if (!parsed) return null;
      return `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    },
    onTap: async (iso) => {
      const fetcher = window.gymHome?.fetchDayDetail;
      const entry = typeof fetcher === 'function' ? await fetcher(iso) : null;
      window.gymDayDetail?.openDayDetailSheet?.(doc, { iso, entry, step: 'summary' });
    },
    onLongPress: (iso) => {
      window.gymDayDetail?.openDayDetailSheet?.(doc, {
        iso,
        step: 'confirm',
        onDelete: async (delIso) => {
          await deleteSessionByISO(delIso);
          try { await mountStatsView(); } catch (e) { console.error('[gymStats] refresh after delete', e); }
        },
      });
    },
  });
  return { wired: 1 };
}

/**
 * §9-1 — ISO 기반 단일 삭제 wrapper.
 * 주간 캘린더는 monthLabel 없으므로 deleteSessionByDay 대신 이쪽 사용.
 */
export async function deleteSessionByISO(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return { ok: false, reason: 'invalid_iso' };
  try {
    const session = await getSessionByDate(iso);
    if (!session) return { ok: false, reason: 'no_session', iso };
    await deleteSession(session.id);
    return { ok: true, deletedId: session.id, iso };
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) return { ok: false, reason: 'no_db' };
    console.error('[gymStats] deleteSessionByISO', e);
    return { ok: false, reason: 'error', error: e?.message };
  }
}

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
  // 커스텀 운동 이름 동기 lookup 캐시 prime — 종목 빈도 등이 cust_* id 대신 이름 표시.
  try { primeCustomExerciseCache(await listCustomExercises()); } catch (_) { /* db 없음 fallback */ }
  // 페이지 헤더 nav (홈/관리) wiring — home.js wireHomeShortcuts 재사용 (idempotent body.dataset.spaHomeShortcuts guard)
  try { wireHomeShortcuts(doc); } catch (e) { console.error('[gymStats] wireHomeShortcuts', e); }
  try {
    const today = new Date(now);
    const lookback = new Date(today);
    lookback.setDate(today.getDate() - 60);
    const sessions = await getSessionsByRange(toISODate(lookback), toISODate(today));
    const volumes = summarizeVolumes(sessions, now);
    applyVolumesToDom(volumes, doc);
    // 캘린더 하단 8주 막대+선 추이 + 부위 + 종목 빈도 hydrate
    renderWeeklyTrendChart(summarizeWeeklyTrend(sessions, 8, now), doc);
    applyBodyPartsToDom(summarizeBodyParts(sessions), doc);
    applyMusclesToSilhouette(summarizeMuscles(sessions, getBuiltinExercise), doc);
    applyExerciseFrequencyToDom(summarizeExerciseFrequency(sessions, getBuiltinExercise), doc);
    // P7 — mock 정적 "2026 · 5월" fixture 를 현재월 그리드로 교체 후 히트맵·오늘 링 적용.
    renderCalendarGrid(today.getFullYear(), today.getMonth() + 1, doc);
    applyTodayToCalendar(now, doc);
    applyWorkedToCalendar(sessions, doc);
    try { wireMonthNav(doc); } catch (e) { console.error('[gymStats] wireMonthNav', e); }
    try { wireMonthCalendarTaps(doc); } catch (e) { console.error('[gymStats] wireMonthCalendarTaps', e); }
    try { (typeof window !== 'undefined' ? window.gymDayDetail : null)?.wireDayDetailSheet?.(doc); } catch (e) { console.error('[gymStats] wireDayDetailSheet', e); }
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
  // 사용자 정책: 하루 = 부위당 1회. (date, partKey) 쌍 dedupe — 같은 날 여러 session 의 같은 부위도 1회.
  const dateKeySeen = new Set();
  for (const s of list) {
    if (!s) continue;
    const date = s.date || '';
    const tags = Array.isArray(s.tags) ? s.tags : [];
    for (const tag of tags) {
      let meta = PART_META.find((p) => p.key === tag);
      if (!meta) meta = PART_META.find((p) => p.kr === tag);
      if (!meta) continue;
      const dk = `${date}|${meta.key}`;
      if (dateKeySeen.has(dk)) continue;
      dateKeySeen.add(dk);
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

/** 1234 → "1.2K", 999 → "999". 통계 헤더 표기. */
function formatK(n) {
  const v = Number(n) || 0;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return String(Math.round(v));
}

/** 8주 주간 볼륨 비교 — 신규 (기존 applyTrendToDom 폐기, 재사용 금지).
 *  - 8주 모두 막대 (0인 주도 회색 placeholder, 이번 주 진한 오렌지)
 *  - 막대 위 선 overlay (8주 모든 점 연결)
 *  - X 축 라벨 (8주전 / 6주전 / 4주전 / 2주전 / 이번) 별도 div
 *  - viewBox 0 0 320 160 — padding 충분, 하단 겹침 방지
 *  - trend = [{weekStart, vol}] (length=8)
 */
export function renderWeeklyTrendChart(trend, doc) {
  if (!doc || !Array.isArray(trend)) return;
  const svg = doc.getElementById('weekly-trend-chart');
  if (!svg) return;
  Array.from(svg.querySelectorAll('rect,polyline,circle,line,text')).forEach((el) => el.remove());

  const W = 320, H = 160;
  const padTop = 14, padBot = 14;
  const chartH = H - padTop - padBot; // 132
  const max = Math.max(0, ...trend.map((t) => Number(t.vol) || 0));
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const n = trend.length || 8;
  const slot = W / n;
  const barW = slot * 0.55;

  // 막대 — 모든 주
  trend.forEach((t, i) => {
    const v = Number(t.vol) || 0;
    const isCurrent = i === n - 1;
    const ratio = max > 0 ? v / max : 0;
    const barH = ratio > 0 ? Math.max(4, ratio * chartH) : Math.max(8, chartH * 0.08); // 0인 주는 명확히 보이는 placeholder (8px+)
    const x = i * slot + (slot - barW) / 2;
    const y = padTop + (chartH - barH);
    const bar = doc.createElementNS(SVG_NS, 'rect');
    bar.setAttribute('x', x.toFixed(1));
    bar.setAttribute('y', y.toFixed(1));
    bar.setAttribute('width', barW.toFixed(1));
    bar.setAttribute('height', barH.toFixed(1));
    bar.setAttribute('rx', '3');
    // 라이트 재디자인: 막대는 중립 회색, 이번 주(마지막)만 크레일. 0인 주는 더 옅은 회색 placeholder.
    let fill;
    if (v <= 0) fill = '#e9e5dc';
    else if (isCurrent) fill = '#c1633f';
    else fill = '#dfd9cd';
    bar.setAttribute('fill', fill);
    svg.appendChild(bar);
  });

  // 선 overlay + 점 — 모든 8점 (0 도 baseline 따라). 선/점 모두 중립, 이번 주 점만 크레일.
  if (max > 0) {
    const step = n > 1 ? W / (n - 1) : 0;
    const coords = trend.map((t, i) => {
      const v = Number(t.vol) || 0;
      return [i * step, padTop + (chartH - (v / max) * chartH)];
    });
    const line = doc.createElementNS(SVG_NS, 'polyline');
    line.setAttribute('points', coords.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '));
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#b3ac9e');
    line.setAttribute('stroke-width', '1.6');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(line);
    coords.forEach((p, i) => {
      const isCurrent = i === n - 1;
      const dot = doc.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', p[0].toFixed(1));
      dot.setAttribute('cy', p[1].toFixed(1));
      dot.setAttribute('r', isCurrent ? '4' : '2.5');
      dot.setAttribute('fill', isCurrent ? '#c1633f' : '#c4bcae');
      if (isCurrent) { dot.setAttribute('stroke', '#fffdf8'); dot.setAttribute('stroke-width', '2'); }
      svg.appendChild(dot);
    });
  }

  // X 축 라벨 별도 div (그래프와 시각 분리)
  const xaxis = doc.querySelector('[data-bind="weekly-trend-xaxis"]');
  if (xaxis) {
    const labels = trend.map((t, i) => {
      if (i === n - 1) return '이번';
      if (i === 0) return `${n - 1}주전`; // 첫 라벨 항상 표시
      const weeksAgo = n - 1 - i;
      return weeksAgo % 2 === 0 ? `${weeksAgo}주전` : '';
    });
    xaxis.innerHTML = labels.map((l) => `<span style="flex:1;text-align:center;">${l}</span>`).join('');
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * 종목 탭 — 사용자가 자주 한 운동 빈도순.
 * sessions.blocks[].sets done=true 카운트 → exerciseId 별 누적.
 * 부위 + 부위 색 매핑 (PART_META 재사용, builtin 만 — custom/unknown 은 회색 fallback).
 * 반환: [{ exerciseId, name, setCount, part, color }] (setCount 내림차순)
 */
export function summarizeExerciseFrequency(sessions, getBuiltin) {
  const list = Array.isArray(sessions) ? sessions : [];
  const map = new Map();
  for (const s of list) {
    if (!s) continue;
    const blocks = Array.isArray(s.blocks) ? s.blocks : [];
    for (const b of blocks) {
      if (!b || b.type !== 'single' || !b.exerciseId) continue;
      const sets = Array.isArray(b.sets) ? b.sets : [];
      const doneCount = sets.filter((x) => x && x.done === true).length;
      if (doneCount <= 0) continue;
      map.set(b.exerciseId, (map.get(b.exerciseId) || 0) + doneCount);
    }
  }
  return Array.from(map.entries())
    .map(([exerciseId, setCount]) => {
      const ex = typeof getBuiltin === 'function' ? getBuiltin(exerciseId) : null;
      const part = ex?.part || null;
      const meta = part ? PART_META.find((p) => p.key === part) : null;
      return {
        exerciseId,
        name: exerciseIdToName(exerciseId),
        setCount,
        part,
        color: meta?.color || 'rgba(255,255,255,0.25)',
      };
    })
    .sort((a, b) => b.setCount - a.setCount);
}

/** 종목 빈도 list 렌더 — 모바일 친화 행 단위 리스트.
 *  각 row: 부위 색 점 + 종목명 + setCount + 가로 막대 (빈도 비례 fill).
 *  treemap 면적 표현은 모바일 viewport 에서 가독성 떨어져 폐기.
 */
export function applyExerciseFrequencyToDom(rows, doc) {
  if (!doc) return;
  const totalEl = doc.querySelector('[data-bind="exercise-total"]');
  const treemapEl = doc.querySelector('[data-bind="exercise-treemap"]');
  const emptyEl = doc.querySelector('[data-bind="exercise-empty"]');
  if (totalEl) totalEl.textContent = String(rows.length);
  if (!treemapEl) return;
  Array.from(treemapEl.children).forEach((c) => { if (c !== emptyEl) c.remove(); });
  if (rows.length === 0) {
    if (emptyEl) emptyEl.style.display = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  const max = rows[0].setCount || 1;
  // 색 규율: 1위(최다 빈도)만 크레일, 나머지는 중립 회색. PART_META 부위색 미사용.
  const html = rows.map((r, i) => {
    const pct = Math.max(4, Math.round((r.setCount / max) * 100));
    const isTop = i === 0;
    const dot = isTop ? 'var(--crail-base)' : 'var(--ink-3)';
    const fill = isTop ? 'var(--crail-base)' : 'var(--ink-4)';
    const nameStyle = isTop ? ' style="color:var(--crail-deep);"' : '';
    return `<div class="ex-freq-row">`
      + `<div class="ex-freq-head">`
        + `<span class="ex-freq-dot" style="background:${dot};"></span>`
        + `<span class="ex-freq-name kr"${nameStyle}>${escapeHtml(r.name)}</span>`
        + `<span class="ex-freq-count num">${r.setCount}<span class="kr">세트</span></span>`
      + `</div>`
      + `<div class="ex-freq-bar"><span class="ex-freq-fill" style="width:${pct}%;background:${fill};"></span></div>`
      + `</div>`;
  }).join('');
  treemapEl.insertAdjacentHTML('beforeend', html);
}

/** 부위 랭크 색 — 1위만 크레일, 나머지는 중립 회색 ramp (PART_META 부위별 색 미사용, 색 규율 준수). */
const PART_RANK_GRAY = ['#c2bbac', '#d0cabd', '#ddd8cd', '#e9e5dc'];
function partRankColor(i) {
  if (i === 0) return 'var(--crail-base)';
  return PART_RANK_GRAY[Math.min(i - 1, PART_RANK_GRAY.length - 1)];
}

/** W-I — 부위 분포 도넛 + stack + list 갱신. parts = [{key, name, count, color}] (count>0, sorted desc).
 *  색은 RANK 기반(1위 크레일 / 나머지 회색 ramp) — parts[].color(부위별 색)는 무시. */
export function applyBodyPartsToDom(parts, doc) {
  if (!doc || !Array.isArray(parts)) return;
  const total = parts.reduce((s, p) => s + (Number(p.count) || 0), 0);
  const totalEl = doc.querySelector('[data-bind="body-total"]');
  if (totalEl) totalEl.textContent = String(total);

  // 도넛 — body-silhouette 훅(실루엣 폐기 후 .donut div)에 conic-gradient 주입.
  // innerHTML 미사용 (중앙 body-total 라벨 보존) — background style 만 교체.
  const donut = doc.querySelector('[data-bind="body-silhouette"]');
  if (donut && donut.style) {
    if (total === 0) {
      donut.style.background = 'var(--sunken)';
    } else {
      let acc = 0;
      const stops = parts.map((p, i) => {
        const from = (acc / total) * 100;
        acc += Number(p.count) || 0;
        const to = (acc / total) * 100;
        return `${partRankColor(i)} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
      });
      donut.style.background = `conic-gradient(${stops.join(', ')})`;
    }
  }

  // 비율 막대 (얇은 stacked) — width%+랭크 색.
  const stack = doc.querySelector('[data-bind="body-stack"]');
  if (stack) {
    if (total === 0) {
      stack.innerHTML = '';
    } else {
      stack.innerHTML = parts.map((p, i) => {
        const pct = ((p.count / total) * 100).toFixed(1);
        return `<div style="width:${pct}%;background:${partRankColor(i)};"></div>`;
      }).join('');
    }
  }
  // 범례 — .lrow (dot + 이름 + 횟수 + %).
  const list = doc.querySelector('[data-bind="body-list"]');
  if (list) {
    if (total === 0) {
      list.innerHTML = '<div class="kr" style="padding:14px 0;color:var(--ink-4);font-size:15px;text-align:center;">기록 없음</div>';
    } else {
      list.innerHTML = parts.map((p, i) => {
        const pct = Math.round((p.count / total) * 100);
        return `<div class="lrow"><span class="dot" style="background:${partRankColor(i)};"></span><span class="nm kr">${p.name}</span><span class="ct num">${p.count}회</span><span class="pc num">${pct}%</span></div>`;
      }).join('');
    }
  }
}

/**
 * Wave v3 — 운동 종목별 자극 근육 가중치 합산.
 *
 * sessions.blocks[].sets done=true 개수 → exerciseId 빈도 → EXERCISE_MUSCLES 매핑 → 근육별 score.
 * 가중치: primary 1.0, synergist 0.4. 매핑 없는 운동(custom/cardio 등)은 silhouette 강조 0.
 *
 * 반환: [{ muscleKey, score }] score 내림차순.
 */
export function summarizeMuscles(sessions, getBuiltin) {
  const list = Array.isArray(sessions) ? sessions : [];
  const scores = new Map();
  for (const s of list) {
    if (!s) continue;
    const blocks = Array.isArray(s.blocks) ? s.blocks : [];
    for (const b of blocks) {
      if (!b || b.type !== 'single' || !b.exerciseId) continue;
      const sets = Array.isArray(b.sets) ? b.sets : [];
      const doneCount = sets.filter((x) => x && x.done === true).length;
      if (doneCount <= 0) continue;
      // builtin 만 매핑 — custom 운동은 part 정보 없어 skip
      const ex = typeof getBuiltin === 'function' ? getBuiltin(b.exerciseId) : null;
      if (!ex) continue;
      const map = EXERCISE_MUSCLES[b.exerciseId];
      if (!map) continue;
      for (const m of map.primary || []) {
        scores.set(m, (scores.get(m) || 0) + doneCount * WEIGHT_PRIMARY);
      }
      for (const m of map.synergist || []) {
        scores.set(m, (scores.get(m) || 0) + doneCount * WEIGHT_SYNERGIST);
      }
    }
  }
  return Array.from(scores.entries())
    .map(([muscleKey, score]) => ({ muscleKey, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Wave v3 — silhouette path 색 강조 ([data-muscle] 셀렉터).
 *
 * score 최댓값 → alpha 0.90, score 0 → BASE 살색 톤(rgba(212,165,154,0.22)). ramp: 0.45 ~ 0.90.
 * 강조 색: crail rgba(217,119,87,a). (실루엣→도넛 교체 후 [data-muscle] 부재로 production no-op — orphan 유지)
 */
export function applyMusclesToSilhouette(muscles, doc) {
  if (!doc || !Array.isArray(muscles)) return;
  const BASE = 'rgba(212,165,154,0.22)'; // 무자극 인체 살색 톤
  const max = Math.max(0, ...muscles.map((m) => Number(m.score) || 0));
  const scoreMap = new Map(muscles.map((m) => [m.muscleKey, Number(m.score) || 0]));
  const paths = doc.querySelectorAll?.('[data-muscle]') || [];
  paths.forEach((el) => {
    const key = el.getAttribute('data-muscle');
    const s = scoreMap.get(key) || 0;
    if (max === 0 || s === 0) {
      el.setAttribute('fill', BASE);
    } else {
      const ratio = s / max;
      const alpha = 0.45 + ratio * 0.45;
      el.setAttribute('fill', `rgba(217,119,87,${alpha.toFixed(2)})`);
    }
  });
}

if (typeof window !== 'undefined') {
  window.gymStats = {
    summarizeVolumes,
    compareDelta,
    formatDelta,
    applyVolumesToDom,
    applyTodayToCalendar,
    parseMonthLabel,
    shiftMonth,
    renderCalendarGrid,
    refreshCalendarMonth,
    wireMonthNav,
    sessionToWorkoutEntry,
    mergeWorkoutEntries,
    applyWorkedToCalendar,
    deleteSessionByDay,
    deleteSessionByISO,
    wireMonthCalendarTaps,
    mountStatsView,
    summarizeBodyParts,
    summarizeWeeklyTrend,
    renderWeeklyTrendChart,
    applyBodyPartsToDom,
    summarizeExerciseFrequency,
    applyExerciseFrequencyToDom,
    summarizeMuscles,
    applyMusclesToSilhouette,
  };
}
