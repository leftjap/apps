# 가계부 사용자별 매핑 DB 화 + 모달 정상화 세션 핸드오프 (2026-05-12)

이전 핸드오프 [2026-05-12-expense-stats-overhaul.md](2026-05-12-expense-stats-overhaul.md) 후속.

## 0. 미완 / 차기 세션 진행 필요

### 0.1. SMS 카드 옵션 매칭 약함
- `parseCardSms` 가 카드를 `삼성1337` / `KB국민카드1234` 같은 형식으로 추출
- mocks 의 카드 옵션 text 는 `삼성카드 1Q` / `삼성카드 & MILEAGE PLATINUM` 등 사용자 정의 라벨
- patchPasteExpenseSMSHandler ([src/features/expenses.js:798-805](../src/features/expenses.js#L798)) 의 매칭 로직 약함 — 사용자별 카드 alias 매핑 또는 4자리 끝번호 매칭 보강 필요
- 사용자 화면 검증 시 SMS 붙여넣기 후 신용카드 필드가 직전 modal state 잔존

### 0.2. 기존 한글 category row 마이그레이션
- 직전 점검 결과 today_expenses 의 한글 category row **0건** (검증 통과)
- picker 외 id 잔존 4건:
  - leftjap `invest` 2건 (주식회사뤼이 815,400 / 한국금융투자 3,000) — SOYOUN 전용 id
  - 소연 `subscribe` 2건 — LEFTJAP 전용 id
- 현 `toCategoryLabel` 이 '기타' fallback 으로 화면 영향 0. 사용자 의도 모름 → 보존

### 0.3. 클라이언트 sync.js / expense-classifier.js 갱신
- 본 세션 보류. 현재 코드 freeze 그대로 + DB today_user_categories 이중 source of truth
- admin UI 작업 시점에 함께 Dexie 캐시 sync 패턴으로 전환

### 0.4. admin UI (사용자 본인 매핑 편집)
- 별 plan. 본 세션 범위 외
- 신규 매장 추가 / 카테고리 픽커 변경을 사용자가 직접 수행 가능해야 "매번 묻는 구조" 진짜 종결
- DB 스키마 준비 완료 (today_user_* 3 테이블 + RLS)

### 0.5. 검색 모달 vs 카테고리 모달 시각 일관성 차이 4건
- 이전 세션 핸드오프 잔존 — width 560/360, r-lg(18) vs r-md(12), position 패턴, backdrop 색
- 카테고리 모달이 r-md 라 DESIGN.md §6 spec (r-lg 18) 와 약간 어긋남

### 0.6. WIP commit squash
- `7c3b219` Stop hook 자동 WIP. 내용은 본 세션 picker rebuild. 의미 commit 갈아끼우려면 force push 위험 → 보존

---

## 1. 세션 개요

- **시작 시점**: 사용자 — "카테고리 모달 좌우 여백" 호소 + 소연 picker 잘못 노출
- **세션 흐름**: 카테고리 모달 redesign → DB 사용자별 매핑 → 누적 브랜드 popup → picker 정상화 → 빈 날짜 클릭 차단 → SMS paste 정상화
- **최종 commit**: `76a879f` (origin/main 배포 완료)

---

## 2. 작업 1 — 카테고리 모달 `.exp-cat-modal-*` 전용 트리

### 배경
이전 모달이 mocks `.exp-fp-card` (가맹점 anchor popup) 트리 재사용 — `position:fixed + width:calc(100vw-48px) + transform animation` 이 카테고리 모달 의도 (viewport 중앙 + 고정 폭) 와 충돌. 좌우 여백 불균등 (좌 32 / 우 16) + viewport 거의 가득.

### 해결
[mocks/today-mac.html](../mocks/today-mac.html) 에 `.exp-cat-modal-*` 전용 트리 신규 (acc-modal grid centering 패턴):

```css
.exp-cat-modal-overlay {
  display: grid;
  place-items: center;
  padding: clamp(32px, 8vw, 96px);
}
.exp-cat-modal-card {
  width: 100%;
  max-width: 360px;
}
.exp-cat-modal-body {
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.exp-cat-modal-body::-webkit-scrollbar { display: none; }
```

### commit
`8763c66` (전용 트리), `8ef06bd` (스크롤바 숨김)

---

## 3. 작업 2 — DB 사용자별 매핑 마이그레이션

### 배경
코드 freeze (LEFTJAP/SOYOUN_CATEGORIES + BRAND_CATEGORY_MAP + MERCHANT_TO_BRAND) 가 leftjap 단일. 매장 추가마다 코드 수정 + deploy 반복. 소연 keep export 매핑도 별도.

### 신규 DB 스키마 ([0019_user_categories.sql](../supabase/migrations/0019_user_categories.sql))
| 테이블 | 컬럼 | 용도 |
|---|---|---|
| today_user_categories | user_id / id / name / display_order | picker |
| today_user_brand_categories | user_id / brand / category_id | brand→category |
| today_user_merchant_aliases | user_id / merchant_pattern / brand | 매장명 정규화 |

RLS 4 정책 + realtime publication.

### production 적용
| owner | picker | brand | alias | expense |
|---|---|---|---|---|
| leftjap (`7bae5645...`) | 11 LEFTJAP | 147 | 257 | 609 |
| 소연 (`aeafd9a7...`) | 12 SOYOUN | 136 | 258 | 1586 |

검증: 쿠팡 → leftjap=`online` / 소연=`food`. CU/GS25/세븐일레븐 → leftjap=`conv` / 소연=`convenience`.

### Edge function `enrichByKind` 갱신
- 코드 freeze 참조 제거 → today_user_merchant_aliases + today_user_brand_categories DB 쿼리
- supabase functions deploy 완료

### 추출 스크립트
- [scripts/extract-leftjap-mappings.mjs](../scripts/extract-leftjap-mappings.mjs)
- [scripts/extract-soyoun-mappings.mjs](../scripts/extract-soyoun-mappings.mjs)

### 0021 중복 INSERT 사고
- expense 1586 INSERT 가 sms_raw=NULL unique 미감지 → 기존 row 와 중복 (3172 부풀음)
- `delete from today_expenses where owner_id=<소연> and meta ? 'keep_id'` cleanup → 1586 복구
- 0021 파일에서 expense INSERT 섹션 제거

### commit
`1158ec1`

---

## 4. 작업 3 — 누적 브랜드 row Dexie popup

### 배경
mocks `openMerchantDetail` 이 FIXTURE.expense.txns (5월 더미) 사용 + anchor popup. leftjap 쿠팡 3건만 (실 121건과 불일치), 소연 대한항공 "내역이 없습니다".

### 해결
- `fetchBrandExpenses(brand, opts)` — Dexie 조회
- `openBrandDetailPopup(brand, opts, doc)` — `.exp-cat-modal-*` 재사용
- `patchOpenMerchantDetailHandler` — `window.openMerchantDetail` wrap

### 검증
leftjap 쿠팡 7건/1,559,720원, 소연 대한항공 3건/2,803,200원.

### commit
`241db78`

---

## 5. 작업 4 — 지출 수정 모달 picker + 영문 id 일관성

### 배경
소연 PWA picker 가 LEFTJAP 11종 노출. 원인 — mocks IIFE `_initExpModal()` → `buildExpModalCatGrid()` 가 인증 전 호출 → `EXP_CATEGORIES_FALLBACK` 사용 → freeze.

추가 — 이중 식별자: mocks `data-cat` 한글 vs DB `row.category` 영문 id. edit chip auto-select 실패 + 새 저장 한글 → DB 혼재.

### 해결
- `rebuildExpModalCatGrid(doc)` — `mountExpensesView` 호출. `#expModalCatGrid` 재정의 (`data-cat=${c.id}` 영문, text=`c.name` 한글)
- `extractExpenseFromForm` 영문 id 변환 fallback (`Classifier.getCategoryIdByName`)
- 단위 테스트 갱신 (`'외식'` → `'dining'`)

### 검증
- 소연 picker SOYOUN 12종 / leftjap LEFTJAP 11종 정상
- edit row dining → chip 자동 활성
- 새 저장 extract category = `'dining'`

### commit
`7c3b219` (WIP)

---

## 6. 작업 5 — 빈 날짜 cell 클릭 비활성

### 배경
캘린더 0건 cell 클릭 → "이 날의 거래가 없습니다 / 거래 추가" popover. 사용자 의도 — 빈 날짜 클릭 자체 비활성. 신규 지출은 우상단 "거래 추가" 일원화.

### 해결 ([src/features/expenses.js:1137](../src/features/expenses.js#L1137))
- `patchedOpenDay` 의 is-zero 가드에서 today 예외 제거
- runtime 가드 — `listExpensesByDate` 결과 0건이면 popover 미오픈
- `patchDayPopoverFromRows` 의 빈 분기 dead path 단순화
- 단위 테스트 2건 갱신

### 검증
- 빈 cell 05-01 / today 0건 05-12 클릭 → popover 미오픈
- 지출 있는 05-02 → popover 정상 2건

### commit
`abeba08`, `9ee2ccf`

---

## 7. 작업 6 — SMS 붙여넣기 지출처 자동 채움

### 배경
mocks `_parseExpenseSMS` 정규식 단순 — last line 마지막 토큰만. 다양한 카드사 SMS 포맷 (시간 패턴, 누적 잔액, [Web발신] 헤더) merchant 추출 실패. 사용자 호소 — 지출처 빈.

### 해결
- `patchPasteExpenseSMSHandler` — `mountExpensesView` 호출. `window.pasteExpenseSMS` wrap
- `parseCardSms` ([services/cardSmsParser.js](../src/services/cardSmsParser.js)) + `Classifier.cleanMerchantName` 사용
- amount/merchant/card/category 자동 채움 (brand → category 매핑은 사용자 미선택 시만)

### build 복구
초기 `23fac03` 후 build fail — `cardSmsParser.js` + `fxRates.js` git untracked. `76a879f` add → today/ 200 복구.

### 검증
`[Web발신]\n삼성카드 1337 승인\n69,900원 일시불\n05/11 21:59\n쿠팡\n누적1,742,030원` → merchant=쿠팡, amount=69,900, category=온라인쇼핑.

### commit
`23fac03`, `76a879f`

---

## 8. production 배포 상태

| commit | 내용 |
|---|---|
| `1158ec1` | DB 사용자별 매핑 (0019/0020/0021 + enrichByKind) |
| `241db78` | 누적 브랜드 Dexie popup |
| `7c3b219` | picker rebuild + 영문 id (WIP) |
| `abeba08` | 빈 날짜 cell 클릭 비활성 |
| `9ee2ccf` | runtime 가드 보강 |
| `23fac03` | SMS paste wrapper |
| `76a879f` | cardSmsParser/fxRates add (build 복구, 최신) |

production today/ = 200, 최신 bundle 로딩.

---

## 9. 핵심 코드 위치 빠른 참조

| 파일 | 역할 |
|---|---|
| [src/features/expenses.js](../src/features/expenses.js) | 모달 patch / Dexie 쿼리 / picker rebuild / SMS paste / brand popup |
| [src/services/expense-classifier.js](../src/services/expense-classifier.js) | LEFTJAP/SOYOUN_CATEGORIES freeze + BRAND_CATEGORY_MAP + MERCHANT_TO_BRAND |
| [src/services/cardSmsParser.js](../src/services/cardSmsParser.js) | SMS 본문 → 가계부 객체 파서 |
| [src/services/fxRates.js](../src/services/fxRates.js) | 외화 → KRW 변환 |
| [supabase/migrations/0019_user_categories.sql](../supabase/migrations/0019_user_categories.sql) | 신규 3 테이블 + RLS |
| [supabase/migrations/0020_seed_leftjap.sql](../supabase/migrations/0020_seed_leftjap.sql) | leftjap seed |
| [supabase/migrations/0021_import_soyoun.sql](../supabase/migrations/0021_import_soyoun.sql) | 소연 import |
| [supabase/functions/sms-card-ingest/index.ts](../supabase/functions/sms-card-ingest/index.ts) | Edge function — DB 쿼리 enrichByKind |
| [mocks/today-mac.html](../mocks/today-mac.html) | `.exp-cat-modal-*` CSS + buildExpModalCatGrid + openMerchantDetail |

### 9.1. 주요 신규 export 함수
- `rebuildExpModalCatGrid(doc)`
- `fetchBrandExpenses(brand, opts)`
- `openBrandDetailPopup(brand, opts, doc)`
- `patchOpenMerchantDetailHandler()`
- `patchPasteExpenseSMSHandler()`
- `extractExpenseFromForm` (영문 id 변환 fallback)

---

## 10. 차기 세션 시작 절차

### 10.1. PWA 인증 사용자 attach
- 양쪽 chrome window — leftjap 시크릿창 + 소연 본 chrome
- chrome-devtools MCP `list_pages` + `select_page`

### 10.2. emulate 사용 금지
- `emulate` 가 attach 한 chrome window 자체 viewport 변경 위험. 사용자 화면 깨짐
- 실 viewport + screenshot

### 10.3. SW 캐시 우회 (deploy 후 검증)
```js
async () => {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }
  location.reload();
}
```

### 10.4. SMS paste 검증 — clipboard mock
```js
navigator.clipboard.readText = async () => '<SMS 본문>';
await window.pasteExpenseSMS();
```

### 10.5. Build 안전
- 신규 import 추가 시 `git status` 로 untracked 파일 확인 — `cardSmsParser.js`/`fxRates.js` 누락 사고 재발 방지
- Stop hook WIP commit 흡수 가능. push 후 git log 확인 필수

### 10.6. supabase CLI
```bash
cd today
supabase migration list --linked
supabase db push --linked --include-all
supabase functions deploy sms-card-ingest --project-ref tcbooffrdacfatywdzcm
supabase db query --linked "<SQL>"
```

---

## 11. 교훈

1. **mocks ↔ SPA 식별자 형식 일치 점검** — 한글 라벨 vs 영문 id 이중 식별자 위험. 신규 모달 시 통일.
2. **mocks IIFE 시점 인증 의존 분기 주의** — 1회 호출 함수가 인증 정보 의존 시 SPA 측 rebuild trigger 필요.
3. **`continue-on-error: true` GH Actions 함정** — today build fail 해도 deploy success. 404 인데 status ✓. silent fail.
4. **신규 import 시 git status 필수 확인** — supabase/functions/_shared/ 사본 있어도 src/services/ untracked 면 build fail.
5. **production DB INSERT unique constraint** — sms_raw=NULL 끼리 PostgreSQL unique 통과 (NULL != NULL). on conflict 가드 무효. 0021 1586 중복 INSERT 사고.
6. **WIP commit 흡수 패턴** — Stop hook 가 본 세션 변경 자동 WIP commit 흡수. push 후 git log 확인.
