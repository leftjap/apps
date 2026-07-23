// @vitest-environment jsdom
// 녹음 성공 경로 통합 검증 — 마이크 없이 services 를 mock 해 record→채점→savePronunciationLog→state 를 결정적으로 확인.
// (라이브 브라우저는 마이크 장치 부재로 성공 경로 미실행 — 이 테스트가 그 갭을 메움.)
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/sessionAnalyze.js', () => ({
  startMicRecording: vi.fn(async () => ({ controller: { stop() {} } })),
  stopAndAnalyze: vi.fn(async () => ({ score: 92, weakPhonemes: ['ð'] })),
}));
vi.mock('../services/pronunciationLog.js', () => ({ savePronunciationLog: vi.fn(async () => null) }));
vi.mock('../services/weakPhonemes.js', () => ({ applyWeakPhonemesUpdate: vi.fn(async () => null) }));
vi.mock('../components/session/recordToast.js', () => ({ showRecordToast: vi.fn(), recordErrorMessage: vi.fn(() => '에러') }));

import { renderSessionExprV2 } from './sessionExprV2.js';
import { savePronunciationLog } from '../services/pronunciationLog.js';
import { stopAndAnalyze } from '../services/sessionAnalyze.js';

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

  it('녹음 1회 완료 → tried++ · lastScore=92 · 콤보×1 · savePronunciationLog(올바른 인자) · 점수 링 92', async () => {
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
    expect(state.lastScore).toBe(92);
    expect(state.combo).toBe(1);
    expect(state.pronScores).toEqual([92]);
    expect(state.recLog.e1).toEqual({ count: 1, best: 92 });
    expect(state.weakInSession).toEqual({ 'ð': 1 });

    // stopAndAnalyze 가 현재 문장으로 호출
    expect(stopAndAnalyze).toHaveBeenCalledTimes(1);
    // DB write — savePronunciationLog 가 result/sentenceId/lang/date 로 호출
    expect(savePronunciationLog).toHaveBeenCalledTimes(1);
    const [dbArg, params] = savePronunciationLog.mock.calls[0];
    expect(params.sentenceId).toBe('e1');
    expect(params.lang).toBe('en');
    expect(params.result).toEqual({ score: 92, weakPhonemes: ['ð'] });
    expect(typeof params.date).toBe('string');

    // 리빌 DOM — 점수 링 92 · PASS 칩 · 발화 dot 1 · 게이트 진행
    expect(host.querySelector('.vs-ring .cn').textContent).toBe('92');
    expect(host.querySelector('.vs-ring').classList.contains('score-pop')).toBe(true); // 점수 등장 애니
    expect(host.querySelector('.vs-pass').style.display).not.toBe('none');
    expect(host.querySelectorAll('.vs-say .d i.f').length).toBe(1);
    expect(host.querySelector('.vs-combo').textContent).toContain('×1');
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
    expect(host.querySelector('.vs-gate').classList.contains('ok')).toBe(true);
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
      expect(block.textContent).toContain('연속 ✓ 1');
      rec(1).click(); vi.advanceTimersByTime(900);
      expect(block.textContent).toContain('연속 ✓ 2');
      expect(block.textContent).toContain('생산 완주');
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
function makeStateWithDrills() {
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
  };
}

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
    expect(state.pronScores).toEqual([92]);
    expect(state.weakInSession).toEqual({ 'ð': 1 });

    // '오늘 발화' 위젯 + ' 녹음 N/M' 카운터 라이브 갱신
    expect(host.querySelector('.vs-rec .n').textContent).toBe('1');
    expect(host.querySelector('.vs-labrow .ct b').textContent).toBe('1');

    // 행 점수 배지 + 등장 애니
    const drillScoreEl = drillRecBtns(host)[0].closest('.vs-drow').querySelector('.vs-gscore');
    expect(drillScoreEl.textContent).toContain('92');
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
    expect(host.querySelector('.vs-gate').classList.contains('ok')).toBe(true);
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

  it('메인 미녹음 + drill 만 녹음 → 점수링 캡션은 "직전 점수" 안 씀 (점수 없음, 링 —)', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const state = makeStateWithDrills();
    renderSessionExprV2(host, state, {});
    const recBtn = drillRecBtns(host)[0];
    recBtn.click(); await tick();
    recBtn.click(); await tick(); await tick();
    const cap = host.querySelector('.vs-cap').textContent;
    expect(cap).not.toContain('직전 점수');   // 메인 점수 없으면 '직전 점수' 문구 금지
    expect(cap).toContain('1회 시도');         // 시도 횟수는 표기 (게이트 dots 와 정합)
    expect(host.querySelector('.vs-ring .cn').textContent).toBe('—'); // 링 = 점수 없음
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

  it('ja: 화자 순환 미적용 — 기존 speaker 경로 유지', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const speak = vi.fn();
    window.studySpeech = { speak };
    const st = makeState();
    st.sentence.lang = 'ja'; st.cards[1].lang = 'ja';
    renderSessionExprV2(host, st, {});
    listenBtn(host).click();
    const o = speak.mock.calls[0][1];
    expect(o.lang).toBe('ja-JP');
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
    expect(host.querySelector('.vs-prodblock .ct').textContent).toContain('연속 ✓ 0');
  });

  it('정확도 80 + 커버리지 통과 → 통과·정답 공개', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeStateWithDrills(), {});
    await recOnce(host, 80, "It's more than a job.");
    const row = prodRow(host, 0);
    expect(row.textContent).toContain('more than a job');
    expect(row.querySelector('.vs-gscore').style.display).not.toBe('none');
    expect(host.querySelector('.vs-prodblock .ct').textContent).toContain('연속 ✓ 1');
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
