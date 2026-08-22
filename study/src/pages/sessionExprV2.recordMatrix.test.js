// @vitest-environment jsdom
/* 녹음 무한 로딩 — 입력 소리 패턴별 실측 매트릭스 (2026-08-22).
 *
 * 추측을 끝내기 위한 통합 검증. 가짜 마이크로 합성 PCM 을 흘려 **진짜 recordWav →
 * 진짜 sessionAnalyze → 진짜 세션 UI** 를 그대로 태우고, 각 상황에서 화면이
 * '녹음 중'에 갇히는지(=무한 로딩) 아니면 idle 로 복구되는지를 직접 읽는다.
 * (sessionAnalyze 를 mock 하지 않는다 — mock 하면 검증 대상이 사라진다.)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../services/pronunciationLog.js', () => ({ savePronunciationLog: vi.fn(async () => null) }));
vi.mock('../services/weakPhonemes.js', () => ({ applyWeakPhonemesUpdate: vi.fn(async () => null) }));
const toasts = [];
vi.mock('../components/session/recordToast.js', () => ({
  showRecordToast: (m) => toasts.push(m),
  recordErrorMessage: (r) => `err:${r}`,
}));

import { recordWav, releaseWarmMic } from '../services/speech.js';
import { renderSessionExprV2 } from './sessionExprV2.js';

const CHUNK_MS = 50;
const SAMPLES = 16000 * CHUNK_MS / 1000;
const pcm = (level) => {
  const a = new Int16Array(SAMPLES);
  a.fill(Math.round(level * 0x7FFF));
  return a.buffer;
};

let nodes = [];
function installFakeMic() {
  nodes = [];
  const track = { readyState: 'live', stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  globalThis.navigator.mediaDevices = { getUserMedia: vi.fn(async () => stream) };
  class FakeWorkletNode {
    constructor() { this.port = { onmessage: null, postMessage: vi.fn() }; this.connect = vi.fn(); this.disconnect = vi.fn(); nodes.push(this); }
  }
  class FakeAudioContext {
    constructor() { this.state = 'running'; this.destination = {}; }
    resume = vi.fn(async () => {}); close = vi.fn();
    audioWorklet = { addModule: vi.fn(async () => {}) };
    createMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
    createGain = vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }));
  }
  window.AudioContext = FakeAudioContext;
  window.AudioWorkletNode = FakeWorkletNode;
}

/** level 의 소리를 ms 동안 흘린다 (가짜 시계를 함께 전진). level=null 이면 무신호. */
async function feed(level, ms) {
  for (let t = 0; t < ms; t += CHUNK_MS) {
    if (level !== null) nodes.at(-1)?.port.onmessage?.({ data: pcm(level) });
    await vi.advanceTimersByTimeAsync(CHUNK_MS);
  }
}

function mountSession({ analyzeDelayMs = 0 } = {}) {
  window.studySpeech = {
    recordWav,
    analyzeWavRest: vi.fn(() => new Promise((res) => {
      if (analyzeDelayMs === Infinity) return;               // 영원히 응답 없음
      setTimeout(() => res({ score: 91, weakPhonemes: [] }), analyzeDelayMs);
    })),
    speak: vi.fn(), cancel: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const explanation = { key: "You're mad at me. = 나한테 화났구나.", drills: [] };
  const s = { id: 'e1', lang: 'en', sentence: "You're mad at me.", ko: '나한테 화났구나.', explanation };
  const state = {
    size: 'desktop', recording: false, lastScore: null, tried: 0, passed: 0, combo: 0,
    pronScores: [], weakInSession: {}, recLog: {}, exLog: {}, step: 1, total: 1,
    cards: [{ id: 'e1', lang: 'en', sentence: s.sentence, meaning: s.ko, explanation }], sentence: s,
  };
  renderSessionExprV2(host, state, {});
  const pill = [...host.querySelectorAll('.vs-pill')][1];
  return { host, state, pill, label: () => pill.textContent.trim() };
}

describe('녹음 무한 로딩 — 소리 패턴별 실측', () => {
  beforeEach(() => { toasts.length = 0; document.body.innerHTML = ''; installFakeMic(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); releaseWarmMic(); });

  /** 클릭 → 소리 흘리기 → 최종 화면 상태. stuck=true 면 무한 로딩. */
  async function run(pattern, opts = {}) {
    const ui = mountSession(opts);
    ui.pill.click();
    await vi.advanceTimersByTimeAsync(0);
    await pattern();
    await vi.advanceTimersByTimeAsync(1000);              // 채점 여유
    // idle = '따라 말하기'(첫 녹음 전) 또는 '다시 말하기'(녹음 이력 있음). 갇힘 = '녹음 멈추기'.
    return { label: ui.label(), stuck: ui.label() === '녹음 멈추기', tried: ui.state.tried };
  }

  it('A. 정상 발화 — 1초 말하고 2.5초 침묵', async () => {
    const r = await run(async () => { await feed(0.20, 1000); await feed(0.0, 2500); });
    expect(r).toMatchObject({ stuck: false });
  });

  it('B. 아주 작은 목소리 — 계속 0.03 (자동 종료 무장 실패)', async () => {
    const r = await run(async () => { await feed(0.03, 17000); });
    expect(r).toMatchObject({ stuck: false });
  });

  it('C. 시끄러운 환경 — 발화 후에도 0.06 이 계속 (침묵 판정 안 됨)', async () => {
    const r = await run(async () => { await feed(0.20, 800); await feed(0.06, 17000); });
    expect(r).toMatchObject({ stuck: false });
  });

  it('D. 마이크 무신호 — 청크가 아예 안 옴', async () => {
    const r = await run(async () => { await feed(null, 20000); });
    expect(r).toMatchObject({ stuck: false });
  });

  it('E. 15초 넘게 계속 발화', async () => {
    const r = await run(async () => { await feed(0.20, 17000); });
    expect(r).toMatchObject({ stuck: false });
  });

  it('F. 정상 발화 + 채점 서버 응답 정체(영원)', async () => {
    const r = await run(async () => {
      await feed(0.20, 1000); await feed(0.0, 2500);
      await vi.advanceTimersByTimeAsync(26_000);          // 채점 타임아웃 경과
    }, { analyzeDelayMs: Infinity });
    expect(r).toMatchObject({ stuck: false });
  });
});
