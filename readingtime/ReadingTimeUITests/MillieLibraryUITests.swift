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
        XCTAssertFalse(app.staticTexts.matching(identifier: "home.carousel.title.millie:4c17703240404997")
                          .firstMatch.exists,
                       "다시 읽기 상태의 밀리 책이 종이 카드로 중복 노출됨")
    }

    func testRereadMillieBookHasNoPlayButtonAndShowsMillieCTA() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards,finishEbook:\(millieTitle),sel:millie:4c17703240404997,reread,nav:12"]
        app.launch()

        // 서재 '읽는 중' 카드 — 밀리 책엔 ▶(종이 세션 시작) 이 없어야 한다
        let paperPlay = app.descendants(matching: .any)["library.play.P1"]
        XCTAssertTrue(paperPlay.waitForExistence(timeout: 10), "종이책 카드의 ▶ 가 없음 (식별자 배선 확인)")
        XCTAssertFalse(app.descendants(matching: .any)["library.play.millie:4c17703240404997"].exists,
                       "밀리 책 카드에 ▶ 가 노출됨 — 탭하면 종이 세션이 시작된다")

        // 카드 탭 → 상세: '밀리의 서재' 비활성 + '완독' 버튼
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "삼미 슈퍼스타즈")).firstMatch.tap()
        XCTAssertTrue(app.staticTexts["밀리의 서재"].waitForExistence(timeout: 10),
                      "미완독 밀리 상세에 '밀리의 서재' 비활성 CTA 가 없음")
        XCTAssertTrue(app.staticTexts["완독"].firstMatch.exists, "완독 버튼이 없음")
        XCTAssertFalse(app.staticTexts["직접 추가"].exists, "밀리 상세에 '직접 추가' 가 노출됨")
    }

    private func launchLongLibrary() throws -> XCUIApplication {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("library-\(UUID().uuidString).json")
        var books: [[String: Any]] = [[
            "isbn": "reading", "title": "Alpha reading", "author": "Reader",
            "publisher": "", "coverUrl": "", "addedAt": "2026-09-01T12:00:00Z", "finished": false
        ]]
        for i in 0..<15 {
            books.append([
                "isbn": "B\(i)", "title": i == 0 ? "Alpha finished" : "Library book \(i)",
                "author": "Writer", "publisher": "", "coverUrl": "",
                "addedAt": String(format: "2026-09-%02dT12:00:00Z", 30 - i), "finished": true
            ])
        }
        try JSONSerialization.data(withJSONObject: ["books": books, "sessions": []]).write(to: file)
        addTeardownBlock { try FileManager.default.removeItem(at: file) }
        let app = XCUIApplication()
        let fixture = ProcessInfo.processInfo.environment["RT_LIBRARY_FIXTURE"] ?? file.path
        app.launchArguments = ["--seq", "login,loadUserData:\(fixture),nav:12"]
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["library.grid.B0"].firstMatch.waitForExistence(timeout: 10),
                      "서재 테스트 데이터가 로드되지 않음")
        return app
    }

    func testLibrarySearchMatchesTitleAndAuthorAndClears() throws {
        let app = try launchLongLibrary()
        let field = app.textFields["library.search"]
        XCTAssertTrue(field.waitForExistence(timeout: 5), "서재 검색창이 입력란이 아님")
        field.tap()
        field.typeText("alpha\n")
        XCTAssertTrue(app.staticTexts["Alpha reading"].exists, "읽는 중 제목 검색이 적용되지 않음")
        XCTAssertTrue(app.descendants(matching: .any)["library.grid.B0"].firstMatch.exists,
                      "완독 제목 검색이 적용되지 않음")
        XCTAssertFalse(app.descendants(matching: .any)["library.grid.B1"].firstMatch.exists,
                       "검색과 무관한 책이 남음")

        let clear = app.buttons["library.search.clear"]
        XCTAssertTrue(clear.exists)
        clear.tap()
        field.tap()
        field.typeText("writer\n")
        XCTAssertFalse(app.staticTexts["Alpha reading"].exists, "저자 검색에서 무관한 읽는 중 책이 남음")
        XCTAssertTrue(app.descendants(matching: .any)["library.grid.B1"].firstMatch.exists, "저자로 검색되지 않음")

        clear.tap()
        XCTAssertTrue(app.staticTexts["Alpha reading"].exists, "검색을 비워도 읽는 중 목록이 복구되지 않음")
        XCTAssertTrue(app.descendants(matching: .any)["library.grid.B1"].firstMatch.exists, "검색을 비워도 완독 목록이 복구되지 않음")
    }

    func testLibrarySearchWithoutMatchesShowsEmptyState() throws {
        let app = try launchLongLibrary()
        let field = app.textFields["library.search"]
        XCTAssertTrue(field.waitForExistence(timeout: 5), "서재 검색창이 입력란이 아님")
        field.tap()
        field.typeText("no-such-book\n")
        XCTAssertTrue(app.staticTexts["library.empty"].waitForExistence(timeout: 5), "검색 결과 없음 안내가 없음")
        XCTAssertFalse(app.staticTexts["Alpha reading"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["library.grid.B0"].firstMatch.exists)
    }

    func testLongLibraryScrollReachesLastBookAndKeepsHeaderVisible() throws {
        let app = try launchLongLibrary()
        let last = app.descendants(matching: .any)["library.grid.B14"].firstMatch
        for _ in 0..<6 {
            if last.frame.maxY <= app.frame.maxY - 24, last.frame.minY > 0 { break }
            app.swipeUp()
        }
        XCTAssertLessThanOrEqual(last.frame.maxY, app.frame.maxY - 24,
                                 "목록이 스크롤되지 않아 마지막 책이 화면 아래에 잘림")
        XCTAssertTrue(app.staticTexts["서재"].isHittable, "긴 목록에서 서재 헤더가 화면 밖으로 밀림")
        last.tap()
        XCTAssertTrue(app.descendants(matching: .any)["detail.screen"].waitForExistence(timeout: 5),
                      "스크롤한 마지막 책의 상세를 열 수 없음")
        XCTAssertTrue(app.staticTexts["Library book 14"].firstMatch.exists)
    }
}
