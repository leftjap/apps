import XCTest

// 아바타 사진 선택의 마지막 구간 — 유닛으로 못 덮는 부분.
// PhotosPicker 탭 → 시스템 사진 보관함 → loadTransferable → RTAppModel.setAvatar
//   → 앱 셸 onAvatarChange → Documents/rt-avatar.png 쓰기
//
// 사전 조건: 시뮬 사진 보관함에 사진이 있어야 한다 (xcrun simctl addmedia <udid> <png>).
// 오라클은 "행을 탭했다"가 아니라 "아바타가 사진으로 바뀌었다" — photoRow 의 접근성 값.
// (탭만 확인하면 사진이 0장이어도 통과하는 가짜 초록이 된다 — 실제로 겪음)
// 앱 셸의 파일 쓰기는 테스트 종료 후 셸이 컨테이너에서 rt-avatar.png 존재로 확인한다.
final class AvatarPickerUITests: XCTestCase {

    override func setUp() {
        continueAfterFailure = false
    }

    func testPickingPhotoFromLibraryUpdatesAvatar() {
        let app = XCUIApplication()
        app.launchArguments = ["--seq", "login,sheet:settings"]
        app.launch()

        let photoRow = app.descendants(matching: .any)["settings.photoRow"]
        XCTAssertTrue(photoRow.waitForExistence(timeout: 10), "설정 시트의 사진 행이 없다")
        XCTAssertEqual(photoRow.value as? String, "initial", "시작 상태가 이니셜이 아니다")

        photoRow.tap()

        // PHPicker 그리드의 사진 셀 — 실측한 접근성 식별자 (iOS 26.5)
        let firstPhoto = app.images.matching(identifier: "PXGGridLayout-Info").firstMatch
        guard firstPhoto.waitForExistence(timeout: 10) else {
            XCTFail("사진 보관함에 사진이 없다 — simctl addmedia 로 시딩 필요. 트리:\n\(app.debugDescription)")
            return
        }
        // 그리드 셀 Image 는 hittable 이 아니다 (실측) → 중심 좌표를 직접 탭
        firstPhoto.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()

        // loadTransferable 은 비동기 — 아바타가 사진으로 바뀔 때까지 기다린다.
        var became = false
        for _ in 0..<30 {
            if photoRow.exists, photoRow.value as? String == "photo" { became = true; break }
            Thread.sleep(forTimeInterval: 0.5)
        }
        if !became {
            XCTFail("""
            아바타가 사진으로 안 바뀜.
            photoRow.exists=\(photoRow.exists) value=\(String(describing: photoRow.value))
            트리:
            \(app.debugDescription)
            """)
        }

        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = "after-pick"
        shot.lifetime = .keepAlways
        add(shot)
    }
}
