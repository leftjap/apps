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

const DEMO_FIXTURES = {
  newCount: 5, reviewCount: 8, streak: 7, tried: 14, passed: 9,
  bestStreak: 12, weekUtter: 108, weekPass: 72, todayISO: '2026-05-04',
};

export function mountHome(host) {
  const demo = isDemoMode();
  const state = {
    size: pickSize(),
    lang: getStoredLang(),
    newCount: demo ? DEMO_FIXTURES.newCount : 0,
    reviewCount: demo ? DEMO_FIXTURES.reviewCount : 0,
    streak: demo ? DEMO_FIXTURES.streak : 0,
    tried: demo ? DEMO_FIXTURES.tried : 0,
    passed: demo ? DEMO_FIXTURES.passed : 0,
    bestStreak: demo ? DEMO_FIXTURES.bestStreak : null,
    weekUtter: demo ? DEMO_FIXTURES.weekUtter : 0,
    weekPass: demo ? DEMO_FIXTURES.weekPass : 0,
    todayISO: demo ? DEMO_FIXTURES.todayISO : (window.studyDay?.TODAY_ISO || new Date().toISOString().slice(0, 10)),
    resume: null, // 'new' | 'review' | null — activeSession 매치 시
  };

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
    if (newLang !== 'en' && newLang !== 'ja') return;
    if (newLang === state.lang) return;
    try { sessionStorage.setItem('studyLang', newLang); } catch { /* noop */ }
    state.lang = newLang;
    state.newCount = 0; state.reviewCount = 0;
    state.tried = 0; state.passed = 0;
    state.weekUtter = 0; state.weekPass = 0;
    rerender();
    refreshStats();
  };

  refreshStats();

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
  try { return sessionStorage.getItem('studyLang') === 'ja' ? 'ja' : 'en'; }
  catch { return 'en'; }
}

async function loadStats(state) {
  const db = window.studyDB;
  if (!db) return null;
  try {
    const lang = state.lang;
    const todayISO = state.todayISO;
    const allLang = await db.reviewQueue.where('lang').equals(lang).toArray();
    const reviewCount = allLang.filter((c) => !c.nextReview || c.nextReview <= todayISO).length;
    const langLessons = await db.todayLessons.where('lang').equals(lang).toArray();
    const newCount = langLessons.filter((l) => l.date === todayISO && l.completed !== true).length;

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

    return { newCount, reviewCount, streak, tried, passed, bestStreak, weekUtter, weekPass };
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
  if (state.size === 'desktop') host.appendChild(renderDesktop(state));
  else if (state.size === 'tablet') host.appendChild(renderTablet(state));
  else host.appendChild(renderPhone(state));
  return () => { host.innerHTML = ''; };
}

/* ────────── PHONE ────────── */
function renderPhone(state) {
  const root = el('div', { class: 'phone-shell study-app', style: 'display:flex;flex-direction:column;' });
  root.innerHTML = `<div class="status-bar"><span>9:41</span><span class="status-icons">●●●●  ◐  ▮▮</span></div>`;

  const header = el('header', { style: 'display:flex;justify-content:space-between;align-items:center;padding:8px 24px 0;' });
  header.append(brandLangPair(state, 16, 12, 14, 'EN', 'JP'), headerIcons(16, 6));
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
  sec2.append(sessionCard('new', state.newCount, false, true, state.resume === 'new'), sessionCard('review', state.reviewCount, false, true, state.resume === 'review'));
  root.appendChild(sec2);

  const sec3 = el('section', { style: 'padding:32px 24px 32px;display:flex;gap:32px;' });
  sec3.append(statBlock('Tried', state.tried, 26, false, '0.12em'), statBlock('Passed', state.passed, 26, true, '0.12em'));
  root.appendChild(sec3);
  return root;
}

/* ────────── TABLET ────────── */
function renderTablet(state) {
  const root = el('div', { class: 'phone-shell study-app', style: 'display:flex;flex-direction:column;padding:0 56px;' });

  const header = el('header', { style: 'display:flex;justify-content:space-between;align-items:center;padding-top:36px;' });
  const brand = el('div', { style: 'display:flex;align-items:baseline;gap:24px;' });
  brand.append(brandLogo(18), langPair(state, 13, 'English', '日本語', false));
  header.append(brand, headerIcons(18, 8));
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
  grid.append(sessionCard('new', state.newCount, true, false, state.resume === 'new'), sessionCard('review', state.reviewCount, true, false, state.resume === 'review'));
  root.appendChild(grid);

  const sec3 = el('section', { style: 'margin-top:48px;display:flex;gap:48px;padding-bottom:48px;' });
  sec3.append(statBlock('Tried Today', state.tried, 32, false, '0.14em'), statBlock('Passed Today', state.passed, 32, true, '0.14em'));
  root.appendChild(sec3);
  return root;
}

/* ────────── DESKTOP ────────── */
function renderDesktop(state) {
  const root = el('div', { class: 'phone-shell study-app', style: 'display:grid;grid-template-columns:320px 1fr;min-height:100vh;min-height:100dvh;' });

  const aside = el('aside', { style: 'padding:40px 36px;display:flex;flex-direction:column;gap:36px;background:rgba(0,0,0,0.015);' });
  const top = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;' });
  top.append(brandLogo(18), headerIcons(16, 6));
  aside.appendChild(top);

  const streakBlk = el('div', {});
  streakBlk.appendChild(eyebrow('Streak', 11, 'var(--text-faint)', '0.14em'));
  const sNum = el('div', { class: 'poppins', style: 'font-size:88px;font-weight:700;color:var(--text-strong);letter-spacing:-0.05em;line-height:0.9;margin-top:8px;font-variant-numeric:tabular-nums;' });
  sNum.innerHTML = `${state.streak}<span style="font-size:24px;color:var(--text-faint);font-weight:400;margin-left:4px;">일</span>`;
  streakBlk.appendChild(sNum);
  if (state.bestStreak != null) {
    const sMeta = el('div', { style: 'font-size:12px;color:var(--text-muted);margin-top:8px;font-family:var(--font-display);' });
    sMeta.textContent = `최고 ${state.bestStreak}일`;
    streakBlk.appendChild(sMeta);
  }
  aside.appendChild(streakBlk);

  const stats = el('div', { style: 'display:flex;flex-direction:column;gap:20px;' });
  stats.append(statBlock('Tried Today', state.tried, 36, false, '0.14em'), statBlock('Passed Today', state.passed, 36, true, '0.14em'));
  aside.appendChild(stats);

  const lang = el('div', { style: 'margin-top:auto;display:flex;flex-direction:column;gap:14px;' });
  lang.appendChild(eyebrow('Language', 10, 'var(--text-faint)', '0.14em', 4));
  lang.appendChild(langPair(state, 14, 'English', '日本語', true));
  aside.appendChild(lang);
  root.appendChild(aside);

  const main = el('main', { style: 'padding:64px 80px;display:flex;flex-direction:column;gap:32px;' });
  const heroBlk = el('div', {});
  heroBlk.appendChild(eyebrow(todayLabel(state.todayISO), 13, 'var(--text-faint)', '0.14em'));
  const h1 = el('h1', { class: 'poppins', style: 'font-size:56px;font-weight:700;color:var(--text-strong);letter-spacing:-0.04em;line-height:1.05;margin:12px 0 0;' });
  h1.innerHTML = '오늘 무엇부터<br/>시작할까요?';
  heroBlk.appendChild(h1);
  main.appendChild(heroBlk);

  const grid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:24px;' });
  grid.append(sessionCard('new', state.newCount, true, false, state.resume === 'new'), sessionCard('review', state.reviewCount, true, false, state.resume === 'review'));
  main.appendChild(grid);

  const meta = el('div', { style: 'margin-top:auto;font-size:12px;color:var(--text-muted);font-family:var(--font-display);text-transform:uppercase;letter-spacing:0.12em;' });
  meta.textContent = `이번 주 ${state.weekUtter} 시도 · ${state.weekPass} 통과`;
  main.appendChild(meta);
  root.appendChild(main);
  return root;
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

function brandLangPair(state, brandSize, langSize, gap, enLabel, jaLabel) {
  const wrap = el('div', { style: `display:flex;align-items:baseline;gap:${gap}px;` });
  wrap.append(brandLogo(brandSize), langPair(state, langSize, enLabel, jaLabel, false));
  return wrap;
}

function langPair(state, fontSize, enLabel, jaLabel, underline) {
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

  if (underline) {
    wrap.append(make('en', enLabel), make('ja', jaLabel));
  } else {
    const sep = el('span', { style: 'color:var(--line);font-weight:300;' });
    sep.textContent = '/';
    wrap.append(make('en', enLabel), sep, make('ja', jaLabel));
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
  b.addEventListener('click', () => { window.location.hash = '#/calendar'; });
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

function statBlock(label, value, fontSize, isPassed, ls) {
  const wrap = el('div', { 'aria-label': `${label} ${value}` });
  const lab = el('div', { style: `font-size:10px;color:var(--text-faint);text-transform:uppercase;letter-spacing:${ls};font-family:var(--font-display);font-weight:600;` });
  lab.textContent = label;
  const num = el('div', { class: 'poppins', style: `font-size:${fontSize}px;font-weight:700;color:${isPassed ? 'var(--sage)' : 'var(--text-strong)'};letter-spacing:-0.03em;line-height:1;font-variant-numeric:tabular-nums;margin-top:4px;` });
  num.textContent = String(value);
  wrap.append(lab, num);
  return wrap;
}

function sessionCard(kind, count, large, full, isResume = false) {
  const isNew = kind === 'new';
  const color = isNew ? 'var(--accent)' : 'var(--sage)';
  const tint = isNew ? 'rgba(180, 77, 59, 0.08)' : 'rgba(120, 140, 93, 0.10)';

  const btn = el('button', {
    type: 'button',
    'aria-label': `${isNew ? '신규' : '복습'} ${count}문장`,
    style: `background:${tint};border:none;border-radius:var(--r-md);padding:${large ? '36px 32px' : '24px 22px'};text-align:left;cursor:pointer;font-family:var(--font-body);display:flex;flex-direction:column;gap:${large ? 24 : 14}px;width:${full ? '100%' : 'auto'};flex:${full ? 'none' : 1};min-height:${large ? 220 : 'auto'};`,
  });
  btn.addEventListener('click', () => { window.location.hash = isNew ? '#/session-new' : '#/session-review'; });

  const top = el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;' });
  const cat = el('span', { style: `font-size:${large ? 13 : 11}px;color:${color};text-transform:uppercase;letter-spacing:0.14em;font-family:var(--font-display);font-weight:700;` });
  cat.textContent = isNew ? 'NEW' : 'REVIEW';
  const arrow = document.createElementNS(SVG_NS, 'svg');
  arrow.setAttribute('width', large ? 20 : 14); arrow.setAttribute('height', large ? 20 : 14);
  arrow.setAttribute('viewBox', '0 0 24 24'); arrow.setAttribute('fill', 'none');
  arrow.setAttribute('stroke', color); arrow.setAttribute('stroke-width', '2');
  arrow.setAttribute('aria-hidden', 'true');
  const ap = document.createElementNS(SVG_NS, 'path'); ap.setAttribute('d', 'M5 12h14M13 5l7 7-7 7');
  arrow.appendChild(ap);
  top.append(cat, arrow);
  btn.appendChild(top);

  const numRow = el('div', { style: 'display:flex;align-items:baseline;gap:8px;' });
  const num = el('span', { class: 'poppins', style: `font-size:${large ? 88 : 56}px;font-weight:700;color:var(--text-strong);letter-spacing:-0.04em;line-height:0.9;font-variant-numeric:tabular-nums;` });
  num.textContent = String(count);
  const unit = el('span', { style: `font-size:${large ? 16 : 13}px;color:var(--text-muted);font-family:var(--font-display);` });
  unit.textContent = '문장';
  numRow.append(num, unit);
  btn.appendChild(numRow);

  const desc = el('div', { style: `font-size:${large ? 15 : 13}px;color:var(--text-muted);margin-top:auto;` });
  desc.textContent = isResume ? '이어서 하기' : (isNew ? '오늘의 새 표현 학습' : '복습 대기 중');
  btn.appendChild(desc);

  return btn;
}
