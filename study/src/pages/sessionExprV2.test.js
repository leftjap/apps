// @vitest-environment jsdom
// 녹음 성공 경로 통합 검증 — 마이크 없이 services 를 mock 해 record→채점→savePronunciationLog→state 를 결정적으로 확인.
// (라이브 브라우저는 마이크 장치 부재로 성공 경로 미실행 — 이 테스트가 그 갭을 메움.)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../services/sessionAnalyze.js', () => ({
  startMicRecording: vi.fn(async () => ({ controller: { stop() {} } })),
  // 감점제 전환(2026-08-31) 후 화면 점수는 엔진 산출 — 기대 문장을 에코하는 완전 발화 형태의
  // mock 은 어떤 타깃(메인·드릴·체이닝·생산)에서도 엔진 100 이 된다. acc 92 는 accuracyScore 로만 남는다.
  stopAndAnalyze: vi.fn(async (_ctrl, expected) => ({
    score: 92, accuracyScore: 92, recognizedText: String(expected ?? ''),
    fluencyScore: 100, prosodyScore: 100, weakPhonemes: ['ð'],
  })),
}));
vi.mock('../services/pronunciationLog.js', async (orig) => ({ ...await orig(), savePronunciationLog: vi.fn(async () => null) }));
vi.mock('../services/weakPhonemes.js', () => ({ applyWeakPhonemesUpdate: vi.fn(async () => null) }));
vi.mock('../components/session/recordToast.js', () => ({ showRecordToast: vi.fn(), recordErrorMessage: vi.fn(() => '에러') }));

import { renderSessionExprV2, hlNode, drillRows, recordGateMessage, miniDialogueEl, MINI_VOICES, SESSION_BLOCKS,
  dialogueStageEl, progressSegEl, sentenceNavEl, scrollSelectedIntoView, utterRingCard } from './sessionExprV2.js';
import { buildDialogueGroups } from '../components/session/applied.js';
import { h } from '../components/d1/dom.js';
import { vIcon, VI } from '../components/v2/atoms.js';
import { savePronunciationLog } from '../services/pronunciationLog.js';
import { stopAndAnalyze, startMicRecording } from '../services/sessionAnalyze.js';
import { showRecordToast } from '../components/session/recordToast.js';

// 2026-09-12: 체이닝·생산 블록은 화면에서 숨김이 기본값. 아래 기존 테스트들은 두 블록의 계약을 계속 검증하므로 켜고 돈다.
beforeEach(() => { SESSION_BLOCKS.chainProd = true; });

const tick = () => new Promise((r) => setTimeout(r, 0));

function makeState() {
  return {
    size: 'desktop', recording: false, lastScore: null, tried: 0, passed: 0, combo: 0,
    pronScores: [], weakInSession: {}, recLog: {}, step: 2, total: 1,
    cards: [
      { id: 'scene', explanation: { dialogue: [{ speaker: 'A', en: 'Is that a promise?', ko: '약속하는 거예요?' }], sceneTitle: '데모' } },
      { id: 'e1', lang: 'en', sentence: 'Is that a promise?', ko: '약속하는 거예요?', pron: '이즈 대러 프라미스', explanation: { key: 'Is that a promise? = 약속하는 거예요?', drills: [] } },
    ],
    sentence: { id: 'e1', lang: 'en', sentence: 'Is that a promise?', ko: '약속하는 거예요?', pron: '이즈 대러 프라미스', explanation: { key: 'Is that a promise? = 약속하는 거예요?', drills: [] } },
  };
}

/* 체이닝(chain) — ladder 폐기 후속(2026-07-09). 자막 없이 듣고 따라 말하기가 핵심 계약이므로
 * "영어 원문이 화면에 새지 않는다"를 회귀 방지로 못박는다. */
describe('sessionExprV2 — 체이닝(chain) 렌더', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  const CHAIN = {
    target: "It's been a while since we caught up. We should grab dinner sometime.",
    chunks: ["It's been a while", 'since we caught up', 'We should grab dinner', 'sometime'],
    ko: '오랜만이야. 언제 저녁이나 먹자.',
  };
  function chainState(demo = false) {
    const s = makeState();
    s.demo = demo;
    s.sentence.explanation.chain = CHAIN;
    return s;
  }
  const chainRows = (host) => [...host.querySelectorAll('.vs-chain .vs-drow')];

  it('chain → 최대 3단계로 압축 렌더 + 영어 원문은 화면에 노출되지 않음(자막 없음)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, chainState(), {});
    expect(host.textContent).toContain('체이닝');
    expect(chainRows(host)).toHaveLength(3); // 4청크 → 3단계 (슬림화 2026-07-22)
    expect(host.textContent).toContain('1단계');
    expect(host.textContent).toContain('3단계');
    expect(host.textContent).not.toContain('4단계');
    // 자막 금지 — 어떤 단계의 영어도 텍스트로 노출되면 안 됨
    expect(host.textContent).not.toContain("It's been a while");
    expect(host.textContent).not.toContain('grab dinner');
  });

  it('chain 없음 → 체이닝 블록 미렌더 (기존 시드 호환)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeState(), {});
    expect(host.querySelector('.vs-chain')).toBeNull();
  });

  it('재생할 때마다 화자·속도가 바뀐다 (리듬 통째 암기 차단)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const speak = vi.fn();
    window.studySpeech = { speak };
    renderSessionExprV2(host, chainState(), {});
    const play = chainRows(host)[0].querySelector('button[aria-label="듣기"]');
    play.click(); play.click();
    expect(speak).toHaveBeenCalledTimes(2);
    const v1 = speak.mock.calls[0][1], v2 = speak.mock.calls[1][1];
    expect(v1.voice).not.toBe(v2.voice);
    expect(typeof v1.rate).toBe('number');
  });

  // 체이닝 발화도 응용 드릴과 동일하게 '오늘 발화' + 3회 게이트에 집계 (2026-07-10).
  it('체이닝 발화 → tried/passed/pronScores/recLog 집계 (다음-표현 게이트 포함)', () => {
    vi.useFakeTimers();
    try {
      const host = document.createElement('div'); document.body.appendChild(host);
      const state = chainState(true);
      renderSessionExprV2(host, state, {});
      chainRows(host)[0].querySelector('button[aria-label="녹음"]').click();
      vi.advanceTimersByTime(900);
      expect(state.tried).toBe(1);
      expect(state.pronScores).toEqual([90]);
      expect(state.passed).toBe(1);            // 90 >= 80
      expect(state.recLog.e1?.count).toBe(1);  // 3회 게이트에 포함
      expect(host.querySelector('.vs-rec .n').textContent).toBe('1'); // '오늘 발화' 위젯 갱신
    } finally { vi.useRealTimers(); }
  });

  it('통과하면 다음 단계가 열리고, 통과 전 단계의 녹음 버튼은 비활성', async () => {
    vi.useFakeTimers();
    try {
      const host = document.createElement('div'); document.body.appendChild(host);
      renderSessionExprV2(host, chainState(true), {}); // demo — 마이크 없이 통과 시뮬
      const rows = chainRows(host);
      const rec = (i) => rows[i].querySelector('button[aria-label="녹음"]');
      expect(rec(0).disabled).toBe(false);
      expect(rec(1).disabled).toBe(true);   // 2단계는 아직 잠김

      rec(0).click();
      vi.advanceTimersByTime(900);
      expect(rows[0].querySelector('.vs-gscore').style.display).not.toBe('none'); // 1단계 통과 ✓
      expect(rows[0].querySelector('.vs-gscore').classList.contains('score-pop')).toBe(true); // 통과 애니
      expect(rec(1).disabled).toBe(false);  // 2단계 열림
      expect(rec(0).disabled).toBe(true);   // 통과한 단계는 잠김
    } finally { vi.useRealTimers(); }
  });
});

describe('sessionExprV2 — 녹음 성공 경로 (record→채점→DB→state)', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('녹음 1회 완료 → tried++ · lastScore=100(감점제: 완전 발화 mock) · 콤보×1 · savePronunciationLog(올바른 인자)', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeState();
    renderSessionExprV2(host, state, {});

    const recPill = host.querySelector('.vs-pill.pri');
    expect(recPill).toBeTruthy();
    expect(recPill.textContent).toContain('따라 말하기');

    recPill.click(); await tick();                 // 녹음 시작 (startMicRecording)
    expect(state.recording).toBe(true);
    host.querySelector('.vs-pill.recing').click(); await tick(); await tick(); // 멈춤 + 채점

    // state 갱신
    expect(state.recording).toBe(false);
    expect(state.tried).toBe(1);
    expect(state.passed).toBe(1);       // 92 >= PASS_THRESHOLD(80)
    expect(state.lastScore).toBe(100);
    expect(state.combo).toBe(1);
    expect(state.pronScores).toEqual([100]);
    expect(state.recLog.e1).toEqual({ count: 1, best: 100 });
    expect(state.weakInSession).toEqual({ 'ð': 1 });

    // stopAndAnalyze 가 현재 문장으로 호출
    expect(stopAndAnalyze).toHaveBeenCalledTimes(1);
    // DB write — savePronunciationLog 가 result/sentenceId/lang/date 로 호출
    expect(savePronunciationLog).toHaveBeenCalledTimes(1);
    const [dbArg, params] = savePronunciationLog.mock.calls[0];
    expect(params.sentenceId).toBe('e1');
    expect(params.lang).toBe('en');
    // 감점제 전환 — 저장 행의 score 는 엔진 점수, 원 acc 와 체계 표식이 함께 실린다.
    expect(params.result).toMatchObject({ score: 100, accuracyScore: 92, scoreModel: 'ded2', weakPhonemes: ['ð'] });
    expect(typeof params.date).toBe('string');

    // 리빌 DOM — 점수 링 92 · 발화 점수 원 1개 · 총 1회 (점·콤보·PASS 칩은 폐기 §6.1)
    expect(host.querySelector('.vs-ring .cn').textContent).toBe('100');
    expect(host.querySelector('.vs-ring').classList.contains('score-pop')).toBe(true); // 점수 등장 애니
    expect(host.querySelector('.vs-cap').textContent).toBe('방금 점수'); // 라이브 채점 직후에만 '방금'
    const dots = host.querySelectorAll('.vs-meta .v-dot');
    expect(dots).toHaveLength(1);
    expect(dots[0].textContent).toBe('100');
    expect(dots[0].classList.contains('fresh')).toBe(true);   // 최신 시도 강조
    expect(host.querySelector('.vs-meta .tot').textContent).toBe('총 1회');
    expect(host.querySelector('.vs-pass')).toBeNull();
    expect(host.querySelector('.vs-combo')).toBeNull();
  });

  it('녹음 3회 → 콤보×3 (다음-표현 게이트는 2026-09-04 폐지 — 잠금 표시 없음)', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeState();
    renderSessionExprV2(host, state, {});
    for (let i = 0; i < 3; i++) {
      host.querySelector('.vs-pill.pri').click(); await tick();
      host.querySelector('.vs-pill.recing').click(); await tick(); await tick();
    }
    expect(state.recLog.e1.count).toBe(3);
    expect(state.combo).toBe(3);
    expect(host.querySelector('.vs-next.unlock')).toBeNull(); // 잠금/해제 개념 자체가 없다
    expect(host.textContent).not.toContain('발화 3회 완료');
    expect(host.textContent).not.toMatch(/회를 채우면 열려요/);
  });

  /* 3회 발화 게이트 폐지 (2026-09-04 사용자 지시 "3회 발화 기준 자체를 없애") — 종전엔 녹음 3회 전까지 버튼이
   * 잠긴 색이었고 컨트롤러(session-new)는 1회 전 전진을 막았다. 이제 다음 표현은 처음부터 활성이고 그대로 넘어간다. */
  it('다음 표현은 녹음 0회에도 활성이고 onNext 를 부른다 (3회 게이트 폐지)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeState();
    const onNext = vi.fn();
    renderSessionExprV2(host, state, { onNext });
    const next = host.querySelector('.vs-next');
    expect(next.disabled).toBe(false);
    expect(next.classList.contains('unlock')).toBe(false);
    next.click();
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('녹음 실패(mockFallback) → state 미변경 · DB write 없음 · 토스트', async () => {
    stopAndAnalyze.mockResolvedValueOnce({ mockFallback: true, fallbackReason: 'no-device' });
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeState();
    renderSessionExprV2(host, state, {});
    host.querySelector('.vs-pill.pri').click(); await tick();
    host.querySelector('.vs-pill.recing').click(); await tick(); await tick();
    expect(state.tried).toBe(0);
    expect(state.lastScore).toBe(null);
    expect(savePronunciationLog).not.toHaveBeenCalled();
  });
});

/* 생산 연습(한→영) — 방금 연습한 드릴을 한글만 보고 재현 (2026-07-22 신설).
 * 정답(en·kr 음차)은 통과·공개 전 DOM 에 없어야 한다 — 체이닝 자막 금지와 동일 계약. */
describe('sessionExprV2 — 생산 연습(한→영) 블록', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  const prodRows = (host) => [...host.querySelectorAll('.vs-prod')];

  it('드릴의 ko 로 렌더, 정답 영어·음차는 공개 전 블록에 미노출', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills(), {});
    const block = host.querySelector('.vs-prodblock');
    expect(block).toBeTruthy();
    expect(prodRows(host)).toHaveLength(2);
    expect(block.textContent).toContain('생산 연습');
    expect(block.textContent).toContain('그건 직업 그 이상이에요.');
    expect(block.textContent).not.toContain('more than a job');
    expect(block.textContent).not.toContain('잇츠 모어');
  });

  it('데모 녹음 → 통과 → 정답 공개·듣기 활성·스트릭 증가, 전부 완료 시 완주 뱃지', () => {
    vi.useFakeTimers();
    try {
      const host = document.createElement('div'); document.body.appendChild(host);
      const state = makeStateWithDrills(); state.demo = true;
      renderSessionExprV2(host, state, {});
      const block = host.querySelector('.vs-prodblock');
      const rec = (i) => prodRows(host)[i].querySelector('button[aria-label="녹음"]');
      const play = (i) => prodRows(host)[i].querySelector('button[aria-label="듣기"]');
      expect(play(0).disabled).toBe(true);            // 정답 오디오 잠금 (공개 전)
      rec(0).click(); vi.advanceTimersByTime(900);
      expect(block.textContent).toContain("It's more than a job.");  // 정답 공개
      expect(play(0).disabled).toBe(false);
      expect(block.textContent).toContain('통과 1 / 2');
      rec(1).click(); vi.advanceTimersByTime(900);
      expect(block.textContent).toContain('통과 2 / 2');
    } finally { vi.useRealTimers(); }
  });

  it('생산 발화도 오늘 발화·3회 게이트 집계 + 시작 시 응용 목록 자동 접힘(펼치기 제공)', () => {
    vi.useFakeTimers();
    try {
      const host = document.createElement('div'); document.body.appendChild(host);
      const state = makeStateWithDrills(); state.demo = true;
      renderSessionExprV2(host, state, {});
      const drillList = host.querySelector('.vs-drills-list');
      expect(drillList.style.display).not.toBe('none');
      prodRows(host)[0].querySelector('button[aria-label="녹음"]').click();
      vi.advanceTimersByTime(900);
      expect(state.recLog.e1?.count).toBe(1);          // 생산 발화도 게이트 카운트
      expect(state.tried).toBe(1);
      expect(drillList.style.display).toBe('none');    // 답 훔쳐보기 방지 — 자동 접힘
      const unfold = host.querySelector('.vs-drills-unfold');
      expect(unfold.style.display).not.toBe('none');
      unfold.click();
      expect(drillList.style.display).not.toBe('none'); // 펼치기는 자유
    } finally { vi.useRealTimers(); }
  });

  it('ko 없는 드릴은 제외 — 하나도 없으면 블록 미렌더', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeStateWithDrills();
    state.sentence.explanation.drills.forEach((d) => delete d.ko);
    renderSessionExprV2(host, state, {});
    expect(host.querySelector('.vs-prodblock')).toBeNull();
  });
});

// 응용 연습(drill) 녹음 = 세션 발화 1건 — '오늘 발화' 카운트 누락 버그 회귀 방지.
function makeStateWithDrills(over = {}) {
  const drills = [
    { en: "It's more than a job.", kr: '잇츠 모어 대너 잡', ko: '그건 직업 그 이상이에요.' },
    { en: "He's more than a friend.", kr: '히즈 모어 대너 프렌드', ko: '걔는 친구 그 이상이야.' },
  ];
  const explanation = { key: 'Is that a promise? = 약속하는 거예요?', drills };
  return {
    size: 'desktop', recording: false, lastScore: null, tried: 0, passed: 0, combo: 0,
    pronScores: [], weakInSession: {}, recLog: {}, step: 2, total: 1,
    cards: [
      { id: 'scene', explanation: { dialogue: [{ speaker: 'A', en: 'Is that a promise?', ko: '약속하는 거예요?' }], sceneTitle: '데모' } },
      { id: 'e1', lang: 'en', sentence: 'Is that a promise?', ko: '약속하는 거예요?', pron: '이즈 대러 프라미스', explanation },
    ],
    sentence: { id: 'e1', lang: 'en', sentence: 'Is that a promise?', ko: '약속하는 거예요?', pron: '이즈 대러 프라미스', explanation },
    ...over,
  };
}

/* 장면 칩(2026-08-27)은 2026-09-14 대화 스테이지 전환에서 폐기됐다 — 맥락은 대화 자체가 말하고,
 * 과목·진행은 좌측 사이드바 라벨(데스크톱)과 상단 바(폰)가 말한다. 그 계약은 아래 조립 describe 가 잡는다. */

describe('sessionExprV2 — 응용 연습(drill) 녹음 카운트', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  const drillRecBtns = (host) => [...host.querySelectorAll('.vs-drow')].map((r) => r.querySelector('button[aria-label="녹음"]'));

  it('drill 녹음 1회 → tried/passed/pronScores/weakInSession 반영 · 오늘 발화·녹음 N/M 갱신 · 행 점수 배지', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeStateWithDrills();
    renderSessionExprV2(host, state, {});

    const recBtn = drillRecBtns(host)[0];
    expect(recBtn).toBeTruthy();
    recBtn.click(); await tick();                          // 녹음 시작
    recBtn.click(); await tick(); await tick();            // 멈춤 + 채점 (mock score 92)

    // 세션 집계 — drill 도 발화 1건
    expect(state.tried).toBe(1);
    expect(state.passed).toBe(1);                          // 92 >= 80
    expect(state.pronScores).toEqual([100]);
    expect(state.weakInSession).toEqual({ 'ð': 1 });

    // '오늘 발화' 위젯 + ' 녹음 N/M' 카운터 라이브 갱신
    expect(host.querySelector('.vs-rec .n').textContent).toBe('1');
    expect(host.querySelector('.vs-labrow .ct b').textContent).toBe('1');

    // 행 점수 배지 + 등장 애니
    const drillScoreEl = drillRecBtns(host)[0].closest('.vs-drow').querySelector('.vs-ln-trace'); // 세 줄 행 — 흔적 줄
    expect(drillScoreEl.textContent).toContain('100');
    expect(drillScoreEl.classList.contains('score-pop')).toBe(true);
  });

  /* 드릴 듣기도 체이닝처럼 재생마다 화자 변주 + 길이별 속도 (2026-07-22 사용자 지시 —
   * 종전엔 카드 화자 1명·고정 속도). 카드 speaker 는 더 이상 드릴에 안 쓴다. */
  it('드릴 재생마다 화자가 바뀌고, 짧은 문장은 빠르게 재생한다 (카드 화자 고정 폐기)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const speak = vi.fn();
    window.studySpeech = { speak };
    renderSessionExprV2(host, makeStateWithDrills(), {});
    const plays = [...host.querySelectorAll('.vs-drow')].map((r) => r.querySelector('button[aria-label="듣기"]'));
    plays[0].click(); plays[1].click();
    expect(speak).toHaveBeenCalledTimes(2);
    const o1 = speak.mock.calls[0][1], o2 = speak.mock.calls[1][1];
    expect(o1.voice).not.toBe(o2.voice);            // 화자 순환
    expect(o1.speaker).toBeUndefined();             // 카드 화자 고정 폐기
    expect(o1.rate).toBeGreaterThanOrEqual(1.10);   // 5단어(≤6) → 빠르게
  });

  it('drill 녹음도 다음-표현 게이트(recLog count)에 포함 — 콤보는 메인 전용(무관)', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeStateWithDrills();
    renderSessionExprV2(host, state, {});
    const recBtn = drillRecBtns(host)[0];
    recBtn.click(); await tick();
    recBtn.click(); await tick(); await tick();
    expect(state.recLog.e1?.count).toBe(1);                // 응용 발화도 3회 게이트에 카운트 (2026-07-01 사용자 지시)
    expect(state.combo).toBe(0);                           // 콤보(연속 PASS)는 메인 전용 — drill 무관
    expect(host.querySelector('.vs-next').classList.contains('unlock')).toBe(false); // 아직 1/3
  });

  it('drill 녹음 3회 → recLog 3 누적 (게이트 폐지 후에도 집계는 유지)', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeStateWithDrills();
    renderSessionExprV2(host, state, {});
    const recBtn = drillRecBtns(host)[0];
    for (let k = 0; k < 3; k++) { recBtn.click(); await tick(); recBtn.click(); await tick(); await tick(); }
    expect(state.recLog.e1.count).toBe(3);
    expect(host.querySelector('.vs-next.unlock')).toBeNull();
  });

  it('같은 drill 재녹음 → tried 누적(+1)하되 녹음 N/M 카운터는 중복 안 셈', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeStateWithDrills();
    renderSessionExprV2(host, state, {});
    const recBtn = drillRecBtns(host)[0];
    recBtn.click(); await tick(); recBtn.click(); await tick(); await tick();
    recBtn.click(); await tick(); recBtn.click(); await tick(); await tick();
    expect(state.tried).toBe(2);                           // 발화 2건
    expect(host.querySelector('.vs-labrow .ct b').textContent).toBe('1'); // 행 1개만 녹음됨
  });

  it('drill 녹음 실패(mockFallback) → state 미변경 · 카운터 미갱신', async () => {
    stopAndAnalyze.mockResolvedValueOnce({ mockFallback: true, fallbackReason: 'no_match' });
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeStateWithDrills();
    renderSessionExprV2(host, state, {});
    const recBtn = drillRecBtns(host)[0];
    recBtn.click(); await tick();
    recBtn.click(); await tick(); await tick();
    expect(state.tried).toBe(0);
    expect(host.querySelector('.vs-rec .n').textContent).toBe('0');
    expect(host.querySelector('.vs-labrow .ct b').textContent).toBe('0');
  });

  /* 링은 '방금 받은 점수' 하나를 담는 슬롯이다 — 보여줄 점수가 없으면 슬롯 자체를 그리지 않는다.
   * 종전엔 링을 '—' 로 띄우고 캡션에 '아직 시도 전' / 'N회 시도' 를 채웠다. 결과가 없는데 결과
   * 자리를 그린 것이 문제였다 (클로드디자인 2026-08-27). 드릴 발화는 메인 점수가 아니므로
   * 드릴만 녹음해도 링은 계속 없다. */
  it('메인 미녹음 + drill 만 녹음 → 링·캡션 모두 없다 (결과 슬롯 자체를 안 그린다)', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeStateWithDrills();
    renderSessionExprV2(host, state, {});
    expect(host.querySelector('.vs-ring')).toBeNull();
    expect(host.querySelector('.vs-cap')).toBeNull();
    const recBtn = drillRecBtns(host)[0];
    recBtn.click(); await tick();
    recBtn.click(); await tick(); await tick();
    expect(host.querySelector('.vs-ring')).toBeNull();
    expect(host.querySelector('.vs-cap')).toBeNull();
    expect(host.textContent).not.toContain('아직 시도 전');
    expect(host.textContent).not.toContain('회 시도');
  });

  it('메인 녹음으로 점수가 오면 그때 링 + `방금 점수` 가 등장한다', () => {
    vi.useFakeTimers();
    try {
      const host = document.createElement('div'); document.body.appendChild(host);
      renderSessionExprV2(host, makeStateWithDrills({ demo: true }), {});
      expect(host.querySelector('.vs-ring')).toBeNull();
      host.querySelector('.vs-pill.pri').click();
      vi.advanceTimersByTime(1100);
      expect(host.querySelector('.vs-ring .cn').textContent).not.toBe('—');
      expect(host.querySelector('.vs-cap').textContent).toBe('방금 점수');
    } finally { vi.useRealTimers(); }
  });

  /* 링이 없다가 생기면 버튼 줄이 밀린다 — 첫 녹음 직후 손가락이 다른 곳을 누른다.
   * 데스크톱은 min-height 로 자리를 예약해 두었고 모바일에도 같은 예약이 필요하다. */
  /* 문장 카드의 '발화 점수 열'은 그 문장을 말한 점수여야 한다. 종전엔 응용·체이닝 점수까지
   * 같은 배열(cardEx.utter)에 밀어 넣어, 메인을 1회만 말하고 응용 5개를 녹음하면 점수 원이
   * 응용 점수 5개로 채워지고 **메인 점수가 최근 5개 창 밖으로 밀려났다**
   * (2026-08-28 사용자 보고 — 화면: 원 90·96·97·88·94 = 응용 1~5행 점수, 메인 57 은 사라짐).
   * 드릴은 각 행에 자기 점수 원을 이미 갖고 있어 이중 표시이기도 했다. */
  it('응용 녹음은 문장 카드 점수 열에 섞이지 않는다', async () => {
    vi.useFakeTimers();
    try {
      const host = document.createElement('div'); document.body.appendChild(host);
      const state = makeStateWithDrills({ demo: true });
      renderSessionExprV2(host, state, {});
      host.querySelector('.vs-pill.pri').click();          // 메인 1회
      vi.advanceTimersByTime(1100);
      const mainScore = state.exLog.e1.utter[0];
      drillRecBtns(host)[0].click();                        // 응용 1회
      vi.advanceTimersByTime(900);
      drillRecBtns(host)[1].click();                        // 응용 2회
      vi.advanceTimersByTime(900);
      expect(state.exLog.e1.utter).toEqual([mainScore]);    // 메인 것만
      const dots = [...host.querySelectorAll('.vs-meta .v-dot')].map((n) => n.textContent);
      expect(dots).toEqual([String(mainScore)]);
    } finally { vi.useRealTimers(); }
  });

  it('총 N회 는 점수 원과 같은 계열이다 (게이트 카운트가 아니다)', async () => {
    vi.useFakeTimers();
    try {
      const host = document.createElement('div'); document.body.appendChild(host);
      renderSessionExprV2(host, makeStateWithDrills({ demo: true }), {});
      host.querySelector('.vs-pill.pri').click();
      vi.advanceTimersByTime(1100);
      drillRecBtns(host)[0].click();                        // 응용은 총계에 안 들어간다
      vi.advanceTimersByTime(900);
      expect(host.querySelector('.vs-meta .tot').textContent).toBe('총 1회');
    } finally { vi.useRealTimers(); }
  });

  it('드릴만 녹음하면 점수 열이 비어 있다', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeStateWithDrills();
    renderSessionExprV2(host, state, {});
    const recBtn = drillRecBtns(host)[0];
    recBtn.click(); await tick();
    recBtn.click(); await tick(); await tick();
    expect(host.querySelectorAll('.vs-meta .v-dot')).toHaveLength(0);
    expect(host.querySelector('.vs-meta .tot').textContent).toBe('총 0회');
  });

  /* 카드 이동 후 돌아왔을 때 링이 그 카드의 '최고' 점수를 보이던 문제 — 캡션은 '방금 점수' 인데
   * 값이 최고라 어긋났다(session-new.js 가 recLog.best 로 복원). 복원 출처는 점수 열과 같은 배열
   * (exLog[id].utter) 이고, 그 배열은 메인 발화만 담으므로 '마지막'이 곧 '방금'이다. */
  it('메인을 여러 번 녹음하면 배열 끝이 최고가 아니라 마지막 값이다', async () => {
    vi.useFakeTimers();
    try {
      const host = document.createElement('div'); document.body.appendChild(host);
      const state = makeStateWithDrills({ demo: true });
      renderSessionExprV2(host, state, {});
      host.querySelector('.vs-pill.pri').click();
      vi.advanceTimersByTime(1100);
      host.querySelector('.vs-pill.pri').click();
      vi.advanceTimersByTime(1100);
      const utter = state.exLog.e1.utter;
      expect(utter).toHaveLength(2);
      expect(utter[utter.length - 1]).not.toBe(Math.max(...utter.slice(0, -1)));
    } finally { vi.useRealTimers(); }
  });

  it('모바일 컨트롤 줄도 링 자리를 미리 예약한다 (min-height)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills({ size: 'phone' }), {});
    const css = [...host.querySelectorAll('style')].map((n) => n.textContent).join('');
    const blocks = [...css.matchAll(/(?:^|\n)\.vs-ctrl\{[^}]*\}/g)].map((m) => m[0]);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((b) => b.includes('min-height'))).toBe(true);
  });
});

/* 메인 카드 듣기도 재생마다 화자 순환 (2026-07-23 사용자 지시 — 응용·체이닝과 동일 원리).
 * 단 속도는 메인 학습 기본(0.85)을 유지한다 — 길이별 속도 규칙은 응용·체이닝 전용.
 * ja 는 PRACTICE_VOICES 가 en 전용이라 기존 speaker 경로 유지. */
describe('sessionExprV2 — 메인 카드 듣기 화자 순환', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  const listenBtn = (host) => [...host.querySelectorAll('button')].find((b) => b.textContent.includes('듣기') && b.classList.contains('vs-pill'));

  it('en: 재생마다 화자가 바뀌고 speaker·rate 는 미전달 (학습 속도 유지)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const speak = vi.fn();
    window.studySpeech = { speak };
    renderSessionExprV2(host, makeState(), {});
    const listen = listenBtn(host);
    listen.click();
    speak.mock.calls[0][1].onEnd(); // 재생 종료 시뮬 — 토글이라 종료 전 재클릭은 정지가 된다
    listen.click();
    expect(speak).toHaveBeenCalledTimes(2);
    const o1 = speak.mock.calls[0][1], o2 = speak.mock.calls[1][1];
    expect(o1.voice).not.toBe(o2.voice);
    expect(o1.speaker).toBeUndefined();
    expect(o1.rate).toBeUndefined();
  });

  /* ja 도 순환한다 (2026-08-28 사용자 지시 — 종전엔 AoiNeural 한 목소리뿐이라 몇 번을 들어도
   * 같은 사람이었다). 시드에 speaker 가 지정된 카드만 그 화자를 존중해 순환에서 뺀다. */
  it('ja: 일본어 화자로 순환한다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const speak = vi.fn();
    window.studySpeech = { speak };
    const st = makeState();
    st.sentence.lang = 'ja'; st.cards[1].lang = 'ja';
    st.sentence.speaker = null;
    renderSessionExprV2(host, st, {});
    listenBtn(host).click();
    const o = speak.mock.calls[0][1];
    expect(o.lang).toBe('ja-JP');
    expect(String(o.voice).startsWith('ja-JP-')).toBe(true);
  });

  it('ja: 시드에 speaker 가 있으면 그 화자를 쓴다 (콩트 트랙 회귀 방지)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const speak = vi.fn();
    window.studySpeech = { speak };
    const st = makeState();
    st.sentence.lang = 'ja'; st.cards[1].lang = 'ja';
    st.sentence.speaker = '해결사';
    renderSessionExprV2(host, st, {});
    listenBtn(host).click();
    const o = speak.mock.calls[0][1];
    expect(o.speaker).toBe('해결사');
    expect(o.voice).toBeUndefined();
  });
});

/* 생산 연습 통과 기준 강화 (2026-07-23 사용자 지적: "정확하게 발음 못했는데 패스가 됨").
 * Azure 발음평가 모드는 인식을 참조 문장으로 끌어당겨 웅얼거림도 커버리지가 통과된다 →
 * 커버리지 + 발음 정확도 하한(65) 이중 기준. 하한 미달은 실패 1회로 세되 안내 문구를 구분. */
describe('sessionExprV2 — 생산 연습 발음 하한', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  const prodRow = (host, i) => [...host.querySelectorAll('.vs-prod')][i];

  async function recOnce(host, score, recognizedText) {
    stopAndAnalyze.mockResolvedValueOnce({ score, recognizedText, weakPhonemes: [] });
    const rec = prodRow(host, 0).querySelector('button[aria-label="녹음"]');
    rec.click(); await tick();          // 녹음 시작
    rec.click(); await tick(); await tick(); // 멈춤 + 채점
  }

  it('단어는 다 말했지만 정확도 40 → 통과 아님 (정답 미공개·스트릭 0)', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills(), {});
    await recOnce(host, 40, "It's more than a job.");
    const row = prodRow(host, 0);
    expect(row.textContent).not.toContain('more than a job');       // 정답 미공개
    expect(row.querySelector('.vs-gscore').style.display).toBe('none'); // 통과 마크 없음
    expect(host.querySelector('.vs-prodblock .ct').textContent).toContain('통과 0 / 2');
  });

  it('정확도 80 + 커버리지 통과 → 통과·정답 공개', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills(), {});
    await recOnce(host, 80, "It's more than a job.");
    const row = prodRow(host, 0);
    expect(row.textContent).toContain('more than a job');
    expect(row.querySelector('.vs-gscore').style.display).not.toBe('none');
    expect(host.querySelector('.vs-prodblock .ct').textContent).toContain('통과 1 / 2');
  });

  it('하한 미달도 실패 1회로 누적 — 3회면 정답 공개(기존 흐름 유지)', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills(), {});
    await recOnce(host, 40, "It's more than a job.");
    await recOnce(host, 40, "It's more than a job.");
    await recOnce(host, 40, "It's more than a job.");
    const row = prodRow(host, 0);
    expect(row.textContent).toContain('more than a job');            // 3회 실패 → 공개
    expect(row.querySelector('.vs-gscore').style.display).toBe('none'); // 통과는 아님
  });
});

/* 단어 하한 (judgeProduction badWords) — 일부 단어만 엉뚱하고 문장 평균은 하한을 넘는
 * 취약 창 차단 (2026-07-23 사용자 지적 "엉뚱한 단어도 통과"). */
describe('sessionExprV2 — 생산 연습 단어 하한', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('문장 79점·커버리지 통과여도 한 단어 10점 → 통과 아님', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills(), {});
    stopAndAnalyze.mockResolvedValueOnce({
      score: 79, recognizedText: "It's more than a job.", weakPhonemes: [],
      wordScores: [{ word: "it's", score: 95 }, { word: 'more', score: 10 }, { word: 'than', score: 92 }, { word: 'a', score: 96 }, { word: 'job', score: 94 }],
    });
    const row = [...document.querySelectorAll('.vs-prod')][0];
    const rec = row.querySelector('button[aria-label="녹음"]');
    rec.click(); await tick();
    rec.click(); await tick(); await tick();
    expect(row.textContent).not.toContain('more than a job');           // 정답 미공개
    expect(row.querySelector('.vs-gscore').style.display).toBe('none'); // 통과 마크 없음
  });
});

/* '정답 보기' — 녹음 없이 즉시 공개 (2026-07-24 사용자 지시, 복습의 "발화는 전진 조건이 아니다" 원칙).
 * 공개는 통과가 아니다 — 스트릭 0·통과 마크 없음. */
describe('sessionExprV2 — 생산 연습 정답 보기 버튼', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('클릭 → 정답 공개·듣기 해제·녹음 잠금, 통과 아님·스트릭 0', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills(), {});
    const row = [...host.querySelectorAll('.vs-prod')][0];
    const give = row.querySelector('.vs-prod-give');
    expect(give).toBeTruthy();
    give.click();
    expect(row.textContent).toContain('more than a job');                 // 정답 공개
    expect(row.querySelector('.vs-gscore').style.display).toBe('none');   // 통과 마크 없음
    expect(row.querySelector('button[aria-label="듣기"]').disabled).toBe(false);
    expect(row.querySelector('button[aria-label="녹음"]').disabled).toBe(true);
    expect(host.querySelector('.vs-prodblock .ct').textContent).toContain('통과 0 / 2');
    expect(give.style.display).toBe('none');                              // 공개 후 버튼 숨김
  });
});

/* '오늘 발화' 링 — 분모는 고정 목표도 직전 '세션'도 아닌 **직전 학습일 발화 수** (작업지시서 §1-1 · §6.6①).
 * 직전 학습일이 없으면 아무 숫자도 주장하지 않는다. */
describe('sessionExprV2 — 오늘 발화 링 (직전 학습일 분모)', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('직전 학습일이 없으면 비교 숫자를 지어내지 않는다', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const st = makeState(); // prevDayUtter 미설정
    st.tried = 4;
    renderSessionExprV2(host, st, {});
    const rec = host.querySelector('.vs-rec');
    expect(rec.querySelector('.hd .pv').textContent).toBe(''); // prevTop — 직전 기록은 카드 윗줄
    expect(rec.querySelector('.msg').textContent).toBe('');
    expect(rec.querySelector('.vs-uring .n').textContent).toBe('4');
  });

  it('state.prevDayUtter 가 있으면 그 값이 분모 — 남은 회수를 캡션에 쓴다', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const st = makeState();
    st.prevDayUtter = 12;
    st.tried = 4;
    renderSessionExprV2(host, st, {});
    const rec = host.querySelector('.vs-rec');
    // 2026-09-14 시안 12a — 직전 기록은 카드 윗줄(prevTop). 넘기기 전에는 틸.
    expect(rec.querySelector('.hd .pv').textContent).toBe('직전 12회');
    expect(rec.querySelector('.hd .pv').classList.contains('over')).toBe(false);
    expect(rec.querySelector('.msg').textContent).toMatch(/8회/); // 12 - 4
  });

  it('직전 학습일을 넘기면 코랄 링 + 윗줄 넘김 표기 + 초과분(+N) (§6.8 · 2026-09-14 시안 12a)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const st = makeState();
    st.prevDayUtter = 34; st.tried = 41;
    renderSessionExprV2(host, st, {});
    const rec = host.querySelector('.vs-rec');
    expect(rec.querySelector('.hd .pv').classList.contains('over')).toBe(true);
    expect(rec.querySelector('.vs-uring .n').textContent).toBe('41+7');
    expect(rec.querySelector('.hd .pv').textContent).toBe('직전 34 넘김');
    expect(rec.querySelector('.vs-uring .pl').style.display).toBe(''); // 확산 펄스
    expect(rec.querySelector('.msg').textContent).toBe('');            // 이미 넘겼으면 재촉 안 함
  });

  it('오늘 발화 = 이번 세션 이전 누적 + 이번 세션 (하루 두 번째 세션)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const st = makeState();
    st.todayUtterBase = 20; st.prevDayUtter = 34; st.tried = 5;
    renderSessionExprV2(host, st, {});
    expect(host.querySelector('.vs-uring .n').textContent).toBe('25');
  });
});

/* 카드별 연습 진행 영속화 (2026-08-21).
 * 응용 행 점수·녹음 카운터·생산 연습·체이닝 진행은 전부 DOM 로컬이라 재렌더(재마운트·카드 이동·
 * 새로고침)마다 사라졌다. state.exLog[cardId] 로 옮겨 스냅샷과 함께 복원한다. */
describe('sessionExprV2 — 연습 진행 영속화 (state.exLog)', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  const drillRecBtns = (host) => [...host.querySelectorAll('.vs-drills-list .vs-drow')]
    .map((r) => r.querySelector('button[aria-label="녹음"]'));

  function stateWith(n, extra = {}) {
    const drills = Array.from({ length: n }, (_, i) => ({
      en: `Sentence number ${i}.`, kr: `센텐스 ${i}`, ko: `${i}번 문장.`,
    }));
    const explanation = {
      key: 'Is that a promise? = 약속하는 거예요?',
      drills,
      chain: { target: 'It has been a while since we met.', chunks: ['It has been a while', 'since we met'], ko: '오랜만이야.' },
    };
    const s = { id: 'e1', lang: 'en', sentence: 'Is that a promise?', ko: '약속하는 거예요?', explanation };
    return {
      size: 'desktop', recording: false, lastScore: null, tried: 0, passed: 0, combo: 0,
      pronScores: [], weakInSession: {}, recLog: {}, step: 1, total: 1,
      cards: [{ id: 'e1', lang: 'en', sentence: s.sentence, meaning: s.ko, explanation }],
      sentence: s, ...extra,
    };
  }

  it('드릴 녹음 → state.exLog 에 카드별 점수가 남는다', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = stateWith(5);
    const saveSnapshot = vi.fn();
    renderSessionExprV2(host, state, { saveSnapshot });
    const rec = drillRecBtns(host)[1];
    rec.click(); await tick();
    rec.click(); await tick(); await tick();
    expect(state.exLog.e1.drills).toEqual({ 1: [100] }); // 시도마다 누적 → 점수 원이 늘어난다 (감점제 엔진 점수)
    expect(saveSnapshot).toHaveBeenCalled();
  });

  it('exLog 가 있으면 재렌더 시 행 점수 배지와 녹음 N/M 이 복원된다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = stateWith(5, { exLog: { e1: { drills: { 0: 88, 3: 61 } } } });
    renderSessionExprV2(host, state, {});
    const scores = [...host.querySelectorAll('.vs-drills-list .vs-drow')]
      .map((r) => r.querySelector('.vs-ln-trace')); // 세 줄 행 — 점수는 문장 아래 흔적 줄
    expect(scores[0].textContent).toContain('88');
    expect(scores[0].style.display).not.toBe('none');
    expect(scores[3].textContent).toContain('61');
    expect(scores[1].style.display).toBe('none');   // 미녹음 행은 그대로 숨김
    expect(host.querySelector('.vs-labrow .ct b').textContent).toBe('2');
  });

  it('생산 연습 출제 문항이 exLog 에 고정된다 — 재렌더해도 같은 문항', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = stateWith(6);
    renderSessionExprV2(host, state, { saveSnapshot: () => {} });
    const first = [...host.querySelectorAll('.vs-prod .en')].map((e) => e.textContent);
    expect(state.exLog.e1.prod.picks).toHaveLength(3);
    const host2 = document.createElement('div'); document.body.appendChild(host2);
    renderSessionExprV2(host2, state, { saveSnapshot: () => {} });
    expect([...host2.querySelectorAll('.vs-prod .en')].map((e) => e.textContent)).toEqual(first);
  });

  it('저장된 출제 인덱스가 현재 드릴 구성과 안 맞으면 통째로 재추첨한다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    // picks 에 범위 밖 인덱스(99) — 드릴 구성이 바뀐 카드. 부분 렌더(2문항)로 새면 안 된다.
    const state = stateWith(6, { exLog: { e1: { prod: { picks: [0, 1, 99], rows: {} } } } });
    renderSessionExprV2(host, state, { saveSnapshot: () => {} });
    expect(host.querySelectorAll('.vs-prod')).toHaveLength(3);
    expect(state.exLog.e1.prod.picks.every((n) => n >= 0 && n < 6)).toBe(true);
  });

  it('생산 연습 통과·공개 상태와 스트릭이 복원된다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = stateWith(6, { exLog: { e1: { prod: { picks: [0, 1, 2], rows: { 0: true, 1: true } } } } });
    renderSessionExprV2(host, state, {});
    const rows = [...host.querySelectorAll('.vs-prod')];
    expect(rows[0].querySelector('.vs-gscore').style.display).toBe('');   // 통과 ✓
    expect(rows[1].querySelector('.vs-gscore').style.display).toBe('');
    expect(rows[2].querySelector('.vs-gscore').style.display).toBe('none');
    expect(rows[0].textContent).toContain('Sentence number 0.');          // 정답 공개 유지
    expect(rows[1].querySelector('button[aria-label="녹음"]').disabled).toBe(true);
    expect(host.querySelector('.vs-prodblock .ct').textContent).toContain('2'); // 연속 ✓ 2
  });

  it('체이닝 진행 단계가 복원된다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = stateWith(5, { exLog: { e1: { chain: { cur: 1 } } } });
    renderSessionExprV2(host, state, {});
    const rows = [...host.querySelectorAll('.vs-chain .vs-drow')];
    expect(rows[0].querySelector('.vs-gscore').style.display).toBe('');   // 1단계 통과 표시
    expect(rows[0].querySelector('button[aria-label="녹음"]').disabled).toBe(true);
    expect(rows[1].querySelector('button[aria-label="녹음"]').disabled).toBe(false); // 2단계가 현재
  });
});

/* 신규 세션 v3 — 기록/갱신 (작업지시서 §6 · QA §13 '신규 세션').
 * 갱신 축 셋: 문장 안 점수 상승(점수 원) · 오늘 발화가 직전 학습일을 넘김(링) · 오늘 칸이 진해짐(캘린더). */
describe('sessionExprV2 — 사이드바 4단 · 점수 원 · 라벨 축약', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  const withEx = () => {
    const st = makeState();
    st.sentence.explanation = {
      key: 'Is that a promise? = 약속하는 거예요?',
      situation: '약속을 확인할 때',
      mistake: 'promise 의 o 는 짧게',
      drills: [],
    };
    return st;
  };

  /* 2026-09-14 — 위젯(링·캘린더)이 좌측 사이드바로, 해설·다음 표현이 우측 패널로 갈렸다. */
  it('좌측은 목록 · 링 · 캘린더, 우측은 해설 · 다음 표현이다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, withEx(), {});
    expect([...host.querySelector('.vs-lside').children].map((n) => n.className.split(' ')[0]))
      .toEqual(['hmrow', '', 'vs-navhost', 'sp', 'vs-rec', 'vs-hist']); // 목록은 갱신용 호스트 안에 산다
    expect(host.querySelector('.vs-navhost .vs-nav')).not.toBeNull();
    expect([...host.querySelector('.vs-side').children].map((n) => n.className.split(' ')[0]))
      .toEqual(['vs-panel', 'vs-next']);
  });

  it('해설은 접힌 채 시작하고(정의 박스만), 펼치면 상황 → 실수 순서로 나온다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, withEx(), {});
    const panel = host.querySelector('.vs-side .vs-panel');
    const secs = panel.querySelector('.vs-secs');
    expect(panel.querySelector('.vs-kbox')).not.toBeNull(); // 접힘 상태에도 정의는 보인다
    expect(secs.style.display).toBe('none');
    panel.querySelector('.ph2d').click();
    expect(secs.style.display).not.toBe('none');
    expect([...secs.querySelectorAll('.vs-klab')].map((n) => n.textContent))
      .toEqual(['이런 상황에서 써요', '한국인 실수']); // 데이터 없는 섹션은 렌더 안 함
  });

  it('공부 이력 캘린더는 4주 28칸이고 셀 안에 발화 수 숫자가 없다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const st = makeState();
    st.dayMap = { '2026-08-20': 31 };
    renderSessionExprV2(host, st, {});
    const cells = host.querySelectorAll('.vs-hist .v-cal .cd');
    expect(cells).toHaveLength(28);
    for (const c of cells) expect(c.textContent).toMatch(/^\d{1,2}$/); // 날짜만
  });

  /* 상한 5 → 10 (2026-09-03 사용자 보고): 7회째부터 바로 2개가 숨어 "누락"으로 보였다. 지시는
   * "일정 숫자가 넘어가면 최신순" — 상한은 두되 신규 서너 번·복습 몇 번까지는 전부 보이게 10. */
  it('점수 원은 최근 10개만 보이고 총 N회는 전체 발화 수다', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeState();
    renderSessionExprV2(host, state, {});
    for (let i = 0; i < 12; i++) {
      host.querySelector('.vs-pill.pri').click(); await tick();
      host.querySelector('.vs-pill.recing').click(); await tick(); await tick();
    }
    expect(host.querySelectorAll('.vs-meta .v-dot')).toHaveLength(10);
    expect(host.querySelector('.vs-meta .tot').textContent).toBe('총 12회');
    expect(host.textContent).not.toContain('최근 5'); // 설명 텍스트 금지
  });

  it('섹션 라벨은 꼬리 없이 응용 연습 / 체이닝 / 생산 연습 뿐이다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const st = makeStateWithDrills();
    st.sentence.explanation.chain = { target: 'a b c d e f', chunks: ['a b', 'c d', 'e f'], ko: '가나다' };
    renderSessionExprV2(host, st, {});
    // 시안 4a 순서 — 응용 → 체이닝 → 생산 (2026-08-27 시안 대조에서 순서가 뒤바뀐 걸 발견)
    // 2026-09-14 — 세 블록은 우측 패널(.vs-side)로 옮겼다. 스테이지·좌측 라벨은 여기 섞이지 않는다.
    expect([...host.querySelectorAll('.vs-side .vs-lab')].map((n) => n.textContent))
      .toEqual(['응용 연습', '체이닝', '생산 연습']);
    expect(host.textContent).not.toContain('듣고, 따라 말하고');
    expect(host.textContent).not.toContain('자막 없이');
    expect(host.textContent).not.toContain('한글만 보고');
  });

  it('체이닝 행에 설명 줄이 없고, 통과하면 체크 원이 뜬다 (통과 ✓ 텍스트 아님)', () => {
    vi.useFakeTimers();
    try {
      const host = document.createElement('div'); document.body.appendChild(host);
      const st = makeState();
      st.demo = true;
      st.sentence.explanation.chain = { target: 'a b c d e f', chunks: ['a b', 'c d', 'e f'], ko: '가나다' };
      renderSessionExprV2(host, st, {});
      expect(host.querySelector('.vs-chain').textContent).not.toContain('앞 단계에 이어');
      expect(host.querySelector('.vs-chain .ct').textContent).toBe('통과 0 / 3');
      host.querySelectorAll('.vs-chain .vs-drow')[0].querySelector('button[aria-label="녹음"]').click();
      vi.advanceTimersByTime(900);
      const mark = host.querySelectorAll('.vs-chain .vs-drow')[0].querySelector('.vs-gscore');
      expect(mark.style.display).not.toBe('none');
      expect(mark.querySelector('.v-dot.pass')).not.toBeNull();
      expect(mark.textContent).toBe('');                                // '통과 ✓' 텍스트 금지
      expect(host.querySelector('.vs-chain .ct').textContent).toBe('통과 1 / 3');
    } finally { vi.useRealTimers(); }
  });

  it('드릴 행 점수는 시도마다 원이 하나씩 늘어난다', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeStateWithDrills();
    renderSessionExprV2(host, state, {});
    const row = host.querySelector('.vs-drills-list .vs-drow');
    const rec = row.querySelector('button[aria-label="녹음"]');
    rec.click(); await tick(); rec.click(); await tick(); await tick();
    expect(row.querySelectorAll('.vs-ln-trace .v-dot')).toHaveLength(1);
    rec.click(); await tick(); rec.click(); await tick(); await tick();
    expect(row.querySelectorAll('.vs-ln-trace .v-dot')).toHaveLength(2);
  });

  it('밑줄은 그라디언트 언더레이 — text-decoration 을 쓰지 않는다 (구절이 끊긴다)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeState(), {});
    const css = host.querySelector('style').textContent;
    // 2026-09-14 — 문장 카드(.vs-h1)가 대화 줄(.vs-ln-en)로 바뀌었다. 밑줄 규약은 그대로.
    expect(css).toContain('.vs-ln-en b{font-weight:800;background:linear-gradient(');
    expect(css).toContain('.vs-drow .en b{font-weight:800;background:linear-gradient(');
    expect(css).not.toContain('text-decoration:underline');
  });
});

/* 작업지시서 §11 회귀 목록 + §6.5 세부 — 2026-08-27 전수 대조에서 빠져 있던 항목들. */
describe('sessionExprV2 — §11/§6.5 누락분', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('녹음 중 알약은 마이크를 유지한다 (이퀄라이저는 재생 어휘 — §11)', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeState();
    renderSessionExprV2(host, state, {});
    host.querySelector('.vs-pill.pri').click(); await tick();
    const pill = host.querySelector('.vs-pill.recing');
    expect(pill.textContent).toContain('녹음 멈추기');
    expect(pill.querySelector('.v-eq')).toBeNull();      // 이퀄라이저 금지
    expect(pill.querySelector('svg path').getAttribute('d')).toBe(
      'M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3'); // VI.MIC
  });

  it('공부 이력 캘린더가 개인기록 달성일을 코랄 칸으로 칠한다 (§6.6②)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const st = makeState();
    // 고정 날짜는 4주 창(월요일 기준 -21일)이 지나가면 창 밖으로 밀린다 — 오늘에서 역산한다.
    const iso = (d) => { const x = new Date(); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };
    const [d5, d3] = [iso(5), iso(3)];
    st.dayMap = { [d5]: 31, [d3]: 47 };
    st.prDays = [d3];
    renderSessionExprV2(host, st, {});
    const pr = host.querySelectorAll('.vs-hist .v-cal .cd.pr');
    expect(pr).toHaveLength(1);
    expect(pr[0].textContent).toBe(String(+d3.slice(8, 10)));
  });

  it('체이닝의 현재 단계 녹음 원에만 다음-차례 표시가 붙는다 (§6.5)', () => {
    vi.useFakeTimers();
    try {
      const host = document.createElement('div'); document.body.appendChild(host);
      const st = makeState();
      st.demo = true;
      st.sentence.explanation.chain = { target: 'a b c d e f', chunks: ['a b', 'c d', 'e f'], ko: '가나다' };
      renderSessionExprV2(host, st, {});
      const recs = [...host.querySelectorAll('.vs-chain .vs-drow')].map((r) => r.querySelector('button[aria-label="녹음"]'));
      expect(recs.map((b) => b.classList.contains('next'))).toEqual([true, false, false]);
      recs[0].click();
      vi.advanceTimersByTime(900);
      expect(recs.map((b) => b.classList.contains('next'))).toEqual([false, true, false]);
    } finally { vi.useRealTimers(); }
  });

  it('생산 연습 "정답 보기" 는 틸 강조 + 밑줄 + 셰브론이다 (§6.5)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills(), {});
    const give = host.querySelector('.vs-prod-give');
    expect(give.textContent).toBe('정답 보기');
    expect(give.querySelector('svg')).not.toBeNull();       // 우측 셰브론
    const css = host.querySelector('style').textContent;
    expect(css).toMatch(/\.vs-prod-give\{[^}]*color:var\(--teal-deep\)/);
    expect(css).toMatch(/\.vs-prod-give\{[^}]*border-bottom:1px solid oklch\(44% \.062 192\/\.3\)/);
  });
});

/* 시안(4a) 프레임 수치 — 2026-08-27 시안 대조. 본문 패딩이 기존값(38/46)으로 남아 있었다. */
describe('sessionExprV2 — 시안 프레임 수치', () => {
  it('본문 패딩이 28px 28px 32px 다 (2026-09-14 시안 12a 실측)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeState(), {});
    const css = host.querySelector('style').textContent;
    expect(css).toContain('.vs-mainwrap{flex:1 1 0%;display:flex;gap:24px;padding:28px 28px 32px;min-width:0}');
  });

  it('표현 해설 카드 실효 패딩이 좌우 20px 다 (§6.6③)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeState(), {});
    const css = host.querySelector('style').textContent;
    expect(css).toContain('.vs-panel .ph2d{display:flex;justify-content:space-between;align-items:center;padding:18px 20px 0');
    expect(css).toContain('.vs-panel .inner{padding:14px 20px 20px');
  });
});

/* 시안 줄 단위 대조(2026-08-27)에서 나온 2건. */
describe('sessionExprV2 — 시안 줄 대조 누락분', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('녹음 알약 초기 라벨이 이력을 반영한다 (재렌더·복원 시 "다시 말하기")', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const st = makeState();
    // 2026-09-14 — 라벨 출처가 recLog(응용·상대 줄 섞임)에서 본 녹음 전용 카운터로 바뀌었다.
    st.mainRecLog = { e1: 7 };
    renderSessionExprV2(host, st, {});
    expect(host.querySelector('.vs-pill.pri').textContent).toContain('다시 말하기');
  });

  it('첫 녹음 전에는 "따라 말하기" 다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeState(), {});
    expect(host.querySelector('.vs-pill.pri').textContent).toContain('따라 말하기');
  });

  it('생산 연습 정답이 공개되면 "N단어" 줄이 사라지고 정답이 그 자리를 대신한다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills(), {});
    const row = host.querySelector('.vs-prod');
    const subs = () => [...row.querySelectorAll('.sub')].filter((n) => n.style.display !== 'none').map((n) => n.textContent);
    expect(subs().some((t) => /단어$/.test(t))).toBe(true);
    row.querySelector('.vs-prod-give').click();
    expect(subs().some((t) => /단어$/.test(t))).toBe(false);
    expect(subs().some((t) => t.includes('more than a job'))).toBe(true);
  });
});

/* 핵심 표현 밑줄 — key 좌변이 자리표시자를 쓰면 그대로는 절대 매치되지 않았다.
 * 실측(시드 코퍼스 208장): 자리표시자 23% (~ 13장 · X 등 35장). 이것들은 구조적으로 0% 매치라
 * 응용 행에 밑줄이 하나도 안 그려졌다. 자리표시자는 데이터가 이미 "여기는 아무 단어"라고 말한 것이므로
 * 와일드카드로 해석한다 — 드릴 매치율 sitcom 39→53% · core100 29→32% (실측). */
describe('hlNode — 핵심 표현 자리표시자', () => {
  const mark = (text, term) => {
    const d = document.createElement('div');
    d.appendChild(hlNode(text, term));
    return [...d.querySelectorAll('b')].map((n) => n.textContent);
  };

  it('물결표(~)는 단어 하나 와일드카드', () => {
    expect(mark("It's more than a job.", 'more than a ~')).toEqual(['more than a job']);
  });

  it('단독 대문자(X)도 자리표시자', () => {
    expect(mark("I'll take care of him.", 'take care of X')).toEqual(['take care of him']);
  });

  it('평문은 종전대로 그대로 매치', () => {
    expect(mark('Would you keep an eye on my bag?', 'keep an eye on')).toEqual(['keep an eye on']);
  });

  it('대소문자 무관', () => {
    expect(mark('Take care of the kids.', 'take care of X')).toEqual(['Take care of the']);
  });

  it('매치가 없으면 밑줄을 만들지 않는다 (없는 강조를 지어내지 않음)', () => {
    expect(mark("Sorry, I didn't catch that.", 'could you say that again')).toEqual([]);
  });

  it('자리표시자가 문장 끝을 넘어가면 매치 안 함', () => {
    expect(mark('It is more than a', 'more than a ~')).toEqual([]);
  });

  it('term 이 없으면 통짜 텍스트', () => {
    expect(mark('anything', null)).toEqual([]);
  });
});


/* 일본어 응용 연습 (2026-08-28 사고) — drillRows 가 d.en 만 읽어서 ja 드릴(ja/kana 필드)이
 * 본문 없이 음차·뜻만 렌더됐고, TTS·녹음 채점 대상도 빈 문자열이었다. */
describe('drillRows — 일본어 드릴', () => {
  const jaDrills = [
    { ja: '明日は休みなんだ。', kana: 'あしたはやすみなんだ', ko: '내일은 쉬는 날이거든', kr: '아시타와 야스미난다' },
    { ja: 'そうなんですか。', kana: 'そうなんですか', ko: '그렇군요', kr: '소- 난데스카' },
  ];

  it('일본어 본문을 렌더한다 (예전엔 비어 있었다)', () => {
    const rows = drillRows(jaDrills, '', 'ja', () => {}, false, {});
    expect(rows[0].querySelector('.en').textContent).toContain('明日は休みなんだ。');
  });

  it('한자가 있으면 가나 읽기를 함께 보여준다', () => {
    const rows = drillRows(jaDrills, '', 'ja', () => {}, false, {});
    const sub = rows[0].querySelector('.sub').textContent;
    expect(sub).toContain('あしたはやすみなんだ');
    expect(sub).toContain('아시타와 야스미난다');
    expect(sub).toContain('내일은 쉬는 날이거든');
  });

  it('한자가 없어 가나가 본문과 같으면 가나를 중복 표시하지 않는다', () => {
    const rows = drillRows(jaDrills, '', 'ja', () => {}, false, {});
    const sub = rows[1].querySelector('.sub').textContent;
    expect(sub.split('·').filter((t) => t.includes('そうなんですか')).length).toBe(0);
  });

  it('영어 드릴은 기존 그대로 (회귀 방지)', () => {
    const rows = drillRows([{ en: 'Take it easy.', ko: '무리하지 마', kr: '테이킷 이지' }], '', 'en', () => {}, false, {});
    expect(rows[0].querySelector('.en').textContent).toContain('Take it easy.');
    expect(rows[0].querySelector('.sub').textContent).toContain('무리하지 마');
  });
});

/* 오발화 게이트 (2026-08-29 사용자 보고: "그 문장을 말하지 않고 아무 발음이나 하거나 다음 문장을
 * 말했는데도 50점대"). 뿌리는 enableMiscue:false 일 때 Azure 가 전사를 레퍼런스로 그대로 에코하는 것 —
 * 전사 비교 자체가 불가능했다. 라이브 Azure 실측(2026-08-29, 같은 오디오·같은 레퍼런스):
 *   miscue:false → 전사 "What do you mean by that exactly?"(레퍼런스 에코) · 49점
 *   miscue:true  → 전사 "What?"(정직) · 2점
 * 메인 카드(신규)·복습·응용 드릴 세 경로가 miscue:false 였다 (체이닝·생산 연습은 이미 true). */
describe('sessionExprV2 — 오발화 게이트 (메인 카드)', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  async function recOnce(host) {
    host.querySelector('.vs-pill.pri').click(); await tick();
    host.querySelector('.vs-pill.recing').click(); await tick(); await tick();
  }

  it('메인 녹음은 enableMiscue:true 로 채점을 요청한다 (레퍼런스 에코 차단)', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeState(), {});
    await recOnce(host);
    expect(stopAndAnalyze.mock.calls[0][3]).toEqual({ enableMiscue: true });
  });

  it('다른 문장을 말하면 점수·발화가 기록되지 않고 안내가 뜬다', async () => {
    stopAndAnalyze.mockResolvedValueOnce({ score: 22, recognizedText: 'It mean I it I I put.', weakPhonemes: [] });
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeState();
    renderSessionExprV2(host, state, {});
    await recOnce(host);
    expect(state.tried).toBe(0);
    expect(state.lastScore).toBe(null);
    expect(state.pronScores).toEqual([]);
    expect(state.recLog.e1).toBeUndefined();
    expect(savePronunciationLog).not.toHaveBeenCalled();
    expect(host.querySelector('.vs-ring')).toBeNull();          // 점수 링 없음
    expect(host.querySelector('.vs-pill.recing')).toBeNull();   // 녹음 표시 해제
    expect(showRecordToast).toHaveBeenCalledTimes(1);
  });

  it('단어는 다 말했고 발음만 나쁜 21점은 그대로 기록된다 (실기록 <50점 44건 보호)', async () => {
    stopAndAnalyze.mockResolvedValueOnce({ score: 21, recognizedText: 'Is that a promise?', weakPhonemes: [] });
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeState();
    renderSessionExprV2(host, state, {});
    await recOnce(host);
    expect(state.tried).toBe(1);
    expect(state.lastScore).toBe(100); // 감점제: acc 21 은 accuracyScore 로만 — 의도(기록 자체)는 유지
    expect(savePronunciationLog).toHaveBeenCalledTimes(1);
  });
});

describe('sessionExprV2 — 오발화 게이트 (응용 드릴)', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  const drillRecBtn = (host, i = 0) => [...host.querySelectorAll('.vs-drills-list .vs-drow')][i].querySelector('button[aria-label="녹음"]');

  it('드릴 녹음도 enableMiscue:true 로 채점을 요청한다', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills(), {});
    const b = drillRecBtn(host);
    b.click(); await tick(); b.click(); await tick(); await tick();
    expect(stopAndAnalyze.mock.calls[0][3]).toEqual({ enableMiscue: true });
  });

  it('드릴에서 다른 문장을 말하면 행 점수 원도 세션 집계도 붙지 않는다', async () => {
    stopAndAnalyze.mockResolvedValueOnce({ score: 14, recognizedText: 'But I but I.', weakPhonemes: [] });
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeStateWithDrills();
    renderSessionExprV2(host, state, {});
    const b = drillRecBtn(host);
    b.click(); await tick(); b.click(); await tick(); await tick();
    expect(state.tried).toBe(0);
    expect(state.pronScores).toEqual([]);
    expect(b.closest('.vs-drow').querySelector('.vs-ln-trace').style.display).toBe('none');
    expect(host.querySelector('.vs-labrow .ct b').textContent).toBe('0');
    expect(showRecordToast).toHaveBeenCalledTimes(1);
  });
});

/* 녹음 중 듣기 (2026-08-29 사용자 요구) — 응용 드릴은 녹음 중에도 재생이 되는데 메인 카드만
 * 막혀 있었다. 먼저 멈추기를 눌러야 하는 한 박자가 사라진다. 드릴과 같은 계약으로 맞춘다.
 * ⚠ 재생음이 녹음에 섞이는 것은 브라우저 AEC(에코 제거)가 막는다 — 드릴이 2026-07-22 부터
 *   같은 조건으로 돌아가고 있다. 이 세션에서 마이크로 실측하지는 못했다. */
describe('sessionExprV2 — 녹음 중 듣기', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  const listenBtn = (host) => [...host.querySelectorAll('.vs-pill')].find((b) => b.textContent.includes('듣기'));

  it('녹음 중에도 듣기가 재생된다 (응용 드릴과 동일)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const speak = vi.fn();
    window.studySpeech = { speak };
    const state = makeState();
    state.recording = true;
    renderSessionExprV2(host, state, {});
    listenBtn(host).click();
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toBe('Is that a promise?');
  });
});

/* 응용 드릴 발화 이력의 원천 (2026-08-29) — 종전엔 드릴 점수가 세션 스냅샷에만 살아 세션이 끝나면
 * 사라졌다. 복습에서 "몇 번 말했고 보통 몇 점인지"를 보여주려면 먼저 남아야 한다. */
describe('sessionExprV2 — 응용 드릴 점수 영속화', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  const drillRecBtn = (host, i = 0) => [...host.querySelectorAll('.vs-drills-list .vs-drow')][i].querySelector('button[aria-label="녹음"]');

  it('드릴 녹음이 pronunciationLog 에 <카드id>#drill<행> 으로 쌓인다', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills(), {});
    const b = drillRecBtn(host, 1);
    b.click(); await tick(); b.click(); await tick(); await tick();
    expect(savePronunciationLog).toHaveBeenCalledTimes(1);
    const params = savePronunciationLog.mock.calls[0][1];
    expect(params.sentenceId).toBe("e1#drill#He's more than a friend.");
    expect(params.lang).toBe('en');
    expect(params.result.score).toBe(100); // 감점제 점수가 정본 — 원 acc 는 accuracyScore
    expect(params.result.accuracyScore).toBe(92);
    expect(params.result.scoreModel).toBe('ded2');
  });

  it('오발화로 버린 드릴은 쌓이지 않는다', async () => {
    stopAndAnalyze.mockResolvedValueOnce({ score: 14, recognizedText: 'But I but I.', weakPhonemes: [] });
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills(), {});
    const b = drillRecBtn(host, 0);
    b.click(); await tick(); b.click(); await tick(); await tick();
    expect(savePronunciationLog).not.toHaveBeenCalled();
  });
});

/* 복습 응용연습 발화 이력 (2026-08-29 사용자 요구) — "몇 번 발화했고 보통 몇 점인지 필요하다.
 * 점수 신뢰도가 낮아도 횟수 정보는 의미가 있다(어려우면 많이 말했을 테니)."
 * 오늘 시도는 행의 점수 원이 이미 보여주므로 이력은 **오늘 이전**만 센다. */
describe('drillRows — 이전 발화 이력 표시', () => {
  const drills = [
    { en: "It's more than a job.", kr: '잇츠 모어 대너 잡', ko: '그건 직업 그 이상이에요.' },
    { en: "He's more than a friend.", kr: '히즈 모어 대너 프렌드', ko: '걔는 친구 그 이상이야.' },
  ];

  it('이력이 있으면 횟수와 평균을 부제에 붙인다', () => {
    const rows = drillRows(drills, '', 'en', () => {}, false, { history: { "It's more than a job.": { count: 3, avg: 84 } } });
    expect(rows[0].querySelector('.sub').textContent).toContain('이전 3회');
    expect(rows[0].querySelector('.sub').textContent).toContain('84');
  });

  it('이력이 없는 행은 부제가 그대로다 (회귀 방지)', () => {
    const rows = drillRows(drills, '', 'en', () => {}, false, { history: { "It's more than a job.": { count: 3, avg: 84 } } });
    const sub = rows[1].querySelector('.sub').textContent;
    expect(sub).toContain('걔는 친구 그 이상이야.');
    expect(sub).not.toContain('이전');
  });

  it('history 를 안 주면 종전과 같다', () => {
    const rows = drillRows(drills, '', 'en', () => {}, false, {});
    expect(rows[0].querySelector('.sub').textContent).not.toContain('이전');
  });
});

/* 녹음 품질 게이트 (2026-08-29) — 사용자 지적 "엉뚱한 문장인데 50점이 말이 되냐".
 * Azure AccuracyScore 가 저점에서 부풀려지는 구간(음소평균 42.7 인데 acc 82)은
 * enableMiscue:true 로도 안 걸린다. 음소 원시 점수로 따로 막는다. 근거는 coverageJudge.judgeRecording 주석. */
describe('sessionExprV2 — 녹음 품질 게이트', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  const ph = (mean, n = 26) => Array.from({ length: n }, () => ({ symbol: 'x', word: 'w', score: mean }));
  async function recOnce(host) {
    host.querySelector('.vs-pill.pri').click(); await tick();
    host.querySelector('.vs-pill.recing').click(); await tick(); await tick();
  }

  it('표시 점수 82 여도 음소평균 43 이면 기록하지 않는다', async () => {
    stopAndAnalyze.mockResolvedValueOnce({ score: 82, recognizedText: 'Is that a promise?', weakPhonemes: [], phonemeScores: ph(43) });
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeState();
    renderSessionExprV2(host, state, {});
    await recOnce(host);
    expect(state.tried).toBe(0);
    expect(state.lastScore).toBe(null);
    expect(savePronunciationLog).not.toHaveBeenCalled();
    expect(showRecordToast).toHaveBeenCalledTimes(1);
    expect(String(showRecordToast.mock.calls[0][0])).toContain('또렷하게');
  });

  it('오발화와 녹음 불량은 안내가 다르다', async () => {
    stopAndAnalyze.mockResolvedValueOnce({ score: 12, recognizedText: 'It mean I it I I put.', weakPhonemes: [], phonemeScores: ph(88) });
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeState(), {});
    await recOnce(host);
    expect(String(showRecordToast.mock.calls[0][0])).toContain('다른 문장');
  });

  it('또렷한 오발화(소리·내용 둘 다 바닥)는 원인을 지목하지 않는다 — garbled 배선 (라이브 캡처 형태)', async () => {
    // 순수 함수 검증만으론 UI 배선 무력화(garbled→unclear 접기)가 1338건 전부 초록으로 통과한다 —
    // 적대 감사 뮤테이션 확증. 토스트까지 도달하는 통합 핀이 이 테스트다.
    stopAndAnalyze.mockResolvedValueOnce({ score: 2, recognizedText: 'That say.', weakPhonemes: [], phonemeScores: ph(31.2) });
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeState(), {});
    await recOnce(host);
    expect(showRecordToast).toHaveBeenCalledTimes(1);
    const msg = String(showRecordToast.mock.calls[0][0]);
    expect(msg).not.toMatch(/다른 문장/);
    expect(msg).not.toMatch(/안 들렸/);
  });

  it('음소평균 66 인 저점 발화는 그대로 기록한다 (실기록 하한 보호)', async () => {
    stopAndAnalyze.mockResolvedValueOnce({ score: 21, recognizedText: 'Is that a promise?', weakPhonemes: [], phonemeScores: ph(66) });
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeState();
    renderSessionExprV2(host, state, {});
    await recOnce(host);
    expect(state.tried).toBe(1);
    expect(state.lastScore).toBe(100); // 감점제: acc 21 은 accuracyScore 로만 — 의도(기록 자체)는 유지
  });
});

/* 체이닝·생산 연습에도 음질 게이트 (2026-08-29) — 두 경로는 통과 판정이 따로 있어서
 * (judgeCoverage / judgeProduction) 음질을 안 물었다. 특히 생산은 accuracy>=65 로 통과를 정하는데
 * 합성 취약 구간의 표시 acc 가 82 라 **무너진 녹음이 통과로 처리된다**. 그리고 두 경로 모두
 * 통과 여부와 무관하게 onUtterance/onScore 로 '오늘 발화'와 pronScores 에 집계된다. */
describe('sessionExprV2 — 체이닝·생산 음질 게이트', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  const ph = (mean, n = 26) => Array.from({ length: n }, () => ({ symbol: 'x', word: 'w', score: mean }));
  const CHAIN = { target: 'It is a promise', chunks: ['It is', 'a promise'], ko: '약속이야' };

  function chainState() {
    const s = makeState();
    s.sentence.explanation.chain = CHAIN;
    s.cards[1].explanation.chain = CHAIN;
    return s;
  }

  it('체이닝 — 음소평균 41 이면 단계가 진행되지 않고 발화로도 안 센다', async () => {
    stopAndAnalyze.mockResolvedValueOnce({ score: 82, recognizedText: 'It is', phonemeScores: ph(41) });
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = chainState();
    renderSessionExprV2(host, state, {});
    const row = host.querySelector('.vs-chain .vs-drow');
    const b = row.querySelector('button[aria-label="녹음"]');
    b.click(); await tick(); b.click(); await tick(); await tick();
    expect(host.querySelector('.vs-chain .ct').textContent).toContain('통과 0');
    expect(state.tried).toBe(0);
    expect(state.pronScores).toEqual([]);
    expect(String(showRecordToast.mock.calls[0][0])).toContain('또렷하게');
  });

  it('생산 연습 — 표시 acc 82 여도 음소평균 41 이면 통과가 아니다', async () => {
    stopAndAnalyze.mockResolvedValueOnce({
      score: 82, recognizedText: "It's more than a job.", phonemeScores: ph(41),
      wordScores: [{ word: 'its', score: 90 }, { word: 'more', score: 90 }],
    });
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeStateWithDrills();
    renderSessionExprV2(host, state, {});
    const row = [...host.querySelectorAll('.vs-prod')][0];
    const b = row.querySelector('button[aria-label="녹음"]');
    b.click(); await tick(); b.click(); await tick(); await tick();
    expect(row.textContent).not.toContain('more than a job');   // 정답 미공개 = 통과 아님
    expect(host.querySelector('.vs-prodblock .ct').textContent).toContain('통과 0 / 2');
    expect(state.tried).toBe(0);
  });

  it('음소평균 66 이면 체이닝은 종전대로 판정한다 (회귀 방지)', async () => {
    stopAndAnalyze.mockResolvedValueOnce({ score: 90, recognizedText: 'It is', phonemeScores: ph(66) });
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = chainState();
    renderSessionExprV2(host, state, {});
    const row = host.querySelector('.vs-chain .vs-drow');
    const b = row.querySelector('button[aria-label="녹음"]');
    b.click(); await tick(); b.click(); await tick(); await tick();
    expect(host.querySelector('.vs-chain .ct').textContent).toContain('통과 1');
    expect(state.tried).toBe(1);
  });
});

/* 데모 격리 (2026-08-29 전면 재감사 확증) — 데모 드릴 녹음이 pronunciationLog 에 실 행을 쓰고
 * 있었다 (session-new.js 의 격리 계약 "실 DB write 를 일절 하지 않는다" 위반). 로그인 상태에서
 * ?demo=1 진입 시 window.studyDB 는 실 Dexie 이고 sync 가 Supabase 까지 올린다. */
describe('sessionExprV2 — 데모 드릴은 DB 에 쓰지 않는다', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('demo 드릴 녹음 → 행 점수는 뜨지만 savePronunciationLog 는 0회', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeStateWithDrills({ demo: true });
    renderSessionExprV2(host, state, {});
    const b = [...host.querySelectorAll('.vs-drills-list .vs-drow')][0].querySelector('button[aria-label="녹음"]');
    b.click();
    await new Promise((r) => setTimeout(r, 900));   // 데모 시뮬 800ms
    expect(state.tried).toBe(1);                    // 화면 동작은 그대로
    expect(savePronunciationLog).not.toHaveBeenCalled();
  });
});

/* 채점 보류 안내 (2026-08-29 실사용 보고) — 오발화 시 "또렷하게 안 들렸어요"가 뜨는 비대칭.
 * 라이브 실측: 또렷한 오발화도 음소 정렬이 함께 무너져(acc 2·음소평균 31) unclear 로 오인됐다.
 * garbled(둘 다 바닥)는 원인을 지목하지 않는다 — 틀린 원인 지목은 사용자가 엉뚱한 걸 고치게 한다. */
describe('recordGateMessage — 채점 보류 안내 문구', () => {
  it('unclear·misread·garbled 는 서로 다른 문구이고, garbled 는 원인을 지목하지 않는다', () => {
    const unclear = recordGateMessage('unclear');
    const misread = recordGateMessage('misread');
    const garbled = recordGateMessage('garbled');
    expect(misread).toMatch(/다른 문장/);
    expect(unclear).toMatch(/또렷/);
    expect(garbled).not.toMatch(/다른 문장/);          // 오발화 단정 금지
    expect(garbled).not.toMatch(/안 들렸/);            // 음질 단정 금지
    expect(new Set([unclear, misread, garbled]).size).toBe(3);
  });
});

/* 채점 중 표시 (2026-08-29 오후 — "점수 반환이 느리다" 후속) — 분석 대기(실측 0.9~2.1초) 동안
 * 라벨이 '녹음 멈추기'로 남아 아직 녹음 중인 것처럼 보였다. 상태를 정직하게 보여준다. */
describe('sessionExprV2 — 채점 중 표시', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('분석 대기 동안 "채점 중…", 끝나면 "다시 말하기"', async () => {
    let resolveA;
    stopAndAnalyze.mockReturnValueOnce(new Promise((r) => { resolveA = r; }));
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeState(), {});
    host.querySelector('.vs-pill.pri').click(); await tick();
    const pill = host.querySelector('.vs-pill.recing');
    pill.click(); await tick();
    expect(pill.textContent).toContain('채점 중');
    resolveA({ score: 92, recognizedText: 'Is that a promise?', weakPhonemes: [] });
    await tick(); await tick();
    expect(pill.textContent).toContain('다시 말하기');
  });
});

describe('sessionExprV2 — 투기적 선채점 배선', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('메인 녹음 시작에 speculate(기대 문장·카드)가 실린다', async () => {
    const { startMicRecording } = await import('../services/sessionAnalyze.js');
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeState(), {});
    host.querySelector('.vs-pill.pri').click(); await tick();
    expect(startMicRecording).toHaveBeenCalledWith(expect.objectContaining({
      autoStopSilenceMs: 1400,
      speculate: expect.objectContaining({ expected: 'Is that a promise?' }),
    }));
  });
});

/* 2026-08-30 감사 확증 — 선채점 배선이 메인·복습 2경로만 핀되고 드릴·체이닝·생산 3경로는
 * 뮤테이션(speculate 인자 제거)에도 전 스위트가 초록이었다. 세 경로를 각각 고정한다. */
describe('sessionExprV2 — 드릴·체이닝·생산 선채점 배선', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('응용 드릴 녹음 시작에 speculate(드릴 문장)가 실린다', async () => {
    const { startMicRecording } = await import('../services/sessionAnalyze.js');
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills(), {});
    [...host.querySelectorAll('.vs-drills-list .vs-drow')][0].querySelector('button[aria-label="녹음"]').click();
    await tick();
    expect(startMicRecording).toHaveBeenCalledWith(expect.objectContaining({
      autoStopSilenceMs: 1400,
      speculate: expect.objectContaining({ expected: expect.stringContaining('more than a') }),
    }));
  });

  it('체이닝 녹음 시작에 speculate(현재 단계 문장)가 실린다', async () => {
    const { startMicRecording } = await import('../services/sessionAnalyze.js');
    const host = document.createElement('div'); document.body.appendChild(host);
    const s = makeState();
    s.sentence.explanation.chain = {
      target: "It's been a while since we caught up. We should grab dinner sometime.",
      chunks: ["It's been a while", 'since we caught up', 'We should grab dinner', 'sometime'],
      ko: '오랜만이야. 언제 저녁이나 먹자.',
    };
    renderSessionExprV2(host, s, {});
    [...host.querySelectorAll('.vs-chain .vs-drow')][0].querySelector('button[aria-label="녹음"]').click();
    await tick();
    expect(startMicRecording).toHaveBeenCalledWith(expect.objectContaining({
      speculate: expect.objectContaining({ expected: expect.stringContaining("It's been a while") }),
    }));
  });

  it('생산 연습 녹음 시작에 speculate(출제 문장)가 실린다', async () => {
    const { startMicRecording } = await import('../services/sessionAnalyze.js');
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills(), {});
    [...host.querySelectorAll('.vs-prod')][0].querySelector('button[aria-label="녹음"]').click();
    await tick();
    expect(startMicRecording).toHaveBeenCalledWith(expect.objectContaining({
      speculate: expect.objectContaining({ expected: expect.stringContaining('more than a') }),
    }));
  });
});


/* 점수 원 이력 상한 (2026-08-31 사용자 결정 — "일정 숫자가 넘어가면 최신순") — 메인은 기존
 * 최근 5개 규약 유지, 드릴 행은 최근 8개(26px 원 8개가 데스크톱 행 폭 실측 한계). '총 N회'류
 * 카운트는 전체 이력을 유지한다. */
describe('sessionExprV2 — 드릴 점수 원은 최근 8개만 렌더', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('저장 이력 10개 → 원 8개(최신 8), 이력 3개 → 3개', () => {
    const rows = drillRows([{ en: 'Take it easy.', ko: '무리하지 마.' }], '', 'en', () => {}, false,
      { saved: { 0: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20] } });
    const host = document.createElement('div'); document.body.appendChild(host);
    rows.forEach((r) => host.appendChild(r));
    const dots = host.querySelectorAll('.vs-gscore .v-dot');
    expect(dots).toHaveLength(8);
    expect(dots[0].textContent).toBe('13');   // 오래된 11·12 는 탈락
    expect(dots[7].textContent).toBe('20');
  });
});

/* 체이닝·생산 연습 점수 원 (2026-09-03 사용자 지시 "발화한 점수를 빠뜨리지 말 것") — 두 블록의 발화는
 * '오늘 발화'에는 세면서 점수는 세션 안에서도 그리지 않았고 기록도 남기지 않았다. 드릴 행과 같은
 * 점수 원을 단계(체이닝)·문장(생산) 행에 붙이고, 실경로는 #chain#/#prod# 키로 저장한다. */
describe('sessionExprV2 — 체이닝·생산 점수 원 + 저장', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  const CHAIN = { target: 'It is a promise', chunks: ['It is', 'a promise'], ko: '약속이야' };
  const ph = (mean, n = 26) => Array.from({ length: n }, () => ({ symbol: 'x', word: 'w', score: mean }));
  const numDots = (row) => [...row.querySelectorAll('.v-dot')].filter((d) => /^\d+$/.test(d.textContent)).map((d) => d.textContent);
  const chainRows = (host) => [...host.querySelectorAll('.vs-chain .vs-drow')];
  const prodRow = (host, ko) => [...host.querySelectorAll('.vs-prod')].find((r) => r.textContent.includes(ko));
  function stateWithChain(over = {}) {
    const st = makeStateWithDrills(over);
    st.sentence.explanation.chain = CHAIN; st.cards[1].explanation.chain = CHAIN;
    return st;
  }

  it('과거 체이닝 점수는 단계 행에, 생산 점수는 그 문장 행에 원으로 뜬다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const st = stateWithChain();
    st.exLog = { e1: { chainScores: { 0: [88, 91] }, prodScores: { "It's more than a job.": [70] } } };
    renderSessionExprV2(host, st, {});
    expect(numDots(chainRows(host)[0])).toEqual(['88', '91']);
    expect(numDots(chainRows(host)[1])).toEqual([]);
    expect(numDots(prodRow(host, '그건 직업 그 이상이에요.'))).toEqual(['70']);
    expect(numDots(prodRow(host, '걔는 친구 그 이상이야.'))).toEqual([]);
  });

  it('데모 체이닝·생산 녹음 → 원이 하나 붙고 DB 저장은 0회 (격리 계약)', () => {
    vi.useFakeTimers();
    try {
      const host = document.createElement('div'); document.body.appendChild(host);
      const st = stateWithChain({ demo: true });
      renderSessionExprV2(host, st, {});
      chainRows(host)[0].querySelector('button[aria-label="녹음"]').click(); vi.advanceTimersByTime(900);
      expect(numDots(chainRows(host)[0])).toHaveLength(1);
      prodRow(host, '그건 직업 그 이상이에요.').querySelector('button[aria-label="녹음"]').click(); vi.advanceTimersByTime(900);
      expect(numDots(prodRow(host, '그건 직업 그 이상이에요.'))).toHaveLength(1);
      expect(savePronunciationLog).not.toHaveBeenCalled();
      expect(st.exLog.e1.chainScores[0]).toHaveLength(1);   // 스냅샷 복원용 누적
      expect(st.exLog.e1.prodScores["It's more than a job."]).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });

  it('실경로 체이닝 녹음 → #chain# 키로 저장, 생산 녹음 → #prod# 키로 저장', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const st = stateWithChain();
    renderSessionExprV2(host, st, {});
    stopAndAnalyze.mockResolvedValueOnce({ score: 90, recognizedText: 'It is', phonemeScores: ph(66) });
    const cb = chainRows(host)[0].querySelector('button[aria-label="녹음"]');
    cb.click(); await tick(); cb.click(); await tick(); await tick();
    expect(savePronunciationLog.mock.calls.map((c) => c[1]?.sentenceId)).toContain('e1#chain#It is');
    expect(savePronunciationLog.mock.calls.at(-1)[1].lang).toBe('en');
    expect(numDots(chainRows(host)[0])).toHaveLength(1);
    stopAndAnalyze.mockResolvedValueOnce({
      score: 82, recognizedText: "It's more than a job.", phonemeScores: ph(66),
      wordScores: [{ word: 'its', score: 90 }, { word: 'more', score: 90 }],
    });
    const pr = prodRow(host, '그건 직업 그 이상이에요.');
    const pb = pr.querySelector('button[aria-label="녹음"]');
    pb.click(); await tick(); pb.click(); await tick(); await tick();
    expect(savePronunciationLog.mock.calls.map((x) => x[1]?.sentenceId)).toContain("e1#prod#It's more than a job.");
    expect(numDots(pr)).toHaveLength(1);
  });
});


/* 미니대화 (2026-09-08 작업지시서 §1~§4) — 타깃 표현의 사용 맥락을 주는 contextual input. 평가·암기 대상이 아니므로
 * 블록에는 녹음·통과 판정·다음 잠금이 없고, 전체 듣기·한 줄 듣기·타깃 줄 강조만 있다. */
/* 미니대화 블록(miniDialogueEl) — 2026-09-14 부터 **복습 세션 전용**이다.
 * 신규 세션은 대화 스테이지(dialogueStageEl)가 대신하므로 여기서는 컴포넌트를 직접 만들어 계약을 지킨다
 * (복습 sessionReviewV2 가 정답 공개 뒤 mountMini 로 같은 함수를 부른다). */
describe('miniDialogueEl — 복습이 쓰는 미니대화 블록', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  const MD = [
    { speaker: 'A', en: "I'll finish it by Friday.", ko: '금요일까지 끝낼게.' },
    { speaker: 'B', en: 'Is that a promise?', ko: '약속하는 거예요?' },
    { speaker: 'A', en: 'It is. You can count on it.', ko: '그럼. 믿어도 돼.' },
  ];
  const CARD = { id: 'e1', lang: 'en', sentence: 'Is that a promise?' };
  const mk = (md = MD, opts = {}) => {
    const el = miniDialogueEl(md, CARD, 'en', 'Is that a promise?', opts);
    document.body.appendChild(el);
    return el;
  };

  it('줄 3개, 화자 표시, 타깃 줄만 강조, 한글 병기', () => {
    const mini = mk();
    const lines = [...mini.querySelectorAll('.vs-mini-line')];
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.getAttribute('data-speaker'))).toEqual(['A', 'B', 'A']);
    expect(lines.map((l) => l.classList.contains('tgt'))).toEqual([false, true, false]);
    expect(lines[1].querySelector('.en').textContent).toBe('Is that a promise?');
    expect(lines[1].querySelector('.ko').textContent).toBe('약속하는 거예요?');
  });

  it('필드가 없으면 블록 없음 (기존 카드 호환)', () => {
    expect(miniDialogueEl(undefined, { sentence: 'x' }, 'en', 'x')).toBeNull();
    expect(miniDialogueEl([], { sentence: 'x' }, 'en', 'x')).toBeNull();
  });

  it('한 줄 듣기 → 그 줄만, 화자별 목소리(A 여성·B 남성)', () => {
    const speak = vi.fn();
    window.studySpeech = { speak };
    const mini = mk();
    const plays = [...mini.querySelectorAll('button[aria-label="듣기"]')];
    expect(plays).toHaveLength(3);
    plays[1].click();
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toBe('Is that a promise?');
    expect(speak.mock.calls[0][1].voice).toBe('en-US-AndrewMultilingualNeural');
    plays[0].click();
    expect(speak.mock.calls[1][1].voice).toBe('en-US-AvaMultilingualNeural');
  });

  it('전체 듣기 → 끝나면 다음 줄, 순서대로 3줄', () => {
    const speak = vi.fn((_text, opts) => { opts?.onEnd?.(); });
    window.studySpeech = { speak };
    const mini = mk();
    mini.querySelector('[data-role="mini-all"]').click();
    expect(speak.mock.calls.map((c) => c[0])).toEqual(["I'll finish it by Friday.", 'Is that a promise?', 'It is. You can count on it.']);
  });

  /* 녹음 (2026-09-12 사용자 결정 "미니대화에도 녹음 버튼") — 줄마다 선택 녹음.
   * 응용 행과 같은 채점·배지이고 진행 조건(게이트·판정·잠금)은 없다. 집계·영속은 호출부(onScore) 책임. */
  it('줄마다 녹음 버튼 — 녹음 1회 → onScore(줄 index, 점수) + 줄 점수 배지', async () => {
    const onScore = vi.fn();
    const mini = mk(MD, { onScore });
    const recs = [...mini.querySelectorAll('button[aria-label="녹음"]')];
    expect(recs).toHaveLength(3);
    recs[1].click(); await tick();
    recs[1].click(); await tick(); await tick();
    expect(onScore).toHaveBeenCalledTimes(1);
    expect(onScore.mock.calls[0][0]).toBe(1);
    expect(onScore.mock.calls[0][1].score).toBe(100); // mock: 완전 발화
    expect(recs[1].closest('.vs-mini-line').querySelector('.vs-gscore').textContent).toContain('100');
  });

  it('저장된 줄 점수(exLog.mini)를 배지로 복원한다', () => {
    const mini = mk(MD, { saved: { 0: [77] } });
    const lines = mini.querySelectorAll('.vs-mini-line');
    expect(lines[0].querySelector('.vs-gscore').textContent).toContain('77');
    expect(lines[1].querySelector('.vs-gscore').textContent).toBe('');
  });

  it('데모(마이크 없음)에서는 녹음 클릭 → 시뮬 점수 배지', async () => {
    const mini = mk(MD, { demo: true, onScore: vi.fn() });
    mini.querySelector('button[aria-label="녹음"]').click();
    await new Promise((r) => setTimeout(r, 900));
    expect(mini.querySelector('.vs-mini-line .vs-gscore').textContent).not.toBe('');
  });

  it('줄의 name 이 있으면 화자 칸에 이름을, 없으면 speaker 글자를 보여준다 (2026-09-12)', () => {
    const mini = mk([{ ...MD[0], name: '소연' }, MD[1], MD[2]]);
    expect([...mini.querySelectorAll('.vs-mini-line .ix')].map((e) => e.textContent)).toEqual(['소연', 'B', 'A']);
  });

  it('scene 을 주면 라벨 아래 장면 한 줄(.vs-mini-scene)을 보여준다', () => {
    const mini = mk(MD, { scene: '새벽 4시, 공항 픽업' });
    expect(mini.querySelector('.vs-mini-scene').textContent).toBe('새벽 4시, 공항 픽업');
  });

  it('줄 부제는 응용 행과 같이 한글 발음(kr) · 뜻(ko) — kr 이 없으면 뜻만 (2026-09-13)', () => {
    const mini = mk([{ ...MD[0], kr: '아일 f피니쉬 잇 바이 f라이데이' }, MD[1], MD[2]]);
    const subs = [...mini.querySelectorAll('.vs-mini-line .sub')].map((e) => e.textContent);
    expect(subs[0]).toBe('아일 f피니쉬 잇 바이 f라이데이 · 금요일까지 끝낼게.');
    expect(subs[1]).toBe('약속하는 거예요?');
    expect(MINI_VOICES.A).toMatch(/Neural$/);
    expect(MINI_VOICES.B).toMatch(/Neural$/);
  });

  it('응용 행과 같은 행 구조(.vs-drow)라 버튼 열이 같은 자리에 온다', () => {
    const mini = mk();
    const lines = [...mini.querySelectorAll('.vs-drow')];
    expect(lines).toHaveLength(3);
    for (const l of lines) {
      const kids = [...l.children].map((n) => n.className.split(' ')[0]);
      expect(kids.slice(-4)).toEqual(['grow', 'vs-gscore', 'vs-cir', 'vs-cir']);
    }
  });

  it('신규 세션은 더 이상 이 블록을 쓰지 않는다 (대화 스테이지가 대신한다)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const st = makeState();
    st.sentence.explanation.miniDialogue = MD;
    renderSessionExprV2(host, st, {});
    expect(host.querySelector('.vs-mini')).toBeNull();
    expect(host.querySelector('.vs-stage')).not.toBeNull();
  });
});

describe('sessionExprV2 — 체이닝·생산 블록 숨김 (2026-09-12 사용자 결정, 기본값 chainProd=false)', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); SESSION_BLOCKS.chainProd = false; });
  afterEach(() => { SESSION_BLOCKS.chainProd = true; });
  const CHAIN = { target: 'Is that a promise? I need to know.', chunks: ['Is that a promise?', 'I need to know.'], ko: '약속이야? 알아야겠어.' };
  const mountWithChain = () => {
    const st = makeStateWithDrills();
    st.sentence.explanation.chain = CHAIN;
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, st, {});
    return host;
  };

  it('chain·drills 가 있어도 .vs-chain·.vs-prodblock 은 렌더되지 않고 응용 목록은 남는다', () => {
    const host = mountWithChain();
    expect(host.querySelector('.vs-chain')).toBeNull();
    expect(host.querySelector('.vs-prodblock')).toBeNull();
    expect(host.querySelector('.vs-drills-list')).not.toBeNull();
  });

  it('플래그를 켜면 두 블록이 다시 렌더된다 (코드 유지 계약)', () => {
    SESSION_BLOCKS.chainProd = true;
    const host = mountWithChain();
    expect(host.querySelector('.vs-chain')).not.toBeNull();
    expect(host.querySelector('.vs-prodblock')).not.toBeNull();
  });
});

/* ── 대화 스테이지 (2026-09-14 시안 12a) ─────────────────────────────────
 * 신규 세션 화면이 "카드 1장 = 화면 1장" 에서 "대화 1편 고정 + 선택 줄이 열려 연습 화면" 으로 바뀐다.
 * 여기부터는 새 구조의 계약. 미니대화 블록(miniDialogueEl)은 복습 전용으로 남는다. */
describe('sessionExprV2 — 대화 스테이지', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  const MD = [
    { speaker: 'A', name: '소연', en: 'We landed early.', ko: '일찍 내렸어.', kr: '위 랜디더r리' },
    { speaker: 'B', name: '지오', en: "I'm on my way.", ko: '가는 중이야.', kr: '아이몬 마이 웨이' },
    { speaker: 'A', name: '소연', en: 'Take your time.', ko: '천천히 와.', kr: '테이켜r 타임' },
    { speaker: 'B', name: '지오', en: "I'm almost there.", ko: '거의 다 왔어.', kr: '아이몰모우스 데어r' },
  ];
  const mkCard = (id, sentence) => ({ id, sentence, ko: '뜻', pron: '발음',
    explanation: { situation: '새벽 공항', miniDialogue: MD, key: `${sentence} = 뜻` } });
  const group = () => buildDialogueGroups([mkCard('c1', "I'm on my way."), mkCard('c2', "I'm almost there.")])[0];
  const ctx = (over = {}) => ({
    lang: 'en', selCardId: 'c1', expr: "I'm on my way", cueIndex: 0,
    utterOf: () => [], drillProgOf: () => '', miniScoresOf: () => [],
    onSelect: vi.fn(), onCardRec: vi.fn(), onMiniRec: vi.fn(),
    selectedSlot: [document.createElement('div')], phone: false, ...over,
  });

  it('줄 4개 · 카드 줄에만 번호 · 선택 줄은 열려 있고 원 버튼이 없다', () => {
    const { el } = dialogueStageEl(group(), ctx());
    const rows = [...el.querySelectorAll('.vs-ln')];
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.querySelector('.vs-ln-num').textContent)).toEqual(['', '1', '', '2']);
    expect(rows[1].classList.contains('sel')).toBe(true);
    expect(rows[1].querySelectorAll('.vs-cir')).toHaveLength(0);
    expect(rows[0].querySelectorAll('.vs-cir')).toHaveLength(2);
  });

  it('세 줄 텍스트 — 영문 · [발음] · 뜻', () => {
    const { el } = dialogueStageEl(group(), ctx());
    const row = el.querySelectorAll('.vs-ln')[0];
    expect(row.querySelector('.vs-ln-en').textContent).toBe('We landed early.');
    expect(row.querySelector('.vs-ln-kr').textContent).toBe('[위 랜디더r리]');
    expect(row.querySelector('.vs-ln-ko').textContent).toBe('일찍 내렸어.');
  });

  it('선택 줄에만 핵심 표현 밑줄이 붙는다', () => {
    const { el } = dialogueStageEl(group(), ctx());
    const rows = [...el.querySelectorAll('.vs-ln')];
    expect(rows[1].querySelector('.vs-ln-en b').textContent).toBe("I'm on my way");
    expect(rows[3].querySelector('.vs-ln-en b')).toBeNull();
  });

  it('선택 줄 안에 selectedSlot 이 들어간다', () => {
    const slot = document.createElement('div');
    slot.className = 'probe';
    const { el, selectedRow } = dialogueStageEl(group(), ctx({ selectedSlot: [slot] }));
    expect(selectedRow.querySelector('.probe')).toBe(slot);
    expect(el.querySelectorAll('.probe')).toHaveLength(1);
  });

  it('접힌 카드 줄: 말한 이력이 있으면 배지가 체크, 흔적 원 8개 + +N, 뜻 끝에 응용 진행', () => {
    const utter = Array.from({ length: 11 }, (_, i) => 80 + i);
    const { el } = dialogueStageEl(group(), ctx({
      utterOf: (id) => (id === 'c2' ? utter : []), drillProgOf: (id) => (id === 'c2' ? '응용 2/6' : ''),
    }));
    const row = el.querySelectorAll('.vs-ln')[3];
    expect(row.querySelector('.vs-ln-num svg')).not.toBeNull();
    expect(row.querySelectorAll('.vs-ln-trace .v-dot')).toHaveLength(8);
    expect(row.querySelector('.vs-ln-trace .more').textContent).toBe('+3');
    expect(row.querySelector('.vs-ln-ko').textContent).toBe('거의 다 왔어. · 응용 2/6');
  });

  it('선택 줄에는 흔적 줄을 그리지 않는다 (본 점수 열이 대신한다)', () => {
    const { el } = dialogueStageEl(group(), ctx({ utterOf: () => [88, 92] }));
    expect(el.querySelectorAll('.vs-ln')[1].querySelector('.vs-ln-trace')).toBeNull();
  });

  it('상대 줄 흔적은 미니 점수다', () => {
    const { el } = dialogueStageEl(group(), ctx({ miniScoresOf: (i) => (i === 2 ? [77] : []) }));
    const dots = el.querySelectorAll('.vs-ln')[2].querySelectorAll('.vs-ln-trace .v-dot');
    expect(dots).toHaveLength(1);
    expect(dots[0].textContent).toBe('77');
  });

  it('카드 줄 클릭 → onSelect, 상대 줄 클릭 → 아무 일 없음', () => {
    const c = ctx();
    const { el } = dialogueStageEl(group(), c);
    el.querySelectorAll('.vs-ln')[3].click();
    expect(c.onSelect).toHaveBeenCalledWith('c2');
    el.querySelectorAll('.vs-ln')[0].click();
    expect(c.onSelect).toHaveBeenCalledTimes(1);
  });

  it('선택 줄 안의 클릭은 onSelect 로 새지 않는다 (필·버튼이 재렌더를 부르면 녹음이 끊긴다)', () => {
    const c = ctx();
    const slot = h('button', { class: 'vs-pill probe', type: 'button' }, '따라 말하기');
    const { el } = dialogueStageEl(group(), ctx({ ...c, selectedSlot: [slot] }));
    el.querySelector('.probe').click();
    expect(c.onSelect).not.toHaveBeenCalled();
    el.querySelector('.vs-ln.sel').click();
    expect(c.onSelect).not.toHaveBeenCalled();
  });

  it('접힌 카드 줄 녹음 원 → onCardRec, 상대 줄 녹음 원 → onMiniRec (클릭이 줄 선택으로 새지 않는다)', () => {
    const c = ctx();
    const { el } = dialogueStageEl(group(), c);
    el.querySelectorAll('.vs-ln')[3].querySelector('button[aria-label="녹음"]').click();
    expect(c.onCardRec).toHaveBeenCalledWith('c2');
    expect(c.onSelect).not.toHaveBeenCalled();
    el.querySelectorAll('.vs-ln')[0].querySelector('button[aria-label="녹음"]').click();
    expect(c.onMiniRec).toHaveBeenCalled();
    expect(c.onMiniRec.mock.calls[0][0]).toBe(0);
  });

  it('헤어라인 — 첫 줄 위 · 선택 줄 위아래에는 없다', () => {
    const { el } = dialogueStageEl(group(), ctx());
    const seps = [...el.querySelectorAll('.vs-ln-sep')].map((s) => s.classList.contains('on'));
    expect(seps).toEqual([false, false, false, true]);
  });

  it('대화 없는 묶음 — 라벨 · 장면 · 전체 듣기가 없고 줄 하나가 열려 있다', () => {
    const solo = { id: 's1', sentence: 'from scratch', ko: '처음부터', pron: '프럼 스크래치', explanation: {} };
    const g = buildDialogueGroups([solo])[0];
    const { el } = dialogueStageEl(g, ctx({ selCardId: 's1', expr: 'from scratch', cueIndex: -1 }));
    expect(el.querySelector('.vs-stage-hd')).toBeNull();
    expect(el.querySelector('[data-role="stage-all"]')).toBeNull();
    const rows = [...el.querySelectorAll('.vs-ln')];
    expect(rows).toHaveLength(1);
    expect(rows[0].classList.contains('sel')).toBe(true);
    expect(rows[0].querySelector('.vs-ln-name').textContent).toBe('');
  });

  it('화자 칸은 name 이 없으면 speaker 글자로 떨어진다 (miniDialogueEl 과 같은 계약)', () => {
    const md = [
      { speaker: 'A', en: 'We landed early.', ko: '일찍 내렸어.' },
      { speaker: 'B', en: "I'm on my way.", ko: '가는 중이야.' },
    ];
    const g = buildDialogueGroups([{ id: 'c1', sentence: "I'm on my way.", ko: '가는 중이야.', pron: '발음',
      explanation: { miniDialogue: md } }])[0];
    const { el } = dialogueStageEl(g, ctx({ selCardId: 'c1' }));
    expect([...el.querySelectorAll('.vs-ln-name')].map((n) => n.textContent)).toEqual(['A', 'B']);
  });

  it('지오(B)는 틸, 상대(A)는 무채색 — 코랄은 녹음 색이라 화자에 쓰지 않는다', () => {
    const { el } = dialogueStageEl(group(), ctx());
    const names = [...el.querySelectorAll('.vs-ln-name')];
    expect(names.map((n) => n.classList.contains('me'))).toEqual([false, true, false, true]);
  });

  it('전체 듣기 — 줄 순서대로, 화자 성별 목소리 · rate 1.0, 선택 줄은 듣기 필이 재생 표시를 받는다', () => {
    const speak = vi.fn((_t, o) => o?.onEnd?.());
    window.studySpeech = { speak, cancel: vi.fn() };
    const pill = h('button', { class: 'vs-pill', type: 'button' }, vIcon(VI.PLAY, { size: 12, fill: true }), '듣기');
    const { el } = dialogueStageEl(group(), ctx({ selectedPlayBtn: pill }));
    el.querySelector('[data-role="stage-all"]').click();
    expect(speak).toHaveBeenCalledTimes(4);
    expect(speak.mock.calls.map((c) => c[0])).toEqual(
      ['We landed early.', "I'm on my way.", 'Take your time.', "I'm almost there."]);
    expect(speak.mock.calls.map((c) => c[1].voice)).toEqual(
      [MINI_VOICES.A, MINI_VOICES.B, MINI_VOICES.A, MINI_VOICES.B]);
    expect(speak.mock.calls.every((c) => c[1].rate === 1.0)).toBe(true);
    expect(pill.classList.contains('playing')).toBe(false); // 재생이 끝나면 원상 복구
  });

  it('전체 듣기 중 다시 누르면 중단한다', () => {
    const cancel = vi.fn();
    window.studySpeech = { speak: vi.fn(), cancel }; // onEnd 를 안 부르므로 재생 중에 머문다
    const { el } = dialogueStageEl(group(), ctx());
    const btn = el.querySelector('[data-role="stage-all"]');
    btn.click();
    expect(btn.classList.contains('playing')).toBe(true);
    expect(btn.textContent).toBe('재생 중');
    btn.click();
    expect(cancel).toHaveBeenCalled();
    expect(btn.classList.contains('playing')).toBe(false);
    expect(btn.textContent).toBe('전체 듣기');
  });

  it('재생 중인 줄에 블루 배경이 붙고 다음 줄로 넘어가면 빠진다', () => {
    let chain = null;
    window.studySpeech = { speak: vi.fn((_t, o) => { chain = o?.onEnd; }), cancel: vi.fn() };
    const { el } = dialogueStageEl(group(), ctx());
    el.querySelector('[data-role="stage-all"]').click();
    const rows = [...el.querySelectorAll('.vs-ln')];
    expect(rows[0].classList.contains('playing')).toBe(true);
    chain();
    expect(rows[0].classList.contains('playing')).toBe(false);
    expect(rows[1].classList.contains('playing')).toBe(true);
  });

  it('대화 있는 묶음은 라벨 · 장면 · 전체 듣기를 갖는다', () => {
    const { el } = dialogueStageEl(group(), ctx());
    expect(el.querySelector('.vs-stage-hd .vs-lab').textContent).toBe('오늘의 대화');
    expect(el.querySelector('.vs-stage-scene').textContent).toBe('새벽 공항');
    expect(el.querySelector('[data-role="stage-all"]')).not.toBeNull();
  });
});

describe('sessionExprV2 — 좌측 문장 목록 · 클릭 세그먼트 (2026-09-14 시안 12a)', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('세그먼트바 — 칸 수는 카드 수, 현재까지 채움, 클릭하면 그 번호로 이동', () => {
    const onJump = vi.fn();
    const el = progressSegEl(4, 2, onJump);
    const bars = [...el.children];
    expect(bars).toHaveLength(4);
    expect(bars.map((b) => b.querySelector('i').classList.contains('f'))).toEqual([true, true, false, false]);
    expect(bars[3].getAttribute('title')).toBe('4번 표현으로 이동');
    bars[3].click();
    expect(onJump).toHaveBeenCalledWith(4);
  });

  it('문장 목록 — 현재 항목은 번호 채움, 말한 항목은 체크 + 진행 + 마지막 점수 원', () => {
    const cards = [
      { id: 'c1', sentence: "I'm on my way.", ko: '가는 중이야.' },
      { id: 'c2', sentence: "I'm almost there.", ko: '거의 다 왔어.' },
    ];
    const onSelect = vi.fn();
    const el = sentenceNavEl(cards, {
      selCardId: 'c2',
      utterOf: (id) => (id === 'c1' ? [88, 92] : []),
      drillProgOf: (id) => (id === 'c1' ? '응용 2/6' : ''),
      onSelect,
    });
    const items = [...el.querySelectorAll('.vs-nav-it')];
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('.vs-nav-num svg')).not.toBeNull();
    expect(items[0].querySelector('.vs-nav-prog').textContent).toBe('말하기 2회 · 응용 2/6');
    expect(items[0].querySelector('.v-dot').textContent).toBe('92');
    expect(items[1].classList.contains('on')).toBe(true);
    expect(items[1].querySelector('.vs-nav-num').textContent).toBe('2');
    items[0].click();
    expect(onSelect).toHaveBeenCalledWith('c1');
  });

  it('현재 선택된 카드도 진행을 보여준다 (시안 12a 실측: sel 항목에 "말하기 2회")', () => {
    const el = sentenceNavEl([{ id: 'c1', sentence: "I'm on my way.", ko: '가는 중이야.' }], {
      selCardId: 'c1', utterOf: () => [88, 92], drillProgOf: () => '응용 2/6', onSelect: () => {},
    });
    expect(el.querySelector('.vs-nav-prog').textContent).toBe('말하기 2회 · 응용 2/6');
  });

  it('응용만 녹음해도 목록에 응용 진행이 뜬다', () => {
    const el = sentenceNavEl([{ id: 'c1', sentence: 'x', ko: '뜻' }], {
      selCardId: 'c1', utterOf: () => [], drillProgOf: () => '응용 1/6', onSelect: () => {},
    });
    expect(el.querySelector('.vs-nav-prog').textContent).toBe('응용 1/6');
  });

  it('목록 배지에는 헤일로 애니를 붙이지 않는다 (움직이는 표식은 대화 줄 배지 하나)', () => {
    const el = sentenceNavEl([{ id: 'c1', sentence: 'x', ko: '뜻' }],
      { selCardId: 'c1', utterOf: () => [], drillProgOf: () => '', onSelect: () => {} });
    expect(el.querySelector('.vs-nav-num').className).not.toContain('halo');
  });
});

describe('sessionExprV2 — 데스크톱 3칼럼 조립 (2026-09-14 시안 12a)', () => {
  // 체이닝·생산은 기본값(숨김)으로 둔다 — 파일 위 beforeEach 가 켜 두므로 여기서 되돌린다.
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); SESSION_BLOCKS.chainProd = false; });
  const MD = [
    { speaker: 'A', name: '소연', en: 'We landed early.', ko: '일찍 내렸어.', kr: '위 랜디더r리' },
    { speaker: 'B', name: '지오', en: "I'm on my way.", ko: '가는 중이야.', kr: '아이몬 마이 웨이' },
  ];
  const MD2 = [{ speaker: 'B', name: '지오', en: "I'm almost there.", ko: '거의 다 왔어.', kr: '아이몰모우스 데어r' }];
  function st() {
    const s = makeState();
    s.cards = [
      { id: 'c1', lang: 'en', sentence: "I'm on my way.", ko: '가는 중이야.', pron: '아이몬 마이 웨이',
        explanation: { key: "I'm on my way = 가는 중이야.", situation: '새벽 공항', miniDialogue: MD, drills: [] } },
    ];
    s.sentence = s.cards[0];
    s.step = 1;
    return s;
  }
  const mount = (state, handlers = {}) => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, state, handlers); return host;
  };

  it('문장 카드와 좌측 레일이 사라지고 3칼럼이 된다', () => {
    const host = mount(st());
    expect(host.querySelector('.vs-card')).toBeNull();
    expect(host.querySelector('.vs-rail')).toBeNull();
    expect(host.querySelector('.vs-lside')).not.toBeNull();
    expect(host.querySelector('.vs-stage')).not.toBeNull();
    expect(host.querySelector('.vs-side')).not.toBeNull();
  });

  it('듣기 · 따라 말하기 필과 본 점수 열이 선택 줄 안에 있다', () => {
    const host = mount(st());
    const sel = host.querySelector('.vs-ln.sel');
    expect(sel.querySelectorAll('.vs-pill')).toHaveLength(2);
    expect(sel.querySelector('.vs-meta')).not.toBeNull();
    expect(host.querySelectorAll('.vs-pill')).toHaveLength(2);
  });

  it('좌측에 진행 N/총 · 세그먼트 · 문장 목록 · 오늘 발화(96) · 공부 이력 · 세션 종료가 있다', () => {
    const onEnd = vi.fn();
    const host = mount(st(), { onEnd });
    const side = host.querySelector('.vs-lside');
    expect(side.querySelector('.cnt').textContent).toBe('1/1');
    expect(side.querySelector('.vs-seg')).not.toBeNull();
    expect(side.querySelector('.vs-nav')).not.toBeNull();
    expect(side.querySelector('.vs-uring').style.width).toBe('96px');
    expect(side.querySelector('.vs-hist')).not.toBeNull();
    side.querySelector('.endbtn').click();
    expect(onEnd).toHaveBeenCalled();
  });

  it('우측 패널은 응용 · 해설 · 다음 표현 순서이고 응용 라벨 아래 표현이 온다', () => {
    const s = st();
    // 꼬리확장(tail)은 personal 카드가 아니면 filterNearDupDrills 가 걸러낸다 — 주어 변주로 둔다.
    s.cards[0].explanation.drills = [{ en: 'Are you on your way?', ko: '오는 중이야?', kr: '아r 여 온 여r 웨이' }];
    s.sentence = s.cards[0];
    const host = mount(s);
    const right = host.querySelector('.vs-side');
    expect([...right.children].map((n) => n.className.split(' ')[0]))
      .toEqual(['vs-drills', 'vs-panel', 'vs-next']);
    expect(right.querySelector('.vs-drills-expr').textContent).toBe("I'm on my way");
  });

  it('본 점수 열은 최근 10개까지 (흔적 줄 8개와 다르다)', () => {
    const s = st();
    s.exLog = { c1: { utter: Array.from({ length: 12 }, (_, i) => 80 + i) } };
    const host = mount(s);
    expect(host.querySelectorAll('.vs-meta .v-dot')).toHaveLength(10);
  });

  it('선택 줄 듣기 필은 화자 목소리 · rate 1.0 으로 읽는다', () => {
    const speak = vi.fn();
    window.studySpeech = { speak, cancel: vi.fn() };
    const host = mount(st());
    host.querySelector('.vs-ln.sel .vs-pill').click();
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][1].voice).toBe(MINI_VOICES.B);
    expect(speak.mock.calls[0][1].rate).toBe(1.0);
  });

  it('대화 없는 카드는 단독 줄이 열리고 듣기 필이 기존 화자 순환 규칙을 쓴다', () => {
    const speak = vi.fn();
    window.studySpeech = { speak, cancel: vi.fn() };
    const s = st();
    delete s.cards[0].explanation.miniDialogue;
    s.sentence = s.cards[0];
    const host = mount(s);
    expect(host.querySelector('.vs-stage-hd')).toBeNull();
    expect(host.querySelectorAll('.vs-ln')).toHaveLength(1);
    host.querySelector('.vs-ln.sel .vs-pill').click();
    expect(speak.mock.calls[0][1].rate).toBeUndefined();
    expect(speak.mock.calls[0][1].voice).toBe('en-US-AvaMultilingualNeural');
  });

  it('본 점수 열은 이력이 있을 때만 그린다 (WORK-ORDER §2-2)', async () => {
    const host = mount(st());
    expect(host.querySelector('.vs-ln.sel .vs-meta').style.display).toBe('none');
    host.querySelector('.vs-pill.pri').click(); await tick();
    host.querySelector('.vs-pill.recing').click(); await tick(); await tick();
    expect(host.querySelector('.vs-ln.sel .vs-meta').style.display).toBe('');
  });

  it('연속한 단독 묶음은 헤어라인으로 이어 붙는다 (같은 열)', () => {
    const s = st();
    s.cards = [
      { id: 'a1', lang: 'en', sentence: 'fill in', ko: '알려주다', pron: '필 인', explanation: { key: 'fill in = 알려주다' } },
      { id: 'a2', lang: 'en', sentence: 'handle', ko: '처리하다', pron: '핸들', explanation: { key: 'handle = 처리하다' } },
      { id: 'a3', lang: 'en', sentence: 'from scratch', ko: '처음부터', pron: '프럼 스크래치', explanation: { key: 'from scratch = 처음부터' } },
    ];
    s.sentence = s.cards[0];
    const host = mount(s);
    const stages = [...host.querySelectorAll('.vs-stage')];
    expect(stages).toHaveLength(3);
    expect(stages.map((n) => n.classList.contains('solo'))).toEqual([true, true, true]);
    // 첫 묶음 위에는 선이 없고, 뒤이은 단독 묶음 위에는 선이 있다
    expect(stages.map((n) => n.querySelector('.vs-ln-sep').classList.contains('on')))
      .toEqual([false, true, true]);
  });

  it('대화 묶음 다음에 오는 단독 묶음 위에는 선을 긋지 않는다 (묶음 경계)', () => {
    const s = st();
    s.cards.push({ id: 'solo', lang: 'en', sentence: 'from scratch', ko: '처음부터', pron: '프럼 스크래치', explanation: { key: 'from scratch = 처음부터' } });
    const host = mount(s);
    const stages = [...host.querySelectorAll('.vs-stage')];
    expect(stages.map((n) => n.classList.contains('solo'))).toEqual([false, true]);
    expect(stages[1].querySelector('.vs-ln-sep').classList.contains('on')).toBe(false);
  });

  it('접힌 카드 줄 녹음 원 → 그 카드로 이동하고 재렌더 뒤 본 녹음이 자동으로 시작된다', async () => {
    const s = st();
    s.cards.push({ id: 'c2', lang: 'en', sentence: "I'm almost there.", ko: '거의 다 왔어.', pron: '아이몰모우스 데어r',
      explanation: { key: "I'm almost there = 거의 다 왔어.", situation: '진입로', miniDialogue: MD2, drills: [] } });
    const onJump = vi.fn();
    const host = mount(s, { onJump });
    const recBtns = [...host.querySelectorAll('.vs-ln:not(.sel) button[aria-label="녹음"]')];
    recBtns[recBtns.length - 1].click();
    expect(s.autoRec).toBe('c2');
    expect(onJump).toHaveBeenCalledWith(2);

    document.body.innerHTML = '';
    s.step = 2; s.sentence = s.cards[1];
    const host2 = mount(s, { onJump });
    await tick();
    expect(startMicRecording).toHaveBeenCalled();
    expect(s.autoRec).toBeUndefined();
    expect(host2.querySelector('.vs-ln.sel .vs-pill.recing')).not.toBeNull();
  });

  it('상대 줄 녹음 → #mini# 경로로 저장된다', async () => {
    const host = mount(st());
    const rec = host.querySelectorAll('.vs-ln')[0].querySelector('button[aria-label="녹음"]');
    rec.click();
    await tick();
    rec.click();
    await tick(); await tick();
    expect(savePronunciationLog).toHaveBeenCalled();
    expect(savePronunciationLog.mock.calls[0][1].sentenceId).toBe('c1#mini#We landed early.');
  });
});

describe('sessionExprV2 — 폰 단일 칼럼 (2026-09-14 시안 12a 폰 390)', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); SESSION_BLOCKS.chainProd = false; });
  const MD = [
    { speaker: 'A', name: '소연', en: 'We landed early.', ko: '일찍 내렸어.', kr: '위 랜디더r리' },
    { speaker: 'B', name: '지오', en: "I'm on my way.", ko: '가는 중이야.', kr: '아이몬 마이 웨이' },
    { speaker: 'A', name: '소연', en: 'Take your time.', ko: '천천히 와.', kr: '테이켜r 타임' },
    { speaker: 'B', name: '지오', en: "I'm almost there.", ko: '거의 다 왔어.', kr: '아이몰모우스 데어r' },
  ];
  function st(over = {}) {
    const s = makeState();
    s.size = 'phone';
    s.cards = [
      { id: 'c1', lang: 'en', sentence: "I'm on my way.", ko: '가는 중이야.', pron: '아이몬 마이 웨이',
        explanation: { key: "I'm on my way = 가는 중이야.", situation: '새벽 공항', miniDialogue: MD, drills: [] } },
      { id: 'c2', lang: 'en', sentence: "I'm almost there.", ko: '거의 다 왔어.', pron: '아이몰모우스 데어r',
        explanation: { key: "I'm almost there = 거의 다 왔어.", situation: '진입로', miniDialogue: MD, drills: [] } },
    ];
    s.sentence = s.cards[0];
    s.step = 1;
    return Object.assign(s, over);
  }
  const mount = (state, handlers = {}) => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, state, handlers); return host;
  };

  it('상단 바에 진행이 들어가고 스텝 줄과 장면 칩은 없다', () => {
    const host = mount(st());
    expect(host.querySelector('.m-topb-meta').textContent).toBe('신규 학습 · 영어 · 1/2');
    expect(host.querySelector('.m-steps')).toBeNull();
    expect(host.querySelector('.scene-chip')).toBeNull();
    expect(host.querySelector('.m-topb .vs-seg')).not.toBeNull();
  });

  it('본문 순서 — 대화 · 응용 · 해설 · 오늘 발화 · 공부 이력', () => {
    const s = st();
    s.cards[0].explanation.drills = [{ en: 'Are you on your way?', ko: '오는 중이야?', kr: '아r 여 온 여r 웨이' }];
    s.sentence = s.cards[0];
    const host = mount(s);
    expect([...host.querySelector('.m-pad').children].map((n) => n.className.split(' ')[0]))
      .toEqual(['vs-stagewrap', 'vs-drills', 'vs-fold', 'vs-rec', 'vs-hist']);
  });

  it('대화 접기 — 직전 상대 줄과 선택 줄만 남는다', () => {
    const host = mount(st({ dlgCollapsed: true }));
    const rows = [...host.querySelectorAll('.vs-ln')];
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.vs-ln-en').textContent).toBe('We landed early.');
    expect(rows[1].classList.contains('sel')).toBe(true);
    expect(host.querySelector('.vs-stage-fold').textContent).toBe('대화 펼치기 ▾');
  });

  it('접기 토글은 세션 state 에 남아 카드 이동에도 유지된다', () => {
    const s = st();
    const rerender = vi.fn();
    const host = mount(s, { rerender });
    expect(host.querySelector('.vs-stage-fold').textContent).toBe('대화 접기 ▴');
    host.querySelector('.vs-stage-fold').click();
    expect(s.dlgCollapsed).toBe(true);
    expect(rerender).toHaveBeenCalled();
  });

  it('접힌 상태의 상대 줄 녹음도 원래 줄 index 로 기록된다', async () => {
    const s = st({ dlgCollapsed: true });
    const host = mount(s);
    const rec = host.querySelectorAll('.vs-ln')[0].querySelector('button[aria-label="녹음"]');
    rec.click(); await tick();
    rec.click(); await tick(); await tick();
    expect(savePronunciationLog.mock.calls[0][1].sentenceId).toBe('c1#mini#We landed early.');
    expect(Object.keys(s.exLog.c1.mini)).toEqual(['0']);
  });

  it('폰은 화자 이름이 문장 위 라벨이다', () => {
    const host = mount(st());
    const row = host.querySelectorAll('.vs-ln')[0];
    const kids = [...row.querySelector('.vs-ln-body').children].map((n) => n.className);
    expect(kids[0]).toBe('vs-ln-name');
    expect(kids[1]).toBe('vs-ln-en');
  });

  it('하단 CTA 가 화면에 고정된다 (작업지시서 §2-3 "sticky" · 시안 설명 "실제 앱에서 화면에 고정")', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const st = makeState(); st.size = 'phone';
    renderSessionExprV2(host, st, {});
    expect(host.querySelector('.m-cta').className).toContain('m-cta-fixed');
    const css = [...host.querySelectorAll('style')].map((n) => n.textContent).join('');
    expect(css).toContain('.m-cta-fixed{position:sticky;bottom:0;z-index:6}');
    // 복습·수학·요약이 쓰는 기본 .m-cta 는 건드리지 않는다
    expect(css).toMatch(/\.m-cta\{flex:0 0 auto;background:/);
    expect(css).not.toMatch(/\.m-cta\{[^}]*position:sticky/);
  });

  it('하단 CTA 는 마지막 카드에서 학습 완료가 된다', () => {
    const s = st();
    s.step = 2; s.sentence = s.cards[1];
    const host = mount(s);
    expect(host.querySelector('.m-cta .vs-next').textContent).toBe('학습 완료 →');
  });
});

describe('scrollSelectedIntoView — 열린 줄을 화면 안으로 (2026-09-14)', () => {
  it('sticky 상단 바 높이만큼 띄워 올린다', () => {
    const calls = [];
    const row = { getBoundingClientRect: () => ({ top: 900, bottom: 1100 }) };
    scrollSelectedIntoView(row, { innerHeight: 800, scrollY: 0, scrollTo: (o) => calls.push(o) }, 64);
    expect(calls).toHaveLength(1);
    expect(calls[0].top).toBe(900 - 64 - 24);
  });

  it('이미 보이면 스크롤하지 않는다', () => {
    const calls = [];
    const row = { getBoundingClientRect: () => ({ top: 200, bottom: 400 }) };
    scrollSelectedIntoView(row, { innerHeight: 800, scrollY: 0, scrollTo: (o) => calls.push(o) }, 64);
    expect(calls).toHaveLength(0);
  });

  it('위로 잘린 줄도 올린다 (음수 top)', () => {
    const calls = [];
    const row = { getBoundingClientRect: () => ({ top: -50, bottom: 150 }) };
    scrollSelectedIntoView(row, { innerHeight: 800, scrollY: 400, scrollTo: (o) => calls.push(o) }, 64);
    expect(calls[0].top).toBe(400 - 50 - 64 - 24);
  });

  it('스크롤할 수 없는 환경에서는 조용히 넘어간다', () => {
    expect(() => scrollSelectedIntoView(null, {}, 0)).not.toThrow();
    expect(() => scrollSelectedIntoView({ getBoundingClientRect: () => ({ top: 0, bottom: 0 }) }, {}, 0)).not.toThrow();
  });
});

/* 응용 행 세 줄 (2026-09-14 시안 12a §2-2 우측 패널) — 영문 / [발음] / 뜻 + 문장 아래 흔적 줄.
 * 점수 원을 버튼 옆 가로에 두지 않는다(원 6개면 400px 패널·폰에서 문장이 세로로 눌린다).
 * 복습(sessionReviewV2)이 같은 함수를 쓰므로 옵션 기본값은 기존 한 줄 부제 그대로다. */
describe('drillRows — 세 줄 옵션', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  const D = [{ en: 'Are you on your way?', ko: '오는 중이야?', kr: '아r 여 온 여r 웨이' }];

  it('옵션이 없으면 종전대로 한 줄 부제 · 점수는 버튼 옆 (복습 회귀 방지)', () => {
    const [row] = drillRows(D, "I'm on my way", 'en', () => {}, true, { saved: { 0: [88] } });
    expect(row.querySelector('.sub').textContent).toBe('아r 여 온 여r 웨이 · 오는 중이야?');
    expect(row.querySelector('.vs-ln-kr')).toBeNull();
    const kids = [...row.children].map((n) => n.className.split(' ')[0]);
    expect(kids).toEqual(['ix', '', 'grow', 'vs-gscore', 'vs-cir', 'vs-cir']);
  });

  it('threeLine 이면 영문 / [발음] / 뜻 세 줄이고 점수는 문장 아래 흔적 줄로 간다', () => {
    const [row] = drillRows(D, "I'm on my way", 'en', () => {}, true, { saved: { 0: [88, 92] }, threeLine: true });
    expect(row.querySelector('.en').textContent).toBe('Are you on your way?');
    expect(row.querySelector('.vs-ln-kr').textContent).toBe('[아r 여 온 여r 웨이]');
    expect(row.querySelector('.vs-ln-ko').textContent).toBe('오는 중이야?');
    expect(row.querySelector('.sub')).toBeNull();
    const kids = [...row.children].map((n) => n.className.split(' ')[0]);
    expect(kids).toEqual(['ix', '', 'vs-cir', 'vs-cir']); // 버튼 열에 점수 없음
    expect(row.querySelectorAll('.vs-ln-trace .v-dot')).toHaveLength(2);
  });

  it('흔적 줄도 최근 8개 + +N (대화 줄과 같은 규칙)', () => {
    const saved = { 0: Array.from({ length: 11 }, (_, i) => 80 + i) };
    const [row] = drillRows(D, '', 'en', () => {}, true, { saved, threeLine: true });
    expect(row.querySelectorAll('.vs-ln-trace .v-dot')).toHaveLength(8);
    expect(row.querySelector('.vs-ln-trace .more').textContent).toBe('+3');
  });

  it('녹음하면 흔적 줄에 원이 하나 늘고 +N 이 갱신된다', async () => {
    const saved = { 0: Array.from({ length: 8 }, (_, i) => 80 + i) };
    const [row] = drillRows(D, '', 'en', () => {}, true, { saved, threeLine: true });
    document.body.appendChild(row);
    row.querySelector('button[aria-label="녹음"]').click();
    await new Promise((r) => setTimeout(r, 900));
    expect(row.querySelectorAll('.vs-ln-trace .v-dot')).toHaveLength(8);
    expect(row.querySelector('.vs-ln-trace .more').textContent).toBe('+1');
  });

  it('발음이 없으면 발음 줄을 만들지 않는다', () => {
    const [row] = drillRows([{ en: 'x', ko: '뜻' }], '', 'en', () => {}, true, { threeLine: true });
    expect(row.querySelector('.vs-ln-kr')).toBeNull();
    expect(row.querySelector('.vs-ln-ko').textContent).toBe('뜻');
  });

  it('신규 세션 우측 패널은 세 줄로 그린다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const st = makeState();
    st.cards = [{ id: 'c1', lang: 'en', sentence: "I'm on my way.", ko: '가는 중이야.', pron: '아이몬 마이 웨이',
      explanation: { key: "I'm on my way = 가는 중이야.", drills: D } }];
    st.sentence = st.cards[0];
    st.step = 1;
    SESSION_BLOCKS.chainProd = false;
    renderSessionExprV2(host, st, {});
    expect(host.querySelector('.vs-drills .vs-drow .vs-ln-kr').textContent).toBe('[아r 여 온 여r 웨이]');
  });
});

/* 시안 12a 실측 대조 (2026-09-14) — 1280 캔버스에서 잰 값.
 * 좌측 250 / 대화 548 / 우측 400, 메인 padding 28 28 32 · gap 24, 응용 행 padding 10 2 · gap 11 · 번호 12px.
 * 넓은 화면에서 대화 폭이 무한정 늘어나면 시안 비율이 깨진다 — 548 을 상한으로 두고 가운데 정렬(기존 .vs-mainwrap 관례). */
describe('sessionExprV2 — 시안 12a 프레임 실측', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); SESSION_BLOCKS.chainProd = false; });

  const cssOf = (size) => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const st = makeState(); st.size = size;
    renderSessionExprV2(host, st, {});
    return [...host.querySelectorAll('style')].map((n) => n.textContent).join('');
  };

  it('데스크톱 3칼럼 — 좌측 250 · 대화 548 상한 · 우측 400, 본문 padding 28 28 32 · gap 24', () => {
    const css = cssOf('desktop');
    expect(css).toContain('.vs-lside{width:250px');
    expect(css).toContain('.vs-side{width:400px');
    expect(css).toContain('.vs-frame{display:flex;flex:1 1 auto;max-width:1278px');
    expect(css).toMatch(/\.vs-mainwrap\{[^}]*padding:28px 28px 32px/);
    expect(css).toMatch(/\.vs-mainwrap\{[^}]*gap:24px/);
    expect(css).toMatch(/\.vs\{[^}]*justify-content:center/); // 넓은 화면에서 프레임째 가운데
  });

  it('데스크톱은 사이드바까지 한 프레임(1278 = 250 + 1028)으로 묶여 가운데 정렬된다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeState(), {});
    const vs = host.querySelector('.vs');
    // 시안 12a 는 1280 컨테이너 하나가 화면이다 — 사이드바만 화면 끝에 남으면 대화와 341px 벌어진다.
    expect([...vs.children].map((n) => n.className || n.tagName))
      .toEqual(['STYLE', 'vs-frame']);
    const frame = vs.querySelector('.vs-frame');
    expect([...frame.children].map((n) => n.className.split(' ')[0]))
      .toEqual(['vs-lside', 'vs-mainwrap']);
    const css = [...host.querySelectorAll('style')].map((n) => n.textContent).join('');
    expect(css).toContain('.vs-frame{display:flex;flex:1 1 auto;max-width:1278px;min-width:0}');
    expect(css).toMatch(/\.vs\{[^}]*justify-content:center/);
  });

  it('대화는 프레임 안에서 남는 폭을 먹는다 (시안 stage flex:1 1 auto)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeState(), {});
    const css = [...host.querySelectorAll('style')].map((n) => n.textContent).join('');
    expect(css).toContain('.vs-stagewrap{flex:1 1 auto;min-width:0}');
    expect(css).not.toMatch(/\.vs-mainwrap\{[^}]*justify-content:center/); // 프레임이 가운데를 맡는다
  });

  it('1100 이하 세로 적층에서는 본문이 남는 폭을 채운다 (사이드바 옆이 비지 않게)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeState(), {});
    const css = [...host.querySelectorAll('style')].map((n) => n.textContent).join('');
    const mq = css.match(/@media \(max-width:1100px\)\{[^@]*?\}\}/)[0];
    expect(mq).toContain('flex-direction:column');
    expect(mq).toContain('.vs-stagewrap{flex:0 1 auto;width:100%;max-width:none}');
    expect(mq).toContain('.vs-side{width:100%;max-width:none}');
    expect(mq).not.toContain('align-items:center'); // 가운데로 모으면 사이드바 옆이 빈다
  });

  it('응용 행(세 줄) — padding 10px 2px · gap 11px · 번호 칸 12px', () => {
    const css = cssOf('desktop');
    expect(css).toMatch(/\.vs-drow3\{[^}]*padding:10px 2px/);
    expect(css).toMatch(/\.vs-drow3\{[^}]*gap:11px/);
    expect(css).toContain('.vs-drow3 .ix{width:12px}');
  });
});

/* 카드 목록은 Dexie 원본 행이다 (state.cards) — 뜻은 ko 가 아니라 meaning, 발음은 phonetic_kr.
 * pickCardFields 는 state.sentence 에만 적용되므로 목록·단독 줄은 직접 폴백해야 한다
 * (2026-09-14 배포 화면에서 좌측 목록의 뜻이 비어 있었다). */
describe('원본 카드 행 폴백 — meaning · phonetic_kr', () => {
  it('sentenceNavEl 은 meaning 을 뜻으로 읽는다', () => {
    const el = sentenceNavEl([{ id: 'c1', sentence: "I'm on my way.", meaning: '가는 중이야.' }],
      { selCardId: 'x', utterOf: () => [], drillProgOf: () => '', onSelect: () => {} });
    expect(el.querySelector('.vs-nav-ko').textContent).toBe('가는 중이야.');
  });

  it('buildDialogueGroups 단독 묶음도 meaning · phonetic_kr 을 읽는다', () => {
    const g = buildDialogueGroups([{ id: 's1', sentence: 'from scratch', meaning: '처음부터', phonetic_kr: '프럼 스크래치', explanation: {} }])[0];
    expect(g.lines[0]).toEqual({ speaker: '', name: '', en: 'from scratch', ko: '처음부터', kr: '프럼 스크래치' });
  });
});

/* 오늘 발화 카드 (WORK-ORDER §2-2 5번) — 윗줄에 라벨 + 직전 기록, 링은 가운데, 안내문은 아래.
 * 기본값(복습이 쓰는 형태)은 직전 기록이 링 안에 있는 종전 구성 그대로다. */
describe('utterRingCard — prevTop 옵션', () => {
  it('prevTop 이면 직전 기록이 카드 윗줄로 올라가고 링 안에는 숫자만 남는다', () => {
    const { el, update } = utterRingCard({ size: 96, prevTop: true });
    update(9, 18);
    expect(el.classList.contains('prevtop')).toBe(true);
    expect(el.querySelector('.hd .pv').textContent).toBe('직전 18회');
    expect(el.querySelector('.vs-uring .pv')).toBeNull();
    expect(el.querySelector('.vs-uring .cn').textContent).toBe('9');
    expect(el.querySelector('.vs-uring .n').style.fontSize).toBe('24px');
  });

  it('기본값은 종전 그대로 — 직전 기록이 링 안, 기록 갱신 칩은 윗줄 (복습 회귀 방지)', () => {
    const { el, update } = utterRingCard({ size: 140 });
    update(20, 18);
    expect(el.classList.contains('prevtop')).toBe(false);
    expect(el.querySelector('.hd .vs-newrec')).not.toBeNull();
    expect(el.querySelector('.vs-uring .pv').textContent).toBe('직전 18 넘김');
    expect(el.querySelector('.vs-uring .n').style.fontSize).toBe('');
  });

  it('신규 세션 좌측 사이드바는 prevTop 카드를 쓴다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const st = makeState(); st.prevDayUtter = 18; st.todayUtterBase = 9;
    renderSessionExprV2(host, st, {});
    expect(host.querySelector('.vs-lside .vs-rec.prevtop .hd .pv').textContent).toBe('직전 18회');
  });
});

/* 상대 줄 점수는 카드가 아니라 '대화'에 속한다 (2026-09-14 사용자 보고).
 * 종전엔 onMiniScore 가 state.exLog[현재 카드].mini[줄] 에 써서, 같은 줄인데 1번 카드에서 녹음하면
 * 70, 2번 카드에서 녹음하면 73·75 로 갈려 보였다. 대화는 세션에 하나뿐이므로 묶음 대표 카드 하나로 모은다. */
describe('sessionExprV2 — 상대 줄 점수는 선택 카드를 따라가지 않는다', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); SESSION_BLOCKS.chainProd = false; });
  const MD = [
    { speaker: 'A', name: '소연', en: 'We landed early.', ko: '일찍 내렸어.', kr: '위 랜디더r리' },
    { speaker: 'B', name: '지오', en: "I'm on my way.", ko: '가는 중이야.', kr: '아이몬 마이 웨이' },
    { speaker: 'A', name: '소연', en: 'Take your time.', ko: '천천히 와.', kr: '테이켜r 타임' },
    { speaker: 'B', name: '지오', en: "I'm almost there.", ko: '거의 다 왔어.', kr: '아이몰모우스 데어r' },
  ];
  const card = (id, sentence, ko) => ({ id, lang: 'en', sentence, ko, pron: '발음',
    explanation: { key: `${sentence} = ${ko}`, situation: '공항', miniDialogue: MD, drills: [] } });
  function st(step = 1) {
    const s = makeState();
    s.cards = [card('c1', "I'm on my way.", '가는 중이야.'), card('c2', "I'm almost there.", '거의 다 왔어.')];
    s.step = step; s.sentence = s.cards[step - 1];
    return s;
  }
  // 실제 앱과 같은 계약 — 상대 줄 녹음이 끝나면 session-new 가 handlers.rerender 로 다시 그린다.
  const mount = (state) => {
    document.body.innerHTML = '';
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, state, { rerender: () => mount(state) });
    return host;
  };
  const miniRec = async (rowIdx) => {
    const btn = [...document.querySelectorAll('.vs-ln')][rowIdx].querySelector('button[aria-label="녹음"]');
    btn.click(); await tick();
    btn.click(); await tick(); await tick();
  };
  const traceAt = (rowIdx) => [...[...document.querySelectorAll('.vs-ln')][rowIdx].querySelectorAll('.vs-ln-trace .v-dot')].map((n) => n.textContent);

  it('1번 카드에서 녹음한 상대 줄 점수가 2번 카드로 옮겨도 그대로 보인다', async () => {
    const state = st(1);
    mount(state);
    await miniRec(0);
    expect(traceAt(0)).toEqual(['100']);

    state.step = 2; state.sentence = state.cards[1];
    mount(state);
    expect(traceAt(0)).toEqual(['100']);
  });

  it('서로 다른 카드에서 녹음해도 같은 줄이면 한 줄에 쌓인다', async () => {
    const state = st(1);
    mount(state);
    await miniRec(0);
    state.step = 2; state.sentence = state.cards[1];
    mount(state);
    await miniRec(0);
    expect(traceAt(0)).toHaveLength(2);
    state.step = 1; state.sentence = state.cards[0];
    mount(state);
    expect(traceAt(0)).toHaveLength(2);
  });

  it('저장은 묶음 대표 카드 하나로 모인다 — exLog 와 #mini# 로그 모두', async () => {
    const state = st(2); // 2번 카드를 선택한 채 녹음해도 대표(c1) 아래에 쌓인다
    mount(state);
    await miniRec(0);
    expect(state.exLog.c1?.mini).toEqual({ 0: [100] });
    expect(state.exLog.c2?.mini).toBeUndefined();
    expect(savePronunciationLog.mock.calls[0][1].sentenceId).toBe('c1#mini#We landed early.');
  });

  it('카드별로 흩어져 저장된 옛 기록도 한 줄에 합쳐 읽는다 (2026-09-14 이전 데이터)', () => {
    const state = st(1);
    state.exLog = { c1: { mini: { 0: [70] } }, c2: { mini: { 0: [73, 75] } } };
    mount(state);
    expect(traceAt(0)).toEqual(['70', '73', '75']);
  });

  it('본 점수·응용 점수는 종전대로 카드별이다 (회귀 방지)', async () => {
    const state = st(1);
    const host = mount(state);
    host.querySelector('.vs-pill.pri').click(); await tick();
    host.querySelector('.vs-pill.recing').click(); await tick(); await tick();
    expect(state.exLog.c1.utter).toEqual([100]);
    expect(state.exLog.c2?.utter).toBeUndefined();
  });
});

/* 따라 말하기 필의 3상태는 '이 문장을 말한 이력'을 따라야 한다 (2026-09-14).
 * recLog 는 본 녹음·응용·상대 줄·체이닝이 섞인 세션 집계라, 상대 줄만 녹음해도 라벨이 '다시 말하기' 로
 * 바뀌어 링·점수 열(둘 다 cardEx.utter 출처)과 어긋났다. 대화 화면은 상대 줄이 늘 보여 더 자주 드러난다. */
describe('sessionExprV2 — 따라 말하기 라벨은 본 녹음 이력만 본다', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); SESSION_BLOCKS.chainProd = false; });
  const MD = [
    { speaker: 'A', name: '소연', en: 'We landed early.', ko: '일찍 내렸어.', kr: '위 랜디더r리' },
    { speaker: 'B', name: '지오', en: "I'm on my way.", ko: '가는 중이야.', kr: '아이몬 마이 웨이' },
  ];
  function st() {
    const s = makeState();
    s.cards = [{ id: 'c1', lang: 'en', sentence: "I'm on my way.", ko: '가는 중이야.', pron: '아이몬 마이 웨이',
      explanation: { key: "I'm on my way = 가는 중이야.", miniDialogue: MD,
        drills: [{ en: 'Are you on your way?', ko: '오는 중이야?', kr: '아r 여 온 여r 웨이' }] } }];
    s.step = 1; s.sentence = s.cards[0];
    return s;
  }
  const mount = (state) => {
    document.body.innerHTML = '';
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, state, { rerender: () => mount(state) });
    return host;
  };

  it('상대 줄만 녹음하면 라벨이 "따라 말하기" 그대로다 (링·점수 열과 같은 출처)', async () => {
    const state = st();
    const host = mount(state);
    expect(host.querySelector('.vs-pill.pri').textContent).toBe('따라 말하기');
    const btn = [...document.querySelectorAll('.vs-ln')][0].querySelector('button[aria-label="녹음"]');
    btn.click(); await tick();
    btn.click(); await tick(); await tick();
    expect(document.querySelector('.vs-pill.pri').textContent).toBe('따라 말하기');
    expect(document.querySelector('.vs-meta').style.display).toBe('none');
    expect(document.querySelector('.vs-ring')).toBeNull();
    expect(state.recLog.c1.count).toBe(1); // 세션 집계는 종전대로 오른다
  });

  it('상대 줄·응용을 녹음하면 링 캡션이 "지난 점수" 로 내려간다 (방금 한 건 그 줄이다)', async () => {
    const state = st();
    const host = mount(state);
    host.querySelector('.vs-pill.pri').click(); await tick();
    host.querySelector('.vs-pill.recing').click(); await tick(); await tick();
    expect(document.querySelector('.vs-cap').textContent).toBe('방금 점수');
    const btn = [...document.querySelectorAll('.vs-ln')][0].querySelector('button[aria-label="녹음"]');
    btn.click(); await tick();
    btn.click(); await tick(); await tick();
    expect(document.querySelector('.vs-cap').textContent).toBe('지난 점수');
  });

  it('응용을 녹음하면 링 캡션도 화면에서 바로 "지난 점수" 가 된다', async () => {
    const state = st();
    const host = mount(state);
    host.querySelector('.vs-pill.pri').click(); await tick();
    host.querySelector('.vs-pill.recing').click(); await tick(); await tick();
    expect(host.querySelector('.vs-cap').textContent).toBe('방금 점수');
    const d = host.querySelector('.vs-drills-list button[aria-label="녹음"]');
    d.click(); await tick();
    d.click(); await tick(); await tick();
    expect(host.querySelector('.vs-cap').textContent).toBe('지난 점수');
  });

  it('응용만 녹음해도 라벨은 그대로다', async () => {
    const state = st();
    const host = mount(state);
    host.querySelector('.vs-drills-list button[aria-label="녹음"]').click();
    await tick(); await tick(); await tick();
    expect(host.querySelector('.vs-pill.pri').textContent).toBe('따라 말하기');
  });

  it('본 녹음을 하면 "다시 말하기" 가 되고, 재렌더·복원에도 유지된다', async () => {
    const state = st();
    const host = mount(state);
    host.querySelector('.vs-pill.pri').click(); await tick();
    host.querySelector('.vs-pill.recing').click(); await tick(); await tick();
    expect(host.querySelector('.vs-pill.pri').textContent).toBe('다시 말하기');
    const host2 = mount(state); // 재렌더 — exLog.utter 로 복원
    expect(host2.querySelector('.vs-pill.pri').textContent).toBe('다시 말하기');
  });
});

/* 좌측 문장 목록은 녹음 즉시 갱신돼야 한다 (2026-09-14) — 종전엔 카드를 옮겨야 반영됐다.
 * 본 녹음·응용·상대 줄 모두 refreshDots 를 거치므로 거기서 목록을 다시 그린다. */
describe('sessionExprV2 — 좌측 목록 즉시 갱신', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); SESSION_BLOCKS.chainProd = false; });
  function st() {
    const s = makeState();
    s.cards = [{ id: 'c1', lang: 'en', sentence: "I'm on my way.", ko: '가는 중이야.', pron: '아이몬 마이 웨이',
      explanation: { key: "I'm on my way = 가는 중이야.",
        drills: [{ en: 'Are you on your way?', ko: '오는 중이야?', kr: '아r 여 온 여r 웨이' }] } }];
    s.step = 1; s.sentence = s.cards[0];
    return s;
  }
  const mount = (state) => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, state, {});
    return host;
  };

  it('본 녹음 직후 목록에 "말하기 1회" 가 뜬다', async () => {
    const host = mount(st());
    expect(host.querySelector('.vs-nav-prog')).toBeNull();
    host.querySelector('.vs-pill.pri').click(); await tick();
    host.querySelector('.vs-pill.recing').click(); await tick(); await tick();
    expect(host.querySelector('.vs-nav-prog').textContent).toBe('말하기 1회');
  });

  it('응용 녹음 직후 목록에 "응용 1/1" 이 뜬다', async () => {
    const host = mount(st());
    const btn = host.querySelector('.vs-drills-list button[aria-label="녹음"]');
    btn.click(); await tick();          // 시작
    btn.click(); await tick(); await tick(); // 멈춤 + 채점
    expect(host.querySelector('.vs-nav-prog').textContent).toBe('응용 1/1');
  });

  it('목록을 다시 그려도 클릭이 살아 있다', async () => {
    const state = st();
    state.cards.push({ id: 'c2', lang: 'en', sentence: "I'm almost there.", ko: '거의 다 왔어.', pron: '발음',
      explanation: { key: "I'm almost there = 거의 다 왔어.", drills: [] } });
    const onJump = vi.fn();
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, state, { onJump });
    host.querySelector('.vs-pill.pri').click(); await tick();
    host.querySelector('.vs-pill.recing').click(); await tick(); await tick();
    [...host.querySelectorAll('.vs-nav-it')][1].click();
    expect(onJump).toHaveBeenCalledWith(2);
  });
});
