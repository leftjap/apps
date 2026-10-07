import XCTest

// 맨몸 세트바도 중량과 같은 높이 범위를 쓰고, 횟수 변경·완료에 맞춰 높이가 바뀌어야 한다.
// 시뮬레이터 전용: --reset 으로 이력 없는 빈 세션을 만들고 실제 추가·키패드·스와이프를 구동한다.
final class GymSetBarHeightUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func launchExercise(_ exercise: String, part: String, name: String,
                                reset: Bool = true) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = (reset ? ["--reset"] : []) + ["--fake-signin", "--empty-session"]
        app.launch()
        XCTAssertTrue(app.staticTexts["NEW SESSION"].waitForExistence(timeout: 15))
        app.buttons[part].tap()
        let pick = app.buttons["addex-\(exercise)"]
        XCTAssertTrue(pick.waitForExistence(timeout: 5))
        pick.tap()
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
        let title = app.staticTexts["session-exname"]
        expectation(for: NSPredicate(format: "label == %@", name), evaluatedWith: title)
        waitForExpectations(timeout: 5)
        return app
    }

    private func checkHeight(_ app: XCUIApplication, set: Int, height: CGFloat) {
        let bar = app.otherElements["set-bar-\(set)"]
        XCTAssertTrue(bar.waitForExistence(timeout: 5), "\(set + 1)세트 막대가 있어야 한다")
        let settled = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            abs(bar.frame.height - height) <= 0.5
        }, object: bar)
        XCTAssertEqual(XCTWaiter.wait(for: [settled], timeout: 5), .completed,
                       "\(set + 1)세트 막대: 실제 \(bar.frame.height)pt, 기대 \(height)pt")
    }

    private func setReps(_ app: XCUIApplication, _ reps: String) {
        app.otherElements["zone-center"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["keypad-value"].waitForExistence(timeout: 5))
        for digit in reps { app.buttons["keypad-key-\(digit)"].tap() }
        app.buttons["keypad-done"].tap()
        XCTAssertEqual(app.staticTexts["hero-reps"].label, reps)
    }

    private func checkReps(_ app: XCUIApplication, _ reps: [String]) {
        for (index, value) in reps.enumerated() {
            XCTAssertEqual(app.staticTexts["set-bar-value-\(index)"].label, value)
        }
    }

    private func completeSet(_ app: XCUIApplication) {
        let window = app.windows.firstMatch
        let y = app.staticTexts["hero-reps"].frame.midY / window.frame.height
        let start = window.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: y))
        let end = window.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: y))
        start.press(forDuration: 0.02, thenDragTo: end)
    }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testBodyweightAndWeightedBarsShareHeightRange() {
        let weighted = launchExercise("bench_press", part: "가슴", name: "벤치프레스")
        // 현재 막대의 접근성 프레임은 막대 22pt + 외곽 글로우 6pt를 포함한다.
        checkHeight(weighted, set: 0, height: 28)
        checkHeight(weighted, set: 1, height: 20)
        shot(weighted, "set-bars-weighted-default")
        weighted.terminate()

        let bodyweight = launchExercise("hanging_leg_raise", part: "코어", name: "행잉 레그 레이즈")
        shot(bodyweight, "set-bars-bodyweight-default")
        checkHeight(bodyweight, set: 0, height: 28)
        checkHeight(bodyweight, set: 1, height: 20)
        checkHeight(bodyweight, set: 2, height: 20)

        setReps(bodyweight, "11")
        completeSet(bodyweight)
        setReps(bodyweight, "10")
        completeSet(bodyweight)
        setReps(bodyweight, "9")
        shot(bodyweight, "set-bars-bodyweight-11-10-9")
        checkHeight(bodyweight, set: 0, height: 20)
        checkHeight(bodyweight, set: 1, height: 18)
        checkHeight(bodyweight, set: 2, height: 24)

        completeSet(bodyweight)
        bodyweight.staticTexts["session-end"].tap()
        let finish = bodyweight.buttons["action-finish"]
        XCTAssertTrue(finish.waitForExistence(timeout: 5))
        finish.tap()
        let home = bodyweight.buttons["summary-home"]
        XCTAssertTrue(home.waitForExistence(timeout: 5))
        home.tap()
        bodyweight.terminate()

        let next = launchExercise("hanging_leg_raise", part: "코어", name: "행잉 레그 레이즈", reset: false)
        XCTAssertEqual(next.staticTexts["hero-reps"].label, "11")
        checkReps(next, ["11", "10", "9"])
        shot(next, "set-bars-bodyweight-prev-session-11-10-9")
        checkHeight(next, set: 0, height: 28)
        checkHeight(next, set: 1, height: 18)
        checkHeight(next, set: 2, height: 16)

        setReps(next, "6")
        checkReps(next, ["6", "10", "9"])
        shot(next, "set-bars-bodyweight-prev-session-current-six")
        // 현재 6회와 직전 세션 preview 10·9회가 각 막대의 높이에 그대로 반영된다.
        checkHeight(next, set: 0, height: 20)
        checkHeight(next, set: 1, height: 20)
        checkHeight(next, set: 2, height: 18)
    }

    func testBodyweightHeightTracksRepsAndSetCompletion() {
        let app = launchExercise("hanging_leg_raise", part: "코어", name: "행잉 레그 레이즈")
        setReps(app, "6")
        checkReps(app, ["6", "6", "6"])
        shot(app, "set-bars-bodyweight-six-reps-preview")
        // 예정 세트도 현재 입력한 6회를 참조한다: 같은 표시값이면 같은 기본 높이 20pt다.
        checkHeight(app, set: 0, height: 28)
        checkHeight(app, set: 1, height: 20)
        checkHeight(app, set: 2, height: 20)

        completeSet(app)
        checkReps(app, ["6", "6", "6"])
        shot(app, "set-bars-bodyweight-six-reps-after-commit")
        // 완료 세트는 강조·글로우가 사라지고, 다음 세트가 6회를 상속해 현재 강조를 받는다.
        checkHeight(app, set: 0, height: 20)
        checkHeight(app, set: 1, height: 28)
        checkHeight(app, set: 2, height: 20)

        setReps(app, "0")
        shot(app, "set-bars-bodyweight-zero-reps")
        // 값이 0이어도 현재 막대는 최소 9pt + 강조 2pt + 글로우 6pt로 남는다.
        checkHeight(app, set: 1, height: 17)
        checkHeight(app, set: 2, height: 20)
    }
}
