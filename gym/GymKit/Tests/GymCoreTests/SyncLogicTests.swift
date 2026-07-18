import Foundation
import Testing
@testable import GymCore

// 동기화 병합 로직 — sync.js resolveConflict/resolveSessionConflict/resolveSettingsConflict/급감 차단 정합 (spec §4).
@Suite struct SyncLogicTests {

    func sess(_ id: String, status: GymSessionStatus, end: Int64? = nil, start: Int64? = nil) -> GymSession {
        GymSession(id: id, date: "2026-07-01", startTime: start, endTime: end, status: status)
    }

    @Test func sessionConflictCompletedWins() {
        let localDone = sess("a", status: .completed, end: 100)
        let serverActive = sess("a", status: .active, end: 200)
        #expect(GymSyncLogic.resolveSession(local: localDone, server: serverActive).status == .completed)
        // 둘 다 completed → endTime 늦은 쪽, 동률 server
        let l = sess("a", status: .completed, end: 300)
        let s = sess("a", status: .completed, end: 200)
        #expect(GymSyncLogic.resolveSession(local: l, server: s).endTime == 300)
        let tie = GymSyncLogic.resolveSession(local: sess("a", status: .completed, end: 200, start: 1),
                                              server: sess("a", status: .completed, end: 200, start: 2))
        #expect(tie.startTime == 2)   // 동률 → server
    }

    @Test func prConflictBiggerE1RMWins() {
        let local = GymPR(exerciseId: "bench_press", weight: 70, reps: 8, e1rm: 88.7, date: "d")
        let server = GymPR(exerciseId: "bench_press", weight: 65, reps: 10, e1rm: 86.7, date: "d")
        #expect(GymSyncLogic.resolvePR(local: local, server: server).e1rm == 88.7)
        // server ≥ local → server
        let server2 = GymPR(exerciseId: "bench_press", weight: 70, reps: 10, e1rm: 93.3, date: "d")
        #expect(GymSyncLogic.resolvePR(local: local, server: server2).e1rm == 93.3)
    }

    @Test func settingsConflictLWW() {
        var local = GymUserSettings(weeklyGoal: 5); local.updatedAt = 2_000
        var server = GymUserSettings(weeklyGoal: 3); server.updatedAt = 1_000
        #expect(GymSyncLogic.resolveSettings(local: local, server: server).weeklyGoal == 5)
        server.updatedAt = 3_000
        #expect(GymSyncLogic.resolveSettings(local: local, server: server).weeklyGoal == 3)
        // legacy 0 동률 → server 우선
        local.updatedAt = 0; server.updatedAt = 0
        #expect(GymSyncLogic.resolveSettings(local: local, server: server).weeklyGoal == 3)
    }

    @Test func shrinkGuardBlocksHalfLoss() {
        #expect(GymSyncLogic.isShrinkBlocked(localCount: 10, serverCount: 30) == true)   // 33%
        #expect(GymSyncLogic.isShrinkBlocked(localCount: 15, serverCount: 30) == false)  // 정확 50% 는 허용
        #expect(GymSyncLogic.isShrinkBlocked(localCount: 0, serverCount: 0) == false)    // 서버 빈 상태 무시
        #expect(GymSyncLogic.isShrinkBlocked(localCount: 5, serverCount: nil) == false)  // 서버 count 미상
    }

    @Test func mergeSessionsUnionById() {
        let local = [sess("a", status: .completed, end: 100), sess("b", status: .completed, end: 50)]
        let server = [sess("a", status: .active, end: 999), sess("c", status: .completed, end: 70)]
        let merged = GymSyncLogic.mergeSessions(local: local, server: server)
        #expect(merged.count == 3)
        #expect(merged.first { $0.id == "a" }?.status == .completed)   // completed 보존
        #expect(merged.contains { $0.id == "b" })                       // 로컬 전용 보존
        #expect(merged.contains { $0.id == "c" })                       // 서버 전용 수용
    }

    @Test func settingsUpdatedAtTolerantDecode() throws {
        let legacy = #"{"weeklyGoal":4,"goalWeight":69}"#.data(using: .utf8)!
        let s = try JSONDecoder().decode(GymUserSettings.self, from: legacy)
        #expect(s.updatedAt == 0)
    }

    // 서버에 쌓인 orphan active 세션 정리 — discard/sweep 로 로컬에선 이미 버려졌지만 서버엔 남은
    // active(0 done) 세션을 sync 가 삭제 대상으로 골라낸다. 앱이 이미 로컬에서 버린 결정을 서버에
    // 전파하는 것이라 신규 데이터 손실 없음(0 done = 커밋 작업 없음). done 있는 active·completed·
    // current 세션은 보존한다.
    func act(_ id: String, done: Bool) -> GymSession {
        GymSession(id: id, date: "2026-07-18",
                   blocks: [GymBlock(exerciseId: "bench_press", sets: [GymSet(weight: 60, reps: 10, done: done)])],
                   status: .active)
    }

    @Test func abandonedActiveIds0DoneNonCurrent() {
        let server = [
            act("cur", done: false),                                      // 현재 세션 — 유지
            act("orphan1", done: false),                                  // 0 done orphan → 삭제
            act("orphan2", done: false),                                  // 0 done orphan → 삭제
            act("hasWork", done: true),                                   // done 있음 → 보존(안전)
            GymSession(id: "c1", date: "2026-07-15", status: .completed), // completed → 무관
        ]
        #expect(Set(GymSyncLogic.abandonedActiveSessionIds(server: server, keepId: "cur")) == ["orphan1", "orphan2"])
    }

    @Test func abandonedKeepIdAbsentDeletesAll0Done() {
        // keepId 가 서버에 없음(로컬 신규 세션) → 서버의 0 done active 전부 삭제 대상, done 있는 것만 보존
        let server = [act("a", done: false), act("b", done: true), act("c", done: false)]
        #expect(Set(GymSyncLogic.abandonedActiveSessionIds(server: server, keepId: "local-new")) == ["a", "c"])
    }

    @Test func abandonedEmptyWhenNoOrphans() {
        #expect(GymSyncLogic.abandonedActiveSessionIds(server: [act("cur", done: false)], keepId: "cur").isEmpty)
        #expect(GymSyncLogic.abandonedActiveSessionIds(server: [], keepId: "cur").isEmpty)
    }
}
