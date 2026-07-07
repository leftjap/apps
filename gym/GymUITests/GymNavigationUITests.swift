import XCTest

// 홈 → 세션 라우팅 실탭 검증 (시뮬레이터 XCUITest). CTA 버튼 action 배선의 런타임 정본.
final class GymNavigationUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testCTANavigatesToSession() {
        let app = XCUIApplication()
        app.launch()

        // 홈 화면 확인
        XCTAssertTrue(app.staticTexts["부위 밸런스"].waitForExistence(timeout: 10),
                      "홈 화면(부위 밸런스)이 떠야 한다")
        XCTAssertFalse(app.staticTexts["직전 세션 기록"].exists,
                       "세션 전환 전엔 직전 세션 기록이 없어야 한다")

        // 운동 시작 CTA 실제 탭
        let cta = app.buttons["home-cta"]
        XCTAssertTrue(cta.waitForExistence(timeout: 5), "운동 시작 버튼이 있어야 한다")
        cta.tap()

        // 세션 화면 전환 확인 (직전 세션 기록 + 종료)
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 5),
                      "CTA 탭 후 세션 화면(직전 세션 기록)이 떠야 한다")
        XCTAssertTrue(app.staticTexts["종료"].exists, "세션 툴바 종료가 있어야 한다")
    }

    // 홈 → 통계 → 탭 전환(종목) → 홈 복귀
    func testStatsNavigationAndTabs() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["부위 밸런스"].waitForExistence(timeout: 10))
        app.buttons["home-stats"].tap()
        // 통계 캘린더 탭
        XCTAssertTrue(app.staticTexts["이번 주 볼륨"].waitForExistence(timeout: 5), "통계 캘린더가 떠야 한다")
        // 종목 탭 전환
        app.buttons["stats-tab-종목"].tap()
        XCTAssertTrue(app.staticTexts["자주 한 운동 · 최근 60일"].waitForExistence(timeout: 5), "종목 탭 내용이 떠야 한다")
        // 부위 탭 전환
        app.buttons["stats-tab-부위"].tap()
        XCTAssertTrue(app.staticTexts["최근 60일 부위 분포"].waitForExistence(timeout: 5), "부위 탭 내용이 떠야 한다")
        // 홈 복귀
        app.buttons["stats-home"].tap()
        XCTAssertTrue(app.staticTexts["부위 밸런스"].waitForExistence(timeout: 5), "홈으로 돌아와야 한다")
    }

    // 세션 → 홈 (툴바 홈 버튼) 역방향 검증
    func testHomeButtonReturnsHome() {
        let app = XCUIApplication()
        app.launchArguments = ["--route", "session"]
        app.launch()

        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 10),
                      "세션 화면으로 시작해야 한다")
        // 툴바 홈 버튼 탭
        let homeBtn = app.buttons["session-home"]
        XCTAssertTrue(homeBtn.waitForExistence(timeout: 5), "세션 툴바 홈 버튼이 있어야 한다")
        homeBtn.tap()
        XCTAssertTrue(app.staticTexts["부위 밸런스"].waitForExistence(timeout: 5),
                      "홈 버튼 탭 후 홈(부위 밸런스)으로 돌아와야 한다")
    }
}
