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

    // 홈 체중 카드 스파크라인 (재설계 2026-08-17 §9) — 30일 창 안에서만 평균 내면 첫 점이 실측값이
    // 되어버린다. 전체 이력에 sma7 을 먼저 적용한 뒤 창을 절단해야 창 첫 점도 진짜 이동평균이다.
    @Test func recentSmaAppliesSma7BeforeSlicingWindow() {
        // d1~d9 = 80kg, d10 = 60kg. 창 3일 → d8·d9·d10.
        let rows = (1...10).map { i -> (date: String, kg: Double) in
            (date: String(format: "2026-06-%02d", i), kg: i == 10 ? 60 : 80)
        }
        let now = GymWeightLogic.isoFmt.date(from: "2026-06-10")!
        let out = GymWeightLogic.recentSma(rows: rows, days: 3, now: now)
        #expect(out.count == 3)
        #expect(out[0] == 80 && out[1] == 80)
        // d10 = (80×6 + 60)/7. 창 안에서만 냈다면 (80+80+60)/3 = 73.33 이 나온다.
        #expect(abs(out[2] - 540.0 / 7) < 0.0001)
    }

    @Test func recentSmaKeepsOnlyWindowDates() {
        let rows = (1...40).map { i -> (date: String, kg: Double) in
            (date: GymWeightLogic.isoFmt.string(
                from: Calendar(identifier: .gregorian).date(byAdding: .day, value: i - 1,
                                                            to: GymWeightLogic.isoFmt.date(from: "2026-06-01")!)!),
             kg: 70)
        }
        let now = GymWeightLogic.isoFmt.date(from: "2026-07-10")!   // = 40번째 날
        #expect(GymWeightLogic.recentSma(rows: rows, days: 30, now: now).count == 30)
    }

    // 위 = 무거움. 최고값이 pad, 최저값이 height-pad. x 는 균등 분할.
    @Test func sparklinePointsMapMaxToTop() {
        let pts = GymWeightLogic.sparklinePoints(values: [80, 80, 540.0 / 7],
                                                 width: 132, height: 38, pad: 3)
        #expect(pts.count == 3)
        #expect(pts.map(\.x) == [0, 66, 132])
        #expect(abs(pts[0].y - 3) < 0.001)
        #expect(abs(pts[2].y - 35) < 0.001)
    }

    // 전부 같은 값 — 0 나눗셈 없이 세로 중앙에 평평하게.
    @Test func sparklineFlatSeriesSitsAtMiddle() {
        let pts = GymWeightLogic.sparklinePoints(values: [70, 70, 70], width: 132, height: 38, pad: 3)
        #expect(pts.allSatisfy { abs($0.y - 19) < 0.001 })
    }

    // 점 1개 이하 — 선을 못 그린다. 빈 배열로 뷰가 스파크라인을 숨긴다.
    @Test func sparklineNeedsTwoPoints() {
        #expect(GymWeightLogic.sparklinePoints(values: [70], width: 132, height: 38, pad: 3).isEmpty)
        #expect(GymWeightLogic.sparklinePoints(values: [], width: 132, height: 38, pad: 3).isEmpty)
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
