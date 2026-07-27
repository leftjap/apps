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

        // HomeA 확인 + CTA → 빈 세션 (NEW SESSION + 인라인 운동추가).
        // idle 판별자는 home-cta — 부위 밸런스는 이제 HomeC 에도 있어 판별력이 없다 (2026-07-23).
        let cta = app.buttons["home-cta"]
        XCTAssertTrue(cta.waitForExistence(timeout: 5), "세션 삭제 후 홈은 idle(운동 시작 CTA)이어야 한다")
        cta.tap()
        XCTAssertTrue(app.staticTexts["NEW SESSION"].waitForExistence(timeout: 5),
                      "빈 세션(NEW SESSION)이 떠야 한다")
    }

    // 운동 중 홈(HomeC) — 부위 밸런스가 실시간으로 보이고, 이어하기는 하단 콤팩트 카드 (사용자 2026-07-23).
    // 데모 활성 세션 = 가슴 done 5세트 (인클라인 3 + 벤치 2) → 밸런스가 진행 중 세션을 즉시 반영해야 한다.
    func testActiveHomeShowsBalanceWithResumeBelow() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset"]
        app.launch()

        let resume = app.buttons["home-resume"]
        XCTAssertTrue(resume.waitForExistence(timeout: 10), "활성 세션 홈은 HomeC")
        let balTitle = app.staticTexts["부위 밸런스"]
        XCTAssertTrue(balTitle.exists, "운동 중에도 부위 밸런스가 보여야 한다")
        XCTAssertTrue(app.staticTexts["가슴"].exists, "부위 라벨(차트)이 그려져야 한다")
        // 실시간 반영 — 데모 활성 세션 done 세트(인클라인 3 + 벤치 2 = 가슴 5)가 이번 주 집계에 포함
        XCTAssertTrue(app.staticTexts["5"].firstMatch.waitForExistence(timeout: 5),
                      "진행 중 세션의 done 세트(가슴 5)가 밸런스에 반영되어야 한다")
        XCTAssertGreaterThan(resume.frame.minY, balTitle.frame.maxY,
                             "이어하기 카드는 밸런스 아래에 있어야 한다")
        // 이어하기 탭 → 세션 복귀
        resume.tap()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 5),
                      "이어하기 탭 후 세션 화면이 떠야 한다")
    }

    // 홈 캘린더 2주 표시 (사용자 2026-07-25) — 새 주 시작 시 1주만으론 흐름·이력이 안 보인다.
    // 요일 헤더 1줄 공유 + [지난주 · 이번 주] 2행, 지난주 날짜도 탭하면 날짜 상세가 열린다.
    func testHomeCalendarShowsTwoWeeksAndPastDayIsTappable() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset"]
        app.launch()
        XCTAssertTrue(app.buttons["home-resume"].waitForExistence(timeout: 10), "활성 세션 홈은 HomeC")

        // 오늘이 속한 주의 월요일과 그 전주 월요일 (KST) — 두 행 모두 렌더돼야 한다
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Seoul")!
        cal.firstWeekday = 2   // 월요일 시작 — GymAppModel.kst 정합 (기본 일요일이면 주 경계가 어긋난다)
        let fmt = DateFormatter()
        fmt.calendar = cal; fmt.timeZone = cal.timeZone
        fmt.locale = Locale(identifier: "en_US_POSIX"); fmt.dateFormat = "yyyy-MM-dd"
        let today = Date()
        let thisMon = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: today))!
        let prevMon = cal.date(byAdding: .day, value: -7, to: thisMon)!

        let curCell = app.descendants(matching: .any)
            .matching(identifier: "home-day-\(fmt.string(from: thisMon))").firstMatch
        let prevCell = app.descendants(matching: .any)
            .matching(identifier: "home-day-\(fmt.string(from: prevMon))").firstMatch
        XCTAssertTrue(prevCell.waitForExistence(timeout: 5), "지난주 행(월요일 셀)이 있어야 한다")
        XCTAssertTrue(curCell.exists, "이번 주 행(월요일 셀)이 있어야 한다")
        XCTAssertLessThan(prevCell.frame.maxY, curCell.frame.minY + 1,
                          "지난주 행이 이번 주 행 위에 있어야 한다")
        XCTAssertEqual(prevCell.frame.minX, curCell.frame.minX, accuracy: 1,
                       "같은 요일이 같은 열에 정렬돼야 한다 (달력 주 정렬)")
        // 요일 헤더는 한 줄만 — 두 행이 공유
        XCTAssertEqual(app.staticTexts.matching(identifier: "월").count, 1, "요일 헤더는 1줄 공유")

        // 지난주 날짜 탭 → 날짜 상세 시트
        prevCell.tap()
        XCTAssertTrue(app.staticTexts["daydetail-date"].waitForExistence(timeout: 5),
                      "지난주 날짜도 탭하면 상세가 열려야 한다")
    }

    // 전 종목 완료 후 홈 — 이어하기 카드가 종목 이름 공백 + "SET 1/0" 으로 깨지지 않아야 한다
    // (2026-07-24 감사 확정 #11·#12). 마지막 종목으로 폴백하고 '마무리' 로 표기한다.
    func testAllDoneHomeResumeCardIsNotBroken() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--route", "session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 15))

        // 데모 3종목을 순서대로 완료 → 전 종목 완료(히어로 read-only)
        for name in ["벤치프레스", "덤벨 플라이", "케이블 크로스오버"] {
            let cur = app.descendants(matching: .any)
                .matching(identifier: "rail-current-\(name)").firstMatch
            XCTAssertTrue(cur.waitForExistence(timeout: 5))
            cur.press(forDuration: 0.8)
            XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5))
            app.buttons["action-finish"].tap()
        }
        XCTAssertTrue(app.staticTexts["hero-done"].waitForExistence(timeout: 5))

        // 세션을 종료하지 않고 홈으로
        app.buttons["session-home"].tap()
        let resumeName = app.staticTexts["resume-exname"]
        XCTAssertTrue(resumeName.waitForExistence(timeout: 5), "홈은 이어하기 카드(HomeC)")
        XCTAssertFalse(resumeName.label.isEmpty, "종목 이름이 공백이면 안 된다 (실측 '\(resumeName.label)')")
        XCTAssertTrue(app.staticTexts["마무리"].exists, "전 종목 완료면 '운동 중' 이 아니라 '마무리'")
        XCTAssertFalse(app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'SET 1/0'"))
            .firstMatch.exists, "SET 1/0 같은 깨진 세트 표기가 없어야 한다")
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

    // 좌스와이프 = 세트완료 (상태머신 실 인터랙션). --reset = 히메틱(무이력·로그아웃) —
    // 커밋 마커는 세션 볼륨 1,250→1,810 (결정값). 무이력 상속(§6-3-3)으로 다음 세트 중량은 70 유지.
    // (구버전 기대값 "72"는 컨테이너에 벤치 이력이 있을 때만 성립 — 2026-07-10 계측으로 규명)
    func testSwipeCompletesSet() {
        let app = XCUIApplication()
        app.launchArguments = ["--route", "session", "--reset"]
        app.launch()
        let hero = app.staticTexts["hero-weight"]
        XCTAssertTrue(hero.waitForExistence(timeout: 10), "히어로 중량이 있어야 한다")
        XCTAssertEqual(hero.label, "70", "현재 세트(벤치프레스 3번째)는 70kg")
        hero.swipeLeft()
        XCTAssertTrue(app.staticTexts["1,810"].firstMatch.waitForExistence(timeout: 5),
                      "세트완료 후 세션 볼륨 1,810 이 떠야 한다 (1,250+70×8)")
        XCTAssertEqual(hero.label, "70", "무이력 — 커밋값 70 이 다음 프리셋에 상속돼야 한다")
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

    // 종료 = 탭 → 액션시트 "종료" → 요약 (PWA #sessionEndBtn click 정합 — 실기기 사용자 보고로 수정)
    func testSessionEndToSummary() {
        let app = XCUIApplication()
        app.launchArguments = ["--route", "session", "--reset"]
        app.launch()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 10))
        app.staticTexts["session-end"].tap()   // 탭으로 열려야 한다 (longpress 도 동일 메뉴)
        let finish = app.buttons["action-finish"]
        XCTAssertTrue(finish.waitForExistence(timeout: 5), "종료 탭으로 액션시트가 떠야 한다")
        finish.tap()
        XCTAssertTrue(app.staticTexts["TOTAL"].waitForExistence(timeout: 5), "종료 후 요약(TOTAL)이 떠야 한다")
    }

    // 로컬 영속 — 세트완료 후 앱 재시작해도 상태 유지 (UserDefaults JSON). 히메틱 마커 1,810.
    func testSessionPersistsAcrossRelaunch() {
        let app = XCUIApplication()
        app.launchArguments = ["--route", "session", "--reset"]   // 히메틱 시작
        app.launch()
        let hero = app.staticTexts["hero-weight"]
        XCTAssertTrue(hero.waitForExistence(timeout: 10))
        XCTAssertEqual(hero.label, "70")
        hero.swipeLeft()   // 세트완료 → 볼륨 1,810 + 영속 저장
        XCTAssertTrue(app.staticTexts["1,810"].firstMatch.waitForExistence(timeout: 5))

        // 앱 재시작 (--reset 없이 = 영속 로드)
        app.terminate()
        app.launchArguments = ["--route", "session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["hero-weight"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["1,810"].firstMatch.waitForExistence(timeout: 5),
                      "재시작해도 완료 세트 볼륨(1,810)이 유지돼야 한다")
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

    // 실계정 세션 주입 → 실서버 5테이블 pull 반영 (E2E — 실기기 검증용).
    // 토큰은 TEST_RUNNER_GYM_AT / TEST_RUNNER_GYM_RT 환경변수로 전달 (없으면 skip — 평시 스위트 무영향).
    // 마커는 홈 상태·날짜 무관: 프로필 동기화 카드 실계정 이메일 + 체중 탭 실측치.
    // (구버전은 "목요일 · 1일 전" 고정 문구라 사용자가 운동 중(HomeC)이면 오탐 — 2026-07-10 실기기 확인)
    func testRealDataAfterAuth() throws {
        guard let at = ProcessInfo.processInfo.environment["GYM_AT"],
              let rt = ProcessInfo.processInfo.environment["GYM_RT"] else {
            throw XCTSkip("GYM_AT/GYM_RT 미설정 — 실계정 sync 검증은 토큰 주입 실행에서만")
        }
        let app = XCUIApplication()
        app.launchArguments = ["--auth-tokens", at, rt, "--route", "admin", "--tab", "profile"]
        app.launch()

        // 로그인 반영 — 동기화 카드에 실계정 이메일 (setSession 성공 증거)
        let email = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "leftjap@gmail.com")).firstMatch
        XCTAssertTrue(email.waitForExistence(timeout: 30), "동기화 카드에 실계정 이메일이 떠야 한다")

        // 실데이터 pull 반영 — 체중 탭 현재 체중이 '—'가 아닌 실측치 (서버 gym_weights)
        app.buttons["admin-tab-체중"].tap()
        let heroNum = app.staticTexts["weight-hero-num"]
        XCTAssertTrue(heroNum.waitForExistence(timeout: 20), "체중 히어로가 있어야 한다")
        let notEmpty = expectation(for: NSPredicate(format: "label != %@", "—"), evaluatedWith: heroNum)
        wait(for: [notEmpty], timeout: 20)

        let shot = XCUIScreen.main.screenshot()
        let attach = XCTAttachment(screenshot: shot)
        attach.name = "real-data-weight"
        attach.lifetime = .keepAlways
        add(attach)
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
        app.launchArguments = ["--route", "admin", "--tab", "profile", "--reset"]   // 히메틱 — 주입 세션(키체인) 잔존 시 버튼이 로그아웃이 됨
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
