import Foundation
import Testing
@testable import GymCore

// 홈 부위 밸런스 — home.js summarizeWeeklyBalance 정합 (롤링 7일·고정 부위순서·유산소 별도·focus 규칙).
@Suite struct HomeLogicTests {

    func mk(_ date: String, _ exId: String, doneSets: Int, duration: Double? = nil) -> GymSession {
        let sets = (0..<doneSets).map { _ in
            GymSet(weight: duration == nil ? 50 : nil, reps: duration == nil ? 10 : nil,
                   done: true, duration: duration)
        }
        return GymSession(id: "\(date)-\(exId)", date: date,
                          blocks: [GymBlock(exerciseId: exId, sets: sets)], status: .completed)
    }
    // 2026-05-06 기준 — this: [4/30, 5/6], prev: [4/23, 4/29]
    let now = GymWeightLogic.isoFmt.date(from: "2026-05-06")!

    @Test func rollingSevenDayWindows() {
        let sessions = [
            mk("2026-04-30", "squat", doneSets: 4),      // this 경계 안 (today-6)
            mk("2026-04-29", "squat", doneSets: 3),      // prev 경계 (today-7)
            mk("2026-04-23", "bench_press", doneSets: 2),// prev 경계 (today-13)
            mk("2026-04-22", "bench_press", doneSets: 9),// 창 밖 — 제외
        ]
        let b = GymHomeLogic.weeklyBalance(sessions: sessions, custom: [], now: now)
        let legs = b.parts.first { $0.key == "legs" }!
        let chest = b.parts.first { $0.key == "chest" }!
        #expect(legs.sets == 4 && legs.prevSets == 3)
        #expect(chest.sets == 0 && chest.prevSets == 2)
    }

    @Test func fixedOrderAndFocusRule() {
        let b = GymHomeLogic.weeklyBalance(sessions: [mk("2026-05-05", "squat", doneSets: 10)],
                                           custom: [], now: now)
        #expect(b.parts.map(\.key) == ["legs", "shoulder", "back", "chest", "arms", "core"])
        #expect(b.focusKey == "shoulder")   // 최소(0) 동률 → 고정순서 첫 번째
        // 전부 0 → focus 없음
        let empty = GymHomeLogic.weeklyBalance(sessions: [], custom: [], now: now)
        #expect(empty.focusKey == nil)
        #expect(empty.max == 1)
    }

    @Test func cardioSeparateRowAndCoreMapping() {
        let sessions = [
            mk("2026-05-05", "treadmill", doneSets: 1, duration: 1800),   // 30분 → 유산소 행
            mk("2026-05-04", "hanging_leg_raise", doneSets: 5),           // core 부위
            mk("2026-04-28", "treadmill", doneSets: 1, duration: 600),    // prev 10분
        ]
        let b = GymHomeLogic.weeklyBalance(sessions: sessions, custom: [], now: now)
        #expect(b.cardioMin == 30 && b.cardioCount == 1)
        #expect(b.cardioDeltaMin == 20)
        let core = b.parts.first { $0.key == "core" }!
        #expect(core.sets == 5)
        // cardio 는 부위 막대에 미포함
        #expect(b.parts.allSatisfy { $0.key != "cardio" })
    }
}
