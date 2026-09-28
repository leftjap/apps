<!-- trigger: SwiftUI,alignmentGuide,overlay,정렬 기준,if let,조건부 뷰,칩 위치,겹쳐 두기 | match-paths: gym/GymKit/Sources/GymViews/*.swift,readingtime/**/*.swift -->
# SwiftUI alignmentGuide — `if` 블록 안의 뷰에 걸면 무시된다

발생: gym 트레드밀 히어로 "+0.2km 갱신" 칩 (2026-09-29) / 환경: SwiftUI, macOS 14 ImageRenderer(gymshot) 실측

`.overlay(alignment: .bottom) { if let chip { ChipView().alignmentGuide(.bottom) { $0[.top] - 14 } } }` 처럼
**조건 블록 안쪽 뷰**에 정렬 기준을 걸면, SwiftUI 는 그 값을 쓰지 않고 기본 `.bottom` 정렬로 둔다.
칩이 부모 아래 14pt 가 아니라 부모 안쪽 하단에 붙는다. 컴파일 경고도 런타임 오류도 없다.

## 실측 (부모 100×100, 칩 20×20, 칩 윗변 y)

| 코드 | 칩 행 |
|---|---|
| 정렬 기준 없음 | 80–99 (안쪽 하단) |
| `Chip().alignmentGuide(.bottom) { $0[.top] - 14 }` | 114–133 (의도대로) |
| `if let … { Chip().alignmentGuide(…) }` | **80–99 (무시됨)** |
| `Group { if let … { Chip() } }.alignmentGuide(…)` | 114–133 |
| `ZStack { if let … { Chip() } }.alignmentGuide(…)` | 114–133 |

## How to avoid

조건 블록을 `Group`(또는 `ZStack`)으로 감싸고 **그 바깥**에 `.alignmentGuide` 를 건다. 조건이 거짓이면
빈 뷰라 부모 레이아웃에 영향이 없다(실측: 칩 없음, 부모 행 0–99 그대로).

## 검증 (재발 시 사인)

오라클·시안과 겹쳐 둔 요소의 세로 위치가 몇 pt 가 아니라 "자기 높이만큼" 어긋나 부모 안쪽 끝에 붙어 있으면
이 함정을 의심한다. 렌더 PNG 에서 해당 색 행을 PIL 로 재서 확인한다.
