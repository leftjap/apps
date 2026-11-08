import XCTest

// 04 화면을 눌러 이어 읽은 뒤 폰을 들어도 그동안의 시간이 남아야 한다 (2026-11-08 검토: 엎기 엔진이 따로 둔 시계가
// 화면 탭 재개를 몰라, 들어 올릴 때 그 값으로 덮어써 탭 이후 시간이 지워졌다).
// 합성 모션(--sim-motion, 엔진 시작 기준 초:z): 1초 엎기 → 5초 들기 → (테스트가 화면 탭으로 재개) → 30초 엎기 → 32초 들기.
final class FlipTapResumeUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testScreenTapResumeKeepsTimeWhenLifted() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards,start", "--sim-motion", "1:0.95,5:0.2,30:0.95,32:0.2"]
        app.launch()

        let hint = app.staticTexts["탭하여 이어 읽기"]
        XCTAssertTrue(hint.waitForExistence(timeout: 15), "5초 들기 뒤 일시정지 화면이 안 뜸\n\(app.debugDescription)")
        hint.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).withOffset(CGVector(dx: 0, dy: -88)).tap()
        XCTAssertTrue(waitGone(hint, timeout: 5), "화면 탭으로 이어 읽기가 안 됨")

        XCTAssertTrue(hint.waitForExistence(timeout: 40), "32초 들기 뒤 일시정지가 안 됨")
        let timer = app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "^[0-9]+:[0-9]{2}:[0-9]{2}$")).firstMatch
        XCTAssertTrue(timer.exists, "일시정지 타이머가 없음\n\(app.debugDescription)")
        let p = timer.label.split(separator: ":").compactMap { Int($0) }
        let seconds = p[0] * 3600 + p[1] * 60 + p[2]
        // 탭(약 6~10초)부터 32초 들기까지 20초 넘게 읽었다. 종전엔 엎기 엔진 값(약 3초)으로 덮였다.
        XCTAssertGreaterThanOrEqual(seconds, 15, "들어 올릴 때 탭 이후 시간이 지워짐: \(timer.label)")
    }

    private func waitGone(_ e: XCUIElement, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline { if !e.exists { return true }; Thread.sleep(forTimeInterval: 0.2) }
        return !e.exists
    }
}
