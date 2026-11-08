import XCTest

// 서재 '읽는 중' 카드의 ▶ 는 그 카드의 책으로 기록을 시작해야 한다 — 2026-11-08 검토: isbn 없이 start() 를 불러
// 홈에서 골라 둔 책(없으면 최근 책)으로 기록됐다. demoCards: 홈 첫 카드는 밀리 책, 종이책은 P1 작별하지 않는다(최근)·P2 파친코.
final class LibraryPlayUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testPlayStartsTheTappedBook() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards,nav:12"]
        app.launch()

        let play = app.descendants(matching: .any)["library.play.P2"]
        XCTAssertTrue(play.waitForExistence(timeout: 10), "파친코 카드의 ▶ 가 없음\n\(app.debugDescription)")
        play.tap()
        XCTAssertTrue(app.staticTexts["폰을 엎어 주세요"].waitForExistence(timeout: 10), "03 엎기 대기 화면이 안 뜸")
        XCTAssertTrue(app.staticTexts["파친코"].exists,
                      "▶ 를 누른 파친코가 아니라 다른 책으로 기록이 시작됨\n\(app.debugDescription)")
    }
}
