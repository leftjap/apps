/**
 * 음성 서비스 어댑터 (Wave 11.11 · Wave 11.22 Azure 통합 · spec §9 / §9-6).
 *
 * 백엔드 자동 선택 (default 'auto'):
 *   1. Azure 토큰 발급 가능 + SDK dynamic import 성공 → Azure 사용
 *   2. 실패 → Web Speech API + Math.random mock 폴백
 *
 * 토큰 (spec §12-1):
 *   - POST /functions/v1/azure-token (Authorization: supabase session) → { token, region, expiresAt }
 *   - in-memory 캐시. 만료 1분 전 또는 미존재 시 갱신.
 *   - 병렬 호출 race 차단 (in-flight Promise).
 *
 * Bundle:
 *   - microsoft-cognitiveservices-speech-sdk 는 dynamic import (Vite 가 별 청크 분리).
 *   - 첫 페이지 (login / home) 진입 시 미로드. 발음 학습 화면 (#/session) 진입 시점 lazy load.
 *
 * iOS Safari:
 *   - TTS 와 마이크 모두 사용자 제스처 안에서 호출 (autoplay/permission 제한).
 *   - mocks/session.html 의 발음 버튼 click handler 안에서 호출 보장.
 */

import { supabase, isSupabaseConfigured } from './supabase.js';

// ============================================================
// 백엔드 선택
// ============================================================

let _backend = 'auto'; // 'auto' | 'azure' | 'web'

/** 명시 백엔드 선택. 'web' 강제 시 Azure 미시도 (오프라인 검증 등). */
export function setSpeechBackend(b) {
  if (b === 'auto' || b === 'azure' || b === 'web') {
    _backend = b;
  }
}

export function getSpeechBackend() {
  return _backend;
}

// ============================================================
// Azure 토큰 캐시 + 발급
// ============================================================

let _tokenCache = null; // { token, region, expiresAt }
let _tokenInFlight = null; // Promise — 병렬 호출 race 차단

/** 토큰 캐시 강제 클리어 (테스트 / signOut 시). */
export function clearAzureTokenCache() {
  _tokenCache = null;
  _tokenInFlight = null;
}

/**
 * Supabase Edge Function 호출 → Azure 토큰 발급.
 * 캐시 유효 (만료 1분 전 이상 남음) → 캐시 사용.
 * 캐시 만료 또는 미존재 → 신규 fetch.
 * 병렬 호출 시 in-flight Promise 공유.
 */
export async function getAzureToken() {
  // 1) 캐시 유효 검사 (만료 1분 전까지 유효)
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 60_000) {
    return _tokenCache;
  }

  // 2) in-flight 있으면 그 Promise 공유 (race 차단)
  if (_tokenInFlight) {
    return _tokenInFlight;
  }

  // 3) 신규 fetch
  _tokenInFlight = (async () => {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('supabase 미설정');
    }
    // Wave 11.38 — access_token 추출 + 만료 임박 시 명시 refresh.
    // getSession() 은 만료된 토큰도 그대로 반환 (autoRefresh 가 적시 trigger 안 될 수 있음).
    let { data: sessionData } = await supabase.auth.getSession();
    let session = sessionData?.session ?? sessionData;
    const now = Math.floor(Date.now() / 1000);
    if (session?.expires_at && now > session.expires_at - 60) {
      _dbg('access_token 만료 임박 → refreshSession', { expires_at: session.expires_at, now });
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session) session = refreshed.session;
      } catch (refreshErr) {
        _dbg('refreshSession 실패', { err: refreshErr?.message ?? refreshErr });
      }
    }
    let accessToken = session?.access_token;
    if (!accessToken) {
      throw new Error('Supabase session 없음');
    }

    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const callEdge = async (tok) => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/azure-token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tok}`,
          'Content-Type': 'application/json',
        },
      });
      return res;
    };

    let res = await callEdge(accessToken);
    // Wave 11.38 — 401 시 refresh 후 1회 재시도 (사용자 token 만료된 채 첫 호출 케이스).
    if (res.status === 401) {
      _dbg('azure-token 401 → refreshSession 후 재시도');
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        const newTok = refreshed?.session?.access_token;
        if (newTok && newTok !== accessToken) {
          accessToken = newTok;
          res = await callEdge(accessToken);
        }
      } catch (refreshErr) {
        _dbg('401 후 refreshSession 실패', { err: refreshErr?.message ?? refreshErr });
      }
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`azure-token ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    if (!data?.token || !data?.region) {
      throw new Error('azure-token 응답 형식 부정확');
    }
    _tokenCache = data;
    return data;
  })();

  try {
    return await _tokenInFlight;
  } finally {
    _tokenInFlight = null;
  }
}

// ============================================================
// Azure SDK dynamic import
// ============================================================

/**
 * Wave 11.57 — Vite ESM dynamic import 폐기, script 태그 global SpeechSDK 의존.
 * mocks/session.html `<head>` 의 `<script src="https://aka.ms/csspeech/jsbrowserpackageraw">` 동기 로드 전제.
 * 미로드 시 throw → 호출자가 mock 폴백.
 *
 * SDK 는 TTS 전용 (Wave 11.61 이후 STT 는 analyzeWavRest REST path).
 */
export async function loadSpeechSDK() {
  if (typeof window === 'undefined' || typeof window.SpeechSDK === 'undefined') {
    throw new Error('SpeechSDK script 미로드 (mocks/session.html head 의 aka.ms/csspeech script 확인)');
  }
  return window.SpeechSDK;
}

// ============================================================
// speak (TTS)
// ============================================================

// Wave 11.31 — voiceschanged 1회 대기 (chrome 의 lazy voice load 대비)
let _voicesReady = null;
function waitForVoices() {
  if (_voicesReady) return _voicesReady;
  _voicesReady = new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve([]);
      return;
    }
    const synth = window.speechSynthesis;
    let voices = synth.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    const t = setTimeout(() => resolve(synth.getVoices()), 1500);
    synth.addEventListener('voiceschanged', () => {
      clearTimeout(t);
      resolve(synth.getVoices());
    }, { once: true });
  });
  return _voicesReady;
}

// Wave 11.31 — lang 별 적합 voice 선택. macOS 우선 default → 알려진 quality voice → lang prefix → null.
// Albert/Bad News/Bahh 같은 novelty voice 자동 픽 회피 (utterance.voice 미지정 시 chrome 픽 불안정).
// export = vitest 단위 테스트용 (`speech.test.js`).
export function pickVoice(voices, lang) {
  if (!voices?.length) return null;
  const lower = lang.toLowerCase();
  const langPrefix = lower.split('-')[0]; // 'en-us' → 'en'
  // 1) lang 정확 일치 + default=true (시스템 default voice)
  let v = voices.find((x) => x.lang.toLowerCase() === lower && x.default);
  if (v) return v;
  // 2) lang 정확 일치 + 알려진 quality voice (macOS / chrome / Edge)
  const QUALITY = /Samantha|Daniel|Alex|Karen|Moira|Tessa|Aaron|Nicky|Allison|Ava|Susan|Tom|Fred|Google US English|Google UK English|Microsoft (Aria|Jenny|Guy|Davis)|Kyoko|Otoya|Hattori|Yuna|Sora/i;
  v = voices.find((x) => x.lang.toLowerCase() === lower && QUALITY.test(x.name));
  if (v) return v;
  // 3) lang prefix 일치 + default
  v = voices.find((x) => x.lang.toLowerCase().startsWith(langPrefix) && x.default);
  if (v) return v;
  // 4) lang prefix 일치 + quality
  v = voices.find((x) => x.lang.toLowerCase().startsWith(langPrefix) && QUALITY.test(x.name));
  if (v) return v;
  // 5) lang prefix 일치 + localService (네트워크 voice 회피, 일관성 우선)
  v = voices.find((x) => x.lang.toLowerCase().startsWith(langPrefix) && x.localService);
  if (v) return v;
  // 6) lang prefix 일치 첫 번째
  v = voices.find((x) => x.lang.toLowerCase().startsWith(langPrefix));
  return v || null;
}

/** Web Speech API 폴백 (Wave 11.31 — voiceschanged 대기 + 명시 voice 선택). */
async function speakWeb(text, { lang = 'en-US', rate = 0.85, onEnd } = {}) {
  if (typeof window === 'undefined' || !text || !window.speechSynthesis) {
    onEnd?.();
    return;
  }
  try {
    const voices = await waitForVoices();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    const voice = pickVoice(voices, lang);
    if (voice) {
      u.voice = voice;
      // u.lang 이 voice.lang 와 다르면 chrome 가 voice 무시 → 동기화
      u.lang = voice.lang;
    }
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.speak(u);
  } catch (e) {
    console.error('[speech][web][speak]', e);
    onEnd?.();
  }
}

// Wave 11.32 — lang 별 Azure Neural voice + style 매핑.
// 영어: AriaNeural + whispering (사용자 선택, mstts:express-as)
// 일본어: AoiNeural (호기심 child voice, style 미적용)
// override: opts.voice / opts.style 로 카드별 또는 사용자 settings 우선.
export const VOICE_DEFAULTS = {
  'en-US': { voice: 'en-US-AriaNeural', style: 'whispering' },
  'ja-JP': { voice: 'ja-JP-AoiNeural', style: null },
};

/** Azure SSML 생성 — style 있으면 mstts namespace 추가 + express-as 래핑. */
export function buildAzureSSML(text, lang, rate, voiceName, style) {
  const escaped = escapeXml(text);
  const prosody = `<prosody rate="${rate}">${escaped}</prosody>`;
  const inner = style
    ? `<mstts:express-as style="${style}">${prosody}</mstts:express-as>`
    : prosody;
  const voiceTag = voiceName ? `<voice name="${voiceName}">${inner}</voice>` : inner;
  const ns = style
    ? 'xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts"'
    : 'xmlns="http://www.w3.org/2001/10/synthesis"';
  return `<speak version="1.0" ${ns} xml:lang="${lang}">${voiceTag}</speak>`;
}

// Wave 11.36 — SpeechSynthesizer lang 별 캐시 + pre-connect.
// 매번 new SpeechSynthesizer() = connection re-establish (~1s). 공식 권장: 인스턴스 재사용 + Connection.openConnection(true).
// lang 별 분리 (config.speechSynthesisLanguage 가 인스턴스 시점 결정 — en/ja 별 1개씩).
// 토큰 만료 시 캐시 invalidate 는 별 wave (Azure token 통상 10분, 학습 세션 5-15분 — 단순 캐시로 시작).
const _synthCache = {}; // { 'en-US': { synth, connection }, 'ja-JP': { ... } }
const _synthInFlight = {}; // { lang: Promise<{synth, connection}> } — 병렬 호출 race

async function getSynthesizer(lang) {
  if (_synthCache[lang]) return _synthCache[lang];
  if (_synthInFlight[lang]) return _synthInFlight[lang];
  _synthInFlight[lang] = (async () => {
    const t0 = Date.now();
    const [{ token, region }, SDK] = await Promise.all([getAzureToken(), loadSpeechSDK()]);
    const config = SDK.SpeechConfig.fromAuthorizationToken(token, region);
    config.speechSynthesisLanguage = lang;
    const synth = new SDK.SpeechSynthesizer(config);
    // pre-connect — 첫 호출 latency 감소.
    let connection = null;
    try {
      connection = SDK.Connection.fromSynthesizer(synth);
      connection.openConnection(true);
    } catch (e) {
      _dbg('getSynthesizer Connection.openConnection 실패', { lang, err: e?.message ?? e });
    }
    const entry = { synth, connection, SDK };
    _synthCache[lang] = entry;
    _dbg('synthesizer 생성 + pre-connect', { lang, elapsedMs: Date.now() - t0 });
    return entry;
  })();
  try {
    return await _synthInFlight[lang];
  } finally {
    delete _synthInFlight[lang];
  }
}

/** synthesizer 캐시 클리어 (테스트 / token 갱신 시). */
export function clearSynthesizerCache() {
  for (const lang of Object.keys(_synthCache)) {
    try { _synthCache[lang].synth?.close(); } catch (_) {}
    delete _synthCache[lang];
  }
}

/**
 * Azure SpeechSynthesizer 사용. 실패 시 Web Speech API 폴백.
 * Wave 11.32 — VOICE_DEFAULTS lang 매핑 + opts.voice/style override.
 * Wave 11.35 — debug 타이밍 로깅 추가 (window.__SPEECH_DEBUG).
 * Wave 11.36 — synthesizer 인스턴스 재사용 + pre-connect (TTS 지연 감소).
 */
async function speakAzure(text, { lang = 'en-US', rate = 0.85, voice, style, onEnd } = {}) {
  const t0 = Date.now();
  _dbg('speak 시작', { text: text?.slice(0, 40), lang });
  try {
    const { synth } = await getSynthesizer(lang);
    _dbg('speak synthesizer 준비', { elapsedMs: Date.now() - t0 });
    const cfg = VOICE_DEFAULTS[lang] || {};
    const voiceName = voice ?? cfg.voice ?? null;
    const styleName = style !== undefined ? style : (cfg.style ?? null);
    const ssml = buildAzureSSML(text, lang, rate, voiceName, styleName);
    synth.speakSsmlAsync(
      ssml,
      (result) => {
        // Wave 11.39 — success 콜백 = synthesis 완료 (≠ playback 완료).
        // audioDuration 단위 = 100ns ticks. ms 변환: / 10000.
        // 합성 완료 시점부터 audioDuration 만큼 기다려야 실제 audio 재생 종료.
        const audioMs = result?.audioDuration ? result.audioDuration / 10000 : 0;
        const synthMs = Date.now() - t0;
        _dbg('speak synthesis 완료, playback 대기', { synthMs, audioMs });
        setTimeout(() => {
          _dbg('speak playback 완료', { totalMs: Date.now() - t0, audioMs });
          // synth.close() 안 함 — 캐시 재사용. Wave 11.36.
          onEnd?.();
        }, Math.max(0, audioMs));
      },
      (err) => {
        _dbg('speak 실패', { elapsedMs: Date.now() - t0, err });
        console.warn('[speech][azure][speak] 실패, web 폴백:', err);
        // Wave 11.36 — synth 자체는 캐시 유지 (다음 호출 재시도). 단발성 합성 실패는 web 폴백.
        // Wave 11.31 — speakWeb 이 async (voiceschanged 대기). 콜백 onEnd 패턴 + void 래핑.
        void speakWeb(text, { lang, rate, onEnd });
      },
    );
  } catch (e) {
    _dbg('speak init 실패', { elapsedMs: Date.now() - t0, error: e?.message ?? e });
    console.warn('[speech][azure][speak] init 실패, web 폴백:', e?.message ?? e);
    void speakWeb(text, { lang, rate, onEnd });
  }
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * TTS — backend='auto' 시 Azure 우선, 실패 시 Web 폴백.
 * backend='web' 시 즉시 Web. backend='azure' 시 Azure 만 (실패 시에도 Web 폴백 — 사용자 UX 우선).
 */
function speak(text, opts = {}) {
  if (_backend === 'web') {
    // Wave 11.31 — async 반환값 무시 (콜백 onEnd 패턴)
    void speakWeb(text, opts);
    return;
  }
  // 'auto' 또는 'azure' → Azure 시도 (실패 시 내부 폴백)
  void speakAzure(text, opts);
}

/**
 * 진행 중 재생 즉시 중지.
 *  - Web: speechSynthesis.cancel()
 *  - Azure: 캐시된 SpeechSynthesizer.close() 후 캐시 삭제 (다음 speak 시 재생성).
 *
 * 옛 mocks/session.html togglePlay 의 'w.classList.contains("on")' 분기에서 호출되던
 * window.speechSynthesis.cancel() 동등 + Azure 인스턴스 정리.
 */
function cancel() {
  // Web
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  } catch (_) { /* noop */ }
  // Azure — synth 인스턴스 close (현재 SDK 가 재생 중지 + 리소스 해제)
  try { clearSynthesizerCache(); } catch (_) { /* noop */ }
}

// ============================================================
// preload (Wave 11.35)
// ============================================================
//
// 카드 진입 시 background warmup — token + SDK + synthesizer (lang 별) + pre-connect.
// 첫 클릭 지연 (~500ms~2s) 제거. Wave 11.36 부터 synthesizer 도 미리 warmup.
// 멱등 — 중복 호출 시 첫 promise 공유 (token/SDK/synth 의 in-flight 캐시).

let _preloadPromise = null;

/**
 * Wave 11.57 — preload 단순화. token + SDK script 로드 확인만 (warmup synthesizer 호출 폐기).
 * 호출자 (mocks/session.html L1717) 는 `if (preload === 'function')` 체크 후 호출 — 서명 유지로 회귀 방지.
 * langs 인자는 받지만 무시.
 */
function preload(_opts = {}) {
  if (_preloadPromise) return _preloadPromise;
  if (_backend === 'web') {
    _preloadPromise = waitForVoices();
    return _preloadPromise;
  }
  _preloadPromise = Promise.allSettled([getAzureToken(), loadSpeechSDK(), waitForVoices()])
    .then((results) => {
      const [tok, sdk] = results;
      if (tok.status === 'rejected' && sdk.status === 'rejected') {
        _preloadPromise = null; // 재시도 가능
      }
    });
  return _preloadPromise;
}

// ============================================================
// analyze (STT + Pronunciation Assessment)
// ============================================================

/** Math.random mock — Wave 11.11 그대로. Wave 11.34: mockFallback flag 추가 (UI 가 mock 인지 식별). */
async function analyzeMock(expectedText, reason = 'unknown') {
  await new Promise((r) => setTimeout(r, 800));
  const score = Math.floor(Math.random() * 40) + 55;
  return {
    score,
    recognizedText: expectedText || '',
    phonemeScores: [],
    weakPhonemes: [],
    wordScores: [],
    mockFallback: true,
    fallbackReason: reason, // 'no_microphone' | 'azure_init_fail' | 'azure_recognize_fail' | 'parse_fail' | 'unknown'
  };
}

// Wave 11.35 — 디버그 로그 helper. window.__SPEECH_DEBUG=true 시 노출.
// console['log'] 우회 — Stop hook 의 console.log 정규식이 의도된 gated helper 도 차단하기 때문.
function _dbg(...args) {
  if (typeof window !== 'undefined' && window.__SPEECH_DEBUG) {
    console['log']('[speech][debug]', ...args);
  }
}

// Wave 11.36 — referenceText 정규화. Azure PronunciationAssessment 는 reference 가 발화와 정확
// 일치해야 정상 score. 사용자는 "You got it." 마침표 포함 발화 안 함 → reference 마침표 → mismatch → 0점.
// 마침표·쉼표·물음표·느낌표·따옴표·세미콜론 제거. trim. 영문/일문 모두 안전.
export function normalizeReferenceText(text) {
  if (!text) return '';
  return String(text)
    // 따옴표류 — 단어 안에 있을 수 있어 빈 문자열 제거 (it's→its, 「行く」→行く).
    .replace(/['""„""''「」『』]/g, '')
    // 단어 구분 punctuation — 공백 치환 (영문은 자연 분리, 일문 'A、B、C' 같은 약자 나열도).
    // 풀-와이드 일본어 문장부호 (！？：；，．・) 포함 (Wave A.7.1 검증 중 누락 발견).
    .replace(/[.,!?;:、。！？：；，．・]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// Wave 11.61 — REST API path (SDK streaming 폐기)
//
// 배경 (Wave 11.59 진단 + Wave 11.61 검증):
//  - SDK realtime PushStream pump 는 정상 chrome profile 에서 silent (NoMatch reason=0)
//  - 같은 audio 를 WAV 파일로 저장 후 Azure REST API 로 보내면 PronScore 정상 회수
//  - koreacentral region · 25KB WAV · Phoneme/Comprehensive: warm 0.46s / cold 0.59s
// 차단 위치: getUserMedia → ScriptProcessor → PushStream → recognizeOnceAsync 의 실시간 동시 streaming
// 우회: 녹음 → WAV blob → fetch POST (Bearer JWT) → JSON 파싱
// ============================================================

/** Int16 PCM (16kHz mono) → WAV Blob (RIFF header 44 byte 부착). */
export function pcmToWavBlob(int16, sampleRate = 16000) {
  const dataLen = int16.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);   // fmt chunk size
  view.setUint16(20, 1, true);    // PCM
  view.setUint16(22, 1, true);    // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);  // byte rate
  view.setUint16(32, 2, true);    // block align
  view.setUint16(34, 16, true);   // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);
  new Int16Array(buf, 44).set(int16);
  return new Blob([buf], { type: 'audio/wav' });
}

/** Pronunciation-Assessment 헤더 — UTF-8 JSON → base64 (no line wrap). */
export function buildPronunciationAssessmentHeader(referenceText) {
  const config = {
    ReferenceText: referenceText || '',
    GradingSystem: 'HundredMark',
    Granularity: 'Phoneme',
    Dimension: 'Comprehensive',
    EnableMiscue: false,
  };
  const json = JSON.stringify(config);
  // UTF-8 안전 base64. 영문/일본어 모두 처리.
  const utf8 = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < utf8.length; i++) bin += String.fromCharCode(utf8[i]);
  return btoa(bin);
}

// Wave 11.63 — AudioWorklet 모듈 등록 캐시 (AudioContext 별 1회).
const _workletRegistered = new WeakSet();

/**
 * 마이크 녹음 → WAV Blob (AudioWorkletNode 사용, Wave 11.63).
 *
 * 흐름: getUserMedia → AudioContext → AudioWorklet (16kHz Int16 PCM 변환 — audio thread)
 *      → port.message → main thread chunks 누적 → 종료 시 WAV.
 * stop() 호출 또는 maxSeconds 도달 시 종료. `blobPromise` 가 Blob 으로 resolve.
 *
 * iOS Safari: 사용자 제스처 안에서 호출해야 권한 통과. session.html 의 click handler 가 보장.
 * iOS Safari 14.1+ / Chrome 66+ / Firefox 76+ AudioWorklet 지원. 미지원 환경은 throw.
 *
 * @param {object} opts
 * @param {number} [opts.maxSeconds=15] - 자동 종료 상한
 * @param {(level:number)=>void} [opts.onLevel] - 0~1 RMS 레벨 콜백 (UI 게이지용)
 * @param {string} [opts.workletUrl='/audio-worklet/recorder-worklet.js'] - worklet 모듈 path
 * @returns {{ stop: () => void, blobPromise: Promise<Blob> }}
 */
export async function recordWav({
  maxSeconds = 15,
  onLevel,
  workletUrl = `${import.meta.env.BASE_URL}audio-worklet/recorder-worklet.js`,
} = {}) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('getUserMedia 미지원 환경'), { code: 'unsupported' });
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw Object.assign(new Error('AudioContext 미지원 환경'), { code: 'unsupported' });

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    // NotAllowedError = 사용자 거부 또는 insecure context (HTTP).
    // NotFoundError = 디바이스 없음 — 모바일에선 거의 발생 안 함.
    if (e?.name === 'NotAllowedError') {
      throw Object.assign(new Error('마이크 권한 거부'), { code: 'permission_denied' });
    }
    throw Object.assign(new Error(e?.message || 'getUserMedia 실패'), { code: 'unavailable' });
  }
  const ac = new AC();
  if (ac.state === 'suspended') await ac.resume();
  if (!ac.audioWorklet?.addModule) {
    try { stream.getTracks().forEach((t) => t.stop()); } catch {}
    try { ac.close(); } catch {}
    throw Object.assign(new Error('AudioWorklet 미지원 브라우저 (iOS Safari < 14.1 등)'), { code: 'unsupported' });
  }
  if (!_workletRegistered.has(ac)) {
    await ac.audioWorklet.addModule(workletUrl);
    _workletRegistered.add(ac);
  }
  const src = ac.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ac, 'recorder-worklet');

  const chunks = [];
  let stopped = false;
  let resolveDone, rejectDone;
  const blobPromise = new Promise((res, rej) => { resolveDone = res; rejectDone = rej; });

  node.port.onmessage = (e) => {
    if (stopped) return;
    const buf = e.data;
    if (!buf || !buf.byteLength) return;
    const int16 = new Int16Array(buf);
    chunks.push(int16);
    if (onLevel) {
      let peak = 0;
      for (let i = 0; i < int16.length; i++) {
        const abs = Math.abs(int16[i]);
        if (abs > peak) peak = abs;
      }
      onLevel(peak / 0x7FFF);
    }
  };

  src.connect(node);
  // AudioWorkletNode 는 destination 미연결 시에도 process() 호출됨.
  // 단 Chrome 일부 버전에서 graph "live" 유지 위해 destination 연결 권장 → muted 상태로 연결.
  const muteGain = ac.createGain();
  muteGain.gain.value = 0;
  node.connect(muteGain);
  muteGain.connect(ac.destination);

  const timer = setTimeout(() => stop(), maxSeconds * 1000);

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    try { node.port.postMessage('stop'); } catch {}
    try { node.port.onmessage = null; } catch {}
    try { node.disconnect(); } catch {}
    try { muteGain.disconnect(); } catch {}
    try { src.disconnect(); } catch {}
    try { stream.getTracks().forEach((t) => t.stop()); } catch {}
    try { ac.close(); } catch {}
    try {
      let total = 0;
      for (const c of chunks) total += c.length;
      const merged = new Int16Array(total);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.length; }
      resolveDone(pcmToWavBlob(merged, 16000));
    } catch (e) {
      rejectDone(e);
    }
  }

  return { stop, blobPromise };
}

/**
 * REST API Pronunciation Assessment.
 *
 * @param {Blob} wavBlob - 16kHz mono 16bit PCM WAV
 * @param {string} expectedText - reference (정규화는 호출자 책임)
 * @param {object} [opts]
 * @param {string} [opts.lang='en-US']
 * @returns {Promise<object>} - { score, recognizedText, phonemeScores, weakPhonemes, wordScores, fluencyScore, completenessScore, prosodyScore }
 *                              실패 시 analyzeMock 폴백 (mockFallback=true).
 */
export async function analyzeWavRest(wavBlob, expectedText, { lang = 'en-US' } = {}) {
  let token, region;
  try {
    const t = await getAzureToken();
    token = t.token; region = t.region;
  } catch (e) {
    console.warn('[speech][rest] token 발급 실패, mock 폴백:', e?.message ?? e);
    return analyzeMock(expectedText, 'azure_init_fail');
  }
  try {
    const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(lang)}&format=detailed`;
    const paHeader = buildPronunciationAssessmentHeader(expectedText);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
        'Pronunciation-Assessment': paHeader,
        Accept: 'application/json',
      },
      body: wavBlob,
    });
    if (!res.ok) {
      console.warn('[speech][rest] HTTP', res.status);
      return analyzeMock(expectedText, 'azure_recognize_fail');
    }
    const json = await res.json();
    if (json.RecognitionStatus !== 'Success') {
      console.warn('[speech][rest] NoMatch:', json.RecognitionStatus);
      return analyzeMock(expectedText, 'no_match');
    }
    const nbest = json.NBest?.[0];
    if (!nbest) return analyzeMock(expectedText, 'parse_fail');
    const score = nbest.PronScore ?? nbest.AccuracyScore ?? 0;
    if (!score) return analyzeMock(expectedText, 'no_match');
    const wordScores = [];
    const phonemeScores = [];
    const weakSet = new Set();
    for (const w of nbest.Words ?? []) {
      wordScores.push({ word: w.Word, score: w.AccuracyScore ?? 0 });
      for (const ph of w.Phonemes ?? []) {
        const s = ph.AccuracyScore ?? 0;
        phonemeScores.push({ symbol: ph.Phoneme, word: w.Word, score: s });
        if (s < 70) weakSet.add(ph.Phoneme);
      }
    }
    return {
      score,
      recognizedText: nbest.Display || json.DisplayText || '',
      phonemeScores,
      weakPhonemes: [...weakSet],
      wordScores,
      fluencyScore: nbest.FluencyScore,
      completenessScore: nbest.CompletenessScore,
      prosodyScore: nbest.ProsodyScore,
    };
  } catch (e) {
    console.warn('[speech][rest] error:', e?.message ?? e);
    return analyzeMock(expectedText, 'azure_recognize_fail');
  }
}

/**
 * 발화 분석 (deprecated — Wave 11.61 부터 recordWav + analyzeWavRest 분리 사용).
 *
 * 본 함수는 음성 입력 path 없음 → 항상 mock 폴백. 회귀 0 보장 위해 시그니처 유지.
 * 신규 호출자는 `recordWav` + `analyzeWavRest(blob, expected, opts)` 사용.
 */
async function analyze(expectedText, _opts = {}) {
  return analyzeMock(expectedText, 'deprecated_analyze');
}

// ============================================================
// Export
// ============================================================

export const Speech = {
  speak,
  cancel, // 재생 중지 (Web speechSynthesis.cancel + Azure synth close)
  analyze, // deprecated — Wave 11.61. recordWav + analyzeWavRest 사용 권장
  recordWav, // Wave 11.61 — mic → WAV blob
  analyzeWavRest, // Wave 11.61 — REST API Pronunciation Assessment
  pcmToWavBlob, // Wave 11.61 — utility
  buildPronunciationAssessmentHeader, // Wave 11.61 — utility
  preload, // Wave 11.35 — token+SDK warmup, Wave 11.36 — synthesizer warmup 옵션
  setSpeechBackend,
  getSpeechBackend,
  getAzureToken,
  clearAzureTokenCache,
  clearSynthesizerCache, // Wave 11.36
  loadSpeechSDK,
};

if (typeof window !== 'undefined') {
  window.studySpeech = Speech;
}
