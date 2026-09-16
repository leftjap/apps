import XCTest

// 근력 주간 스트립 (시안 2026-09-17) — 세션 화면에서 실제로 그려지고, 세트를 완료하면
// 오늘 칸 값이 따라 오르는지. 시뮬레이터 전용(--demo-week 훅 사용).
//
// --demo-week 가 심는 상태: 렛풀다운, 오늘 45×11 + 45×10 완료(945kg), 이번 주 월 2,340kg,
// 지난주 화·금. 좌스와이프 한 번이면 45×10 이 더해져 1,395 → "1.4k" 로 바뀐다.
final class GymWeekStripUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private static let weekdays = ["월", "화", "수", "목", "금", "토", "일"]
    private var todayLabel: String {
        let wd = Calendar(identifier: .gregorian).component(.weekday, from: Date())
        return Self.weekdays[(wd + 5) % 7]
    }

    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--demo-week"]
        app.launch()
        XCTAssertTrue(app.staticTexts["session-exname"].waitForExistence(timeout: 15))
        return app
    }

    // 7칸이 모두 그려지고 오늘 칸이 현재 볼륨을 보여준다.
    func testStripShowsSevenDaysWithTodayValue() {
        let app = launch()
        for d in Self.weekdays {
            XCTAssertTrue(app.staticTexts["lift-wd-\(d)"].exists, "\(d) 칸 없음")
        }
        XCTAssertEqual(app.staticTexts["lift-day-\(todayLabel)"].label, "945")
    }

    // 세트 완료(좌스와이프) → 오늘 칸이 945 에서 1.4k 로 갱신된다.
    func testTodayCellUpdatesAfterSetComplete() {
        let app = launch()
        XCTAssertEqual(app.staticTexts["lift-day-\(todayLabel)"].label, "945")

        let area = app.otherElements["cardSwipeArea"].exists
            ? app.otherElements["cardSwipeArea"] : app.staticTexts["hero-weight"]
        let start = area.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: 0.5))
        let end = area.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.5))
        start.press(forDuration: 0.02, thenDragTo: end)

        let updated = app.staticTexts["lift-day-\(todayLabel)"]
        expectation(for: NSPredicate(format: "label == '1.4k'"), evaluatedWith: updated)
        waitForExpectations(timeout: 8)
    }

    // 유산소 종목에는 이 스트립이 뜨지 않는다 — 유산소 카드가 자기 주간 모듈을 이미 갖고 있어
    // 둘이 겹치면 한 화면에 주간 캘린더가 두 개가 된다.
    func testCardioKeepsItsOwnWeekModule() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--demo-session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["session-exname"].waitForExistence(timeout: 15))
        guard app.otherElements["cardio-card"].exists else { return }   // 데모가 유산소가 아니면 건너뜀
        XCTAssertFalse(app.staticTexts["lift-wd-월"].exists, "유산소 화면에 근력 스트립이 함께 떴다")
    }
}
