import Testing
import Foundation
@testable import RTViews

// 진행 중 세션의 벽시계 기준점 — 2026-11-08 검토:
//  ① 04 화면을 눌러 이어 읽으면 엎기 엔진의 시계는 멈춘 채라, 폰을 들 때(또는 앱 활성 복귀 때) 엔진 값으로 덮어써
//     누른 뒤 읽은 시간이 사라졌다. → 기준점(상태가 바뀐 시각·그때의 경과)을 세션 자체에 두고, 엔진·화면 탭 모두
//     같은 모델 동작(simFlip/togglePause)으로 상태를 바꾼다. 경과는 벽시계로 계산하고 틱보다 줄지 않는다.
//  ② 기록 중에 앱이 종료되면 마지막 틱 이후 시간이 빠지고, 저장 날짜는 저장한 순간(다음 날일 수 있음)이 됐다.
//     → 복원 시 꺼져 있던 시간을 restoredGap 으로 알려 넣을지 고르게 하고, 저장 시각은 마지막 기록 시각을 쓴다.

final class TestClock { var t: Date; init(_ t: Date) { self.t = t } }

@MainActor
@Suite struct RTSessionWallClockTests {
    let t0 = Date(timeIntervalSinceReferenceDate: 800_000_000)

    private func model(_ clock: TestClock) -> RTAppModel {
        let m = RTAppModel()
        m.sessionSeed = 0
        m.login()
        m.userData = RTUserData(books: [RTBook(isbn: "A", title: "몰입", author: "", publisher: "", coverUrl: "",
                                               addedAt: Date(timeIntervalSince1970: 0))], sessions: [])
        m.now = { clock.t }
        return m
    }

    // ① 엎어서 시작 → 들어 일시정지 → 04 화면 탭으로 재개 → 다시 들어 일시정지: 탭 이후 시간이 남는다
    @Test func screenTapResumeThenLiftKeepsTime() {
        let clock = TestClock(t0)
        let m = model(clock)
        m.simFlip(at: t0)
        m.togglePause(at: t0.addingTimeInterval(60))          // 들어올림
        #expect(m.session?.elapsed == 60)
        clock.t = t0.addingTimeInterval(100)
        m.togglePause()                                        // 04 가운데 탭 = 이어 읽기
        #expect(m.session?.status == .recording)
        m.togglePause(at: t0.addingTimeInterval(400))         // 다시 들어올림
        #expect(m.session?.elapsed == 360)
    }

    // 활성 복귀 보정: 기록 중이면 벽시계 경과로 올린다
    @Test func refreshUsesWallClockWhileRecording() {
        let clock = TestClock(t0)
        let m = model(clock)
        m.simFlip(at: t0)
        clock.t = t0.addingTimeInterval(90)
        m.refreshElapsed()
        #expect(m.session?.elapsed == 90)
    }

    // 틱이 앞서 있으면 줄이지 않는다 (경과는 절대 뒤로 가지 않는다)
    @Test func refreshNeverDecreases() {
        let clock = TestClock(t0)
        let m = model(clock)
        m.simFlip(at: t0)
        m.tick(); m.tick(); m.tick()
        clock.t = t0.addingTimeInterval(1)
        m.refreshElapsed()
        #expect(m.session?.elapsed == 3)
    }

    // 잠금 확인 뒤 소급 시작(보류 엎힘): 엎은 시각부터 센다
    @Test func retroactiveStartCountsFromFlipTime() {
        let clock = TestClock(t0)
        let m = model(clock)
        m.simFlip(at: t0.addingTimeInterval(-10))
        m.refreshElapsed()
        #expect(m.session?.elapsed == 10)
    }

    // 일시정지 중엔 시간이 흐르지 않는다
    @Test func pausedRefreshIsFrozen() {
        let clock = TestClock(t0)
        let m = model(clock)
        m.simFlip(at: t0)
        m.togglePause(at: t0.addingTimeInterval(60))
        clock.t = t0.addingTimeInterval(500)
        m.refreshElapsed()
        #expect(m.session?.elapsed == 60)
    }

    // 저장 시각 = 마지막 기록 시각 — 밤에 들어 멈추고 다음 날 아침 "여기까지 읽기"·저장해도 그날 기록이다
    @Test func savedRecordEndsAtLastPause() {
        let clock = TestClock(t0)
        let m = model(clock)
        m.start(isbn: "A")
        m.simFlip(at: t0)
        m.togglePause(at: t0.addingTimeInterval(600))
        clock.t = t0.addingTimeInterval(8 * 3600)
        m.endSession()
        m.saveSession()
        let rec = m.userData?.sessions.last
        #expect(rec?.endedAt == t0.addingTimeInterval(600))
        #expect(rec?.seconds == 600)
    }

    // 기록 중에 "여기까지 읽기" → 그 시각이 끝, 저장을 늦게 눌러도 시간이 더 붙지 않는다
    @Test func endWhileRecordingEndsThen() {
        let clock = TestClock(t0)
        let m = model(clock)
        m.start(isbn: "A")
        m.simFlip(at: t0)
        clock.t = t0.addingTimeInterval(300)
        m.endSession()
        clock.t = t0.addingTimeInterval(400)
        m.saveSession()
        let rec = m.userData?.sessions.last
        #expect(rec?.endedAt == t0.addingTimeInterval(300))
        #expect(rec?.seconds == 300)
    }

    // ② 기록 중 종료된 세션 복원: 마지막 틱(t0+60)까지만 넣고 일시정지, 꺼져 있던 540초는 restoredGap 으로
    private func killedSession() -> RTSession {
        RTSession(mode: .flip, status: .recording, elapsed: 160, pauseCount: 0,
                  startedAt: t0.addingTimeInterval(-100), isbn: "A",
                  anchorAt: t0, anchorElapsed: 100)
    }

    @Test func restoreRecordingSessionOffersGap() {
        let clock = TestClock(t0.addingTimeInterval(600))
        let m = model(clock)
        m.restoreSession(killedSession())
        #expect(m.session?.status == .paused)
        #expect(m.session?.elapsed == 160)
        #expect(m.restoredGap == 540)
    }

    @Test func includeGapAddsItAndEndsNow() {
        let clock = TestClock(t0.addingTimeInterval(600))
        let m = model(clock)
        m.restoreSession(killedSession())
        m.includeRestoredGap()
        #expect(m.restoredGap == nil)
        #expect(m.session?.elapsed == 700)
        #expect(m.session?.status == .paused)
        m.endSession(); m.saveSession()
        #expect(m.userData?.sessions.last?.endedAt == t0.addingTimeInterval(600))
    }

    @Test func dismissGapKeepsLastTickAndEndsThere() {
        let clock = TestClock(t0.addingTimeInterval(600))
        let m = model(clock)
        m.restoreSession(killedSession())
        m.dismissRestoredGap()
        #expect(m.restoredGap == nil)
        #expect(m.session?.elapsed == 160)
        clock.t = t0.addingTimeInterval(3600)
        m.endSession(); m.saveSession()
        #expect(m.userData?.sessions.last?.endedAt == t0.addingTimeInterval(60), "마지막으로 살아 있던 시각")
    }

    // 1분 미만 공백은 묻지 않는다 (재실행 직후 등)
    @Test func smallGapIsNotOffered() {
        let clock = TestClock(t0.addingTimeInterval(90))
        let m = model(clock)
        m.restoreSession(killedSession())
        #expect(m.restoredGap == nil)
        #expect(m.session?.elapsed == 160)
    }

    // 기준점이 없는 예전 저장본은 종전대로(일시정지·저장된 경과, 묻지 않음)
    @Test func legacySessionWithoutAnchorRestoresAsBefore() throws {
        let clock = TestClock(t0)
        let m = model(clock)
        let legacy = #"{"mode":"flip","status":"recording","elapsed":754,"pauseCount":1,"startedAt":800000000,"isbn":"A"}"#
        let saved = try JSONDecoder().decode(RTSession.self, from: Data(legacy.utf8))
        m.restoreSession(saved)
        #expect(m.session?.status == .paused && m.session?.elapsed == 754)
        #expect(m.restoredGap == nil)
    }

    // 기준점은 저장본에 들어간다 (앱 종료 후 복원 계산의 근거)
    @Test func anchorsArePersisted() throws {
        let clock = TestClock(t0)
        let m = model(clock)
        var last: RTSession?
        m.onSessionPersist = { last = $0 }
        m.simFlip(at: t0)
        let back = try JSONDecoder().decode(RTSession.self, from: JSONEncoder().encode(try #require(last)))
        #expect(back.anchorAt == t0 && back.anchorElapsed == 0)
    }
}

@Suite struct RTGapLabelTests {
    @Test func formats() {
        #expect(RTRootView.gapLabel(540) == "9분")
        #expect(RTRootView.gapLabel(3600) == "1시간")
        #expect(RTRootView.gapLabel(3900) == "1시간 5분")
    }
}
