import XCTest

// 완독 후 홈·다시 읽기 화면 검증 (483f9e9) — 유닛이 못 덮는 뷰 배선·실렌더 구간.
// 사전 조건: rt.userData 시드 — 몰입(읽는 중, 어제 세션) + 돈의 심리학(완독 4★, 07-05).
//   xcrun simctl spawn <UD> defaults write com.leftjap.readingtime rt.userData -data <hex(JSON)>
// 테스트 순서 의존 (A→B→C, UserDefaults 영속 상태를 이어받음) — XCTest 알파벳 순 실행.
// 오라클은 결과 기반(§lessons 9): 화면의 책 제목·카피 텍스트 존재로 판정, 스크린샷 첨부.
final class RereadCaptureUITests: XCTestCase {

    override func setUp() {
        continueAfterFailure = false
    }

    private func shot(_ name: String) {
        let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    private func launch(_ seq: String = "login") -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", seq]
        app.launch()
        return app
    }

    /// 그리드 항목 — 식별자가 래퍼 계층에 중복 노출될 수 있어 firstMatch 로 고정
    private func gridItem(_ app: XCUIApplication, _ isbn: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: "library.grid.\(isbn)").firstMatch
    }

    private func openLibrary(_ app: XCUIApplication) {
        let avatar = app.descendants(matching: .any)["home.avatar"]
        XCTAssertTrue(avatar.waitForExistence(timeout: 10), "홈 아바타 없음")
        avatar.tap()
        let lib = app.staticTexts["서재"]
        XCTAssertTrue(lib.waitForExistence(timeout: 5), "메뉴에 서재 없음")
        lib.tap()
    }

    // 완독 책 "다시 읽기" — 상세 CTA → 세션 화면 책 표기 → 기록 귀속 → 홈 히어로 복귀
    func testA_rereadFlow() {
        let app = launch()
        XCTAssertTrue(app.staticTexts["몰입"].waitForExistence(timeout: 10), "홈 히어로가 몰입이 아님")
        shot("A1-home-hero-molib")

        openLibrary(app)
        let money = gridItem(app, "9788936434120")
        XCTAssertTrue(money.waitForExistence(timeout: 5), "완독 그리드에 돈의 심리학 없음")
        money.tap()

        let reread = app.staticTexts["다시 읽기"]
        XCTAssertTrue(reread.waitForExistence(timeout: 5), "완독 책 상세에 다시 읽기 CTA 없음")
        XCTAssertFalse(app.staticTexts["이어서 읽기"].exists, "완독 책 상세에 이어서 읽기가 남음")
        shot("A2-detail-reread-cta")
        reread.tap()

        // 03 대기 — 책 칩 = 세션 대상(돈의 심리학)
        let switchTap = app.staticTexts["탭 모드로 전환"]
        XCTAssertTrue(switchTap.waitForExistence(timeout: 5), "03 대기 화면 미진입")
        XCTAssertTrue(app.staticTexts["돈의 심리학"].exists, "03 책 칩이 세션 책이 아님")
        shot("A3-flipwait-session-chip")
        switchTap.tap()

        // 05 탭 기록 — 서브타이틀 = 세션 책
        XCTAssertTrue(app.staticTexts["모건 하우절, 《돈의 심리학》"].waitForExistence(timeout: 5),
                      "05 서브타이틀이 세션 책이 아님")
        shot("A4-tap-recording-subtitle")
        sleep(2)
        app.staticTexts["여기까지 읽기"].tap()

        // 06 완료 — 책 칩 = 세션 책
        XCTAssertTrue(app.staticTexts["기록됐어요"].waitForExistence(timeout: 5), "06 미진입")
        XCTAssertTrue(app.staticTexts["돈의 심리학"].exists, "06 책 칩이 세션 책이 아님")
        shot("A5-done-session-chip")
        app.staticTexts["저장하기"].tap()

        // 홈 — 히어로 = 방금 읽은 재독 책 (max(추가, 최근 세션) 규칙)
        XCTAssertTrue(app.staticTexts["모건 하우절"].waitForExistence(timeout: 10),
                      "홈 히어로가 재독 책으로 안 바뀜")
        XCTAssertTrue(app.staticTexts["돈의 심리학"].exists)
        shot("A6-home-hero-reread-book")
    }

    // 재완독 별점 프리셋(4★ 보존) + 전권 완독 처리
    func testB_refinishPresetsRating() {
        let app = launch()
        openLibrary(app)

        // 재독 중인 돈의 심리학 = 읽는 중 행 (완독 그리드에서 빠짐)
        let money = app.staticTexts["돈의 심리학"]
        XCTAssertTrue(money.waitForExistence(timeout: 5), "읽는 중 섹션에 재독 책 없음")
        XCTAssertFalse(gridItem(app, "9788936434120").exists,
                       "재독 중인데 완독 그리드에 남아 있음")
        shot("B1-library-reread-in-reading")
        money.tap()

        XCTAssertTrue(app.staticTexts["이어서 읽기"].waitForExistence(timeout: 5), "상세 미진입")
        app.staticTexts["완독"].tap()

        // 09 시트 — 기존 별점 4 프리셋 = "아주 좋았어요"
        XCTAssertTrue(app.staticTexts["아주 좋았어요"].waitForExistence(timeout: 5),
                      "별점 4 프리셋 실패")
        shot("B2-finish-sheet-rating-preset")
        app.staticTexts["완독으로 저장"].tap()

        // 서재 복귀 → 몰입도 완독 처리 (다음 테스트의 '전권 완독' 상태 준비)
        let molib = app.staticTexts["몰입"]
        XCTAssertTrue(molib.waitForExistence(timeout: 5), "서재에 몰입 없음")
        molib.tap()
        XCTAssertTrue(app.staticTexts["이어서 읽기"].waitForExistence(timeout: 5), "상세 미진입")
        app.staticTexts["완독"].tap()
        XCTAssertTrue(app.staticTexts["완독으로 저장"].waitForExistence(timeout: 5), "완독 시트 미오픈")
        app.staticTexts["완독으로 저장"].tap()
        XCTAssertTrue(gridItem(app, "9788931009552").waitForExistence(timeout: 5), "완독 그리드에 몰입 없음")
        shot("B3-library-all-finished")
    }

    // 전권 완독 시 홈 = '다음 책' 카피 (온보딩 '첫 책' 아님) + 다시 읽기로 복원
    func testC_nextBookHomeAndRestore() {
        let app = launch()
        XCTAssertTrue(app.staticTexts["다음 책 추가하기"].waitForExistence(timeout: 10),
                      "다음 책 CTA 없음")
        XCTAssertFalse(app.staticTexts["첫 책 추가하기"].exists, "온보딩 카피가 그대로임")
        let hero = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "다음 책은")).firstMatch
        XCTAssertTrue(hero.exists, "다음 책 히어로 카피 없음")
        shot("C1-empty-home-next-book")

        // 복원: 서재 직행 → 몰입 다시 읽기 → 취소 (몰입 = 읽는 중 복귀)
        app.terminate()
        let app2 = launch("login,nav:12")
        let molib = gridItem(app2, "9788931009552")
        XCTAssertTrue(molib.waitForExistence(timeout: 10), "완독 그리드에 몰입 없음")
        molib.tap()
        let reread = app2.staticTexts["다시 읽기"]
        XCTAssertTrue(reread.waitForExistence(timeout: 5), "몰입 상세에 다시 읽기 없음")
        reread.tap()
        let cancel = app2.staticTexts["취소"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 5), "03 대기 미진입")
        cancel.tap()
        XCTAssertTrue(app2.staticTexts["몰입"].waitForExistence(timeout: 10), "홈 히어로 복원 실패")
        shot("C2-home-restored")
    }
}
