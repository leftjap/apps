import XCTest

// 홈 → 세션 라우팅 실탭 검증 (시뮬레이터 XCUITest). CTA 버튼 action 배선의 런타임 정본.
final class GymNavigationUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testCTANavigatesToSession() {
        let app = XCUIApplication()
        app.launch()

        // 홈 화면 확인
        XCTAssertTrue(app.staticTexts["부위 밸런스"].waitForExistence(timeout: 10),
                      "홈 화면(부위 밸런스)이 떠야 한다")
        XCTAssertFalse(app.staticTexts["직전 세션 기록"].exists,
                       "세션 전환 전엔 직전 세션 기록이 없어야 한다")

        // 운동 시작 CTA 실제 탭
        let cta = app.buttons["home-cta"]
        XCTAssertTrue(cta.waitForExistence(timeout: 5), "운동 시작 버튼이 있어야 한다")
        cta.tap()

        // 세션 화면 전환 확인 (직전 세션 기록 + 종료)
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 5),
                      "CTA 탭 후 세션 화면(직전 세션 기록)이 떠야 한다")
        XCTAssertTrue(app.staticTexts["종료"].exists, "세션 툴바 종료가 있어야 한다")
    }

    // 홈 → 통계 → 탭 전환(종목) → 홈 복귀
    func testStatsNavigationAndTabs() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["부위 밸런스"].waitForExistence(timeout: 10))
        app.buttons["home-stats"].tap()
        // 통계 캘린더 탭
        XCTAssertTrue(app.staticTexts["이번 주 볼륨"].waitForExistence(timeout: 5), "통계 캘린더가 떠야 한다")
        // 종목 탭 전환
        app.buttons["stats-tab-종목"].tap()
        XCTAssertTrue(app.staticTexts["자주 한 운동 · 최근 60일"].waitForExistence(timeout: 5), "종목 탭 내용이 떠야 한다")
        // 부위 탭 전환
        app.buttons["stats-tab-부위"].tap()
        XCTAssertTrue(app.staticTexts["최근 60일 부위 분포"].waitForExistence(timeout: 5), "부위 탭 내용이 떠야 한다")
        // 홈 복귀
        app.buttons["stats-home"].tap()
        XCTAssertTrue(app.staticTexts["부위 밸런스"].waitForExistence(timeout: 5), "홈으로 돌아와야 한다")
    }

    // 좌스와이프 = 세트완료 → 현재 세트 중량이 다음 세트로 갱신 (상태머신 실 인터랙션)
    func testSwipeCompletesSet() {
        let app = XCUIApplication()
        app.launchArguments = ["--route", "session", "--reset"]
        app.launch()
        let hero = app.staticTexts["hero-weight"]
        XCTAssertTrue(hero.waitForExistence(timeout: 10), "히어로 중량이 있어야 한다")
        XCTAssertEqual(hero.label, "70", "현재 세트(벤치프레스 3번째)는 70kg")
        // 히어로 좌스와이프 = 세트완료 → 다음 세트(72kg)로 진행
        hero.swipeLeft()
        let expect = expectation(for: NSPredicate(format: "label == %@", "72"), evaluatedWith: hero)
        wait(for: [expect], timeout: 5)
        XCTAssertEqual(hero.label, "72", "세트완료 후 다음 세트 72kg 로 갱신돼야 한다")
    }

    // 로컬 영속 — 세트완료 후 앱 재시작해도 상태 유지 (UserDefaults JSON)
    func testSessionPersistsAcrossRelaunch() {
        let app = XCUIApplication()
        app.launchArguments = ["--route", "session", "--reset"]   // 깨끗한 시작
        app.launch()
        let hero = app.staticTexts["hero-weight"]
        XCTAssertTrue(hero.waitForExistence(timeout: 10))
        XCTAssertEqual(hero.label, "70")
        hero.swipeLeft()   // 세트완료 → 72 + 영속 저장
        let e = expectation(for: NSPredicate(format: "label == %@", "72"), evaluatedWith: hero)
        wait(for: [e], timeout: 5)

        // 앱 재시작 (--reset 없이 = 영속 로드)
        app.terminate()
        app.launchArguments = ["--route", "session"]
        app.launch()
        let hero2 = app.staticTexts["hero-weight"]
        XCTAssertTrue(hero2.waitForExistence(timeout: 10))
        XCTAssertEqual(hero2.label, "72", "재시작해도 완료한 세트 상태가 유지돼야 한다(72)")
    }

    // 세션 → 홈 (툴바 홈 버튼) 역방향 검증
    func testHomeButtonReturnsHome() {
        let app = XCUIApplication()
        app.launchArguments = ["--route", "session"]
        app.launch()

        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 10),
                      "세션 화면으로 시작해야 한다")
        // 툴바 홈 버튼 탭
        let homeBtn = app.buttons["session-home"]
        XCTAssertTrue(homeBtn.waitForExistence(timeout: 5), "세션 툴바 홈 버튼이 있어야 한다")
        homeBtn.tap()
        XCTAssertTrue(app.staticTexts["부위 밸런스"].waitForExistence(timeout: 5),
                      "홈 버튼 탭 후 홈(부위 밸런스)으로 돌아와야 한다")
    }
}
