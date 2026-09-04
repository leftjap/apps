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

import { normalizeReferenceText, passesCoverage } from './speech.js';
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
  /* 토큰 선발급 (2026-08-29) — Azure 토큰 캐시(10분) 만료 상태로 채점하면 발급(실측 535ms)이
   * 채점 경로에 얹힌다. 말하는 동안 fire-and-forget 으로 받아 캐시를 채운다. 실패는 무시 —
   * 채점 시 정식 경로가 다시 시도하고, 캐시가 살아 있으면 즉시 반환이라 비용 0. */
  try { window.studySpeech.getAzureToken?.().catch(() => {}); } catch { /* noop */ }
  /* 투기적 선채점 (2026-08-29 오후, 사용자 결정) — 무음이 SPECULATE_SILENCE_MS 이어지면 그 시점의
   * 오디오로 채점을 미리 시작해 hangover(1.4초 — 2026-09-01 인하) 대기와 겹친다. 꼬리 무음 트림 덕에 선채점 오디오와
   * 확정 오디오는 트림 후 동일 → 결과 동등. 말이 재개되면 무효화하고 stopAndAnalyze 가 재채점한다.
   * F0 보호로 녹음당 최대 SPECULATE_MAX_FIRES 회. */
  const { speculate, ...rest } = opts;
  const recOpts = { maxSeconds: 15, ...rest };
  let specState = null;
  if (speculate?.expected && window.studySpeech?.analyzeWavRest) {
    specState = { promise: null, valid: false, fires: 0, ctrl: null };
    /* 조기 종결 대상 언어 — ja 는 omission 판정이 미실측이라(공백 무분절, coverageJudge 의 ja 가드 참조)
     * '전 단어 발화' 확인을 신뢰할 수 없다. en 만 조기 종결하고 ja 는 hangover 만으로 종결한다. */
    const earlyStop = pickAnalyzeLang(speculate.card) !== 'ja-JP';
    recOpts.speculateSilenceMs = SPECULATE_SILENCE_MS;
    recOpts.onSpeculate = (blob) => {
      // disarmed — 시작 타임아웃으로 버려진 녹음의 VAD 가 유령 Azure 호출을 발사하지 못하게 (2026-08-30 감사)
      if (specState.disarmed || specState.fires >= SPECULATE_MAX_FIRES) return;
      specState.fires += 1;
      specState.valid = true;
      /* 요청 겹침 금지 (2026-09-04 폰 실측: 이 키는 STT 요청이 겹치면 429 → 2초 백오프) — 발사마다 중단기를 두고
       * 재발사·말 재개(무효화)·확정 채점 직전에 이전 요청을 끊는다. 한 번에 진행 중인 채점 요청은 하나뿐이다. */
      specState.abortReq?.();
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      specState.abortReq = ac ? () => { try { ac.abort(); } catch { /* noop */ } } : null;
      // 실패 무효화에도 promise 동일성 검사 — 낡은 발사의 늦은 실패가 새 발사를 무장 해제하면
      // 멀쩡한 선채점 결과가 버려져 재채점된다 (2026-09-01 리뷰 지적).
      const p = analyzeBlob(blob, speculate.expected, speculate.card, { enableMiscue: true, signal: ac?.signal ?? null })
        .catch(() => { if (specState.promise === p) specState.valid = false; return null; });
      specState.promise = p;
      /* 조기 종결 (2026-09-01, 사용자 결정 "채점 시간은 최대한 짧게") — 결과가 '전 단어 발화'
       * (omissions 0)로 확인되면 남은 hangover 를 기다리지 않고 abort(비자발 종료 통보)로 즉시
       * 종결한다. 실측 RTT 0.5~0.8초(2026-09-01 koreacentral·Wi-Fi) 기준 발화 끝 → 점수 ~1.0~1.3초.
       * 문장 중간 쉼엔 걸리지 않는다 — 부분 발화 실측 3종(2026-09-01, 2/4·3/4·4/7 단어)에서 Azure 가
       * 미발화 단어를 전부 omission 으로 표시했고 전사도 말한 부분까지만 나왔다(레퍼런스 견인 없음).
       * promise 동일성 검사 — 무효화 후 재발사 시, 이전 발사의 늦은 결과(낡은 스냅샷)로 종결하지 않는다. */
      p.then((r) => {
        if (specState.promise !== p || !specState.valid || specState.disarmed) return;
        if (earlyStop && passesCoverage(r)) { try { specState.ctrl?.abort?.(); } catch { /* noop */ } }
      });
    };
    recOpts.onSpeculateInvalid = () => { specState.valid = false; specState.abortReq?.(); };
  }
  try {
    const controller = await withTimeout(window.studySpeech.recordWav(recOpts), START_TIMEOUT_MS);
    if (controller === TIMED_OUT) {
      console.warn('[sessionAnalyze] recordWav 응답 없음 — 타임아웃');
      // 버려진 recordWav 세션이 살아 있어도 선채점은 무장 해제 — 결과를 받을 곳이 없다 (2026-08-30 감사)
      if (specState) { specState.disarmed = true; specState.valid = false; specState.abortReq?.(); }
      return { error: 'timeout' };
    }
    if (controller && specState) { controller._speculative = specState; specState.ctrl = controller; }
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

/* 채점 호출의 단일 조립점 — 정상 경로(_stopAndAnalyze)와 투기적 선채점이 같은 정규화·옵션을 쓴다. */
const SPECULATE_SILENCE_MS = 500; // 2026-09-01 조기 종결 도입에 맞춰 0.7→0.5 — 발화 끝 → 점수가 0.5s + RTT(실측 0.5~0.8s)
const SPECULATE_MAX_FIRES = 3;
const SPECULATE_WAIT_MS = 3000; // 선채점 결과 대기 상한 — 초과 시 버리고 확정 채점 (예산 잠식 방지)
async function analyzeBlob(blob, expectedText, card, { enableMiscue = false, signal = null } = {}) {
  const ref = normalizeReferenceText(expectedText);
  const lang = pickAnalyzeLang(card);
  // enableMiscue=true → 결과에 omissions/insertions (오발화 게이트 재료).
  // enableProsody 는 항상 켠다 (2026-08-29 감점제 1단계) — 라이브 실측: 켜도 기존 점수·게이트
  // 불변(acc 96↔96), en/ja 모두 동작. 억양·유창성 분포를 먼저 쌓아 감점 단가를 실측으로 보정한다.
  const opts = enableMiscue ? { lang, enableMiscue: true, enableProsody: true } : { lang, enableProsody: true };
  if (signal) opts.signal = signal; // 선채점 전용 — 확정 채점 직전·무효화·재발사 때 끊는다 (요청 겹침 금지 2026-09-04)
  return window.studySpeech.analyzeWavRest(blob, ref, opts);
}

async function _stopAndAnalyze(controller, expectedText, card, { enableMiscue = false } = {}) {
  if (!controller) return mockResult('no_recorder');
  const stopAt = Date.now(); // 계측 (2026-09-03): 녹음 종료 시각 — 저장 시 sinceStopMs 의 기준
  try { controller.stop(); } catch { /* noop */ }
  let blob;
  try { blob = await controller.blobPromise; }
  catch { return mockResult('record_fail'); }
  const blobMs = Date.now() - stopAt;
  if (typeof window === 'undefined' || !window.studySpeech?.analyzeWavRest) {
    return mockResult('no_speech');
  }
  // 선채점 결과 — 말 재개로 무효화되지 않았고 옵션이 같으면(전 경로 enableMiscue:true) 그대로 쓴다.
  // 실패·mock 폴백이면 버리고 정상 경로로 재채점 — 안전망은 그대로다.
  // ⚠ 대기엔 독립 예산(SPECULATE_WAIT_MS)만 준다 (2026-08-30 감사) — 선채점이 스톨·지연 실패하면
  // 전체 25초 예산을 직렬로 잠식해, 복구 가능한 실패가 timeout 으로 악화되고 확정 채점이
  // 시도조차 안 됐다. 선채점은 stop 보다 ~0.9초 먼저 출발했으니 정상이면 이 안에 끝난다.
  const spec = controller._speculative;
  let result = null;
  let specUsed = false;
  let specWaitMs = 0;
  if (spec?.valid && spec.promise && enableMiscue === true) {
    const tSpec = Date.now();
    const r = await withTimeout(spec.promise, SPECULATE_WAIT_MS);
    specWaitMs = Date.now() - tSpec;
    if (r !== TIMED_OUT && r && !r.mockFallback) { result = r; specUsed = true; }
    else if (r === TIMED_OUT) spec.abortReq?.(); // 늦은 선채점은 끊고 확정 요청 — 두 요청이 겹치면 429 (2026-09-04)
  }
  if (!result) result = await analyzeBlob(blob, expectedText, card, { enableMiscue });
  /* 계측 (2026-09-03) — 구간별 소요를 결과에 싣는다. 아래층(analyzeWavRest)의 토큰·STT 계측은 보존하고
   * 녹음 종료 기준 시각·blob 대기·선채점 사용 여부·전체 소요·화면 숨김·온라인 여부를 더한다. */
  if (result && typeof result === 'object') {
    result.timing = {
      ...(result.timing || {}),
      stopAt, blobMs, specUsed, specWaitMs, totalMs: Date.now() - stopAt,
      hidden: (typeof document !== 'undefined' && typeof document.visibilityState === 'string') ? document.visibilityState === 'hidden' : null,
      online: (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') ? navigator.onLine : null,
    };
  }
  const ref = normalizeReferenceText(expectedText);
  const lang = pickAnalyzeLang(card);
  // 무료 진단 로깅(게이트). window.__SPEECH_DIAG 또는 studySpeechDiag.enable() 시에만 로컬 수집.
  // OFF 면 recordDiagnostic 이 즉시 false 반환 → 판정 흐름·성능 무영향.
  try {
    recordDiagnostic(buildDiagnosticSample(result, {
      expected: ref, lang, mode: enableMiscue ? 'chain' : 'repeat', ts: Date.now(),
    }));
  } catch (_) { /* 진단 실패는 판정에 영향 없음 */ }
  return result;
}
