import XCTest

// 키패드 모드 세그(시간↔거리, 무게↔횟수)를 누르면 입력하던 값이 사라지던 결함 (실기기 2026-09-26).
// 실데이터: 9/24 트레드밀 세트가 duration 1020·calories 98 만 있고 distance 키가 없었다.
// 사용자 흐름 그대로 — 거리 히어로 탭 → 거리 입력 → [시간] 세그 → 시간 입력 → 완료.
// 구현은 세그 전환 때 버퍼를 새 필드의 프리필로 덮어써, 앞 필드에 친 값이 저장되지 않았다.
final class GymKeypadModeSwitchUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    /// 카드 전체에 `cardio-card` 가 걸려 자식 식별자가 덮인다 — 히어로 숫자는 가장 큰 Text.
    private func cardioTexts(_ app: XCUIApplication) -> [XCUIElement] {
        app.staticTexts.allElementsBoundByIndex.filter { $0.identifier == "cardio-card" }
    }
    private func heroValue(_ app: XCUIApplication) -> (label: String, frame: CGRect) {
        var best = (label: "(none)", frame: CGRect.zero)
        for e in cardioTexts(app) where e.frame.height > best.frame.height { best = (e.label, e.frame) }
        return best
    }
    private func tapCenter(_ app: XCUIApplication, of f: CGRect) {
        let sz = app.windows.firstMatch.frame
        app.coordinate(withNormalizedOffset: CGVector(dx: f.midX / sz.width, dy: f.midY / sz.height)).tap()
    }
    private func keys(_ app: XCUIApplication, _ ks: [String]) {
        for k in ks { app.buttons["keypad-key-\(k)"].tap() }
    }
    private func openFresh(_ app: XCUIApplication, part: String, exercise: String) {
        XCTAssertTrue(app.staticTexts["NEW SESSION"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons[part].waitForExistence(timeout: 5))
        app.buttons[part].tap()
        XCTAssertTrue(app.buttons["addex-\(exercise)"].waitForExistence(timeout: 5))
        app.buttons["addex-\(exercise)"].tap()
        Thread.sleep(forTimeInterval: 0.8)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()   // 오버레이 시트 닫기
        Thread.sleep(forTimeInterval: 1.0)
    }

    func testCardioDistanceSurvivesSwitchToTime() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--empty-session"]
        app.launch()
        openFresh(app, part: "유산소", exercise: "treadmill")
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "cardio-card")
                        .firstMatch.waitForExistence(timeout: 5), "유산소 카드가 떠야")

        tapCenter(app, of: heroValue(app).frame)          // 진입 지표 = 거리
        XCTAssertTrue(app.buttons["keypad-done"].waitForExistence(timeout: 5), "거리 키패드가 열려야")
        keys(app, ["2", ".", "0"])
        XCTAssertEqual(app.staticTexts["keypad-value"].label, "2.0")
        app.buttons["시간"].tap()                          // 사용자가 누른 세그
        Thread.sleep(forTimeInterval: 0.3)
        keys(app, ["1", "7"])
        app.buttons["keypad-done"].tap()
        Thread.sleep(forTimeInterval: 0.8)

        let a = XCTAttachment(screenshot: app.screenshot()); a.name = "cardio-after-switch"
        a.lifetime = .keepAlways; add(a)
        XCTAssertEqual(heroValue(app).label, "2.0", "세그 전환 전에 친 거리가 기록돼야 한다")
        XCTAssertTrue(cardioTexts(app).contains { $0.label == "17" }, "시간 17분이 요약에 보여야 한다")
    }

    func testWeightSurvivesSwitchToReps() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--empty-session"]
        app.launch()
        openFresh(app, part: "가슴", exercise: "bench_press")
        let w = app.staticTexts["hero-weight"]
        XCTAssertTrue(w.waitForExistence(timeout: 5), "히어로가 떠야")

        tapCenter(app, of: w.frame)
        XCTAssertTrue(app.buttons["keypad-done"].waitForExistence(timeout: 5), "무게 키패드가 열려야")
        keys(app, ["4", "7"])
        app.buttons["횟수"].tap()
        Thread.sleep(forTimeInterval: 0.3)
        keys(app, ["9"])
        app.buttons["keypad-done"].tap()
        Thread.sleep(forTimeInterval: 0.8)

        XCTAssertEqual(app.staticTexts["hero-weight"].label, "47", "세그 전환 전에 친 무게가 기록돼야 한다")
        XCTAssertEqual(app.staticTexts["hero-reps"].label, "9")
    }
}
