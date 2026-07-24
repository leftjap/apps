import XCTest

// 꾹누르기 액션시트 항목 + 종목 완료 후 레일 상태 (사용자 실기기 보고 2026-07-10).
// 시뮬레이터 전용(--reset).
final class GymBlockFinishUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name; a.lifetime = .keepAlways
        add(a)
    }
    private func chip(_ app: XCUIApplication, _ state: String, _ name: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: "rail-\(state)-\(name)").firstMatch
    }

    // 액션시트에 '이동' 이 없어야 한다 (session.js:1952 — hold+drag 로 대체됨).
    func testActionSheetHasNoMoveItem() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--route", "session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 15))

        chip(app, "current", "벤치프레스").press(forDuration: 0.8)
        XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5), "현재 종목 → 완료")
        XCTAssertTrue(app.buttons["action-delete"].exists, "현재 종목 → 삭제")
        XCTAssertFalse(app.buttons["action-move"].exists, "이동 항목은 없어야 한다")
        shot(app, "10-sheet-no-move")
        app.buttons["action-cancel"].tap()
    }

    // 마지막 종목까지 완료하면 레일에 current 흰 카드가 남지 않고 전부 체크 칩이어야 한다.
    func testFinishingEveryBlockLeavesNoCurrentChip() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--route", "session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 15))

        // 데모 세션: 인클라인(완료) · 벤치프레스(현재) · 덤벨 플라이 · 케이블 크로스오버
        for name in ["벤치프레스", "덤벨 플라이", "케이블 크로스오버"] {
            let cur = chip(app, "current", name)
            XCTAssertTrue(cur.waitForExistence(timeout: 5), "\(name) 가 현재 종목이어야 한다")
            cur.press(forDuration: 0.8)
            XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5))
            app.buttons["action-finish"].tap()
            XCTAssertTrue(chip(app, "done", name).waitForExistence(timeout: 5),
                          "완료한 \(name) 는 레일에서 done 칩이어야 한다")
        }

        // 전부 완료 → 히어로 read-only, 레일에 current 없음
        XCTAssertTrue(app.staticTexts["hero-done"].waitForExistence(timeout: 5), "히어로는 ✓ read-only")
        for name in ["인클라인 벤치", "벤치프레스", "덤벨 플라이", "케이블 크로스오버"] {
            XCTAssertFalse(chip(app, "current", name).exists, "\(name) 가 current 로 남으면 안 된다")
        }
        // 레일 작업지시서 §7 — 완료 종목이 왼쪽에 잘리지 않고 전부 보인다.
        // current 가 사라져도 ScrollView 오프셋이 남으면 앞쪽 완료 칩이 화면 밖으로 밀린다.
        let firstDone = chip(app, "done", "인클라인 벤치")
        XCTAssertTrue(firstDone.exists, "첫 완료 칩이 레일에 있어야 한다")
        XCTAssertGreaterThanOrEqual(firstDone.frame.minX, 0, "첫 완료 칩이 좌측으로 잘리면 안 된다")
        XCTAssertTrue(firstDone.isHittable, "첫 완료 칩은 보이고 누를 수 있어야 한다")
        shot(app, "20-all-done")
    }

    // 완료 종목이 생길 때마다 현재 칩이 '좌측 치우침' 위치로 재정렬되는지 (사용자 2026-07-19 요청).
    // 완료 칩은 우측 끝만 남기고 밀려나고, 현재 칩은 중앙이 아니라 좌측 railLeftInset 부근에 온다.
    // → 우측으로 예정 종목이 더 보인다. 완료를 진행하며 매 전환마다 같은 규칙이 유지되어야 한다.
    func testCurrentChipStaysLeftBiasedAsBlocksAreFinished() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--route", "session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 15))

        func assertLeftBiased(_ name: String, _ tag: String) {
            let cur = chip(app, "current", name)
            XCTAssertTrue(cur.waitForExistence(timeout: 5), "\(name) 가 현재 칩이어야 한다")
            // 전환 애니(슬라이드 0.25·팝 0.38·링 0.55) 정착 대기 — 비행 중 프레임 측정 방지
            Thread.sleep(forTimeInterval: 1.2)
            let centered = (app.frame.width - cur.frame.width) / 2   // 중앙 정렬이었다면 이 x
            XCTAssertGreaterThan(cur.frame.minX, 0,
                                 "\(name) 현재 칩이 좌측으로 잘리면 안 된다 (실측 \(cur.frame.minX))")
            XCTAssertLessThan(cur.frame.minX, centered - 30,
                              "\(name) 현재 칩이 중앙(≈\(centered))이 아니라 좌측 치우침이어야 한다 (실측 \(cur.frame.minX))")
            shot(app, tag)
        }

        // 데모: 인클라인(완료) · 벤치프레스(현재) → 완료 칩이 있으므로 좌측 치우침 적용
        assertLeftBiased("벤치프레스", "40-leftbias-initial")

        // 완료 → 다음 종목이 현재가 되어도 같은 좌측 치우침이 유지되어야 한다
        chip(app, "current", "벤치프레스").press(forDuration: 0.8)
        XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5))
        app.buttons["action-finish"].tap()
        assertLeftBiased("덤벨 플라이", "41-leftbias-after-finish")

        // 직전 완료 칩(벤치프레스)은 좌측으로 밀려 일부만 보인다 — 전체 폭보다 훨씬 좁게 노출
        let prevDone = chip(app, "done", "벤치프레스")
        XCTAssertTrue(prevDone.exists, "직전 완료 칩이 레일에 있어야 한다")
        XCTAssertLessThan(prevDone.frame.maxX, chip(app, "current", "덤벨 플라이").frame.minX,
                          "완료 칩은 현재 칩 왼쪽에 밀려 있어야 한다")
    }

    // 마지막 종목(뒤에 예정이 없음)에서도 좌측 치우침이 유지되어야 한다 (사용자 2026-07-22 보고).
    // scrollTo 는 콘텐츠 끝을 넘지 못해 클램프되므로, 트레일링 스페이서가 없으면 현재 칩이 중앙보다
    // 오른쪽으로 밀리고 완료 칩이 여러 개 드러난다 (수정 전 실측: minX 161.7 · 완료 칩 2개 노출).
    func testLastBlockStillLeftBiasedWithDoneChipsCollapsed() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--route", "session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 15))

        // 데모 4종목 — 앞 둘을 완료하면 케이블 크로스오버가 '완료 3개 뒤의 마지막 종목' 이 된다
        for name in ["벤치프레스", "덤벨 플라이"] {
            let cur = chip(app, "current", name)
            XCTAssertTrue(cur.waitForExistence(timeout: 5))
            cur.press(forDuration: 0.8)
            XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5))
            app.buttons["action-finish"].tap()
        }

        let cur = chip(app, "current", "케이블 크로스오버")
        XCTAssertTrue(cur.waitForExistence(timeout: 5), "마지막 종목이 현재 칩이어야 한다")
        let centered = (app.frame.width - cur.frame.width) / 2
        XCTAssertLessThan(cur.frame.minX, centered - 30,
                          "마지막 종목도 중앙(≈\(centered))이 아니라 좌측 치우침 (실측 \(cur.frame.minX))")

        // 직전 완료 칩은 우측 끝 일부만 — 40pt 넘게 드러나면 '완료를 다 보여주는' 낭비로 회귀한 것
        let prevDone = chip(app, "done", "덤벨 플라이")
        XCTAssertTrue(prevDone.exists)
        XCTAssertLessThan(prevDone.frame.maxX, 40,
                          "직전 완료 칩은 우측 끝만 노출되어야 한다 (실측 maxX \(prevDone.frame.maxX))")
        // 그 앞 완료 칩들은 화면 밖으로 밀려 있어야 한다
        XCTAssertLessThanOrEqual(chip(app, "done", "벤치프레스").frame.maxX, 0,
                                 "앞선 완료 칩까지 보이면 하단 공간 낭비")
        shot(app, "60-last-block-leftbias")
    }

    // 마지막 종목(트레일링 스페이서 추가) 상태에서도 수동 스크롤로 완료 칩을 열람할 수 있어야 한다
    // (사용자 2026-07-22 "스크롤은 이때도 되는 게 당연"). 스페이서는 우측이라 좌측(완료 칩) 열람을 막지 않는다.
    func testLastBlockManualScrollStillRevealsDoneChips() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--route", "session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 15))

        for name in ["벤치프레스", "덤벨 플라이"] {   // 케이블 크로스오버 = 마지막 종목 → 스페이서 상태
            let cur = chip(app, "current", name)
            XCTAssertTrue(cur.waitForExistence(timeout: 5))
            cur.press(forDuration: 0.8)
            XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5))
            app.buttons["action-finish"].tap()
        }
        // 기본은 완료 칩 우측 끝만 노출 — 스크롤 전엔 첫 완료 칩이 화면 밖
        let firstDone = chip(app, "done", "인클라인 벤치")
        XCTAssertLessThan(firstDone.frame.maxX, 0, "스크롤 전엔 첫 완료 칩이 화면 밖이어야 한다")

        // 오른쪽으로 끌면 왼쪽 완료 칩들이 열린다 (콘텐츠가 길어 여러 번)
        let y = 0.908
        for _ in 1...4 {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: y))
                .press(forDuration: 0.05,
                       thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: y)))
            if firstDone.exists && firstDone.frame.minX >= 0 { break }
        }
        XCTAssertGreaterThanOrEqual(firstDone.frame.minX, 0,
            "스크롤 끝까지 가면 첫 완료 칩이 화면 안에 완전히 들어와야 한다 (실측 \(firstDone.frame.minX))")
        XCTAssertTrue(firstDone.isHittable, "완료 칩은 열람·탭 가능해야 한다")
        shot(app, "61-last-block-scrolled-done")
    }

    // 레일 탭 종목 전환 (§6-8 로테이션) — 히어로·헤더·레일 current 가 탭한 종목으로 바뀐다.
    // 전환 피드백(햅틱·이름 스왑 애니, 사용자 2026-07-23)의 단언 가능한 계약을 잠근다.
    // (햅틱은 시뮬 검증 불가, 애니는 프레임 단언 불가 — 전환 자체만 계약)
    func testTappingUpcomingChipSwitchesHeroMidSession() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--route", "session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 15))

        // 데모: 벤치프레스(현재) 진행 중 → 예정 칩 '덤벨 플라이' 탭 = 로테이션 전환
        chip(app, "upcoming", "덤벨 플라이").tap()
        let exname = app.staticTexts["session-exname"]
        XCTAssertTrue(exname.waitForExistence(timeout: 5))
        XCTAssertEqual(exname.label, "덤벨 플라이", "히어로가 탭한 종목으로 바뀌어야 한다")
        let newCur = chip(app, "current", "덤벨 플라이")
        XCTAssertTrue(newCur.waitForExistence(timeout: 5), "레일 current 칩도 탭한 종목이어야 한다")
        Thread.sleep(forTimeInterval: 1.2)   // 전환 애니 정착 (두 박자: dwell 0.22 + 이동 + 스쿼시 ~0.99s)

        // 삽입 순서 고정(2026-07-24) — 벤치프레스는 자리를 지킨 채 현재 칩 왼쪽으로 접힌다
        let bench = chip(app, "upcoming", "벤치프레스")
        XCTAssertTrue(bench.exists, "이전 종목은 미완료(upcoming) 상태로 남는다")
        XCTAssertLessThan(bench.frame.maxX, newCur.frame.minX + 1,
                          "이전 종목 칩은 현재 칩 왼쪽에 접혀야 한다 (재정렬 아님)")
        shot(app, "80-rotation-switch")

        // 되돌아가기 — 접힌 칩은 레일을 오른쪽으로 끌어 연 뒤 탭 (로테이션 왕복)
        let y = 0.908
        for _ in 1...3 {
            if bench.isHittable { break }
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: y))
                .press(forDuration: 0.05,
                       thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: y)))
        }
        XCTAssertTrue(bench.isHittable, "스크롤로 이전 종목 칩을 열람·탭할 수 있어야 한다")
        bench.tap()
        XCTAssertTrue(chip(app, "current", "벤치프레스").waitForExistence(timeout: 5))
        XCTAssertEqual(exname.label, "벤치프레스", "재탭으로 원 종목 복귀")
        shot(app, "81-rotation-back")
    }

    // 빈 세션 첫 종목 선택 시 시트가 닫히지 않아야 한다 (사용자 2026-07-23 — 2개 이상 담을 수 있어야).
    // PWA 정본(session.js:3757 "다중 선택 유지") 정합 — 네이티브만 empty→active 화면 스왑으로 시트가 소멸했다.
    func testFirstExercisePickKeepsSheetOpenForMultiSelect() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--empty-session"]
        app.launch()

        // 빈 세션 — 인라인 시트가 보인다 (--reset 후 기본 부위 등: 랫 풀다운)
        let first = app.buttons["addex-lat_pulldown"]
        XCTAssertTrue(first.waitForExistence(timeout: 15), "빈 세션은 인라인 운동추가 시트로 시작해야 한다")
        first.tap()

        // 첫 종목을 골라도 시트가 열려 있어 두 번째 종목을 이어서 담을 수 있어야 한다
        let second = app.buttons["addex-barbell_row"]
        XCTAssertTrue(second.waitForExistence(timeout: 5), "첫 선택 후에도 시트가 열려 있어야 한다 (다중 선택)")
        second.tap()
        shot(app, "70-sheet-kept-after-first-pick")

        // 시트 닫기(백드롭 탭) → 레일에 두 종목 모두 확인
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
        XCTAssertTrue(chip(app, "current", "랫 풀다운").waitForExistence(timeout: 5),
                      "첫 종목이 현재 칩이어야 한다")
        XCTAssertTrue(chip(app, "upcoming", "바벨 로우").exists, "둘째 종목이 예정 칩으로 붙어야 한다")
        shot(app, "71-rail-two-picked")
    }

    // 운동 추가 흐름 (사용자 2026-07-19) — + → 시트가 기본 '등' 으로 열림 → 종목 선택 시 레일에
    // 예정 칩이 붙고, 고른 부위가 기억되어 다음에 그 부위로 열린다.
    func testAddExerciseFlowUpdatesRailAndRemembersPart() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--route", "session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 15))

        // + → 시트. 기본 부위가 등이면 등 종목(랫 풀다운)이 보인다.
        // + → 시트 열림
        app.buttons["rail-add"].tap()
        let anyAddex = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'addex-'")).firstMatch
        XCTAssertTrue(anyAddex.waitForExistence(timeout: 5), "+ 를 누르면 추가 시트가 열려야 한다")
        shot(app, "50-addex-open")

        // 하체 칩 → 스쿼트 추가 → 레일에 예정 칩이 생겨야 한다
        app.buttons["하체"].tap()
        XCTAssertTrue(app.buttons["addex-squat"].waitForExistence(timeout: 5))
        app.buttons["addex-squat"].tap()
        // 시트는 배경(백드롭) 탭으로 닫는다 (SessionScreen: onTapGesture { addexOpen = false })
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
        XCTAssertTrue(chip(app, "upcoming", "스쿼트").waitForExistence(timeout: 5),
                      "추가한 종목이 레일에 예정 칩으로 붙어야 한다")
        shot(app, "51-rail-after-add")

        // 다시 + → 마지막에 고른 부위(하체)로 열려야 한다 (부위 기억)
        app.buttons["rail-add"].tap()
        XCTAssertTrue(app.buttons["addex-squat"].waitForExistence(timeout: 5),
                      "마지막에 고른 부위(하체)가 기억되어 그 부위로 열려야 한다")
        XCTAssertFalse(app.buttons["addex-lat_pulldown"].exists, "등 부위로 되돌아가면 안 된다")
        shot(app, "52-addex-remembered-legs")
    }

    // 전부 완료 후 완료 칩을 탭하면 히어로만 그 종목으로 바뀌고, 레일은 계속 전부 완료여야 한다.
    // (PWA 실렌더 정본: 히어로 이름은 탭을 따라가고 current 칩은 0개)
    func testTappingDoneChipAfterAllFinishedKeepsRailAllDone() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--route", "session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["직전 세션 기록"].waitForExistence(timeout: 15))

        for name in ["벤치프레스", "덤벨 플라이", "케이블 크로스오버"] {
            let cur = chip(app, "current", name)
            XCTAssertTrue(cur.waitForExistence(timeout: 5))
            cur.press(forDuration: 0.8)
            XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5))
            app.buttons["action-finish"].tap()
        }
        XCTAssertTrue(app.staticTexts["hero-done"].waitForExistence(timeout: 5))

        // 완료 칩 탭 → 히어로는 그 종목으로 이동
        chip(app, "done", "벤치프레스").tap()
        let exname = app.staticTexts["session-exname"]
        XCTAssertTrue(exname.waitForExistence(timeout: 5))
        XCTAssertEqual(exname.label, "벤치프레스", "히어로는 탭한 종목을 보여야 한다")

        // 레일은 여전히 전부 완료 — 탭했다고 흰 카드가 되살아나면 안 된다
        for name in ["인클라인 벤치", "벤치프레스", "덤벨 플라이", "케이블 크로스오버"] {
            XCTAssertFalse(chip(app, "current", name).exists, "\(name) 가 current 로 되살아나면 안 된다")
        }
        shot(app, "30-tap-done-chip")
    }
}
