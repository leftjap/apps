import Foundation
import Testing
import GymCore
@testable import GymViews

// 유산소 입력 보존 — 모델 배선 (2026-08-02 실기기 보고: 입력 후 완료/종료 시 기록 소실).
@MainActor @Suite struct CardioFlowTests {

    func model() -> GymAppModel {
        var s = GymSession(id: "s", date: "2026-08-02", startTime: 1_000, status: .active)
        var set = GymSet(weight: nil, reps: nil, preset: true)
        set.duration = 25 * 60; set.distance = 3.0; set.preset = false
        s.blocks = [GymBlock(exerciseId: "treadmill", sets: [set])]
        return GymAppModel(snapshotSession: s)
    }

    // 종목 완료 — 입력값이 done 으로 확정·보존 (finishBlock isCardio 배선).
    @Test func finishBlockKeepsCardioEntry() {
        let m = model()
        m.finishBlock(at: 0)
        #expect(m.session.blocks[0].sets.count == 1)
        #expect(m.session.blocks[0].sets[0].done == true)
        #expect(m.session.blocks[0].sets[0].duration == 25 * 60.0)
    }

    // 종목 완료 없이 바로 세션 종료 — 입력한 유산소가 이력에 done 으로 남아야 한다.
    @Test func endSessionConfirmsEnteredCardio() {
        let m = model()
        m.endSession()
        let done = m.session.blocks[0].sets.filter(\.done)
        #expect(done.count == 1, "종료만 해도 입력 기록이 확정돼야 한다")
        #expect(done[0].distance == 3.0)
        #expect(m.session.status == .completed)
    }

    // 칼로리 — 유산소 실시간(25분, MET 7)이 반영된다 (체중 미등록 → 70kg).
    @Test func estimatedCaloriesUsesCardioEnteredTime() {
        let m = model()
        m.session.endTime = 1_000 + 25 * 60 * 1000   // 경과 = 유산소와 동일 25분
        let kcal = m.estimatedCalories()
        // 7 × 70 × (25/60) × 1.05 = 214.375 → 214 (근력 시간 0)
        #expect(kcal == 214)
    }
}
