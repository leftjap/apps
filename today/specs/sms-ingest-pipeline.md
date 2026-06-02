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

### 카드·발신번호 마스터 — single source of truth

> **카드 관련 질문은 이 섹션 1차 참조.** 매번 chat.db 쿼리·사용자 질문 금지.
> 카드 추가/변경 시 (1) 이 테이블 갱신, (2) `supabase/functions/_shared/cardSmsParser.js`의 `CARD_ALIASES` 동기화, (3) 자동화 트리거 섹션 갱신, (4) 필요 시 `scripts/backfill-sms-from-chatdb.py`의 SQL 발신번호 필터 갱신. 한 commit 안에서 처리.

**소연 (soyoun312@gmail.com)**

| Keep 식별자 (raw) | 친화 카드명 | 발신처 | 채널 | 잡는 자동화 |
|---|---|---|---|---|
| 신한8244 | 신한카드 Air | +8215447200 (1544-7200) | SMS | 소연 #4 발신번호 |
| 신한8579 | K-패스 신한카드 체크 | +8215447200 | SMS | 소연 #4 발신번호 |
| 신한8619 | K-패스 신한카드 체크 | +8215447200 (추정) | SMS | 소연 #4 발신번호 |
| 현대백화점카드 | (raw 그대로) | **+8215883650 (1588-3650)** | SMS | 소연 #4 발신번호 (+ #2 키워드 중복 잡음 — unique 제약으로 1건만 저장) |
| 삼성2737 | 삼성카드 iD SIMPLE | **(카톡으로 이전됨)** | **KakaoTalk** | **별도 처리 예정** (현 SMS 자동화로는 안 잡힘) |

**지오 (leftjap@gmail.com)**

| Keep 식별자 (raw) | 친화 카드명 | 발신처 | 채널 | 잡는 자동화 |
|---|---|---|---|---|
| 삼성1337 | (raw 그대로) | +8215888900 (1588-8900) | SMS | 지오 발신번호 |
| 삼성1337 해외승인 | (raw 그대로) | +82220008100 (02-2000-8100) | SMS | 지오 발신번호 |
| KB국민카드 7007 (후불하이패스 포함) | (raw 그대로) | +8215881688 (1588-1688) | SMS | 지오 발신번호 |
| (외화·안내 fallback) | — | +821063491949 (지오 본인) | SMS | 지오 발신번호 |

**발신처 사전** (chat.db 분석 기반, 2026-05-26 갱신)

| 번호 | 발신처 | 비고 |
|---|---|---|
| 1544-7200 | 신한카드 (체크·Air 결제 알림) | 소연 현 사용 |
| 1544-7000 | 신한카드 (옛 채널) | 지오 chat.db 28건 (2015~2017), 현재는 1544-7200으로 이전 |
| 02-310-1234 | 신한카드 (해외 결제 등) | 지오 chat.db 7건 |
| 1588-8900 | 삼성카드 | 국내 결제 |
| 02-2000-8100 | 삼성카드 | 해외승인 |
| 1588-1688 | KB국민카드 | |
| 1588-3650 | **현대백화점카드** | 2026-05-26 확정 (이전 "발신번호 미확보" 가정 정정) |
| +821063491949 | 지오 본인 번호 | 외화·안내 SMS fallback |
| +821097761949 | 소연 본인 번호 | 외화·안내 SMS fallback |

### 자동화 트리거

> **카드별 매핑은 위 마스터 테이블 참조.** 본 섹션은 폰 자동화 정책만.

**지오 (leftjap@gmail.com)** — 발신번호 기반 (chat.db backfill 필터와 동일):
- `+8215888900` (1588-8900, 삼성카드)
- `+82220008100` (02-2000-8100, 삼성카드 해외승인)
- `+8215881688` (1588-1688, KB국민카드)
- `+821063491949` (지오 본인 번호 — 외화·안내 SMS)

**소연 (soyoun312@gmail.com)** — 4개 자동화:
1. **발신번호**: `1588-8900` (삼성), `02-2000-8100` (삼성 해외), `+821097761949` (소연 본인)
2. **키워드 "현대백화점카드"** — 발신번호 1588-3650 확정 전 키워드 fallback. 자동화 #4가 발신번호로도 잡으므로 향후 #2 제거 또는 유지 모두 무해 (unique 제약).
3. **키워드 "승인"** — 모든 카드 SMS 본문 공통 키워드, 광범위 fallback. **현재 작동 0건** (전 기간 — 후술 v2 정정 참조). **권장: 제거** — 카드 SMS 캡처 0건이면서 광고/안내문 잡힐 위험. 발신번호 자동화로 대체.
4. **발신번호**: `+8215447200` (신한카드, 2026-05-26 추가) + `+8215883650` (현대백화점카드, 2026-05-26 확정). 셋업 안내: [`handoff/soyoun-shinhan-automation-setup.md`](../handoff/soyoun-shinhan-automation-setup.md).

**작동 검증 — 2026-05-26 재점검 결과 (이전 2026-05-15 기록 정정):**

| 자동화 | DB 증거 (소연 owner sms_raw IS NOT NULL 행) | 판단 |
|---|---|---|
| #1 발신번호 (삼성) | **0건** | 미작동 또는 소연 삼성 사용 빈도 ↓ (삼성→카톡 이전 진행 중) |
| #2 키워드 현대 | 2건 (2026-05-24) | **작동** |
| #3 키워드 승인 | **0건** (카드 SMS·잡문자 모두 0) | 잡문자 3건은 #3 아닌 **#1 본인 번호** 트리거 — 잡문자 본문에 "승인" 없음. **#3 자체가 폰에 없거나 비활성 가설** (2026-05-26 v2 정정. 폰 미관찰로 100% 확정 아님). |
| #4 신한 발신번호 | 셋업 직후 1건 (test, 2026-05-26) — POST→INSERT→PWA 표시 e2e 통과 ([스샷](../handoff/verify-shinhan-edge-e2e.png)) | **edge function·파서·DB·PWA 흐름은 통과**. 자동 트리거는 소연 폰 셋업 후 운영 관찰 필요. **2026-06-02 실측: 여전히 실시간 0건** (신한 1,250건 중 실시간 자동 ingest 0, count=exact) — 발신번호 1544-7200 미작동. 키워드 "신한" 전환 권장 |

2026-05-15 기록의 삼성 테스트 행은 현재 DB에 부재 (사후 정리됐거나 자동화 비활성화 가능). "셋업 검증 완료"는 자동 catch가 아니라 수동 단축어 실행 1회 가능성 — **자동 트리거 정상 작동 자체는 #2만 확정**.

**자동화 권장 구조 (2026-05-26 v2)** — 위 표 + 잡문자 INSERT 사고 (#1 본인 번호) + #3 미작동 종합:

| 권장 액션 | 사유 |
|---|---|
| #1에서 "+821097761949 (소연 본인)" 제거 | 본인이 본인에게 보낸 메모/대화가 단축어 → POST → unparsed 행 누적 (5/16·5/21 3건 발생, 사후 deleted). **broad/misaligned 트리거** |
| #3 키워드 "승인" 제거 (또는 #4 발신번호로 대체) | 카드 SMS·잡문자 모두 0건. 광범위 키워드라 향후 광고·안내문 잡힐 위험. **발신번호 기반이 신뢰성 높음** |
| **#4 발신번호 자동화 1개로 통합 권장** | 신한 1544-7200 + 현대 1588-3650 + 삼성 1588-8900 + 삼성해외 02-2000-8100. OR 매치라 한 자동화에 다 넣음 |
| 단축어 1개("Today 가계부 SMS") 그대로 유지 | 모든 자동화가 동일 단축어 호출 |

**검증 방법별 무엇이 검증되는지 (혼동 방지)** — 2026-05-26 추가:

| 검증 방법 | 트리거되는 자동화 | 검증되는 것 |
|---|---|---|
| 단축어 앱에서 ▶ 수동 실행 + 신한 포맷 입력 | (자동화 미사용) | 단축어 본체 → POST → DB → PWA 흐름 |
| 본인 → 본인 SMS 발송 | #1 (본인 발신번호) | 자동화 → 단축어 호출 흐름 + 위 단축어 본체 흐름 |
| 진짜 신한카드(1544-7200) 또는 현대백화점카드(1588-3650) 결제 | #4 (해당 발신번호) | #4 발신번호 매칭 트리거 정상 |

본 세션(2026-05-26)에서 시뮬 검증된 것: **단축어 본체 흐름의 POST→DB→PWA 부분**. 단축어가 보내는 정확한 형태(Authorization 헤더 없이 X-Ingest-Token + Content-Type만) 그대로 POST → 200 → 카드명 정규화 INSERT → PWA 자동 갱신. 즉 폰 단에서 자동화가 단축어를 호출해주기만 하면 그 뒤 흐름은 보장.

미시뮬(폰에서만 가능): 자동화 트리거 자체. 발신번호 매칭(#4)은 진짜 카드사 발신처에서 와야 매치되어 spoofing 등으로 강제 시뮬 불가.

(소연 카드 매핑 — 상위 "카드·발신번호 마스터" 섹션 참조. keep GAS `USER_CONFIG['soyoun312@gmail.com'].cardNameMap`도 동일 내용. cardSmsParser의 `CARD_ALIASES`가 raw → 친화명 정규화 처리.)

### 알려진 한계 (양쪽 사용자 공통)
- ~~`last_used_at`: Edge Function fire-and-forget update가 Deno serverless process 종료로 abort. NULL 유지가 정상.~~ **2026-05-26 v2 해소** — `await`로 변경 (index.ts:71). 자동화 발화 시 last_used_at 정확 기록. **자동화 발화 여부 server-side 100% 추적 가능**. self-verify: rejected POST 1건 후 NULL → ISO 시각 업데이트 확인 (소연 토큰 2026-05-26 06:27 UTC).
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

## Ingest health 임계치 (silent failure 방지)

2026-05-26 사고 (소연 신한 한 번도 today-native 수집 안 됨, keep 수동 import 05-14 종료로 노출) 재발 방지.

**원칙:** 자동 수집은 silent failure가 자연스러움 — 모니터링 없으면 사용자가 몇 주~몇 달 뒤에야 알게.

**임계치 (초안, 운영 데이터로 조정):**
- 사용자×카드 단위 — 주력 카드 7일 무수집 시 알림
- "주력 카드" 판정: 최근 90일 거래 ≥10건
- 노출: PWA 가계부 화면 상단 배너 (외부 인프라 무, 사용자 동선에 직접 노출)

**§7 단정 정정:** "iOS 메시지 수신 시 자동화는 본문 미전달" 일반 단정은 너무 강함 — 소연 #2 (키워드 현대) 자동화가 본문을 전달해 edge function에 도달함이 DB로 확인됨 (2026-05-24 2건). Apple 문서의 "본문 미전달"은 일부 트리거·iOS 버전 한정 가능성. 자동화 종류별 실제 작동은 케이스별 검증.

## 알려진 제약

1. Realtime 구독 미구현 (Wave 11.5.4 후행) — PWA 새로고침 필요
2. iOS 단축어 본문 변수 부재 — Apple 공식 한계 (위 §7 정정 참조 — 자동화 종류별 다름)
3. Mac off 시간 ingest 누락 — wake 후 catch-up
4. iCloud Messages 동기화 지연 — iPhone → chat.db 분~시간 단위
5. **소연 신한 — 2026-06-02 실측 여전히 실시간 0건** (Air 446 + 체크 804 = 1,250건 중 실시간 자동 ingest 0건, count=exact). edge function·파서·두 파일 동일·토큰은 정상이나 소연 폰 신한 자동화가 미작동(발신번호 1544-7200 매칭 0 — 미설정/번호 불일치/비활성). 발신번호 우월 권장을 신한에 한해 정정 → **키워드 "신한" 자동화 권장** ([`handoff/soyoun-shinhan-automation-setup.md`](../handoff/soyoun-shinhan-automation-setup.md) v3). 8619는 today 실 SMS 미수집(DB 0, keep/spec 기록만 — 실 본문은 8244·8579 2종만 확인)
6. **iOS "사용하지 않는 앱 정리"(Offload Unused Apps) 가 단축어 앱을 오프로드 → 모든 자동화 정지** ★ 2026-05-26 발견
   - 소연 폰에서 단축어 앱이 사라져 있었음(재다운로드로 복구). 이게 05-14 이후 ingest 정지의 진짜 root cause로 추정 — "트리거 부재" 추정보다 정확.
   - 05/24까지 현대백화점카드 자동화는 작동(DB 2건 증거) → 그 이후 ~05/26 사이에 오프로드 발생한 듯.
   - **운영 대응**: 폰 `설정 > App Store > 사용하지 않는 앱 정리` **OFF**. 단축어 앱은 백그라운드에서 자동화 트리거 실행에 필요 — 오프로드되면 자동화 무력화.
   - **재발 감지**: PWA 갭 배너(주력 카드 7일 무수집)가 silent failure 방어선. 단 단축어 앱 자체가 죽으면 모든 카드 동시 정지 → 배너에 여러 카드 동시 노출 패턴 = 단축어 앱 점검 신호.
   - 참고: [iOS 단축어 오프로드 영향](https://www.tenorshare.com/iphone-fix/shortcuts-not-working-iphone.html), [자동화 비활성화 대응](https://support.apple.com/guide/shortcuts/enable-or-disable-a-personal-automation-apd602971e63/ios)

## 변경 이력

| 일자 | 변경 |
|---|---|
| 2026-05-08 | `0018_sms_ingest_tokens.sql` 토큰 인증 도입 |
| 2026-05-12 | `0019/0020/0021` 사용자별 매핑 DB 화 + enrichByKind DB 쿼리 전환 |
| 2026-05-13 | iOS 단축어 dead 진단 (last_used_at NULL). gateway `UNAUTHORIZED_NO_AUTH_HEADER` 발견 — Authorization: Bearer service_role JWT 필수. backfill 스크립트 헤더 보강. launchd 운영 전환. 본 문서 |
| 2026-05-26 | 소연 신한 미수집 진단. 근본 원인: today-native 신한 수집은 처음부터 작동한 적 없음(0건), keep 수동 import이 stopgap 갭 가려주다 05-14 종료로 노출. fix: edge function 재배포(`50a80d7` 신한 파서 fix 반영), `_shared` deps git 추적, 소연 폰 자동화 #4 (신한 발신번호) 추가 안내. e2e POST→INSERT→PWA 검증 통과 ([스샷](../handoff/verify-shinhan-edge-e2e.png)). spec 검증 기록 정정 + ingest health 임계치 신설 |
| 2026-05-26 | **단축어 앱 오프로드 발견** — 소연 폰에서 단축어 앱이 사라져 있어 재다운로드. 진짜 root cause 후보: iOS "사용하지 않는 앱 정리"가 단축어 앱 오프로드 → 모든 자동화 정지 (05/24 현대 작동 이후 ~05/26 사이 발생 추정). 알려진 제약 #6 신설, 안내문에 오프로드 방지 단계 추가. 카드·발신번호 마스터 신설(spec 상단) — 1588-3650 = 현대백화점카드 확정 |
| 2026-06-02 | 소연 신한 자동 ingest 재점검 — **실시간 0건 확정**(count=exact, 신한 1,250건 중). 파서 정상(테스트 34/34, 8244·8579 실본문 파싱 정확), 두 파일(`_shared`↔`src/services`) 동일, 토큰 last_used 6/1. 단축어 앱은 살아있음(현대 6/1 실시간 도달). 원인: 소연 폰 신한 자동화 미작동(발신번호 1544-7200 매칭 0). 발신번호 우월 권장을 신한에 한해 정정 → 키워드 "신한" 권장(reject 8종 + 결제 시그니처 2중 필터로 안전). 8619 실 SMS 미수집(DB 0). 안내문 v3 추가. 트리거 출처는 DB로 구분 불가(단축어가 출처 미인지)임을 명시 |
