import XCTest

// 유산소 전 흐름 회귀 (실기기 보고 2026-08-02) — 입력(분·km)이 종목 완료·요약·홈까지 보존돼야 한다.
// 결함: 유산소 세트는 스와이프 done 경로가 없어 finishBlock 이 입력 세트를 폐기 → 히어로 0/0,
// 요약 누락, 홈 '기록 없음'. isCardio 보존 + endSession 확정으로 수정.
final class GymCardioUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testCardioEntrySurvivesFinishSummaryAndHome() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--route", "session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 15))

        // 유산소(트레드밀) 추가
        app.buttons["rail-add"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'addex-'"))
            .firstMatch.waitForExistence(timeout: 5))
        app.buttons["유산소"].tap()
        XCTAssertTrue(app.buttons["addex-treadmill"].waitForExistence(timeout: 5))
        app.buttons["addex-treadmill"].tap()
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "rail-upcoming-트레드밀")
            .firstMatch.waitForExistence(timeout: 5))

        // 트레드밀로 전환
        app.descendants(matching: .any).matching(identifier: "rail-upcoming-트레드밀").firstMatch.tap()
        Thread.sleep(forTimeInterval: 1.3)
        let hero = app.staticTexts["hero-weight"]
        print("PROBE hero-top(분)=\(hero.exists ? hero.label : "none")")

        // 시간 입력: 상단 존 탭 → 키패드 25 → 완료
        hero.tap()
        XCTAssertTrue(app.buttons["keypad-done"].waitForExistence(timeout: 5), "키패드가 열려야")
        app.buttons["keypad-key-2"].tap(); app.buttons["keypad-key-5"].tap()
        app.buttons["keypad-done"].tap()
        Thread.sleep(forTimeInterval: 0.6)
        print("PROBE after-duration hero=\(hero.label)")

        // 거리 입력: 하단(횟수 행) 존 탭 → 3 → 완료
        let reps = app.staticTexts["hero-reps"]
        print("PROBE reps exists=\(reps.exists) label=\(reps.exists ? reps.label : "-")")
        reps.tap()
        XCTAssertTrue(app.buttons["keypad-done"].waitForExistence(timeout: 5))
        app.buttons["keypad-key-3"].tap()
        app.buttons["keypad-done"].tap()
        Thread.sleep(forTimeInterval: 0.6)
        print("PROBE after-distance hero=\(hero.label) reps=\(reps.exists ? reps.label : "-")")

        // 종목 완료 (꾹누르기 → 완료)
        let cur = app.descendants(matching: .any).matching(identifier: "rail-current-트레드밀").firstMatch
        cur.press(forDuration: 0.8)
        XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5))
        app.buttons["action-finish"].tap()
        Thread.sleep(forTimeInterval: 1.5)
        print("PROBE after-finish done-chip=\(app.descendants(matching: .any).matching(identifier: "rail-done-트레드밀").firstMatch.exists)")
        // 완료 칩 탭 → 히어로 read-only 표시값
        app.descendants(matching: .any).matching(identifier: "rail-done-트레드밀").firstMatch.tap()
        Thread.sleep(forTimeInterval: 1.0)
        XCTAssertEqual(hero.label, "25", "완료 후에도 입력한 시간(분)이 히어로에 남아야 한다")
        XCTAssertEqual(reps.label, "3", "완료 후에도 입력한 거리(km)가 남아야 한다")
        let a1 = XCTAttachment(screenshot: app.screenshot()); a1.name = "C1-after-finish"; a1.lifetime = .keepAlways; add(a1)

        // 세션 종료 → 요약
        app.staticTexts["session-end"].tap()
        XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5))
        app.buttons["action-finish"].tap()
        XCTAssertTrue(app.staticTexts["TOTAL"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["트레드밀"].exists, "요약 영수증에 유산소 종목이 표기돼야 한다")
        XCTAssertTrue(app.staticTexts["25분 · 3km"].exists, "요약에 시간·거리가 표기돼야 한다")
        let a2 = XCTAttachment(screenshot: app.screenshot()); a2.name = "C2-summary"; a2.lifetime = .keepAlways; add(a2)

        // 홈 → 유산소 행
        app.buttons["summary-home"].firstMatch.tap()
        XCTAssertTrue(app.buttons["home-cta"].waitForExistence(timeout: 8))
        Thread.sleep(forTimeInterval: 1.0)
        let a3 = XCTAttachment(screenshot: app.screenshot()); a3.name = "C3-home"; a3.lifetime = .keepAlways; add(a3)
        XCTAssertFalse(app.staticTexts["기록 없음"].exists, "홈 유산소 행이 '기록 없음'이면 안 된다")
        XCTAssertTrue(app.staticTexts["25분 · 1회"].exists, "홈 유산소 행에 시간·횟수가 표기돼야 한다")
    }
}
