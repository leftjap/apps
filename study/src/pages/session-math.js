import '../styles/math.css';
import { MATH_CONTENT } from '../data/math/index.js';
import { checkAnswer } from '../services/mathAnswer.js';
import { nextSrsState } from '../services/srs.js';

const LS_KEY = 'mathProgress';
const todayISO = () => (window.studyDay?.TODAY_ISO || new Date().toISOString().slice(0, 10));

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || { done: {}, srs: {} }; }
  catch { return { done: {}, srs: {} }; }
}
function save(p) { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* noop */ } }

function buildQueue(p) {
  const today = todayISO();
  const due = MATH_CONTENT.filter((c) => p.srs[c.id] && p.srs[c.id].nextReview <= today);
  const fresh = MATH_CONTENT.filter((c) => !p.done[c.id] && !p.srs[c.id]);
  return [...due, ...fresh].slice(0, 3); // 하루 2~3문제
}

function dotsSvg(n) {
  const colors = ['#b44d3b', '#c98a2e', '#6f8a52', '#4f7a8c', '#8c6f9e'];
  const gap = 44, off = 24, r = 13;
  let dots = '';
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      dots += `<circle cx="${off + col * gap}" cy="${off + row * gap}" r="${r}" fill="${colors[Math.max(col, row) % colors.length]}"/>`;
    }
  }
  const size = off * 2 + (n - 1) * gap;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${n}x${n} 점 격자">${dots}</svg>`;
}
function figureHtml(f) {
  if (!f) return '';
  if (f.type === 'dots') return `<div class="m-fig">${dotsSvg(f.n || 5)}</div>`;
  if (f.type === 'svg') return `<div class="m-fig">${f.svg}</div>`;
  return '';
}
function solHtml(s) {
  return '<div class="m-sol">'
    + `<p><b>핵심</b> ${s.core}</p>`
    + (s.idea ? `<p>${s.idea}</p>` : '')
    + `<p><b>풀이</b> ${s.steps.join('  →  ')}</p>`
    + (s.refresh ? `<p class="k">🔧 환기: ${s.refresh}</p>` : '')
    + (s.example ? `<p><b>예시</b> ${s.example}</p>` : '')
    + (s.think ? `<p><b>사고 포인트</b> ${s.think}</p>` : '')
    + '</div>';
}

export function mountSessionMath(host) {
  const progress = load();
  const queue = buildQueue(progress);
  let i = 0, tries = 0;

  function renderDone() {
    host.innerHTML = '<div class="m-wrap"><div class="m-done"><div class="big">잘했어요</div>'
      + '<p style="color:var(--text-muted);margin-top:8px">오늘 분량 끝. 틀린 문제는 며칠 뒤 다시 나옵니다.</p>'
      + '<div class="m-actions" style="justify-content:center"><button class="m-btn" id="m-home">홈으로</button></div></div></div>';
    host.querySelector('#m-home').onclick = () => { window.location.hash = '#/home'; };
  }

  function render() {
    if (i >= queue.length) { renderDone(); return; }
    const c = queue[i]; tries = 0;
    host.innerHTML = '<div class="m-wrap">'
      + '<div class="m-eyebrow">수학 사고력</div>'
      + `<div class="m-progress">${i + 1} / ${queue.length}</div>`
      + '<div class="m-card">'
      + `<span class="m-tag">${c.tag || ''}</span>`
      + (c.lesson ? `<div class="m-lesson">${c.lesson}</div>` : '')
      + figureHtml(c.figure)
      + (c.legend ? `<div class="m-legend">${c.legend}</div>` : '')
      + `<div class="m-q">${c.prompt}</div>`
      + '<div class="m-row"><input class="m-input" id="m-in" placeholder="답을 입력" />'
      + '<button class="m-btn" id="m-check">확인</button></div>'
      + '<div class="m-result" id="m-res"></div>'
      + '</div></div>';
    const input = host.querySelector('#m-in');
    const res = host.querySelector('#m-res');

    const reveal = (correct) => {
      const kind = correct ? (tries > 1 ? 'hmm' : 'got') : 'no';
      res.className = 'm-result show ' + (correct ? 'ok' : 'no');
      res.innerHTML = `<div class="m-verdict">${correct ? `정답! · ${c.answer}` : `정답은 ${c.answer}`}</div>` + solHtml(c.solution);
      const st = nextSrsState(progress.srs[c.id]?.interval ?? 0, kind, todayISO());
      progress.done[c.id] = true;
      if (st.graduate) delete progress.srs[c.id];
      else progress.srs[c.id] = { interval: st.interval, nextReview: st.nextReview, lastResult: kind };
      save(progress);
      const btn = host.querySelector('#m-check');
      btn.outerHTML = '<button class="m-btn" id="m-next">다음 →</button>';
      host.querySelector('#m-next').onclick = () => { i++; render(); };
    };

    host.querySelector('#m-check').onclick = () => {
      const r = checkAnswer(input.value, c);
      if (r.empty) { input.focus(); return; }
      tries++;
      if (r.correct || tries >= 2) { reveal(r.correct); return; }
      res.className = 'm-result show no';
      res.innerHTML = `<div class="m-verdict">다시 한 번 — 힌트: ${c.solution.core}</div>`;
      input.focus(); input.select();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') host.querySelector('#m-check')?.click(); });
    input.focus();
  }

  render();
  return () => { host.innerHTML = ''; };
}
