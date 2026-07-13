import XCTest

// 빈 홈(14) 아바타 탭 = 02와 동일 메뉴 (실기기 보고 2026-07-13: 설정 시트 직행이라
// 완독 직후(읽는 중 0권) 서재 진입 경로가 없음 — 다시 읽기·완독 그리드 도달 불가).
// nav:14 직행이라 시드 데이터 무관 — 단독 실행 가능.
final class EmptyHomeMenuUITests: XCTestCase {

    override func setUp() {
        continueAfterFailure = false
    }

    func testEmptyHomeAvatarOpensMenuWithLibrary() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,nav:14"]
        app.launch()

        let avatar = app.descendants(matching: .any)["home.avatar"]
        XCTAssertTrue(avatar.waitForExistence(timeout: 10), "빈 홈 아바타 없음")
        avatar.tap()

        // 02와 동일 메뉴: 서재·통계·프로필 수정 행
        let lib = app.staticTexts["서재"]
        XCTAssertTrue(lib.waitForExistence(timeout: 5),
                      "빈 홈 아바타 탭이 메뉴를 열지 않음 (설정 시트 직행 회귀)")
        XCTAssertTrue(app.staticTexts["프로필 수정"].exists, "메뉴에 프로필 수정 없음")

        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = "empty-home-menu"
        shot.lifetime = .keepAlways
        add(shot)

        lib.tap()
        // 서재 도달 — 필터 세그먼트의 "읽는 중" 존재로 판정
        XCTAssertTrue(app.staticTexts["읽는 중"].waitForExistence(timeout: 5), "서재 미진입")
    }
}
