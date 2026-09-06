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
    expect(ssml).toContain('<voice name="ko-KR-SunHiNeural"><bookmark mark="0"/><mstts:silence type="Tailing-exact" value="2000ms"/>문제가 있나요?</voice>');
    expect(ssml).toContain('<bookmark mark="1"/>'); // 두 번째 쌍
    expect(ssml).toContain('<voice name="en-US-AriaNeural"><mstts:silence type="Tailing-exact" value="1000ms"/><prosody rate="0.85">Is there a problem?</prosody></voice>');
  });
  it('XML 특수문자를 이스케이프한다', () => {
    const ssml = buildListenSSML(pairs, { ttsLang: 'en-US', foVoice: 'en-US-AriaNeural' });
    expect(ssml).toContain('A &amp; B');
    expect(ssml).toContain('Tom &amp; &lt;Jerry&gt;');
  });
});

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
    expect(out.starts).toHaveLength(26); // 표식 없는 합성기(ArrayBuffer 반환)는 균등 분할
    expect(out.starts[0]).toBe(0); expect(out.starts[25]).toBeCloseTo(200 / SAMPLE_RATE, 6);
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
      speakSsmlAsync(ssml, ok, err) {
        state.ssml = ssml;
        if (throwErr) { err(throwErr); return; }
        this.bookmarkReached?.(this, { text: '0', audioOffset: 0 });
        this.bookmarkReached?.(this, { text: '1', audioOffset: 53723750 }); // 100ns tick = 5.372375s (2026-09-06 실측값)
        ok(result);
      }
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
    expect(out.buffer.byteLength).toBe(44 + 10);
    expect(out.marks).toEqual([{ index: 0, sec: 0 }, { index: 1, sec: 5.372375 }]);
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

import { currentIndex } from './listenAudio.js';

describe('buildListenAudio — 표식(bookmark)으로 문장별 시작 초를 만든다', () => {
  const pairs = [{ ko: 'a', fo: 'A' }, { ko: 'b', fo: 'B' }, { ko: 'c', fo: 'C' }];
  it('묶음마다 marks 가 있으면 그 초를 쓰고, 다음 묶음은 앞 묶음 길이만큼 밀린다', async () => {
    const synthesize = async (ssml) => (ssml.includes('>c<')
      ? { buffer: makeWav(24000), marks: [{ index: 0, sec: 0 }] }
      : { buffer: makeWav(24000 * 4), marks: [{ index: 0, sec: 0 }, { index: 1, sec: 1.5 }] });
    const out = await buildListenAudio(pairs, { foVoice: 'v', synthesize, chunkSize: 2 });
    expect(out.starts).toEqual([0, 1.5, 4]);
    expect(out.seconds).toBeCloseTo(5, 6);
  });
  it('marks 가 모자라면 그 묶음만 균등 분할', async () => {
    const synthesize = async (ssml) => (ssml.includes('>c<')
      ? { buffer: makeWav(24000), marks: [{ index: 0, sec: 0 }] }
      : { buffer: makeWav(24000 * 4), marks: [{ index: 0, sec: 0 }] });
    const out = await buildListenAudio(pairs, { foVoice: 'v', synthesize, chunkSize: 2 });
    expect(out.starts).toEqual([0, 2, 4]);
  });
  it('currentIndex — 재생 위치가 속한 문장 (시작 초 이상인 마지막 문장)', () => {
    expect(currentIndex([0, 1.5, 4], 0)).toBe(0);
    expect(currentIndex([0, 1.5, 4], 3.9)).toBe(1);
    expect(currentIndex([0, 1.5, 4], 4)).toBe(2);
    expect(currentIndex([0, 1.5, 4], 99)).toBe(2);
    expect(currentIndex([], 1)).toBe(-1);
  });
});
