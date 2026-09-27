# Handoff: 리딩타임 · 탭 모드 화면(05) 리디자인 — 시안 J

## Overview
탭 모드 기록 화면 `Screen05TapRecording`을 **링 타이머 + 기록 추격** 구조로 바꾼다.
위→아래: ① 상단 바(책 칩 | 상태 필 — 현행 유지) ② 링 블록(바깥 굵은 줄 = 이 세션, 안쪽 가는 줄 = 역대 최장 세션, 사이 점선 = 남은 거리, 가운데 타이머 + 최장 시간) ③ 재생/일시정지 원형 버튼 ④ 푸터(오늘 누적 · 연속 | 여기까지 읽기).
탭 존 상자·"화면을 탭하면 일시정지" 안내문·물결 3겹은 없앤다. 링 블록과 원형 버튼 어디를 탭해도 일시정지↔재개. 더블탭 종료는 제거한다(종료는 CTA만).

대상 코드베이스: `leftjap/apps@main` `readingtime/` (SwiftUI, `ReadingTimeKit`). 모든 수치는 **기존 토큰(`RTTokens.swift`)·폰트(`RTFont.swift`)·컴포넌트(`ScreensDark.swift`의 `DarkTopBar`·`PausedPill`·`LivePill`, `RTMotion.swift`의 `rtColonTick`·`rtPausedDim`)** 기준. 새 토큰·새 폰트 없음. 토큰 밖 색은 앱이 이미 쓰는 값만(§Design Tokens).

이 문서와 `mockups/RTTapMode.dc.html`이 화면 05의 정본이다. `design-ref/v3/mockups/frames/05.html`·`SCREENS.md §05`·`prototype/app.js`의 `handleTapZone`(더블탭 종료·250ms 디바운스)은 05에 한해 이 문서로 대체한다. 04 엎기 화면은 건드리지 않는다.

## About the Design Files
`mockups/RTTapMode.dc.html`은 **HTML로 만든 디자인 레퍼런스(동작 프로토타입)**다. 프로덕션 코드가 아니며 그대로 이식하지 않는다.
할 일은 이 목업을 **기존 SwiftUI 환경의 패턴으로 재현**하는 것 — `RT.*` 토큰, `.sans/.mono` 폰트 헬퍼, `DarkTopBar`·`PausedPill`·`LivePill`·`RTIcon`(`RTIconPath.play`·`.check`)·`rtColonTick`·`rtPausedDim`을 재사용한다.
목업은 같은 폴더의 `support.js`와 함께 브라우저에서 바로 열린다. 초가 실제로 가고, 링이나 버튼을 클릭하면 일시정지↔재개가 전환된다. 파일 하단 `<script data-dc-script>`의 로직 클래스에 눈금 계산·상태 분기(평상시/타이/신기록)가 그대로 있다. `data-props`의 `startElapsed`(시작 초) · `bestMin`(역대 최장, 분) · `startPaused` · `speed`(배속 1~60)는 데모 스위치 — Tweaks 패널에서 바꿔 모든 상태를 볼 수 있다.

## Fidelity
**High-fidelity.** 색·타이포·간격·상태·움직임이 최종값이다. 자리표시자 1가지:
- 책 칩의 표지는 목업에서 크래프트 색면. 실앱은 `DarkTopBar(showBookChip: true, bookTitle:)` 그대로(04와 동일).

---

## Screens / Views

### 0. 프레임
- 390×844. 배경 `RT.darkGrad`. 상단 바 `DarkTopBar(showBookChip: true)` — 04와 같은 문법: 좌 책 칩(표지 22×31 + 제목 `.sans(12.5, 600)` `#DDD8C2`), 우 `paused ? PausedPill() : LivePill()`. padding top 56, 좌우 20. **현행 "탭 모드" 칩은 삭제**(책 칩으로 교체).
- 세로 배치(y = 프레임 상단 기준): 상단 바 56 · 링 블록 168–468 · 원형 버튼 508–604 · 푸터 686–800(bottom 44). 링+버튼 묶음이 상단 바와 푸터 사이 세로 가운데.

### 1. 링 블록 — 300×300, 중심 (195, 318), 전체가 탭 영역
`ZStack` 300×300, `.contentShape(Circle())`, 탭 = `togglePause()`. 접근성 label = 기록 중 `"일시정지"` / 일시정지 `"이어 읽기"`.
각도 기준: 12시 = 0°, 시계 방향. (목업은 SVG를 −90° 회전해 같은 효과.)

**눈금(scale)** — 링 한 바퀴가 몇 분인가:
```
scaleMin = max(30, ceil( max(best, elapsed) / 60 × 1.2 / 15 ) × 15)   // 15분 단위, 최장의 1.2배 이상
ghostDeg = 360 × best    / (scaleMin × 60)
liveDeg  = 360 × min(1, elapsed / (scaleMin × 60))
```
최장 47분 → 눈금 60분 → 최장 줄 282°, 26:14 → 157.4°. 세션이 최장을 넘어 눈금이 커지면 두 줄이 같이 줄어든다(1s linear 전환).

레이어(뒤→앞):
1. **바깥 트랙**: r 141, 두께 10, `RT.gold` @ .10, 한 바퀴.
2. **최장 줄(기존 기록)**: r 122, 두께 6, `RT.ctaText`(#F2EEDD) @ .38, round cap, 0° → ghostDeg. `best == 0`이면 없음.
3. **남은 거리 점선**: r 141, 두께 3, `RT.ctaText` @ .35, dash 2/gap 7, round cap, (liveDeg + 3°) → (ghostDeg − 2°). `elapsed < best`일 때만. **정지 상태(흐르지 않음).**
4. **결승 눈금**: ghostDeg 위치, 반지름 방향 r 110 → 134, 두께 2, round, `RT.ctaText` @ .75. 안쪽 줄 끝을 가로지른다. `best == 0`이면 없음.
5. **이 세션 줄(지금)**: r 141, 두께 10, round cap, 0° → liveDeg. 색: 기록 중 `RT.gold` / 일시정지 `#E8BE78` / 신기록 `LinearGradient(#E2CF9E → #C9973B, 45°)`. 색 전환 .4s. 길이는 매 tick 1s linear로 자란다.
6. **끝점**: liveDeg 위치 r 141에 지름 16 원. 색 = 이 세션 줄 색(신기록 `RT.amber` #C9973B).

**링 안(세로 중앙, 가운데 정렬, 간격 14)**
- **타이머**: `.mono(58, 600)`, tracking −.04em, `RT.ctaText`. 1시간 이상 `h:mm:ss` `.mono(46, 600)` — **시는 한 자리**(`1:12:08`). 현행 `RTAppModel.hms`는 시를 `%02d`("01")로 주므로 앞 0을 떼는 헬퍼가 하나 필요하다(`hms` 자체는 04·Live Activity가 쓰니 바꾸지 말 것). 기록 중 콜론 `rtColonTick`(둘 다, 시 자리 40% 투명 없음) · 일시정지 `rtPausedDim`(현행 04·05와 동일). 글로우·텍스트 그림자 없음.
- **기록 줄** (상태별 셋 중 하나):
  - 평상시 (`sessionMin < bestMin`): `최장` `.sans(10, 700)` tracking .14em `RT.ctaText` @ .42 · 간격 8 · `47:00` `.mono(17, 500)` tracking .02em `RT.ctaText` @ .50. 시간 표기는 타이머와 같은 규칙(1시간 이상 `h:mm:ss`).
  - 타이 (`sessionMin == bestMin`): 같은 구성, 둘 다 `#E8BE78`.
  - 신기록 (`sessionMin > bestMin`): `▲`(8×7 삼각형 `Path`, `#E8BE78`) + `신기록` `.sans(10, 700)` .14em `#E8BE78` · 간격 9 · 이전 최장 `47:00` `.mono(16, 500)` `RT.ctaText` @ .35 **취소선**(선 색 @ .45) · 간격 9 · `+N분` `.mono(16, 700)` `#E8BE78`. N = sessionMin − bestMin. 등장 시 `badgePop`(scale .7→1.1→1, .4s).
  - `best == 0`(과거 세션 없음): 기록 줄 자체를 숨긴다(홈 게이지가 `best == 0`에서 하단 행을 숨기는 것과 같은 규칙).
- 분 판정은 홈 `RTStreakGauge`와 같은 정수 비교: `sessionMin = elapsed / 60`, `bestMin = best / 60`(내림).

### 2. 원형 버튼 — 96, 중심 (195, 556)
- 기록 중: 배경 white @ .08, 테두리 1 white @ .14, 글리프 = 세로 막대 2개(9×32, r3, 간격 8) `RT.ctaText`. 접근성 label `"일시정지"`.
- 일시정지: 배경 `RT.ctaText`, 테두리 `RT.ctaText`, 글리프 `RTIcon(RTIconPath.play, size: 40, fill: #26413A)` x+5. 접근성 label `"이어 읽기"`.
- 그림자 `0 8 20 rgba(0,0,0,.35)`. 배경·테두리 .3s 크로스페이드, 글리프 교체 `glyphPop`(scale .6→1.12→1, .35s).
- 탭 = `togglePause()`.
- **버튼 아래 안내문 없음.**

### 3. 푸터 — 05 전용 `DarkTapFooter` (04의 `DarkSessionFooter`는 그대로)
- 통계 스트립: 현행과 같은 카드(padding 13 16, r16, white @ .05, 테두리 white @ .10). 내용만 `오늘 누적 · N분 | 연속 · N일`. 라벨 `.sans(12.5, 500)` `RT.darkSub`, 값 `.mono(15, 600)` `#DDD8C2`. **"이 세션"은 삭제**(타이머와 중복). N분 = 현행 그대로 `todayBase + sessionMin`(`todayBase = todaySeconds / 60` — 오늘 저장된 종이 세션 + 밀리 초. 진행 중 세션은 저장 전이라 자동 제외). N일 = `streakDays`(오늘 기록 없으면 어제까지의 연속).
- CTA `여기까지 읽기`: h54 r16, 배경 white @ .04, 테두리 1 `RT.ctaText` @ .28, 체크 `RTIconPath.check` 16 `#DDD8C2` 2.4 + `.sans(15, 700)` `#DDD8C2`. 탭 = `endSession()` → 06. (04의 크림 채움 CTA와 다르다 — §확인 필요 3.)

### 4. 신기록 순간
`elapsed`가 `best`를 넘는 tick 한 번: 300 원 테두리 3 `RT.ctaText` @ .60이 scale 1→1.12로 퍼지며 사라진다(.9s ease-out, 1회). 그 뒤 신기록 상태(줄 그라데이션·끝점 amber·기록 줄 교체)로 전환. **연속 회전·스윕·글로우 없음.**

---

## Interactions & Behavior
- 링 블록 탭 / 원형 버튼 탭 → `togglePause()` **즉시**. `RTAppModel.tapZone()`의 250ms 디바운스와 더블탭 `endSession()`을 제거한다(`tapZone`을 지우면 `RTTapScheduler`·`tapScheduler` 주입·`cancelPendingTap`도 쓸 곳이 없다 — 함께 정리하거나, `--seq` 액션 이름 `"tapZone"`(`RTAppModel` 액션 디스패치)만 `togglePause`로 연결해 남긴다). 종료 경로는 CTA `endSession()` 하나.
- 앱 재시작 복원(`restoreSession`)은 현행대로 **일시정지 상태로 05 진입** — 이 화면의 일시정지 모습(§2·§5)으로 뜬다.
- 일시정지 중엔 링 길이·점선·끝점이 그대로 멈춘다. 타이머는 `rtPausedDim`.
- 재개 시 새 tick부터 이 세션 줄이 다시 자란다. `justResumed`(rtResumePop)는 이 화면에서 쓰지 않는다.
- 기록 중 = 화면 유지(`updateAwake` 규칙 현행 그대로). 근접 센서 정책도 현행.
- Live Activity·잠금 화면 뷰는 변경 없음.

## State Management
- `best`(역대 최장 세션, 초): `userData.sessions`(`RTSessionRecord`, `RTUserData.swift`)에서 `mode == "flip" || mode == "tap"`인 기록의 `seconds` 최댓값(`mode`는 `String` — `RTMode.rawValue` 또는 `"manual"`). 진행 중 세션은 `sessions`에 아직 없으므로 자동 제외. 없으면 0. 세션 시작 시 1회 계산해 `RTAppModel`에 보관 — 프로퍼티 이름은 제안(`bestSessionSeconds`), 신설.
- 상태 4개(뷰는 `session.status`와 위 정수 비교로 유도): 기록 중 / 일시정지 / 타이 / 신기록. 신기록 순간 펄스는 `elapsed`가 `best`를 처음 넘는 tick에서 1회 — 플래그 신설(제안 `recordCrossedAt`), 세션 종료·취소 시 초기화.
- 화면 05 뷰는 04와 같은 이유로 동적 값을 **저장 프로퍼티로 스냅샷**한다(`Screen04FlipPaused` 주석 — model 참조만 들면 tick이 반영되지 않음).

### 데모 경로 (userData nil) — 픽셀 오라클
- `elapsed = RTAppModel.demoElapsed`(26:14), `best = 47 × 60`, `todayBase = 32`(현행 05 데모 값), 연속 = **9일**(홈 데모 `Screen02Home.streakVal` 폴백 9와 동일), 책 = `몰입`.
- 기대값: 눈금 60분 · 최장 줄 282° · 이 세션 줄 157.4° · 점선 160.4°→280° · 기록 줄 `최장 47:00` · 푸터 `오늘 누적 58분 · 연속 9일`.
- 목업(`RTTapMode.dc.html`)의 푸터 연속 값도 9일로 맞춰 두었다. (캔버스의 시안 J 보드는 12일 — 자리표시자.)
- `rtshot 05` 기준 프레임: 기록 중(콜론 켜짐, 점 켜짐). 무한 모션은 기준 상태로 렌더(현행 규칙).

## Design Tokens (전부 기존 값 — 새 토큰 없음)
- 배경 `RT.darkGrad` · 골드 `RT.gold` #E2CF9E · 크림 `RT.ctaText` #F2EEDD · 보조 `RT.darkSub` #8FA393 · 값 텍스트 #DDD8C2(현행 푸터) · 일시정지 앰버 #E8BE78(현행 `PausedPill`) · 신기록 그라데이션 끝 `RT.amber` #C9973B(홈 게이지와 동일) · 재생 글리프 #26413A(현행 04 엠블럼)
- 폰트: `.sans(size, weight)` = NotoSansKR · `.mono(size, weight)` = IBMPlexMono, 숫자 tabular.
- 반지름: 원형 버튼 48 · 푸터 카드 16 · CTA 16 · 필 99. 링 r 141 / 122.
- 그림자: 원형 버튼 `0 8 20 rgba(0,0,0,.35)`. 그 외 없음.
- 움직임 목록(전부): `rtColonTick` 1s · `LivePill` 점 1.6s · 이 세션 줄 1s linear 성장 · 신기록 펄스 .9s 1회 · `glyphPop` .35s · `badgePop` .4s · `rtPausedDim`. **이 목록 밖의 움직임은 넣지 않는다.**

## 접근성 식별자 (제안 — 기존 관례)
`tap.ring` · `tap.toggle` · `tap.timer` · `tap.record` · `tap.badge` · `tap.today` · `tap.streak` · `tap.end`

## 삭제
- `Screen05TapRecording`의 탭 존 상자(점선 168)·`RTZoneTapRing`·"화면을 탭하면 일시정지 / 탭하여 이어 읽기" 텍스트·`RTRipple` 3겹·"탭 모드" 칩.
- `RTAppModel.tapZone()`의 디바운스·더블탭 종료. `RTAppModelTests.swift`의 세 테스트 `singleTapPauses`(디바운스 대기 검증)·`doubleTapEndsSession`·`tapZoneResetsAfterFire`는 "탭 즉시 토글, 두 번 탭해도 `.done`으로 가지 않음"을 검증하는 테스트로 교체. `SyncTapScheduler` 픽스처는 그때 함께 삭제.
- `DarkSessionFooter`의 "이 세션" 칸은 05에서만 빠진다(04는 유지).

## 확인 필요 (구현 전 결정)
1. **최장의 범위**: 시안은 전체 종이책 세션 기준. "이 책 기준"으로 바꾸려면 `sessions.filter { $0.isbn == sessionBook.isbn }`.
2. **직접 추가(`manual`) 세션 포함 여부**: 시안은 제외(타이머로 잰 세션만). 포함하면 `mode` 필터를 지운다.
3. **CTA 스타일**: 05는 아웃라인. 04에도 적용할지(그러면 `DarkSessionFooter` 하나로 통일), 05만 할지(`DarkTapFooter` 신설). 시안은 05만.
4. **상단 오른쪽 상태 필**: 줄 색·초 움직임과 중복이지만 04와의 통일을 위해 유지. 빼려면 `DarkTopBar` trailing을 비운다.
5. **더블탭 종료 제거**: 시안은 제거. 유지하려면 250ms 디바운스도 돌아와 단일 탭 반응이 늦어진다.
6. **신기록 순간 햅틱**: 시안은 화면 펄스만. 넣는다면 `ReadingTime/RTFlipSignals.swift`의 CoreHaptics 엔진(엎기 신호용)을 재사용 — 짐 앱은 PR 순간에 강햅틱을 쓴다(`gym-app-spec.md` §6-11).
7. **`prototype/app.js`·`frames/05.html` 갱신 여부**: README는 프로토타입을 "픽셀 정본", app.js를 "인터랙션 정본"이라 한다. 05에 한해 이 문서가 정본이 되므로, 웹 프로토타입도 맞출지(`handleTapZone` 디바운스 제거·05 프레임 교체) 아니면 05만 예외로 둘지 결정.

## Acceptance Criteria
1. 05 진입 시 링 블록 168–468, 버튼 508–604, 푸터 686–800(±1pt). 탭 존 상자·안내문·물결·"탭 모드" 칩 없음.
2. 눈금·각도가 §1 공식과 일치. 데모 경로 기대값(§데모 경로) 전부 일치.
3. 링 블록 어디를 탭해도, 버튼을 탭해도 **즉시** 일시정지↔재개. 더블탭으로 06에 가지 않는다. 종료는 CTA만.
4. 기록 중: 이 세션 줄이 매초 자라고 끝점이 따라간다. 점선은 흐르지 않는다. 회전·스윕·글로우·물결 없음.
5. 일시정지: 줄·점선·끝점 정지, 이 세션 줄과 끝점이 #E8BE78, 타이머 `rtPausedDim`, 버튼 크림 + ▶, 필 `PausedPill`.
6. `sessionMin == bestMin`에서 기록 줄이 앰버 타이. `sessionMin > bestMin`이 되는 tick에 펄스 1회 → 줄 그라데이션 + 끝점 amber + `▲ 신기록 / 취소선 47:00 / +N분`. 이후 최장 줄·결승 눈금은 그대로 남는다.
7. 세션이 눈금을 넘으면(예: 47분 기록에 51분) 눈금이 75분으로 커지고 두 줄이 1s에 걸쳐 함께 줄어든다.
8. `best == 0`: 최장 줄·결승 눈금·점선·기록 줄 없음. 바깥 트랙과 이 세션 줄만.
9. 1시간 이상: 타이머 `h:mm:ss`(시 한 자리) 46pt, 기록 줄 시간도 같은 형식. 1시간 미만은 `mm:ss` 58pt — 현행의 `00:` 시 자리(40% 투명)는 없다.
10. 04 엎기 화면(`Screen04FlipPaused`)·`DarkSessionFooter`·Live Activity는 픽셀 0 차이(`rtshot 04` 대조).
11. VoiceOver: 링 블록·버튼 label이 상태에 따라 "일시정지"/"이어 읽기", 타이머 value = 경과 시간, 기록 줄 value = "최장 47분".

## Files
- `mockups/RTTapMode.dc.html` — 동작 목업(정본 시안). 같은 폴더의 `support.js`와 함께 브라우저에서 열기. 하단 로직 클래스에 눈금 계산(`scaleMin`)·상태 분기·펄스 트리거가 그대로 있다. `data-props`: `startElapsed`·`bestMin`·`startPaused`·`speed`.
- `mockups/support.js` — 목업 런타임(프로덕션과 무관).
- 참조(레포 내): `ReadingTimeKit/Sources/RTViews/Screens/ScreensDark.swift`(`Screen05TapRecording`·`DarkTopBar`·`DarkSessionFooter`·`PausedPill`·`LivePill`), `RTAppModel.swift`(`tapZone`·`togglePause`·`endSession`·`restoreSession`·`hms`·`todaySeconds`·`streakDays`·`RTStreakGauge`·`RTMode`), `RTUserData.swift`(`RTSessionRecord.mode`), `RTMotion.swift`(`rtColonTick`·`rtPausedDim`), `RTIcons.swift`(`RTIconPath.play`·`.check`), `RTTokens.swift`, `RTFont.swift`, `Screens/Screen02Home.swift`(데모 연속 9), `ReadingTime/ReadingTimeApp.swift`(`updateAwake`·근접 센서 정책 — 변경 없음), `ReadingTime/RTFlipSignals.swift`(햅틱 엔진, §확인 필요 6), `Tests/RTViewsTests/RTAppModelTests.swift`(`singleTapPauses`·`doubleTapEndsSession`·`tapZoneResetsAfterFire`), `prototype/app.js`(`handleTapZone`, §확인 필요 7).


---

## 구현 결정 (2026-09-27, 구현 세션)

'확인 필요' 7건과 문서 안 불일치를 이렇게 처리했다. 1번과 펄스 시점은 Claude Design 에 질의했고, 회신 전까지 아래 기본값으로 구현했다.

| 항목 | 결정 |
|---|---|
| 1. 최장의 범위 | **회신 대기** — 시안대로 전체 세션 기준(`RTAppModel.bestSessionSeconds`) |
| 2. 직접 추가 세션 | 제외 — 타이머로 잰 `flip`·`tap` 세션만 |
| 3. CTA 스타일 | 05 만 아웃라인(`DarkTapFooter`). 04 의 `DarkSessionFooter` 는 그대로 |
| 4. 상단 상태 필 | 유지 |
| 5. 더블탭 종료 | 제거 — `tapZone()`·`RTTapScheduler`·250ms 디바운스 삭제, 링·버튼 탭 = `togglePause()` |
| 6. 신기록 햅틱 | 넣지 않음 (화면 펄스만) |
| 7. 웹 프로토타입 | 고치지 않음 — 05 는 이 문서가 정본이고, `prototype/app.js` 의 `handleTapZone`·`frames/05.html`·`SCREENS.md §05` 는 05 에 한해 따르지 않는다 |
| 펄스 시점 | **회신 대기** — AC 6 기준(`sessionMin > bestMin` 이 되는 tick = 신기록 전환과 같은 순간). 목업 코드(`e ≥ best`, 타이 시작)·§4(`elapsed > best`)와 시점이 다르다 |
| 1분 미만 최장 | **회신 대기** — 문서대로 최장 0 일 때만 숨긴다. 최장이 1~59초면 `bestMin` 0 이라 새 세션이 0:00 부터 타이, 1:00 에 신기록이 된다 |

펄스는 모델 플래그(`recordCrossedAt` 제안) 대신 화면이 '신기록 아님 → 신기록' 전환을 감지해 한 번 재생한다.
앱 재시작으로 복원된 세션이 이미 신기록이면 재생하지 않고, 세션 종료·취소 때 초기화할 상태도 없다.
`bestSessionSeconds` 는 세션 시작 때 저장하지 않고 매번 계산한다 — 진행 중 세션은 저장 전이라 자동으로 빠진다.

### 목업 DOM 과 다르게 둔 것
- **통계 카드 윗변**: 목업 CSS 는 1px 테두리가 박스 높이에 들어가 684.5, 앱은 04 와 같은 카드(테두리가 레이아웃 밖)라 686.5.
  본문의 "현행과 같은 카드"와 AC 1(686)을 따랐다. 프로토타입 04 카드와 앱 04 카드 사이에도 같은 2pt 차이가 있다.
- **책 칩 너비**: 목업은 글자 너비만큼 줄지만, 앱은 본문 지시대로 04 와 같은 `DarkTopBar` 를 쓴다.
- **▶ 위치**: 본문은 "x+5" 이지만 목업 DOM 은 가운데 정렬 flex 안의 `margin-left:5px` 라 실제 이동이 2.5 — DOM 값을 따랐다.

### 검증
- 단위: `ReadingTimeKit/Tests/RTViewsTests/RTTapModeTests.swift` — 링 눈금·각도·점선·상태, 05 시간 표기, 최장 계산, 데모·라이브 스냅샷.
- 목업 대조: Playwright(Chromium, 앱 번들 폰트 주입)로 목업을 6상태 390×844 @2x 렌더해 rtshot 과 같은 탐침으로 쟀다.
  이 세션 줄 끝 Δ0°, 최장 줄 끝 ≤0.25°, 점선 33개 첫·끝 점 ≤0.02°, 타이머·기록 줄 글자 ≤1pt, 버튼·CTA Δ0.
- rtshot 상태: `05`(기록 중) · `--seq login,mode:tap,start,togglePause`(일시정지) · `…,elapsed:2830`(타이) ·
  `…,elapsed:2910`(신기록) · `…,elapsed:3060`(눈금 75분) · `…,elapsed:4328`(1시간 이상).
- 03·04·Live Activity rtshot 렌더는 수정 전후 바이트 동일.
- UI(iPhone 11 Pro 시뮬레이터): `ReadingTimeUITests/TapModeUITests.swift` 2건 — 링·버튼 탭 토글, 더블탭 뒤에도 05 에 남고
  06 원장이 '일시정지 1회'(두 탭 모두 들어감). `RereadCaptureUITests` 3건(05 책 칩 확인으로 수정)도 통과.
  링은 좌표로 가운데를 탭한다 — 기본 `tap()` 은 링 요소 가운데를 덮은 타이머 요소를 피해 원형 탭 영역 밖을 누른다.
- 움직임(시뮬레이터 녹화 10fps): 최장 1:00 · 1:55 시작 → 2:00 에 신기록 전환과 함께 펄스 1회, 이후 재생 없음.
  일시정지 탭 때 버튼 배경 .3s 전환 + ▶ 팝, 콜론 깜박임은 기록 중에만.
