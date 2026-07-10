import XCTest

// 홈 → 세션 라우팅 실탭 검증 (시뮬레이터 XCUITest). CTA 버튼 action 배선의 런타임 정본.
final class GymNavigationUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    // 리셋(데모 활성 세션) → HomeC 이어하기 → 세션 → 꾹누르기 종료 → 세션 삭제(2단계 확인)
    // → HomeA(idle) → CTA → 빈 세션 (spec §5-5·§6-9·§6-1 실탭 여정).
    func testCTANavigatesToSession() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset"]
        app.launch()

        // --reset = 데모 활성 세션 복원 → 홈은 HomeC(이어하기 카드) 분기 (spec §5-5)
        let resume = app.buttons["home-resume"]
        XCTAssertTrue(resume.waitForExistence(timeout: 10), "리셋 직후 홈은 이어하기 카드(HomeC)여야 한다")
        resume.tap()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 5),
                      "이어하기 탭 후 세션 화면이 떠야 한다")

        // 꾹누르기 종료 → 세션 삭제(danger 2단계 확인) → 빈 세션으로 홈 복귀 = HomeA (§6-9)
        app.staticTexts["session-end"].press(forDuration: 0.8)
        let discard = app.buttons["action-discard"]
        XCTAssertTrue(discard.waitForExistence(timeout: 5), "종료 액션시트(세션 삭제)가 떠야 한다")
        discard.tap()
        let confirm = app.buttons["action-confirm"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5), "삭제 확인 단계가 떠야 한다")
        confirm.tap()

        // HomeA 확인 + CTA → 빈 세션 (NEW SESSION + 인라인 운동추가)
        XCTAssertTrue(app.staticTexts["부위 밸런스"].waitForExistence(timeout: 5),
                      "세션 삭제 후 홈은 idle(부위 밸런스)이어야 한다")
        let cta = app.buttons["home-cta"]
        XCTAssertTrue(cta.waitForExistence(timeout: 5), "운동 시작 버튼이 있어야 한다")
        cta.tap()
        XCTAssertTrue(app.staticTexts["NEW SESSION"].waitForExistence(timeout: 5),
                      "빈 세션(NEW SESSION)이 떠야 한다")
    }

    // 홈(HomeC) → 통계 → 탭 전환(종목·부위) → 홈 복귀
    func testStatsNavigationAndTabs() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset"]
        app.launch()
        XCTAssertTrue(app.buttons["home-resume"].waitForExistence(timeout: 10), "리셋 홈은 HomeC")
        app.buttons["home-stats"].tap()
        // 통계 캘린더 탭
        XCTAssertTrue(app.staticTexts["이번 주 볼륨"].waitForExistence(timeout: 5), "통계 캘린더가 떠야 한다")
        // 종목 탭 전환
        app.buttons["stats-tab-종목"].tap()
        XCTAssertTrue(app.staticTexts["자주 한 운동 · 최근 60일"].waitForExistence(timeout: 5), "종목 탭 내용이 떠야 한다")
        // 부위 탭 전환
        app.buttons["stats-tab-부위"].tap()
        XCTAssertTrue(app.staticTexts["최근 60일 부위 분포"].waitForExistence(timeout: 5), "부위 탭 내용이 떠야 한다")
        // 홈 복귀 (활성 세션 유지 → HomeC)
        app.buttons["stats-home"].tap()
        XCTAssertTrue(app.buttons["home-resume"].waitForExistence(timeout: 5), "홈(HomeC)으로 돌아와야 한다")
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

    // 우측 존 탭 = 중량 증가 (§6-3 — 좌30/중40/우30, 바벨 증분 +5)
    func testTapAdjustsWeight() {
        let app = XCUIApplication()
        app.launchArguments = ["--route", "session", "--reset"]
        app.launch()
        let hero = app.staticTexts["hero-weight"]
        XCTAssertTrue(hero.waitForExistence(timeout: 10))
        XCTAssertEqual(hero.label, "70")
        app.otherElements["zone-plus"].firstMatch.tap()   // 상단(중량) 행 우측 존 — 바벨 +5
        let e = expectation(for: NSPredicate(format: "label == %@", "75"), evaluatedWith: hero)
        wait(for: [e], timeout: 5)
        XCTAssertEqual(hero.label, "75", "우측 존 탭 후 중량 +5 (바벨)")
    }

    // 종료 = 꾹누르기 → 액션시트 "종료" → 요약 (§6-9·§7-1 — PWA 탭 무동작 정합)
    func testSessionEndToSummary() {
        let app = XCUIApplication()
        app.launchArguments = ["--route", "session", "--reset"]
        app.launch()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 10))
        app.staticTexts["session-end"].press(forDuration: 0.8)
        let finish = app.buttons["action-finish"]
        XCTAssertTrue(finish.waitForExistence(timeout: 5), "종료 액션시트가 떠야 한다")
        finish.tap()
        XCTAssertTrue(app.staticTexts["TOTAL"].waitForExistence(timeout: 5), "종료 후 요약(TOTAL)이 떠야 한다")
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

    // 세션 → 홈 (툴바 홈 버튼) — 활성 세션 유지 중이므로 HomeC(이어하기)로 복귀 (spec §5-5)
    func testHomeButtonReturnsHome() {
        let app = XCUIApplication()
        app.launchArguments = ["--route", "session", "--reset"]
        app.launch()

        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 10),
                      "세션 화면으로 시작해야 한다")
        // 툴바 홈 버튼 탭
        let homeBtn = app.buttons["session-home"]
        XCTAssertTrue(homeBtn.waitForExistence(timeout: 5), "세션 툴바 홈 버튼이 있어야 한다")
        homeBtn.tap()
        XCTAssertTrue(app.buttons["home-resume"].waitForExistence(timeout: 5),
                      "홈 버튼 탭 후 이어하기 카드(HomeC)로 돌아와야 한다")
    }

    // 프로필 탭 → Google 로그인 버튼 실제 탭 → 실 OAuth 플로우 개시 검증.
    //
    // 자동 어써션 범위(접근성 트리로 쿼리 가능):
    //  1. 로그인 버튼 탭 → ASWebAuthenticationSession 권한 alert("계속") 실제 발생
    //     = CloudStore.signInWithGoogle() 이 유효한 URL로 실제 호출됐다는 증거.
    //
    // 스크린샷 아티팩트로만 남기는 부분(실측 확인됨, 자동 어써션 불가 — 실측된 실제 제약):
    //  ASWebAuthenticationSession 의 WebKit 콘텐츠는 springboard 접근성 트리에 노출되지
    //  않음(직접 확인: 탭 시점 hierarchy 덤프에 상태바 시계 외 아무 요소도 없었음 — 추측 아닌
    //  실측). 그런데도 화면 실제 렌더링은 스크린샷 2회로 확인됨: "accounts.google.com" URL 바,
    //  "Google 계정으로 로그인", 이메일 입력 필드 포커스, 그리고 결정적으로
    //  "tcbooffrdacfatywdzcm.supabase.co(으)로 이동" — Supabase OAuth 리다이렉트가 Google
    //  클라이언트에 정확히 등록돼 있다는 증거. 이메일 입력부터는 사용자 본인 Google 계정이
    //  필요해 여기서 진행하지 않음(그 지점 이후만 사용자 자격증명 필요 — 정직한 경계).
    func testGoogleLoginButtonOpensAuthSession() {
        let app = XCUIApplication()
        app.launchArguments = ["--route", "admin", "--tab", "profile"]
        app.launch()

        let loginBtn = app.buttons["profile-auth"]
        XCTAssertTrue(loginBtn.waitForExistence(timeout: 10), "Google 로그인 버튼이 있어야 한다")
        XCTAssertEqual(loginBtn.label, "Google 로그인")
        loginBtn.tap()

        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let continueBtn = springboard.buttons["계속"].firstMatch
        XCTAssertTrue(continueBtn.waitForExistence(timeout: 5),
                      "ASWebAuthenticationSession 권한 alert('계속')가 떠야 한다 — signInWithGoogle 이 실제 호출됐다는 증거")
        continueBtn.tap()

        // 웹뷰 콜드스타트 대기 후 스크린샷 아티팩트 첨부 (육안 검증용 — 위 주석 실측 근거).
        Thread.sleep(forTimeInterval: 6)
        let shot = XCUIScreen.main.screenshot()
        let attach = XCTAttachment(screenshot: shot)
        attach.name = "google-oauth-page-loaded"
        attach.lifetime = .keepAlways
        add(attach)

        // X 버튼으로 인증 세션 닫기 (좌표는 스크린샷 실측: 좌상단 원형 버튼).
        springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.093, dy: 0.096)).tap()
    }
}
