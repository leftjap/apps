<!-- trigger: azure,speech,microphone,mic,silent,SDK,getUserMedia,SpeechRecognizer | match-paths: src/services/speech*.js,src/features/voice*.js,src/features/study/listening*.js -->
# Azure Speech SDK 마이크 silent (chrome 환경 특정)

## 증상

같은 Mac · 같은 token · 같은 SDK · 같은 코드인데:

| 환경 | 결과 |
|---|---|
| chrome incognito | ✅ PronScore 96, SNR 35 (정상) |
| chrome 정상 profile | ❌ NoMatch reason=0, SNR=0, duration_sec≈5.5 |

DSDK `fromDefaultMicrophoneInput()` / `fromMicrophoneInput(deviceId)` 둘 다 silent. Azure 서버는 audio frames 받음 (duration 5+초) 인데 amplitude 0 으로 해석.

## 폐기 가설 누적 30+

- SPA Vite 부트스트랩 import side-effect (main.js · db/schema · services/auth · db/sync · app.js)
- Service Worker 등록 잔존
- Vite dev response header 차이 (Permissions-Policy / CSP / COOP / COEP)
- Supabase realtime WebSocket 충돌
- 마이크 stream 경쟁 (다른 tab 점유)
- SDK 버전 (1.49.0 ↔ 1.43.0 동일 결과)
- 'default' wrapper vs explicit deviceId
- chrome extension 일괄 비활성 후에도 NoMatch 재현
- enableMiscue / Granularity / token vs key
- referenceText 정규화

## 결정타 binary (chrome-devtools MCP autoConnect)

1. **WAV 파일을 PushStream 에 직접 push** — 정상 profile 에서도 PronScore 94, SNR 34 정상 → SDK + token + Azure 모두 OK 확정
2. **raw `getUserMedia + AnalyserNode`** — 정상 profile 에서도 maxRMS 0.298 정상 → 마이크 자체 OK 확정
3. **getUserMedia + ScriptProcessor + destination** — 정상 profile 에서 pump RMS 0.06 (raw 의 1/5), SDK NoMatch
4. **incognito chrome + SDK fromDefault** — 정상 (extension 자동 OFF + clean profile state)

→ **silent 의 원인 = chrome AEC (echo cancellation) 가 ScriptProcessor / SDK 내부 capture 의 destination 출력을 echo 로 간주해 mic input 무음 처리** ← **이 가설 폐기 (Wave 11.59 검증 결과).**

## chrome AEC 가설 폐기 근거 (Wave 11.59)

`getUserMedia({audio:true}) + ScriptProcessor + muted GainNode (gain=0) → destination` 패턴 (echo 출력 0 으로 AEC 트리거 회피) 적용 후에도 NoMatch reason=0 SNR=0 동일. 추가 검증:

- pump RMS 0.146 (silent 아닌 발화 amplitude) 인데 SDK SNR=0
- macOS 재부팅 + chrome 재시작 + 마이크 device 변경 (유선→AirPods) 모두 NoMatch
- 같은 chrome 같은 profile 의 WAV → PushStream 직접 입력은 정상 (SNR 34, PronScore 94)
- incognito 정상

**좁혀진 진짜 원인 (다음 세션 격리 대상):** 정상 chrome profile 의 영구 state — localStorage / IndexedDB / cookies / 사이트 권한 cache / SW DB / chrome://flags 어딘가가 mic capture path 망가뜨림. 재부팅 후에도 유지 (profile data 보존).

**다음 세션 binary 격리 (사용자 작업, 5분):**
1. `chrome://settings/content/all` → localhost:5173 사이트 데이터 전체 삭제 + 마이크 권한 재허용 → 정상되면 이 origin 의 cached state 가 원인
2. 새 chrome profile 생성 (계정 없이) → azure-test.html B PA 발화 → 정상이면 profile 폐기·이전 권장
3. 둘 다 NoMatch 면 chrome 자체 재설치 / chrome canary 비교

## 우회 (Wave 11.59 — fix 코드는 적용됐으나 검증 실패. revert 후보)

`speech.js analyzeAzure` (Wave 11.59) 패턴:

```js
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
// EC=false 강제 금지 — macOS 외장 마이크 'NotFoundError: Requested device not found' 발생
const ac = new AudioContext();
const src = ac.createMediaStreamSource(stream);

const fmt = SpeechSDK.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
const pushStream = SpeechSDK.AudioInputStream.createPushStream(fmt);
const audio = SpeechSDK.AudioConfig.fromStreamInput(pushStream);

const processor = ac.createScriptProcessor(4096, 1, 1);
const ratio = ac.sampleRate / 16000; // 보통 3
processor.onaudioprocess = (e) => {
  const input = e.inputBuffer.getChannelData(0);
  const outLen = Math.floor(input.length / ratio);
  const int16 = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, input.length - 1);
    const frac = srcIdx - lo;
    const sample = input[lo] * (1 - frac) + input[hi] * frac;
    const s = Math.max(-1, Math.min(1, sample));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  pushStream.write(int16.buffer);
};
src.connect(processor);

// echo 회피 — destination 으로 가는 출력은 muted gain 으로 0 처리
const muteGain = ac.createGain();
muteGain.gain.value = 0;
processor.connect(muteGain);
muteGain.connect(ac.destination);

// recognizer 시작
const cfg = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
const rec = new SpeechSDK.SpeechRecognizer(cfg, audio);
// PA config 적용 후 recognizeOnceAsync
```

## 자동 검증 도구 패턴 (재현용 레시피, 사용자 발화 없이 binary)

> Wave 11.62 cleanup 시점에 기존 `~/apps/study/public/yougotit.wav` + 과거 `.scratch/azure-rest-verify.sh` 는 삭제 (Wave 11.59 디버깅 종결). 향후 동종 진단 시 아래 레시피로 재생성.

1. macOS `say "You got it" -o /tmp/yougotit.aiff` + `afconvert -d LEI16@16000 -f WAVE /tmp/yougotit.aiff /tmp/yougotit.wav` → 16kHz mono 16bit PCM WAV
2. WAV 를 정적 서빙 (예: `~/apps/study/public/`) → `fetch` 로 ArrayBuffer 회수
3. **REST 검증** — `curl POST https://<region>.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed` + `Ocp-Apim-Subscription-Key` (또는 `Authorization: Bearer <token>`) + `Pronunciation-Assessment: <base64 JSON>` + `--data-binary @file.wav`. 응답 `RecognitionStatus: "Success"` + `PronScore` 회수 시 server-side path 정상 확정
4. **mic loop 검증** — `afplay /tmp/yougotit.wav` 로 macOS 스피커 출력 → chrome mic capture (다른 tab 의 PWA) → 같은 reference 로 분석. mic capture path 정상 시 PronScore 회수, silent 시 NoMatch SNR=0
5. **PushStream 직접 검증** (SDK realtime 우회) — WAV ArrayBuffer 를 `SpeechSDK.AudioInputStream.createPushStream(...).write(...)` 로 직접 push → mic 미사용 channel. SDK + token + Azure 정합성 binary

향후 같은 종류 audio 진단에 재사용. 단, Web 환경 production 채점은 §"최종 우회 결론" 의 REST API path 권장.

## 가짜 양성 주의

- `audioInputs: []` → mic device 자체 sleep / disconnect (사용자 부재 절전 등). NoMatch 와 무관한 별 원인
- chrome 마이크 권한 'prompt' 상태에서 evaluate_script 자동 호출 시 prompt 응답 timeout 가능
- `say` 합성 음성은 자연 발화 대비 amplitude 작아 SDK SNR 낮을 수 있음 (그러나 RecognizedSpeech 는 가능)

---

## ✅ 최종 우회 결론 (Wave 11.61 + 11.62, 2026-05-03)

**SDK realtime PushStream 폐기 + REST API path 우회로 확정 해결.**

같은 mic, 같은 token, 같은 정상 profile 에서:

| Path | SNR | Result |
|---|---|---|
| SDK realtime PushStream pump (Wave 11.58 fix) | 0 | NoMatch (silent) |
| **REST API short-audio (Wave 11.61)** | **22.97** | **PronScore 100 정상** |

→ mic capture 자체는 처음부터 정상. SDK 의 **realtime PushStream + recognizeOnceAsync 동시 streaming path** 만 chrome 정상 profile 에서 silent. 분리해서 (녹음 → WAV blob → 별 호출에서 REST POST) 보내면 동일 audio data 로 정상 채점.

### 결정 trigger — REST 우선 (SDK realtime 비추천)

Web 환경 (PWA · localhost · Vite dev) 에서 Pronunciation Assessment 시 다음 패턴 권장:

1. **`getUserMedia` + ScriptProcessor (또는 AudioWorklet)** — Int16 PCM 누적 (16kHz mono)
2. **WAV RIFF header (44 byte) 부착** → Blob
3. **Edge Function `azure-token`** → 단기 Bearer JWT 회수 (10분 캐시)
4. **`POST https://<region>.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=<lang>&format=detailed`** + `Authorization: Bearer ...` + `Pronunciation-Assessment: <base64 JSON>` + WAV body

SDK streaming path 는 chrome 환경 차단 변수 다수. REST short-audio path 가 안정적.

### Latency 최적화 (Wave 11.61 측정)

| Region | Cold (1st call) | Warm (connection 재사용) |
|---|---|---|
| eastus (한국→미국) | 1.02s | 1.07s |
| **koreacentral** | **0.59s** | **0.46s** |

추가 절감:
- HTTP keep-alive (warm connection 재사용)
- JWT 캐시 (10분 유효, in-memory)
- Granularity: Phoneme + Dimension: Comprehensive 무료 (Word/Basic 과 latency 0ms 차이 — 음소 단위 채점 유지 권장)
- Audio compression (Opus) 의미 X — 25KB WAV 라 RTT 비중 95%

### 구현 위치 (Study 앱)

- `~/apps/study/src/services/speech.js` — `recordWav()` / `pcmToWavBlob()` / `buildPronunciationAssessmentHeader()` / `analyzeWavRest()`
- `~/apps/study/mocks/session.html` — `toggleRec` 가 두 함수 조합 (idle→recording 시 recordWav 시작 / recording→analyzing 시 stop + analyzeWavRest)
- `~/apps/study/supabase/functions/azure-token/index.ts` — 기존 인프라 그대로 (Supabase Secrets `AZURE_SPEECH_REGION=koreacentral` 만 추가)

### 폐기 가설 최종 정리

| 가설 | 검증 결과 |
|---|---|
| SDK 버전 / fromMicrophoneInput / extension | 폐기 (Wave 11.58 박제) |
| chrome AEC (echo cancellation) | 폐기 (Wave 11.59 muted gain 후에도 NoMatch) |
| profile state corruption | 미검증 (REST 우회로 무관해짐) |

→ chrome 정상 profile + SDK realtime PushStream 의 silent 원인은 **여전히 미규명**. 다만 REST 우회로 production 영향 0 → 디버깅 종결.
