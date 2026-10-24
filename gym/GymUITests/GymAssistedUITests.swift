import XCTest

// Reset and demo hooks are exercised only against an explicit simulator destination.
final class GymAssistedUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a)
    }

    func enterWeight(_ app: XCUIApplication, _ value: String) {
        app.staticTexts["hero-weight"].tap()
        XCTAssertTrue(app.buttons["keypad-done"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["보조 중량"].exists)
        for key in value { app.buttons["keypad-key-\(key)"].tap() }
        app.buttons["keypad-done"].tap()
    }

    func testAssistanceEstimateSaveSummaryAndImprovementDirection() {
        let app = XCUIApplication()
        app.launchArguments = ["--reset", "--fake-signin", "--demo-assisted"]
        app.launch()
        let label = app.staticTexts["assistance-weight-label"]
        XCTAssertTrue(label.waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["hero-weight"].label, "40")
        let estimate = app.staticTexts["assisted-load-estimate"]
        XCTAssertTrue(estimate.label.contains("추정 부하 33kg"))
        XCTAssertTrue(estimate.label.contains("추정 볼륨 330kg"))
        XCTAssertFalse(app.staticTexts["최고"].exists, "Legacy max-assistance PR must not be presented as a highest-weight record")
        shot(app, "assisted-40kg-estimate-330")

        enterWeight(app, "45")
        XCTAssertFalse(app.descendants(matching: .any)["hero-prchip"].exists, "More assistance must not be an improvement")
        enterWeight(app, "35")
        XCTAssertTrue(app.staticTexts["보조 5kg 감소"].waitForExistence(timeout: 5))
        shot(app, "assisted-less-assistance-is-improvement")
        enterWeight(app, "40")
        app.staticTexts["hero-weight"].swipeLeft()
        XCTAssertFalse(app.descendants(matching: .any)["pr-pop"].exists)
        app.staticTexts["session-end"].tap()
        XCTAssertTrue(app.buttons["action-finish"].waitForExistence(timeout: 5))
        app.buttons["action-finish"].tap()
        let summary = app.staticTexts["summary-assisted-volume"]
        XCTAssertTrue(summary.waitForExistence(timeout: 5))
        XCTAssertTrue(summary.label.contains("추정 볼륨 330kg"))
        XCTAssertTrue(app.staticTexts["일반 볼륨"].exists)
        shot(app, "assisted-summary-separate-estimate")
    }
}
