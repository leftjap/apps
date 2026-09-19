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

    // MARK: - 체중 탭 재설계 (작업지시서 2026-09-19 §2) — 축 범위·눈금·지수평활·주 버킷·칸 기하

    static func kst(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0, _ min: Int = 0) -> Date {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Seoul")!
        return c.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
    }

    // 축 범위 — 기록 min/max 에 0.5 씩. span 이 최소치를 넘으면 그대로 쓴다.
    @Test func axisRangePadsRecordedRangeEvenly() {
        let r = GymWeightLogic.axisRange(values: [72.7, 74.3, 75.1, 73.9])
        #expect(abs(r.lo - 72.2) < 0.001)
        #expect(abs(r.hi - 75.6) < 0.001)
    }

    // 목표(69)에 도달해 기록이 68.8~69.4 로 좁아지면 여백만으로는 1.6kg 이라 1kg 이 159pt 가 된다.
    // 0.2kg 흔들림이 32pt 로 튀는 것을 막으려고 최소 3.0kg 을 중앙 기준으로 벌린다.
    @Test func axisRangeWidensToMinSpanAroundCenter() {
        let r = GymWeightLogic.axisRange(values: [68.8, 69.0, 69.4])
        #expect(abs(r.lo - 67.6) < 0.001)
        #expect(abs(r.hi - 70.6) < 0.001)
    }

    // 1년치처럼 넓으면 최소 범위가 개입하지 않는다.
    @Test func axisRangeKeepsWideSpan() {
        let r = GymWeightLogic.axisRange(values: [68.9, 72.0, 76.2])
        #expect(abs(r.lo - 68.4) < 0.001)
        #expect(abs(r.hi - 76.7) < 0.001)
    }

    // 눈금 — 범위 양 끝(72.2·75.6)에는 격자를 긋지 않는다. 축 라벨이 반쯤 잘려 붙는다.
    @Test func axisTicksStepOneExcludesRangeEnds() {
        let t = GymWeightLogic.axisTicks(lo: 72.2, hi: 75.6)
        #expect(t.step == 1)
        #expect(t.ticks == [73, 74, 75])
    }

    @Test func axisTicksStepTwoForWideRange() {
        let t = GymWeightLogic.axisTicks(lo: 68.4, hi: 76.7)
        #expect(t.step == 2)
        #expect(t.ticks == [70, 72, 74, 76])
    }

    // 지수평활은 신호다 — 오르는 입력을 늘 뒤에서 따라간다(첫 점만 실측과 같다).
    @Test func emaLagsBehindRisingInput() {
        let v: [Double] = [70, 71, 72, 73, 74]
        let e = GymWeightLogic.ema(v)
        #expect(e[0] == 70)
        for i in 1..<v.count { #expect(e[i] < v[i]) }
        #expect(e[4] > e[3])
    }

    // 시안 F 표본 30건 — 작업지시서 SVG 의 실측 점 좌표에서 복원했다(축 72.2~75.6, 222pt).
    static let mockupSample: [Double] = [
        73.7, 73.5, 74.0, 73.8, 73.6, 72.9, 74.9, 73.4, 72.7, 73.7,
        74.1, 74.0, 73.8, 73.0, 74.2, 74.1, 73.9, 73.0, 74.0, 74.7,
        73.7, 74.2, 74.3, 74.0, 74.6, 74.5, 75.1, 74.4, 74.3, 73.9,
    ]

    @Test func emaMatchesMockupSample() {
        let e = GymWeightLogic.ema(Self.mockupSample)
        #expect(e.count == 30)
        #expect(abs(e[0] - 73.70) < 0.005)
        #expect(abs(e[29] - 74.19) < 0.005)
    }

    // 주 경계는 월요일 — 9/13(일)과 9/14(월)은 다른 버킷이다 (HomeLogic weeklyBalance 와 같은 규칙).
    @Test func weekBucketsSplitOnMonday() {
        let b = GymWeightLogic.weekBuckets(rows: [("2026-09-13", 75.1), ("2026-09-14", 74.4)],
                                           now: Self.kst(2026, 9, 19))
        #expect(b.count == 2)
        #expect(b[0].values == [75.1])
        #expect(b[0].start == Self.kst(2026, 9, 7))
        #expect(b[1].values == [74.4])
        #expect(b[1].start == Self.kst(2026, 9, 14))
    }

    // 기록이 없는 주도 빈 버킷으로 남긴다 — 건너뛰면 가로축이 다시 기록 순번이 된다.
    @Test func weekBucketsFillEmptyWeeks() {
        let b = GymWeightLogic.weekBuckets(rows: [("2026-06-29", 73.3), ("2026-07-14", 73.7)],
                                           now: Self.kst(2026, 7, 14))
        #expect(b.count == 3)                       // 6/29 · 7/6(빈) · 7/13
        #expect(b[1].values.isEmpty)
        #expect(b[1].start == Self.kst(2026, 7, 6))
        #expect(b[2].values == [73.7])
    }

    // 마지막 버킷은 오늘이 속한 주다 — 오늘 미입력이면 그 주 값이 적어 박스가 짧아진다. 그게 사실이다.
    @Test func weekBucketsEndAtTodayWeekEvenWithNoRecord() {
        let b = GymWeightLogic.weekBuckets(rows: [("2026-09-11", 74.5)], now: Self.kst(2026, 9, 19))
        #expect(b.count == 2)
        #expect(b.last?.values.isEmpty == true)
        #expect(b.last?.start == Self.kst(2026, 9, 14))
    }

    // 23:50 KST 는 아직 그날(일요일)이다 — 다음 주로 넘어가지 않는다.
    @Test func weekBucketsKeepLateEveningInSameWeek() {
        let b = GymWeightLogic.weekBuckets(rows: [("2026-09-20", 74.0)],
                                           now: Self.kst(2026, 9, 20, 23, 50))
        #expect(b.count == 1)
        #expect(b[0].start == Self.kst(2026, 9, 14))
        #expect(b[0].values == [74.0])
    }

    // 자정을 넘긴 00:20 KST(월)은 새 주다 — UTC 로 셌다면 전날 주에 머문다.
    @Test func weekBucketsRollToNewWeekAfterKSTMidnight() {
        let b = GymWeightLogic.weekBuckets(rows: [("2026-09-20", 74.0)],
                                           now: Self.kst(2026, 9, 21, 0, 20))
        #expect(b.count == 2)
        #expect(b.last?.start == Self.kst(2026, 9, 21))
        #expect(b[0].values == [74.0])
    }

    // 입력 순서가 내림차순(모델의 weights)이어도 버킷 안은 날짜 오름차순이다.
    @Test func weekBucketsSortValuesAscendingByDate() {
        let b = GymWeightLogic.weekBuckets(rows: [("2026-09-16", 73.9), ("2026-09-15", 74.3),
                                                  ("2026-09-14", 74.4)],
                                           now: Self.kst(2026, 9, 19))
        #expect(b.count == 1)
        #expect(b[0].values == [74.4, 74.3, 73.9])
        #expect(b[0].min == 73.9 && b[0].max == 74.4)
    }

    // 점은 칸 안쪽 64% 에 균등 배치한다 — 이 여백이 없으면 첫·끝 점이 박스 모서리 밖으로 반쯤 난다.
    @Test func dotsStayInsideBoxAndCenter() {
        let m = GymWeightLogic.cellMetrics(plotWidth: 315, weeks: 10)
        for k in [1, 2, 7] {
            let xs = m.dotXs(cellX: 0, count: k)
            let r = m.dotRadius(count: k) ?? 1.9
            #expect(xs.count == k)
            #expect(xs.first! - r >= m.inset - 0.001)
            #expect(xs.last! + r <= m.inset + m.boxWidth + 0.001)
            #expect(abs((xs.first! + xs.last!) / 2 - (m.inset + m.boxWidth / 2)) < 0.001)
            #expect(zip(xs, xs.dropFirst()).allSatisfy { $1 > $0 })
        }
    }

    // 칸 x 만큼 통째로 옮겨 앉는다.
    @Test func dotXsShiftWithCell() {
        let m = GymWeightLogic.cellMetrics(plotWidth: 315, weeks: 10)
        let a = m.dotXs(cellX: 0, count: 3), b = m.dotXs(cellX: 31.5, count: 3)
        #expect(zip(a, b).allSatisfy { abs(($1 - $0) - 31.5) < 0.001 })
    }

    // 밀도 — 별도 "심지 모드" 없이 칸 폭에 비례해 저절로 가늘어진다 (§5 실측 임계).
    @Test func densityFoldsDotsThenBoxAsWeeksGrow() {
        let w10 = GymWeightLogic.cellMetrics(plotWidth: 315, weeks: 10)
        #expect(abs(w10.boxWidth - 22.68) < 0.01)
        #expect(w10.showsBox)
        #expect(w10.dotRadius(count: 3) == 1.9)      // 간격 4.8
        let w14 = GymWeightLogic.cellMetrics(plotWidth: 315, weeks: 14)
        #expect(abs(w14.boxWidth - 16.2) < 0.01)
        #expect(w14.dotRadius(count: 4) == 1.4)      // 간격 2.6
        let w18 = GymWeightLogic.cellMetrics(plotWidth: 315, weeks: 18)
        #expect(abs(w18.boxWidth - 12.6) < 0.01)
        #expect(w18.showsBox)
        #expect(w18.dotRadius(count: 4) == nil)      // 간격 2.0 — 점만 접는다
        let w104 = GymWeightLogic.cellMetrics(plotWidth: 315, weeks: 104)
        #expect(abs(w104.boxWidth - 2.18) < 0.02)
        #expect(!w104.showsBox)                      // 3pt 미만 — 추세선만 남는다
    }

    // 기록 없는 칸은 점도 없다.
    @Test func dotRadiusIsNilForEmptyCell() {
        #expect(GymWeightLogic.cellMetrics(plotWidth: 315, weeks: 10).dotRadius(count: 0) == nil)
    }
}
