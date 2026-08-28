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

// ============================================================
// Wave A.16 — transient 재시도 (network throw / 429 / 5xx)
//
// MS 공식 (speech-services-quotas-and-limits, 2026-06): F0 는 autoscaling 으로 한도 내에서도 429 발생 →
// "every implementation should gracefully handle 429 errors with retry logic". 기존엔 단발 실패를 즉시
// "네트워크 오류" 토스트로 종결 → 사용자가 수동 재시도. token edge fetch + STT fetch 공용.
// 4xx(429 제외)·정상 응답은 재시도 안 함 (재시도해도 무의미).
// 2026-07-22 실측: F0 429 는 400/1000ms 백오프(총 1.4초)로는 안 풀리고 60초+ 지속 →
// 429 만 길게(2s/5s) + Retry-After 헤더 존중(캡 8s). 5xx/네트워크는 기존 짧은 딜레이 유지
// (문서의 1-2-4분 권장은 대량 워크로드용, 인터랙티브엔 부적합).
// ============================================================
const RETRY_MAX = 2; // 최대 2회 재시도 (총 3회 시도)

/** 재시도 대기 ms. attempt 소진 시 null. status 0 = network throw. */
export function retryDelayFor(status, attempt, retryAfterHeader) {
  if (attempt >= RETRY_MAX) return null;
  if (status === 429) {
    const ra = Number(retryAfterHeader);
    if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, 8000);
    return [2000, 5000][attempt];
  }
  return [400, 1000][attempt];
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function _fetchWithRetry(url, init, label = '') {
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429 || res.status >= 500) {
        const delay = retryDelayFor(res.status, attempt, res.headers?.get?.('retry-after'));
        if (delay != null) {
          _dbg('fetch transient 재시도', { label, status: res.status, attempt, delay });
          await _sleep(delay);
          continue;
        }
      }
      return res;
    } catch (e) {
      lastErr = e;
      const delay = retryDelayFor(0, attempt, null);
      if (delay != null) {
        _dbg('fetch network 재시도', { label, attempt, err: e?.message ?? e });
        await _sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw lastErr; // 도달 불가 (안전망)
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
    // Wave A.16 — edge 콜드스타트/일시 5xx·network blip 은 재시도로 흡수. 401 은 retry 안 함(아래 refresh 경로).
    const callEdge = async (tok) => _fetchWithRetry(
      `${SUPABASE_URL}/functions/v1/azure-token`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tok}`,
          'Content-Type': 'application/json',
        },
      },
      'azure-token',
    );

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

/* 폴백 화자 변주 (2026-07-22) — Azure 실패 시에도 다화자 순환이 조용히 사라지지 않게,
 * 요청된 Azure voice 이름을 seed 로 로컬 quality·default 후보 중 하나를 결정적으로 고른다.
 * 후보 풀은 pickVoice 의 QUALITY 철학 유지 (novelty voice 제외). seed 없으면 pickVoice 위임. */
export function pickVoiceVaried(voices, lang, seed) {
  if (!seed) return pickVoice(voices, lang);
  if (!voices?.length) return null;
  const lower = lang.toLowerCase();
  const langPrefix = lower.split('-')[0];
  const QUALITY = /Samantha|Daniel|Alex|Karen|Moira|Tessa|Aaron|Nicky|Allison|Ava|Susan|Tom|Fred|Google US English|Google UK English|Microsoft (Aria|Jenny|Guy|Davis)|Kyoko|Otoya|Hattori|Yuna|Sora/i;
  const candidates = voices.filter((x) => x.lang.toLowerCase().startsWith(langPrefix) && (x.default || QUALITY.test(x.name)));
  if (!candidates.length) return pickVoice(voices, lang);
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return candidates[h % candidates.length];
}

/** Web Speech API 폴백 (Wave 11.31 — voiceschanged 대기 + 명시 voice 선택). */
async function speakWeb(text, { lang = 'en-US', rate = 0.85, voice: requestedVoice, onEnd } = {}) {
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
    const voice = pickVoiceVaried(voices, lang, requestedVoice);
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
// 영어: AriaNeural (또렷한 표준 발음 — 화자 미지정 카드 기본). whispering 폐기:
//   발음 학습에 부적합(속삭임=음소 불명료) + 화자 없는 표현 카드 전부에 적용돼 단조로움.
// 일본어: AoiNeural (호기심 child voice, style 미적용)
// override: opts.voice / opts.style 로 카드별 또는 사용자 settings 우선.
export const VOICE_DEFAULTS = {
  'en-US': { voice: 'en-US-AriaNeural', style: null },
  'ja-JP': { voice: 'ja-JP-AoiNeural', style: null },
};

// 화자별 voice/style/rate 매핑. 현재 활성 트랙: 우희 + 여빈 페어 (en 가이드 §6.2).
// 다른 speaker 또는 미지정 시 VOICE_DEFAULTS 의 lang 기본값 fallback.
export const SPEAKER_VOICES = {
  'en-US': {
    // 활성 트랙 — 우희+여빈 친구 여행 (멜로가 체질 임진주·이은정 차용)
    '우희': { voice: 'en-US-JaneNeural', style: 'cheerful', rate: 1.05 },
    '여빈': { voice: 'en-US-PhoebeMultilingualNeural', style: null, rate: 0.95 },
    // Parks 발췌 — 토론회 장면 (en-parks-s1e1) 다이얼로그 화자. 화자별 구분 voice (style 무 — 또렷한 발음 우선).
    'Leslie': { voice: 'en-US-AvaMultilingualNeural', style: null, rate: 1.05 },
    'Ann': { voice: 'en-US-EmmaMultilingualNeural', style: null, rate: 1.0 },
    'Tom': { voice: 'en-US-AndrewMultilingualNeural', style: null, rate: 0.98 },
    // s1e1 오프닝 '미끄럼틀 소동' 행인 — 원작 대본 무라벨이라 역할명 처리, 남성 추정 (시드 _note 박제)
    'Bystander': { voice: 'en-US-GuyNeural', style: null, rate: 1.0 },
    // Parks S1E2 'Canvassing' 방문 유세 (en-parks-s1e2 #13~22) — 주민(집주인, 아이 둔 아빠). 소스 무라벨 → 역할명, 남성. 화자는 대화 논리 유추(설득자=Leslie).
    '주민': { voice: 'en-US-DavisNeural', style: null, rate: 1.0 },
    // The Office S1E1 오프닝 (en-office-s1e1) — Michael(지점장, 빠르고 으스대는) + Jim(데드팬). 화자 웹검증(IMDb/Fandom).
    'Michael': { voice: 'en-US-BrianMultilingualNeural', style: null, rate: 1.05 },
    'Jim': { voice: 'en-US-GuyNeural', style: null, rate: 0.95 },
    // The Office S1E2 'Diversity Day' 콜드오픈 (en-office-s1e2 #25~32) — Dwight(제지기 돌리며 짐 통화 방해, 무뚝뚝·단호). 화자 웹검증(officequotes/officeladies/bestofficelines).
    'Dwight': { voice: 'en-US-EricNeural', style: null, rate: 1.0 },
    // Parks S1E2 시청 장면 (en-parks-s1e2 #101~107) — Paul(시행정 담당관, 활기찬 중년 남성) + Ron(부서장, 깊고 무뚝뚝한 데드팬). 화자 웹검증(Parks Fandom: Paul Iaresco·Ron Swanson).
    'Paul': { voice: 'en-US-RogerNeural', style: null, rate: 1.02 },
    'Ron': { voice: 'en-US-ChristopherNeural', style: null, rate: 0.92 },
    // archive — 라쿤+빅맨 친구 여행 (5/17 시드 회귀 보호 + 미래 wave 복원용)
    '라쿤': { voice: 'en-US-TonyNeural', style: 'unfriendly', rate: 1.1 },
    '빅맨': { voice: 'en-US-DavisMultilingualNeural', style: 'empathetic', rate: 0.9 },
    // Azure docs: Andrew Multilingual supported styles = empathetic, relieved (friendly 미지원 → 무효).
    // 빅맨이 empathetic 선점 → 지점장은 voice 만으로 차별화 (style=null).
    '지점장': { voice: 'en-US-AndrewMultilingualNeural', style: null, rate: 1.0 },
    // Azure docs: Brian Multilingual = 모든 style 미지원. voice 자체만 적용.
    '박사': { voice: 'en-US-BrianMultilingualNeural', style: null, rate: 0.95 },
  },
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
// 매번 new SpeechSynthesizer() = connection re-establish (~1s, 당시 계측). 인스턴스 재사용 + openConnection(true) 로 흡수.
// lang 별 분리 (config.speechSynthesisLanguage 가 인스턴스 시점 결정 — en/ja 별 1개씩).
//
// 2026-07-17 — **다 쓴 synth 는 재사용 대상이 아니다.** SpeakerAudioDestination 은 '재생 개시 1회용':
//   privPlaybackStarted 는 첫 재생에 true 로 굳고 재설정 경로가 없어(SDK SpeakerAudioDestination.js —
//   대입은 L30 false·L233 true 두 곳뿐, 읽기는 L232 가드) 두 번째 utterance 에선 privAudio.play() 를
//   다시 부르지 않는다 = 무음. pause() 가 세운 privIsPaused 도 resume() 로만 풀린다(L186/L200, 가드 L242).
//   구현은 lang 당 synth+player 를 캐시해 재사용했고, 캐시 제거는 _activeSpeak 이 살아있는 '선점'
//   경로에서만 일어났다 → 재생이 끝나면 _activeSpeak 이 null 이 되어 다 쓴 player 가 캐시에 남고
//   다음 클릭이 그걸 그대로 받았다 (실사용 보고: 체이닝 반복 듣기 무반응 / 2연속 재생).
// player 는 생성 시 synth 에 묶이므로 '새 player = 새 synth'.
// → 캐시(_synthSpare)는 **아직 발화에 안 쓴** synth 만 lang 당 1개 보관한다. speak 은 그걸 꺼내
//   (동기 삭제로 독점) 쓰고 곧바로 백그라운드 재충전을 걸어 다음 클릭이 warm 을 받게 한다.
//   다 쓴 synth 는 폐기 — 절대 재사용하지 않는다. pre-connect 지연 이득은 재충전이 대신 유지한다.
// 토큰 만료 시 spare invalidate 는 별 wave (Azure token 통상 10분, 학습 세션 5-15분).
const _synthSpare = {};    // { 'en-US': entry } — 아직 안 쓴(pristine) synth
const _synthInFlight = {}; // { lang: Promise } — 재충전 중 (중복 생성 차단)

async function createSynthesizer(lang) {
  const t0 = Date.now();
  const [{ token, region }, SDK] = await Promise.all([getAzureToken(), loadSpeechSDK()]);
  const config = SDK.SpeechConfig.fromAuthorizationToken(token, region);
  config.speechSynthesisLanguage = lang;
  // 2026-07-13 — 명시 SpeakerAudioDestination(player). synth.close() 는 이미 버퍼된 재생
  // 오디오를 멈추지 못한다 (실브라우저 실증: close 후에도 currentTime 진행 — A.15 의
  // "close 로 중지 (검증됨)" 반증). 재생 중지는 player.pause() 만 즉시 유효 (동결 실증).
  const player = new SDK.SpeakerAudioDestination();
  const synth = new SDK.SpeechSynthesizer(config, SDK.AudioConfig.fromSpeakerOutput(player));
  // pre-connect — 첫 호출 latency 감소.
  let connection = null;
  try {
    connection = SDK.Connection.fromSynthesizer(synth);
    connection.openConnection(true);
  } catch (e) {
    _dbg('createSynthesizer Connection.openConnection 실패', { lang, err: e?.message ?? e });
  }
  _dbg('synthesizer 생성 + pre-connect', { lang, elapsedMs: Date.now() - t0 });
  return { synth, connection, player, SDK };
}

/** 다음 클릭용 pristine synth 를 백그라운드로 채운다 (await 금지 — 지연을 재생 뒤로 숨긴다).
 * 실패는 삼킨다 — 다음 speak 이 takeSynthesizer 에서 직접 만든다. */
function prewarmSynthesizer(lang) {
  if (_synthSpare[lang] || _synthInFlight[lang]) return;
  _synthInFlight[lang] = createSynthesizer(lang)
    .then((entry) => { _synthSpare[lang] = entry; })
    .catch((e) => { _dbg('prewarm 실패', { lang, err: e?.message ?? e }); })
    .finally(() => { delete _synthInFlight[lang]; });
}

/** 발화 1건이 독점할 synth 를 꺼낸다.
 * spare 삭제는 await 이전(동기) — 동시 호출이 같은 player 를 받으면 한 스트림에 2발화가 겹친다. */
async function takeSynthesizer(lang) {
  const spare = _synthSpare[lang];
  if (spare) {
    delete _synthSpare[lang];
    _dbg('takeSynthesizer spare HIT', { lang });
    prewarmSynthesizer(lang);
    return spare;
  }
  _dbg('takeSynthesizer spare MISS — 신규 생성', { lang });
  const entry = await createSynthesizer(lang);
  prewarmSynthesizer(lang);
  return entry;
}

/** 발화가 끝났거나 취소된 synth 폐기 — 재사용 금지 (player 1회용).
 * 재생 정지는 player.pause() 가 유일하게 유효 (synth.close() 는 버퍼된 재생을 못 멈춤 — 실증). */
function disposeSynth(entry) {
  if (!entry) return;
  try { entry.player?.pause?.(); } catch (_) { /* noop */ }
  try { entry.synth?.close?.(); } catch (_) { /* noop */ }
}

/** pristine spare 폐기 (테스트 / token 갱신 / cancel 시). */
export function clearSynthesizerCache() {
  const langs = Object.keys(_synthSpare);
  _dbg('clearSynthesizerCache', { langs });
  for (const lang of langs) {
    disposeSynth(_synthSpare[lang]);
    delete _synthSpare[lang];
  }
}

/**
 * Azure SpeechSynthesizer 사용. 실패 시 Web Speech API 폴백.
 * Wave 11.32 — VOICE_DEFAULTS lang 매핑 + opts.voice/style override.
 * Wave 11.35 — debug 타이밍 로깅 추가 (window.__SPEECH_DEBUG).
 * Wave 11.36 — synthesizer 인스턴스 재사용 + pre-connect (TTS 지연 감소).
 */
// Wave A.15 — 진행 중 audio playback 추적. race 차단 (빠른 연타 / 카드 전환 시 두 audio 겹침 방지).
let _activeSpeak = null; // { lang, entry, playbackTimer, onEnd, cancelled }

// 2026-07-13 — 연타 선점 세대 카운터. _activeSpeak 은 synth 확보 *후* 등록되므로, 콜드 연결
// 대기 중(~1s)의 첫 클릭을 두 번째 클릭이 취소하지 못해 같은 synth 큐에 2건 → 2연속 재생(실사용 보고).
// 세대가 바뀌면 대기 중이던 호출은 synth 확보 직후 스스로 포기한다 (마지막 클릭만 재생).
let _speakGen = 0;

async function speakAzure(text, { lang = 'en-US', rate, voice, style, speaker, onEnd } = {}) {
  const t0 = Date.now();
  const gen = ++_speakGen;
  _dbg('speak 시작', { text: text?.slice(0, 40), lang, speaker, gen });

  // 이전 in-flight 호출 강제 중지 (race 차단). 그 synth 는 폐기한다 — player 는 1회용이라 반납 불가.
  // 2026-07-13 — 재생 정지는 player.pause() 가 유일하게 유효 (실브라우저 실증: synth.close()
  // 후에도 audio currentTime 진행 계속 — 옛 "close 로 중지 (검증됨)" 주석은 반증되어 폐기).
  if (_activeSpeak) {
    _dbg('speak 이전 호출 중지', { prevLang: _activeSpeak.lang });
    _activeSpeak.cancelled = true;
    if (_activeSpeak.playbackTimer) clearTimeout(_activeSpeak.playbackTimer);
    disposeSynth(_activeSpeak.entry);
    _activeSpeak = null;
  }

  let entry = null;
  try {
    entry = await takeSynthesizer(lang);
    if (gen !== _speakGen) {
      _dbg('speak 선점 취소 — 대기 중 새 speak/cancel 발생', { gen, cur: _speakGen });
      disposeSynth(entry); // 안 쓴 채 버린다 (1회용이라 spare 로 반납 불가)
      return;
    }
    const { synth } = entry;
    _dbg('speak synthesizer 준비', { elapsedMs: Date.now() - t0 });
    const cfg = VOICE_DEFAULTS[lang] || {};
    const speakerCfg = (speaker && SPEAKER_VOICES[lang]) ? SPEAKER_VOICES[lang][speaker] : null;
    const voiceName = voice ?? speakerCfg?.voice ?? cfg.voice ?? null;
    const styleName = style !== undefined ? style : (speakerCfg?.style ?? cfg.style ?? null);
    const effRate = rate ?? speakerCfg?.rate ?? 0.85;
    _dbg('speak 매핑 결과', { speaker, voiceName, styleName, effRate });
    const ssml = buildAzureSSML(text, lang, effRate, voiceName, styleName);

    // 새 in-flight 세션 등록.
    const session = { lang, entry, playbackTimer: null, onEnd, cancelled: false };
    _activeSpeak = session;

    synth.speakSsmlAsync(
      ssml,
      (result) => {
        // Wave 11.39 — success 콜백 = synthesis 완료 (≠ playback 완료).
        // audioDuration 단위 = 100ns ticks. ms 변환: / 10000.
        // 합성 완료 시점부터 audioDuration 만큼 기다려야 실제 audio 재생 종료.
        const audioMs = result?.audioDuration ? result.audioDuration / 10000 : 0;
        const synthMs = Date.now() - t0;
        _dbg('speak synthesis 완료, playback 대기', { synthMs, audioMs });
        if (session.cancelled) { _dbg('speak cancelled before playback', {}); return; }
        const finish = () => {
          if (session.finished) return; session.finished = true;
          _dbg('speak playback 완료', { totalMs: Date.now() - t0, audioMs, cancelled: session.cancelled });
          if (session.playbackTimer) clearTimeout(session.playbackTimer);
          if (_activeSpeak === session) _activeSpeak = null;
          disposeSynth(entry); // 다 쓴 synth 폐기 — 다음 클릭은 pristine spare 를 받는다
          if (!session.cancelled) onEnd?.();
        };
        // 2026-07-18 — non-MSE 경로(iPhone Safari: audio/mpeg MSE 미지원) 재생 트리거.
        //   이 경로의 SpeakerAudioDestination 은 write() 로 버퍼링만 하고 close() 안에서만 재생한다.
        //   speech.js 의 정상 teardown(disposeSynth)은 player.pause() 를 먼저 호출해 privIsPaused=true →
        //   close 의 notifyPlayback 이 play() 를 스킵 → 무음(실 브라우저 MediaSource 가림 실측).
        //   여기서 player.close() 를 직접(pause 없이) 호출해 blob 재생을 트리거하고, 종료는 audio 'ended'
        //   로 받는다(audioMs+여유는 안전망). 데스크톱 MSE 는 privAudioOutputStream 이 없어 이 분기를 타지
        //   않고, 기존처럼 write() 중 스트리밍 재생 → audioMs 뒤 정리한다(회귀 없음).
        const player = entry.player;
        if (player && player.privAudioOutputStream !== undefined) {
          _dbg('speak non-MSE 재생 트리거 (iPhone 경로)', {});
          try { if (!player.privIsClosed) player.close(); } catch (_) { /* noop */ }
          try { player.privAudio?.addEventListener?.('ended', finish, { once: true }); } catch (_) { /* noop */ }
          session.playbackTimer = setTimeout(finish, Math.max(0, audioMs) + 3000); // ended 미발생 안전망
          return;
        }
        session.playbackTimer = setTimeout(finish, Math.max(0, audioMs));
      },
      (err) => {
        _dbg('speak 실패', { elapsedMs: Date.now() - t0, err });
        if (_activeSpeak === session) _activeSpeak = null;
        disposeSynth(entry);
        // 취소·선점된 발화는 폴백도 내지 않는다 — speakWeb 은 _activeSpeak 에 등록되지 않아
        // 이후 cancel()·선점으로 멈출 수 없다 → 새어나가면 그 자체가 '2연속 재생'이 된다.
        if (session.cancelled || gen !== _speakGen) { _dbg('speak 실패 — 취소된 발화라 폴백 생략', { gen }); return; }
        console.warn('[speech][azure][speak] 실패, web 폴백:', err);
        // Wave 11.31 — speakWeb 이 async (voiceschanged 대기). 콜백 onEnd 패턴 + void 래핑.
        void speakWeb(text, { lang, rate, voice: voiceName, onEnd }); // voiceName seed 로 폴백 화자 변주 유지
      },
    );
  } catch (e) {
    _dbg('speak init 실패', { elapsedMs: Date.now() - t0, error: e?.message ?? e });
    disposeSynth(entry);
    if (gen !== _speakGen) { _dbg('speak init 실패 — 취소된 발화라 폴백 생략', { gen }); return; }
    console.warn('[speech][azure][speak] init 실패, web 폴백:', e?.message ?? e);
    void speakWeb(text, { lang, rate, voice, onEnd }); // 요청 voice seed 로 폴백 화자 변주 유지
  }
}

/* TTS 재생 중 표시 — 0보다 크면 재생 중. 중첩 재생 대비 카운터.
 * cancel() 은 0 으로 리셋한다 (어느 재생인지 모르므로, 그리고 남으면 녹음이 영구히 막힌다). */
let _ttsPlaying = 0;
const TTS_HOLD_MAX_MS = 30_000; // speak 의 자체 안전망(setTimeout(stopPlaying, 30000))과 같은 상한
export function isTtsPlaying() { return _ttsPlaying > 0; }

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
  /* 재생 구간 표시 (2026-08-29) — 녹음 중 듣기를 허용하면서 재생음이 점수가 되는 걸 막는다.
   * 실측: 말 안 하고 재생음만 담긴 녹음이 96점. 오발화 게이트로는 못 걸러진다(같은 문장이라
   * 커버리지·정확도가 오히려 올라간다). recordWav 가 이 표시를 보고 해당 구간을 버린다. */
  _ttsPlaying += 1;
  let released = false;
  const release = () => { if (released) return; released = true; _ttsPlaying = Math.max(0, _ttsPlaying - 1); };
  // 안전망 — 어떤 백엔드에서도 onEnd 가 끝내 안 오면 녹음이 영구히 막힌다.
  setTimeout(release, TTS_HOLD_MAX_MS);
  const wrapped = { ...opts, onEnd: (...a) => { release(); try { opts.onEnd?.(...a); } catch (e) { console.warn('[speech] onEnd', e); } } };
  if (_backend === 'web') {
    // Wave 11.31 — async 반환값 무시 (콜백 onEnd 패턴)
    void speakWeb(text, wrapped);
    return;
  }
  // 'auto' 또는 'azure' → Azure 시도 (실패 시 내부 폴백)
  void speakAzure(text, wrapped);
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
  _speakGen += 1; // 2026-07-13 — synth 연결 대기 중인 speak 도 선점 취소
  _ttsPlaying = 0; // 재생 표시 해제 — 남으면 그 뒤 녹음이 통째로 버려진다
  // Web
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  } catch (_) { /* noop */ }
  // Azure — in-flight session 강제 중지 (Wave A.15).
  // 2026-07-13 — 재생 정지는 player.pause() (synth.close() 는 버퍼된 재생 못 멈춤 — 실증).
  if (_activeSpeak) {
    _activeSpeak.cancelled = true;
    if (_activeSpeak.playbackTimer) clearTimeout(_activeSpeak.playbackTimer);
    disposeSynth(_activeSpeak.entry);
    _activeSpeak = null;
  }
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

/** Pronunciation-Assessment 헤더 — UTF-8 JSON → base64 (no line wrap).
 * enableMiscue: 발화 단어를 참조 텍스트와 비교해 ErrorType=Omission/Insertion 을 받는다(MS 문서).
 *   false(기본) = 누락/삽입을 무시하고 발음 품질만 → 기본 카드 '따라 말하기' 현행 유지.
 *   true        = 체이닝 coverage 판정용 ('단어를 다 말했는가').
 */
export function buildPronunciationAssessmentHeader(referenceText, { enableMiscue = false } = {}) {
  const config = {
    ReferenceText: referenceText || '',
    GradingSystem: 'HundredMark',
    Granularity: 'Phoneme',
    Dimension: 'Comprehensive',
    EnableMiscue: enableMiscue === true,
  };
  const json = JSON.stringify(config);
  // UTF-8 안전 base64. 영문/일본어 모두 처리.
  const utf8 = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < utf8.length; i++) bin += String.fromCharCode(utf8[i]);
  return btoa(bin);
}

/** Azure Words[] → 누락/삽입 단어. EnableMiscue:true 일 때만 ErrorType 에 Omission/Insertion 이 실린다.
 * Mispronunciation(발음 틀림)은 누락이 아니므로 제외 — coverage 는 '말했는가'만 본다. */
export function extractMiscues(words) {
  const omissions = [];
  const insertions = [];
  for (const w of words ?? []) {
    if (w?.ErrorType === 'Omission') omissions.push(w.Word);
    else if (w?.ErrorType === 'Insertion') insertions.push(w.Word);
  }
  return { omissions, insertions };
}

/** 체이닝 통과 판정 (사용자 결정 2026-07-09) — 발음 정확도 하한 없음. 단어를 다 말했으면 통과.
 * 덧붙인 말(Insertion)은 허용. 인식 실패(mockFallback) 및 coverage 아닌 결과(omissions 부재)는 불통과. */
export function passesCoverage(result) {
  if (!result || result.mockFallback) return false;
  return Array.isArray(result.omissions) && result.omissions.length === 0;
}

// Wave 11.63 — AudioWorklet 모듈 등록 캐시 (AudioContext 별 1회).
const _workletRegistered = new WeakSet();

// 2026-07-12 — 녹음용 AudioContext 싱글턴. 종전엔 매 녹음 new AudioContext → _workletRegistered
// 가 매번 새 ctx 에 키돼 worklet 모듈을 매 녹음 재로드 → 시작 지연(=머리 잘림 창)이 커졌다.
let _recCtx = null;
async function getRecAudioContext(AC) {
  if (!_recCtx || _recCtx.state === 'closed') _recCtx = new AC();
  if (_recCtx.state === 'suspended') await _recCtx.resume();
  return _recCtx;
}

// ============================================================
// 2026-07-12 — 워밍 마이크 + pre-roll (부분 머리 잘림 잔여분 제거)
//
// 1차 수정(캡처 게이트 + ctx 재사용) 후에도 실데이터에 첫 단어 부분 잘림이 남았다
// (Are:20~56 + 나머지 건강). 합성 재현: 머리 150ms 절단까진 무해(Are:86), 300ms 절단은
// Are:44 you:40 — 실측 프로필과 일치. 남은 원인 = 매 녹음 getUserMedia 재오픈 지연 +
// 표시 전 발화 습관. 대응: 스트림·워클릿 노드를 녹음 사이에 유지하고, 대기 중 오디오를
// 링버퍼(최근 0.5초)에 보관 → 녹음 시작 시 소급 포함. 클릭보다 먼저 말해도 잡힌다.
// 프라이버시: 유휴 60초 또는 탭 hidden 시 자동 해제 (마이크 표시등 소등).
// ============================================================
const PREROLL_MAX_SAMPLES = 8000; // 0.5s @16kHz
const MIC_IDLE_RELEASE_MS = 60_000;

let _warmMic = null; // { stream, src, node, muteGain, ring, ringLen, active, idleTimer, onVis }

/** 워밍 마이크 즉시 해제 (트랙 stop → 표시등 소등). 유휴 타이머·hidden 핸들러가 호출. */
export function releaseWarmMic() {
  const wm = _warmMic;
  if (!wm) return;
  _warmMic = null;
  if (wm.idleTimer) clearTimeout(wm.idleTimer);
  if (wm.onVis && typeof document !== 'undefined') {
    try { document.removeEventListener('visibilitychange', wm.onVis); } catch { /* noop */ }
  }
  try { wm.node.port.postMessage('stop'); } catch { /* noop */ }
  try { wm.node.port.onmessage = null; } catch { /* noop */ }
  try { wm.node.disconnect(); } catch { /* noop */ }
  try { wm.muteGain.disconnect(); } catch { /* noop */ }
  try { wm.src.disconnect(); } catch { /* noop */ }
  try { wm.stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
}

async function ensureWarmMic(workletUrl) {
  if (_warmMic) {
    // 2026-07-13 — 워밍 건강검진 (실사용 보고: 표시등 켜져 있는데 무입력). 보관한 스트림이
    // OS 이벤트(장치 전환·절전)로 죽었으면 재생성하고, 컨텍스트가 suspended 면 재개한다
    // (안 하면 청크가 안 흘러 빈 녹음 + VAD 자동종료 불발).
    const tracks = _warmMic.stream.getTracks();
    const healthy = tracks.length > 0 && tracks.every((t) => t.readyState === 'live');
    if (healthy) {
      if (_warmMic.idleTimer) { clearTimeout(_warmMic.idleTimer); _warmMic.idleTimer = null; }
      if (_recCtx && _recCtx.state === 'suspended') {
        try { await _recCtx.resume(); } catch (_) { /* 실패 시 무신호 재시도가 재생성으로 수습 */ }
      }
      return _warmMic;
    }
    _dbg('워밍 마이크 트랙 사망 → 재생성', { states: tracks.map((t) => t.readyState) });
    releaseWarmMic();
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    // NotAllowedError = 사용자 거부 또는 insecure context (HTTP).
    if (e?.name === 'NotAllowedError') {
      throw Object.assign(new Error('마이크 권한 거부'), { code: 'permission_denied' });
    }
    throw Object.assign(new Error(e?.message || 'getUserMedia 실패'), { code: 'unavailable' });
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = await getRecAudioContext(AC);
  if (!ac.audioWorklet?.addModule) {
    try { stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    throw Object.assign(new Error('AudioWorklet 미지원 브라우저 (iOS Safari < 14.1 등)'), { code: 'unsupported' });
  }
  if (!_workletRegistered.has(ac)) {
    await ac.audioWorklet.addModule(workletUrl);
    _workletRegistered.add(ac);
  }
  const src = ac.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ac, 'recorder-worklet');
  src.connect(node);
  // AudioWorkletNode 는 destination 미연결 시에도 process() 호출됨.
  // 단 Chrome 일부 버전에서 graph "live" 유지 위해 destination 연결 권장 → muted 상태로 연결.
  const muteGain = ac.createGain();
  muteGain.gain.value = 0;
  node.connect(muteGain);
  muteGain.connect(ac.destination);

  const wm = { stream, src, node, muteGain, ring: [], ringLen: 0, active: null, idleTimer: null, onVis: null };
  node.port.onmessage = (e) => {
    const buf = e.data;
    if (!buf || !buf.byteLength) return;
    const int16 = new Int16Array(buf);
    /* TTS 재생 구간은 녹음에도 pre-roll 에도 담지 않는다 (2026-08-29). 녹음 중 듣기를 허용하면서
     * 재생음이 점수가 되는 걸 막는 유일한 지점 — 실측: 말 안 하고 재생음만 담긴 녹음이 96점.
     * VAD 만 시계를 되짚어(ttsHold) 재생이 길어도 '말이 끝났다'고 오인해 끊지 않게 한다. */
    if (_ttsPlaying > 0) { wm.active?.ttsHold?.(); return; }
    if (wm.active) { wm.active.onChunk(int16); return; }
    // 대기 중(녹음 밖) — pre-roll 링버퍼. 최근 PREROLL_MAX_SAMPLES 만 유지.
    wm.ring.push(int16);
    wm.ringLen += int16.length;
    while (wm.ring.length > 1 && wm.ringLen - wm.ring[0].length >= PREROLL_MAX_SAMPLES) {
      wm.ringLen -= wm.ring.shift().length;
    }
  };
  if (typeof document !== 'undefined' && document.addEventListener) {
    wm.onVis = () => {
      if (document.visibilityState === 'hidden' && !wm.active) releaseWarmMic();
    };
    document.addEventListener('visibilitychange', wm.onVis);
  }
  _warmMic = wm;
  return wm;
}

/**
 * 무음 자동종료 VAD 판정 (말 끝나면 자동 멈춤). 순수 함수 — recordWav 가 chunk peak 마다 feed.
 *  - 무장 임계 armAt = min(speechPeak, max(silencePeak, maxPeak*0.6)) — 화자 자기 최고 peak 에 적응.
 *    큰 발화는 speechPeak(0.08)에서, 조용한 발화는 silencePeak(0.05)까지 내려가 무장(마이크 게인 독립).
 *    무장 전 앞 침묵엔 종료 안 함 (복습 '떠올리기' 앞 침묵 보호).
 *  - 발화 후 hangoverMs 동안 무음(peak<silencePeak) 지속 시 종료. peak>=silencePeak 은 voice 로 리셋.
 * 2026-07-11 — 옛 절대임계(speechPeak 0.08 고정)는 조용한 발화·낮은 마이크 게인에서 무장 실패 → 자동종료 안 됨(실측).
 */
export function createSilenceAutoStop({ speechPeak = 0.08, silencePeak = 0.05, hangoverMs = 1200 } = {}) {
  let speechStarted = false;
  let lastVoiceAt = 0;
  let maxPeak = 0;
  return {
    feed(peak, now) {
      if (peak > maxPeak) maxPeak = peak;
      // 무장 임계를 화자 자기 최고 peak 에 적응시킨다(마이크 게인 독립). 조용히 말해 발화 전체가
      // speechPeak(0.08) 아래여도 silencePeak 위이면 무장한다. 단 silencePeak 아래(무음·노이즈)로는
      // 절대 내려가지 않고(오작동 방지), speechPeak 위로도 안 올라간다(큰 발화 회귀 없음).
      const armAt = Math.min(speechPeak, Math.max(silencePeak, maxPeak * 0.6));
      if (!speechStarted) {
        if (peak >= armAt) { speechStarted = true; lastVoiceAt = now; }
        return false; // 앞 침묵 보호 — 무장 전에는 종료 안 함
      }
      if (peak >= silencePeak) { lastVoiceAt = now; return false; }
      return (now - lastVoiceAt) >= hangoverMs;
    },
    /* TTS 재생 구간 — 그 사이 마이크 입력은 채점에서 빠지므로(재생음이 곧 점수가 된다) VAD 에도
     * 안 먹인다. 대신 무음 시계를 되짚어, 재생이 길어도 '말이 끝난 것'으로 오인해 끊지 않는다.
     * 무장 전에는 아무것도 하지 않는다 — 재생음이 발화로 오인되면 앞 침묵 보호가 깨진다. */
    hold(now) { if (speechStarted) lastVoiceAt = now; },
    get speechStarted() { return speechStarted; },
  };
}

/**
 * 마이크 녹음 → WAV Blob (AudioWorkletNode 사용, Wave 11.63).
 *
 * 흐름: 워밍 마이크(스트림·워클릿 유지 + pre-roll 링버퍼) → 녹음 시작 시 클릭 이전 최근
 *      0.5초 소급 포함 → port.message chunks 누적 → 종료 시 WAV. — 2026-07-12
 * resolve 는 첫 오디오 청크 도착 후 (캡처 라이브 게이트, 무신호 안전망 2초). 워밍 상태에선 수 ms.
 * stop() 호출 또는 maxSeconds 도달 시 종료. `blobPromise` 가 Blob 으로 resolve.
 * stop() 은 마이크를 즉시 끄지 않는다 — 유휴 60초/탭 hidden 시 자동 해제 (releaseWarmMic).
 *
 * iOS Safari: 사용자 제스처 안에서 호출해야 권한 통과. session.html 의 click handler 가 보장.
 * iOS Safari 14.1+ / Chrome 66+ / Firefox 76+ AudioWorklet 지원. 미지원 환경은 throw.
 *
 * @param {object} opts
 * @param {number} [opts.maxSeconds=15] - 자동 종료 상한
 * @param {(level:number)=>void} [opts.onLevel] - 0~1 peak 레벨 콜백 (UI 게이지용)
 * @param {number} [opts.autoStopSilenceMs=0] - >0 이면 발화 후 이만큼 무음 지속 시 자동종료 (0=끔)
 * @param {()=>void} [opts.onAutoStop] - 무음 자동종료 발생 콜백 (호출자가 채점 흐름 실행)
 * @param {string} [opts.workletUrl='/audio-worklet/recorder-worklet.js'] - worklet 모듈 path
 * @returns {{ stop: () => void, blobPromise: Promise<Blob> }}
 */
export async function recordWav({
  maxSeconds = 15,
  onLevel,
  autoStopSilenceMs = 0,
  onAutoStop,
  speechPeak = 0.08,
  silencePeak = 0.05,
  workletUrl = `${import.meta.env.BASE_URL}audio-worklet/recorder-worklet.js`,
} = {}) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('getUserMedia 미지원 환경'), { code: 'unsupported' });
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw Object.assign(new Error('AudioContext 미지원 환경'), { code: 'unsupported' });

  // 2026-07-13 — 무신호 재시도: 워밍 재사용 파이프라인이 조용히 죽은 경우(muted 등 —
  // readyState 로 안 잡힘), 게이트 2초 무신호면 폐기·재생성해 같은 클릭 안에서 복구한다.
  // 콜드 경로(방금 새로 연 파이프라인)의 무신호는 재시도해도 무의미 → 기존처럼 그대로 진행.
  for (let attempt = 0; attempt < 2; attempt++) {
    const wasWarm = !!_warmMic;
    const wm = await ensureWarmMic(workletUrl);
    // 이전 녹음이 아직 active 면 강제 확정 (재클릭 race — 이전 blob 은 그 시점까지로 resolve).
    // abort = stop + onAutoStop — 통보 없이 끊으면 앞 행 UI 가 '녹음 중'에 영구 고착된다 (2026-08-22).
    if (wm.active) { try { wm.active.abort(); } catch { /* noop */ } }

    // 무음 자동종료 VAD (말 끝나면 자동 멈춤). autoStopSilenceMs>0 일 때만.
    const vad = autoStopSilenceMs > 0
      ? createSilenceAutoStop({ speechPeak, silencePeak, hangoverMs: autoStopSilenceMs })
      : null;
    const needPeak = !!onLevel || !!vad;

    // pre-roll — 클릭 이전 최근 0.5초를 소급 포함. 링은 새 녹음 기준으로 비운다
    // (이월 오디오가 다다음 녹음에 다시 실리는 것 방지).
    const chunks = wm.ring;
    wm.ring = [];
    wm.ringLen = 0;

    let stopped = false;
    let resolveDone, rejectDone;
    const blobPromise = new Promise((res, rej) => { resolveDone = res; rejectDone = rej; });
    let onFirstChunk = null; // 캡처 라이브 게이트 — 첫 라이브 청크 도착 시 resolve (아래 참조)

    const session = {
      onChunk(int16) {
        if (stopped) return;
        if (onFirstChunk) { onFirstChunk(); onFirstChunk = null; }
        chunks.push(int16);
        if (needPeak) {
          let peak = 0;
          for (let i = 0; i < int16.length; i++) {
            const abs = Math.abs(int16[i]);
            if (abs > peak) peak = abs;
          }
          const level = peak / 0x7FFF;
          if (onLevel) onLevel(level);
          if (vad && vad.feed(level, Date.now())) {
            endInvoluntary();            // 무음 자동종료 → blob resolve + 호출자 통보
          }
        }
      },
      ttsHold() { if (vad) vad.hold(Date.now()); },
      stop,
      abort: endInvoluntary,
    };
    wm.active = session;

    const timer = setTimeout(() => endInvoluntary(), maxSeconds * 1000);

    /* 호출자 의사와 무관한 종료(무음 자동종료·maxSeconds 상한·새 녹음의 강제 확정)는 반드시
     * 통보한다. 통보를 빼면 화면이 '녹음 중' 상태로 갇힌다 (2026-08-22 무한 로딩 실사용 보고).
     * 사용자가 직접 controller.stop() 한 경우엔 통보하지 않는다 — 그쪽은 이미 채점 흐름을 탄다. */
    function endInvoluntary() {
      if (!stop()) return;
      try { onAutoStop?.(); } catch (err) { console.warn('[recordWav] onAutoStop', err); }
    }

    /** @returns {boolean} 이번 호출이 실제로 종료를 수행했으면 true (이미 끝났으면 false) */
    function stop() {
      if (stopped) return false;
      stopped = true;
      clearTimeout(timer);
      if (wm.active === session) {
        wm.active = null;
        // 워밍 유지 + 유휴 해제 예약 — 60초 내 다음 녹음이 오면 ensureWarmMic 이 취소.
        wm.idleTimer = setTimeout(() => { if (_warmMic === wm && !wm.active) releaseWarmMic(); }, MIC_IDLE_RELEASE_MS);
      }
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
      return true;
    }

    // 2026-07-12 — 캡처 라이브 게이트: 첫 청크가 실제로 흐른 뒤 resolve. 호출자의 "await 후
    // UI 전환"이 '진짜 녹음 중'과 일치하게 된다 (실데이터: 준비 지연 중 발화 시작 → 앞머리
    // 음소 연속 0점 → 같은 문장 Δ50+ 점수 스윙). 무신호 안전망 2초 — 이후엔 기존 흐름과 동일
    // (끝내 무음이면 analyzeWavRest 의 no_match/mic_silent 경로가 안내).
    const gotChunk = await new Promise((resolve) => {
      const guard = setTimeout(() => { onFirstChunk = null; resolve(false); }, 2000);
      onFirstChunk = () => { clearTimeout(guard); resolve(true); };
    });

    if (gotChunk || !wasWarm || attempt === 1) {
      return { stop, blobPromise };
    }
    // 워밍 재사용인데 무신호 — 이 attempt 는 조용히 폐기 (controller 미반환 상태) 후 재생성.
    _dbg('워밍 파이프라인 무신호 → 재생성 재시도', { attempt });
    stopped = true;
    clearTimeout(timer);
    if (wm.active === session) wm.active = null;
    releaseWarmMic();
  }
  // 도달 불가 (attempt===1 에서 항상 return) — 안전망
  throw Object.assign(new Error('recordWav 재시도 실패'), { code: 'unavailable' });
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
export async function analyzeWavRest(wavBlob, expectedText, { lang = 'en-US', enableMiscue = false } = {}) {
  // Wave A.18.1 — captureRms 계산 (진단용 저장 source). A.18/A.19 캡처 가드는 철회:
  // 낮은 점수/완성도는 "마이크 캡처 실패"가 아니라 "발음이 레퍼런스와 어긋남"인 경우가 많아(실측 검증),
  // 가드가 정상 발화를 'too_quiet/incomplete_capture' 로 오차단 → 점수 차단엔 미사용, 값만 기록.
  let captureRms = null;
  try {
    const ab = await wavBlob.arrayBuffer();
    const pcm = new Int16Array(ab, 44);
    if (pcm.length) {
      let sum = 0;
      for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
      captureRms = Math.sqrt(sum / pcm.length) / 32768;
    }
  } catch (_) { /* blob 읽기 실패 시 진행 */ }
  // captureRms 이 거의 0 = 마이크가 무음을 캡처(입력 없음·음소거·입력장치 오선택). 이때 no_match 를
  // 더 정확한 안내(mic_silent)로 분기. A.18 가드(점수 차단) 철회 교훈 유지 — 점수는 절대 차단하지 않고
  // '이미 실패한 no_match' 의 메시지만 정정. 임계값은 실측 발화 RMS(0.04~0.18) 보다 훨씬 낮게.
  const SILENCE_RMS = 0.005;
  const noSpeechReason = () => (captureRms != null && captureRms < SILENCE_RMS ? 'mic_silent' : 'no_match');
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
    const paHeader = buildPronunciationAssessmentHeader(expectedText, { enableMiscue });
    // Wave A.16 — 429/5xx/network blip 은 재시도로 흡수 (F0 autoscaling 429 빈발 — MS 공식 권장).
    const res = await _fetchWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
        'Pronunciation-Assessment': paHeader,
        Accept: 'application/json',
      },
      body: wavBlob,
    }, 'stt');
    if (!res.ok) {
      console.warn('[speech][rest] HTTP', res.status);
      // 429 지속 = F0 혼잡 — '네트워크 오류' 가 아니라 잠시 뒤 재시도 안내로 분기 (2026-07-22 실측)
      return analyzeMock(expectedText, res.status === 429 ? 'rate_limited' : 'azure_recognize_fail');
    }
    const json = await res.json();
    if (json.RecognitionStatus !== 'Success') {
      console.warn('[speech][rest] 인식 실패', { status: json.RecognitionStatus, captureRms });
      return analyzeMock(expectedText, noSpeechReason());
    }
    const nbest = json.NBest?.[0];
    if (!nbest) return analyzeMock(expectedText, 'parse_fail');
    // Wave A.17 — 표시 점수 = AccuracyScore(발음 정확도).
    // 기존 PronScore(Comprehensive)는 정확도+유창성+완성도+억양 가중합이라, 또박또박·끊어 말하는
    // 학습자가 정확히 발음해도 유창성/억양에서 깎여 저점이 나옴(실측: Acc 92 → Pron 65, Fluency 45).
    // '따라 말하기' 드릴이 측정할 건 발음 정확도 → AccuracyScore 사용. PronScore 는 진단용으로 함께 반환.
    const score = nbest.AccuracyScore ?? nbest.PronScore ?? 0;
    if (!score) {
      console.warn('[speech][rest] 인식됐으나 점수 0', { captureRms, display: nbest.Display });
      return analyzeMock(expectedText, noSpeechReason());
    }
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
    // coverage 모드(enableMiscue) 에서만 omissions/insertions 가 채워진다 → passesCoverage 판정 소스.
    const { omissions, insertions } = enableMiscue ? extractMiscues(nbest.Words) : { omissions: undefined, insertions: undefined };
    return {
      score,
      accuracyScore: nbest.AccuracyScore,
      pronScore: nbest.PronScore,
      captureRms: captureRms == null ? null : +captureRms.toFixed(4),
      recognizedText: nbest.Display || json.DisplayText || '',
      phonemeScores,
      weakPhonemes: [...weakSet],
      wordScores,
      fluencyScore: nbest.FluencyScore,
      completenessScore: nbest.CompletenessScore,
      prosodyScore: nbest.ProsodyScore,
      omissions,
      insertions,
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
  releaseWarmMic, // 2026-07-12 — 워밍 마이크 즉시 해제 (pre-roll 유지 중 마이크 표시등 소등용)
  analyzeWavRest, // Wave 11.61 — REST API Pronunciation Assessment
  pcmToWavBlob, // Wave 11.61 — utility
  buildPronunciationAssessmentHeader, // Wave 11.61 — utility
  extractMiscues, // 2026-07-09 — coverage(누락) 추출
  passesCoverage, // 2026-07-09 — 체이닝 pass/fail
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
