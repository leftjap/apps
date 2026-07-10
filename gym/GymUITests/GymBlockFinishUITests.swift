import XCTest

// 꾹누르기 액션시트 항목 + 종목 완료 후 레일 상태 (사용자 실기기 보고 2026-07-10).
// 시뮬레이터 전용(--reset).
final class GymBlockFinishUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name; a.lifetime = .keepAlways
        add(a)
    }
    private func chip(_ app: XCUIApplication, _ state: String, _ name: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: "rail-\(state)-\(name)").firstMatch
    }

    // 액션시트에 '이동' 이 없어야 한다 (session.js:1952 — hold+drag 로 대체됨).
    func testActionSheetHasNoMoveItem() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--route", "session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 15))

        chip(app, "current", "벤치프레스").press(forDuration: 0.8)
        XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5), "현재 종목 → 완료")
        XCTAssertTrue(app.buttons["action-delete"].exists, "현재 종목 → 삭제")
        XCTAssertFalse(app.buttons["action-move"].exists, "이동 항목은 없어야 한다")
        shot(app, "10-sheet-no-move")
        app.buttons["action-cancel"].tap()
    }

    // 마지막 종목까지 완료하면 레일에 current 흰 카드가 남지 않고 전부 체크 칩이어야 한다.
    func testFinishingEveryBlockLeavesNoCurrentChip() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--route", "session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 15))

        // 데모 세션: 인클라인(완료) · 벤치프레스(현재) · 덤벨 플라이 · 케이블 크로스오버
        for name in ["벤치프레스", "덤벨 플라이", "케이블 크로스오버"] {
            let cur = chip(app, "current", name)
            XCTAssertTrue(cur.waitForExistence(timeout: 5), "\(name) 가 현재 종목이어야 한다")
            cur.press(forDuration: 0.8)
            XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5))
            app.buttons["action-finish"].tap()
            XCTAssertTrue(chip(app, "done", name).waitForExistence(timeout: 5),
                          "완료한 \(name) 는 레일에서 done 칩이어야 한다")
        }

        // 전부 완료 → 히어로 read-only, 레일에 current 없음
        XCTAssertTrue(app.staticTexts["hero-done"].waitForExistence(timeout: 5), "히어로는 ✓ read-only")
        for name in ["인클라인 벤치", "벤치프레스", "덤벨 플라이", "케이블 크로스오버"] {
            XCTAssertFalse(chip(app, "current", name).exists, "\(name) 가 current 로 남으면 안 된다")
        }
        shot(app, "20-all-done")
    }
}
