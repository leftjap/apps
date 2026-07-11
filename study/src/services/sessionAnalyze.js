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
import { buildDiagnosticSample, recordDiagnostic } from './speechDiag.js';

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

/**
 * 녹음 시작.
 * @returns {{ controller?: object, error?: 'permission_denied'|'unavailable' }}
 *   - 정상: { controller }
 *   - 권한 거부: { error: 'permission_denied' }
 *   - 그 외 (미지원·앱 미주입·throw): { error: 'unavailable' }
 */
export async function startMicRecording(opts = {}) {
  if (typeof window === 'undefined' || !window.studySpeech?.recordWav) {
    return { error: 'unavailable' };
  }
  try {
    const controller = await window.studySpeech.recordWav({ maxSeconds: 15, ...opts });
    return { controller };
  } catch (e) {
    console.warn('[sessionAnalyze] recordWav 실패', e?.message ?? e);
    return { error: e?.code === 'permission_denied' ? 'permission_denied' : 'unavailable' };
  }
}

export async function stopAndAnalyze(controller, expectedText, card, { enableMiscue = false } = {}) {
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
  // enableMiscue=true (체이닝) → 결과에 omissions/insertions 가 실린다 (passesCoverage 판정용).
  // 기본 경로는 인자를 건드리지 않는다 (기존 '따라 말하기' 계약 보존).
  const opts = enableMiscue ? { lang, enableMiscue: true } : { lang };
  const result = await window.studySpeech.analyzeWavRest(blob, ref, opts);
  // 무료 진단 로깅(게이트). window.__SPEECH_DIAG 또는 studySpeechDiag.enable() 시에만 로컬 수집.
  // OFF 면 recordDiagnostic 이 즉시 false 반환 → 판정 흐름·성능 무영향.
  try {
    recordDiagnostic(buildDiagnosticSample(result, {
      expected: ref, lang, mode: enableMiscue ? 'chain' : 'repeat', ts: Date.now(),
    }));
  } catch (_) { /* 진단 실패는 판정에 영향 없음 */ }
  return result;
}
