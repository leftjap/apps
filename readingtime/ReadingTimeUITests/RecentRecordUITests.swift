import XCTest

// 홈 '마지막 기록' 행 탭 → 책 상세(08) 진입 + 뒤로가기가 홈으로 복귀하는지 — 뷰 배선 구간.
// (openRecentDetail·detailOrigin 로직은 유닛이 덮음 — 여기는 제스처→라우팅→렌더 연결만)
// demoCards 로 등록 책·세션을 주입해 시뮬레이터의 잔존 데이터에 의존하지 않는다.
//
// demoCards 는 밀리 기록(2시간 전)이 종이 세션(어제 정오)보다 최신이라 행에 밀리 책이 뜬다.
// 그 상태의 탭은 이동하지 않는 것이 정상이다(밀리는 08 상세가 없다 — 종이책 상세로 새면
// 행에 뜬 책과 열리는 책이 달라진다, 2026-09-15). 배선을 보려면 밀리를 먼저 지워
// 행이 종이 기록을 가리키게 만든다.
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

        // 밀리 기록이 최신인 동안은 이동하지 않는다
        row.tap()
        XCTAssertFalse(app.descendants(matching: .any)["detail.screen"].waitForExistence(timeout: 2),
                       "밀리 기록이 뜬 행을 탭했는데 종이책 상세가 열림")

        // 밀리 카드를 지워 행이 종이 기록을 가리키게 한 뒤 배선을 본다
        let delete = app.buttons["home.card.delete"].firstMatch
        XCTAssertTrue(delete.waitForExistence(timeout: 5), "밀리 카드 '지우기' 가 없음")
        delete.tap()
        let confirm = app.buttons["삭제"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5), "삭제 확인이 안 뜸")
        confirm.tap()

        XCTAssertTrue(row.waitForExistence(timeout: 5), "삭제 뒤 마지막 기록 행이 사라짐")
        row.tap()

        let detail = app.descendants(matching: .any)["detail.screen"]
        XCTAssertTrue(detail.waitForExistence(timeout: 10), "상세(08)로 진입하지 않음")

        // 뒤로가기(헤더 back, 좌상단) → 홈 복귀 (detailOrigin=.home — 서재로 떨어지면 결함)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.08, dy: 0.075)).tap()
        XCTAssertTrue(row.waitForExistence(timeout: 10),
                      "뒤로가기가 홈으로 복귀하지 않음 (서재 하드코딩 회귀?)")
    }
}
