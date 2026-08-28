import XCTest

// 유산소 칼로리 증분 — 10 → 1 (사용자 2026-08-28: 콘솔이 46·88 처럼 1 단위라 10 단위로는 못 맞춤).
// 실제 앱에서 탭 존을 눌러 검증한다 (수식 단위테스트만으로는 화면 경로가 안 덮인다).
//
// 카드 전체에 `.accessibilityIdentifier("cardio-card")` 가 걸려 자식 식별자가 전부 덮이므로
// (실측: 모든 하위 Text 의 identifier 가 "cardio-card"), 히어로 숫자는 **가장 큰 Text** 로 찾고
// ± 존은 좌표로 누른다.
final class GymCardioStepUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    /// 카드 안에서 가장 높이가 큰 Text = 히어로 숫자 (mono 100/88/76pt).
    private func heroValue(_ app: XCUIApplication) -> (label: String, frame: CGRect) {
        var best = (label: "(none)", frame: CGRect.zero)
        for e in app.staticTexts.allElementsBoundByIndex where e.identifier == "cardio-card" {
            let f = e.frame
            if f.height > best.frame.height { best = (e.label, f) }
        }
        return best
    }

    func testCalorieStepIsOne() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--empty-session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["NEW SESSION"].waitForExistence(timeout: 15))
        app.buttons["유산소"].tap()
        XCTAssertTrue(app.buttons["addex-treadmill"].waitForExistence(timeout: 5))
        app.buttons["addex-treadmill"].tap()
        Thread.sleep(forTimeInterval: 0.8)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()   // 시트 닫기
        Thread.sleep(forTimeInterval: 1.2)

        let card = app.otherElements["cardio-card"].firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 5), "유산소 카드가 떠야")
        // 시간 → 거리 → 칼로리
        for _ in 0..<2 { card.swipeLeft(); Thread.sleep(forTimeInterval: 0.7) }

        let sz = app.windows.firstMatch.frame
        let h0 = heroValue(app)
        XCTAssertGreaterThan(h0.frame.height, 40, "히어로 숫자를 찾아야 (실측 높이 \(h0.frame.height))")
        let before = Int(h0.label) ?? -1
        XCTAssertGreaterThanOrEqual(before, 0, "칼로리 값 파싱 (실측 '\(h0.label)')")

        let y = h0.frame.midY / sz.height
        let plus = CGVector(dx: (sz.width - 24) / sz.width, dy: y)
        let minus = CGVector(dx: 24 / sz.width, dy: y)

        app.coordinate(withNormalizedOffset: plus).tap()
        Thread.sleep(forTimeInterval: 0.7)
        XCTAssertEqual(Int(heroValue(app).label) ?? -1, before + 1, "+ 존 탭 = 1kcal 증가 (종전 10)")

        app.coordinate(withNormalizedOffset: plus).tap()
        Thread.sleep(forTimeInterval: 0.7)
        XCTAssertEqual(Int(heroValue(app).label) ?? -1, before + 2, "연타도 1씩")

        app.coordinate(withNormalizedOffset: minus).tap()
        Thread.sleep(forTimeInterval: 0.7)
        XCTAssertEqual(Int(heroValue(app).label) ?? -1, before + 1, "− 존 탭 = 1kcal 감소")

        let a = XCTAttachment(screenshot: app.screenshot()); a.name = "cardio-calories"
        a.lifetime = .keepAlways; add(a)
    }
}
