# SMS 카드 결제 → 가계부 ingest 파이프라인

> 2026-05-13. 디버깅·단축어·backfill 운영 시 1차 참조. 매번 같은 질문 반복 방지.

## 핵심 결론

**iOS "메시지 수신 시" 자동화는 메시지 본문을 변수로 전달하지 않는다.** 트리거 종류 (특정 발신자 / "Message Contains") 와 무관 — Shortcut Input 이 비어있음.
출처: [Apple Support](https://support.apple.com/guide/shortcuts/communication-triggers-apdd711f9dff/ios) · [Automators Talk](https://talk.automators.fm/t/automating-e-mail-content/16537) · [Apple Developer Forums #705659](https://developer.apple.com/forums/thread/705659)

→ realtime SMS forwarding 사실상 불가. **chat.db 주기 backfill** 이 현실적 ingest 경로.

## 운영 구조

```
iPhone Messages 수신
  → iOS 단축어 "Today 가계부 SMS" (자동화 트리거)
  → POST + X-Ingest-Token
  → sms-card-ingest Edge Function (verify_jwt=false)
  → parseCardSms → enrichByKind → today_expenses INSERT
  → (PWA 새로고침) → sync.js pullTable → Dexie → UI
```

**iOS 단축어가 핵심 경로**. 5/11 까지 실 작동 확인 (DB created_at 증거). 5/12 16:36 functions deploy 시 verify_jwt=true 활성화로 며칠간 차단됨. 5/13 verify_jwt=false redeploy 로 회복.

**백업 (수동)**: 단축어 사고 시 Terminal 에서:
```bash
cd ~/apps/today && python3 scripts/backfill-sms-from-chatdb.py
```
chat.db (~/Library/Messages/chat.db) 에서 최근 1년 카드 SMS 풀 backfill. unique constraint 가 중복 차단.

(launchd 30분 주기 자동 backfill 시도 — macOS TCC sandbox 정책으로 stub binary 권한 부여해도 실제 Python.app 호출이 차단됨. 2026-05-13 폐기.)

## Edge Function deploy 영구화

`today/supabase/config.toml` 의 `[functions.sms-card-ingest] verify_jwt = false` 가 영구 설정.
다음 deploy 시 옵션 누락해도 자동 false:
```bash
cd ~/apps/today && supabase functions deploy sms-card-ingest --project-ref tcbooffrdacfatywdzcm
```

명령행으로 한 번에 명시도 가능:
```bash
supabase functions deploy sms-card-ingest --no-verify-jwt --project-ref tcbooffrdacfatywdzcm
```

## 참조 — keep github

사용자 운영 중인 keep 앱이 신용카드 SMS 파싱 안정적 + 외화 결제 처리 로직 보유 가능. 본 Edge Function 의 `parseCardSms` (특히 외화 / 할부 / scheduled_hipass / transit) 보강 시 참조. 베끼지 않고 패턴만.

## iOS 단축어 (백업, 작동 보장 안 함)

**자동화**: 메시지 수신 시 (즉시 실행). 발신자 필터 — 삼성카드 / +82 1588-8900 / +82 1588-1688 / +82 2-2000-8100. (`scripts/backfill-sms-from-chatdb.py:27` 의 `+821063491949` 는 단축어 필터 누락)

**단축어 "Today 가계부 SMS"**:
1. `입력 받기` (Shortcut Input → 텍스트). `입력 없는 경우: 텍스트 요청` ← **자동화 환경에서 멈춤**
2. `URL 콘텐츠 가져오기`
   - URL: `https://tcbooffrdacfatywdzcm.supabase.co/functions/v1/sms-card-ingest`
   - POST, `X-Ingest-Token: <hex>`, `Content-Type: application/json`
   - Body JSON: `text=<단축어 입력>`, `received_at=<현재 날짜 ISO 8601 +09:00>`
3. `중단 및 URL 콘텐츠 출력`

## Edge Function API

`POST /functions/v1/sms-card-ingest`

### 인증 두 단계 (둘 다 필수)
1. **Gateway** (Supabase platform-level, `verify_jwt = true` default):
   - `Authorization: Bearer <JWT>` 필수. 부재 시 401 `UNAUTHORIZED_NO_AUTH_HEADER`
   - 새 publishable anon key (`sb_publishable_*`) 는 JWT format 아니라 거절 → 401 `UNAUTHORIZED_INVALID_JWT_FORMAT`
   - **service_role JWT (eyJ...)** 사용 (.env.local 의 `SUPABASE_SERVICE_ROLE_KEY`)
2. **함수 본체** (Edge Function 코드):
   - `X-Ingest-Token: <hex>` — `today_sms_ingest_tokens` 테이블 검증

### Request
```
POST /functions/v1/sms-card-ingest
Authorization: Bearer eyJ...<service_role>
X-Ingest-Token: <hex>
Content-Type: application/json

{"text": "...", "received_at": "<ISO 8601>"}
```

### Response 200 body.status
- `ok` / `duplicate` / `unparsed` (amount_krw=NULL) / `rejected` (거절·취소·명세서·결제예정·광고·차단·비번·카드발급·0원외화)
- 400: text/received_at 누락 · 401: 인증 실패 (위 두 단계 중 하나) · 500: 내부 오류

### 보안 노트
- service_role JWT 는 RLS bypass — 노출 금지. 로컬 backfill 스크립트는 `.env.local` 에서 로드, 하드코딩 회피
- **단축어에 service_role 키 넣지 말 것** — iPhone 저장 위험. 단축어는 어차피 본문 미전달로 dead → 폐기 권장

**코드**: [supabase/functions/sms-card-ingest/index.ts](../supabase/functions/sms-card-ingest/index.ts) · [\_shared/cardSmsParser.js](../supabase/functions/_shared/cardSmsParser.js) · [\_shared/expense-classifier.js](../supabase/functions/_shared/expense-classifier.js)
사용자별 매핑 (2026-05-12 Wave 11.8): `today_user_merchant_aliases` + `today_user_brand_categories`

## 토큰 발급 (Supabase Studio SQL Editor)

```sql
insert into today_sms_ingest_tokens (token, owner_id, label)
values (encode(gen_random_bytes(24), 'hex'), '<auth.users.id>', '단축어 / launchd')
returning token;
```
leftjap 토큰: `de72f3361a68395a009769b2af6a2bbe266c7023244af179` (단축어 + backfill 공통).
soyoun 토큰: `52cdb054e11608778077461f27d797cb7b98df5845bf95a8` (소연 아이폰 단축어, 2026-05-14 발급).

## 아이폰 단축어·자동화 셋업 (지오·소연 공통 구조)

### 단축어 본체 "Today 가계부 SMS" — 양쪽 동일 (토큰 값만 다름)

작업 순서 (스크린샷 검증 완료):

1. **입력 받기** (단축어 메타 설정 — 별도 액션 X, 단축어 자체 input)
   - 입력 유형: 텍스트 및 앱
   - 입력 없는 경우: 텍스트 요청
2. **URL의 콘텐츠 가져오기**
   - URL: `https://tcbooffrdacfatywdzcm.supabase.co/functions/v1/sms-card-ingest`
   - 메소드: POST
   - 헤더 2개:
     - `X-Ingest-Token`: 사용자별 토큰 (위 토큰 발급 섹션 참조)
     - `Content-Type`: `application/json`
   - 본문 요청 (JSON) 2개:
     - `text` = "단축어 입력" 매직 변수
     - `received_at` = "현재 날짜" 변수
3. **중단 및 URL 콘텐츠 출력** (출력할 곳 없으면 동작 실행 안 함 — 자동화 시 무시, 수동 실행 디버깅용)

### 자동화 트리거

**지오 (leftjap@gmail.com)** — 발신번호 기반 (chat.db backfill 필터와 동일):
- `+8215888900` (1588-8900, 삼성카드)
- `+82220008100` (02-2000-8100, 삼성카드 해외승인)
- `+8215881688` (1588-1688, KB국민카드)
- `+821063491949` (지오 본인 번호 — 외화·안내 SMS)

**소연 (soyoun312@gmail.com)** — 3개 자동화 (2026-05-15 셋업 검증 완료):
1. **발신번호**: `1588-8900` (삼성), `02-2000-8100` (삼성 해외), `+821097761949` (소연 본인)
2. **키워드 "현대백화점카드"** — 현대백화점카드 SMS 발신번호 미확보 대체 (소연 사용 127건)
3. **키워드 "승인"** — 모든 카드 SMS 본문 공통 키워드, 광범위 fallback

**작동 검증** (2026-05-15):
- 소연 → 본인 테스트 SMS (`[Web발신]\n삼성2737승인 소*연\n1,000원 일시불\n05/15 13:30 단축어테스트`) 전송
- → today_expenses 자동 INSERT 확인 (amount=1000, merchant="단축어테스트", card="삼성2737")
- → 단축어/자동화 정상 작동 확정

**소연 카드 매핑** (keep GAS `USER_CONFIG['soyoun312@gmail.com'].cardNameMap` 인용):
| Keep 식별자 | 카드명 |
|---|---|
| 삼성2737 (또는 삼성) | 삼성카드 iD SIMPLE |
| 신한8244 | 신한카드 Air |
| 신한8579 | K-패스 신한카드 체크 |
| 신한8619 | K-패스 신한카드 체크 |

(Today Edge Function 의 cardSmsParser 는 raw `삼성2737` 그대로 저장 — Today 측 cardNameMap 매핑 없음. 화면 표시 정제는 별도 작업 항목.)

### 알려진 한계 (양쪽 사용자 공통)
- `last_used_at`: Edge Function fire-and-forget update (`index.ts:71` `void`) 가 Deno serverless process 종료로 abort. NULL 유지가 정상. 검증 지표 = today_expenses row 추가 여부.
- PWA 가계부 화면: Realtime 미구현 (아래 "알려진 제약" §1). 새 row 추가 후 화면 반영은 수동 새로고침 필요.

## 디버깅 절차

```bash
# .env.local 로드
set -a; source /Users/gio_c/apps/today/.env.local; set +a

# (1) 토큰 last_used_at — NULL/오래되면 ingest 중단
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$VITE_SUPABASE_URL/rest/v1/today_sms_ingest_tokens?owner_id=eq.$USER_ID_LEFTJAP&select=token,label,last_used_at"

# (2) 특정 시각대 row 존재 — 서버 ingest 여부
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$VITE_SUPABASE_URL/rest/v1/today_expenses?owner_id=eq.$USER_ID_LEFTJAP&spent_at=gte.<ISO_FROM>&spent_at=lt.<ISO_TO>&select=spent_at,amount_krw,merchant,category,sms_raw"
```

**(3) Edge Function 로그**: Supabase Dashboard → Functions → sms-card-ingest → Logs

**(4) PWA UI 미반영** (서버엔 있는데 안 보임) — 콘솔에서:
```js
(async()=>{const r=await navigator.serviceWorker.getRegistrations();await Promise.all(r.map(x=>x.unregister()));const k=await caches.keys();await Promise.all(k.map(x=>caches.delete(x)));location.reload();})();
// 또는: await window.todaySync.pullTable({dexie:'expenses',supabase:'today_expenses',filterColumn:'owner_id'},window.todayDB,window.todayUser.id);
```

**(5) 파서 단위 검증**:
```bash
cd ~/apps/today && node --experimental-vm-modules -e "import('./supabase/functions/_shared/cardSmsParser.js').then(m=>console.log(JSON.stringify(m.parseCardSms('<본문>'),null,2)))"
```

## 알려진 제약

1. Realtime 구독 미구현 (Wave 11.5.4 후행) — PWA 새로고침 필요
2. iOS 단축어 본문 변수 부재 — Apple 공식 한계
3. Mac off 시간 ingest 누락 — wake 후 catch-up
4. iCloud Messages 동기화 지연 — iPhone → chat.db 분~시간 단위

## 변경 이력

| 일자 | 변경 |
|---|---|
| 2026-05-08 | `0018_sms_ingest_tokens.sql` 토큰 인증 도입 |
| 2026-05-12 | `0019/0020/0021` 사용자별 매핑 DB 화 + enrichByKind DB 쿼리 전환 |
| 2026-05-13 | iOS 단축어 dead 진단 (last_used_at NULL). gateway `UNAUTHORIZED_NO_AUTH_HEADER` 발견 — Authorization: Bearer service_role JWT 필수. backfill 스크립트 헤더 보강. launchd 운영 전환. 본 문서 |
