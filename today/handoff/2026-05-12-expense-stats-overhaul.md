# 가계부 통계 패널 전면 점검 + silent revert 핵심 버그 fix (2026-05-12)

## 0. 미완 / 차기 세션 진행 필요 항목

1. **사용자가 마지막 카테고리 모달 시각 만족도 미확인**. 마지막 commit `93d0268` 의 row template 신규 (rowToCategoryPopupHtml) 이후 사용자가 PWA 새로고침 후 시각 확인 안 함. 만족 못 하면 모달 자체 재설계 필요.
2. **소연(SOYOUN_CATEGORIES) 사용자 데이터 점검 안 함** — §5 참조. 사용자(leftjap) 만 처리됨.
3. **검색 모달 (rowToExpSearchHtml + renderExpSearchDexie) 실 동작 미검증**. SOYOUN fallback 제거 후 검색 모달이 다양한 카테고리 row 들을 어떻게 표시하는지 확인 안 함.
4. **BRAND_CATEGORY_MAP 의 LEFTJAP 호환 미정리** — `cafe`/`gift` 등 SOYOUN 전용 카테고리에 매핑된 brand 들 (스타벅스 등 cafe, 호텔신라 등 gift) 이 leftjap 사용자에겐 toCategoryLabel 로 '기타' 통합되어 화면에 노출됨. 사용자별 매핑 분리 또는 BRAND 매핑 전면 재설계 필요.

---

## 1. 세션 개요

- **시작 시점**: 사용자가 "어제 결제한 비틀비틀이 가계부에 반영 안 됨" 호소
- **세션 흐름**: 가계부 ingest 점검 → 통계 패널 fixture 잔재 → silent revert 진짜 버그 → 카테고리 모달 layout
- **최종 commit**: `93d0268` (origin/main 배포 완료)
- **세션 commit 13개** (today 한정, 다른 앱 commit 제외)
- **단위 테스트 578 → 582 (+4건 추가)** / **e2e 4건 신규 (treemap)**

---

## 2. 핵심 버그 #1 — Silent Revert (가장 큰 발견)

### 증상
사용자가 expense category 를 수동/자동 변경해도, **새로고침 시 옛 데이터로 되돌아가는** 현상. Dexie 만 update 되고 Supabase upsert 가 silent fail.

### 원인
[src/db/sync.js](today/src/db/sync.js) `normalizeRow` 함수 (line 80-87) 가 모든 테이블 row 에 `is_shared`, `pinned` 필드를 무차별 추가:
```js
function normalizeRow(row) {
  return {
    ...row,
    is_shared: row.is_shared ? 1 : 0,
    pinned: row.pinned ? 1 : 0,
  };
}
```

이건 `today_entries` 전용 필드. `pullTable` 이 모든 mapping 에 동일하게 normalizeRow 적용 → Dexie 의 expense/comment row 들도 `is_shared=0` 필드 보유.

`pushExpense` 가 Dexie row 를 `...row` 로 spread 해 Supabase upsert 시:
```
PGRST204: Could not find the 'is_shared' column of 'today_expenses' in the schema cache
```

`today_expenses` 테이블에 is_shared 컬럼 없음 → upsert 거부 → `pending_sync=1` 마킹. 하지만 client 가 새로고침 시 pullTable 이 Supabase 의 옛 데이터로 Dexie 덮어씀 → revert.

### 영향 범위
- **모든 expense update** (수동 카테고리 변경, SMS reclassify, 금액/메모 편집 등)
- **모든 comment update** (today_comments 도 동일 컬럼 부재)
- 이 버그는 Wave 11.6.2 이전부터 존재했을 가능성 — 모든 사용자 모든 시점 영향

### Fix
[commit `063e0d8`](https://github.com/leftjap/apps/commit/063e0d8) — `pushExpense` / `pushComment` 의 payload 에서 `is_shared`, `pinned` 명시 삭제:
```js
const payload = { ...row };
delete payload.pending_sync;
delete payload.is_shared;  // expense/comment table 에 없음
delete payload.pinned;
```

### 잠재 후속 작업
- `normalizeRow` 자체를 store 별 분기 처리하는 게 더 깔끔. 현재는 push 함수 마다 방어. 새 동기화 추가 시 동일 패턴 재발 가능.
- Dexie 의 expense/comment row 에 잔존하는 `is_shared=0`, `pinned=0` 필드는 무해 (push 에서 제거되므로). 정리는 선택.

---

## 3. 핵심 버그 #2 — 통계 패널 fixture 잔재 다수

### 증상
"어디에 가장 많이 쓰고 있나요" 카테고리 누적 위젯에 fixture 데이터 (`주거 130만 / 배달 92만 / 패션 83만 ...`) 가 사용자 실 데이터와 무관하게 노출됨. 사용자가 한 번도 만든 적 없는 '주거' 카테고리.

### 원인 (다층)

**(a)** [mocks/today-mac.html:5164-5166](today/mocks/today-mac.html#L5164) 의 `renderTreemap(data.cumulativeCategories)` 가 fixture `cumulativeCategories` (10개 하드코딩) 렌더. SPA 의 `patchCumulativeFromHistory` 가 헤드라인과 brand TOP 10 만 patch 하고 **treemap 영역 patch 코드 누락**.

**(b)** 사이드바 가계부 재클릭 시 mocks `setCategory('expense')` 가 `renderExpense()` 호출 → fixture 재기록. 이미 active 면 MutationObserver 무발화 → SPA patch 미발동.

**(c)** `.exp-cat-more` (+ 5개 더 보기 / 접기) 클릭 시 mocks `toggleCategoryMore` 가 `renderExpense()` 호출 → 동일 race.

**(d)** `toCategoryLabel('food')` 가 LEFTJAP 사용자에 SOYOUN_CATEGORIES fallback 으로 `{name:'마트'}` 반환 → 사용자가 만들지 않은 '마트' 라벨이 통계에 노출 (쿠팡 BRAND 매핑이 `food` 였기 때문).

**(e)** 헤드라인 "2026년 5월 12일까지 총 899만원" + 데이터는 최근 6개월 (2025-12 ~ 2026-05) 누적. 사용자 인지 "2026년 누적" 과 불일치 → 부풀려 보임. 실 2026년 누적은 747만.

### Fix

| Commit | 수정 |
|---|---|
| `5f0cec6` | patchCumulativeFromHistory 에 treemap patch 블록 추가 (`.exp-cat-list` + `.exp-cat-more` 재구성). 사이드바 가계부 클릭 위임 핸들러 (재클릭 race) + .exp-cat-more capture 핸들러 (토글 race). |
| `05da4cb` | `getCategoryById` 의 SOYOUN fallback 제거. 사용자 picker 외 id 면 null → 호출자가 '미분류' 처리. |
| `3e0546c` | `toCategoryLabel` 강화 — null / 사용자 picker 외 id 모두 `'기타'` (etc) 로 통합. patch 코드의 `\|\| '미분류'` 폴백 제거. |
| `d510e48` | patchCumulativeFromHistory 의 months 루프를 year-to-date 로 변경 (1월~현재월). headSub `'YYYY년 누적'` → 빈 문자열 (헤드라인 자체가 이미 시간 범위 표시). |

---

## 4. 부가 fix 6개

### (1) SMS classifier KEYWORD_RULES 보강 — commit `098ff69`
chat.db 6개월 SMS 분석 결과 25건 (173만) 이 매칭 실패 (미분류). 9개 매출처 보강:
- dining: 파인만컴, 비틀비틀, 홍대원조, 치악, 철길부산
- culture: 마음레코드
- transport: 하이패스
- subscribe: GENSPARK, MICROSOFT, XCORP

남은 6개 매출처 (기술보증기금 / 오스트레 / 기프티드 / 필립모리 / 법원행정처 / 동아오츠카) 는 카테고리 불명 — 사용자 수동 매핑.

### (2) 쿠팡 BRAND 매핑 변경 — commit `e19e526`
BRAND_CATEGORY_MAP[쿠팡] `'food'` → `'online'`. 사용자 의도 "쿠팡 = 온라인쇼핑" 정렬. 'food' 는 LEFTJAP picker 에 없어 SOYOUN fallback ('마트') 으로 표시되던 문제도 해소.

쿠팡이츠 (delivery), 쿠팡(와우멤) (subscribe) 은 키워드 fallback 그대로.

### (3) 카테고리 모달 visibility 버그 — commit `b4bfbf9`
`.exp-fp-overlay` 기본 `opacity:0 + pointer-events:none`. `.open` 클래스가 붙어야 시각적 노출. `openCategoryDetailPopup` 에 `requestAnimationFrame(() => overlay.classList.add('open'))` 추가.

### (4) 카테고리 모달 layout (.exp-fp-card wrapper + 중앙 정렬) — commit `971483f`
mocks `openExpenseFloatingPopup` 패턴 답습. `.exp-fp-card` 가 `position:fixed; max-width:420px; transform transition` 담당. 내 코드가 `.exp-fp-popup` 만 만들어 `position:static + width:1906px` 깔리던 버그. mount 후 `getBoundingClientRect()` 로 size 측정해 viewport 중앙 정렬.

### (5) 카테고리 모달 summary footer 분리 + row 한글 라벨 — commit `efc4aea`
큰 viewport 사용자 화면에서 summary 가 카드 max-height 경계 밖으로 잘리는 layout 버그. summary 를 `.exp-fp-body` 외부 `.exp-fp-card` 직접 자식 footer 로 분리 (flex:0 0 auto + inline style padding/border-top). `rowToExpSearchHtml` 의 category 컬럼도 `toCategoryLabel` 변환.

### (6) 카테고리 모달 row 전용 template — commit `93d0268`
검색 모달용 `rowToExpSearchHtml` 를 카테고리 모달에 그대로 재사용 → row 마다 카테고리 라벨 9회 반복 노이즈. `rowToCategoryPopupHtml` 신규 — 첫 column 을 날짜 (MM-DD) 로 교체. CSS grid 슬롯 그대로 활용 → stylesheet 변경 없음.

### (7) fetchCategoryExpenses 한글 ↔ id 양방향 매칭 + scope='year' — commit `6061712`
한글 라벨 ('온라인쇼핑') 로 호출 시 row.category ('online') 와 정확 일치 비교라 0건 매칭되던 버그. `normalizeCategoryKey` (`Classifier.getCategoryIdByName`) 로 양방향 정규화. `searchExpenses` (키워드 텍스트 매칭) 의존 제거하고 `listExpensesByRange` (year scope) / `listExpensesByMonth` (month scope) 직접 사용.

---

## 5. 소연(SOYOUN_CATEGORIES) 사용자 점검 권장사항 ⚠️

### 5.1. silent revert 영향 — 가장 중요
소연 PWA 도 동일 sync.js 사용. **소연이 그동안 수동으로 카테고리 변경한 모든 row** 가 Supabase upsert PGRST204 실패 → 새로고침 시 옛 데이터로 revert 됐을 가능성. 새 코드 (`063e0d8`) 배포 후엔 정상이지만 **그 이전에 변경한 row 들은 영구 손실** (Dexie 잔존 사본도 새로고침 시 덮어씀).

→ 소연에게 "최근 가계부에서 카테고리 수동 변경한 결제가 옛 카테고리로 돌아갔는지" 확인 부탁. 있다면 다시 한 번 변경 (이번엔 정상 sync).

### 5.2. 쿠팡 BRAND 매핑 변경 영향
`BRAND_CATEGORY_MAP[쿠팡] = 'online'` 으로 변경됨. SOYOUN_CATEGORIES 에는 `online` 없음 (SOYOUN: dining/food/convenience/cafe/gift/cat/health/culture/fashion/overseas/invest/etc). 

→ **소연 화면에서 쿠팡 결제가 '기타' 로 통합 노출됨** (toCategoryLabel SOYOUN picker 에 online 없음 → '기타' fallback). 소연 의도는 쿠팡 = 마트(food) 일 가능성 — 사용자별 BRAND 매핑 분리 필요.

가능한 해결:
- A. `BRAND_CATEGORY_MAP` 의 쿠팡 매핑을 `getCurrentCategories()` 기반 동적 결정 (leftjap → online, soyoun → food)
- B. enrichByKind (Edge Function) 에서 user 별 분기 처리
- C. 클라이언트 toCategoryLabel 에서 `'online'` 미존재 시 `'food'` 대체 매핑 추가

권장 — **B 가 가장 깔끔**. SMS ingest 시점에 owner_id 알고 있으므로 user category list 기반 분류 결정.

### 5.3. 'cafe' 카테고리 BRAND 매핑
스타벅스/투썸/이디야 등 BRAND_CATEGORY_MAP 에 `'cafe'` 매핑됨. LEFTJAP 사용자는 cafe 카테고리 없음 → toCategoryLabel '기타' 통합. 이번 세션에서 leftjap 의 cafe 13건은 'dining' 으로 일괄 update (사용자 의도).

소연은 picker 에 cafe 있음 → cafe 카테고리 정상 노출. 영향 없음. 다만 leftjap 사용자의 신규 cafe 결제 들어오면 매번 '기타' 로 떨어지는 구조는 유지.

→ §5.2 와 같이 BRAND 매핑 user 별 분기 또는 LEFTJAP 의 cafe → dining 통합.

### 5.4. KEYWORD_RULES 9개 매출처 보강
모든 사용자 균등 영향. 소연도 동일 매출처 결제 시 정확 분류. 영향 positive.

### 5.5. 헤드라인 year-to-date
모든 사용자 동일. 소연도 2026년 누적으로 정확히 표시.

### 5.6. SOYOUN fallback 제거 — `getCategoryById`
소연 사용자는 영향 없음. SOYOUN_CATEGORIES 가 자신의 picker 이므로 fallback 불필요.

### 5.7. 소연 PWA 직접 점검 절차 (차기 세션)
```js
// chrome-devtools MCP 로 소연 PWA tab 선택 (소연 로그인된 브라우저 필요)
// (1) 카테고리 분포 확인 — '기타' 나 사용자 picker 외 라벨 검색
const dist = (await window.todayDB.expenses.toArray())
  .filter(r => !r.deleted_at && r.amount_krw)
  .reduce((m,r)=>{const k=window.todayExpenses.toCategoryLabel(r.category);m[k]=(m[k]||0)+r.amount_krw;return m;},{});
// (2) 쿠팡 결제 카테고리 분포 확인
const coupang = (await window.todayDB.expenses.toArray()).filter(r => r.brand === '쿠팡');
const coupangCats = coupang.reduce((m,r)=>{m[r.category||'(null)']=(m[r.category||'(null)']||0)+1;return m;},{});
// (3) silent revert 가능성 — pending_sync=1 row 들
const pending = (await window.todayDB.expenses.toArray()).filter(r => r.pending_sync === 1);
```

---

## 6. 차기 세션 시작 절차

### 6.1. PWA 인증된 사용자 브라우저에 attach
chrome-devtools MCP 사용:
```
list_pages → leftjap.github.io/apps/today/ tab 선택 (select_page)
evaluate_script → window.todayDB, window.todayExpenses, window.todaySync 사용 가능
```

### 6.2. Service Worker 캐시 우회 (새 코드 즉시 로드)
```js
async () => {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
  }
  location.reload();
}
```

### 6.3. Supabase write 검증 (silent revert 재발 방지)
모든 expense update 후 반드시 다음 두 가지 검증:
```js
const r = await window.todaySync.pushExpense(rowId);
console.log(r);  // { status: 'ok' } 여야 함. error 면 PGRST204 등 schema 문제 재발
```

### 6.4. Build / Push 누락 방지
이 세션 초반 큰 실패 — 검증만 하고 push 안 함. CLAUDE.md `~/apps/CLAUDE.md` 의 "자동 commit + push" 룰 준수:
- 코드 수정 → 검증 통과 → 사용자 계획 범위 내 완료 → 즉시 commit + `git push origin main`
- WIP snapshot commit (Stop hook) 은 squash 대상. `git reset --soft origin/main` + 의미 commit 으로 정리.

---

## 7. 핵심 코드 위치 빠른 참조

| 파일 | 역할 |
|---|---|
| [src/features/expenses.js](today/src/features/expenses.js) | 통계 패널 patch 함수 + 카테고리 모달 |
| [src/db/sync.js](today/src/db/sync.js) | Dexie ↔ Supabase 동기화 (silent revert fix 대상) |
| [src/services/expense-classifier.js](today/src/services/expense-classifier.js) | 카테고리 정의 + BRAND_CATEGORY_MAP + KEYWORD_RULES |
| [supabase/functions/_shared/expense-classifier.js](today/supabase/functions/_shared/expense-classifier.js) | Edge Function 용 동일 사본 (`cp` 동기화 필수) |
| [mocks/today-mac.html](today/mocks/today-mac.html) | 사이드바 drawer / setCategory / renderExpense fixture |

### 7.1. 주요 export 함수
- `toCategoryLabel(id)` — 영문 id → 한글 라벨 (외부 id / null → '기타' 통합)
- `fetchCategoryExpenses(category, opts)` — opts.scope='year' 또는 'month'
- `openCategoryDetailPopup(category, opts, doc)` — 카테고리 모달 진입점
- `rowToCategoryPopupHtml(row)` — 카테고리 모달 전용 row (날짜 노출)
- `rowToExpSearchHtml(row)` — 검색 모달 row (카테고리 라벨 노출)
- `patchCumulativeFromHistory(year, month, doc)` — year-to-date 누적 patch

---

## 8. 이 세션의 교훈

1. **검증을 Dexie 단계에서 멈추지 말 것** — Supabase 까지 도달 검증 필수. `pushExpense` 결과 `status:'ok'` 확인 + 새로고침 후 데이터 유지 확인.
2. **사용자 단정 동조 금지** — 사용자가 "이게 미분류 주범" 추측해도 실 DB 직접 조회로 검증. 이 세션에서 사용자 추측 (쿠팡=미분류) 이 빗나갔지만 분류 매핑 자체가 사용자 의도와 어긋난 사실은 맞았음.
3. **검증 도구 적극 사용** — chrome-devtools MCP 로 라이브 PWA attach 가능. preview_* 도 가능. 단위 테스트만으로 사용자 환경 검증 못 함.
4. **자동 push 룰 준수** — 검증 끝나면 즉시 commit + push. 사용자 화면까지 코드 도달해야 검증 의미.
5. **WIP snapshot squash 패턴 익숙해질 것** — Stop hook 이 자동 WIP commit 만들면 `git reset --soft origin/main` + 의미 commit + push.

---

## 9. 미해결 가능성 (사용자 호소 못 풀면)

사용자가 마지막에 "기존 모달 재사용하느라 이렇게밖에 못하느냐. 차라리 모달 새로 만들어" 라고 했음. 이번 세션 마지막 commit `93d0268` 에서 row template 신규 만들었지만, 사용자 새로고침 후 만족도 미확인.

**만약 사용자가 여전히 불만족** → 카테고리 모달 자체 전면 재설계 검토:
- 현재 mocks `.exp-fp-card` 패턴 답습 (border-radius, shadow, max-width:420)
- 사용자 의도 — 더 자유로운 layout? 풀스크린? 다른 패턴?
- 또는 그래프/통계 등 카테고리별 추세 시각화 포함?

사용자에게 원하는 디자인 명세 (스샷, 설명) 받아 진행 권장.
