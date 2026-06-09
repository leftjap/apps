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
import { createSceneHeader } from '../components/session/sceneHeader.js';
import { buildScenePage } from '../components/session/scenePage.js';
import { wrapWords, applyWordHighlight } from '../components/session/wordHighlight.js';
import { showWordSheet } from '../components/session/wordSheet.js';
import { recordErrorMessage, showRecordToast } from '../components/session/recordToast.js';
import { h } from '../components/d1/dom.js';
import { d1Icon } from '../components/d1/icons.js';
import { hiFragment } from '../components/d1/shared.js';
import { buildD1Side, buildD1Practice, exprOf, buildD1ExplainRight, buildD1DrillRows } from '../components/d1/sessionShell.js';

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
      try { window.studySpeech?.cancel?.(); } catch { /* noop */ }
      const r = advanceCard(state.cards, state.step);
      if (r.done) { endSession(true); return; }
      state.step = r.step;
      state.sentence = r.sentence || EMPTY_SENTENCE;
      state.recording = false;
      state.lastScore = null;
      rerender();
      saveSnapshot();
    },
    onJump: (step) => {
      if (!Number.isInteger(step) || step < 1 || step > state.cards.length) return;
      if (step === state.step) return;
      try { window.studySpeech?.cancel?.(); } catch { /* noop */ }
      state.step = step;
      state.sentence = pickCardFields(state.cards[step - 1]) || EMPTY_SENTENCE;
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

  // RealClass-mining: 첫 카드가 scene(전체 다이얼로그)이면 다이얼로그 페이지.
  const sceneEx = state.sentence?.explanation;
  const isDialogue = sceneEx && Array.isArray(sceneEx.dialogue);
  // 데스크탑 = D1 재디자인 (다이얼로그 / 표현별 학습). phone/tablet = 기존 경로 (아래).
  if (state.size === 'desktop') {
    return isDialogue ? renderD1Dialogue(host, state, handlers) : renderD1New(host, state, handlers);
  }

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
    onStepClick: handlers.onJump,
  });

  // phone/tablet 다이얼로그: 기존 scenePage → '시작하기'로 문장 카드 진입
  if (isDialogue) {
    const ttsLang = (state.sentence?.lang || getStoredLang()) === 'ja' ? 'ja-JP' : 'en-US';
    layout.contentSlot.appendChild(buildScenePage(sceneEx, {
      onListen: (t) => { if (t && window.studySpeech?.speak) window.studySpeech.speak(t, { lang: ttsLang }); },
      onNext: handlers.onNext,
    }));
    host.appendChild(layout.el);
    return { cleanup: () => { host.innerHTML = ''; }, layout };
  }

  const large = state.size !== 'phone';
  let playing = false;
  // listen wave: 듣기 버튼 내부 (재생 중만 노출, accent 색)
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
      if (state.recording) return; // 녹음 중엔 듣기 차단
      if (playing) {
        // 토글: 재생 중 클릭 → 중지
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
      window.studySpeech.speak(text, { lang, speaker: state.sentence?.speaker, onEnd: stopPlaying });
      // super-edge 안전망 (onEnd 미발화 시 30s)
      setTimeout(stopPlaying, 30000);
    },
  });
  // listen 버튼 내부에 wave 삽입 (옛 mocks/session.html 정본 정합)
  listen.el.appendChild(listenWave.el);
  // record wave: record 우측 (녹음 중만, danger 색)
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
          // 녹음 시작 실패 (권한 거부·미지원 등) — 즉시 idle 복귀, 통계 미반영
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
          // Azure 인식 실패·녹음 실패·네트워크 오류 — 점수/통계/하이라이트 미반영
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
        } catch (e) { console.error('[session-new] pron persist', e); }
        handlers.saveSnapshot?.();
      }
    },
  });

  const main = buildMain(state, { listen, recordCmp, waveEl: wave.el, pillWrap });
  layout.contentSlot.appendChild(main);

  applyExclusive(state.recording, playing, state.lastScore, wave, pillWrap);

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

  // en 가이드 §6.2 콩트 단위 학습 헤더 — scene_id 없으면 hidden (옛 카드 호환)
  const sceneHdr = createSceneHeader({ explanation: state.sentence?.explanation });
  wrap.appendChild(sceneHdr.el);

  const sizeMap = { phone: 30, tablet: 56, desktop: 72 };
  const h1 = document.createElement('h1');
  h1.className = 'poppins';
  h1.style.cssText = `font-size:${sizeMap[state.size]}px;font-weight:700;color:var(--text-strong);letter-spacing:-0.04em;line-height:${state.size === 'phone' ? 1.2 : 1.05};margin:0;`;
  h1.innerHTML = wrapWords(state.sentence.sentence);
  wrap.appendChild(h1);

  // ja 가이드 §3.1 reading top-level — 한자 든 문장에서 가나 reading 별도 표시.
  // sentence 와 다를 때만 표시 (Stage 1 한자 0개 카드는 sentence == reading 이라 자동 hidden).
  const readingVal = state.sentence?.reading;
  if (readingVal && readingVal !== state.sentence.sentence) {
    const readingEl = document.createElement('div');
    const readingSize = state.size === 'phone' ? 16 : (state.size === 'tablet' ? 19 : 20);
    const readingMt = state.size === 'phone' ? 10 : 14;
    readingEl.style.cssText = `font-size:${readingSize}px;color:var(--text-muted);margin-top:${readingMt}px;font-family:var(--font-display);`;
    readingEl.textContent = readingVal;
    wrap.appendChild(readingEl);
  }

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
  const drillRec = { ctrl: null };
  const explain = createExplanationPanel({
    explanation: state.sentence?.explanation,
    lang: state.sentence?.lang,
    onListen: (text) => {
      if (text && window.studySpeech?.speak) {
        window.studySpeech.speak(text, { lang: state.sentence?.lang === 'ja' ? 'ja-JP' : 'en-US' });
      }
    },
    onRecord: async (text, btn) => {
      if (drillRec.ctrl) {
        const ctrl = drillRec.ctrl;
        drillRec.ctrl = null;
        if (btn) { btn.dataset.on = '0'; btn.textContent = '녹음'; }
        const result = await stopAndAnalyze(ctrl, text, { lang: state.sentence?.lang });
        if (result?.mockFallback) showRecordToast(recordErrorMessage(result.fallbackReason));
        else showRecordToast(`발음 점수 ${Math.round(result?.score ?? 0)}점`);
        return;
      }
      const rec = await startMicRecording();
      if (rec.error) { showRecordToast(recordErrorMessage(rec.error)); return; }
      drillRec.ctrl = rec.controller;
      if (btn) { btn.dataset.on = '1'; btn.textContent = '녹음 중…'; }
    },
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

function applyExclusive(recording, playing, lastScore, recordWaveCmp, pillWrap) {
  // record wave: 녹음 중만 노출 (listen wave 는 듣기 버튼 내부에서 별도 제어)
  if (recordWaveCmp?.el) {
    recordWaveCmp.el.style.display = recording ? '' : 'none';
  }
  // pill: 녹음/재생 중 아니고 점수 있을 때
  pillWrap.style.display = (!recording && !playing && lastScore != null) ? '' : 'none';
}

/* ────────── D1 desktop — ② 다이얼로그(전체 장면) ──────────
 * 시드 dialogue 줄에는 hl 이 없으므로, 학습 표현 카드(state.cards[1..])의
 * sentence 를 다이얼로그 줄에 순차 정규화-매칭해 학습 줄 번호를 부여하고,
 * card.explanation.key 의 표현을 best-effort 하이라이트한다. (미매칭 줄은 맥락 줄)
 */
function deriveDialogue(sceneEx, cards) {
  const dialogue = Array.isArray(sceneEx?.dialogue) ? sceneEx.dialogue : [];
  const exprCards = (cards || []).filter((c) => c?.explanation?.key);
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  let ci = 0;
  return dialogue.map((line) => {
    let num = null, hl = [];
    const nl = norm(line.en);
    if (ci < exprCards.length) {
      const card = exprCards[ci];
      const nc = norm(card.sentence);
      if (nl && nc && nl.includes(nc)) {
        num = ci + 1;
        const expr = exprOf(card);
        if (expr) hl = [expr];
        ci += 1;
      }
    }
    return { spk: line.speaker || '', en: line.en || '', ko: line.ko || '', num, hl };
  });
}

function renderD1Dialogue(host, state, handlers) {
  const sceneEx = state.sentence.explanation;
  const lang = getStoredLang();
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  const subjLabel = lang === 'ja' ? '일본어' : '영어';
  const sceneTitle = sceneEx.sceneTitle || '오늘의 장면';
  const lines = deriveDialogue(sceneEx, state.cards);
  const exprCount = lines.filter((l) => l.num != null).length;

  const onListen = (t) => { if (t && window.studySpeech?.speak) window.studySpeech.speak(t, { lang: ttsLang }); };
  const speakAll = () => {
    const seq = lines.map((l) => l.en).filter(Boolean);
    let i = 0;
    const next = () => { if (i >= seq.length || !window.studySpeech?.speak) return; window.studySpeech.speak(seq[i++], { lang: ttsLang, onEnd: next }); };
    next();
  };

  const side = buildD1Side({
    mode: 'scene', subjLabel, timer: state.time,
    scene: sceneTitle, sceneMeta: exprCount ? ('표현 ' + exprCount + '개') : '',
    onHome: () => { window.location.hash = '#/home'; },
    onEnd: handlers.onEnd || (() => { window.location.hash = '#/home'; }),
  });

  const dlist = h('div', { class: 'd1-dlist', style: 'margin-top:20px;' },
    lines.map((l) => h('div', { class: 'd1-dline' + (l.num != null ? ' study' : '') },
      l.num != null ? h('div', { class: 'd1-dnum' }, String(l.num)) : h('div'),
      h('div', { class: 'd1-dspk' }, l.spk),
      h('div', { class: 'd1-den' }, hiFragment(l.en, l.hl)),
      h('div', { class: 'd1-dko' }, l.ko),
      h('button', { class: 'd1-dplay', 'aria-label': '듣기', onClick: () => onListen(l.en) }, d1Icon('play', 13)),
    )),
  );

  const main = h('div', { class: 'd1-main' },
    h('div', { class: 'd1-eyebrow', style: 'color:var(--faint);' }, '오늘의 장면'),
    h('h1', { class: 'd1-h1', style: 'margin-top:12px;' }, sceneTitle),
    sceneEx.sceneSummary ? h('div', { style: 'font-size:16px;color:var(--mut);margin-top:14px;line-height:1.5;max-width:720px;' }, sceneEx.sceneSummary) : null,
    h('div', { style: 'display:flex;gap:18px;margin-top:26px;align-items:center;' },
      h('button', { class: 'd1-btn d1-btn--outline', onClick: speakAll }, d1Icon('sound', 15), '전체 대화 듣기'),
      exprCount ? h('span', { style: 'display:inline-flex;align-items:center;gap:9px;font-size:13.5px;color:var(--mut);' },
        h('span', { style: 'width:20px;height:20px;border-radius:50%;border:1.5px solid var(--terra);color:var(--terra);font-size:10px;font-weight:700;display:grid;place-items:center;' }, '1'),
        '번호 표현 ' + exprCount + '개를 차례로 학습해요') : null,
    ),
    dlist,
    h('div', { style: 'flex:1;' }),
    h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-top:30px;max-width:760px;' },
      h('div', { style: 'font-size:13.5px;color:var(--faint);' }, '전체 대화를 한 번 듣고 넘어가세요.'),
      h('button', { class: 'd1-btn d1-btn--primary lg', onClick: handlers.onNext }, '표현 공부 시작하기'),
    ),
  );

  const root = h('div', { class: 'd1-root', style: 'min-height:100vh;min-height:100dvh;' }, side.el, main);
  host.appendChild(root);
  const layout = { update(s) { if (s && 'time' in s && side.timeEl) side.timeEl.textContent = s.time; } };
  return { cleanup: () => { try { window.studySpeech?.cancel?.(); } catch { /* noop */ } host.innerHTML = ''; }, layout };
}

/* ────────── D1 desktop — ③ 표현별 학습(신규) ──────────
 * 좌: 능동 연습 흐름(문장→듣기/따라말하기+점수→변주). 우: 해설(핵심/상황/실수/비슷한표현).
 * 녹음/채점은 기존 services(startMicRecording·stopAndAnalyze 등)를 그대로 재사용, D1 버튼으로 래핑.
 */
function renderD1New(host, state, handlers) {
  const lang = getStoredLang();
  const subjLabel = lang === 'ja' ? '일본어' : '영어';
  const s = state.sentence;
  const ex = s?.explanation || {};

  const hasScene = state.cards[0]?.explanation && Array.isArray(state.cards[0].explanation.dialogue);
  const offset = hasScene ? 1 : 0;
  const exprCards = state.cards.slice(offset);
  const total = exprCards.length;
  const idx = Math.max(1, state.step - offset);
  const sceneTitle = hasScene ? (state.cards[0].explanation.sceneTitle || '') : '';
  const items = exprCards.map((c, i) => ({ n: i + 1, t: exprOf(c) || c.sentence || ('표현 ' + (i + 1)) }));

  const side = buildD1Side({
    mode: 'new', subjLabel, timer: state.time, idx, total, items, showListenedBadge: hasScene,
    onHome: () => { window.location.hash = '#/home'; },
    onEnd: handlers.onEnd || (() => { window.location.hash = '#/home'; }),
    onJump: (n) => handlers.onJump?.(n + offset),
  });
  const layout = { update(st) { if (st && 'time' in st && side.timeEl) side.timeEl.textContent = st.time; } };
  let onCleanup = () => {};
  const wrapRoot = (main) => {
    const root = h('div', { class: 'd1-root', style: 'min-height:100vh;min-height:100dvh;' }, side.el, main);
    host.appendChild(root);
    return { cleanup: () => { try { onCleanup(); window.studySpeech?.cancel?.(); } catch { /* noop */ } host.innerHTML = ''; }, layout };
  };

  if (total === 0 || !s?.sentence) {
    return wrapRoot(h('div', { class: 'd1-main', style: 'align-items:center;justify-content:center;' },
      h('div', { style: 'text-align:center;color:var(--mut);' },
        h('div', { class: 'd1-h1', style: 'font-size:30px;' }, '학습할 표현이 없어요'),
        h('div', { style: 'margin-top:12px;' }, '홈에서 새 학습을 받아보세요.'))));
  }

  const hl = (() => { const e = exprOf(state.cards[state.step - 1] || {}); return e ? [e] : []; })();
  const practice = buildD1Practice(state, lang, { saveSnapshot: handlers.saveSnapshot });
  onCleanup = practice.stop;

  // ── 변주 연습 (drills) — 좌측 ──
  const drills = Array.isArray(ex.drills) ? ex.drills : [];
  const drillsBlock = drills.length ? h('div', { style: 'margin-top:40px;' },
    h('div', { class: 'd1-panel-lab' }, '변주 연습 — 듣고, 따라 말하고, 녹음하기'),
    h('div', { style: 'margin-top:4px;' }, buildD1DrillRows(drills, hl, lang)),
  ) : null;

  const pager = h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:32px;' },
    h('button', { class: 'd1-btn d1-btn--ghost', onClick: () => { if (state.step > 1) handlers.onJump?.(state.step - 1); } }, '이전'),
    h('button', { class: 'd1-btn d1-btn--outline', style: 'color:var(--terra);border-color:var(--terra);', onClick: handlers.onNext }, idx >= total ? '학습 완료' : '다음 표현'),
  );

  const left = h('div', { style: 'flex:1 1 57%;padding:48px 48px 40px 56px;border-right:1px solid var(--line);display:flex;flex-direction:column;' },
    h('div', { class: 'd1-eyebrow', style: 'color:var(--faint);' }, '표현 ' + idx + ' / ' + total + (sceneTitle ? (' · ' + sceneTitle) : '')),
    h('h1', { class: 'd1-sent', style: 'margin-top:18px;' }, hiFragment(s.sentence, hl)),
    h('div', { style: 'font-size:19px;color:var(--mut);margin-top:18px;line-height:1.5;' }, s.ko || ''),
    s.pron ? h('div', { style: 'font-size:14px;color:var(--faint);margin-top:8px;' }, s.pron) : null,
    h('div', { style: 'display:flex;gap:12px;margin-top:28px;' }, practice.listenBtn, practice.recBtn),
    practice.scoreRow,
    drillsBlock,
    pager,
  );

  const main = h('div', { class: 'd1-main', style: 'padding:0;flex-direction:row;' }, left, buildD1ExplainRight(ex, lang));
  return wrapRoot(main);
}
