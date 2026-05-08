/* SessionNew page — 신규 학습 (NEW)
 * 정본: ~/Downloads/_ _ _/variants/session-new-v2-tried-passed.jsx
 *
 * Wave A.1 (카드 로드):
 * - todayLessons 의 미완료 신규 카드 비동기 로드 → 첫 카드 표시
 * - 0장 시 empty 상태 (sentence 빈 문자열, total=0, step=0)
 * 다음 sub-wave: 다음 카드 전환 / 발음 평가 / 타이머 / 종료 저장
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
import { loadNewCards, pickCardFields, advanceCard } from './cardLoader.js';
import { formatElapsed } from '../utils/elapsed.js';
import { finishSession } from '../services/sessionFinish.js';
import { startMicRecording, stopAndAnalyze } from '../services/sessionAnalyze.js';
import { savePronunciationLog } from '../services/pronunciationLog.js';
import { applyWeakPhonemesUpdate } from '../services/weakPhonemes.js';
import { buildSummaryData, persistSummary } from '../services/summaryData.js';
import { saveActiveSession, clearActiveSession, loadActiveSession, restoreFromSnapshot } from '../services/activeSession.js';
import { showEndConfirm } from '../components/session/endConfirm.js';
import { createExplanationPanel } from '../components/session/explanationPanel.js';
import { wrapWords, applyWordHighlight } from '../components/session/wordHighlight.js';

const PASS_THRESHOLD = 80;
const EMPTY_SENTENCE = { sentence: '', pron: '', ko: '' };

function getStoredLang() {
  try { return sessionStorage.getItem('studyLang') === 'ja' ? 'ja' : 'en'; }
  catch { return 'en'; }
}

function getTodayISO() {
  return window.studyDay?.TODAY_ISO || new Date().toISOString().slice(0, 10);
}

export function mountSessionNew(host) {
  const state = {
    size: pickSize(),
    recording: false, // Wave A.7.1 — idle 초기 상태. 클릭 → mic 시작
    tried: 0,
    passed: 0,
    lastScore: null,
    step: 1,
    total: 0,
    time: '00:00',
    sentence: EMPTY_SENTENCE,
    cards: [],
    loaded: false,
    recCtrl: null,
    pronScores: [],
    weakInSession: {},
    ended: false,
  };

  const saveSnapshot = () => {
    if (state.ended || !window.studyDB || !state.loaded) return;
    saveActiveSession(window.studyDB, {
      mode: 'new', lang: getStoredLang(), todayISO: getTodayISO(), startTime,
      step: state.step, tried: state.tried, passed: state.passed, lastScore: state.lastScore,
      pronScores: [...state.pronScores], weakInSession: { ...state.weakInSession },
      cardIds: state.cards.map((c) => c.id),
    }).catch((e) => console.error('[session-new] saveActiveSession', e));
  };
  const onVis = () => { if (document.hidden) saveSnapshot(); };

  const endSession = async (finishedAll) => {
    state.ended = true;
    const completedCount = finishedAll ? state.cards.length : Math.max(0, state.step - 1);
    const durationSec = Math.floor((Date.now() - startTime) / 1000);
    try {
      await finishSession(window.studyDB, {
        mode: 'new',
        lang: getStoredLang(),
        date: getTodayISO(),
        durationSec,
        tried: state.tried,
        passed: state.passed,
        completedNewCards: state.cards.slice(0, completedCount),
      });
    } catch (e) {
      console.error('[session-new] finishSession', e);
    }
    persistSummary(buildSummaryData({
      mode: 'new', state, durationSec, completedNewCount: completedCount, returnTo: 'home',
    }));
    try { await clearActiveSession(window.studyDB); }
    catch (e) { console.error('[session-new] clearActiveSession', e); }
    window.location.hash = '#/summary';
  };

  const handlers = {
    onNext: () => {
      const r = advanceCard(state.cards, state.step);
      if (r.done) { endSession(true); return; }
      state.step = r.step;
      state.sentence = r.sentence || EMPTY_SENTENCE;
      state.recording = false;
      state.lastScore = null;
      rerender();
      saveSnapshot();
    },
    onEnd: () => showEndConfirm({ onConfirm: () => endSession(false) }),
    saveSnapshot,
  };

  let r = render(host, state, handlers);
  let cleanup = r.cleanup;
  let layoutRef = r.layout;
  const rerender = () => {
    cleanup();
    const next = render(host, state, handlers);
    cleanup = next.cleanup;
    layoutRef = next.layout;
  };

  let startTime = Date.now();
  document.addEventListener('visibilitychange', onVis);
  const tickId = setInterval(() => {
    state.time = formatElapsed(Date.now() - startTime);
    layoutRef?.update({ time: state.time });
  }, 1000);

  const stop = watchSize((s) => {
    if (s !== state.size) {
      state.size = s;
      rerender();
    }
  });

  Promise.all([
    loadNewCards(window.studyDB, getStoredLang(), getTodayISO()),
    loadActiveSession(window.studyDB),
  ])
    .then(([cards, snapshot]) => {
      state.cards = cards;
      state.total = cards.length;
      const restore = restoreFromSnapshot(snapshot, cards, 'new');
      if (restore) {
        Object.assign(state, restore);
        startTime = restore.startTime;
        const idx = Math.max(0, restore.step - 1);
        state.sentence = pickCardFields(cards[idx]) || EMPTY_SENTENCE;
      } else {
        state.step = cards.length === 0 ? 0 : 1;
        state.sentence = pickCardFields(cards[0]) || EMPTY_SENTENCE;
        // mode 일치하나 cardIds 불일치 → 스테일 snapshot 정리
        if (snapshot && snapshot.mode === 'new') clearActiveSession(window.studyDB).catch(() => {});
      }
      state.loaded = true;
      rerender();
    })
    .catch((e) => {
      console.error('[session-new] load + restore', e);
      state.loaded = true;
      rerender();
    });

  return () => {
    cleanup(); stop(); clearInterval(tickId);
    document.removeEventListener('visibilitychange', onVis);
    if (!state.ended) saveSnapshot();
    if (state.recCtrl?.stop) { try { state.recCtrl.stop(); } catch { /* noop */ } state.recCtrl = null; }
  };
}

function render(host, state, handlers = {}) {
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
    onEnd: handlers.onEnd || (() => { window.location.hash = '#/home'; }),
  });

  const large = state.size !== 'phone';
  const listen = createListenButton({
    large,
    onPlay: () => {
      const lang = (state.sentence?.lang || getStoredLang()) === 'ja' ? 'ja-JP' : 'en-US';
      window.studySpeech?.speak(state.sentence?.sentence || '', { lang });
    },
  });
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
    onToggle: async () => {
      if (!state.recording) {
        state.recording = true;
        recordCmp.update({ recording: true });
        layout.update({ recording: true });
        applyExclusive(true, state.lastScore, wave.el, pillWrap);
        state.recCtrl = await startMicRecording();
      } else {
        const ctrl = state.recCtrl;
        state.recCtrl = null;
        const result = await stopAndAnalyze(ctrl, state.sentence.sentence, state.sentence);
        const score = Number(result?.score) || 0;
        state.lastScore = score;
        state.tried += 1;
        if (score >= PASS_THRESHOLD) state.passed += 1;
        state.pronScores.push(score);
        if (Array.isArray(result?.weakPhonemes)) {
          for (const ph of result.weakPhonemes) {
            if (typeof ph === 'string' && ph) state.weakInSession[ph] = (state.weakInSession[ph] || 0) + 1;
          }
        }
        state.recording = false;
        pillCmp.update({ score, passed: score >= PASS_THRESHOLD });
        recordCmp.update({ recording: false });
        layout.update({ tried: state.tried, passed: state.passed, recording: false });
        applyExclusive(false, state.lastScore, wave.el, pillWrap);
        applyWordHighlight(main, result?.wordScores);
        try {
          await savePronunciationLog(window.studyDB, {
            result, sentenceId: state.sentence.id, lang: getStoredLang(), date: getTodayISO(),
          });
          await applyWeakPhonemesUpdate(window.studyDB, getStoredLang(), result?.weakPhonemes);
        } catch (e) { console.error('[session-new] pron persist', e); }
        handlers.saveSnapshot?.();
      }
    },
  });

  const main = buildMain(state, { listen, recordCmp, waveEl: wave.el, pillWrap });
  layout.contentSlot.appendChild(main);

  applyExclusive(state.recording, state.lastScore, wave.el, pillWrap);

  // 다음 문장 버튼
  const nextWrap = makeNextBtn(state.size, handlers.onNext);
  if (state.size === 'desktop') {
    main.appendChild(nextWrap); // main 안 footer (margin-top:auto)
  } else {
    layout.el.appendChild(nextWrap); // page footer
  }

  host.appendChild(layout.el);
  return { cleanup: () => { host.innerHTML = ''; }, layout };
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
  h1.innerHTML = wrapWords(state.sentence.sentence);
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

  const exMt = state.size === 'phone' ? 32 : 40;
  const explain = createExplanationPanel({
    explanation: state.sentence?.explanation,
    lang: state.sentence?.lang,
  });
  explain.toggleEl.style.marginTop = `${exMt}px`;
  explain.toggleEl.style.alignSelf = 'flex-start';
  wrap.append(explain.toggleEl, explain.panelEl);

  return wrap;
}

function makeNextBtn(size, onNext) {
  const btn = document.createElement('button');
  btn.type = 'button';
  const padding = size === 'desktop' ? '18px 36px' : (size === 'tablet' ? '18px 0' : '14px');
  const fontSize = size === 'phone' ? 15 : 16;
  const width = size === 'desktop' ? 'auto' : '100%';
  btn.style.cssText = `background:transparent;border:1px solid var(--accent);color:var(--accent);border-radius:var(--r-md);padding:${padding};font-size:${fontSize}px;font-family:var(--font-body);cursor:pointer;width:${width};`;
  btn.textContent = '다음 문장 →';
  if (typeof onNext === 'function') btn.addEventListener('click', onNext);

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
