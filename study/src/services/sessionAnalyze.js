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

// 마이크 시작·채점 상한 (2026-08-22). speech.js 의 getUserMedia / audioWorklet.addModule /
// Azure fetch 어디에도 시간 제한이 없어, 조용히 멈춘 요청 하나가 세션 화면을 '녹음 중' 상태로
// 영구히 가둔다 (다시 눌러도 호출부 finishRecording 이 recCtrl=null 로 즉시 return).
// 반환 모양은 기존 계약 그대로라 호출부 6곳은 손대지 않아도 복구·안내된다.
const START_TIMEOUT_MS = 15_000;   // 권한 프롬프트를 사람이 눌러 답할 시간까지 포함
const ANALYZE_TIMEOUT_MS = 25_000; // 429 백오프 최악(2s+5s) + 3회 시도 ≈16s 위 여유
const TIMED_OUT = Symbol('timeout');

/** ms 안에 안 끝나면 TIMED_OUT 으로 resolve. 거부는 그대로 전파 (기존 에러 매핑 보존). */
function withTimeout(promise, ms) {
  let t;
  const timer = new Promise((resolve) => { t = setTimeout(() => resolve(TIMED_OUT), ms); });
  return Promise.race([promise.finally(() => clearTimeout(t)), timer]);
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
  /* 재생 중이면 먼저 끊는다 (2026-08-29) — TTS 재생 구간의 마이크 입력은 채점에서 빠지므로
   * (speech.js: 재생음이 그대로 점수가 되던 구멍), 재생 중 녹음을 시작하면 발화가 통째로 버려진다.
   * 재생 중일 때만 부른다 — cancel 은 synthesizer 캐시를 비워 다음 듣기 지연을 만든다. */
  try { if (window.studySpeech.isTtsPlaying?.()) window.studySpeech.cancel?.(); } catch { /* noop */ }
  try {
    const controller = await withTimeout(window.studySpeech.recordWav({ maxSeconds: 15, ...opts }), START_TIMEOUT_MS);
    if (controller === TIMED_OUT) {
      console.warn('[sessionAnalyze] recordWav 응답 없음 — 타임아웃');
      return { error: 'timeout' };
    }
    return { controller };
  } catch (e) {
    console.warn('[sessionAnalyze] recordWav 실패', e?.message ?? e);
    return { error: e?.code === 'permission_denied' ? 'permission_denied' : 'unavailable' };
  }
}

export async function stopAndAnalyze(controller, expectedText, card, opts = {}) {
  const r = await withTimeout(_stopAndAnalyze(controller, expectedText, card, opts), ANALYZE_TIMEOUT_MS);
  if (r === TIMED_OUT) {
    console.warn('[sessionAnalyze] 채점 응답 없음 — 타임아웃');
    return mockResult('timeout');
  }
  return r;
}

async function _stopAndAnalyze(controller, expectedText, card, { enableMiscue = false } = {}) {
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
  // enableMiscue=true → 결과에 omissions/insertions (오발화 게이트 재료).
  // enableProsody 는 항상 켠다 (2026-08-29 감점제 1단계) — 라이브 실측: 켜도 기존 점수·게이트
  // 불변(acc 96↔96), en/ja 모두 동작. 억양·유창성 분포를 먼저 쌓아 감점 단가를 실측으로 보정한다.
  const opts = enableMiscue ? { lang, enableMiscue: true, enableProsody: true } : { lang, enableProsody: true };
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
