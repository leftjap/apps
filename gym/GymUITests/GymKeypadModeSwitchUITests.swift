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

    /// 거리 라벨 — 입력값이면 "거리", 직전 기록 고스트면 "거리 · 직전 기록".
    private func distanceLabel(_ app: XCUIApplication) -> String {
        cardioTexts(app).first { $0.label.hasPrefix("거리") && $0.frame.height < 40 }?.label ?? "(none)"
    }

    // 키패드에 직전 기록(2.0)이 미리 채워진 채 손대지 않고 [시간]으로 넘어간 경우.
    // 완료·바깥 탭은 화면에 보이는 값을 저장하는데 세그 전환만 저장하지 않으면, 직전과 같은 거리를
    // 뛴 날 "2.0 이 떠 있으니 됐다" 하고 넘어가면 거리가 사라진다.
    func testCardioPrefilledDistanceSurvivesSwitchToTime() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--empty-session"]
        app.launch()
        openFresh(app, part: "유산소", exercise: "treadmill")
        tapCenter(app, of: heroValue(app).frame)
        XCTAssertTrue(app.buttons["keypad-done"].waitForExistence(timeout: 5))
        keys(app, ["2", ".", "0"])
        app.buttons["keypad-done"].tap()
        Thread.sleep(forTimeInterval: 0.6)
        app.staticTexts["session-end"].tap()
        XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5))
        app.buttons["action-finish"].tap()
        XCTAssertTrue(app.staticTexts["TOTAL"].waitForExistence(timeout: 5))
        app.buttons["summary-home"].firstMatch.tap()
        XCTAssertTrue(app.buttons["home-cta"].waitForExistence(timeout: 8))

        app.terminate()
        app.launchArguments = ["--fake-signin", "--empty-session"]   // 이력 보존
        app.launch()
        openFresh(app, part: "유산소", exercise: "treadmill")
        XCTAssertEqual(distanceLabel(app), "거리 · 직전 기록", "오늘 미입력 — 직전 기록 고스트")

        tapCenter(app, of: heroValue(app).frame)
        XCTAssertTrue(app.buttons["keypad-done"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["keypad-value"].label, "2", "직전 거리가 미리 채워진다")
        app.buttons["시간"].tap()
        Thread.sleep(forTimeInterval: 0.3)
        keys(app, ["1", "7"])
        app.buttons["keypad-done"].tap()
        Thread.sleep(forTimeInterval: 0.8)

        let a = XCTAttachment(screenshot: app.screenshot()); a.name = "cardio-prefill-switch"
        a.lifetime = .keepAlways; add(a)
        XCTAssertEqual(distanceLabel(app), "거리", "화면에 보이던 거리가 오늘 기록으로 저장돼야 한다")
        XCTAssertEqual(heroValue(app).label, "2.0")
        XCTAssertTrue(cardioTexts(app).contains { $0.label == "17" }, "시간 17분")
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
