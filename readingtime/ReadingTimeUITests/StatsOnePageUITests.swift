import XCTest

// 기록 원페이지 — 시뮬레이터 런타임 배선 검증 (README AC 1·2·4·7).
// 수치·색·레이아웃은 rtshot 픽셀 오라클(scripts/record-verify.sh)이 덮는다. 여기선 제스처→상태만.
// demoCards 시드(어제·그제 종이 세션 + 밀리)로 시뮬레이터 잔존 데이터에 의존하지 않는다.
final class StatsOnePageUITests: XCTestCase {

    override func setUp() { continueAfterFailure = false }

    private func launchStats() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards,nav:10"]
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["stats.summary"].waitForExistence(timeout: 15),
                      "기록 원페이지 서머리가 없음")
        return app
    }

    // AC 1 — 세그먼트 없음, 단일 스크롤에 지도 카드까지 도달
    func testSinglePageHasNoSegmentsAndReachesMapCard() {
        let app = launchStats()
        XCTAssertFalse(app.staticTexts["지도"].exists, "구 세그먼트([주|월|지도])가 남아 있음")
        let card = app.descendants(matching: .any)["stats.mapCard"]
        XCTAssertTrue(card.waitForExistence(timeout: 10), "지도 카드가 없음")
        if !card.isHittable { app.swipeUp() }
        XCTAssertTrue(card.isHittable, "스크롤로 지도 카드에 도달하지 못함")
    }

    // AC 2 — ‹ › 월 이동, 현재 달에서 › 비활성(탭 무시), 과거 달에서만 "이번 달" 칩
    func testMonthNavigation() {
        let app = launchStats()
        let title = app.descendants(matching: .any)["stats.monthTitle"]
        let cal = Calendar(identifier: .gregorian)
        let thisMonth = "\(cal.component(.month, from: Date()))월"
        XCTAssertEqual(title.label, thisMonth)
        XCTAssertFalse(app.descendants(matching: .any)["stats.thisMonth"].exists, "현재 달에 '이번 달' 칩이 있음")

        app.descendants(matching: .any)["stats.next"].tap()
        XCTAssertEqual(title.label, thisMonth, "현재 달에서 › 가 먹었다")

        app.descendants(matching: .any)["stats.prev"].tap()
        let prev = cal.date(byAdding: .month, value: -1, to: Date())!
        XCTAssertEqual(title.label, "\(cal.component(.month, from: prev))월")
        let chip = app.descendants(matching: .any)["stats.thisMonth"]
        XCTAssertTrue(chip.waitForExistence(timeout: 5), "과거 달에 '이번 달' 칩이 없음")
        chip.tap()
        XCTAssertEqual(title.label, thisMonth)
    }

    // AC 4 — 읽은 날 탭 → day 시트(책 행), X 로 닫힘. 미기록 날은 무시
    func testDayTapOpensSheetOnlyForReadDays() {
        let app = launchStats()
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2
        let today = cal.startOfDay(for: Date())
        let yesterday = cal.date(byAdding: .day, value: -1, to: today)!
        if cal.component(.month, from: yesterday) != cal.component(.month, from: today) {
            app.descendants(matching: .any)["stats.prev"].tap()     // 어제가 지난달이면 이동
        }
        func id(_ d: Date) -> String {
            String(format: "stats.cell.%04d-%02d-%02d", cal.component(.year, from: d),
                   cal.component(.month, from: d), cal.component(.day, from: d))
        }
        let cell = app.descendants(matching: .any)[id(yesterday)]
        XCTAssertTrue(cell.waitForExistence(timeout: 10), "어제 칸이 없음")
        cell.tap()
        let sheet = app.descendants(matching: .any)["stats.sheet"]
        XCTAssertTrue(sheet.waitForExistence(timeout: 5), "읽은 날 탭에 day 시트가 안 열림")
        XCTAssertTrue(app.descendants(matching: .any)["stats.sheet.row.1"].exists, "day 시트에 책 행이 없음")
        app.descendants(matching: .any)["stats.sheet.close"].tap()
        XCTAssertFalse(sheet.waitForExistence(timeout: 2), "X 로 시트가 안 닫힘")

        // 미기록(오늘 — demoCards 는 오늘 기록 없음) 탭 무시
        app.descendants(matching: .any)[id(today)].tap()
        XCTAssertFalse(sheet.exists, "미기록 날 탭에 시트가 열림")
    }

    // AC 7 — 지도 카드 탭 → 전체 화면(칩·닫기), 닫기 → 원페이지 복귀
    func testMapCardOpensFullscreenAndCloses() {
        let app = launchStats()
        let card = app.descendants(matching: .any)["stats.mapCard"]
        XCTAssertTrue(card.waitForExistence(timeout: 10))
        if !card.isHittable { app.swipeUp() }
        card.tap()
        let close = app.descendants(matching: .any)["stats.mapClose"]
        XCTAssertTrue(close.waitForExistence(timeout: 10), "전체 화면 지도가 안 열림 (닫기 버튼 없음)")
        XCTAssertTrue(app.descendants(matching: .any)["stats.mapZoomIn"].exists, "줌 컨트롤이 없음")
        close.tap()
        XCTAssertFalse(close.waitForExistence(timeout: 2), "닫기 후 지도가 남아 있음")
        XCTAssertTrue(app.descendants(matching: .any)["stats.summary"].exists, "원페이지로 복귀하지 않음")
    }
}
