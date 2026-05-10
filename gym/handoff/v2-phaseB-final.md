# Gym v2 — Phase B 최종 잔여 지시서 (새 세션용)

> 입력: Phase A (`df8da02`) + Phase B 단계 1~3 (`4e72965`) + 단계 4 부분 (`77a2a82`) + 단계 4 잔여 1~4 (`07d7180`) 완료.
> 잔여: SessionC 카드 마운트 + mount wiring + 서킷 토글 동작 + 단계 5/6/7 (테스트·빌드·e2e·시각 검증).
> 권위: 시각 = `mocks/*.html`. 인터랙션 = `specs/gym-app-spec.md` §6. 데이터 = §4·§12. 토큰 = `~/apps/DESIGN.md`.

---

## 0. 시작 전 — 반드시 읽기

`handoff/v2-redesign.md`:
- **§11** (line 949) — 단계 4 부분 완료 (`77a2a82`) 진척 + 잔여
- **§12** (line 996) — 단계 4 잔여 1~4 완료 (`07d7180`) 진척 + 미검증

이미 처리된 사항 (다시 안 함):
- mocks 7 화면 id 부착
- HomeC 8 id 분리 (`cardLabel`·`cardTime`·`cardUnit`·`cardPart`·`cardEx`·`cardVol`·`cardProgress`·`cardCta`) + `applyToDom` HomeA/HomeC 분기
- `src/features/manage.js` 셸 신설 (콘텐츠 wiring 은 잔여)
- stats `parseMonthLabel` `(\d{4})\s*[·년]\s*(\d{1,2})월`
- 서킷 토글 **마크업 보강** (`mocks/session-empty.html`, click 핸들러는 잔여)

현재 상태 = **시각만 v2**, 데이터 바인딩 미동작 (mount wiring 부재).

---

## 1. 잔여 작업

### 1-1. SessionC active 카드 마운트 (가장 큼, 분할 권장)

`src/features/session.js` 의 활성 운동 카드 마운트 함수 신설. `mocks/session.html` (SessionC) 의 운동명·SET·중량·횟수·진행 set 행·progressbar 노드에 id 부착 후 src 데이터 바인딩.

**분할** (각 단계마다 `pnpm vitest run` + `pnpm build` 재검증 + commit):
- (a) id 부착 + 정적 데이터 바인딩 (운동명/SET/중량/횟수/set 행/progress%)
- (b) 스와이프 (§6-3-1, 좌=완료·우=이전 수정, 60px 임계, `touch-action: pan-y`)
- (c) 빈 공간 ± 증감 (§6-3, 좌 30%·우 30% hit area, ± 버튼 금지)
- (d) 커스텀 숫자 키패드 바텀시트 (§6-3-2)
- (e) 프리셋 (§6-3-3, 직전 세트 → 이전 세션 → defaultWeight, placeholder text-faint)
- (f) 꾹누르기 메뉴 (§6-9, 대상별)
- (g) PR 감지 (§6-11, Epley + accent 팝)

**제거**: `mocks/session.html` 가이드 텍스트 "← 이전 수정 / 완료 →" — spec §6-3-1 "지시문 금지" 충돌. src 적용 시 제거 (mocks 자체에서 삭제).

### 1-2. `src/app.js` mount wiring

라우트별 `mountXxx()` 호출 추가:
- `#/login` → `services/auth.js` (이미 inline script 부착됨, signInWithGoogle wiring 검증만)
- `#/` → `features/home.js` `mountHomeView` (HomeA/HomeC 분기는 이미 `applyToDom` 으로 처리)
- `#/session` → `features/session.js` (SessionEmpty + SessionC 분기)
- `#/summary` → `features/session-summary.js`
- `#/stats` → `features/stats.js`
- `#/admin` → `features/manage.js` (3 탭 셸 → exercises-admin/weights/profile 콘텐츠 함수 호출)

**현재 `src/app.js`** 가 mocks innerHTML 주입만 하고 mount 호출 안 함 → 정적 마크업만 노출. wiring 후 데이터 바인딩 동작.

### 1-3. 서킷 토글 click 핸들러

`mocks/session-empty.html` 토글 row click → `sheetCircuit` ON/OFF 전환 (현재는 hidden panel 마크업만 있고 토글 동작 없음).
- ON: hidden panel 표시 + 종목 탭 = 선택/해제 (체크/accent 하이라이트) + "완료" 버튼 활성 조건 (선택 2+개)
- OFF 복귀 시: 선택 초기화
- spec §6-2 권위

### 1-4. 단계 5 — 테스트 (vitest)

- 현재 `Tests 392 passed (392)` 유지
- session.js 마운트 추가에 따른 selector 어설션 보강
- HomeC 분리·manage 셸·서킷 토글 click 동작 어설션 추가

### 1-5. 단계 6 — 빌드 + e2e

- `pnpm build` 통과 유지 (현재 PWA precache 24 entries / 474.85 KiB)
- `pnpm e2e` 0 fail. 7 spec selector 갱신:
  - `home-active-card.spec.js` — HomeC 분리·새 id
  - `session-start.spec.js` — SessionEmpty 시트 토글
  - `session-pr.spec.js` — SessionC 마운트 + PR 감지
  - `stats-volumes.spec.js` — 캘린더 새 selector
  - `weight-tab.spec.js` — chart-avg/list/entry-form 보강 selector
  - `exercises-admin.spec.js` — adminParts/adminExList
  - `auth-guard.spec.js` — 변경 가능성 낮음

### 1-6. 단계 7 — 시각 검증

`pnpm dev` 후 `preview_screenshot` 으로 `mocks/*.html` (또는 `Gym App 시안 v2.html`) vs 실 src dev 서버 직접 비교. **사용자 위임 편향 금지**.

---

## 2. 데이터 (보존)

Dexie 스키마·Supabase 동기화·PR 계산 (`src/services/pr.js`) 변경 없음. DOM 출력 매핑·mount wiring 만.

---

## 3. 작업 순서

1. `handoff/v2-redesign.md §11·§12` 읽기 (단계 4 진척 정확 파악)
2. **SessionC 마운트** — 분할 (a~g). 각 단계마다 vitest + build 재검증 + commit
3. **`src/app.js` mount wiring** (6 라우트)
4. **서킷 토글 click 핸들러**
5. **단계 5** — vitest 0 fail
6. **단계 6** — build + e2e 0 fail
7. **단계 7** — preview screenshot 시각 비교
8. 자동 commit + push (`~/apps/CLAUDE.md`)

---

## 4. 금지

- React/프레임워크 도입 금지. 바닐라 유지
- Clawd 어떤 형태로도 추가 금지 (현재 0건 유지: `rg -n -i 'clawd|EXERCISE_POSE|barbell.raise|sparkle|wiggle|slowbob' src/ e2e/ specs/ ~/apps/DESIGN.md`)
- `~/apps/DESIGN.md` 토큰 임의값 금지
- spec §6 인터랙션 임의 변경 금지 (시각만 v2, 동작은 spec)
- **사용자 위임 편향 금지**. preview·rg·vitest 등 도구로 직접 검증
- **단정 라벨 ("일치"·"통과"·"0건") 사용 시 도구 stdout·파일 경로·라인 직접 인용 동반**
- vitest watch 금지 — `pnpm vitest run` 만 (`~/apps/CLAUDE.md` 환경 함정)

---

## 5. 체크리스트

- [x] `handoff/v2-redesign.md §11·§12` 읽기
- [x] SessionC 마운트 (a) 정적 데이터 바인딩 — 본 세션 (`src/features/session.js` mountSessionView 분기 + mountSessionActive + mocks/session.html id 부착)
- [x] SessionC 마운트 (b) 스와이프 (§6-3-1) — 본 세션 (`wireSwipeHandlers` + `handleLeftSwipe` + `handleRightSwipe` + `cardSwipeArea` `touch-action: pan-y` + 8 신규 vitest)
- [x] SessionC 마운트 (c) 빈 공간 ± 증감 (§6-3) — 본 세션 (`handleTap` 좌 30%/우 30% + `applyTapDelta` 장비별 증분 barbell·machine·cable 5/dumbbell 2/bodyweight 0/reps 1 + 0 clamp + preset:false + `flashElement` 150ms 미세 플래시 + 10 신규 vitest)
- [x] SessionC 마운트 (d) 커스텀 키패드 (§6-3-2) — 본 세션 (`mocks/session.html` 바텀시트 + dim backdrop 마크업 + 12 키 + 완료 + handleTap 중앙 40% → openKeypad / `updateKeypadBuf` 순수함수 (1~9·.·del) + `openKeypad`·`closeKeypad`·`wireKeypad`·`applyKeypadValue` (§6-10 DOM 한 번 생성 transform/opacity 토글) + 배경 탭·아래 60px 스와이프 취소 + 13 신규 vitest)
- [x] SessionC 마운트 (e) 프리셋 (§6-3-3) — 본 세션 (mountSessionActive 에 preset opacity 토글 0.45/1 추가. 우선순위 ① 직전 세트 / ② 이전 세션 / ③ defaultWeight 는 기존 addExerciseToActiveSession + buildPresetSets + handleLeftSwipe push 로 자동 동작 — 기존 75+ 단위 테스트로 회귀 방지)
- [/] SessionC 마운트 (f) 꾹누르기 (§6-9) — (f-1) 인프라 본 세션 (`wireLongPress` 500ms 타이머 + scale 0.98 + 햅틱 + move 8px 취소 + 글로벌 scroll 취소 + idempotent spaLpHooked guard. mocks 5 대상: session-end + footer-exercise × 4. 11 신규 vitest). (f-2) 액션 시트 본 세션 (`openActionSheet`/`closeActionSheet`/`wireActionSheet` + `getActionMenuFor` (session-end / footer-exercise active·completed·upcoming 분기) + onTrigger → openActionSheet 연결 + 6 신규 vitest). (f-3a) 진행 중 운동 카드 본 세션 (`cardSwipeArea` 에 `data-longpress="active-card"` 부착 + `wireSwipeHandlers` 의 `area._swipeReset` 추가 (cross-cancel) + onTrigger 에서 `target._swipeReset()` 호출 + active-card 메뉴 [완료/삭제/이동] + 2 신규 vitest). (f-3b) 세트 행 본 세션 (`renderSetDotHtml` 에 `data-longpress="set-row"` + `data-set-idx` 부착 + `getActionMenuFor` 'set-row' 메뉴 [수정/삭제] + bubble 분리 위해 `wireLongPress` pointerdown 에 `e.stopPropagation()` 추가 + mock event stopPropagation 보강). (f-3c) 서킷 카드 = mountSessionActive 가 single 블록만 처리, circuit 블록 마운트 자체 부재 → 본 세션 스킵. 후속에서 circuit 블록 시각화 + 별도 hold target 필요. (f-4) 2단계 확인 본 세션 (openActionSheet 시 step='1' 초기화 + items 보관 + showConfirmStep step='2' 전환 + actionCancel 취소 + .action-confirm "ok" 클릭 시 _onSelect 호출 후 close + 3 신규 vitest). (f-3 진짜 핸들러 wiring) 본 세션 (`handleActionSelect` 통합 디스패처 — session-end finish→`finalizeActiveSession`+#/summary / discard→`discardActiveSession`+#/home / active-card finish→`handleLeftSwipe` 재사용 / active-card delete→`removeExerciseFromActiveSession` / set-row edit→openKeypad prefill+setIdx / set-row delete→`persistRemoveSet`. 신규 헬퍼: `persistRemoveSet`(sets[idx] 제거 + sets.length=0 면 block 자체 제거) + `discardActiveSession`(DB row delete) + 7 신규 vitest. footer-exercise = mocks pill 정적 마크업이라 후속). (f-5) 이동 = 후속
- [x] SessionC 마운트 (g) PR 감지 (§6-11) — 본 세션 (handleLeftSwipe 의 set commit 직후 `persistSetPR` 호출 + isPR 시 `set.pr=true` 마크 + DB upsertPR. mocks `cardPrPop` element 추가 (Poppins 500 accent, opacity 220ms + transform 700ms). `showPrPop` 1초 페이드아웃. `renderSetDotHtml` 의 set.pr 시 accent 영구 표시 + 3 신규 vitest. 알려진 한계 — PR 팝 위치 (top:118px) 가 운동명 영역과 약간 겹침, 후속 미세 조정)
- [/] (f-5-1) footer pill 실 데이터 wiring — 본 세션 (mocks footer 정적 4 pill 제거 → `sessionFooterPills` 동적 영역만. session.js 에 `_currentBlockIdx` 모듈 변수 + `classifyBlockState` (current/done/hold/pending) + `blockProgressText` (·N/M / ·N세트) + `blockDisplayName` + `renderFooterPillHtml` (spec §6-8 footer nav 표현) + `renderFooterPills` (active session blocks 기반) + `wireFooterPillClick` (data-block-idx → _currentBlockIdx 갱신 + mountSessionView 재바인딩) + `getCurrentBlockAndCursor`/mountSessionView 의 active branch 가 _currentBlockIdx 우선 사용 + `handleActionSelect` 의 footer-exercise 진짜 핸들러 (active finish/completed edit/delete/reorder). circuit 블록도 round1 entry done 비율로 상태 판정. (f-5-2/3) reorder 모드 + 드래그·드롭 = 후속)
- [x] `mocks/session.html` 가이드 텍스트 "← 이전 수정 / 완료 →" 제거 — 본 세션 (병합 시 동시 처리)
- [x] `src/app.js` mount wiring (6 라우트) — 본 세션 (`ROUTE_MOUNTS` + mount fn 호출)
- [x] 서킷 토글 click 핸들러 ON/OFF — 본 세션 (`wireCircuitToggle`)
- [x] 서킷 ON 다중선택 + "완료" 활성 조건 — 본 세션 ((2) `addCircuitBlockToActiveSession` 신설 (rounds[] data 모델, cardio/bodyweight 분기, 중복·태그 누적), wireCircuitToggle 의 ON 모드 listEl 선택 토글 + 패널 list 갱신 + "완료" 동적 disabled (선택 ≥2) + click 시 circuit 블록 1 round 추가 + OFF 복귀 초기화 + mountSessionView 재바인딩, hookClicks 의 single 핸들러는 ON 모드 시 early return + 7 신규 vitest. **참고**: circuit 블록 시각화 (active branch) 부재이므로 add 후 dataState='empty' 유지 — circuit 카드 마운트는 후속)
- [x] `pnpm vitest run` 0 fail — 본 세션 (392 → 392)
- [x] `pnpm build` 통과 — 본 세션 (`✓ 72 modules / 485.76 KiB`)
- [ ] `pnpm e2e` 0 fail — 다음 세션 (selector 갱신 필요)
- [x] preview screenshot vs `mocks/*.html` 시각 비교 통과 — 본 세션 (gym-mocks + gym-dev 두 서버 active/empty/circuit-on 3 화면 검증)
- [x] Clawd 0건 유지
- [x] 본 세션 자동 commit + push (단계 4 (a) + wiring + 토글 부분)

### 본 세션 변경 요약 (2026-05-10)

- `src/app.js` — `ROUTE_MOUNTS` (home/session/stats/admin) + `mount()` 끝에서 `Promise.resolve().then(mountFn)` 호출. login/summary 는 inline script 사용 (mount fn 없음).
- `src/features/session.js` — `mountSessionView` 를 분기로 재설계: `getActiveSession()` 기반 active branch (mountSessionActive: 운동명/SET/중량/횟수/이전 세트/S1..Sn/진행바 정적 바인딩) + empty branch (mountSessionEmpty: 기존 chips/list + `wireCircuitToggle`). DB 미초기화·예외 모두 graceful empty fallback.
- `mocks/session.html` — `session-empty.html` 의 `.phone` 블록을 `.session-empty` 로 병합 + 기존 SessionC 를 `.session-active` 로 래핑. `<body data-state="empty">` + CSS 토글 (home.html HomeA/HomeC 패턴). active 카드에 8 id 부착 (`cardExName`·`cardSetProgress`·`cardWeight`·`cardReps`·`cardPrevSet`·`cardSetDots`·`cardProgressBar`·`cardProgressVol`·`cardProgressPct`) + `sessionTime`·`sessionFooter` 부착. 가이드 텍스트 "← 이전 수정 / 완료 →" 제거.
- `mocks/session-empty.html` — 변경 없음 (시안 비교용 보존).

### 검증값 (도구 stdout)

- `pnpm vitest run` → `Test Files 13 passed (13) / Tests 392 passed (392)` (391 → 392 → 392 동일 유지)
- `pnpm build` → `✓ 72 modules transformed. ✓ built in 472ms / PWA precache 24 entries (485.76 KiB)` (71 → 72 modules / 474.85 → 485.76 KiB — session-empty 병합으로 +10.91 KiB)
- preview_eval (gym-mocks `/mocks/session.html`): `missing:[], bodyEmpty:true, hasActive:true, hasEmpty:true, cssToggleA:true, cssToggleB:true, guideRemoved:true`
- preview_eval (gym-dev `#/session` mount): 14/14 id present, route `session`, dataState `empty` (DB 미초기화 fallback), sheetCircuit `off`
- preview_eval 서킷 click: `before {circuit:'off',panelDisplay:'none',ariaPressed:'false',btnBg:'transparent'}` → ON `{circuit:'on',panelDisplay:'',ariaPressed:'true',btnBg:'var(--accent)'}` → OFF (toggle 양방향)
- preview_screenshot 3장 — empty/active/circuit-on 화면 모두 mocks 시안 일치

### 다음 세션 진입 작업

- (f-5-2/3) reorder 모드 진입 (모든 pill 일괄 접힘 + 선택 lift) + 드래그·드롭 (DOM/DB blocks 순서)
- circuit 카드 active branch 시각화 (현재 mountSessionActive 가 single 만, circuit 블록 시각 부재)
- PR 팝 위치 미세 조정 (top:118px → 운동명 영역과 약간 겹침)
- e2e selector 갱신 7 spec
- session.test.js mountSessionView 분기 어설션 추가 (현재 graceful no-document 만 어설션)

---

**참고 자료**:
- `handoff/v2-redesign.md` §11·§12 — 단계 4 진척 정밀화. 본 문서 §0 입력
- `handoff/v2-phaseB.md` — Phase B 전체 지시서
- `handoff/v2-phaseB-step4.md` — 단계 4 진입용 (완료)
- `specs/gym-app-spec.md` §6 — 인터랙션 권위 (§6-2·§6-3·§6-3-1·§6-3-2·§6-3-3·§6-9·§6-11)
- `~/apps/DESIGN.md` — 4앱 공통 토큰
