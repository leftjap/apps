import XCTest

// 2026-11-08 검토 남은 항목 2차 — 06 이어 읽기, 07 책 고르기, 시트 끌어내려 닫기, 14 통계 버튼, 위치 없는 지도.
// demoCards: 작별하지 않는다(P1) 어제 52분 · 파친코(P2) 그제 74분 · 밀리 2권. 위치가 남은 기록은 없다.
final class ReviewFollowupUITests: XCTestCase {

    override func setUp() {
        continueAfterFailure = false
    }

    private func launch(_ seq: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", seq]
        app.launch()
        return app
    }

    private func el(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id]
    }

    private func waitGone(_ e: XCUIElement, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline { if !e.exists { return true }; Thread.sleep(forTimeInterval: 0.2) }
        return !e.exists
    }

    private func dismissLocationPrompt() {
        let deny = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["허용 안 함"]
        if deny.waitForExistence(timeout: 3) { deny.tap() }
    }

    func testDoneScreenSaysUnsavedAndCanResume() {
        let app = launch("login,demoCards,card:1,start,simFlip,endSession")
        XCTAssertTrue(app.staticTexts["이만큼 읽었어요"].waitForExistence(timeout: 15), "06 문구가 저장 전 표현이 아님")
        XCTAssertFalse(app.staticTexts["기록됐어요"].exists, "저장 전인데 '기록됐어요'")
        el(app, "done.resume").tap()
        XCTAssertTrue(app.staticTexts["일시정지됨"].waitForExistence(timeout: 5), "이어 읽기가 일시정지된 타이머로 돌아가지 않음")
        XCTAssertFalse(app.staticTexts["이만큼 읽었어요"].exists)
    }

    func testAddTimeCanChooseAnotherBook() {
        let app = launch("login,demoCards,sel:P1,nav:08")
        XCTAssertTrue(app.staticTexts["직접 추가"].waitForExistence(timeout: 15))
        app.staticTexts["직접 추가"].tap()
        dismissLocationPrompt()
        let book = el(app, "addtime.book")
        XCTAssertTrue(book.waitForExistence(timeout: 5))
        book.tap()
        let other = el(app, "addtime.bookOption.P2")
        XCTAssertTrue(other.waitForExistence(timeout: 5), "책 행을 눌러도 고를 책 목록이 안 열림")
        other.tap()
        XCTAssertTrue(book.label.contains("파친코"), "고른 책이 책 행에 반영되지 않음: \(book.label)")
        el(app, "addtime.cta").tap()
        XCTAssertTrue(waitGone(book, timeout: 5))
        // 상세(작별하지 않는다)엔 새 기록이 붙지 않는다 — 기록은 파친코로 갔다
        XCTAssertTrue(el(app, "detail.record.0").waitForExistence(timeout: 5))
        XCTAssertFalse(el(app, "detail.record.1").exists, "고른 책이 아니라 상세의 책에 기록됨")
    }

    func testSheetClosesByDraggingHandleDown() {
        let app = launch("login,demoCards,sheet:settings")
        let handle = el(app, "sheet.handle")
        XCTAssertTrue(handle.waitForExistence(timeout: 15))
        let start = handle.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: 260)))
        XCTAssertTrue(waitGone(app.staticTexts["밀리의서재"], timeout: 5), "손잡이를 끌어내려도 시트가 안 닫힘")
    }

    func testAddBookSheetClosesByDraggingHandleDown() {
        let app = launch("login,demoCards,sheet:addbook")
        let handle = el(app, "sheet.handle")
        XCTAssertTrue(handle.waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["책 추가"].exists)
        let start = handle.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: 260)))
        XCTAssertTrue(waitGone(app.staticTexts["책 추가"], timeout: 5), "책 추가 시트가 끌어내려도 안 닫힘")
    }

    func testEmptyHomeWithRecordsShowsStatsButton() {
        let app = launch("login,demoReread:allFinished")
        XCTAssertTrue(app.staticTexts["다음 책 추가하기"].waitForExistence(timeout: 15))
        let stats = el(app, "emptyHome.statsButton")
        XCTAssertTrue(stats.exists, "기록이 있는데 빈 홈에 통계로 가는 길이 없음")
        stats.tap()
        XCTAssertTrue(el(app, "stats.mapCard").waitForExistence(timeout: 5), "통계 화면으로 가지 않음")
    }

    func testMapWithoutLocationsExplainsWhy() {
        let app = launch("login,demoCards,nav:10")
        let card = el(app, "stats.mapCard")
        XCTAssertTrue(card.waitForExistence(timeout: 15))
        XCTAssertTrue(card.label.contains("남은 곳이 없어요"), "위치 기록이 없는 지도에 안내가 없음: \(card.label)")
    }

    // MillieLibraryUITests 불안정 원인 재현 — 완독 편입 뒤 책 검색(실서버, 속도 제각각)이 ISBN 을 바꾸는 시점이
    // 상세를 연 뒤면, 상세가 옛 키를 들고 있어 읽는 중 종이책으로 넘어갔다. 스텁으로 응답을 늦춰 항상 그 순서로 만든다.
    func testMillieDetailStaysAfterLateISBNUpgrade() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards", "--stub-search", "millieSlow"]
        app.launch()
        let finish = app.buttons.matching(NSPredicate(format: "label == %@", "다 읽었어요")).firstMatch
        XCTAssertTrue(finish.waitForExistence(timeout: 15))
        let finishedAt = Date()
        finish.tap()
        el(app, "home.avatar").tap()
        app.staticTexts["서재"].tap()
        let adopted = app.descendants(matching: .any)["library.grid.millie:4c17703240404997"].firstMatch
        XCTAssertTrue(adopted.waitForExistence(timeout: 5), "편입된 밀리 책이 서재에 없음 (검색 응답 전이어야 한다)")
        adopted.tap()
        XCTAssertTrue(el(app, "detail.screen").waitForExistence(timeout: 5))
        // 스텁 응답(4.5초) 뒤까지 기다린다
        let wait = max(0, 6.5 - Date().timeIntervalSince(finishedAt))
        Thread.sleep(forTimeInterval: wait)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "자동 기록")).firstMatch.exists,
                      "ISBN 승격 뒤 상세가 다른 책으로 바뀜")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "삼미 슈퍼스타즈")).firstMatch.exists)
    }
}
