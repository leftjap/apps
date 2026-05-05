// Wave 11.63 — AudioWorkletProcessor (16kHz mono Int16 PCM 변환).
// ScriptProcessorNode 폐기 후속. main thread 외 audio thread 에서 실행.
//
// 동작:
//   - input[0][0] (mono Float32) 을 16kHz 로 linear interpolation downsample
//   - [-1, 1] clipping 후 Int16 (LE) 로 변환
//   - port.postMessage(int16Buffer) 로 main thread 에 전달
//
// sampleRate 는 globalThis.sampleRate (worklet scope) — 보통 48000.

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.ratio = sampleRate / this.targetRate; // 보통 3.0
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }

  process(inputs) {
    if (this.stopped) return false; // 종료 → worklet 자동 cleanup
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch = input[0];
    if (!ch || ch.length === 0) return true;

    const outLen = Math.floor(ch.length / this.ratio);
    if (outLen === 0) return true;
    const int16 = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const srcIdx = i * this.ratio;
      const lo = Math.floor(srcIdx);
      const hi = Math.min(lo + 1, ch.length - 1);
      const frac = srcIdx - lo;
      const s = Math.max(-1, Math.min(1, ch[lo] * (1 - frac) + ch[hi] * frac));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    // Transferable 로 zero-copy 전달
    this.port.postMessage(int16.buffer, [int16.buffer]);
    return true;
  }
}

registerProcessor('recorder-worklet', RecorderProcessor);
