import XCTest

// 히스토리 카드 전수 조사 — 실제로 기록한 종목이 세션 캘린더에 그대로 반영되는지.
// 카드는 접근성 라벨이 정본이다: 기록 있는 날 "9월 14일, <종목> 기록" / 없는 날 "9월 14일, 기록 없음".
//
// --reset 이 심는 상태: history 비어 있음 + 오늘 진행 세션 4종목
//   인클라인 벤치(완료 3세트) · 벤치프레스(완료 2 + 예정 3) · 덤벨 플라이(예정만) · 케이블 크로스오버(예정만)
// 즉 같은 날 같은 세션 안에서 기록이 있는 종목과 없는 종목이 섞여 있다.
final class GymCalendarAuditUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private let cal = Calendar(identifier: .gregorian)
    private var todayIdx: Int { (cal.component(.weekday, from: Date()) + 5) % 7 }
    private func iso(_ offsetFromMonday: Int) -> String {
        let monday = cal.date(byAdding: .day, value: -todayIdx, to: Date())!
        let f = DateFormatter()
        f.calendar = cal; f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f.string(from: cal.date(byAdding: .day, value: offsetFromMonday, to: monday)!)
    }
    private func dayLabel(_ s: String) -> String {
        let p = s.split(separator: "-"); return "\(Int(p[1])!)월 \(Int(p[2])!)일"
    }
    private func cell(_ app: XCUIApplication, _ isoStr: String) -> XCUIElement {
        app.descendants(matching: .any)["lift-day-\(isoStr)"]
    }
    /// 레일 칩 — 상태 접두사(done/current/upcoming)는 종목을 바꿀 때마다 달라지므로 이름으로만 찾는다.
    private func chip(_ app: XCUIApplication, _ name: String) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier ENDSWITH %@", "-\(name)")).firstMatch
    }
    /// 현재 화면 종목의 오늘 칸 라벨.
    private func todayLabel(_ app: XCUIApplication) -> String {
        let c = cell(app, iso(todayIdx))
        XCTAssertTrue(c.waitForExistence(timeout: 5), "오늘 칸이 없다")
        return c.label
    }
    private func expectRecorded(_ app: XCUIApplication, _ exName: String, _ file: StaticString = #filePath, _ line: UInt = #line) {
        XCTAssertEqual(todayLabel(app), "\(dayLabel(iso(todayIdx))), \(exName) 기록",
                       "\(exName): 기록했는데 오늘 칸이 안 찼다", file: file, line: line)
    }
    private func expectEmpty(_ app: XCUIApplication, _ exName: String, _ file: StaticString = #filePath, _ line: UInt = #line) {
        XCTAssertEqual(todayLabel(app), "\(dayLabel(iso(todayIdx))), 기록 없음",
                       "\(exName): 기록이 없는데 오늘 칸이 찼다", file: file, line: line)
    }

    private func launchSession(_ args: [String] = ["--reset", "--route", "session"]) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = args
        app.launch()
        XCTAssertTrue(app.staticTexts["session-exname"].waitForExistence(timeout: 15))
        return app
    }

    private func commitSet(_ app: XCUIApplication) {
        let area = app.otherElements["cardSwipeArea"].exists
            ? app.otherElements["cardSwipeArea"] : app.staticTexts["hero-weight"]
        area.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: 0.5))
            .press(forDuration: 0.02,
                   thenDragTo: area.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.5)))
    }

    // MARK: - 같은 날 · 같은 세션에서 종목별로 갈린다

    // 완료 세트가 있는 종목만 오늘 칸이 찬다. 옆 종목 기록이 새어 들어오면 여기서 걸린다.
    func testTodayCellFollowsEachExercisesOwnSets() {
        let app = launchSession()
        expectRecorded(app, "벤치프레스")                       // 완료 2세트

        chip(app, "인클라인 벤치").tap()
        XCTAssertEqual(app.staticTexts["session-exname"].label, "인클라인 벤치")
        expectRecorded(app, "인클라인 벤치")                    // 완료 3세트

        chip(app, "덤벨 플라이").tap()
        XCTAssertEqual(app.staticTexts["session-exname"].label, "덤벨 플라이")
        expectEmpty(app, "덤벨 플라이")                         // 예정만

        chip(app, "케이블 크로스오버").tap()
        XCTAssertEqual(app.staticTexts["session-exname"].label, "케이블 크로스오버")
        expectEmpty(app, "케이블 크로스오버")                   // 예정만
    }

    // 세트를 실제로 커밋하면 그 종목만 찬다. 이웃 종목은 그대로 비어 있어야 한다.
    func testCommittingASetFillsOnlyThatExercise() {
        let app = launchSession()
        chip(app, "덤벨 플라이").tap()
        expectEmpty(app, "덤벨 플라이")
        commitSet(app)
        let want = "\(dayLabel(iso(todayIdx))), 덤벨 플라이 기록"
        expectation(for: NSPredicate(format: "label == %@", want), evaluatedWith: cell(app, iso(todayIdx)))
        waitForExpectations(timeout: 8)

        chip(app, "케이블 크로스오버").tap()
        expectEmpty(app, "케이블 크로스오버")                   // 옆 종목으로 새면 안 된다
    }

    // MARK: - 유산소

    // 트레드밀에는 카드가 없고(유산소 패널이 자기 주간 모듈을 갖는다), 유산소를 기록해도
    // 근력 종목 카드가 차면 안 된다. 홈 캘린더는 유산소를 teal 링으로 따로 표시하지만
    // 이 카드는 이 종목 하나만 말한다 (작업지시서 §4).
    func testTreadmillHasNoCardAndDoesNotFillLiftCards() {
        let app = launchSession()
        app.buttons["rail-add"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'addex-'"))
                        .firstMatch.waitForExistence(timeout: 5))
        app.buttons["유산소"].tap()
        XCTAssertTrue(app.buttons["addex-treadmill"].waitForExistence(timeout: 5), "유산소에 트레드밀이 있어야")
        app.buttons["addex-treadmill"].tap()
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()   // 시트 닫기

        chip(app, "트레드밀").tap()
        XCTAssertEqual(app.staticTexts["session-exname"].label, "트레드밀")
        XCTAssertFalse(app.descendants(matching: .any)["lift-card-title"].exists,
                       "유산소 화면에 근력 히스토리 카드가 떴다")
        XCTAssertTrue(app.otherElements["cardio-card"].waitForExistence(timeout: 5),
                      "유산소 주간 모듈이 없다")

        // 근력 종목으로 돌아와도 유산소가 카드를 채우지 않는다.
        chip(app, "케이블 크로스오버").tap()
        expectEmpty(app, "케이블 크로스오버")
        chip(app, "벤치프레스").tap()
        expectRecorded(app, "벤치프레스")                        // 제 기록만 그대로
    }

    // MARK: - 완료 세션(이력) 경로

    // 세션을 끝내면 오늘 기록은 진행 세트가 아니라 history 에서 온다. 두 경로가 같은 그림이어야 한다.
    func testTodayStaysFilledAfterSessionIsFinished() {
        let app = launchSession()
        expectRecorded(app, "벤치프레스")
        app.staticTexts["session-end"].tap()
        XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5))
        app.buttons["action-finish"].tap()
        XCTAssertTrue(app.staticTexts["summary-title"].waitForExistence(timeout: 10)
                      || app.buttons["summary-home"].waitForExistence(timeout: 10),
                      "요약 화면이 떠야 한다")

        // 새 세션에서 같은 종목을 열면 오늘 칸이 이력으로 차 있어야 한다.
        let app2 = XCUIApplication()
        app2.launchArguments = ["--route", "session"]   // reset 없이 이어받는다
        app2.launch()
        XCTAssertTrue(app2.staticTexts["session-exname"].waitForExistence(timeout: 15))
        XCTAssertTrue(cell(app2, iso(todayIdx)).waitForExistence(timeout: 5))
        let seen = cell(app2, iso(todayIdx)).label
        print("PROBE 완료 후 오늘 칸: \(seen) / 종목: \(app2.staticTexts["session-exname"].label)")
        XCTAssertTrue(seen.hasSuffix(" 기록"), "완료한 세션이 오늘 칸에 안 남았다 (실측 '\(seen)')")
    }

    // MARK: - 14칸 전수 대조 (심은 이력과 한 칸씩)

    // --demo-week 이 심는 랫 풀다운: 이번 주 월 / 지난주 금 / 지난주 화. 오늘은 미기록.
    // 14칸(지난주 7 + 이번 주 7)을 한 칸씩 기대값과 맞춘다. 미래 칸은 접근성에서 빠진다.
    func testAllCellsMatchSeededHistory() {
        let app = launchSession(["--reset", "--fake-signin", "--demo-week"])
        // 훅과 같은 식으로 기대 집합을 만든다 (오늘 기준 -weekday, -weekday-3, -weekday-6).
        let f = DateFormatter()
        f.calendar = cal; f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        let recorded = Set([0, -3, -6].map {
            f.string(from: cal.date(byAdding: .day, value: -todayIdx + $0, to: Date())!)
        })
        for i in -7..<7 {
            let d = iso(i)
            let c = cell(app, d)
            if i > todayIdx {
                XCTAssertFalse(c.exists, "미래 칸 \(d) 가 접근성 트리에 남아 있다")
                continue
            }
            XCTAssertTrue(c.exists, "\(d) 칸이 없다")
            let want = recorded.contains(d) ? "\(dayLabel(d)), 랫 풀다운 기록" : "\(dayLabel(d)), 기록 없음"
            XCTAssertEqual(c.label, want, "\(d) 칸이 심은 이력과 다르다")
        }
        // 라벨 열 숫자도 채운 칸 수와 맞아야 한다.
        let thisWeek = (0...todayIdx).filter { recorded.contains(iso($0)) }.count
        let lastWeek = (-7..<0).filter { recorded.contains(iso($0)) }.count
        XCTAssertEqual(app.descendants(matching: .any)["lift-card-title"].label,
                       "최근 2주, 지난주 \(lastWeek)일, 이번 주 \(thisWeek)일")
    }

    // MARK: - 트레드밀 실제 기록

    // 유산소는 --empty-session 경로로 기록해야 한다 — --reset 의 데모 세션(id "demo") 위에
    // 기록하면 다음 런치 퍼지에 증발한다 (GymCardioUITests 2026-08-10 실측).
    func testTreadmillRecordShowsInCardioWeekAndNotInLiftCard() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--empty-session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["NEW SESSION"].waitForExistence(timeout: 15))
        app.buttons["유산소"].tap()
        XCTAssertTrue(app.buttons["addex-treadmill"].waitForExistence(timeout: 5))
        app.buttons["addex-treadmill"].tap()
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
        XCTAssertTrue(app.otherElements["cardio-card"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.descendants(matching: .any)["lift-card-title"].exists,
                       "트레드밀 화면에 근력 카드가 떴다")

        // 히어로(거리) 탭 → 키패드 5 → 확인
        var hero = (label: "(none)", frame: CGRect.zero)
        for e in app.staticTexts.allElementsBoundByIndex where e.identifier == "cardio-card" {
            if e.frame.height > hero.frame.height { hero = (e.label, e.frame) }
        }
        let sz = app.windows.firstMatch.frame
        app.coordinate(withNormalizedOffset: CGVector(dx: hero.frame.midX / sz.width,
                                                      dy: hero.frame.midY / sz.height)).tap()
        XCTAssertTrue(app.buttons["keypad-done"].waitForExistence(timeout: 5), "히어로 탭이 키패드를 열어야")
        app.buttons["keypad-key-5"].tap()
        app.buttons["keypad-done"].tap()

        // 유산소 카드는 컨테이너 식별자 `cardio-card` 가 자식 식별자를 전부 덮는다
        // (lessons/swiftui-accessibility-identifier-container.md · 이 카드의 기존 문제).
        // 그래서 요일 칸도 라벨로 찾는다 — children: .combine 이라 "요일 + 값" 한 덩어리다.
        let wd = ["월", "화", "수", "목", "금", "토", "일"][todayIdx]
        var dayLabels: [String] = []
        for e in app.descendants(matching: .any).allElementsBoundByIndex
        where e.identifier == "cardio-card" && e.label.contains(wd) && e.frame.height < 60 {
            dayLabels.append(e.label)
        }
        print("PROBE 유산소 오늘 칸(\(wd)) 후보: \(dayLabels)")
        XCTAssertTrue(dayLabels.contains { $0.contains("5") },
                      "트레드밀 5km 를 넣었는데 유산소 주간 칸에 안 보인다 (실측 \(dayLabels))")

        // 같은 날 근력 종목을 추가하면 그 카드는 비어 있어야 한다 — 유산소가 새면 안 된다.
        app.buttons["rail-add"].tap()
        XCTAssertTrue(app.buttons["등"].waitForExistence(timeout: 5))
        app.buttons["등"].tap()
        XCTAssertTrue(app.buttons["addex-lat_pulldown"].waitForExistence(timeout: 5))
        app.buttons["addex-lat_pulldown"].tap()
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
        chip(app, "랫 풀다운").tap()
        XCTAssertEqual(app.staticTexts["session-exname"].label, "랫 풀다운")
        expectEmpty(app, "랫 풀다운")
    }
}
