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

    // MARK: - 빈 완료 세션 정리 (2026-09-17)

    // done 세트가 하나도 없는 완료 세션은 기록이 아닌데도 통계 볼륨 히트맵에 그날을 운동일로
    // 찍는다 (`CalendarHeat.dayVolumes` 는 완료 세션이면 볼륨 0 이라도 키를 남긴다).
    // 실기기에서 실제로 하나 생겼다 — 안전장치를 걸고 그것만 지운다.
    @Test func emptyCompletedSessionIdsPicksOnlyRecordlessOnes() {
        let sessions = [
            GymSession(id: "empty", date: "2026-09-17", blocks: [], status: .completed),
            GymSession(id: "preset-only", date: "2026-09-17",
                       blocks: [GymBlock(exerciseId: "squat",
                                         sets: [GymSet(weight: 100, reps: 5, preset: true)])],
                       status: .completed),
            GymSession(id: "real", date: "2026-09-17",
                       blocks: [GymBlock(exerciseId: "squat",
                                         sets: [GymSet(weight: 100, reps: 5, done: true)])],
                       status: .completed),
            GymSession(id: "other-day", date: "2026-09-16", blocks: [], status: .completed),
        ]
        let ids = GymAppModel.emptyCompletedSessionIds(sessions, on: "2026-09-17")
        #expect(Set(ids) == ["empty", "preset-only"], "기록 있는 세션이나 다른 날을 건드리면 안 된다")
    }

    // 기록이 있는 날은 아무것도 지우지 않는다 — 실수로 불러도 안전해야 한다.
    @Test func purgeLeavesDaysThatHaveRecords() {
        seed(["2026-07-13", "2026-07-14"])                  // 둘 다 done 세트 있음
        let m = GymAppModel(snapshotSession: GymSession(id: "x", date: "2026-07-14"))
        m.history = LocalStore.loadSessions()
        let before = m.history.count
        m.purgeEmptyCompletedSessions(on: "2026-07-13")
        #expect(m.history.count == before, "기록 있는 날이 지워졌다")
    }

    // 빈 세션만 빠지고 같은 날 기록 있는 세션은 남는다.
    @Test func purgeRemovesOnlyTheEmptyOne() {
        LocalStore.saveSessions([
            GymSession(id: "empty", date: "2026-09-17", blocks: [], status: .completed),
            GymSession(id: "real", date: "2026-09-17",
                       blocks: [GymBlock(exerciseId: "squat",
                                         sets: [GymSet(weight: 100, reps: 5, done: true)])],
                       status: .completed),
        ])
        let m = GymAppModel(snapshotSession: GymSession(id: "x", date: "2026-09-17"))
        m.history = LocalStore.loadSessions()
        m.purgeEmptyCompletedSessions(on: "2026-09-17")
        #expect(m.history.map(\.id) == ["real"])
        #expect(LocalStore.loadSessions().map(\.id) == ["real"])
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
