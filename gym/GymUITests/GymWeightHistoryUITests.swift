import XCTest

// 관리 > 체중 탭 입력 기록 — 과거 기록이 10건에서 끊겨 더 볼 수 없었다 (사용자 2026-09-18).
// 헤더가 밝힌 "전체 N건" 이 실제로 스크롤해서 전부 닿는 수인지, 그리고 입력 버튼이 스크롤과
// 무관하게 하단에 남는지 확인한다. 기록은 `--demo-weights` 가 심는다 — 다른 테스트의 `--reset`
// 이 체중까지 비워서, 실데이터에 기대면 전체 실행에서 조용히 skip 된다.
final class GymWeightHistoryUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func launchWeightTab() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--fake-signin", "--demo-weights", "--route", "admin", "--tab", "weight"]
        app.launch()
        XCTAssertTrue(app.staticTexts["weight-hero-num"].waitForExistence(timeout: 15), "체중 탭이 안 떴다")
        return app
    }

    /// 헤더 "전체 N건" 의 N.
    private func totalCount(_ app: XCUIApplication) -> Int? {
        let t = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "전체 ")).firstMatch
        guard t.waitForExistence(timeout: 5) else { return nil }
        return Int(t.label.replacingOccurrences(of: "전체 ", with: "")
                          .replacingOccurrences(of: "건", with: ""))
    }

    func testScrollsThroughEveryWeightEntry() throws {
        let app = launchWeightTab()
        guard let total = totalCount(app) else {
            throw XCTSkip("체중 기록이 없어 스크롤을 검증할 수 없다")
        }
        XCTAssertGreaterThan(total, 10, "10건 이하라 '10건에서 끊김' 회귀를 잡을 수 없다")

        // "M월 d일" 행을 스크롤하며 모은다. 한 화면에 10건 남짓이라 여유 있게 반복한다.
        let dayRow = NSPredicate(format: "label MATCHES %@", "^[0-9]+월 [0-9]+일.*")
        var seen = Set<String>()
        var lastSeenCount = -1
        for _ in 0..<(total / 5 + 6) {
            for e in app.staticTexts.matching(dayRow).allElementsBoundByIndex where e.exists {
                seen.insert(e.label.replacingOccurrences(of: "  오늘", with: ""))
            }
            // 입력 버튼은 스크롤 위치와 무관하게 늘 잡혀야 한다 (하단 고정).
            XCTAssertTrue(app.buttons["weight-input"].exists, "입력 버튼이 스크롤 중 사라졌다")
            if seen.count == lastSeenCount { break }      // 더 내려갈 곳이 없다
            lastSeenCount = seen.count
            app.scrollViews.firstMatch.swipeUp()
        }

        // 오늘 미입력 행이 맨 위에 하나 더 붙을 수 있으므로 total 이상이면 통과.
        XCTAssertGreaterThanOrEqual(seen.count, total,
                                    "헤더는 \(total)건인데 스크롤로 닿은 행은 \(seen.count)건뿐이다")

        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "weight-history-bottom"
        shot.lifetime = .keepAlways
        add(shot)
    }
}
