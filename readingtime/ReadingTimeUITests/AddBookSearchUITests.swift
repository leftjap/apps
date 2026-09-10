import XCTest

// 책 추가 시트(13) 검색 상태 — 실기기 보고 2026-09-10: "서성이다" 검색이 무반응이었다
// (프록시 상류 무응답을 try? 가 삼켜 로딩·에러 표시 없이 끝남 → "검색 자체가 안 됨" 으로 보임).
// 여기선 시뮬레이터에서 키보드 리턴(제출) → "검색 중…" → 시간 초과 안내 + 다시 시도 → 재시도 성공 →
// 결과 행("서성이다 / 장강명 · 현대문학")까지 실제 렌더를 확인한다.
// 검색 스텁 = 앱 --stub-search (flaky: 첫 호출 URLError.timedOut, 둘째 성공). 라이브 프록시는 마지막 케이스.
// 스크린샷: XCTAttachment + RT_SHOT_DIR(테스트 러너 환경변수, CI 가 TEST_RUNNER_RT_SHOT_DIR 로 전달)에 PNG.
final class AddBookSearchUITests: XCTestCase {

    override func setUp() {
        continueAfterFailure = false
    }

    // 시간 초과 → 안내 문구 + 다시 시도 → 성공 → 결과 행
    func testTimeoutThenRetryShowsResult() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,nav:12,sheet:addbook,query:서성이다", "--stub-search", "flaky"]
        app.launch()

        let field = app.textFields["addbook.search"]
        XCTAssertTrue(field.waitForExistence(timeout: 10), "책 추가 시트의 검색창이 없다\n\(app.debugDescription)")
        XCTAssertEqual(field.value as? String, "서성이다", "프리필된 검색어가 다르다: \(String(describing: field.value))")

        field.tap()
        field.typeText("\n")   // 키보드 리턴(검색) = onSubmit — 실기기에서 사용자가 누르는 그 키

        // ① 검색 중 표시 (스텁 1.2초 지연 동안)
        let count = app.staticTexts["addbook.count"]
        XCTAssertTrue(waitForLabel(count, "검색 중…", timeout: 5),
                      "리턴 뒤 '검색 중…' 이 안 뜸 (count exists=\(count.exists) label=\(count.exists ? count.label : "-"))\n\(app.debugDescription)")
        shot("01-searching")

        // ② 시간 초과 안내 + 다시 시도 버튼
        let error = app.staticTexts["addbook.error"]
        XCTAssertTrue(error.waitForExistence(timeout: 10), "실패 안내가 안 뜸\n\(app.debugDescription)")
        XCTAssertTrue(error.label.contains("응답하지 않아요"), "시간 초과 문구가 아님: \(error.label)")
        let retry = app.buttons["addbook.retry"]
        XCTAssertTrue(retry.exists, "다시 시도 버튼이 없다\n\(app.debugDescription)")
        XCTAssertFalse(count.exists && count.label == "검색 중…", "실패 뒤에도 '검색 중…' 이 남아 있다")
        shot("02-error")

        // ③ 다시 시도 → 검색 중 → 성공 → 결과 1건 + 행
        retry.tap()
        XCTAssertTrue(waitForLabel(count, "검색 중…", timeout: 5), "재시도 뒤 '검색 중…' 이 안 뜸")
        XCTAssertTrue(waitForLabel(count, "검색 결과 · 1건", timeout: 10),
                      "재시도 결과 카운트가 아님: \(count.exists ? count.label : "-")")
        XCTAssertTrue(app.staticTexts["서성이다"].waitForExistence(timeout: 5), "결과 행 '서성이다' 가 없다\n\(app.debugDescription)")
        let meta = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", "장강명", "현대문학")).firstMatch
        XCTAssertTrue(meta.exists, "결과 행 메타(장강명 · 현대문학)가 없다\n\(app.debugDescription)")
        XCTAssertFalse(error.exists, "성공 뒤에도 실패 안내가 남아 있다")
        shot("03-result")
    }

    // 0건 → "검색 결과 · 0건" + 안내 (이력 없음(공란)과 구분)
    func testEmptyResultShowsZeroCount() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,nav:12,sheet:addbook,query:없는책", "--stub-search", "empty"]
        app.launch()

        let field = app.textFields["addbook.search"]
        XCTAssertTrue(field.waitForExistence(timeout: 10), "검색창이 없다")
        field.tap()
        field.typeText("\n")

        let count = app.staticTexts["addbook.count"]
        XCTAssertTrue(waitForLabel(count, "검색 결과 · 0건", timeout: 10), "0건 카운트가 아님: \(count.exists ? count.label : "-")")
        XCTAssertTrue(app.staticTexts["addbook.empty"].exists, "0건 안내가 없다\n\(app.debugDescription)")
        XCTAssertFalse(app.staticTexts["addbook.error"].exists, "0건인데 실패 안내가 떴다")
        shot("04-empty")
    }

    // 라이브 프록시 — 결과든 실패 안내든 35초 안에 화면에 뜬다 (무반응 금지). 상류 상태에 따라 둘 중 하나.
    // 2026-09-10 상류 장애 중엔 20초 시간 초과 → "알라딘이 응답하지 않아요" 가 기대값.
    func testLiveProxyNeverStaysSilent() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,nav:12,sheet:addbook,query:서성이다"]
        app.launch()

        let field = app.textFields["addbook.search"]
        XCTAssertTrue(field.waitForExistence(timeout: 10), "검색창이 없다")
        field.tap()
        field.typeText("\n")

        let count = app.staticTexts["addbook.count"]
        XCTAssertTrue(waitForLabel(count, "검색 중…", timeout: 5), "라이브 검색: '검색 중…' 미표시")

        let error = app.staticTexts["addbook.error"]
        let result = app.staticTexts["서성이다"]
        let deadline = Date().addingTimeInterval(35)
        var outcome = "none"
        while Date() < deadline {
            if error.exists { outcome = "error: \(error.label)"; break }
            if result.exists { outcome = "result: \(count.exists ? count.label : "?")"; break }
            Thread.sleep(forTimeInterval: 0.5)
        }
        NSLog("RT-LIVE-OUTCOME %@", outcome)
        shot("05-live")
        XCTAssertNotEqual(outcome, "none", "라이브 검색이 35초 동안 무반응 (count=\(count.exists ? count.label : "-"))")
    }

    /// 접근성 라벨이 기대값이 될 때까지 폴링
    private func waitForLabel(_ element: XCUIElement, _ expected: String, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if element.exists, element.label == expected { return true }
            Thread.sleep(forTimeInterval: 0.25)
        }
        return element.exists && element.label == expected
    }

    /// 스크린샷 — 첨부 + RT_SHOT_DIR 이 있으면 PNG 파일로도 (CI 아티팩트 회수용)
    private func shot(_ name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let att = XCTAttachment(screenshot: screenshot)
        att.name = name
        att.lifetime = .keepAlways
        add(att)
        if let dir = ProcessInfo.processInfo.environment["RT_SHOT_DIR"] {
            try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
    }
}
