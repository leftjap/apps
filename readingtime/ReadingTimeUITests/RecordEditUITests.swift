import XCTest

// 2026-11-08 검토 후속 — 07 시간 직접 추가가 시안 책(몰입)·고정 일시(오늘 · 14:14)를 보이던 문제,
// 저장된 기록을 고치거나 지울 수 없던 문제, 서버 업로드 실패가 화면에 안 보이던 문제.
// demoCards: 작별하지 않는다(P1) 어제 12:00 엎기 52분 · 파친코(P2) 그제 12:00 엎기 74분.
final class RecordEditUITests: XCTestCase {

    override func setUp() {
        continueAfterFailure = false
    }

    private func launchDetail() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards,sel:P1,nav:08"]
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["detail.screen"].waitForExistence(timeout: 15))
        return app
    }

    /// 시트를 열면 위치를 잡는다 — 시뮬레이터 권한 미정이면 대화상자가 화면을 가린다
    private func dismissLocationPrompt() {
        let deny = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["허용 안 함"]
        if deny.waitForExistence(timeout: 3) { deny.tap() }
    }

    private func el(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id]
    }

    private func waitGone(_ e: XCUIElement, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline { if !e.exists { return true }; Thread.sleep(forTimeInterval: 0.2) }
        return !e.exists
    }

    func testAddTimeShowsRealBookAndSavesPickedDay() {
        let app = launchDetail()
        app.staticTexts["직접 추가"].tap()
        dismissLocationPrompt()

        let book = el(app, "addtime.book")
        XCTAssertTrue(book.waitForExistence(timeout: 10))
        XCTAssertTrue(book.label.contains("작별하지 않는다"), "책 행이 상세의 책이 아님: \(book.label)")
        XCTAssertFalse(book.label.contains("몰입"), "시안 책이 남아 있음")
        XCTAssertTrue(el(app, "addtime.cta").label.contains("30분 추가하기"), "기본값이 시안 데모(35분)")
        let when = el(app, "addtime.when")
        XCTAssertTrue(when.label.contains("오늘 · "), "일시 기본값이 지금이 아님: \(when.label)")

        when.tap()
        let picker = app.datePickers["addtime.picker"]
        XCTAssertTrue(picker.waitForExistence(timeout: 5), "일시 행을 눌러도 피커가 안 열림")
        // 날짜 휠을 위로 끌어 하루 이상 앞으로 (지난 날짜만 고를 수 있다)
        let dayWheel = picker.pickerWheels.element(boundBy: 0)
        dayWheel.swipeDown()
        Thread.sleep(forTimeInterval: 1.0)
        XCTAssertFalse(when.label.contains("오늘 · "), "피커로 고른 날짜가 일시 행에 반영되지 않음: \(when.label)")
        let picked = when.label

        el(app, "addtime.cta").tap()
        XCTAssertTrue(waitGone(book, timeout: 5), "추가하기 후 시트가 닫히지 않음")
        // 상세 목록에 '직접 추가' 30분이 오늘이 아닌 날짜로 들어간다
        let rows = (0..<3).map { el(app, "detail.record.\($0)") }
        XCTAssertTrue(rows[0].waitForExistence(timeout: 5))
        let manual = rows.first { $0.exists && $0.label.contains("30분") && $0.label.contains("직접 추가") }
        XCTAssertNotNil(manual, "새 기록이 상세 목록에 없음 (\(rows.filter(\.exists).map(\.label)))")
        XCTAssertFalse(manual?.label.contains("오늘") ?? true, "고른 날짜(\(picked))가 아니라 오늘로 저장됨")
    }

    func testEditThenDeleteRecord() {
        let app = launchDetail()
        let row = el(app, "detail.record.0")
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        XCTAssertTrue(row.label.contains("52분"), "demoCards 의 어제 기록이 아님: \(row.label)")

        row.tap()
        dismissLocationPrompt()
        let cta = el(app, "addtime.cta")
        XCTAssertTrue(cta.waitForExistence(timeout: 10), "기록 행을 눌러도 고치기 시트가 안 열림")
        XCTAssertTrue(app.staticTexts["기록 고치기"].exists)
        XCTAssertTrue(cta.label.contains("52분으로 고치기"), cta.label)
        XCTAssertTrue(el(app, "addtime.when").label.contains("어제 · 12:00"), el(app, "addtime.when").label)

        el(app, "addtime.plus").tap()
        XCTAssertTrue(cta.label.contains("57분으로 고치기"), cta.label)
        cta.tap()
        XCTAssertTrue(waitGone(cta, timeout: 5))
        XCTAssertTrue(row.label.contains("57분"), "고친 분이 목록에 반영되지 않음: \(row.label)")
        XCTAssertTrue(row.label.contains("엎기"), "방식이 바뀌면 안 됨: \(row.label)")

        row.tap()
        let delete = el(app, "addtime.delete")
        XCTAssertTrue(delete.waitForExistence(timeout: 5))
        delete.tap()
        let alert = app.alerts["이 기록을 삭제할까요?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        XCTAssertTrue(alert.buttons["취소"].exists, "되돌릴 수 없는 동작에 취소가 없음")
        alert.buttons["삭제"].tap()
        XCTAssertTrue(waitGone(cta, timeout: 5))
        XCTAssertTrue(waitGone(row, timeout: 5), "삭제한 기록이 목록에 남아 있음")
    }

    func testSettingsShowsSyncFailureOnlyWhenFailing() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards,syncFailed,sheet:settings"]
        app.launch()
        let row = el(app, "settings.syncRow")
        XCTAssertTrue(row.waitForExistence(timeout: 15), "업로드 실패 중인데 설정에 표시가 없음")
        XCTAssertTrue(row.label.contains("부터 실패"), row.label)

        app.terminate()
        app.launchArguments = ["--seq", "login,demoCards,sheet:settings"]
        app.launch()
        XCTAssertTrue(app.staticTexts["밀리의서재"].waitForExistence(timeout: 15))
        XCTAssertFalse(el(app, "settings.syncRow").exists, "정상일 때는 동기화 행이 없어야 한다")
    }
}
