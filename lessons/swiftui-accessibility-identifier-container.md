# SwiftUI 접근성 식별자 — 컨테이너에 주면 자식 식별자를 덮어쓴다

실측 2026-09-02 (readingtime 기록 원페이지 UI 테스트):

- `RTBottomSheet(...) .accessibilityIdentifier("stats.sheet")` 처럼 **컨테이너 뷰**에 식별자를 주면,
  그 안의 `Button(...).accessibilityIdentifier("stats.sheet.close")` 가 XCUITest 트리에
  `Button, identifier: 'stats.sheet', label: '닫기'` 로 노출된다 — 자식의 식별자가 부모 것으로 **덮인다**.
  `descendants(matching: .any)["stats.sheet.close"]` 는 영원히 못 찾는다.
- 같은 이유로 ZStack 에 준 `stats.mapFull` 이 안의 닫기·줌 버튼 식별자를 덮었다.
- 도형(`RoundedRectangle`)+`onTapGesture` 조합은 `.accessibilityElement()` 를 붙여도 컨테이너 식별자에 덮이는 건 같다.
  `Button { } label: { }.buttonStyle(.plain)` 으로 바꿔도 컨테이너 식별자가 남아 있으면 동일하게 실패한다.

**해법**: 존재 판정용 식별자는 컨테이너가 아니라 **말단 요소**(제목 `Text`, 닫기 `Button`)에 준다.
컨테이너에는 식별자를 주지 않는다. 미래 캘린더 칸처럼 `accessibilityHidden(true)` 로 숨긴 요소도
바깥에서 식별자를 덧붙이면 XCUITest 트리에 `StaticText` 로 다시 노출되므로, 숨긴 요소엔 식별자를 비운다.

진단법: 실패 로그의 `No matches found ... from input {(` 뒤에 그 시점 트리가 덤프된다 —
`awk` 로 그 블록만 뽑아 `identifier:` 를 보면 덮어쓰기가 바로 보인다.
