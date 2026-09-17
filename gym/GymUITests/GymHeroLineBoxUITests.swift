import XCTest

// 히어로 큰 숫자의 줄 상자 (2026-09-17 — 히스토리 카드 세로 예산).
//
// SwiftUI `Text` 의 자연 줄높이는 mono 122 에서 156.0pt 인데 시안은 `line-height: 0.8` = 97.6pt 다.
// `SessionHero.bigLineInset`(29.2) 이 그 차이를 음수 세로 패딩으로 걷어낸다. 폰트나 패딩이 바뀌면
// 세션 화면이 다시 세이프에어리어를 넘기므로 상수를 눈으로 맞추지 않도록 여기서 고정한다.
//
// 두 값을 함께 본다:
//  · `hero-weight` 의 접근성 프레임 = Text 자신의 자연 줄 상자(156.0). 음수 패딩은 여기 안 나타난다.
//    폰트 크기·굵기가 바뀌면 이 값이 움직인다.
//  · `zone-*` 의 프레임 = `big()` 행 전체(= 줄인 줄 상자 97.6 + 패딩 6 + 단위 줄 상자). 121.3pt.
//    음수 패딩이 실제로 레이아웃을 줄였는지는 이쪽이 증거다.
final class GymHeroLineBoxUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private let naturalLineBox: CGFloat = 156.0    // mono 122 자연 줄높이
    private let trimmedRowHeight: CGFloat = 121.3  // 97.6(시안 0.8) + 6 + 단위 17.7

    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--route", "session", "--reset"]
        app.launch()
        XCTAssertTrue(app.staticTexts["hero-weight"].waitForExistence(timeout: 10))
        return app
    }

    private func setWeight(_ app: XCUIApplication, _ digits: String) {
        app.otherElements["zone-center"].firstMatch.tap()      // 중앙 존 → 키패드 (§6-3)
        XCTAssertTrue(app.staticTexts["keypad-value"].waitForExistence(timeout: 5), "키패드가 안 떴다")
        for d in digits { app.buttons["keypad-key-\(d)"].tap() }
        app.buttons["keypad-done"].tap()
    }

    private func check(_ app: XCUIApplication, _ what: String) {
        XCTAssertEqual(app.staticTexts["hero-weight"].frame.height, naturalLineBox,
                       accuracy: 0.6, "\(what) — 자연 줄 상자")
        XCTAssertEqual(app.otherElements["zone-plus"].firstMatch.frame.height, trimmedRowHeight,
                       accuracy: 1.0, "\(what) — 줄인 행 높이")
    }

    // 한 자리·두 자리·세 자리 모두 같은 줄 상자다. 자릿수는 폭만 바꾼다 —
    // 음수 패딩은 세로에만 걸리므로 높이가 따라 움직이면 안 된다.
    func testLineBoxIsSameAtEveryDigitCount() {
        let app = launch()
        XCTAssertEqual(app.staticTexts["hero-weight"].label, "70")
        check(app, "두 자리")
        setWeight(app, "5")
        XCTAssertEqual(app.staticTexts["hero-weight"].label, "5")
        check(app, "한 자리")
        setWeight(app, "100")
        XCTAssertEqual(app.staticTexts["hero-weight"].label, "100")
        check(app, "세 자리")
    }

    // 줄 상자를 줄여도 ± 존은 그대로 먹는다 (§6-3 히트 영역).
    // 행 높이가 180 에서 121.3 으로 줄지만 최소 탭 크기 44pt 의 2.7배가 남는다.
    func testTapZonesStillWorkAfterTrim() {
        let app = launch()
        let hero = app.staticTexts["hero-weight"]
        app.otherElements["zone-plus"].firstMatch.tap()
        expectation(for: NSPredicate(format: "label == %@", "75"), evaluatedWith: hero)
        waitForExpectations(timeout: 5)
        app.otherElements["zone-minus"].firstMatch.tap()
        expectation(for: NSPredicate(format: "label == %@", "70"), evaluatedWith: hero)
        waitForExpectations(timeout: 5)
        XCTAssertGreaterThan(app.otherElements["zone-plus"].firstMatch.frame.height, 44,
                             "± 존 세로가 최소 탭 크기보다 작아졌다")
    }
}
