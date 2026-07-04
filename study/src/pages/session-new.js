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
import { loadNewCards, loadReplayCards, pickCardFields, advanceCard } from './cardLoader.js';
import { formatElapsed } from '../utils/elapsed.js';
import { localISODate } from '../utils/today.js';
import { finishSession, flushLiveStats, clampSessionDuration } from '../services/sessionFinish.js';
import { startMicRecording, stopAndAnalyze } from '../services/sessionAnalyze.js';
import { savePronunciationLog } from '../services/pronunciationLog.js';
import { applyWeakPhonemesUpdate } from '../services/weakPhonemes.js';
import { buildSummaryData, persistSummary } from '../services/summaryData.js';
import { saveActiveSession, clearActiveSession, loadActiveSession, restoreFromSnapshot } from '../services/activeSession.js';
import { createActiveTimer } from '../services/activeTimer.js';
import { getSceneShadow, setSceneShadow, clearSceneShadow } from '../services/sceneProgress.js';
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
import { buildD1Side, buildD1Practice, exprOf, buildD1ExplainRight, buildD1DrillRows, bumpRecLog, canAdvance, REC_TARGET } from '../components/d1/sessionShell.js';
import { renderDialogueV2 } from './dialogueV2.js';
import { renderSessionExprV2 } from './sessionExprV2.js';
import { demoNewCards, DEMO_EXCLUDE_IDS } from './sessionNewDemo.js';

const PASS_THRESHOLD = 80;
const EMPTY_SENTENCE = { sentence: '', pron: '', ko: '' };

// 데모 모드 (?demo=1) — 인증/DB 없이 시안 검증. view=dialog(기본)|session.
function isDemoMode() {
  try { return new URLSearchParams(window.location.search).get('demo') === '1'; }
  catch { return false; }
}
function demoView() {
  try { return new URLSearchParams(window.location.search).get('view') === 'session' ? 'session' : 'dialog'; }
  catch { return 'dialog'; }
}

function getStoredLang() {
  try { return sessionStorage.getItem('studyLang') === 'ja' ? 'ja' : 'en'; }
  catch { return 'en'; }
}

function getTodayISO() {
  return window.studyDay?.TODAY_ISO || localISODate();
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
    recLog: {}, // 카드별 녹음 진행 (count/best) — 버튼 상태·점수 안착·진행 게이트 (2026-06-10)
    ended: false,
    base: null, // 세션 시작 시 캡처한 그날 dailyStats — 진행 중 라이브 반영 기준점(이중집계 방지)
    replay: false, // 다시 듣기 — 완료 그룹 재청취(읽기전용). finishSession·스냅샷·라이브통계 건너뜀(SRS 리셋·이중집계 방지)
  };

  // 활성 시간 타이머 — 가시+비유휴 구간만 누적 (벽시계 방치 폭주 차단)
  const activeTimer = createActiveTimer();

  const saveSnapshot = () => {
    // 데모(?demo=1)는 실 meta('activeSession')에 절대 쓰지 않는다 (격리). 인증 SPA 에서도 안전.
    if (isDemoMode() || state.replay || state.ended || !window.studyDB || !state.loaded) return;
    const snap = {
      mode: 'new', lang: getStoredLang(), todayISO: getTodayISO(), startTime, activeSec: activeTimer.seconds(), base: state.base,
      step: state.step, tried: state.tried, passed: state.passed, lastScore: state.lastScore,
      pronScores: [...state.pronScores], weakInSession: { ...state.weakInSession },
      recLog: { ...state.recLog },
      cardIds: state.cards.map((c) => c.id),
    };
    saveActiveSession(window.studyDB, snap).catch((e) => console.error('[session-new] saveActiveSession', e));
    // 진행 중 진척을 오늘 dailyStats 에 라이브 반영 → cue 가 종료 전에도 '오늘 학습' 표시 (멱등)
    flushLiveStats(window.studyDB, snap).catch((e) => console.error('[session-new] flushLiveStats', e));
  };
  const onVis = () => { activeTimer.setHidden(document.hidden); if (document.hidden) saveSnapshot(); };
  const onActivity = () => activeTimer.activity();

  const endSession = async (finishedAll) => {
    state.ended = true;
    // 데모(?demo=1)는 finishSession/persistSummary/clearActiveSession 등 실 DB write 를 일절 하지 않는다.
    if (isDemoMode()) { window.location.hash = '#/summary'; return; }
    // 다시 듣기(replay): 완료 카드 재청취 — finishSession(복습 이관·통계) 건너뜀(완료 카드 재이관 시
    // reviewQueue interval=1 리셋 + dailyStats 이중집계 방지). 그냥 홈 복귀.
    if (state.replay) { window.location.hash = '#/'; return; }
    const completedCount = finishedAll ? state.cards.length : Math.max(0, state.step - 1);
    const durationSec = clampSessionDuration(activeTimer.seconds(), completedCount);
    try {
      await finishSession(window.studyDB, {
        mode: 'new',
        lang: getStoredLang(),
        date: getTodayISO(),
        durationSec,
        tried: state.tried,
        passed: state.passed,
        completedNewCards: state.cards.slice(0, completedCount),
        baseToday: state.base, // 진행 중 라이브 반영분 reconcile (base+최종, 이중집계 방지)
      });
    } catch (e) {
      console.error('[session-new] finishSession', e);
    }
    persistSummary(buildSummaryData({
      mode: 'new', state, durationSec, completedNewCount: completedCount, returnTo: 'home',
    }));
    try { await clearActiveSession(window.studyDB); }
    catch (e) { console.error('[session-new] clearActiveSession', e); }
    // 세션 완주 시 씬 쉐도잉 기록 정리 (씬이 더는 carry-forward 안 됨 → stale 방지)
    if (finishedAll) {
      const scene = state.cards.find((c) => Array.isArray(c.explanation?.dialogue));
      if (scene) clearSceneShadow(window.studyDB, scene.id).catch(() => {});
    }
    window.location.hash = '#/summary';
  };

  // 진행 게이트 (2026-06-10): 표현 카드는 따라 말하기 1회 이상 후 전진 (목표 REC_TARGET회).
  // scene 카드·뒤로 가기는 자유. 마이크 불가 환경은 state.micBlocked 로 자동 escape.
  const gateBlocked = (targetStep) => {
    const cur = state.cards[state.step - 1];
    if (!cur?.explanation?.key) return false; // 표현 카드만 게이트
    if (targetStep <= state.step) return false;
    if (canAdvance(state, cur.id)) return false;
    showRecordToast(`따라 말하기 1회 후 넘어갈 수 있어요 (목표 ${REC_TARGET}회)`);
    return true;
  };

  const handlers = {
    onNext: () => {
      if (gateBlocked(state.step + 1)) return;
      try { window.studySpeech?.cancel?.(); } catch { /* noop */ }
      const r = advanceCard(state.cards, state.step);
      if (r.done) { endSession(true); return; }
      state.step = r.step;
      state.sentence = r.sentence || EMPTY_SENTENCE;
      state.recording = false;
      state.lastScore = state.recLog?.[state.sentence?.id]?.best ?? null; // 점수 안착 복원
      rerender();
      saveSnapshot();
    },
    onJump: (step) => {
      if (!Number.isInteger(step) || step < 1 || step > state.cards.length) return;
      if (step === state.step) return;
      if (gateBlocked(step)) return;
      try { window.studySpeech?.cancel?.(); } catch { /* noop */ }
      state.step = step;
      state.sentence = pickCardFields(state.cards[step - 1]) || EMPTY_SENTENCE;
      state.recording = false;
      state.lastScore = state.recLog?.[state.sentence?.id]?.best ?? null; // 점수 안착 복원
      rerender();
      saveSnapshot();
    },
    onEnd: () => showEndConfirm({ onConfirm: () => endSession(false) }),
    saveSnapshot,
    // 씬 쉐도잉 한 줄 진행 시 durable 저장 (다음날 재진입에도 '따라 말한 줄' 유지)
    saveSceneShadow: (count) => {
      const scene = state.cards.find((c) => Array.isArray(c.explanation?.dialogue));
      if (scene) setSceneShadow(window.studyDB, scene.id, count).catch((e) => console.error('[session-new] saveSceneShadow', e));
    },
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
  // 입력 = 활동 신호 (녹음·듣기 버튼 포함 — 모두 클릭/키 입력으로 시작됨)
  document.addEventListener('pointerdown', onActivity, true);
  document.addEventListener('keydown', onActivity, true);
  const tickId = setInterval(() => {
    state.time = formatElapsed(activeTimer.seconds() * 1000);
    layoutRef?.update({ time: state.time });
  }, 1000);

  const stop = watchSize((s) => {
    if (s !== state.size) {
      state.size = s;
      rerender();
    }
  });

  if (isDemoMode()) {
    state.cards = demoNewCards();
    state.exprExclude = DEMO_EXCLUDE_IDS;
    state.total = state.cards.length;
    state.demo = true; // sessionExprV2 녹음 시뮬레이션 (마이크 없이 리빌 검증)
    state.micBlocked = true; // 데모 — 진행 게이트 무력화
    const idx = demoView() === 'session' ? 1 : 0;
    state.step = idx + 1;
    state.sentence = pickCardFields(state.cards[idx]) || EMPTY_SENTENCE;
    state.loaded = true;
    rerender();
    return () => {
      cleanup(); stop(); clearInterval(tickId);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('pointerdown', onActivity, true);
      document.removeEventListener('keydown', onActivity, true);
    };
  }

  Promise.all([
    loadNewCards(window.studyDB, getStoredLang(), getTodayISO()),
    loadActiveSession(window.studyDB),
  ])
    .then(async ([cards, snapshot]) => {
      // 전부 완료(미완료 신규 0) → '다시 듣기': 최신 완료 그룹을 읽기전용 replay 로 로드.
      // (loadNewCards 가 빈 배열일 때만 — home done 상태 '다시 듣기' 진입 = 빈 세션·버튼 먹통 버그 수정)
      if (cards.length === 0) {
        const replay = await loadReplayCards(window.studyDB, getStoredLang());
        if (replay.length > 0) {
          if (snapshot && snapshot.mode === 'new') clearActiveSession(window.studyDB).catch(() => {});
          state.replay = true;
          state.cards = replay;
          state.total = replay.length;
          state.step = 1;
          state.sentence = pickCardFields(replay[0]) || EMPTY_SENTENCE;
          const sc = replay.find((c) => Array.isArray(c.explanation?.dialogue));
          if (sc) { try { state.shadowed = await getSceneShadow(window.studyDB, sc.id); } catch { /* noop */ } }
          state.loaded = true;
          rerender();
          return;
        }
      }
      state.cards = cards;
      state.total = cards.length;
      const restore = restoreFromSnapshot(snapshot, cards, 'new');
      if (restore) {
        Object.assign(state, restore); // base 포함 (원래 시작 시 캡처분 보존)
        startTime = restore.startTime;
        activeTimer.restore(restore.activeSec); // 활성 시간만 승계 — 방치 벽시계는 승계 안 함
        const idx = Math.max(0, restore.step - 1);
        state.sentence = pickCardFields(cards[idx]) || EMPTY_SENTENCE;
      } else {
        state.step = cards.length === 0 ? 0 : 1;
        state.sentence = pickCardFields(cards[0]) || EMPTY_SENTENCE;
        // mode 일치하나 cardIds 불일치 → 스테일 snapshot 정리
        if (snapshot && snapshot.mode === 'new') clearActiveSession(window.studyDB).catch(() => {});
        // 새 세션 — 오늘 dailyStats 를 base 로 캡처 (라이브 반영이 이 위에 더함)
        try { state.base = (await window.studyDB.dailyStats.get(getTodayISO())) ?? null; }
        catch { state.base = null; }
      }
      // 씬 쉐도잉 진행 복원 (스냅샷 1시간 TTL 과 분리 — 다음날 재진입에도 유지)
      const scene = cards.find((c) => Array.isArray(c.explanation?.dialogue));
      if (scene) { try { state.shadowed = await getSceneShadow(window.studyDB, scene.id); } catch { /* noop */ } }
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
    document.removeEventListener('pointerdown', onActivity, true);
    document.removeEventListener('keydown', onActivity, true);
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
  // 다이얼로그 / 표현 연습 모두 v2 단일 칼럼 (데스크톱 + phone/tablet). 구 SessionLayout 경로는 미사용(후속 정리).
  return isDialogue ? renderDialogueV2(host, state, handlers) : renderSessionExprV2(host, state, handlers);

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
        bumpRecLog(state, state.sentence?.id, score); // 진행 게이트·점수 안착 (D1 과 공유)
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
    // 반환: 채점 완료 시 { score } — drillsSection 이 행 배지 안착 + 버튼 상태 전환 (2026-06-10)
    onRecord: async (text, btn) => {
      if (drillRec.ctrl) {
        const ctrl = drillRec.ctrl;
        drillRec.ctrl = null;
        if (btn) { btn.dataset.on = '0'; btn.textContent = btn.classList.contains('rec-done') ? '다시 녹음' : '녹음'; }
        const result = await stopAndAnalyze(ctrl, text, { lang: state.sentence?.lang });
        if (result?.mockFallback) { showRecordToast(recordErrorMessage(result.fallbackReason)); return null; }
        const score = Math.round(result?.score ?? 0);
        showRecordToast(`발음 점수 ${score}점`);
        return { score };
      }
      const rec = await startMicRecording();
      if (rec.error) { showRecordToast(recordErrorMessage(rec.error)); return null; }
      drillRec.ctrl = rec.controller;
      if (btn) { btn.dataset.on = '1'; btn.textContent = '녹음 중…'; }
      return null;
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

  const onListen = (t, spk) => { if (t && window.studySpeech?.speak) window.studySpeech.speak(t, { lang: ttsLang, speaker: spk }); };
  const speakAll = () => {
    let i = 0;
    const next = () => {
      if (i >= lines.length || !window.studySpeech?.speak) return;
      const ln = lines[i++];
      if (!ln.en) { next(); return; }
      window.studySpeech.speak(ln.en, { lang: ttsLang, speaker: ln.spk, onEnd: next });
    };
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
      h('button', { class: 'd1-dplay', 'aria-label': '듣기', onClick: () => onListen(l.en, l.spk) }, d1Icon('play', 13)),
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
 * 좌: 능동 연습 흐름(문장→듣기/따라말하기+점수→응용). 우: 해설(핵심/상황/실수/비슷한표현).
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

  // ── 응용 연습 (drills) — 좌측 ──
  const drills = Array.isArray(ex.drills) ? ex.drills : [];
  const drillsBlock = drills.length ? h('div', { style: 'margin-top:40px;' },
    h('div', { class: 'd1-panel-lab' }, '응용 연습 — 듣고, 따라 말하고, 녹음하기'),
    h('div', { style: 'margin-top:4px;' }, buildD1DrillRows(drills, hl, lang, s?.speaker)),
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
