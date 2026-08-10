import XCTest

// 유산소 전 흐름 회귀 — 5필드 패널 (설계 2026-08-10, 구 히어로+스와이프 대체).
// ① 5필드(시간·거리·속도·경사·칼로리) 키패드 입력이 패널에 반영되고
// ② 종목 완료·요약·홈까지 보존되며 (2026-08-02 소실 회귀 계승)
// ③ 재실행 시 직전 러닝이 고스트·직전 줄로 프리필된다.
//
// 진입은 홈 CTA → 새 세션 (실사용 경로). --reset 의 데모 활성 세션(id "demo") 위에 기록하면
// 다음 런치의 purgeLegacySeedData 가 id "demo" 를 이력에서 퍼지해 기록이 증발한다
// (2026-08-10 A/B 실측 — 저장 자체는 정상, 하네스 진입 경로 함정).
final class GymCardioUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func enter(_ app: XCUIApplication, field: String, keys: [String]) {
        app.descendants(matching: .any).matching(identifier: field).firstMatch.tap()
        XCTAssertTrue(app.buttons["keypad-done"].waitForExistence(timeout: 5), "\(field) 키패드가 열려야")
        for k in keys { app.buttons["keypad-key-\(k)"].tap() }
        app.buttons["keypad-done"].tap()
        Thread.sleep(forTimeInterval: 0.5)
    }
    private func label(_ app: XCUIApplication, _ id: String) -> String {
        let e = app.staticTexts[id]
        return e.exists ? e.label : "(none)"
    }
    // --empty-session(새 UUID 세션·세션 화면 직행) → 유산소 추가 → 5필드 패널 표시까지.
    // 홈 경유 금지: --reset 은 데모 활성 세션을 만들어 홈이 '운동 중' 카드가 되고(home-cta 없음),
    // 그 데모(id "demo") 위에 기록하면 다음 런치 퍼지에 증발한다 (2026-08-10 스샷 실측).
    private func openFreshTreadmillSession(_ app: XCUIApplication) {
        XCTAssertTrue(app.staticTexts["NEW SESSION"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["유산소"].waitForExistence(timeout: 5))
        app.buttons["유산소"].tap()
        XCTAssertTrue(app.buttons["addex-treadmill"].waitForExistence(timeout: 5))
        app.buttons["addex-treadmill"].tap()
        // empty→active 전환 시 오버레이 시트가 이어 열린다 (SessionScreen onChange) — 닫기
        Thread.sleep(forTimeInterval: 0.8)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
        Thread.sleep(forTimeInterval: 1.0)
        XCTAssertTrue(app.staticTexts["cardio-duration"].waitForExistence(timeout: 5),
                      "유산소 5필드 패널이 표시돼야")
    }

    func testCardioFiveFieldEntrySurvivesFinishSummaryAndHome() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--empty-session"]
        app.launch()
        openFreshTreadmillSession(app)

        // 5필드 입력 — 콘솔 전사 시나리오 (25분 · 3km · 6.0km/h · 3.4% · 81kcal)
        enter(app, field: "cardio-duration", keys: ["2", "5"])
        XCTAssertEqual(label(app, "cardio-duration"), "25")
        enter(app, field: "cardio-distance", keys: ["3"])
        XCTAssertEqual(label(app, "cardio-distance"), "3")
        XCTAssertTrue(app.staticTexts["cardio-pace"].exists, "시간·거리 입력 시 페이스 자동 표시")
        enter(app, field: "cardio-speed", keys: ["6"])
        XCTAssertEqual(label(app, "cardio-speed"), "6.0", "속도는 1dp 고정 표기")
        enter(app, field: "cardio-incline", keys: ["3", ".", "4"])
        XCTAssertEqual(label(app, "cardio-incline"), "3.4")
        enter(app, field: "cardio-calories", keys: ["8", "1"])
        XCTAssertEqual(label(app, "cardio-calories"), "81")
        let a0 = XCTAttachment(screenshot: app.screenshot()); a0.name = "C0-entered"; a0.lifetime = .keepAlways; add(a0)

        // 종목 완료 (꾹누르기 → 완료) — 입력 보존 확인
        let cur = app.descendants(matching: .any).matching(identifier: "rail-current-트레드밀").firstMatch
        cur.press(forDuration: 0.8)
        XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5))
        app.buttons["action-finish"].tap()
        Thread.sleep(forTimeInterval: 1.5)
        app.descendants(matching: .any).matching(identifier: "rail-done-트레드밀").firstMatch.tap()
        Thread.sleep(forTimeInterval: 1.0)
        XCTAssertEqual(label(app, "cardio-duration"), "25", "완료 후에도 시간이 남아야")
        XCTAssertEqual(label(app, "cardio-incline"), "3.4", "완료 후에도 경사가 남아야")
        let a1 = XCTAttachment(screenshot: app.screenshot()); a1.name = "C1-after-finish"; a1.lifetime = .keepAlways; add(a1)

        // 세션 종료 → 요약
        app.staticTexts["session-end"].tap()
        XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5))
        app.buttons["action-finish"].tap()
        XCTAssertTrue(app.staticTexts["TOTAL"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["트레드밀"].exists, "요약 영수증에 유산소 종목이 표기돼야")
        XCTAssertTrue(app.staticTexts["25분 · 3km"].exists, "요약에 시간·거리가 표기돼야")
        let a2 = XCTAttachment(screenshot: app.screenshot()); a2.name = "C2-summary"; a2.lifetime = .keepAlways; add(a2)

        // 홈 → 유산소 행
        app.buttons["summary-home"].firstMatch.tap()
        XCTAssertTrue(app.buttons["home-cta"].waitForExistence(timeout: 8))
        Thread.sleep(forTimeInterval: 1.0)
        let a3 = XCTAttachment(screenshot: app.screenshot()); a3.name = "C3-home"; a3.lifetime = .keepAlways; add(a3)
        XCTAssertFalse(app.staticTexts["기록 없음"].exists, "홈 유산소 행이 '기록 없음'이면 안 된다")
        XCTAssertTrue(app.staticTexts["25분 · 1회"].exists, "홈 유산소 행에 시간·횟수가 표기돼야")
    }

    // 재실행 — 직전 러닝 고스트·직전 줄 (이력 1회라 차트는 없음). 위 테스트의 이력 위에서 실행.
    func testCardioGhostFromPreviousRun() {
        let app = XCUIApplication()
        app.launchArguments = ["--fake-signin", "--empty-session"]   // --reset 없음: 이력 보존
        app.launch()
        openFreshTreadmillSession(app)
        XCTAssertTrue(app.staticTexts["cardio-prev"].exists, "직전 러닝 줄이 표시돼야")
        XCTAssertEqual(label(app, "cardio-duration"), "25", "직전 러닝 시간이 고스트로 프리필돼야")
        XCTAssertEqual(label(app, "cardio-incline"), "3.4", "직전 경사가 고스트로 프리필돼야")
        let g = XCTAttachment(screenshot: app.screenshot()); g.name = "C4-ghost"; g.lifetime = .keepAlways; add(g)
    }
}
