/* SessionNew page — 신규 학습 (NEW)
 * 정본: ~/Downloads/_ _ _/variants/session-new-v2-tried-passed.jsx
 *
 * 본 wave 범위 (plan §데이터 매핑):
 * - 시안 fallback 문장 ("I could use a coffee.") 노출
 * - 점수 = random 60-100 stub. TODO(별 wave): services/speech.js Azure pronunciation assessment 매핑
 * - PASS_THRESHOLD = 80
 */

import {
  createRecordButton,
  createListenButton,
  createWaveform,
  createScorePill,
  createSessionLayout,
  pickSize,
  watchSize,
} from '../components/session/index.js';

const PASS_THRESHOLD = 80;
const FALLBACK = { en: 'I could use a coffee.', pron: '아이 쿠 쥬즈 어 커피', ko: '커피 한잔 마시고 싶다.' };

export function mountSessionNew(host) {
  const state = {
    size: pickSize(),
    recording: true,
    tried: 7,
    passed: 5,
    lastScore: 82,
    step: 1,
    total: 3,
    time: '00:08',
    sentence: FALLBACK,
  };

  let cleanup = render(host, state);
  const stop = watchSize((s) => {
    if (s !== state.size) {
      state.size = s;
      cleanup();
      cleanup = render(host, state);
    }
  });
  return () => { cleanup(); stop(); };
}

function render(host, state) {
  host.innerHTML = '';

  const layout = createSessionLayout({
    size: state.size,
    kind: 'new',
    step: state.step,
    total: state.total,
    tried: state.tried,
    passed: state.passed,
    recording: state.recording,
    time: state.time,
    onHome: () => { window.location.hash = '#/home'; },
    onEnd: () => { window.location.hash = '#/home'; },
  });

  const large = state.size !== 'phone';
  const listen = createListenButton({ large });
  const wave = createWaveform({ large });
  const pillCmp = createScorePill({
    score: state.lastScore || 0,
    passed: state.lastScore != null && state.lastScore >= PASS_THRESHOLD,
    large,
  });
  const pillWrap = document.createElement('span');
  pillWrap.style.marginLeft = state.size === 'desktop' ? '8px' : (state.size === 'tablet' ? '6px' : '4px');
  pillWrap.appendChild(pillCmp.el);

  const recordCmp = createRecordButton({
    recording: state.recording,
    large,
    onToggle: () => {
      if (state.recording) {
        const score = Math.floor(60 + Math.random() * 40); // TODO(별 wave): Azure
        state.lastScore = score;
        state.tried += 1;
        if (score >= PASS_THRESHOLD) state.passed += 1;
        state.recording = false;
        pillCmp.update({ score, passed: score >= PASS_THRESHOLD });
      } else {
        state.recording = true;
      }
      recordCmp.update({ recording: state.recording });
      layout.update({ tried: state.tried, passed: state.passed, recording: state.recording });
      applyExclusive(state.recording, state.lastScore, wave.el, pillWrap);
    },
  });

  const main = buildMain(state, { listen, recordCmp, waveEl: wave.el, pillWrap });
  layout.contentSlot.appendChild(main);

  applyExclusive(state.recording, state.lastScore, wave.el, pillWrap);

  // 다음 문장 버튼
  const nextWrap = makeNextBtn(state.size);
  if (state.size === 'desktop') {
    main.appendChild(nextWrap); // main 안 footer (margin-top:auto)
  } else {
    layout.el.appendChild(nextWrap); // page footer
  }

  host.appendChild(layout.el);
  return () => { host.innerHTML = ''; };
}

function buildMain(state, ctrl) {
  const wrap = document.createElement('div');
  wrap.className = 'session-main';
  if (state.size === 'desktop') {
    wrap.style.cssText = 'display:flex;flex-direction:column;flex:1;';
  }

  const sizeMap = { phone: 30, tablet: 56, desktop: 72 };
  const h1 = document.createElement('h1');
  h1.className = 'poppins';
  h1.style.cssText = `font-size:${sizeMap[state.size]}px;font-weight:700;color:var(--text-strong);letter-spacing:-0.04em;line-height:${state.size === 'phone' ? 1.2 : 1.05};margin:0;`;
  if (state.size === 'desktop') h1.innerHTML = 'I could use<br/>a coffee.';
  else h1.textContent = state.sentence.en;
  wrap.appendChild(h1);

  const pron = document.createElement('div');
  const pronSize = state.size === 'phone' ? 14 : (state.size === 'tablet' ? 17 : 18);
  const pronMt  = state.size === 'phone' ? 14 : (state.size === 'tablet' ? 22 : 24);
  pron.style.cssText = `font-size:${pronSize}px;color:var(--text-faint);margin-top:${pronMt}px;font-family:var(--font-display);`;
  pron.textContent = state.sentence.pron;
  wrap.appendChild(pron);

  const ko = document.createElement('div');
  const koSize = state.size === 'phone' ? 16 : (state.size === 'tablet' ? 20 : 22);
  const koMt = state.size === 'desktop' ? 8 : 6;
  ko.style.cssText = `font-size:${koSize}px;color:var(--text-muted);margin-top:${koMt}px;`;
  ko.textContent = state.sentence.ko;
  wrap.appendChild(ko);

  const ctrlRow = document.createElement('div');
  const ctrlMt = state.size === 'phone' ? 36 : 56;
  const ctrlGap = state.size === 'phone' ? 8 : (state.size === 'tablet' ? 10 : 12);
  ctrlRow.style.cssText = `display:flex;gap:${ctrlGap}px;margin-top:${ctrlMt}px;align-items:center;flex-wrap:wrap;`;
  ctrlRow.append(ctrl.listen.el, ctrl.recordCmp.el, ctrl.waveEl, ctrl.pillWrap);
  wrap.appendChild(ctrlRow);

  const explain = document.createElement('button');
  explain.type = 'button';
  const exMt = state.size === 'phone' ? 32 : 40;
  const exFs = state.size === 'phone' ? 13 : 14;
  explain.style.cssText = `background:none;border:none;display:flex;align-items:center;gap:6px;color:var(--text-muted);font-size:${exFs}px;padding:0;margin-top:${exMt}px;cursor:pointer;font-family:var(--font-body);align-self:flex-start;`;
  explain.innerHTML = `해설 보기 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
  explain.addEventListener('click', () => console.warn('[explain] stub — Wave N'));
  wrap.appendChild(explain);

  return wrap;
}

function makeNextBtn(size) {
  const btn = document.createElement('button');
  btn.type = 'button';
  const padding = size === 'desktop' ? '18px 36px' : (size === 'tablet' ? '18px 0' : '14px');
  const fontSize = size === 'phone' ? 15 : 16;
  const width = size === 'desktop' ? 'auto' : '100%';
  btn.style.cssText = `background:transparent;border:1px solid var(--accent);color:var(--accent);border-radius:var(--r-md);padding:${padding};font-size:${fontSize}px;font-family:var(--font-body);cursor:pointer;width:${width};`;
  btn.textContent = '다음 문장 →';
  btn.addEventListener('click', () => console.warn('[next] stub — Wave N'));

  if (size === 'desktop') {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:auto;padding-top:60px;align-self:flex-start;';
    wrap.appendChild(btn);
    return wrap;
  }
  const sec = document.createElement('section');
  sec.style.cssText = size === 'tablet' ? 'padding:24px 56px 48px;' : 'padding:20px 24px 32px;';
  sec.appendChild(btn);
  return sec;
}

function applyExclusive(recording, lastScore, waveEl, pillWrap) {
  waveEl.style.display = recording ? '' : 'none';
  pillWrap.style.display = (!recording && lastScore != null) ? '' : 'none';
}
