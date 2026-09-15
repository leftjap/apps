# 고정 프레임 + scaleEffect 셸에서 confirmationDialog 의 취소 버튼이 사라진다

**실측 2026-09-15, 리딩타임 (iOS 26.5 시뮬레이터 iPhone 11 Pro)**

## 증상

`confirmationDialog` 에 `Button("삭제", role: .destructive)` 와 `Button("취소", role: .cancel)` 을 둘 다 넣었는데, 화면에는 **'삭제'만 뜨고 '취소'는 아예 렌더되지 않는다.** 되돌릴 수 없는 동작인데 물러설 길이 없어진다.

XCUITest 접근성 트리 실측:

```
Sheet, {{12.0, 259.0}, {240.0, 236.3}}, label: ''삼미 슈퍼스타즈…' 을(를) 지울까요?'
  StaticText, {{42.0, 281.0}, {180.0, 64.3}}, label: ''삼미 슈퍼스타즈…' 을(를) 지울까요?'
  Button,     {{28.0, 431.3}, {208.0, 48.0}}, label: '삭제'
```

시트 컨테이너가 y 259~495.3 인데 '삭제' 버튼이 431.3~479.3 에서 끝난다. 취소 버튼(48pt + 그룹 간격)이 들어갈 자리가 없다. 화면 폭은 375 인데 시트 폭은 240 이고 x 12 에서 시작해 중앙에도 있지 않다.

## 조건

앱 셸이 뷰 전체를 **고정 크기 프레임에 넣고 scaleEffect 로 줄일 때** 발생한다. 리딩타임은 시안 뷰포트(390×844)를 정본으로 삼아 이렇게 감싼다.

```swift
GeometryReader { geo in
    let scale = min(geo.size.width / 390, geo.size.height / 844)
    RTRootView(model: model)
        .frame(width: 390, height: 844)
        .scaleEffect(scale)
        .position(x: geo.size.width / 2, y: geo.size.height / 2)
}
```

하단에 붙는 액션시트는 이 프레임 안에서 배치되며 취소 버튼 자리를 잃는다.

## 해결

**중앙 배치인 `alert` 으로 바꾼다.** 같은 버튼 구성 그대로 옮기면 취소가 정상 렌더된다.

```swift
.alert("'\(title)' 을(를) 삭제할까요?", isPresented: $confirm) {
    Button("삭제", role: .destructive) { … }
    Button("취소", role: .cancel) {}
} message: { Text("…") }
```

## 헛다리 짚은 가설 (같은 길로 다시 가지 말 것)

**"같은 바인딩을 공유하는 대화상자가 카드마다 붙어서 겹친 것"** — 캐러셀이 `ForEach` 로 카드를 그리고 밀리 카드마다 `confirmationDialog` 가 하나씩 달려 있었다. 최상위로 올려 하나만 남겼으나 **증상은 그대로였다.** (그래도 대화상자를 리스트 항목마다 붙이지 않는 편이 맞아서 그 변경은 유지했다.)

## 판별법

기존 코드에도 같은 증상이 있는지 먼저 확인하면 "내 변경 탓"인지 "셸 구조 탓"인지 한 번에 갈린다. 리딩타임에서는 서재 ⋯ 메뉴의 책 삭제(기존 코드)가 똑같이 취소 없이 렌더돼 셸 문제로 확정됐다. XCUITest 한 줄이면 된다.

```swift
print("삭제=\(app.buttons["삭제"].exists) 취소=\(app.buttons["취소"].exists)")
```

## 관련

- 검증 테스트: `readingtime/ReadingTimeUITests/ConfirmDialogUITests.swift`(서재), `MillieCardDeleteUITests.swift`(홈 밀리 카드)
- 시뮬레이터는 클라우드 세션이 없어 앱이 로그인 화면으로 되돌린다. UI 테스트는 `--seq "login,…"` 런치 인자로 상태를 만든다.
