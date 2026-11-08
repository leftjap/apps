import XCTest

// 44pt 미만 터치 영역 (2026-11-08 검토) — 그려진 크기는 시안 그대로 두고 누르는 영역만 넓힌다.
// 글자 바깥(위쪽) 몇 pt 를 눌러도 동작해야 한다. 좌표는 기기 pt (390 캔버스 × 375/390 배율).
final class HitAreaUITests: XCTestCase {

    override func setUp() {
        continueAfterFailure = false
    }

    func testDetailAddTimeAcceptsTapAboveLabel() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,demoCards,sel:P1,nav:08"]
        app.launch()
        let label = app.staticTexts["직접 추가"]
        let head = app.staticTexts["기록"]   // 같은 줄 제목 — 넓히면 '직접 추가' 의 접근성 프레임이 커지므로 기준점은 이쪽
        XCTAssertTrue(label.waitForExistence(timeout: 15) && head.exists)
        // 글자 위 약 16pt. 고치기 전 실측: SwiftUI 가 접촉 반경만큼 너그럽게 받아 12pt 위까지는 눌렸고 16pt 부터 안 눌렸다.
        // 22pt 위는 바로 위 '완독' 버튼(3pt 거리)이 가져간다 — 넓힌 영역(20 캔버스pt = 19.2pt) 안쪽으로 잰다.
        app.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: label.frame.midX, dy: head.frame.minY - 15)).tap()
        let deny = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["허용 안 함"]
        if deny.waitForExistence(timeout: 3) { deny.tap() }
        XCTAssertTrue(app.descendants(matching: .any)["addtime.cta"].waitForExistence(timeout: 5),
                      "'직접 추가' 위쪽을 눌렀는데 시트가 안 열림 — 누르는 영역이 글자 크기뿐")
    }
}
