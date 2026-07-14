import XCTest

// 실기기 화면 캡처 전용 — **비파괴**. `--reset` 을 절대 주지 않는다(로그인 세션·실데이터 보존).
// 탭은 네비게이션(통계/탭전환/홈)만. 데이터를 바꾸는 조작(스와이프·삭제·키패드) 금지.
//
// 실행:
//   xcodebuild test -only-testing:GymUITests/GymCaptureUITests \
//     -destination 'id=<device-udid>' -resultBundlePath <out.xcresult>
//   xcrun xcresulttool export attachments --path <out.xcresult> --output-path <dir>
//
// ⚠ 기기가 잠겨 있으면 화면이 렌더되지 않아 빈 이미지가 나온다
//   (lessons/ios-simulator-e2e-traps.md §10). 회수 후 픽셀 분산으로 판정할 것.
final class GymCaptureUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    func testCaptureScreens() {
        let app = XCUIApplication()
        app.launchArguments = []   // 인자 없음 = 실사용 상태 그대로
        app.launch()

        XCTAssertTrue(app.staticTexts["Gym"].waitForExistence(timeout: 15), "홈이 떠야 한다")
        shot(app, "01-home")

        let stats = app.buttons["home-stats"]
        XCTAssertTrue(stats.waitForExistence(timeout: 5))
        stats.tap()
        XCTAssertTrue(app.staticTexts["통계"].waitForExistence(timeout: 5), "통계 화면이 떠야 한다")
        shot(app, "02-stats-cal")

        app.buttons["stats-tab-종목"].tap()
        shot(app, "03-stats-exercise")
        app.buttons["stats-tab-부위"].tap()
        shot(app, "04-stats-body")
        app.buttons["stats-tab-캘린더"].tap()

        app.buttons["stats-home"].tap()
        XCTAssertTrue(app.staticTexts["Gym"].waitForExistence(timeout: 5), "홈으로 복귀해야 한다")
        shot(app, "05-home-back")
    }

    // 동기화 카드 실측 — 관리>프로필의 "동기화 정상 / 로그인 필요". 비파괴(라우팅 인자만).
    // 2026-07-14: 클라우드가 07-10 에서 정체돼 실기기 로그인 상태를 눈으로 확인하려고 추가.
    func testCaptureSyncStatus() {
        let app = XCUIApplication()
        app.launchArguments = ["--route", "admin", "--tab", "profile"]
        app.launch()
        _ = app.staticTexts["관리"].waitForExistence(timeout: 15)
        shot(app, "10-admin-profile-sync")   // 잠금 등으로 못 떠도 일단 회수 (빈 이미지면 픽셀 분산으로 판정)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = "11-element-tree"; tree.lifetime = .keepAlways
        add(tree)
    }
}
