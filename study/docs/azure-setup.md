# Azure Speech SDK 설정 가이드 (Wave 11.22)

Study 앱의 발음 분석 + 고품질 TTS 를 활성화하기 위한 사용자 작업 5단계입니다. 본 가이드를 진행하기 전 코드 (Edge Function + speech.js) 는 이미 배포 준비됨.

**미진행 시**: 발음 점수가 Math.random mock (55-95 점), TTS 가 브라우저 내장 (음질 낮음). 앱 자체 동작은 정상 (Wave 11.22 의 graceful fallback).

---

## 1단계 — Azure Portal 에서 Speech 리소스 생성 (Free F0 무료)

1. https://portal.azure.com/ 로그인
2. 검색창에 "Speech services" 입력 → 결과의 "Speech services" 클릭
3. "+ Create" 또는 "+ 만들기" 클릭
4. 양식 작성:
   - **Subscription**: 본인 계정의 무료/유료 구독
   - **Resource group**: 신규 생성 (예: `geo-apps-rg`) 또는 기존
   - **Region**: `East US` (본 프로젝트 = `sejin-speech-tts` 리소스 / Aria·Aoi 글로벌 catalog)
   - **Name**: `geo-apps-speech` (또는 임의)
   - **Pricing tier**: **Free F0** (월 5시간 STT + 50만 문자 TTS 무료)
5. "Review + create" → "Create"

생성 완료 후 약 30초 — "Go to resource" 클릭.

## 2단계 — Speech 리소스의 Key + Region 복사

1. Speech 리소스 페이지 → 좌측 메뉴 "Keys and Endpoint" 클릭
2. "KEY 1" 복사 (긴 hex 문자열, 32자) — `AZURE_SPEECH_KEY` 값
3. "Location/Region" 확인 — `eastus` — `AZURE_SPEECH_REGION` 값

> **보안**: Key 는 절대 git/Slack/공개 채널 노출 금지. Supabase Edge Function 환경변수에만 저장.

## 3단계 — Supabase Edge Function 환경변수 설정

### Option A — Supabase CLI (권장)

```bash
# 1. Supabase CLI 설치 (미설치 시)
brew install supabase/tap/supabase

# 2. Supabase 로그인 (브라우저 OAuth)
supabase login

# 3. 프로젝트 link (~/apps/study 디렉토리에서)
cd ~/apps/study
supabase link --project-ref tcbooffrdacfatywdzcm
# (project-ref 는 Supabase Dashboard → Project Settings → General 의 Reference ID)

# 4. Secrets 설정
supabase secrets set AZURE_SPEECH_KEY=<2단계의-KEY-1-값>
supabase secrets set AZURE_SPEECH_REGION=eastus

# 5. 검증
supabase secrets list
# AZURE_SPEECH_KEY 와 AZURE_SPEECH_REGION 표시 확인
```

### Option B — Supabase Dashboard

1. https://supabase.com/dashboard 접속
2. 프로젝트 (`geo-apps`) 선택
3. 좌측 "Edge Functions" → 상단 탭 "Settings" → "Secrets"
4. "Add secret" 두 번:
   - Name: `AZURE_SPEECH_KEY`, Value: 2단계의 KEY 1 값
   - Name: `AZURE_SPEECH_REGION`, Value: `eastus`

## 4단계 — Edge Function 배포

```bash
cd ~/apps/study
supabase functions deploy azure-token
```

성공 출력:
```
Deploying Function: azure-token
Deployed Function azure-token on project tcbooffrdacfatywdzcm
You can now invoke your function via: https://tcbooffrdacfatywdzcm.supabase.co/functions/v1/azure-token
```

배포 후 Dashboard 의 Edge Functions 페이지에서 `azure-token` 함수 활성 확인.

## 5단계 — 사용자 환경 검증

### 자동 검증 (Claude 가 분석 가능)

1. `~/apps/study` 의 Dev 서버 실행 (이미 떠 있으면 skip):
   ```bash
   cd ~/apps/study && pnpm dev
   ```
2. default Chrome 에서 `http://localhost:5173/#/home` 접속 (이미 leftjap OAuth 됐다면 자동 진입)
3. **Cmd+Shift+R** hard reload (새 speech.js 반영)
4. DevTools Console 의 휴지통 아이콘 클릭 (콘솔 비움)
5. "공부 시작" → 카드 화면 → "따라 말하기" 또는 발음 녹음 버튼 클릭
6. 마이크 권한 허용 → 발음 녹음 → 1-2초 후 점수 표시
7. **콘솔 캡처** (Claude 가 분석):
   - 정상: `[speech][azure] analyze ok score=85 recognized="..."` (또는 비슷)
   - 폴백: `[speech][azure][analyze] init 실패, mock 폴백: <원인>` (Edge Function 미배포 / Azure key 잘못 / 네트워크 등)
   - SDK lazy load: `dist/assets/azure-sdk-*.js` Network 탭에서 첫 호출 시 다운로드 확인

### 수동 검증 (콘솔에서 직접)

DevTools Console 에 입력:
```js
await window.studySpeech.getAzureToken();
```

정상 응답:
```
{ token: "ey...", region: "eastus", expiresAt: 1777553200000 }
```

폴백 응답 (Edge Function 미배포 시):
```
Error: azure-token 404: ...
```

---

## 트러블슈팅

### `azure-token 401: Invalid auth`
- Supabase Auth 세션 만료. 5173 페이지 재로그인 (signOut → Google).

### `azure-token 500: AZURE_SPEECH_KEY not configured`
- 3단계의 secrets 설정 누락. `supabase secrets list` 또는 Dashboard 재확인.

### `Azure issueToken failed status: 401`
- KEY 1 잘못 입력. 1-2단계 다시 진행 (Speech 리소스의 정확한 KEY 1).

### `Azure issueToken failed status: 403`
- Region 불일치. Region 값이 `eastus` (소문자, 공백 X) 인지 재확인.

### 마이크 권한 거부
- Chrome 좌상단 자물쇠 아이콘 → 마이크 → 허용. 또는 Chrome 설정 → 개인정보 → 사이트 권한 → 마이크.

### 무료 티어 한도 (월 5시간 STT)
- Azure Portal → Speech 리소스 → "Metrics" 에서 사용량 확인.
- 한도 도달 시 Wave 11.23 (별 hotfix) 의 client side 한도 모니터링 + mock 폴백 적용 예정.

---

## 환경 변수 요약

| 변수 | 위치 | 값 | 출처 |
|---|---|---|---|
| `AZURE_SPEECH_KEY` | Supabase Edge Function secrets | 32자 hex | Azure Portal → Speech → Keys and Endpoint → KEY 1 |
| `AZURE_SPEECH_REGION` | Supabase Edge Function secrets | `eastus` | Azure Portal → Speech → Keys and Endpoint → Location |
| `SUPABASE_URL` | (자동) Edge Function 런타임 | `https://tcbooffrdacfatywdzcm.supabase.co` | Supabase 자동 주입 |
| `SUPABASE_ANON_KEY` | (자동) Edge Function 런타임 | (anon key) | Supabase 자동 주입 |
| `VITE_SUPABASE_URL` | `~/apps/study/.env.local` | `https://tcbooffrdacfatywdzcm.supabase.co` | (이미 설정됨) |
| `VITE_SUPABASE_ANON_KEY` | `~/apps/study/.env.local` | (anon key) | (이미 설정됨) |

> 클라이언트 (`VITE_*`) 는 Wave 11.4 부터 설정됨. Wave 11.22 신규 = Edge Function 의 Azure 환경변수 2개.
