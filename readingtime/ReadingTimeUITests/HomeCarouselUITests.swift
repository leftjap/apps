import XCTest

// 홈 밀리 캐러셀 실제 제스처·버튼 배선 검증.
// 모델 단위테스트가 아니라 XCUITest로 "다 읽었어요 → 완독 처리 → 카드 제외"를 직접 누른다.
final class HomeCarouselUITests: XCTestCase {

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

    func testFinishingMillieCardRemovesItAndSelectsNextBook() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards"]
        app.launch()

        let millieTitle = app.staticTexts.matching(identifier: millieTitleID).firstMatch
        let paperTitle = app.staticTexts.matching(identifier: paperTitleID).firstMatch
        XCTAssertTrue(millieTitle.waitForExistence(timeout: 10) && millieTitle.isHittable,
                      "데모의 최신 밀리 카드가 화면에 렌더되지 않음")
        XCTAssertFalse(paperTitle.isHittable, "완독 전 다음 종이책 카드가 화면에 노출됨")
        let finish = hittableButton("다 읽었어요", in: app)

        finish.tap()
        let confirm = hittableButton("완독 처리", in: app)
        confirm.tap()

        let state = XCTAttachment(screenshot: app.screenshot())
        state.name = "after-millie-finish"
        state.lifetime = .keepAlways
        add(state)

        let paperBecameVisible = NSPredicate { _, _ in paperTitle.isHittable }
        expectation(for: paperBecameVisible, evaluatedWith: paperTitle)
        waitForExpectations(timeout: 5)
    }

    func testSwipingCarouselChangesBetweenMillieAndPaperCards() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards"]
        app.launch()

        let currentTitle = app.staticTexts.matching(identifier: millieTitleID).firstMatch
        let paperTitle = app.staticTexts.matching(identifier: paperTitleID).firstMatch
        XCTAssertTrue(currentTitle.waitForExistence(timeout: 10) && currentTitle.isHittable,
                      "홈 캐러셀의 첫 책을 찾을 수 없음")
        _ = hittableButton("다 읽었어요", in: app)
        XCTAssertFalse(paperTitle.isHittable, "스와이프 전 다음 카드가 화면에 노출됨")

        currentTitle.swipeLeft()

        let paperBecameVisible = NSPredicate { _, _ in paperTitle.isHittable }
        expectation(for: paperBecameVisible, evaluatedWith: paperTitle)
        waitForExpectations(timeout: 5)
    }

    func testOnlyMillieCardCanBeFinishedIntoNextBookEmptyHome() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoMillieOnly"]
        app.launch()

        let millieTitle = app.staticTexts.matching(identifier: millieTitleID).firstMatch
        XCTAssertTrue(millieTitle.waitForExistence(timeout: 10) && millieTitle.isHittable,
                      "읽는 중 종이책이 없을 때 최근 밀리 카드가 홈에 표시되지 않음")
        let millieOnly = XCTAttachment(screenshot: app.screenshot())
        millieOnly.name = "millie-only-home"
        millieOnly.lifetime = .keepAlways
        add(millieOnly)

        hittableButton("다 읽었어요", in: app).tap()
        hittableButton("완독 처리", in: app).tap()

        XCTAssertTrue(app.staticTexts["다음 책 추가하기"].waitForExistence(timeout: 5),
                      "마지막 밀리 카드 완독 후 다음 책 빈 홈으로 전환되지 않음")
        let emptyHome = XCTAttachment(screenshot: app.screenshot())
        emptyHome.name = "after-last-millie-finish"
        emptyHome.lifetime = .keepAlways
        add(emptyHome)
    }
}
