import XCTest

// 홈(02) 기록 리디자인 — 제스처→라우팅 배선과 접근성 라벨을 시뮬레이터 런타임에서 검증한다.
// 작업지시서 v3 AC #11 · #16 · #17 · #18. (수치·색·레이아웃은 rtshot 픽셀 오라클이 덮는다)
// demoCards 로 상태를 주입해 시뮬레이터 잔존 데이터에 의존하지 않는다.
final class HomeRecordUITests: XCTestCase {

    override func setUp() { continueAfterFailure = false }

    private func launchHome() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards"]
        app.launch()
        return app
    }

    /// 주간 기록(10)에만 있는 문구 — 화면 식별자가 없어 이걸로 도착을 판정한다.
    private let weeklyMarker = "vs 지난주"

    // ── AC #11 — 전체 통계 탭 → 주간 기록(10). 아바타 메뉴를 거치지 않는다 ──
    func testStatsButtonGoesToWeeklyStatsDirectly() {
        let app = launchHome()
        let btn = app.descendants(matching: .any)["home.statsButton"]
        XCTAssertTrue(btn.waitForExistence(timeout: 15), "전체 통계 버튼이 없음")
        btn.tap()
        XCTAssertTrue(app.staticTexts[weeklyMarker].waitForExistence(timeout: 15),
                      "주간 기록(10)으로 진입하지 않음")
    }

    // ── AC #16 — 히트 영역 세로 ≥ 36pt (캡슐 27 + 하향 확장 9) ──
    // **절대 좌표로 눌러야 한다.** element.coordinate(withNormalizedOffset:) 는 프레임 밖 좌표라도
    // 그 element 를 타깃으로 한 탭으로 합성돼, 히트 영역이 실제로 어디까지인지 재지 못한다
    // (실측 2026-08-28: dy -0.25 로도 통계로 갔다 — 상향 확장이 없는데도).
    private func tapAbsolute(_ app: XCUIApplication, x: CGFloat, y: CGFloat) {
        app.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: x, dy: y)).tap()
    }

    func testStatsButtonHitAreaExtendsBelowCapsule() {
        let app = launchHome()
        let btn = app.descendants(matching: .any)["home.statsButton"]
        XCTAssertTrue(btn.waitForExistence(timeout: 15))
        let f = btn.frame
        XCTAssertGreaterThanOrEqual(f.height, 36, "히트 영역 세로가 36pt 미만")
        // 프레임 하단 바로 안쪽(캡슐 하단보다 약 5pt 아래) — 하향 확장 구간
        tapAbsolute(app, x: f.midX, y: f.maxY - 4)
        XCTAssertTrue(app.staticTexts[weeklyMarker].waitForExistence(timeout: 15),
                      "하향 확장 구간 탭이 먹지 않음 (padding 9 → contentShape → padding -9 무효)")
    }

    // AC #16 후반 — "위쪽 CTA 행의 히트 영역을 침범하지 않는다".
    // 빈 공간 탭이 아니라 **CTA 자체가 여전히 눌리는지**로 잰다(그게 AC 문구다).
    // 종이책 카드(card:1)로 넘겨 CTA 를 활성화한 뒤 CTA 중앙을 눌러 기록 대기(03)로 가야 한다.
    func testStatsButtonDoesNotStealCTAHitArea() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards,card:1"]
        app.launch()
        let btn = app.descendants(matching: .any)["home.statsButton"]
        XCTAssertTrue(btn.waitForExistence(timeout: 15))

        // CTA 행은 전체 통계 캡슐 위에 있다. 캡슐 상단 − 13(② padding) − 30(CTA 높이 60의 중앙)
        let f = btn.frame
        tapAbsolute(app, x: 150, y: f.minY - 13 - 30)

        XCTAssertTrue(app.staticTexts["폰을 엎어 주세요"].waitForExistence(timeout: 15),
                      "CTA 탭이 기록 대기(03)로 가지 않음 — statsButton 하향 확장이 CTA 히트 영역을 뺏었을 수 있다")
        XCTAssertFalse(app.staticTexts[weeklyMarker].exists, "CTA 탭이 통계로 갔다")
    }

    // ── AC #17 — 식별자 유지/추가 ──
    func testAccessibilityIdentifiersPresent() {
        let app = launchHome()
        for id in ["home.avatar", "home.recentRow", "home.statsButton"] {
            XCTAssertTrue(app.descendants(matching: .any)[id].waitForExistence(timeout: 15),
                          "식별자 \(id) 가 없음")
        }
    }

    // ── AC #18 — 캘린더 칸 VoiceOver 라벨(날짜) + 값(분/기록 없음), 미래 칸은 읽히지 않는다 ──
    // 창은 오늘 기준으로 굴러가므로 기대 라벨을 실행 시각에서 계산한다(고정 문자열 금지).
    func testCalendarCellsExposeVoiceOverLabels() {
        let app = launchHome()
        XCTAssertTrue(app.descendants(matching: .any)["home.statsButton"].waitForExistence(timeout: 15))

        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2
        let now = Date()
        let today = cal.startOfDay(for: now)

        func label(_ d: Date) -> String {
            "\(cal.component(.month, from: d))월 \(cal.component(.day, from: d))일"
        }
        func cell(_ text: String) -> XCUIElement {
            app.descendants(matching: .any)
                .matching(NSPredicate(format: "label == %@", text)).firstMatch
        }

        // 오늘 칸 — demoCards 는 오늘 기록이 없으므로 값이 "기록 없음"
        let todayCell = cell(label(today))
        XCTAssertTrue(todayCell.waitForExistence(timeout: 10),
                      "오늘 칸 라벨 '\(label(today))' 이 읽히지 않음")
        XCTAssertEqual(todayCell.value as? String, "기록 없음",
                       "오늘(미기록) 칸의 접근성 값이 '기록 없음' 이 아님")

        // 어제 칸 — demoCards 세션이 있어 "N분" 이 읽혀야 한다
        let yesterday = cal.date(byAdding: .day, value: -1, to: today)!
        let yCell = cell(label(yesterday))
        XCTAssertTrue(yCell.exists, "어제 칸 라벨 '\(label(yesterday))' 이 읽히지 않음")
        XCTAssertTrue((yCell.value as? String)?.hasSuffix("분") == true,
                      "어제 칸 값이 분 표기가 아님: \(String(describing: yCell.value))")

        // 미래 칸 — accessibilityHidden 이라 읽히면 안 된다.
        // 오늘이 일요일(창의 마지막 칸)이면 미래 칸이 없으므로 건너뛴다.
        let weekEnd = cal.dateInterval(of: .weekOfYear, for: now)!.end
        let tomorrow = cal.date(byAdding: .day, value: 1, to: today)!
        if tomorrow < weekEnd {
            XCTAssertFalse(cell(label(tomorrow)).exists,
                           "미래 칸 '\(label(tomorrow))' 이 VoiceOver 에 노출됐다")
        }
    }

    // ── AC #15c — 색이 유일한 정보 채널이 아님(WCAG 1.4.1): 분량이 값으로도 전달된다 ──
    func testReadAmountIsAvailableWithoutColor() {
        let app = launchHome()
        XCTAssertTrue(app.descendants(matching: .any)["home.statsButton"].waitForExistence(timeout: 15))
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2
        let today = cal.startOfDay(for: Date())
        // 창 14칸 중 값이 "N분" 인 칸이 최소 1개는 있어야 색 없이도 분량을 알 수 있다
        var minuteCells = 0
        for i in -13...0 {
            let d = cal.date(byAdding: .day, value: i, to: today)!
            let e = app.descendants(matching: .any)
                .matching(NSPredicate(format: "label == %@",
                                      "\(cal.component(.month, from: d))월 \(cal.component(.day, from: d))일")).firstMatch
            if e.exists, (e.value as? String)?.hasSuffix("분") == true { minuteCells += 1 }
        }
        XCTAssertGreaterThan(minuteCells, 0,
                             "어떤 칸도 분을 값으로 노출하지 않는다 — 분량이 색으로만 전달된다")
    }
}
