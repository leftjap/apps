# 리딩타임 홈(02) 기록 리디자인 — 작업지시서

**작업지시서 v3**

**정본 시안**: `handoff/home-14a-v11@2x.png` (390×844 @2x) · 원본 `리딩타임 홈 기록 리디자인.dc.html` → `TURN 14` / `#14a`
**대상 파일**: `readingtime/ReadingTimeKit/Sources/RTViews/Screens/Screen02Home.swift`, `Screens/RTHomeCarousel.swift`, `RTAppModel.swift`
**기준 커밋**: `866e877fdefc` (main)
**개정일**: 2026-08-28 (v1: 2026-08-27)

> **v3 개정** — 구현 세션 대조 회신 + 제 자체 재검증 반영. 상세는 `handoff/회신-작업지시서-질의.md`
> 0. **§8-2 전제 정정** — `Screen02Home` 은 `rtLB` 를 **쓰지 않는다**. 신규 블록에만 적용하고 기존 행에는 도입하지 않는다
> 0b. **§2 배경 3레이어 재조정 신규** — 책이 약 90pt 위로 이동하므로 `lightPool`·`vignette` 중심을 따라 올려야 한다 (v1 의 "배경 유지" 철회)
> 0c. **§2 카드 상수(434·420) 전부 폐기** — 신규 블록 222 + 기존 변화분으로만 기재, 절대값은 실측
> 1. **§3.1 표지** — 3D 값·그림자 지시 전면 폐기. `RTBook3D` 무수정 + `scaleEffect` 한 줄로 대체
>    (v1 의 `-15°/2°/800` 은 HTML 시안의 평면 근사값이었으며 앱 정본이 아니었다)
> 2. **§2 세로 예산** — 어림값 폐기, 블록별 실산표로 대체 (카드 434 → **420**)
> 3. **§5.2** — `buildLive` 확장 지시 폐기, `calendarWindow14` 신설로 대체 (화면 10 미변경)
> 4. **§8-2** — 실측값 반영(`n21` 30.5 / `m14` 18.5 / `m27` 35.0), `m11_5 = 15.0` 신설
> 5. **§10 미결정 4건 전부 확정**

---

## 0. 이 작업의 목적

두 가지다.

1. **기록 갱신 자극** — 홈에 있던 13개 도트 연속 체인은 눈에 걸리지 않았다. 2주 캘린더 + 역대 최고 기록 대비 게이지로 교체해, 매일 홈을 열 때 "빠짐없이 읽고 있나 / 최고까지 얼마 남았나"가 보이게 한다.
2. **통계 직행** — 지금은 우상단 아바타 → 메뉴 → 통계로 뎁스가 하나 있다. 도킹 카드 안 `전체 통계` 버튼으로 `nav(.statsWeek)`에 바로 들어간다.

**목표 설정 기능은 넣지 않는다.** 비교 대상은 전부 사용자 자신의 과거 기록이다 (핸드오프 §Data Model 금지 항목 유지).

---

## 1. 변경 요약

| 영역 | 변경 |
|---|---|
| 히어로 (캐러셀) | 표지 172×252 → **122×179**. 저자 줄 삭제. `N회 함께 읽음` 삭제. 표지 위 상태 칩(pill) → 제목 아래 작은 배지로 이동 |
| 도킹 카드 | 보조 안내 문구(`엎기 어려운 곳이면…`) 삭제. 13도트 `streakChain` 삭제 |
| 도킹 카드 (신규) | `내 기록` 헤더 행 + `전체 통계` 버튼, 연속 블록(게이지 + 역대 최고), **2주 캘린더** |
| 진입점 | `전체 통계` → `nav(.statsWeek)`. 마지막 기록 행 → `openRecentDetail()` (기존 유지). 소연 행 → `openPartnerStats()` (기존 유지, 꺽쇠 아이콘만 삭제) |
| 모델 (신규) | `bestStreak`, `calendarWindow14` 2개 파생값 |

**유지(손대지 않음)**: 배경 3레이어(paper / lightPool / vignette), 헤더(로고·+·아바타), 아바타 메뉴 `RTHomeMenu`, CTA 플립 애니메이션·`ctaFlipAngle`·`ctaBack`, `tapStartButton`, `readCTADisabled`(밀리), 캐러셀 스와이프 제스처·인디케이터, `countUp`, 마지막 기록 행, 파트너 행 로직, 홈 인디케이터 여백 26.

---

## 2. 전체 세로 배치

프레임 390×844. `VStack(spacing: 0) { header; Spacer(minLength: 0); stage; Spacer(minLength: 0); card }` 구조는 그대로.

| 부분 | 높이 | 버지 |
|---|---|---|
| 헤더까지 | 86 | `padding(top: 52)` + 아바타 34. 상태바(47)는 `RTChrome` 이 이 위에 겹치므로 따로 더하지 않는다 |
| 히어로 + 카드 | 758 | 844 − 86 |

### 카드 높이 — 상수로 박지 말 것 (v3 정정)

v1 의 `≈434` 와 v2 의 `420` 은 **둘 다 쓰지 말 것.** 기존 ⑥⑦ 행의 내용 높이를 임의로 30pt 로 잡았고
(실제는 텍스트 열이 더 큼), 높이를 더하지 않는 `overlay` hairline 을 1pt 로 셈했으며,
기존 행은 rtLB 를 쓰지 않아 토큰으로 예산할 수도 없다(§8-2).

**계산되는 것 — 신규 블록(rtLB 적용 대상)**

| 블록 | 계산 | 높이 |
|---|---|---|
| ② 내 기록 헤더 | 13 + max(캡슐 27, `n13` 18.5) | 40 |
| ③ 연속 블록 | 10 + max(좌 35+4+15=54, 우 17+7+5+6+14.5=49.5) | 64 |
| ④ 요일 헤더 | 14 + `m10` 13 | 27 |
| ⑤ 캘린더 | 6 + 33 + 6 + 33 + 13 | 91 |
| **신규 합** | | **222** |

**기존 부분은 변화만 명시한다 (절대값 모름)**

| 항목 | 변화 |
|---|---|
| 카드 상단 패딩 | 16 → 14 (**−2**) |
| ① CTA 행 | 60 (변화 없음) |
| 보조 안내 문구 | 삭제 (**−(12 + 행높이)**) |
| 기존 스탯행 + 13도트 체인 | 삭제 → ②③④⑤ (222) 로 교체 |
| ⑥ 마지막 기록 | `padding(v: 11 → 9)` (**−4**) |
| ⑦ 파트너 | `padding(v: 11 → 9)` (**−4**) |
| ⑧ 하단 여백 | 26 (변화 없음) |

카드의 절대 높이는 **빌드 후 실측**한다. AC #4 는 상수 대조가 아니라 "스크롤·압축 없음"으로 검증한다.

### ⚠ 배경 3레이어를 재조정해야 한다 (v3 신규)

표지가 29% 작아지고 카드가 222pt 커지면 **책의 수직 중심이 현재보다 약 90pt 위로 이동**한다.
그러나 독서등 받은 좌표는 하드코드되어 있다:

- `lightPool` — `.position(x: 195, y: 300)` (`Screen02Home.swift:132`)
- `vignette` — `center: UnitPoint(x: 0.5, y: 0.38)` ≈ y 321 (`:141`)

그대로 두면 책이 밝은 부위 위쪽에 서고 뒤통수 밑이 부여진다. **둘 다 새 책 중심에 맞춰 올릴 것**
(카드 높이 실측 후 산출 — 대략 `lightPool y ≈ 185`, `vignette y ≈ 0.24`).
v1 의 "배경 3레이어 유지"는 철회한다.

### 히어로 325.6 — 전원 신규 생산이라 계산 가능

```
축소 컨테이너 190.1  (268 × 0.7093)
+ 접지 그림자      2 + 18
+ 제목            15 + 30.5 (n21)
+ 배지행           8 + 22   (3 + 16(n11) + 3)
+ 인디케이터        18 + 6 + 16
= 325.6   ≤ 338 ✓     (라이브 1권 = 점 없음 → 285.6)
```

> **주의** — 히어로의 모든 자식은 세로로 눌리면 안 된다. SwiftUI에서는 `Spacer(minLength: 0)`가 먼저 줄어들므로 기본 동작이 맞다. (HTML 시안에서는 flex 자식들이 눌려 표지가 47% 찌그러졌던 버그가 있었다. Swift 이식 시 `fixedSize(horizontal: false, vertical: true)`를 표지·제목·메타 행에 붙여 방어할 것.)

---

## 3. 히어로 (`RTHomeCarousel.cardView` + `Screen02Home.demoStage`)

두 경로(라이브 캐러셀 / 데모 스테이지) **모두** 같은 레이아웃으로 맞춘다.

```
[표지 122×179]                       ← 3D, 아래 접지 그림자
[접지 그림자]  margin-top 3
[제목]         margin-top 15
[상태 배지 · 누적]  margin-top 8
[인디케이터 점]  margin-top 18, margin-bottom 16
```

### 3.1 표지 — `RTBook3D` 를 수정하지 않고 들비 축소한다

```swift
// 두 경로(demoStage · RTHomeCarousel.cardView) 동일
RTBook3D(front: …, spineTitle: …)
    .scaleEffect(122.0 / 172.0, anchor: .center)     // = 0.70930
    .frame(width: 140, height: 190)                  // 198×268 × 0.7093 — scaleEffect 뒤에 와야 함
```

이 한 줄만이다. **`RTBook3D.swift` 는 한 줄도 수정하지 않는다.**

- 각도·perspective **그대로** — `baseRy = 9` / `baseRx = 5` / `p = 1000`. 바꾸지 말 것.
  `ry` 를 음수로 하면 `faceVisible` 이 책등을 컬링해 책등이 오른쪽으로 넘어가고 광원 방향이 반전된다.
- 내부 `.shadow(0x2E2110@0.28, radius: 16, x: -6, y: 18)` (`RTBook3D.swift:212`) **유지**.
  `scaleEffect` 가 그림자도 함께 줄인다(radius 11.3 / x −4.3 / y 12.8) — 별도 그림자를 더하지 말 것.
- `static let W/H/D/cw/ch` **전부 유지**. `HomeBook3DFront` 도 수정하지 않는다.
- `.clipped()` 를 붙이지 말 것 — 그림자·통 면이 프레임 밖으로 나가는 것은 의도된 동작이다.
- `.padding(.top, 24)` → **삭제** (히어로가 이미 중앙 정렬)

> **`static let` 을 고치지 않는 이유**: `W/H/D` 만 줄이면 책등 세로쓰기 `.sans(9,900)`, 종이결 3px 주기,
> 내부 프레임 inset 8, 책배 3px, 책등 음영 6px, `lerpQuadV` 선 두께 1.2, `rtBookFloatY` 진폭 3.5 가
> 그대로 남아 개별 보정할 곳이 10곳이 넘고 6면 투영 회귀 위험이 생긴다. `scaleEffect` 는 전부 함께 줄인다.

**접지 그림자 (`floorShadow`)** — `RTBook3D` 의 형제 뷰라 `scaleEffect` 가 닿지 않는다. 같은 배율로 직접 축소:

| 값 | 기존 | 신규 |
|---|---|---|
| `frame(width:)` | 176 | **125** |
| `frame(height:)` | 26 | **18** |
| `endRadius:` | 88 | **62** |
| `.blur(radius:)` | 8 | **6** |
| `.padding(.top, …)` | 2 | **2 (유지)** |

부유 위상 동기 공식(`rtBookFloatY`, `sc = 1 − floatY*0.01`, `opacity = 0.5 − floatY*0.008`)은 그대로.

> 시안 HTML 의 `perspective(800px) rotateY(-15deg)` 는 **평면 CSS 근사**이며 앱 정본이 아니다.
> 히어로의 배치·크기·타이포만 시안을 따르고, 책의 3D 렌더 자체는 `RTBook3D` 가 정본이다.

### 3.2 제목

```swift
Text(card.title)
    .font(.sans(21, 900)).tracking(21 * -0.03)
    .foregroundColor(RT.ink)
    .lineLimit(1).minimumScaleFactor(0.6)
    .rtLB(RTLB.n21)          // 신규 토큰 — §8-2 참조
    .padding(.top, 15)
```
기존 23px → **21px**. `minimumScaleFactor(0.6)` 유지(긴 제목은 축소, 말줄임 아님).

### 3.3 상태 배지 + 누적 (신규 행)

기존 "표지 위 pill 칩"과 "저자 + 4:12 + N회 함께 읽음" 두 줄을 **이 한 줄로 대체**한다.

```
HStack(spacing: 9) {
    // ① 상태 배지
    HStack(spacing: 6) {
        Circle().fill(RT.green).frame(width: 5, height: 5).rtBlink(duration: 2.2)
        Text("18일째").font(.sans(11, 700)).foregroundColor(RT.green).rtLB(RTLB.n11)
    }
    .padding(EdgeInsets(top: 3, leading: 8, bottom: 3, trailing: 9))
    .background(Capsule().fill(RT.greenTint))

    // ② 누적
    HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text(totalHM).font(.mono(14, 700)).foregroundColor(RT.ink).rtLB(RTLB.m14)   // 신규 토큰
        Text("누적").font(.sans(11, 500)).foregroundColor(RT.muted).rtLB(RTLB.n11)
    }
}
.padding(.top, 8)
```

- 배지 문구: 종이책 = `"\(daysSinceAdded)일째"`. **밀리 카드 = `"밀리 · 자동 기록"`, 배경 `RT.amberTint`, 점·글자 `RT.amber`** (기존 칩의 amber 분기를 그대로 이 배지로 옮긴다).
- 밀리 카드는 누적 대신 **`다 읽었어요` 버튼**(`finishButton`)을 그 자리에 둔다 — 기존 `RTHomeCarousel.finishButton` 로직·스타일 그대로.
- **삭제**: 저자 `Text`, `Circle().fill(RT.ghost) 3px` 구분점, `"\(sessionCount)회 함께 읽음"`.
  - 삭제 이유: 저자는 표지에 인쇄돼 있고 홈에서 저자로 책을 고르는 동작이 없다. `sessionCount`는 책 상세(08)에서 볼 값이고, "함께 읽음"이라는 문구가 파트너와 함께 읽은 횟수로 오독된다.

### 3.4 인디케이터 점

```swift
dots.padding(.top, 18).padding(.bottom, 16)
```
**기존 값 그대로 유지.** 점 크기 활성 6 / 비활성 5, `spacing: 6`, 색 `RT.ink` / `RT.ghost`.

> 이 18/16은 실기기 검증으로 정해진 값이다(2026-08-26 "점이 카드에 2pt로 붙었다"). 절대 줄이지 말 것.

**데모 경로에도 점을 그린다 — 3개, 활성 index 0.** 데모/스크린샷은 "여러 권을 병행해 읽는 사용자의 홈"이
정본이고, 점이 없으면 히어로가 캐러셀이라는 사실을 알 수 없다.
**라이브 경로는 현행 유지**(`cards.count > 1` 일 때만) — 1권일 때 점 하나는 정보가 없다.

---

## 4. 도킹 카드 (`Screen02Home.card`)

`padding(EdgeInsets(top: 14, leading: 20, bottom: 0, trailing: 20))` — 기존 top 16 → **14**.
배경·모서리·그림자·hairline 기존 유지: `UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26)`, `RT.surface`, 상단 1px `RT.hair`, `shadow(color: 0x16140F@0.16, radius: 15, y: -8)`.

내부 순서:

```
① CTA 행 (h60)
② 내 기록 헤더 행          padding(top: 13, h-inset: 4)
③ 연속/오늘 블록            padding(top: 10, h-inset: 4)
④ 요일 헤더                 padding(top: 14, h-inset: 4)
⑤ 2주 캘린더                padding(top: 6, bottom: 13, h-inset: 4)
⑥ 마지막 기록 행            padding(v: 9, h: 4) + 상단 hairline
⑦ 파트너 행                 padding(v: 9, h: 4) + 상단 hairline
⑧ Color.clear height 26
```

### ① CTA 행 — 기존 유지, 안내 문구만 삭제

```swift
HStack(spacing: 10) {
    if recordable { readCTA; tapStartButton } else { readCTADisabled }
}
```
**삭제**: 그 아래 `.padding(.top, 12)` 보조 안내 `Group { ... }` 블록 전체 (종이책 문구 + 밀리 문구 모두).

- 삭제 이유: 엎기/탭 안내는 CTA 라벨 자체가 이미 말한다. 밀리 문구는 칩·CTA·안내 3중 중복(`RTHomeCarousel` 주석에도 같은 판단이 기록돼 있다).
- `readCTA` 높이 60, radius 16, `LinearGradient.css(135, [(0x3A5C4B, 0), (0x26413A, 1)])`, 라벨 `.sans(15.5, 700)` tracking `-0.01em` — 전부 기존 값.

### ② 내 기록 헤더 행 (신규)

```swift
HStack(spacing: 7) {
    Text("내 기록").font(.sans(13, 800)).foregroundColor(RT.ink)
    if isNewRecord { newRecordBadge }
    Spacer(minLength: 0)
    statsButton
}
.padding(EdgeInsets(top: 13, leading: 4, bottom: 0, trailing: 4))
```

**`statsButton` (통계 진입점 — 이 작업의 핵심)**

```swift
HStack(spacing: 6) {
    RTIcon(["M5 20V11M12 20V4M19 20v-6"], size: 13, stroke: RT.green, lineWidth: 1.9)
    Text("전체 통계").font(.sans(11.5, 700)).foregroundColor(RT.green)
}
.padding(EdgeInsets(top: 5, leading: 9, bottom: 5, trailing: 11))
.background(Capsule().fill(RT.greenTint))
.contentShape(Capsule())
.onTapGesture { model?.nav(.statsWeek) }
.accessibilityIdentifier("home.statsButton")
```

- 아이콘 path는 `RTHomeMenu`의 통계 행이 쓰는 것과 **동일**(같은 목적지이므로 같은 기호를 쓴다).
- 꺽쇠(`M9 6l6 6-6 6`)를 쓰지 말 것. 텍스트+꺽쇠는 이 디자인에서 금지된 패턴이다.
- 히트 영역이 44pt 미만이다. **아래로만 9pt 확장한다** — 위쪽은 CTA 행(60pt, 탭 대상)이라 상하 대칭 확장은 주 액션의 탭을 빼앗는다. 아래는 연속 블록이고 §10(D-2)으로 탭 대상이 아니니 충돌이 없다.
  ```swift
  .padding(EdgeInsets(top: 5, leading: 9, bottom: 5, trailing: 11))
  .background(Capsule().fill(RT.greenTint))
  .padding(.bottom, 9)          // 히트 영역 확장분
  .contentShape(Capsule())
  .padding(.bottom, -9)         // 레이아웃 원복 — 행 높이 27 유지
  .onTapGesture { model?.nav(.statsWeek) }
  ```
  캡슐 27 + 하향 9 = **36pt**. `.padding(.vertical, N)`을 그대로 쓰면 SwiftUI에서는 레이아웃 높이에 그대로 더해져(CSS와 다름) 이하 모든 블록이 12pt 밀린다.

**`newRecordBadge` (신기록 상태에서만)**

```swift
HStack(spacing: 4) {
    Text("▲").font(.sans(8.5, 400)).foregroundColor(RT.amberDeep)   // #B8862E
    Text("신기록").font(.sans(10.5, 700)).foregroundColor(RT.amberDeep).rtLB(RTLB.n10_5)
}
.padding(EdgeInsets(top: 3, leading: 8, bottom: 3, trailing: 8))
.background(Capsule().fill(RT.amberTint))
.rtBreath(duration: 2.6)   // opacity 1 → .62 → 1
```
`▲`는 텍스트 글리프가 아니라 3.5×3 삼각형 `Path`로 그려도 된다(폰트 의존 제거). 짐·큐 앱의 신기록 문법과 동일.

### ③ 연속/오늘 블록 (신규)

```swift
HStack(alignment: .top, spacing: 14) {
    // 좌: 오늘 읽음
    VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            countUp(todayMin)                                  // .mono(27, 700), tracking -0.02em, RT.ink
            Text("분").font(.sans(13, 700)).foregroundColor(RT.body)
        }
        Text("오늘 읽음").font(.sans(10.5, 600)).foregroundColor(RT.muted)
            .padding(.top, 4)
    }
    .fixedSize()

    Rectangle().fill(RT.hair2).frame(width: 1, height: 42)

    // 우: 연속 + 게이지 + 역대 최고
    VStack(spacing: 0) {
        HStack(alignment: .firstTextBaseline) {
            Text("\(streak)일 연속").font(.mono(13, 700)).foregroundColor(streakColor)
            Spacer(minLength: 0)
            Text("이번 주 \(weekHM)").font(.mono(11, 500)).foregroundColor(RT.faint)
        }
        gauge.padding(.top, 7)
        HStack(spacing: 5) {
            Text("역대 최고").font(.sans(10, 600)).foregroundColor(RT.faint)
            Text("\(bestStreak.days)일").font(.mono(10.5, 600)).foregroundColor(RT.muted)
            Text("· \(bestStreak.monthLabel)").font(.sans(10, 500)).foregroundColor(RT.faint)
            Spacer(minLength: 0)
            Text(remainLabel).font(.mono(10.5, 700)).foregroundColor(remainColor)
        }
        .padding(.top, 6)
    }
}
.padding(EdgeInsets(top: 10, leading: 4, bottom: 0, trailing: 4))
```

**게이지**

`LinearGradient.css` 는 **`size:` 를 반드시 넘겨야** 한다(픽셀 공간에서 각도를 계산하므로 생략하면 1×1 로 왜곡된다). 트랙 폭은 `GeometryReader` 로 받는다 — `RTPeakCard` 와 같은 방식.

```swift
GeometryReader { geo in
    let w = geo.size.width
    ZStack(alignment: .leading) {
        Capsule().fill(Color(hex: 0xECE5D2))
        Capsule()
            .fill(LinearGradient.css(90, size: CGSize(width: w * frac, height: 5),
                                     [(Color(hex: 0xDC9078), 0), (Color(hex: 0xC2553A), 1)]))
            .frame(width: w * frac)
        // 역대 최고 지점 눈금
        Rectangle().fill(Color(hex: 0x17150F, alpha: 0.34))
            .frame(width: 1.5)
            .offset(x: w * tickFrac - 1.5)
    }
}
.frame(height: 5)
.clipShape(Capsule())
```

눈금은 `tickFrac == 1.0` 일 때 트랙 오른쪽 끝에 딱 붙어야 하므로 `offset` 에서 폭(1.5)을 빼 안쪽으로 넣는다.

| 상태 | `frac` | 눈금 위치 `tickFrac` | 채움 색 | `streakColor` | `remainLabel` / 색 |
|---|---|---|---|---|---|
| 평상시 (`streak < best`) | `streak / best` | `1.0` (오른쪽 끝) | terra 그라데이션 | `RT.terra` | `"\(best - streak)일 남음"` / `RT.terra` |
| 타이 (`streak == best`) | `1.0` | `1.0` | terra 그라데이션 | `RT.terra` | `"최고 타이"` / `RT.terra` |
| 신기록 (`streak > best`) | `1.0` | `best / streak` | **골드** `[(RT.gold, 0), (RT.amber, 1)]` = `#E2CF9E → #C9973B` + `.rtSweep()` | `RT.amberDeep` `#B8862E` | `"+\(streak - best)일"` / `RT.amberDeep` |
| 기록 없음 (`best == 0`) | `0` | — (눈금 숨김) | — | `RT.terra` | 하단 행 전체 숨김 |

- 신기록 시 하이라이트: 채움 Capsule 에 `.rtSweep()` 를 붙인다(`RTRankRow` 의 진행 바가 쓰는 것과 동일한 모디파이어). 별도 그라데이션 오버레이를 직접 만들지 말 것. 정적 렌더에서는 자동으로 표시되지 않는다(모션 off 규칙).
- 시안 `#14a`는 평상시: `streak 9 / best 24` → `frac = 0.375`, `remainLabel = "15일 남음"`.

### ④ 요일 헤더 (신규)

```swift
HStack(spacing: 6) {
    ForEach(Array(["월", "화", "수", "목", "금", "토", "일"].enumerated()), id: \.offset) { i, d in
        Text(d).font(.mono(10, 500))
            .foregroundColor(i == 6 ? RT.terra : RT.faint)
            .rtLB(RTLB.m10)
            .frame(maxWidth: .infinity)
    }
}
.padding(EdgeInsets(top: 14, leading: 4, bottom: 0, trailing: 4))
```

`Screen11Month.dowHeader`와 **동일 규칙**: mono 10 / weight 500, 일요일만 `RT.terra`. 오늘 열을 강조하지 않는다(그건 `Screen10Stats.barRow`의 막대 차트 규칙이며 캘린더에는 적용하지 않는다). `spacing`만 월간(0) → 6으로 다르다(칸 간격과 맞추기 위함).

### ⑤ 2주 캘린더 (신규 — 이 작업의 두 번째 핵심)

**창(window) 정의**

- **월요일 시작 · 일요일 끝**의 완전한 2주. 마지막 줄이 **오늘이 포함된 주**.
- `Calendar(identifier: .gregorian)`, `firstWeekday = 2`.
- 이번 주 월요일 = `cal.dateInterval(of: .weekOfYear, for: now)!.start`, 창 시작 = 그보다 7일 전. 총 14칸, 롤링하지 않는다.
- 시안 `#14a` 기준: 오늘 = 2026-08-27(목) → 창 = 8/17(월) ~ 8/30(일). 28·29·30이 미래.

**그리드**

```swift
VStack(spacing: 6) {
    ForEach(0..<2) { row in
        HStack(spacing: 6) {
            ForEach(0..<7) { col in
                cell(window[row * 7 + col]).frame(maxWidth: .infinity)
            }
        }
    }
}
.padding(EdgeInsets(top: 6, leading: 4, bottom: 13, trailing: 4))
```

칸 폭은 `maxWidth: .infinity`로 균등 분배된다: `(390 − 40 − 8 − 36) / 7 = 43.71pt`.

**칸 하나**

```swift
Text("\(day)")
    .font(.mono(11.5, cell.isToday ? 700 : 500))
    .tracking(11.5 * 0.01)
    .foregroundColor(cell.fg)
    .rtLB(RTLB.m11_5)          // 15.0 — 신설 토큰 (§8-2)
    .frame(maxWidth: .infinity)
    .frame(height: 33)
    .background(RoundedRectangle(cornerRadius: 10).fill(cell.bg))
    .overlay(cell.hairline)      // 읽은 날만
    .rtRing(10, RT.terra.opacity(0.13), width: 3)   // 오늘만
```

**상태표 (분기 순서를 반드시 이 순서로)**

| # | 조건 | 배경 | 숫자 색 | weight | 링 / 테두리 |
|---|---|---|---|---|---|
| 1 | **오늘 그리고 분 > 0** | `#C2553A` (solid) | `#FFFFFF` | 700 | 바깥 3pt `terra @13%` 헤일로 |
| 2 | **미래** | 없음 | `#D3CBB6` | 500 | 없음 |
| 3 | **미기록 과거** (0분) | 없음 | 일요일 `#C2553A` / 그 외 `#B5AD97` | 500 | 없음 |
| 4 | **읽은 과거** | `terra @ α` | `#2E1C15` | 500 | 안쪽 1pt `rgba(122,60,40,.05)` |

> **분기 1번은 `오늘 && 분 > 0`이다.** `todayMin == 0`인 오늘은 3번(미기록 과거)으로 낙하해 배경·헤일로가 없어지지만, **weight는 700을 유지한다** — 700은 "오늘"의 표식이지 읽었는지의 표식이 아니다. 오늘 아직 안 읽은 칸은 이 화면에서 가장 찾아야 하는 칸인데, 배경도 헤일로도 없는 상태에서 weight까지 500으로 떨어지면 주변 미기록 칸과 구별이 사라진다.

**α (농도) 계산 — 절대 기준**

```swift
let a = min(0.72, 0.14 + 0.58 * Double(minutes) / 60.0)
```

- **60분 = 상한 근처**가 되는 절대 기준이다. 지난 2주 최고치 기준(상대값)으로 하지 말 것 — 주마다 기준이 바뀌면 오늘 칸의 진하기를 다른 주와 비교할 수 없다.
- 상한 0.72: 오늘 칸(1.0 + 헤일로)이 항상 화면에서 가장 진한 칸으로 남아야 한다.
- 실측 예: 12분 → 0.256 / 28분 → 0.410 / 34분 → 0.469 / 46분 → 0.585 / 63분 → 0.720(상한).

**앱 규칙에서 의도적으로 벗어난 한 곳**

`Screen11Month.numColor()`의 분기는 `today → future → sunday → else`이고 일요일은 항상 `RT.terra`다. 홈에서는 **색면이 깔린 칸(읽은 과거)에만 이 규칙을 적용하지 않고 `#2E1C15` 고정**으로 둔다. 색면 위 terra 숫자는 대비가 2.1:1까지 떨어진다(월간에는 셀 배경이 없어 생기지 않는 문제). 색이 없는 칸(미기록·미래)에는 일요일 terra 규칙을 그대로 적용한다.

**대비 검증값** (참고): `#2E1C15` 잉크는 α 0.256에서 11.2:1, α 0.72에서 5.6:1. 오늘 칸 흰 글자는 4.51:1. 전부 AA 통과.

**탭 동작**: 칸은 탭 대상이 아니다. 캘린더 영역 전체를 `전체 통계`와 같은 목적지(`nav(.statsWeek)`)로 묶어도 되지만, 개별 날짜 상세는 홈의 역할이 아니다(월간 화면 11의 역할).

### ⑥ 마지막 기록 행 — 기존 유지

`Screen02Home` 현재 코드 그대로. 아이콘 타일 30×30 radius 9 `RT.greenTint`, 2줄 텍스트, 우측 `lastWhen` mono 11/600 faint, 꺽쇠 없음, 행 전체 탭 → `openRecentDetail()`. 상단 hairline `RT.hair2`. `padding(v: 11 → 9)`만 조정.

### ⑦ 파트너 행 — 꺽쇠만 삭제

`partnerRow(_:)` 그대로 유지(헤일로·회전 링·idle 분기 전부). 마지막의
```swift
RTIcon(["M9 6l6 6-6 6"], size: 9, stroke: RT.ghost, lineWidth: 2.4)
```
**삭제**. 마지막 기록 행에는 꺽쇠가 없는데 이 행에만 있어 비일관이었다. 행 전체 탭(`openPartnerStats()`)은 유지. `padding(v: 11 → 9)`.

---

## 5. 모델 신규 파생값 (`RTAppModel.swift`)

### 5.0 `Screen02Home.Live` 구조체 변경

```swift
struct Live {
    let title: String
    let author: String        // 유지 — RTRemoteCover 의 폴백 렌더에 쓰인다. 화면에는 그리지 않는다.
    let coverUrl: String
    let totalHM: String
    let days: Int
    let todayMin: Int
    let weekHM: String
    let streak: Int
    let lastBook: String?
    let lastMin: Int?
    let lastWhen: String?
    // 삭제
    // let count: Int         // sessionCount — "N회 함께 읽음" 과 함께 제거
    // let chain: [Bool]      // 13도트 체인 제거
    // 추가
    let bestStreak: Int           // 0 = 과거 기록 없음 → 게이지 하단 행 숨김
    let bestStreakMonth: String   // "3월" / 해가 다르면 "2025.11"
    let cal14: [HomeCalCell]      // 정확히 14개
}
```

`weekHM` 은 **월요일 시작 주간 합계**여야 한다. `RTAppModel.weekSeconds` 가 `Calendar.firstWeekday = 2` 로 계산하는지 확인하고, 아니면 그것부터 고친다(`Screen10Stats.buildLive` 는 이미 `firstWeekday = 2`). 시안의 `2:24` 는 8/24(월)~8/27(목) 합이다.

### 5.1 `bestStreak`

```swift
/// 역대 최고 연속일. 현재 진행 중인 구간은 제외한다.
var bestStreak: (days: Int, monthLabel: String)
```

**계산 규칙**

1. 종이책 세션(`sessions.endedAt`) + 밀리(`ebookDaily`/`ebookSeconds > 0`)를 합쳐 `Set<Date>`(startOfDay)를 만든다 — `streakDays`/`streakChain`과 동일한 소스를 쓸 것.
2. 날짜를 정렬해 연속 구간으로 쪼갠다.
3. **현재 진행 중인 구간을 제외한다.** 오늘(또는 오늘 미기록이면 어제)에 닿아 있는 구간이 진행 구간이다. 제외하지 않으면 1일째에 "최고까지 0일"이 뜬다 (스터디 앱 `streakStats(dates)`와 동일한 판정).
4. 남은 구간 중 최장을 고른다. 동률이면 **최근** 구간.
5. `monthLabel` = 그 구간 **마지막 날**의 `"\(month)월"`. 해가 다르면 `"2025.11"` 형식.
6. 과거 완료 구간이 없으면 `(0, "")` → 게이지 하단 행 전체를 숨긴다.

### 5.2 `calendarWindow14`

```swift
struct HomeCalCell {
    let date: Date
    let day: Int
    let minutes: Int      // 종이 + 밀리 합산, 분
    let isToday: Bool
    let isFuture: Bool
    let isSunday: Bool
}
var calendarWindow14: [HomeCalCell]   // 정확히 14개, 월→일 × 2주
```

- 분 = `(종이 세션 초 합 + ebookSeconds(date)) / 60`. `todayMin`과 같은 반올림 규칙을 쓸 것(현재 `todaySeconds / 60`, 내림).
- 미래 칸은 `minutes = 0`, `isFuture = true`.
- `Screen10Stats.buildLive`를 확장하지 **말 것.** 그것은 per-day 합산 유틸이 아니라 주간 화면의 `Live` 구조체 전체를 만드는 `static func`이며, 확장하면 픽셀 검증이 끝난 기록 화면(10)을 건드려야 한다.
- **`RTAppModel`에 `calendarWindow14`를 신설하고 화면 10은 손대지 않는다.** 이미 같은 패턴의 per-day 합산이 모델에 있으므로 중복 구현이 아니다 — `weekDayMinutes`(`RTAppModel.swift:445-458`), `readDays`(`:406-415`), `ebookSeconds(on:)`(`:404`)를 재사용한다.

### 5.3 제거

`Screen02Home.chainDays = 13`, `chainDots`, `streakChain` 관련 뷰 코드. `RTAppModel.streakChain(_:)` 자체는 **삭제하지 말 것** — 이 작업 후 소스 미사용이 되지만 테스트 4건이 계약을 검증하고 그것이 `bestStreak` 회귀 방어로 쓰인다(같은 dayset 소스 공유). §9 AC #22 참조.

---

## 5-2. 데모 경로 (rtshot 픽셀 오라클) — 반드시 같이 수정

`Screen02Home` 은 이중 경로다. `model == nil` 또는 `userData == nil` 이면 **데모 고정값**으로 그리고, 이 경로가 rtshot 픽셀 오라클의 기준이다(`homeCards` 가 비어 `RTHomeCarousel` 을 타지 않고 `demoStage` 를 그린다).

1. **`demoStage` 와 `RTHomeCarousel.cardView` 를 동일한 레이아웃으로 고쳐야 한다.** 한쪽만 고치면 실기기와 스크린샷이 갈린다.
2. 데모 고정값을 시안 `#14a` 와 1:1로 맞춘다:

| 값 | 데모 고정값 |
|---|---|
| 제목 / 저자 | `몰입` / `미하이 칙센트미하이` |
| 상태 배지 | `18일째` (green) |
| 누적 | `4:12` |
| 오늘 읽음 | `46` 분 |
| 이번 주 | `2:24` |
| 연속 | `9` 일 |
| 역대 최고 | `24` 일 · `3월` |
| 남음 라벨 | `15일 남음` |
| 캘린더 창 | 8/17(월) ~ 8/30(일), 오늘 = 8/27(목) = index 10 |
| 캘린더 분 | `[0, 0, 34, 52, 41, 63, 28, 12, 47, 39, 46, nil, nil, nil]` |
| 마지막 기록 | `몰입 · 22분 읽음` / `오늘 21:47` |
| 파트너 | `소연` · `지금 읽는 중` · `작별하지 않는다` · `24`분 |

3. **rtshot 베이스라인을 재생성한다.** 히어로·도킹 카드 높이가 전부 바뀌므로 기존 baseline 은 100% 실패한다. 재생성 전에 위 표대로 렌더되는지 눈으로 확인할 것.
4. 데모 경로에서 `bestStreak` 계산은 실행하지 않고 위 고정값을 그대로 쓴다(날짜 의존성 제거 — 오늘 날짜가 바뀌어도 스크린샷이 흔들리면 안 된다). 캘린더 창도 `2026-08-27` 고정.

---

## 6. 상태 매트릭스

구현 후 아래 6개 상태를 전부 눈으로 확인한다.

| 상태 | 조건 | 화면 |
|---|---|---|
| A. 평상시 | `0 < streak < best`, 오늘 기록 있음 | 시안 `#14a` 그대로 |
| B. 오늘 미기록 | `todayMin == 0` | 오늘 칸 = 배경 없음 + 숫자 `#B5AD97`(일요일이면 terra) · 헤일로 없음. `오늘 읽음` 숫자 `0` `RT.terra`. 연속 줄 `"\(streak)일 연속"`은 어제까지의 값 유지 |
| C. 신기록 | `streak > best` | 헤더에 `▲ 신기록` 배지, 게이지 골드 + sweep, `remainLabel = "+N일"`, `streakColor = RT.gold` |
| D. 기록 시작 직후 | `best == 0` | 게이지 하단 행(역대 최고 / 남음) 숨김. 게이지는 빈 트랙만 |
| E. 밀리 카드 선택 | `!selectedCardRecordable` | 히어로 배지 = amber `"밀리 · 자동 기록"`, 누적 자리 = `다 읽었어요` 버튼, CTA = `readCTADisabled`. **도킹 카드의 기록 블록은 그대로 표시**(내 기록은 카드와 무관한 값) |
| F. 파트너 없음 | `partner == nil` | 파트너 행 숨김. 다른 블록 위치 변화 없음(카드가 그만큼 짧아진다) |

---

## 7. 삭제 목록 (한눈에)

1. 보조 안내 문구 2종 — `엎기 어려운 곳이면 탭 시작으로 기록하세요`, `종이책은 옆으로 넘겨 선택하세요`
2. 히어로 저자 `Text`
3. 히어로 `N회 함께 읽음` + 앞의 3px 구분점
4. 표지 위 pill 칩 (배지로 대체)
5. 13도트 연속 체인 (`streakChain` 뷰)
6. 파트너 행 우측 꺽쇠 아이콘
7. `Screen02Home.chainDays`, `chainDots`, `Dot` 구조체

---

## 8. 토큰 (하드코딩 금지 — `RTTokens.swift` 참조)

| 토큰 | 값 | 이 화면에서의 용도 |
|---|---|---|
| `RT.paper` | `#F6F3EA` | 화면 배경 |
| `RT.surface` | `#FDFBF4` | 도킹 카드, 탭 시작 버튼 |
| `RT.ink` | `#17150F` | 제목, 숫자, 인디케이터 활성 |
| `RT.body` | `#3F3A2D` | `분` 단위 |
| `RT.muted` | `#8C8570` | `오늘 읽음`, `누적`, 역대 최고 숫자 |
| `RT.faint` | `#B5AD97` | 요일, `이번 주`, 미기록 날짜, 라벨 |
| `RT.ghost` | `#C6BEA8` | **인디케이터 비활성 점 전용.** 텍스트에 쓰지 말 것 (대비 1.79:1) |
| `RT.terra` | `#C2553A` | 연속, 오늘 칸, 일요일, 캘린더 농도 |
| `RT.green` | `#2C4A3C` | 상태 배지, 전체 통계 버튼 |
| `RT.greenTint` | `#E9EFE6` | 배지·버튼 배경, 아이콘 타일 |
| `RT.amberDeep` | `#B8862E` | **신기록 텍스트·▲·연속 숫자** (`RT.gold` 가 아니다) |
| `RT.gold` | `#E2CF9E` | 골드 게이지 그라데이션 시작점 |
| `RT.amber` | `#C9973B` | 골드 게이지 그라데이션 끝점, 밀리 배지 점·글자 |
| `RT.amberTint` | `#F6ECD6` | 신기록 배지 배경, 밀리 배지 배경 |
| `RT.hair` | `#E9E2CF` | 카드 상단 1px |
| `RT.hair2` | `#EAE3D0` | 행 구분 1px, 세로 divider |
| — | `#ECE5D2` | 게이지 트랙 (신규, 토큰화 권장 — `RTPeakCard`·`RTRankRow` 도 같은 리터럴을 쓰고 있다) |
| — | `#D3CBB6` | 캘린더 미래 날짜 (`Screen11Month`와 공유) |
| — | `#2E1C15` | 캘린더 색면 위 날짜 (신규) |

---

## 8-2. 라인박스 (`rtLB`) — 적용 범위를 지킬 것

> **v3 정정.** v1 은 "이 앱은 모든 `Text` 를 line-box 프레임에 넣는다"고 적었는데 **거짓이다.**
> `Screen02Home.swift` 에는 `.rtLB(` 가 **한 곳도 없다.** `RTLB` / `.rtLB(_:)` 는 기록 화면
> (`RTRecordViews`·`Screen10Stats`·`Screen11Month`)의 패턴이고 홈은 SwiftUI 기본 행높이를 쓴다.
>
> 1. **신규 블록(② ③ ④ ⑤ + 히어로 제목·배지행)에만 `.rtLB(…)` 를 붙인다** — 높이를 예산해야 하는 복합 블록이다.
> 2. **기존 행(① CTA · ⑥ 마지막 기록 · ⑦ 파트너)에는 추가하지 말 것** — 이미 픽셀 검증을 통과한 행이고, 도입하면 행높이가 바뀌어 품질 이득 없이 회귀만 난다.
> 3. 한 카드 안에 두 방식이 섞이는 것은 의도된 것이며, 그러므로 **카드 전체 높이를 토큰으로 예산할 수 없다**(§2).

**신규 블록에서 쓰는 기존 토큰** (값은 `RTRecordViews.swift:9-32` 에서 실값 확인함)

| 텍스트 | 폰트 | 토큰 |
|---|---|---|
| `내 기록` | sans 13 / 800 | `RTLB.n13` (18.5) |
| `신기록` | sans 10.5 / 700 | `RTLB.n10_5` (15) |
| `전체 통계` | sans 11.5 / 700 | `RTLB.n11_5` (17) |
| `분` (오늘 읽음 단위) | sans 13 / 700 | `RTLB.n13` |
| `오늘 읽음` | sans 10.5 / 600 | `RTLB.n10_5` |
| `18일째` · `누적` | sans 11 | `RTLB.n11` (16) |
| `역대 최고` · `· 3월` | sans 10 | `RTLB.n10` (14.5) |
| `N일 연속` | mono 13 / 700 | `RTLB.m13` (17) |
| `이번 주 N:NN` | mono 11 / 500 | `RTLB.m11` (15) |
| `24일` · `15일 남음` | mono 10.5 | `RTLB.m10_5` (14) |
| 요일 헤더 | mono 10 / 500 | `RTLB.m10` (13) |
| **캘린더 날짜** | mono 11.5 | **`RTLB.m11_5` (15.0) — 신설** |

**신규로 추가해야 하는 토큰 3개**

`RTRecordViews.swift` 의 `enum RTLB` 에 추가한다. 주석의 방법대로 **Chrome 에서 시안을 렌더해 `getBoundingClientRect()` 로 실측한 값**을 넣어야 한다. 아래는 기존 표에서 도출한 잠정값(mono ≈ size × 1.31, sans ≈ size × 1.44)이며, 실측값과 다르면 실측값이 정본이다.

| 토큰 | 용도 | 실측값 (정본) |
|---|---|---|
| `n21` | 히어로 제목 sans 21 / 900 | **30.5** |
| `m14` | 누적 시간 mono 14 / 700 | **18.5** |
| `m27` | 오늘 읽음 숫자 mono 27 / 700 | **35.0** |
| `m11_5` | **캘린더 날짜 mono 11.5** | **15.0** |

> 위는 구현 세션이 Chrome 151 + 시안 동일 폰트·body 스타일에서 `getBoundingClientRect().height` 로
> 재어 **실측값(정본)** 이다. 기존 `RTLB` 19개를 같은 하네스로 다시 재어 17개가 오차 0.0 일치했다.
>
> **`m11_5` 를 신설하는 이유**: `calNum`(12.5)은 주석이 "mono 10 기준 콘텐츠 높이"로 목박아 있어
> 11.5 에 재사용하면 토큰이 거짓말을 하기 시작한다. 픽셀은 동일하지만(셀에 `frame(height: 33)` 이
> 걸려 중앙정렬된다) 다음 사람이 `calNum` 을 신뢰해 쓰면 틀린다. 한 줄 값싸고 정확하다.

> `countUp(_:)` 의 `countUpText` 에도 `.rtLB(RTLB.m27)` 를 붙인다. 카운트업 중 숫자 폭·높이가 바뀌면 블록이 흔들린다.

---

## 8-3. 접근성

캘린더는 **색만으로 분량을 전달**하므로 VoiceOver 대체 텍스트가 필수다.

```swift
// 칸 하나
.accessibilityElement(children: .ignore)
.accessibilityLabel("8월 \(day)일")
.accessibilityValue(minutes > 0 ? "\(minutes)분" : "기록 없음")
.accessibilityAddTraits(isToday ? .isSelected : [])
```

- 캘린더 그리드 컨테이너: `.accessibilityLabel("최근 2주 독서 기록")`
- 연속 블록: `.accessibilityLabel("9일 연속, 역대 최고 24일, 15일 남음")` 으로 묶어 한 요소로 읽힌다(`children: .combine`).
- `전체 통계` 버튼: `.accessibilityIdentifier("home.statsButton")`, `.accessibilityAddTraits(.isButton)`.
- 미래 날짜 칸: `.accessibilityHidden(true)`.

---

## 9. 수용 기준 (AC)

레이아웃

1. 390×844에서 세로 스크롤이 생기지 않는다. 히어로 자식(표지·제목·배지 행·인디케이터)이 하나도 압축되지 않는다.
2. `.scaleEffect(0.7093)` 와 `.frame(width: 140, height: 190)` 이 적용되었다. **표지를 화면에서 재어 122×179 가 나오는지로 검증하지 말 것** — `RTBook3D` 는 6면을 `p = 1000` 원근 투영하므로 투영 후 앞면 실측값은 122×179 가 아니다(`ry = 9°` 단축 + 원근 보정으로 어긋난다). 검증 대상은 배율과 프레임이다.
3. 인디케이터 점 하단과 도킹 카드 상단 사이 간격이 **16pt 이상**이다.
4. 세로 스크롤·압축이 없다. **카드 높이는 상수로 대조하지 않는다**(§2) — 신규 블록 222 + 기존 변화분으로만 검산하고 절대값은 빌드 후 실측한다.
5. **밝은 부위(`lightPool`) 중심이 축소된 책의 수직 중심과 같다**(§2 배경 3레이어). 빛 웅덩이가 책 아래에 남지 않는다.
6. 진입 애니메이션이 유지된다 — `rtBookDropIn`(표지), `rtRiseIn`(배지행 delay .04 / 제목 .18 / 카드 .26). 스테이지를 다시 쓰며 조용히 사라지기 쉬운 것들이다.

캘린더

5. 정확히 14칸, 2줄 × 7칸. 첫 칸이 월요일, 마지막 칸이 일요일.
6. 마지막 줄에 오늘이 포함된다. 오늘 이후 날짜는 미래 스타일.
7. 오늘 칸이 화면에서 가장 진한 terra이고 3pt 헤일로가 보인다.
8. 미기록 과거 칸에 배경·테두리가 전혀 없다.
9. 60분 이상 읽은 날의 α가 0.72로 고정된다(그 이상 진해지지 않는다).
10. 요일 헤더에서 일요일만 terra다. 오늘 열은 강조되지 않는다.

기록/진입

11. `전체 통계` 탭 → 주간 기록(10) 화면. 아바타를 거치지 않는다.
12. 마지막 기록 행 탭 → 그 책 상세(08). 소연 행 탭 → 파트너 통계.
13. 연속 1일째에 `최고까지 0일`이 뜨지 않는다(진행 구간 제외 계산 검증).
14. 신기록 상태에서 게이지가 골드로 바뀌고 `+N일`이 표시된다.

접근성

15. 캘린더 모든 숫자가 배경 대비 4.5:1 이상.
16. `전체 통계` 버튼 히트 영역 세로 ≥ 36pt (캡슐 27 + 하향 확장 9). 위쪽 CTA 행의 히트 영역을 침범하지 않는다.
17. 기존 `accessibilityIdentifier` 유지: `home.avatar`, `home.recentRow`, `home.partnerRow`. 신규 `home.statsButton` 추가.
18. 캘린더 각 칸에 VoiceOver 라벨(`8월 27일` / `46분`)이 읽힌다. 미래 칸은 읽히지 않는다.

빌드/회귀

19. `LinearGradient.css` 호출 전부에 `size:` 가 들어가 있다(생략 시 각도가 왜곡된다).
20. 신규 `Text` 전부에 `.rtLB(...)` 가 붙어 있다.
21. 데모 경로(`userData == nil`)와 라이브 경로가 같은 레이아웃으로 렌더된다. 홈 오라클 `ora-home.png` 를 **신규 생성**했으며, 크롭 범위는 **도킹 카드 상단(y=410)부터 화면 하단까지**이다. 히어로는 픽셀 오라클 대상이 아니다 — 시안의 평면 CSS 렌더와 `RTBook3D` 의 6면 투영은 원리가 달라 원래 일치할 수 없다(실기기 눈 검증으로 대체).
22. `RTAppModel.streakChain(_:)` 는 삭제되지 않았다. 이 작업 후 소스에서는 미사용이 되지만(유일한 호출처가 `Screen02Home.swift:72` 로 이번에 삭제되는 코드였다), 테스트 4건(`RTHomeDerivedTests` 3 + `RTEbookStatsTests` 1)이 이 함수의 계약을 검증하고 그 테스트가 `bestStreak` 신규 구현의 회귀 방어에 그대로 쓰이므로 자산을 보존한다.
23. 오늘 날짜가 바뀌어도 데모 스크린샷이 변하지 않는다(데모 캘린더 창 고정).

---

## 10. 확정 사항 (v1 미결정 → 전부 확정)

1. **α 절대 기준 60분** — 하루 평균 20분대 사용자에게는 캘린더 전체가 옅게 나온다. 사용자 분포 확인 후 45분 또는 90분으로 조정 가능. 코드에서 상수 1개(`RTHomeCal.fullMinutes = 60`)로 빼둘 것.
2. **캘린더 영역 탭 = 탭 비활성 확정.** 바로 위에 `전체 통계` 버튼이 같은 목적지로 있고, 라벨 없는 큰 영역이 탭되면 목적지 예상이 안 된다. 개별 날짜 상세는 월간 화면(11)의 역할이다.
3. **100분 이상 표기** — 지금 스펙은 날짜만 표시하므로 문제없다. 향후 칸에 분을 표시하는 안으로 갈 경우 3자리 축약 규칙이 필요하다(시안 `#13a` 참조).
4. **아바타 메뉴의 `통계` 행 = 유지 확정** (`Screen02Home.swift:625-631`). 빈 홈(14)이 같은 메뉴를 쓰므로 삭제하면 14에서 통계 경로가 사라진다.

---

## 11. 참조

| 무엇 | 파일 |
|---|---|
| 정본 시안 | `리딩타임 홈 기록 리디자인.dc.html` → `#14a` (이전 검토 이력: `#1a`~`#13a`) |
| 현재 홈 | `Screens/Screen02Home.swift`, `Screens/RTHomeCarousel.swift` |
| 캘린더 문법 정본 | `Screens/Screen11Month.swift` — `dowHeader`, `calendar`, `cellView`, `numColor` |
| 차트 문법 참조 | `Screens/Screen10Stats.swift` — `barRow`, `buildLive`의 per-day 합산 |
| 토큰 | `RTTokens.swift` |
| 라인박스·링 유틸 | `RTRecordViews.swift` — `RTLB`, `rtRing`, `rtRecCard` |
| 신기록 문법 원본 | `study/src/pages/home.js`(`streakStats`), `gym/src/features/home.js`(`summarizeStreak`) |
