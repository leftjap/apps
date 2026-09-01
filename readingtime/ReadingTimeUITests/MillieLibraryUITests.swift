import XCTest

// 밀리 책 서재 편입 (사용자 결정 2026-09-01) — 홈 완독 → 서재 완독 그리드 → 상세(밀리 변형)
// → 다시 읽기 → 홈 카드 부활까지 실제 제스처로 검증한다. demoCards 시드로 결정적.
final class MillieLibraryUITests: XCTestCase {

    override func setUp() { continueAfterFailure = false }

    private let millieTitle = "삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]"

    private func hittableButton(_ label: String, in app: XCUIApplication) -> XCUIElement {
        let b = app.buttons[label].firstMatch
        XCTAssertTrue(b.waitForExistence(timeout: 10), "버튼 '\(label)' 없음")
        return b
    }

    func testFinishAdoptsIntoLibraryAndDetailShowsMillieCTA() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards"]
        app.launch()

        // 1) 홈 밀리 카드 완독 — 확인 단계 없이 즉시
        hittableButton("다 읽었어요", in: app).tap()

        // 2) 아바타 메뉴 → 서재
        let avatar = app.descendants(matching: .any)["home.avatar"]
        XCTAssertTrue(avatar.waitForExistence(timeout: 10))
        avatar.tap()
        let library = app.staticTexts["서재"]
        XCTAssertTrue(library.waitForExistence(timeout: 5), "아바타 메뉴에 서재 항목이 없음")
        library.tap()

        // 3) 완독 그리드에 편입된 밀리 책 확인 (제목 존재 = 편입 성공)
        let adopted = app.staticTexts
            .matching(NSPredicate(format: "label CONTAINS %@", "삼미 슈퍼스타즈")).firstMatch
        XCTAssertTrue(adopted.waitForExistence(timeout: 10),
                      "완독한 밀리 책이 서재에 편입되지 않음")

        // 4) 탭 → 상세(08) — 완독 상태라 '다시 읽기' CTA
        adopted.tap()
        let detail = app.descendants(matching: .any)["detail.screen"]
        XCTAssertTrue(detail.waitForExistence(timeout: 10), "밀리 책 상세가 열리지 않음")
        XCTAssertTrue(app.staticTexts["완독"].firstMatch.exists, "완독 배지가 없음")
        // 기록 영역 — 일별 자동 기록 행 (세션이 아니라 밀리 히스토리)
        XCTAssertTrue(app.staticTexts
            .matching(NSPredicate(format: "label CONTAINS %@", "자동 기록")).firstMatch
            .waitForExistence(timeout: 5),
            "밀리 상세에 일별 자동 기록 행이 없음")

        // 5) 다시 읽기 → 홈 복귀 없이 완독 해제 → 홈 카드 부활 확인
        app.staticTexts["다시 읽기"].firstMatch.tap()
        // 밀리 분기는 세션 화면으로 가지 않는다 — 상세가 그대로거나 화면 전환 없음.
        // 뒤로 → 서재 → 뒤로 → 홈에서 카드 부활 확인
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.08, dy: 0.075)).tap()   // 상세 back
        XCTAssertFalse(app.staticTexts["폰을 엎어 주세요"].exists, "밀리 다시 읽기가 세션을 시작했다")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.08, dy: 0.075)).tap()   // 서재 back
        let revived = app.staticTexts
            .matching(identifier: "home.carousel.title.millie:\(millieTitle)").firstMatch
        XCTAssertTrue(revived.waitForExistence(timeout: 10),
                      "다시 읽기 후 홈 밀리 카드가 부활하지 않음")
    }
}
