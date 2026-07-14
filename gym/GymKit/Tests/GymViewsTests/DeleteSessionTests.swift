import Foundation
import Testing
import GymCore
@testable import GymViews

// 세션 삭제 — 로컬 삭제가 클라우드로 전파돼야 다음 sync 에 부활하지 않는다.
// 2026-07-14 감사: 네이티브 포팅이 삭제-전파(PWA queueDelete)를 유실 → deleteSessions 가
// 로컬만 지우고, mergeSessions(id-union) 가 서버 잔존 행을 되살리던 회귀.
@MainActor @Suite struct DeleteSessionTests {

    func seed(_ dates: [String]) {
        LocalStore.saveSessions(dates.enumerated().map { i, d in
            GymSession(id: "s\(i)-\(d)", date: d,
                       blocks: [GymBlock(exerciseId: "squat", sets: [GymSet(weight: 100, reps: 5, done: true)])],
                       status: .completed)
        })
    }

    @Test func deleteRemovesLocalSessionsOnDate() {
        seed(["2026-07-13", "2026-07-13", "2026-07-14"])
        let m = GymAppModel(snapshotSession: GymSession(id: "x", date: "2026-07-14"))
        m.history = LocalStore.loadSessions()
        m.deleteSessions(on: "2026-07-13")
        #expect(m.history.allSatisfy { $0.date != "2026-07-13" })
        #expect(m.history.contains { $0.date == "2026-07-14" })
        #expect(LocalStore.loadSessions().allSatisfy { $0.date != "2026-07-13" })
    }

    // 삭제 대상 id 수집 — 클라우드 전파용 (그 날짜의 모든 세션 id).
    @Test func collectsIdsToDelete() {
        seed(["2026-07-13", "2026-07-13", "2026-07-14"])
        let ids = GymAppModel.sessionIdsToDelete(LocalStore.loadSessions(), on: "2026-07-13")
        #expect(Set(ids) == ["s0-2026-07-13", "s1-2026-07-13"])
    }

    @Test func noIdsWhenDateAbsent() {
        seed(["2026-07-14"])
        #expect(GymAppModel.sessionIdsToDelete(LocalStore.loadSessions(), on: "2026-07-13").isEmpty)
    }
}
