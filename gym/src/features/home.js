/**
 * Wave 11.10.1 — 홈 화면 진행 중 세션 카드 (spec §5-5).
 *
 * 미완료 (status='active') 세션 1건 있으면 mocks home.html 의 streak 영역 DOM 갱신:
 *   - #sLabel='진행 중'
 *   - #sNum='mm:ss' (경과 시간), 폰트 40px (mocks session state 동일)
 *   - #sUnit='경과'
 *   - #sPart=tags → PARTS 한국어 매핑, ' · ' join
 *   - #sSub='M / N 종목' (M=all sets done, N=total single 블록)
 *   - #ctaBtn='이어가기' + click → #/session
 *   - #app dataset.state='session' (mocks CSS 자동 적용)
 *
 * active 세션 없으면 no-op (mocks default applyState('active') 그대로).
 *
 * 실시간 갱신 (setInterval) 은 별 wave — 이번 wave 는 1회 set.
 */

import {
  getActiveSession,
  getSessionsByRange,
  getUserSettings,
  weekRangeISO,
  isoToWeekdayIdx,
  toISODate,
  listCustomExercises,
  listAllWeights,
} from '../db/queries.js';
import { PARTS, getBuiltinExercise, resolveExerciseName, getCachedCustomExercise, primeCustomExerciseCache } from '../db/exercises.js';

const DEFAULT_WEEKLY_GOAL = 4;

const WEEK_LABELS_KOR = ['월', '화', '수', '목', '금', '토', '일']; // 월 시작 (isoToWeekdayIdx 와 정합)

/** 부위 영문 → 단일 글자 한국어 약어 (spec §5-2). 누락 → '기타'. */
export function partAbbreviation(tag) {
  switch (tag) {
    case 'chest': return '가';
    case 'back': return '등';
    case 'shoulder': return '어';
    case 'legs': return '하';
    case 'arms': return '팔';
    case 'core': return '코';
    case 'cardio': return '유'; // 유산소 (작업지시서(3) 확정 [3])
    default:
      // 한국어 fallback (mocks Wave 11.6D 에서 이미 단일 글자) — 그대로 반환
      if (typeof tag === 'string' && tag.length === 1) return tag;
      // mocks Wave 11.6D partOfExercise 결과 ('가'/'하'/...) 그대로
      if (typeof tag === 'string' && /^[가-힣]+$/.test(tag)) return tag.charAt(0);
      return tag ? '기타' : '';
  }
}

/**
 * active 세션 → 홈 streak 표시용 객체.
 * 반환:
 *   null — session 없음 또는 status!=active
 *   { label, num, unit, part, sub, cta, sessionNumSize }
 */
export function summarizeActiveSession(session, now = Date.now()) {
  if (!session || session.status !== 'active') return null;
  const blocks = Array.isArray(session.blocks) ? session.blocks : [];
  const singles = blocks.filter((b) => b && b.type === 'single');
  const totalExercises = singles.length;
  const completedExercises = singles.filter(
    (b) => Array.isArray(b.sets) && b.sets.length > 0 && b.sets.every((s) => s && s.done),
  ).length;

  const elapsedSec = session.startTime
    ? Math.max(0, Math.floor((now - session.startTime) / 1000))
    : 0;
  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;
  const num = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const tags = Array.isArray(session.tags) ? session.tags : [];
  const part = tags.map((t) => PARTS[t] || t).join(' · ');

  // P6 — 현재 진행 중 block(첫 미완료 single) + 위치 + 세트 진행 + 누적 볼륨
  let curBlock = null, curPos = 0, sp = 0;
  for (const b of blocks) {
    if (b && b.type === 'single') {
      sp += 1;
      if (!curBlock && isSingleBlockIncomplete(b)) { curBlock = b; curPos = sp; }
    }
  }
  const curSets = Array.isArray(curBlock?.sets) ? curBlock.sets : [];
  let curSetIdx = curSets.findIndex((s) => s && !s.done);
  if (curSetIdx === -1) curSetIdx = Math.max(0, curSets.length - 1);
  const exName = curBlock ? resolveExerciseName(curBlock.exerciseId) : '';
  let totalVol = 0;
  for (const b of singles) {
    for (const s of (Array.isArray(b.sets) ? b.sets : [])) {
      if (s && s.done) totalVol += (Number(s.weight) || 0) * (Number(s.reps) || 0);
    }
  }

  return {
    label: '운동 중',
    num,
    unit: '경과',
    part,
    sub: `${completedExercises} / ${totalExercises} 종목`,
    cta: '이어가기',
    sessionNumSize: 40,
    exName,
    subLine: `${part ? part + ' · ' : ''}${totalExercises}종목 중 ${curPos || 1}번째`,
    sets: curSets.map((s) => ({ weight: Number(s?.weight) || 0, reps: Number(s?.reps) || 0, done: !!(s && s.done) })),
    curSetIdx,
    setTotal: curSets.length,
    totalVol,
  };
}

/**
 * mid-session 홈 화면 "다음" 영역 — 현재 진행 중 single block 이후 미완료 block 들의 미리보기.
 * 데이터 shape: { type:'single', exerciseId, sets:[{weight,reps,done,...}], finishedAt? }.
 * 서킷 (spec §16 폐기) 은 스킵.
 * 반환: [{ name, summary }] (limit 개수까지). active 세션 없거나 다음 block 없으면 [].
 */
export function summarizeNextBlocks(session, limit = 2) {
  if (!session || session.status !== 'active') return [];
  const blocks = Array.isArray(session.blocks) ? session.blocks : [];
  let currentIdx = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (isSingleBlockIncomplete(blocks[i])) { currentIdx = i; break; }
  }
  if (currentIdx === -1) return [];
  const out = [];
  for (let i = currentIdx + 1; i < blocks.length && out.length < limit; i++) {
    if (!isSingleBlockIncomplete(blocks[i])) continue;
    const preview = formatBlockPreview(blocks[i]);
    if (preview) out.push(preview);
  }
  return out;
}

function isSingleBlockIncomplete(block) {
  if (!block || block.type !== 'single') return false;
  if (Number.isFinite(block.finishedAt)) return false;
  const sets = Array.isArray(block.sets) ? block.sets : [];
  if (!sets.length) return true;
  return sets.some((s) => s && !s.done);
}

function formatBlockPreview(block) {
  if (!block || block.type !== 'single') return null;
  const builtin = getBuiltinExercise(block.exerciseId);
  const custom = builtin ? null : getCachedCustomExercise(block.exerciseId);
  const name = resolveExerciseName(block.exerciseId) || '';
  const equipment = (builtin || custom)?.equipment || null;
  const sets = Array.isArray(block.sets) ? block.sets : [];
  const setsCount = sets.length;
  const firstSet = sets[0] || {};
  if (equipment === 'cardio') {
    const dur = Number(firstSet.duration) || 0;
    const dist = Number(firstSet.distance) || 0;
    const mins = Math.round(dur / 60);
    const summary = dist ? `${mins}분 · ${dist}km` : `${mins}분`;
    return { name, summary };
  }
  if (equipment === 'bodyweight') {
    const reps = Number(firstSet.reps) || 0;
    return { name, summary: `맨몸 ${reps}회 · ${setsCount}세트` };
  }
  const w = Number(firstSet.weight) || 0;
  const r = Number(firstSet.reps) || 0;
  return { name, summary: `${w}×${r} · ${setsCount}세트` };
}

/**
 * spec §5-3 — 마지막 completed 세션 + 이번 주 count → streak 정보 (디자인 시안 정합).
 *
 * 입력: completed sessions 배열 (date desc 무관, summarizeStreak 가 정렬), now epoch ms,
 *       weeklyGoal (1~7, 기본 4 — profile.settings.weeklyGoal).
 * 반환:
 *   { state: 'empty'|'active'|'gap'|'rest',
 *     label, num, unit, part,
 *     sub: '<weekCount>',           // streak-week-num 표시값
 *     subUnit: '/<weeklyGoal>회' }  // streak-week-unit 접미
 *
 * empty 상태(시안 부재) 임의 채움: label='마지막 운동', num='—', part='', sub='0', subUnit='/Ngoal회'.
 */
/**
 * P5 — 연속 운동 주(週) 수. 이번 주부터 거꾸로, 운동한 주가 연속되는 동안 카운트.
 *  - 이번 주 미운동은 streak 미파기(아직 안 끝남) — 지난 주부터 평가.
 */
function computeWeekStreak(sessions, now) {
  if (!Array.isArray(sessions) || !sessions.length) return 0;
  const dates = sessions.map((s) => String(s.date || '')).filter(Boolean);
  let streak = 0;
  let cursor = new Date(now);
  for (let i = 0; i < 60; i += 1) {
    const { from, to } = weekRangeISO(cursor);
    const hit = dates.some((d) => d >= from && d <= to);
    if (hit) streak += 1;
    else if (i > 0) break; // 이번 주(i=0) 미운동은 유지, 그 이전 빈 주는 중단
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

export function summarizeStreak(sessions, now = Date.now(), weeklyGoal = DEFAULT_WEEKLY_GOAL) {
  const goal = Number.isFinite(weeklyGoal) && weeklyGoal >= 1 && weeklyGoal <= 7
    ? Math.round(weeklyGoal) : DEFAULT_WEEKLY_GOAL;
  const subUnit = `/${goal}회`;
  const today = new Date(now);
  const todayISO = toISODate(today);
  const list = Array.isArray(sessions) ? sessions.slice() : [];
  if (!list.length) {
    return {
      state: 'empty',
      label: '마지막 운동',
      num: '—',
      unit: '',
      part: '',
      sub: '0',
      subUnit,
      weekCountNum: 0,
      goalNum: goal,
      weekStreak: 0,
      lastWorkoutParts: '',
      weekdayLabel: '',
      sinceLabel: '',
    };
  }
  list.sort((a, b) => {
    const da = String(a.date || ''), dbS = String(b.date || '');
    if (da !== dbS) return da < dbS ? 1 : -1;
    return (b.endTime || 0) - (a.endTime || 0);
  });
  const last = list[0];
  const lastDate = new Date(`${last.date}T00:00:00`);
  const todayMidnight = new Date(`${todayISO}T00:00:00`);
  const daysSince = Math.max(
    0,
    Math.round((todayMidnight - lastDate) / 86_400_000),
  );

  const { from: weekFrom, to: weekTo } = weekRangeISO(today);
  const weekCount = list.filter((s) => s.date >= weekFrom && s.date <= weekTo).length;

  const tags = Array.isArray(last.tags) ? last.tags : [];
  const part = tags.map((t) => PARTS[t] || t).join(' · ');
  // 직전 운동 행(작업지시서 홈) — 맨몸(cardio) 제외 부위만, 2개 이상 그대로 표기.
  // 전부 유산소뿐이면 폴백으로 전체(맨몸 포함) 표기해 빈 줄 방지.
  const partsNonCardio = tags.filter((t) => t !== 'cardio').map((t) => PARTS[t] || t);
  const lastWorkoutParts = (partsNonCardio.length ? partsNonCardio : tags.map((t) => PARTS[t] || t)).join(' · ');
  const weekdayLabel = `${WEEK_LABELS_KOR[isoToWeekdayIdx(last.date)] || ''}요일`;
  const sinceLabel = daysSince === 0 ? '오늘' : `${daysSince}일 전`;

  let state;
  if (daysSince <= 2) state = 'active';
  else if (daysSince <= 4) state = 'gap';
  else state = 'rest';

  return {
    state,
    label: '마지막 운동',
    num: daysSince === 0 ? '오늘' : String(daysSince),
    unit: daysSince === 0 ? '' : '일 전',
    part,
    sub: String(weekCount),
    subUnit,
    weekCountNum: weekCount,
    goalNum: goal,
    weekStreak: computeWeekStreak(list, now),
    lastWorkoutParts,
    weekdayLabel,
    sinceLabel,
  };
}

/* ───────── 부위 밸런스 위젯 (작업지시서 홈 — 신규 주역) ───────── */

/** 밸런스 6분류 — 고정 순서 (하체·어깨·등·가슴·팔·코어). */
export const BALANCE_PARTS = Object.freeze([
  { key: 'legs', name: '하체' },
  { key: 'shoulder', name: '어깨' },
  { key: 'back', name: '등' },
  { key: 'chest', name: '가슴' },
  { key: 'arms', name: '팔' },
  { key: 'core', name: '코어' },
]);

const BALANCE_MUSCLE_PARTS = ['chest', 'back', 'shoulder', 'legs', 'arms'];

/**
 * 운동 id → 밸런스 분류 (작업지시서 "코어·유산소 정의" 데이터 근거).
 *  - equipment==='cardio' (트레드밀·사이클·엘립티컬) → 'cardio' (밸런스 제외, 별도 줄)
 *  - part==='core' (행잉레그레이즈·디클라인싯업 등 abs) → 'core'. 구데이터 part==='cardio'+비유산소 장비도 흡수.
 *  - 그 외 part (chest/back/shoulder/legs/arms) → 그대로 (데드리프트는 back 유지)
 * 빌트인 우선, 없으면 커스텀 캐시. 미해결 → null.
 */
export function categorizeBalancePart(exerciseId) {
  const ex = getBuiltinExercise(exerciseId) || getCachedCustomExercise(exerciseId);
  if (!ex) return null;
  if (ex.equipment === 'cardio') return 'cardio';
  if (ex.part === 'core' || ex.part === 'cardio') return 'core'; // abs (신 part='core', 구데이터 'cardio' 폴백)
  if (BALANCE_MUSCLE_PARTS.includes(ex.part)) return ex.part;
  return null;
}

/**
 * 최근 7일 부위별 완료(done) 세트 수 + 지난주(직전 7일) 비교 + 유산소 별도 집계.
 * stats.js summarizeExerciseFrequency 의 done-세트 카운팅을 부위 단위로 재사용.
 *
 * 반환: {
 *   parts: [{ key, name, sets, prevSets }] (BALANCE_PARTS 고정 순서),
 *   cardio: { min, count },   // 이번 주 유산소 시간(분)·횟수
 *   focusKey,                 // 가장 부족한 부위 1개 (이번 주 set 최소, 동률→고정순서 우선). 전부 0 → null
 *   max,                      // 막대 스케일 기준 (이번·지난 주 부위 set 최댓값, 최소 1)
 * }
 */
export function summarizeWeeklyBalance(sessions, now = Date.now()) {
  const list = Array.isArray(sessions) ? sessions : [];
  const today = new Date(now);
  const todayISO = toISODate(today);
  const dShift = (n) => { const d = new Date(today); d.setDate(today.getDate() + n); return toISODate(d); };
  const thisFrom = dShift(-6);   // 최근 7일 [today-6, today]
  const prevTo = dShift(-7);
  const prevFrom = dShift(-13);  // 직전 7일 [today-13, today-7]

  const thisSets = new Map();
  const prevSets = new Map();
  let cardioMin = 0;
  let cardioCount = 0;
  let prevCardioMin = 0;

  const accumulate = (s, setsMap, isThisWeek) => {
    for (const b of (Array.isArray(s.blocks) ? s.blocks : [])) {
      if (!b || b.type !== 'single' || !b.exerciseId) continue;
      const cat = categorizeBalancePart(b.exerciseId);
      if (!cat) continue;
      const doneSets = (Array.isArray(b.sets) ? b.sets : []).filter((x) => x && x.done === true);
      if (!doneSets.length) continue;
      if (cat === 'cardio') {
        if (isThisWeek) {
          cardioCount += doneSets.length;
          for (const st of doneSets) cardioMin += (Number(st.duration) || 0) / 60;
        } else {
          for (const st of doneSets) prevCardioMin += (Number(st.duration) || 0) / 60;
        }
        continue;
      }
      setsMap.set(cat, (setsMap.get(cat) || 0) + doneSets.length);
    }
  };

  for (const s of list) {
    if (!s || !s.date) continue;
    if (s.date >= thisFrom && s.date <= todayISO) accumulate(s, thisSets, true);
    else if (s.date >= prevFrom && s.date <= prevTo) accumulate(s, prevSets, false);
  }

  const parts = BALANCE_PARTS.map(({ key, name }) => ({
    key,
    name,
    sets: thisSets.get(key) || 0,
    prevSets: prevSets.get(key) || 0,
  }));

  const totalThis = parts.reduce((sum, p) => sum + p.sets, 0);
  let focusKey = null;
  if (totalThis > 0) {
    let min = Infinity;
    for (const p of parts) {
      if (p.sets < min) { min = p.sets; focusKey = p.key; }
    }
  }
  const max = Math.max(1, ...parts.map((p) => Math.max(p.sets, p.prevSets)));

  return {
    parts,
    cardio: { min: Math.round(cardioMin), count: cardioCount, deltaMin: Math.round(cardioMin) - Math.round(prevCardioMin) },
    focusKey,
    max,
  };
}

/**
 * 오늘 기준 주 (월~일) 의 cal-day 7개 데이터.
 * 반환: [{ wdLabel, num, iso, isToday, part?, sessionId? }] (월요일=0 ~ 일요일=6).
 */
export async function buildWeekCalendar(now = Date.now()) {
  const today = new Date(now);
  const todayISO = toISODate(today);
  const { from, to } = weekRangeISO(today);

  let sessions = [];
  try {
    sessions = await getSessionsByRange(from, to);
  } catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymHome] getSessionsByRange', e);
    }
    sessions = [];
  }
  // Wave D — date 별 모든 세션의 tag 합집합 (이전: 첫 매치만 사용).
  // sessionId 는 가장 최근 startTime 매치. active 도 별도 조회해 합집합에 포함.
  const byDate = new Map();
  const accumulate = (s) => {
    if (!s?.date) return;
    let entry = byDate.get(s.date);
    if (!entry) {
      entry = { tags: new Set(), sessionId: s.id, latestStart: s.startTime || 0 };
      byDate.set(s.date, entry);
    }
    for (const t of s.tags || []) entry.tags.add(t);
    if ((s.startTime || 0) > entry.latestStart) {
      entry.latestStart = s.startTime || 0;
      entry.sessionId = s.id;
    }
  };
  for (const s of sessions) accumulate(s);
  try {
    const active = await getActiveSession();
    if (active?.date && active.date >= from && active.date <= to) accumulate(active);
  } catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymHome] buildWeekCalendar active', e);
    }
  }

  const cells = [];
  const fromDate = new Date(`${from}T00:00:00`);
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(fromDate);
    d.setDate(fromDate.getDate() + i);
    const iso = toISODate(d);
    const matched = byDate.get(iso);
    const tags = matched ? Array.from(matched.tags) : [];
    const partAbbr = tags.length
      ? tags.map(partAbbreviation).filter(Boolean).join('·')
      : '';
    cells.push({
      wdLabel: WEEK_LABELS_KOR[i],
      num: d.getDate(),
      iso,
      isToday: iso === todayISO,
      part: partAbbr,
      sessionId: matched?.sessionId || null,
    });
  }
  // 직전 운동일(작업지시서 홈) — 이번 주 worked 셀 중 오늘 이전 가장 최근 1개에 옅은 링.
  let prevIdx = -1;
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i].part && cells[i].iso < todayISO) prevIdx = i;
  }
  if (prevIdx >= 0) cells[prevIdx].isPrevWorkout = true;
  return cells;
}

/** #weekCal innerHTML 갱신 (Wave 11.10.2). */
function renderWeekCalendarToDom(cells, doc) {
  const cals = doc.querySelectorAll('.js-week-cal');
  if (!cals.length) return;
  // 구현 레퍼런스 - 홈.html 정합: .cal-day(div) + .cal-label + .cal-num.
  // 운동일=worked(.cal-num::after crail 점), 오늘=today(crail 원), 직전 운동일=last(옅은 링).
  const html = cells.map((c) => {
    const classes = [
      'cal-day',
      c.part ? 'worked' : '',
      c.isToday ? 'today' : '',
      c.isPrevWorkout ? 'last' : '',
      'spa-managed',
    ].filter(Boolean).join(' ');
    return `
      <div class="${classes}" data-day="${isoToWeekdayIdx(c.iso)}" data-iso="${c.iso}">
        <span class="cal-label">${c.wdLabel}</span>
        <span class="cal-num">${c.num}</span>
      </div>
    `;
  }).join('');
  cals.forEach((cal) => { cal.innerHTML = html; });
}

/**
 * §9-1 — 주간 캘린더 셀에 tap/long-press 위임.
 *  - tap: fetchDayDetail(iso) → openDayDetailSheet
 *  - long-press(500ms): confirm step 시트 → deleteSessionByISO + 캘린더 refresh
 * idempotent — attachCalendarTapHandlers 가 dataset.spaTapsHooked 로 가드.
 */
export function wireWeekCalendarTaps(doc) {
  doc = doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { wired: 0 };
  const cal = doc.getElementById('weekCal');
  const tap = typeof window !== 'undefined' ? window.gymDayDetail?.attachCalendarTapHandlers : null;
  if (!cal || typeof tap !== 'function') return { wired: 0 };
  tap(cal, {
    cellSelector: '.cal-day.worked',
    isoExtractor: (el) => el?.dataset?.iso || null,
    onTap: async (iso) => {
      const entry = await fetchDayDetail(iso);
      window.gymDayDetail?.openDayDetailSheet?.(doc, { iso, entry, step: 'summary' });
    },
    onLongPress: (iso) => {
      window.gymDayDetail?.openDayDetailSheet?.(doc, {
        iso,
        step: 'confirm',
        onDelete: async (delIso) => {
          await window.gymStats?.deleteSessionByISO?.(delIso);
          try { await mountHomeView(); } catch (e) { console.error('[gymHome] refresh after delete', e); }
        },
      });
    },
  });
  return { wired: 1 };
}

/**
 * 페이지 헤더 nav 짧은 탭 wiring (home / stats / admin 공통). session.js wireSessionShortcuts 패턴 답습.
 *  - .js-home-stats / .js-nav-stats click → #/stats
 *  - .js-home-manage / .js-nav-manage click → #/admin
 *  - .js-nav-home click → #/home
 * 양 phone wrapper (HomeA idle + HomeC active) + stats/admin 헤더 모두 대응. idempotent (body.dataset.spaHomeShortcuts guard).
 */
export function wireHomeShortcuts(doc) {
  if (!doc) return { wired: 0 };
  if (doc.body?.dataset?.spaHomeShortcuts === '1') return { wired: 0 };

  let wired = 0;

  const bind = (selector, hash) => {
    const btns = doc.querySelectorAll?.(selector) || [];
    btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof window !== 'undefined') window.location.hash = hash;
      });
      wired += 1;
    });
  };

  bind('.js-home-stats', '#/stats');
  bind('.js-home-manage', '#/admin');
  bind('.js-nav-stats', '#/stats');
  bind('.js-nav-manage', '#/admin');
  bind('.js-nav-home', '#/home');

  if (doc.body?.dataset) doc.body.dataset.spaHomeShortcuts = '1';
  return { wired };
}

/** mocks/home.html 진입 시 호출. active 세션 + 주간 캘린더 SPA hijack. */
export async function mountHomeView(now = Date.now()) {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return { skipped: 'no-document' };
  // 커스텀 운동 이름 동기 lookup 캐시 prime — 진행 카드/프리뷰가 cust_* id 대신 이름 표시.
  try { primeCustomExerciseCache(await listCustomExercises()); } catch (_) { /* db 없음 fallback */ }
  // v2 다크 시안 — HomeA(sLabel) 또는 HomeC(cardLabel) 중 하나는 존재해야 마운트 의미.
  if ((!doc.getElementById('sLabel') && !doc.getElementById('cardLabel')) || !doc.getElementById('weekCal')) {
    return { skipped: 'no-mounts' };
  }
  // HomeHeader 통계/관리 click wiring (양 분기 공통, idempotent)
  try { wireHomeShortcuts(doc); } catch (e) { console.error('[gymHome] wireHomeShortcuts', e); }
  let activeApplied = false;
  let streakApplied = false;
  let calendarApplied = false;
  let sessionId = null;
  try {
    const session = await getActiveSession();
    const v = summarizeActiveSession(session, now);
    if (v) {
      applyToDom(v, doc);
      applyNextBlocksToDom(summarizeNextBlocks(session), doc);
      activeApplied = true;
      sessionId = session.id;
    }
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) {
      return { skipped: 'no-db' };
    }
    console.error('[gymHome] mountHomeView active', e);
  }

  // Wave 11.10.3 — active 없으면 streak 표시 (마지막 N일 전 + 이번 주).
  if (!activeApplied) {
    try {
      const today = new Date(now);
      const todayISO = toISODate(today);
      // 60일 전부터 today — N일 전 계산 충분 범위.
      const lookbackFrom = new Date(today);
      lookbackFrom.setDate(today.getDate() - 60);
      const lookbackFromISO = toISODate(lookbackFrom);
      const sessions = await getSessionsByRange(lookbackFromISO, todayISO);
      let weeklyGoal = DEFAULT_WEEKLY_GOAL;
      try {
        const settings = await getUserSettings();
        if (settings && Number.isFinite(settings.weeklyGoal)) weeklyGoal = settings.weeklyGoal;
      } catch (settingsErr) {
        if (!(settingsErr && /window\.gymDB 미초기화/.test(String(settingsErr.message)))) {
          console.error('[gymHome] getUserSettings', settingsErr);
        }
      }
      const streak = summarizeStreak(sessions, now, weeklyGoal);
      applyStreakToDom(streak, doc);
      applyLastWorkoutToDom(streak, doc);
      applyBalanceToDom(summarizeWeeklyBalance(sessions, now), doc);
      streakApplied = true;
      // P5 — 오늘 체중 카드: 직전 체중 표시 + 입력 모달(weightKeypadSheet) wire
      await applyWeightCardToDom(doc);
      try { window.gymWeightKeypad?.wireWeightKeypad?.(doc); } catch (wkErr) { console.error('[gymHome] wireWeightKeypad', wkErr); }
    } catch (e) {
      if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
        console.error('[gymHome] mountHomeView streak', e);
      }
    }
  }

  try {
    const cells = await buildWeekCalendar(now);
    renderWeekCalendarToDom(cells, doc);
    calendarApplied = true;
  } catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymHome] mountHomeView calendar', e);
    }
  }

  try { wireWeekCalendarTaps(doc); } catch (e) { console.error('[gymHome] wireWeekCalendarTaps', e); }
  try { window.gymDayDetail?.wireDayDetailSheet?.(doc); } catch (e) { console.error('[gymHome] wireDayDetailSheet', e); }

  return {
    activeApplied,
    streakApplied,
    calendarApplied,
    sessionId,
  };
}

/**
 * v2 다크 시안 — active session 분기는 HomeC 마크업의 별도 id 사용
 * (HomeA idle 분기와 충돌 회피). 부위/종목/시간/CTA 만 갱신.
 * 볼륨·진행바는 summarizeActiveSession 에 미반환 → mocks 정적값 유지.
 */
function applyToDom(v, doc) {
  const setText = (id, text) => {
    const el = doc.getElementById(id);
    if (el) el.textContent = text;
  };
  // P6 라이트 — 박스 전체가 이어하기 버튼. 운동명·sub·세트 세그먼트·SET N/M·누적 볼륨.
  setText('cardLabel', v.label);
  setText('cardTime', v.num);
  setText('cardUnit', v.unit);
  setText('cardExName', v.exName || '');
  setText('cardSubLine', v.subLine || '');
  setText('cardVol', (v.totalVol ?? 0).toLocaleString());
  setText('cardSetProg', `SET ${(v.curSetIdx ?? 0) + 1} / ${v.setTotal ?? 0}`);
  const seg = doc.getElementById('cardResumeSeg');
  if (seg && Array.isArray(v.sets)) {
    const cur = v.curSetIdx ?? 0;
    seg.innerHTML = v.sets.map((s, i) => {
      const cls = i === cur ? 'now' : (s.done ? 'done' : '');
      const label = i === cur ? `${i + 1}세트` : (s.done && s.reps > 0 ? `${s.weight}·${s.reps}` : '·');
      return `<div class="seg ${cls}"><span class="bar"></span><span class="n">${escapeHtml(label)}</span></div>`;
    }).join('');
  }
  // 박스 전체 click → 세션 이어가기 (별도 CTA 버튼 없음)
  const resume = doc.getElementById('cardResume');
  if (resume && resume.dataset.spaResume !== '1') {
    resume.dataset.spaResume = '1';
    resume.addEventListener('click', goToSession);
  }
  // HomeA / HomeC 가시성 토글 — 같은 id 충돌 회피 + spec §5-5 진행 중 카드 노출
  const homeA = doc.querySelector('.home-a');
  const homeC = doc.querySelector('.home-c');
  if (homeA) homeA.style.display = 'none';
  if (homeC) homeC.style.display = '';
  // mocks 에 #app 없음 → body 에 박아야 home.html CSS [data-state="active"] .home-a hide 룰 매칭
  if (doc.body?.dataset) doc.body.dataset.state = 'active';
}

/** 직전 운동 행(작업지시서 홈) — 부위(맨몸 제외 2개 이상) · 요일 · N일 전. */
function applyLastWorkoutToDom(streak, doc) {
  const row = doc.getElementById('homeLastWorkout');
  if (!row) return;
  if (streak.state === 'empty') {
    row.style.display = 'none';
    return;
  }
  row.style.display = 'flex'; // 인라인 display:flex 복원 ('' 는 flex 를 지워 block 으로 무너짐 — 직전운동 세로 적층 버그)
  const partsEl = doc.getElementById('homeLastParts');
  const metaEl = doc.getElementById('homeLastMeta');
  if (partsEl) partsEl.textContent = streak.lastWorkoutParts || '운동';
  if (metaEl) {
    const meta = [streak.weekdayLabel, streak.sinceLabel].filter(Boolean).join(' · ');
    metaEl.textContent = meta;
  }
}

/**
 * 오늘 체중 카드 갱신 (시안: "직전 73.4kg · ▼0.3"). mountHomeView 와 체중 저장 콜백(weights.saveWeightInput)이 공유.
 * 저장 직후에도 홈 카드가 즉시 최신 체중을 반영하도록 별도 함수로 분리.
 */
async function applyWeightCardToDom(doc) {
  if (!doc) return;
  try {
    const weightsRaw = await listAllWeights();
    const weights = Array.isArray(weightsRaw) ? weightsRaw : [];
    const n = weights.length;
    const latest = n ? weights[n - 1] : null;
    const prevW = n >= 2 ? weights[n - 2] : null;
    const ref = doc.getElementById('homeWeightRef');
    if (!ref) return;
    if (!latest) {
      ref.textContent = '오늘 첫 기록';
      return;
    }
    // 구현 레퍼런스 - 홈.html: "직전 73.4kg <span class="dn">· ▼0.3</span>" (증감은 ink-3)
    let delta = '';
    if (prevW) {
      const d = Math.round((latest.weight - prevW.weight) * 10) / 10;
      if (d !== 0) delta = ` <span class="dn">· ${d < 0 ? '▼' : '▲'}${Math.abs(d)}</span>`;
    }
    ref.innerHTML = `직전 ${escapeHtml(String(latest.weight))}kg${delta}`;
  } catch (wErr) {
    if (!(wErr && /window\.gymDB 미초기화/.test(String(wErr.message)))) console.error('[gymHome] weight card', wErr);
  }
}

/**
 * 부위 밸런스 위젯(작업지시서 홈 주역) — 구현 레퍼런스 - 홈.html 정합.
 * #homeBalSummary(헤드라인+칩) · #homeBalRows(6부위 페어 컬럼) · #homeBalLabels(부위명) · #homeCardioRow(유산소).
 */
function applyBalanceToDom(balance, doc) {
  const rowsEl = doc.getElementById('homeBalRows');
  if (!rowsEl || !balance) return;
  const parts = Array.isArray(balance.parts) ? balance.parts : [];
  const focusKey = balance.focusKey;
  const thisTotal = parts.reduce((s, p) => s + (Number(p.sets) || 0), 0);
  const prevTotal = parts.reduce((s, p) => s + (Number(p.prevSets) || 0), 0);
  const delta = thisTotal - prevTotal;
  const rmr = prefersReducedMotionHome();

  // 요약 행 — 헤드라인(총 세트) + ▲개선(sage, delta>0) + 최소부위 델타(crail) 칩 (작업지시서 §4.1)
  const summaryEl = doc.getElementById('homeBalSummary');
  if (summaryEl) {
    const focus = parts.find((p) => p.key === focusKey) || null;
    const upChip = delta > 0 ? `<span class="bal-chip up">▲ ${delta}</span>` : '';
    let focusChip = '';
    if (focus) {
      const fd = (Number(focus.sets) || 0) - (Number(focus.prevSets) || 0);
      const fdStr = fd > 0 ? `+${fd}` : String(fd); // 시안 "코어 -3" = 이번주−지난주 (§4.1)
      focusChip = `<span class="bal-chip focus"><i class="dot"></i>${escapeHtml(focus.name)} ${fdStr}</span>`;
    }
    // 카운트업 시작값(prevTotal)으로 선-paint (RM 은 최종값) — animNum 첫 tick 역방향 점프 방지.
    summaryEl.innerHTML =
      `<span class="bal-hl"><span id="homeBalHlNum" class="bal-hl-num">${rmr ? thisTotal : prevTotal}</span>`
      + `<span class="bal-hl-unit kr">세트</span></span>${upChip}${focusChip}`;
  }

  // 차트 — 6부위 페어 컬럼: [지난주 고스트 12px] + [이번주 잉크 15px] (작업지시서 §4.1).
  //   기본 7px/세트(§4.1: 6세트=42px, 14세트=98px). 단 최고 세트수 막대는 MAX_BAR_PX 로 캡 —
  //   실기기 짧은 화면에서 고세트(예: 31세트=217px) 막대가 헤드라인과 겹치던 버그 수정 (사용자 2026-07-07).
  //   시안 최대(14세트=98px) 밀도를 유지하도록 100px 캡: maxVal≤14 는 7px/세트 정확 유지, 초과분만 비례 축소.
  const MAX_BAR_PX = 100;
  const maxVal = Math.max(1, ...parts.map((p) => Math.max(Number(p.sets) || 0, Number(p.prevSets) || 0)));
  const pxPerSet = Math.min(7, MAX_BAR_PX / maxVal);
  rowsEl.innerHTML = parts.map((p, i) => {
    const isFocus = p.key === focusKey;
    const sets = Number(p.sets) || 0;
    const prev = Number(p.prevSets) || 0;
    const inkH = Math.round(sets * pxPerSet);
    const ghostH = Math.round(prev * pxPerSet);
    // 이번주 막대 진입 웨이브 — 60ms 스태거 grow. 최소부위는 상시 경고펄스라 grow 제외 (시안 #7a 정합).
    const inkAnim = (!isFocus && !rmr) ? `animation:gGrow 520ms cubic-bezier(.2,.7,.2,1) ${i * 60}ms both;` : '';
    const ghost = prev > 0 ? `<i class="bal-bar-ghost" style="height:${ghostH}px;"></i>` : '';
    return `<div class="bal-grp${isFocus ? ' focus' : ''}">`
      + `<span class="bal-grp-val mono">${sets}</span>`
      + `<span class="bal-bars">${ghost}<i class="bal-bar-ink" style="height:${inkH}px;${inkAnim}"></i></span>`
      + `</div>`;
  }).join('');

  const labelsEl = doc.getElementById('homeBalLabels');
  if (labelsEl) {
    labelsEl.innerHTML = parts.map((p) =>
      `<span class="kr${p.key === focusKey ? ' focus' : ''}">${escapeHtml(p.name)}</span>`,
    ).join('');
  }

  // 헤드라인 카운트업 45→48 + 랜딩 팝 (홈 진입 1회, 작업지시서 §4.2). RM 은 즉시 최종값(위에서 선-paint).
  const numEl = doc.getElementById('homeBalHlNum');
  if (numEl && !rmr) {
    animNumHome(prevTotal, thisTotal, 620, (v, isFinal) => {
      numEl.textContent = String(isFinal ? thisTotal : Math.round(v));
      if (isFinal && typeof numEl.animate === 'function') {
        try {
          numEl.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: 0.45 }, { transform: 'scale(1)' }],
            { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1.2)' },
          );
        } catch (_) { /* WAAPI 미지원 graceful */ }
      }
    });
  }

  const cardioEl = doc.getElementById('homeCardioRow');
  if (!cardioEl) return;
  const c = balance.cardio || { min: 0, count: 0, deltaMin: 0 };
  const cardioIcon = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2 10h3l1.5-4.5 2.8 9 1.7-4.5H18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const sub = c.count > 0 ? `${c.min > 0 ? `${c.min}분 · ` : ''}${c.count}회` : '기록 없음';
  const dm = Number(c.deltaMin) || 0;
  const deltaHtml = (c.count > 0 && dm !== 0)
    ? `<span class="dl kr">${dm > 0 ? '▲' : '▼'}${Math.abs(dm)}분</span>`
    : '';
  cardioEl.innerHTML = `<span class="ic">${cardioIcon}</span><span class="nm kr">유산소</span><span class="sub mono">${escapeHtml(sub)}</span>${deltaHtml}`;
  cardioEl.style.display = 'flex';
}

/** Wave 11.10.3 — streak DOM 갱신. Wave 11.10.4 — CTA click → #/session. */
function applyStreakToDom(streak, doc) {
  const setText = (id, text) => {
    const el = doc.getElementById(id);
    if (el) el.textContent = text;
  };
  setText('ctaBtn', streak.state === 'empty' ? '첫 운동 시작' : '운동 시작');
  // Wave 11.10.4 — '운동 시작' / '첫 운동 시작' click → #/session.
  // session 화면 진입 후 사용자가 종목 클릭 시 addExerciseToActiveSession 가 active session 자동 생성 (spec §6-1).
  const cta = doc.getElementById('ctaBtn');
  if (cta) {
    cta.dataset.spaCta = '1';
    cta.addEventListener('click', goToSession, { once: true });
  }
  // HomeA(idle) 노출 복원 — 직전 active 마운트(applyToDom)가 같은 DOM 에서 home-a 를
  // 인라인 display:none 처리했을 수 있어, idle 재마운트 때 복원 안 하면 home-a(인라인 none)+home-c(CSS idle none)
  // 동시 숨김 → 홈 백지. applyToDom 와 대칭으로 토글 복원해 mountHomeView 를 멱등화.
  const homeA = doc.querySelector('.home-a');
  const homeC = doc.querySelector('.home-c');
  if (homeA) homeA.style.display = '';
  if (homeC) homeC.style.display = 'none';
  // streak.state ('empty'|'gap'|'rest'|'active') 는 home.html CSS rule (active|idle) 과 다른 도메인.
  // idle 카드 (HomeA) 노출을 위해 body 에 'idle' 정규화. mocks 에 #app 없음.
  if (doc.body?.dataset) doc.body.dataset.state = 'idle';
}

/**
 * mid-session 홈 "다음" 영역 hydrate. items 가 비면 section 숨김.
 * exerciseName 은 user-controlled (custom exercise) — escape 필수.
 */
function applyNextBlocksToDom(items, doc) {
  const section = doc.getElementById('nextBlocksSection');
  const list = doc.getElementById('nextBlocksList');
  if (!section || !list) return;
  if (!items || !items.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  list.innerHTML = items.map(({ name, summary }) => `
    <div data-next-block style="display:flex;justify-content:space-between;align-items:baseline;">
      <div class="kr" style="font-size:15px;color:#fff;font-weight:500;">${escapeHtml(name)}</div>
      <div class="num" style="font-size:14px;color:rgba(243,239,230,0.55);">${escapeHtml(summary)}</div>
    </div>
  `).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/** 부위 밸런스 진입 모션 게이트 (작업지시서 §8). */
function prefersReducedMotionHome() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 헤드라인 카운트업 (작업지시서 §4.2) — from→to ease-out-cubic. rAF + setTimeout 폴백. */
function animNumHome(from, to, dur, onUpd) {
  if (typeof requestAnimationFrame !== 'function' || typeof performance === 'undefined') { onUpd(to, true); return; }
  const t0 = performance.now();
  let done = false;
  const tick = (now) => {
    if (done) return;
    const p = Math.min(1, (now - t0) / dur);
    if (p < 1) { const e = 1 - Math.pow(1 - p, 3); onUpd(from + (to - from) * e, false); requestAnimationFrame(tick); }
    else { done = true; onUpd(to, true); }
  };
  requestAnimationFrame(tick);
  setTimeout(() => { if (!done) { done = true; onUpd(to, true); } }, dur + 90);
}

function goToSession() {
  if (typeof window !== 'undefined') {
    window.location.hash = '#/session';
  }
}

/**
 * Wave D — 홈 day-sheet 용 실 데이터 fetch.
 * 입력 ISO 의 sessions(completed) 중 startTime 가장 늦은 1건 → window.gymStats.sessionToWorkoutEntry 변환.
 * stats 화면과 동일 source · 동일 변환으로 두 sheet 일관성 보장.
 * 결과 없음(매치 0 건 또는 어댑터 미노출)이면 null — 호출처 fallback (정적 박힘).
 */
export async function fetchDayDetail(iso) {
  let sessions = [];
  try { sessions = await getSessionsByRange(iso, iso); }
  catch (e) {
    if (!(e && /window\.gymDB 미초기화/.test(String(e.message)))) {
      console.error('[gymHome] fetchDayDetail', e);
    }
    return null;
  }
  if (!sessions.length) return null;
  sessions.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
  const adapter = (typeof window !== 'undefined' && window.gymStats?.sessionToWorkoutEntry) || null;
  const merger = (typeof window !== 'undefined' && window.gymStats?.mergeWorkoutEntries) || null;
  if (!adapter) return null;
  const entries = sessions.map(adapter).filter(Boolean);
  if (!entries.length) return null;
  if (!merger || entries.length === 1) return entries[entries.length - 1];
  return merger(entries);
}

if (typeof window !== 'undefined') {
  window.gymHome = {
    summarizeActiveSession,
    summarizeNextBlocks,
    summarizeStreak,
    summarizeWeeklyBalance,
    categorizeBalancePart,
    mountHomeView,
    refreshWeightCard: applyWeightCardToDom,
    buildWeekCalendar,
    fetchDayDetail,
    partAbbreviation,
    wireHomeShortcuts,
    wireWeekCalendarTaps,
  };
}
