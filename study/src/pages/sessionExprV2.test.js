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

describe('sessionExprV2 — 확장 사다리(ladder) 렌더', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
  function ladderState() {
    const s = makeState();
    s.sentence.explanation.ladder = [
      { en: 'A coffee.', ko: '커피.', kr: '어 커피' },
      { en: 'A coffee, please.', ko: '커피 주세요.', kr: '어 커피 플리즈' },
      { en: 'Can I get a coffee, please?', ko: '커피 하나 주시겠어요?', kr: '캔 아이 게러 커피 플리즈',
        back: [['please?', '플리즈'], ['a coffee, please?', '어 커피 플리즈'], ['Can I get a coffee, please?', '캔 아이 게러 커피 플리즈']] },
    ];
    return s;
  }
  it('ladder ≥2단 → "확장 사다리" + rung + "이어 말하기 (끝부터)" 렌더', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, ladderState(), {});
    expect(host.textContent).toContain('확장 사다리');
    expect(host.textContent).toContain('A coffee.');
    expect(host.textContent).toContain('Can I get a coffee, please?');
    expect(host.textContent).toContain('이어 말하기 (끝부터)');
  });
  it('ladder 없음 → 확장 사다리 미렌더 (기존 시드 호환)', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    renderSessionExprV2(host, makeState(), {});
    expect(host.textContent).not.toContain('확장 사다리');
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

    // 행 점수 배지
    expect(drillRecBtns(host)[0].closest('.vs-drow').querySelector('.vs-gscore').textContent).toContain('92');
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
