# 짐앱 홈 화면 구현 작업지시서 (시안 20a)

대상: `gym/GymKit/Sources/GymViews/HomeScreen.swift`
기준 시안: `Home-Cardio-Weight.dc.html` 섹션 20 / `20a`
기준 기기: iPhone 375×812 (11 Pro). 세로 여유 0px — 아래 수치를 임의로 키우면 CTA가 잘립니다.
화면 배경: `#fdfdfd` (카드만 `#fff`. 둘은 다른 값이며 카드가 배경 위에 살짝 떠 보이도록 의도된 차이입니다)

---

## 0. 이번 변경의 요지

1. **유산소를 부위 밸런스 차트에서 분리**하고, 체중 카드와 같은 형태의 **독립 카드**로 내림.
2. 유산소 카드는 **월~일 7칸 원**. 이번 주에 뛴 날은 채움, 지난주 같은 요일 기록은 테두리 원 안 회색 숫자.
3. **주간 캘린더에 유산소 표시 추가** (틸 링). 근력은 기존 crail 채움.
4. **체중 카드에 30일 추이 스파크라인** 추가 (별도 페이지 진입 제거).
5. 부위 밸런스 차트: 유산소 행 삭제, 축 스케일 **11px/세트**로 축소.

---

## 1. 색 토큰

`paper.css` / `GymTokens.swift`에 없는 값은 신규 추가.

| 이름 | 값 | 용도 |
|---|---|---|
| `ink-1` | `oklch(22% 0.008 60)` | 큰 숫자, 강조 텍스트 |
| `ink-2` | `oklch(38% 0.008 60)` | 부위 이름, 보조 숫자, 체중 추이선 |
| `ink-3` | `oklch(56% 0.008 60)` | 캡션, **지난주 원 안 숫자** |
| `ink-4` | `oklch(72% 0.006 60)` | 단위(분/kg/세트), 요일 라벨 |
| `line` | `oklch(92% 0.006 60)` | 세로 구분선 |
| `soft` | `oklch(94.5% 0.006 60)` | 카드 내 수평 구분선 |
| `sunken` | `oklch(97.6% 0.006 60)` | 아이콘 배지 배경 |
| `ring` | `oklch(88% 0.006 60)` | **유산소 빈 원 테두리** |
| `axis` | `oklch(88% 0.008 60)` | 차트 기준선 |
| `crail-tint` | `oklch(95% 0.02 50)` | 캘린더 근력 채움, 기록하기 배경 |
| `crail-soft` | `oklch(85% 0.05 50)` | 기록하기 테두리 |
| `crail-base` | `oklch(67% 0.12 50)` | 캘린더 오늘 채움 |
| `crail-deep` | `oklch(48% 0.14 50)` | 캘린더 근력 숫자, 기록하기 텍스트 |
| `teal` | `#2f807a` | **이번 주 실적** — 밸런스 잉크 막대, 유산소 채운 원 |
| `pine` | `#215d5b` | 오늘 원 외곽 링, 오늘 요일, `+5` 칩 텍스트, CTA 배경 |
| `ghost` | `#cddedc` | **지난주 실적** — 밸런스 고스트 막대 |
| `ghost-tint` | `#e7efee` | `+5` 칩 배경 |
| `warn-tint` | `oklch(95% 0.035 80)` | 갱신 칩 배경 |
| `warn-deep` | `#a06d2c` | 갱신 칩 텍스트 |

**색의 의미 규칙 (반드시 유지)**
- `crail` 계열 = **날짜·기록 행위** (캘린더 근력/오늘, 기록하기 버튼)
- `teal`/`pine` 계열 = **훈련량** (막대, 원, 델타, CTA)
- `ghost` = **지난주**, `teal` = **이번 주** — 밸런스 차트와 유산소 카드가 같은 규칙
- `warn` 계열 = **미달·아쉬움**. crail을 미달에 쓰지 말 것.

## 2. 타이포

- 한글: **Pretendard**
- 숫자: **Space Grotesk** + `tabular-nums`. 숫자가 들어가는 모든 자리에 적용(원 안 숫자, 막대 위 값, 큰 수치, 캘린더 날짜).
- 큰 수치(`32`, `57`, `72.4`)는 `letter-spacing: -0.03em`.

---

## 3. 화면 구조 (위 → 아래, 375×812)

루트는 세로 스택, 상단 `padding-top: 52`(노치 세이프 에어리어), 좌우 패딩 없음(블록마다 개별 지정).

| # | 블록 | 외곽 여백 (top/좌우/bottom) |
|---|---|---|
| 1 | 헤더 | `padding: 8px 24px 0` |
| 2 | 2주 캘린더 | `padding: 8px 18px 0`, 내부 세로 gap 8px |
| 3 | 직전 운동 | `padding: 11px 24px 0` |
| 4 | 부위 밸런스 | `padding: 9px 24px 0` |
| 5 | **Spacer** | `Spacer(minLength: 0)` — 남는 세로를 흡수 |
| 6 | 유산소 카드 | `margin: 12px 24px 0` |
| 7 | 체중 카드 | `margin: 12px 24px 0` |
| 8 | CTA | `padding: 12px 24px 22px` |

위 여백은 시안에서 그대로 옮긴 값이며, 375×812에서 Spacer가 **0에 수렴**합니다(여유 없음). 폰트 메트릭 차이로 1~2px 초과하면 Spacer가 아니라 캘린더 내부 gap(8→7)이나 밸런스 축 스케일(11→10)에서 회수하세요.

**내부 폭 기준값** (구현 시 나눗셈 확인용)
- 밸런스 차트 영역 = 375 − 24×2 = **327**, 6열 균등 → 열당 54.5
- 카드 내부 = 375 − 24×2(마진) − 18×2(패딩) = **291**
- 유산소 원 7개 = 30×7 = 210 → `space-between` 간격 = (291 − 210) / 6 = **13.5**

---

## 4. 헤더

- 좌: `Gym` — 23px / 700 / `-0.03em` / ink-1
- 우: `통계` `관리` — 각 14px / 500 / ink-3, 탭 영역 `padding 8px 12px`, 두 항목 gap 2px

## 5. 2주 캘린더

컨테이너 `padding: 8px 18px 0`, 내부 세로 gap **8px**, 7열 균등(`flex:1`).

**요일 헤더** — 11px / 600 / `letter-spacing .04em` / ink-4. 오늘 요일(화)만 crail-deep.

**날짜 원** — 1주차 24px / 12.5px 글자, 2주차 28px / 14px 글자.

각 날짜의 상태 조합:

| 상태 | 배경 | 테두리 | 숫자 색 |
|---|---|---|---|
| 근력만 | crail-tint | — | crail-deep |
| 근력 + 유산소 | crail-tint | `inset 0 0 0 1.5px teal` | crail-deep |
| 유산소만 | 없음 | `inset 0 0 0 1.5px teal` | ink-2 |
| 오늘 + 근력 | crail-base | (유산소면 teal 링) | `#fff` |
| 오늘 + 운동 없음 | 없음 | `inset 0 0 0 1.5px ink-4` | ink-1 |
| 없음 | 없음 | — | ink-4 |

글자 weight: 근력·유산소 있으면 600, 없으면 500. **오늘도 예외 없이 600** (700으로 올리지 말 것 — 채움 색만으로 충분히 구분됨).

샘플 데이터: 근력 = 3·5·7·8·10·11, 유산소 = 5·7·8·10·11, 오늘 = 11.
표의 `유산소만` 행은 샘플에는 없지만 실제로 발생하므로 반드시 구현하세요(유산소만 한 날 = 배경 없이 teal 링, 숫자 ink-2).

**범례** — 캘린더 아래 `padding: 0 12px`, `margin-top 2px`, gap 6px
- 10px 원 / crail-tint 채움 + `inset 1.5px crail-deep` → `근력` (10.5px / 500 / ink-4)
- 10px 원 / 테두리만 `inset 1.5px teal` (좌 margin 5px) → `유산소`

## 6. 직전 운동

`padding: 11px 24px 0`, gap 10px, 한 줄:
- 30×30 배지 `radius 9px` / `sunken` 배경 / 안에 17×17 덤벨 SVG (`stroke ink-3`, `width 1.6`, `linecap round`)
  `path`: `M4 8v4  M6.5 6.2v7.6  M13.5 6.2v7.6  M16 8v4  M6.5 10h7` (viewBox `0 0 20 20`)
- `직전 운동` 12px / 600 / `.02em` / ink-4
- 부위명 `가슴 · 팔` 15px / 700 / ink-1
- 우측 정렬: `오늘` 12.5px / 500 / ink-4
  (표시 규칙: 오늘이면 `오늘`, 아니면 `N일 전`. 요일과 `오늘`을 함께 쓰지 말 것 — 중복)

## 7. 부위 밸런스 (페어 컬럼 차트)

컨테이너 `padding: 9px 24px 0`.

**제목 행** (baseline 정렬, gap 7px)
- `부위 밸런스` 13.5px / 700 / `-0.01em` / ink-1
- 우측: 합계 `32` — 31px / 700 / `-0.035em` / ink-1
- `세트` 11.5px / 500 / ink-4
- 델타 칩 `+5` — `padding 4px 10px` / `radius 999px` / bg ghost-tint / 12px / 700 / pine
  (음수면 bg warn-tint, 텍스트 warn-deep, `−N`)

**범례 행** `margin-top 7px`, gap 6px
- 9×9 `radius 2.5px` ghost → `지난주` (11px / 500 / ink-4)
- 9×9 `radius 2.5px` teal (좌 margin 6px) → `이번 주`

**차트** `margin-top 8px`, 6열 균등(`flex:1`), 각 열 세로 정렬 `gap: 0`

열 구성 (위→아래):
1. **이번 주 값** — 14.5px / 700 / ink-1 / `line-height 1` / `margin-left 16px` / `margin-bottom 6px`
   (`margin-left 16px`는 값을 잉크 막대 중심에 맞추기 위한 오프셋. 페어 폭 33px 중 잉크 막대가 오른쪽 17px이므로 필수)
2. **막대 쌍** — 컨테이너 `height 88px`, `align-items: flex-end`, `gap 3px`
   - 고스트(지난주): `width 13px`, `radius 4px 4px 0 0`, bg ghost
   - 잉크(이번 주): `width 17px`, `radius 4.5px 4.5px 0 0`, bg teal, `inset 0 1px 0 rgba(255,255,255,.20)`
3. **부위 이름** — `align-self: stretch`, `text-align: center`, `padding-top 7px`,
   `border-top: 1.5px solid axis` ← **기준선은 이 라벨의 상단 보더**. 별도 전폭 룰을 그리지 말 것.
   12.5px / 600 / ink-2 / `line-height 1`

**축 스케일: 11px / 세트.** 막대 높이 = `세트수 × 11`.

| 부위 | 이번 주 | 지난주 | 잉크 h | 고스트 h |
|---|---|---|---|---|
| 하체 | 8 | 6 | 88 | 66 |
| 어깨 | 5 | 4 | 55 | 44 |
| 등 | 6 | 5 | 66 | 55 |
| 가슴 | 7 | 5 | 77 | 55 |
| 팔 | 4 | 3 | 44 | 33 |
| 코어 | 2 | 4 | 22 | 44 |

트랙 높이 88px = 최대 8세트. 8세트를 넘으면 전체를 비례 축소(`min(88 / maxSets × sets, 88)`), 트랙 높이는 88px 고정.

**미달 부위를 점선·별색으로 처리하지 말 것.** 고스트 막대가 잉크보다 높은 것 자체가 미달 신호입니다(주 초에는 모든 부위가 미달이므로 강조하면 전부 강조됨).

## 8. 유산소 카드 ★ 이번 변경의 핵심

카드 셸: `margin: 12px 24px 0`, `padding: 11px 18px 10px`, `radius 18px`, bg `#fff`
그림자: `0 1px 0 rgba(20,18,14,.02), 0 6px 14px -8px rgba(20,18,14,.08), 0 24px 48px -24px rgba(20,18,14,.18)`
(체중 카드와 동일 셸)

**헤더 행** (baseline)
- `유산소` 13.5px / 600 / ink-1
- `이번 주` 11.5px / 500 / ink-4, 좌 margin 7px
- 우측 정렬 그룹 (baseline, gap 3px):
  - `57` 26px / 700 / `-0.03em` / ink-1
  - `분` 12px / 500 / ink-4
  - 세로 구분선 `width 1px; height 12px; background line; margin: 0 7px`
  - `2` 16px / 700 / ink-2
  - `일` 12px / 500 / ink-4

**7칸 원 행** `margin-top 9px`, `justify-content: space-between`
각 칸 = 세로 스택 `align-items: center`, `gap 5px`

| 케이스 | 원 (30×30, radius 50%) | 안의 숫자 | 요일 라벨 |
|---|---|---|---|
| **이번 주에 뛴 날** | bg **teal** | 이번 주 분, 13px / 600 / `#fff` | 10.5px / 500 / ink-4 |
| **오늘 + 뛴 날** | bg teal + `box-shadow: 0 0 0 1.5px #fff, 0 0 0 2.5px pine` | 13px / **700** / `#fff` | 10.5px / **700** / **pine** |
| **안 뛴 날 + 지난주 기록 있음** | 테두리만 `inset 0 0 0 1.5px ring` | **지난주 분, 13px / 600 / ink-3** | 10.5px / 500 / ink-4 |
| **양쪽 다 없음** | 테두리만 `inset 0 0 0 1.5px ring` | 없음 (시안은 색만 transparent 처리 — 레이아웃 영향 없음) | 10.5px / 500 / ink-4 |

네 케이스 모두 원 크기 30×30 고정, 숫자 크기 13px 고정. 크기로 구분하지 않습니다.

즉 **채움 = 이번 주, 테두리 + 회색 숫자 = 지난주 같은 요일.** 별도 설명 텍스트 없음.

예시 데이터 (오늘 = 화):

| | 월 | 화 | 수 | 목 | 금 | 토 | 일 |
|---|---|---|---|---|---|---|---|
| 표시 | **30** 채움 | **27** 채움+링 | 25 회색 | — | 28 회색 | 22 회색 | — |
| 출처 | 이번 주 | 이번 주(오늘) | 지난주 | 없음 | 지난주 | 지난주 | 없음 |

- 이미 지난 요일인데 이번 주에 안 뛰었고 지난주 기록도 없으면 → 빈 원.
- **이미 지난 요일인데 이번 주에 안 뛰었고 지난주 기록이 있으면** → 그대로 회색 숫자 유지(놓친 기록이 보이는 것이 의도).

**하단 행** `margin-top 9px`, `padding-top 7px`, `border-top: 1px solid soft` (baseline)
- 좌: `지난주 75분 · 3일` 11.5px / 500 / ink-3
- 우: 칩 — `display: inline-flex`, `align-items: baseline`, **gap 3px**, `padding 3px 9px` / `radius 999px` / bg warn-tint
  - `18분` 11.5px / 700 / warn-deep + `더 하면 갱신` 10.5px / 600 / warn-deep
  - 이미 넘겼으면 bg ghost-tint, 텍스트 pine, 문구 `+N분 갱신`

## 9. 체중 카드

셸: `margin: 12px 24px 0`, `padding: 13px 18px`, radius/그림자 유산소 카드와 동일.

**헤더 행** (space-between, center)
- 좌 그룹(baseline): `오늘 체중` 13.5px / 600 / ink-1 + `최근 30일` 11.5px / 500 / ink-4 (좌 margin 7px)
- 우: `기록하기` — `padding 8px 15px` / `radius 999px` / bg crail-tint / `inset 0 0 0 1px crail-soft` / 12.5px / 600 / crail-deep

**본문 행** `margin-top 9px`, `align-items: flex-end`, space-between
- 좌 세로 스택 gap 4px:
  - baseline gap 3px: `72.4` 28px / 700 / `-0.03em` / ink-1 · `kg` 12px / 500 / ink-4 · `−0.2` 12px / 500 / ink-3 (좌 margin 5px)
    (증감 기호는 `▲▼` 대신 `−` / `+`. 체중은 감소가 목표이므로 색을 입히지 말 것 — ink-3 고정)
  - `목표 69 · 3.4kg 남음` 11px / 500 / ink-4
- 우: **스파크라인** — 표시 크기 **132×38**
  - **선 1개만** 그림 — **7일 이동평균**(`sma7`). 일별 실측선은 그리지 않음(132px 폭에서 두 선 구분 불가).
  - 좌표계: 내부 `124×40`으로 계산한 뒤 132×38로 **비균등 확대**(`preserveAspectRatio: none`). 선 두께는 확대의 영향을 받지 않게 고정(`vector-effect: non-scaling-stroke`) — SwiftUI에서는 `Path`를 132×38 기준으로 직접 계산하고 `lineWidth: 1.6`을 그대로 쓰면 동일한 결과.
  - 선: `stroke ink-2`, `width 1.6`, `linecap/linejoin round`
  - 면: 선 아래를 아래 변까지 닫아 `fill oklch(96.5% 0.006 60)`
  - 마지막 점: `r 2.6`, `fill ink-1`, `stroke #fff 1.4`
  - 스케일: x = 30일 균등 분할, y = 해당 기간 min~max를 상하 padding 3px 안에 매핑. **격자선·축 라벨 없음**

## 10. CTA

`padding: 12px 24px 22px`
- 높이 56px, `radius 18px`, bg **pine**, 텍스트 `운동 시작` 16px / 600 / `-0.01em` / `#fbfdfc`
- 그림자 `0 10px 22px -12px rgba(33,93,91,.7)`

---

## 11. 데이터 요구사항

**주의 시작은 월요일**입니다(캘린더·유산소 카드·밸런스 차트 모두 동일). `Calendar.firstWeekday`가 일요일이면 명시적으로 월요일 시작으로 고정하세요.

기존 `HomeLogic` / `SessionLogic`에 있는 값으로 대부분 충족됩니다.

**신규로 필요한 것 (유산소 카드)**
```
weekCardio: [Weekday: Int]      // 이번 주 월~일 요일별 유산소 합계(분). 없으면 nil
prevWeekCardio: [Weekday: Int]  // 지난주 같은 요일 합계(분)
weekCardioTotal: Int            // 57
weekCardioDays: Int             // 2
prevWeekCardioTotal: Int        // 75
prevWeekCardioDays: Int         // 3
```
갱신 칩 = `prevWeekCardioTotal - weekCardioTotal`, 양수면 warn 칩(`N분 더 하면 갱신`), 0 이하면 pine 칩(`+N분 갱신`).

**캘린더**
```
liftDays: Set<Date>    // 근력 기록이 있는 날
cardioDays: Set<Date>  // 유산소 기록이 있는 날 (신규)
```
`cardioDays`는 유산소 카드의 원과 **반드시 같은 날짜 집합**이어야 합니다(같은 주 구간에서 불일치 금지).

**체중**: `sma7` 배열 + `goalKg`, `remainingKg`, `deltaFromPrev` — 기존 `WeightLogic` 그대로.

## 12. 작은 화면(SE 375×667) 대응

667에서는 145px이 부족합니다. 우선순위대로 축소:
1. 캘린더를 **1주**만 표시 (−45px)
2. 밸런스 축 11 → 8px/세트 (−24px)
3. 직전 운동 행 제거 (−41px)
4. 유산소 원 30 → 26px, 숫자 13 → 12px (−9px)
5. 부족하면 체중 카드 스파크라인을 숨기고 숫자만 (−0px, 폭만 회수)

세로 스크롤을 허용하는 편이 낫다면 1·2만 적용하고 나머지는 스크롤에 맡깁니다.

## 13. 하지 말아야 할 것

- 유산소를 부위 밸런스 차트의 7번째 열/행으로 되돌리지 말 것 (근력은 주 단위 로테이션, 유산소는 매일 — 단위가 다름)
- 미달 부위에 점선·crail 사용 금지
- 밸런스 차트 아래에 전폭 기준선을 별도로 그리지 말 것 (부위 이름의 `border-top`이 기준선)
- 체중 카드에 실측선 + 이동평균 두 선을 함께 그리지 말 것
- 유산소 카드에 "회색 숫자 = 지난주" 같은 설명 줄을 넣지 말 것
- 캘린더의 유산소 링과 유산소 카드의 원이 다른 날을 가리키게 하지 말 것
- 유산소 카드에 아이콘을 넣지 말 것 (밸런스 분리 전 쓰던 러닝 아이콘은 삭제됨)
- 유산소 원의 크기를 시간에 비례해 바꾸지 말 것 (30px 고정, 숫자로만 전달)

---

## 14. 구현 후 자가점검

- [ ] 375×812에서 스크롤 없이 CTA 하단까지 보이고, Spacer가 음수가 아니다
- [ ] 밸런스 차트의 기준선이 막대 밑변에 **붙어** 있다(부위 이름 border-top 방식). 막대와 선 사이 틈 0px
- [ ] 밸런스 값(14.5px)이 고스트가 아닌 **잉크 막대 중심**에 있다(margin-left 16px)
- [ ] 유산소 원 7개의 좌우 끝이 카드 내부 폭에 정확히 닿는다(space-between)
- [ ] 오늘 원의 외곽 링이 옆 원과 겹치지 않는다(2.5px 링 → 실질 지름 35px < 간격 43.5px)
- [ ] 캘린더의 유산소 링 날짜 집합 == 유산소 카드의 채운 원 날짜 집합 (같은 주 구간)
- [ ] 화면 전체에서 crail 사용처는 캘린더(근력·오늘)와 기록하기 버튼 **둘뿐**이다
- [ ] 숫자가 들어가는 모든 자리에 tabular-nums가 적용돼 있다(값이 바뀌어도 좌우로 흔들리지 않음)
- [ ] 주 초(월요일 아침) 상태: 밸런스 잉크 막대가 전부 0, 유산소 원이 전부 회색 숫자/빈 원 — 이 상태에서도 레이아웃이 무너지지 않는다
- [ ] 유산소를 한 번도 안 한 사용자: 원 7개 모두 빈 원, 하단 칩은 숫자 없이 숨김 처리
