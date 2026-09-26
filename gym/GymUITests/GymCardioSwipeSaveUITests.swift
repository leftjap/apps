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
    private func openTreadmill(_ app: XCUIApplication) {
        XCTAssertTrue(app.staticTexts["NEW SESSION"].waitForExistence(timeout: 15))
        app.buttons["유산소"].tap()
        XCTAssertTrue(app.buttons["addex-treadmill"].waitForExistence(timeout: 5))
        app.buttons["addex-treadmill"].tap()
        Thread.sleep(forTimeInterval: 0.8)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()   // 오버레이 시트 닫기
        Thread.sleep(forTimeInterval: 1.0)
        XCTAssertTrue(app.otherElements["cardio-card"].firstMatch.waitForExistence(timeout: 5))
    }
    private func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a)
    }

    func testDistanceOnlySwipeSaveGhostAndUndo() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--empty-session"]
        app.launch()
        openTreadmill(app)
        let card = app.otherElements["cardio-card"].firstMatch

        // ① 숫자 탭 → 거리 키패드. 시간 세그가 없어야 한다.
        let h = heroValue(app), sz = app.windows.firstMatch.frame
        app.coordinate(withNormalizedOffset: CGVector(dx: h.frame.midX / sz.width, dy: h.frame.midY / sz.height)).tap()
        XCTAssertTrue(app.buttons["keypad-done"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["시간"].exists, "트레드밀 키패드는 거리만 — 시간 세그 없음")
        for k in ["2", ".", "2"] { app.buttons["keypad-key-\(k)"].tap() }
        app.buttons["keypad-done"].tap()
        Thread.sleep(forTimeInterval: 0.6)
        XCTAssertEqual(distanceLabel(app), "거리", "입력했지만 아직 저장 전")

        // ② 좌 스와이프 = 저장
        card.swipeLeft(); Thread.sleep(forTimeInterval: 0.8)
        shot(app, "swipe-saved")
        XCTAssertEqual(distanceLabel(app), "거리 · 저장됨")
        XCTAssertEqual(heroValue(app).label, "2.2")
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
        openTreadmill(app)
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
