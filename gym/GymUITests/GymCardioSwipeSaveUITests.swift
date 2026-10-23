import XCTest

// 트레드밀 — 거리 하나만 입력하고 좌 스와이프로 저장 (사용자 2026-09-26).
// ① 키패드는 거리만(시간 세그 없음) ② 좌 스와이프 = 저장 → 라벨 "저장됨"·요약에 거리
// ③ 다음 세션: 입력 없이 좌 스와이프 = 직전 거리 저장 ④ 우 스와이프 = 되돌리기.
final class GymCardioSwipeSaveUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    /// 카드 전체에 `cardio-card` 가 걸려 자식 식별자가 덮인다 — 히어로 숫자는 가장 큰 Text.
    private func cardioTexts(_ app: XCUIApplication) -> [XCUIElement] {
        app.staticTexts.allElementsBoundByIndex.filter { $0.identifier == "cardio-card" }
    }
    private func heroValue(_ app: XCUIApplication) -> (label: String, frame: CGRect) {
        var best = (label: "(none)", frame: CGRect.zero)
        for e in cardioTexts(app) where e.frame.height > best.frame.height { best = (e.label, e.frame) }
        return best
    }
    private func distanceLabel(_ app: XCUIApplication) -> String {
        cardioTexts(app).first { $0.label.hasPrefix("거리") && $0.frame.height < 40 }?.label ?? "(none)"
    }
    private func openCardio(_ app: XCUIApplication, exerciseId: String = "treadmill") {
        XCTAssertTrue(app.staticTexts["NEW SESSION"].waitForExistence(timeout: 15))
        app.buttons["유산소"].tap()
        XCTAssertTrue(app.buttons["addex-\(exerciseId)"].waitForExistence(timeout: 5))
        app.buttons["addex-\(exerciseId)"].tap()
        Thread.sleep(forTimeInterval: 0.8)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()   // 오버레이 시트 닫기
        Thread.sleep(forTimeInterval: 1.0)
        XCTAssertTrue(app.otherElements["cardio-card"].firstMatch.waitForExistence(timeout: 5))
    }
    private func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a)
    }

    func testInterruptedDragReturnsDistanceToCenterWithoutSaving() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--empty-session"]
        app.launch()
        openCardio(app)
        let card = app.otherElements["cardio-card"].firstMatch
        let initialHero = heroValue(app), size = app.windows.firstMatch.frame
        app.coordinate(withNormalizedOffset: CGVector(dx: initialHero.frame.midX / size.width,
                                                     dy: initialHero.frame.midY / size.height)).tap()
        XCTAssertTrue(app.buttons["keypad-done"].waitForExistence(timeout: 5))
        for key in ["2", ".", "2"] { app.buttons["keypad-key-\(key)"].tap() }
        app.buttons["keypad-done"].tap()
        Thread.sleep(forTimeInterval: 0.6)
        let center = heroValue(app).frame.midX
        XCTAssertEqual(heroValue(app).label, "2.2")
        XCTAssertEqual(distanceLabel(app), "거리")

        for offset in [-75.0, 75.0] {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5,
                                                                     dy: heroValue(app).frame.midY / size.height))
            let end = start.withOffset(CGVector(dx: offset, dy: 0))
            let interruption = expectation(description: "Another app interrupts the held cardio drag \(offset)")
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                XCUIApplication(bundleIdentifier: "com.apple.Preferences").activate()
                interruption.fulfill()
            }
            start.press(forDuration: 0.05, thenDragTo: end,
                        withVelocity: .slow, thenHoldForDuration: 3)
            wait(for: [interruption], timeout: 10)
            XCTAssertEqual(app.state, .runningBackground)
            app.activate()
            XCTAssertTrue(card.waitForExistence(timeout: 5))
            shot(app, "cardio-interrupted-drag-\(offset)")
            XCTAssertEqual(heroValue(app).label, "2.2", "An interrupted drag must preserve the entered distance")
            XCTAssertEqual(distanceLabel(app), "거리", "An interrupted drag must not save the distance")
            XCTAssertEqual(heroValue(app).frame.midX, center, accuracy: 1,
                           "An interrupted drag must not leave the distance shifted")
        }

        card.swipeLeft(); Thread.sleep(forTimeInterval: 0.8)
        XCTAssertEqual(distanceLabel(app), "거리 · 저장됨")
        XCTAssertEqual(heroValue(app).frame.midX, center, accuracy: 1)
        card.swipeRight(); Thread.sleep(forTimeInterval: 0.8)
        XCTAssertEqual(distanceLabel(app), "거리")
        XCTAssertEqual(heroValue(app).label, "2.2")
        XCTAssertEqual(heroValue(app).frame.midX, center, accuracy: 1)
    }

    func testDistanceOnlySwipeSaveGhostAndUndo() {
        assertDistanceOnlySwipeSaveGhostAndUndo(exerciseId: "treadmill")
    }

    func testRecumbentBikeDistanceOnlySwipeSaveGhostAndUndo() {
        assertDistanceOnlySwipeSaveGhostAndUndo(exerciseId: "recumbent_bike")
    }

    func testStairClimberDistanceOnlySwipeSaveGhostAndUndo() {
        assertDistanceOnlySwipeSaveGhostAndUndo(exerciseId: "stair_climber")
    }

    func testHipAdductionUsesMachineStackAndManualEntry() {
        assertHipMachine(exerciseId: "hip_adduction", name: "내전근(힙 어덕션)")
    }

    func testHipAbductionUsesMachineStackAndManualEntry() {
        assertHipMachine(exerciseId: "hip_abduction", name: "외전근(힙 어브덕션)")
    }

    private func assertHipMachine(exerciseId: String, name: String) {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--empty-session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["NEW SESSION"].waitForExistence(timeout: 15))
        app.buttons["하체"].tap()
        let exercise = app.buttons["addex-\(exerciseId)"]
        XCTAssertTrue(exercise.waitForExistence(timeout: 5))
        for _ in 0..<3 where !exercise.isHittable { app.swipeUp() }
        XCTAssertTrue(exercise.isHittable)
        XCTAssertTrue(exercise.label.contains(name))
        shot(app, "picker-\(exerciseId)")
        exercise.tap()
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
        let weight = app.staticTexts["hero-weight"]
        XCTAssertTrue(weight.waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["session-exname"].label, name)
        XCTAssertEqual(weight.label, "20")

        func expectWeight(_ value: String) {
            let match = expectation(for: NSPredicate(format: "label == %@", value), evaluatedWith: weight)
            wait(for: [match], timeout: 3)
        }
        func step(_ id: String, _ value: String) {
            let zones = app.descendants(matching: .any).matching(identifier: id).allElementsBoundByIndex
            let zone = zones.min { $0.frame.minY < $1.frame.minY }!
            zone.tap()
            expectWeight(value)
        }
        func enter(_ value: String) {
            weight.tap()
            XCTAssertTrue(app.buttons["keypad-done"].waitForExistence(timeout: 5))
            for key in value { app.buttons["keypad-key-\(key)"].tap() }
            app.buttons["keypad-done"].tap()
            expectWeight(value)
        }
        step("zone-plus", "25")
        step("zone-plus", "32")
        shot(app, "stack-32-\(exerciseId)")
        step("zone-plus", "40")
        step("zone-minus", "32")
        step("zone-minus", "25")
        enter("27.4")
        step("zone-plus", "32")
        enter("27.4")
        step("zone-minus", "25")
        enter("5")
        step("zone-minus", "5")
        enter("100")
        step("zone-plus", "100")
        shot(app, "stack-upper-bound-\(exerciseId)")
    }


    private func assertDistanceOnlySwipeSaveGhostAndUndo(exerciseId: String) {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--empty-session"]
        app.launch()
        openCardio(app, exerciseId: exerciseId)
        let card = app.otherElements["cardio-card"].firstMatch

        // ① 숫자 탭 → 거리 키패드. 시간 세그가 없어야 한다.
        let h = heroValue(app), sz = app.windows.firstMatch.frame
        app.coordinate(withNormalizedOffset: CGVector(dx: h.frame.midX / sz.width, dy: h.frame.midY / sz.height)).tap()
        XCTAssertTrue(app.buttons["keypad-done"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["시간"].exists, "유산소 키패드는 거리만 — 시간 세그 없음")
        for k in ["2", ".", "2"] { app.buttons["keypad-key-\(k)"].tap() }
        app.buttons["keypad-done"].tap()
        Thread.sleep(forTimeInterval: 0.6)
        XCTAssertEqual(distanceLabel(app), "거리", "입력했지만 아직 저장 전")
        XCTAssertEqual(app.descendants(matching: .any)["cardio-week-title"].label, "이번 주 0.0km, 0일")

        // ② 좌 스와이프 = 저장
        card.swipeLeft(); Thread.sleep(forTimeInterval: 0.8)
        shot(app, "swipe-saved")
        XCTAssertEqual(distanceLabel(app), "거리 · 저장됨")
        XCTAssertEqual(heroValue(app).label, "2.2")
        XCTAssertEqual(app.descendants(matching: .any)["cardio-week-title"].label, "이번 주 2.2km, 1일")
        XCTAssertFalse(app.staticTexts["분"].exists || app.staticTexts["kcal"].exists, "시간·칼로리 칸이 없어야")

        app.staticTexts["session-end"].tap()
        XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5))
        app.buttons["action-finish"].tap()
        XCTAssertTrue(app.staticTexts["TOTAL"].waitForExistence(timeout: 5))
        shot(app, "summary")
        XCTAssertTrue(app.staticTexts["2.2km"].exists, "요약에 거리만 표기 (0kg·0분이면 안 됨)")
        app.buttons["summary-home"].firstMatch.tap()
        XCTAssertTrue(app.buttons["home-cta"].waitForExistence(timeout: 8))

        // ③ 다음 세션 — 입력 없이 밀면 직전 거리 2.2 가 저장된다.
        app.terminate()
        app.launchArguments = ["--fake-signin", "--empty-session"]   // 이력 보존
        app.launch()
        openCardio(app, exerciseId: exerciseId)
        XCTAssertEqual(distanceLabel(app), "거리 · 직전 기록")
        card.swipeLeft(); Thread.sleep(forTimeInterval: 0.8)
        XCTAssertEqual(distanceLabel(app), "거리 · 저장됨", "고스트를 밀면 직전 거리가 저장된다")
        XCTAssertEqual(heroValue(app).label, "2.2")

        // ④ 우 스와이프 = 되돌리기 — 값은 남고 저장만 풀린다.
        card.swipeRight(); Thread.sleep(forTimeInterval: 0.8)
        shot(app, "swipe-undo")
        XCTAssertEqual(distanceLabel(app), "거리", "되돌리면 저장 전 상태")
    }
}
