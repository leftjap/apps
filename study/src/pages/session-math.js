/* SessionMath — 수학 사고력 세션.
 * 기존 session 컴포넌트(createSessionLayout) + session.css 해설 클래스
 * (.explain-panel/.ex-section/.ex-label/.ex-text/.grammar-block) 재사용. 입력+자동채점 흐름.
 * 정본 콘텐츠: src/data/math/*. 진행상태: localStorage(mathProgress). 별도 CSS 없음(토큰 인라인).
 */
import { createSessionLayout, pickSize, watchSize } from '../components/session/index.js';
import { MATH_CONTENT } from '../data/math/index.js';
import { checkAnswer } from '../services/mathAnswer.js';
import { todayPlusDays } from '../services/srs.js';

const LS_KEY = 'mathProgress';
const todayISO = () => (window.studyDay?.TODAY_ISO || new Date().toISOString().slice(0, 10));

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || { done: {}, srs: {} }; }
  catch { return { done: {}, srs: {} }; }
}
function save(p) { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* noop */ } }

async function loadProblems() {
  const db = (typeof window !== 'undefined') ? window.studyDB : null;
  if (db?.mathProblems) {
    try {
      const rows = await db.mathProblems.toArray();
      if (rows && rows.length) {
        return rows.sort((a, b) => (a.date || '').localeCompare(b.date || '') || ((a.orderIndex ?? 0) - (b.orderIndex ?? 0)));
      }
    } catch { /* 번들 폴백 */ }
  }
  return MATH_CONTENT;
}

// mode: 'new'=신규만, 'review'=복습(due)만, 그 외=혼합. 하루 2~3문제(복습 최대 10).
function buildQueue(items, p, mode) {
  const today = todayISO();
  const due = items.filter((c) => p.srs[c.id] && p.srs[c.id].nextReview <= today);
  const fresh = items.filter((c) => !p.done[c.id] && !p.srs[c.id]);
  if (mode === 'new') return fresh.slice(0, 3);
  if (mode === 'review') {
    // 개념 숙달형: 복습 시 같은 개념(module)의 다른 미완료 문제 우선 — 문장 암기가 아니라 개념 적용.
    const seen = new Set();
    const out = [];
    for (const d of due) {
      const alt = items.find((c) => c.module === d.module && !p.done[c.id] && !p.srs[c.id] && !seen.has(c.id));
      const pick = alt || d;
      if (!seen.has(pick.id)) { seen.add(pick.id); out.push(pick); }
    }
    return out.slice(0, 10);
  }
  return [...due, ...fresh].slice(0, 3);
}

// 개념 숙달형 SRS — 언어 암기 간격(srs.js 1·3·7·21·60)과 분리.
// 기하는 한 번 이해하면 오래 가므로 간격을 크게(2·7·30·90), 틀린 개념만 1일로 되돌림.
const MATH_INTERVALS = [2, 7, 30, 90];
function nextMathSrs(currentInterval, kind, today) {
  if (kind === 'no') return { interval: 1, nextReview: todayPlusDays(today, 1), graduate: false };
  const cur = MATH_INTERVALS.includes(currentInterval) ? currentInterval : 0;
  const idx = MATH_INTERVALS.indexOf(cur);
  if (kind === 'got') {
    const nextIdx = idx + 1;
    if (nextIdx >= MATH_INTERVALS.length) return { graduate: true };
    const iv = MATH_INTERVALS[nextIdx];
    return { interval: iv, nextReview: todayPlusDays(today, iv), graduate: false };
  }
  // hmm(1차 오답 후 정답): 현 단계 유지 (없으면 첫 단계)
  const keep = idx >= 0 ? cur : MATH_INTERVALS[0];
  return { interval: keep, nextReview: todayPlusDays(today, keep), graduate: false };
}

// ㄱ자(L-shell) 겹마다 sage 단일 hue 명도 단계 — 홀수합=정사각형 시각 통찰.
function dotsSvg(n) {
  const shells = ['#cfe0bf', '#a9c489', '#85a861', '#6f8c4d', '#566f3a'];
  const gap = 40, off = 22, r = 12;
  let dots = '';
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      dots += `<circle cx="${off + col * gap}" cy="${off + row * gap}" r="${r}" fill="${shells[Math.max(col, row) % shells.length]}"/>`;
    }
  }
  const size = off * 2 + (n - 1) * gap;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${n}x${n} 점 격자">${dots}</svg>`;
}

function figureHtml(f) {
  if (!f) return '';
  const inner = f.type === 'dots' ? dotsSvg(f.n || 5) : (f.type === 'svg' ? (f.svg || '') : '');
  if (!inner) return '';
  const legend = f.legend ? `<div style="font-size:12px;color:var(--text-muted);text-align:center;margin-top:6px;">${f.legend}</div>` : '';
  return `<div style="display:flex;flex-direction:column;align-items:center;padding:8px 0 4px;">${inner}${legend}</div>`;
}

// 해설 6필드 → session.css .ex-section 클래스 (언어 explanation 패널과 동일 디자인).
function solutionHtml(s) {
  const sec = (label, html) => `<div class="ex-section"><div class="ex-label">${label}</div><div class="ex-text">${html}</div></div>`;
  let h = sec('핵심', s.core);
  if (s.idea) h += `<div class="ex-section"><div class="ex-text">${s.idea}</div></div>`;
  if (Array.isArray(s.steps) && s.steps.length) {
    h += '<div class="ex-section"><div class="ex-label">풀이</div>'
      + s.steps.map((st) => `<div class="grammar-block">${st}</div>`).join('') + '</div>';
  }
  if (s.refresh) h += sec('기초 환기', s.refresh);
  if (s.example) h += sec('예시', s.example);
  if (s.think) h += sec('사고 포인트', s.think);
  return h;
}

function cardHtml(c) {
  return '<div style="background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:22px;box-shadow:var(--shadow-sm);">'
    + `<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--sage);margin-bottom:10px;">${c.tag || ''}</div>`
    + (c.lesson ? `<div class="grammar-block" style="margin:0 0 14px;">${c.lesson}</div>` : '')
    + figureHtml(c.figure)
    + `<h2 class="poppins" style="font-size:18px;font-weight:700;color:var(--text-strong);line-height:1.5;margin:14px 0 0;">${c.prompt}</h2>`
    + '<div style="display:flex;gap:8px;margin-top:16px;">'
    + '<input id="m-in" inputmode="text" autocomplete="off" aria-label="답 입력" placeholder="답을 입력" style="flex:1;min-width:0;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:12px 14px;font-size:16px;color:var(--text-strong);font-family:var(--font-body);" />'
    + '<button id="m-check" type="button" style="background:var(--text-strong);color:#fff;border:none;border-radius:var(--r-sm);padding:12px 18px;font-size:15px;font-weight:600;cursor:pointer;font-family:var(--font-body);">확인</button>'
    + '</div><div id="m-res" role="status" style="margin-top:16px;"></div></div>';
}

function resultHtml(correct, c) {
  const color = correct ? 'var(--sage)' : 'var(--accent)';
  const verdict = correct ? `정답!  ·  ${c.answer}` : `정답은 ${c.answer}`;
  return `<div style="font-weight:700;font-size:15px;color:${color};margin-bottom:6px;">${verdict}</div>`
    + `<div class="explain-panel open" style="padding-top:6px;">${solutionHtml(c.solution)}</div>`
    + '<button id="m-next" type="button" style="margin-top:18px;width:100%;background:transparent;border:1px solid var(--accent);color:var(--accent);border-radius:var(--r-sm);padding:12px;font-size:15px;cursor:pointer;font-family:var(--font-body);">다음 →</button>';
}

export function mountSessionMath(host) {
  const progress = load();
  const mode = (typeof window !== 'undefined' && window.studyRoute?.params?.mode) || '';
  let size = pickSize();
  let queue = [];
  let i = 0, tries = 0, tried = 0, passed = 0, layout = null;

  function renderDone() {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'phone-shell study-app';
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;min-height:100dvh;text-align:center;padding:40px 24px;';
    const msg = queue.length === 0
      ? (mode === 'review' ? '복습할 문제가 없어요.' : '풀 문제가 없어요. 곧 새 문제가 채워집니다.')
      : '오늘 분량 끝. 틀린 문제는 며칠 뒤 다시 나옵니다.';
    wrap.innerHTML = '<div class="poppins" style="font-size:40px;font-weight:700;color:var(--text-strong);">잘했어요</div>'
      + `<p style="color:var(--text-muted);margin-top:8px;">${msg}</p>`
      + '<button id="m-home" type="button" style="margin-top:20px;background:var(--text-strong);color:#fff;border:none;border-radius:var(--r-sm);padding:12px 20px;font-weight:600;cursor:pointer;font-family:var(--font-body);">홈으로</button>';
    host.appendChild(wrap);
    host.querySelector('#m-home').onclick = () => { window.location.hash = '#/home'; };
  }

  function bindCard(c) {
    const input = host.querySelector('#m-in');
    const res = host.querySelector('#m-res');
    const reveal = (correct) => {
      const kindR = correct ? (tries > 1 ? 'hmm' : 'got') : 'no';
      tried += 1; if (correct) passed += 1;
      layout?.update({ tried, passed });
      const t = todayISO();
      // 개념 숙달형 SRS (언어와 분리)
      const st = nextMathSrs(progress.srs[c.id]?.interval ?? 0, kindR, t);
      progress.done[c.id] = true;
      if (st.graduate) delete progress.srs[c.id];
      else progress.srs[c.id] = { interval: st.interval, nextReview: st.nextReview, lastResult: kindR };
      // 일별 로그 (home streak·통계용)
      progress.logs = progress.logs || {};
      const lg = progress.logs[t] || { tried: 0, passed: 0, newDone: 0, reviewDone: 0 };
      lg.tried += 1;
      if (correct) lg.passed += 1;
      if (mode === 'review') lg.reviewDone += 1; else lg.newDone += 1;
      progress.logs[t] = lg;
      save(progress);
      res.innerHTML = resultHtml(correct, c);
      host.querySelector('#m-next').onclick = () => { i += 1; render(); };
    };
    host.querySelector('#m-check').onclick = () => {
      const r = checkAnswer(input.value, c);
      if (r.empty) { input.focus(); return; }
      tries += 1;
      if (r.correct || tries >= 2) { reveal(r.correct); return; }
      res.innerHTML = `<div style="color:var(--accent);font-size:14px;">다시 한 번 — 힌트: ${c.solution.core}</div>`;
      input.focus(); input.select();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') host.querySelector('#m-check')?.click(); });
    input.focus();
  }

  function render() {
    host.innerHTML = '';
    if (i >= queue.length) { renderDone(); return; }
    const c = queue[i]; tries = 0;
    layout = createSessionLayout({
      size,
      kind: mode === 'review' ? 'review' : 'new',
      step: i + 1,
      total: queue.length || 1,
      tried, passed, time: '',
      onHome: () => { window.location.hash = '#/home'; },
      onEnd: () => { window.location.hash = '#/home'; },
    });
    const body = document.createElement('div');
    body.innerHTML = cardHtml(c);
    layout.contentSlot.appendChild(body);
    host.appendChild(layout.el);
    bindCard(c);
  }

  loadProblems().then((items) => { queue = buildQueue(items, progress, mode); render(); });
  const stop = watchSize((s) => { if (s !== size) { size = s; render(); } });
  return () => { host.innerHTML = ''; stop(); };
}

