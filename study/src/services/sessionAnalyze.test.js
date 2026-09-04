import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pickAnalyzeLang, startMicRecording, stopAndAnalyze } from './sessionAnalyze.js';

describe('pickAnalyzeLang', () => {
  it('ja → ja-JP', () => expect(pickAnalyzeLang({ lang: 'ja' })).toBe('ja-JP'));
  it('en → en-US', () => expect(pickAnalyzeLang({ lang: 'en' })).toBe('en-US'));
  it('null → en-US 기본', () => expect(pickAnalyzeLang(null)).toBe('en-US'));
});

describe('startMicRecording', () => {
  beforeEach(() => { delete globalThis.window; });
  afterEach(() => { delete globalThis.window; });

  it('studySpeech 부재 시 { error: unavailable }', async () => {
    globalThis.window = {};
    expect(await startMicRecording()).toEqual({ error: 'unavailable' });
  });

  it('studySpeech.recordWav 정상 시 { controller }', async () => {
    const ctrl = { stop: () => {}, blobPromise: Promise.resolve(new Blob()) };
    globalThis.window = { studySpeech: { recordWav: vi.fn().mockResolvedValue(ctrl) } };
    expect(await startMicRecording()).toEqual({ controller: ctrl });
  });

  it('recordWav throw (일반) 시 { error: unavailable } + console.warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.window = { studySpeech: { recordWav: vi.fn().mockRejectedValue(new Error('boom')) } };
    expect(await startMicRecording()).toEqual({ error: 'unavailable' });
    warn.mockRestore();
  });

  it('recordWav throw (permission_denied code) 시 { error: permission_denied }', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = Object.assign(new Error('마이크 권한 거부'), { code: 'permission_denied' });
    globalThis.window = { studySpeech: { recordWav: vi.fn().mockRejectedValue(err) } };
    expect(await startMicRecording()).toEqual({ error: 'permission_denied' });
    warn.mockRestore();
  });
});

describe('stopAndAnalyze', () => {
  beforeEach(() => { delete globalThis.window; });
  afterEach(() => { delete globalThis.window; });

  it('controller 없음 → mock score 60-99 + reason=no_recorder', async () => {
    globalThis.window = {};
    const out = await stopAndAnalyze(null, 'hello', { lang: 'en' });
    expect(out.mockFallback).toBe(true);
    expect(out.fallbackReason).toBe('no_recorder');
    expect(out.score).toBeGreaterThanOrEqual(60);
    expect(out.score).toBeLessThan(100);
  });

  it('analyzeWavRest 부재 → mock', async () => {
    const blob = new Blob();
    const ctrl = { stop: vi.fn(), blobPromise: Promise.resolve(blob) };
    globalThis.window = { studySpeech: {} };
    const out = await stopAndAnalyze(ctrl, 'hello', { lang: 'en' });
    expect(ctrl.stop).toHaveBeenCalled();
    expect(out.mockFallback).toBe(true);
    expect(out.fallbackReason).toBe('no_speech');
  });

  it('정상 path — analyzeWavRest 가 정확한 인자로 호출', async () => {
    const blob = new Blob();
    const ctrl = { stop: vi.fn(), blobPromise: Promise.resolve(blob) };
    const analyzeWavRest = vi.fn().mockResolvedValue({ score: 88, phonemeScores: [{ symbol: 'k', score: 95 }] });
    globalThis.window = { studySpeech: { analyzeWavRest } };
    const out = await stopAndAnalyze(ctrl, 'I could use a coffee.', { lang: 'en', sentence: '' });
    expect(analyzeWavRest).toHaveBeenCalledTimes(1);
    expect(analyzeWavRest.mock.calls[0][0]).toBe(blob);
    expect(analyzeWavRest.mock.calls[0][1]).toBe('I could use a coffee'); // 마침표 제거
    expect(analyzeWavRest.mock.calls[0][2]).toEqual({ lang: 'en-US', enableProsody: true });
    expect(out.score).toBe(88);
  });

  it('ja card → lang=ja-JP', async () => {
    const ctrl = { stop: vi.fn(), blobPromise: Promise.resolve(new Blob()) };
    const analyzeWavRest = vi.fn().mockResolvedValue({ score: 70 });
    globalThis.window = { studySpeech: { analyzeWavRest } };
    await stopAndAnalyze(ctrl, '行ってきます', { lang: 'ja' });
    expect(analyzeWavRest.mock.calls[0][2]).toEqual({ lang: 'ja-JP', enableProsody: true });
  });

  // 체이닝(coverage) — enableMiscue 를 켜야 Azure 가 Omission 을 돌려준다. 기본 경로는 인자 불변.
  it('enableMiscue:true 를 넘기면 analyzeWavRest 에 그대로 전달된다', async () => {
    const ctrl = { stop: vi.fn(), blobPromise: Promise.resolve(new Blob()) };
    const analyzeWavRest = vi.fn().mockResolvedValue({ score: 70, omissions: [] });
    globalThis.window = { studySpeech: { analyzeWavRest } };
    await stopAndAnalyze(ctrl, "It's been a while.", { lang: 'en' }, { enableMiscue: true });
    expect(analyzeWavRest.mock.calls[0][2]).toEqual({ lang: 'en-US', enableMiscue: true, enableProsody: true });
  });

  it('blobPromise reject → reason=record_fail', async () => {
    const ctrl = { stop: vi.fn(), blobPromise: Promise.reject(new Error('rec')) };
    globalThis.window = { studySpeech: { analyzeWavRest: vi.fn() } };
    const out = await stopAndAnalyze(ctrl, 'x', { lang: 'en' });
    expect(out.mockFallback).toBe(true);
    expect(out.fallbackReason).toBe('record_fail');
  });
});

/* 응답 없는 promise 타임아웃 (2026-08-22).
 * speech.js 의 getUserMedia / audioWorklet.addModule / Azure fetch 어디에도 시간 제한이 없어,
 * 조용히 멈춘 요청 하나가 세션 화면을 영구히 '녹음 중'에 가둔다 (다시 눌러도 무반응 — 호출부의
 * finishRecording 은 recCtrl 이 null 이라 즉시 return). 두 통로에서 시간 제한을 건다. */
describe('타임아웃 — 응답 없는 녹음/채점', () => {
  let warn;
  beforeEach(() => { vi.useFakeTimers(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { vi.useRealTimers(); warn.mockRestore(); delete globalThis.window; });

  it('recordWav 가 끝나지 않으면 { error: timeout } — 15초 전에는 끊지 않는다', async () => {
    globalThis.window = { studySpeech: { recordWav: () => new Promise(() => {}) } };
    const p = startMicRecording();
    let settled = false; p.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(14_000);
    expect(settled).toBe(false);            // 조기 차단 금지 (권한 프롬프트 응답 시간 보호)
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await p).toEqual({ error: 'timeout' });
  });

  it('analyzeWavRest 가 끝나지 않으면 mockFallback + reason=timeout — 25초 전에는 끊지 않는다', async () => {
    globalThis.window = { studySpeech: { analyzeWavRest: () => new Promise(() => {}) } };
    const ctrl = { stop: () => {}, blobPromise: Promise.resolve(new Blob()) };
    const p = stopAndAnalyze(ctrl, 'hello', { lang: 'en' });
    let settled = false; p.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(24_000);
    expect(settled).toBe(false);            // 429 백오프 재시도(최악 ~16s)를 잘못 끊지 않도록
    await vi.advanceTimersByTimeAsync(1_500);
    const r = await p;
    expect(r.mockFallback).toBe(true);
    expect(r.fallbackReason).toBe('timeout');
  });

  it('제한 시간 안에 끝나면 타임아웃이 개입하지 않는다', async () => {
    const ctrl = { stop: () => {}, blobPromise: Promise.resolve(new Blob()) };
    globalThis.window = { studySpeech: { analyzeWavRest: async () => ({ score: 91 }) } };
    await expect(stopAndAnalyze(ctrl, 'hello', { lang: 'en' })).resolves.toMatchObject({ score: 91 }); // timing 동봉(2026-09-03)
  });
});

/* 녹음 시작이 재생을 끊는다 (2026-08-29) — TTS 재생 구간의 마이크 입력은 채점에서 빠지므로
 * (speech.js, 재생음이 그대로 점수가 되던 구멍), 재생 중에 녹음을 시작하면 사용자 발화가
 * 통째로 버려진다. 녹음 시작을 재생 종료 신호로 삼아 그 창을 없앤다. 메인·복습·드릴·체이닝·
 * 생산이 전부 이 함수를 지나므로 한 곳으로 충분하다. */
describe('startMicRecording — 재생 중이면 먼저 끊는다', () => {
  beforeEach(() => { delete globalThis.window; });
  afterEach(() => { delete globalThis.window; });

  it('재생 중이면 cancel 후 녹음을 시작한다', async () => {
    const cancel = vi.fn();
    const recordWav = vi.fn(async () => ({ stop() {}, blobPromise: Promise.resolve(new Blob()) }));
    globalThis.window = { studySpeech: { recordWav, cancel, isTtsPlaying: () => true } };
    const r = await startMicRecording();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(recordWav).toHaveBeenCalledTimes(1);
    expect(r.controller).toBeTruthy();
  });

  it('재생 중이 아니면 cancel 을 부르지 않는다 (synthesizer 캐시 보존)', async () => {
    const cancel = vi.fn();
    const recordWav = vi.fn(async () => ({ stop() {}, blobPromise: Promise.resolve(new Blob()) }));
    globalThis.window = { studySpeech: { recordWav, cancel, isTtsPlaying: () => false } };
    await startMicRecording();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('isTtsPlaying 이 없는 구버전에서도 그대로 동작한다', async () => {
    const recordWav = vi.fn(async () => ({ stop() {}, blobPromise: Promise.resolve(new Blob()) }));
    globalThis.window = { studySpeech: { recordWav } };
    const r = await startMicRecording();
    expect(r.controller).toBeTruthy();
  });
});

/* 토큰 선발급 (2026-08-29 오후) — Azure 토큰 캐시(10분)가 만료된 채 채점하면 발급(실측 535ms)이
 * 채점 경로에 얹힌다. 녹음 시작 시 fire-and-forget 으로 미리 받아 두면 말하는 동안 캐시가 찬다. */
describe('startMicRecording — Azure 토큰 선발급', () => {
  beforeEach(() => { delete globalThis.window; });
  afterEach(() => { delete globalThis.window; });

  it('녹음 시작 시 getAzureToken 을 병렬로 호출한다 (실패해도 녹음은 무영향)', async () => {
    const ctrl = { stop: () => {}, blobPromise: Promise.resolve(new Blob()) };
    globalThis.window = { studySpeech: {
      recordWav: vi.fn().mockResolvedValue(ctrl),
      getAzureToken: vi.fn().mockRejectedValue(new Error('offline')),
    } };
    expect(await startMicRecording()).toEqual({ controller: ctrl });
    expect(window.studySpeech.getAzureToken).toHaveBeenCalledTimes(1);
  });
});

/* 투기적 선채점 (2026-08-29 오후, 사용자 결정) — 무음 0.5초 시점에 채점을 미리 시작해 hangover
 * 1.4초와 겹친다. 꼬리 무음 트림 덕에 선채점 오디오와 확정 오디오는 트림 후 동일 → 결과 동등. */
describe('startMicRecording/stopAndAnalyze — 투기적 선채점', () => {
  beforeEach(() => { delete globalThis.window; });
  afterEach(() => { delete globalThis.window; });

  const specResult = { score: 91, recognizedText: 'Hello there.', phonemeScores: [] };
  function setupSpeech() {
    const ctrl = { stop: vi.fn(), blobPromise: Promise.resolve(new Blob([new ArrayBuffer(64)])) };
    const recordWav = vi.fn(async (opts) => { recordWav.lastOpts = opts; return ctrl; });
    const analyzeWavRest = vi.fn(async () => specResult);
    globalThis.window = { studySpeech: { recordWav, analyzeWavRest, getAzureToken: vi.fn(async () => ({})) } };
    return { ctrl, recordWav, analyzeWavRest };
  }

  it('speculate 옵션이 recordWav 배선(speculateSilenceMs·onSpeculate)으로 변환된다 — speculate 키 자체는 전달 안 함', async () => {
    const { recordWav } = setupSpeech();
    const r = await startMicRecording({ autoStopSilenceMs: 2000, speculate: { expected: 'Hello there.', card: { lang: 'en' } } });
    expect(r.controller).toBeTruthy();
    expect(recordWav.lastOpts.speculateSilenceMs).toBeGreaterThan(0);
    expect(typeof recordWav.lastOpts.onSpeculate).toBe('function');
    expect(typeof recordWav.lastOpts.onSpeculateInvalid).toBe('function');
    expect(recordWav.lastOpts.speculate).toBeUndefined();
  });

  it('무효화 없이 끝나면 선채점 결과를 그대로 쓴다 — 재채점 없음', async () => {
    const { recordWav, analyzeWavRest } = setupSpeech();
    const { controller } = await startMicRecording({ speculate: { expected: 'Hello there.', card: { lang: 'en' } } });
    recordWav.lastOpts.onSpeculate(new Blob([new ArrayBuffer(32)]));      // 무음 0.5s — 선채점 시작
    await new Promise((res) => setTimeout(res, 0));
    expect(analyzeWavRest).toHaveBeenCalledTimes(1);
    expect(analyzeWavRest.mock.calls[0][1]).toBe('Hello there');          // normalize 적용
    expect(analyzeWavRest.mock.calls[0][2]).toMatchObject({ lang: 'en-US', enableMiscue: true, enableProsody: true });
    const result = await stopAndAnalyze(controller, 'Hello there.', { lang: 'en' }, { enableMiscue: true });
    expect(analyzeWavRest).toHaveBeenCalledTimes(1);                      // 재채점 없음
    expect(result).toBe(specResult);
  });

  it('말이 재개되면(onSpeculateInvalid) 정상 경로로 재채점한다', async () => {
    const { recordWav, analyzeWavRest } = setupSpeech();
    const { controller } = await startMicRecording({ speculate: { expected: 'Hello there.', card: { lang: 'en' } } });
    recordWav.lastOpts.onSpeculate(new Blob([new ArrayBuffer(32)]));
    recordWav.lastOpts.onSpeculateInvalid();
    await stopAndAnalyze(controller, 'Hello there.', { lang: 'en' }, { enableMiscue: true });
    expect(analyzeWavRest).toHaveBeenCalledTimes(2);                      // 선채점 1 + 정상 재채점 1
  });

  /* 요청 겹침 금지 (2026-09-04): 선채점 요청에 AbortSignal 을 넘기고, (a) 대기 초과로 확정 채점을 보내기 직전
   * (b) 말 재개로 무효화될 때 (c) 다음 선채점 발사 때 이전 요청을 끊는다 — 이 키는 요청이 겹치면 429(2초 백오프). */
  it('선채점 요청에는 signal 이 실리고, 말 재개(onSpeculateInvalid)·재발사 시 이전 요청이 abort 된다', async () => {
    const { recordWav, analyzeWavRest } = setupSpeech();
    await startMicRecording({ speculate: { expected: 'Hello there.', card: { lang: 'en' } } });
    recordWav.lastOpts.onSpeculate(new Blob([new ArrayBuffer(32)]));
    const sig1 = analyzeWavRest.mock.calls[0][2].signal;
    expect(sig1).toBeInstanceOf(AbortSignal);
    expect(sig1.aborted).toBe(false);
    recordWav.lastOpts.onSpeculateInvalid();                              // 말 재개
    expect(sig1.aborted).toBe(true);
    recordWav.lastOpts.onSpeculate(new Blob([new ArrayBuffer(32)]));      // 재발사
    const sig2 = analyzeWavRest.mock.calls[1][2].signal;
    expect(sig2.aborted).toBe(false);
    recordWav.lastOpts.onSpeculate(new Blob([new ArrayBuffer(32)]));      // 또 재발사 → 직전 요청 abort
    expect(sig2.aborted).toBe(true);
  });

  it('선채점이 실패(mock 폴백)면 정상 경로로 재채점한다', async () => {
    const { recordWav, analyzeWavRest } = setupSpeech();
    analyzeWavRest.mockResolvedValueOnce({ mockFallback: true, fallbackReason: 'rate_limited', score: 70 });
    const { controller } = await startMicRecording({ speculate: { expected: 'Hello there.', card: { lang: 'en' } } });
    recordWav.lastOpts.onSpeculate(new Blob([new ArrayBuffer(32)]));
    const result = await stopAndAnalyze(controller, 'Hello there.', { lang: 'en' }, { enableMiscue: true });
    expect(analyzeWavRest).toHaveBeenCalledTimes(2);
    expect(result).toBe(specResult);
  });
});

/* 2026-08-30 감사 확증 — 선채점의 시간 예산·수명. (a) 선채점 await 가 25초 예산을 직렬로 잠식해
 * 복구 가능한 실패(rate_limited·스톨)가 timeout 으로 악화되고 확정 채점이 시도조차 안 됐다.
 * (b) 시작 타임아웃으로 버려진 녹음의 VAD 가 유령 선채점 Azure 호출을 계속 발사했다. */
describe('투기적 선채점 — 시간 예산·무장 해제', () => {
  beforeEach(() => { vi.useFakeTimers(); delete globalThis.window; });
  afterEach(() => { vi.useRealTimers(); delete globalThis.window; });

  it('선채점이 스톨해도 독립 예산으로 끊고 확정 채점을 호출한다', async () => {
    const finalResult = { score: 91 };
    const analyzeWavRest = vi.fn()
      .mockImplementationOnce(() => new Promise(() => {}))   // 선채점 — 응답 없이 스톨
      .mockResolvedValue(finalResult);
    const ctrl = { stop: vi.fn(), blobPromise: Promise.resolve(new Blob([new ArrayBuffer(64)])) };
    const recordWav = vi.fn(async (o) => { recordWav.lastOpts = o; return ctrl; });
    globalThis.window = { studySpeech: { recordWav, analyzeWavRest, getAzureToken: vi.fn(async () => ({})) } };
    const { controller } = await startMicRecording({ speculate: { expected: 'Hello.', card: { lang: 'en' } } });
    recordWav.lastOpts.onSpeculate(new Blob([new ArrayBuffer(32)]));
    const p = stopAndAnalyze(controller, 'Hello.', { lang: 'en' }, { enableMiscue: true });
    await vi.advanceTimersByTimeAsync(4_000);                // 선채점 예산(3초) 초과
    const r = await p;
    expect(analyzeWavRest).toHaveBeenCalledTimes(2);         // 확정 채점이 실제로 호출됨
    expect(analyzeWavRest.mock.calls[0][2].signal.aborted).toBe(true);   // 스톨한 선채점 요청은 끊는다 (겹침 0)
    expect('signal' in analyzeWavRest.mock.calls[1][2]).toBe(false);     // 확정 요청은 신호 없음
    expect(r).toBe(finalResult);
  });

  it('시작 타임아웃으로 버려진 녹음의 선채점 신호는 무장 해제된다 — 유령 Azure 호출 0', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const analyzeWavRest = vi.fn(async () => ({ score: 90 }));
    const recordWav = vi.fn((o) => { recordWav.lastOpts = o; return new Promise(() => {}); });
    globalThis.window = { studySpeech: { recordWav, analyzeWavRest, getAzureToken: vi.fn(async () => ({})) } };
    const p = startMicRecording({ speculate: { expected: 'Hello.', card: { lang: 'en' } } });
    await vi.advanceTimersByTimeAsync(15_100);
    expect(await p).toEqual({ error: 'timeout' });
    recordWav.lastOpts.onSpeculate(new Blob([new ArrayBuffer(32)]));  // 버려진 세션의 VAD 신호
    expect(analyzeWavRest).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

/* 선채점 조기 종결 (2026-09-01, 사용자 결정 "채점 시간은 최대한 짧게") — 선채점 결과가
 * '전 단어 발화'(omissions 0)로 확인되면 남은 hangover(1.4초)를 기다리지 않고 controller.abort
 * (비자발 종료, onAutoStop 통보 포함)로 즉시 종결한다. 호출부 finishRecording 이 그대로 돌고,
 * stopAndAnalyze 는 이미 도착한 선채점 결과를 재사용한다. 단어를 빠뜨린 결과(문장 중간 쉼)는
 * 걸리지 않아 대기 전액이 유지된다 — 잘림 위험 불변. */
describe('startMicRecording — 선채점 조기 종결', () => {
  beforeEach(() => { delete globalThis.window; });
  afterEach(() => { delete globalThis.window; });

  const flush = () => new Promise((res) => setTimeout(res, 0));
  function deferred() {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
  }
  function setupSpeech(analyzeImpl) {
    const ctrl = { stop: vi.fn(), abort: vi.fn(), blobPromise: Promise.resolve(new Blob([new ArrayBuffer(64)])) };
    const recordWav = vi.fn(async (opts) => { recordWav.lastOpts = opts; return ctrl; });
    const analyzeWavRest = vi.fn(analyzeImpl ?? (async () => ({ score: 92, omissions: [], insertions: [] })));
    globalThis.window = { studySpeech: { recordWav, analyzeWavRest, getAzureToken: vi.fn(async () => ({})) } };
    return { ctrl, recordWav };
  }

  it('선채점 결과가 전 단어 발화면 abort 로 즉시 종결한다 (en)', async () => {
    const { ctrl, recordWav } = setupSpeech();
    const r = await startMicRecording({ autoStopSilenceMs: 1400, speculate: { expected: 'What do you mean', card: { lang: 'en' } } });
    expect(r.controller).toBe(ctrl);
    recordWav.lastOpts.onSpeculate(new Blob([new ArrayBuffer(32)]));
    await flush();
    expect(ctrl.abort).toHaveBeenCalledTimes(1);
  });

  it('단어를 빠뜨린 선채점 결과로는 종결하지 않는다 (문장 중간 쉼 보호)', async () => {
    const { ctrl, recordWav } = setupSpeech(async () => ({ score: 70, omissions: ['mean'], insertions: [] }));
    await startMicRecording({ speculate: { expected: 'What do you mean', card: { lang: 'en' } } });
    recordWav.lastOpts.onSpeculate(new Blob([new ArrayBuffer(32)]));
    await flush();
    expect(ctrl.abort).not.toHaveBeenCalled();
  });

  it('ja 카드는 조기 종결하지 않는다 (omission 판정 미실측 언어)', async () => {
    const { ctrl, recordWav } = setupSpeech();
    await startMicRecording({ speculate: { expected: 'ありがとうございます', card: { lang: 'ja' } } });
    recordWav.lastOpts.onSpeculate(new Blob([new ArrayBuffer(32)]));
    await flush();
    expect(ctrl.abort).not.toHaveBeenCalled();
  });

  it('말 재개로 무효화되면 늦게 도착한 결과로 종결하지 않는다', async () => {
    const d = deferred();
    const { ctrl, recordWav } = setupSpeech(() => d.promise);
    await startMicRecording({ speculate: { expected: 'What do you mean', card: { lang: 'en' } } });
    recordWav.lastOpts.onSpeculate(new Blob([new ArrayBuffer(32)]));
    recordWav.lastOpts.onSpeculateInvalid();
    d.resolve({ score: 92, omissions: [], insertions: [] });
    await flush();
    expect(ctrl.abort).not.toHaveBeenCalled();
  });

  it('무효화 후 재발사되면 이전 발사의 늦은 결과로는 종결하지 않는다', async () => {
    const d1 = deferred();
    const d2 = deferred();
    let calls = 0;
    const { ctrl, recordWav } = setupSpeech(() => (++calls === 1 ? d1.promise : d2.promise));
    await startMicRecording({ speculate: { expected: 'What do you mean', card: { lang: 'en' } } });
    recordWav.lastOpts.onSpeculate(new Blob([new ArrayBuffer(32)]));
    recordWav.lastOpts.onSpeculateInvalid();                          // 말 재개 — 1차 발사 무효
    recordWav.lastOpts.onSpeculate(new Blob([new ArrayBuffer(48)]));  // 2차 발사 (valid 재점등)
    d1.resolve({ score: 92, omissions: [], insertions: [] });         // 1차의 늦은 결과 — 낡은 스냅샷
    await flush();
    expect(ctrl.abort).not.toHaveBeenCalled();
    d2.resolve({ score: 95, omissions: [], insertions: [] });
    await flush();
    expect(ctrl.abort).toHaveBeenCalledTimes(1);
  });

  it('무효화 후 재발사되면 이전 발사의 늦은 실패가 새 발사를 무장 해제하지 않는다', async () => {
    let rejectD1;
    const d1 = new Promise((_res, rej) => { rejectD1 = rej; });
    const d2 = deferred();
    let calls = 0;
    const { ctrl, recordWav } = setupSpeech(() => (++calls === 1 ? d1 : d2.promise));
    await startMicRecording({ speculate: { expected: 'What do you mean', card: { lang: 'en' } } });
    recordWav.lastOpts.onSpeculate(new Blob([new ArrayBuffer(32)]));
    recordWav.lastOpts.onSpeculateInvalid();                          // 말 재개 — 1차 발사 무효
    recordWav.lastOpts.onSpeculate(new Blob([new ArrayBuffer(48)]));  // 2차 발사 (valid 재점등)
    rejectD1(new Error('stall'));                                     // 1차의 늦은 실패 — 낡은 요청
    await flush();
    d2.resolve({ score: 95, omissions: [], insertions: [] });
    await flush();
    expect(ctrl.abort).toHaveBeenCalledTimes(1);                      // 2차의 조기 종결은 살아 있다
  });

  it('선채점 무음 임계를 0.5초로 배선한다', async () => {
    const { recordWav } = setupSpeech();
    await startMicRecording({ speculate: { expected: 'x', card: { lang: 'en' } } });
    expect(recordWav.lastOpts.speculateSilenceMs).toBe(500);
  });
});

/* 채점 지연 계측 (2026-09-03) — 녹음 종료 시각과 구간별 소요를 결과에 실어 저장까지 흘려보낸다. */
describe('stopAndAnalyze — timing 계측', () => {
  beforeEach(() => { delete globalThis.window; });
  afterEach(() => { delete globalThis.window; });

  it('정상 경로: stopAt·blobMs·totalMs·specUsed=false 를 싣는다', async () => {
    const ctrl = { stop: vi.fn(), blobPromise: Promise.resolve(new Blob()) };
    const analyzeWavRest = vi.fn().mockResolvedValue({ score: 88, phonemeScores: [], timing: { sttMs: 700, sttAttempts: 1 } });
    globalThis.window = { studySpeech: { analyzeWavRest } };
    const out = await stopAndAnalyze(ctrl, 'hello', { lang: 'en' });
    expect(typeof out.timing.stopAt).toBe('number');
    expect(typeof out.timing.blobMs).toBe('number');
    expect(typeof out.timing.totalMs).toBe('number');
    expect(out.timing.specUsed).toBe(false);
    expect(out.timing.sttMs).toBe(700); // 아래층(analyzeWavRest) 계측 보존
  });

  it('선채점 결과를 썼으면 specUsed=true', async () => {
    const ctrl = { stop: vi.fn(), blobPromise: Promise.resolve(new Blob()), _speculative: { valid: true, promise: Promise.resolve({ score: 91, phonemeScores: [] }) } };
    const analyzeWavRest = vi.fn();
    globalThis.window = { studySpeech: { analyzeWavRest } };
    const out = await stopAndAnalyze(ctrl, 'hello', { lang: 'en' }, { enableMiscue: true });
    expect(out.score).toBe(91);
    expect(analyzeWavRest).not.toHaveBeenCalled();
    expect(out.timing.specUsed).toBe(true);
  });
});
