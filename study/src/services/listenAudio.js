/**
 * 연속 듣기 — 배운 문장 전체를 "한글 → 외국어" 순으로 소리 파일 하나로 만든다 (spec §9-8, 2026-09-06).
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

/** 한 묶음의 SSML — 쌍마다 한글 voice, 외국어 voice 순. 한글 voice 첫머리의 bookmark(쌍 번호)로 문장 시작 초를 받는다.
 * 루트 xml:lang 은 voice 별 언어가 정해지므로 한글로 고정. */
export function buildListenSSML(pairs, { koVoice = KO_VOICE, foVoice, rate = 0.85, koGapMs = KO_GAP_MS, foGapMs = FO_GAP_MS }) {
  const body = pairs.map(({ ko, fo }, i) =>
    `<voice name="${koVoice}"><bookmark mark="${i}"/><mstts:silence type="Tailing-exact" value="${koGapMs}ms"/>${escapeXml(ko)}</voice>`
    + `<voice name="${foVoice}"><mstts:silence type="Tailing-exact" value="${foGapMs}ms"/><prosody rate="${rate}">${escapeXml(fo)}</prosody></voice>`).join('');
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="ko-KR">${body}</speak>`;
}

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

/** Azure 합성 1요청 — 스피커 없이(audioConfig=null) audioData(헤더 포함 WAV)와 bookmark 오프셋을 받는다.
 * bookmarkReached 는 audioOffset 을 100ns 틱으로 준다(2026-09-06 실측: 두 번째 쌍 53723750 = 5.372초).
 * SDK 는 실패도 success 콜백에 reason=Canceled 로 넘기므로(SynthesisAdapterBase.cancelSynthesis) audioData 유무로 판정한다.
 * @returns {Promise<{ buffer: ArrayBuffer, marks: { index: number, sec: number }[] }>} */
export async function synthesizeChunk(ssml) {
  const [{ token, region }, SDK] = await Promise.all([getAzureToken(), loadSpeechSDK()]);
  const config = SDK.SpeechConfig.fromAuthorizationToken(token, region);
  config.speechSynthesisOutputFormat = SDK.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
  const synth = new SDK.SpeechSynthesizer(config, null);
  const marks = [];
  synth.bookmarkReached = (_s, e) => { marks.push({ index: Number(e.text), sec: e.audioOffset / 1e7 }); };
  const close = () => { try { synth.close(); } catch (_) { /* noop */ } };
  return new Promise((resolve, reject) => {
    synth.speakSsmlAsync(ssml, (result) => {
      close();
      const data = result?.audioData;
      if (data && data.byteLength > 44) resolve({ buffer: data, marks });
      else reject(new Error(result?.errorDetails || '합성 실패'));
    }, (err) => { close(); reject(err instanceof Error ? err : new Error(String(err))); });
  });
}

/** 묶음 하나의 문장별 시작 초 — marks 가 쌍 수만큼 다 오면 그 값을, 아니면 묶음 길이를 균등 분할한다(데모 합성기·표식 누락 대비). */
export function chunkStarts(marks, count, chunkSec) {
  const byIndex = new Map((marks ?? []).map((m) => [m.index, m.sec]));
  const complete = count > 0 && Array.from({ length: count }, (_, i) => byIndex.has(i)).every(Boolean);
  return Array.from({ length: count }, (_, i) => (complete ? byIndex.get(i) : (chunkSec * i) / count));
}

/** 재생 위치 t 가 속한 문장 = 시작 초가 t 이하인 마지막 문장. starts 가 비면 -1. */
export function currentIndex(starts, t) {
  let idx = -1;
  for (let i = 0; i < starts.length; i++) { if (starts[i] <= t) idx = i; else break; }
  return idx;
}

/** 문장 쌍 전체 → WAV Blob 하나. 묶음 요청은 병렬, 실패는 그대로 던진다(Web Speech 폴백 없음 — spec §9-8). */
/** 문장 쌍 전체 → WAV Blob 하나 + 문장별 시작 초(starts). 묶음 요청은 병렬, 실패는 그대로 던진다(Web Speech 폴백 없음 — spec §9-8).
 * synthesize 는 { buffer, marks } 또는 ArrayBuffer(표식 없음 → 균등 분할)를 돌려줄 수 있다. */
export async function buildListenAudio(pairs, { foVoice, onProgress, synthesize = synthesizeChunk, chunkSize = LISTEN_CHUNK }) {
  if (!pairs?.length) throw new Error('들을 문장이 없습니다');
  const chunks = chunkPairs(pairs, chunkSize);
  let done = 0;
  const results = await Promise.all(chunks.map(async (chunk) => {
    const res = await synthesize(buildListenSSML(chunk, { foVoice }));
    done += 1; onProgress?.({ done, total: chunks.length });
    return res instanceof ArrayBuffer ? { buffer: res, marks: [] } : res;
  }));
  const buffers = results.map((r) => r.buffer);
  const { int16, seconds } = concatWav(buffers);
  const starts = [];
  let offset = 0;
  results.forEach((r, i) => {
    const chunkSec = wavPcm(r.buffer).length / SAMPLE_RATE;
    for (const sec of chunkStarts(r.marks, chunks[i].length, chunkSec)) starts.push(offset + sec);
    offset += chunkSec;
  });
  return { blob: pcmToWavBlob(int16, SAMPLE_RATE), seconds, count: pairs.length, starts };
}
