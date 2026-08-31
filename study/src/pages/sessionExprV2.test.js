// @vitest-environment jsdom
// 녹음 성공 경로 통합 검증 — 마이크 없이 services 를 mock 해 record→채점→savePronunciationLog→state 를 결정적으로 확인.
// (라이브 브라우저는 마이크 장치 부재로 성공 경로 미실행 — 이 테스트가 그 갭을 메움.)
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import { renderSessionExprV2, hlNode, drillRows, recordGateMessage } from './sessionExprV2.js';
import { savePronunciationLog } from '../services/pronunciationLog.js';
import { stopAndAnalyze } from '../services/sessionAnalyze.js';
import { showRecordToast } from '../components/session/recordToast.js';

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
    expect(params.result).toMatchObject({ score: 100, accuracyScore: 92, scoreModel: 'ded1', weakPhonemes: ['ð'] });
    expect(typeof params.date).toBe('string');

    // 리빌 DOM — 점수 링 92 · 발화 점수 원 1개 · 총 1회 (점·콤보·PASS 칩은 폐기 §6.1)
    expect(host.querySelector('.vs-ring .cn').textContent).toBe('100');
    expect(host.querySelector('.vs-ring').classList.contains('score-pop')).toBe(true); // 점수 등장 애니
    const dots = host.querySelectorAll('.vs-meta .v-dot');
    expect(dots).toHaveLength(1);
    expect(dots[0].textContent).toBe('100');
    expect(dots[0].classList.contains('fresh')).toBe(true);   // 최신 시도 강조
    expect(host.querySelector('.vs-meta .tot').textContent).toBe('총 1회');
    expect(host.querySelector('.vs-pass')).toBeNull();
    expect(host.querySelector('.vs-combo')).toBeNull();
  });

  it('녹음 3회 → 게이트 해제(다음 표현 unlock) · 콤보×3', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeState();
    renderSessionExprV2(host, state, {});
    for (let i = 0; i < 3; i++) {
      host.querySelector('.vs-pill.pri').click(); await tick();
      host.querySelector('.vs-pill.recing').click(); await tick(); await tick();
    }
    expect(state.recLog.e1.count).toBe(3);
    expect(state.combo).toBe(3);
    expect(host.querySelector('.vs-next').classList.contains('unlock')).toBe(true);
    // 게이트는 캡션이 아니라 버튼 활성/비활성으로만 표현한다 (§4.3)
    expect(host.textContent).not.toContain('발화 3회 완료');
    expect(host.textContent).not.toMatch(/회를 채우면 열려요/);
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

/* 장면 칩 = <맥락> · <과목> 고정 (클로드디자인 2026-08-27).
 * 맥락은 sceneTitle 이 있으면 그 값, 없으면 '신규' — '신규 학습' 은 화면 종류를 말할 뿐이고
 * 진행바·레일이 이미 그걸 말한다. 과목은 홈에 과목 전환이 있어 세션 안에서도 남긴다. */
describe('sessionExprV2 — 장면 칩', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  const chipText = (host) => (host.querySelector('.vs-scene') || host.querySelector('.scene-chip')).textContent;

  it('장면이 없으면 `신규 · 영어`', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const st = makeStateWithDrills();
    st.cards = [st.cards[1]]; // scene 카드 제거 → sceneTitle 없음
    renderSessionExprV2(host, st, {});
    expect(chipText(host)).toBe('신규 · 영어');
    expect(host.textContent).not.toContain('신규 학습');
  });

  it('장면이 있으면 `<장면명> · 영어`', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills(), {});
    expect(chipText(host)).toBe('데모 · 영어');
  });

  it('모바일도 같은 규칙을 쓴다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills({ size: 'phone' }), {});
    expect(chipText(host)).toBe('데모 · 영어');
  });

  /* 긴 장면명이 진행바를 밀어내지 않게 — 클래스가 데스크톱/모바일로 갈려 한 곳만 고치면 남는다. */
  it('데스크톱·모바일 칩 모두 말줄임 처리가 있다', () => {
    for (const size of ['desktop', 'phone']) {
      const host = document.createElement('div'); document.body.appendChild(host);
      renderSessionExprV2(host, makeStateWithDrills({ size }), {});
      const css = [...host.querySelectorAll('style')].map((n) => n.textContent).join('');
      const sel = size === 'desktop' ? /\.vs-scene\{[^}]*\}/ : /\.scene-chip\{[^}]*\}/;
      const block = css.match(sel)[0];
      expect(block).toContain('text-overflow:ellipsis');
      expect(block).toContain('max-width');
    }
  });
});

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
    const drillScoreEl = drillRecBtns(host)[0].closest('.vs-drow').querySelector('.vs-gscore');
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

  it('drill 녹음 3회 → 게이트 해제 (응용 발화만으로도 다음 표현 열림)', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeStateWithDrills();
    renderSessionExprV2(host, state, {});
    const recBtn = drillRecBtns(host)[0];
    for (let k = 0; k < 3; k++) { recBtn.click(); await tick(); recBtn.click(); await tick(); await tick(); }
    expect(state.recLog.e1.count).toBe(3);
    expect(host.querySelector('.vs-next').classList.contains('unlock')).toBe(true);
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
    const blocks = [...css.matchAll(/\.vs-ctrl\{[^}]*\}/g)].map((m) => m[0]);
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
    expect(rec.querySelector('.vs-uring .pv').textContent).toBe('');
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
    expect(rec.querySelector('.vs-uring .pv').textContent).toBe('직전 12회');
    expect(rec.querySelector('.msg').textContent).toMatch(/8회/); // 12 - 4
    expect(rec.querySelector('.vs-newrec').style.display).toBe('none');
  });

  it('직전 학습일을 넘기면 코랄 링 + 기록 갱신 칩 + 초과분(+N) (§6.8)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const st = makeState();
    st.prevDayUtter = 34; st.tried = 41;
    renderSessionExprV2(host, st, {});
    const rec = host.querySelector('.vs-rec');
    expect(rec.querySelector('.vs-newrec').style.display).toBe('');
    expect(rec.querySelector('.vs-uring .n').textContent).toBe('41+7');
    expect(rec.querySelector('.vs-uring .pv').textContent).toBe('직전 34 넘김');
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
      .map((r) => r.querySelector('.vs-gscore'));
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

  it('사이드바가 링 / 공부 이력 / 해설 / 다음 표현 4카드로 분리된다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, withEx(), {});
    const side = host.querySelector('.vs-side');
    expect([...side.children].map((n) => n.className.split(' ')[0]))
      .toEqual(['vs-rec', 'vs-hist', 'vs-panel', 'vs-next']);
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

  it('점수 원은 최근 5개만 보이고 총 N회는 전체 발화 수다', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeState();
    renderSessionExprV2(host, state, {});
    for (let i = 0; i < 6; i++) {
      host.querySelector('.vs-pill.pri').click(); await tick();
      host.querySelector('.vs-pill.recing').click(); await tick(); await tick();
    }
    expect(host.querySelectorAll('.vs-meta .v-dot')).toHaveLength(5);
    expect(host.querySelector('.vs-meta .tot').textContent).toBe('총 6회');
    expect(host.textContent).not.toContain('최근 5'); // 설명 텍스트 금지
  });

  it('섹션 라벨은 꼬리 없이 응용 연습 / 체이닝 / 생산 연습 뿐이다', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const st = makeStateWithDrills();
    st.sentence.explanation.chain = { target: 'a b c d e f', chunks: ['a b', 'c d', 'e f'], ko: '가나다' };
    renderSessionExprV2(host, st, {});
    // 시안 4a 순서 — 응용 → 체이닝 → 생산 (2026-08-27 시안 대조에서 순서가 뒤바뀐 걸 발견)
    expect([...host.querySelectorAll('.vs-main .vs-lab')].map((n) => n.textContent))
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
    expect(row.querySelectorAll('.vs-gscore .v-dot')).toHaveLength(1);
    rec.click(); await tick(); rec.click(); await tick(); await tick();
    expect(row.querySelectorAll('.vs-gscore .v-dot')).toHaveLength(2);
  });

  it('밑줄은 그라디언트 언더레이 — text-decoration 을 쓰지 않는다 (구절이 끊긴다)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeState(), {});
    const css = host.querySelector('style').textContent;
    expect(css).toContain('.vs-h1 b{font-weight:700;background:linear-gradient(');
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
    st.dayMap = { '2026-08-20': 31, '2026-08-22': 47 };
    st.prDays = ['2026-08-22'];
    renderSessionExprV2(host, st, {});
    const pr = host.querySelectorAll('.vs-hist .v-cal .cd.pr');
    expect(pr).toHaveLength(1);
    expect(pr[0].textContent).toBe('22');
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
  it('본문 패딩이 34px 34px 40px 다 (§6.2)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeState(), {});
    const css = host.querySelector('style').textContent;
    expect(css).toContain('.vs-mainwrap{flex:1;display:flex;justify-content:center;gap:26px;padding:34px 34px 40px}');
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
    st.recLog = { e1: { count: 7, best: 90 } };
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
    expect(b.closest('.vs-drow').querySelector('.vs-gscore').style.display).toBe('none');
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
    expect(params.result.scoreModel).toBe('ded1');
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
      autoStopSilenceMs: 1500,
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
      autoStopSilenceMs: 1500,
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
