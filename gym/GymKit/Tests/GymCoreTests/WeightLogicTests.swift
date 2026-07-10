import Foundation
import Testing
@testable import GymCore

// 체중 로직 — weights.js sma7/isWeightPR/calculateRemainingLoss/estimateGoalDate 정합 (§10-2).
@Suite struct WeightLogicTests {

    @Test func sma7WindowAverage() {
        let rows: [(String, Double)] = [("d1", 70), ("d2", 72), ("d3", 74)]
        let out = GymWeightLogic.sma7(rows)
        #expect(out.count == 3)
        #expect(out[0].sma == 70)
        #expect(out[1].sma == 71)   // (70+72)/2
        #expect(out[2].sma == 72)   // (70+72+74)/3
    }

    @Test func weightPRWhenBelowAllPrev() {
        #expect(GymWeightLogic.isWeightPR(69.2, prev: [70.0, 69.4, 71.2]) == true)
        #expect(GymWeightLogic.isWeightPR(69.4, prev: [70.0, 69.4]) == false)   // 동률은 PR 아님
        #expect(GymWeightLogic.isWeightPR(69.0, prev: []) == false)             // 첫 입력은 비교 없음
    }

    @Test func remainingLossFloorsAtZero() {
        #expect(GymWeightLogic.remainingLoss(current: 72.4, goal: 69) == 3.4)
        #expect(GymWeightLogic.remainingLoss(current: 68.5, goal: 69) == 0)
    }

    @Test func estimateGoalDateAtMonthlyPace() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Seoul")!
        let now = cal.date(from: DateComponents(year: 2026, month: 7, day: 10))!
        // 남은 3.0kg / 월 1.5kg = 2개월 = ceil(2×30.44)=61일 → 2026-09-09
        #expect(GymWeightLogic.estimateGoalDate(current: 72, goal: 69, monthlyLossKg: 1.5, now: now) == "2026-09-09")
        // 이미 달성 → 오늘
        #expect(GymWeightLogic.estimateGoalDate(current: 68, goal: 69, monthlyLossKg: 1.5, now: now) == "2026-07-10")
        // 페이스 0 → nil
        #expect(GymWeightLogic.estimateGoalDate(current: 72, goal: 69, monthlyLossKg: 0, now: now) == nil)
    }

    @Test func chartPointsNormalized() {
        let rows: [Double] = [72, 70]
        let p = GymWeightLogic.chartPoints(weights: rows, goal: 69, width: 300, height: 120)
        #expect(p.weightPts.count == 2)
        // min=69(goal), max=72 → 72 는 top(10), 69 는 bottom(110)
        #expect(abs(p.weightPts[0].y - 10) < 0.01)
        #expect(abs(p.goalY - 110) < 0.01)
        #expect(p.weightPts[0].x == 0 && p.weightPts[1].x == 300)
    }
}
