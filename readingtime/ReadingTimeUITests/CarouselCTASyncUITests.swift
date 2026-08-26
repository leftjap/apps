import XCTest

// 캐러셀 카드 전환 시 하단 CTA 가 함께 갱신되는지 — 실기기 버그(2026-08-26):
// 종이책 카드로 넘겼는데 CTA 가 '밀리에서 자동 기록 중' 으로 남아 있었다.
final class CarouselCTASyncUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testSwipingToPaperCardUpdatesCTA() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards"]
        app.launch()

        let millieTitle = app.staticTexts
            .matching(identifier: "home.carousel.title.millie:삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]").firstMatch
        XCTAssertTrue(millieTitle.waitForExistence(timeout: 10), "첫 밀리 카드 없음")
        XCTAssertTrue(app.staticTexts["밀리에서 자동 기록 중"].exists, "밀리 카드인데 밀리 CTA 가 아님")

        millieTitle.swipeLeft()   // 다음 카드 = 종이책

        let paperTitle = app.staticTexts.matching(identifier: "home.carousel.title.book:P1").firstMatch
        XCTAssertTrue(paperTitle.waitForExistence(timeout: 5) && paperTitle.isHittable, "종이책 카드로 전환 안 됨")
        // 핵심: 카드가 종이책이면 CTA 도 기록 진입점이어야 한다
        XCTAssertTrue(app.staticTexts["엎으면 이어 읽어요"].waitForExistence(timeout: 3),
                      "종이책 카드인데 기록 CTA 가 없음 (CTA 미갱신 버그)")
        XCTAssertFalse(app.staticTexts["밀리에서 자동 기록 중"].exists,
                       "종이책 카드인데 밀리 CTA 가 남아 있음")
    }
}
