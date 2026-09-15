import XCTest

// 삭제 확인 대화상자 회귀 방지 (2026-09-15 실측).
// 이 앱은 RTRootView 를 390×844 고정 프레임에 scaleEffect 로 넣는다. 그 안에서 하단에 붙는
// 액션시트(confirmationDialog)는 취소 버튼 자리를 잃어 '삭제'만 렌더됐다 — 되돌릴 수 없는
// 동작인데 물러설 길이 없었다. 중앙 배치인 alert 으로 바꿔 해소. 홈 밀리 카드 삭제는
// MillieCardDeleteUITests 가 같은 기준으로 검증한다.
final class ConfirmDialogUITests: XCTestCase {
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
