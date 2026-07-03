import Testing
import Foundation
@testable import RTViews

// RTAppModel — prototype/app.js 인터랙션 정본과의 정합 테스트.
// 시간 의존은 ManualTapScheduler 로 결정적 실행.

// 테스트 편의: 동기 등록 스케줄러 (Task 홉 없이 즉시 pending 설정)
final class SyncTapScheduler: RTTapScheduler, @unchecked Sendable {
    var pending: (@MainActor () -> Void)?
    var cancelCount = 0
    func schedule(after delay: TimeInterval, _ work: @escaping @MainActor () -> Void) -> () -> Void {
        pending = work
        return { [self] in cancelCount += 1; pending = nil }
    }
    @MainActor func fire() {
        let w = pending
        pending = nil
        w?()
    }
}

@MainActor
@Suite struct RTAppModelRoutingTests {
    @Test func loginGoesHome() {
        let m = RTAppModel()
        m.login()
        #expect(m.route == .home)
    }

    @Test func startFlipGoesWaitWithoutSession() {
        let m = RTAppModel()
        m.login()
        m.start()
        #expect(m.route == .flipWait)
        #expect(m.session == nil)
    }

    @Test func simFlipStartsFlipSession() {
        let m = RTAppModel()
        m.navScreenID("03")
        m.simFlip()
        #expect(m.route == .flipTimer)
        #expect(m.session?.mode == .flip)
        #expect(m.session?.status == .recording)
        #expect(m.session?.elapsed == RTAppModel.demoElapsed)
    }

    @Test func startTapStartsSession() {
        let m = RTAppModel()
        m.login()
        m.setMode(.tap)
        m.start()
        #expect(m.route == .tapTimer)
        #expect(m.session?.mode == .tap)
    }

    @Test func switchTapFromWaitStartsTapSession() {
        let m = RTAppModel()
        m.navScreenID("03")
        m.switchTap()
        #expect(m.mode == .tap)
        #expect(m.route == .tapTimer)
        #expect(m.session?.mode == .tap)
    }

    @Test func cancelSessionClearsAndGoesHome() {
        let m = RTAppModel()
        m.simFlip()
        m.cancelSession()
        #expect(m.session == nil)
        #expect(m.route == .home)
    }

    @Test func endSessionPausesAndShowsDone() {
        let m = RTAppModel()
        m.simFlip()
        m.endSession()
        #expect(m.route == .done)
        #expect(m.session?.status == .paused)
    }

    @Test func saveAndDeleteReturnHome() {
        let m = RTAppModel()
        m.simFlip()
        m.endSession()
        m.saveSession()
        #expect(m.session == nil)
        #expect(m.route == .home)

        let m2 = RTAppModel()
        m2.simFlip()
        m2.endSession()
        m2.deleteSession()
        #expect(m2.session == nil)
        #expect(m2.route == .home)
    }

    @Test func continueReadingFollowsMode() {
        let m = RTAppModel()
        m.nav(.detail)
        m.continueReading()
        #expect(m.route == .flipWait)   // 기본 flip 모드

        let m2 = RTAppModel()
        m2.setMode(.tap)
        m2.nav(.detail)
        m2.continueReading()
        #expect(m2.route == .tapTimer)
        #expect(m2.session != nil)
    }

    @Test func navClosesSheet() {
        let m = RTAppModel()
        m.nav(.home)
        m.openSheet(.settings)
        m.nav(.library)
        #expect(m.sheet == nil)
        #expect(m.route == .library)
    }

    @Test func sheetRouteAliases() {
        let m = RTAppModel()
        m.navScreenID("07")
        #expect(m.route == .home)
        #expect(m.sheet == .addtime)

        m.navScreenID("09")
        #expect(m.route == .detail)
        #expect(m.sheet == .finish)

        m.navScreenID("13")
        #expect(m.route == .library)
        #expect(m.sheet == .addbook)
    }

    @Test func unknownScreenIDFallsBackHome() {
        let m = RTAppModel()
        m.navScreenID("99")
        #expect(m.route == .home)
    }

    @Test func logoutReturnsLogin() {
        let m = RTAppModel()
        m.nav(.home)
        m.openSheet(.settings)
        m.logout()
        #expect(m.sheet == nil)
        #expect(m.route == .login)
    }

    @Test func deleteBookReturnsLibrary() {
        let m = RTAppModel()
        m.nav(.detail)
        m.openSheet(.bookmenu)
        m.deleteBook()
        #expect(m.sheet == nil)
        #expect(m.route == .library)
    }
}

@MainActor
@Suite struct RTAppModelTimerTests {
    @Test func tickIncrementsOnlyWhileRecording() {
        let m = RTAppModel()
        m.simFlip()
        m.tick()
        #expect(m.session?.elapsed == RTAppModel.demoElapsed + 1)
        m.togglePause()
        m.tick()
        #expect(m.session?.elapsed == RTAppModel.demoElapsed + 1)  // 일시정지 중 정지
    }

    @Test func togglePauseCountsAndResumeFlags() {
        let m = RTAppModel()
        m.simFlip()
        m.togglePause()
        #expect(m.session?.status == .paused)
        #expect(m.session?.pauseCount == 1)
        m.togglePause()
        #expect(m.session?.status == .recording)
        #expect(m.justResumed)
        #expect(m.session?.pauseCount == 1)   // 재개는 카운트 증가 없음
    }

    @Test func sessionMinutesFloorsSeconds() {
        let m = RTAppModel()
        m.simFlip()
        #expect(m.sessionMinutes == 26)      // 26:14 → 26분
        #expect(RTAppModel.hms(RTAppModel.demoElapsed) == ("00", "26", "14"))
    }

    @Test func singleTapPauses() {
        let sched = SyncTapScheduler()
        let m = RTAppModel(tapScheduler: sched)
        m.setMode(.tap)
        m.start()
        m.tapZone()
        #expect(m.session?.status == .recording)  // 디바운스 대기 중 아직 그대로
        sched.fire()                               // 250ms 경과
        #expect(m.session?.status == .paused)
    }

    @Test func doubleTapEndsSession() {
        let sched = SyncTapScheduler()
        let m = RTAppModel(tapScheduler: sched)
        m.setMode(.tap)
        m.start()
        m.tapZone()
        m.tapZone()                                // 250ms 안 두 번째 탭
        #expect(sched.cancelCount == 1)            // 단일탭 예약 취소
        #expect(m.route == .done)
        #expect(m.session?.status == .paused)
        sched.fire()                               // 잔여 예약 없음 — no-op
        #expect(m.route == .done)
    }

    @Test func tapZoneResetsAfterFire() {
        let sched = SyncTapScheduler()
        let m = RTAppModel(tapScheduler: sched)
        m.setMode(.tap)
        m.start()
        m.tapZone()
        sched.fire()                               // 일시정지
        m.tapZone()
        sched.fire()                               // 재개 (새 단일탭 사이클)
        #expect(m.session?.status == .recording)
        #expect(m.justResumed)
    }
}

@MainActor
@Suite struct RTAppModelSheetStateTests {
    @Test func stepperClampsAtFiveAndClearsPreset() {
        let m = RTAppModel()
        #expect(m.addtimeValue == 35)              // 시안 데모 초기값
        #expect(m.addtimePreset == 15)
        m.step(-5)
        #expect(m.addtimeValue == 30)
        #expect(m.addtimePreset == nil)
        for _ in 0..<10 { m.step(-5) }
        #expect(m.addtimeValue == 5)               // min 5 클램프
    }

    @Test func presetIsAdditive() {
        let m = RTAppModel()
        m.preset(10)
        #expect(m.addtimeValue == 45)              // 35 + 10 (가산형 — 시안 상태 유지 결정)
        #expect(m.addtimePreset == 10)
    }

    @Test func addTimeResetsAndCloses() {
        let m = RTAppModel()
        m.openSheet(.addtime)
        m.step(5)
        m.addTime()
        #expect(m.addtimeValue == 35)
        #expect(m.addtimePreset == 15)
        #expect(m.sheet == nil)
    }

    @Test func ratingAndSaveFinished() {
        let m = RTAppModel()
        m.nav(.detail)
        m.openSheet(.finish)
        m.rate(5)
        #expect(m.rating == 5)
        #expect(RTAppModel.ratingLabels[5] == "최고였어요")
        m.saveFinished()
        #expect(m.sheet == nil)
        #expect(m.route == .library)
    }

    @Test func toggleAddFlips() {
        let m = RTAppModel()
        #expect(m.added.contains("flow"))          // 13 데모: 첫 행 추가됨
        m.toggleAdd("flow")
        #expect(!m.added.contains("flow"))
        m.toggleAdd("money")
        #expect(m.added.contains("money"))
    }

    @Test func librarySortClosesSheetFilterDoesNot() {
        let m = RTAppModel()
        m.nav(.library)
        m.setLibraryFilter(.finished)
        #expect(m.libraryFilter == .finished)
        m.openSheet(.sort)
        m.setLibrarySort(.rating)
        #expect(m.librarySort == .rating)
        #expect(m.sheet == nil)
    }

    @Test func weekSelection() {
        let m = RTAppModel()
        #expect(m.weekSel == 3)                    // 데모: 목요일
        m.selectWeek(6)
        #expect(m.weekSel == 6)
    }
}

@MainActor
@Suite struct RTAppModelIntegrationHookTests {
    @Test func saveSessionFiresHookDeleteDoesNot() {
        let m = RTAppModel()
        var captured: (RTMode, Int)?
        m.onSessionSaved = { captured = ($0, $1) }
        m.simFlip()
        m.endSession()
        m.saveSession()
        #expect(captured?.0 == .flip)
        #expect(captured?.1 == RTAppModel.demoElapsed)

        let m2 = RTAppModel()
        var fired = false
        m2.onSessionSaved = { _, _ in fired = true }
        m2.simFlip()
        m2.endSession()
        m2.deleteSession()
        #expect(!fired)
    }

    @Test func searchUsesProviderElseKeepsDemo() async {
        let m = RTAppModel()
        m.searchProvider = { q in
            [RTBookHit(title: "결과-\(q)", author: "저자", publisher: "출판", isbn: "979-1", coverUrl: "")]
        }
        await m.search("flow")
        #expect(m.searchQuery == "flow")
        #expect(m.searchResults?.count == 1)
        #expect(m.searchResults?.first?.title == "결과-flow")

        let m2 = RTAppModel()
        await m2.search("x")
        #expect(m2.searchResults == nil)   // provider 없으면 데모 rows 유지
    }
}

@MainActor
@Suite struct RTAppModelApplyTests {
    @Test func appliesActionSequence() {
        let m = RTAppModel()
        for a in ["login", "simFlip", "togglePause", "togglePause"] { m.apply(a) }
        #expect(m.route == .flipTimer)
        #expect(m.session?.status == .recording)

        let m2 = RTAppModel()
        for a in ["login", "mode:tap", "start", "togglePause"] { m2.apply(a) }
        #expect(m2.route == .tapTimer)
        #expect(m2.session?.status == .paused)

        let m3 = RTAppModel()
        for a in ["login", "nav:12", "filter:finished", "sort:rating", "sheet:sort", "week:0", "rate:2", "step:-5", "preset:30", "toggleAdd:money", "tick"] { m3.apply(a) }
        #expect(m3.libraryFilter == .finished)
        #expect(m3.librarySort == .rating)
        #expect(m3.sheet == .sort)
        #expect(m3.weekSel == 0)
        #expect(m3.rating == 2)
        #expect(m3.addtimeValue == 60)   // 35 -5 +30
        #expect(m3.added.contains("money"))
    }
}

// 12 정렬 — 프로토타입 오라클 (node localeCompare('ko') / JS 안정 정렬 실측값)
@MainActor
@Suite struct Screen12SortTests {
    func keys(_ sort: RTLibrarySort) -> [String] {
        let m = RTAppModel()
        m.setLibrarySort(sort)
        return Screen12Library(model: m).sortedFinished.map(\.key)
    }

    @Test func nameSortMatchesPrototype() {
        #expect(keys(.name) == ["focus", "money", "same", "light", "farewell", "trend"])
    }

    @Test func ratingSortIsStableLikePrototype() {
        // 동률(5·5, 4·4, 3·3)은 원본 순서 유지 — JS 안정 정렬과 동일해야 함
        #expect(keys(.rating) == ["farewell", "light", "money", "same", "trend", "focus"])
    }

    @Test func recentKeepsOriginalOrder() {
        #expect(keys(.recent) == ["money", "farewell", "trend", "light", "same", "focus"])
    }
}

