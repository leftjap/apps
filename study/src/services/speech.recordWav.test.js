// @vitest-environment jsdom
/* recordWav 종료 통보 계약 (2026-08-22).
 *
 * 실사용 보고: "가끔 기본 문장·응용 문장 녹음이 무한 로딩" — 화면이 녹음 중 상태로 굳는다.
 * 녹음이 끝나는 길은 넷인데(무음 자동종료 / maxSeconds 상한 / 새 녹음의 강제 확정 / 사용자 stop)
 * 호출자에게 통보되는 건 무음 자동종료뿐이라, 나머지 경로에선 UI 가 '녹음 중'에 갇힌다.
 *
 * 가짜 마이크 하네스 — getUserMedia / AudioContext / AudioWorkletNode 를 대체해
 * 청크 주입 시점까지 결정적으로 제어한다 (실제 마이크·워클릿 불필요).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { recordWav, releaseWarmMic } from './speech.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const chunk = (peak = 0) => {
  const a = new Int16Array(160);
  if (peak) a.fill(Math.round(peak * 0x7FFF));
  return a.buffer;
};

let nodes = [];

function installFakeMic() {
  nodes = [];
  const track = { readyState: 'live', stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  globalThis.navigator.mediaDevices = { getUserMedia: vi.fn(async () => stream) };

  class FakeWorkletNode {
    constructor() {
      this.port = { onmessage: null, postMessage: vi.fn() };
      this.connect = vi.fn(); this.disconnect = vi.fn();
      nodes.push(this);
    }
  }
  class FakeAudioContext {
    constructor() { this.state = 'running'; this.destination = {}; }
    resume = vi.fn(async () => { this.state = 'running'; });
    close = vi.fn();
    audioWorklet = { addModule: vi.fn(async () => {}) };
    createMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
    createGain = vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }));
  }
  window.AudioContext = FakeAudioContext;
  window.AudioWorkletNode = FakeWorkletNode;
}

/** recordWav 호출 → 청크를 계속 흘려 캡처 게이트 통과 → controller 반환.
 * 워밍 재사용(노드 재생성 없음) 경로에서도 게이트 설치 시점을 놓치지 않도록 펌프로 주입한다.
 * 레벨 0 청크 = 무신호 → VAD 무장 안 됨(= 무음 자동종료 경로를 타지 않음). */
async function startRecording(opts = {}) {
  const p = recordWav({ workletUrl: '/fake-worklet.js', maxSeconds: 0.2, ...opts });
  const pump = setInterval(() => { nodes.at(-1)?.port.onmessage?.({ data: chunk(0) }); }, 3);
  try { return { controller: await p, node: nodes.at(-1) }; }
  finally { clearInterval(pump); }
}

describe('recordWav — 비자발적 종료 통보 (무한 로딩 회귀)', () => {
  beforeEach(() => { installFakeMic(); });
  afterEach(() => { releaseWarmMic(); vi.restoreAllMocks(); });

  it('maxSeconds 상한으로 끝나면 onAutoStop 으로 통보한다', async () => {
    const onAutoStop = vi.fn();
    const { controller } = await startRecording({ autoStopSilenceMs: 2000, onAutoStop });
    await new Promise((r) => setTimeout(r, 260)); // maxSeconds(0.2s) 경과
    expect(onAutoStop).toHaveBeenCalledTimes(1);   // 통보 없으면 화면이 '녹음 중'에 갇힌다
    await expect(controller.blobPromise).resolves.toBeInstanceOf(Blob);
  });

  it('새 녹음이 직전 녹음을 강제 확정할 때도 통보한다', async () => {
    const onAutoStop = vi.fn();
    await startRecording({ maxSeconds: 30, autoStopSilenceMs: 2000, onAutoStop });
    await startRecording({ maxSeconds: 30 });      // 다른 행에서 녹음 시작 → 앞 세션 강제 확정
    expect(onAutoStop).toHaveBeenCalledTimes(1);
  });

  it('사용자가 직접 멈춘 경우엔 통보하지 않는다 (중복 채점 방지)', async () => {
    const onAutoStop = vi.fn();
    const { controller } = await startRecording({ maxSeconds: 30, autoStopSilenceMs: 2000, onAutoStop });
    controller.stop();
    await tick();
    expect(onAutoStop).not.toHaveBeenCalled();
  });
});
