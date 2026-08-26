import XCTest

// 홈 파트너 행(함께 읽기) 탭 → 파트너 통계 진입 + 뒤로가기 홈 복귀 — 뷰 배선 구간.
// (statsSubject 전환 로직은 유닛(RTPartnerTests)이 덮음 — 여기는 제스처→라우팅→렌더 연결.)
// demoPartner 시드로 partnerData 주입(백엔드 배선 전 검증 경로).
final class PartnerRowUITests: XCTestCase {

    override func setUp() { continueAfterFailure = false }

    func testTappingPartnerRowOpensPartnerStatsAndBackReturnsHome() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards,demoPartner"]
        app.launch()

        let row = app.descendants(matching: .any)["home.partnerRow"]
        XCTAssertTrue(row.waitForExistence(timeout: 10), "홈에 파트너 행이 없다 (demoPartner 주입 실패?)")
        row.tap()

        // 파트너 통계 헤더 — "소연의 기록"
        let title = app.staticTexts["소연의 기록"]
        XCTAssertTrue(title.waitForExistence(timeout: 10), "파트너 통계로 진입하지 않음 (헤더 '소연의 기록' 없음)")

        // 뒤로가기(헤더 back 좌상단) → 홈 복귀 + statsSubject .me 리셋
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.06, dy: 0.075)).tap()
        XCTAssertTrue(row.waitForExistence(timeout: 10), "뒤로가기가 홈으로 복귀하지 않음")
    }
}
