#!/usr/bin/env node
/* 한국어 고유명사의 TTS 발음 실측 — koreanTerms.js 에 넣을 IPA 를 정할 때 쓴다 (2026-09-26).
 *
 * 로마자 그대로 읽힌 소리와 IPA 후보를 Azure 로 합성해, 이름 구간만 잘라 ko-KR·en-US STT 로 받아 적고
 * 문장 전체의 en-US 자유 전사도 같이 낸다. 귀로 듣지 않고도 "Nanny" 인지 "Nani" 인지 가른다.
 * 한 목소리 결과로 단정하지 않는다 — 목소리마다 전사가 흔들리므로 세 목소리를 같이 본다.
 *
 * 사용:
 *   set -a && source ~/.config/study/.env && set +a
 *   node scripts/tts-probe-terms.mjs '[{"term":"Hongdae","text":"Let'\''s meet at Hongdae.","ipas":{"a":"hoʊŋ.dɛ"}}]'
 *   node scripts/tts-probe-terms.mjs cases.json          # 같은 모양의 배열 파일
 * 출력 한 줄 = 낱말 | 목소리 | 후보 | IPA | 길이(초) | 발음평가 점수 | 이름구간 ko 전사 | 이름구간 en 전사 | 문장 자유 전사
 *
 * Azure 키는 Edge Function 에만 있으므로 봇 계정(claude-bot@today.local) 세션으로 azure-token 을 받는다
 * (auto memory `study-azure-speech-local-probe`). WAV 는 ~/apps/tmp/tts-probe/ 에 남긴다(untracked).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SB = process.env.SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !SRK) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없다 — ~/.config/study/.env 를 source 한다'); process.exit(1); }
const arg = process.argv[2];
if (!arg) { console.error('usage: node scripts/tts-probe-terms.mjs <cases.json | json 문자열>'); process.exit(1); }
const CASES = JSON.parse(fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : arg);
const OUT = path.join(os.homedir(), 'apps', 'tmp', 'tts-probe');
fs.mkdirSync(OUT, { recursive: true });

const VOICES = ['en-US-AvaMultilingualNeural', 'en-US-AndrewMultilingualNeural', 'en-US-GuyNeural'];
const short = (v) => v.replace('en-US-', '').replace('MultilingualNeural', '').replace('Neural', '');
const NS = 'xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts"';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function azureToken() {
  const H = { apikey: SRK, 'Content-Type': 'application/json' };
  const gl = await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: { ...H, Authorization: `Bearer ${SRK}` }, body: JSON.stringify({ type: 'magiclink', email: 'claude-bot@today.local' }) }).then((r) => r.json());
  const th = gl.hashed_token ?? gl.properties?.hashed_token;
  if (!th) throw new Error('generate_link 실패 ' + JSON.stringify(gl).slice(0, 200));
  const v = await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: H, body: JSON.stringify({ type: 'magiclink', token_hash: th }) }).then((r) => r.json());
  if (!v.access_token) throw new Error('verify 실패 ' + JSON.stringify(v).slice(0, 200));
  const t = await fetch(`${SB}/functions/v1/azure-token`, { method: 'POST', headers: { ...H, Authorization: `Bearer ${v.access_token}` } }).then((r) => r.json());
  if (!t.token) throw new Error('azure-token 실패 ' + JSON.stringify(t).slice(0, 200));
  return t;
}
// speech.js buildAzureSSML 과 같은 모양(한 voice·한 prosody·이름만 phoneme)
const build = (text, term, ipa, voice) => {
  const body = ipa ? esc(text).replace(term, `<phoneme alphabet="ipa" ph="${ipa}">${term}</phoneme>`) : esc(text);
  return `<speak version="1.0" ${NS} xml:lang="en-US"><voice name="${voice}"><prosody rate="1.0">${body}</prosody></voice></speak>`;
};
async function tts(tok, region, ssml) {
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'riff-16khz-16bit-mono-pcm', 'User-Agent': 'study-probe' }, body: ssml });
  if (!r.ok) throw new Error(`tts ${r.status} ${(await r.text()).slice(0, 120)}`);
  return Buffer.from(await r.arrayBuffer());
}
/* REST 의 발음 평가는 Words[i] 에 Offset·Duration(100ns)·AccuracyScore 를 중첩 없이 준다 (SDK 와 다르다). */
async function stt(tok, region, wav, lang, refText) {
  const h = { Authorization: `Bearer ${tok}`, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000', Accept: 'application/json' };
  if (refText) h['Pronunciation-Assessment'] = Buffer.from(JSON.stringify({ ReferenceText: refText, GradingSystem: 'HundredMark', Granularity: 'Word', Dimension: 'Comprehensive' })).toString('base64');
  const r = await fetch(`https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${lang}&format=detailed`, { method: 'POST', headers: h, body: wav });
  if (!r.ok) throw new Error(`stt ${r.status}`);
  return r.json();
}
const durSec = (wav) => ((wav.length - 44) / 2 / 16000).toFixed(2);
function cutWav(wav, s0, s1) {
  const b0 = 44 + Math.floor(s0 * 16000) * 2, b1 = Math.min(wav.length, 44 + Math.ceil(s1 * 16000) * 2);
  const pcm = wav.subarray(b0, b1);
  const out = Buffer.concat([Buffer.from(wav.subarray(0, 44)), pcm]);
  out.writeUInt32LE(36 + pcm.length, 4); out.writeUInt32LE(pcm.length, 40);
  return out;
}

const { token, region } = await azureToken();
for (const c of CASES) for (const voice of VOICES) for (const [k, ipa] of Object.entries({ roman: null, ...(c.ipas || {}) })) {
  let wav;
  try { wav = await tts(token, region, build(c.text, c.term, ipa, voice)); } catch (e) { console.log(['ERR', c.term, short(voice), k, e.message].join(' | ')); continue; }
  fs.writeFileSync(path.join(OUT, `${c.term}_${short(voice)}_${k}.wav`), wav);
  const [pa, free] = await Promise.all([stt(token, region, wav, 'en-US', c.text), stt(token, region, wav, 'en-US', null)]);
  const W = pa.NBest?.[0]?.Words || [];
  const key = c.term.toLowerCase().replace(/[^a-z]/g, '');
  const w = W.find((x) => x.Word.toLowerCase().replace(/[^a-z]/g, '') === key);
  let segKo = '', segEn = '';
  if (w?.Duration) {
    const pad = 0.05, s0 = Math.max(0, w.Offset / 1e7 - pad), s1 = w.Offset / 1e7 + w.Duration / 1e7 + pad;
    const seg = cutWav(wav, s0, s1);
    const [kk, ee] = await Promise.all([stt(token, region, seg, 'ko-KR', null), stt(token, region, seg, 'en-US', null)]);
    segKo = kk.DisplayText ?? ''; segEn = ee.DisplayText ?? '';
  }
  console.log([c.term, short(voice), k, ipa ?? '-', durSec(wav), `${c.term}:${w ? Math.round(w.AccuracyScore) : '?'}`, JSON.stringify(segKo), JSON.stringify(segEn), JSON.stringify(free.DisplayText ?? '')].join(' | '));
}
