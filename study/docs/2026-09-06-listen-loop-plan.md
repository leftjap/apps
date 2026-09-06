# 연속 듣기 (Listen Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 배운 기본 문장 전체를 "한글 → 외국어" 순으로 소리 파일 하나로 합성해 `<audio loop>` 로 무한 반복 재생하는 화면(`#/listen`)과 홈 진입 버튼을 만든다.

**Architecture:** 서비스 `src/services/listenAudio.js` 가 문장 쌍 → SSML(25쌍 묶음) → Azure 합성(스피커 없이 `audioData`) → PCM 이어 붙이기 → WAV Blob 을 담당한다. 페이지 `src/pages/listen.js` 가 복습 큐를 읽어 서비스를 호출하고, `<audio>` 하나와 Media Session 으로 재생을 소유한다. 홈 CTA 카드에 4번째 버튼을 추가한다. 백그라운드에서 JS 가 필요 없도록 반복은 `loop` 속성에만 맡긴다.

**Tech Stack:** Vanilla JS (ES modules), Dexie(`window.studyDB`), Azure Speech SDK (`window.SpeechSDK`, `getAzureToken`/`loadSpeechSDK` 재사용), vitest(jsdom 은 파일 상단 지시자), Vite PWA.

**Spec:** `study/specs/study-app-spec.md` §9-8 "연속 듣기" (+ §2 화면 구조). 검증 근거: `~/apps/lessons/ios-simulator-web-audio-lock-verification.md`.

## Global Constraints

- 범위: `reviewQueue.where('lang').equals(lang)` 전체, 순서는 `buildSentenceRows` 와 동일. 응용·체이닝 문장 제외.
- 텍스트: 외국어 = `card.sentence`, 한글 = `card.meaning || card.ko`. 한글의 괄호 힌트는 **제거하고 읽는다** (`(…)`, `（…）`).
- 목소리: 한글 `ko-KR-SunHiNeural`, 외국어 `VOICE_DEFAULTS[ttsLang].voice` (en Aria / ja Aoi), 외국어 `rate="0.85"`.
- 쉼: 한글 뒤 `2000ms`, 외국어 뒤 `1000ms`, `<mstts:silence type="Tailing-exact">` 사용 (상수).
- 묶음: 25쌍(= voice 태그 50개)씩. 출력 `riff-24khz-16bit-mono-pcm` (`SDK.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm`), `new SDK.SpeechSynthesizer(config, null)`.
- 합성 실패 시 Web Speech 폴백 **없음**. 안내 + "다시 시도" 만.
- 재생: 페이지 소유 `<audio>` 1개, `loop=true`, Blob URL, 사용자 탭 안에서 `play()`. Media Session 제목 `연속 듣기 · {영어|일본어} N문장`, play/pause 핸들러. 화면을 떠나면 `pause()` + `revokeObjectURL`.
- 홈: `ctaCard()` 의 4번째 `.vh-cta sec` 버튼 "연속 듣기" / "한글 뒤 {영어|일본어} · 무한 반복 · 잠금 중에도 재생" / 우측 "듣기". `isMath` 면 없음.
- 데모 주입 규약: 페이지는 `window.studyListen?.synthesize` 가 있으면 그것을 합성기로 쓴다 (기존 `window.studySpeech` 데모 규약과 동일한 방식). 프로덕션에서는 미정의.
- 커밋: Conventional Commits, 이 세션 파일만. Stop 훅 WIP 스냅샷 2건(`593ee0e`, `c74aec1`, launch.json)은 `git reset --soft HEAD~2` 로 합친 뒤 launch.json 은 스테이지에서 제외(내용이 원본과 같음).

---

### Task 1: listenAudio — 순수 함수 (괄호 제거 · 묶음 · SSML)

**Files:**
- Create: `src/services/listenAudio.js`
- Test: `src/services/listenAudio.test.js`

**Interfaces:**
- Produces:
  - `stripParenHints(text: string): string` — `(…)`/`（…）` 구간 제거, 공백 정리.
  - `chunkPairs(pairs: {ko:string, fo:string}[], size = 25): {ko,fo}[][]`
  - `buildListenSSML(pairs, { ttsLang: 'en-US'|'ja-JP', koVoice = 'ko-KR-SunHiNeural', foVoice, rate = 0.85, koGapMs = 2000, foGapMs = 1000 }): string`
  - 상수 `LISTEN_CHUNK = 25`, `KO_VOICE = 'ko-KR-SunHiNeural'`, `KO_GAP_MS = 2000`, `FO_GAP_MS = 1000`.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/services/listenAudio.test.js
import { describe, it, expect } from 'vitest';
import { stripParenHints, chunkPairs, buildListenSSML, LISTEN_CHUNK } from './listenAudio.js';

describe('stripParenHints — 한글 괄호 힌트는 읽지 않는다 (2026-09-06 Azure 실측: 괄호 단어가 발화됨)', () => {
  it('앞 괄호 · 중간 괄호 · 전각 괄호를 지우고 공백을 정리한다', () => {
    expect(stripParenHints('(무슨) 문제가 있나요?')).toBe('문제가 있나요?');
    expect(stripParenHints('식욕(입맛)이 없어요.')).toBe('식욕이 없어요.');
    expect(stripParenHints('그냥（소문）일 뿐이에요')).toBe('그냥일 뿐이에요');
    expect(stripParenHints('  힘든  하루였어요. ')).toBe('힘든 하루였어요.');
  });
  it('괄호가 없으면 그대로', () => {
    expect(stripParenHints('그냥 넘어가죠.')).toBe('그냥 넘어가죠.');
  });
});

describe('chunkPairs — Azure 요청당 voice 태그 50개 한도 → 25쌍', () => {
  it('26쌍은 25 + 1 로 나뉜다', () => {
    const pairs = Array.from({ length: 26 }, (_, i) => ({ ko: `k${i}`, fo: `f${i}` }));
    const chunks = chunkPairs(pairs);
    expect(LISTEN_CHUNK).toBe(25);
    expect(chunks.map((c) => c.length)).toEqual([25, 1]);
    expect(chunks[1][0]).toEqual({ ko: 'k25', fo: 'f25' });
  });
  it('빈 배열은 빈 묶음', () => { expect(chunkPairs([])).toEqual([]); });
});

describe('buildListenSSML — 한글 voice → 외국어 voice 번갈아, 쉼은 Tailing-exact', () => {
  const pairs = [{ ko: '문제가 있나요?', fo: 'Is there a problem?' }, { ko: 'A & B', fo: 'Tom & <Jerry>' }];
  it('voice 태그가 쌍마다 2개, 순서는 ko 먼저', () => {
    const ssml = buildListenSSML(pairs, { ttsLang: 'en-US', foVoice: 'en-US-AriaNeural' });
    expect(ssml.startsWith('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="ko-KR">')).toBe(true);
    expect(ssml.match(/<voice /g)).toHaveLength(4);
    const koIdx = ssml.indexOf('ko-KR-SunHiNeural'); const foIdx = ssml.indexOf('en-US-AriaNeural');
    expect(koIdx).toBeGreaterThan(-1); expect(foIdx).toBeGreaterThan(koIdx);
  });
  it('쉼 2000ms/1000ms · 외국어에만 prosody rate 0.85', () => {
    const ssml = buildListenSSML(pairs, { ttsLang: 'en-US', foVoice: 'en-US-AriaNeural' });
    expect(ssml).toContain('<voice name="ko-KR-SunHiNeural"><mstts:silence type="Tailing-exact" value="2000ms"/>문제가 있나요?</voice>');
    expect(ssml).toContain('<voice name="en-US-AriaNeural"><mstts:silence type="Tailing-exact" value="1000ms"/><prosody rate="0.85">Is there a problem?</prosody></voice>');
  });
  it('XML 특수문자를 이스케이프한다', () => {
    const ssml = buildListenSSML(pairs, { ttsLang: 'en-US', foVoice: 'en-US-AriaNeural' });
    expect(ssml).toContain('A &amp; B');
    expect(ssml).toContain('Tom &amp; &lt;Jerry&gt;');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd ~/apps/study && pnpm vitest run src/services/listenAudio.test.js`
Expected: FAIL — `Failed to resolve import "./listenAudio.js"`

- [ ] **Step 3: 최소 구현**

```js
// src/services/listenAudio.js
/**
 * 연속 듣기 — 배운 문장 전체를 "한글 → 외국어" 순으로 소리 파일 하나로 만든다 (spec §9-8).
 * 문장마다 재생을 이어 붙이면 잠금 상태에서 JS 가 깨어나야 해 끊기므로, 오디오 한 개 + <audio loop> 로 간다.
 * 합성은 Azure 요청당 voice 태그 50개·오디오 10분 한도에 맞춰 25쌍씩 묶고, 결과 PCM 을 이어 붙인다.
 */
import { getAzureToken, loadSpeechSDK, pcmToWavBlob } from './speech.js';

export const LISTEN_CHUNK = 25;            // 쌍/요청 (= voice 태그 50개)
export const KO_VOICE = 'ko-KR-SunHiNeural';
export const KO_GAP_MS = 2000;             // 한글 뒤 — 떠올릴 틈 (사용자 취향값)
export const FO_GAP_MS = 1000;             // 외국어 뒤
export const SAMPLE_RATE = 24000;          // riff-24khz-16bit-mono-pcm

/** 한글 뜻의 괄호 힌트 제거 — TTS 가 괄호 안 단어를 실제로 읽는다 (2026-09-06 실측 +0.8초/단어). */
export function stripParenHints(text) {
  return String(text ?? '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function chunkPairs(pairs, size = LISTEN_CHUNK) {
  const out = [];
  for (let i = 0; i < pairs.length; i += size) out.push(pairs.slice(i, i + size));
  return out;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function buildListenSSML(pairs, { ttsLang, koVoice = KO_VOICE, foVoice, rate = 0.85, koGapMs = KO_GAP_MS, foGapMs = FO_GAP_MS }) {
  const body = pairs.map(({ ko, fo }) =>
    `<voice name="${koVoice}"><mstts:silence type="Tailing-exact" value="${koGapMs}ms"/>${escapeXml(ko)}</voice>`
    + `<voice name="${foVoice}"><mstts:silence type="Tailing-exact" value="${foGapMs}ms"/><prosody rate="${rate}">${escapeXml(fo)}</prosody></voice>`).join('');
  void ttsLang; // 루트 xml:lang 은 한글로 고정 — voice 마다 언어가 정해지므로 값에 영향 없음
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="ko-KR">${body}</speak>`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/services/listenAudio.test.js`
Expected: PASS (3 describe, 7 tests)

- [ ] **Step 5: 커밋은 Task 6 에서 한 번에** (WIP 스냅샷 훅이 중간 커밋을 만들 수 있으나 그대로 둔다)

---

### Task 2: listenAudio — WAV 이어 붙이기 + 빌드 오케스트레이션

**Files:**
- Modify: `src/services/listenAudio.js`
- Test: `src/services/listenAudio.test.js`

**Interfaces:**
- Consumes: Task 1 의 `chunkPairs`, `buildListenSSML`; `pcmToWavBlob(int16, sampleRate)` (speech.js 774행, 44바이트 헤더 + Int16 PCM 을 `audio/wav` Blob 으로).
- Produces:
  - `wavPcm(buffer: ArrayBuffer): Int16Array` — RIFF 청크를 순회해 `data` 청크의 Int16 뷰를 돌려준다. `RIFF`/`WAVE` 가 아니면 throw.
  - `concatWav(buffers: ArrayBuffer[]): { int16: Int16Array, seconds: number }`
  - `buildListenAudio(pairs, { ttsLang, foVoice, onProgress?, synthesize = synthesizeChunk }): Promise<{ blob: Blob, seconds: number, count: number }>` — `onProgress({ done, total })` 는 묶음 하나가 끝날 때마다.

- [ ] **Step 1: 실패하는 테스트 추가**

```js
// src/services/listenAudio.test.js (이어서)
import { wavPcm, concatWav, buildListenAudio, SAMPLE_RATE } from './listenAudio.js';

/** 테스트용 WAV: 44바이트 헤더 + n 샘플(값 = fill) */
function makeWav(n, fill = 1, sampleRate = SAMPLE_RATE) {
  const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  new Int16Array(buf, 44).fill(fill);
  return buf;
}

describe('wavPcm / concatWav — 묶음 WAV 의 헤더를 벗기고 PCM 을 잇는다', () => {
  it('data 청크만 뷰로 돌려준다', () => {
    const pcm = wavPcm(makeWav(10, 7));
    expect(pcm.length).toBe(10); expect(pcm[0]).toBe(7);
  });
  it('RIFF 가 아니면 throw', () => {
    expect(() => wavPcm(new ArrayBuffer(50))).toThrow(/RIFF/);
  });
  it('두 묶음을 순서대로 잇고 길이를 초로 준다', () => {
    const { int16, seconds } = concatWav([makeWav(24000, 1), makeWav(12000, 2)]);
    expect(int16.length).toBe(36000); expect(int16[0]).toBe(1); expect(int16[24000]).toBe(2);
    expect(seconds).toBeCloseTo(1.5, 5);
  });
});

describe('buildListenAudio — 묶음별 합성을 병렬로 돌리고 진행률을 알린다', () => {
  const pairs = Array.from({ length: 26 }, (_, i) => ({ ko: `k${i}`, fo: `f${i}` }));
  it('26쌍 → 2요청, 순서 보존, Blob 하나', async () => {
    const calls = []; const progress = [];
    const synthesize = async (ssml) => { calls.push(ssml); return makeWav(ssml.includes('k25') ? 100 : 200, ssml.includes('k25') ? 9 : 3); };
    const out = await buildListenAudio(pairs, { ttsLang: 'en-US', foVoice: 'en-US-AriaNeural', synthesize, onProgress: (p) => progress.push({ ...p }) });
    expect(calls).toHaveLength(2);
    expect(out.count).toBe(26);
    expect(out.blob.type).toBe('audio/wav');
    expect(out.seconds).toBeCloseTo(300 / SAMPLE_RATE, 6);
    expect(progress).toEqual([{ done: 1, total: 2 }, { done: 2, total: 2 }]);
    const pcm = wavPcm(await out.blob.arrayBuffer());
    expect(pcm[0]).toBe(3); expect(pcm[200]).toBe(9); // 첫 묶음 200샘플 뒤에 둘째 묶음
  });
  it('한 묶음이라도 실패하면 전체가 reject (폴백 없음)', async () => {
    const synthesize = async (ssml) => { if (ssml.includes('k25')) throw new Error('boom'); return makeWav(10); };
    await expect(buildListenAudio(pairs, { ttsLang: 'en-US', foVoice: 'en-US-AriaNeural', synthesize })).rejects.toThrow('boom');
  });
  it('문장이 없으면 reject', async () => {
    await expect(buildListenAudio([], { ttsLang: 'en-US', foVoice: 'x', synthesize: async () => makeWav(1) })).rejects.toThrow(/문장/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/services/listenAudio.test.js`
Expected: FAIL — `wavPcm is not a function` 계열

- [ ] **Step 3: 구현**

```js
// src/services/listenAudio.js (이어서)
/** RIFF/WAVE 의 data 청크를 Int16 뷰로. Azure riff-* 출력은 44바이트 표준 헤더지만 청크 순회로 안전하게 찾는다. */
export function wavPcm(buffer) {
  const v = new DataView(buffer);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (buffer.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('RIFF/WAVE 가 아닙니다');
  let off = 12;
  while (off + 8 <= buffer.byteLength) {
    const id = tag(off); const size = v.getUint32(off + 4, true);
    if (id === 'data') {
      const avail = buffer.byteLength - (off + 8);
      const len = Math.min(size, avail);
      return new Int16Array(buffer, off + 8, Math.floor(len / 2));
    }
    off += 8 + size + (size % 2);
  }
  throw new Error('data 청크가 없습니다');
}

export function concatWav(buffers) {
  const parts = buffers.map(wavPcm);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const int16 = new Int16Array(total);
  let off = 0;
  for (const p of parts) { int16.set(p, off); off += p.length; }
  return { int16, seconds: total / SAMPLE_RATE };
}

/** Azure 합성 1요청 — 스피커 없이(audioConfig=null) audioData(헤더 포함 WAV)만 받는다.
 * SDK 는 실패도 success 콜백에 reason=Canceled 로 넘기므로 audioData 유무로 판정한다. */
export async function synthesizeChunk(ssml) {
  const [{ token, region }, SDK] = await Promise.all([getAzureToken(), loadSpeechSDK()]);
  const config = SDK.SpeechConfig.fromAuthorizationToken(token, region);
  config.speechSynthesisOutputFormat = SDK.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
  const synth = new SDK.SpeechSynthesizer(config, null);
  const close = () => { try { synth.close(); } catch (_) { /* noop */ } };
  return new Promise((resolve, reject) => {
    synth.speakSsmlAsync(ssml, (result) => {
      close();
      const data = result?.audioData;
      if (data && data.byteLength > 44) resolve(data);
      else reject(new Error(result?.errorDetails || '합성 실패'));
    }, (err) => { close(); reject(err instanceof Error ? err : new Error(String(err))); });
  });
}

export async function buildListenAudio(pairs, { ttsLang, foVoice, onProgress, synthesize = synthesizeChunk }) {
  if (!pairs?.length) throw new Error('들을 문장이 없습니다');
  const chunks = chunkPairs(pairs);
  let done = 0;
  const buffers = await Promise.all(chunks.map(async (chunk) => {
    const buf = await synthesize(buildListenSSML(chunk, { ttsLang, foVoice }));
    done += 1; onProgress?.({ done, total: chunks.length });
    return buf;
  }));
  const { int16, seconds } = concatWav(buffers);
  return { blob: pcmToWavBlob(int16, SAMPLE_RATE), seconds, count: pairs.length };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/services/listenAudio.test.js`
Expected: PASS

---

### Task 3: synthesizeChunk — SDK 호출 계약 (가짜 SpeechSDK)

**Files:**
- Test: `src/services/listenAudio.test.js`

**Interfaces:**
- Consumes: Task 2 의 `synthesizeChunk(ssml)`; `getAzureToken` 는 vi.mock 으로 대체.

- [ ] **Step 1: 실패하는 테스트 추가** (speech.test.js 의 `vi.stubGlobal('window', { SpeechSDK })` 패턴)

```js
// src/services/listenAudio.test.js (이어서)
import { vi, afterEach } from 'vitest';
vi.mock('./speech.js', async (orig) => {
  const m = await orig();
  return { ...m, getAzureToken: vi.fn(async () => ({ token: 'tok', region: 'koreacentral', expiresAt: Date.now() + 600000 })) };
});
import { synthesizeChunk } from './listenAudio.js';

describe('synthesizeChunk — 스피커 없이, riff-24khz 로, audioData 를 돌려준다', () => {
  afterEach(() => vi.unstubAllGlobals());
  function fakeSDK(result, { throwErr } = {}) {
    const state = { ctor: [], closed: 0, ssml: null, format: null };
    class FakeSynth {
      constructor(config, audioConfig) { state.ctor.push({ config, audioConfig }); state.format = config.speechSynthesisOutputFormat; }
      speakSsmlAsync(ssml, ok, err) { state.ssml = ssml; if (throwErr) err(throwErr); else ok(result); }
      close() { state.closed += 1; }
    }
    vi.stubGlobal('window', { SpeechSDK: {
      SpeechConfig: { fromAuthorizationToken: (t, r) => ({ token: t, region: r }) },
      SpeechSynthesisOutputFormat: { Riff24Khz16BitMonoPcm: 12 },
      SpeechSynthesizer: FakeSynth,
    } });
    return state;
  }
  it('audioConfig=null · 출력 포맷 12 · 결과 audioData resolve · synth close', async () => {
    const st = fakeSDK({ audioData: makeWav(5), reason: 8 });
    const out = await synthesizeChunk('<speak/>');
    expect(out.byteLength).toBe(44 + 10);
    expect(st.ctor[0].audioConfig).toBeNull();
    expect(st.format).toBe(12);
    expect(st.ssml).toBe('<speak/>');
    expect(st.closed).toBe(1);
  });
  it('reason=Canceled(audioData 없음)면 errorDetails 로 reject', async () => {
    fakeSDK({ reason: 1, errorDetails: 'WebSocket upgrade failed' });
    await expect(synthesizeChunk('<speak/>')).rejects.toThrow('WebSocket upgrade failed');
  });
  it('err 콜백도 reject', async () => {
    fakeSDK(null, { throwErr: 'boom' });
    await expect(synthesizeChunk('<speak/>')).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: 실행** — Task 2 구현이 이미 계약을 만족하므로 PASS 가 기대값. FAIL 이면 구현을 고친다(테스트를 고치지 않는다).

Run: `pnpm vitest run src/services/listenAudio.test.js`
Expected: PASS (전체)

---

### Task 4: listen 페이지 + 라우트 + 데모 셸

**Files:**
- Create: `src/pages/listen.js`, `mocks/listen.html`
- Modify: `src/app.js` (ROUTES/PAGE_MOUNTS 에 `listen`)
- Test: `src/pages/listen.test.js`

**Interfaces:**
- Consumes: `buildListenAudio(pairs, { ttsLang, foVoice, onProgress, synthesize })` (Task 2), `stripParenHints` (Task 1), `buildSentenceRows(cards, logs, pron, todayISO)` (`src/pages/sentences.js`, 정렬 재사용), `VOICE_DEFAULTS` (`src/services/speech.js`), `h` (`src/components/d1/dom.js`: `h(tag, attrs, ...children)`, `onClick` 지원), `V_VARS`, `v2Style`, `ensureV2Fonts`, `vIcon`, `VI` (`src/components/v2/atoms.js`).
- Produces:
  - `buildListenPairs(cards, todayISO): {ko, fo}[]` — 정렬 후 `{ ko: stripParenHints(meaning||ko), fo: sentence }`, 둘 중 하나라도 비면 제외.
  - `listenTitle(lang, count, seconds): string` — `영어 119문장 · 한 바퀴 약 12분` (분은 반올림, 최소 1).
  - `mountListen(host): () => void`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/pages/listen.test.js
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const M = vi.hoisted(() => ({ buildListenAudio: vi.fn() }));
vi.mock('../services/listenAudio.js', async (orig) => ({ ...(await orig()), buildListenAudio: M.buildListenAudio }));

import { buildListenPairs, listenTitle, mountListen } from './listen.js';

const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const CARDS = [
  { id: 'b', lang: 'en', sentence: 'Is there a problem?', meaning: '(무슨) 문제가 있나요?', order_index: 2 },
  { id: 'a', lang: 'en', sentence: 'I have no appetite.', meaning: '식욕(입맛)이 없어요.', order_index: 1 },
  { id: 'c', lang: 'en', sentence: '', meaning: '빈 문장' },
];

describe('buildListenPairs / listenTitle', () => {
  it('order_index 순으로, 괄호 힌트를 지우고, 빈 문장은 뺀다', () => {
    expect(buildListenPairs(CARDS, '2026-09-06')).toEqual([
      { ko: '식욕이 없어요.', fo: 'I have no appetite.' },
      { ko: '문제가 있나요?', fo: 'Is there a problem?' },
    ]);
  });
  it('제목 — 언어·문장 수·한 바퀴 분', () => {
    expect(listenTitle('en', 119, 733)).toBe('영어 119문장 · 한 바퀴 약 12분');
    expect(listenTitle('ja', 26, 20)).toBe('일본어 26문장 · 한 바퀴 약 1분');
  });
});

describe('mountListen — 만들기 → 재생/일시정지 → 정리', () => {
  let host, play, pause, handlers;
  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host);
    sessionStorage.setItem('studyLang', 'en');
    window.studyDB = { reviewQueue: { where: () => ({ equals: () => ({ toArray: async () => CARDS }) }) } };
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () { Object.defineProperty(this, 'paused', { value: false, configurable: true }); return Promise.resolve(); });
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () { Object.defineProperty(this, 'paused', { value: true, configurable: true }); });
    global.URL.createObjectURL = vi.fn(() => 'blob:fake'); global.URL.revokeObjectURL = vi.fn();
    handlers = {};
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: { metadata: null, playbackState: 'none', setActionHandler: (k, f) => { handlers[k] = f; } } });
    global.MediaMetadata = class { constructor(o) { Object.assign(this, o); } };
    M.buildListenAudio.mockReset();
  });
  afterEach(() => { host.remove(); vi.restoreAllMocks(); });

  it('진입 시 소리를 만들고, 제목과 재생 버튼을 보여준다 (자동 재생 없음)', async () => {
    M.buildListenAudio.mockImplementation(async (pairs, { onProgress }) => { onProgress({ done: 1, total: 1 }); return { blob: new Blob(['x'], { type: 'audio/wav' }), seconds: 12.4, count: pairs.length }; });
    mountListen(host); await flush();
    expect(M.buildListenAudio).toHaveBeenCalledTimes(1);
    expect(M.buildListenAudio.mock.calls[0][0]).toHaveLength(2);
    expect(M.buildListenAudio.mock.calls[0][1].ttsLang).toBe('en-US');
    expect(M.buildListenAudio.mock.calls[0][1].foVoice).toBe('en-US-AriaNeural');
    expect(host.textContent).toContain('영어 2문장 · 한 바퀴 약 1분');
    expect(play).not.toHaveBeenCalled();
    const audio = host.querySelector('audio');
    expect(audio.loop).toBe(true); expect(audio.getAttribute('src')).toBe('blob:fake');
  });
  it('재생 버튼 → play + Media Session 제목, 다시 누르면 pause', async () => {
    M.buildListenAudio.mockResolvedValue({ blob: new Blob(['x'], { type: 'audio/wav' }), seconds: 60, count: 2 });
    mountListen(host); await flush();
    host.querySelector('[data-role="play"]').click(); await flush();
    expect(play).toHaveBeenCalledTimes(1);
    expect(navigator.mediaSession.metadata.title).toBe('연속 듣기 · 영어 2문장');
    expect(typeof handlers.play).toBe('function'); expect(typeof handlers.pause).toBe('function');
    host.querySelector('[data-role="play"]').click(); await flush();
    expect(pause).toHaveBeenCalledTimes(1);
  });
  it('합성 실패 → 안내 + 다시 시도 (Web Speech 폴백 없음)', async () => {
    M.buildListenAudio.mockRejectedValueOnce(new Error('token')).mockResolvedValueOnce({ blob: new Blob(['x']), seconds: 5, count: 2 });
    mountListen(host); await flush();
    expect(host.textContent).toContain('소리를 만들지 못했어요');
    expect(window.speechSynthesis?.speak).toBeUndefined();
    host.querySelector('[data-role="retry"]').click(); await flush();
    expect(M.buildListenAudio).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[data-role="play"]')).not.toBeNull();
  });
  it('문장이 없으면 안내만', async () => {
    window.studyDB.reviewQueue.where = () => ({ equals: () => ({ toArray: async () => [] }) });
    mountListen(host); await flush();
    expect(host.textContent).toContain('아직 들을 문장이 없어요');
    expect(M.buildListenAudio).not.toHaveBeenCalled();
  });
  it('정리 함수는 pause + revokeObjectURL', async () => {
    M.buildListenAudio.mockResolvedValue({ blob: new Blob(['x']), seconds: 5, count: 2 });
    const cleanup = mountListen(host); await flush();
    host.querySelector('[data-role="play"]').click(); await flush();
    cleanup();
    expect(pause).toHaveBeenCalled(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(host.innerHTML).toBe('');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/pages/listen.test.js`
Expected: FAIL — `Failed to resolve import "./listen.js"`

- [ ] **Step 3: 페이지 구현**

```js
// src/pages/listen.js
/* 연속 듣기 — 배운 기본 문장 전체를 "한글 → 외국어" 순으로 소리 파일 하나로 만들어 무한 반복 (spec §9-8, 2026-09-06).
 * 반복은 <audio loop> 가 맡는다. 잠금 상태에서 JS 가 깨어날 필요가 없어야 하므로 문장별 이어 재생을 쓰지 않는다.
 * 검증: ~/apps/lessons/ios-simulator-web-audio-lock-verification.md (iOS 26.5 시뮬 · Safari 탭/홈 화면 앱 모두 잠금 중 유지).
 * 데모 주입: window.studyListen?.synthesize 가 있으면 합성기로 쓴다 (mocks/listen.html?demo=1). */
import { h } from '../components/d1/dom.js';
import { V_VARS, VI, vIcon, v2Style, ensureV2Fonts } from '../components/v2/atoms.js';
import { buildListenAudio, stripParenHints } from '../services/listenAudio.js';
import { VOICE_DEFAULTS } from '../services/speech.js';
import { buildSentenceRows } from './sentences.js';
import { localISODate } from '../utils/today.js';

function getLang() { try { const v = sessionStorage.getItem('studyLang'); return v === 'ja' ? 'ja' : 'en'; } catch { return 'en'; } }
const ttsLangOf = (l) => (l === 'ja' ? 'ja-JP' : 'en-US');
const langLabel = (l) => (l === 'ja' ? '일본어' : '영어');

export function buildListenPairs(cards, todayISO) {
  return buildSentenceRows(cards, [], [], todayISO)
    .map((r) => ({ ko: stripParenHints(r.ko), fo: String(r.en ?? '').trim() }))
    .filter((p) => p.ko && p.fo);
}

export function listenTitle(lang, count, seconds) {
  const min = Math.max(1, Math.round(seconds / 60));
  return `${langLabel(lang)} ${count}문장 · 한 바퀴 약 ${min}분`;
}

const CSS = `
.li{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;${V_VARS}}
.li *{box-sizing:border-box;margin:0}
.li button{font-family:inherit;cursor:pointer}
.li-top{height:60px;border-bottom:1px solid var(--line);display:flex;align-items:center}
.li-top-in{width:100%;max-width:560px;margin:0 auto;padding:0 20px;display:flex;align-items:center;justify-content:space-between}
.li-home{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--mut);background:none;border:0}
.li-wrap{width:100%;max-width:560px;margin:0 auto;padding:36px 20px 56px;display:flex;flex-direction:column;align-items:center;gap:18px;text-align:center}
.li-h1{font-family:Outfit,Pretendard,sans-serif;font-size:26px;font-weight:700;letter-spacing:-0.02em}
.li-sub{font-size:14px;color:var(--mut)}
.li-play{width:120px;height:120px;border-radius:999px;border:0;background:var(--teal);color:var(--card);display:inline-flex;align-items:center;justify-content:center;margin-top:18px;transition:background .15s}
.li-play:disabled{opacity:.45;cursor:default}
.li-play.on{background:var(--coral)}
.li-state{font-size:13px;color:var(--faint);min-height:18px}
.li-err{font-size:14px;color:var(--coral-deep)}
.li-retry,.li-rebuild{font-size:13px;font-weight:700;padding:10px 16px;border-radius:999px;border:1.5px solid var(--line);background:transparent;color:var(--ink)}
.li-empty{font-size:15px;color:var(--mut);padding:40px 0}`;

export function mountListen(host) {
  ensureV2Fonts();
  v2Style(CSS);
  host.innerHTML = '';
  const lang = getLang();
  const audio = document.createElement('audio');
  audio.loop = true; audio.preload = 'auto';

  const sub = h('div', { class: 'li-sub' }, '');
  const state = h('div', { class: 'li-state' }, '');
  const icon = h('span', {}, vIcon(VI.PLAY, { size: 44, fill: true }));
  const playBtn = h('button', { class: 'li-play', type: 'button', 'data-role': 'play', 'aria-label': '재생', disabled: true }, icon);
  const body = h('div', { class: 'li-wrap' }, h('h1', { class: 'li-h1' }, '연속 듣기'), sub, playBtn, state);
  const root = h('div', { class: 'li' },
    h('div', { class: 'li-top' }, h('div', { class: 'li-top-in' },
      h('button', { class: 'li-home', type: 'button', onClick: () => { window.location.hash = '#/home'; } }, vIcon(VI.HOME, { size: 15 }), '홈으로'),
      h('span', { class: 'li-sub' }, langLabel(lang)))),
    body, audio);
  host.appendChild(root);

  let url = null; let count = 0;
  const setIcon = (playing) => { icon.replaceChildren(vIcon(playing ? VI.PAUSE : VI.PLAY, { size: 44, fill: true })); playBtn.classList.toggle('on', playing); playBtn.setAttribute('aria-label', playing ? '일시정지' : '재생'); };
  const setMS = (st) => { try { if (navigator.mediaSession) navigator.mediaSession.playbackState = st; } catch (_) { /* noop */ } };
  const doPlay = () => audio.play().then(() => { setIcon(true); setMS('playing'); state.textContent = '재생 중 · 화면을 잠가도 계속 나와요'; }).catch((e) => { state.textContent = `재생 실패: ${e?.message ?? e}`; });
  const doPause = () => { audio.pause(); setIcon(false); setMS('paused'); state.textContent = '일시정지'; };
  playBtn.addEventListener('click', () => { if (audio.paused) doPlay(); else doPause(); });

  function armMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: `연속 듣기 · ${langLabel(lang)} ${count}문장`, artist: 'Study' });
      navigator.mediaSession.setActionHandler('play', doPlay);
      navigator.mediaSession.setActionHandler('pause', doPause);
    } catch (_) { /* noop */ }
  }
  function release() { if (url) { try { URL.revokeObjectURL(url); } catch (_) { /* noop */ } url = null; } }

  async function build() {
    playBtn.disabled = true; setIcon(false);
    body.querySelectorAll('.li-err, .li-retry, .li-rebuild, .li-empty').forEach((n) => n.remove());
    let cards = [];
    try { cards = await window.studyDB.reviewQueue.where('lang').equals(lang).toArray(); } catch (e) { console.error('[listen] load', e); }
    const pairs = buildListenPairs(cards, localISODate());
    if (!pairs.length) { sub.textContent = ''; body.appendChild(h('div', { class: 'li-empty' }, '아직 들을 문장이 없어요')); return; }
    sub.textContent = `${langLabel(lang)} ${pairs.length}문장`;
    state.textContent = '소리 만드는 중…';
    try {
      const synthesize = window.studyListen?.synthesize;
      const out = await buildListenAudio(pairs, {
        ttsLang: ttsLangOf(lang), foVoice: VOICE_DEFAULTS[ttsLangOf(lang)]?.voice ?? null,
        onProgress: ({ done, total }) => { state.textContent = `소리 만드는 중 ${done}/${total}`; },
        ...(synthesize ? { synthesize } : {}),
      });
      release();
      url = URL.createObjectURL(out.blob); audio.src = url; count = out.count;
      sub.textContent = listenTitle(lang, out.count, out.seconds);
      state.textContent = '준비 완료 · 재생을 누르면 잠금 중에도 이어서 나와요';
      playBtn.disabled = false; armMediaSession();
      body.appendChild(h('button', { class: 'li-rebuild', type: 'button', 'data-role': 'rebuild', onClick: () => { doPause(); build(); } }, '다시 만들기'));
    } catch (e) {
      console.warn('[listen] build 실패', e);
      state.textContent = '';
      body.appendChild(h('div', { class: 'li-err' }, `소리를 만들지 못했어요 · ${e?.message ?? e}`));
      body.appendChild(h('button', { class: 'li-retry', type: 'button', 'data-role': 'retry', onClick: () => build() }, '다시 시도'));
    }
  }
  build();

  return () => {
    try { audio.pause(); } catch (_) { /* noop */ }
    try { if (navigator.mediaSession) { navigator.mediaSession.setActionHandler('play', null); navigator.mediaSession.setActionHandler('pause', null); } } catch (_) { /* noop */ }
    audio.removeAttribute('src'); release();
    host.innerHTML = '';
  };
}
```

`h()` 가 `disabled: true` 를 속성으로 설정하는지 확인한다(`src/components/d1/dom.js`). boolean 속성을 지원하지 않으면 `playBtn.disabled = true` 를 생성 직후 별도 문장으로 둔다.

- [ ] **Step 4: 데모 셸과 라우트**

```html
<!-- mocks/listen.html -->
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#faf9f5">
<title>Study · 연속 듣기</title>
<link rel="stylesheet" href="/src/styles/tokens.css">
<style> body { margin: 0; } #root { min-height: 100vh; min-height: 100dvh; } </style>
</head>
<body>
<div id="root"></div>
<script type="module">
  import { mountListen } from '/src/pages/listen.js';
  /* ?demo=1 — 시드 카드로 가짜 DB 를 채우고, Azure 대신 묶음마다 짧은 440Hz 톤 WAV 를 돌려준다 (브라우저 검증용). */
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  if (demo) {
    const seed = (await import('/seeds/en-core100-2026-08-26.json')).default;
    const cards = seed.cards.map((c) => ({ ...c, lang: 'en' }));
    const table = (rows) => ({ where: () => ({ equals: () => ({ toArray: async () => rows }) }) });
    window.studyDB = { reviewQueue: table(cards) };
    const toneWav = (sec) => {
      const sr = 24000, n = Math.floor(sr * sec), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
      const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
      v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
      v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((i / sr) * 2 * Math.PI * 440) * 6000, true);
      return buf;
    };
    window.studyListen = { synthesize: async (ssml) => { await new Promise((r) => setTimeout(r, 300)); return toneWav(0.5 * (ssml.match(/<voice /g)?.length ?? 2)); } };
  }
  mountListen(document.getElementById('root'));
</script>
</body>
</html>
```

`src/app.js` 수정 (기존 패턴 그대로 세 곳):

```js
import listenHtml from '../mocks/listen.html?raw';          // sentencesHtml import 다음 줄
import { mountListen } from './pages/listen.js';            // mountSentences import 다음 줄
// ROUTES:  sentences: sentencesHtml,  다음에
  listen: listenHtml,
// PAGE_MOUNTS:  sentences: mountSentences,  다음에
  listen: mountListen,
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm vitest run src/pages/listen.test.js`
Expected: PASS (7 tests). 실패 시 jsdom 의 `HTMLMediaElement.paused` 가 읽기 전용 getter 라 `Object.defineProperty(this, 'paused', …)` 로 인스턴스에 덮어쓰는 방식이 맞는지 확인한다.

---

### Task 5: 홈 CTA 4번째 버튼 "연속 듣기"

**Files:**
- Modify: `src/pages/homeDesktopV2.js:337-345` (`ctaCard` 반환부)
- Test: `src/pages/homeDesktopV2.test.js:120-124`, `:203-208`, `:314-320`

**Interfaces:**
- Consumes: `h`, `state.lang`. 목적지 `#/listen`.

- [ ] **Step 1: 테스트 수정·추가 (실패하도록)**

`homeDesktopV2.test.js` 의 두 단언을 4개로 바꾼다:

```js
// L123 과 L319 — 기존
expect(ctas).toEqual(['학습 시작', '복습 시작', '문장 모아보기']);
// → 변경
expect(ctas).toEqual(['학습 시작', '복습 시작', '문장 모아보기', '연속 듣기']);
```

그리고 L208 다음에 추가:

```js
  it('연속 듣기 CTA — #/listen 으로, 수학에서는 없음', () => {
    const el = renderHomeDesktopV2(v3());
    const btn = [...el.querySelectorAll('.vh-cta')].find((b) => b.textContent.includes('연속 듣기'));
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain('한글 뒤 영어 · 무한 반복 · 잠금 중에도 재생');
    window.location.hash = '';
    btn.click();
    expect(window.location.hash).toBe('#/listen');
    const math = renderHomeDesktopV2({ ...v3(), lang: 'math' });
    expect(math.textContent).not.toContain('연속 듣기');
  });
```

(`v3()` 가 `lang` 을 어떻게 두는지 파일 상단 픽스처를 보고, `lang: 'math'` 덮어쓰기가 `isMath` 분기를 타는지 확인한다. 픽스처가 `lang` 대신 다른 키를 쓰면 그 키로 맞춘다.)

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/pages/homeDesktopV2.test.js`
Expected: FAIL — 배열 길이 3 ≠ 4, `btn` undefined

- [ ] **Step 3: 구현** — `ctaCard` 반환부의 문장 모아보기 버튼 다음에 한 버튼 추가

```js
    isMath ? null : h('button', { class: 'vh-cta sec', type: 'button', onClick: () => { window.location.hash = '#/listen'; } },
      h('span', {}, h('span', { class: 't1' }, '연속 듣기'), h('span', { class: 't2' }, `한글 뒤 ${state.lang === 'ja' ? '일본어' : '영어'} · 무한 반복 · 잠금 중에도 재생`)),
      h('span', { class: 'go' }, '듣기')),
```

주석 "CTA 3개" (L308, L323) 는 "CTA 4개(연속 듣기 포함, 2026-09-06)" 로 고친다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/pages/homeDesktopV2.test.js`
Expected: PASS

---

### Task 6: 전체 검증 · 브라우저/시뮬레이터 확인 · 커밋

**Files:** 없음(검증·커밋)

- [ ] **Step 1: 전체 테스트와 빌드**

Run: `cd ~/apps/study && pnpm test && pnpm build`
Expected: vitest 전부 PASS, `vite build` 성공(dist 에 `listen` 관련 청크가 main 에 포함).

- [ ] **Step 2: 개발 잔재 점검**

Run: `grep -nE "console\.log|TODO" src/services/listenAudio.js src/pages/listen.js mocks/listen.html`
Expected: 출력 없음.

- [ ] **Step 3: 앱 내 브라우저에서 데모 확인**

`preview_start` 로 `study-dev`(포트 5183) 를 띄우고 `http://localhost:5183/mocks/listen.html?demo=1` 을 연다. 확인 항목: 제목에 "영어 N문장 · 한 바퀴 약 M분", 진행률 "소리 만드는 중 k/5" 가 지나감, 재생 버튼 → `audio.paused === false`, `navigator.mediaSession.metadata.title === '연속 듣기 · 영어 N문장'`, 콘솔 에러 0. `read_console_messages` 와 `javascript_tool` 로 읽는다.

- [ ] **Step 4: iOS 시뮬레이터(iPhone 11 Pro, iOS 26.5)에서 같은 데모 페이지 확인**

lessons `ios-simulator-web-audio-lock-verification.md` 절차대로: `DEVELOPER_DIR` 지정, `xcrun simctl boot 18429E06-52DE-41CD-842C-F45D59BE54CC`, Safari 에서 `http://192.168.1.49:5183/mocks/listen.html?demo=1` (dev 서버는 vite.config 의 `host: '0.0.0.0'` 로 LAN 에 열림). 재생 → Lock → 60초 → Lock 한 번 더 눌러 잠금화면 패널 제목이 "연속 듣기 · 영어 N문장" 인지 캡처. Mac 은 시험 전 음소거, 후 복원.

- [ ] **Step 5: 홈 실화면 확인**

`http://localhost:5183/mocks/home.html` 이 인증 없이 열리는지 확인하고 CTA 카드에 "연속 듣기" 가 4번째로 보이는지 `read_page` 로 확인한다. 인증이 필요해 열리지 않으면 Task 5 의 단위 테스트 통과를 근거로 두고 그 사실을 보고에 적는다.

- [ ] **Step 6: 커밋 + 푸시** (스냅샷 2건 합치기, 이 세션 파일만)

```bash
cd ~/apps && git reset --soft HEAD~2 && git restore --staged .claude/launch.json && git checkout -- .claude/launch.json
git add study/specs/study-app-spec.md study/docs/2026-09-06-listen-loop-plan.md \
  study/src/services/listenAudio.js study/src/services/listenAudio.test.js \
  study/src/pages/listen.js study/src/pages/listen.test.js study/mocks/listen.html \
  study/src/app.js study/src/pages/homeDesktopV2.js study/src/pages/homeDesktopV2.test.js \
  lessons/ios-simulator-web-audio-lock-verification.md lessons/README.md
git status --short   # 위 파일만 스테이지돼 있어야 한다. 다른 세션 잔존(?? 항목)은 그대로 둔다
git commit -m "feat(study): 연속 듣기 — 기본 문장 전체를 한글→외국어 WAV 하나로 합성해 잠금 중에도 무한 반복 재생 (#/listen, 홈 CTA)

- listenAudio: 괄호 힌트 제거·25쌍 SSML 묶음·Azure audioData(riff 24kHz)·PCM 이어 붙이기
- listen 페이지: <audio loop> + Media Session, Web Speech 폴백 없음
- 홈 CTA 4번째 버튼, spec §9-8, 시뮬레이터 잠금 재생 검증 lessons

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push origin main
```

`git reset --soft HEAD~2` 전에 `git log -2 --format=%s` 로 두 커밋이 모두 `WIP(claude-snapshot)` 인지 확인한다. 아니면 reset 하지 않고 이 세션 파일만 추가로 커밋한다. push 충돌·hook 실패 시 재시도하지 않고 사용자에게 보고한다.

---

## 실행 노트 (2026-09-06)

- Task 4: 듣기 순서는 `buildSentenceRows`(학습 우선순위 정렬)가 아니라 **`order_index` 오름차순(없으면 생성일·id)** 으로 바꿨다. `buildListenPairs(cards)` 시그니처에서 `todayISO` 를 뺐고 스펙 §9-8 도 같이 고쳤다.
- Task 5: 홈 테스트의 스트릭 칩 금지 정규식 `/연속/` 이 "연속 듣기" 에 걸려 `/\d+일 연속|연속 \d|연속 학습/` 으로 좁혔다(검사 의도 유지).
- Task 6: 데모 셸에 `amp` 매개변수를 추가했다(`amp=0` 이면 무음). Mac 출력 장치가 소프트웨어 음소거를 지원하지 않는 상황에서 시뮬레이터 검증에 썼다.
