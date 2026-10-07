import XCTest

// 세트 완료(좌스와이프) 전/중/후 프레임 캡처 — 시안 #7b 시퀀스 대조용.
// 시뮬레이터 전용(--reset 사용). 실기기에서 돌리지 말 것.
final class GymSwipeFrameUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name; a.lifetime = .keepAlways
        add(a)
    }

    func testCaptureSetCompleteSequence() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--route", "session"]
        app.launch()

        XCTAssertTrue(app.staticTexts["session-exname"].waitForExistence(timeout: 15))
        shot(app, "10-before")   // 완료 전: 현재 세트 = crail 막대 + crail-deep 숫자

        // 좌스와이프 = 세트 완료. 스와이프 직후 연속 캡처로 스왑/큐 프레임 확보.
        let area = app.otherElements["cardSwipeArea"].exists
            ? app.otherElements["cardSwipeArea"] : app.staticTexts["hero-weight"]
        let start = area.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: 0.5))
        let end = area.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.5))
        start.press(forDuration: 0.02, thenDragTo: end)

        shot(app, "20-during-a")
        shot(app, "21-during-b")
        shot(app, "22-during-c")
        Thread.sleep(forTimeInterval: 1.2)
        shot(app, "30-after")    // 완료 후: 직전 막대 = ink, 다음 막대 = crail
    }

    func testInterruptedDragReturnsHeroToCenterWithoutChangingSet() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--route", "session"]
        app.launch()
        let hero = app.staticTexts["hero-weight"]
        XCTAssertTrue(hero.waitForExistence(timeout: 15))
        checkInterruptedDrags(app, hero: hero)
    }

    func testInterruptedBodyweightDragReturnsHeroToCenter() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--empty-session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["NEW SESSION"].waitForExistence(timeout: 15))
        app.buttons["코어"].tap()
        app.buttons["addex-hanging_leg_raise"].tap()
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
        let hero = app.staticTexts["hero-reps"]
        XCTAssertTrue(hero.waitForExistence(timeout: 5))
        checkInterruptedDrags(app, hero: hero)
        hero.swipeLeft()
        XCTAssertEqual(app.otherElements["set-bar-0"].value as? String, "완료",
                       "After cancellation a normal swipe must still complete a set")
        XCTAssertEqual(app.otherElements["set-bar-1"].value as? String, "진행 중",
                       "A normal swipe must complete exactly one set")
        let liveHero = app.staticTexts.matching(identifier: "hero-reps")
        expectation(for: NSPredicate(format: "count == 1"), evaluatedWith: liveHero)
        waitForExpectations(timeout: 5)
        XCTAssertEqual(hero.frame.midX, app.windows.firstMatch.frame.midX, accuracy: 1)
        shot(app, "bodyweight-commit-after-interruption")
    }

    private func checkInterruptedDrags(_ app: XCUIApplication, hero: XCUIElement) {
        let value = hero.label
        let center = hero.frame.midX
        let bars = app.otherElements.matching(NSPredicate(format: "identifier BEGINSWITH %@", "set-bar-"))
        let states = bars.allElementsBoundByIndex.map { $0.value as? String }
        XCTAssertFalse(states.isEmpty)
        XCTAssertTrue(states.allSatisfy { $0 != nil })
        XCTAssertEqual(center, app.windows.firstMatch.frame.midX, accuracy: 1)
        for dx: CGFloat in [75, -75] {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            let end = start.withOffset(CGVector(dx: dx, dy: 0))
            let interruption = expectation(description: "Another app interrupts the held drag")
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                XCUIApplication(bundleIdentifier: "com.apple.Preferences").activate()
                interruption.fulfill()
            }
            start.press(forDuration: 0.05, thenDragTo: end,
                        withVelocity: .slow, thenHoldForDuration: 3)
            wait(for: [interruption], timeout: 10)
            XCTAssertEqual(app.state, .runningBackground)
            app.activate()
            XCTAssertTrue(hero.waitForExistence(timeout: 5))
            shot(app, "\(hero.identifier)-interrupted-drag-\(Int(dx))")
            XCTAssertEqual(hero.label, value, "An interrupted drag must not change the set")
            XCTAssertEqual(hero.frame.midX, center, accuracy: 1,
                           "An interrupted drag must not leave the hero shifted")
            XCTAssertEqual(bars.count, states.count)
            for (index, state) in states.enumerated() {
                XCTAssertEqual(bars.element(boundBy: index).value as? String, state,
                               "An interrupted drag must preserve the current set")
            }
        }
    }

    func testShortDragsReturnHeroToCenterWithoutChangingSet() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--route", "session"]
        app.launch()
        let hero = app.staticTexts["hero-weight"]
        XCTAssertTrue(hero.waitForExistence(timeout: 15))
        let value = hero.label
        let window = app.windows.firstMatch
        let start = window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        for dx: CGFloat in [25, -25, 25, -25] {
            start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: dx, dy: 0)))
            XCTAssertEqual(hero.label, value)
            XCTAssertEqual(hero.frame.midX, window.frame.midX, accuracy: 1)
        }
        shot(app, "short-drags-return")
    }
}
