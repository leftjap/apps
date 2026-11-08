import XCTest

// 기록 중에 앱이 종료됐다가 다시 열리면, 꺼져 있던 시간을 기록에 넣을지 묻는다 (2026-11-08 검토:
// 종전엔 마지막 틱까지만 남기고 그 뒤 시간은 말없이 빠졌다). 시드 restoreRecording:<초> = 그 초만큼 꺼져 있던 세션 복원.
final class RestoredGapUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testRestoredRecordingAsksToIncludeGap() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards,restoreRecording:540"]
        app.launch()

        let include = app.buttons["9분 넣기"]
        XCTAssertTrue(include.waitForExistence(timeout: 10), "꺼져 있던 9분을 넣을지 묻지 않음\n\(app.debugDescription)")
        XCTAssertTrue(app.buttons["넣지 않기"].exists, "넣지 않기 버튼이 없음")
        include.tap()
        XCTAssertFalse(app.buttons["9분 넣기"].waitForExistence(timeout: 2), "넣기 뒤에도 질문이 남아 있다")
    }
}
