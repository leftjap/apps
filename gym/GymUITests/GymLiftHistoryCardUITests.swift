import XCTest

// 근력 히스토리 카드 (작업지시서 2026-09-17) — 세션 화면에 최근 2주가 그려지고, 세트를 완료하면
// 오늘 칸이 링에서 채움으로 바뀌며, 기록 있는 날만 상세 시트가 열리는지. 시뮬레이터 전용(--demo-week).
//
// --demo-week 가 심는 상태: 랫 풀다운, 오늘은 전부 미완료(원이 링), 이번 주 월 2,340kg,
// 지난주 화·금. 좌스와이프 한 번이면 오늘이 기록으로 바뀌고 "이번 주 1일" 이 "2일" 이 된다.
final class GymLiftHistoryCardUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private let cal = Calendar(identifier: .gregorian)
    /// 월요일 기준 오늘 인덱스 (0=월).
    private var todayIdx: Int { (cal.component(.weekday, from: Date()) + 5) % 7 }
    private func iso(_ dayOffsetFromMonday: Int) -> String {
        let monday = cal.date(byAdding: .day, value: -todayIdx, to: Date())!
        let d = cal.date(byAdding: .day, value: dayOffsetFromMonday, to: monday)!
        let f = DateFormatter()
        f.calendar = cal; f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }
    private func dayLabel(_ isoStr: String) -> String {
        let p = isoStr.split(separator: "-")
        return "\(Int(p[1])!)월 \(Int(p[2])!)일"
    }
    private func cell(_ app: XCUIApplication, _ isoStr: String) -> XCUIElement {
        app.descendants(matching: .any)["lift-day-\(isoStr)"]
    }

    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--demo-week"]
        app.launch()
        XCTAssertTrue(app.staticTexts["session-exname"].waitForExistence(timeout: 15))
        return app
    }

    // 카드가 두 주를 그린다 — 지난주 7칸 + 이번 주 오늘까지. 미래 칸은 접근성에서 숨긴다.
    func testCardShowsTwoWeeks() {
        let app = launch()
        XCTAssertTrue(app.descendants(matching: .any)["lift-card-title"].waitForExistence(timeout: 5),
                      "카드가 없다")
        for i in 0..<7 {
            XCTAssertTrue(cell(app, iso(i - 7)).exists, "지난주 \(iso(i - 7)) 칸 없음")
        }
        for i in 0...todayIdx {
            XCTAssertTrue(cell(app, iso(i)).exists, "이번 주 \(iso(i)) 칸 없음")
        }
        if todayIdx < 6 {
            XCTAssertFalse(cell(app, iso(todayIdx + 1)).exists, "미래 칸이 접근성 트리에 남아 있다")
        }
    }

    // 라벨 열은 한 덩어리로 읽힌다 — 오늘 미기록이므로 이번 주는 월요일 하루뿐.
    func testLabelColumnReadsAsOneElement() {
        let app = launch()
        let title = app.descendants(matching: .any)["lift-card-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        XCTAssertEqual(title.label, "최근 2주, 지난주 2일, 이번 주 1일")
    }

    // 첫 세트 커밋 → 오늘 칸이 "기록 없음" 에서 "<종목> 기록" 으로, 라벨 열은 2일로.
    func testTodayCellFillsAfterSetCommit() {
        let app = launch()
        let today = cell(app, iso(todayIdx))
        XCTAssertEqual(today.label, "\(dayLabel(iso(todayIdx))), 기록 없음")

        let area = app.otherElements["cardSwipeArea"].exists
            ? app.otherElements["cardSwipeArea"] : app.staticTexts["hero-weight"]
        area.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: 0.5))
            .press(forDuration: 0.02,
                   thenDragTo: area.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.5)))

        let filled = "\(dayLabel(iso(todayIdx))), 랫 풀다운 기록"
        expectation(for: NSPredicate(format: "label == %@", filled), evaluatedWith: cell(app, iso(todayIdx)))
        waitForExpectations(timeout: 8)
        XCTAssertEqual(app.descendants(matching: .any)["lift-card-title"].label,
                       "최근 2주, 지난주 2일, 이번 주 2일")
    }

    // 기록 있는 날만 상세 시트를 연다 (§6). 시트는 그 날 전체 요약이라 홈·통계와 같은 것을 쓴다.
    func testOnlyRecordedDaysOpenTheSheet() {
        let app = launch()
        // 지난주 화(=iso(-6))에 기록이 있다.
        let ran = cell(app, iso(-6))
        XCTAssertTrue(ran.exists)
        ran.tap()
        XCTAssertTrue(app.staticTexts["daydetail-date"].waitForExistence(timeout: 3), "시트가 안 열렸다")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()   // 스크림 탭으로 닫기
        XCTAssertTrue(app.staticTexts["daydetail-date"].waitForNonExistence(timeout: 3))

        // 지난주 월(=iso(-7))은 기록이 없다.
        cell(app, iso(-7)).tap()
        XCTAssertFalse(app.staticTexts["daydetail-date"].waitForExistence(timeout: 2),
                       "미기록 날인데 시트가 열렸다")
    }

    // 유산소도 같은 2주 카드를 쓴다 (사용자 2026-09-17). 색만 teal 계열이고, 유산소의 옛
    // 1주 원 줄은 카드가 대신한다 — 한 화면에 주간 캘린더가 두 개가 되지 않도록 교체다.
    func testCardioUsesTheSameTwoWeekCard() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--demo-cardio"]
        app.launch()
        XCTAssertTrue(app.staticTexts["session-exname"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.descendants(matching: .any)["lift-card-title"].waitForExistence(timeout: 5),
                      "유산소 화면에 2주 카드가 없다")
        XCTAssertTrue(app.otherElements["cardio-card"].exists, "유산소 패널이 없다")
    }
}
