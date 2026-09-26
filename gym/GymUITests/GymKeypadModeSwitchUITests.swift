import XCTest

// 키패드 모드 세그(무게↔횟수)를 누르면 입력하던 값이 사라지던 결함 (실기기 2026-09-26).
// 트레드밀(시간↔거리)에서 먼저 드러났다 — 9/24 세트가 duration·calories 만 있고 distance 가 없었다.
// 트레드밀은 이후 거리만 받게 바뀌어 세그가 없어졌고(사용자 2026-09-26), 근력 세그만 남는다.
// 구현은 세그 전환 때 버퍼를 새 필드의 프리필로 덮어써, 앞 필드에 친 값이 저장되지 않았다.
final class GymKeypadModeSwitchUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

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
