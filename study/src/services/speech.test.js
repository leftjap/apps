import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { pickVoice, buildAzureSSML, VOICE_DEFAULTS, SPEAKER_VOICES, normalizeReferenceText } from './speech.js';

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

  it('NoMatch 응답 → mock 폴백', async () => {
    _fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('/functions/v1/azure-token')) {
        return new Response(
          JSON.stringify({ token: FAKE_TOKEN, region: FAKE_REGION, expiresAt: Date.now() + 9 * 60 * 1000 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ RecognitionStatus: 'NoMatch' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    const fakeBlob = new Blob([new ArrayBuffer(100)], { type: 'audio/wav' });
    const result = await Speech.analyzeWavRest(fakeBlob, 'hello');
    expect(result.mockFallback).toBe(true);
    expect(result.fallbackReason).toBe('no_match');
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

  it('STT 지속 429 → 재시도 소진(총 3회) 후 mock 폴백 azure_recognize_fail', async () => {
    let stt = 0;
    _fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('/functions/v1/azure-token')) return token200();
      if (String(url).includes('.stt.speech.microsoft.com/')) { stt += 1; return new Response('throttled', { status: 429 }); }
      return new Response('nf', { status: 404 });
    });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    const result = await Speech.analyzeWavRest(blob(), 'hi');
    expect(stt).toBe(3); // 최초 1 + 재시도 2
    expect(result.mockFallback).toBe(true);
    expect(result.fallbackReason).toBe('azure_recognize_fail');
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

// Wave A.18 — near-silent 캡처 가드. 마이크(특히 블루투스)가 음성을 거의 못 잡은 회차를
// Azure 에 보내면 무의미한 저점("들쭉날쭉")이 나옴 → 점수 매기지 말고 재시도 유도.
describe('speech — Wave A.18 near-silent 캡처 가드', () => {
  const token200 = () => new Response(
    JSON.stringify({ token: FAKE_TOKEN, region: FAKE_REGION, expiresAt: Date.now() + 9 * 60 * 1000 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
  // amplitude 진폭의 16kHz mono WAV blob (samples 개)
  const makeWav = (amplitude, samples) => {
    const buf = new ArrayBuffer(44 + samples * 2);
    const pcm = new Int16Array(buf, 44);
    for (let i = 0; i < samples; i++) pcm[i] = Math.round(Math.sin(i * 0.2) * amplitude);
    return new Blob([buf], { type: 'audio/wav' });
  };

  it('충분히 긴 near-silent 녹음 → Azure 미호출 + too_quiet mock 폴백', async () => {
    let sttCalled = 0;
    _fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('/functions/v1/azure-token')) return token200();
      if (String(url).includes('.stt.speech.microsoft.com/')) { sttCalled += 1; return new Response('{}', { status: 200 }); }
      return new Response('nf', { status: 404 });
    });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    // 1초(16000 샘플), 진폭 30 → rms ≈ 0.0006 (임계 미만)
    const result = await Speech.analyzeWavRest(makeWav(30, 16000), 'hi');
    expect(sttCalled).toBe(0);                 // Azure STT 미호출
    expect(result.mockFallback).toBe(true);
    expect(result.fallbackReason).toBe('too_quiet');
  });

  it('정상 음량 녹음 → 가드 통과, Azure 호출', async () => {
    let sttCalled = 0;
    const REST_OK = { RecognitionStatus: 'Success', DisplayText: 'hi', NBest: [{ Display: 'hi', AccuracyScore: 88, PronScore: 90, Words: [] }] };
    _fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('/functions/v1/azure-token')) return token200();
      if (String(url).includes('.stt.speech.microsoft.com/')) { sttCalled += 1; return new Response(JSON.stringify(REST_OK), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
      return new Response('nf', { status: 404 });
    });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    // 1초, 진폭 10000 → rms ≈ 0.22 (임계 초과)
    const result = await Speech.analyzeWavRest(makeWav(10000, 16000), 'hi');
    expect(sttCalled).toBe(1);
    expect(result.score).toBe(88);
    expect(result.mockFallback).toBeUndefined();
    // Wave A.18.1 — 캡처 레벨(rms)을 진단용으로 반환 (진폭 10000 sine → rms ≈ 0.22)
    expect(result.captureRms).toBeGreaterThan(0.1);
  });

  it('아주 짧은 클립(가드 미적용 길이) → near-silent 여도 Azure 진행 (회귀 보호)', async () => {
    let sttCalled = 0;
    const REST_OK = { RecognitionStatus: 'Success', DisplayText: 'hi', NBest: [{ Display: 'hi', AccuracyScore: 80, Words: [] }] };
    _fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('/functions/v1/azure-token')) return token200();
      if (String(url).includes('.stt.speech.microsoft.com/')) { sttCalled += 1; return new Response(JSON.stringify(REST_OK), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
      return new Response('nf', { status: 404 });
    });
    const { Speech } = await import('./speech.js');
    Speech.clearAzureTokenCache();
    // 100 샘플(0.006s) — 가드 길이 미만 → 기존 동작 유지
    const result = await Speech.analyzeWavRest(makeWav(0, 100), 'hi');
    expect(sttCalled).toBe(1);
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
