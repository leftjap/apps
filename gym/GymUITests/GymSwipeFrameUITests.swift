import XCTest

// 세트 완료(좌스와이프) 전/중/후 프레임 캡처 — 시안 #7b 시퀀스 대조용.
// 시뮬레이터 전용(--reset 사용). 실기기에서 돌리지 말 것.
final class GymSwipeFrameUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name; a.lifetime = .keepAlways
        add(a)
    }

    func testCaptureSetCompleteSequence() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--route", "session"]
        app.launch()

        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 15))
        shot(app, "10-before")   // 완료 전: 현재 세트 = crail 막대 + crail-deep 숫자

        // 좌스와이프 = 세트 완료. 스와이프 직후 연속 캡처로 스왑/큐 프레임 확보.
        let area = app.otherElements["cardSwipeArea"].exists
            ? app.otherElements["cardSwipeArea"] : app.staticTexts["hero-weight"]
        let start = area.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: 0.5))
        let end = area.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.5))
        start.press(forDuration: 0.02, thenDragTo: end)

        shot(app, "20-during-a")
        shot(app, "21-during-b")
        shot(app, "22-during-c")
        Thread.sleep(forTimeInterval: 1.2)
        shot(app, "30-after")    // 완료 후: 직전 막대 = ink, 다음 막대 = crail
    }
}
