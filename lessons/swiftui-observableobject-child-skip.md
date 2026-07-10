# SwiftUI: ObservableObject 를 평범한 `var` 로 넘긴 자식 뷰는 갱신을 건너뛴다 (readingtime, 2026-07-10 실측)

## 증상
`@Published` 값을 바꿨는데 화면이 안 바뀐다. 앱을 다시 켜면 반영돼 있다.

readingtime 아바타: 설정 시트에서 사진을 고르면 `RTAppModel.avatarImage` 가 갱신되고 파일까지
저장되는데, 홈 헤더(34pt)·시트 미리보기(28pt) 모두 계속 이니셜을 그렸다.

## 오진 두 번
1. "`PhotosPicker` 의 label 클로저가 재평가 안 된다" → label 을 밖으로 빼도 동일. **반증**.
2. "`Task {}` 가 메인 액터를 못 물려받아 백그라운드 발행" → 컴파일 경고 0, 계측 결과 `main=true`. **반증**.

## 실제 원인 (계측으로 확정)
`RTDbg.p` 로 찍으니 사실은 이랬다:
```
DBG rootView id=ObjectIdentifier(0x105d1d180)
DBG objectWillChange (avatar set=false)          ← willSet 시점, 정상 발행
DBG onAvatarChange: main=true set=true id=ObjectIdentifier(0x105d1d180)   ← 같은 인스턴스
```
모델·스레드·발행 모두 정상. 부모(`@ObservedObject` 보유)는 다시 그려진다.
문제는 **자식**: `var model: RTAppModel?` 처럼 클래스 참조를 평범한 저장 프로퍼티로 들면,
SwiftUI 가 뷰 값의 저장 프로퍼티를 비교해 "변한 게 없다"고 보고 `body` 재평가를 **건너뛴다**.
참조는 그대로고, 참조가 가리키는 내용만 바뀌었기 때문.

## 해법 (이 코드베이스의 기존 관용구)
자식 뷰 init 에서 **읽는 값을 저장 프로퍼티로 스냅샷**한다. 그러면 값이 바뀔 때 저장 프로퍼티가
달라져 SwiftUI 가 갱신을 인지한다. `Screen14EmptyHome` 이 이미 `stats` 를 이렇게 잡고 있었다.
```swift
private let avatar: CGImage?          // init 스냅샷
public init(model: RTAppModel? = nil) {
    self.model = model
    self.avatar = model?.avatarImage   // body 에선 model?.avatarImage 대신 avatar 사용
}
```
대안은 자식도 `@ObservedObject var model: RTAppModel` 로 받는 것. 단 rtshot 처럼
`model == nil` 정적 데모 렌더를 쓰는 구조면 옵셔널이라 불가.

## 왜 유닛·스냅샷 테스트로 못 잡나
`ImageRenderer` 는 매번 새로 렌더하므로 skip 최적화가 없다 → 픽셀 프로브는 통과한다.
파일을 미리 심고 앱을 새로 띄우는 시뮬 검증도 통과한다 (init 경로라 skip 무관).
**살아 있는 앱에서 값이 바뀌는 순간**을 보는 XCUITest 만 잡아낸다.
