/* SessionMath — 수학 사고력 세션.
 * session-new 와 동일 구조: createSessionLayout 셸 + contentSlot 직접 배치(흰 카드 없음) +
 * createExplanationPanel(.explain-* / .ex-section) 해설 컴포넌트 재사용. 녹음 대신 입력+자동채점.
 * 진행상태: localStorage(mathProgress). 복습은 개념 숙달형(언어 SRS 와 분리).
 */
import { createSessionLayout, pickSize, watchSize } from '../components/session/index.js';
import { createExplanationPanel } from '../components/session/explanationPanel.js';
import { MATH_CONTENT, nextNewGroup } from '../data/math/index.js';
import { checkAnswer } from '../services/mathAnswer.js';
import { todayPlusDays } from '../services/srs.js';
import { h } from '../components/d1/dom.js';
import { buildD1Side } from '../components/d1/sessionShell.js';
import { renderMathV2 } from './sessionMathV2.js';
import { localISODate } from '../utils/today.js';

const LS_KEY = 'mathProgress';
const todayISO = () => (window.studyDay?.TODAY_ISO || localISODate());

function isDemoMode() {
  try { return new URLSearchParams(window.location.search).get('demo') === '1'; }
  catch { return false; }
}

// 이번 주(월–일) 정답률 — progress.logs 기반.
function weekPassRate(progress) {
  const t = todayISO();
  const d = new Date(t + 'T00:00:00Z'); const w = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (w === 0 ? -6 : 1 - w));
  const start = d.toISOString().slice(0, 10);
  let tried = 0, passed = 0;
  for (const dk in (progress.logs || {})) {
    if (dk >= start && dk <= t) { tried += progress.logs[dk]?.tried || 0; passed += progress.logs[dk]?.passed || 0; }
  }
  return tried > 0 ? Math.round((passed / tried) * 100) : null;
}

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || { done: {}, srs: {}, logs: {} }; }
  catch { return { done: {}, srs: {}, logs: {} }; }
}
function save(p) { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* noop */ } }

// 하이브리드 콘텐츠: 번들(개념 정본 + 핵심 응용) + Dexie(루틴 생성 일일 응용 연습) 병합.
// 번들 id 중복 제거. DB 행은 응용으로 취급(prompt/answer/solution — 개념·도형 없음). 정적 개념은
// 번들이 정본, 매일 새 연습은 루틴이 study_math_problems 에 시드 → sync → 여기서 합류.
async function loadProblems() {
  const items = [...MATH_CONTENT];
  const db = (typeof window !== 'undefined') ? window.studyDB : null;
  if (db?.mathProblems) {
    try {
      const rows = await db.mathProblems.toArray();
      const bundleIds = new Set(MATH_CONTENT.map((c) => c.id));
      const extra = rows.filter((r) => !bundleIds.has(r.id)).map((r) => ({ ...r, kind: r.kind || 'apply' }));
      items.push(...extra);
    } catch { /* 번들만 폴백 */ }
  }
  return items;
}

// mode: 'new'=신규만, 'review'=복습(개념 숙달형), 그 외=혼합.
function buildQueue(items, p, mode) {
  const today = todayISO();
  const due = items.filter((c) => p.srs[c.id] && p.srs[c.id].nextReview <= today);
  const fresh = items.filter((c) => !p.done[c.id] && !p.srs[c.id]);
  // 신규일 = 다음 개념 그룹(개념 설명 먼저 → 그 응용). "문제부터 덜컥" 방지(하루 구조).
  if (mode === 'new') return nextNewGroup(items, p);
  if (mode === 'review') {
    // 같은 개념(module)의 다른 미완료 문제 우선 — 암기 반복이 아니라 개념 적용.
    const seen = new Set();
    const out = [];
    for (const d of due) {
      const alt = items.find((c) => c.module === d.module && c.kind !== 'concept' && !p.done[c.id] && !p.srs[c.id] && !seen.has(c.id));
      const pick = alt || d;
      if (!seen.has(pick.id)) { seen.add(pick.id); out.push(pick); }
    }
    return out.slice(0, 10);
  }
  return [...due, ...fresh].slice(0, 3);
}

// 개념 숙달형 SRS — 언어 암기 간격(srs.js 1·3·7·21·60)과 분리. 맞히면 길게(2·7·30·90), 틀린 개념만 1일.
const MATH_INTERVALS = [2, 7, 30, 90];
function nextMathSrs(currentInterval, kind, today) {
  if (kind === 'no') return { interval: 1, nextReview: todayPlusDays(today, 1), graduate: false };
  const cur = MATH_INTERVALS.includes(currentInterval) ? currentInterval : 0;
  const idx = MATH_INTERVALS.indexOf(cur);
  if (kind === 'got') {
    const ni = idx + 1;
    if (ni >= MATH_INTERVALS.length) return { graduate: true };
    return { interval: MATH_INTERVALS[ni], nextReview: todayPlusDays(today, MATH_INTERVALS[ni]), graduate: false };
  }
  const keep = idx >= 0 ? cur : MATH_INTERVALS[0];
  return { interval: keep, nextReview: todayPlusDays(today, keep), graduate: false };
}

// ㄱ자(L-shell) 겹마다 sage 단일 hue 명도 단계 — 홀수합=정사각형 시각 통찰.
function dotsSvg(n) {
  const shells = ['#cfe0bf', '#a9c489', '#85a861', '#6f8c4d', '#566f3a'];
  const gap = 38, off = 21, r = 11;
  let dots = '';
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      dots += `<circle cx="${off + col * gap}" cy="${off + row * gap}" r="${r}" fill="${shells[Math.max(col, row) % shells.length]}"/>`;
    }
  }
  const size = off * 2 + (n - 1) * gap;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${n}x${n} 점 격자">${dots}</svg>`;
}

function figureNode(f) {
  if (!f) return null;
  const inner = f.type === 'dots' ? dotsSvg(f.n || 5) : (f.type === 'svg' ? (f.svg || '') : '');
  if (!inner) return null;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;margin:4px 0 8px;';
  const box = document.createElement('div');
  box.style.cssText = 'width:100%;display:flex;justify-content:center;';
  box.innerHTML = inner;
  const svgEl = box.querySelector('svg'); // 폭 넘침 방지 — 화면보다 크면 비율 유지하며 축소
  if (svgEl) { svgEl.style.maxWidth = '100%'; svgEl.style.height = 'auto'; }
  wrap.appendChild(box);
  if (f.legend) {
    const l = document.createElement('div');
    l.style.cssText = 'font-size:12px;color:var(--text-muted);text-align:center;';
    l.textContent = f.legend;
    wrap.appendChild(l);
  }
  return wrap;
}

// 복습(review) 응용 상단 접이식 '개념 다시보기' — 부모 개념 title+figure+body 요약. 기본 접힘.
function buildConceptRecap(parent) {
  if (!parent) return null;
  const box = document.createElement('div');
  box.style.cssText = 'margin-bottom:20px;';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-expanded', 'false');
  btn.style.cssText = 'background:transparent;border:1px solid var(--line);border-radius:var(--r-sm);padding:8px 14px;font-size:13px;color:var(--sage);font-family:var(--font-display);font-weight:700;letter-spacing:0.04em;cursor:pointer;display:inline-flex;align-items:center;gap:6px;';
  const caret = document.createElement('span');
  caret.textContent = '▾';
  caret.style.cssText = 'display:inline-block;transition:transform 0.15s;';
  btn.append(document.createTextNode('개념 다시보기'), caret);
  const panel = document.createElement('div');
  panel.style.cssText = 'display:none;margin-top:12px;padding:14px 16px;background:var(--sidebar);border:1px solid var(--line);border-radius:var(--r-md);';
  const t = document.createElement('div');
  t.style.cssText = 'font-weight:700;color:var(--text-strong);font-size:15px;margin-bottom:8px;';
  t.textContent = parent.title || '';
  panel.appendChild(t);
  const fig = figureNode(parent.figure);
  if (fig) { fig.style.margin = '4px 0 10px'; panel.appendChild(fig); }
  (parent.body || []).forEach((para) => {
    const p = document.createElement('p');
    p.style.cssText = 'font-size:14px;color:var(--text-muted);line-height:1.7;margin:6px 0 0;';
    p.textContent = para;
    panel.appendChild(p);
  });
  btn.onclick = () => {
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'block';
    caret.style.transform = open ? '' : 'rotate(180deg)';
    btn.setAttribute('aria-expanded', String(!open));
  };
  box.append(btn, panel);
  return box;
}

// session-new buildMain 구조 차용 — 흰 카드 박스 없이 contentSlot 에 직접. 녹음 대신 입력행.
function buildMathMain(c, size, mode) {
  const wrap = document.createElement('div');
  wrap.className = 'session-main';
  if (size === 'desktop') wrap.style.cssText = 'display:flex;flex-direction:column;flex:1;';

  if (mode === 'review') {
    const parent = MATH_CONTENT.find((x) => x.kind === 'concept' && x.conceptId === c.conceptId);
    const recap = buildConceptRecap(parent);
    if (recap) wrap.appendChild(recap);
  }

  if (c.tag) {
    const tag = document.createElement('div');
    tag.style.cssText = 'font-size:12px;color:var(--sage);text-transform:uppercase;letter-spacing:0.12em;font-family:var(--font-display);font-weight:700;margin-bottom:16px;';
    tag.textContent = c.tag;
    wrap.appendChild(tag);
  }

  const figList = Array.isArray(c.figures) ? c.figures : (c.figure ? [c.figure] : []);
  let anyFig = false;
  figList.forEach((f) => { const fn = figureNode(f); if (fn) { wrap.appendChild(fn); anyFig = true; } });

  const sizeMap = { phone: 24, tablet: 34, desktop: 42 };
  const h1 = document.createElement('h1');
  h1.className = 'poppins';
  h1.style.cssText = `font-size:${sizeMap[size]}px;font-weight:700;color:var(--text-strong);letter-spacing:-0.03em;line-height:1.3;margin:${anyFig ? '12px 0 0' : '0'};`;
  h1.textContent = c.prompt;
  wrap.appendChild(h1);

  if (c.lesson) {
    const lesson = document.createElement('div');
    lesson.style.cssText = `font-size:${size === 'phone' ? 15 : 16}px;color:var(--text-muted);margin-top:12px;line-height:1.75;`;
    lesson.innerHTML = c.lesson;
    wrap.appendChild(lesson);
  }

  const row = document.createElement('div');
  row.style.cssText = `display:flex;gap:8px;margin-top:${size === 'phone' ? 32 : 48}px;align-items:center;flex-wrap:wrap;`;
  const input = document.createElement('input');
  input.id = 'm-in'; input.type = 'text'; input.autocomplete = 'off';
  input.setAttribute('aria-label', '답 입력'); input.placeholder = '답 입력';
  input.style.cssText = 'flex:1;min-width:0;max-width:240px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:14px 16px;font-size:18px;color:var(--text-strong);font-family:var(--font-body);';
  const checkBtn = document.createElement('button');
  checkBtn.id = 'm-check'; checkBtn.type = 'button'; checkBtn.className = 'record-btn';
  checkBtn.textContent = '확인';
  row.append(input, checkBtn);
  wrap.appendChild(row);

  // 채점 결과(verdict) — 입력칸 바로 아래 (채점 후 채움)
  const verdict = document.createElement('div');
  verdict.id = 'm-verdict';
  wrap.appendChild(verdict);

  // 해설 — 언어 session-new 처럼 채점 전부터 입력칸 아래 '접힌' 상태로 노출. 사용자가 토글로 펼침.
  const explain = createExplanationPanel({ explanation: c.solution });
  explain.toggleEl.style.marginTop = '20px';
  explain.toggleEl.style.alignSelf = 'flex-start';
  // 해설 그림 — 말 대신 시각으로. 해설 패널 맨 위에 배치.
  const solFig = figureNode(c.solution && c.solution.figure);
  if (solFig) { solFig.style.margin = '14px 0 4px'; explain.panelEl.insertBefore(solFig, explain.panelEl.firstChild); }
  wrap.append(explain.toggleEl, explain.panelEl);

  // 다음 버튼 (채점 후 채움)
  const nextWrap = document.createElement('div');
  nextWrap.id = 'm-next';
  nextWrap.style.cssText = 'width:100%;';
  wrap.appendChild(nextWrap);

  return { wrap, input, checkBtn, verdict, nextWrap };
}

// 개념 카드 (kind:'concept') — figure + 원리(body) + worked example. 채점 없음, "응용 풀기" 버튼.
function buildConceptMain(c, size) {
  const wrap = document.createElement('div');
  wrap.className = 'session-main';
  if (size === 'desktop') wrap.style.cssText = 'display:flex;flex-direction:column;flex:1;';

  if (c.tag) {
    const tag = document.createElement('div');
    tag.style.cssText = 'font-size:12px;color:var(--sage);text-transform:uppercase;letter-spacing:0.12em;font-family:var(--font-display);font-weight:700;margin-bottom:16px;';
    tag.textContent = c.tag;
    wrap.appendChild(tag);
  }
  // 개념 figure — 단일(c.figure) 또는 다중(c.figures[]) 순차 렌더(이미지 주도 설명).
  const figList = Array.isArray(c.figures) ? c.figures : (c.figure ? [c.figure] : []);
  let anyFig = false;
  figList.forEach((f) => { const fn = figureNode(f); if (fn) { wrap.appendChild(fn); anyFig = true; } });

  const sizeMap = { phone: 24, tablet: 32, desktop: 40 };
  const h1 = document.createElement('h1');
  h1.className = 'poppins';
  h1.style.cssText = `font-size:${sizeMap[size]}px;font-weight:700;color:var(--text-strong);letter-spacing:-0.03em;line-height:1.3;margin:${anyFig ? '12px 0 0' : '0'};`;
  h1.textContent = c.title || '';
  wrap.appendChild(h1);

  (c.body || []).forEach((para) => {
    const p = document.createElement('p');
    p.style.cssText = `font-size:${size === 'phone' ? 15 : 16}px;color:var(--text);line-height:1.8;margin:14px 0 0;`;
    p.textContent = para;
    wrap.appendChild(p);
  });

  if (c.worked) {
    const box = document.createElement('div');
    box.className = 'grammar-block';
    box.style.cssText = 'margin-top:20px;';
    const q = document.createElement('div');
    q.style.cssText = 'font-weight:600;color:var(--text-strong);margin-bottom:6px;';
    q.textContent = `예시 — ${c.worked.prompt || ''}`;
    box.appendChild(q);
    (c.worked.steps || []).forEach((s) => {
      const sd = document.createElement('div');
      sd.style.cssText = 'color:var(--text-muted);font-size:14px;line-height:1.7;';
      sd.textContent = s;
      box.appendChild(sd);
    });
    wrap.appendChild(box);
  }

  // 5부 미니레슨 — 개념(body)·예시(worked) 다음: 배경 → 왜 배울 가치 → 길러지는 사고 → 실생활.
  const sections = [
    ['배경', c.background],
    ['왜 배울 가치', c.value],
    ['길러지는 사고', c.thinking],
    ['실생활', c.realLife],
  ].filter(([, v]) => v);
  if (sections.length) {
    const lesson = document.createElement('div');
    lesson.style.cssText = 'margin-top:22px;display:flex;flex-direction:column;gap:16px;';
    sections.forEach(([label, text]) => {
      const sec = document.createElement('div');
      sec.style.cssText = 'padding-left:14px;border-left:3px solid var(--sage);';
      const h = document.createElement('div');
      h.style.cssText = 'font-size:11px;color:var(--sage);text-transform:uppercase;letter-spacing:0.12em;font-family:var(--font-display);font-weight:700;margin-bottom:5px;';
      h.textContent = label;
      const p = document.createElement('p');
      p.style.cssText = `font-size:${size === 'phone' ? 14 : 15}px;color:var(--text-muted);line-height:1.75;margin:0;`;
      p.textContent = text;
      sec.append(h, p);
      lesson.appendChild(sec);
    });
    wrap.appendChild(lesson);
  }

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.id = 'm-concept-next';
  nextBtn.style.cssText = 'margin-top:32px;align-self:flex-start;background:var(--text-strong);color:#fff;border:none;border-radius:var(--r-md);padding:14px 28px;font-size:15px;font-weight:600;cursor:pointer;font-family:var(--font-body);';
  nextBtn.textContent = '이해했어요 · 응용 풀기 →';
  wrap.appendChild(nextBtn);

  return { el: wrap, nextBtn };
}

export function mountSessionMath(host) {
  const progress = load();
  const mode = (typeof window !== 'undefined' && window.studyRoute?.params?.mode) || '';
  let size = pickSize();
  let queue = [];
  let i = 0, tries = 0, tried = 0, passed = 0, layout = null;

  // 자기 채점(v2) — SRS·진행·로그 갱신. 데모(?demo=1)는 localStorage 미저장(격리).
  function gradeMath(c, correct) {
    const kindR = correct ? 'got' : 'no';
    tried += 1; if (correct) passed += 1;
    const t = todayISO();
    const st = nextMathSrs(progress.srs[c.id]?.interval ?? 0, kindR, t);
    progress.done[c.id] = true;
    if (st.graduate) delete progress.srs[c.id];
    else progress.srs[c.id] = { interval: st.interval, nextReview: st.nextReview, lastResult: kindR };
    progress.logs = progress.logs || {};
    const lg = progress.logs[t] || { tried: 0, passed: 0, newDone: 0, reviewDone: 0 };
    lg.tried += 1; if (correct) lg.passed += 1;
    if (mode === 'review') lg.reviewDone += 1; else lg.newDone += 1;
    progress.logs[t] = lg;
    if (!isDemoMode()) save(progress);
  }

  function renderDone() {
    host.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'phone-shell study-app';
    root.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;min-height:100dvh;text-align:center;padding:40px 24px;';
    const msg = queue.length === 0
      ? (mode === 'review' ? '복습할 문제가 없어요.' : '풀 문제가 없어요. 곧 새 문제가 채워집니다.')
      : '오늘 분량 끝. 틀린 문제는 며칠 뒤 다시 나옵니다.';
    const big = document.createElement('div');
    big.className = 'poppins';
    big.style.cssText = 'font-size:40px;font-weight:700;color:var(--text-strong);';
    big.textContent = '잘했어요';
    const sub = document.createElement('p');
    sub.style.cssText = 'color:var(--text-muted);margin-top:8px;';
    sub.textContent = msg;
    const home = document.createElement('button');
    home.type = 'button'; home.className = 'record-btn'; home.style.cssText = 'margin-top:20px;cursor:pointer;';
    home.textContent = '홈으로';
    home.onclick = () => { window.location.hash = '#/home'; };
    root.append(big, sub, home);
    host.appendChild(root);
  }

  function reveal(c, correct, verdict, nextWrap, input, checkBtn) {
    const kindR = correct ? (tries > 1 ? 'hmm' : 'got') : 'no';
    tried += 1; if (correct) passed += 1;
    layout?.update({ tried, passed });
    const t = todayISO();
    const st = nextMathSrs(progress.srs[c.id]?.interval ?? 0, kindR, t);
    progress.done[c.id] = true;
    if (st.graduate) delete progress.srs[c.id];
    else progress.srs[c.id] = { interval: st.interval, nextReview: st.nextReview, lastResult: kindR };
    progress.logs = progress.logs || {};
    const lg = progress.logs[t] || { tried: 0, passed: 0, newDone: 0, reviewDone: 0 };
    lg.tried += 1; if (correct) lg.passed += 1;
    if (mode === 'review') lg.reviewDone += 1; else lg.newDone += 1;
    progress.logs[t] = lg;
    save(progress);

    // verdict 표시. 해설은 이미 입력칸 아래 접힌 채 노출돼 있음 — 자동 펼침 안 함(언어처럼 사용자 토글).
    verdict.style.cssText = `margin-top:20px;font-weight:700;font-size:18px;color:${correct ? 'var(--sage)' : 'var(--accent)'};`;
    verdict.textContent = correct ? `정답!  ·  ${c.answer}` : `정답은 ${c.answer}`;
    input.disabled = true;
    checkBtn.style.display = 'none';
    // 유의미성 — 응용은 부모 개념의 '왜 배울 가치'(value) 노출. 응용 고유의 현실/사고는
    // 해설(example/think)이 담당.
    const parentConcept = MATH_CONTENT.find((x) => x.kind === 'concept' && x.conceptId === c.conceptId);
    const sigText = parentConcept?.value;
    if (sigText) {
      const sig = document.createElement('div');
      sig.style.cssText = 'margin-top:18px;padding:10px 0 10px 14px;border-left:3px solid var(--sage);font-size:14px;color:var(--text-muted);line-height:1.7;';
      sig.textContent = sigText;
      nextWrap.appendChild(sig);
    }
    const next = document.createElement('button');
    next.type = 'button';
    next.style.cssText = 'margin-top:24px;background:transparent;border:1px solid var(--accent);color:var(--accent);border-radius:var(--r-md);padding:14px 28px;font-size:15px;cursor:pointer;font-family:var(--font-body);';
    next.textContent = '다음 →';
    next.onclick = () => { i += 1; render(); };
    nextWrap.appendChild(next);
  }

  // ── D1 desktop — ⑤ 수학 세션 (개념 = 단일컬럼 / 응용 = 2단). 모바일 reveal 미변경(데스크탑만). ──
  function renderD1Math(c) {
    const items = queue.map((q, idx) => ({ n: idx + 1, t: q.tag || q.title || ('문제 ' + (idx + 1)) }));
    const side = buildD1Side({
      mode: 'math', subjLabel: '수학', timer: '', idx: i + 1, total: queue.length || 1, items,
      onHome: () => { window.location.hash = '#/home'; },
      onEnd: () => { window.location.hash = '#/home'; },
      onJump: (n) => { i = Math.max(0, Math.min(queue.length - 1, n - 1)); render(); },
    });
    const wrapRoot = (main) => {
      const root = h('div', { class: 'd1-root', style: 'min-height:100vh;min-height:100dvh;' }, side.el, main);
      host.appendChild(root);
    };
    const sect = (label, text) => h('div', {}, h('div', { class: 'd1-panel-lab' }, label), h('div', { style: 'font-size:15px;line-height:1.55;' }, text));
    const pager = () => h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:32px;' },
      h('button', { class: 'd1-btn d1-btn--ghost', onClick: () => { if (i > 0) { i -= 1; render(); } } }, '이전'),
      h('button', { class: 'd1-btn d1-btn--outline', style: 'color:var(--terra);border-color:var(--terra);', onClick: () => { i += 1; render(); } }, (i + 1 >= queue.length) ? '마치기' : '다음 문제'),
    );

    // ── 개념 카드 ──
    if (c.kind === 'concept') {
      const figs = Array.isArray(c.figures) ? c.figures : (c.figure ? [c.figure] : []);
      const sections = [['배경', c.background], ['왜 배울 가치', c.value], ['길러지는 사고', c.thinking], ['실생활', c.realLife]].filter(([, v]) => v);
      wrapRoot(h('div', { class: 'd1-main', style: 'max-width:880px;' },
        c.tag ? h('div', { class: 'd1-lab', style: 'color:var(--sage);' }, c.tag) : null,
        h('h1', { class: 'd1-h1', style: 'margin-top:14px;font-size:36px;' }, c.title || ''),
        figs.map((f) => figureNode(f)).filter(Boolean),
        (c.body || []).map((p) => h('p', { style: 'font-size:16px;color:var(--ink);line-height:1.8;margin:14px 0 0;' }, p)),
        c.worked ? h('div', { class: 'd1-keybox', style: 'margin-top:20px;' },
          h('div', { class: 'd1-panel-lab', style: 'color:var(--terra);margin-bottom:8px;' }, '예시 — ' + (c.worked.prompt || '')),
          (c.worked.steps || []).map((s) => h('div', { class: 'd1-mathstep' }, h('span', { class: 'd1-mdot' }), s))) : null,
        sections.length ? h('div', { style: 'margin-top:24px;display:grid;gap:18px;' },
          sections.map(([label, text]) => h('div', { style: 'padding-left:14px;border-left:3px solid var(--sage);' },
            h('div', { class: 'd1-panel-lab', style: 'color:var(--sage);margin-bottom:5px;' }, label),
            h('p', { style: 'font-size:15px;color:var(--mut);line-height:1.75;margin:0;' }, text)))) : null,
        h('button', { class: 'd1-btn d1-btn--primary lg', style: 'margin-top:32px;align-self:flex-start;', onClick: () => { progress.done[c.id] = true; save(progress); i += 1; render(); } }, '이해했어요 · 응용 풀기'),
      ));
      return;
    }

    // ── 응용 문제 (2단) ──
    const figs = Array.isArray(c.figures) ? c.figures : (c.figure ? [c.figure] : []);
    const sol = c.solution || {};
    const input = h('input', { class: 'd1-mathin', type: 'text', autocomplete: 'off', 'aria-label': '답 입력', placeholder: '답' });
    const checkBtn = h('button', { class: 'd1-btn d1-btn--primary lg' }, '확인');
    const verdictWrap = h('div', { style: 'display:flex;align-items:center;gap:12px;margin-top:18px;min-height:38px;' });

    const doGrade = (correct) => {
      const kindR = correct ? (tries > 1 ? 'hmm' : 'got') : 'no';
      tried += 1; if (correct) passed += 1;
      const t = todayISO();
      const st = nextMathSrs(progress.srs[c.id]?.interval ?? 0, kindR, t);
      progress.done[c.id] = true;
      if (st.graduate) delete progress.srs[c.id];
      else progress.srs[c.id] = { interval: st.interval, nextReview: st.nextReview, lastResult: kindR };
      progress.logs = progress.logs || {};
      const lg = progress.logs[t] || { tried: 0, passed: 0, newDone: 0, reviewDone: 0 };
      lg.tried += 1; if (correct) lg.passed += 1;
      if (mode === 'review') lg.reviewDone += 1; else lg.newDone += 1;
      progress.logs[t] = lg;
      save(progress);
      verdictWrap.innerHTML = '';
      if (correct) {
        verdictWrap.append(
          h('span', { class: 'd1-score' }, h('span', { class: 'sc', style: 'font-size:15px;' }, '정답')),
          h('span', { style: 'font-size:15px;color:var(--mut);' }, c.answer + ' — 맞았어요.'));
      } else {
        verdictWrap.append(h('span', { style: 'display:inline-flex;align-items:center;padding:8px 15px;border-radius:999px;background:var(--terra-bg);color:var(--terra);font-weight:800;font-size:15px;' }, '정답은 ' + c.answer));
      }
      input.disabled = true; checkBtn.disabled = true; checkBtn.style.opacity = '0.5';
    };
    const submit = () => {
      const r = checkAnswer(input.value, c);
      if (r.empty) { input.focus(); return; }
      tries += 1;
      if (!r.correct && tries < 2) {
        verdictWrap.innerHTML = '';
        verdictWrap.append(h('span', { style: 'font-size:14.5px;color:var(--terra);line-height:1.6;' }, '다시 한 번 — 힌트: ' + (sol.core || '')));
        input.focus(); input.select();
        return;
      }
      doGrade(r.correct);
    };
    checkBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

    const left = h('div', { style: 'flex:1 1 57%;padding:48px 48px 40px 56px;border-right:1px solid var(--line);display:flex;flex-direction:column;' },
      h('div', { class: 'd1-eyebrow', style: 'color:var(--faint);' }, '문제 ' + (i + 1) + ' / ' + (queue.length || 1) + (c.module ? (' · ' + c.module) : '')),
      figs.length ? h('div', { style: 'margin-top:24px;' }, figs.map((f) => figureNode(f)).filter(Boolean)) : null,
      h('h1', { class: 'd1-sent', style: 'font-size:38px;margin-top:' + (figs.length ? '20px' : '8px') + ';' }, c.prompt || ''),
      h('div', { style: 'display:flex;gap:12px;margin-top:26px;align-items:center;' }, input, checkBtn),
      verdictWrap,
      pager(),
    );

    const steps = Array.isArray(sol.steps) ? sol.steps : [];
    const right = h('div', { style: 'flex:1 1 43%;padding:48px 56px 40px 48px;overflow-y:auto;' },
      h('div', { class: 'd1-panel-lab', style: 'margin-bottom:16px;' }, '풀이'),
      sol.core ? h('div', { class: 'd1-keybox' },
        h('div', { class: 'd1-panel-lab', style: 'color:var(--terra);margin-bottom:8px;' }, '핵심'),
        h('div', { style: 'font-size:16px;line-height:1.6;font-weight:500;' }, sol.core)) : null,
      steps.length ? h('div', { style: 'margin-top:24px;' },
        h('div', { class: 'd1-panel-lab' }, '단계로 보기'),
        h('div', { style: 'margin-top:4px;' }, steps.map((s, idx) => h('div', { class: 'd1-mathstep' + (idx === steps.length - 1 ? ' last' : '') }, h('span', { class: 'd1-mdot' }), s)))) : null,
      h('div', { style: 'display:grid;gap:22px;margin-top:24px;' },
        sol.idea ? sect('왜 이렇게 될까요', sol.idea) : null,
        sol.example ? sect('실생활에서는', sol.example) : null,
        sol.think ? sect('사고 포인트', sol.think) : null,
      ),
    );

    wrapRoot(h('div', { class: 'd1-main', style: 'padding:0;flex-direction:row;' }, left, right));
    if (!input.disabled) setTimeout(() => input.focus(), 0);
  }

  function render() {
    host.innerHTML = '';
    if (i >= queue.length) { renderDone(); return; }
    const c = queue[i]; tries = 0;
    { // 전 사이즈 = C 파이널 v2 (renderMathV2 내부 size 분기). 구 SessionLayout 미사용(후속 정리).
      renderMathV2(host, c, {
        size,
        idx: i, total: queue.length || 1, mode, figureNode,
        alreadyGraded: !!progress.done[c.id],
        alreadyGradedCorrect: progress.srs[c.id]?.lastResult !== 'no',
        passRate: weekPassRate(progress),
        onGrade: (correct) => gradeMath(c, correct),
        onNext: () => { i += 1; render(); },
        onJump: (n) => { i = Math.max(0, Math.min(queue.length - 1, n)); render(); },
        onHome: () => { window.location.hash = '#/home'; },
        onConceptDone: () => { progress.done[c.id] = true; if (!isDemoMode()) save(progress); i += 1; render(); },
      });
      return;
    }
    layout = createSessionLayout({
      size,
      kind: mode === 'review' ? 'review' : 'new',
      step: i + 1,
      total: queue.length || 1,
      tried, passed, time: '',
      onHome: () => { window.location.hash = '#/home'; },
      onEnd: () => { window.location.hash = '#/home'; },
      onStepClick: (step) => { i = Math.max(0, Math.min(queue.length - 1, step - 1)); render(); },
    });
    if (c.kind === 'concept') {
      const cm = buildConceptMain(c, size);
      layout.contentSlot.appendChild(cm.el);
      host.appendChild(layout.el);
      cm.nextBtn.onclick = () => { progress.done[c.id] = true; save(progress); i += 1; render(); };
      return;
    }
    const { wrap, input, checkBtn, verdict, nextWrap } = buildMathMain(c, size, mode);
    layout.contentSlot.appendChild(wrap);
    host.appendChild(layout.el);
    const submit = () => {
      const r = checkAnswer(input.value, c);
      if (r.empty) { input.focus(); return; }
      tries += 1;
      if (!r.correct && tries < 2) {
        verdict.style.cssText = 'margin-top:20px;color:var(--accent);font-size:15px;line-height:1.6;';
        verdict.textContent = `다시 한 번 — 힌트: ${c.solution.core}`;
        input.focus(); input.select();
        return;
      }
      reveal(c, r.correct, verdict, nextWrap, input, checkBtn);
    };
    checkBtn.onclick = submit;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    input.focus();
  }

  loadProblems().then((items) => { queue = buildQueue(items, progress, mode); render(); });
  const stop = watchSize((s) => { if (s !== size) { size = s; render(); } });
  return () => { host.innerHTML = ''; stop(); };
}

