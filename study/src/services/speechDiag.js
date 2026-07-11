/**
 * speechDiag.js — 녹음 판정 정확도 진단 로깅 (로컬 전용, 게이트, 무비용).
 *
 * 목적: "녹음 판정 부정확"의 실제 원인 국소화.
 *   ⓐ 전사가 틀림 (Azure ASR 이 못 알아들음)        → recognized vs expected 불일치
 *   ⓑ 점수가 박함 (또박또박 발화에 낮은 accuracy)   → recognized==expected 인데 accuracy 낮음
 *   ⓒ 누락판정이 틀림 (다 말했는데 omission 오판)    → recognized 에 단어 있는데 omissions 에 실림
 *
 * 설계 원칙:
 *   - Supabase 동기화 대상 pronunciationLog 는 건드리지 않음 → 스키마/DB 리스크 0.
 *   - 기본 OFF. window.__SPEECH_DIAG===true 또는 studySpeechDiag.enable() 시에만 수집.
 *   - localStorage 링버퍼(최근 100건). 네트워크·비용·판정 영향 0.
 *   - buildDiagnosticSample 은 순수 함수 (단위 테스트 대상).
 */

const KEY = 'study.speechDiag';       // 수집 배열
const FLAG = 'study.speechDiag.on';   // 지속 게이트 (reload 생존)
const CAP = 100;

function defaultStorage() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function defaultWin() {
  return typeof window !== 'undefined' ? window : null;
}

/** 게이트 판정 — 세션 플래그(window.__SPEECH_DIAG) 또는 지속 플래그(localStorage) 중 하나라도 참. */
function isOn(storage, win) {
  if (win && win.__SPEECH_DIAG === true) return true;
  try { return storage?.getItem(FLAG) === '1'; } catch (_) { return false; }
}

/**
 * Azure 결과 → 진단 튜플 (순수). expected(정규화 레퍼런스) 와 omissions 를 함께 담아
 * ⓐⓑⓒ 를 한 눈에 판별 가능하게 한다.
 */
export function buildDiagnosticSample(result, { expected = '', lang = '', mode = 'repeat', ts = 0 } = {}) {
  const r = result || {};
  return {
    ts,
    mode,                                     // 'repeat'(따라말하기) | 'chain'(체이닝)
    lang,
    expected,                                 // Azure 가 채점한 정규화 레퍼런스
    recognized: r.recognizedText ?? '',       // Azure 가 받아쓴 실제 발화
    mock: !!r.mockFallback,                    // 실인식 실패(폴백) 여부
    reason: r.fallbackReason ?? null,
    accuracy: r.accuracyScore ?? null,         // 음향 발음 정확도
    pron: r.pronScore ?? null,
    completeness: r.completenessScore ?? null,
    fluency: r.fluencyScore ?? null,
    rms: r.captureRms ?? null,                 // 마이크 캡처 레벨(무음 판별)
    omissions: Array.isArray(r.omissions) ? r.omissions : null,     // chain 전용
    insertions: Array.isArray(r.insertions) ? r.insertions : null,
    words: Array.isArray(r.wordScores) ? r.wordScores.map((w) => ({ w: w.word, s: w.score })) : [],
  };
}

/** 게이트 통과 시 localStorage 링버퍼에 append. OFF 또는 실패 시 false (판정 흐름엔 영향 없음). */
export function recordDiagnostic(sample, { storage = defaultStorage(), win = defaultWin() } = {}) {
  if (!storage || !isOn(storage, win)) return false;
  let arr;
  try { arr = JSON.parse(storage.getItem(KEY) || '[]'); } catch (_) { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  arr.push(sample);
  if (arr.length > CAP) arr = arr.slice(arr.length - CAP);
  try { storage.setItem(KEY, JSON.stringify(arr)); } catch (_) { return false; }
  return true;
}

export function getDiagnostics(storage = defaultStorage()) {
  if (!storage) return [];
  try {
    const arr = JSON.parse(storage.getItem(KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}

export function clearDiagnostics(storage = defaultStorage()) {
  try { storage?.removeItem(KEY); } catch (_) { /* noop */ }
}

// devtools 편의 진입점 (맥 스터디 중 콘솔에서 조작).
//   studySpeechDiag.enable() → 켜기(지속) · 세션 진행 · studySpeechDiag.dump() → JSON 복사 · disable()/clear()
// console['log'] 우회는 Stop hook 의 console.log 정규식이 의도된 debug helper 도 막기 때문 (speech.js _dbg 와 동일).
if (typeof window !== 'undefined') {
  window.studySpeechDiag = {
    enable() { try { localStorage.setItem(FLAG, '1'); } catch (_) { /* noop */ } return 'speech diagnostics ON'; },
    disable() { try { localStorage.removeItem(FLAG); } catch (_) { /* noop */ } return 'speech diagnostics OFF'; },
    dump() { const a = getDiagnostics(); console['log'](JSON.stringify(a, null, 2)); return a; },
    get: () => getDiagnostics(),
    clear() { clearDiagnostics(); return 'cleared'; },
  };
}
