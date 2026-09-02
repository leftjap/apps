import Testing
import Foundation
@testable import RTViews

// 진행 중 세션 영속 — 실기기 실측(2026-09-02): 09-01 16:16 시작한 세션이 프레즌스(reading_since)만 남기고
// 저장되지 않았다(마지막 저장 세션 08-07). 세션이 메모리에만 있어 앱이 종료되면 그날 독서가 통째로 사라진다.
// 모델은 세션 변화마다 영속 훅을 부르고, 앱은 기동 시 복원해 '일시정지' 상태로 되살린다.
@MainActor
@Suite struct RTSessionPersistTests {
    private func model() -> RTAppModel {
        let m = RTAppModel()
        m.sessionSeed = 0
        m.login()
        m.userData = RTUserData(books: [RTBook(isbn: "A", title: "몰입", author: "", publisher: "", coverUrl: "",
                                               addedAt: Date(timeIntervalSince1970: 0))], sessions: [])
        return m
    }

    @Test func sessionLifecycleFiresPersistHook() {
        let m = model()
        var log: [String] = []
        m.onSessionPersist = { s in log.append(s.map { "\($0.status)|\($0.elapsed)" } ?? "nil") }
        m.start(isbn: "A")
        m.simFlip()                       // 기록 시작
        m.tick()                          // 1초
        m.togglePause()                   // 일시정지
        m.saveSession()                   // 저장 → 세션 없음
        #expect(log == ["recording|0", "recording|1", "paused|1", "nil"])
    }

    @Test func restoreFlipSessionAsPausedOnTimerScreen() {
        let m = model()
        var presence: [Bool] = []
        m.onReadingPresence = { presence.append($0) }
        let saved = RTSession(mode: .flip, status: .recording, elapsed: 754, pauseCount: 1,
                              startedAt: Date(timeIntervalSince1970: 1_780_000_000), isbn: "A")
        m.restoreSession(saved)
        #expect(m.route == .flipTimer)
        #expect(m.session?.status == .paused, "종료 시점을 모르므로 일시정지로 되살린다")
        #expect(m.session?.elapsed == 754 && m.session?.isbn == "A" && m.session?.pauseCount == 1)
        #expect(presence == [false], "복원 즉시 프레즌스 해제 — 매달린 reading_since 를 정리한다")
    }

    @Test func restoreTapSessionGoesToTapTimer() {
        let m = model()
        m.restoreSession(RTSession(mode: .tap, status: .paused, elapsed: 30, pauseCount: 0,
                                   startedAt: Date(), isbn: nil))
        #expect(m.route == .tapTimer && m.mode == .tap)
        #expect(m.session?.status == .paused && m.session?.elapsed == 30)
    }

    @Test func restoredSessionCanBeResumedAndSaved() {
        let m = model()
        m.restoreSession(RTSession(mode: .flip, status: .recording, elapsed: 600, pauseCount: 0,
                                   startedAt: Date(), isbn: "A"))
        m.togglePause()                   // 재개
        m.tick(); m.tick()
        m.endSession(); m.saveSession()
        #expect(m.userData?.sessions.last?.seconds == 602, "복원된 경과 + 재개 후 틱이 저장돼야 한다")
        #expect(m.session == nil && m.route == .home)
    }

    @Test func sessionRoundTripsThroughJSON() throws {
        let s = RTSession(mode: .tap, status: .paused, elapsed: 42, pauseCount: 2,
                          startedAt: Date(timeIntervalSince1970: 1_780_000_000), isbn: "B")
        let data = try JSONEncoder().encode(s)
        let back = try JSONDecoder().decode(RTSession.self, from: data)
        #expect(back.mode == .tap && back.status == .paused && back.elapsed == 42 && back.pauseCount == 2 && back.isbn == "B")
        #expect(back.startedAt == s.startedAt)
    }

    // 복원 후 시계 — 벽시계(WallClockSession)·탭 시계는 복원된 경과를 기준값으로 깔고 이어 세야 한다.
    // 그러지 않으면 재개 순간 0 부터 다시 세어 복원값을 덮어쓴다(FlipEngine.syncModel · TapClock 보정 경로).
    @Test func wallClockStartsFromRestoredBaseline() {
        let t0 = Date(timeIntervalSinceReferenceDate: 1_000)
        var c = WallClockSession()
        #expect(!c.hasStarted)
        c.start(at: t0, base: 754)
        c.pause(at: t0)
        #expect(c.hasStarted && c.elapsed(at: t0.addingTimeInterval(100)) == 754, "일시정지 중엔 기준값 유지")
        c.resume(at: t0.addingTimeInterval(100))
        #expect(c.elapsed(at: t0.addingTimeInterval(105)) == 759)
    }

    @Test func tapClockSeedsRestoredElapsed() {
        let t0 = Date(timeIntervalSinceReferenceDate: 2_000)
        var clock = RTTapSessionClock()
        let restored = RTSession(mode: .tap, status: .paused, elapsed: 30, pauseCount: 0, startedAt: t0, isbn: nil)
        clock.track(restored, at: t0)
        #expect(clock.elapsed(at: t0.addingTimeInterval(60)) == 30, "복원 직후(일시정지)는 30 유지")
        var resumed = restored; resumed.status = .recording
        clock.track(resumed, at: t0.addingTimeInterval(60))
        #expect(clock.elapsed(at: t0.addingTimeInterval(65)) == 35)
    }
}
