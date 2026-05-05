# _pending-classify.md — 분류 대기 교훈

> STATUS.md 변경 이력에서 이관된 교훈 단락. 분류 4축은 `~/apps/memory.md` "## 실수 재발 방지" 참조.
>
> **분류 후 처리:** 적절한 위치 (skill / docs/lessons/<topic>.md / spec / memory.md) 로 이동 + 본 파일에서 제거. 영구 가치 낮은 항목은 단순 삭제.

이관 일자: 2026-05-01

---

## Wave 11.30 SPA 모드 .pv-bar 일괄 hide (Study, 2026-05-01)

**핵심 교훈 (다음 세션 Claude 가 몰라도 됨 — 박제):**
1. **SPA 환경 식별 = mount() 호출 자체.** `window.studyDB` 가드는 부적합 (login 라우트는 db 없이 진입). main.js → app.js → mount() 경로를 거쳤는지가 SPA vs mocks 단독 (iframe/file://) 분기. mount() 안에서 호출되는 모든 처리 (hidePvChips 등) 는 자동으로 SPA 한정.
2. **playwright `page.goto(hash)` 의 no-op 함정.** 현재 hash 와 같으면 navigation 이벤트 미발화 → mount() 미호출 → 라우트 변경 검증 실패. 우회 = 더미 hash (`#/__bootstrap__`) 한 번 거쳐 실 라우트 진입. 모든 라우트 진입 e2e 의 표준 prologue.
3. **preview MCP server lifecycle = 응답 사이클 한정 (관찰).** preview_start 후 다음 응답 사이클에 `Server not found` 반복. 다중 응답 사이클에 걸친 검증은 bash `pnpm dev` background spawn 으로 우회. lsof / curl 로 listen 검증.
4. **`!important` 의 진짜 효과 = mocks IIFE 후행 변경 차단.** session.html 의 spacer 동적 코드가 .pv-bar offsetHeight 만 읽음 → display:none 시 0 → spacer 0 자연 정합. 후행 변경 위험은 미래 mocks 에 대한 안전 마진.
5. **dist 산출 영향 작음** — app.js 의 ~10 라인 추가, vite build 시 index 청크 +0.x KiB 정도 (자연 증가). PWA precache 영향 0.
6. **사용자 발화 "목" = "모킹" 의 한국어 음성 표기.** spec 컨텍스트에서 mocks/*.html 의 시안 도구 (.pv-bar) 지칭. 향후 "목 디버그", "목 chip" 등 어휘 사용 시 즉시 인지.

---

## Wave 11.29 home 콘텐츠 빈 상태 UI (Study, 2026-05-01)

**핵심 교훈 (다음 세션 Claude 가 몰라도 됨 — 박제):**
1. **Dexie 복합 인덱스 fallback 패턴.** `where('[lang+date]').equals([lang, todayISO])` 가 schema.js 의 todayLessons 인덱스 `'id, lang, date'` 에 복합 X. 시도하면 throw → `.catch(async () => …)` 로 단일 lang 인덱스 + in-memory date 필터 fallback. 본 Wave 는 fallback 만 동작 (복합 인덱스 미정의 — 마이그레이션 별 안건).
2. **Clawd 분기 우선순위 = 사용자 컨텍스트 > 콘텐츠 상태.** 첫 사용 / 장기 공백은 콘텐츠 분기보다 우선 — 콘텐츠 상태 안내가 의미 있는 시점은 정상 활성 사용자 (1~2일 전 학습) + today 콘텐츠 준비 상태. spec §5-1 우선순위 7단 박제.
3. **summary-row 클래스 분기 검증 패턴 (e2e).** `.summary-item-empty` / `.summary-item-done` 의 visibility 검증 = 클래스 존재 자체. count() 0 검증으로 "특정 분기 미노출" 도 binary 검증 가능.
4. **todayLessons.completed 필드는 finish() 의 newCompleted 처리 시 true 로 마킹** (mocks/session.html L1480 `db.todayLessons.update(nc.id, { completed: true })`). 즉 모두 완료 분기는 자연 발화 — 사용자가 신규 카드 모두 학습 시 다음 home 진입 시 "오늘 학습 완료" 노출.
5. **DESIGN.md restraint 정합 — 강조 X.** 빈 상태 (`empty`) = italic muted, 완료 (`done`) = sage. accent 색 미사용 (강조는 카운트/실 데이터에). 시각 위계 유지.
6. **"신규 준비 중" 한국어 vs Clawd 영문/일문 메시지 분리.** UI 라벨 (한국어) 과 캐릭터 말풍선 (lang 별) 가 다른 책임 — UI 는 사용자 언어 (한국어 디폴트), 캐릭터는 학습 언어 컨텍스트. 일관 위배 X (각자 책임 영역).

---

## Wave 11.28 summary 평균 발음 점수 + Top 3 약점 음소 (Study, 2026-05-01)

**핵심 교훈 (다음 세션 Claude 가 몰라도 됨 — 박제):**
1. **pronunciationLog 의 createdAt 미인덱스.** schema.js L26 `pronunciationLog: 'id, date, lang'` — date 는 인덱스, createdAt 은 비인덱스. Dexie 의 `where('createdAt').above()` 사용 불가. 'date' 인덱스로 today 분만 좁힌 후 in-memory createdAt 필터가 정합.
2. **이번 세션 식별 = state.startMs.** session.html 의 closure 변수, finish() 진입 시 그대로 살아있음. `new Date(state.startMs).toISOString()` 으로 ISO 문자열 변환 후 createdAt 문자열 비교 (ISO 8601 lexicographic = 시간 순). sessionId 별도 필드 없음.
3. **summary 의 mocks vs SPA 분기 = data.pronAvg 존재 여부.** SPA 모드 finish() 가 항상 채움 (number|null). mocks 단독 진입 (iframe 허브, finish 미호출) 은 sessionStorage 의 fixture data — 의도적 누락 시 fallback path. 동일 render() 함수가 두 케이스 자연 처리.
4. **DOMTokenList classList.add('') 에러 회피.** L174 의 `if (cls)` 가드 — avg 70~89 구간은 빈 cls 라 add 시 에러. 기존 코드의 pattern 그대로 유지.
5. **e2e 의 tryCount=0 분기 정합.** 발화 시뮬은 마이크 의존 (e2e 미지원) — 자연스럽게 tryCount=0. finish() 가 pronAvg 집계는 정상 (pronunciationLog 시드 기반) 하지만 summary render 가 tryCount=0 우선 분기로 "—" 표시. sessionStorage 의 pronAvg=80 정확성은 별도 검증.
6. **약점 음소 Top 3 sort 안정성.** Object.entries(tally).sort((a,b) => b[1]-a[1]) — 빈도 동률 시 입력 순서 유지 (V8 의 stable sort, 2018+ ECMA spec 보장). 본 Wave e2e 는 /θ/ vs /ʌ/ 동률 → 입력 순 그대로.

---

## Wave 11.27 PWA 인프라 회귀 방지 e2e + manifest.id (Study, 2026-05-01)

**핵심 교훈 (다음 세션 Claude 가 몰라도 됨 — 박제):**
1. **PWA 인프라 audit 부터 — 새로 만들지 말 것.** Wave 11.27 진입 시 "manifest 신규 / 아이콘 신규" 로 가정했으나 실제 모두 Wave 11.20+ 에 완비. audit 으로 발견 후 본 Wave 가치를 "회귀 방지 e2e" 로 재정의. 새 인프라보다 기존 자산 회귀 방지가 중기 ROI 큼.
2. **PWA install 조건 (Chromium)**: valid manifest + name + short_name + start_url + display=standalone+ + icon ≥192 + icon ≥512 + service worker fetch handler + HTTPS/localhost. 본 e2e 는 이 조건들을 매 회 자동 검증.
3. **manifest.id 필드 (2024+ PWA spec 표준)**: PWA identity 명시. 미명시 시 start_url+scope 로 fallback — install 후 start_url 변경 시 다른 PWA 로 인식되어 재설치 유도. id 명시 시 stable identity.
4. **vite preview 의 .webmanifest content-type**: `application/manifest+json` 또는 `application/json` 둘 다 가능. e2e 정규식 `manifest\+json|json` 으로 호환.
5. **navigator.serviceWorker.ready** Promise 패턴: registerSW.js 가 load 이벤트로 register → controller 활성까지 대기. e2e 의 `page.waitForFunction(() => navigator.serviceWorker?.ready)` 가 정확한 wait 지점.
6. **Lighthouse PWA category 2024-04 deprecated** (Lighthouse 12 부터). 수동 또는 자동화 e2e 로 대체. 본 Wave 의 4건이 Lighthouse PWA audit 의 핵심 항목 cover.

---

## Wave 11.26 SPA 통합 e2e + env 백업·복구 자동화 (Study, 2026-05-01)

**핵심 교훈 (다음 세션 Claude 가 몰라도 됨 — 박제):**
1. **vite import.meta.env 인라인 시점 = build 시.** preview 시점 .env 변경은 무의미. e2e 의 env 우회는 build 직전에 해야 함. globalSetup (webServer 시작 직전) 으론 부족.
2. **bash trap EXIT/INT/TERM 패턴이 가장 안전.** node script 의 try/finally 도 가능하지만 SIGTERM 시 finally 미보장. trap 은 모든 종료 경로 cover.
3. **TODAY_ISO 동적화 (Wave 11.20+) 영향 — seed 13 카드 nextReview 가 모두 2026-04 또는 2026-06.** 2026-05-01 시점 dueToday 결과: 10장 (4월 전체) + future 3장 (6월). e2e 는 ≥1 만 검증 — 정확 카운트 미가정. 향후 시점 변동 무관.
4. **playwright spy 시점 — main.js IIFE 가 동기 `window.studySpeech` 등록 보장 (speech.js import 가 module top-level).** 따라서 page.goto('/') 직후 spy 설치 가능. 라우트 변경 (#/session) 후엔 spy 가 살아있지만, mount() 가 새 IIFE 를 reExecuteScripts 하면 토스트 등 기타 cycle 영향 가능 → 안전하게 라우트 진입 후 한 번 더 spy 재설치 (test C 패턴).
5. **session-flow D 의 다중 분기 인정 (btnReveal / interGo / #/summary).** judge 'got' 후 정확한 다음 상태는 reviewCards.length 의존 (1장이면 finish, 2+장이면 다음 prompt, last review 면 interstitial). e2e 는 "어떤 형태로든 advance" 만 검증 — 이게 SPA 통합 안정성 본질.

---

## Wave 11.23 + 11.24 + 11.25 autoTTS + Azure analyze + stats month cursor (Study, 2026-05-01)

**핵심 교훈 (다음 세션 Claude 가 몰라도 됨 — 박제):**
1. **Study 의 audit 정밀도 — grep 키워드 추측 금지.** 본 turn 초반 `grep "score-pop|scorePop|rpg|damage"` = 0건 → "미구현" 결론 잘못. 실제 함수명 = `showScore` / `scoreOverlay` / `applyWordHighlight` / `openWordSheet`. spec 문구 그대로 grep 하지 말고 실제 코드 함수 시그니처 read 후 결론. (verify-claims hook 발동 위험.)
2. **mocks vs SPA 모드 분기 키 = `window.studyDB` 존재.** SPA = main.js 경유 → studyDB/studySpeech/studyAuth 등록. mocks 직접 진입 = closure local state, window 미등록. SPA 전용 동작은 `if (window.studyDB)` 가드.
3. **speech.js analyze() 시그니처** = `await window.studySpeech.analyze(expectedText, { lang })` → `{ score, wordScores, phonemeScores, weakPhonemes, fluencyScore, completenessScore, prosodyScore }`. analyze 자체가 마이크 직접 처리 (SDK SpeechRecognizer.recognizeOnceAsync). mocks/session.html 은 호출만.
4. **mocks/session.html toggleRec 흐름** — idle → recording (사용자 클릭) → analyzing (사용자 또 클릭) → showScore. analyzing 단계에서 analyze 호출. recording = UI 시각만.
5. **stats month cursor JS Date 패턴** — `new Date(year, month, 0).getDate()` = 해당 month 마지막 날 (month=4 → 30, month=2 → 28). `new Date(year, month-1, 1).getDay()` = 첫 요일 (0=Sun..6=Sat). 월요일=0 기준 변환 = `(getDay + 6) % 7`.
6. **Wave 11.25 mocks fallback 한계** — APRIL_DATA fixture 는 4월만. 다른 month 의 mocks 모드 = 빈 캘린더 (의도, 시안). SPA 모드 = Dexie sessionLogs 의 모든 month 정합.

---

## Wave 11.6.3.2 + 11.5.7 + 11.5.7b 일자 시트 + Spotlight (Today, 2026-04-30)

**핵심 교훈 (다음 세션 Claude 가 몰라도 됨):**
1. **mocks IIFE 의 closure 격리 패턴 표준화** — IIFE 안 함수 직접 호출 (예: `openExpDayPopover(day)`, `_spotlightCollectDocs()`, `_spotlightOpenItem(item)`) 은 closure local reference 라 `window.` monkey-patch 우회. SPA hijack 시 mocks 호출부도 `(window.|| local)` 패턴 적용 필수. Wave 11.6.3.2 에서 Preview MCP 실기 검증 도중 발견 (직접 호출 시 Dexie 데이터 / cell click 시 fixture). spotlight 도 동일 패턴 답습 (Wave 11.5.7 의 collect 함수 + Wave 11.5.7b 의 OpenItem). spec §14a 박제.
2. **fake DOM querySelector chain 차이** — vitest 의 makeFakeDoc 의 querySelector 가 같은 sel 이면 같은 노드 반환. `popover.querySelector('.foot').querySelector('.foot-count')` 와 `popover.querySelector('.foot-count')` 가 다른 노드 반환 (children Map 별도). 테스트 chain 호출로 통일 필수.
3. **patched 함수 동기/비동기 race** — Spotlight `_spotlightRender` 가 동기, Dexie 가 비동기. 1회 cache fill (mountSpotlightView) + openSpotlight monkey-patch 가 매 호출 시 cache refresh 패턴 유효. 새 글 추가 직후 spotlight 열어도 정합. 단순 + 충분.
4. **categoryKey 매핑 (soyoun_navi → 'navi')** — partner shared navi 도 네비 카테고리로 진입. mocks Recents 는 본인 + partner 합집합 표시 (Wave 11.7.3), mainView 는 partner row 그대로 — 자연 UX.
5. **renderDocFromRow timing 200ms** — `_spotlightGoCategory` 80ms 후 mocks setCategory + handleCategoryActive 비동기 entry 렌더 → 추가 120ms (총 200ms) 후 SPA 가 한 번 더 덮어쓰기. 한 시점만 검증 시 race timing 갭 (mainView article 잡기 어려움). 재query 시 정합 보장.

---

## 디자인 가이드 교체 ui-design-guide.md → DESIGN.md (공통, 2026-04-28)

**교훈 (다음 세션 Claude 가 몰라도 됨 — 여기 기록):**
1. **Anthropic Claude Design 출력 권위 = "사용자 자산 + 자체 판단 + 공식 컬러 inference" 조합.** today-app.html 의 토큰 중 외부 공식 출처 = Crail #d97757 1건만. 나머지(Pretendard / OKLCH ink / 16px floating sidebar / 2/255 톤 / r-md 12 / r-lg 18 / shadow-float 3단) = Claude Code Mac GUI 시각 모방 = Anthropic 자체 frontend 도구 de facto 디자인 권위 (단 spec 문서 비공개, 시각 모방 ±2-4unit 오차 가능)
2. **DESIGN.md 9 섹션 = Claude Design 입출력 호환 형식.** 다음 Claude Design 호출 시 자동 인식 + Claude Code 핸드오프 호환 (`tokens + components + routes` 번들)
3. **Edit replace_all + 보존 라인 임시 마커 패턴** (today-app-spec L83 보존 위해 `__LEGACY_UDG_MD__` 마커 → replace_all → 마커 원복). `.md` 없는 패턴 (`ui-design-guide v2`, `(ui-design-guide §X)`) 은 별도 정밀 Edit 필요
4. **사용자 합의 결정도 가이드 폐기 시 함께 폐기 가능.** Judge 버튼 (구 §8 변경 이력 사용자 합의), Streak 배지, 캘린더 typography heat 모두 신 가이드에서 빠짐 — 앱 spec 으로 책임 이전. 가이드 = 토큰/원칙만, 앱별 컴포넌트 디테일은 각 spec 자체 정의 원칙
5. **답변 진동 3회 (today HTML 권위 평가) 정상 수렴**: (1) 공식+inference → (2) 사용자+임의 권위 약함 → (3) Claude Code GUI 시각 모방 권위 격상. 사용자 정보 추가 (Claude Design 사용 / Claude 자기 진술 / 스크린샷 출처) 에 따른 정상 진동, 컨텍스트 오염 X. 진동 폭 좁아짐 = 수렴 신호
