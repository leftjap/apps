/* Home page — HomeV2 phone/tablet/desktop 3 사이즈
 * 정본: ~/Downloads/_ _ _/variants/home-v2.jsx
 *
 * 본 wave 데이터 매핑 (plan §):
 *   newCount     = computeHomeStats().todayLessonsRemaining
 *   reviewCount  = computeHomeStats().reviewDueCount
 *   streak       = computeHomeStats().streak
 *   tried/passed = 오늘 sessionLogs 합산
 *   sidebar 보조 = PR meta (prDailyStudyTime / prWeeklyUtterance 가장 최근)
 *   메타 줄      = 이번 주 N 시도 · M 통과 (ISO week 월요일 시작)
 *
 * 비즈 함수 출처: 이전 mocks/home.html L476-630 + L698-739
 * lang 토글 = 본 wave stub (active class + console.warn)
 */

import { pickSize, watchSize } from '../components/session/index.js';
import { loadActiveSession } from '../services/activeSession.js';
import { h } from '../components/d1/dom.js';
import { d1Icon } from '../components/d1/icons.js';
import { renderHomeDesktopV2, renderHomeMobileV2 } from './homeDesktopV2.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function isDemoMode() {
  if (typeof window === 'undefined') return false;
  if (window.studyDemo === true) return true;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('demo') === '1') return true;
  } catch { /* noop */ }
  return false;
}

function demoPhase() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const p = sp.get('phase');
    if (p === 'fresh' || p === 'mid' || p === 'done') return p;
  } catch { /* noop */ }
  return 'fresh';
}

// C 파이널 v2 데스크톱 3상태 데모 — 시안(작업지시서 §1) 카피·수치 재현 (검증용).
const DEMO_COMMON = {
  todayISO: '2026-06-12', lang: 'en', speechTarget: 30,
  sessionTitle: '레슬리의 다짐',
  pronBars: [62, 66, 64, 68, 70, 72, 74, 76, 80, 82, 84, 86, 88, 90],
  cumMaster: 89,
};
const DEMO_BY_PHASE = {
  fresh: {
    ...DEMO_COMMON, phase: 'fresh',
    newCount: 5, reviewCount: 2, totalReview: 89, streak: 12, bestStreak: 14,
    tried: 0, passed: 0, weekUtter: 0, weekPass: 0, todayNewDone: 0, todayReviewDone: 0,
    newMin: 15, reviewMin: 4, newMetaText: '전체 대화 8줄 듣기 → 표현 5개',
    reviewPreview: '"Count on it." 외 1문장',
    slimHtml: '어제: 시도 14 · 통과 9 — 통과율 <b>64%</b>로 이번 주 최고였어요',
    pronAvg: 86, pronDelta: 4, cumExpr: 127, cumUtter: 1240,
    grass: ['f', 'f', 'ff', 'f', 't', '', ''], weekDoneText: '4일 완료 · 오늘 진행 중',
  },
  mid: {
    ...DEMO_COMMON, phase: 'mid',
    newCount: 4, reviewCount: 2, totalReview: 89, streak: 12, bestStreak: 14,
    tried: 18, passed: 11, weekUtter: 14, weekPass: 9, todayNewDone: 1, todayReviewDone: 0,
    resume: 'new', newMin: 12, reviewMin: 4,
    reviewPreview: '"Count on it." 외 1문장',
    slimHtml: '어제: 시도 14 · 통과 9 — 통과율 <b>64%</b>로 이번 주 최고였어요',
    pronAvg: 86, pronDelta: 4, cumExpr: 127, cumUtter: 1240,
    grass: ['f', 'f', 'ff', 'f', 't', '', ''], weekDoneText: '4일 완료 · 오늘 진행 중',
  },
  done: {
    ...DEMO_COMMON, phase: 'done',
    newCount: 0, reviewCount: 0, totalReview: 89, streak: 13, bestStreak: 14,
    tried: 32, passed: 23, weekUtter: 122, weekPass: 84, todayNewDone: 5, todayReviewDone: 2,
    reviewMin: 4,
    doneNewMeta: '표현 5개 평균 88점 · 발화 19회 · 오후 9:02',
    doneReviewMeta: '"Count on it." 외 1문장 · 다음 복습 6월 15일',
    slimHtml: "내일 미리보기: 새 장면 <b class=\"c\">'회의실의 침묵'</b> · 표현 5개가 준비돼 있어요",
    pronAvg: 88, pronDelta: 6, cumExpr: 132, cumUtter: 1272,
    grass: ['f', 'f', 'ff', 'f', 'tg', '', ''], weekDoneText: '5일 연속 완료',
  },
};

export function mountHome(host) {
  const demo = isDemoMode();
  const fx = demo ? DEMO_BY_PHASE[demoPhase()] : null;
  const state = {
    size: pickSize(),
    lang: fx ? fx.lang : getStoredLang(),
    newCount: 0,
    reviewCount: 0,
    totalReview: 0,
    streak: 0,
    tried: 0,
    passed: 0,
    bestStreak: null,
    weekUtter: 0,
    weekPass: 0,
    todayNewDone: 0,
    todayReviewDone: 0,
    todayISO: window.studyDay?.TODAY_ISO || new Date().toISOString().slice(0, 10),
    resume: null, // 'new' | 'review' | null — activeSession 매치 시
    sessionTitle: '', // #5 — AI 생성 세션 타이틀(scene/skit). 첫 미완료 카드 explanation 에서 산출.
  };
  if (fx) Object.assign(state, fx);

  let cleanup = render(host, state);
  const rerender = () => { cleanup(); cleanup = render(host, state); };
  const stop = watchSize((s) => {
    if (s !== state.size) { state.size = s; rerender(); }
  });

  const refreshStats = () => {
    if (demo) return;
    loadStats(state).then((updated) => {
      if (updated) { Object.assign(state, updated); rerender(); }
    }).catch((e) => console.error('[home] loadStats', e));
  };

  state.onLangChange = (newLang) => {
    if (newLang !== 'en' && newLang !== 'ja' && newLang !== 'math') return;
    if (newLang === state.lang) return;
    try { sessionStorage.setItem('studyLang', newLang); } catch { /* noop */ }
    state.lang = newLang;
    state.newCount = 0; state.reviewCount = 0; state.totalReview = 0;
    state.tried = 0; state.passed = 0;
    state.weekUtter = 0; state.weekPass = 0;
    state.todayNewDone = 0; state.todayReviewDone = 0;
    state.sessionTitle = '';
    // 데스크톱 v2 하단 스트립 확장 필드 — 언어별 loadStats 가 다시 채우기 전 stale 표시 방지.
    state.pronBars = []; state.grass = null; state.cumExpr = 0; state.cumUtter = 0;
    state.cumMaster = 0; state.weekDoneText = ''; state.pronAvg = 0; state.pronDelta = 0;
    state.stripLeftLabel = undefined; state.stripLeftHead = undefined; state.stripLeftUnit = undefined;
    rerender();
    refreshStats();
  };

  refreshStats();

  // sync 완료 후 한 번 더 갱신 (mount 시점에 sync 진행 중이었던 경우)
  if (typeof window !== 'undefined' && window.__syncReady) {
    window.__syncReady
      .then(() => refreshStats())
      .catch(() => {});
  }

  // Wave A.9.2.b — 진행 중 세션 표시 (홈 sessionCard 라벨 변경)
  if (!demo) {
    loadActiveSession(window.studyDB).then((snapshot) => {
      if (snapshot?.mode === 'new' || snapshot?.mode === 'review') {
        state.resume = snapshot.mode;
        rerender();
      }
    }).catch((e) => console.error('[home] loadActiveSession', e));
  }

  return () => { cleanup(); stop(); };
}

function getStoredLang() {
  try { const v = sessionStorage.getItem('studyLang'); return (v === 'ja' || v === 'math') ? v : 'en'; }
  catch { return 'en'; }
}

// 수학 모드 카운트 — 문제 목록(번들 정본, session-math 와 동일) + 진행상태(localStorage mathProgress).
async function loadMathStats(state) {
  const today = state.todayISO;
  let items = [], nextGroup = null;
  try { const m = await import('../data/math/index.js'); items = [...(m.MATH_CONTENT || [])]; nextGroup = m.nextNewGroup; } catch { /* noop */ }
  const db = window.studyDB; // 하이브리드: 번들 + 루틴 생성 일일 응용(Dexie) 병합
  if (db?.mathProblems) {
    try {
      const rows = await db.mathProblems.toArray();
      const ids = new Set(items.map((c) => c.id));
      items.push(...rows.filter((r) => !ids.has(r.id)).map((r) => ({ ...r, kind: r.kind || 'apply' })));
    } catch { /* 번들만 */ }
  }
  let prog = { done: {}, srs: {}, logs: {} };
  try { prog = JSON.parse(localStorage.getItem('mathProgress')) || prog; } catch { /* noop */ }
  const freshRemaining = items.filter((c) => !prog.done?.[c.id] && !prog.srs?.[c.id]).length;
  // 실제 NEW 세션 = nextNewGroup(개념 1 + 그 응용들). 카운트도 그것과 일치(시드 응용 포함).
  const newCount = nextGroup ? nextGroup(items, prog).length : Math.min(freshRemaining, 3);
  const reviewCount = items.filter((c) => prog.srs?.[c.id] && prog.srs[c.id].nextReview <= today).length;
  const totalReview = Object.keys(prog.srs || {}).length;
  // 일별 로그 → streak·오늘 통계 (en/ja 와 동일 stat 영역을 math 데이터로 채움)
  const logs = prog.logs || {};
  const todayLog = logs[today] || { tried: 0, passed: 0, newDone: 0, reviewDone: 0 };
  const dates = Object.keys(logs).filter((d) => (logs[d]?.tried || 0) > 0).sort().reverse();
  let streak = 0;
  let cursor = today;
  if (!dates.includes(cursor)) {
    const c = new Date(cursor + 'T00:00:00Z'); c.setUTCDate(c.getUTCDate() - 1);
    cursor = c.toISOString().slice(0, 10);
  }
  for (const d of dates) {
    if (d === cursor) {
      streak += 1;
      const c = new Date(cursor + 'T00:00:00Z'); c.setUTCDate(c.getUTCDate() - 1);
      cursor = c.toISOString().slice(0, 10);
    } else if (d < cursor) break;
  }
  // ── 데스크톱 v2 하단 스트립 (수학) — 발화 대신 '문제' 추이 ──
  const mByDate = {};
  for (const dk in logs) mByDate[dk] = logs[dk]?.tried || 0;
  const mPronBars = [];
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(today + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() - i);
    mPronBars.push(mByDate[dt.toISOString().slice(0, 10)] || 0);
  }
  const mMonday = (iso) => { const d = new Date(iso + 'T00:00:00Z'); const w = d.getUTCDay(); d.setUTCDate(d.getUTCDate() + (w === 0 ? -6 : 1 - w)); return d.toISOString().slice(0, 10); };
  const mWeekStart = mMonday(today);
  const mGrass = []; let mWeekDays = 0, mWeekTried = 0, mWeekPassed = 0;
  for (let i = 0; i < 7; i++) {
    const dt = new Date(mWeekStart + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + i);
    const iso = dt.toISOString().slice(0, 10);
    const t = mByDate[iso] || 0;
    if (t > 0 && iso <= today) { mWeekDays++; mWeekTried += t; mWeekPassed += (logs[iso]?.passed || 0); }
    mGrass.push(iso === today ? (t > 0 ? 'tg' : 't') : iso > today ? '' : t > 0 ? 'f' : '');
  }
  const mCumUtter = Object.values(logs).reduce((s, l) => s + (l.tried || 0), 0);
  const mCumExpr = Object.values(logs).reduce((s, l) => s + (l.newDone || 0), 0);
  return {
    newCount, reviewCount, totalReview, streak,
    tried: todayLog.tried, passed: todayLog.passed,
    todayNewDone: todayLog.newDone, todayReviewDone: todayLog.reviewDone,
    bestStreak: null, weekUtter: mWeekTried, weekPass: mWeekPassed, sessionTitle: '',
    pronBars: mPronBars, grass: mGrass, cumUtter: mCumUtter, cumExpr: mCumExpr, cumMaster: totalReview,
    weekDoneText: todayLog.tried > 0 ? `${mWeekDays}일 학습 · 오늘 진행 중` : `${mWeekDays}일 학습`,
    pronAvg: mWeekTried, pronDelta: 0,
    stripLeftLabel: '일일 문제 · 14일', stripLeftHead: '이번 주 문제', stripLeftUnit: '문제',
  };
}

async function loadStats(state) {
  if (state.lang === 'math') return loadMathStats(state);
  const db = window.studyDB;
  if (!db) return null;
  try {
    const lang = state.lang;
    const todayISO = state.todayISO;
    const allLang = await db.reviewQueue.where('lang').equals(lang).toArray();
    const reviewCount = allLang.filter((c) => !c.nextReview || c.nextReview <= todayISO).length;
    const totalReview = allLang.length;
    const langLessons = await db.todayLessons.where('lang').equals(lang).toArray();
    // carry-forward: 미완료 신규는 date 무관 전부 카운트 (cardLoader.loadNewCards 와 동일 정책).
    const incomplete = langLessons.filter((l) => l.completed !== true);
    const newCount = incomplete.length;
    // #5 — AI 생성 세션 타이틀: 곧 시작할 첫 카드(loadNewCards 정렬 동일: date ASC → order_index ASC)의
    // scene/skit 타이틀. 콩트/장면 제목을 home hero 에 노출 (없으면 '' → 기본 카피 fallback).
    const firstNew = incomplete.slice().sort((a, b) => {
      const da = a.date || '', db_ = b.date || '';
      if (da !== db_) return da < db_ ? -1 : 1;
      return (a.order_index ?? 0) - (b.order_index ?? 0);
    })[0];
    const firstEx = firstNew?.explanation || {};
    const sessionTitle = firstEx.sceneTitle || firstEx.scene_title || firstEx.skitTitle || '';

    const logs = await db.sessionLogs.where('lang').equals(lang).toArray();
    const dates = [...new Set(logs.map((l) => l.date))].sort().reverse();
    let streak = 0, cursor = todayISO;
    if (!dates.includes(cursor)) {
      const c = new Date(cursor + 'T00:00:00Z'); c.setUTCDate(c.getUTCDate() - 1);
      cursor = c.toISOString().slice(0, 10);
    }
    for (const d of dates) {
      if (d === cursor) {
        streak++;
        const c = new Date(cursor + 'T00:00:00Z'); c.setUTCDate(c.getUTCDate() - 1);
        cursor = c.toISOString().slice(0, 10);
      } else if (d < cursor) break;
    }

    const todayLogs = logs.filter((l) => l.date === todayISO);
    const tried = todayLogs.reduce((s, l) => s + (Number(l.utteranceCount) || 0), 0);
    const passed = todayLogs.reduce((s, l) => s + (Number(l.passCount) || 0), 0);
    // 오늘 완료한 신규/복습 문장 수. mergeDailyStats(sessionFinish.js) 와 동일 패턴 — lang 분리 위해 sessionLogs 직접 집계.
    const todayNewDone = todayLogs.reduce((s, l) => s + (l.mode === 'new' ? (l.newSentenceIds?.length || 0) : 0), 0);
    const todayReviewDone = todayLogs.reduce((s, l) => s + ((l.mode === 'review' || l.mode === 'free') ? (Number(l.completedReviewCount) || 0) : 0), 0);

    const monday = (iso) => {
      const d = new Date(iso + 'T00:00:00Z');
      const day = d.getUTCDay();
      d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
      return d.toISOString().slice(0, 10);
    };
    const weekStart = monday(todayISO);
    const weekEndD = new Date(weekStart + 'T00:00:00Z'); weekEndD.setUTCDate(weekEndD.getUTCDate() + 6);
    const weekEnd = weekEndD.toISOString().slice(0, 10);
    const weekLogs = logs.filter((l) => l.date >= weekStart && l.date <= weekEnd);
    const weekUtter = weekLogs.reduce((s, l) => s + (Number(l.utteranceCount) || 0), 0);
    const weekPass = weekLogs.reduce((s, l) => s + (Number(l.passCount) || 0), 0);

    let bestStreak = null;
    try {
      const got = await db.meta.bulkGet(['prDailyStudyTime', 'prWeeklyUtterance', 'prDailyUtterance', 'prWeeklyPass']);
      const cands = [];
      got.forEach((v) => {
        if (v?.value) cands.push({ value: v.value, date: v.value.achieved_at || v.value.week_start });
      });
      cands.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      if (cands[0]?.value?.value != null) bestStreak = cands[0].value.value;
    } catch { /* meta 미존재 ok */ }

    // ── C 파이널 v2 데스크톱 하단 스트립 (실데이터) ──
    // 발음 점수 일별 시계열은 미저장(sessionLogs=발화/통과만) → 앱이 실제 추적하는 '일일 발화' 추이로 정직 표기.
    const byDate = {};
    for (const l of logs) byDate[l.date] = (byDate[l.date] || 0) + (Number(l.utteranceCount) || 0);
    const pronBars = [];
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(todayISO + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() - i);
      pronBars.push(byDate[dt.toISOString().slice(0, 10)] || 0);
    }
    const grass = [];
    let weekDays = 0;
    for (let i = 0; i < 7; i++) {
      const dt = new Date(weekStart + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + i);
      const iso = dt.toISOString().slice(0, 10);
      const has = (byDate[iso] || 0) > 0;
      if (has && iso <= todayISO) weekDays++;
      grass.push(iso === todayISO ? (has ? 'tg' : 't') : iso > todayISO ? '' : has ? 'f' : '');
    }
    const cumUtter = logs.reduce((s, l) => s + (Number(l.utteranceCount) || 0), 0);
    // newSentenceIds 는 sync 내구(0003) — mode(로컬 전용, sync 소실)에 의존하지 않게 합산.
    // (newSentenceIds 는 신규 세션에서만 채워지므로 mode 필터 없이도 동일 결과 + 타기기 정합)
    const cumExpr = logs.reduce((s, l) => s + (l.newSentenceIds?.length || 0), 0);
    const weekDoneText = todayLogs.length > 0 ? `${weekDays}일 학습 · 오늘 진행 중` : `${weekDays}일 학습`;

    return {
      newCount, reviewCount, totalReview, streak, tried, passed, bestStreak,
      weekUtter, weekPass, todayNewDone, todayReviewDone, sessionTitle,
      pronBars, grass, cumUtter, cumExpr, cumMaster: totalReview, weekDoneText,
      pronAvg: weekUtter, pronDelta: 0,
      stripLeftLabel: '일일 발화 · 14일', stripLeftHead: '이번 주 발화', stripLeftUnit: '회',
    };
  } catch (e) {
    console.error('[home loadStats]', e);
    return null;
  }
}

function todayLabel(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const dows = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')} · ${dows[d.getUTCDay()]}`;
}

function render(host, state) {
  host.innerHTML = '';
  if (state.size === 'desktop') host.appendChild(renderHomeDesktopV2(state));
  else host.appendChild(renderHomeMobileV2(state));
  return () => { host.innerHTML = ''; };
}

/* ────────── PHONE ────────── */
function renderPhone(state) {
  const root = el('div', { class: 'phone-shell study-app', style: 'display:flex;flex-direction:column;' });
  root.innerHTML = `<div class="status-bar"><span>9:41</span><span class="status-icons">●●●●  ◐  ▮▮</span></div>`;

  const header = el('header', { style: 'display:flex;justify-content:space-between;align-items:center;padding:8px 24px 0;' });
  header.append(brandLangPair(state, 16, 12, 14, 'EN', 'JP', '수학'), headerIcons(20, 12));
  root.appendChild(header);

  const sec1 = el('section', { style: 'padding:28px 24px 0;' });
  sec1.appendChild(eyebrow(todayLabel(state.todayISO), 11, 'var(--text-faint)', '0.14em'));
  const flex = el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px;' });
  const h1 = el('h1', { class: 'poppins', style: 'font-size:26px;font-weight:700;color:var(--text-strong);letter-spacing:-0.03em;line-height:1.15;margin:0;max-width:60%;' });
  h1.innerHTML = '오늘 무엇부터<br/>시작할까요?';
  flex.append(h1, streakBlock(state.streak, 44, 14, 9));
  sec1.appendChild(flex);
  root.appendChild(sec1);

  const sec2 = el('section', { style: 'padding:32px 24px 0;display:flex;flex-direction:column;gap:12px;' });
  const ctx = { totalReview: state.totalReview, lang: state.lang };
  sec2.append(sessionCard('new', state.newCount, false, true, state.resume === 'new', ctx), sessionCard('review', state.reviewCount, false, true, state.resume === 'review', ctx));
  root.appendChild(sec2);

  // session/review 페이지 톤 매핑: NEW 라벨 accent, PASSED 숫자 sage, 나머지 strong.
  const sec3 = el('section', { style: 'padding:32px 24px 32px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;' });
  sec3.append(
    statBlock('New', state.todayNewDone, 22, 'strong', '0.10em', 'accent'),
    statBlock('Review', state.todayReviewDone, 22, 'strong', '0.10em'),
    statBlock('Tried', state.tried, 22, 'strong', '0.10em'),
    statBlock('Passed', state.passed, 22, 'sage', '0.10em'),
  );
  root.appendChild(sec3);
  return root;
}

/* ────────── TABLET ────────── */
function renderTablet(state) {
  const root = el('div', { class: 'phone-shell study-app', style: 'display:flex;flex-direction:column;padding:0 56px;' });

  const header = el('header', { style: 'display:flex;justify-content:space-between;align-items:center;padding-top:36px;' });
  const brand = el('div', { style: 'display:flex;align-items:baseline;gap:24px;' });
  brand.append(brandLogo(18), langPair(state, 13, 'English', '日本語', '수학', false));
  header.append(brand, headerIcons(22, 11));
  root.appendChild(header);

  const sec1 = el('section', { style: 'padding-top:56px;display:flex;justify-content:space-between;align-items:flex-end;' });
  const left = el('div', {});
  left.appendChild(eyebrow(todayLabel(state.todayISO), 12, 'var(--text-faint)', '0.14em'));
  const h1 = el('h1', { class: 'poppins', style: 'font-size:44px;font-weight:700;color:var(--text-strong);letter-spacing:-0.035em;line-height:1.1;margin:10px 0 0;' });
  h1.textContent = '오늘 무엇부터 시작할까요?';
  left.appendChild(h1);
  sec1.append(left, streakBlock(state.streak, 64, 18, 11));
  root.appendChild(sec1);

  const grid = el('section', { style: 'margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:16px;' });
  const ctx = { totalReview: state.totalReview, lang: state.lang };
  grid.append(sessionCard('new', state.newCount, true, false, state.resume === 'new', ctx), sessionCard('review', state.reviewCount, true, false, state.resume === 'review', ctx));
  root.appendChild(grid);

  const sec3 = el('section', { style: 'margin-top:48px;display:grid;grid-template-columns:repeat(4,1fr);gap:24px;padding-bottom:48px;' });
  sec3.append(
    statBlock('New', state.todayNewDone, 26, 'strong', '0.12em', 'accent'),
    statBlock('Review', state.todayReviewDone, 26, 'strong', '0.12em'),
    statBlock('Tried', state.tried, 26, 'strong', '0.12em'),
    statBlock('Passed', state.passed, 26, 'sage', '0.12em'),
  );
  root.appendChild(sec3);
  return root;
}

/* ────────── DESKTOP (D1 — Refined Editorial 재디자인) ────────── */
const D1_SUBJECTS = [
  { key: 'en', label: '영어' },
  { key: 'ja', label: '일본어' },
  { key: 'math', label: '수학' },
];

function renderDesktop(state) {
  const root = h('div', { class: 'd1-root', style: 'min-height:100vh;min-height:100dvh;' });
  root.append(d1HomeSidebar(state), d1HomeMain(state));
  return root;
}

function d1HomeSidebar(state) {
  const days = ['월', '화', '수', '목', '금', '토', '일'];
  const td = new Date(state.todayISO + 'T00:00:00Z');
  const todayDow = (td.getUTCDay() + 6) % 7; // Mon=0

  const head = h('div', { style: 'display:flex;justify-content:space-between;align-items:center;' },
    h('span', { style: 'font-size:19px;font-weight:800;letter-spacing:-0.02em;' }, 'Study'),
    h('span', { style: 'display:flex;gap:16px;' },
      h('span', { class: 'd1-icon', role: 'button', 'aria-label': '기록', onClick: () => { window.location.hash = '#/stats'; } }, d1Icon('cal', 17)),
      h('span', { class: 'd1-icon', role: 'button', 'aria-label': '설정', onClick: () => { window.location.hash = '#/settings'; } }, d1Icon('gear', 17)),
    ),
  );

  const streak = h('div', { style: 'margin-top:46px;' },
    h('div', { class: 'd1-lab' }, '연속 학습'),
    h('div', { style: 'display:flex;align-items:flex-end;gap:7px;margin-top:12px;' },
      h('span', { style: 'font-size:56px;font-weight:800;line-height:.9;letter-spacing:-0.03em;color:var(--terra);font-variant-numeric:tabular-nums;' }, String(state.streak)),
      h('span', { style: 'font-size:16px;color:var(--mut);font-weight:600;margin-bottom:8px;' }, '일째'),
    ),
  );

  const week = h('div', { style: 'margin-top:32px;' },
    h('div', { class: 'd1-week' }, days.map((d, i) => h('div', { class: 'd' },
      h('span', { class: 'bar' + (i === todayDow ? ' on' : '') }),
      h('span', { class: 'lb' }, d),
    ))),
  );

  const stats = h('div', { style: 'display:flex;gap:30px;margin-top:34px;' },
    h('div', {}, h('div', { class: 'd1-lab' }, '시도'), h('div', { style: 'font-size:26px;font-weight:800;margin-top:7px;' }, String(state.tried))),
    h('div', {}, h('div', { class: 'd1-lab' }, '통과'), h('div', { style: 'font-size:26px;font-weight:800;margin-top:7px;color:var(--sage);' }, String(state.passed))),
  );

  const subjects = h('div', {},
    h('div', { class: 'd1-lab', style: 'margin-bottom:10px;' }, '과목'),
    D1_SUBJECTS.map((s) => {
      const on = s.key === state.lang;
      return h('div', {
        class: 'd1-subj' + (on ? ' on' : ''),
        role: 'button', 'aria-label': s.label,
        onClick: () => { if (typeof state.onLangChange === 'function') state.onLangChange(s.key); },
      },
        h('span', { style: 'display:inline-flex;align-items:center;' },
          h('span', { class: 'dot' }), h('span', { class: 'nm' }, s.label)),
        h('span', { class: 'ct' }, on ? String(state.totalReview) : ''),
      );
    }),
  );

  return h('div', { class: 'd1-side' }, head, streak, week, stats, h('div', { style: 'flex:1;' }), subjects);
}

function d1HomeMain(state) {
  const isMath = state.lang === 'math';
  const newUnit = isMath ? '문제' : '표현';
  const reviewUnit = isMath ? '문제' : '문장';
  const langLabel = isMath ? '수학' : state.lang === 'ja' ? '일본어' : '영어';

  // ── 신규 박스 ──
  let heroTitle, heroSub;
  if (state.newCount >= 1) {
    // #5 — AI 가 생성한 세션 타이틀(scene/skit) 우선 노출. 없으면 기본 카피.
    heroTitle = state.sessionTitle || (isMath ? '오늘의 새 문제를 풀어요' : '오늘의 새 표현을 시작해요');
    heroSub = isMath ? '개념을 이해하고 차근차근 풀어요' : '전체 대화를 먼저 듣고 · 하나씩 따라 말하기';
  } else if (state.totalReview >= 1) {
    heroTitle = '오늘 신규 완료';
    heroSub = '복습으로 오늘 분량을 마무리하세요';
  } else {
    heroTitle = isMath ? '오늘 풀 문제가 없어요' : '학습할 표현이 없어요';
    heroSub = '잠시 후 다시 확인해 주세요';
  }
  const heroBtn = h('button', { class: 'd1-btn d1-btn--primary lg', style: 'margin-top:28px;', onClick: () => { window.location.hash = isMath ? '#/session-math?mode=new' : '#/session-new'; } },
    d1Icon('sound', 17), state.resume === 'new' ? '이어서 하기' : '신규 학습 시작'); // #1 — 진행 중 세션 시 이어서 하기(spec §7-7)
  if (state.newCount < 1) { heroBtn.disabled = true; heroBtn.style.opacity = '0.5'; heroBtn.style.cursor = 'default'; }

  const hero = d1SessionBox({
    tone: 'new', eyebrow: '신규 학습 · ' + langLabel, title: heroTitle, sub: heroSub,
    btn: heroBtn, num: state.newCount, numLabel: '오늘의 새 ' + newUnit,
  });

  // ── 복습 박스 (#4 — 신규와 동일 박스 구조: 버튼 좌하단 정렬) ──
  const reviewFree = !isMath && state.reviewCount === 0 && state.totalReview > 0;
  let barTitle, barSub, barNum;
  if (state.reviewCount >= 1) { barTitle = '오늘이 복습 적기예요'; barSub = '기억이 남아 있을 때 한 번 더 굳혀요'; barNum = state.reviewCount; }
  else if (state.totalReview >= 1) { barTitle = '오늘 분량 완료 · 자유 복습'; barSub = '복습 큐에서 자유롭게 더 연습해요'; barNum = state.totalReview; }
  else { barTitle = isMath ? '복습할 문제가 없어요' : '신규 학습 후 복습'; barSub = '새 표현을 익히면 복습이 쌓여요'; barNum = 0; }
  const barBtn = h('button', { class: 'd1-btn d1-btn--sage lg', style: 'margin-top:28px;', onClick: () => {
    if (isMath) { window.location.hash = '#/session-math?mode=review'; return; }
    window.location.hash = reviewFree ? '#/session-review?mode=free' : '#/session-review';
  } }, d1Icon('repeat', 16), state.resume === 'review' ? '이어서 하기' : '복습 시작'); // #1
  if (barNum < 1) { barBtn.disabled = true; barBtn.style.opacity = '0.5'; barBtn.style.cursor = 'default'; }

  const bar = d1SessionBox({
    tone: 'review', eyebrow: '복습', title: barTitle, sub: barSub,
    btn: barBtn, num: barNum, numLabel: '복습 ' + reviewUnit, marginTop: true,
  });

  return h('div', { class: 'd1-main' },
    h('div', { class: 'd1-eyebrow', style: 'letter-spacing:.06em;color:var(--faint);' }, todayLabel(state.todayISO)),
    h('h1', { class: 'd1-h1', style: 'margin-top:14px;' }, '오늘 무엇부터 시작할까요?'),
    h('div', { style: 'font-size:15.5px;color:var(--mut);margin-top:16px;line-height:1.5;' }, '새 표현을 이어서 익히거나, 복습으로 오늘 분량을 마무리하세요.'),
    h('div', { style: 'flex:1;' }),
    hero,
    bar,
    h('div', { style: 'flex:1;' }),
  );
}

// 홈 신규/복습 공용 박스 — 좌측: 라벨·제목·부제·버튼(좌하단), 우측: 큰 숫자. (#4 정렬 일관)
function d1SessionBox({ tone, eyebrow, title, sub, btn, num, numLabel, marginTop }) {
  const accent = tone === 'review' ? 'var(--sage)' : 'var(--terra)';
  return h('div', { class: 'd1-hero' + (tone === 'review' ? ' d1-hero--review' : ''), style: marginTop ? 'margin-top:18px;' : null },
    h('div', { style: 'min-width:0;' },
      h('div', { class: 'd1-lab', style: 'color:' + accent + ';' }, eyebrow),
      h('div', { style: 'font-size:31px;font-weight:800;letter-spacing:-0.03em;margin-top:12px;line-height:1.2;' }, title),
      h('div', { style: 'font-size:15px;color:var(--mut);margin-top:10px;' }, sub),
      btn,
    ),
    h('div', { style: 'text-align:right;flex:0 0 auto;' },
      h('div', { class: 'd1-bignum', style: 'color:' + accent + ';' }, String(num)),
      h('div', { style: 'font-size:14px;color:var(--mut);font-weight:600;margin-top:8px;' }, numLabel),
    ),
  );
}

/* ────────── shared ────────── */
function el(tag, attrs = {}) {
  const n = document.createElement(tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function brandLogo(size) {
  const d = el('div', { style: `font-family:var(--font-display);font-weight:700;font-size:${size}px;color:var(--text-strong);` });
  d.textContent = 'Study';
  return d;
}

function eyebrow(text, fontSize, color, ls, mb = 0) {
  const d = el('div', { style: `font-size:${fontSize}px;color:${color};text-transform:uppercase;letter-spacing:${ls};font-family:var(--font-display);font-weight:600;${mb ? `margin-bottom:${mb}px;` : ''}` });
  d.textContent = text;
  return d;
}

function brandLangPair(state, brandSize, langSize, gap, enLabel, jaLabel, mathLabel) {
  const wrap = el('div', { style: `display:flex;align-items:baseline;gap:${gap}px;` });
  wrap.append(brandLogo(brandSize), langPair(state, langSize, enLabel, jaLabel, mathLabel, false));
  return wrap;
}

function langPair(state, fontSize, enLabel, jaLabel, mathLabel, underline) {
  const wrap = el('span', { style: `display:inline-flex;align-items:baseline;gap:${fontSize >= 14 ? 12 : (fontSize >= 13 ? 10 : 8)}px;font-family:var(--font-display);font-size:${fontSize}px;letter-spacing:${fontSize >= 14 ? '0.12em' : '0.14em'};text-transform:uppercase;` });

  const make = (lang, label) => {
    const active = state.lang === lang;
    const b = el('button', { type: 'button', 'data-lang': lang, 'aria-pressed': String(active) });
    b.style.cssText = `background:none;border:none;cursor:pointer;font:inherit;letter-spacing:inherit;text-transform:inherit;padding:${underline ? '0 0 4px' : '0'};font-weight:${active ? 700 : 400};color:${active ? 'var(--text-strong)' : 'var(--text-faint)'};${underline && active ? 'border-bottom:2px solid var(--accent);' : ''}`;
    b.textContent = label;
    b.addEventListener('click', () => {
      if (typeof state.onLangChange === 'function') {
        state.onLangChange(lang);
      } else {
        try { sessionStorage.setItem('studyLang', lang); } catch { /* noop */ }
      }
    });
    return b;
  };

  const sep = () => {
    const s = el('span', { style: 'color:var(--line);font-weight:300;' });
    s.textContent = '/';
    return s;
  };

  if (underline) {
    wrap.append(make('en', enLabel), make('ja', jaLabel), make('math', mathLabel));
  } else {
    wrap.append(make('en', enLabel), sep(), make('ja', jaLabel), sep(), make('math', mathLabel));
  }
  return wrap;
}

function headerIcons(iconSize, padding) {
  const wrap = el('div', { style: 'display:flex;gap:4px;align-items:center;' });
  wrap.append(makeCalendarIcon(iconSize, padding));
  wrap.append(makeSettingsIcon(iconSize, padding));
  return wrap;
}

function makeCalendarIcon(iconSize, padding) {
  const b = el('button', { type: 'button', 'aria-label': '캘린더', style: `background:none;border:none;padding:${padding}px;color:var(--text-faint);cursor:pointer;` });
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('width', iconSize); s.setAttribute('height', iconSize);
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.5');
  s.setAttribute('aria-hidden', 'true');
  const r = document.createElementNS(SVG_NS, 'rect');
  r.setAttribute('x', '3'); r.setAttribute('y', '4');
  r.setAttribute('width', '18'); r.setAttribute('height', '18');
  r.setAttribute('rx', '2');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'M3 10h18M8 2v4M16 2v4');
  s.append(r, p);
  b.appendChild(s);
  b.addEventListener('click', () => { window.location.hash = '#/stats'; });
  return b;
}

function makeIcon(label, iconSize, padding, href, paths) {
  const b = el('button', { type: 'button', 'aria-label': label, style: `background:none;border:none;padding:${padding}px;color:var(--text-faint);cursor:pointer;` });
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('width', iconSize); s.setAttribute('height', iconSize);
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.5');
  s.setAttribute('aria-hidden', 'true');
  paths.forEach((d) => {
    const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); s.appendChild(p);
  });
  b.appendChild(s);
  b.addEventListener('click', () => { window.location.hash = href; });
  return b;
}

function makeSettingsIcon(iconSize, padding) {
  const b = el('button', { type: 'button', 'aria-label': '설정', style: `background:none;border:none;padding:${padding}px;color:var(--text-faint);cursor:pointer;` });
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('width', iconSize); s.setAttribute('height', iconSize);
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.5');
  s.setAttribute('aria-hidden', 'true');
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '3');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 010-4h.09A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V2a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H22a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z');
  s.append(c, p);
  b.appendChild(s);
  b.addEventListener('click', () => { window.location.hash = '#/settings'; });
  return b;
}

function streakBlock(streak, fontSize, unitSize, labelSize) {
  const wrap = el('div', { style: 'text-align:right;', 'aria-label': `Streak ${streak}일` });
  const num = el('div', { class: 'poppins', style: `font-size:${fontSize}px;font-weight:700;color:var(--text-strong);letter-spacing:-0.04em;line-height:0.9;font-variant-numeric:tabular-nums;` });
  num.innerHTML = `${streak}<span style="font-size:${unitSize}px;color:var(--text-faint);font-weight:400;margin-left:2px;">일</span>`;
  const lab = el('div', { style: `font-size:${labelSize}px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.14em;font-family:var(--font-display);font-weight:600;margin-top:3px;` });
  lab.textContent = 'STREAK';
  wrap.append(num, lab);
  return wrap;
}

// session/review 페이지 톤 매핑 (statRow): label 색 + value 색 분리.
// color values: 'strong'|'muted'|'sage'|'accent'|'faint'.
function statBlock(label, value, fontSize, valueColor, ls, labelColor = 'faint') {
  const colorOf = (c, fallback) => (
    c === 'sage' ? 'var(--sage)'
    : c === 'accent' ? 'var(--accent)'
    : c === 'muted' ? 'var(--text-muted)'
    : c === 'faint' ? 'var(--text-faint)'
    : c === 'strong' ? 'var(--text-strong)'
    : fallback
  );
  const labelVar = colorOf(labelColor, 'var(--text-faint)');
  const valueVar = colorOf(valueColor, 'var(--text-strong)');
  const wrap = el('div', { 'aria-label': `${label} ${value}` });
  const lab = el('div', { style: `font-size:10px;color:${labelVar};text-transform:uppercase;letter-spacing:${ls};font-family:var(--font-display);font-weight:600;` });
  lab.textContent = label;
  const num = el('div', { class: 'poppins', style: `font-size:${fontSize}px;font-weight:700;color:${valueVar};letter-spacing:-0.03em;line-height:1;font-variant-numeric:tabular-nums;margin-top:6px;` });
  num.textContent = String(value);
  wrap.append(lab, num);
  return wrap;
}

function sessionCard(kind, count, large, full, isResume = false, ctx = {}) {
  const isNew = kind === 'new';
  const isMath = ctx.lang === 'math';
  const color = isNew ? 'var(--accent)' : 'var(--sage)';
  const tint = isNew ? 'rgba(180, 77, 59, 0.08)' : 'rgba(120, 140, 93, 0.10)';
  const totalReview = Number(ctx.totalReview) || 0;
  // 자유 복습 진입 케이스: due=0 이지만 reviewQueue 에 카드 있음. (math 모드 제외)
  const reviewFreeCase = !isNew && !isMath && count === 0 && totalReview > 0;
  const unitWord = isMath ? '문제' : '문장';

  const btn = el('button', {
    type: 'button',
    'aria-label': `${isNew ? '신규' : '복습'} ${count}${unitWord}`,
    style: `background:${tint};border:none;border-radius:var(--r-md);padding:${large ? '36px 32px' : '24px 22px'};text-align:left;cursor:pointer;font-family:var(--font-body);display:flex;flex-direction:column;gap:${large ? 24 : 14}px;width:${full ? '100%' : 'auto'};flex:${full ? 'none' : 1};min-height:${large ? 220 : 'auto'};`,
  });
  btn.addEventListener('click', () => {
    if (isMath) { window.location.hash = isNew ? '#/session-math?mode=new' : '#/session-math?mode=review'; return; }
    if (isNew) { window.location.hash = '#/session-new'; return; }
    window.location.hash = reviewFreeCase ? '#/session-review?mode=free' : '#/session-review';
  });

  const top = el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;' });
  const cat = el('span', { style: `font-size:${large ? 13 : 11}px;color:${color};text-transform:uppercase;letter-spacing:0.14em;font-family:var(--font-display);font-weight:700;` });
  cat.textContent = isNew ? 'NEW' : 'REVIEW';
  top.appendChild(cat);
  btn.appendChild(top);

  const numRow = el('div', { style: 'display:flex;align-items:baseline;gap:8px;' });
  const num = el('span', { class: 'poppins', style: `font-size:${large ? 88 : 56}px;font-weight:700;color:var(--text-strong);letter-spacing:-0.04em;line-height:0.9;font-variant-numeric:tabular-nums;` });
  num.textContent = String(count);
  const unit = el('span', { style: `font-size:${large ? 16 : 13}px;color:var(--text-muted);font-family:var(--font-display);` });
  unit.textContent = unitWord;
  numRow.append(num, unit);
  btn.appendChild(numRow);

  const desc = el('div', { style: `font-size:${large ? 15 : 13}px;color:var(--text-muted);margin-top:auto;` });
  let descText;
  if (isResume) {
    descText = '이어서 하기';
  } else if (isMath) {
    if (isNew) descText = count >= 1 ? '오늘의 새 문제' : '새 문제 없음';
    else descText = count >= 1 ? '복습할 문제' : '복습 없음';
  } else if (isNew) {
    if (count >= 1) descText = '오늘의 신규 표현';
    else if (totalReview >= 1) descText = '오늘 신규 완료';
    else descText = '학습할 표현 없음';
  } else {
    // review
    if (totalReview === 0) descText = '신규 학습 후 복습';
    else if (count >= 1) descText = '오늘이 복습 적기';
    else descText = `오늘 분량 완료 · 자유 복습 ${totalReview}문장 →`;
  }
  desc.textContent = descText;
  btn.appendChild(desc);

  return btn;
}
