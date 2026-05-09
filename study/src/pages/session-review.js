/* SessionReview page — 복습 (REVIEW)
 * 정본: ~/Downloads/_ _ _/variants/session-review-v2-tried-passed.jsx
 *
 * Wave A.1 (카드 로드):
 * - reviewQueue 의 due 카드 (nextReview <= today + 미정) 비동기 로드 → 첫 카드 표시
 * - 0장 시 empty 상태
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
import { loadReviewCards, loadFreeReviewCards, loadQueueFromSession, clearSessionQueue, getSessionReturnTo, pickCardFields, advanceCard } from './cardLoader.js';
import { formatElapsed } from '../utils/elapsed.js';
import { applySrsUpdate } from '../services/srs.js';
import { finishSession } from '../services/sessionFinish.js';
import { startMicRecording, stopAndAnalyze } from '../services/sessionAnalyze.js';
import { savePronunciationLog } from '../services/pronunciationLog.js';
import { applyWeakPhonemesUpdate } from '../services/weakPhonemes.js';
import { buildSummaryData, persistSummary } from '../services/summaryData.js';
import { saveActiveSession, clearActiveSession, loadActiveSession, restoreFromSnapshot } from '../services/activeSession.js';
import { showEndConfirm } from '../components/session/endConfirm.js';
import { createExplanationPanel } from '../components/session/explanationPanel.js';
import { wrapWords, applyWordHighlight } from '../components/session/wordHighlight.js';
import { showWordSheet } from '../components/session/wordSheet.js';
import { recordErrorMessage, showRecordToast } from '../components/session/recordToast.js';

const PASS_THRESHOLD = 80;
const EMPTY_SENTENCE = { sentence: '', pron: '', ko: '' };

function getStoredLang() {
  try { return sessionStorage.getItem('studyLang') === 'ja' ? 'ja' : 'en'; }
  catch { return 'en'; }
}

function getTodayISO() {
  return window.studyDay?.TODAY_ISO || new Date().toISOString().slice(0, 10);
}

export function mountSessionReview(host) {
  // Wave A.14 — '?mode=free' 인 경우 자유 복습 (spec §8-4). reviewQueue 전체 (due 무관) 최대 20장.
  const sessionMode = window.studyRoute?.params?.mode === 'free' ? 'free' : 'review';
  const state = {
    size: pickSize(),
    recording: false, // Wave A.7.1 — idle 초기 상태
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
    judged: { got: 0, hmm: 0, no: 0 },
    ended: false,
  };

  const saveSnapshot = () => {
    if (state.ended || !window.studyDB || !state.loaded) return;
    saveActiveSession(window.studyDB, {
      mode: sessionMode, lang: getStoredLang(), todayISO: getTodayISO(), startTime,
      step: state.step, tried: state.tried, passed: state.passed, lastScore: state.lastScore,
      pronScores: [...state.pronScores], weakInSession: { ...state.weakInSession },
      judged: { ...state.judged }, cardIds: state.cards.map((c) => c.id),
    }).catch((e) => console.error('[session-review] saveActiveSession', e));
  };
  const onVis = () => { if (document.hidden) saveSnapshot(); };

  const endSession = async (finishedAll) => {
    state.ended = true;
    const completedCount = finishedAll ? state.cards.length : Math.max(0, state.step - 1);
    const durationSec = Math.floor((Date.now() - startTime) / 1000);
    try {
      await finishSession(window.studyDB, {
        mode: sessionMode,
        lang: getStoredLang(),
        date: getTodayISO(),
        durationSec,
        tried: state.tried,
        passed: state.passed,
        completedReviewCount: completedCount,
      });
    } catch (e) {
      console.error('[session-review] finishSession', e);
    }
    // P2 — stats 진입 (goReview) 시 sessionStorage.studyReturnTo 가 'sentList' 또는 'stats' 로 설정됨.
    // 미설정 시 'home' (일반 진입). summary.js L98-99 가 returnTo 별 stats/sentList 라우팅 처리.
    const returnTo = (state.fromSessionQueue ? getSessionReturnTo() : 'home');
    persistSummary(buildSummaryData({
      mode: sessionMode, state, durationSec, completedReviewCount: completedCount, returnTo,
    }));
    try { await clearActiveSession(window.studyDB); }
    catch (e) { console.error('[session-review] clearActiveSession', e); }
    clearSessionQueue(); // P1/P2 — 1회성 큐 + returnTo 정리
    window.location.hash = '#/summary';
  };

  const handlers = {
    onJudge: async (kind) => {
      const currentCard = state.cards[state.step - 1];
      if (kind === 'got' || kind === 'hmm' || kind === 'no') state.judged[kind] += 1;
      try {
        await applySrsUpdate(window.studyDB, currentCard, kind, getTodayISO());
      } catch (e) {
        console.error('[session-review] applySrsUpdate', e);
      }
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

  // P1 — stats 클릭 진입 (goReview 가 저장한 studyReviewQueue) 우선 시도.
  // 큐 있으면 해당 카드만, 없으면 기존 due/free 폴백. fromSessionQueue 플래그는 endSession 의 returnTo 분기에 사용.
  Promise.all([
    (async () => {
      const queueCards = await loadQueueFromSession(window.studyDB, getStoredLang());
      if (queueCards && queueCards.length) {
        state.fromSessionQueue = true;
        return queueCards;
      }
      return sessionMode === 'free'
        ? loadFreeReviewCards(window.studyDB, getStoredLang(), 20)
        : loadReviewCards(window.studyDB, getStoredLang(), getTodayISO());
    })(),
    loadActiveSession(window.studyDB),
  ])
    .then(([cards, snapshot]) => {
      state.cards = cards;
      state.total = cards.length;
      const restore = restoreFromSnapshot(snapshot, cards, sessionMode);
      if (restore) {
        Object.assign(state, restore);
        startTime = restore.startTime;
        const idx = Math.max(0, restore.step - 1);
        state.sentence = pickCardFields(cards[idx]) || EMPTY_SENTENCE;
      } else {
        state.step = cards.length === 0 ? 0 : 1;
        state.sentence = pickCardFields(cards[0]) || EMPTY_SENTENCE;
        if (snapshot && snapshot.mode === sessionMode) clearActiveSession(window.studyDB).catch(() => {});
      }
      state.loaded = true;
      rerender();
    })
    .catch((e) => {
      console.error('[session-review] load + restore', e);
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

  // returnTo 별 좌상단 라벨 분기 — onHome 동작 (returnTo 별 라우팅) 과 일관.
  // fromSessionQueue 미설정 (일반 home 진입) 시 default '홈으로'.
  const renderReturnTo = state.fromSessionQueue ? getSessionReturnTo() : 'home';
  const homeLabel = renderReturnTo === 'stats' ? '캘린더로'
    : renderReturnTo === 'sentList' ? '문장 목록으로'
    : '홈으로';

  const layout = createSessionLayout({
    size: state.size,
    kind: 'review',
    step: state.step,
    total: state.total,
    tried: state.tried,
    passed: state.passed,
    recording: state.recording,
    time: state.time,
    homeLabel,
    onHome: () => {
      if (state.fromSessionQueue) {
        const rt = getSessionReturnTo();
        clearSessionQueue();
        if (rt === 'stats') { window.location.hash = '#/stats'; return; }
        if (rt === 'sentList') { window.location.hash = '#/stats?tab=sent'; return; }
      }
      window.location.hash = '#/home';
    },
    onEnd: handlers.onEnd || (() => { window.location.hash = '#/home'; }),
  });

  const large = state.size !== 'phone';
  let playing = false;
  const listenWave = createWaveform({ large, mode: 'listen' });
  listenWave.el.style.display = 'none';
  const stopPlaying = () => {
    if (!playing) return;
    playing = false;
    listen.update({ playing: false });
    listenWave.el.style.display = 'none';
  };
  const listen = createListenButton({
    large,
    onPlay: () => {
      if (state.recording) return;
      if (playing) {
        try { window.studySpeech?.cancel?.(); } catch { /* noop */ }
        stopPlaying();
        return;
      }
      const lang = (state.sentence?.lang || getStoredLang()) === 'ja' ? 'ja-JP' : 'en-US';
      const text = state.sentence?.sentence || '';
      if (!text || !window.studySpeech?.speak) return;
      playing = true;
      listen.update({ playing: true });
      listenWave.el.style.display = '';
      window.studySpeech.speak(text, { lang, rate: 0.85, onEnd: stopPlaying });
      setTimeout(stopPlaying, 30000);
    },
  });
  listen.el.appendChild(listenWave.el);
  const wave = createWaveform({ large, mode: 'record' });
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
        applyExclusive(true, playing, state.lastScore, wave, pillWrap);
        const rec = await startMicRecording();
        if (rec.error) {
          state.recording = false;
          state.recCtrl = null;
          recordCmp.update({ recording: false });
          layout.update({ recording: false });
          applyExclusive(false, playing, state.lastScore, wave, pillWrap);
          showRecordToast(recordErrorMessage(rec.error));
          return;
        }
        state.recCtrl = rec.controller;
      } else {
        const ctrl = state.recCtrl;
        state.recCtrl = null;
        const result = await stopAndAnalyze(ctrl, state.sentence.sentence, state.sentence);
        if (result?.mockFallback) {
          state.recording = false;
          recordCmp.update({ recording: false });
          layout.update({ recording: false });
          applyExclusive(false, playing, state.lastScore, wave, pillWrap);
          showRecordToast(recordErrorMessage(result.fallbackReason));
          return;
        }
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
        applyExclusive(false, playing, state.lastScore, wave, pillWrap);
        applyWordHighlight(main, result?.wordScores, {
          onBadClick: (w) => showWordSheet({ word: w, phonemeScores: result?.phonemeScores }),
        });
        try {
          await savePronunciationLog(window.studyDB, {
            result, sentenceId: state.sentence.id, lang: getStoredLang(), date: getTodayISO(),
          });
          await applyWeakPhonemesUpdate(window.studyDB, getStoredLang(), result?.weakPhonemes);
        } catch (e) { console.error('[session-review] pron persist', e); }
        handlers.saveSnapshot?.();
      }
    },
  });

  const main = buildMain(state, { listen, recordCmp, waveEl: wave.el, pillWrap });
  layout.contentSlot.appendChild(main);
  applyExclusive(state.recording, playing, state.lastScore, wave, pillWrap);

  // JudgeRow + "판정" 라벨
  const judgeSection = buildJudgeSection(state, handlers.onJudge);
  if (state.size === 'desktop') {
    main.appendChild(judgeSection); // main 내부 footer (margin-top:auto)
  } else {
    layout.el.appendChild(judgeSection); // page footer
  }

  host.appendChild(layout.el);
  return { cleanup: () => { host.innerHTML = ''; }, layout };
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
  h1.innerHTML = wrapWords(state.sentence.sentence);
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
  const exMt = state.size === 'phone' ? 28 : 32;
  const explain = createExplanationPanel({
    explanation: state.sentence?.explanation,
    lang: state.sentence?.lang,
  });
  explain.toggleEl.style.marginTop = `${exMt}px`;
  explain.toggleEl.style.alignSelf = 'flex-start';
  wrap.append(explain.toggleEl, explain.panelEl);

  return wrap;
}

function buildJudgeSection(state, onJudge) {
  const judge = createJudgeRow({
    size: state.size,
    onJudge: typeof onJudge === 'function' ? onJudge : () => {},
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

function applyExclusive(recording, playing, lastScore, recordWaveCmp, pillWrap) {
  if (recordWaveCmp?.el) {
    recordWaveCmp.el.style.display = recording ? '' : 'none';
  }
  pillWrap.style.display = (!recording && !playing && lastScore != null) ? '' : 'none';
}
