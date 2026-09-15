import XCTest

// 홈 밀리 카드 삭제 (사용자 결정 2026-09-15) — 밀리에서 눌러만 본 책이 캐러셀에 쌓이는데
// 지울 방법이 완독 처리뿐이었다(완독은 서재에 편입시키는 반대 동작).
// 모델 단위테스트가 아니라 XCUITest 로 "지우기 → 확인 → 카드 제외"를 직접 누른다.
final class MillieCardDeleteUITests: XCTestCase {

    private let millieTitleID = "home.carousel.title.millie:삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]"
    private let paperTitleID = "home.carousel.title.book:P1"

    override func setUp() {
        continueAfterFailure = false
    }

    private func hittableButton(_ label: String, in app: XCUIApplication) -> XCUIElement {
        let query = app.buttons.matching(NSPredicate(format: "label == %@", label))
        XCTAssertTrue(query.firstMatch.waitForExistence(timeout: 5), "'\(label)' 버튼이 없음")
        guard let button = query.allElementsBoundByIndex.first(where: \.isHittable) else {
            XCTFail("'\(label)' 버튼 중 화면에서 누를 수 있는 항목이 없음")
            return query.firstMatch
        }
        return button
    }

    func testDeletingMillieCardAsksThenRemovesIt() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards"]
        app.launch()

        let millieTitle = app.staticTexts.matching(identifier: millieTitleID).firstMatch
        let paperTitle = app.staticTexts.matching(identifier: paperTitleID).firstMatch
        XCTAssertTrue(millieTitle.waitForExistence(timeout: 10) && millieTitle.isHittable,
                      "데모의 최신 밀리 카드가 화면에 렌더되지 않음")
        XCTAssertFalse(paperTitle.isHittable, "삭제 전 다음 종이책 카드가 화면에 노출됨")

        hittableButton("지우기", in: app).tap()

        // 되돌릴 수 없으므로 확인을 거친다 (완독과 다른 점)
        let confirm = app.buttons["삭제"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5),
                      "삭제 확인 대화상자가 안 뜸\n\(app.debugDescription)")
        XCTAssertTrue(app.buttons["취소"].exists, "확인 대화상자에 취소가 없음")
        confirm.tap()

        let state = XCTAttachment(screenshot: app.screenshot())
        state.name = "after-millie-delete"
        state.lifetime = .keepAlways
        add(state)

        let paperBecameVisible = NSPredicate { _, _ in paperTitle.isHittable }
        expectation(for: paperBecameVisible, evaluatedWith: paperTitle)
        waitForExpectations(timeout: 5)
        XCTAssertFalse(millieTitle.isHittable, "삭제한 밀리 카드가 아직 화면에 있음")
    }

    func testCancelingKeepsTheCard() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards"]
        app.launch()

        let millieTitle = app.staticTexts.matching(identifier: millieTitleID).firstMatch
        XCTAssertTrue(millieTitle.waitForExistence(timeout: 10) && millieTitle.isHittable)

        hittableButton("지우기", in: app).tap()
        XCTAssertTrue(app.buttons["삭제"].waitForExistence(timeout: 5), "확인 대화상자가 안 뜸")
        let cancel = app.buttons["취소"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 5),
                      "취소 버튼이 없음\n\(app.debugDescription)")
        cancel.tap()

        XCTAssertTrue(millieTitle.waitForExistence(timeout: 5) && millieTitle.isHittable,
                      "취소했는데 카드가 사라짐")
    }

    // 종이책 카드에는 삭제 진입점이 없다 — 서재 ⋯ 메뉴의 책 삭제를 쓴다
    func testPaperCardHasNoDeleteButton() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards,card:1"]
        app.launch()

        let paperTitle = app.staticTexts.matching(identifier: paperTitleID).firstMatch
        XCTAssertTrue(paperTitle.waitForExistence(timeout: 10) && paperTitle.isHittable,
                      "종이책 카드가 선택되지 않음\n\(app.debugDescription)")

        let deletes = app.buttons.matching(NSPredicate(format: "label == %@", "지우기"))
        XCTAssertFalse(deletes.allElementsBoundByIndex.contains(where: \.isHittable),
                       "종이책 카드에 '지우기' 가 노출됨")
    }
}
