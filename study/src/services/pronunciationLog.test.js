import { describe, it, expect } from 'vitest';
import { buildPronunciationLog } from './pronunciationLog.js';

describe('buildPronunciationLog', () => {
  const baseResult = {
    score: 88,
    phonemeScores: [{ symbol: 'k', word: 'coffee', score: 95 }, { symbol: 'ɛ', word: 'use', score: 55 }],
    weakPhonemes: ['ɛ'],
    recognizedText: 'I could use a coffee',
  };

  it('정상 결과 → 모든 필드 매핑', () => {
    const log = buildPronunciationLog({ result: baseResult, sentenceId: 'card_1', lang: 'en', date: '2026-05-08' });
    expect(log).toMatchObject({
      lang: 'en', date: '2026-05-08', sentenceId: 'card_1',
      overallScore: 88,
      phonemeScores: baseResult.phonemeScores,
      weakPhonemes: ['ɛ'],
      recognizedText: 'I could use a coffee',
    });
    expect(typeof log.id).toBe('string');
    expect(log.id.length).toBeGreaterThan(0);
    expect(typeof log.createdAt).toBe('string');
  });

  it('하위점수 + 캡처레벨 저장 (진단용 — Wave A.18.1)', () => {
    const result = {
      score: 92, accuracyScore: 92, pronScore: 65.4, fluencyScore: 45,
      completenessScore: 80, prosodyScore: 60, captureRms: 0.0032,
      phonemeScores: [], weakPhonemes: [],
    };
    const log = buildPronunciationLog({ result, sentenceId: 'c', lang: 'en', date: '2026-06-19' });
    expect(log).toMatchObject({
      overallScore: 92,
      pronScore: 65.4,
      fluencyScore: 45,
      completenessScore: 80,
      prosodyScore: 60,
      captureRms: 0.0032,
    });
  });

  it('하위점수 누락 → null 폴백 (회귀 보호)', () => {
    const log = buildPronunciationLog({ result: baseResult, sentenceId: 'c', lang: 'en', date: '2026-05-08' });
    expect(log.pronScore).toBeNull();
    expect(log.fluencyScore).toBeNull();
    expect(log.captureRms).toBeNull();
  });

  it('mockFallback 결과 → null (저장 스킵)', () => {
    const mock = { score: 75, mockFallback: true, fallbackReason: 'no_recorder', phonemeScores: [], weakPhonemes: [] };
    expect(buildPronunciationLog({ result: mock, sentenceId: 'x', lang: 'en', date: '2026-05-08' })).toBeNull();
  });

  it('result null → null', () => {
    expect(buildPronunciationLog({ result: null, sentenceId: 'x', lang: 'en', date: '2026-05-08' })).toBeNull();
  });

  it('phonemeScores/weakPhonemes 누락 → 빈 배열 폴백', () => {
    const log = buildPronunciationLog({ result: { score: 70 }, sentenceId: 'x', lang: 'en', date: '2026-05-08' });
    expect(log.phonemeScores).toEqual([]);
    expect(log.weakPhonemes).toEqual([]);
    expect(log.recognizedText).toBeNull();
  });

  it('sentenceId 누락 → null', () => {
    const log = buildPronunciationLog({ result: baseResult, lang: 'en', date: '2026-05-08' });
    expect(log.sentenceId).toBeNull();
  });
});
