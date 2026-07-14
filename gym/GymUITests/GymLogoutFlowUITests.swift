import XCTest

// 로그아웃 플로우 — 시뮬레이터 전용(--fake-signin). 관리>프로필 로그아웃 → 로그인 게이트 복귀.
// 2026-07-14: 게이트 추가 후 logout() 이 route 를 안 바꿔 관리화면에 잔류하던 결함 회귀 방지.
final class GymLogoutFlowUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testLogoutReturnsToLoginGate() {
        let app = XCUIApplication()
        app.launchArguments = ["--fake-signin", "--route", "admin", "--tab", "profile"]
        app.launch()

        // 로그인된 상태 = 프로필에 '로그아웃' 버튼
        let logout = app.buttons["profile-auth"]
        XCTAssertTrue(logout.waitForExistence(timeout: 15), "관리>프로필에 로그아웃 버튼이 있어야 한다")
        XCTAssertEqual(logout.label, "로그아웃", "로그인 상태 버튼 라벨은 '로그아웃'")

        logout.tap()

        // 로그아웃 → 로그인 게이트 (Google 버튼) 노출
        let google = app.buttons["login-google"]
        XCTAssertTrue(google.waitForExistence(timeout: 10), "로그아웃 후 로그인 게이트로 복귀해야 한다")
        // 관리 화면 타이틀은 사라져야
        XCTAssertFalse(app.staticTexts["관리"].exists, "로그아웃 후 관리화면에 잔류하면 안 된다")
    }
}
