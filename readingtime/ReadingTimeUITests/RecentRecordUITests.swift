import XCTest

// 홈 '마지막 기록' 행 탭 → 책 상세(08) 진입 + 뒤로가기가 홈으로 복귀하는지 — 뷰 배선 구간.
// (openRecentDetail·detailOrigin 로직은 유닛이 덮음 — 여기는 제스처→라우팅→렌더 연결만)
//
// 사전 조건: 시뮬 앱에 등록된 책이 있어야 한다 (빈 홈(14)에는 마지막 기록 행이 없음).
// AvatarPickerUITests 의 사진 시딩과 같은 계열의 기기 상태 의존 — 없으면 명시 실패.
final class RecentRecordUITests: XCTestCase {

    override func setUp() {
        continueAfterFailure = false
    }

    func testTappingRecentRecordOpensDetailAndBackReturnsHome() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login"]
        app.launch()

        let row = app.descendants(matching: .any)["home.recentRow"]
        guard row.waitForExistence(timeout: 10) else {
            XCTFail("홈에 마지막 기록 행이 없다 — 등록된 책이 있는 시뮬에서 실행 필요 (빈 홈이면 미충족)")
            return
        }
        row.tap()

        let detail = app.descendants(matching: .any)["detail.screen"]
        XCTAssertTrue(detail.waitForExistence(timeout: 10), "상세(08)로 진입하지 않음")

        // 뒤로가기(헤더 back, 좌상단) → 홈 복귀 (detailOrigin=.home — 서재로 떨어지면 결함)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.08, dy: 0.075)).tap()
        XCTAssertTrue(row.waitForExistence(timeout: 10),
                      "뒤로가기가 홈으로 복귀하지 않음 (서재 하드코딩 회귀?)")
    }
}
