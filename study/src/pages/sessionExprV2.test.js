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
