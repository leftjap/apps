import Testing
@testable import GymCore

// LocalStore 다중 스토어 CRUD — 이력·PR·체중·설정 (queries.js 정합).
@Suite struct StoreTests {
    @Test func sessionHistoryUpsertDedup() {
        LocalStore.saveSessions([])
        LocalStore.upsertSessionHistory(GymSession(id: "a", date: "2026-05-01", startTime: 100))
        LocalStore.upsertSessionHistory(GymSession(id: "b", date: "2026-05-03", startTime: 300))
        LocalStore.upsertSessionHistory(GymSession(id: "a", date: "2026-05-02", startTime: 200))  // id=a 교체
        let xs = LocalStore.loadSessions()
        #expect(xs.count == 2)
        #expect(xs.first?.id == "b")   // startTime desc
        LocalStore.saveSessions([])
    }

    @Test func prUpsertByCompositeId() {
        LocalStore.savePRs([])
        LocalStore.upsertPR(GymPR(exerciseId: "bench_press", weight: 60, reps: 10, e1rm: 80, date: "2026-05-01"))
        LocalStore.upsertPR(GymPR(exerciseId: "bench_press", weight: 70, reps: 8, e1rm: 88.7, date: "2026-05-03"))
        let xs = LocalStore.loadPRs()
        #expect(xs.count == 1)          // 같은 exerciseId_e1rm id → 교체
        #expect(xs.first?.e1rm == 88.7)
        #expect(LocalStore.prsByExercise("bench_press").count == 1)
        LocalStore.savePRs([])
    }

    @Test func weightUpsertByDate() {
        LocalStore.saveWeights([])
        LocalStore.upsertWeight(GymWeight(date: "2026-05-01", kg: 72.5))
        LocalStore.upsertWeight(GymWeight(date: "2026-05-01", kg: 72.2))  // 같은 날짜 교체
        LocalStore.upsertWeight(GymWeight(date: "2026-05-03", kg: 72.0))
        let xs = LocalStore.loadWeights()
        #expect(xs.count == 2)
        #expect(xs.first?.date == "2026-05-03")  // date desc
        #expect(xs.last?.kg == 72.2)
        LocalStore.saveWeights([])
    }

    @Test func settingsRoundTrip() {
        LocalStore.saveSettings(GymUserSettings(weeklyGoal: 5, goalWeight: 68))
        let s = LocalStore.loadSettings()
        #expect(s.weeklyGoal == 5)
        #expect(s.goalWeight == 68)
        LocalStore.saveSettings(GymUserSettings())  // 기본값 복원
        #expect(LocalStore.loadSettings().weeklyGoal == 4)
    }
}
