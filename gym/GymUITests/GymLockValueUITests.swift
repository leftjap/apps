import XCTest

// 실기기 보고 2026-08-28 — "세션 화면에서 화면이 꺼졌다 켜지면 중량/횟수가 임의로 (보통 줄어) 변한다".
// 재현 하네스: 히어로 값을 고정한 뒤 ① 홈 이탈(백그라운드) ② 기기 잠금/해제 를 각각 통과시켜
// 값이 보존되는지 본다. 통과하면 "포그라운드 복귀 자체"는 원인이 아님을 못박는다.
final class GymLockValueUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func label(_ app: XCUIApplication, _ id: String) -> String {
        let e = app.staticTexts[id]
        return e.exists ? e.label : "(none)"
    }

    /// 빈 세션 → 벤치프레스 추가 → 히어로 노출까지 (Cardio 테스트의 진입 패턴 답습).
    private func openBench(_ app: XCUIApplication) {
        XCTAssertTrue(app.staticTexts["NEW SESSION"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["가슴"].waitForExistence(timeout: 5))
        app.buttons["가슴"].tap()
        XCTAssertTrue(app.buttons["addex-bench_press"].waitForExistence(timeout: 5))
        app.buttons["addex-bench_press"].tap()
        Thread.sleep(forTimeInterval: 0.8)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()   // 오버레이 시트 닫기
        Thread.sleep(forTimeInterval: 1.0)
        XCTAssertTrue(app.staticTexts["hero-weight"].waitForExistence(timeout: 5), "히어로가 떠야")
    }

    func testValuesSurviveBackgroundForeground() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--empty-session"]
        app.launch()
        openBench(app)

        let w0 = label(app, "hero-weight"), r0 = label(app, "hero-reps")
        XCTAssertNotEqual(w0, "(none)")

        XCUIDevice.shared.press(.home)
        Thread.sleep(forTimeInterval: 3)
        app.activate()
        Thread.sleep(forTimeInterval: 3)

        let a = XCTAttachment(screenshot: app.screenshot()); a.name = "after-foreground"
        a.lifetime = .keepAlways; add(a)
        XCTAssertEqual(label(app, "hero-weight"), w0, "백그라운드 복귀로 중량이 변하면 안 됨")
        XCTAssertEqual(label(app, "hero-reps"), r0, "백그라운드 복귀로 횟수가 변하면 안 됨")
    }

    /// 증감 존이 화면 가장자리에 닿으면 안 된다 — 시안 `#cardSwipeArea { padding: 0 26px }`
    /// (mocks/session.html:346). 이식에서 이 여백이 빠져 x=0 까지 닿았고, 벤치에 둔 폰을 집을 때
    /// 베젤 근처 접촉이 그대로 ±증분으로 먹혔다 (실기기 2026-08-28 "값이 임의로 줄어듦").
    func testTapZonesDoNotReachScreenEdges() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--empty-session"]
        app.launch()
        openBench(app)

        let w = app.windows.firstMatch.frame.width
        for id in ["zone-minus", "zone-plus"] {
            let q = app.descendants(matching: .any).matching(identifier: id)
            XCTAssertEqual(q.count, 2, "\(id) 은 중량행·횟수행 2개")
            for i in 0..<q.count {
                let f = q.element(boundBy: i).frame
                XCTAssertGreaterThanOrEqual(f.minX, 26, "\(id)[\(i)] 좌측 불감대 26pt")
                XCTAssertLessThanOrEqual(f.maxX, w - 26, "\(id)[\(i)] 우측 불감대 26pt")
                XCTAssertGreaterThan(f.width, 44, "\(id)[\(i)] 히트 폭은 44pt 이상 유지")
            }
        }
        // 불감대(x < 26) 탭은 값을 바꾸지 않는다
        let w0 = label(app, "hero-weight")
        let hero = app.staticTexts["hero-weight"].frame
        let sz = app.windows.firstMatch.frame
        app.coordinate(withNormalizedOffset: CGVector(dx: 10 / sz.width, dy: hero.midY / sz.height)).tap()
        Thread.sleep(forTimeInterval: 1.0)
        XCTAssertEqual(label(app, "hero-weight"), w0, "가장자리 10pt 지점 탭은 중량을 바꾸면 안 됨")
    }

    /// 히어로 좌측(감소) 존에서 **세로로 쓸어내린** 터치 — 탭이 아니다. 값이 변하면 안 된다.
    /// (손바닥 스침·집어들 때의 문지름이 증감으로 먹히는지 확인)
    func testVerticalDragOnMinusZoneDoesNotChangeValue() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--empty-session"]
        app.launch()
        openBench(app)

        let w0 = label(app, "hero-weight")
        let hero = app.staticTexts["hero-weight"].frame
        let sz = app.windows.firstMatch.frame
        // 좌측 감소 존 안 (숫자 왼쪽 여백) — 세로로 120pt 쓸기
        let x = (hero.minX * 0.4) / sz.width
        let y0 = (hero.midY - 40) / sz.height
        let y1 = (hero.midY + 40) / sz.height
        app.coordinate(withNormalizedOffset: CGVector(dx: x, dy: y0))
            .press(forDuration: 0.05,
                   thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: x, dy: y1)))
        Thread.sleep(forTimeInterval: 1.0)

        let a = XCTAttachment(screenshot: app.screenshot()); a.name = "after-vertical-drag"
        a.lifetime = .keepAlways; add(a)
        XCTAssertEqual(label(app, "hero-weight"), w0, "세로 쓸기는 탭이 아니다 — 중량이 변하면 안 됨")

        // 대조군 — 같은 점을 '탭'하면 반드시 감소해야 한다 (좌표가 감소 존 안임을 증명).
        app.coordinate(withNormalizedOffset: CGVector(dx: x, dy: (hero.midY) / sz.height)).tap()
        Thread.sleep(forTimeInterval: 1.0)
        XCTAssertNotEqual(label(app, "hero-weight"), w0, "대조군: 같은 점 탭은 감소해야 (좌표 유효성)")
    }

    func testValuesSurviveDeviceLockUnlock() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--empty-session"]
        app.launch()
        openBench(app)

        let w0 = label(app, "hero-weight"), r0 = label(app, "hero-reps")
        XCTAssertNotEqual(w0, "(none)")

        let dev = XCUIDevice.shared
        let lock = NSSelectorFromString("pressLockButton")
        XCTAssertTrue(dev.responds(to: lock), "pressLockButton 미지원 — 잠금 재현 불가")
        dev.perform(lock)                       // 화면 꺼짐 + 잠금
        // 실사용 정합 — 세트 사이 휴식(수 분) 동안 앱은 서스펜드된다. 4초 잠금은 서스펜드
        // 전이라 재현력이 없다 (~/apps/lessons/ios-simulator-e2e-traps.md §2: 잠금 +30초 부근).
        Thread.sleep(forTimeInterval: 75)
        dev.perform(lock)                       // 화면 켜짐 (잠금화면)
        Thread.sleep(forTimeInterval: 2)

        let sb = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        sb.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.99))
            .press(forDuration: 0.05,
                   thenDragTo: sb.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35)))
        Thread.sleep(forTimeInterval: 3)
        if app.state != .runningForeground { app.activate() }
        Thread.sleep(forTimeInterval: 3)

        let a = XCTAttachment(screenshot: app.screenshot()); a.name = "after-unlock"
        a.lifetime = .keepAlways; add(a)
        XCTAssertEqual(label(app, "hero-weight"), w0, "잠금/해제로 중량이 변하면 안 됨")
        XCTAssertEqual(label(app, "hero-reps"), r0, "잠금/해제로 횟수가 변하면 안 됨")
    }
}
