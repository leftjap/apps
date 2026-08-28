import XCTest

// 요약 영수증 칼로리 표기 — 숫자 22pt 로 확대 (사용자 2026-08-28 "더 키우고").
// 종전 10.5pt 는 영수증에서 사실상 안 읽혔다. 키운 뒤 **한 줄로 들어가는지**(줄바꿈·잘림 없음)를
// 실기기 폭(375pt)에서 못박는다.
final class GymSummaryKcalUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testKcalLineIsEnlargedAndFitsOneLine() {
        let app = XCUIApplication()
        app.launchArguments = ["--route", "session", "--reset"]
        app.launch()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 10))
        app.staticTexts["session-end"].tap()
        let finish = app.buttons["action-finish"]
        XCTAssertTrue(finish.waitForExistence(timeout: 5))
        finish.tap()
        XCTAssertTrue(app.staticTexts["TOTAL"].waitForExistence(timeout: 5))

        let kcal = app.staticTexts["summary-kcal"]
        XCTAssertTrue(kcal.waitForExistence(timeout: 5), "칼로리 줄이 있어야")
        let f = kcal.frame, win = app.windows.firstMatch.frame
        print("KCAL label=\(kcal.label) frame=\(f) window=\(win)")

        // 22pt 한 줄 — 종전 10.5pt 한 줄(약 13pt)보다 확실히 높고, 두 줄(약 60pt)보다는 낮다
        XCTAssertGreaterThan(f.height, 20, "확대 반영 (실측 \(f.height))")
        XCTAssertLessThan(f.height, 45, "한 줄 유지 — 줄바꿈되면 안 됨 (실측 \(f.height))")
        XCTAssertGreaterThanOrEqual(f.minX, 0, "좌측 잘림 없음")
        XCTAssertLessThanOrEqual(f.maxX, win.width, "우측 잘림 없음")

        let a = XCTAttachment(screenshot: app.screenshot()); a.name = "summary-375"
        a.lifetime = .keepAlways; add(a)
    }
}
