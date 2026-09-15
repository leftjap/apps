import XCTest

// 삭제 확인 대화상자 회귀 방지 (2026-09-15 실측).
// 이 앱은 RTRootView 를 390×844 고정 프레임에 scaleEffect 로 넣는다. 그 안에서 하단에 붙는
// 액션시트(confirmationDialog)는 취소 버튼 자리를 잃어 '삭제'만 렌더됐다 — 되돌릴 수 없는
// 동작인데 물러설 길이 없었다. 중앙 배치인 alert 으로 바꿔 해소. 홈 밀리 카드 삭제는
// MillieCardDeleteUITests 가 같은 기준으로 검증한다.
final class ConfirmDialogUITests: XCTestCase {
    /// 확인 대화상자에 '취소' 가 실제로 렌더되는지 — 되돌릴 수 없는 동작은 물러설 길이 있어야 한다
    private func assertHasCancel(_ app: XCUIApplication, confirmLabel: String, what: String) {
        XCTAssertTrue(app.buttons[confirmLabel].waitForExistence(timeout: 5),
                      "\(what) 확인 대화상자가 안 뜸\n\(app.debugDescription)")
        XCTAssertTrue(app.buttons["취소"].waitForExistence(timeout: 5),
                      "\(what) 확인에 취소가 없음\n\(app.debugDescription)")
    }

    // 세션 기록 삭제(06) — 저장 안 하고 사라지므로 되돌릴 수 없다
    func testSessionDeleteDialogHasCancel() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards,simFlip,endSession"]
        app.launch()
        let del = app.staticTexts["이 기록 삭제"]
        guard del.waitForExistence(timeout: 10) else {
            return XCTFail("완료(06) 화면의 '이 기록 삭제' 가 없음\n\(app.debugDescription)")
        }
        del.tap()
        assertHasCancel(app, confirmLabel: "삭제", what: "세션 기록 삭제")
    }

    // 로그아웃 — 실수로 눌리면 재로그인해야 한다
    func testLogoutDialogHasCancel() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards,sheet:settings"]
        app.launch()
        let out = app.staticTexts["로그아웃"]
        guard out.waitForExistence(timeout: 10) else {
            return XCTFail("설정 시트의 로그아웃이 없음\n\(app.debugDescription)")
        }
        out.tap()
        assertHasCancel(app, confirmLabel: "로그아웃", what: "로그아웃")
    }

    func testLibraryBookDeleteDialogHasCancel() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards,nav:12,sel:P1,sheet:bookmenu"]
        app.launch()
        let del = app.staticTexts["책 삭제"]
        guard del.waitForExistence(timeout: 10) else {
            print("=== PROBE: bookmenu 시트 진입 실패 ===\n\(app.debugDescription)\n=== END ===")
            return XCTFail("책 메뉴 시트가 안 뜸")
        }
        del.tap()
        _ = app.buttons["삭제"].waitForExistence(timeout: 5)
        XCTAssertTrue(app.buttons["삭제"].exists && app.buttons["취소"].exists,
                      "서재 책 삭제 확인에 삭제·취소가 둘 다 있어야 함\n\(app.debugDescription)")
    }
}
