import Foundation
import Testing
@testable import GymCore

private typealias WeightSparkSample = GymWeightLogic.WeightSparkSample

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
    // 되어버린다. 전체 이력에 이동평균을 먼저 적용한 뒤 창을 절단해야 창 첫 점도 진짜 이동평균이다.
    @Test func recentSmaAveragesBeforeSlicingWindow() {
        // d1~d9 = 80kg, d10 = 60kg. 창 3일 → d8·d9·d10.
        let rows = (1...10).map { i -> (date: String, kg: Double) in
            (date: String(format: "2026-06-%02d", i), kg: i == 10 ? 60 : 80)
        }
        let now = GymWeightLogic.isoFmt.date(from: "2026-06-10")!
        let out = GymWeightLogic.recentSma(rows: rows, days: 3, now: now)
        #expect(out.count == 3)
        #expect(out[0].sma == 80 && out[1].sma == 80)
        // d10 = (80×6 + 60)/7. 창 안에서만 냈다면 (80+80+60)/3 = 73.33 이 나온다.
        #expect(abs(out[2].sma - 540.0 / 7) < 0.0001)
    }

    // 이동평균 창은 **날짜 기준 7일**이다 (기록 7개가 아니라). 기록이 띄엄띄엄한 구간에서
    // 개수로 세면 몇 주 전 체중이 오늘 평균에 섞여 들어간다 (2026-09-10 실데이터: 8월 중순
    // 기록 간격이 7일까지 벌어져 sma 가 3주치 평균이었다).
    @Test func recentSmaWindowsBySevenDaysNotSevenEntries() {
        let rows: [(date: String, kg: Double)] = [
            ("2026-08-01", 80), ("2026-08-02", 80), ("2026-08-03", 80),
            ("2026-08-28", 70), ("2026-08-30", 70),          // 7일 창 안(8/24~8/30)
        ]
        let now = GymWeightLogic.isoFmt.date(from: "2026-08-30")!
        let out = GymWeightLogic.recentSma(rows: rows, days: 30, now: now)
        // 마지막 점 = 8/24~8/30 두 기록 평균 70. 개수 기준이면 (80×3+70×2)/5 = 76 이 나온다.
        #expect(out.last!.sma == 70)
    }

    // x 는 기록 순번이 아니라 **날짜**를 따른다 — 창 시작(오늘-29일)이 0, 오늘이 span.
    @Test func recentSmaCarriesDayOffsetFromWindowStart() {
        let rows: [(date: String, kg: Double)] = [("2026-08-12", 74), ("2026-09-10", 75)]
        let now = GymWeightLogic.isoFmt.date(from: "2026-09-10")!
        let out = GymWeightLogic.recentSma(rows: rows, days: 30, now: now)
        #expect(out.map(\.dayOffset) == [0, 29])
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

    // 위 = 무거움. 최고값이 pad, 최저값이 height-pad. x 는 날짜 비례.
    @Test func sparklinePointsMapMaxToTop() {
        let s = [WeightSparkSample(dayOffset: 0, sma: 80),
                 WeightSparkSample(dayOffset: 15, sma: 80),
                 WeightSparkSample(dayOffset: 29, sma: 540.0 / 7)]
        let pts = GymWeightLogic.sparklinePoints(samples: s, windowDays: 30,
                                                 width: 132, height: 38, pad: 3)
        #expect(pts.count == 3)
        #expect(abs(pts[0].x - 0) < 0.001)
        #expect(abs(pts[1].x - 132 * 15 / 29) < 0.001)
        #expect(abs(pts[2].x - 132) < 0.001)
        #expect(abs(pts[0].y - 3) < 0.001)
        #expect(abs(pts[2].y - 35) < 0.001)
    }

    // 기록 공백은 가로로도 비어야 한다 — 7일 쉰 구간이 하루 간격과 같은 폭이면 추이가 왜곡된다.
    @Test func sparklineGapWidensWithDateDistance() {
        let s = [WeightSparkSample(dayOffset: 0, sma: 74),
                 WeightSparkSample(dayOffset: 1, sma: 73),
                 WeightSparkSample(dayOffset: 29, sma: 75)]
        let pts = GymWeightLogic.sparklinePoints(samples: s, windowDays: 30,
                                                 width: 290, height: 38, pad: 3)
        #expect(abs((pts[1].x - pts[0].x) - 10) < 0.001)    // 하루 = 10px
        #expect(abs((pts[2].x - pts[1].x) - 280) < 0.001)   // 28일 = 280px
    }

    // 전부 같은 값 — 0 나눗셈 없이 세로 중앙에 평평하게.
    @Test func sparklineFlatSeriesSitsAtMiddle() {
        let s = (0..<3).map { WeightSparkSample(dayOffset: $0 * 10, sma: 70) }
        let pts = GymWeightLogic.sparklinePoints(samples: s, windowDays: 30,
                                                 width: 132, height: 38, pad: 3)
        #expect(pts.allSatisfy { abs($0.y - 19) < 0.001 })
    }

    // 점 1개 이하 — 선을 못 그린다. 빈 배열로 뷰가 스파크라인을 숨긴다.
    @Test func sparklineNeedsTwoPoints() {
        #expect(GymWeightLogic.sparklinePoints(samples: [WeightSparkSample(dayOffset: 0, sma: 70)],
                                               windowDays: 30, width: 132, height: 38, pad: 3).isEmpty)
        #expect(GymWeightLogic.sparklinePoints(samples: [], windowDays: 30,
                                               width: 132, height: 38, pad: 3).isEmpty)
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
