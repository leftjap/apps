import XCTest

// 탭 모드(05) 시안 J — 링·버튼 탭은 바로 일시정지↔재개하고, 빠르게 두 번 탭해도 종료(06)하지 않는다(AC 3·11).
// 유닛이 못 덮는 제스처 배선 검증. --seq 로 상태를 주입해 시뮬레이터 잔존 데이터와 무관하게 돈다.
final class TapModeUITests: XCTestCase {

    override func setUp() {
        continueAfterFailure = false
    }

    private func launchTapMode() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,mode:tap,start"]
        app.launch()
        return app
    }

    private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    /// 요소 사각형의 가운데. 링 요소(282×282)의 가운데는 타이머 텍스트 요소가 덮고 있어서 기본 tap() 은
    /// 가려지지 않은 모서리 쪽을 누를 수 있다 — 그 자리는 원형 탭 영역 밖이라 아무 일도 일어나지 않는다.
    private func center(_ e: XCUIElement) -> XCUICoordinate {
        e.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    }

    func testRingAndButtonToggle() {
        let app = launchTapMode()
        let ring = element(app, "tap.ring")
        let toggle = element(app, "tap.toggle")
        XCTAssertTrue(ring.waitForExistence(timeout: 10), "05 링 없음")
        XCTAssertEqual(ring.label, "일시정지")

        center(ring).tap()
        XCTAssertTrue(app.staticTexts["일시정지됨"].waitForExistence(timeout: 2), "링 탭으로 일시정지되지 않음")
        XCTAssertEqual(ring.label, "이어 읽기")
        XCTAssertEqual(toggle.label, "이어 읽기")

        center(toggle).tap()
        XCTAssertTrue(app.staticTexts["기록 중"].waitForExistence(timeout: 2), "버튼 탭으로 재개되지 않음")
        XCTAssertEqual(toggle.label, "일시정지")
    }

    func testDoubleTapDoesNotEndSession() {
        let app = launchTapMode()
        let ring = element(app, "tap.ring")
        XCTAssertTrue(ring.waitForExistence(timeout: 10), "05 링 없음")

        center(ring).doubleTap()
        sleep(1)
        XCTAssertFalse(app.staticTexts["기록됐어요"].exists, "더블탭으로 06 에 감")
        XCTAssertTrue(ring.exists)
        XCTAssertEqual(ring.label, "일시정지")   // 두 번 토글 → 다시 기록 중

        // 두 탭이 모두 들어갔는지 — 빗나갔어도 위 단언은 통과하므로 06 원장의 일시정지 횟수로 가린다
        element(app, "tap.end").tap()
        XCTAssertTrue(app.staticTexts["기록됐어요"].waitForExistence(timeout: 5), "06 미진입")
        XCTAssertTrue(app.staticTexts["1회 · 0분"].exists, "더블탭이 두 번 토글되지 않음(일시정지 1회여야 함)")
    }
}
