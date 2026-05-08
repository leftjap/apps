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

  it('studySpeech 부재 시 null', async () => {
    globalThis.window = {};
    expect(await startMicRecording()).toBeNull();
  });

  it('studySpeech.recordWav 정상 시 컨트롤러 반환', async () => {
    const ctrl = { stop: () => {}, blobPromise: Promise.resolve(new Blob()) };
    globalThis.window = { studySpeech: { recordWav: vi.fn().mockResolvedValue(ctrl) } };
    expect(await startMicRecording()).toBe(ctrl);
  });

  it('recordWav throw 시 null + console.warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.window = { studySpeech: { recordWav: vi.fn().mockRejectedValue(new Error('mic denied')) } };
    expect(await startMicRecording()).toBeNull();
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
    expect(analyzeWavRest.mock.calls[0][2]).toEqual({ lang: 'en-US' });
    expect(out.score).toBe(88);
  });

  it('ja card → lang=ja-JP', async () => {
    const ctrl = { stop: vi.fn(), blobPromise: Promise.resolve(new Blob()) };
    const analyzeWavRest = vi.fn().mockResolvedValue({ score: 70 });
    globalThis.window = { studySpeech: { analyzeWavRest } };
    await stopAndAnalyze(ctrl, '行ってきます', { lang: 'ja' });
    expect(analyzeWavRest.mock.calls[0][2]).toEqual({ lang: 'ja-JP' });
  });

  it('blobPromise reject → reason=record_fail', async () => {
    const ctrl = { stop: vi.fn(), blobPromise: Promise.reject(new Error('rec')) };
    globalThis.window = { studySpeech: { analyzeWavRest: vi.fn() } };
    const out = await stopAndAnalyze(ctrl, 'x', { lang: 'en' });
    expect(out.mockFallback).toBe(true);
    expect(out.fallbackReason).toBe('record_fail');
  });
});
