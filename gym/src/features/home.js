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
  weekRangeISO,
  isoToWeekdayIdx,
  toISODate,
} from '../db/queries.js';
import { PARTS } from '../db/exercises.js';

const WEEK_LABELS_KOR = ['월', '화', '수', '목', '금', '토', '일']; // 월 시작 (isoToWeekdayIdx 와 정합)

/** 부위 영문 → 단일 글자 한국어 약어 (spec §5-2). 누락 → '기타'. */
export function partAbbreviation(tag) {
  switch (tag) {
    case 'chest': return '가';
    case 'back': return '등';
    case 'shoulder': return '어';
    case 'legs': return '하';
    case 'arms': return '팔';
    case 'cardio': return '유';
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

  return {
    label: '진행 중',
    num,
    unit: '경과',
    part,
    sub: `${completedExercises} / ${totalExercises} 종목`,
    cta: '이어가기',
    sessionNumSize: 40,
  };
}

/**
 * spec §5-3 — 마지막 completed 세션 + 이번 주/달 count → streak 정보.
 *
 * 입력: completed sessions 배열 (date desc 무관, summarizeStreak 가 정렬), now epoch ms.
 * 반환:
 *   { state: 'empty'|'active'|'gap'|'rest',
 *     label, num, unit, part, sub,
 *     clawd: { id, anim, size } }
 *
 * Clawd 매핑 (spec §5-3):
 *   - 1~2일 (오늘 0일 포함): c-happy / a-bounce / tall
 *   - 3~4일: c-idle / a-bob / short
 *   - 5일+: c-rest / a-slowbob / short
 *   - 세션 0: c-idle / a-bob / short (empty 라벨)
 */
export function summarizeStreak(sessions, now = Date.now()) {
  const today = new Date(now);
  const todayISO = toISODate(today);
  const list = Array.isArray(sessions) ? sessions.slice() : [];
  if (!list.length) {
    return {
      state: 'empty',
      label: '이번 달',
      num: '0',
      unit: '회',
      part: '',
      sub: '가볍게 시작해 보세요',
      clawd: { id: 'c-idle', anim: 'a-bob', size: 'short' },
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
  const monthFromISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const monthCount = list.filter((s) => s.date >= monthFromISO && s.date <= todayISO).length;

  const tags = Array.isArray(last.tags) ? last.tags : [];
  const part = tags.map((t) => PARTS[t] || t).join(' · ');

  let state, clawd;
  if (daysSince <= 2) {
    state = 'active';
    clawd = { id: 'c-happy', anim: 'a-bounce', size: 'tall' };
  } else if (daysSince <= 4) {
    state = 'gap';
    clawd = { id: 'c-idle', anim: 'a-bob', size: 'short' };
  } else {
    state = 'rest';
    clawd = { id: 'c-rest', anim: 'a-slowbob', size: 'short' };
  }

  return {
    state,
    label: '마지막 운동',
    num: daysSince === 0 ? '오늘' : String(daysSince),
    unit: daysSince === 0 ? '' : '일 전',
    part,
    sub: `이번 주 ${weekCount}회 · 이번 달 ${monthCount}회`,
    clawd,
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
  return cells;
}

/** #weekCal innerHTML 갱신 (Wave 11.10.2). */
function renderWeekCalendarToDom(cells, doc) {
  const cal = doc.getElementById('weekCal');
  if (!cal) return;
  const html = cells.map((c) => {
    const classes = [
      'cal-day',
      c.part ? 'worked' : '',
      c.isToday ? 'today' : '',
      'spa-managed',
    ].filter(Boolean).join(' ');
    const partHtml = c.part ? c.part : '&nbsp;';
    return `
      <button class="${classes}" type="button" data-day="${isoToWeekdayIdx(c.iso)}" data-iso="${c.iso}">
        <span class="cal-label">${c.wdLabel}</span>
        <span class="cal-num">${c.num}</span>
        <span class="cal-part">${partHtml}</span>
      </button>
    `;
  }).join('');
  cal.innerHTML = html;
}

/** mocks/home.html 진입 시 호출. active 세션 + 주간 캘린더 SPA hijack. */
export async function mountHomeView(now = Date.now()) {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return { skipped: 'no-document' };
  if (!doc.getElementById('sLabel') || !doc.getElementById('weekCal')) {
    return { skipped: 'no-mounts' };
  }
  let activeApplied = false;
  let streakApplied = false;
  let calendarApplied = false;
  let sessionId = null;
  try {
    const session = await getActiveSession();
    const v = summarizeActiveSession(session, now);
    if (v) {
      applyToDom(v, doc);
      activeApplied = true;
      sessionId = session.id;
    }
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) {
      return { skipped: 'no-db' };
    }
    console.error('[gymHome] mountHomeView active', e);
  }

  // Wave 11.10.3 — active 없으면 streak 표시 (마지막 N일 전 + 주/월 + Clawd).
  if (!activeApplied) {
    try {
      const today = new Date(now);
      const monthFromISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      const todayISO = toISODate(today);
      // 60일 전부터 today — 월 카운트 + N일 전 계산 충분 범위.
      const lookbackFrom = new Date(today);
      lookbackFrom.setDate(today.getDate() - 60);
      const lookbackFromISO = toISODate(lookbackFrom);
      const sessions = await getSessionsByRange(lookbackFromISO, todayISO);
      // monthFromISO 활용 X — summarizeStreak 자체 계산
      void monthFromISO;
      const streak = summarizeStreak(sessions, now);
      applyStreakToDom(streak, doc);
      streakApplied = true;
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

  return {
    activeApplied,
    streakApplied,
    calendarApplied,
    sessionId,
  };
}

function applyToDom(v, doc) {
  const setText = (id, text) => {
    const el = doc.getElementById(id);
    if (el) el.textContent = text;
  };
  setText('sLabel', v.label);
  const sNum = doc.getElementById('sNum');
  if (sNum) {
    sNum.textContent = v.num;
    sNum.style.fontSize = v.sessionNumSize ? `${v.sessionNumSize}px` : '';
  }
  setText('sUnit', v.unit);
  const sPart = doc.getElementById('sPart');
  if (sPart) {
    sPart.textContent = v.part;
    sPart.style.display = v.part ? '' : 'none';
  }
  setText('sSub', v.sub);
  setText('ctaBtn', v.cta);
  const cta = doc.getElementById('ctaBtn');
  if (cta) {
    cta.dataset.spaCta = '1';
    cta.addEventListener('click', goToSession, { once: true });
  }
  const app = doc.getElementById('app');
  if (app) app.dataset.state = 'session';
}

/** Wave 11.10.3 — streak DOM 갱신 + Clawd 렌더링. Wave 11.10.4 — CTA click → #/session. */
function applyStreakToDom(streak, doc) {
  const setText = (id, text) => {
    const el = doc.getElementById(id);
    if (el) el.textContent = text;
  };
  setText('sLabel', streak.label);
  const sNum = doc.getElementById('sNum');
  if (sNum) {
    sNum.textContent = streak.num;
    sNum.style.fontSize = ''; // session 카드의 40px override 해제
  }
  setText('sUnit', streak.unit);
  const sPart = doc.getElementById('sPart');
  if (sPart) {
    sPart.textContent = streak.part;
    sPart.style.display = streak.part ? '' : 'none';
  }
  setText('sSub', streak.sub);
  setText('ctaBtn', streak.state === 'empty' ? '첫 운동 시작' : '운동 시작');
  // Clawd
  const wrap = doc.getElementById('clawdAnim');
  if (wrap) wrap.className = `clawd-anim ${streak.clawd.anim}`;
  const svg = doc.getElementById('clawdSvg');
  if (svg) {
    svg.setAttribute('class', `clawd ${streak.clawd.size === 'tall' ? 'clawd-tall' : 'clawd-short'}`);
    svg.innerHTML = `<use href="#${streak.clawd.id}"/>`;
  }
  // Wave 11.10.4 — '운동 시작' / '첫 운동 시작' click → #/session.
  // session 화면 진입 후 사용자가 종목 클릭 시 addExerciseToActiveSession 가 active session 자동 생성 (spec §6-1).
  const cta = doc.getElementById('ctaBtn');
  if (cta) {
    cta.dataset.spaCta = '1';
    cta.addEventListener('click', goToSession, { once: true });
  }
  const app = doc.getElementById('app');
  if (app) app.dataset.state = streak.state;
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
  const latest = sessions[sessions.length - 1];
  const adapter = (typeof window !== 'undefined' && window.gymStats?.sessionToWorkoutEntry) || null;
  if (!adapter) return null;
  return adapter(latest);
}

if (typeof window !== 'undefined') {
  window.gymHome = {
    summarizeActiveSession,
    summarizeStreak,
    mountHomeView,
    buildWeekCalendar,
    fetchDayDetail,
    partAbbreviation,
  };
}
