import Testing
@testable import GymCore

// PR 로직 — pr.js 정합 (Epley·엄격 판정·세션 재계산).
@Suite struct PRTests {
    @Test func epleyAndRound() {
        #expect(GymPRLogic.roundE1RM(GymPRLogic.epley(60, 10)) == 80)     // 60×(1+10/30)=80
        #expect(GymPRLogic.roundE1RM(GymPRLogic.epley(100, 1)) == 103.3)  // 100×(1+1/30)=103.33→103.3
        #expect(GymPRLogic.epley(0, 10) == 0)
        #expect(GymPRLogic.epley(60, 0) == 0)
    }

    @Test func newPRWhenNoHistory() {
        let r = GymPRLogic.evaluateSetPR(weight: 60, reps: 10, prs: [], exerciseId: "bench_press")
        #expect(r.isPR == true)
        #expect(r.e1rm == 80)
    }

    @Test func strictExceedIsPRTieIsNot() {
        let prev = GymPR(exerciseId: "bench_press", weight: 60, reps: 10, e1rm: 80, date: "2026-05-01")
        let tie = GymPRLogic.evaluateSetPR(weight: 60, reps: 10, prs: [prev], exerciseId: "bench_press")
        #expect(tie.isPR == false)   // 동률은 PR 아님
        let up = GymPRLogic.evaluateSetPR(weight: 65, reps: 10, prs: [prev], exerciseId: "bench_press")
        #expect(up.isPR == true)     // 86.7 > 80
    }

    @Test func bestSetsInSession() {
        let s = GymSession(id: "x", date: "2026-05-06", blocks: [
            GymBlock(exerciseId: "bench_press", sets: [
                GymSet(weight: 60, reps: 10, done: true),
                GymSet(weight: 70, reps: 8, done: true),
                GymSet(weight: 65, reps: 10, done: false)])])   // 미완료는 제외
        let best = GymPRLogic.findBestSetsInSession(s)
        #expect(best["bench_press"]?.e1rm == 88.7)  // 70×(1+8/30)=88.67→88.7
        #expect(best["bench_press"]?.weight == 70)
    }
}
