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

// 이름 수정 (설정 시트 — SCREENS.md §설정 "이름 수정") — rename() 이 모델 반영 + onRename 훅 발화.
@MainActor
@Suite struct RTRenameTests {
    @Test func renameUpdatesAndFiresHook() {
        let m = RTAppModel()
        var fired: String?
        m.onRename = { fired = $0 }
        m.rename("나니c")
        #expect(m.displayName == "나니c")
        #expect(fired == "나니c")
    }

    @Test func renameTrimsWhitespace() {
        let m = RTAppModel()
        m.rename("  지오c ")
        #expect(m.displayName == "지오c")
    }

    @Test func renameRejectsEmpty() {
        let m = RTAppModel()
        m.displayName = "지오c"
        var fired = false
        m.onRename = { _ in fired = true }
        m.rename("   ")
        #expect(m.displayName == "지오c")   // 기존 유지
        #expect(fired == false)
    }

    @Test func renameViaSeqToken() {
        let m = RTAppModel()
        m.apply("rename:나니c")
        #expect(m.displayName == "나니c")
    }
}
