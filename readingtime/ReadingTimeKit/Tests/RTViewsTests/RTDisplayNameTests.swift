import Testing
@testable import RTViews

// 프로필 표시 이름 — auth user_metadata.display_name 주입 시 그 값, 없으면 데모 정본("지훈"/"지").
// rtshot/rtapp 데모 경로(displayName nil)의 픽셀 정합이 폴백으로 보존되는지가 핵심 불변식.

@MainActor
@Suite struct RTDisplayNameTests {
    @Test func demoFallback() {
        let m = RTAppModel()
        #expect(m.displayName == nil)
        #expect(m.displayNameOrDemo == "지훈")
        #expect(m.displayInitial == "지")
    }

    @Test func injectedName() {
        let m = RTAppModel()
        m.displayName = "지오c"
        #expect(m.displayNameOrDemo == "지오c")
        #expect(m.displayInitial == "지")
    }

    @Test func injectedNameOtherUser() {
        let m = RTAppModel()
        m.displayName = "나니c"
        #expect(m.displayNameOrDemo == "나니c")
        #expect(m.displayInitial == "나")
    }

    @Test func emptyNameFallsBackToDemo() {
        let m = RTAppModel()
        m.displayName = ""
        #expect(m.displayNameOrDemo == "지훈")
        #expect(m.displayInitial == "지")
    }
}
