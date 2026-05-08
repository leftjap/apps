/* SessionReview page — 복습 (REVIEW)
 * 정본: ~/Downloads/_ _ _/variants/session-review-v2-tried-passed.jsx
 *
 * 신규와 차이 (HANDOFF §3.3):
 *   1. kind = 'review' (사이드바·라벨 sage)
 *   2. progress 5칸
 *   3. 본문 위 · ANSWER eyebrow
 *   4. 하단 다음 문장 → 대신 JudgeRow 3버튼
 */

import {
  createRecordButton,
  createListenButton,
  createWaveform,
  createScorePill,
  createJudgeRow,
  createSessionLayout,
  pickSize,
  watchSize,
} from '../components/session/index.js';

const PASS_THRESHOLD = 80;
const FALLBACK = { en: "I'm not gonna lie", pron: '아임 낫 거나 라이', ko: '솔직히 말하면' };

export function mountSessionReview(host) {
  const state = {
    size: pickSize(),
    recording: true,
    tried: 8,
    passed: 6,
    lastScore: 91,
    step: 1,
    total: 5,
    time: '00:21',
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
    kind: 'review',
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

  // JudgeRow + "판정" 라벨
  const judgeSection = buildJudgeSection(state);
  if (state.size === 'desktop') {
    main.appendChild(judgeSection); // main 내부 footer (margin-top:auto)
  } else {
    layout.el.appendChild(judgeSection); // page footer
  }

  host.appendChild(layout.el);
  return () => { host.innerHTML = ''; };
}

function buildMain(state, ctrl) {
  const wrap = document.createElement('div');
  wrap.className = 'session-main';
  if (state.size === 'desktop') wrap.style.cssText = 'display:flex;flex-direction:column;flex:1;';

  // · ANSWER eyebrow
  const eb = document.createElement('div');
  const ebFs = state.size === 'phone' ? 11 : 12;
  const ebMb = state.size === 'phone' ? 14 : 16;
  const ebLs = state.size === 'phone' ? '0.12em' : '0.14em';
  eb.style.cssText = `font-size:${ebFs}px;color:var(--sage);text-transform:uppercase;letter-spacing:${ebLs};font-family:var(--font-display);font-weight:600;margin-bottom:${ebMb}px;`;
  eb.textContent = '· ANSWER';
  wrap.appendChild(eb);

  // h1 — phone 30 / tablet 56 / desktop 64
  const sizeMap = { phone: 30, tablet: 56, desktop: 64 };
  const h1 = document.createElement('h1');
  h1.className = 'poppins';
  h1.style.cssText = `font-size:${sizeMap[state.size]}px;font-weight:700;color:var(--text-strong);letter-spacing:-0.04em;line-height:${state.size === 'phone' ? 1.2 : (state.size === 'tablet' ? 1.1 : 1.05)};margin:0;`;
  h1.textContent = state.sentence.en;
  wrap.appendChild(h1);

  const pron = document.createElement('div');
  const pronSize = state.size === 'phone' ? 14 : (state.size === 'tablet' ? 17 : 18);
  const pronMt = state.size === 'phone' ? 14 : 22;
  pron.style.cssText = `font-size:${pronSize}px;color:var(--text-faint);margin-top:${pronMt}px;font-family:var(--font-display);`;
  pron.textContent = state.sentence.pron;
  wrap.appendChild(pron);

  const ko = document.createElement('div');
  const koSize = state.size === 'phone' ? 16 : (state.size === 'tablet' ? 20 : 22);
  ko.style.cssText = `font-size:${koSize}px;color:var(--text-muted);margin-top:6px;`;
  ko.textContent = state.sentence.ko;
  wrap.appendChild(ko);

  // 컨트롤 row (동일)
  const ctrlRow = document.createElement('div');
  const ctrlMt = state.size === 'phone' ? 32 : 48;
  const ctrlGap = state.size === 'phone' ? 8 : (state.size === 'tablet' ? 10 : 12);
  ctrlRow.style.cssText = `display:flex;gap:${ctrlGap}px;margin-top:${ctrlMt}px;align-items:center;flex-wrap:wrap;`;
  ctrlRow.append(ctrl.listen.el, ctrl.recordCmp.el, ctrl.waveEl, ctrl.pillWrap);
  wrap.appendChild(ctrlRow);

  // 해설 보기
  const explain = document.createElement('button');
  explain.type = 'button';
  const exMt = state.size === 'phone' ? 28 : 32;
  const exFs = state.size === 'phone' ? 13 : 14;
  explain.style.cssText = `background:none;border:none;display:flex;align-items:center;gap:6px;color:var(--text-muted);font-size:${exFs}px;padding:0;margin-top:${exMt}px;cursor:pointer;font-family:var(--font-body);align-self:flex-start;`;
  explain.innerHTML = `해설 보기 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
  explain.addEventListener('click', () => console.warn('[explain] stub — Wave N'));
  wrap.appendChild(explain);

  return wrap;
}

function buildJudgeSection(state) {
  const judge = createJudgeRow({
    size: state.size,
    onJudge: (kind) => console.log(`[judge] ${kind} — Wave N (sessionStats 별 wave)`),
  });

  const judgeLabel = document.createElement('div');
  const lblFs = state.size === 'phone' ? 10 : 11;
  const lblMb = state.size === 'phone' ? 12 : 14;
  const lblTa = state.size === 'phone' ? 'text-align:center;' : '';
  judgeLabel.style.cssText = `font-size:${lblFs}px;color:var(--text-muted);text-transform:uppercase;letter-spacing:${state.size === 'phone' ? '0.12em' : '0.14em'};margin-bottom:${lblMb}px;font-family:var(--font-display);${lblTa}`;
  judgeLabel.textContent = '판정';

  if (state.size === 'desktop') {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:auto;padding-top:56px;';
    wrap.append(judgeLabel, judge.el);
    return wrap;
  }

  const sec = document.createElement('section');
  const pad = state.size === 'tablet' ? 'padding:24px 56px 48px;' : 'padding:16px 24px 28px;';
  sec.style.cssText = pad;
  sec.append(judgeLabel, judge.el);
  return sec;
}

function applyExclusive(recording, lastScore, waveEl, pillWrap) {
  waveEl.style.display = recording ? '' : 'none';
  pillWrap.style.display = (!recording && lastScore != null) ? '' : 'none';
}
