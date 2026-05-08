/**
 * sessionAnalyze.js — session 페이지의 record/analyze 흐름 헬퍼.
 *
 * Wave A.7.1 — 발음 평가 통합 1단계.
 *  - startMicRecording()           : window.studySpeech.recordWav 호출, 컨트롤러 반환 (실패 시 null)
 *  - stopAndAnalyze(ctrl, ref, card): 녹음 중지 + analyzeWavRest. studySpeech 부재·실패 시 mock 폴백
 *
 * lang 매핑: card.lang === 'ja' → 'ja-JP', 그 외 'en-US' (spec §9-6-1 default).
 * referenceText 는 normalizeReferenceText 로 punctuation 제거 (Azure mismatch 회피).
 */

import { normalizeReferenceText } from './speech.js';

export function pickAnalyzeLang(card) {
  return card?.lang === 'ja' ? 'ja-JP' : 'en-US';
}

function mockResult(reason) {
  return {
    score: 60 + Math.floor(Math.random() * 40),
    phonemeScores: [], wordScores: [], weakPhonemes: [],
    mockFallback: true, fallbackReason: reason,
  };
}

export async function startMicRecording() {
  if (typeof window === 'undefined' || !window.studySpeech?.recordWav) return null;
  try {
    return await window.studySpeech.recordWav({ maxSeconds: 15 });
  } catch (e) {
    console.warn('[sessionAnalyze] recordWav 실패', e?.message ?? e);
    return null;
  }
}

export async function stopAndAnalyze(controller, expectedText, card) {
  if (!controller) return mockResult('no_recorder');
  try { controller.stop(); } catch { /* noop */ }
  let blob;
  try { blob = await controller.blobPromise; }
  catch { return mockResult('record_fail'); }
  if (typeof window === 'undefined' || !window.studySpeech?.analyzeWavRest) {
    return mockResult('no_speech');
  }
  const ref = normalizeReferenceText(expectedText);
  const lang = pickAnalyzeLang(card);
  return window.studySpeech.analyzeWavRest(blob, ref, { lang });
}
