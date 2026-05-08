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
