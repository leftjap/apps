import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { pickVoice, buildAzureSSML, VOICE_DEFAULTS, SPEAKER_VOICES, normalizeReferenceText, createSilenceAutoStop } from './speech.js';

// Wave 11.22 — speech.js Azure adapter 단위 테스트
// vi.mock 의 hoisting 으로 import 전에 mock. fetch 는 globalThis 패치.

const FAKE_TOKEN = 'fake-azure-token-abc';
const FAKE_REGION = 'koreacentral';

let _fetchSpy;
let _supabaseSession;

beforeEach(async () => {
  vi.resetModules();
  _supabaseSession = { access_token: 'fake-supabase-jwt', user: { id: 'u1' } };
  // fetch mock — azure-token 응답
  _fetchSpy = vi.fn(async (url) => {
    if (String(url).includes('/functions/v1/azure-token')) {
      return new Response(
        JSON.stringify({ token: FAKE_TOKEN, region: FAKE_REGION, expiresAt: Date.now() + 9 * 60 * 1000 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('not found', { status: 404 });
  });
  globalThis.fetch = _fetchSpy;

  // supabase mock
  vi.doMock('../services/supabase.js', () => ({
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({ data: _supabaseSession })),
      },
      from: vi.fn(),
    },
    isSupabaseConfigured: true,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('speech — Wave 11.22 backend 선택', () => {
  it('default backend = auto', async () => {
    const { Speech } = await import('./speech.js');
    expect(Speech.getSpeechBackend()).toBe('auto');
  });

  it('setSpeechBackend("web") 후 getSpeechBackend === web', async () => {
    const { Speech } = await import('./speech.js');
    Speech.setSpeechBackend('web');
    expect(Speech.getSpeechBackend()).toBe('web');
    Speech.setSpeechBackend('auto'); // restore
  });

  it('setSpeechBackend 잘못된 값 무시', async () => {
    const { Speech } = await import('./speech.js');
    Speech.setSpeechBackend('invalid');
    expect(Speech.getSpeechBackend()).toBe('auto');
  });
});

describe('speech — Wave 11.22 getAzureToken', () => {
  it('첫 호출 시 fetch + 캐시 저장', async () => {
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    const result = await Speech.getAzureToken();
    expect(result.token).toBe(FAKE_TOKEN);
    expect(result.region).toBe(FAKE_REGION);
    expect(_fetchSpy).toHaveBeenCalledTimes(1);
    const fetchUrl = _fetchSpy.mock.calls[0][0];
    expect(String(fetchUrl)).toContain('/functions/v1/azure-token');
  });

  it('두 번째 호출 시 캐시 사용 (fetch 0)', async () => {
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    await Speech.getAzureToken(); // 첫 호출 — fetch 1
    _fetchSpy.mockClear();
    const result = await Speech.getAzureToken(); // 두 번째 — 캐시
    expect(result.token).toBe(FAKE_TOKEN);
    expect(_fetchSpy).toHaveBeenCalledTimes(0);
  });

  it('병렬 호출 시 in-flight Promise 공유 (fetch 1)', async () => {
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    const [r1, r2, r3] = await Promise.all([
      Speech.getAzureToken(),
      Speech.getAzureToken(),
      Speech.getAzureToken(),
    ]);
    expect(r1.token).toBe(FAKE_TOKEN);
    expect(r2.token).toBe(FAKE_TOKEN);
    expect(r3.token).toBe(FAKE_TOKEN);
    expect(_fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('supabase session 없을 때 throw', async () => {
    _supabaseSession = null;
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    await expect(Speech.getAzureToken()).rejects.toThrow(/session 없음/);
  });

  it('Edge Function 지속 500 시 재시도 소진 후 throw (Wave A.16)', async () => {
    // 일시적 500 은 재시도로 흡수 (별도 테스트). 지속 500 은 재시도 소진 후 throw.
    _fetchSpy.mockImplementation(async () =>
      new Response('internal error', { status: 500 }),
    );
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    await expect(Speech.getAzureToken()).rejects.toThrow(/azure-token 500/);
  });

  it('응답 형식 부정확 (token 없음) 시 throw', async () => {
    _fetchSpy.mockImplementationOnce(async () =>
      new Response(JSON.stringify({ region: 'x' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    await expect(Speech.getAzureToken()).rejects.toThrow(/응답 형식/);
  });
});

describe('speech — Wave 11.22 analyze 폴백', () => {
  it('backend=web 강제 시 SDK import 안 함 + mock 결과', async () => {
    // SDK mock — import 호출 추적
    const sdkImportSpy = vi.fn();
    vi.doMock('microsoft-cognitiveservices-speech-sdk', () => {
      sdkImportSpy();
      return {};
    });
    const { Speech } = await import('./speech.js');
    Speech.setSpeechBackend('web');
    const result = await Speech.analyze('hello');
    expect(result.score).toBeGreaterThanOrEqual(55);
    expect(result.score).toBeLessThanOrEqual(95);
    expect(result.recognizedText).toBe('hello');
    expect(Array.isArray(result.phonemeScores)).toBe(true);
    expect(sdkImportSpy).toHaveBeenCalledTimes(0);
    Speech.setSpeechBackend('auto'); // restore
  });

  it('backend=auto + Azure 토큰 fail → mock 폴백', async () => {
    _fetchSpy.mockImplementation(async () =>
      new Response('error', { status: 500 }),
    );
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    Speech.setSpeechBackend('auto');
    const result = await Speech.analyze('hello');
    expect(result.score).toBeGreaterThanOrEqual(55);
    expect(result.score).toBeLessThanOrEqual(95);
    expect(result.recognizedText).toBe('hello');
  });
});

describe('speech — Wave 11.22 인터페이스 노출', () => {
  it('Speech namespace 필수 메서드', async () => {
    const { Speech } = await import('./speech.js');
    expect(typeof Speech.speak).toBe('function');
    expect(typeof Speech.analyze).toBe('function');
    expect(typeof Speech.setSpeechBackend).toBe('function');
    expect(typeof Speech.getSpeechBackend).toBe('function');
    expect(typeof Speech.getAzureToken).toBe('function');
    expect(typeof Speech.clearAzureTokenCache).toBe('function');
    expect(typeof Speech.loadSpeechSDK).toBe('function');
  });

  it('Wave 11.35 — Speech.preload 노출', async () => {
    const { Speech } = await import('./speech.js');
    expect(typeof Speech.preload).toBe('function');
  });

  it('Wave 11.61 — recordWav / analyzeWavRest / pcmToWavBlob / buildPronunciationAssessmentHeader 노출', async () => {
    const { Speech } = await import('./speech.js');
    expect(typeof Speech.recordWav).toBe('function');
    expect(typeof Speech.analyzeWavRest).toBe('function');
    expect(typeof Speech.pcmToWavBlob).toBe('function');
    expect(typeof Speech.buildPronunciationAssessmentHeader).toBe('function');
  });
});

// Wave 11.61 — REST API path (SDK streaming 폐기 우회).
describe('speech — Wave 11.61 pcmToWavBlob', () => {
  it('RIFF/WAVE/fmt /data 헤더 + 16kHz mono 16bit PCM 정합', async () => {
    const { pcmToWavBlob } = await import('./speech.js');
    const samples = new Int16Array([0, 100, -100, 200, -200, 300]);
    const blob = pcmToWavBlob(samples, 16000);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + samples.length * 2);
    const ab = await blob.arrayBuffer();
    const view = new DataView(ab);
    const readStr = (off, len) => {
      let s = '';
      for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(off + i));
      return s;
    };
    expect(readStr(0, 4)).toBe('RIFF');
    expect(readStr(8, 4)).toBe('WAVE');
    expect(readStr(12, 4)).toBe('fmt ');
    expect(readStr(36, 4)).toBe('data');
    expect(view.getUint16(20, true)).toBe(1);   // PCM
    expect(view.getUint16(22, true)).toBe(1);   // mono
    expect(view.getUint32(24, true)).toBe(16000); // sample rate
    expect(view.getUint16(34, true)).toBe(16);  // bits per sample
    expect(view.getUint32(40, true)).toBe(samples.length * 2); // data length
    // PCM payload 회수
    const recovered = new Int16Array(ab, 44, samples.length);
    expect(Array.from(recovered)).toEqual(Array.from(samples));
  });
});

describe('speech — Wave 11.61 buildPronunciationAssessmentHeader', () => {
  it('base64(UTF-8 JSON) 디코드 시 ReferenceText/GradingSystem/Granularity/Dimension 일치', async () => {
    const { buildPronunciationAssessmentHeader } = await import('./speech.js');
    const b64 = buildPronunciationAssessmentHeader('You got it');
    expect(b64).not.toMatch(/[\r\n]/);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = JSON.parse(new TextDecoder().decode(bytes));
    expect(json.ReferenceText).toBe('You got it');
    expect(json.GradingSystem).toBe('HundredMark');
    expect(json.Granularity).toBe('Phoneme');
    expect(json.Dimension).toBe('Comprehensive');
    expect(json.EnableMiscue).toBe(false);
  });

  it('UTF-8 일본어 reference 정상 인코딩', async () => {
    const { buildPronunciationAssessmentHeader } = await import('./speech.js');
    const b64 = buildPronunciationAssessmentHeader('こんにちは');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = JSON.parse(new TextDecoder().decode(bytes));
    expect(json.ReferenceText).toBe('こんにちは');
  });
});

/* coverage 모드 — 체이닝 pass/fail (2026-07-09 사용자 결정 "단어를 다 말했는가만 본다").
 * 기본 카드 '따라 말하기'는 EnableMiscue:false + AccuracyScore 표시(현행 유지).
 * 체이닝은 EnableMiscue:true 로 Azure 가 반환하는 ErrorType=Omission 을 보고 통과/실패만 판정.
 * 근거: MS 문서 — EnableMiscue 는 발화 단어를 참조 텍스트와 비교해 Omission/Insertion 을 표시. */
describe('speech — coverage 모드(누락 감지)', () => {
  const decode = (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  };

  it('enableMiscue:true 면 EnableMiscue=true, 미지정이면 false (기존 동작 보존)', async () => {
    const { buildPronunciationAssessmentHeader } = await import('./speech.js');
    expect(decode(buildPronunciationAssessmentHeader("It's been a while")).EnableMiscue).toBe(false);
    expect(decode(buildPronunciationAssessmentHeader("It's been a while", { enableMiscue: true })).EnableMiscue).toBe(true);
  });

  it('extractMiscues — Words[].ErrorType 에서 누락/삽입 단어만 뽑는다', async () => {
    const { extractMiscues } = await import('./speech.js');
    const words = [
      { Word: "It's", ErrorType: 'None' },
      { Word: 'been', ErrorType: 'Omission' },
      { Word: 'a', ErrorType: 'None' },
      { Word: 'while', ErrorType: 'Mispronunciation' }, // 발음 틀림은 누락 아님
      { Word: 'um', ErrorType: 'Insertion' },
    ];
    expect(extractMiscues(words)).toEqual({ omissions: ['been'], insertions: ['um'] });
    expect(extractMiscues(undefined)).toEqual({ omissions: [], insertions: [] });
  });

  it('passesCoverage — 단어를 다 말했으면 발음이 나빠도 통과, 하나라도 빠뜨리면 실패', async () => {
    const { passesCoverage } = await import('./speech.js');
    expect(passesCoverage({ omissions: [], score: 41 })).toBe(true);           // 발음 41점이어도 통과
    expect(passesCoverage({ omissions: ['been'], score: 98 })).toBe(false);    // 98점이어도 누락이면 실패
    expect(passesCoverage({ omissions: [], insertions: ['um'] })).toBe(true);  // 덧붙인 말은 허용
    expect(passesCoverage({ mockFallback: true, omissions: [] })).toBe(false); // 인식 실패는 불통과
    expect(passesCoverage(null)).toBe(false);
    expect(passesCoverage({ score: 90 })).toBe(false);                         // omissions 부재(비-coverage)면 불통과
  });
});

describe('speech — Wave 11.61 analyzeWavRest', () => {
  // REST API 응답 fixture — 실 검증 (Wave 11.61) 에서 회수한 데이터 그대로
  const REST_FIXTURE = {
    RecognitionStatus: 'Success',
    Offset: 400000,
    Duration: 6100000,
    DisplayText: 'You got it.',
    NBest: [{
      Lexical: 'You got it',
      Display: 'You got it.',
      AccuracyScore: 95.0,
      FluencyScore: 100.0,
      CompletenessScore: 100.0,
      PronScore: 97.0,
      Words: [
        { Word: 'You', AccuracyScore: 100.0, ErrorType: 'None', Phonemes: [
          { Phoneme: 'y', AccuracyScore: 100.0 },
          { Phoneme: 'uw', AccuracyScore: 100.0 },
        ]},
        { Word: 'got', AccuracyScore: 97.0, ErrorType: 'None', Phonemes: [
          { Phoneme: 'g', AccuracyScore: 100.0 },
          { Phoneme: 'aa', AccuracyScore: 100.0 },
          { Phoneme: 't', AccuracyScore: 55.0 },
        ]},
        { Word: 'it', AccuracyScore: 88.0, ErrorType: 'None', Phonemes: [
          { Phoneme: 'ih', AccuracyScore: 76.0 },
          { Phoneme: 't', AccuracyScore: 44.0 },
        ]},
      ],
    }],
  };

  it('정상 응답 → score/wordScores/phonemeScores/weakPhonemes 파싱', async () => {
    const azureSttCalls = [];
    _fetchSpy.mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes('/functions/v1/azure-token')) {
        return new Response(
          JSON.stringify({ token: FAKE_TOKEN, region: FAKE_REGION, expiresAt: Date.now() + 9 * 60 * 1000 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (u.includes('.stt.speech.microsoft.com/')) {
        azureSttCalls.push({ url: u, headers: init?.headers });
        return new Response(JSON.stringify(REST_FIXTURE), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    const fakeBlob = new Blob([new ArrayBuffer(100)], { type: 'audio/wav' });
    const result = await Speech.analyzeWavRest(fakeBlob, 'You got it', { lang: 'en-US' });

    // STT 호출 검증
    expect(azureSttCalls.length).toBe(1);
    expect(azureSttCalls[0].url).toContain(`https://${FAKE_REGION}.stt.speech.microsoft.com/`);
    expect(azureSttCalls[0].url).toContain('language=en-US');
    expect(azureSttCalls[0].headers.Authorization).toBe(`Bearer ${FAKE_TOKEN}`);
    expect(azureSttCalls[0].headers['Pronunciation-Assessment']).toBeTruthy();

    // score = AccuracyScore (발음 정확도). PronScore(97) 아닌 AccuracyScore(95).
    expect(result.score).toBe(95);
    expect(result.accuracyScore).toBe(95);
    expect(result.pronScore).toBe(97);
    expect(result.recognizedText).toBe('You got it.');
    expect(result.fluencyScore).toBe(100);
    expect(result.completenessScore).toBe(100);
    expect(result.wordScores).toEqual([
      { word: 'You', score: 100 },
      { word: 'got', score: 97 },
      { word: 'it', score: 88 },
    ]);
    expect(result.phonemeScores.length).toBe(7);
    // 약점 음소 (<70) — got의 t (55), it의 t (44). ih=76 은 임계 통과. Set 이라 't' 1회.
    expect(result.weakPhonemes).toEqual(['t']);
    expect(result.mockFallback).toBeUndefined();
  });

  it('발음 점수 = AccuracyScore (유창성 끌림 분리) — 또박또박/끊어 말해도 정확하면 고득점', async () => {
    // 실측 재현(score_diag): 중간에 끊어 읽으면 Accuracy 92인데 PronScore 65로 추락 (Fluency 45).
    // 발음 연습 앱은 정확도가 점수여야 함 → PronScore(유창성·억양 가중) 대신 AccuracyScore.
    const FLU_DRAGGED = {
      RecognitionStatus: 'Success', DisplayText: 'Its more than a promise',
      NBest: [{
        Display: 'Its more than a promise', AccuracyScore: 92.0, FluencyScore: 45.0,
        CompletenessScore: 100.0, ProsodyScore: 60.0, PronScore: 65.4,
        Words: [{ Word: 'promise', AccuracyScore: 92.0, Phonemes: [{ Phoneme: 'p', AccuracyScore: 92.0 }] }],
      }],
    };
    _fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('/functions/v1/azure-token')) {
        return new Response(JSON.stringify({ token: FAKE_TOKEN, region: FAKE_REGION, expiresAt: Date.now() + 9 * 60 * 1000 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(FLU_DRAGGED), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    const result = await Speech.analyzeWavRest(new Blob([new ArrayBuffer(50)], { type: 'audio/wav' }), 'Its more than a promise');
    expect(result.score).toBe(92);        // AccuracyScore — PronScore(65.4) 아님
    expect(result.accuracyScore).toBe(92);
    expect(result.pronScore).toBe(65.4);
    expect(result.fluencyScore).toBe(45);
    expect(result.mockFallback).toBeUndefined();
  });

  // WAV blob 헬퍼 — amp(진폭) 으로 captureRms 제어. amp=0 → 무음(rms 0), amp 큼 → 발화 수준.
  const wavBlob = (amp, samples = 400) => {
    const buf = new ArrayBuffer(44 + samples * 2);
    if (amp) new Int16Array(buf, 44).fill(amp);
    return new Blob([buf], { type: 'audio/wav' });
  };
  const mockTokenThen = (sttBody) => _fetchSpy.mockImplementation(async (url) => {
    if (String(url).includes('/functions/v1/azure-token')) {
      return new Response(JSON.stringify({ token: FAKE_TOKEN, region: FAKE_REGION, expiresAt: Date.now() + 9 * 60 * 1000 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify(sttBody), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  it('NoMatch + 발화 수준 캡처 → fallbackReason no_match (마이크는 잡혔으나 미인식)', async () => {
    mockTokenThen({ RecognitionStatus: 'NoMatch' });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    const result = await Speech.analyzeWavRest(wavBlob(8000), 'hello'); // rms≈0.24 (발화 수준)
    expect(result.mockFallback).toBe(true);
    expect(result.fallbackReason).toBe('no_match');
  });

  it('InitialSilenceTimeout + 무음 캡처(rms~0) → fallbackReason mic_silent (점수 차단 아님, 메시지만 정정)', async () => {
    mockTokenThen({ RecognitionStatus: 'InitialSilenceTimeout' });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    const result = await Speech.analyzeWavRest(wavBlob(0), 'hello'); // 무음 → rms 0
    expect(result.mockFallback).toBe(true);
    expect(result.fallbackReason).toBe('mic_silent');
  });

  it('Success + AccuracyScore 0 + 무음 → mic_silent / 발화수준이면 no_match', async () => {
    const { Speech } = await import('./speech.js');
    // 무음
    mockTokenThen({ RecognitionStatus: 'Success', NBest: [{ AccuracyScore: 0, Display: '' }] });
    Speech.clearAzureTokenCache();
    expect((await Speech.analyzeWavRest(wavBlob(0), 'hi')).fallbackReason).toBe('mic_silent');
    // 발화 수준
    mockTokenThen({ RecognitionStatus: 'Success', NBest: [{ AccuracyScore: 0, Display: 'xyz' }] });
    Speech.clearAzureTokenCache();
    expect((await Speech.analyzeWavRest(wavBlob(8000), 'hi')).fallbackReason).toBe('no_match');
  });

  it('HTTP 401 응답 → mock 폴백', async () => {
    _fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('/functions/v1/azure-token')) {
        return new Response(
          JSON.stringify({ token: FAKE_TOKEN, region: FAKE_REGION, expiresAt: Date.now() + 9 * 60 * 1000 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('unauthorized', { status: 401 });
    });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    const fakeBlob = new Blob([new ArrayBuffer(100)], { type: 'audio/wav' });
    const result = await Speech.analyzeWavRest(fakeBlob, 'hello');
    expect(result.mockFallback).toBe(true);
  });

  it('token 발급 실패 → mock 폴백 (azure_init_fail)', async () => {
    _fetchSpy.mockImplementation(async () =>
      new Response('error', { status: 500 }),
    );
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    const fakeBlob = new Blob([new ArrayBuffer(100)], { type: 'audio/wav' });
    const result = await Speech.analyzeWavRest(fakeBlob, 'hello');
    expect(result.mockFallback).toBe(true);
    expect(result.fallbackReason).toBe('azure_init_fail');
  });
});

// Wave A.16 — transient 재시도 (network throw / 429 / 5xx).
// MS 공식 (speech-services-quotas-and-limits, 2026-06): F0 는 autoscaling 으로 한도 내에서도 429 발생 →
// "every implementation should gracefully handle 429 errors with retry logic". 기존엔 단발 실패를 즉시
// "네트워크 오류" 토스트로 종결 → 사용자 수동 재시도. 회귀 방지: token edge fetch + STT fetch 공용 재시도.
describe('speech — Wave A.16 transient 재시도', () => {
  const token200 = () => new Response(
    JSON.stringify({ token: FAKE_TOKEN, region: FAKE_REGION, expiresAt: Date.now() + 9 * 60 * 1000 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
  const REST_OK = {
    RecognitionStatus: 'Success', DisplayText: 'hi',
    NBest: [{ Display: 'hi', PronScore: 80, Words: [] }],
  };
  const okResponse = () => new Response(JSON.stringify(REST_OK), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
  const blob = () => new Blob([new ArrayBuffer(50)], { type: 'audio/wav' });

  it('STT 429 1회 → 재시도 후 성공 (실 score, mockFallback 없음)', async () => {
    let stt = 0;
    _fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('/functions/v1/azure-token')) return token200();
      if (String(url).includes('.stt.speech.microsoft.com/')) {
        stt += 1;
        return stt === 1 ? new Response('throttled', { status: 429 }) : okResponse();
      }
      return new Response('nf', { status: 404 });
    });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    const result = await Speech.analyzeWavRest(blob(), 'hi');
    expect(stt).toBe(2);
    expect(result.score).toBe(80);
    expect(result.mockFallback).toBeUndefined();
  });

  it('STT network throw 1회 → 재시도 후 성공', async () => {
    let stt = 0;
    _fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('/functions/v1/azure-token')) return token200();
      if (String(url).includes('.stt.speech.microsoft.com/')) {
        stt += 1;
        if (stt === 1) throw new TypeError('Failed to fetch');
        return okResponse();
      }
      return new Response('nf', { status: 404 });
    });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    const result = await Speech.analyzeWavRest(blob(), 'hi');
    expect(stt).toBe(2);
    expect(result.score).toBe(80);
    expect(result.mockFallback).toBeUndefined();
  });

  /* 2026-07-22 — 429 백오프 연장(2s/5s)으로 fake timers 필수 + 폴백 사유가 rate_limited 로 분기
   * (구 계약 azure_recognize_fail 은 '네트워크 오류' 토스트라 사용자가 원인을 알 수 없었음). */
  it('STT 지속 429 → 재시도 소진(총 3회) 후 mock 폴백 rate_limited', async () => {
    vi.useFakeTimers();
    try {
      let stt = 0;
      _fetchSpy.mockImplementation(async (url) => {
        if (String(url).includes('/functions/v1/azure-token')) return token200();
        if (String(url).includes('.stt.speech.microsoft.com/')) { stt += 1; return new Response('throttled', { status: 429 }); }
        return new Response('nf', { status: 404 });
      });
      const { Speech } = await import('./speech.js');
      Speech.clearAzureTokenCache();
      const p = Speech.analyzeWavRest(blob(), 'hi');
      await vi.advanceTimersByTimeAsync(20000); // 429 백오프 2s + 5s 소화
      const result = await p;
      expect(stt).toBe(3); // 최초 1 + 재시도 2
      expect(result.mockFallback).toBe(true);
      expect(result.fallbackReason).toBe('rate_limited');
    } finally { vi.useRealTimers(); }
  });

  it('STT 지속 network throw → 재시도 소진 후 mock 폴백', async () => {
    let stt = 0;
    _fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('/functions/v1/azure-token')) return token200();
      if (String(url).includes('.stt.speech.microsoft.com/')) { stt += 1; throw new TypeError('Failed to fetch'); }
      return new Response('nf', { status: 404 });
    });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    const result = await Speech.analyzeWavRest(blob(), 'hi');
    expect(stt).toBe(3);
    expect(result.mockFallback).toBe(true);
    expect(result.fallbackReason).toBe('azure_recognize_fail');
  });

  it('STT 400 (non-transient) → 재시도 안 함, 즉시 mock 폴백 (1회)', async () => {
    let stt = 0;
    _fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('/functions/v1/azure-token')) return token200();
      if (String(url).includes('.stt.speech.microsoft.com/')) { stt += 1; return new Response('bad', { status: 400 }); }
      return new Response('nf', { status: 404 });
    });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    const result = await Speech.analyzeWavRest(blob(), 'hi');
    expect(stt).toBe(1); // 재시도 없음
    expect(result.mockFallback).toBe(true);
  });

  it('azure-token edge 일시적 500 → 재시도 후 성공', async () => {
    let tok = 0;
    _fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('/functions/v1/azure-token')) {
        tok += 1;
        return tok === 1 ? new Response('err', { status: 500 }) : token200();
      }
      return new Response('nf', { status: 404 });
    });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    const r = await Speech.getAzureToken();
    expect(tok).toBe(2);
    expect(r.token).toBe(FAKE_TOKEN);
  });
});

// Wave A.18.1 — analyzeWavRest 는 captureRms(캡처 음량)를 진단용으로 반환.
// A.18(near-silent rms)·A.19(completeness) 캡처 가드는 철회: 낮은 점수/완성도는 "마이크 캡처 실패"가
// 아니라 "발음이 레퍼런스와 어긋남"인 경우가 많아(실측 검증) 정상 발화를 오차단했음 → 점수 차단 없이 값만 기록.
describe('speech — Wave A.18.1 captureRms 반환 + 캡처 가드 철회', () => {
  const token200 = () => new Response(
    JSON.stringify({ token: FAKE_TOKEN, region: FAKE_REGION, expiresAt: Date.now() + 9 * 60 * 1000 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
  const makeWav = (amplitude, samples) => {
    const buf = new ArrayBuffer(44 + samples * 2);
    const pcm = new Int16Array(buf, 44);
    for (let i = 0; i < samples; i++) pcm[i] = Math.round(Math.sin(i * 0.2) * amplitude);
    return new Blob([buf], { type: 'audio/wav' });
  };
  const mockOk = (rest) => _fetchSpy.mockImplementation(async (url) => {
    if (String(url).includes('/functions/v1/azure-token')) return token200();
    if (String(url).includes('.stt.speech.microsoft.com/')) return new Response(JSON.stringify(rest), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response('nf', { status: 404 });
  });

  it('정상 음량 → 점수 + captureRms 반환', async () => {
    mockOk({ RecognitionStatus: 'Success', DisplayText: 'hi', NBest: [{ Display: 'hi', AccuracyScore: 88, PronScore: 90, Words: [] }] });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    const result = await Speech.analyzeWavRest(makeWav(10000, 16000), 'hi');
    expect(result.score).toBe(88);
    expect(result.captureRms).toBeGreaterThan(0.1);
    expect(result.mockFallback).toBeUndefined();
  });

  it('near-silent + 저완성도 → 가드 없이 Azure 점수 그대로 (A.18/A.19 철회 회귀 보호)', async () => {
    let sttCalled = 0;
    _fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('/functions/v1/azure-token')) return token200();
      if (String(url).includes('.stt.speech.microsoft.com/')) { sttCalled += 1; return new Response(JSON.stringify({ RecognitionStatus: 'Success', DisplayText: 'hi', NBest: [{ Display: 'hi', AccuracyScore: 30, CompletenessScore: 20, Words: [] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
      return new Response('nf', { status: 404 });
    });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    // 거의 무음(rms~0.0006) + 완성도 20% — 더는 차단 안 함
    const result = await Speech.analyzeWavRest(makeWav(30, 16000), 'hi');
    expect(sttCalled).toBe(1);            // too_quiet 로 STT 스킵 안 함
    expect(result.score).toBe(30);        // incomplete_capture 로 차단 안 함
    expect(result.mockFallback).toBeUndefined();
  });
});

// Wave 11.35 — preload 동작 검증.
// 카드 진입 시 token+SDK warmup → 첫 클릭 지연 제거. 멱등 (중복 호출 시 promise 공유).
describe('speech — Wave 11.35 preload', () => {
  it('backend=web 시 token fetch 안 함 (waitForVoices 만)', async () => {
    const { Speech } = await import('./speech.js');
    Speech.setSpeechBackend('web');
    Speech.clearAzureTokenCache();
    _fetchSpy.mockClear();
    await Speech.preload();
    expect(_fetchSpy).toHaveBeenCalledTimes(0);
    Speech.setSpeechBackend('auto'); // restore
  });

  it('backend=auto + token 발급 가능 시 preload 후 token 캐시 hit', async () => {
    // SDK mock — dynamic import 가능하도록
    vi.doMock('microsoft-cognitiveservices-speech-sdk', () => ({}));
    const { Speech } = await import('./speech.js');
    Speech.setSpeechBackend('auto');
    Speech.clearAzureTokenCache();
    _fetchSpy.mockClear();
    await Speech.preload();
    // preload 가 token 1회 발급
    expect(_fetchSpy).toHaveBeenCalledTimes(1);
    // 이후 getAzureToken 호출 → 캐시 hit (fetch 0)
    _fetchSpy.mockClear();
    const tok = await Speech.getAzureToken();
    expect(tok.token).toBe(FAKE_TOKEN);
    expect(_fetchSpy).toHaveBeenCalledTimes(0);
  });

  it('backend=auto + token fail 시 preload silent (이후 호출 가능)', async () => {
    _fetchSpy.mockImplementation(async () =>
      new Response('error', { status: 500 }),
    );
    vi.doMock('microsoft-cognitiveservices-speech-sdk', () => ({}));
    const { Speech } = await import('./speech.js');
    Speech.setSpeechBackend('auto');
    Speech.clearAzureTokenCache();
    // preload 는 throw 안 함 (Promise.allSettled)
    await expect(Speech.preload()).resolves.toBeUndefined();
  });

  it('중복 호출 시 동일 promise 공유 (멱등)', async () => {
    vi.doMock('microsoft-cognitiveservices-speech-sdk', () => ({}));
    const { Speech } = await import('./speech.js');
    Speech.setSpeechBackend('auto');
    Speech.clearAzureTokenCache();
    _fetchSpy.mockClear();
    const p1 = Speech.preload();
    const p2 = Speech.preload();
    const p3 = Speech.preload();
    expect(p1).toBe(p2);
    expect(p2).toBe(p3);
    await Promise.all([p1, p2, p3]);
    // token fetch 1회 (in-flight 공유)
    expect(_fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// Wave 11.31 — pickVoice 단위 테스트.
// utterance.voice 미지정 시 chrome 의 자동 픽이 Albert/Bad News 같은 novelty voice 가 될 수 있어
// onEnd 미발화 + 발음 이상. pickVoice 가 default → quality regex → lang prefix 순서로 안정 픽.
describe('pickVoice — voice 선택 우선순위', () => {
  const v = (name, lang, opts = {}) => ({ name, lang, default: false, localService: true, ...opts });

  it('빈 voices 배열 → null', () => {
    expect(pickVoice([], 'en-US')).toBe(null);
    expect(pickVoice(null, 'en-US')).toBe(null);
    expect(pickVoice(undefined, 'en-US')).toBe(null);
  });

  it('1순위: lang 정확 일치 + default=true', () => {
    const voices = [
      v('Albert', 'en-US'),
      v('Samantha', 'en-US', { default: true }),
      v('Daniel', 'en-GB'),
    ];
    expect(pickVoice(voices, 'en-US')?.name).toBe('Samantha');
  });

  it('2순위: lang 정확 + quality regex (Samantha/Daniel/Alex/Karen 등)', () => {
    const voices = [
      v('Albert', 'en-US'),
      v('Bad News', 'en-US'),
      v('Daniel', 'en-US'), // quality
    ];
    expect(pickVoice(voices, 'en-US')?.name).toBe('Daniel');
  });

  it('3순위: lang prefix 일치 + default', () => {
    const voices = [
      v('Bad News', 'en-AU'),
      v('Daniel', 'en-GB', { default: true }),
    ];
    // en-US 정확 일치 없음 → en prefix + default 픽
    expect(pickVoice(voices, 'en-US')?.name).toBe('Daniel');
  });

  it('5순위: prefix 일치 + localService (네트워크 voice 회피)', () => {
    const voices = [
      v('Bad News Network', 'en-US', { localService: false }), // 네트워크
      v('Bad News Local', 'en-US', { localService: true }), // local
    ];
    // 둘 다 quality regex 미매치, default 없음 → localService=true 픽
    expect(pickVoice(voices, 'en-US')?.name).toBe('Bad News Local');
  });

  it('Microsoft Edge voice (Aria/Jenny) quality regex 매치', () => {
    const voices = [
      v('Albert', 'en-US'),
      v('Microsoft Aria Online (Natural) - English (United States)', 'en-US'),
    ];
    expect(pickVoice(voices, 'en-US')?.name).toMatch(/Microsoft Aria/);
  });

  it('Google US English quality regex 매치 (chrome 기본)', () => {
    const voices = [
      v('Albert', 'en-US'),
      v('Google US English', 'en-US', { localService: false }),
    ];
    expect(pickVoice(voices, 'en-US')?.name).toBe('Google US English');
  });

  it('일본어 lang — Kyoko/Otoya 매치', () => {
    const voices = [
      v('Bad News', 'ja-JP'),
      v('Kyoko', 'ja-JP'),
    ];
    expect(pickVoice(voices, 'ja-JP')?.name).toBe('Kyoko');
  });

  it('lang 매치 0건 → null', () => {
    const voices = [
      v('Kyoko', 'ja-JP'),
      v('Yuna', 'ko-KR'),
    ];
    expect(pickVoice(voices, 'fr-FR')).toBe(null);
  });
});

// Wave 11.36 — referenceText 정규화. Azure PronunciationAssessment 는 reference 가 발화와
// 정확 일치 안 하면 0점. 사용자는 punctuation 발화 안 함 → reference 마침표 → mismatch → 0점 fix.
describe('normalizeReferenceText — Wave 11.36', () => {
  it('마침표·쉼표 제거', () => {
    expect(normalizeReferenceText('You got it.')).toBe('You got it');
    expect(normalizeReferenceText('Hello, world!')).toBe('Hello world');
  });

  it('물음표·느낌표·세미콜론·콜론 제거', () => {
    expect(normalizeReferenceText('How are you?')).toBe('How are you');
    expect(normalizeReferenceText("It's me!")).toBe('Its me');
    expect(normalizeReferenceText('one; two: three')).toBe('one two three');
  });

  it('일본어 punctuation (。、「」) 제거', () => {
    expect(normalizeReferenceText('こんにちは。')).toBe('こんにちは');
    expect(normalizeReferenceText('彼は「行く」と言った。')).toBe('彼は行くと言った');
    expect(normalizeReferenceText('A、B、C')).toBe('A B C');
  });

  it('일본어 풀-와이드 문장부호 (！？：；，．・) 제거 — Wave A.7.1 보강', () => {
    expect(normalizeReferenceText('行ってきます！')).toBe('行ってきます');
    expect(normalizeReferenceText('元気ですか？')).toBe('元気ですか');
    expect(normalizeReferenceText('A・B・C')).toBe('A B C');
    expect(normalizeReferenceText('注意：危険')).toBe('注意 危険');
  });

  it('공백 정리 (다중 공백 → 단일)', () => {
    expect(normalizeReferenceText('  hello   world  ')).toBe('hello world');
  });

  it('빈/null 안전', () => {
    expect(normalizeReferenceText('')).toBe('');
    expect(normalizeReferenceText(null)).toBe('');
    expect(normalizeReferenceText(undefined)).toBe('');
  });

  it('punctuation 없는 문장은 변형 안 됨', () => {
    expect(normalizeReferenceText('alright')).toBe('alright');
    expect(normalizeReferenceText('Got it')).toBe('Got it');
  });
});

// Wave 11.32 — Azure SSML 빌드 + lang 별 voice/style 매핑 단위 테스트.
describe('Azure SSML — voice/style 매핑', () => {
  it('VOICE_DEFAULTS — en-US = AriaNeural (style 무 — whispering 폐기), ja-JP = AoiNeural', () => {
    expect(VOICE_DEFAULTS['en-US'].voice).toBe('en-US-AriaNeural');
    // whispering 폐기 — 발음 학습 부적합 + 화자 없는 표현 카드 단조로움 (화자별 voice 는 SPEAKER_VOICES).
    expect(VOICE_DEFAULTS['en-US'].style).toBe(null);
    expect(VOICE_DEFAULTS['ja-JP'].voice).toBe('ja-JP-AoiNeural');
    expect(VOICE_DEFAULTS['ja-JP'].style).toBe(null);
  });

  it('buildAzureSSML — voice + style 모두 적용 (en-US AriaNeural whispering)', () => {
    const ssml = buildAzureSSML('Hello', 'en-US', 0.85, 'en-US-AriaNeural', 'whispering');
    expect(ssml).toContain('xmlns:mstts="https://www.w3.org/2001/mstts"');
    expect(ssml).toContain('xml:lang="en-US"');
    expect(ssml).toContain('<voice name="en-US-AriaNeural">');
    expect(ssml).toContain('<mstts:express-as style="whispering">');
    expect(ssml).toContain('<prosody rate="0.85">Hello</prosody>');
    expect(ssml).toContain('</mstts:express-as>');
    expect(ssml).toContain('</voice>');
  });

  it('buildAzureSSML — style null 시 mstts namespace + express-as 생략 (ja-JP AoiNeural)', () => {
    const ssml = buildAzureSSML('こんにちは', 'ja-JP', 0.85, 'ja-JP-AoiNeural', null);
    expect(ssml).not.toContain('xmlns:mstts');
    expect(ssml).not.toContain('mstts:express-as');
    expect(ssml).toContain('<voice name="ja-JP-AoiNeural">');
    expect(ssml).toContain('<prosody rate="0.85">こんにちは</prosody>');
  });

  it('buildAzureSSML — voice null 시 voice 태그 생략', () => {
    const ssml = buildAzureSSML('Hello', 'en-US', 0.85, null, null);
    expect(ssml).not.toContain('<voice');
    expect(ssml).toContain('<prosody rate="0.85">Hello</prosody>');
  });

  it('buildAzureSSML — XML 특수문자 escape (& < > " \')', () => {
    const ssml = buildAzureSSML(`it's "AT&T" <safe> & 1<2`, 'en-US', 0.85, 'en-US-AriaNeural', null);
    expect(ssml).toContain('it&apos;s &quot;AT&amp;T&quot; &lt;safe&gt; &amp; 1&lt;2');
    expect(ssml).not.toMatch(/<safe>/);
  });

  it('SPEAKER_VOICES — 라쿤·빅맨 en-US 매핑 (Tony unfriendly 1.1 / Davis ML empathetic 0.9)', () => {
    expect(SPEAKER_VOICES['en-US']['라쿤']).toEqual({ voice: 'en-US-TonyNeural', style: 'unfriendly', rate: 1.1 });
    expect(SPEAKER_VOICES['en-US']['빅맨']).toEqual({ voice: 'en-US-DavisMultilingualNeural', style: 'empathetic', rate: 0.9 });
  });

  it('SPEAKER_VOICES — Parks 화자(Leslie/Ann/Tom) 구분 voice (style 무 — 또렷한 발음)', () => {
    expect(SPEAKER_VOICES['en-US']['Leslie']).toEqual({ voice: 'en-US-AvaMultilingualNeural', style: null, rate: 1.05 });
    expect(SPEAKER_VOICES['en-US']['Ann']).toEqual({ voice: 'en-US-EmmaMultilingualNeural', style: null, rate: 1.0 });
    expect(SPEAKER_VOICES['en-US']['Tom']).toEqual({ voice: 'en-US-AndrewMultilingualNeural', style: null, rate: 0.98 });
  });

  it('buildAzureSSML — 라쿤 매핑 결과 SSML (Tony unfriendly rate 1.1)', () => {
    const cfg = SPEAKER_VOICES['en-US']['라쿤'];
    const ssml = buildAzureSSML("I'm starving. Let's grab a burger.", 'en-US', cfg.rate, cfg.voice, cfg.style);
    expect(ssml).toContain('<voice name="en-US-TonyNeural">');
    expect(ssml).toContain('<mstts:express-as style="unfriendly">');
    expect(ssml).toContain('<prosody rate="1.1">');
  });

  it('buildAzureSSML — 빅맨 매핑 결과 SSML (Davis ML empathetic rate 0.9)', () => {
    const cfg = SPEAKER_VOICES['en-US']['빅맨'];
    const ssml = buildAzureSSML("I am a warrior.", 'en-US', cfg.rate, cfg.voice, cfg.style);
    expect(ssml).toContain('<voice name="en-US-DavisMultilingualNeural">');
    expect(ssml).toContain('<mstts:express-as style="empathetic">');
    expect(ssml).toContain('<prosody rate="0.9">');
  });
});

// 녹음 자동종료 VAD 판정 (말 끝나면 자동 멈춤). 순수 함수 — chunk 마다 feed(peak, nowMs).
describe('createSilenceAutoStop — 무음 자동종료 판정', () => {
  it('발화 전 앞 침묵에는 멈추지 않음 (복습 떠올리기 보호)', () => {
    const vad = createSilenceAutoStop({ speechPeak: 0.08, silencePeak: 0.05, hangoverMs: 1200 });
    for (let t = 0; t <= 5000; t += 100) expect(vad.feed(0, t)).toBe(false); // 5초 무음이어도 안 멈춤
    expect(vad.speechStarted).toBe(false);
  });

  it('발화 후 hangover 만큼 무음 지속 → 종료', () => {
    const vad = createSilenceAutoStop({ speechPeak: 0.08, silencePeak: 0.05, hangoverMs: 1200 });
    expect(vad.feed(0.3, 0)).toBe(false);    // 발화 시작
    expect(vad.feed(0.0, 500)).toBe(false);  // 0.5s 무음
    expect(vad.feed(0.0, 1100)).toBe(false); // 1.1s (아직)
    expect(vad.feed(0.0, 1300)).toBe(true);  // 1.3s ≥ hangover → 종료
  });

  it('발화 중 단어 사이 짧은 무음은 리셋 (조기 종료 안 함)', () => {
    const vad = createSilenceAutoStop({ speechPeak: 0.08, silencePeak: 0.05, hangoverMs: 1200 });
    vad.feed(0.3, 0);
    expect(vad.feed(0, 300)).toBe(false);    // 0.3s 무음
    expect(vad.feed(0.3, 400)).toBe(false);  // 다시 발화 → 리셋
    expect(vad.feed(0, 1000)).toBe(false);   // 리셋 후 0.6s
    expect(vad.feed(0, 1700)).toBe(true);    // 리셋 후 1.3s → 종료
  });

  it('중간 레벨(silencePeak~speechPeak)은 voice 로 간주해 hangover 리셋', () => {
    const vad = createSilenceAutoStop({ speechPeak: 0.08, silencePeak: 0.05, hangoverMs: 1000 });
    vad.feed(0.3, 0);                          // 발화 시작
    expect(vad.feed(0.06, 900)).toBe(false);  // 중간 레벨 → voice → 리셋
    expect(vad.feed(0, 1700)).toBe(false);    // 리셋 후 0.8s
    expect(vad.feed(0, 2000)).toBe(true);     // 리셋 후 1.1s → 종료
  });

  // 2026-07-11 — 조용히 말하거나 마이크 게인이 낮아 발화 peak 이 speechPeak(0.08) 에 못 미치면
  // 옛 코드는 영영 무장(speechStarted)이 안 돼 자동종료가 안 됐다(실측 재현). 무장 임계를
  // 화자 자기 최고 peak 에 적응시켜(마이크 게인 독립) 이 경우도 무장·종료되게 한다.
  it('조용한 발화(peak 0.06, speechPeak 미만)도 무장·자동종료 — 마이크 게인 독립', () => {
    const vad = createSilenceAutoStop({ hangoverMs: 1200 }); // 실사용 경로와 동일한 기본 임계
    expect(vad.feed(0.06, 0)).toBe(false);     // 발화 전체가 옛 speechPeak 아래
    expect(vad.speechStarted).toBe(true);      // 그래도 무장돼야 한다 (옛 코드는 false 였음)
    expect(vad.feed(0.0, 600)).toBe(false);
    expect(vad.feed(0.0, 1300)).toBe(true);    // hangover 후 종료
  });

  it('순수 무음/노이즈(peak ≤ silencePeak)는 무장하지 않음 (오작동 방지)', () => {
    const vad = createSilenceAutoStop({ hangoverMs: 1200 });
    for (let t = 0; t <= 3000; t += 100) vad.feed(0.03, t); // 노이즈 수준 지속
    expect(vad.speechStarted).toBe(false);
  });

  it('큰 발화(peak 0.3)의 무장·종료 동작은 옛 절대임계와 동일 (회귀 없음)', () => {
    const vad = createSilenceAutoStop({ hangoverMs: 1200 });
    expect(vad.feed(0.3, 0)).toBe(false);
    expect(vad.speechStarted).toBe(true);
    expect(vad.feed(0.0, 1100)).toBe(false);
    expect(vad.feed(0.0, 1300)).toBe(true);
  });
});

// 2026-07-12 — 녹음 머리 잘림 수정 2단계.
// 1차(캡처 라이브 게이트 + ctx 재사용)로 완전 잘림(전체 0점)은 소멸했으나, 실데이터에
// 부분 잘림(첫 단어만 저점 — Are:20~56)이 잔존. 합성 재현: 머리 300ms 절단 = Are:44 you:40.
// 2차 — 워밍 마이크 + pre-roll: 스트림·워클릿을 녹음 사이에 유지하고 최근 0.5초를
// 링버퍼에 상시 보관 → 녹음 시작 시 소급 포함. 클릭보다 먼저 말해도 잡힌다.
describe('recordWav — 캡처 라이브 게이트 + 워밍 마이크 pre-roll', () => {
  function setupAudioMocks() {
    const state = { acCount: 0, addModuleCalls: 0, closeCalls: 0, nodes: [], trackStops: 0, gumCalls: 0, tracks: [], ctxs: [], resumeCalls: 0 };
    class FakeAudioContext {
      constructor() {
        state.acCount += 1;
        this.state = 'running';
        this.destination = {};
        this.audioWorklet = { addModule: async () => { state.addModuleCalls += 1; } };
        state.ctxs.push(this);
      }
      async resume() { state.resumeCalls += 1; this.state = 'running'; }
      async close() { state.closeCalls += 1; this.state = 'closed'; }
      createMediaStreamSource() { return { connect: () => {}, disconnect: () => {} }; }
      createGain() { return { gain: { value: 1 }, connect: () => {}, disconnect: () => {} }; }
    }
    class FakeWorkletNode {
      constructor() {
        this.port = { onmessage: null, postMessage: () => {} };
        state.nodes.push(this);
      }
      connect() {}
      disconnect() {}
    }
    const makeStream = () => {
      const track = { readyState: 'live', stop: () => { state.trackStops += 1; } };
      state.tracks.push(track);
      return { getTracks: () => [track] };
    };
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => { state.gumCalls += 1; return makeStream(); } } });
    vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
    return state;
  }

  const flush = () => new Promise((r) => setTimeout(r, 0));
  const feedChunk = (node, n = 160, value = 100) => {
    node.port.onmessage?.({ data: new Int16Array(n).fill(value).buffer });
  };
  const pcmOf = async (blob) => new Int16Array(await blob.arrayBuffer(), 44);

  it('첫 오디오 청크 도착 전에는 resolve 하지 않는다 (캡처 라이브 게이트)', async () => {
    const m = setupAudioMocks();
    const { Speech } = await import('./speech.js');
    let resolved = false;
    const p = Speech.recordWav().then((c) => { resolved = true; return c; });
    await flush();
    expect(m.nodes.length).toBe(1); // 파이프라인 셋업은 끝남
    expect(resolved).toBe(false);   // 그러나 첫 청크 전 — 아직 pending
    feedChunk(m.nodes[0]);
    const ctrl = await p;
    expect(resolved).toBe(true);
    ctrl.stop();
    await ctrl.blobPromise;
  });

  it('첫 청크가 안 와도 2초 안전망으로 resolve (마이크 무신호 행 방지)', async () => {
    vi.useFakeTimers();
    try {
      const m = setupAudioMocks();
      const { Speech } = await import('./speech.js');
      let resolved = false;
      const p = Speech.recordWav().then((c) => { resolved = true; return c; });
      await vi.advanceTimersByTimeAsync(0);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(2100);
      const ctrl = await p;
      expect(resolved).toBe(true);
      expect(m.nodes.length).toBe(1);
      ctrl.stop();
      await ctrl.blobPromise;
    } finally {
      vi.useRealTimers();
    }
  });

  it('워밍 파이프라인 재사용: ctx·worklet·getUserMedia 1회, 노드 재사용', async () => {
    const m = setupAudioMocks();
    const { Speech } = await import('./speech.js');
    const p1 = Speech.recordWav();
    await flush();
    feedChunk(m.nodes[0]);
    const c1 = await p1;
    c1.stop();
    await c1.blobPromise;

    const p2 = Speech.recordWav();
    await flush();
    feedChunk(m.nodes[0]); // 같은 노드 재사용 — 새 노드 생성 없음
    const c2 = await p2;
    c2.stop();
    await c2.blobPromise;

    expect(m.acCount).toBe(1);        // 컨텍스트 재사용
    expect(m.addModuleCalls).toBe(1); // 워클릿 1회 등록
    expect(m.gumCalls).toBe(1);       // 마이크 스트림 재사용 (재오픈 지연 제거)
    expect(m.nodes.length).toBe(1);   // 워클릿 노드 재사용
  });

  it('pre-roll: 클릭 이전(대기 중) 오디오가 다음 녹음 앞에 소급 포함된다', async () => {
    const m = setupAudioMocks();
    const { Speech } = await import('./speech.js');
    // 1차 녹음으로 워밍 (value 1 은 1차 녹음에만 속함)
    const p1 = Speech.recordWav();
    await flush();
    feedChunk(m.nodes[0], 100, 1);
    const c1 = await p1;
    c1.stop();
    await c1.blobPromise;
    // 대기 중(클릭 전) 오디오 — 링버퍼로
    feedChunk(m.nodes[0], 100, 2);
    feedChunk(m.nodes[0], 100, 3);
    // 2차 녹음 — pre-roll(2,3) + 라이브(4)
    const p2 = Speech.recordWav();
    await flush();
    feedChunk(m.nodes[0], 100, 4);
    const c2 = await p2;
    c2.stop();
    const pcm = await pcmOf(await c2.blobPromise);
    expect(pcm.length).toBe(300);
    expect(pcm[0]).toBe(2);    // 클릭 이전 오디오가 맨 앞에
    expect(pcm[100]).toBe(3);
    expect(pcm[200]).toBe(4);  // 라이브 오디오가 뒤에
    expect([...pcm].includes(1)).toBe(false); // 1차 녹음분은 미포함 (링 초기화)
  });

  it('링버퍼는 pre-roll 상한(0.5초 = 8000샘플)으로 잘린다', async () => {
    const m = setupAudioMocks();
    const { Speech } = await import('./speech.js');
    const p1 = Speech.recordWav();
    await flush();
    feedChunk(m.nodes[0]);
    const c1 = await p1;
    c1.stop();
    await c1.blobPromise;
    // 대기 중 12000샘플 유입 (상한 8000 초과)
    for (let i = 0; i < 30; i++) feedChunk(m.nodes[0], 400, i + 10);
    const p2 = Speech.recordWav();
    await flush();
    feedChunk(m.nodes[0], 100, 99);
    const c2 = await p2;
    c2.stop();
    const pcm = await pcmOf(await c2.blobPromise);
    // pre-roll ≤ 8000+청크1개 미만 + 라이브 100
    expect(pcm.length - 100).toBeLessThan(8400);
    expect(pcm.length - 100).toBeGreaterThanOrEqual(8000);
    expect(pcm[0]).toBeGreaterThanOrEqual(10 + 10); // 오래된 앞 청크들은 탈락
  });

  it('탭 hidden 시 워밍 마이크 해제 — 단 녹음 중엔 유지', async () => {
    const m = setupAudioMocks();
    let visHandler = null;
    const doc = {
      visibilityState: 'visible',
      addEventListener: (ev, fn) => { if (ev === 'visibilitychange') visHandler = fn; },
      removeEventListener: () => {},
    };
    vi.stubGlobal('document', doc);
    const { Speech } = await import('./speech.js');
    const p = Speech.recordWav();
    await flush();
    feedChunk(m.nodes[0]);
    const ctrl = await p;
    // 녹음 중 hidden → 해제하지 않음 (진행 중 녹음 보호)
    doc.visibilityState = 'hidden';
    visHandler?.();
    expect(m.trackStops).toBe(0);
    ctrl.stop();
    await ctrl.blobPromise;
    // 녹음 종료 후 hidden → 즉시 해제 (마이크 표시등 소등)
    visHandler?.();
    expect(m.trackStops).toBeGreaterThan(0);
  });

  it('녹음 중 재호출(재클릭 race) 시 이전 녹음을 강제 확정하고 새 녹음 시작', async () => {
    const m = setupAudioMocks();
    const { Speech } = await import('./speech.js');
    const p1 = Speech.recordWav();
    await flush();
    feedChunk(m.nodes[0], 100, 1);
    const c1 = await p1;
    // stop 없이 곧바로 두 번째 녹음 시작
    const p2 = Speech.recordWav();
    await flush();
    const blob1 = await c1.blobPromise; // 이전 녹음은 그 시점까지로 자동 확정
    expect((await pcmOf(blob1))[0]).toBe(1);
    feedChunk(m.nodes[0], 100, 4);
    const c2 = await p2;
    c2.stop();
    const pcm2 = await pcmOf(await c2.blobPromise);
    expect(pcm2.length).toBe(100);
    expect(pcm2[0]).toBe(4); // 새 녹음엔 이전 청크 미혼입
  });

  it('stop() 후 트랙 유지(워밍), 60초 유휴 시 자동 해제 후 재오픈', async () => {
    vi.useFakeTimers();
    try {
      const m = setupAudioMocks();
      const { Speech } = await import('./speech.js');
      const p = Speech.recordWav();
      await vi.advanceTimersByTimeAsync(0);
      feedChunk(m.nodes[0]);
      const ctrl = await p;
      ctrl.stop();
      const blob = await ctrl.blobPromise;
      expect(blob.size).toBeGreaterThan(44);
      expect(m.trackStops).toBe(0);   // 워밍 유지 — 즉시 해제 안 함
      expect(m.closeCalls).toBe(0);   // 컨텍스트도 유지
      await vi.advanceTimersByTimeAsync(61_000);
      expect(m.trackStops).toBeGreaterThan(0); // 유휴 해제 (프라이버시 표시등 꺼짐)
      // 해제 후 다음 녹음은 재오픈
      const p2 = Speech.recordWav();
      await vi.advanceTimersByTimeAsync(0);
      feedChunk(m.nodes[1]);
      const c2 = await p2;
      c2.stop();
      await c2.blobPromise;
      expect(m.gumCalls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // 2026-07-13 — 실사용 보고: 맥 마이크 표시등이 켜져 있는데 "입력 안 됨" + 자동종료 불발.
  // 워밍 재사용이 죽은 파이프라인(트랙 ended·ctx suspended·무신호)을 그대로 쓰던 회귀.
  it('워밍 스트림 트랙이 죽으면(ended) 파이프라인 재생성', async () => {
    const m = setupAudioMocks();
    const { Speech } = await import('./speech.js');
    const p1 = Speech.recordWav();
    await flush();
    feedChunk(m.nodes[0]);
    const c1 = await p1;
    c1.stop();
    await c1.blobPromise;
    // OS 이벤트(장치 전환·절전)로 트랙 사망 시뮬
    m.tracks[0].readyState = 'ended';
    const p2 = Speech.recordWav();
    await flush();
    expect(m.gumCalls).toBe(2);   // 재생성
    expect(m.nodes.length).toBe(2);
    feedChunk(m.nodes[1], 100, 7);
    const c2 = await p2;
    c2.stop();
    expect((await pcmOf(await c2.blobPromise))[0]).toBe(7);
  });

  it('워밍 재사용 시 suspended 컨텍스트를 resume (청크 흐름 복구)', async () => {
    const m = setupAudioMocks();
    const { Speech } = await import('./speech.js');
    const p1 = Speech.recordWav();
    await flush();
    feedChunk(m.nodes[0]);
    const c1 = await p1;
    c1.stop();
    await c1.blobPromise;
    m.ctxs[0].state = 'suspended'; // 탭 복귀 등으로 정지된 컨텍스트
    const resumesBefore = m.resumeCalls;
    const p2 = Speech.recordWav();
    await flush();
    expect(m.resumeCalls).toBeGreaterThan(resumesBefore);
    expect(m.ctxs[0].state).toBe('running');
    feedChunk(m.nodes[0]);
    const c2 = await p2;
    c2.stop();
    await c2.blobPromise;
  });

  it('워밍 재사용인데 2초 무신호 → 같은 호출 안에서 파이프라인 재생성 후 복구', async () => {
    vi.useFakeTimers();
    try {
      const m = setupAudioMocks();
      const { Speech } = await import('./speech.js');
      const p1 = Speech.recordWav();
      await vi.advanceTimersByTimeAsync(0);
      feedChunk(m.nodes[0]);
      const c1 = await p1;
      c1.stop();
      await c1.blobPromise;
      // 파이프라인이 조용히 죽음(muted 등 — readyState 로는 안 잡히는 케이스) 시뮬: 무신호
      const p2 = Speech.recordWav();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(2100); // 1차 게이트 무신호 → 폐기·재생성
      expect(m.gumCalls).toBe(2);
      expect(m.nodes.length).toBe(2);
      feedChunk(m.nodes[1], 100, 7); // 새 파이프라인 정상
      const c2 = await p2;
      c2.stop();
      expect((await pcmOf(await c2.blobPromise))[0]).toBe(7);
    } finally {
      vi.useRealTimers();
    }
  });
});

// 2026-07-13 — 실사용 보고: 재생 버튼 첫 클릭 무반응(콜드 연결 지연) 후 재클릭 시 2연속 재생.
// 원인: speakAzure 의 race 가드(_activeSpeak)가 await getSynthesizer() 뒤에 등록돼,
// 연결 대기 중인 첫 호출을 두 번째 호출이 취소하지 못함 → 같은 synth 큐에 2건.
describe('speak — 연타 시 대기 중 호출 선점 취소', () => {
  function setupSDKMocks() {
    const state = { speakCalls: [], players: [] };
    class FakeSynth {
      // audioDuration 5e7 (100ns tick) = 5초 — playback 대기 상태를 유지시켜 재클릭 취소 경로 검증
      speakSsmlAsync(ssml, ok) { state.speakCalls.push(ssml); ok({ audioDuration: 5e7 }); }
      close() {}
    }
    class FakePlayer {
      constructor() { this.pauseCalls = 0; state.players.push(this); }
      pause() { this.pauseCalls += 1; }
      close() {}
    }
    vi.stubGlobal('window', {
      SpeechSDK: {
        SpeechConfig: { fromAuthorizationToken: () => ({}) },
        SpeechSynthesizer: FakeSynth,
        Connection: { fromSynthesizer: () => ({ openConnection: () => {} }) },
        SpeakerAudioDestination: FakePlayer,
        AudioConfig: { fromSpeakerOutput: (p) => ({ player: p }) },
      },
    });
    return state;
  }

  it('토큰/연결 대기 중 재클릭 → 마지막 1건만 speakSsmlAsync', async () => {
    const m = setupSDKMocks();
    // 토큰 fetch 를 인위로 지연시켜 두 speak 이 동시에 대기하는 상황 재현
    let releaseToken;
    const gate = new Promise((r) => { releaseToken = r; });
    const orig = globalThis.fetch;
    globalThis.fetch = async (...args) => { await gate; return orig(...args); };
    const { Speech } = await import('./speech.js');
    Speech.speak('first sentence', { lang: 'en-US' });
    Speech.speak('second sentence', { lang: 'en-US' });
    releaseToken();
    await new Promise((r) => setTimeout(r, 20));
    expect(m.speakCalls.length).toBe(1);              // 2연속 재생 없음
    expect(m.speakCalls[0]).toContain('second sentence'); // 살아남는 건 마지막 클릭
  });

  // 2026-07-13 실브라우저 실증: synth.close() 는 이미 버퍼된 재생 오디오를 멈추지 못한다
  // (audio el currentTime 3.76→5.06 진행 계속 — A.15 주석 "close 로 중지 (검증됨)" 반증).
  // SpeakerAudioDestination.pause() 는 즉시 정지 (currentTime 동결 실증) → 명시 player 필수.
  it('재생 중 재클릭 → 이전 오디오를 player.pause() 로 즉시 정지', async () => {
    const m = setupSDKMocks();
    const { Speech } = await import('./speech.js');
    Speech.speak('first playing sentence', { lang: 'en-US' });
    await new Promise((r) => setTimeout(r, 20)); // 합성 완료, playback 대기 중 (5초 타이머)
    expect(m.speakCalls.length).toBe(1);
    Speech.speak('interrupting sentence', { lang: 'en-US' });
    await new Promise((r) => setTimeout(r, 20));
    expect(m.players.length).toBeGreaterThanOrEqual(1); // 명시 player 로 재생
    expect(m.players[0].pauseCalls).toBeGreaterThanOrEqual(1); // 이전 오디오 즉시 정지
    expect(m.speakCalls.length).toBe(2); // 새 문장은 정상 재생
  });

  it('cancel() 도 재생 중 오디오를 player.pause() 로 정지', async () => {
    const m = setupSDKMocks();
    const { Speech } = await import('./speech.js');
    Speech.speak('to be cancelled', { lang: 'en-US' });
    await new Promise((r) => setTimeout(r, 20));
    Speech.cancel();
    expect(m.players.length).toBeGreaterThanOrEqual(1);
    expect(m.players[0].pauseCalls).toBeGreaterThanOrEqual(1);
  });
});

// 2026-07-17 — 실사용 보고: 체이닝 반복 듣기에서 재생 무반응, 재클릭 시 2연속 재생.
// 원인(SDK 소스 실증): SpeakerAudioDestination 은 **재생 개시 1회용**이다.
//   - privPlaybackStarted 는 첫 재생에 true 로 굳고 재설정 경로가 없다
//     (SpeakerAudioDestination.js — 대입은 L30 false·L233 true 두 곳뿐, 읽기는 L232 가드).
//     → 두 번째 utterance 에선 privAudio.play() 를 다시 부르지 않는다 = 무음.
//   - pause() 가 세운 privIsPaused 는 resume() 로만 풀리는데(L186/L200, 가드 L242) 여긴 안 부른다.
// 그런데 speech.js 는 lang 당 synth+player 를 캐시해 재사용했고, 캐시 제거는 _activeSpeak 이
// 살아있는 '선점' 경로에서만 일어난다. 재생이 끝나면 playbackTimer 가 _activeSpeak=null 로 만들어
// 다 쓴 player 가 캐시에 남고, 다음 클릭이 그걸 그대로 받는다.
// 체이닝은 무자막(인출 강제)이라 녹음 없이 같은 단계를 반복 재생 → 이 경로를 계속 밟는다.
// 드릴도 같은 결함(테스트로 확인) — 공유 레이어 버그이지 체이닝 전용이 아니다.
describe('speak — 발화마다 새 player (SpeakerAudioDestination 은 1회용)', () => {
  function setupFaithfulSDK() {
    const state = { players: [], speakCalls: [] };
    // 실 SpeakerAudioDestination 모델 — playCalls = 실제로 privAudio.play() 가 불린 횟수(= 소리 남)
    class FakePlayer {
      constructor() {
        this.privPlaybackStarted = false;
        this.privIsPaused = false;
        this.playCalls = 0;
        this.pauseCalls = 0;
        state.players.push(this);
      }
      notifyPlayback() { // 실 SDK L231-245
        if (!this.privPlaybackStarted) {
          this.privPlaybackStarted = true;
          if (!this.privIsPaused) this.playCalls += 1;
        }
      }
      pause() { if (!this.privIsPaused) { this.privIsPaused = true; this.pauseCalls += 1; } } // L183-188
      close() {}
    }
    class FakeSynth {
      constructor(_config, audioConfig) { this.player = audioConfig?.player; }
      speakSsmlAsync(ssml, ok) {
        state.speakCalls.push(ssml);
        this.player?.notifyPlayback(); // 합성 오디오가 player 로 흘러 재생 시도
        ok({ audioDuration: 1e7 });    // 100ns tick → 1초
      }
      close() {}
    }
    vi.stubGlobal('window', {
      SpeechSDK: {
        SpeechConfig: { fromAuthorizationToken: () => ({}) },
        SpeechSynthesizer: FakeSynth,
        Connection: { fromSynthesizer: () => ({ openConnection: () => {} }) },
        SpeakerAudioDestination: FakePlayer,
        AudioConfig: { fromSpeakerOutput: (p) => ({ player: p }) },
      },
    });
    return state;
  }
  const audible = (s) => s.players.reduce((n, p) => n + p.playCalls, 0);

  it('재생 완료 후 재클릭 → 새 player 로 소리가 난다 (체이닝 반복 듣기)', async () => {
    const m = setupFaithfulSDK();
    const { Speech } = await import('./speech.js');
    Speech.speak('step one', { lang: 'en-US' });
    await new Promise((r) => setTimeout(r, 30));
    expect(audible(m)).toBe(1);
    await new Promise((r) => setTimeout(r, 1200)); // 재생 완료 → _activeSpeak = null
    Speech.speak('step one again', { lang: 'en-US' }); // 같은 단계 다시 듣기
    await new Promise((r) => setTimeout(r, 30));
    expect(m.speakCalls.length).toBe(2); // 합성 2회
    expect(audible(m)).toBe(2);          // 소리도 2회 (구버전은 1 — 다 쓴 player 재사용)
  });

  it('드릴 행1 → 행2 연속 듣기도 매번 소리가 난다', async () => {
    const m = setupFaithfulSDK();
    const { Speech } = await import('./speech.js');
    Speech.speak('drill row one', { lang: 'en-US' });
    await new Promise((r) => setTimeout(r, 30));
    await new Promise((r) => setTimeout(r, 1200));
    Speech.speak('drill row two', { lang: 'en-US' });
    await new Promise((r) => setTimeout(r, 30));
    expect(audible(m)).toBe(2);
  });

  it('발화마다 서로 다른 player 인스턴스를 쓴다 (재사용 금지)', async () => {
    const m = setupFaithfulSDK();
    const { Speech } = await import('./speech.js');
    Speech.speak('first', { lang: 'en-US' });
    await new Promise((r) => setTimeout(r, 30));
    const used1 = m.players.filter((p) => p.privPlaybackStarted);
    await new Promise((r) => setTimeout(r, 1200));
    Speech.speak('second', { lang: 'en-US' });
    await new Promise((r) => setTimeout(r, 30));
    const used2 = m.players.filter((p) => p.privPlaybackStarted);
    expect(used2.length).toBe(2);          // 재생한 player 가 2개 = 재사용 안 함
    expect(used2[0]).toBe(used1[0]);       // 첫 발화의 player 는 그대로
    expect(used2[1]).not.toBe(used1[0]);   // 두 번째는 새 인스턴스
  });
});

// 취소된 발화가 web 폴백으로 새어나오면 또 다른 '2연속 재생' 경로가 된다.
// 성공 콜백엔 session.cancelled 가드가 있는데(speech.js) error 콜백/ catch 에는 없었다.
// speakWeb 은 _activeSpeak 에 등록되지 않아 이후 cancel()/선점으로 멈출 수도 없다.
describe('speak — 취소된 발화는 web 폴백으로 새지 않는다', () => {
  function setupFailingSDK() {
    const state = { webSpoken: [] };
    class FailingSynth {
      speakSsmlAsync(_ssml, _ok, err) { setTimeout(() => err('synthesis aborted'), 5); }
      close() {}
    }
    class FakePlayer { pause() {} close() {} }
    vi.stubGlobal('window', {
      SpeechSDK: {
        SpeechConfig: { fromAuthorizationToken: () => ({}) },
        SpeechSynthesizer: FailingSynth,
        Connection: { fromSynthesizer: () => ({ openConnection: () => {} }) },
        SpeakerAudioDestination: FakePlayer,
        AudioConfig: { fromSpeakerOutput: (p) => ({ player: p }) },
      },
      speechSynthesis: {
        cancel() {},
        getVoices: () => [{ name: 'Samantha', lang: 'en-US', default: true, localService: true }],
        addEventListener() {},
        speak(u) { state.webSpoken.push(u.text); },
      },
      SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
    });
    globalThis.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
    return state;
  }

  it('cancel() 이후 도착한 Azure 실패 → speakWeb 미실행', async () => {
    const m = setupFailingSDK();
    const { Speech } = await import('./speech.js');
    Speech.speak('cancelled sentence', { lang: 'en-US' });
    await new Promise((r) => setTimeout(r, 1));
    Speech.cancel(); // 사용자가 곧바로 정지
    await new Promise((r) => setTimeout(r, 40));
    expect(m.webSpoken).not.toContain('cancelled sentence');
  });
});

// 2026-07-18 — iPhone Safari 는 audio/mpeg 를 MSE 로 재생 못 해(window.MediaSource 부재/미지원)
// SpeakerAudioDestination 이 non-MSE 경로를 탄다. 그 경로는 write() 로 버퍼링만 하고 close() 안에서만
// 재생하는데(SpeakerAudioDestination.js — 실 브라우저 MediaSource 가림 실측: wentNonMSE), speech.js 의
// 정상완료 teardown(disposeSynth)이 player.pause() 를 먼저 호출해 privIsPaused=true → notifyPlayback 의
// `if(!privIsPaused) play()` 가 스킵 → 무음(실측: notifyPlayback paused=true, hasSrc=true 인데 소리 없음).
// 데스크톱은 MSE 경로라 write() 중 스트리밍 재생 → close 불필요 → 정상. '데스크톱 됨/iPhone 안 됨'의 뿌리.
describe('speak — non-MSE 경로(iPhone) 재생 트리거', () => {
  function setupNonMSE() {
    const state = { players: [], speakCalls: [] };
    // 실 SpeakerAudioDestination non-MSE 모델: close() 안에서만 재생(privIsPaused 아니면 privAudio.play).
    class FakeNonMSEPlayer {
      constructor() {
        this.privAudioOutputStream = {}; // non-MSE 표시 (MSE 면 privSourceBuffer 가 채워짐)
        this.privIsPaused = false;
        this.privIsClosed = false;
        this.playCalls = 0; this.pauseCalls = 0;
        this.privAudio = { play: () => { this.playCalls += 1; return Promise.resolve(); }, pause: () => {}, addEventListener: () => {} };
        state.players.push(this);
      }
      // 실 SDK close(): blob → notifyPlayback → `if(!privIsPaused) play()`
      close() { if (this.privIsClosed) return; this.privIsClosed = true; if (!this.privIsPaused) this.privAudio.play(); }
      pause() { if (!this.privIsPaused) { this.privIsPaused = true; this.pauseCalls += 1; } }
    }
    class FakeNonMSESynth {
      constructor(_c, ac) { this.player = ac?.player; }
      speakSsmlAsync(ssml, ok) { state.speakCalls.push(ssml); ok({ audioDuration: 1e6 }); } // 0.1s
      close() { try { this.player?.close?.(); } catch (_) { /* noop */ } } // 실 SDK: synth.close → adapter.dispose → destination.close
    }
    vi.stubGlobal('window', {
      SpeechSDK: {
        SpeechConfig: { fromAuthorizationToken: () => ({}) },
        SpeechSynthesizer: FakeNonMSESynth,
        Connection: { fromSynthesizer: () => ({ openConnection: () => {} }) },
        SpeakerAudioDestination: FakeNonMSEPlayer,
        AudioConfig: { fromSpeakerOutput: (p) => ({ player: p }) },
      },
    });
    return state;
  }

  it('합성 성공 시 player.close() 로 재생 트리거 — pause 를 먼저 하지 않는다', async () => {
    const m = setupNonMSE();
    const { Speech } = await import('./speech.js');
    Speech.speak('iphone sentence', { lang: 'en-US' });
    await new Promise((r) => setTimeout(r, 30)); // 합성 성공 처리 후, audioMs(100ms) 전
    const p = m.players.find((x) => x.privIsClosed);
    expect(p).toBeTruthy();                          // 합성 성공 즉시 close 로 재생 트리거
    expect(p.playCalls).toBeGreaterThanOrEqual(1);   // 실제 재생(play) 발생 = 소리 남
    expect(p.pauseCalls).toBe(0);                    // 재생 트리거 시점엔 pause 안 함 (pause 먼저면 무음)
  });
});

/* 429 백오프 (2026-07-22 실측: F0 429 는 1.4초 내 3연속 재시도로 안 풀리고 60초+ 지속) —
 * 429 는 길게(2s/5s) + Retry-After 존중(캡 8s), 5xx/네트워크는 기존 짧은 딜레이 유지. */
describe('retryDelayFor — 429 전용 백오프 + Retry-After 존중', () => {
  it('429: 2000 → 5000 → 소진 null', async () => {
    const { retryDelayFor } = await import('./speech.js');
    expect(retryDelayFor(429, 0, null)).toBe(2000);
    expect(retryDelayFor(429, 1, null)).toBe(5000);
    expect(retryDelayFor(429, 2, null)).toBeNull();
  });

  it('429 + Retry-After 헤더: 초 단위 존중, 8초 캡', async () => {
    const { retryDelayFor } = await import('./speech.js');
    expect(retryDelayFor(429, 0, '3')).toBe(3000);
    expect(retryDelayFor(429, 1, '60')).toBe(8000); // 캡
    expect(retryDelayFor(429, 0, 'garbage')).toBe(2000); // 파싱 불가 → 기본
  });

  it('5xx·네트워크(status 0): 400 → 1000, Retry-After 무시', async () => {
    const { retryDelayFor } = await import('./speech.js');
    expect(retryDelayFor(503, 0, '30')).toBe(400);
    expect(retryDelayFor(503, 1, null)).toBe(1000);
    expect(retryDelayFor(0, 0, null)).toBe(400);
    expect(retryDelayFor(503, 2, null)).toBeNull();
  });
});

/* Azure 실패 → speakWeb 폴백 시에도 화자 변주 유지 (2026-07-22, 다양화 사각 보완).
 * 요청된 Azure voice 이름을 seed 로 로컬 quality 후보 중 하나를 결정적으로 고른다 —
 * 같은 seed 는 항상 같은 voice(일관), 다른 seed 는 후보가 여럿이면 다른 voice(변주). */
describe('pickVoiceVaried — 폴백 화자 변주', () => {
  const mk = (name, lang, extra = {}) => ({ name, lang, default: false, localService: true, ...extra });

  it('seed 결정적: 같은 seed → 같은 voice, 후보 2개면 다른 seed → 다른 voice', async () => {
    const { pickVoiceVaried } = await import('./speech.js');
    const two = [mk('Samantha', 'en-US', { default: true }), mk('Aaron', 'en-US')];
    const a1 = pickVoiceVaried(two, 'en-US', 'a'); // 'a'=97 → 97%2=1
    const b1 = pickVoiceVaried(two, 'en-US', 'b'); // 'b'=98 → 98%2=0
    expect(a1.name).not.toBe(b1.name);
    expect(pickVoiceVaried(two, 'en-US', 'a').name).toBe(a1.name);
  });

  it('seed 없음 → 기존 pickVoice 와 동일 (하위 호환)', async () => {
    const { pickVoiceVaried, pickVoice } = await import('./speech.js');
    const voices = [mk('Samantha', 'en-US', { default: true }), mk('Aaron', 'en-US'), mk('Kyoko', 'ja-JP')];
    expect(pickVoiceVaried(voices, 'en-US')).toBe(pickVoice(voices, 'en-US'));
  });

  it('후보 1개(ja) → seed 무관 항상 그 voice · 후보 0개 → null', async () => {
    const { pickVoiceVaried } = await import('./speech.js');
    const voices = [mk('Kyoko', 'ja-JP')];
    expect(pickVoiceVaried(voices, 'ja-JP', 'x').name).toBe('Kyoko');
    expect(pickVoiceVaried(voices, 'ja-JP', 'yyy').name).toBe('Kyoko');
    expect(pickVoiceVaried([], 'en-US', 'x')).toBeNull();
  });

  it('novelty voice(비 quality)는 후보에서 제외 — 변주 풀은 quality·default 만', async () => {
    const { pickVoiceVaried } = await import('./speech.js');
    const voices = [mk('Samantha', 'en-US', { default: true }), mk('Bahh', 'en-US'), mk('Albert', 'en-US')];
    for (const seed of ['a', 'b', 'c', 'dd', 'eee']) {
      expect(pickVoiceVaried(voices, 'en-US', seed).name).toBe('Samantha');
    }
  });
});

/* 녹음 중 듣기 (2026-08-29) — 재생음이 그대로 녹음에 실리면 점수가 부풀려진다.
 * 라이브 Azure 실측(같은 열화 발화에 TTS 를 섞어 채점):
 *   에코 없음 36 · 10% 35 · 30% 35 · **100% 72** · 말 안 하고 TTS 만 녹음 **96**
 * 오발화 게이트로는 못 막는다 — 섞이는 게 '같은 문장'이라 커버리지도 정확도도 올라간다.
 * 그래서 재생 구간의 마이크 입력은 아예 채점에서 뺀다. 메인·복습·드릴·체이닝·생산 전 경로 공통. */
describe('speech — TTS 재생 구간 배제', () => {
  it('재생 중(hold)에는 무음 자동종료 시계가 진행되지 않는다', async () => {
    const { createSilenceAutoStop: mk } = await import('./speech.js');
    const vad = mk({ speechPeak: 0.08, silencePeak: 0.05, hangoverMs: 1000 });
    expect(vad.feed(0.2, 1000)).toBe(false);   // 발화로 무장
    expect(vad.feed(0.01, 1500)).toBe(false);  // 무음 0.5초 — 아직 미달
    vad.hold(2600);                            // 이 구간은 TTS 재생 중이었다
    expect(vad.feed(0.01, 2700)).toBe(false);  // hold 가 시계를 되짚었으므로 종료 아님
    expect(vad.feed(0.01, 3700)).toBe(true);   // hold 이후 1초 무음 → 종료
  });

  it('무장 전 hold 는 앞 침묵 보호를 깨지 않는다 (재생이 발화로 오인되지 않음)', async () => {
    const { createSilenceAutoStop: mk } = await import('./speech.js');
    const vad = mk({ hangoverMs: 1000 });
    vad.hold(1000);
    expect(vad.speechStarted).toBe(false);
    expect(vad.feed(0.01, 5000)).toBe(false);  // 무장 전이므로 여전히 종료 안 함
  });

  it('speak 재생 중에는 isTtsPlaying() 이 참, onEnd 뒤 거짓', async () => {
    const ended = [];
    vi.stubGlobal('window', {
      speechSynthesis: {
        cancel() {},
        getVoices: () => [{ name: 'Samantha', lang: 'en-US', default: true, localService: true }],
        addEventListener() {},
        speak(u) { ended.push(() => u.onend()); },
      },
      SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
    });
    globalThis.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
    const { Speech, isTtsPlaying } = await import('./speech.js');
    Speech.setSpeechBackend('web');
    expect(isTtsPlaying()).toBe(false);
    Speech.speak('hello there', { lang: 'en-US' });
    await new Promise((r) => setTimeout(r, 5));
    expect(isTtsPlaying()).toBe(true);
    ended[0]();
    expect(isTtsPlaying()).toBe(false);
  });

  it('cancel() 은 재생 표시를 반드시 푼다 (끝내 onEnd 가 안 와도 녹음이 막히지 않게)', async () => {
    vi.stubGlobal('window', {
      speechSynthesis: { cancel() {}, getVoices: () => [], addEventListener() {}, speak() {} },
      SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
    });
    globalThis.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
    const { Speech, isTtsPlaying } = await import('./speech.js');
    Speech.setSpeechBackend('web');
    Speech.speak('x', { lang: 'en-US' });
    await new Promise((r) => setTimeout(r, 5));
    expect(isTtsPlaying()).toBe(true);
    Speech.cancel();
    expect(isTtsPlaying()).toBe(false);
  });
});

/* 배선 검증 — recordWav 가 실제로 재생 구간 청크를 버리는지. 마이크·AudioWorklet 을 mock 해
 * port.onmessage 로 청크를 직접 흘려보낸다 (실기기 마이크 없이 수집 경로를 그대로 태움). */
describe('speech — recordWav 가 TTS 재생 구간 청크를 버린다', () => {
  function setupMic() {
    const held = {};
    class FakeNode {
      constructor() { this.port = { onmessage: null, postMessage() {} }; held.node = this; }
      connect() {} disconnect() {}
    }
    const ac = {
      state: 'running',
      audioWorklet: { addModule: async () => {} },
      createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
      createGain: () => ({ gain: { value: 0 }, connect() {}, disconnect() {} }),
      destination: {},
      resume: async () => {}, close: async () => {},
    };
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ readyState: 'live', stop() {} }] }) } });
    vi.stubGlobal('AudioWorkletNode', FakeNode);
    vi.stubGlobal('window', {
      AudioContext: function () { return ac; },
      AudioWorkletNode: FakeNode,
      speechSynthesis: { cancel() {}, getVoices: () => [{ name: 'Samantha', lang: 'en-US', default: true, localService: true }], addEventListener() {}, speak(u) { held.utter = u; } },
      SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
      addEventListener() {}, removeEventListener() {},
    });
    globalThis.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
    return held;
  }
  const chunk = (v) => { const a = new Int16Array(160); a.fill(v); return a.buffer; };

  it('재생 중 청크는 blob 에 안 담기고, 재생 전후 청크만 담긴다', async () => {
    const held = setupMic();
    const { Speech } = await import('./speech.js');
    Speech.setSpeechBackend('web');
    const p = Speech.recordWav({ maxSeconds: 5 });
    await new Promise((r) => setTimeout(r, 5));
    held.node.port.onmessage({ data: chunk(8000) });     // ① 실제 발화
    const ctrl = await p;

    Speech.speak('reference sentence', { lang: 'en-US' }); // 듣기 — 여기서부터 재생 구간
    await new Promise((r) => setTimeout(r, 30));
    held.node.port.onmessage({ data: chunk(9000) });     // ② 재생음 — 버려져야 한다
    held.node.port.onmessage({ data: chunk(9000) });     // ③ 재생음 — 버려져야 한다
    held.utter.onend();                                  // 재생 종료
    held.node.port.onmessage({ data: chunk(8000) });     // ④ 이어서 말한 발화

    ctrl.stop();
    const blob = await ctrl.blobPromise;
    // WAV 헤더 44 + 청크 2개(①④) × 160샘플 × 2byte = 684. ②③ 가 담겼다면 1004.
    expect(blob.size).toBe(44 + 2 * 160 * 2);
  });
});

/* cancel() 은 재생 종료를 호출부에 알려야 한다 (2026-08-29). 녹음 시작이 재생을 끊게 되면서
 * (sessionAnalyze.startMicRecording) 화면의 '재생 중' 라벨·이퀄라이저가 되돌아올 길이 필요해졌다.
 * 호출부는 전부 speak 의 onEnd 로 상태를 되돌린다 — cancel 이 그걸 안 부르면 라벨이 갇힌다. */
describe('speech — cancel() 이 재생 종료를 통보한다', () => {
  it('진행 중 재생을 cancel 하면 onEnd 가 한 번 불린다', async () => {
    vi.stubGlobal('window', {
      speechSynthesis: { cancel() {}, getVoices: () => [{ name: 'Samantha', lang: 'en-US', default: true, localService: true }], addEventListener() {}, speak() {} },
      SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
    });
    globalThis.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
    const { Speech, isTtsPlaying } = await import('./speech.js');
    Speech.setSpeechBackend('web');
    const onEnd = vi.fn();
    Speech.speak('hello', { lang: 'en-US', onEnd });
    await new Promise((r) => setTimeout(r, 20));
    expect(isTtsPlaying()).toBe(true);
    Speech.cancel();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(isTtsPlaying()).toBe(false);
    Speech.cancel(); // 두 번째 cancel 은 다시 부르지 않는다
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

/* speak 가 speak 를 선점할 때의 재생 표시 누수 (2026-08-29 자체 감사 발견).
 * 선점 경로(진입부 _activeSpeak 강제 중지)는 playbackTimer 만 clear 하고 wrapped onEnd 를 안 불렀다.
 * → _ttsPlaying 이 TTS_HOLD_MAX_MS(30초)까지 새고, 그동안 **활성 녹음의 청크가 전부 버려진다**
 * (recordWav worklet 이 _ttsPlaying>0 이면 폐기). 녹음 중 드릴 행1 재생 → 행2 재생(선점) 순서로 재현. */
describe('speak — 선점 시 이전 재생의 종료 통보 (카운터 누수 방지)', () => {
  function setupSDK() {
    class FakePlayer { constructor() { this.privIsPaused = false; } notifyPlayback() {} pause() {} close() {} }
    class FakeSynth {
      constructor(_c, audioConfig) { this.player = audioConfig?.player; }
      speakSsmlAsync(_ssml, ok) { ok({ audioDuration: 1e7 }); } // 1초 재생
      close() {}
    }
    vi.stubGlobal('window', {
      SpeechSDK: {
        SpeechConfig: { fromAuthorizationToken: () => ({}) },
        SpeechSynthesizer: FakeSynth,
        Connection: { fromSynthesizer: () => ({ openConnection: () => {} }) },
        SpeakerAudioDestination: FakePlayer,
        AudioConfig: { fromSpeakerOutput: (p) => ({ player: p }) },
      },
    });
  }

  it('재생 중 새 speak 가 선점하면 이전 onEnd 가 즉시 1회 불리고, 둘 다 끝나면 isTtsPlaying=false', async () => {
    setupSDK();
    const { Speech, isTtsPlaying } = await import('./speech.js');
    const endA = vi.fn(), endB = vi.fn();
    Speech.speak('first sentence', { lang: 'en-US', onEnd: endA });
    await new Promise((r) => setTimeout(r, 30));       // A 합성 완료, 1초 재생 대기 중
    expect(isTtsPlaying()).toBe(true);
    Speech.speak('second sentence', { lang: 'en-US', onEnd: endB }); // B 가 A 를 선점
    await new Promise((r) => setTimeout(r, 30));
    expect(endA).toHaveBeenCalledTimes(1);             // 선점 즉시 통보 — 30초 누수 없음
    await new Promise((r) => setTimeout(r, 1100));     // B 재생 종료
    expect(endB).toHaveBeenCalledTimes(1);
    expect(endA).toHaveBeenCalledTimes(1);             // 중복 통보 없음
    expect(isTtsPlaying()).toBe(false);                // 카운터 0 — 녹음 청크 폐기 없음
  });
});

/* 재감사 발견 2건 고정 (2026-08-29):
 * ① pre-roll 오염 — TTS 구간 게이트가 링 갱신 전에 return 해, 재생 직후 시작한 녹음의 pre-roll 에
 *   '재생 전 0.5초'(오래된 오디오·직전 발화 꼬리)가 붙었다. 재생 중엔 링을 비운다.
 * ② ttsHold 배선이 어떤 테스트로도 고정돼 있지 않았다 — 지우면 전 테스트 통과인데 실동작은
 *   '재생 끝나자마자 즉시 자동종료'로 무너진다. */
describe('speech — TTS 구간의 pre-roll 격리와 자동종료 억제', () => {
  function setupMic() {
    const held = {};
    class FakeNode {
      constructor() { this.port = { onmessage: null, postMessage() {} }; held.node = this; }
      connect() {} disconnect() {}
    }
    const ac = {
      state: 'running',
      audioWorklet: { addModule: async () => {} },
      createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
      createGain: () => ({ gain: { value: 0 }, connect() {}, disconnect() {} }),
      destination: {}, resume: async () => {}, close: async () => {},
    };
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ readyState: 'live', stop() {} }] }) } });
    vi.stubGlobal('AudioWorkletNode', FakeNode);
    vi.stubGlobal('window', {
      AudioContext: function () { return ac; },
      AudioWorkletNode: FakeNode,
      speechSynthesis: { cancel() {}, getVoices: () => [{ name: 'S', lang: 'en-US', default: true, localService: true }], addEventListener() {}, speak(u) { held.utter = u; } },
      SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
      addEventListener() {}, removeEventListener() {},
    });
    globalThis.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
    return held;
  }
  const chunk = (v) => { const a = new Int16Array(160); a.fill(v); return a.buffer; };

  it('재생 중 링을 비운다 — 재생 직후 녹음의 pre-roll 에 옛 오디오가 붙지 않는다', async () => {
    const held = setupMic();
    const { Speech } = await import('./speech.js');
    Speech.setSpeechBackend('web');
    // 워밍 마이크를 세운 뒤 즉시 종료 — 이후 대기 상태에서 링이 쌓인다
    const warm = await Speech.recordWav({ maxSeconds: 5 });
    warm.stop(); await warm.blobPromise;
    held.node.port.onmessage({ data: chunk(7000) });     // 재생 전 발화 꼬리 → 링에 쌓임
    Speech.speak('reference', { lang: 'en-US' });         // 재생 시작
    await new Promise((r) => setTimeout(r, 30));
    held.node.port.onmessage({ data: chunk(9000) });     // 재생 중 — 폐기 + 링 비움
    held.utter.onend();                                   // 재생 종료
    // 워밍 재사용 경로의 캡처 라이브 게이트(첫 청크 대기 2초)를 피해, 대기 중에 청크를 흘린다
    const recP = Speech.recordWav({ maxSeconds: 5 });
    await new Promise((r) => setTimeout(r, 10));
    held.node.port.onmessage({ data: chunk(8000) });     // 실제 발화 (게이트 해제 겸)
    const rec = await recP;
    rec.stop();
    const blob = await rec.blobPromise;
    expect(blob.size).toBe(44 + 1 * 160 * 2);            // 발화 1청크만 — 링 이월분(7000) 없음
  });

  it('재생이 길어도 자동종료가 발화 종점으로 오인하지 않는다 (ttsHold 배선 고정)', async () => {
    const held = setupMic();
    const { Speech } = await import('./speech.js');
    Speech.setSpeechBackend('web');
    const stopped = vi.fn();
    const rec = await Speech.recordWav({ maxSeconds: 10, autoStopSilenceMs: 300, onAutoStop: stopped });
    held.node.port.onmessage({ data: chunk(20000) });    // 무장 (큰 발화)
    Speech.speak('reference', { lang: 'en-US' });         // 듣기 시작
    for (let i = 0; i < 5; i++) {                         // 재생 400ms — 폐기 구간, hold 가 시계를 되짚어야
      await new Promise((r) => setTimeout(r, 80));
      held.node.port.onmessage({ data: chunk(0) });
    }
    held.utter.onend();                                   // 재생 종료
    held.node.port.onmessage({ data: chunk(0) });        // 직후 무음 1청크
    expect(stopped).not.toHaveBeenCalled();               // hold 없으면 여기서 즉시 자동종료된다
    await new Promise((r) => setTimeout(r, 350));
    held.node.port.onmessage({ data: chunk(0) });        // hangover 경과 후 무음 → 정상 자동종료
    expect(stopped).toHaveBeenCalledTimes(1);
    rec.stop(); await rec.blobPromise;
  });
});
