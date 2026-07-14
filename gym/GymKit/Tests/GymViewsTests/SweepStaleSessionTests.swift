import Foundation
import Testing
import GymCore
@testable import GymViews

// 지난 날짜 방치 active 세션 스윕 (§8).
// 구결함: 가드에 `!session.blocks.isEmpty` 가 있어, 어제 앱만 열어 생긴 "빈" 활성 세션이 스윕에서 빠졌다.
// 그 세션이 살아남으면 startSession() 이 (active 라서) 그대로 재사용 → 오늘 한 운동이 어제 날짜로 기록됐다.
@MainActor @Suite struct SweepStaleSessionTests {

    let today = GymAppModel.dayFmt.date(from: "2026-07-14")!   // 화

    /// KST iso 자정 + 시각 → epoch ms.
    func millis(_ iso: String, hour: Int) -> Int64 {
        Int64((GymAppModel.dayFmt.date(from: iso)!.timeIntervalSince1970 + Double(hour) * 3600) * 1000)
    }

    @Test func staleEmptySessionIsReDatedToToday() {
        let stale = GymSession(id: "stale-empty", date: "2026-07-13", status: .active)
        let m = GymAppModel(snapshotSession: stale)      // snapshot init 은 sweep 미실행
        m.sweepStaleSessionIfNeeded(now: today)
        #expect(m.session.date == "2026-07-14")
        #expect(m.session.status == .active)
        #expect(m.session.blocks.isEmpty)
    }

    @Test func todaysSessionIsUntouched() {
        let fresh = GymSession(id: "fresh", date: "2026-07-14", status: .active)
        let m = GymAppModel(snapshotSession: fresh)
        m.sweepStaleSessionIfNeeded(now: today)
        #expect(m.session.id == "fresh")                 // 교체 안 됨
    }

    // done 세트가 있는 어제 세션은 기존대로 이력 보존 — 귀속일은 실제 운동일(어제) 그대로.
    @Test func staleWorkedSessionKeepsItsWorkoutDay() {
        let start = millis("2026-07-13", hour: 19)
        let worked = GymSession(id: "worked", date: "2026-07-13", startTime: start, blocks: [
            GymBlock(exerciseId: "squat",
                     sets: [GymSet(weight: 100, reps: 5, done: true)],
                     finishedAt: Double(start + 3_600_000)),
        ], status: .active)
        let m = GymAppModel(snapshotSession: worked)
        m.sweepStaleSessionIfNeeded(now: today)
        #expect(m.history.first { $0.id == "worked" }?.date == "2026-07-13")
        #expect(m.session.date == "2026-07-14")          // 새 빈 세션은 오늘
    }
}
