import XCTest

// 홈 '마지막 기록' 행 탭 → 책 상세(08) 진입 + 뒤로가기가 홈으로 복귀하는지 — 뷰 배선 구간.
// (openRecentDetail·detailOrigin 로직은 유닛이 덮음 — 여기는 제스처→라우팅→렌더 연결만)
// demoCards 로 등록 책·세션을 주입해 시뮬레이터의 잔존 데이터에 의존하지 않는다.
final class RecentRecordUITests: XCTestCase {

    override func setUp() {
        continueAfterFailure = false
    }

    func testTappingRecentRecordOpensDetailAndBackReturnsHome() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards"]
        app.launch()

        let row = app.descendants(matching: .any)["home.recentRow"]
        XCTAssertTrue(row.waitForExistence(timeout: 10), "demoCards 홈에 마지막 기록 행이 없음")
        row.tap()

        let detail = app.descendants(matching: .any)["detail.screen"]
        XCTAssertTrue(detail.waitForExistence(timeout: 10), "상세(08)로 진입하지 않음")

        // 뒤로가기(헤더 back, 좌상단) → 홈 복귀 (detailOrigin=.home — 서재로 떨어지면 결함)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.08, dy: 0.075)).tap()
        XCTAssertTrue(row.waitForExistence(timeout: 10),
                      "뒤로가기가 홈으로 복귀하지 않음 (서재 하드코딩 회귀?)")
    }
}
