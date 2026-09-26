import XCTest

// 유산소 거리 증분 0.1km — 트레드밀은 거리만 받는다 (사용자 2026-09-26, 종전 칼로리 1 단위 검증을 대체).
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

    func testDistanceStepIsPointOne() {
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

        let sz = app.windows.firstMatch.frame
        let h0 = heroValue(app)
        XCTAssertGreaterThan(h0.frame.height, 40, "히어로 숫자를 찾아야 (실측 높이 \(h0.frame.height))")
        XCTAssertEqual(h0.label, "0.0", "이력 없는 첫 러닝 — 거리 0.0 (실측 '\(h0.label)')")

        let y = h0.frame.midY / sz.height
        let plus = CGVector(dx: (sz.width - 24) / sz.width, dy: y)
        let minus = CGVector(dx: 24 / sz.width, dy: y)

        app.coordinate(withNormalizedOffset: plus).tap()
        Thread.sleep(forTimeInterval: 0.7)
        XCTAssertEqual(heroValue(app).label, "0.1", "+ 존 탭 = 0.1km 증가")

        app.coordinate(withNormalizedOffset: plus).tap()
        Thread.sleep(forTimeInterval: 0.7)
        XCTAssertEqual(heroValue(app).label, "0.2", "연타도 0.1씩")

        app.coordinate(withNormalizedOffset: minus).tap()
        Thread.sleep(forTimeInterval: 0.7)
        XCTAssertEqual(heroValue(app).label, "0.1", "− 존 탭 = 0.1km 감소")

        let a = XCTAttachment(screenshot: app.screenshot()); a.name = "cardio-distance-step"
        a.lifetime = .keepAlways; add(a)
    }
}
