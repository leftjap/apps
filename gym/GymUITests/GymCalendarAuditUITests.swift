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
        // 커밋이 쌓이면 같은 식별자가 여러 개 잡힐 수 있어 firstMatch 로 고정한다.
        let area = app.otherElements["cardSwipeArea"].firstMatch.exists
            ? app.otherElements["cardSwipeArea"].firstMatch : app.staticTexts["hero-weight"].firstMatch
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

    // MARK: - 세트가 많아져도 화면이 세이프에어리어 안에 있는가

    // 카드가 들어간 뒤 세로 예산이 빠듯해졌다. 세트를 커밋할 때마다 다음 세트가 붙으므로
    // 세트바가 길어지는데, 그래도 툴바가 노치를, 레일이 홈 인디케이터를 침범하면 안 된다.
    // 기준 기기 iPhone 11 Pro (375×812 · 세이프에어리어 44 ~ 778).
    func testDenseSessionStaysInsideSafeArea() {
        let app = launchSession()
        let win = app.windows.firstMatch.frame
        guard win.width == 375, win.height == 812 else {
            print("PROBE 기준 기기가 아님 \(win) — 건너뜀"); return
        }
        func bounds(_ tag: String) -> (top: CGFloat, bottom: CGFloat) {
            let top = app.staticTexts["session-end"].firstMatch.frame.minY
            let bottom = app.buttons["rail-add"].firstMatch.frame.maxY
            print("PROBE \(tag): 툴바 top=\(top) 레일 bottom=\(bottom)")
            return (top, bottom)
        }
        var b = bounds("세트 5")
        XCTAssertGreaterThanOrEqual(b.top, 44, "툴바가 노치를 침범한다")
        XCTAssertLessThanOrEqual(b.bottom, 778, "레일이 홈 인디케이터를 침범한다")

        for i in 1...5 {              // 커밋할 때마다 세트가 하나씩 붙는다
            commitSet(app)
            Thread.sleep(forTimeInterval: 0.6)
            b = bounds("커밋 \(i)회")
            XCTAssertGreaterThanOrEqual(b.top, 44, "커밋 \(i)회에서 툴바가 노치를 침범한다")
            XCTAssertLessThanOrEqual(b.bottom, 778, "커밋 \(i)회에서 레일이 홈 인디케이터를 침범한다")
        }
    }

    // 세트 수는 세로에 영향이 없다 — 세트바는 칸이 좁아질 뿐 높아지지 않는다.
    // 화면이 가장 빡빡해지는 건 **신기록 상태**다: 헤더에 신기록 줄이 붙고 히어로 아래에
    // PR 칩이 생긴다 (gymshot week-8sets 가 그 상태다). --demo-week 의 PR 은 50kg 이므로
    // 60kg 를 커밋하면 종목 PR + 세션 신기록이 함께 뜬다.
    func testRecordStateStaysInsideSafeArea() {
        let app = launchSession(["--reset", "--fake-signin", "--demo-week"])
        let win = app.windows.firstMatch.frame
        guard win.width == 375, win.height == 812 else {
            print("PROBE 기준 기기가 아님 \(win) — 건너뜀"); return
        }
        @discardableResult func probe(_ tag: String) -> (top: CGFloat, bottom: CGFloat) {
            let top = app.staticTexts["session-end"].firstMatch.frame.minY
            let bottom = app.buttons["rail-add"].firstMatch.frame.maxY
            let pr = app.staticTexts["hero-prchip"].firstMatch.exists
            let rec = app.staticTexts.allElementsBoundByIndex.contains { $0.label.contains("신기록") }
            print("PROBE \(tag): 툴바 top=\(top) 레일 bottom=\(bottom) PR칩=\(pr) 신기록=\(rec)")
            return (top, bottom)
        }
        let base = probe("기본")
        #if DEBUG
        #endif
        XCTAssertGreaterThanOrEqual(base.top, 44, "기본 상태에서 툴바가 노치를 침범한다")
        XCTAssertLessThanOrEqual(base.bottom, 778, "기본 상태에서 레일이 홈 인디케이터를 침범한다")
        // 중앙 존 → 키패드 → 60kg
        app.otherElements["zone-center"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["keypad-value"].waitForExistence(timeout: 5))
        for d in "60" { app.buttons["keypad-key-\(d)"].tap() }
        app.buttons["keypad-done"].tap()
        Thread.sleep(forTimeInterval: 0.6)
        // PR 칩이 붙는 순간이 가장 빡빡하다. 칩 블록(상단 패딩 18 + 칩)이 히어로 아래 여유를
        // 다 먹고 남는 만큼 위아래로 밀려난다. 실측 기준선 (iPhone 11 Pro 시뮬):
        //   변경 전(894d14b) 툴바 top 35.0 · 레일 bottom 776.7  ← 세이프에어리어 9pt 초과
        //   현재          툴바 top 43.7 · 레일 bottom 768.0  ← 0.33pt (프레임 반올림 폭 안)
        // 카드(+41.6pt)보다 히어로 줄 상자 회수(−58.4pt)가 커서 순증이 음수라 오히려 나아졌다.
        let pr = probe("60kg 입력 · PR 칩")
        XCTAssertGreaterThanOrEqual(pr.top, 43, "PR 칩 상태가 기준선(43.7)보다 나빠졌다")
        XCTAssertLessThanOrEqual(pr.bottom, 778, "PR 칩 상태에서 레일이 홈 인디케이터를 침범한다")
        for i in 1...4 {   // 커밋을 쌓아 세션 신기록 줄까지 띄운다
            commitSet(app)
            Thread.sleep(forTimeInterval: 1.2)
            probe("커밋 \(i)회")
        }
    }

    // MARK: - 화면 캡처 (눈으로 보는 검증)

    // 카드가 실제로 어떻게 그려지는지 회수한다. 단언이 아니라 그림을 남기는 것이 목적이다.
    //   xcodebuild test -only-testing:GymUITests/GymCalendarAuditUITests/testCaptureCardScreens \
    //     -destination 'id=<sim>' -resultBundlePath <out.xcresult>
    //   xcrun xcresulttool export attachments --path <out.xcresult> --output-path <dir>
    func testCaptureCardScreens() {
        func shot(_ app: XCUIApplication, _ name: String) {
            let a = XCTAttachment(screenshot: app.screenshot())
            a.name = name; a.lifetime = .keepAlways; add(a)
        }
        let app = launchSession(["--reset", "--fake-signin", "--demo-week"])
        XCTAssertTrue(app.descendants(matching: .any)["lift-card-title"].waitForExistence(timeout: 5))
        shot(app, "01-session-card-today-empty")

        // 기록 있는 날(지난주 화) 탭 → 날짜 상세 시트
        cell(app, iso(-6)).tap()
        XCTAssertTrue(app.staticTexts["daydetail-date"].waitForExistence(timeout: 3))
        shot(app, "02-day-detail-sheet")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
        XCTAssertTrue(app.staticTexts["daydetail-date"].waitForNonExistence(timeout: 3))

        // 세트 커밋 → 오늘 칸이 채워진 그림
        commitSet(app)
        Thread.sleep(forTimeInterval: 1.0)
        shot(app, "03-session-card-today-filled")

        // 홈 — 카드와 같은 원천(weekCells)을 쓰는 화면이 멀쩡한지
        app.buttons["session-home"].firstMatch.tap()
        XCTAssertTrue(app.buttons["home-cta"].waitForExistence(timeout: 8)
                      || app.staticTexts["Gym"].waitForExistence(timeout: 8))
        shot(app, "04-home")
    }

    // 커밋 직후 오늘 원의 색이 링 → 채움으로 **점진적으로** 바뀌는지 (§7 200ms linear).
    // 연속 스크린샷을 붙여 회수한 뒤 오늘 칸 가운데 픽셀 색을 본다.
    //
    // 2026-09-17 실측 (iPhone 11 Pro 시뮬 · 오늘 칸 (243.5, 232.2)pt):
    //   reduce-motion OFF  t00 (165,162,159) → t01 **(211,140,101)** → t02~ (206,126,78)
    //   reduce-motion ON   t00 (166,163,160) → t01 (207,126,78) 즉시
    // 끈 쪽에서만 중간색이 잡힌다 = 애니메이션이 돌고, 켜면 즉시 반영된다.
    //
    // reduce-motion 토글: xcrun simctl spawn <DEV> defaults write com.apple.Accessibility \
    //   ReduceMotionEnabled -bool true   (simctl ui 로는 안 되지만 defaults 로는 된다)
    func testCaptureCommitTransitionFrames() {
        let app = launchSession(["--reset", "--fake-signin", "--demo-week"])
        XCTAssertTrue(app.descendants(matching: .any)["lift-card-title"].waitForExistence(timeout: 5))
        func shot(_ name: String) {
            let a = XCTAttachment(screenshot: app.screenshot())
            a.name = name; a.lifetime = .keepAlways; add(a)
        }
        shot("t00-before")
        commitSet(app)
        for i in 1...8 { shot(String(format: "t%02d-after", i)) }   // 캡처 간격만큼 촘촘히
        Thread.sleep(forTimeInterval: 1.0)
        shot("t99-settled")
    }
}
