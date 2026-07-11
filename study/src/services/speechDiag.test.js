import { describe, it, expect } from 'vitest';
import {
  buildDiagnosticSample,
  recordDiagnostic,
  getDiagnostics,
  clearDiagnostics,
} from './speechDiag.js';

// 인메모리 fake storage (localStorage 대체 — 환경 독립)
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

describe('buildDiagnosticSample', () => {
  it('체이닝 결과를 진단 튜플로 형성한다 (expected·recognized·omissions 포함)', () => {
    const result = {
      recognizedText: 'I got it',
      accuracyScore: 88, pronScore: 70, completenessScore: 100, fluencyScore: 60,
      captureRms: 0.12,
      omissions: [], insertions: ['uh'],
      wordScores: [{ word: 'I', score: 90 }, { word: 'got', score: 85 }, { word: 'it', score: 88 }],
    };
    const s = buildDiagnosticSample(result, { expected: 'I got it', lang: 'en-US', mode: 'chain', ts: 111 });
    expect(s).toMatchObject({
      ts: 111, mode: 'chain', lang: 'en-US',
      expected: 'I got it', recognized: 'I got it',
      mock: false, accuracy: 88, pron: 70, completeness: 100, fluency: 60, rms: 0.12,
      omissions: [], insertions: ['uh'],
    });
    expect(s.words).toEqual([{ w: 'I', s: 90 }, { w: 'got', s: 85 }, { w: 'it', s: 88 }]);
  });

  it('mockFallback 결과도 기록 가능하게 형성한다 (mock=true, reason 보존)', () => {
    const s = buildDiagnosticSample(
      { mockFallback: true, fallbackReason: 'no_match' },
      { expected: 'hello', mode: 'repeat', ts: 1 },
    );
    expect(s.mock).toBe(true);
    expect(s.reason).toBe('no_match');
    expect(s.recognized).toBe('');
    expect(s.omissions).toBeNull(); // 따라말하기(repeat)엔 omissions 없음
  });

  it('누락 필드는 null/기본값으로 안전 처리한다', () => {
    const s = buildDiagnosticSample(null, {});
    expect(s.recognized).toBe('');
    expect(s.words).toEqual([]);
    expect(s.accuracy).toBeNull();
    expect(s.mode).toBe('repeat');
  });
});

describe('recordDiagnostic (게이트·링버퍼)', () => {
  it('게이트 OFF면 기록하지 않는다', () => {
    const storage = fakeStorage();
    const ok = recordDiagnostic({ x: 1 }, { storage, win: {} });
    expect(ok).toBe(false);
    expect(getDiagnostics(storage)).toEqual([]);
  });

  it('게이트 ON(window.__SPEECH_DIAG)이면 기록한다', () => {
    const storage = fakeStorage();
    const ok = recordDiagnostic({ x: 1 }, { storage, win: { __SPEECH_DIAG: true } });
    expect(ok).toBe(true);
    expect(getDiagnostics(storage)).toEqual([{ x: 1 }]);
  });

  it('게이트 ON(localStorage 플래그)이면 기록한다', () => {
    const storage = fakeStorage();
    storage.setItem('study.speechDiag.on', '1');
    const ok = recordDiagnostic({ x: 2 }, { storage, win: {} });
    expect(ok).toBe(true);
    expect(getDiagnostics(storage)).toEqual([{ x: 2 }]);
  });

  it('링버퍼는 최근 100건만 유지한다', () => {
    const storage = fakeStorage();
    storage.setItem('study.speechDiag.on', '1');
    for (let i = 0; i < 105; i++) recordDiagnostic({ i }, { storage, win: {} });
    const arr = getDiagnostics(storage);
    expect(arr.length).toBe(100);
    expect(arr[0]).toEqual({ i: 5 });   // 앞 5건 밀려남
    expect(arr[99]).toEqual({ i: 104 });
  });

  it('clearDiagnostics 는 비운다', () => {
    const storage = fakeStorage();
    storage.setItem('study.speechDiag.on', '1');
    recordDiagnostic({ x: 1 }, { storage, win: {} });
    clearDiagnostics(storage);
    expect(getDiagnostics(storage)).toEqual([]);
  });
});
